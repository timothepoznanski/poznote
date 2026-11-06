"""Partial edits of long notes (issue #1736).

A write to a long note used to cost its whole length in both directions: read
it, change it, send it all back. These tests cover the three tools that avoid
that, and the two failures that must not look like a generic error, because an
agent reads them and decides whether to try again.
"""

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from poznote_mcp import note_text, server


# =============================================================================
# page_content
# =============================================================================

def test_without_max_chars_the_whole_note_comes_back():
    page = note_text.page_content("abcdef")

    assert page["content"] == "abcdef"
    assert page["next_offset"] is None
    assert page["length"] == 6


def test_a_part_reports_where_the_next_one_starts():
    page = note_text.page_content("0123456789", offset=0, max_chars=4)

    assert page["content"] == "0123"
    assert page["next_offset"] == 4
    assert page["length"] == 10

    rest = note_text.page_content("0123456789", offset=4, max_chars=4)
    assert rest["content"] == "4567"
    assert rest["next_offset"] == 8


def test_the_last_part_ends_the_note():
    page = note_text.page_content("0123456789", offset=8, max_chars=50)

    assert page["content"] == "89"
    assert page["next_offset"] is None
    assert page["length"] == 10


def test_a_part_stops_on_a_line_end_when_one_is_near():
    # The newline sits in the last quarter of the window, so the row is not
    # split for nothing and the next part starts on a fresh line.
    content = "| a | b |\n| c | d |\n"
    page = note_text.page_content(content, offset=0, max_chars=12)

    assert page["content"] == "| a | b |\n"
    assert page["next_offset"] == 10


def test_a_line_end_far_from_the_cut_is_not_used():
    content = "x\n" + "y" * 100
    page = note_text.page_content(content, offset=0, max_chars=40)

    assert len(page["content"]) == 40


def test_offsets_count_characters_not_bytes():
    # Four characters, eight bytes in UTF-8. A byte offset would cut one in two.
    page = note_text.page_content("éèêë", offset=0, max_chars=2)

    assert page["content"] == "éè"
    assert page["length"] == 4
    assert page["next_offset"] == 2


def test_an_offset_past_the_end_returns_nothing_rather_than_failing():
    page = note_text.page_content("abc", offset=99, max_chars=10)

    assert page["content"] == ""
    assert page["offset"] == 3
    assert page["next_offset"] is None


# =============================================================================
# merge_append
# =============================================================================

def test_markdown_gets_a_blank_line_before_what_is_added():
    merged = note_text.merge_append("# Log\n\n- first\n", "- second", "markdown")

    assert merged == "# Log\n\n- first\n\n- second\n"


def test_an_empty_markdown_note_gets_no_leading_blank_line():
    assert note_text.merge_append("", "First line", "markdown") == "First line\n"


def test_html_text_becomes_a_paragraph():
    merged = note_text.merge_append("<ul><li>first</li></ul>", "second", "note")

    # Concatenated raw, "second" would read as part of the list item.
    assert merged == "<ul><li>first</li></ul><p>second</p>"


def test_html_that_is_already_a_block_goes_in_untouched():
    merged = note_text.merge_append("<p>first</p>", "<h2>Next</h2>", "note")

    assert merged == "<p>first</p><h2>Next</h2>"


def test_blank_lines_in_appended_html_text_become_paragraphs():
    merged = note_text.merge_append("", "one\n\ntwo\nstill two", "note")

    assert merged == "<p>one</p><p>two<br>still two</p>"


# =============================================================================
# refuse_type
# =============================================================================

def test_text_notes_are_editable():
    assert note_text.refuse_type("note", "append_to_note") is None
    assert note_text.refuse_type("markdown", "append_to_note") is None
    assert note_text.refuse_type(None, "append_to_note") is None


@pytest.mark.parametrize(
    "note_type,expected",
    [("tasklist", "add_task"), ("excalidraw", "Excalidraw")],
)
def test_a_refusal_names_what_to_use_instead(note_type, expected):
    """An agent told only "refused" calls the same tool again, and again."""
    message = note_text.refuse_type(note_type, "append_to_note")

    assert message is not None
    assert expected in message


