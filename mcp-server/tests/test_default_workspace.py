"""Omitting the workspace resolves to a stable default, or is refused (#1373).

It used to fall through to the API's getFirstWorkspaceName(), whichever
workspace sorts first: archiving one note creates "Archives", which then sorts
above everything, and later notes silently landed somewhere else.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from poznote_mcp import server


@pytest.fixture(autouse=True)
def _clear_cache():
    server._forget_default_workspace()
    yield
    server._forget_default_workspace()


def _client(workspaces, configured=""):
    client = MagicMock()
    client.list_workspaces.return_value = [{"name": n} for n in workspaces]
    client.get_setting.return_value = {"value": configured}
    client.create_note.return_value = {"id": 1}
    client.create_folder.return_value = {"id": 1}
    return client


def test_the_named_workspace_always_wins():
    client = _client(["Archives", "Poznote"], configured="Poznote")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="T", content="x", workspace="Notes")

    _, kwargs = client.create_note.call_args
    assert kwargs["workspace"] == "Notes"
    client.list_workspaces.assert_not_called()


def test_the_configured_default_is_used_when_none_is_named():
    client = _client(["Archives", "Poznote"], configured="Poznote")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="T", content="x")

    _, kwargs = client.create_note.call_args
    assert kwargs["workspace"] == "Poznote"


def test_a_single_workspace_needs_no_setting():
    client = _client(["Poznote"])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="T", content="x")

    _, kwargs = client.create_note.call_args
    assert kwargs["workspace"] == "Poznote"


def test_several_workspaces_and_no_setting_is_refused_not_guessed():
    client = _client(["Archives", "Poznote"])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="T", content="x"))

    assert "No workspace given" in payload["error"]
    assert payload["workspaces"] == ["Archives", "Poznote"]
    client.create_note.assert_not_called()


def test_a_setting_naming_a_workspace_that_is_gone_is_not_used():
    client = _client(["Archives", "Poznote"], configured="Deleted")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="T", content="x"))

    assert "No workspace given" in payload["error"]
    assert payload["configured_default"] == "Deleted"


def test_create_folder_resolves_the_same_way():
    client = _client(["Archives", "Poznote"], configured="Poznote")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_folder(folder_name="Projects")

    _, kwargs = client.create_folder.call_args
    assert kwargs["workspace"] == "Poznote"


def test_the_resolution_is_not_repeated_for_every_call():
    client = _client(["Poznote"])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="A", content="x")
        server.create_note(title="B", content="x")

    assert client.list_workspaces.call_count == 1


def test_creating_a_workspace_retires_the_remembered_default():
    client = _client(["Poznote"])
    client.create_workspace.return_value = {"success": True}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="A", content="x")
        server.create_workspace(name="Archives")
        client.list_workspaces.return_value = [{"name": "Archives"}, {"name": "Poznote"}]
        payload = json.loads(server.create_note(title="B", content="x"))

    # Two workspaces now, and no setting: the guess is refused rather than
    # served from a stale cache.
    assert "No workspace given" in payload["error"]


def test_an_unreadable_setting_does_not_block_a_single_workspace_account():
    client = _client(["Poznote"])
    client.get_setting.side_effect = RuntimeError("403")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        server.create_note(title="T", content="x")

    _, kwargs = client.create_note.call_args
    assert kwargs["workspace"] == "Poznote"


def test_a_missing_content_is_reported_before_any_workspace_lookup():
    client = _client(["Archives", "Poznote"])

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.create_note(title="T"))

    assert "content is required" in payload["error"]
