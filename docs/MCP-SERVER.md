# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP Streamable HTTP).

> [!TIP]
> Looking for a chat with a local model (e.g. Ollama) directly inside Poznote? You don't need the MCP server for that — use the built-in [AI Assistant](AI-ASSISTANT.md) instead (**Settings → Admin Tools → AI Assistant**). The MCP server is for connecting *external* MCP-capable assistants to your notes; Ollama alone is a model runtime, not an MCP client, and cannot connect to it directly.

## Quick Start

Choose your preferred AI assistant:

- **[VS Code Copilot](VSCODE-COPILOT.md):** Integrate Poznote into your editor
- **[Claude CLI](CLAUDE-CLI.md):** Use Poznote from the command line

---

## How It Works

The MCP server acts as a bridge between AI assistants and your Poznote instance.

### Components

- **`server.py`** — MCP server (HTTP / Streamable HTTP)
  - Exposes MCP endpoint at `http://127.0.0.1:8045/mcp`
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and the Poznote API

- **`client.py`** — HTTP client for Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE)
  - Handles Poznote API authentication with the shared MCP service token

### Communication flow

1. AI assistant (VS Code Copilot or Claude CLI) connects to the MCP Server
2. MCP server calls Poznote REST API
3. Results are returned to the AI assistant

## Features

