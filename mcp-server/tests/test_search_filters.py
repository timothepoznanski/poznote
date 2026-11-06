"""search_notes tokenises, and both listings filter by tag and update date.

Issue #1737. search_notes used to hand the whole query to the server as one
string, which matched it as a single substring: a query of two words that both
appear in a note, but not side by side, came back empty. The reporter measured
0 results where 380 notes carried all the words.

The matching itself lives in PHP (tests/search-query.test.php pins it against
a real SQLite). What these tests pin is the MCP surface: that the parameters
reach the server, that an unknown mode is refused here rather than at the
server, and that nothing is sent when nothing was asked for.
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


def _client(http_client):
    return PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")


@patch("poznote_mcp.client.httpx.Client")
def test_the_client_sends_every_new_search_filter(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "results": []})
    mock_client_cls.return_value = http_client

    _client(http_client).search_notes(
        "staging pipeline",
        limit=5,
        workspace="Demo",
        mode="any",
        tags="topic/ai,chat_log",
        folder="Projects/Alpha",
        updated_from="2026-11-01",
        updated_to="2026-11-06",
    )

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {
        "q": "staging pipeline",
        "limit": 5,
        "workspace": "Demo",
        "mode": "any",
        "tags": "topic/ai,chat_log",
        "folder": "Projects/Alpha",
        "updated_from": "2026-11-01",
        "updated_to": "2026-11-06",
    }


@patch("poznote_mcp.client.httpx.Client")
def test_a_plain_search_sends_no_filter_at_all(mock_client_cls):
    """The default must stay the old payload, so an older Poznote still answers."""
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "results": []})
    mock_client_cls.return_value = http_client

    _client(http_client).search_notes("pipeline")

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {"q": "pipeline", "limit": 10}


@patch("poznote_mcp.client.httpx.Client")
def test_the_client_sends_the_new_list_filters(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response({"success": True, "notes": [], "total": 0})
    mock_client_cls.return_value = http_client

    _client(http_client).list_notes(
        workspace="Demo",
        limit=50,
        tags="topic/ai",
        updated_from="2026-11-05",
        updated_to="2026-11-06",
    )

    _, kwargs = http_client.get.call_args
    assert kwargs["params"] == {
        "workspace": "Demo",
        "limit": 50,
        "tags": "topic/ai",
        "updated_from": "2026-11-05",
        "updated_to": "2026-11-06",
    }


@patch("poznote_mcp.server._get_client_or_error")
def test_the_tool_passes_the_filters_down(mock_get_client):
    client = MagicMock()
    client.search_notes.return_value = []
    mock_get_client.return_value = (client, None)

    server.search_notes(
        "staging pipeline",
        mode="phrase",
        tags="topic/ai",
        folder="Projects/Alpha",
        updated_from="2026-11-01",
    )

    kwargs = client.search_notes.call_args.kwargs
    assert kwargs["mode"] == "phrase"
    assert kwargs["tags"] == "topic/ai"
    assert kwargs["folder"] == "Projects/Alpha"
    assert kwargs["updated_from"] == "2026-11-01"
    assert kwargs["updated_to"] is None


@patch("poznote_mcp.server._get_client_or_error")
def test_the_default_mode_is_all(mock_get_client):
    client = MagicMock()
    client.search_notes.return_value = []
    mock_get_client.return_value = (client, None)

    result = json.loads(server.search_notes("staging pipeline"))

    assert client.search_notes.call_args.kwargs["mode"] == "all"
    assert result["mode"] == "all", "the answer says how the query was read"


@patch("poznote_mcp.server._get_client_or_error")
def test_an_unknown_mode_is_refused_without_a_round_trip(mock_get_client):
    client = MagicMock()
    mock_get_client.return_value = (client, None)

    result = json.loads(server.search_notes("pipeline", mode="fuzzy"))

    assert "mode must be one of" in result["error"]
    client.search_notes.assert_not_called()


@patch("poznote_mcp.server._get_client_or_error")
def test_an_empty_query_is_still_refused(mock_get_client):
    client = MagicMock()
    mock_get_client.return_value = (client, None)

    result = json.loads(server.search_notes(""))

    assert "query parameter is required" in result["error"]
    client.search_notes.assert_not_called()


@patch("poznote_mcp.server._get_client_or_error")
def test_list_notes_passes_the_filters_down(mock_get_client):
    client = MagicMock()
    client.list_notes.return_value = {"notes": [], "total": 0, "has_more": False, "offset": 0}
    mock_get_client.return_value = (client, None)

    server.list_notes(tags="topic/ai", updated_from="2026-11-05", folder="Projects/Alpha")

    kwargs = client.list_notes.call_args.kwargs
    assert kwargs["tags"] == "topic/ai"
    assert kwargs["updated_from"] == "2026-11-05"
    assert kwargs["folder"] == "Projects/Alpha"
