"""Addressing a note by its path instead of its id (issue #1738).

A caller that knows where a note lives had to resolve the id first, with a
listing and a client-side scan of up to a page of notes, before every read.
Every tool that takes a note id now also takes a path, and exactly one of the
two: a path is matched like the folder arguments the API already has, and one
that two notes answer to is refused with both of them rather than resolved to
whichever sorts first.
"""

import asyncio
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


def _registered_tools():
    return {tool.name: tool for tool in asyncio.run(server.mcp.list_tools(run_middleware=False))}


# A note in the trash is not at a path any more: the resolver only sees live
# notes, and get_trash hands out the ids these two need.
TRASH_TOOLS = {"restore_note", "delete_trash_note"}


def test_every_tool_that_takes_a_note_id_also_takes_a_path():
    for name, tool in _registered_tools().items():
        properties = tool.parameters.get("properties", {})
        if not ({"id", "note_id"} & set(properties)):
            continue
        if name in TRASH_TOOLS:
            assert "path" not in properties, name
            continue
        assert "path" in properties, name


def test_neither_the_id_nor_the_path_is_required_on_its_own():
    for name, tool in _registered_tools().items():
        properties = tool.parameters.get("properties", {})
        required = set(tool.parameters.get("required", []))
        if name in TRASH_TOOLS or not ({"id", "note_id"} & set(properties)):
            continue
        assert not (required & {"id", "note_id", "path"}), name


# =============================================================================
# The client call behind a path
# =============================================================================

