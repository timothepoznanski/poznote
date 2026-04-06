"""Tests that update_note and create_note correctly handle task-list content.

Task-list notes store content as a JSON array.  When the MCP framework
receives such content, it may parse the JSON array into a native Python list
*before* calling the tool handler.  These tests verify that both tools
accept list input and convert it back to a JSON string before forwarding
to the API client.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

TASK_LIST = [
    {"id": 1, "text": "Buy milk", "completed": False, "noteId": 100, "important": False},
    {"id": 2, "text": "Write tests", "completed": True, "noteId": 100, "important": True},
]


def _fake_client():
    """Return a MagicMock that behaves like PoznoteClient enough for the tool handlers."""
    client = MagicMock()
    client.create_note.return_value = {"id": 100, "heading": "Tasks"}
    client.update_note.return_value = {"id": 100, "heading": "Tasks"}
    return client


# ---------------------------------------------------------------------------
# update_note
# ---------------------------------------------------------------------------

class TestUpdateNote:
    """update_note must accept both str and list content."""

    @patch("poznote_mcp.server._get_client_or_error")
    def test_list_content_is_converted_to_json_string(self, mock_gcoe):
        from poznote_mcp.server import update_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        result_json = update_note(id=100, content=TASK_LIST)
        result = json.loads(result_json)

        assert result["success"] is True

        # The client must have received a *string*, not a list
        _, kwargs = client.update_note.call_args
        sent_content = kwargs["content"]
        assert isinstance(sent_content, str), f"Expected str, got {type(sent_content)}"
        assert json.loads(sent_content) == TASK_LIST

    @patch("poznote_mcp.server._get_client_or_error")
    def test_string_content_passes_through(self, mock_gcoe):
        from poznote_mcp.server import update_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        html = "<p>Hello world</p>"
        update_note(id=100, content=html)

        _, kwargs = client.update_note.call_args
        assert kwargs["content"] == html

    @patch("poznote_mcp.server._get_client_or_error")
    def test_none_content_passes_through(self, mock_gcoe):
        from poznote_mcp.server import update_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        update_note(id=100, title="New title")

        _, kwargs = client.update_note.call_args
        assert kwargs["content"] is None


# ---------------------------------------------------------------------------
# create_note
# ---------------------------------------------------------------------------

class TestCreateNote:
    """create_note must accept both str and list content."""

    @patch("poznote_mcp.server._get_client_or_error")
    def test_list_content_is_converted_to_json_string(self, mock_gcoe):
        from poznote_mcp.server import create_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        result_json = create_note(title="Tasks", content=TASK_LIST)
        result = json.loads(result_json)

        assert result["success"] is True

        _, kwargs = client.create_note.call_args
        sent_content = kwargs["content"]
        assert isinstance(sent_content, str), f"Expected str, got {type(sent_content)}"
        assert json.loads(sent_content) == TASK_LIST

    @patch("poznote_mcp.server._get_client_or_error")
    def test_string_content_passes_through(self, mock_gcoe):
        from poznote_mcp.server import create_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        md = "# Hello\nSome markdown"
        create_note(title="MD Note", content=md, note_type="markdown")

        _, kwargs = client.create_note.call_args
        assert kwargs["content"] == md

    @patch("poznote_mcp.server._get_client_or_error")
    def test_json_string_content_not_double_encoded(self, mock_gcoe):
        """If the caller already passes a JSON *string*, it must not be double-encoded."""
        from poznote_mcp.server import create_note

        client = _fake_client()
        mock_gcoe.return_value = (client, None)

        json_str = json.dumps(TASK_LIST)
        create_note(title="Tasks", content=json_str)

        _, kwargs = client.create_note.call_args
        assert kwargs["content"] == json_str
        # Decoding once should give back the list
        assert json.loads(kwargs["content"]) == TASK_LIST
