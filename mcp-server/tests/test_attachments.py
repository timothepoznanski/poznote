"""Files can be attached to a note over MCP (issue #1369).

list_attachments was read-only and nothing else touched attachments, so a tool
migrating notes into Poznote had to dump the blobs to disk and ask a human to
drag them into the web UI.
"""

import base64
import hashlib
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
        assert "required" in json.loads(server.add_attachment(42, filename="x.png", content_base64="  "))["error"]
        assert "required" in json.loads(server.add_attachment(42, filename="  ", content_base64="eA=="))["error"]

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
        payload = json.loads(server.add_attachment(42, filename="x.png", content_base64=base64.b64encode(PNG).decode()))

    assert payload["success"] is False
    assert payload["error"] == "Storage quota reached"


# =============================================================================
# Reading an attachment back (issue #1741)
# =============================================================================

PDF = b"%PDF-1.4\n% \xc3\x28 binary\n"
PNG_SHA256 = hashlib.sha256(PNG).hexdigest()


def _record(**overrides):
    record = {
        "id": "abc",
        "filename": "68f0_1762.png",
        "original_filename": "chart.png",
        "file_size": len(PNG),
        "file_type": "image/png",
        "uploaded_at": "2026-11-06 10:00:00",
    }
    record.update(overrides)
    return record


def _mock_stream(status=200, headers=None, chunks=(), text=""):
    """The context manager httpx.Client.stream() returns, around one response."""
    response = MagicMock()
    response.status_code = status
    response.headers = headers or {}
    response.text = text
    response.read.return_value = None
    response.iter_bytes.return_value = iter(chunks)
    context = MagicMock()
    context.__enter__.return_value = response
    context.__exit__.return_value = False
    return context, response


def _reading_client(content=PNG, attachments=None, content_type="image/png"):
    client = MagicMock()
    client.list_attachments.return_value = attachments if attachments is not None else [_record()]
    client.get_attachment.return_value = {
        "success": True,
        "status": 200,
        "content": content,
        "content_type": content_type,
    }
    return client


@patch("poznote_mcp.client.httpx.Client")
def test_client_streams_the_file_and_the_type_it_was_served_as(mock_client_cls):
    http_client = MagicMock()
    context, _ = _mock_stream(
        headers={"content-length": str(len(PNG)), "content-type": "image/png"},
        chunks=[PNG[:10], PNG[10:]],
    )
    http_client.stream.return_value = context
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.get_attachment(42, "abc", workspace="Demo")

    args, kwargs = http_client.stream.call_args
    assert args == ("GET", "/notes/42/attachments/abc")
    assert kwargs["params"] == {"workspace": "Demo"}
    # The client-wide Accept is application/json, and a file is not JSON.
    assert kwargs["headers"]["Accept"] == "*/*"
    assert result["success"] is True
    assert result["content"] == PNG
    assert result["content_type"] == "image/png"


@patch("poznote_mcp.client.httpx.Client")
def test_client_keeps_the_plain_text_reason_a_file_was_refused(mock_client_cls):
    http_client = MagicMock()
    context, _ = _mock_stream(status=404, text="Attachment not found")
    http_client.stream.return_value = context
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.get_attachment(42, "nope")

    assert result["success"] is False
    assert result["status"] == 404
    assert result["error"] == "Attachment not found"


@patch("poznote_mcp.client.httpx.Client")
def test_client_refuses_a_declared_size_over_the_cap_without_reading_it(mock_client_cls):
    http_client = MagicMock()
    context, response = _mock_stream(headers={"content-length": "999999999"}, chunks=[b"x"])
    http_client.stream.return_value = context
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.get_attachment(42, "abc", max_bytes=1024)

    assert result == {"success": False, "status": 200, "error": "too_large", "size": 999999999}
    response.iter_bytes.assert_not_called()


@patch("poznote_mcp.client.httpx.Client")
def test_client_stops_reading_a_body_that_passes_the_cap(mock_client_cls):
    """A response that declares no length, or declares a wrong one, must not be
    pulled into memory whole before the size is noticed."""
    read = []

    def chunks():
        for index in range(100):
            read.append(index)
            yield b"x" * 100

    http_client = MagicMock()
    context, _ = _mock_stream(chunks=chunks())
    http_client.stream.return_value = context
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    result = client.get_attachment(42, "abc", max_bytes=250)

    assert result["error"] == "too_large"
    assert result["size"] is None
    assert len(read) == 3


def test_get_attachment_returns_the_bytes_and_their_sha256():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(note_id=42, filename="chart.png"))

    assert payload["success"] is True
    assert base64.b64decode(payload["content_base64"]) == PNG
    assert payload["sha256"] == PNG_SHA256
    assert payload["size"] == len(PNG)
    assert payload["filename"] == "chart.png"
    assert payload["stored_filename"] == "68f0_1762.png"
    # The recorded type, not the one the response was served with.
    assert payload["mime_type"] == "image/png"
    assert payload["encoding"] == "base64"
    _, kwargs = client.get_attachment.call_args
    assert kwargs["attachment_id"] == "abc"
    assert kwargs["max_bytes"] == server.MAX_ATTACHMENT_BYTES


