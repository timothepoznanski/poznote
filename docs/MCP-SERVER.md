# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP `streamable-http`).

## Quick Start

Choose your preferred AI assistant:

- **[VS Code Copilot](VSCODE-COPILOT.md):** Integrate Poznote into your editor
- **[Claude CLI](CLAUDE-CLI.md):** Use Poznote from the command line

---

## How It Works

The MCP server acts as a bridge between AI assistants and your Poznote instance.

### Components

- **`server.py`** — MCP server (HTTP / streamable-http)
  - Exposes MCP endpoint at `http://localhost:8045/mcp`
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and the Poznote API

- **`client.py`** — HTTP client for Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE)
  - Handles Basic Auth

### Communication flow

1. AI assistant (VS Code Copilot or Claude CLI) connects to the MCP Server
2. MCP server calls Poznote REST API
3. Results are returned to the AI assistant

## Features

### Tools (actions)
- `get_note` — Get a specific note by ID with full content
- `list_notes` — List all notes from a workspace
- `search_notes` — Search notes by text query
- `create_note` — Create a new note (⚠️ si aucun workspace n'est précisé dans le prompt, la note est créée dans le workspace par défaut de l'utilisateur ; spécifiez toujours le workspace cible)
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
- `list_shared` — List all publicly shared notes and folders
- `get_backlinks` — Get all notes that link to (reference) a specific note
- `convert_note` — Convert a note between HTML and Markdown formats
- `rename_folder` — Rename an existing folder
- `delete_folder` — Delete a folder and move its notes to trash
- `create_workspace` — Create a new workspace
- `rename_workspace` — Rename an existing workspace
- `delete_workspace` — Delete a workspace (cannot delete the last one)
- `get_git_sync_status` — Get the current status of Git synchronization (GitHub/Forgejo)
- `git_push` — Force push local notes to the configured Git repository
- `git_pull` — Force pull notes from the configured Git repository
- `get_system_info` — Get version information about the Poznote installation
- `list_backups` — List all available system backups
- `create_backup` — Trigger the creation of a new system backup
- `restore_backup` — Restore a backup file (replaces current user data)
- `delete_backup` — Delete a specific backup file
- `get_app_setting` — Get the value of a specific application setting
- `update_app_setting` — Update the value of a specific application setting

Most tools accept an optional `user_id` argument to target a specific user profile. When provided, the MCP server sends the `X-User-ID` header for that request, allowing you to create or read notes across different profiles without changing the global MCP environment. The exceptions are the system-level tools `get_system_info`, `list_backups`, and `create_backup`, which do not take `user_id`.

---

## Server Installation

The MCP server is included in the official Poznote `docker-compose.yml` and runs automatically.

### Configuration

The MCP server uses these variables from your `.env`:

```bash
# MCP Server port (default: 8045)
POZNOTE_MCP_PORT=8045

# Enable debug logging (`true` or `false` only)
POZNOTE_DEBUG=false
```

Changes to `.env` variables take effect after recreating the MCP container:

```bash
docker compose up -d --force-recreate mcp-server
```

A simple `docker compose restart mcp-server` does not reload updated `.env` values.

#### Debug mode

Set `POZNOTE_DEBUG=true` in your `.env` to switch the log level from `INFO` to `DEBUG`. Set it back to `false` for normal use. Only the exact lowercase values `true` and `false` are recognized. Any other value is treated as `false` and a warning is written to the MCP logs. Every HTTP request sent to the Poznote API, every tool call received from the AI assistant, and every response are written in detail to the container logs. Use it to diagnose connection or authentication issues:

```bash
docker logs -f poznote-mcp
```

Leave it disabled in normal use — the extra verbosity is not needed day-to-day.

### Start the Server

```bash
docker-compose up -d
```

### Verify Installation

```bash
# Check container is running
docker ps | grep mcp-server

# Test the endpoint
curl http://localhost:8045/mcp
```

To disable the MCP server, comment out the `mcp-server` service in `docker-compose.yml`.

---

## Client Setup

Configure your AI assistant to connect to the MCP server:

### **VS Code Copilot**
Complete setup guide: **[VSCODE-COPILOT.md](VSCODE-COPILOT.md)**

### **Claude CLI**
Complete setup guide: **[CLAUDE-CLI.md](CLAUDE-CLI.md)**

---

## Security

The MCP server starts automatically with Poznote and listens on **localhost only**, it is not reachable from the outside. This is the correct, secure default: only your local machine (or an SSH tunnel you set up yourself) can reach it. All MCP configuration is done through `.env` variables.

### Why localhost-only is both normal and secure

By default, the MCP server listens **only on `127.0.0.1`** (your local machine), never on a public interface:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

This is intentional and the correct setup. The MCP server does not implement its own authentication for incoming connections, any client that can reach the endpoint can read, create, modify, and delete notes. Binding to localhost guarantees that only processes running on the same machine (or SSH tunnels you explicitly set up) can connect. There is nothing to worry about with the default configuration: the server is not reachable from the outside.

### Remote access

If Poznote runs on a remote server and you want to connect from your workstation, use SSH port forwarding — do **not** expose the port publicly:

```bash
ssh -L 8045:localhost:8045 user@your-server
```

Then point your AI assistant to `http://localhost:8045/mcp` as usual.

### Production environments

If you must route the MCP server through a network, protect it with:
- A reverse proxy with authentication (nginx, Caddy)
- A VPN (Tailscale, WireGuard)

### How the MCP server authenticates to Poznote

The MCP server connects to the Poznote REST API using `POZNOTE_PASSWORD`. Your Poznote instance is always protected regardless of who calls the MCP endpoint.

---

## Usage Examples

Once configured, interact with Poznote using natural language:

```
List all notes in workspace 'Poznote'
Search for notes about 'MCP'
Create a note titled 'Meeting Notes' about the discussion
Update note 123 with new content
Move note 456 to folder 'Projects'
```

For detailed usage examples and troubleshooting:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.md#usage-examples)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.md#usage-examples)

---

## Support & Resources

- **[VS Code Copilot Setup →](VSCODE-COPILOT.md)**
- **[Claude CLI Setup →](CLAUDE-CLI.md)**

For issues:
- Check MCP server logs: `docker logs poznote-mcp`
- Verify Poznote API is accessible
- See client-specific troubleshooting guides
