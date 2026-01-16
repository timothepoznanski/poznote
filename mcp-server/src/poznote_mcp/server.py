#!/usr/bin/env python3
"""
Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Supports two transport modes:
  - stdio: Local execution or remote SSH execution (default)
  - streamable-http: HTTP transport for corporate environments

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
  poznote-mcp serve --transport=stdio
  poznote-mcp serve --transport=http --port=8041
"""

import argparse
import json
import logging
import os
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

# Parse CLI args early to configure FastMCP with correct host/port
def _get_config():
    """Get configuration from CLI args or environment variables"""
    # Create a simplified parser that matches our actual CLI structure
    parser = argparse.ArgumentParser(add_help=False)
    subparsers = parser.add_subparsers(dest="command")
    serve_parser = subparsers.add_parser("serve", add_help=False)
    serve_parser.add_argument("--transport", choices=["stdio", "http"], default=None)
    serve_parser.add_argument("--host", default=None)
    serve_parser.add_argument("--port", type=int, default=None)
    
    args, _ = parser.parse_known_args()
    
    # Get values from args or environment
    transport = getattr(args, 'transport', None) or os.getenv("MCP_TRANSPORT", "stdio")
    host = getattr(args, 'host', None) or os.getenv("MCP_HOST", "0.0.0.0")
    port = getattr(args, 'port', None) or int(os.getenv("MCP_PORT", "8041"))
    
    return transport, host, port

_transport, _host, _port = _get_config()

# Initialize FastMCP server with stateless HTTP mode for scalability
mcp = FastMCP(
    "poznote-mcp",
    stateless_http=True,
    host=_host,
    port=_port,
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


# =============================================================================
# TOOLS - Actions for searching and modifying notes
# =============================================================================

@mcp.tool()
def get_note(id: int, workspace: Optional[str] = None) -> str:
    """Get a specific note by its ID with full content
    
    Args:
        id: ID of the note to retrieve
        workspace: Workspace name (optional, uses default workspace if not specified)
    """
    client = get_client()
    note = client.get_note(id, workspace=workspace)
    
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
def list_notes(workspace: Optional[str] = None, limit: int = 50) -> str:
    """List all notes from a specific workspace
    
    Args:
        workspace: Workspace name (optional, uses default workspace if not specified)
        limit: Maximum number of results (default: 50)
    """
    client = get_client()
    notes = client.list_notes(workspace=workspace)
    
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
def search_notes(query: str, workspace: Optional[str] = None, limit: int = 10) -> str:
    """Search notes by text query. Returns matching notes with excerpts.
    
    Args:
        query: Search query (text to find in notes)
        workspace: Workspace name (optional, uses default workspace if not specified)
        limit: Maximum number of results (default: 10)
    """
    if not query:
        return json.dumps({"error": "query parameter is required"}, ensure_ascii=False)
    
    client = get_client()
    results = client.search_notes(query, limit=limit, workspace=workspace)
    
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
    workspace: Optional[str] = None,
    tags: Optional[str] = None,
    folder: Optional[str] = None,
    note_type: Optional[str] = None,
) -> str:
    """Create a new note in Poznote
    
    Args:
        title: Title of the new note
        content: Content of the note (HTML or Markdown)
        workspace: Workspace name (optional, uses default workspace if not specified)
        tags: Comma-separated tags (e.g., 'ai, docs, important')
        folder: Folder name to place the note in
        note_type: Note type/format. Supported: 'note' (HTML, default), 'markdown'.
    """
    client = get_client()

    # Normalize note_type for convenience (allow 'html' as an alias of 'note')
    if note_type is not None:
        note_type = note_type.strip().lower()
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
) -> str:
    """Update an existing note. Only provided fields will be updated.
    
    Args:
        id: ID of the note to update
        workspace: Workspace name (optional, uses default workspace if not specified)
        content: New content for the note
        title: New title for the note
        tags: New tags (comma-separated)
    """
    client = get_client()
    result = client.update_note(
        note_id=id,
        content=content,
        title=title,
        tags=tags,
        workspace=workspace,
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
def delete_note(id: int, workspace: Optional[str] = None) -> str:
    """Delete a note by its ID
    
    Args:
        id: ID of the note to delete
        workspace: Workspace name (optional, uses default workspace if not specified)
    """
    client = get_client()
    success = client.delete_note(id, workspace=workspace)
    
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
) -> str:
    """Create a new folder in Poznote
    
    Args:
        folder_name: Name of the new folder
        workspace: Workspace name (optional, uses default workspace if not specified)
        parent_folder_id: ID of the parent folder (optional, creates folder at root if not specified)
    """
    if not folder_name:
        return json.dumps({"error": "folder_name is required"}, ensure_ascii=False)
    
    client = get_client()
    result = client.create_folder(
        folder_name=folder_name,
        parent_folder_id=parent_folder_id,
        workspace=workspace,
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
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="Transport mode: stdio (default) or http",
    )
    serve_parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to for HTTP mode (default: 0.0.0.0)",
    )
    serve_parser.add_argument(
        "--port",
        type=int,
        default=8041,
        help="Port to listen on for HTTP mode (default: 8041)",
    )
    
    return parser


def main():
    """Entry point"""
    parser = create_parser()
    args = parser.parse_args()
    
    # Get actual values from parsed arguments (not pre-parsed config)
    if args.command == "serve":
        transport = args.transport
        host = args.host
        port = args.port
    else:
        # Backward compatibility: no subcommand means use env vars
        transport = os.getenv("MCP_TRANSPORT", "stdio")
        host = os.getenv("MCP_HOST", "0.0.0.0")
        port = int(os.getenv("MCP_PORT", "8041"))
    
    try:
        if transport == "http":
            logger.info(f"Starting Poznote MCP Server (HTTP mode on {host}:{port})...")
            mcp.run(transport="streamable-http")
        else:
            logger.info("Starting Poznote MCP Server (stdio mode)...")
            mcp.run(transport="stdio")
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.exception("Server error")
        sys.exit(1)


if __name__ == "__main__":
    main()
