import json
from unittest.mock import MagicMock, patch

import pytest

from poznote_mcp.client import PoznoteClient


def _mock_response(payload):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def test_headers_for_user_overrides_default_user_and_preserves_auth():
    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    try:
        headers = client._headers_for_user(2)

        assert headers["X-User-ID"] == "2"
        assert headers["Authorization"] == "Bearer secret-token"
        assert headers["Accept"] == "application/json"
        assert headers["Content-Type"] == "application/json"
    finally:
        client.close()


def test_headers_for_user_uses_default_user_when_absent():
    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    try:
        assert client._headers_for_user(None)["X-User-ID"] == "1"
    finally:
        client.close()


@pytest.mark.parametrize(
    "method_name, http_method, response_payload, args, kwargs",
    [
        (
            "list_notes",
            "get",
            {"success": True, "notes": []},
            (),
            {"workspace": "Poznote", "user_id": 2},
        ),
        (
            "create_note",
            "post",
            {"success": True, "note": {"id": 1}},
            (),
            {"title": "test", "content": "test", "workspace": "Poznote", "user_id": 2},
        ),
        (
            "create_folder",
            "post",
            {"success": True, "folder": {"id": 1}},
            ("test",),
            {"workspace": "Poznote", "user_id": 2},
        ),
    ],
)
@patch("poznote_mcp.client.httpx.Client")
def test_client_methods_send_x_user_id_header(
    mock_client_cls,
    method_name,
    http_method,
    response_payload,
    args,
    kwargs,
):
    http_client = MagicMock()
    getattr(http_client, http_method).return_value = _mock_response(response_payload)
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    getattr(client, method_name)(*args, **kwargs)

    _, request_kwargs = getattr(http_client, http_method).call_args
    assert request_kwargs["headers"]["X-User-ID"] == "2"
    assert request_kwargs["headers"]["Authorization"] == "Bearer secret-token"


@pytest.mark.parametrize(
    "tool_name, call_kwargs, client_method",
    [
        ("list_notes", {"workspace": "Poznote", "user_id": 2}, "list_notes"),
        (
            "create_note",
            {"title": "test", "content": "test", "workspace": "Poznote", "user_id": 2},
            "create_note",
        ),
        (
            "create_folder",
            {"folder_name": "test", "workspace": "Poznote", "user_id": 2},
            "create_folder",
        ),
    ],
)
@patch("poznote_mcp.server._get_client_or_error")
def test_tool_handlers_forward_user_id(mock_gcoe, tool_name, call_kwargs, client_method):
    import poznote_mcp.server as srv

    client = MagicMock()
    client.list_notes.return_value = []
    client.create_note.return_value = {"id": 1}
    client.create_folder.return_value = {"id": 1}
    mock_gcoe.return_value = (client, None)

    result = json.loads(getattr(srv, tool_name)(**call_kwargs))

    assert result.get("error") is None
    _, kwargs = getattr(client, client_method).call_args
    assert kwargs["user_id"] == 2
