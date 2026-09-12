"""list_notes pages instead of silently truncating (issue #1370).

The old tool fetched every note and sliced the first 50 off the list, so a
55-note workspace reported "count": 50, indistinguishable from a workspace
that holds exactly 50.
"""

import json
from unittest.mock import MagicMock, patch

from poznote_mcp import server
from poznote_mcp.client import PoznoteClient


def _mock_response(payload):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


@patch("poznote_mcp.client.httpx.Client")
def test_client_sends_limit_and_offset(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response(
        {"success": True, "notes": [], "total": 55, "offset": 50, "limit": 50, "has_more": False}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    page = client.list_notes(workspace="Demo", limit=50, offset=50)

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {"workspace": "Demo", "limit": 50, "offset": 50}
    assert page["total"] == 55


@patch("poznote_mcp.client.httpx.Client")
def test_client_falls_back_when_the_server_has_no_total(mock_client_cls):
    """An older Poznote answers without total/has_more; keep working."""
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "notes": [{"id": 1}, {"id": 2}]})
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    page = client.list_notes()

    assert page["total"] == 2
    assert page["has_more"] is False


def _page(count, total, offset, has_more):
    return {
        "notes": [{"id": i, "heading": f"Note {i}"} for i in range(offset, offset + count)],
        "total": total,
        "offset": offset,
        "limit": 50,
        "has_more": has_more,
    }


def test_truncation_is_visible_and_pageable():
    client = MagicMock()
    client.list_notes.return_value = _page(50, 55, 0, True)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_notes(workspace="Demo"))

    assert payload["count"] == 50
    assert payload["total"] == 55
    assert payload["has_more"] is True
    assert payload["next_offset"] == 50

    _, kwargs = client.list_notes.call_args
    assert kwargs["limit"] == 50 and kwargs["offset"] == 0


def test_a_full_workspace_is_not_reported_as_truncated():
    client = MagicMock()
    client.list_notes.return_value = _page(50, 50, 0, False)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_notes(workspace="Demo"))

    assert payload["count"] == payload["total"] == 50
    assert payload["has_more"] is False
    assert "next_offset" not in payload


def test_offset_is_forwarded():
    client = MagicMock()
    client.list_notes.return_value = _page(5, 55, 50, False)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_notes(workspace="Demo", offset=50))

    _, kwargs = client.list_notes.call_args
    assert kwargs["offset"] == 50
    assert payload["offset"] == 50
    assert payload["count"] == 5


def test_an_oversized_page_is_refused_before_the_call():
    client = MagicMock()

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.list_notes(limit=5000))

    assert "limit must be between" in payload["error"]
    client.list_notes.assert_not_called()