# =============================================================================
# apply_replacements
# =============================================================================

def test_a_replacement_changes_only_its_passage():
    outcome = note_text.apply_replacements(
        "Status: draft\nBody stays.\n",
        [{"find": "Status: draft", "replace": "Status: final"}],
    )

    assert outcome["content"] == "Status: final\nBody stays.\n"
    assert outcome["replaced"] == 1


def test_a_find_that_matches_twice_is_refused_rather_than_guessed():
    outcome = note_text.apply_replacements(
        "done\nand done\n",
        [{"find": "done", "replace": "pending"}],
    )

    assert "matches 2 places" in outcome["error"]


def test_several_occurrences_go_through_when_all_is_set():
    outcome = note_text.apply_replacements(
        "done\nand done\n",
        [{"find": "done", "replace": "pending", "all": True}],
    )

    assert outcome["content"] == "pending\nand pending\n"
    assert outcome["replaced"] == 2


def test_all_accepts_the_string_a_client_sends_instead_of_a_boolean():
    outcome = note_text.apply_replacements(
        "a a", [{"find": "a", "replace": "b", "all": "true"}]
    )

    assert outcome["content"] == "b b"


def test_a_find_that_is_not_there_changes_nothing():
    outcome = note_text.apply_replacements("abc", [{"find": "zzz", "replace": "x"}])

    assert "was not found" in outcome["error"]


def test_one_bad_replacement_cancels_the_whole_list():
    outcome = note_text.apply_replacements(
        "keep me",
        [
            {"find": "keep", "replace": "KEEP"},
            {"find": "absent", "replace": "x"},
        ],
    )

    assert "error" in outcome
    assert "content" not in outcome


def test_too_many_replacements_are_refused_before_any_is_applied():
    outcome = note_text.apply_replacements(
        "x" * 500,
        [{"find": "x", "replace": "y", "all": True}] * (note_text.REPLACEMENTS_MAX + 1),
    )

    assert "Too many replacements" in outcome["error"]


# =============================================================================
# The tools
# =============================================================================

def _note(content, note_type="markdown", version="v1"):
    return {
        "id": 7,
        "heading": "Running log",
        "type": note_type,
        "content": content,
        "tags": "",
        "folder": None,
        "updated": "2026-11-06 10:00:00",
        "created": "2026-01-01 10:00:00",
        "version": version,
    }


def _http_error(status):
    request = httpx.Request("PATCH", "http://example.test/api/v1/notes/7")
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_get_note_still_returns_everything_by_default():
    client = MagicMock()
    client.get_note.return_value = _note("a" * 100)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note(7))

    assert payload["content"] == "a" * 100
    assert payload["length"] == 100
    assert payload["type"] == "markdown"
    # Nothing was paged, so nothing hints at a part that does not exist.
    assert "next_offset" not in payload
    assert "offset" not in payload


def test_get_note_hands_out_one_part_when_asked():
    client = MagicMock()
    client.get_note.return_value = _note("a" * 100)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note(7, max_chars=30))

    assert payload["content"] == "a" * 30
    assert payload["offset"] == 0
    assert payload["next_offset"] == 30
    assert payload["length"] == 100


