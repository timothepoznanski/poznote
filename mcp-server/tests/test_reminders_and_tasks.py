"""Tests for the note-reminder arguments and the per-task management tools.

These cover the two gaps the tools were added to close:
  * setting a note's due date/reminder directly from create_note/update_note,
    instead of having to open the note in the UI afterwards;
  * adding, updating, completing and deleting a single task of a tasklist
    without re-fetching and rewriting the whole content JSON array.
"""

import json
from unittest.mock import MagicMock, patch

import pytest


def _fake_client():
    """A MagicMock standing in for PoznoteClient."""
    client = MagicMock()
    client.create_note.return_value = {"id": 100, "heading": "Tasks"}
    client.update_note.return_value = {"id": 100, "heading": "Tasks"}
    client.set_reminder.return_value = {
        "note_id": 100,
        "reminder_at": "2026-09-01 07:00:00",
        "recurrence": "1w",
        "email_enabled": True,
    }
    client.remove_reminder.return_value = True
    client.get_reminder.return_value = {
        "note_id": 100,
        "reminder_at": "2026-09-01 07:00:00",
        "recurrence": None,
        "email_enabled": False,
    }
    client.list_tasks.return_value = {
        "note_id": 100,
        "heading": "Groceries",
        "tasks": [{"id": 1.5, "text": "Buy milk", "completed": False}],
    }
    client.add_task.return_value = {"id": 2.5, "text": "Buy bread", "completed": False}
    client.update_task.return_value = {"id": 1.5, "text": "Buy milk", "completed": True}
    client.delete_task.return_value = True
    return client


@pytest.fixture
def client():
    fake = _fake_client()
    with patch("poznote_mcp.server._get_client_or_error", return_value=(fake, None)):
        yield fake


# ---------------------------------------------------------------------------
# Reminders on create_note / update_note
# ---------------------------------------------------------------------------

class TestCreateNoteReminder:

    def test_reminder_is_set_on_the_created_note(self, client):
        from poznote_mcp.server import create_note

        result = json.loads(create_note(
            title="Renew passport",
            content="<p>Book an appointment</p>",
            reminder_at="2026-09-01T09:00:00+02:00",
            reminder_recurrence="1w",
        ))

        assert result["success"] is True
        _, kwargs = client.set_reminder.call_args
        assert kwargs["note_id"] == 100
        assert kwargs["reminder_at"] == "2026-09-01T09:00:00+02:00"
        assert kwargs["recurrence"] == "1w"
        assert result["reminder"]["reminder_at"] == "2026-09-01 07:00:00"

    def test_no_reminder_call_without_reminder_at(self, client):
        from poznote_mcp.server import create_note

        result = json.loads(create_note(title="Plain", content="text"))

        client.set_reminder.assert_not_called()
        assert "reminder" not in result

    def test_note_still_reported_created_when_reminder_fails(self, client):
        """A failed reminder must not make a successful note creation look failed."""
        import httpx
        from poznote_mcp.server import create_note

        client.set_reminder.side_effect = httpx.ConnectError("boom")

        result = json.loads(create_note(
            title="T", content="C", reminder_at="2026-09-01T09:00:00Z",
        ))

        assert result["success"] is True
        assert result["note"]["id"] == 100
        assert "error" in result["reminder"]


class TestUpdateNoteReminder:

    def test_reminder_only_update_skips_the_note_write(self, client):
        """Setting just a reminder must not rewrite the note's content."""
        from poznote_mcp.server import update_note

        result = json.loads(update_note(id=100, reminder_at="2026-09-01T09:00:00+02:00"))

        client.update_note.assert_not_called()
        client.set_reminder.assert_called_once()
        assert result["success"] is True

    def test_content_and_reminder_update_together(self, client):
        from poznote_mcp.server import update_note

        result = json.loads(update_note(
            id=100, content="<p>new</p>", reminder_at="2026-09-01T09:00:00Z",
        ))

        client.update_note.assert_called_once()
        client.set_reminder.assert_called_once()
        assert result["note"]["id"] == 100
        assert result["reminder"]["recurrence"] == "1w"

    def test_reminder_at_none_string_removes_the_reminder(self, client):
        from poznote_mcp.server import update_note

        result = json.loads(update_note(id=100, reminder_at="none"))

        client.remove_reminder.assert_called_once_with(100, user_id=None)
        client.set_reminder.assert_not_called()
        assert result["reminder"] == {"removed": True}

    def test_empty_update_is_rejected(self, client):
        from poznote_mcp.server import update_note

        result = json.loads(update_note(id=100))

        assert "error" in result
        client.update_note.assert_not_called()
        client.set_reminder.assert_not_called()

    def test_version_conflict_still_surfaces(self, client):
        from poznote_mcp.server import update_note

        client.update_note.return_value = {
            "code": "version_conflict",
            "current": {"version": "v2", "content": "other"},
        }

        result = json.loads(update_note(id=100, content="mine", if_version="v1"))

        assert result["success"] is False
        assert result["error"] == "version_conflict"
        # A conflicted write must not go on to set the reminder
        client.set_reminder.assert_not_called()


