"""Notes and folders move between workspaces over MCP (issue #1368).

update_note(id=42, workspace="Archives") looked like a move and was not:
workspace only scoped the lookup, so the note stayed where it was. The only
way across was copy-and-delete, which changes the note id.
"""

import json
from unittest.mock import MagicMock, patch

from poznote_mcp import server
from poznote_mcp.client import PoznoteClient


def _mock_response(payload, status=200):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    response.status_code = status
    return response


@patch("poznote_mcp.client.httpx.Client")
def test_target_workspace_travels_in_the_body_not_the_query(mock_client_cls):
    http_client = MagicMock()
    http_client.patch.return_value = _mock_response({"success": True, "note": {"id": 42}})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    client.update_note(note_id=42, workspace="Demo", target_workspace="Archives")

    _, kwargs = http_client.patch.call_args
    assert kwargs["json"]["workspace"] == "Archives"   # the move
    assert kwargs["params"] == {"workspace": "Demo"}   # the lookup


@patch("poznote_mcp.client.httpx.Client")
def test_a_lookup_workspace_alone_is_not_a_move(mock_client_cls):
    http_client = MagicMock()
    http_client.patch.return_value = _mock_response({"success": True, "note": {"id": 42}})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    assert client.update_note(note_id=42, workspace="Demo") is None
    http_client.patch.assert_not_called()


def test_move_note_sends_the_destination():
    client = MagicMock()
    client.update_note.return_value = {"id": 42, "workspace": "Archives"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.move_note(note_id=42, target_workspace="Archives"))

    assert payload["success"] is True
    assert "Archives" in payload["message"]
    _, kwargs = client.update_note.call_args
    assert kwargs["target_workspace"] == "Archives"
    # A move is not a rewrite: no content is sent along.
    assert "content" not in kwargs or kwargs.get("content") is None


def test_move_note_into_a_folder_path():
    client = MagicMock()
    client.update_note.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.move_note(note_id=42, folder="Diary/2026/08")

    _, kwargs = client.update_note.call_args
    assert kwargs["folder"] == "Diary/2026/08"


def test_move_note_needs_a_destination():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.move_note(note_id=42))

    assert "Nothing to move to" in payload["error"]
    client.update_note.assert_not_called()


def test_update_note_can_move_without_touching_content():
    client = MagicMock()
    client.update_note.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.update_note(id=42, target_workspace="Archives"))

    assert payload["success"] is True
    _, kwargs = client.update_note.call_args
    assert kwargs["target_workspace"] == "Archives"
    assert kwargs["content"] is None


@patch("poznote_mcp.client.httpx.Client")
def test_client_moves_a_folder(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": True, "folder": {"id": 9, "workspace": "Archives", "path": "Projects"}}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    folder = client.move_folder(9, target_workspace="Archives")

    args, kwargs = http_client.post.call_args
    assert args[0] == "/folders/9/move"
    assert kwargs["json"] == {"target_workspace": "Archives"}
    assert folder["workspace"] == "Archives"


@patch("poznote_mcp.client.httpx.Client")
def test_client_keeps_the_reason_a_folder_move_was_refused(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": False, "error": "New parent folder must be in the target workspace"}, status=400
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.move_folder(9, target_workspace="Archives", new_parent_folder_id=3)

    assert "target workspace" in result["error"]


def test_move_folder_needs_a_destination():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.move_folder(folder_id=9))

    assert "Nothing to move to" in payload["error"]
    client.move_folder.assert_not_called()


def test_move_folder_surfaces_a_refusal():
    client = MagicMock()
    client.move_folder.return_value = {"error": "A folder with this name already exists in the destination"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.move_folder(folder_id=9, target_workspace="Archives"))

    assert payload["success"] is False
    assert "already exists" in payload["error"]
