#!/usr/bin/env python3
"""Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Transport:
    - streamable-http (HTTP) only

Tools:
  - get_note: Get a specific note by its ID with full content
  - search_notes: Search notes by text query, with optional creation date range
  - create_note: Create a new note
  - update_note: Update an existing note
  - delete_note: Delete a note by its ID
  - list_notes: List all notes from a specific workspace
  - create_folder: Create a new folder in Poznote

Usage:
    poznote-mcp serve --host=127.0.0.1 --port=YOUR_POZNOTE_MCP_PORT

Inbound authentication:
    The endpoint is open to any client that can reach it. Set
    POZNOTE_MCP_AUTH_TOKEN to require "Authorization: Bearer <token>" on
    every request. Without it, keep the server bound to 127.0.0.1 (the
    default) or behind a port mapping / tunnel that only you can reach.
"""

import argparse
import atexit
import hmac
import json
import logging
import os
import socket
import sys
from typing import Optional, Union

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken, TokenVerifier

from .client import PoznoteClient


def _is_strict_bool_env_value(value: str) -> bool:
    return value in {"true", "false"}


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    if value == "true":
        return True
    if value == "false":
        return False
    return False


_debug_env_value = os.getenv("POZNOTE_DEBUG")
_debug_enabled = _env_bool("POZNOTE_DEBUG")

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if _debug_enabled else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("poznote-mcp")

if _debug_env_value is not None and not _is_strict_bool_env_value(_debug_env_value):
    logger.warning(
        "Invalid POZNOTE_DEBUG value %r; expected 'true' or 'false'. Falling back to false.",
        _debug_env_value,
    )


def _is_addr_in_use_error(exc: BaseException) -> bool:
    """Return True if exc (or a contained exception) is an "address already in use" bind error."""
    if isinstance(exc, OSError) and getattr(exc, "errno", None) == 98:
        return True

    # Python 3.11+ may wrap async failures in an ExceptionGroup.
    try:
        from builtins import BaseExceptionGroup as _BaseExceptionGroup  # type: ignore
    except Exception:
        _BaseExceptionGroup = None

    if _BaseExceptionGroup is not None and isinstance(exc, _BaseExceptionGroup):
        return any(_is_addr_in_use_error(sub) for sub in exc.exceptions)

    return False


def _assert_port_available(host: str, port: int) -> None:
    """Fail fast with a clear message if host:port cannot be bound.

    Uvicorn may only log a bind failure and exit; doing a preflight bind check
    makes the error user-friendly and deterministic.
    """
    try:
        addrinfos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        # If the host isn't resolvable, let Uvicorn/FastMCP surface the error.
        return

    last_error: OSError | None = None
    for family, socktype, proto, _, sockaddr in addrinfos:
        test_socket: socket.socket | None = None
        try:
            test_socket = socket.socket(family, socktype, proto)
            test_socket.bind(sockaddr)
        except OSError as e:
            last_error = e
            # Address already in use
            if getattr(e, "errno", None) == 98:
                logger.error(
                    "Port already in use: cannot bind %s:%s. "
                    "Choose another port (e.g. --port=18042) or stop the process using it. "
                    "To check: ss -tulpn | grep -E ':%s\\b'",
                    host,
                    port,
                    port,
                )
                raise
            # Permission denied (privileged port / policy)
            if getattr(e, "errno", None) == 13:
                logger.error(
                    "Permission denied binding %s:%s. Try a port >= 1024 (e.g. --port=YOUR_POZNOTE_MCP_PORT).",
                    host,
                    port,
                )
                raise
        finally:
            if test_socket is not None:
                try:
                    test_socket.close()
                except Exception:
                    pass

    # If all addrinfos failed, re-raise the last one so the caller can handle/log.
    if last_error is not None:
        raise last_error

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8045
AUTH_TOKEN_ENV = "POZNOTE_MCP_AUTH_TOKEN"


def _is_loopback_host(host: str) -> bool:
    """True when host only accepts connections from the local machine."""
    value = (host or "").strip().lower()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    return value == "localhost" or value == "::1" or value.startswith("127.")


def _load_inbound_auth_token(env_value: str | None = None) -> str | None:
    """Return the bearer token clients must present, or None when auth is off.

    Reads POZNOTE_MCP_AUTH_TOKEN. An unset or blank value disables inbound
    authentication (the historical behaviour); whitespace is stripped so a
    trailing newline from a secrets file does not lock everyone out.
    """
    raw = os.getenv(AUTH_TOKEN_ENV) if env_value is None else env_value
    token = (raw or "").strip()
    return token or None


class StaticBearerTokenVerifier(TokenVerifier):
    """Accept exactly one pre-shared bearer token.

    FastMCP ships a StaticTokenVerifier for tests, but it compares with a dict
    lookup; this one uses a constant-time comparison and needs no scopes or
    OAuth metadata, which keeps the wire behaviour to a plain 401 on mismatch.
    """

    def __init__(self, token: str):
        super().__init__()
        if not token:
            raise ValueError("StaticBearerTokenVerifier needs a non-empty token")
        self._token = token.encode("utf-8")

    async def verify_token(self, token: str) -> AccessToken | None:
        if hmac.compare_digest(token.encode("utf-8"), self._token):
            return AccessToken(token=token, client_id="poznote-mcp-client", scopes=[])
        return None


