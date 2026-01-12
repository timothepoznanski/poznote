#!/usr/bin/env python3
"""
Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Supports two transport modes:
  - stdio (default): For local execution, VS Code launches the process
  - sse: HTTP server mode for remote execution (VS Code connects via HTTP)

Resources:
  - notes: List all notes
  - note/{id}: Get a specific note with content

Tools:
  - search_notes: Search notes by text query
  - create_note: Create a new note  
  - update_note: Update an existing note

Usage:
  # stdio mode (default)
  python -m poznote_mcp.server

  # SSE mode (remote server)
  python -m poznote_mcp.server --sse --host 0.0.0.0 --port 3333
"""

import argparse
import asyncio
import json
import logging
import os
import secrets
import sys
from datetime import datetime

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    ResourceTemplate,
    Tool,
    TextContent,
    CallToolResult,
    ReadResourceResult,
    ListResourcesResult,
    ListResourceTemplatesResult,
    ListToolsResult,
)

from .client import PoznoteClient

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if os.getenv("POZNOTE_DEBUG") else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("poznote-mcp")

# Initialize MCP server
server = Server("poznote-mcp")

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
# RESOURCES - Read-only access to notes
# =============================================================================

@server.list_resources()
async def list_resources() -> ListResourcesResult:
    """List available resources (notes list)"""
    return ListResourcesResult(
        resources=[
            Resource(
                uri="poznote://notes",
                name="Notes List",
                description="List of all notes in Poznote",
                mimeType="application/json",
            )
        ]
    )


@server.list_resource_templates()
async def list_resource_templates() -> ListResourceTemplatesResult:
    """List resource templates (single note access)"""
    return ListResourceTemplatesResult(
        resourceTemplates=[
            ResourceTemplate(
                uriTemplate="poznote://note/{id}",
                name="Note by ID",
                description="Get a specific note by its ID",
                mimeType="application/json",
            )
        ]
    )


@server.read_resource()
async def read_resource(uri: str) -> ReadResourceResult:
    """Read a resource by URI"""
    logger.debug(f"Reading resource: {uri}")
    client = get_client()
    
    # Handle notes list
    if uri == "poznote://notes":
        notes = client.list_notes()
        
        # Format for AI consumption
        result = []
        for note in notes:
            result.append({
                "id": note.get("id"),
                "title": note.get("heading", "Untitled"),
                "tags": note.get("tags", ""),
                "folder": note.get("folder"),
                "updatedAt": note.get("updated"),
            })
        
        return ReadResourceResult(
            contents=[
                TextContent(
                    type="text",
                    text=json.dumps(result, indent=2, ensure_ascii=False),
                )
            ]
        )
    
    # Handle single note
    if uri.startswith("poznote://note/"):
        note_id_str = uri.replace("poznote://note/", "")
        try:
            note_id = int(note_id_str)
        except ValueError:
            return ReadResourceResult(
                contents=[
                    TextContent(
                        type="text",
                        text=json.dumps({"error": f"Invalid note ID: {note_id_str}"}),
                    )
                ]
            )
        
        note = client.get_note(note_id)
        
        if note is None:
            return ReadResourceResult(
                contents=[
                    TextContent(
                        type="text",
                        text=json.dumps({"error": f"Note {note_id} not found"}),
                    )
                ]
            )
        
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
        
        return ReadResourceResult(
            contents=[
                TextContent(
                    type="text",
                    text=json.dumps(result, indent=2, ensure_ascii=False),
                )
            ]
        )
    
    # Unknown resource
    return ReadResourceResult(
        contents=[
            TextContent(
                type="text",
                text=json.dumps({"error": f"Unknown resource: {uri}"}),
            )
        ]
    )


# =============================================================================
# TOOLS - Actions for searching and modifying notes
# =============================================================================