def test_a_filename_matches_whatever_its_case_and_so_does_the_stored_name():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        assert json.loads(server.get_attachment(42, filename="  CHART.PNG "))["success"] is True
        assert json.loads(server.get_attachment(42, filename="68f0_1762.png"))["success"] is True


def test_an_attachment_id_reads_the_file_without_a_name():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, attachment_id="abc"))

    assert payload["success"] is True
    assert payload["attachment_id"] == "abc"


def test_two_attachments_of_the_same_name_are_listed_not_chosen():
    client = _reading_client(attachments=[_record(), _record(id="def", filename="991_1763.png")])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="chart.png"))

    assert payload["success"] is False
    assert payload["error"] == "ambiguous_attachment_filename"
    assert [c["attachment_id"] for c in payload["candidates"]] == ["abc", "def"]
    client.get_attachment.assert_not_called()


def test_a_name_no_attachment_carries_comes_back_with_the_ones_that_exist():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="other.png"))

    assert payload["success"] is False
    assert "other.png" in payload["error"]
    assert payload["attachments"][0]["filename"] == "chart.png"
    client.get_attachment.assert_not_called()


def test_both_a_name_and_an_id_is_refused_rather_than_one_of_them_dropped():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="chart.png", attachment_id="abc"))

    assert "not both" in payload["error"]
    client.list_attachments.assert_not_called()


def test_a_note_without_attachments_says_so():
    client = _reading_client(attachments=[])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="chart.png"))

    assert payload["success"] is False
    assert "no attachment" in payload["error"]


def test_text_encoding_decodes_a_log_poznote_stored_as_octet_stream():
    record = _record(
        original_filename="run.log",
        filename="991_1763.log",
        file_type="application/octet-stream",
        file_size=5,
    )
    client = _reading_client(content="héllo".encode(), attachments=[record])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="run.log", encoding="text"))

    assert payload["success"] is True
    assert payload["content"] == "héllo"
    assert payload["encoding"] == "text"
    assert "content_base64" not in payload
    assert payload["sha256"] == hashlib.sha256("héllo".encode()).hexdigest()


def test_text_encoding_drops_a_byte_order_mark():
    record = _record(original_filename="notes.md", filename="991.md", file_type="text/plain")
    client = _reading_client(content="﻿# Title".encode(), attachments=[record])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="notes.md", encoding="text"))

    assert payload["content"] == "# Title"


def test_text_encoding_is_refused_for_a_pdf():
    record = _record(original_filename="report.pdf", filename="991.pdf", file_type="application/pdf")
    client = _reading_client(content=PDF, attachments=[record])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="report.pdf", encoding="text"))

    assert payload["success"] is False
    assert payload["error"] == "Not a text format"
    assert "base64" in payload["hint"]
    # The type is on record, so nothing had to be downloaded to know this.
    client.get_attachment.assert_not_called()


def test_a_text_file_that_is_not_utf8_is_refused_not_mangled():
    record = _record(original_filename="legacy.txt", filename="991.txt", file_type="text/plain")
    client = _reading_client(content=b"caf\xe9", attachments=[record])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="legacy.txt", encoding="text"))

    assert payload["success"] is False
    assert payload["error"] == "Not valid UTF-8"


def test_an_unknown_encoding_is_refused_before_anything_is_read():
    client = _reading_client()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="chart.png", encoding="utf-16"))

    assert "Unknown encoding" in payload["error"]
    client.list_attachments.assert_not_called()


def test_a_file_over_the_cap_is_refused_on_its_recorded_size():
    record = _record(file_size=server.MAX_ATTACHMENT_BYTES + 1, original_filename="film.mp4", file_type="video/mp4")
    client = _reading_client(attachments=[record])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="film.mp4"))

    assert payload["error"] == "Attachment too large for a tool call"
    assert payload["size"] == server.MAX_ATTACHMENT_BYTES + 1
    client.get_attachment.assert_not_called()


def test_a_cap_hit_during_the_download_is_reported_the_same_way():
    """The recorded size can be absent or stale; the read is capped as well."""
    client = _reading_client(attachments=[_record(file_size=None)])
    client.get_attachment.return_value = {"success": False, "error": "too_large", "size": None, "status": 200}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, filename="chart.png"))

    assert payload["error"] == "Attachment too large for a tool call"
    assert payload["max_size"] == server.MAX_ATTACHMENT_BYTES


def test_the_reason_the_api_refused_the_read_reaches_the_caller():
    client = _reading_client()
    client.get_attachment.return_value = {"success": False, "error": "File not found", "status": 404}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(42, attachment_id="abc"))

    assert payload["success"] is False
    assert payload["error"] == "File not found"
    assert payload["status"] == 404


def test_a_path_names_the_note_instead_of_its_id():
    client = _reading_client()
    client.resolve_note_path.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_attachment(path="Projects/Alpha/Status", filename="chart.png"))

    assert payload["success"] is True
    assert payload["note_id"] == 42
