"""Folder paths behave the same across the tools that touch them (issue #1374).

create_folder took only a name and a parent id, so "Projects/2026/Q3" needed
three chained calls, and list_notes had no folder filter at all, so scoping to
a folder meant fetching every note and filtering client-side.
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
def test_client_posts_a_folder_path_with_create_parents(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": True, "folder": {"id": 9, "name": "Q3"}, "created_parents": [{"id": 7}, {"id": 8}]}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    folder = client.create_folder(workspace="Demo", folder_path="Projects/2026/Q3", create_parents=True)

    _, kwargs = http_client.post.call_args
    assert kwargs["json"] == {
        "workspace": "Demo",
        "folder_path": "Projects/2026/Q3",
        "create_parents": True,
    }
    assert folder["id"] == 9
    assert len(folder["created_parents"]) == 2


@patch("poznote_mcp.client.httpx.Client")
def test_client_keeps_the_reason_of_a_conflict(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": False, "error": "Folder already exists", "folder": {"id": 4}}, status=409
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.create_folder(workspace="Demo", folder_path="Projects/2026/Q3")

    assert result["error"] == "Folder already exists"
    assert result["folder"]["id"] == 4


def test_create_folder_tool_creates_a_whole_path_in_one_call():
    client = MagicMock()
    client.create_folder.return_value = {"id": 9, "name": "Q3"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder(folder_path="Projects/2026/Q3", workspace="Demo"))

    assert payload["success"] is True
    _, kwargs = client.create_folder.call_args
    assert kwargs["folder_path"] == "Projects/2026/Q3"
    assert kwargs["create_parents"] is True
    assert kwargs["folder_name"] is None


def test_a_slash_in_folder_name_is_treated_as_a_path():
    client = MagicMock()
    client.create_folder.return_value = {"id": 9, "name": "Q3"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_folder(folder_name="Projects/2026/Q3", workspace="Demo")

    _, kwargs = client.create_folder.call_args
    assert kwargs["folder_path"] == "Projects/2026/Q3"
    assert kwargs["folder_name"] is None


def test_a_plain_name_still_creates_one_level():
    client = MagicMock()
    client.create_folder.return_value = {"id": 9, "name": "Projects"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_folder(folder_name="Projects", workspace="Demo", parent_folder_id=3)

    _, kwargs = client.create_folder.call_args
    assert kwargs["folder_name"] == "Projects"
    assert kwargs["folder_path"] is None
    assert kwargs["parent_folder_id"] == 3


def test_create_folder_needs_a_name_or_a_path():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder())

    assert "required" in payload["error"]
    client.create_folder.assert_not_called()


def test_create_folder_surfaces_the_conflict_instead_of_a_bare_failure():
    client = MagicMock()
    client.create_folder.return_value = {"error": "Folder already exists", "folder": {"id": 4}, "missing_segment": None}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder(folder_path="Projects/2026/Q3"))

    assert payload["error"] == "Folder already exists"
    assert payload["folder"]["id"] == 4
    assert "missing_segment" not in payload


def test_list_notes_scopes_to_a_folder_server_side():
    client = MagicMock()
    client.list_notes.return_value = {
        "notes": [{"id": 1, "heading": "In folder"}],
        "total": 1,
        "offset": 0,
        "limit": 50,
        "has_more": False,
    }

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_notes(workspace="Demo", folder_id=90))

    _, kwargs = client.list_notes.call_args
    assert kwargs["folder_id"] == 90
    assert payload["folder_id"] == 90
    assert payload["total"] == 1


@patch("poznote_mcp.client.httpx.Client")
def test_client_sends_the_folder_filter_as_a_query_param(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "notes": [], "total": 0})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    client.list_notes(workspace="Demo", folder_id=90)

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {"workspace": "Demo", "folder_id": 90}
