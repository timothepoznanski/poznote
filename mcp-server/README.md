# Poznote MCP Server

Minimal MCP (Model Context Protocol) server for Poznote.

Allows an AI to **read**, **search** and **write** notes.

## Features

### Resources (read-only)
- `poznote://notes` - List of available notes
- `poznote://note/{id}` - Content of a specific note

### Tools (actions)
- `search_notes` - Text search in notes
- `create_note` - Create a new note
- `update_note` - Update an existing note

## Installation

```bash
cd mcp-server
pip install -e .
```

## Configuration

Environment variables:

```env
# Poznote API base URL
POZNOTE_API_URL=http://localhost/api/v1

# HTTP Basic authentication credentials
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=your-password

# Default workspace (optional)
POZNOTE_DEFAULT_WORKSPACE=Poznote

# Debug mode (optional)
POZNOTE_DEBUG=1
```

## Usage

### Starting the server

```bash
poznote-mcp
# or
python -m poznote_mcp.server
```

### VS Code Configuration (GitHub Copilot)

Add to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "poznote": {
        "command": "python",
        "args": ["-m", "poznote_mcp.server"],
        "env": {
          "POZNOTE_API_URL": "http://localhost/api/v1",
          "POZNOTE_USERNAME": "admin",
          "POZNOTE_PASSWORD": "your-password"
        }
      }
    }
  }
}
```

## Example Prompts

Once configured, you can ask your AI:

- "List all my notes"
- "Read the note about Docker"
- "Search for notes about Docker"
- "Create a new note about Git installation"
- "Update note 1042 with this new content..."
- "Read all notes related to Docker, then update the documentation by fixing inconsistencies"

## Permissions

| Resource/Tool    | Permission |
|------------------|------------|
| `notes`          | read       |
| `note/{id}`      | read       |
| `search_notes`   | read       |
| `update_note`    | write      |
| `create_note`    | write      |

## 🐛 Debug

To see MCP server logs:

```bash
POZNOTE_DEBUG=1 poznote-mcp
```