# ---------------------------------------------------------------------------
# Dedicated reminder tools
# ---------------------------------------------------------------------------

class TestReminderTools:

    def test_get_reminder(self, client):
        from poznote_mcp.server import get_reminder

        result = json.loads(get_reminder(note_id=100))

        assert result["reminder_at"] == "2026-09-01 07:00:00"
        assert result["note_id"] == 100

    def test_get_reminder_missing_note(self, client):
        from poznote_mcp.server import get_reminder

        client.get_reminder.return_value = None
        result = json.loads(get_reminder(note_id=404))

        assert "error" in result

    def test_set_reminder_forwards_every_field(self, client):
        from poznote_mcp.server import set_reminder

        set_reminder(
            note_id=100,
            reminder_at="2026-09-01T09:00:00+02:00",
            recurrence="2w",
            message="Standup",
            email_enabled=True,
            user_id=3,
        )

        _, kwargs = client.set_reminder.call_args
        assert kwargs["recurrence"] == "2w"
        assert kwargs["message"] == "Standup"
        assert kwargs["email_enabled"] is True
        assert kwargs["user_id"] == 3

    def test_remove_reminder(self, client):
        from poznote_mcp.server import remove_reminder

        result = json.loads(remove_reminder(note_id=100))

        assert result["success"] is True


# ---------------------------------------------------------------------------
# Task tools
# ---------------------------------------------------------------------------

class TestTaskTools:

    def test_list_tasks(self, client):
        from poznote_mcp.server import list_tasks

        result = json.loads(list_tasks(note_id=100))

        assert result["count"] == 1
        assert result["tasks"][0]["text"] == "Buy milk"
        assert result["title"] == "Groceries"

    def test_list_tasks_missing_note(self, client):
        from poznote_mcp.server import list_tasks

        client.list_tasks.return_value = None
        result = json.loads(list_tasks(note_id=404))

        assert "error" in result

    def test_add_task_with_due_date_and_reminder(self, client):
        from poznote_mcp.server import add_task

        result = json.loads(add_task(
            note_id=100,
            text="Buy bread",
            due_at="2026-09-01T18:30",
            reminder=True,
            recurrence="1w",
            important=True,
        ))

        _, kwargs = client.add_task.call_args
        assert kwargs["text"] == "Buy bread"
        assert kwargs["due_at"] == "2026-09-01T18:30"
        assert kwargs["reminder"] is True
        assert kwargs["recurrence"] == "1w"
        assert kwargs["important"] is True
        assert result["task"]["id"] == 2.5

    def test_add_task_omits_unset_optional_fields(self, client):
        """Unset options must not be forwarded, so server defaults apply."""
        from poznote_mcp.server import add_task

        add_task(note_id=100, text="Simple")

        _, kwargs = client.add_task.call_args
        assert kwargs["due_at"] is None
        assert kwargs["reminder"] is None
        assert kwargs["important"] is None

    def test_add_task_requires_text(self, client):
        from poznote_mcp.server import add_task

        result = json.loads(add_task(note_id=100, text="   "))

        assert "error" in result
        client.add_task.assert_not_called()

    def test_update_task_sends_only_given_fields(self, client):
        from poznote_mcp.server import update_task

        update_task(note_id=100, task_id="1.5", important=True)

        args, _ = client.update_task.call_args
        assert args[0] == 100
        assert args[1] == "1.5"
        assert args[2] == {"important": True}

    def test_update_task_none_due_at_clears_the_date(self, client):
        """'none' must reach the API as an explicit null, not be dropped."""
        from poznote_mcp.server import update_task

        update_task(note_id=100, task_id="1.5", due_at="none")

        args, _ = client.update_task.call_args
        assert args[2] == {"due_at": None}

    def test_update_task_rejects_empty_change(self, client):
        from poznote_mcp.server import update_task

        result = json.loads(update_task(note_id=100, task_id="1.5"))

        assert "error" in result
        client.update_task.assert_not_called()

    def test_update_task_missing_task(self, client):
        from poznote_mcp.server import update_task

        client.update_task.return_value = None
        result = json.loads(update_task(note_id=100, task_id="9.9", text="x"))

        assert "error" in result

    def test_complete_task(self, client):
        from poznote_mcp.server import complete_task

        result = json.loads(complete_task(note_id=100, task_id="1.5"))

        args, _ = client.update_task.call_args
        assert args[2] == {"completed": True}
        assert result["success"] is True

    def test_complete_task_can_reopen(self, client):
        from poznote_mcp.server import complete_task

        complete_task(note_id=100, task_id="1.5", completed=False)

        args, _ = client.update_task.call_args
        assert args[2] == {"completed": False}

    def test_task_id_is_stringified(self, client):
        """Task ids are floats in the note JSON; the URL needs them as strings."""
        from poznote_mcp.server import delete_task

        delete_task(note_id=100, task_id=1.5)

        args, _ = client.delete_task.call_args
        assert args[1] == "1.5"

    def test_delete_task(self, client):
        from poznote_mcp.server import delete_task

        result = json.loads(delete_task(note_id=100, task_id="1.5"))

        assert result["success"] is True
