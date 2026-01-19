#!/usr/bin/env python3
"""Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Transport:
    - streamable-http (HTTP) only

Resources:
  - notes: List all notes
  - note/{id}: Get a specific note with content

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
import json
import logging
import os
import socket
import sys
from typing import Optional

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
    # Poznote MCP expects 0.0.0.0:8041 by default (and the CLI exposes --host/--port).
    host=os.getenv("MCP_HOST", "0.0.0.0"),
    port=_env_int("MCP_PORT", 8041),
)

# Poznote client (initialized lazily)
_client: PoznoteClient | None = None


def get_client() -> PoznoteClient:
    """Get or create the Poznote API client"""
    global _client
    if _client is None:
        _client = PoznoteClient()
        logger.info(f"Connected to Poznote API at {_client.base_url}")
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
    note = client.get_note(id, workspace=workspace, user_id=user_id)
    
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
    notes = client.list_notes(workspace=workspace, user_id=user_id)
    
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
    results = client.search_notes(query, limit=limit, workspace=workspace, user_id=user_id)
    
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
    content: str,
    workspace: str = "Poznote",
    tags: Optional[str] = None,
    folder: Optional[str] = None,
    note_type: str = "note",
    user_id: Optional[int] = None,
) -> str:
    """Create a new note in Poznote
    
    Args:
        title: Title of the new note
        content: Content of the note (HTML or Markdown)
        workspace: Workspace name (optional, default: 'Poznote')
        tags: Comma-separated tags (e.g., 'ai, docs, important')
        folder: Folder name to place the note in
        note_type: Note type/format. Supported: 'note' (HTML, default), 'markdown'.
        user_id: User profile ID to access (optional, overrides default)
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
        if note_type not in {"note", "markdown", "excalidraw"}:
            return json.dumps(
                {
                    "error": "Invalid note_type. Use 'note' (HTML), 'markdown', or 'excalidraw'.",
                    "note_type": note_type,
                },
                ensure_ascii=False,
            )

    result = client.create_note(
        title=title,
        content=content,
        tags=tags,
        folder_name=folder,
        workspace=workspace,
        note_type=note_type,
        user_id=user_id,
    )
    
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
    content: Optional[str] = None,
    title: Optional[str] = None,
    tags: Optional[str] = None,
    user_id: Optional[int] = None,
) -> str:
    """Update an existing note. Only provided fields will be updated.
    
    Args:
        id: ID of the note to update
        workspace: Workspace name (optional, uses default workspace if not specified)
        content: New content for the note
        title: New title for the note
        tags: New tags (comma-separated)
        user_id: User profile ID to access (optional, overrides default)
    """
    client, err = _get_client_or_error()
    if err:
        return err
    result = client.update_note(
        note_id=id,
        content=content,
        title=title,
        tags=tags,
        workspace=workspace,
        user_id=user_id,
    )
    
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
    success = client.delete_note(id, workspace=workspace, user_id=user_id)
    
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
    result = client.create_folder(
        folder_name=folder_name,
        parent_folder_id=parent_folder_id,
        workspace=workspace,
        user_id=user_id,
    )
    
    if result:
        return json.dumps({
            "success": True,
            "message": f"Folder '{folder_name}' created successfully",
            "folder": result,
        }, indent=2, ensure_ascii=False)
    else:
        return json.dumps({"error": "Failed to create folder"}, ensure_ascii=False)


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
        default=8041,
        help="Port to listen on (default: 8041)",
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
        port = int(os.getenv("MCP_PORT", "8041"))
    
    try:
        logger.info(f"Starting Poznote MCP Server (HTTP mode on {host}:{port})...")
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
