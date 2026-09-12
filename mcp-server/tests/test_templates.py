"""Templates reachable from MCP (issue #1364).

Before this, GET /api/v1/notes/templates existed but no tool reached it, so
an agent could only use a template whose note id it already knew.
"""

from unittest.mock import MagicMock, patch

import json

from poznote_mcp.client import PoznoteClient
from poznote_mcp import server


def _mock_response(payload):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    response.status_code = 200
    return response


@patch("poznote_mcp.client.httpx.Client")
def test_list_templates_calls_the_templates_endpoint(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response(
        {"success": True, "notes": [{"id": 7, "heading": "Meeting", "type": "markdown"}]}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    notes = client.list_templates(workspace="Demo")

    args, kwargs = http_client.get.call_args
    assert args[0] == "/notes/templates"
    assert kwargs["params"] == {"workspace": "Demo"}
    assert notes[0]["id"] == 7


def test_list_templates_tool_formats_the_result():
    client = MagicMock()
    client.list_templates.return_value = [
        {"id": 7, "heading": "Meeting", "type": "markdown", "workspace": "Demo", "folder_id": 3}
    ]

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_templates(workspace="Demo"))

    assert payload["count"] == 1
    assert payload["workspace"] == "Demo"
    assert payload["templates"][0] == {
        "id": 7,
        "title": "Meeting",
        "note_type": "markdown",
        "workspace": "Demo",
        "folder_id": 3,
    }


def test_create_note_from_template_copies_its_content_and_format():
    client = MagicMock()
    client.get_note.return_value = {"id": 7, "heading": "Meeting", "type": "markdown", "content": "# Agenda\n"}
    client.create_note.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="Monday", from_template_id=7, workspace="Demo"))

    assert payload["success"] is True
    _, kwargs = client.create_note.call_args
    assert kwargs["content"] == "# Agenda\n"
    assert kwargs["note_type"] == "markdown"


def test_create_note_appends_its_own_content_after_the_template():
    client = MagicMock()
    client.get_note.return_value = {"id": 7, "heading": "Meeting", "type": "note", "content": "<p>Agenda</p>"}
    client.create_note.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="Monday", content="<p>Notes</p>", from_template_id=7)

    _, kwargs = client.create_note.call_args
    assert kwargs["content"] == "<p>Agenda</p><p>Notes</p>"


def test_create_note_reports_a_missing_template():
    client = MagicMock()
    client.get_note.return_value = None

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="Monday", from_template_id=999))

    assert "not found" in payload["error"]
    client.create_note.assert_not_called()


def test_create_note_still_requires_content_without_a_template():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="Monday"))

    assert "content is required" in payload["error"]
    client.create_note.assert_not_called()


def test_an_explicit_note_type_still_wins_over_the_template():
    client = MagicMock()
    client.get_note.return_value = {"id": 7, "heading": "T", "type": "markdown", "content": "x"}
    client.create_note.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="Monday", from_template_id=7, note_type="tasklist")

    _, kwargs = client.create_note.call_args
    assert kwargs["note_type"] == "tasklist"