@patch("poznote_mcp.client.httpx.Client")
def test_client_asks_the_api_to_resolve_the_path(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response(
        {"success": True, "id": 42, "heading": "Status", "workspace": "Work", "folder": "Projects/Alpha"}
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    resolved = client.resolve_note_path("Projects/Alpha/Status", workspace="Work")

    args, kwargs = http_client.get.call_args
    assert args[0] == "/notes/resolve"
    assert kwargs["params"] == {"path": "Projects/Alpha/Status", "workspace": "Work"}
    assert resolved == {"id": 42, "heading": "Status", "workspace": "Work", "folder": "Projects/Alpha"}


@patch("poznote_mcp.client.httpx.Client")
def test_client_keeps_the_candidates_of_an_ambiguous_path(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response(
        {
            "success": False,
            "error": 'Several notes answer to the path "Status".',
            "code": "ambiguous_note_path",
            "total": 2,
            "candidates": [
                {"id": 10, "path": "Projects/Alpha/Status", "workspace": "Work"},
                {"id": 11, "path": "Projects/Beta/Status", "workspace": "Work"},
            ],
        },
        status=409,
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    resolved = client.resolve_note_path("Status")

    assert resolved["code"] == "ambiguous_note_path"
    assert [c["id"] for c in resolved["candidates"]] == [10, 11]
    assert "success" not in resolved


@patch("poznote_mcp.client.httpx.Client")
def test_client_reports_a_path_no_note_answers_to(mock_client_cls):
    http_client = MagicMock()
    http_client.get.return_value = _mock_response(
        {"success": False, "error": 'No note at the path "Projects/Alpha/Nope".'}, status=404
    )
    mock_client_cls.return_value = http_client

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    resolved = client.resolve_note_path("Projects/Alpha/Nope")

    assert resolved.get("id") is None
    assert "No note at the path" in resolved["error"]


# =============================================================================
# _note_target: the id or the path, never both and never neither
# =============================================================================

def test_an_id_is_used_as_it_is_without_a_lookup():
    client = MagicMock()
    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        assert server._note_target(7, None) == (7, None)
    client.resolve_note_path.assert_not_called()


def test_a_path_is_resolved_once_in_the_workspace_it_was_given():
    client = MagicMock()
    client.resolve_note_path.return_value = {"id": 42}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        note_id, err = server._note_target(None, "Projects/Alpha/Status", "Work", 3)

    assert (note_id, err) == (42, None)
    client.resolve_note_path.assert_called_once_with(
        "Projects/Alpha/Status", workspace="Work", user_id=3
    )


def test_both_at_once_is_refused_rather_than_silently_preferred():
    client = MagicMock()
    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        note_id, err = server._note_target(7, "Projects/Alpha/Status")

    assert note_id is None
    assert "not both" in json.loads(err)["error"]
    client.resolve_note_path.assert_not_called()


def test_neither_one_says_what_a_path_looks_like():
    client = MagicMock()
    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        note_id, err = server._note_target(None, "   ")

    payload = json.loads(err)
    assert note_id is None
    assert payload["success"] is False
    assert "Projects/Alpha/Status" in payload["hint"]
    client.resolve_note_path.assert_not_called()


def test_the_candidates_of_an_ambiguous_path_reach_the_caller():
    client = MagicMock()
    client.resolve_note_path.return_value = {
        "error": 'Several notes answer to the path "Status".',
        "code": "ambiguous_note_path",
        "total": 2,
        "candidates": [{"id": 10, "path": "Projects/Alpha/Status"}, {"id": 11, "path": "Projects/Beta/Status"}],
    }

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        note_id, err = server._note_target(None, "Status")

    payload = json.loads(err)
    assert note_id is None
    assert payload["code"] == "ambiguous_note_path"
    assert payload["path"] == "Status"
    assert [c["id"] for c in payload["candidates"]] == [10, 11]


# =============================================================================
# The tools themselves
# =============================================================================

def test_get_note_reads_the_note_a_path_leads_to():
    client = MagicMock()
    client.resolve_note_path.return_value = {"id": 42}
    client.get_note.return_value = {"id": 42, "heading": "Status", "content": "Fine.", "type": "markdown"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note(path="Projects/Alpha/Status", workspace="Work"))

    assert payload["id"] == 42
    client.get_note.assert_called_once_with(42, workspace="Work", user_id=None)


def test_get_note_still_takes_a_plain_id():
    client = MagicMock()
    client.get_note.return_value = {"id": 7, "heading": "Status", "content": "Fine."}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note(7))

    assert payload["id"] == 7
    client.resolve_note_path.assert_not_called()


def test_a_path_that_leads_nowhere_stops_the_tool_before_it_reads():
    client = MagicMock()
    client.resolve_note_path.return_value = {"error": 'No note at the path "Projects/Alpha/Nope".'}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note(path="Projects/Alpha/Nope"))

    assert payload["success"] is False
    assert payload["path"] == "Projects/Alpha/Nope"
    client.get_note.assert_not_called()


def test_a_write_resolves_the_path_before_touching_the_note():
    client = MagicMock()
    client.resolve_note_path.return_value = {"id": 42}
    client.get_note.return_value = {
        "id": 42, "heading": "Log", "content": "First.", "type": "markdown", "version": "v1",
    }
    client.update_note.return_value = {"id": 42, "version": "v2"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.append_to_note(path="Projects/Alpha/Log", content="Second."))

    assert payload["success"] is True
    assert payload["id"] == 42
    _, kwargs = client.update_note.call_args
    assert kwargs["content"] == "First.\n\nSecond.\n"


def test_a_tool_without_a_workspace_argument_resolves_across_workspaces():
    client = MagicMock()
    client.resolve_note_path.return_value = {"id": 42}
    client.toggle_favorite.return_value = True

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.toggle_favorite(path="Projects/Alpha/Status"))

    assert payload["success"] is True
    client.resolve_note_path.assert_called_once_with(
        "Projects/Alpha/Status", workspace=None, user_id=None
    )
    client.toggle_favorite.assert_called_once_with(42, user_id=None)


def test_a_task_tool_takes_a_path_too():
    client = MagicMock()
    client.resolve_note_path.return_value = {"id": 42}
    client.add_task.return_value = {"id": "t1", "text": "buy milk"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.add_task(path="Projects/Alpha/Groceries", text="buy milk"))

    assert payload["success"] is True
    _, kwargs = client.add_task.call_args
    assert kwargs["note_id"] == 42 or client.add_task.call_args[0][0] == 42
