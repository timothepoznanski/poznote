#!/usr/bin/env python3
"""Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Transport:
    - streamable-http (HTTP) only

Tools:
  - get_note: Get a specific note by its ID with full content
  - search_notes: Search notes by text query
  - create_note: Create a new note
  - update_note: Update an existing note
  - delete_note: Delete a note by its ID
  - list_notes: List all notes from a specific workspace
  - create_folder: Create a new folder in Poznote

Usage:
    poznote-mcp serve --host=0.0.0.0 --port=YOUR_POZNOTE_MCP_PORT
"""

import argparse
import atexit
import json
import logging
import os
import socket
import sys
from typing import Optional, Union

import httpx
from mcp.server.fastmcp import FastMCP

from .client import PoznoteClient

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if os.getenv("POZNOTE_DEBUG") else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("poznote-mcp")


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

# Initialize FastMCP server.
#
# NOTE: We don't pre-parse CLI args at import time.
# We keep a single source of truth for host/port in main(), while keeping tool
# decorators simple.
def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


mcp = FastMCP(
    "poznote-mcp",
    stateless_http=True,
    # FastMCP defaults to 127.0.0.1:8000 for HTTP-based transports.
    # Poznote MCP expects 0.0.0.0:8045 by default (and the CLI exposes --host/--port).
    host=os.getenv("MCP_HOST", "0.0.0.0"),
    port=_env_int("MCP_PORT", 8045),
)

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
    if not getattr(client, "username", None):
        missing.append("POZNOTE_USERNAME")
    if not getattr(client, "password", None):
        missing.append("POZNOTE_PASSWORD")

    if missing:
        return None, json.dumps(
            {
                "error": "Missing required environment variables for Poznote MCP server.",
                "missing": missing,
                "example": {
                    "POZNOTE_API_URL": "http://localhost:8040/api/v1",
                    "POZNOTE_USERNAME": "admin",
                    "POZNOTE_PASSWORD": "your-password",
                },
                "note": "These are the same credentials as the Poznote web login.",
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
    
    Args:
        id: ID of the note to retrieve
        workspace: Workspace name (optional, uses default workspace if not specified)
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
    }
    
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
def list_notes(workspace: Optional[str] = None, limit: int = 50, user_id: Optional[int] = None) -> str:
    """List all notes from a specific workspace
    
    Args:
        workspace: Workspace name (optional, uses default workspace if not specified)
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
    
    return json.dumps({
        "workspace": workspace or client.default_workspace,
        "count": len(formatted),
        "notes": formatted,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def search_notes(query: str, workspace: Optional[str] = None, limit: int = 10, user_id: Optional[int] = None) -> str:
    """Search notes by text query. Returns matching notes with excerpts.
    
    Args:
        query: Search query (text to find in notes)
        workspace: Workspace name (optional, uses default workspace if not specified)
        limit: Maximum number of results (default: 10)
        user_id: User profile ID to access (optional, overrides default)
    """
    if not query:
        return json.dumps({"error": "query parameter is required"}, ensure_ascii=False)
    
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        results = client.search_notes(query, limit=limit, workspace=workspace, user_id=user_id)
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
        })
    
    return json.dumps({
        "query": query,
        "count": len(formatted),
        "results": formatted,
    }, indent=2, ensure_ascii=False)


@mcp.tool()
def create_note(
    title: str,
    content: Union[str, list],
    workspace: str = "Poznote",
    tags: Optional[str] = None,
    folder: Optional[str] = None,
    note_type: str = "note",
    user_id: Optional[int] = None,
) -> str:
    """Create a new note in Poznote
    
    Args:
        title: Title of the new note
        content: Content of the note (HTML, Markdown, or JSON array for task lists)
        workspace: Workspace name (optional, default: 'Poznote')
        tags: Comma-separated tags (e.g., 'ai, docs, important')
        folder: Folder name to place the note in
        note_type: Note type/format. Supported: 'note' (HTML, default), 'markdown', 'tasklist'.
        user_id: User profile ID to access (optional, overrides default)
    """
    # Task list notes use a JSON array as content; if the MCP framework
    # parsed it into a Python list, convert it back to a JSON string.
    if isinstance(content, list):
        content = json.dumps(content, ensure_ascii=False)
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
    
    if result:
        return json.dumps({
            "success": True,
            "message": f"Note '{title}' created successfully",
            "note": result,
        }, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": "Failed to create note"}, ensure_ascii=False)


@mcp.tool()
def update_note(
    id: int,
    workspace: Optional[str] = None,
    content: Optional[Union[str, list]] = None,
    title: Optional[str] = None,
    tags: Optional[str] = None,
    user_id: Optional[int] = None,
) -> str:
    """Update an existing note. Only provided fields will be updated.
    
    Args:
        id: ID of the note to update
        workspace: Workspace name (optional, uses default workspace if not specified)
        content: New content for the note (string, or JSON array for task lists)
        title: New title for the note
        tags: New tags (comma-separated)
        user_id: User profile ID to access (optional, overrides default)
    """
    # Task list notes use a JSON array as content; if the MCP framework
    # parsed it into a Python list, convert it back to a JSON string.
    if isinstance(content, list):
        content = json.dumps(content, ensure_ascii=False)
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        result = client.update_note(
            note_id=id,
            content=content,
            title=title,
            tags=tags,
            workspace=workspace,
            user_id=user_id,
        )
    except Exception as exc:
        return _api_error_json(exc)
    
    if result:
        return json.dumps({
            "success": True,
            "message": f"Note {id} updated successfully",
            "note": result,
        }, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": f"Note {id} not found or update failed"}, ensure_ascii=False)


@mcp.tool()
def delete_note(id: int, workspace: Optional[str] = None, user_id: Optional[int] = None) -> str:
    """Delete a note by its ID
    
    Args:
        id: ID of the note to delete
        workspace: Workspace name (optional, uses default workspace if not specified)
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
        workspace: Workspace name (optional, uses default workspace if not specified)
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
        workspace: Workspace name (optional, uses default workspace if not specified)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    try:
        folders = client.list_folders(workspace=workspace, user_id=user_id)
    except Exception as exc:
        return _api_error_json(exc)
    return json.dumps({
        "workspace": workspace or client.default_workspace,
        "count": len(folders),
        "folders": folders,
    }, indent=2, ensure_ascii=False)


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
    """Get the current status of Git synchronization (GitHub or Forgejo)
    
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
        workspace: Workspace name (optional, uses default workspace if not specified)
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
        workspace: Workspace name (optional, uses default workspace if not specified)
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
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)",
    )
    serve_parser.add_argument(
        "--port",
        type=int,
        default=8045,
        help="Port to listen on (default: 8045)",
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
        host = os.getenv("MCP_HOST", "0.0.0.0")
        port = int(os.getenv("MCP_PORT", "8045"))
    
    try:
        logger.info("Starting Poznote MCP Server (HTTP mode on %s:%s)...", host, port)
        try:
            _assert_port_available(host, port)
        except OSError:
            sys.exit(1)

        # Ensure FastMCP is configured with the host/port that the user passed.
        # FastMCP binds using mcp.settings.host / mcp.settings.port.
        mcp.settings.host = host
        mcp.settings.port = port
        mcp.run(transport="streamable-http")
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
