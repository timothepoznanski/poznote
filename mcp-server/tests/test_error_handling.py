"""Tests for HTTP error handling in MCP tool handlers.

Every tool must return a clean JSON error (not a stacktrace) when the
Poznote API is unreachable, times out, or returns an HTTP error.
"""

import json
from unittest.mock import MagicMock, patch, PropertyMock

import httpx
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_client(**overrides):
    """Return a MagicMock PoznoteClient."""
    client = MagicMock()
    client.base_url = "http://localhost:8040/api/v1"
    client.username = "admin"
    client.password = "secret"
    client.default_workspace = "Poznote"
    for k, v in overrides.items():
        setattr(client, k, v)
    return client


def _make_http_status_error(status_code: int, body: str = ""):
    """Build a realistic httpx.HTTPStatusError."""
    request = httpx.Request("GET", "http://localhost:8040/api/v1/notes")
    response = httpx.Response(status_code, request=request, text=body)
    return httpx.HTTPStatusError(
        message=f"{status_code}",
        request=request,
        response=response,
    )


# ---------------------------------------------------------------------------
# Parameterized tests for all tools that call the API
# ---------------------------------------------------------------------------

# (tool_function_name, kwargs to pass)
TOOL_CALLS = [
    ("get_note", {"id": 1}),
    ("list_notes", {}),
    ("search_notes", {"query": "test"}),
    ("create_note", {"title": "T", "content": "C"}),
    ("update_note", {"id": 1, "title": "New"}),
    ("delete_note", {"id": 1}),
    ("create_folder", {"folder_name": "F"}),
    ("list_folders", {}),
    ("list_workspaces", {}),
    ("list_tags", {}),
    ("get_trash", {}),
    ("empty_trash", {}),
    ("restore_note", {"id": 1}),
    ("duplicate_note", {"id": 1}),
    ("toggle_favorite", {"id": 1}),
    ("list_attachments", {"note_id": 1}),
    ("move_note_to_folder", {"note_id": 1, "folder_id": 2}),
    ("remove_note_from_folder", {"note_id": 1}),
    ("share_note", {"note_id": 1}),
    ("unshare_note", {"note_id": 1}),
    ("get_note_share_status", {"note_id": 1}),
    ("get_git_sync_status", {}),
    ("git_push", {}),
    ("git_pull", {}),
    ("get_system_info", {}),
    ("list_backups", {}),
    ("create_backup", {}),
    ("restore_backup", {"filename": "backup.zip"}),
    ("get_app_setting", {"key": "theme"}),
    ("update_app_setting", {"key": "theme", "value": "dark"}),
    ("get_backlinks", {"note_id": 1}),
    ("convert_note", {"id": 1, "target": "markdown"}),
    ("rename_folder", {"folder_id": 1, "new_name": "NewF"}),
    ("delete_folder", {"folder_id": 1}),
    ("create_workspace", {"name": "Test"}),
    ("rename_workspace", {"current_name": "Old", "new_name": "New"}),
    ("delete_workspace", {"name": "Test"}),
    ("delete_backup", {"filename": "backup.zip"}),
    ("list_shared", {}),
]

# Exception types to test
EXCEPTIONS = [
    httpx.ConnectError("Connection refused"),
    httpx.ReadTimeout("Read timed out"),
    _make_http_status_error(500, "Internal Server Error"),
    _make_http_status_error(502, "Bad Gateway"),
]


class TestToolErrorHandling:
    """Every tool must catch HTTP errors and return a JSON error."""

    @pytest.mark.parametrize("tool_name,kwargs", TOOL_CALLS)
    @pytest.mark.parametrize("exception", EXCEPTIONS)
    @patch("poznote_mcp.server._get_client_or_error")
    def test_tool_returns_json_error_on_exception(self, mock_gcoe, tool_name, kwargs, exception):
        import poznote_mcp.server as srv

        tool_fn = getattr(srv, tool_name)

        client = _fake_client()
        # Configure all mock methods to raise the exception
        client.configure_mock(**{
            f"{m}.side_effect": exception
            for m in [
                "get_note", "list_notes", "search_notes", "create_note",
                "update_note", "delete_note", "create_folder", "list_folders",
                "list_workspaces", "list_tags", "get_trash", "empty_trash",
                "restore_note", "duplicate_note", "toggle_favorite",
                "list_attachments", "move_note_to_folder", "remove_note_from_folder",
                "create_note_share", "delete_note_share", "get_note_share_status",
                "get_git_status", "git_push", "git_pull", "get_system_version",
                "list_backups", "create_backup", "restore_backup", "get_setting",
                "update_setting", "get_backlinks", "convert_note",
                "rename_folder", "delete_folder",
                "create_workspace", "rename_workspace", "delete_workspace",
                "delete_backup", "list_shared",
            ]
        })

        mock_gcoe.return_value = (client, None)

        result_json = tool_fn(**kwargs)
        result = json.loads(result_json)

        assert "error" in result, f"{tool_name} did not return an error key"
        assert isinstance(result["error"], str)


class TestMissingEnvVars:
    """Tools must return clear config errors when env vars are missing."""

    @patch("poznote_mcp.server.get_client")
    def test_missing_username(self, mock_get_client):
        from poznote_mcp.server import list_notes

        client = _fake_client(username="")
        mock_get_client.return_value = client

        result_json = list_notes()
        result = json.loads(result_json)

        assert "error" in result
        assert "POZNOTE_USERNAME" in result.get("missing", [])

    @patch("poznote_mcp.server.get_client")
    def test_missing_password(self, mock_get_client):
        from poznote_mcp.server import list_notes

        client = _fake_client(password="")
        mock_get_client.return_value = client

        result_json = list_notes()
        result = json.loads(result_json)

        assert "error" in result
        assert "POZNOTE_PASSWORD" in result.get("missing", [])


class TestApiErrorJsonHelper:
    """Test the _api_error_json helper directly."""

    def test_connect_error(self):
        from poznote_mcp.server import _api_error_json

        result = json.loads(_api_error_json(httpx.ConnectError("refused")))
        assert "Cannot connect" in result["error"]

    def test_timeout_error(self):
        from poznote_mcp.server import _api_error_json

        result = json.loads(_api_error_json(httpx.ReadTimeout("timed out")))
        assert "timed out" in result["error"]

    def test_http_status_error(self):
        from poznote_mcp.server import _api_error_json

        exc = _make_http_status_error(403, "Forbidden")
        result = json.loads(_api_error_json(exc))
        assert "403" in result["error"]
        assert "Forbidden" in result["detail"]

    def test_generic_httpx_error(self):
        from poznote_mcp.server import _api_error_json

        result = json.loads(_api_error_json(httpx.DecodingError("bad json")))
        assert "DecodingError" in result["error"]
