"""POZNOTE_MCP_SCOPE: which tools the server exposes (discussion #1657)."""

import asyncio
import json
import os
import subprocess
import sys

import pytest

from poznote_mcp import server
from poznote_mcp.server import (
    DESTRUCTIVE_TOOLS,
    OPEN_WORLD_TOOLS,
    SCOPE_LEVELS,
    TOOL_SCOPES,
    _load_scope,
    _scope_allows,
)


def _registered_tools():
    return {tool.name: tool for tool in asyncio.run(server.mcp.list_tools(run_middleware=False))}


def test_every_registered_tool_is_classified_and_the_table_has_no_strays():
    # The suite runs with the default scope, admin, so every tool is registered.
    assert set(_registered_tools()) == set(TOOL_SCOPES)
    assert set(TOOL_SCOPES.values()) <= set(SCOPE_LEVELS)
    assert DESTRUCTIVE_TOOLS <= set(TOOL_SCOPES)
    assert OPEN_WORLD_TOOLS <= set(TOOL_SCOPES)


def test_read_tools_are_never_flagged_destructive():
    assert not {name for name in DESTRUCTIVE_TOOLS if TOOL_SCOPES[name] == "read"}


def test_annotations_follow_the_table():
    tools = _registered_tools()
    for name, level in TOOL_SCOPES.items():
        annotations = tools[name].annotations
        assert annotations.readOnlyHint is (level == "read"), name
        if level == "read":
            assert annotations.destructiveHint is None, name
        else:
            assert annotations.destructiveHint is (name in DESTRUCTIVE_TOOLS), name
        assert annotations.openWorldHint is (name in OPEN_WORLD_TOOLS), name
        assert f"scope:{level}" in tools[name].tags, name


def test_irreversible_and_instance_wide_tools_need_admin():
    for name in ("empty_trash", "delete_trash_note", "restore_backup", "delete_backup",
                 "update_app_setting", "delete_workspace", "share_note", "git_pull"):
        assert TOOL_SCOPES[name] == "admin", name


def test_reversible_note_changes_are_write():
    # delete_note moves the note to the trash, restore_note brings it back.
    for name in ("delete_note", "restore_note", "restore_snapshot", "update_note", "delete_folder"):
        assert TOOL_SCOPES[name] == "write", name


@pytest.mark.parametrize("raw,expected", [
    (None, "admin"), ("", "admin"), ("   ", "admin"),
    ("read", "read"), ("write", "write"), ("admin", "admin"),
    (" READ ", "read"), ("Write", "write"),
])
def test_load_scope_parses(monkeypatch, raw, expected):
    if raw is None:
        monkeypatch.delenv("POZNOTE_MCP_SCOPE", raising=False)
        assert _load_scope() == expected
    else:
        assert _load_scope(raw) == expected


@pytest.mark.parametrize("raw", ["readonly", "true", "ro", "all", "admin,read"])
def test_load_scope_refuses_unknown_values_instead_of_opening_everything(raw):
    with pytest.raises(ValueError, match="POZNOTE_MCP_SCOPE"):
        _load_scope(raw)


def test_scope_levels_are_ordered():
    assert _scope_allows("read", "read")
    assert not _scope_allows("read", "write")
    assert not _scope_allows("write", "admin")
    assert _scope_allows("write", "read")
    assert _scope_allows("admin", "write")


# The scope is read once at import, so a restricted server is checked in a
# fresh interpreter rather than by reloading the module under the suite.
_PROBE = """
import asyncio, json
from fastmcp import Client
from poznote_mcp import server

async def main():
    async with Client(server.mcp) as client:
        listed = sorted(t.name for t in await client.list_tools())
        try:
            await client.call_tool("empty_trash", {})
            refused = False
        except Exception as exc:
            refused = "'empty_trash': not found" in str(exc)
    print(json.dumps({"listed": listed, "refused": refused}))

asyncio.run(main())
"""


def _run_with_scope(value):
    env = {**os.environ, "POZNOTE_MCP_SCOPE": value}
    env.pop("POZNOTE_MCP_AUTH_TOKEN", None)
    env.pop("POZNOTE_MCP_AUTH_PROVIDER", None)
    return subprocess.run(
        [sys.executable, "-c", _PROBE], env=env, capture_output=True, text=True, timeout=60,
    )


@pytest.mark.parametrize("level", ["read", "write"])
def test_restricted_server_lists_only_its_level_and_refuses_the_rest(level):
    result = _run_with_scope(level)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    expected = sorted(n for n, lvl in TOOL_SCOPES.items() if _scope_allows(level, lvl))
    assert payload["listed"] == expected
    assert payload["refused"] is True


def test_invalid_scope_stops_the_server():
    result = _run_with_scope("readonly")
    assert result.returncode != 0
    assert "POZNOTE_MCP_SCOPE" in result.stderr


