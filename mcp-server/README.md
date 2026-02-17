# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP *streamable-http*).

> **Note:** This MCP server is intended to be used with VS Code Copilot MCP. For advanced options, see the official VS Code MCP documentation: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
>
> **Legacy Documentation:** For alternative installation methods, manual setup, and development instructions, see [README-old-method.md](README-old-method.md).

## How It Works

The MCP server is a bridge between VS Code Copilot and your Poznote instance.

### Components

- **`server.py`** — MCP server (HTTP / streamable-http)
  - Exposes MCP endpoint at `http://localhost:8045/mcp`
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and the Poznote API

- **`client.py`** — HTTP client for Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE)
  - Handles Basic Auth

### Communication flow

1. VS Code Copilot connects to the MCP Server
2. MCP server calls Poznote REST API
3. Results are returned to the AI assistant

## Features

### Resources (read-only)
- `poznote://notes` : List of available notes
- `poznote://note/{id}` : Content of a specific note

### Tools (actions)
- `get_note` — Get a specific note by ID with full content
- `list_notes` — List all notes from a workspace
- `search_notes` — Search notes by text query
- `create_note` — Create a new note
- `update_note` — Update an existing note
- `delete_note` — Delete a note by ID
- `create_folder` — Create a new folder
- `list_folders` — List all folders from a workspace
- `list_workspaces` — List all available workspaces
- `list_tags` — List all unique tags used in notes
- `get_trash` — List all notes currently in the trash
- `empty_trash` — Permanently delete all notes in the trash
- `restore_note` — Restore a note from the trash
- `duplicate_note` — Create a duplicate of an existing note
- `toggle_favorite` — Toggle the favorite status of a note
- `list_attachments` — List all attachments for a specific note
- `move_note_to_folder` — Move a note to a specific folder
- `remove_note_from_folder` — Remove a note from its current folder (moves it to root)
- `share_note` — Enable public sharing for a note and get the public URL
- `unshare_note` — Disable public sharing for a note
- `get_note_share_status` — Get the current sharing status and public URL for a note
- `get_git_sync_status` — Get the current status of Git synchronization (GitHub/Forgejo)
- `git_push` — Force push local notes to the configured Git repository
- `git_pull` — Force pull notes from the configured Git repository
- `get_github_sync_status` — (Legacy) Get the current status of GitHub synchronization
- `github_push` — (Legacy) Force push local notes to GitHub
- `github_pull` — (Legacy) Force pull notes from GitHub
- `get_system_info` — Get version information about the Poznote installation
- `list_backups` — List all available system backups
- `create_backup` — Trigger the creation of a new system backup
- `restore_backup` — Restore a backup file (replaces current user data)
- `get_app_setting` — Get the value of a specific application setting

Most tools accept an optional `user_id` argument to target a specific user profile. When provided, the MCP server sends the `X-User-ID` header for that request, allowing you to create or read notes across different profiles without changing the global MCP environment. The exceptions are the system-level tools `get_system_info`, `list_backups`, and `create_backup`, which do not take `user_id`.

---

## Installation & Setup

The MCP server is integrated into the official Poznote `docker-compose.yml`.

### Configuration

```bash
# MCP Server port (default: 8045)
POZNOTE_MCP_PORT=8045

# Poznote username for MCP authentication
POZNOTE_MCP_USERNAME=admin

# User ID for MCP operations (1 = admin)
POZNOTE_MCP_USER_ID=1

# Default workspace
POZNOTE_MCP_WORKSPACE=Poznote

# Enable debug logging (optional)
POZNOTE_MCP_DEBUG=false
```

To disable the MCP server, comment out the `mcp-server` service in `docker-compose.yml` and remove the existing container.

### VS Code Configuration

Add to your `mcp.json`:

**Local installation:**
```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

**Remote server (via SSH tunnel):**
```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

Then establish the SSH tunnel:
```bash
ssh -L 8045:localhost:8045 user@your-server
```

`mcp.json` location:
- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

---

## Security Considerations

⚠️ **Important:** The MCP server does **not implement authentication** for incoming requests, so do not leave it exposed on a public network. It is safe when you keep it secured (localhost binding, SSH tunnel, or authenticated reverse proxy), which is the default installation behavior.

### Recommended Security Setup

**For local development only:**

The default `docker-compose.yml` configuration binds the MCP server to `127.0.0.1` (localhost only):

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

This ensures the MCP server is only accessible from the host machine.

**For remote access from VS Code:**

Use SSH port forwarding to securely connect:

```bash
ssh -L 8045:localhost:8045 user@your-server
```

Then configure `mcp.json` to use localhost:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

**For production environments:**

If you need to expose the MCP server over a network, add a reverse proxy with authentication:
Or use a VPN solution (Tailscale, WireGuard, etc.) to restrict access.

### Authentication Flow

While the MCP server itself has no authentication, it authenticates to the Poznote API using Basic Auth credentials configured via environment variables (`POZNOTE_USERNAME` and `POZNOTE_PASSWORD`). This protects the Poznote instance but not the MCP endpoint itself.

---

## Example Prompts

Once configured in VS Code, you can interact with Poznote using natural language:

- "List all notes in workspace 'Poznote' of my Poznote instance"
- "Search for notes about 'MCP'"
- "Create a markdown note titled 'Birds' about birds"
- "Update note 100041 with new content"
- "Create a folder 'Test' in workspace 'Workspace1'"
