"""Tests for the cross-note views and the version-history tools.

These cover the capabilities the REST API already had but MCP did not expose:
a task list that spans every note, the reminder notification feed, note
snapshots (list / read / restore), the surgical trash deletion, and the folder
share status.

They also pin the share-status unwrapping bug: the client used to read a
"share" key that ShareController never sends, so a note that WAS shared came
back as "not shared".
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from poznote_mcp.client import PoznoteClient


TASKS_PAYLOAD = {
    "notes": [
        {
            "id": 10,
            "heading": "Work",
            "folder": "Pro",
            "workspace": "Poznote",
            "tasks": [
                {"id": "a1", "text": "Late report", "completed": False,
                 "important": False, "dueAt": "2026-09-10", "dueReminder": True},
                {"id": "a2", "text": "Call the bank", "completed": False,
                 "important": True, "dueAt": "2026-09-20T09:30", "dueReminder": False},
                {"id": "a3", "text": "Archive 2025", "completed": True,
                 "important": False, "dueAt": "", "dueReminder": False},
                {"id": "a4", "text": "Someday idea", "completed": False,
                 "important": False, "dueAt": "", "dueReminder": False},
            ],
        },
        {
            "id": 11,
            "heading": "Home",
            "folder": None,
            "workspace": "Poznote",
            "tasks": [
                {"id": "b1", "text": "Water plants", "completed": False,
                 "important": True, "dueAt": "2026-09-20", "dueReminder": False},
            ],
        },
    ],
    "checklists": [
        {
            "id": 12,
            "heading": "Packing",
            "folder": "Trips",
            "workspace": "Poznote",
            "type": "markdown",
            "tasks": [
                {"id": 0, "text": "Passport", "completed": False},
                {"id": 1, "text": "Charger", "completed": True},
            ],
        },
    ],
}


# The API answers with the half of the feed the scope names (issue #1740); the
# fake keeps the two halves apart the same way.
FIRED_REMINDERS = [
    {"id": 1, "note_id": 10, "message": "Late report", "is_read": 0, "state": "fired",
     "trigger_at": "2026-09-10 09:00:00", "note_heading": "Work", "workspace": "Poznote",
     "task_id": None, "recurrence": None, "created": "2026-09-01 08:00:00"},
    {"id": 2, "note_id": 11, "message": "Water plants", "is_read": 1, "state": "fired",
     "trigger_at": "2026-09-09 09:00:00", "note_heading": "Home", "workspace": "Poznote",
     "task_id": None, "recurrence": None, "created": "2026-09-01 08:00:00"},
]

UPCOMING_REMINDERS = [
    {"id": 3, "note_id": 10, "message": "Call the bank", "is_read": 0, "state": "upcoming",
     "trigger_at": "2026-09-20 09:30:00", "note_heading": "Work", "workspace": "Poznote",
     "task_id": "a2", "recurrence": "1m", "created": "2026-09-02 08:00:00"},
    {"id": 4, "note_id": 13, "message": "Quarterly review", "is_read": 0, "state": "upcoming",
     "trigger_at": "2026-10-01 09:00:00", "note_heading": None, "workspace": None,
     "task_id": None, "recurrence": None, "created": "2026-09-02 08:00:00"},
]


def _fake_reminders(workspace=None, user_id=None, scope="fired", limit=50):
    rows = {
        "fired": FIRED_REMINDERS,
        "upcoming": UPCOMING_REMINDERS,
        "all": FIRED_REMINDERS + UPCOMING_REMINDERS,
    }[scope][:limit]
    payload = {
        "notifications": rows,
        "unread_count": 1,
        "total_count": 2,
        "scope": scope,
        "limit": limit,
    }
    if scope != "fired":
        payload["upcoming_count"] = len(UPCOMING_REMINDERS)
    return payload


def _fake_client():
    client = MagicMock()
    client.list_workspaces.return_value = [{"name": "Poznote"}]
    client.list_all_tasks.return_value = TASKS_PAYLOAD
    client.list_reminders.side_effect = _fake_reminders
    client.list_snapshots.return_value = {
        "empty_new_note": False,
        "snapshots": [
            {"snapshot_key": "2026-09-16--auto", "date": "2026-09-16",
             "heading": "Work", "type": "note", "manual": False,
             "origin": "", "created_at": "2026-09-16 08:00:00"},
            {"snapshot_key": "2026-09-16--mcp1", "date": "2026-09-16",
             "heading": "Work", "type": "note", "manual": True,
             "origin": "mcp", "created_at": "2026-09-16 10:00:00"},
        ],
    }
    client.get_snapshot.return_value = {
        "exists": True,
        "snapshot": {"note_id": 10, "snapshot_key": "2026-09-16--mcp1",
                     "content": "<p>before the MCP write</p>", "origin": "mcp"},
    }
    client.restore_snapshot.return_value = {
        "success": True, "message": "Note restored to snapshot state"}
    client.delete_trash_note.return_value = {
        "success": True, "message": "Note permanently deleted"}
    client.get_folder_share_status.return_value = {
        "public": True, "url": "//host/tok", "indexable": 0, "hasPassword": False}
    return client


@pytest.fixture
def client():
    fake = _fake_client()
    with patch("poznote_mcp.server._get_client_or_error", return_value=(fake, None)):
        yield fake


# ---------------------------------------------------------------------------
# list_all_tasks
# ---------------------------------------------------------------------------

class TestListAllTasks:

    def test_open_tasks_across_notes_sorted_by_due_date(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote"))

        # The completed one (a3) is gone by default.
        assert [t["text"] for t in out["tasks"]] == [
            "Late report",     # 2026-09-10
            "Water plants",    # 2026-09-20, important wins the tie
            "Call the bank",   # 2026-09-20T09:30, important too but later text order
            "Passport",        # undated checklist item
            "Someday idea",    # undated
        ]
        assert out["count"] == 5
        assert out["total"] == 5
        assert out["has_more"] is False

    def test_important_comes_first_within_the_same_due_date(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote"))
        same_day = [t for t in out["tasks"] if t["dueAt"].startswith("2026-09-20")]
        assert all(t["important"] for t in same_day)

    def test_tasks_carry_their_note_and_source(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote"))
        by_text = {t["text"]: t for t in out["tasks"]}

        assert by_text["Late report"]["source"] == "tasklist"
        assert by_text["Late report"]["note_id"] == 10
        assert by_text["Late report"]["note_title"] == "Work"
        assert by_text["Late report"]["folder"] == "Pro"

        # A checklist item is flagged as such: its id is a position, so it must
        # not be mistaken for something update_task can address.
        assert by_text["Passport"]["source"] == "checklist"
        assert by_text["Passport"]["note_id"] == 12

    def test_include_completed_brings_back_the_done_ones(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", include_completed=True))
        texts = [t["text"] for t in out["tasks"]]
        assert "Archive 2025" in texts
        assert "Charger" in texts
        assert out["total"] == 7

    def test_include_checklists_false_drops_in_note_checkboxes(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", include_checklists=False))
        assert all(t["source"] == "tasklist" for t in out["tasks"])
        assert "Passport" not in [t["text"] for t in out["tasks"]]

    def test_due_before_is_inclusive_and_drops_undated(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", due_before="2026-09-20"))
        texts = [t["text"] for t in out["tasks"]]
        # 2026-09-20 and 2026-09-20T09:30 both fall on the bound day.
        assert texts == ["Late report", "Water plants", "Call the bank"]
        assert "Someday idea" not in texts

    def test_due_before_excludes_later_days(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", due_before="2026-09-10"))
        assert [t["text"] for t in out["tasks"]] == ["Late report"]

    def test_due_after_is_inclusive_and_drops_undated(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", due_after="2026-09-20"))
        texts = [t["text"] for t in out["tasks"]]
        assert texts == ["Water plants", "Call the bank"]
        assert "Someday idea" not in texts
        assert "Passport" not in texts

    def test_due_after_and_due_before_bound_a_window(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(
            workspace="Poznote", due_after="2026-09-11", due_before="2026-09-20"))
        # "Late report" is due on the 10th, before the window opens.
        assert [t["text"] for t in out["tasks"]] == ["Water plants", "Call the bank"]

    def test_a_window_the_wrong_way_round_matches_nothing(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(
            workspace="Poznote", due_after="2026-09-21", due_before="2026-09-20"))
        assert out["tasks"] == []
        assert out["total"] == 0

    def test_include_undated_false_keeps_only_dated_tasks(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", include_undated=False))
        assert [t["text"] for t in out["tasks"]] == [
            "Late report", "Water plants", "Call the bank"]
        # Checklist items never carry a due date, so none of them survives.
        assert all(t["source"] == "tasklist" for t in out["tasks"])

    def test_due_after_rejects_a_malformed_date(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", due_after="next monday"))
        assert "error" in out
        assert "due_after" in out["error"]
        client.list_all_tasks.assert_not_called()

    def test_due_before_rejects_a_malformed_date(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", due_before="16/09/2026"))
        assert "error" in out
        client.list_all_tasks.assert_not_called()

    def test_only_important_filters_and_never_keeps_checklists(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", only_important=True))
        assert [t["text"] for t in out["tasks"]] == ["Water plants", "Call the bank"]

    def test_limit_pages_without_hiding_the_total(self, client):
        from poznote_mcp.server import list_all_tasks
        out = json.loads(list_all_tasks(workspace="Poznote", limit=2))
        assert out["count"] == 2
        assert out["total"] == 5
        assert out["has_more"] is True

    def test_limit_out_of_range_is_refused(self, client):
        from poznote_mcp.server import list_all_tasks
        assert "error" in json.loads(list_all_tasks(limit=0))
        assert "error" in json.loads(list_all_tasks(limit=5000))

    def test_workspace_is_passed_through(self, client):
        from poznote_mcp.server import list_all_tasks
        list_all_tasks(workspace="Other")
        client.list_all_tasks.assert_called_once_with(workspace="Other", user_id=None)

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import list_all_tasks
        client.list_all_tasks.side_effect = RuntimeError("boom")
        assert "error" in json.loads(list_all_tasks(workspace="Poznote"))


# ---------------------------------------------------------------------------
# list_reminders
# ---------------------------------------------------------------------------

class TestListReminders:

    def test_returns_the_triggered_feed_with_counts(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders())
        assert out["count"] == 2
        assert out["unread_count"] == 1
        assert out["total_count"] == 2
        assert out["capped_by_limit"] is False
        assert out["scope"] == "fired"
        # The fired feed says nothing about the future, so it does not count it.
        assert "upcoming_count" not in out

    def test_fired_is_the_default_scope(self, client):
        from poznote_mcp.server import list_reminders
        list_reminders()
        assert client.list_reminders.call_args.kwargs["scope"] == "fired"

    def test_rows_carry_the_field_names_the_other_tools_use(self, client):
        from poznote_mcp.server import list_reminders
        row = json.loads(list_reminders())["reminders"][0]
        assert row["note_title"] == "Work"
        assert row["reminder_at"] == "2026-09-10 09:00:00"
        assert row["state"] == "fired"
        assert row["note_id"] == 10
        assert row["is_read"] is False
        assert "note_heading" not in row
        assert "trigger_at" not in row

    def test_unread_only_filters_read_notifications(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders(unread_only=True))
        assert [n["id"] for n in out["reminders"]] == [1]

    def test_upcoming_lists_the_future_with_its_own_count(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders(scope="upcoming"))
        assert [r["message"] for r in out["reminders"]] == ["Call the bank", "Quarterly review"]
        assert all(r["state"] == "upcoming" for r in out["reminders"])
        assert out["upcoming_count"] == 2
        # The bell counters keep counting what has fired, whatever the scope.
        assert out["total_count"] == 2

    def test_a_task_reminder_is_told_apart_from_a_note_reminder(self, client):
        from poznote_mcp.server import list_reminders
        rows = {r["id"]: r for r in json.loads(list_reminders(scope="upcoming"))["reminders"]}
        assert rows[3]["task_id"] == "a2"
        assert rows[3]["recurrence"] == "1m"
        assert rows[4]["task_id"] is None
        # A trashed note keeps its reminder, with no title to show for it.
        assert rows[4]["note_title"] is None

    def test_all_returns_both_halves_fired_first(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders(scope="all"))
        assert [r["state"] for r in out["reminders"]] == [
            "fired", "fired", "upcoming", "upcoming"]
        assert out["upcoming_count"] == 2

    def test_an_unknown_scope_is_refused_rather_than_read_as_fired(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders(scope="upcomming"))
        assert "error" in out
        client.list_reminders.assert_not_called()

    def test_a_full_page_is_flagged_as_capped(self, client):
        from poznote_mcp.server import list_reminders
        out = json.loads(list_reminders(scope="all", limit=2))
        assert out["count"] == 2
        assert out["capped_by_limit"] is True
        assert "2" in out["note"]

    def test_limit_out_of_range_is_refused(self, client):
        from poznote_mcp.server import list_reminders
        assert "error" in json.loads(list_reminders(limit=0))
        assert "error" in json.loads(list_reminders(limit=501))
        client.list_reminders.assert_not_called()

    def test_workspace_and_scope_are_passed_through(self, client):
        from poznote_mcp.server import list_reminders
        list_reminders(workspace="Poznote", scope="upcoming", limit=10)
        client.list_reminders.assert_called_once_with(
            workspace="Poznote", user_id=None, scope="upcoming", limit=10)

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import list_reminders
        client.list_reminders.side_effect = RuntimeError("boom")
        assert "error" in json.loads(list_reminders())


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------

class TestListSnapshots:

    def test_lists_snapshots_with_their_origin(self, client):
        from poznote_mcp.server import list_snapshots
        out = json.loads(list_snapshots(note_id=10))
        assert out["count"] == 2
        # origin is what lets the caller find the pre-MCP-write state.
        assert [s["origin"] for s in out["snapshots"]] == ["", "mcp"]

    def test_missing_note_is_reported(self, client):
        from poznote_mcp.server import list_snapshots
        client.list_snapshots.return_value = None
        assert "error" in json.loads(list_snapshots(note_id=999))

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import list_snapshots
        client.list_snapshots.side_effect = RuntimeError("boom")
        assert "error" in json.loads(list_snapshots(note_id=10))


class TestGetSnapshot:

    def test_returns_the_snapshot_content(self, client):
        from poznote_mcp.server import get_snapshot
        out = json.loads(get_snapshot(note_id=10, snapshot_key="2026-09-16--mcp1"))
        assert out["exists"] is True
        assert out["snapshot"]["content"] == "<p>before the MCP write</p>"
        client.get_snapshot.assert_called_once_with(
            10, snapshot_key="2026-09-16--mcp1", date=None, user_id=None)

    def test_absent_snapshot_is_an_answer_not_an_error(self, client):
        from poznote_mcp.server import get_snapshot
        client.get_snapshot.return_value = {"exists": False, "snapshot": None}
        out = json.loads(get_snapshot(note_id=10, date="2026-01-01"))
        assert out["exists"] is False
        assert "error" not in out

    def test_missing_note_is_reported(self, client):
        from poznote_mcp.server import get_snapshot
        client.get_snapshot.return_value = None
        assert "error" in json.loads(get_snapshot(note_id=999))

    def test_malformed_key_is_refused_before_the_call(self, client):
        from poznote_mcp.server import get_snapshot
        out = json.loads(get_snapshot(note_id=10, snapshot_key="nope"))
        assert "list_snapshots" in out["error"]
        client.get_snapshot.assert_not_called()

    def test_malformed_date_is_refused(self, client):
        from poznote_mcp.server import get_snapshot
        out = json.loads(get_snapshot(note_id=10, date="16-09-2026"))
        assert "error" in out
        client.get_snapshot.assert_not_called()

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import get_snapshot
        client.get_snapshot.side_effect = RuntimeError("boom")
        assert "error" in json.loads(get_snapshot(note_id=10))


class TestRestoreSnapshot:

    def test_restores_by_key(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10, snapshot_key="2026-09-16--mcp1"))
        assert out["success"] is True
        client.restore_snapshot.assert_called_once_with(
            10, snapshot_key="2026-09-16--mcp1", date=None, user_id=None)

    def test_restores_by_date(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10, date="2026-09-15"))
        assert out["success"] is True
        client.restore_snapshot.assert_called_once_with(
            10, snapshot_key=None, date="2026-09-15", user_id=None)

    def test_without_a_selector_it_refuses_instead_of_overwriting(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10))
        assert "error" in out
        # The API would have restored today's snapshot; nothing must be sent.
        client.restore_snapshot.assert_not_called()

    def test_blank_selector_is_treated_as_absent(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10, snapshot_key="   ", date="  "))
        assert "error" in out
        client.restore_snapshot.assert_not_called()

    def test_malformed_date_is_refused(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10, date="2026/09/15"))
        assert "error" in out
        client.restore_snapshot.assert_not_called()

    def test_no_matching_snapshot_keeps_the_api_wording(self, client):
        from poznote_mcp.server import restore_snapshot
        client.restore_snapshot.return_value = {"success": False, "error": "No snapshot found for today"}
        out = json.loads(restore_snapshot(note_id=10, snapshot_key="2026-01-01--zz"))
        assert out["error"] == "No snapshot found for today"

    def test_missing_note_is_told_apart_from_missing_snapshot(self, client):
        from poznote_mcp.server import restore_snapshot
        client.restore_snapshot.return_value = {"success": False, "error": "Note not found"}
        out = json.loads(restore_snapshot(note_id=999, snapshot_key="2026-01-01"))
        assert out["error"] == "Note not found"

    def test_a_none_result_is_still_an_error(self, client):
        from poznote_mcp.server import restore_snapshot
        client.restore_snapshot.return_value = None
        assert "error" in json.loads(restore_snapshot(note_id=10, snapshot_key="2026-01-01"))

    def test_malformed_key_is_refused_before_the_call(self, client):
        from poznote_mcp.server import restore_snapshot
        out = json.loads(restore_snapshot(note_id=10, snapshot_key="nope"))
        assert "list_snapshots" in out["error"]
        client.restore_snapshot.assert_not_called()

    def test_keys_in_the_api_format_are_accepted(self, client):
        from poznote_mcp.server import restore_snapshot
        for key in ("2026-09-16", "2026-09-16--014854682-9f94", "2026-09-16--manual_1"):
            client.restore_snapshot.reset_mock()
            assert json.loads(restore_snapshot(note_id=10, snapshot_key=key))["success"] is True

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import restore_snapshot
        client.restore_snapshot.side_effect = RuntimeError("boom")
        assert "error" in json.loads(restore_snapshot(note_id=10, snapshot_key="k"))


# ---------------------------------------------------------------------------
# delete_trash_note
# ---------------------------------------------------------------------------

class TestDeleteTrashNote:

    def test_deletes_one_note_from_the_trash(self, client):
        from poznote_mcp.server import delete_trash_note
        out = json.loads(delete_trash_note(id=71))
        assert out["success"] is True
        assert out["note_id"] == 71
        client.delete_trash_note.assert_called_once_with(71, workspace=None, user_id=None)

    def test_a_live_note_is_refused_with_the_api_wording(self, client):
        from poznote_mcp.server import delete_trash_note
        client.delete_trash_note.return_value = {
            "success": False, "status": 400, "error": "Note is not in trash"}
        out = json.loads(delete_trash_note(id=5))
        assert out["success"] is False
        # The caller needs the distinction to know delete_note comes first.
        assert out["error"] == "Note is not in trash"

    def test_unknown_note_is_reported_as_not_found(self, client):
        from poznote_mcp.server import delete_trash_note
        client.delete_trash_note.return_value = {
            "success": False, "status": 404, "error": "Note not found"}
        out = json.loads(delete_trash_note(id=999))
        assert out["success"] is False
        assert out["error"] == "Note not found"

    def test_workspace_is_passed_through(self, client):
        from poznote_mcp.server import delete_trash_note
        delete_trash_note(id=71, workspace="Demo")
        client.delete_trash_note.assert_called_once_with(71, workspace="Demo", user_id=None)

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import delete_trash_note
        client.delete_trash_note.side_effect = RuntimeError("boom")
        assert "error" in json.loads(delete_trash_note(id=71))


# ---------------------------------------------------------------------------
# get_folder_share_status
# ---------------------------------------------------------------------------

class TestGetFolderShareStatus:

    def test_returns_the_share_of_a_shared_folder(self, client):
        from poznote_mcp.server import get_folder_share_status
        out = json.loads(get_folder_share_status(folder_id=3))
        assert out["success"] is True
        assert out["share"]["url"] == "//host/tok"

    def test_unshared_folder_is_reported_as_not_public(self, client):
        from poznote_mcp.server import get_folder_share_status
        client.get_folder_share_status.return_value = None
        out = json.loads(get_folder_share_status(folder_id=3))
        assert out["public"] is False

    def test_api_error_is_reported(self, client):
        from poznote_mcp.server import get_folder_share_status
        client.get_folder_share_status.side_effect = RuntimeError("boom")
        assert "error" in json.loads(get_folder_share_status(folder_id=3))