### Tools (actions)
- `get_note` — Get a specific note by ID with full content
- `list_notes` — List all notes from a workspace
- `search_notes` — Search notes by text query, with optional creation date range
- `create_note` — Create a new note, optionally with a due date/reminder (⚠️ if no workspace is specified in the prompt, the note is created in the user's default workspace; always specify the target workspace)
- `update_note` — Update an existing note, and/or set its due date/reminder
- `delete_note` — Delete a note by ID
- `get_reminder` — Get the reminder currently set on a note
- `set_reminder` — Set or replace a note's reminder, with an optional repeat interval
- `remove_reminder` — Remove the reminder from a note
- `list_tasks` — List the tasks of a tasklist note, with their IDs, due dates and flags
- `add_task` — Add a single task to a tasklist note, with an optional due date and reminder
- `update_task` — Update one task (text, due date, reminder, important flag)
- `complete_task` — Mark a task as done, or reopen it
- `delete_task` — Delete one task from a tasklist note
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
- `get_git_sync_status` — Get the current status of Git synchronization (GitHub/GitLab/Forgejo)
- `git_push` — Force push local notes to the configured Git repository
- `git_pull` — Force pull notes from the configured Git repository
- `get_system_info` — Get version information about the Poznote installation
- `list_backups` — List all available system backups
- `create_backup` — Trigger the creation of a new system backup
- `restore_backup` — Restore a backup file (replaces current user data)
- `delete_backup` — Delete a specific backup file
- `get_app_setting` — Get the value of a specific application setting
- `update_app_setting` — Update the value of a specific application setting

**Reminders and tasks.** `reminder_at` (on `create_note`/`update_note` and `set_reminder`) is an ISO datetime such as `2026-09-01T09:00:00+02:00`; include an offset, or the time is read as UTC. Task due dates (`due_at`) are different: they are local wall-clock values, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` with no offset, resolved through the user's configured timezone, and a date without a time reminds at 09:00. Repeat intervals use `<count><unit>` with unit `i`/`h`/`d`/`w`/`m`/`y`, for example `30i`, `1d` or `2w`.

The task tools operate on one task at a time, so there is no need to read and rewrite a tasklist's whole content array: call `list_tasks` to get task IDs, then `add_task`, `update_task`, `complete_task` or `delete_task`. Notifications stay in sync automatically, and completing or deleting a task retires its pending reminder.

Most tools accept an optional `user_id` argument to target a specific user profile. When provided, the MCP server sends the `X-User-ID` header for that request, allowing you to create or read notes across different profiles without changing the global MCP environment. The exceptions are the system-level tools `get_system_info`, `list_backups`, `create_backup` and `delete_backup`, which do not take `user_id`. To change the default profile used when no `user_id` is passed, see [Default user profile](#default-user-profile).

---

## Server Installation

The MCP server is included in the official Poznote `docker-compose.yml` and runs automatically.

### Configuration

The MCP server uses defaults from `docker-compose.yml`:

```bash
# MCP Server port defaults to 8045
# Debug logging defaults to false
```

Poznote generates the MCP service token automatically in `data/.mcp_token`. The `mcp-server` container reads that file through the shared `./data:/var/www/html/data:ro` volume, so there is no password to keep in `.env`.

To override port and debug for one start, recreate the MCP container with inline environment variables:

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

A simple `docker compose restart mcp-server` does not reload updated environment variables.

#### Default user profile

By default the MCP server operates as user profile `1` (the first admin). To pin the server to a different profile, set `POZNOTE_USER_ID` when starting the container:

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

All tool calls then apply to that profile unless a request passes an explicit `user_id` argument, which still takes precedence for that request. The value must be a numeric profile ID; anything else is ignored with a warning in the MCP logs and the default of `1` is used.

#### Inbound authentication token

By default the MCP endpoint accepts any client that can reach it, which is safe because the port is only published on `127.0.0.1`. If you expose the port beyond your machine (reverse proxy, LAN, bare-metal install), set `POZNOTE_MCP_AUTH_TOKEN` and the server will require an `Authorization: Bearer <token>` header on every request, answering `401 Unauthorized` otherwise:

```bash
# Generate a strong token once
openssl rand -hex 32

# Put it in .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Recreate the MCP container so it picks up the new environment
docker compose up -d --force-recreate mcp-server
```

Then add the same header to your client configuration: see [VS Code Copilot](VSCODE-COPILOT.md#using-an-authentication-token) and [Claude CLI](CLAUDE-CLI.md#using-an-authentication-token). Leading and trailing whitespace is ignored, so a token read from a secrets file with a trailing newline still works. An empty value keeps the endpoint open. The startup log line tells you which mode is active.

This token is separate from `data/.mcp_token`: that one is used by the MCP server to talk *to* the Poznote API, this one is what *your AI assistant* must present to the MCP server.

#### Debug mode

Set `POZNOTE_DEBUG=true` in the startup command to switch the log level from `INFO` to `DEBUG`. Set it back to `false` for normal use. Only the exact lowercase values `true` and `false` are recognized. Any other value is treated as `false` and a warning is written to the MCP logs. Every HTTP request sent to the Poznote API, every tool call received from the AI assistant, and every response are written in detail to the container logs. Use it to diagnose connection or authentication issues:

```bash
docker compose logs -f mcp-server
```

Leave it disabled in normal use — the extra verbosity is not needed day-to-day.

### Start the Server

```bash
docker-compose up -d
```

### Verify Installation

```bash
# Check container is running
docker ps | grep mcp

# Test the endpoint
curl http://127.0.0.1:8045/mcp
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

Anyone who can reach the MCP endpoint can read, create, modify and delete every note of every profile (tools accept a `user_id` argument), and can also trigger backups, restores and settings changes. Two layers keep that from being a problem:

1. **Network reachability.** The endpoint is only reachable from the local machine by default.
2. **Inbound bearer token** (optional). Set `POZNOTE_MCP_AUTH_TOKEN` and every request must carry `Authorization: Bearer <token>`.

With the default `docker-compose.yml`, layer 1 alone is enough. Add layer 2 whenever the port becomes reachable from somewhere you do not fully control.

### Why 127.0.0.1-only is both normal and secure

The MCP container listens on `0.0.0.0` *inside* the container, which Docker needs for the port mapping to work, but the port is published **only on `127.0.0.1`** of the host, never on a public interface:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

This is intentional and the correct setup: only processes running on the same machine (or SSH tunnels you explicitly set up) can connect. There is nothing to worry about with the default configuration.

### Running the MCP server outside Docker

If you install the MCP server with `pip` and run `poznote-mcp serve` yourself (systemd, Proxmox LXC, ...), there is no Docker port mapping in front of it, so the bind address matters:

- `poznote-mcp serve` binds to **`127.0.0.1` by default**. Keep that default unless you know why you need otherwise.
- If you must bind to `0.0.0.0` (a reverse proxy on another host, a VPN interface), set `POZNOTE_MCP_AUTH_TOKEN` too. The server logs a warning at startup when it listens on a non-loopback address without a token.
- Older releases bound to `0.0.0.0` by default: pass `--host=127.0.0.1` explicitly (or set `MCP_HOST=127.0.0.1` when running without the `serve` subcommand).

### Remote access

If Poznote runs on a remote server and you want to connect from your workstation, use SSH port forwarding — do **not** expose the port publicly:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Then point your AI assistant to `http://127.0.0.1:8045/mcp` as usual.

### Production environments

If you must route the MCP server through a network, protect it with:
- `POZNOTE_MCP_AUTH_TOKEN` (see [Inbound authentication token](#inbound-authentication-token)), and HTTPS in front of it so the token is not sent in clear
- A VPN (Tailscale, WireGuard)
- Optionally a reverse proxy with its own authentication or IP allowlist (nginx, Caddy) as an extra layer

### How the MCP server authenticates to Poznote

The MCP server connects to the Poznote REST API with an internal Bearer token stored in `data/.mcp_token`. Poznote creates this token automatically and the Docker Compose setup mounts `./data` read-only into the MCP container so the token never needs to live in `.env`.

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
- Check MCP server logs: `docker compose logs mcp-server`
- Verify Poznote API is accessible
- See client-specific troubleshooting guides
