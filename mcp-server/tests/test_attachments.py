"""Files can be attached to a note over MCP (issue #1369).

list_attachments was read-only and nothing else touched attachments, so a tool
migrating notes into Poznote had to dump the blobs to disk and ask a human to
drag them into the web UI.
"""

import base64
import json
from unittest.mock import MagicMock, patch

from poznote_mcp import server
from poznote_mcp.client import PoznoteClient

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _mock_response(payload, status=201):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    response.status_code = status
    return response


def test_the_client_sets_no_json_content_type_of_its_own():
    """A client-wide Content-Type would win over httpx's multipart one, and
    the upload would reach PHP with an empty $_FILES."""
    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    try:
        assert "Content-Type" not in client._base_headers
    finally:
        client.close()


@patch("poznote_mcp.client.httpx.Client")
def test_client_posts_the_file_as_multipart(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": True, "attachment_id": "abc", "filename": "chart.png"}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.add_attachment(42, "chart.png", PNG, "image/png", workspace="Demo")

    args, kwargs = http_client.post.call_args
    assert args[0] == "/notes/42/attachments"
    assert kwargs["files"]["file"] == ("chart.png", PNG, "image/png")
    assert kwargs["data"] == {"workspace": "Demo"}
    assert "json" not in kwargs
    assert result["attachment_id"] == "abc"


@patch("poznote_mcp.client.httpx.Client")
def test_client_keeps_the_reason_a_file_was_refused(mock_client_cls):
    http_client = MagicMock()
    http_client.post.return_value = _mock_response(
        {"success": False, "message": ".exe files are blocked by default."}, status=400
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.add_attachment(42, "evil.exe", b"MZ", None)

    assert result["success"] is False
    assert ".exe files are blocked" in result["error"]
    assert result["status"] == 400


def test_add_attachment_decodes_and_uploads():
    client = MagicMock()
    client.add_attachment.return_value = {"success": True, "attachment_id": "abc", "filename": "chart.png"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(
            server.add_attachment(
                note_id=42,
                filename="chart.png",
                content_base64=base64.b64encode(PNG).decode(),
                mime_type="image/png",
            )
        )

    assert payload["success"] is True
    assert payload["attachment_id"] == "abc"
    assert payload["size"] == len(PNG)
    _, kwargs = client.add_attachment.call_args
    assert kwargs["content"] == PNG


def test_a_data_uri_is_accepted_and_gives_the_mime_type():
    client = MagicMock()
    client.add_attachment.return_value = {"success": True, "attachment_id": "abc"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.add_attachment(
            note_id=42,
            filename="chart.png",
            content_base64="data:image/png;base64," + base64.b64encode(PNG).decode(),
        )

    _, kwargs = client.add_attachment.call_args
    assert kwargs["content"] == PNG
    assert kwargs["mime_type"] == "image/png"


def test_invalid_base64_is_reported_not_uploaded():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.add_attachment(note_id=42, filename="x.png", content_base64="not base64!!!"))

    assert "not valid base64" in payload["error"]
    client.add_attachment.assert_not_called()


def test_an_empty_payload_is_refused():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        assert "required" in json.loads(server.add_attachment(42, "x.png", "  "))["error"]
        assert "required" in json.loads(server.add_attachment(42, "  ", "eA=="))["error"]

    client.add_attachment.assert_not_called()


def test_an_oversized_file_is_refused_before_the_upload():
    client = MagicMock()
    huge = base64.b64encode(b"x" * (server.MAX_ATTACHMENT_BYTES + 1)).decode()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.add_attachment(note_id=42, filename="big.bin", content_base64=huge))

    assert payload["error"] == "Attachment too large for a tool call"
    client.add_attachment.assert_not_called()


def test_a_refusal_is_surfaced_as_a_failure():
    client = MagicMock()
    client.add_attachment.return_value = {"success": False, "error": "Storage quota reached", "status": 413}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.add_attachment(42, "x.png", base64.b64encode(PNG).decode()))

    assert payload["success"] is False
    assert payload["error"] == "Storage quota reached"
