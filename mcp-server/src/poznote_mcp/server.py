#!/usr/bin/env python3
"""
Poznote MCP Server

Minimal MCP server enabling AI assistants to read, search and write notes.

Runs in stdio mode for local execution or remote SSH execution.

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
  python -m poznote_mcp.server
"""

import asyncio
import json
import logging
import os
import sys

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
                name="get_note",
                description="Get a specific note by its ID with full content",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "integer",
                            "description": "ID of the note to retrieve",
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["id"],
                },
            ),
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
            Tool(
                name="delete_note",
                description="Delete a note by its ID",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "integer",
                            "description": "ID of the note to delete",
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["id"],
                },
            ),
            Tool(
                name="list_notes",
                description="List all notes from a specific workspace",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default: 50)",
                            "default": 50,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="create_folder",
                description="Create a new folder in Poznote",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "folder_name": {
                            "type": "string",
                            "description": "Name of the new folder",
                        },
                        "parent_folder_id": {
                            "type": "integer",
                            "description": "ID of the parent folder (optional, creates folder at root if not specified)",
                        },
                        "workspace": {
                            "type": "string",
                            "description": "Workspace name (optional, uses default workspace if not specified)",
                        },
                    },
                    "required": ["folder_name"],
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
        if name == "get_note":
            note_id = arguments.get("id")
            workspace = arguments.get("workspace")
            
            if not note_id:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: id is required")]
                )
            
            note = client.get_note(int(note_id), workspace=workspace)
            
            if note is None:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Error: Note {note_id} not found")]
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
            
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result, indent=2, ensure_ascii=False),
                    )
                ]
            )
        
        elif name == "search_notes":
            query = arguments.get("query", "")
            limit = arguments.get("limit", 10)
            workspace = arguments.get("workspace")
            
            if not query:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: query parameter is required")]
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
        
        elif name == "delete_note":
            note_id = arguments.get("id")
            workspace = arguments.get("workspace")
            
            if not note_id:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: id is required")]
                )
            
            success = client.delete_note(int(note_id), workspace=workspace)
            
            if success:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps({
                                "success": True,
                                "message": f"Note {note_id} deleted successfully",
                            }, indent=2, ensure_ascii=False),
                        )
                    ]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Error: Note {note_id} not found or deletion failed")]
                )
        
        elif name == "list_notes":
            workspace = arguments.get("workspace")
            limit = arguments.get("limit", 50)
            
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
            
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "workspace": workspace or client.default_workspace,
                            "count": len(formatted),
                            "notes": formatted,
                        }, indent=2, ensure_ascii=False),
                    )
                ]
            )
        
        elif name == "create_folder":
            folder_name = arguments.get("folder_name")
            parent_folder_id = arguments.get("parent_folder_id")
            workspace = arguments.get("workspace")
            
            if not folder_name:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: folder_name is required")]
                )
            
            result = client.create_folder(
                folder_name=folder_name,
                parent_folder_id=parent_folder_id,
                workspace=workspace,
            )
            
            if result:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps({
                                "success": True,
                                "message": f"Folder '{folder_name}' created successfully",
                                "folder": result,
                            }, indent=2, ensure_ascii=False),
                        )
                    ]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Error: Failed to create folder")]
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

async def main_async():
    """Run the MCP server in stdio mode"""
    logger.info("Starting Poznote MCP Server (stdio mode)...")
    
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main():
    """Entry point"""
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.exception("Server error")
        sys.exit(1)


if __name__ == "__main__":
    main()
