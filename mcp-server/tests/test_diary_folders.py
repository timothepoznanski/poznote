"""A diary can be created over MCP (issue #1371).

A diary is a root folder flagged is_diary; the "New diary entry" button files
its dated notes into the flagged root. An agent could create a folder called
"Diary", but not the flag, so the UI then built a second diary tree next to it.
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
def test_client_sends_the_flag(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": True, "folder": {"id": 4, "name": "Journal", "is_diary": True}}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    client.create_folder(folder_name="Journal", workspace="Demo", is_diary=True)

    _, kwargs = http_client.post.call_args
    assert kwargs["json"] == {"workspace": "Demo", "is_diary": True, "folder_name": "Journal"}


@patch("poznote_mcp.client.httpx.Client")
def test_a_plain_folder_does_not_carry_the_flag(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response({"success": True, "folder": {"id": 4}})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    client.create_folder(folder_name="Projects", workspace="Demo")

    _, kwargs = http_client.post.call_args
    assert "is_diary" not in kwargs["json"]


def test_create_folder_creates_a_diary_root():
    client = MagicMock()
    client.create_folder.return_value = {"id": 4, "name": "Journal", "is_diary": True}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder(folder_name="Journal", workspace="Demo", is_diary=True))

    assert payload["success"] is True
    assert "Diary 'Journal'" in payload["message"]
    _, kwargs = client.create_folder.call_args
    assert kwargs["is_diary"] is True
    assert kwargs["folder_name"] == "Journal"
    assert kwargs["folder_path"] is None


def test_a_diary_cannot_be_nested_under_a_path():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder(folder_path="Work/Journal", is_diary=True))

    assert "root folder" in payload["error"]
    client.create_folder.assert_not_called()


def test_a_diary_cannot_be_given_a_parent():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_folder(folder_name="Journal", parent_folder_id=3, is_diary=True))

    assert "parent folder" in payload["error"]
    client.create_folder.assert_not_called()


def test_list_folders_passes_the_flag_through():
    client = MagicMock()
    client.list_folders.return_value = [
        {"id": 4, "name": "Journal", "path": "Journal", "is_diary": True},
        {"id": 5, "name": "Projects", "path": "Projects", "is_diary": False},
    ]

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_folders(workspace="Demo"))

    assert [f["is_diary"] for f in payload["folders"]] == [True, False]
