from unittest.mock import MagicMock, patch

from poznote_mcp.client import PoznoteClient


def _mock_response(payload):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


@patch("poznote_mcp.client.httpx.Client")
def test_list_notes_omits_workspace_filter_when_absent(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "notes": []})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", username="admin", password="secret")
    client.list_notes()

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {}


@patch("poznote_mcp.client.httpx.Client")
def test_list_notes_includes_workspace_filter_when_provided(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "notes": []})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", username="admin", password="secret")
    client.list_notes(workspace="Demo")

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {"workspace": "Demo"}


@patch("poznote_mcp.client.httpx.Client")
def test_create_note_omits_workspace_field_when_absent(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response({"success": True, "note": {"id": 1}})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", username="admin", password="secret")
    client.create_note(title="Test", content="Body")

    _, kwargs = http_client.post.call_args
    assert "workspace" not in kwargs["json"]


@patch("poznote_mcp.client.httpx.Client")
def test_create_note_includes_workspace_field_when_provided(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response({"success": True, "note": {"id": 1}})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", username="admin", password="secret")
    client.create_note(title="Test", content="Body", workspace="Demo")

    _, kwargs = http_client.post.call_args
    assert kwargs["json"]["workspace"] == "Demo"