# --------------------------------------------------------------------------- #
# Per-caller level from an identity-provider claim (POZNOTE_MCP_SCOPE_MAP)
# --------------------------------------------------------------------------- #

from unittest import mock

from fastmcp import Client
from fastmcp.server.auth import AccessToken

from poznote_mcp import auth_external as ext


def _config(scope_map="", claim=None):
    env = {
        "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
        "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u",
        "POZNOTE_MCP_SCOPE_MAP": scope_map,
    }
    if claim:
        env["POZNOTE_MCP_SCOPE_CLAIM"] = claim
    with mock.patch.dict(os.environ, env, clear=True):
        return ext.ExternalAuthConfig.from_env()


def test_scope_map_parses_and_defaults_to_the_scope_claim():
    cfg = _config(" poznote.read = read , poznote.write=Write, /poznote-admins=admin ")
    assert cfg.scope_claim == "scope"
    assert cfg.scope_map == {"poznote.read": "read", "poznote.write": "write", "/poznote-admins": "admin"}
    assert _config().scope_map == {}


def test_scope_map_value_may_contain_an_equals_sign():
    assert _config("role=editor=write").scope_map == {"role=editor": "write"}


@pytest.mark.parametrize("raw", ["poznote.read", "poznote.read=readonly", "=read", "poznote.read=read,x=root"])
def test_scope_map_refuses_malformed_entries(raw):
    with pytest.raises(ValueError, match="POZNOTE_MCP_SCOPE_MAP"):
        _config(raw)


def test_caller_level_splits_the_oauth_scope_string_and_takes_the_highest():
    cfg = _config("poznote.read=read,poznote.write=write")
    assert cfg.caller_level({"scope": "openid poznote.read poznote.write"}) == "write"
    assert cfg.caller_level({"scope": "openid poznote.read"}) == "read"
    assert cfg.caller_level({"scope": "openid email"}) is None
    assert cfg.caller_level({}) is None


def test_caller_level_reads_a_list_claim():
    cfg = _config("/poznote-admins=admin,/poznote=read", claim="groups")
    assert cfg.caller_level({"groups": ["/staff", "/poznote"]}) == "read"
    assert cfg.caller_level({"groups": ["/poznote", "/poznote-admins"]}) == "admin"
    assert cfg.caller_level({"scope": "/poznote-admins"}) is None


def test_list_claim_items_are_not_split_on_spaces():
    cfg = _config("Poznote Admins=admin,Poznote=read", claim="groups")
    assert cfg.caller_level({"groups": ["Poznote Admins"]}) == "admin"
    assert cfg.caller_level({"groups": ["Admins Poznote"]}) is None


def _verify(cfg, claims):
    verifier = ext.ExternalTokenVerifier(cfg)
    response = mock.Mock(status_code=200)
    response.json.return_value = claims
    with mock.patch.object(ext.httpx, "get", return_value=response):
        return asyncio.run(verifier.verify_token("tok"))


def test_verifier_puts_the_caller_level_in_the_token_scopes():
    token = _verify(_config("poznote.read=read"), {"sub": "11", "scope": "openid poznote.read"})
    assert token.scopes == ["read"]


def test_verifier_refuses_a_caller_whose_claim_maps_to_no_level():
    assert _verify(_config("poznote.read=read"), {"sub": "11", "scope": "openid"}) is None


def test_verifier_without_a_map_leaves_the_scopes_empty():
    token = _verify(_config(), {"sub": "11", "scope": "openid"})
    assert token.scopes == []


async def _as_caller(scopes, coro):
    token = AccessToken(token="t", client_id="11", scopes=scopes)
    with mock.patch("fastmcp.server.middleware.authorization.get_access_token", return_value=token):
        async with Client(server.mcp) as client:
            return await coro(client)


async def _listed(client):
    return {t.name for t in await client.list_tools()}


@pytest.mark.parametrize("level", ["read", "write", "admin"])
def test_caller_sees_only_the_tools_of_its_level(level):
    listed = asyncio.run(_as_caller([level], _listed))
    assert listed == {n for n, lvl in TOOL_SCOPES.items() if _scope_allows(level, lvl)}


def test_token_without_a_level_keeps_every_registered_tool():
    assert asyncio.run(_as_caller([], _listed)) == set(TOOL_SCOPES)


def test_caller_call_above_its_level_is_refused_before_the_tool_runs():
    async def call(client):
        return await client.call_tool("empty_trash", {})

    with mock.patch.object(server, "get_client", side_effect=AssertionError("tool ran")):
        with pytest.raises(Exception, match="Authorization failed for tool 'empty_trash'"):
            asyncio.run(_as_caller(["write"], call))