def _build_auth_provider(token: str | None) -> StaticBearerTokenVerifier | None:
    return StaticBearerTokenVerifier(token) if token else None


_inbound_auth_token = _load_inbound_auth_token()

# Initialize FastMCP server.
#
# FastMCP 3.x: host/port/stateless_http are no longer constructor options —
# they are passed to mcp.run() in main(), which stays the single source of
# truth for network settings. Inbound auth, on the other hand, is baked into
# the HTTP app at construction time, so it is decided here from the env.
mcp = FastMCP("poznote-mcp", auth=_build_auth_provider(_inbound_auth_token))

# Poznote client (initialized lazily)
_client: PoznoteClient | None = None


def get_client() -> PoznoteClient:
    """Get or create the Poznote API client"""
    global _client
    if _client is None:
        _client = PoznoteClient()
        atexit.register(_client.close)
        logger.info("Connected to Poznote API at %s", _client.base_url)
    return _client


def _get_client_or_error() -> tuple[PoznoteClient | None, str | None]:
    """Return a configured client or a JSON error string.

    The MCP tools are expected to return strings; this helper lets us fail fast
    with a clear configuration message instead of surfacing a generic 401.
    """
    client = get_client()

    missing: list[str] = []
    if not getattr(client, "base_url", None):
        missing.append("POZNOTE_API_URL")
    if not getattr(client, "service_token", None) and not getattr(client, "password", None):
        missing.append("POZNOTE_SERVICE_TOKEN_FILE")

    if missing:
        return None, json.dumps(
            {
                "error": "Missing required configuration for Poznote MCP server.",
                "missing": missing,
                "example": {
                    "POZNOTE_API_URL": "http://localhost:8040/api/v1",
                    "POZNOTE_SERVICE_TOKEN_FILE": "/var/www/html/data/.mcp_token",
                },
                "note": "The shared MCP token file is generated automatically by Poznote and must be mounted into the MCP container.",
            },
            indent=2,
            ensure_ascii=False,
        )

    return client, None


def _api_error_json(exc: Exception) -> str:
    """Convert an HTTP/network exception into a clean JSON error for the AI."""
    if isinstance(exc, httpx.ConnectError):
        return json.dumps(
            {"error": "Cannot connect to Poznote API. Is the server running?", "detail": str(exc)},
            ensure_ascii=False,
        )
    if isinstance(exc, httpx.TimeoutException):
        return json.dumps(
            {"error": "Poznote API request timed out. Try again or increase timeout.", "detail": str(exc)},
            ensure_ascii=False,
        )
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        body = exc.response.text[:500] if exc.response.text else ""
        return json.dumps(
            {"error": f"Poznote API returned HTTP {status}", "detail": body},
            ensure_ascii=False,
        )
    # Generic httpx error
    return json.dumps(
        {"error": f"Poznote API error: {type(exc).__name__}", "detail": str(exc)[:500]},
        ensure_ascii=False,
    )


# =============================================================================
# TOOLS - Actions for searching and modifying notes
# =============================================================================

