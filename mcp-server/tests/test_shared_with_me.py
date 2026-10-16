"""Tests for incoming shares (/shared/with-me).

`list_shared` lists the shares a profile has CREATED; a grantee sees nothing
there. Incoming shares are a different endpoint returning a flat list carrying a
`_type` discriminator, so the split into notes/folders is the thing to pin, plus
a separate `shared_workspaces` list (#1647).
"""

from unittest.mock import MagicMock, patch

from poznote_mcp.client import PoznoteClient


def _client() -> PoznoteClient:
    return PoznoteClient(base_url="http://example.test/api/v1", service_token="tok")


def _response(payload):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def test_calls_with_me_and_splits_by_type():
    client = _client()
    try:
        payload = {
            "success": True,
            "items": [
                {"_type": "shared_with_me_note", "note_id": 4, "heading": "Infra"},
                {"_type": "shared_with_me_folder", "folder_id": 2, "folder_name": "Docs"},
                {"_type": "something_else", "note_id": 99},
                "not-an-object",
            ],
            "shared_workspaces": [
                {"workspace": "Ankh Labs", "owner_id": 1, "owner_name": "alice"},
                "not-an-object",
            ],
        }
        with patch.object(client.client, "get", return_value=_response(payload)) as get:
            result = client.list_shared_with_me()

        assert get.call_args.args[0] == "/shared/with-me"
        assert "params" not in get.call_args.kwargs
        assert [n["note_id"] for n in result["shared_notes"]] == [4]
        assert [f["folder_id"] for f in result["shared_folders"]] == [2]
        assert result["shared_workspaces"] == [
            {"workspace": "Ankh Labs", "owner_id": 1, "owner_name": "alice"}
        ]
    finally:
        client.close()


def test_missing_items_key_is_an_empty_result_not_an_error():
    client = _client()
    try:
        with patch.object(client.client, "get", return_value=_response({"success": True})):
            result = client.list_shared_with_me()
        assert result == {"shared_notes": [], "shared_folders": [], "shared_workspaces": []}
    finally:
        client.close()


def test_no_items_is_an_empty_result():
    client = _client()
    try:
        with patch.object(client.client, "get", return_value=_response({"success": True, "items": []})):
            result = client.list_shared_with_me()
        assert result == {"shared_notes": [], "shared_folders": [], "shared_workspaces": []}
    finally:
        client.close()