@server.list_tools()
async def list_tools() -> ListToolsResult:
    """List available tools"""
    return ListToolsResult(
        tools=[
            Tool(
                name="search_notes",
                description="Search notes by text query. Returns matching notes with excerpts.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (text to find in notes)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default: 10)",
                            "default": 10,
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="create_note",
                description="Create a new note in Poznote",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Title of the new note",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content of the note (HTML or Markdown)",
                        },
                        "tags": {
                            "type": "string",
                            "description": "Comma-separated tags (e.g., 'ai, docs, important')",
                        },
                        "folder": {
                            "type": "string",
                            "description": "Folder name to place the note in",
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["title", "content"],
                },
            ),
            Tool(
                name="update_note",
                description="Update an existing note. Only provided fields will be updated.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "integer",
                            "description": "ID of the note to update",
                        },
                        "content": {
                            "type": "string",
                            "description": "New content for the note",
                        },
                        "title": {
                            "type": "string",
                            "description": "New title for the note",
                        },
                        "tags": {
                            "type": "string",
                            "description": "New tags (comma-separated)",
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["id"],
                },
            ),
        ]
    )


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> CallToolResult:
    """Execute a tool"""
    logger.debug(f"Calling tool: {name} with args: {arguments}")
    client = get_client()
    
    try:
        if name == "search_notes":
            query = arguments.get("query", "")
            limit = arguments.get("limit", 10)
            workspace = arguments.get("workspace")
            
            if not query:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: query is required")]
                )
            
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
            
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "query": query,
                            "count": len(formatted),
                            "results": formatted,
                        }, indent=2, ensure_ascii=False),
                    )
                ]
            )
        
        elif name == "create_note":
            title = arguments.get("title", "New note")
            content = arguments.get("content", "")
            tags = arguments.get("tags")
            folder = arguments.get("folder")
            workspace = arguments.get("workspace")
            
            # DEBUG: Log what we receive from MCP client
            logger.info(f"[SERVER] create_note called with arguments: {arguments}")        
            
            result = client.create_note(
                title=title,
                content=content,
                tags=tags,
                folder_name=folder,
                workspace=workspace,
            )
            
            if result:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps({
                                "success": True,
                                "message": f"Note '{title}' created successfully",
                                "note": result,
                            }, indent=2, ensure_ascii=False),
                        )
                    ]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: Failed to create note")]
                )
        
        elif name == "update_note":
            note_id = arguments.get("id")
            workspace = arguments.get("workspace")
            
            if not note_id:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: id is required")]
                )
            
            result = client.update_note(
                note_id=int(note_id),
                content=arguments.get("content"),
                title=arguments.get("title"),
                tags=arguments.get("tags"),
                workspace=workspace,
            )
            
            if result:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps({
                                "success": True,
                                "message": f"Note {note_id} updated successfully",
                                "note": result,
                            }, indent=2, ensure_ascii=False),
                        )
                    ]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Error: Note {note_id} not found or update failed")]
                )
        
        else:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Error: Unknown tool '{name}'")]
            )
    
    except Exception as e:
        logger.exception(f"Error executing tool {name}")
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error: {str(e)}")]
        )


# =============================================================================
# MAIN
# =============================================================================

async def run_stdio_server():
    """Run the MCP server in stdio mode (local)"""
    logger.info("Starting Poznote MCP Server (stdio mode)...")
    
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


async def run_sse_server(host: str, port: int, token: str | None = None):
    """Run the MCP server in SSE mode (remote HTTP)"""
    from mcp.server.sse import SseServerTransport
    from starlette.applications import Starlette
    from starlette.routing import Route, Mount
    from starlette.responses import JSONResponse
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    import uvicorn

    # Get token from parameter, env, or generate one
    auth_token = token or os.getenv("MCP_AUTH_TOKEN")
    auth_enabled = auth_token is not None
    
    if not auth_enabled:
        # Generate a random token and display it
        auth_token = secrets.token_urlsafe(32)
        logger.warning("="*60)
        logger.warning("⚠️  No MCP_AUTH_TOKEN set - generated temporary token:")
        logger.warning(f"   {auth_token}")
        logger.warning("   Set MCP_AUTH_TOKEN env var for a persistent token")
        logger.warning("="*60)
    
    logger.info(f"Starting Poznote MCP Server (SSE mode) on {host}:{port}...")
    logger.info(f"Authentication: {'enabled' if auth_enabled else 'enabled (auto-generated)'}")
    
    # Create SSE transport
    sse = SseServerTransport("/messages/")
    
    def verify_token(request) -> bool:
        """Verify the Bearer token from Authorization header"""
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            provided_token = auth_header[7:]  # Remove "Bearer " prefix
            return secrets.compare_digest(provided_token, auth_token)
        return False
    
    async def handle_sse(request):
        """Handle SSE connection from client"""
        # Verify authentication
        if not verify_token(request):
            return JSONResponse(
                {"error": "Unauthorized", "message": "Invalid or missing Bearer token"},
                status_code=401
            )
        
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await server.run(
                streams[0],
                streams[1],
                server.create_initialization_options(),
            )
    
    async def handle_messages(request):
        """Handle POST messages from client"""
        # Verify authentication
        if not verify_token(request):
            return JSONResponse(
                {"error": "Unauthorized", "message": "Invalid or missing Bearer token"},
                status_code=401
            )
        
        await sse.handle_post_message(request.scope, request.receive, request._send)
    
    async def health_check(request):
        """Health check endpoint (no auth required)"""
        return JSONResponse({
            "status": "ok",
            "server": "poznote-mcp",
            "version": "1.0.0",
            "mode": "sse",
            "auth": "required"
        })
    
    # Create Starlette app with routes
    app = Starlette(
        debug=os.getenv("POZNOTE_DEBUG", "").lower() in ("1", "true"),
        routes=[
            Route("/health", health_check, methods=["GET"]),
            Route("/sse", handle_sse, methods=["GET"]),
            Mount("/messages/", routes=[
                Route("/", handle_messages, methods=["POST"]),
            ]),
        ],
    )
    
    # Run with uvicorn
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="debug" if os.getenv("POZNOTE_DEBUG") else "info",
    )
    server_instance = uvicorn.Server(config)
    await server_instance.serve()


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Poznote MCP Server - AI assistant integration for notes"
    )
    parser.add_argument(
        "--sse",
        action="store_true",
        help="Run in SSE (HTTP) mode instead of stdio mode"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to in SSE mode (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=3333,
        help="Port to bind to in SSE mode (default: 3333)"
    )
    return parser.parse_args()


def main():
    """Entry point"""
    args = parse_args()
    
    try:
        if args.sse:
            asyncio.run(run_sse_server(args.host, args.port))
        else:
            asyncio.run(run_stdio_server())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.exception("Server error")
        sys.exit(1)


if __name__ == "__main__":
    main()