@mcp.tool()
def get_note(id: int, workspace: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """Get a specific note by its ID with full content

    The result includes a "version" token; pass it as if_version to update_note
    to make the write fail safely if the note changed in between.

    Args:
        id: ID of the note to retrieve
        workspace: Workspace name (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        note = client.get_note(id, workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    
    if note is None:
        return json.dumps({"error": f"Note {id} not found"}, ensure_ascii=False)
    
    # Format for AI consumption
    result = {
        "id": note.get("id"),
        "title": note.get("heading", "Untitled"),
        "content": note.get("content", ""),
        "tags": [t.strip() for t in (note.get("tags") or "").split(",") if t.strip()],
        "folder": note.get("folder"),
        "updatedAt": note.get("updated"),
        "createdAt": note.get("created"),
        "version": note.get("version"),
        "reminderAt": note.get("reminder_at"),
    }

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def list_notes(workspace: Optional[str] = None, limit: int = 50, user_id: Optional[int] = None) -> str:
    """List all notes from a specific workspace
    
    Args:
        workspace: Workspace name (optional)
        limit: Maximum number of results (default: 50)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        notes = client.list_notes(workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    
    # Limit results if specified
    if limit and len(notes) > limit:
        notes = notes[:limit]
    
    # Format for AI consumption
    formatted = []
    for note in notes:
        formatted.append({
            "id": note.get("id"),
            "title": note.get("heading", "Untitled"),
            "tags": note.get("tags", ""),
            "folder": note.get("folder"),
            "updatedAt": note.get("updated"),
            "createdAt": note.get("created"),
        })
    
    result = {
        "count": len(formatted),
        "notes": formatted,
    }
    if workspace is not None:
        result["workspace"] = workspace

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def search_notes(query: str, workspace: Optional[str] = None, limit: int = 10, created_from: Optional[str] = None, created_to: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """Search notes by text query. Returns matching notes with excerpts.
    
    Args:
        query: Search query (text to find in notes)
        workspace: Workspace name (optional)
        limit: Maximum number of results (default: 10)
        created_from: Filter notes created on or after this date (YYYY-MM-DD)
        created_to: Filter notes created on or before this date (YYYY-MM-DD)
        user_id: User profile ID to access (optional, overrides default)
    """
    if not query:
        return json.dumps({"error": "query parameter is required"}, ensure_ascii=False)
    
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        results = client.search_notes(query, limit=limit, workspace=workspace, created_from=created_from, created_to=created_to, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    
    # Format results
    formatted = []
    for r in results:
        formatted.append({
            "id": r.get("id"),
            "title": r.get("heading", "Untitled"),
            "excerpt": r.get("excerpt", r.get("content", "")[:200] + "..."),
            "tags": r.get("tags", ""),
            "folder": r.get("folder"),
            "createdAt": r.get("created"),
            "updatedAt": r.get("updated"),
        })
    
    return json.dumps({
        "query": query,
        "count": len(formatted),
        "results": formatted,
    }, indent=2, ensure_ascii=False)


def _normalize_content(content, note_type=None):
    """Normalize note content into the string the backend API expects.

    Some MCP clients don't handle the ``anyOf`` schema for the ``content``
    field well and wrap a plain string in a single-element array to satisfy
    validation (e.g. ``["# My Note"]``). Task-list notes, on the other hand,
    genuinely carry a JSON array of task objects. We must serialize the real
    task-list array but *unwrap* the accidental string wrapping, otherwise the
    literal ``["..."]`` ends up written into the note body.

    Discriminator:
      * A real task-list array is a list of dicts (task items).
      * An accidentally-wrapped standard/markdown note is a list of strings.
    """
    if not isinstance(content, list):
        return content

    # Genuine task-list content: list of task-item objects. Serialize as-is.
    if note_type == "tasklist" or (content and all(isinstance(el, dict) for el in content)):
        return json.dumps(content, ensure_ascii=False)

    # Non-tasklist content the client wrapped in an array. Unwrap it back to a
    # plain string so the note body doesn't contain literal bracket syntax.
    if all(isinstance(el, str) for el in content):
        return "".join(content)

    # Fallback: serialize whatever we got rather than crash.
    return json.dumps(content, ensure_ascii=False)


def _reminder_result(client, note_id: int, reminder_at, recurrence, message, email_enabled, user_id):
    """Set the note reminder after a create/update, returning a summary dict.

    Errors are reported alongside the note instead of raised, so a successful
    write is never reported as a failure just because the reminder call failed.
    """
    try:
        result = client.set_reminder(
            note_id=note_id,
            reminder_at=reminder_at,
            message=message,
            email_enabled=email_enabled,
            recurrence=recurrence,
            user_id=user_id,
        )
    except Exception as exc:
        return {"error": "Note was saved but the reminder failed", "detail": json.loads(_api_error_json(exc))}

    if not result:
        return {"error": "Note was saved but the reminder could not be set"}

    return {
        "reminder_at": result.get("reminder_at"),
        "recurrence": result.get("recurrence"),
        "email_enabled": result.get("email_enabled"),
    }


@mcp.tool()
def create_note(
    title: str,
    content: Union[str, list],
    workspace: Optional[str] = None,
    tags: Optional[str] = None,
    folder: Optional[str] = None,
    note_type: str = "note",
    user_id: Optional[int] = None,
    reminder_at: Optional[str] = None,
    reminder_recurrence: Optional[str] = None,
    reminder_message: Optional[str] = None,
    reminder_email: Optional[bool] = None,
) -> str:
    """Create a new note in Poznote

    Args:
        title: Title of the new note
        content: Content of the note. Always a plain string (HTML or Markdown).
            For task lists, pass the JSON array serialized as a string.
        workspace: Workspace name (optional)
        tags: Comma-separated tags (e.g., 'ai, docs, important')
        folder: Folder name to place the note in
        note_type: Note type/format. Supported: 'note' (HTML, default), 'markdown', 'tasklist'.
        user_id: User profile ID to access (optional, overrides default)
        reminder_at: Due date/reminder for the note as an ISO datetime
            (e.g. '2026-09-01T09:00:00+02:00'). Sets the same reminder the bell
            icon sets in the UI. Include an offset, or it is read as UTC.
        reminder_recurrence: Repeat interval as '<count><unit>' with unit
            i/h/d/w/m/y (minute/hour/day/week/month/year), e.g. '30i', '1h',
            '1d', '2w', '1y'. Omit for a one-off reminder.
        reminder_message: Notification text (optional, defaults to the note title)
        reminder_email: Whether the reminder also sends an email (optional)
    """
    client, err = _get_client_or_error()
    if err:
        return err

    # Normalize note_type for convenience (allow 'html' as an alias of 'note')
    # If note_type is missing/empty, default to HTML (note).
    if note_type is None or not str(note_type).strip():
        note_type = "note"
    else:
        note_type = str(note_type).strip().lower()
        if note_type == "html":
            note_type = "note"
        if note_type not in {"note", "markdown", "excalidraw", "tasklist"}:
            return json.dumps(
                {
                    "error": "Invalid note_type. Use 'note' (HTML), 'markdown', 'tasklist', or 'excalidraw'.",
                    "note_type": note_type,
                },
                ensure_ascii=False,
            )

    content = _normalize_content(content, note_type)

    try:
        result = client.create_note(
            title=title,
            content=content,
            tags=tags,
            folder_name=folder,
            workspace=workspace,
            note_type=note_type,
            user_id=user_id,
        )
    except Exception as exc:
        return _api_error_json(exc)
    
    if not result:
        return json.dumps({"error": "Failed to create note"}, ensure_ascii=False)

    payload = {
        "success": True,
        "message": f"Note '{title}' created successfully",
        "note": result,
    }

    if reminder_at:
        note_id = result.get("id")
        if note_id is None:
            payload["reminder"] = {"error": "Note was created but its ID is unknown, so no reminder was set"}
        else:
            payload["reminder"] = _reminder_result(
                client, int(note_id), reminder_at, reminder_recurrence,
                reminder_message, reminder_email, user_id,
            )

    return json.dumps(payload, indent=2, ensure_ascii=False)


@mcp.tool()
def update_note(
    id: int,
    workspace: Optional[str] = None,
    content: Optional[Union[str, list]] = None,
    title: Optional[str] = None,
    tags: Optional[str] = None,
    user_id: Optional[int] = None,
    if_version: Optional[str] = None,
    reminder_at: Optional[str] = None,
    reminder_recurrence: Optional[str] = None,
    reminder_message: Optional[str] = None,
    reminder_email: Optional[bool] = None,
) -> str:
    """Update an existing note. Only provided fields will be updated.

    Args:
        id: ID of the note to update
        workspace: Workspace name (optional)
        content: New content for the note. A plain string (HTML or Markdown).
            For task lists, pass the JSON array serialized as a string.
        title: New title for the note
        tags: New tags (comma-separated)
        user_id: User profile ID to access (optional, overrides default)
        if_version: Version token from get_note. When set, the write is rejected
            with a version_conflict result if the note changed since that
            version; the result then includes the current content and version so
            you can merge and retry. Recommended whenever you rewrite content
            you read earlier.
        reminder_at: Due date/reminder for the note as an ISO datetime
            (e.g. '2026-09-01T09:00:00+02:00'), the same reminder the bell icon
            sets in the UI. Include an offset, or it is read as UTC. Pass
            'none' to remove the reminder. Can be set on its own, without
            touching the note's content.
        reminder_recurrence: Repeat interval as '<count><unit>' with unit
            i/h/d/w/m/y (minute/hour/day/week/month/year), e.g. '30i', '1h',
            '1d', '2w', '1y'. Omit for a one-off reminder.
        reminder_message: Notification text (optional, defaults to the note title)
        reminder_email: Whether the reminder also sends an email (optional)
    """
    if content is not None:
        content = _normalize_content(content)
    client, err = _get_client_or_error()
    if err:
        return err

    has_note_fields = any(v is not None for v in (content, title, tags))
    result = None

    if has_note_fields:
        try:
            result = client.update_note(
                note_id=id,
                content=content,
                title=title,
                tags=tags,
                workspace=workspace,
                user_id=user_id,
                if_version=if_version,
            )
        except Exception as exc:
            return _api_error_json(exc)

        if result and result.get("code") == "version_conflict":
            return json.dumps({
                "success": False,
                "error": "version_conflict",
                "message": (
                    f"Note {id} was modified since the version you read. "
                    "Merge your change into the current content below, then retry "
                    "with the new version token."
                ),
                "current": result.get("current"),
            }, indent=2, ensure_ascii=False)

        if not result:
            return json.dumps({"error": f"Note {id} not found or update failed"}, ensure_ascii=False)

    if not has_note_fields and reminder_at is None:
        return json.dumps(
            {"error": "Nothing to update. Provide content, title, tags or reminder_at."},
            ensure_ascii=False,
        )

    payload = {
        "success": True,
        "message": f"Note {id} updated successfully",
    }
    if result:
        payload["note"] = result

    if reminder_at is not None:
        if str(reminder_at).strip().lower() in {"none", ""}:
            try:
                removed = client.remove_reminder(id, user_id=user_id)
            except Exception as exc:
                payload["reminder"] = {"error": "Failed to remove the reminder", "detail": json.loads(_api_error_json(exc))}
            else:
                payload["reminder"] = (
                    {"removed": True} if removed else {"error": f"Note {id} not found or reminder removal failed"}
                )
        else:
            payload["reminder"] = _reminder_result(
                client, id, reminder_at, reminder_recurrence,
                reminder_message, reminder_email, user_id,
            )

    return json.dumps(payload, indent=2, ensure_ascii=False)


@mcp.tool()
def delete_note(id: int, workspace: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """Delete a note by its ID
    
    Args:
        id: ID of the note to delete
        workspace: Workspace name (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_note(id, workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    
    if success:
        return json.dumps({
            "success": True,
            "message": f"Note {id} deleted successfully",
        }, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Note {id} not found or deletion failed"}, ensure_ascii=False)


# =============================================================================
# REMINDERS
# =============================================================================

@mcp.tool()
def get_reminder(note_id: int, user_id: Optional[int] = None) -> str:
    """Get the reminder currently set on a note

    Args:
        note_id: ID of the note
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        reminder = client.get_reminder(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    if reminder is None:
        return json.dumps({"error": f"Note {note_id} not found"}, ensure_ascii=False)

    return json.dumps({
        "note_id": note_id,
        "reminder_at": reminder.get("reminder_at"),
        "recurrence": reminder.get("recurrence"),
        "email_enabled": reminder.get("email_enabled"),
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def set_reminder(
    note_id: int,
    reminder_at: str,
    recurrence: Optional[str] = None,
    message: Optional[str] = None,
    email_enabled: Optional[bool] = None,
    user_id: Optional[int] = None,
) -> str:
    """Set (or replace) the reminder on a note, as the bell icon does in the UI

    Args:
        note_id: ID of the note
        reminder_at: When to fire, as an ISO datetime
            (e.g. '2026-09-01T09:00:00+02:00'). Include an offset, or the time
            is read as UTC.
        recurrence: Repeat interval as '<count><unit>' with unit i/h/d/w/m/y
            (minute/hour/day/week/month/year), e.g. '30i', '1h', '1d', '2w',
            '1y'. Omit for a one-off reminder.
        message: Notification text (optional, defaults to the note title)
        email_enabled: Whether the reminder also sends an email (optional).
            Ignored when SMTP is not configured.
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.set_reminder(
            note_id=note_id,
            reminder_at=reminder_at,
            message=message,
            email_enabled=email_enabled,
            recurrence=recurrence,
            user_id=user_id,
        )
    except Exception as exc:
        return _api_error_json(exc)

    if not result:
        return json.dumps({"error": f"Note {note_id} not found or reminder failed"}, ensure_ascii=False)

    return json.dumps({
        "success": True,
        "message": f"Reminder set on note {note_id}",
        "note_id": note_id,
        "reminder_at": result.get("reminder_at"),
        "recurrence": result.get("recurrence"),
        "email_enabled": result.get("email_enabled"),
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def remove_reminder(note_id: int, user_id: Optional[int] = None) -> str:
    """Remove the reminder from a note

    Args:
        note_id: ID of the note
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.remove_reminder(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    return json.dumps({
        "success": success,
        "message": f"Reminder removed from note {note_id}" if success else f"Note {note_id} not found or removal failed",
    }, ensure_ascii=False)


# =============================================================================
# TASKS - Individual items inside a tasklist note
# =============================================================================

@mcp.tool()
def list_tasks(note_id: int, user_id: Optional[int] = None) -> str:
    """List the tasks of a tasklist note, with their IDs, due dates and flags

    Use this to get a task's ID before calling update_task, complete_task or
    delete_task.

    Args:
        note_id: ID of the tasklist note
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.list_tasks(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    if result is None:
        return json.dumps({"error": f"Note {note_id} not found"}, ensure_ascii=False)

    tasks = result.get("tasks", [])
    return json.dumps({
        "note_id": note_id,
        "title": result.get("heading"),
        "count": len(tasks),
        "tasks": tasks,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def add_task(
    note_id: int,
    text: str,
    due_at: Optional[str] = None,
    reminder: Optional[bool] = None,
    recurrence: Optional[str] = None,
    important: Optional[bool] = None,
    reminder_email: Optional[bool] = None,
    user_id: Optional[int] = None,
) -> str:
    """Add a single task to a tasklist note, without rewriting the whole list

    Args:
        note_id: ID of the tasklist note
        text: Task text
        due_at: Due date as 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:MM' to set a time.
            This is local wall-clock time in the user's configured timezone,
            with no offset. A date without a time reminds at 09:00.
        reminder: Whether the due date raises a notification. Requires due_at.
        recurrence: Repeat interval of the reminder as '<count><unit>' with unit
            i/h/d/w/m/y (minute/hour/day/week/month/year), e.g. '1d', '2w', '1y'.
        important: Mark the task as important (sorts it to the top)
        reminder_email: Whether the reminder also sends an email (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    if not text or not str(text).strip():
        return json.dumps({"error": "text is required"}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        task = client.add_task(
            note_id=note_id,
            text=str(text).strip(),
            due_at=due_at,
            reminder=reminder,
            reminder_email=reminder_email,
            recurrence=recurrence,
            important=important,
            user_id=user_id,
        )
    except Exception as exc:
        return _api_error_json(exc)

    if not task:
        return json.dumps({"error": f"Note {note_id} not found or task creation failed"}, ensure_ascii=False)

    return json.dumps({
        "success": True,
        "message": f"Task added to note {note_id}",
        "note_id": note_id,
        "task": task,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def update_task(
    note_id: int,
    task_id: str,
    text: Optional[str] = None,
    completed: Optional[bool] = None,
    important: Optional[bool] = None,
    due_at: Optional[str] = None,
    reminder: Optional[bool] = None,
    recurrence: Optional[str] = None,
    reminder_email: Optional[bool] = None,
    user_id: Optional[int] = None,
) -> str:
    """Update one task of a tasklist note. Only provided fields change.

    Args:
        note_id: ID of the tasklist note
        task_id: ID of the task (from list_tasks)
        text: New task text
        completed: Whether the task is done. Completing it clears its reminder.
        important: Important flag
        due_at: Due date as 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:MM' to set a time.
            This is local wall-clock time in the user's configured timezone,
            with no offset. A date without a time reminds at 09:00. Pass 'none'
            to clear the due date and its reminder.
        reminder: Whether the due date raises a notification
        recurrence: Repeat interval of the reminder as '<count><unit>' with unit
            i/h/d/w/m/y (minute/hour/day/week/month/year), e.g. '1d', '2w', '1y'.
        reminder_email: Whether the reminder also sends an email (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    fields: dict = {}
    for key, value in (
        ("text", text),
        ("completed", completed),
        ("important", important),
        ("reminder", reminder),
        ("recurrence", recurrence),
        ("reminder_email", reminder_email),
    ):
        if value is not None:
            fields[key] = value

    if due_at is not None:
        # 'none' is how a caller asks to clear the date, since omitting the
        # argument has to mean "leave it alone".
        fields["due_at"] = None if str(due_at).strip().lower() in {"none", ""} else due_at

    if not fields:
        return json.dumps({"error": "Nothing to update. Provide at least one field."}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        task = client.update_task(note_id, str(task_id), fields, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    if not task:
        return json.dumps({"error": f"Task {task_id} not found in note {note_id}"}, ensure_ascii=False)

    return json.dumps({
        "success": True,
        "message": f"Task {task_id} updated",
        "note_id": note_id,
        "task": task,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def complete_task(note_id: int, task_id: str, completed: bool = True, user_id: Optional[int] = None) -> str:
    """Mark a task of a tasklist note as done (or undone)

    Args:
        note_id: ID of the tasklist note
        task_id: ID of the task (from list_tasks)
        completed: True to complete the task (default), False to reopen it
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        task = client.update_task(note_id, str(task_id), {"completed": bool(completed)}, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    if not task:
        return json.dumps({"error": f"Task {task_id} not found in note {note_id}"}, ensure_ascii=False)

    return json.dumps({
        "success": True,
        "message": f"Task {task_id} marked as {'completed' if completed else 'not completed'}",
        "note_id": note_id,
        "task": task,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def delete_task(note_id: int, task_id: str, user_id: Optional[int] = None) -> str:
    """Delete one task from a tasklist note

    Args:
        note_id: ID of the tasklist note
        task_id: ID of the task (from list_tasks)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_task(note_id, str(task_id), user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)

    return json.dumps({
        "success": success,
        "message": f"Task {task_id} deleted" if success else f"Task {task_id} not found in note {note_id}",
    }, ensure_ascii=False)


@mcp.tool()
def create_folder(
    folder_name: str,
    workspace: Optional[str] = None,
    parent_folder_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> str:
    """Create a new folder in Poznote
    
    Args:
        folder_name: Name of the new folder
        workspace: Workspace name (optional)
        parent_folder_id: ID of the parent folder (optional, creates folder at root if not specified)
        user_id: User profile ID to access (optional, overrides default)
    """
    if not folder_name:
        return json.dumps({"error": "folder_name is required"}, ensure_ascii=False)
    
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.create_folder(
            folder_name=folder_name,
            parent_folder_id=parent_folder_id,
            workspace=workspace,
            user_id=user_id,
        )
    except Exception as exc:
        return _api_error_json(exc)
    
    if result:
        return json.dumps({
            "success": True,
            "message": f"Folder '{folder_name}' created successfully",
            "folder": result,
        }, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": "Failed to create folder"}, ensure_ascii=False)


@mcp.tool()
def list_folders(workspace: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """List all folders from a specific workspace
    
    Args:
        workspace: Workspace name (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        folders = client.list_folders(workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    result = {
        "count": len(folders),
        "folders": folders,
    }
    if workspace is not None:
        result["workspace"] = workspace

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def list_workspaces(user_id: Optional[int] = None) -> str:
    """List all available workspaces
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        workspaces = client.list_workspaces(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "count": len(workspaces),
        "workspaces": workspaces,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def list_tags(user_id: Optional[int] = None) -> str:
    """List all unique tags used in notes
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        tags = client.list_tags(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "count": len(tags),
        "tags": tags,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def get_trash(user_id: Optional[int] = None) -> str:
    """List all notes currently in the trash
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        notes = client.get_trash(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "count": len(notes),
        "notes": notes,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def empty_trash(user_id: Optional[int] = None) -> str:
    """Permanently delete all notes in the trash
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.empty_trash(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": "Trash emptied" if success else "Failed to empty trash"}, ensure_ascii=False)


@mcp.tool()
def restore_note(id: int, user_id: Optional[int] = None) -> str:
    """Restore a note from the trash
    
    Args:
        id: ID of the note to restore
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.restore_note(id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": f"Note {id} restored" if success else f"Failed to restore note {id}"}, ensure_ascii=False)


@mcp.tool()
def duplicate_note(id: int, user_id: Optional[int] = None) -> str:
    """Create a duplicate of an existing note
    
    Args:
        id: ID of the note to duplicate
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        note = client.duplicate_note(id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if note:
        return json.dumps({"success": True, "note": note}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"success": False, "error": f"Failed to duplicate note {id}"}, ensure_ascii=False)


@mcp.tool()
def toggle_favorite(id: int, user_id: Optional[int] = None) -> str:
    """Toggle the favorite status of a note
    
    Args:
        id: ID of the note to favor/unfavor
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.toggle_favorite(id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": f"Note {id} favorite status toggled"}, ensure_ascii=False)


@mcp.tool()
def list_attachments(note_id: int, user_id: Optional[int] = None) -> str:
    """List all attachments for a specific note
    
    Args:
        note_id: ID of the note to list attachments for
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        attachments = client.list_attachments(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "note_id": note_id,
        "count": len(attachments),
        "attachments": attachments,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def move_note_to_folder(note_id: int, folder_id: int, user_id: Optional[int] = None) -> str:
    """Move a note to a specific folder
    
    Args:
        note_id: ID of the note to move
        folder_id: ID of the target folder
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.move_note_to_folder(note_id, folder_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": f"Note {note_id} moved to folder {folder_id}" if success else "Failed to move note"}, ensure_ascii=False)


@mcp.tool()
def remove_note_from_folder(note_id: int, user_id: Optional[int] = None) -> str:
    """Remove a note from its current folder (moves it to root)
    
    Args:
        note_id: ID of the note to remove from folder
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.remove_note_from_folder(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": f"Note {note_id} removed from folder" if success else "Failed to remove note from folder"}, ensure_ascii=False)


@mcp.tool()
def share_note(note_id: int, user_id: Optional[int] = None) -> str:
    """Enable public sharing for a note and get the public URL
    
    Args:
        note_id: ID of the note to share
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        share = client.create_note_share(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if share:
        return json.dumps({"success": True, "share": share}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"success": False, "error": "Failed to enable sharing"}, ensure_ascii=False)


@mcp.tool()
def unshare_note(note_id: int, user_id: Optional[int] = None) -> str:
    """Disable public sharing for a note
    
    Args:
        note_id: ID of the note to unshare
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_note_share(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"success": success, "message": "Sharing disabled" if success else "Failed to disable sharing"}, ensure_ascii=False)


@mcp.tool()
def get_note_share_status(note_id: int, user_id: Optional[int] = None) -> str:
    """Get the current sharing status and public URL for a note
    
    Args:
        note_id: ID of the note
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        share = client.get_note_share_status(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if share:
        return json.dumps({"success": True, "share": share}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"success": False, "message": "Note is not shared publicly"}, ensure_ascii=False)


@mcp.tool()
def get_git_sync_status(user_id: Optional[int] = None) -> str:
    """Get the current status of Git synchronization (GitHub, GitLab or Forgejo)
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        status = client.get_git_status(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(status, indent=2, ensure_ascii=False)


@mcp.tool()
def git_push(user_id: Optional[int] = None) -> str:
    """Force push local notes to the configured Git repository
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.git_push(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def git_pull(user_id: Optional[int] = None) -> str:
    """Force pull notes from the configured Git repository
    
    Args:
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.git_pull(user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def get_system_info() -> str:
    """Get version information about the Poznote installation"""
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        info = client.get_system_version()
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(info, indent=2, ensure_ascii=False)


@mcp.tool()
def list_backups() -> str:
    """List all available system backups"""
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        backups = client.list_backups()
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({"count": len(backups), "backups": backups}, indent=2, ensure_ascii=False)


@mcp.tool()
def create_backup() -> str:
    """Trigger the creation of a new system backup"""
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.create_backup()
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def restore_backup(filename: str, user_id: Optional[int] = None) -> str:
    """Restore a backup file. This will replace all current user data.
    
    Args:
        filename: Name of the backup file to restore (e.g., poznote_backup_2026-02-02_15-30-00.zip)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.restore_backup(filename, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def get_app_setting(key: str, user_id: Optional[int] = None) -> str:
    """Get the value of a specific application setting
    
    Args:
        key: The setting key to retrieve
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        setting = client.get_setting(key, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(setting, indent=2, ensure_ascii=False)


@mcp.tool()
def update_app_setting(key: str, value: str, user_id: Optional[int] = None) -> str:
    """Update the value of a specific application setting
    
    Args:
        key: The setting key to update
        value: The new value for the setting
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.update_setting(key, value, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def get_backlinks(note_id: int, user_id: Optional[int] = None) -> str:
    """Get all notes that link to (reference) a specific note
    
    Args:
        note_id: ID of the note to find backlinks for
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        backlinks = client.get_backlinks(note_id, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "note_id": note_id,
        "count": len(backlinks),
        "backlinks": backlinks,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def convert_note(id: int, target: str, user_id: Optional[int] = None) -> str:
    """Convert a note between HTML and Markdown formats
    
    Args:
        id: ID of the note to convert
        target: Target format ('html' or 'markdown')
        user_id: User profile ID to access (optional, overrides default)
    """
    target = target.strip().lower()
    if target not in {"html", "markdown"}:
        return json.dumps({"error": "Invalid target format. Use 'html' or 'markdown'."}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.convert_note(id, target, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if result:
        return json.dumps({"success": True, "message": f"Note {id} converted to {target}", "note": result}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Failed to convert note {id}"}, ensure_ascii=False)


@mcp.tool()
def rename_folder(
    folder_id: int,
    new_name: str,
    workspace: Optional[str] = None,
    user_id: Optional[int] = None,
) -> str:
    """Rename an existing folder
    
    Args:
        folder_id: ID of the folder to rename
        new_name: New name for the folder
        workspace: Workspace name (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    if not new_name:
        return json.dumps({"error": "new_name is required"}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.rename_folder(folder_id, new_name, workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if result:
        return json.dumps({"success": True, "message": f"Folder renamed to '{new_name}'", "folder": result}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Folder {folder_id} not found or rename failed"}, ensure_ascii=False)


@mcp.tool()
def delete_folder(
    folder_id: int,
    workspace: Optional[str] = None,
    user_id: Optional[int] = None,
) -> str:
    """Delete a folder and move its notes to trash
    
    Args:
        folder_id: ID of the folder to delete
        workspace: Workspace name (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_folder(folder_id, workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if success:
        return json.dumps({"success": True, "message": f"Folder {folder_id} deleted"}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Folder {folder_id} not found or deletion failed"}, ensure_ascii=False)


@mcp.tool()
def create_workspace(name: str, user_id: Optional[int] = None) -> str:
    """Create a new workspace
    
    Args:
        name: Name of the new workspace
        user_id: User profile ID to access (optional, overrides default)
    """
    if not name:
        return json.dumps({"error": "name is required"}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.create_workspace(name, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if result:
        return json.dumps({"success": True, "message": f"Workspace '{name}' created", "workspace": result}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": "Failed to create workspace"}, ensure_ascii=False)


@mcp.tool()
def rename_workspace(current_name: str, new_name: str, user_id: Optional[int] = None) -> str:
    """Rename an existing workspace
    
    Args:
        current_name: Current name of the workspace
        new_name: New name for the workspace
        user_id: User profile ID to access (optional, overrides default)
    """
    if not new_name:
        return json.dumps({"error": "new_name is required"}, ensure_ascii=False)

    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.rename_workspace(current_name, new_name, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if result:
        return json.dumps({"success": True, "message": f"Workspace renamed from '{current_name}' to '{new_name}'", "workspace": result}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Failed to rename workspace '{current_name}'"}, ensure_ascii=False)


@mcp.tool()
def delete_workspace(name: str, user_id: Optional[int] = None) -> str:
    """Delete a workspace (cannot delete the last remaining workspace)
    
    Args:
        name: Name of the workspace to delete
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_workspace(name, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    if success:
        return json.dumps({"success": True, "message": f"Workspace '{name}' deleted"}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Failed to delete workspace '{name}'"}, ensure_ascii=False)


@mcp.tool()
def delete_backup(filename: str) -> str:
    """Delete a specific backup file
    
    Args:
        filename: Name of the backup file to delete (e.g., poznote_backup_2026-02-02_15-30-00.zip)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        success = client.delete_backup(filename)
    except Exception as exc:
        return _api_error_json(exc)
    if success:
        return json.dumps({"success": True, "message": f"Backup '{filename}' deleted"}, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Failed to delete backup '{filename}'"}, ensure_ascii=False)


@mcp.tool()
def list_shared(workspace: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """List all publicly shared notes and folders
    
    Args:
        workspace: Workspace name to filter by (optional)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        shared = client.list_shared(workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "shared_notes_count": len(shared.get("shared_notes", [])),
        "shared_folders_count": len(shared.get("shared_folders", [])),
        **shared,
    }, indent=2, ensure_ascii=False)


# =============================================================================
# CLI & MAIN
# =============================================================================

def _log_inbound_auth_status(host: str, token: str | None) -> None:
    """Tell the operator, once at startup, how the endpoint is protected."""
    if token:
        logger.info(
            "Inbound authentication enabled: clients must send "
            "'Authorization: Bearer <%s>'.",
            AUTH_TOKEN_ENV,
        )
        return
    if _is_loopback_host(host):
        logger.info(
            "Inbound authentication disabled; the server only accepts connections "
            "from this machine (%s).",
            host,
        )
        return
    logger.warning(
        "Listening on %s without %s: anyone who can reach this port can read, "
        "edit and delete every note. That is fine inside Docker when the port is "
        "published on 127.0.0.1 (the default docker-compose.yml), or behind a "
        "tunnel/VPN. If the port is reachable from your network, set %s or bind "
        "to 127.0.0.1.",
        host,
        AUTH_TOKEN_ENV,
        AUTH_TOKEN_ENV,
    )


def create_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser"""
    parser = argparse.ArgumentParser(
        prog="poznote-mcp",
        description="Poznote MCP Server - enables AI assistants to read, search and write notes",
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # serve command
    serve_parser = subparsers.add_parser("serve", help="Start the MCP server")
    serve_parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=(
            f"Host to bind to (default: {DEFAULT_HOST}, local machine only). "
            "Use 0.0.0.0 only behind a port mapping, a tunnel or with "
            f"{AUTH_TOKEN_ENV} set."
        ),
    )
    serve_parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to listen on (default: {DEFAULT_PORT})",
    )
    
    return parser


def main():
    """Entry point"""
    parser = create_parser()
    args = parser.parse_args()
    
    # Get actual values from parsed arguments (not pre-parsed config)
    if args.command == "serve":
        host = args.host
        port = args.port
    else:
        # Backward compatibility: no subcommand means use env vars
        host = os.getenv("MCP_HOST", DEFAULT_HOST)
        port = int(os.getenv("MCP_PORT", str(DEFAULT_PORT)))
    
    try:
        logger.info("Starting Poznote MCP Server (HTTP mode on %s:%s)...", host, port)
        _log_inbound_auth_status(host, _inbound_auth_token)
        try:
            _assert_port_available(host, port)
        except OSError:
            sys.exit(1)

        # FastMCP 3.x: "http" is the canonical name of the streamable-http
        # transport; the endpoint path stays /mcp.
        mcp.run(
            transport="http",
            host=host,
            port=port,
            stateless_http=True,
            show_banner=False,
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        if _is_addr_in_use_error(e):
            logger.error(
                "Cannot start MCP server: %s:%s is already in use. "
                "Choose another port (e.g. --port=18042) or stop the process using it. "
                "To check: ss -tulpn | grep -E ':%s\\b'",
                host,
                port,
                port,
            )
            sys.exit(1)
        logger.exception("Server error")
        sys.exit(1)


if __name__ == "__main__":
    main()