def test_append_sends_the_merged_content_under_the_version_it_read():
    client = MagicMock()
    client.get_note.return_value = _note("# Log\n\n- first\n")
    client.update_note.return_value = {"id": 7, "version": "v2"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- second"))

    _, kwargs = client.update_note.call_args
    assert kwargs["content"] == "# Log\n\n- first\n\n- second\n"
    assert kwargs["if_version"] == "v1"
    assert payload["success"] is True
    assert payload["version"] == "v2"
    # The caller gets the new size, never the content it did not ask for.
    assert "content" not in payload


def test_append_refuses_a_task_list_before_writing_anything():
    client = MagicMock()
    client.get_note.return_value = _note("[]", note_type="tasklist")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- second"))

    assert payload["error"] == "unsupported_note_type"
    assert "add_task" in payload["message"]
    client.update_note.assert_not_called()


def test_append_rebuilds_on_the_content_a_conflict_hands_back():
    """The retry must not reuse the text read before the conflict.

    Reapplying the merge to the stale content would write back a note without
    whatever the other writer had just added.
    """
    client = MagicMock()
    client.get_note.return_value = _note("- first\n")
    client.update_note.side_effect = [
        {
            "code": "version_conflict",
            "current": {"version": "v9", "content": "- first\n\n- from someone else\n"},
        },
        {"id": 7, "version": "v10"},
    ]

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- mine"))

    assert client.update_note.call_count == 2
    _, kwargs = client.update_note.call_args
    assert kwargs["content"] == "- first\n\n- from someone else\n\n- mine\n"
    assert kwargs["if_version"] == "v9"
    assert payload["success"] is True
    assert payload["attempts"] == 2
    # The note is read once; the conflict already carries the current content.
    assert client.get_note.call_count == 1


def test_a_note_locked_by_someone_else_is_reported_as_such():
    client = MagicMock()
    client.get_note.return_value = _note("- first\n")
    client.update_note.side_effect = _http_error(423)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- second"))

    assert payload["error"] == "note_locked"
    assert "nothing was changed" in payload["message"]


def test_a_timeout_says_the_write_may_have_landed():
    """The one case where trying again duplicates a paragraph."""
    client = MagicMock()
    client.get_note.return_value = _note("- first\n")
    client.update_note.side_effect = httpx.ReadTimeout("too slow")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- second"))

    assert payload["error"] == "write_outcome_unknown"
    assert "may or may not" in payload["message"]


def test_a_timeout_is_not_retried():
    client = MagicMock()
    client.get_note.return_value = _note("- first\n")
    client.update_note.side_effect = httpx.ReadTimeout("too slow")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.append_to_note(7, "- second")

    assert client.update_note.call_count == 1


def test_endless_conflicts_end_in_a_refusal_not_a_loop():
    client = MagicMock()
    client.get_note.return_value = _note("- first\n")
    client.update_note.return_value = {
        "code": "version_conflict",
        "current": {"version": "vN", "content": "- moving target\n"},
    }

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "- mine"))

    assert payload["error"] == "version_conflict"
    assert client.update_note.call_count == 3


def test_append_refuses_empty_text_without_touching_the_note():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(7, "   "))

    assert "non-empty" in payload["error"]
    client.get_note.assert_not_called()


def test_replace_in_note_writes_only_the_changed_passage():
    client = MagicMock()
    client.get_note.return_value = _note("Status: draft\nBody stays.\n")
    client.update_note.return_value = {"id": 7, "version": "v2"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(
            server.replace_in_note(
                7, [{"find": "Status: draft", "replace": "Status: final"}]
            )
        )

    _, kwargs = client.update_note.call_args
    assert kwargs["content"] == "Status: final\nBody stays.\n"
    assert payload["success"] is True


def test_an_ambiguous_find_stops_before_the_write():
    client = MagicMock()
    client.get_note.return_value = _note("done\nand done\n")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(
            server.replace_in_note(7, [{"find": "done", "replace": "pending"}])
        )

    assert payload["error"] == "replacement_failed"
    assert "matches 2 places" in payload["message"]
    client.update_note.assert_not_called()


def test_a_replacement_that_changes_nothing_is_not_written():
    client = MagicMock()
    client.get_note.return_value = _note("Status: final\n")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(
            server.replace_in_note(
                7, [{"find": "Status: final", "replace": "Status: final"}]
            )
        )

    assert payload["success"] is True
    client.update_note.assert_not_called()


def test_both_tools_are_classified_and_only_one_is_destructive():
    assert server.TOOL_SCOPES["append_to_note"] == "write"
    assert server.TOOL_SCOPES["replace_in_note"] == "write"
    assert "replace_in_note" in server.DESTRUCTIVE_TOOLS
    assert "append_to_note" not in server.DESTRUCTIVE_TOOLS
