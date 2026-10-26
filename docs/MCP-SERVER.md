<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a> ·
  <a href="MCP-SERVER.ko.md">한국어</a> ·
  <a href="MCP-SERVER.ja.md">日本語</a>
</p>
<!-- /lang-selector -->

# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP Streamable HTTP).

> [!TIP]
> Looking for a chat with a local model (e.g. Ollama) directly inside Poznote? You don't need the MCP server for that — use the built-in [AI Assistant](AI-ASSISTANT.md) instead (**Settings → Admin Tools → AI Assistant**). The MCP server is for connecting *external* MCP-capable assistants to your notes; Ollama alone is a model runtime, not an MCP client, and cannot connect to it directly.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

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

A Poznote tab open in the browser picks up the changes made through MCP within a few seconds: the sidebar tree and the open note refresh in place (or show a reload banner when the note has unsaved edits). A note that is simply open in the browser does not block MCP writes; only a note being edited by another user of the same account, or by a visitor on a public share link, answers with an HTTP 423 error.

## Features

### Tools (actions)
- `get_note` — Get a specific note by ID with full content
- `list_notes` — List the notes of a workspace, one page at a time (`limit`/`offset`, with the workspace's real `total` in the result)
- `search_notes` — Search notes by text query, with optional creation date range
- `create_note` — Create a new note, optionally from a template and/or with a due date/reminder
- `update_note` — Update an existing note, move it, and/or set its due date/reminder
- `delete_note` — Delete a note by ID
- `get_reminder` — Get the reminder currently set on a note
- `set_reminder` — Set or replace a note's reminder, with an optional repeat interval
- `remove_reminder` — Remove the reminder from a note
- `list_reminders` — List reminder notifications that have already fired and are still pending (the bell feed of the UI); upcoming reminders are not listable
- `list_tasks` — List the tasks of a tasklist note, with their IDs, due dates and flags
- `list_all_tasks` — List the open tasks across every note of a workspace, most urgent first, with filters (due date, important, completed, in-note checklists)
- `add_task` — Add a single task to a tasklist note, with an optional due date and reminder
- `update_task` — Update one task (text, due date, reminder, important flag)
- `complete_task` — Mark a task as done, or reopen it
- `delete_task` — Delete one task from a tasklist note
- `add_subtask` — Add a subtask under a task of a tasklist note
- `update_subtask` — Rename a subtask, or mark it done or not done
- `delete_subtask` — Delete one subtask of a task
- `create_folder` — Create a folder, by name or by path (`folder_path="Projects/2026/Q3"` makes the whole chain in one call), or a diary root with `is_diary=true`
- `list_folders` — List all folders from a workspace, with their paths and diary flags
- `list_workspaces` — List all available workspaces
- `list_tags` — List all unique tags used in notes
- `list_templates` — List the template notes `create_note`'s `from_template_id` can start from
- `get_trash` — List all notes currently in the trash
- `empty_trash` — Permanently delete all notes in the trash
- `delete_trash_note` — Permanently delete one note from the trash, instead of emptying the whole trash
- `restore_note` — Restore a note from the trash
- `list_snapshots` — List the saved earlier versions of a note, including the safety snapshot taken before each AI or MCP rewrite
- `get_snapshot` — Read the content of one earlier version of a note, without changing the note
- `restore_snapshot` — Roll a note back to one of its snapshots (a `snapshot_key` or a `date` is required)
- `duplicate_note` — Create a duplicate of an existing note
- `toggle_favorite` — Toggle the favorite status of a note
- `list_attachments` — List all attachments for a specific note
- `add_attachment` — Attach a file to a note from its base64 content (image, log, PDF, …)
- `move_note` — Move a note to another workspace and/or folder, keeping its id
- `move_folder` — Move a folder (with its subfolders and notes) under another parent and/or into another workspace
- `move_note_to_folder` — Move a note to a specific folder
- `remove_note_from_folder` — Remove a note from its current folder (moves it to root)
- `share_note` — Enable public sharing for a note and get the public URL
- `unshare_note` — Disable public sharing for a note
- `get_note_share_status` — Get the current sharing status and public URL for a note
- `get_folder_share_status` — Get the current sharing status and public URL for a folder
- `list_shared` — List all publicly shared notes and folders
- `list_shared_with_me` — List notes and folders other users have shared with this profile
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

**Which workspace a call goes to.** Always name the `workspace` on `create_note`, `create_folder` and `list_folders` (folders always belong to one workspace): it is the only way to be sure. When one is omitted, the server resolves it in a fixed order and never guesses: the `mcp_default_workspace` setting when it names a workspace that exists, then the account's only workspace when it has just one. With several workspaces and no setting, the call is refused and the answer lists them, rather than landing the note in whichever workspace happens to sort first (which used to move on its own, for instance the first time archiving a note created "Archives"). Set the default with `update_app_setting("mcp_default_workspace", "<name>")`.

**Attachments.** `add_attachment(note_id, filename, content_base64)` stores a file on a note exactly as a drag-and-drop in the web UI does, so a generated chart or a log file can be attached without a human in the loop; a `data:` URI is accepted as the content. Poznote's own rules still apply, so an executable type and a full storage quota come back as a refusal carrying the reason. The bytes travel base64-encoded inside the tool call, so the tool caps an upload at 25 MB and points at the web UI for anything larger.

**Moving things.** `move_note` and `move_folder` move, they do not copy: ids, content, history and the links pointing at a note all survive. On `update_note`, `workspace` says where to *look the note up*; the argument that moves it is `target_workspace`. A note that changes workspace without being given a folder of the destination lands at that workspace's root, since its old folder belongs to the workspace it left. A folder takes its subfolders and every note inside them along.

**Folders.** Every tool that takes a folder takes the same thing: a name, or a slash-separated path. `create_note(folder="Diary/2026/08")` creates the missing levels on the way down; `create_folder(folder_path=…)` does the same for a folder; `list_notes(folder_id=…)` scopes a listing to one folder server-side, so its `total` counts that folder alone. A bare name reaches an existing folder at any depth when only one folder of the workspace carries it, rather than creating a second one at the root; when several do, the call is refused and lists them, so pass the full path or the id.

**Diaries.** A diary is not just a folder named Diary: it is a root folder carrying the `is_diary` flag, and the "New diary entry" button of the UI files its dated notes into the flagged root. Create one with `create_folder(folder_name="Journal", is_diary=true)`, and `list_folders` tells you which folders are diaries. Passing a name that a root folder already carries turns that folder into a diary and keeps its notes. Diary entries themselves are ordinary notes: file them with `create_note(folder="Journal/2026/09")`.

**Templates.** A template is an ordinary note kept in a folder named `Templates` (any depth below it counts) or anywhere in a workspace of that name; the word is recognised in every shipped language, so a `Modèles` folder works too. `list_templates` returns them with their ids, and `create_note(from_template_id=…)` starts a new note from one, in the template's own format; ask for `note_type="markdown"` and an HTML template is converted, the way the `/template` command converts it in the editor. A template cannot start a task list or a drawing. Passing `content` as well appends it after the template body.

**Reminders and tasks.** `reminder_at` (on `create_note`/`update_note` and `set_reminder`) is an ISO datetime such as `2026-09-01T09:00:00+02:00`; include an offset, or the time is read as UTC. Task due dates (`due_at`) are different: they are local wall-clock values, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` with no offset, resolved through the user's configured timezone, and a date without a time reminds at 09:00. Repeat intervals use `<count><unit>` with unit `i`/`h`/`d`/`w`/`m`/`y`, for example `30i`, `1d` or `2w`.

The task tools address one task at a time: call `list_tasks` to get task IDs, then `add_task`, `update_task`, `complete_task` or `delete_task`. Each call carries only that task, so a client never reads a tasklist and sends a whole new array back, and two callers editing different tasks cannot overwrite each other. Poznote stores a note's tasks as a single JSON array, which the server rewrites on every call, so the work one call does still grows with the length of the list. Notifications stay in sync automatically, and completing or deleting a task retires its pending reminder. A task can carry subtasks, one level deep: `list_tasks` returns them in the task's `subtasks` array with their own IDs, and `add_subtask`, `update_subtask` and `delete_subtask` change one at a time. A subtask has a text and a done flag only, and ticking it never completes its task.

**Version history and undo.** Poznote takes a safety snapshot of a note right before the AI assistant or the MCP server rewrites it, so a bad `update_note` can be undone. `list_snapshots` shows the snapshots kept for a note, each with an `origin` that identifies those safety copies (`ai` or `mcp`); `get_snapshot` reads one without touching the note, and `restore_snapshot` puts its content back. `restore_snapshot` overwrites the current content, so it requires a `snapshot_key` or a `date` rather than falling back to today's snapshot. It does not save that content first: what it replaces is lost unless a snapshot already holds it. The Poznote interface calls snapshots revisions: users browse and compare them on the note's **Revisions** page, so a request about revisions or version history maps to these tools.

**Seeing across notes.** `list_all_tasks` answers "what is left to do" over a whole workspace, where `list_tasks` covers a single note. It returns two kinds of item, told apart by `source`: tasks of a tasklist note, whose ids work with `update_task` and `delete_task`, and checkbox items written inside ordinary notes, whose id is only a position in the note and cannot be addressed that way. `list_reminders` returns the notifications that have already fired and have not been dismissed, capped at 50 by the API. It is not a view of what is coming: Poznote has no endpoint for future reminders, which are read one note at a time with `get_reminder`.

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

#### Which mode for which use

The MCP server identifies its clients in one of three ways. The question that tells them apart is **who decides which Poznote account a request acts on**:

| Your situation | Mode | Who decides the account |
|---|---|---|
| You alone, with a client on the same machine (VS Code, Claude CLI) | Classic, the default, optionally with an [inbound token](#inbound-authentication-token) | The server's configuration: `POZNOTE_USER_ID` (profile `1` by default), or any profile a request names with `user_id` |
| Several people, chat apps (ChatGPT, Claude, Gemini), or VS Code / Claude Code reaching a public server | [Sign-in from chat apps](#sign-in-from-chat-apps-chatgpt-claude-gemini) (`POZNOTE_MCP_AUTH_PROVIDER=poznote`) | The person who signs in: always their own account |
| Agents that already hold tokens from your identity provider (Keycloak, Authentik, ...) | [Per-caller authentication](#per-caller-authentication-optional) (`userinfo` or `introspection`) | The profile linked to the token's identity |

As soon as several people share one MCP server, use the second mode: in classic mode every client can reach every account.

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

#### Sign-in from chat apps (ChatGPT, Claude, Gemini)

Chat apps that connect to a remote MCP server, such as ChatGPT (and the Codex app), Claude Desktop and claude.ai, or Gemini, do not take a pasted token: they expect the server to send them through an OAuth sign-in. With `POZNOTE_MCP_AUTH_PROVIDER=poznote`, Poznote itself plays that part:

1. You add `https://mcp.example.com/mcp` as a connector in the app, leaving any client ID and secret fields empty: the app registers itself. Apps keep this in their settings, usually as custom connectors or remote MCP servers, and some only offer it on certain plans or in a developer mode.
2. The app opens Poznote's sign-in page. You sign in the way you always do (password, two-factor or SSO).
3. A consent page shows the app's name, where it will send you back and the account it will use, always your own (never an account you were given access to), and lets you pick the access level: **Read only**, **Read and edit** or **Full access**, the three [tool scope](#tool-scope) levels.
4. You click **Allow**, and the app only ever reaches that account, at that level.

So one MCP server serves the whole instance, each person reaching only their own notes (and the workspaces shared with them). **Settings > My Account > Connected apps** lists the connections, disconnects any of them, and gives everyone the connector address to paste.

Requirements:

- The chat app connects from the internet (ChatGPT and claude.ai from their own servers), so the MCP server and Poznote must both be reachable from it over **HTTPS**. Put the MCP server behind your reverse proxy on **its own (sub)domain**, e.g. `https://mcp.example.com`: the OAuth discovery documents are served at the root of that address. Where the proxy sends the traffic depends on where it runs:
  - installed directly on the server: proxy to `127.0.0.1:8045` (the port `docker-compose.yml` publishes, `POZNOTE_MCP_PORT`);
  - running in Docker itself (Nginx Proxy Manager, Traefik, Caddy, ...): `127.0.0.1` would be the proxy's own container. Attach the proxy to Poznote's Docker network, `docker network connect poznote_default <proxy-container>` (the network is named after the folder of your `docker-compose.yml`, see `docker network ls`), and proxy to `mcp-server:8045`.
- Poznote's own `/oauth/` pages must be reachable without another login in front of them (forward authentication such as Authelia or Authentik on your proxy): the apps call some of them from their servers, with no browser to show a login page.
- Two variables in `.env`, then recreate the container (`docker compose up -d --force-recreate mcp-server`). An older `docker-compose.yml` does not pass them to the container: download the latest one first. The MCP logs then show `OAuth sign-in through Poznote enabled` at startup.

```bash
POZNOTE_MCP_AUTH_PROVIDER=poznote
# Public URL of the MCP server, without /mcp
POZNOTE_MCP_PUBLIC_URL=https://mcp.example.com
```

- Poznote's public URL, where people sign in, is the **Instance URL** of **Settings > Admin Tools > Admin Webhooks**, the one reminder emails and webhooks use (`POZNOTE_APP_URL` in `.env` while it is empty). When neither is set, it fills itself in from an administrator's browser; check that it is the address people reach Poznote by from the internet. A change reaches the MCP server within a minute, without a restart. The **Connected apps** window shows administrators the address in use, with a warning when it is a local or plain http one.

If it does not work:

- **The app says it cannot find the server's authorization (OAuth) settings.** From a machine outside your network, open `https://mcp.example.com/.well-known/oauth-protected-resource/mcp` and `https://mcp.example.com/.well-known/oauth-authorization-server`: both must answer with JSON. A `503` on the second means Poznote's public URL is not set; no answer at all means the reverse proxy does not reach the MCP server.
- **The app opens a sign-in page that does not load.** The Instance URL is not one the app can reach: see the warning in **Connected apps**, and fix it in **Admin Webhooks > Instance URL**.
- **The MCP logs do not show `OAuth sign-in through Poznote enabled` at startup.** The variables do not reach the container: check `.env` and `docker-compose.yml`, then recreate the container (a `restart` is not enough).
- **The sign-in works but every request then fails.** The connector URL must be exactly `POZNOTE_MCP_PUBLIC_URL` followed by `/mcp`; the MCP logs say `Rejecting a token issued for ...` otherwise.
- `docker compose logs mcp-server` tells what the server refused and why; `POZNOTE_DEBUG=true` adds every request.

Rules that hold for every connection:

- A connection lasts as long as it is used: the app renews its access every hour, and has to sign in again after 90 days without use. A disconnected app can keep working for up to `POZNOTE_MCP_AUTH_CACHE_TTL` seconds (60 by default).
- `POZNOTE_MCP_SCOPE` still caps every connection: **Full access** to a server set to `write` gets `write`.
- The tools that act on the whole instance (backups, global settings, system information) need an administrator's account, and a request cannot name another account with `user_id`.
- A connected app cannot change where the account's data is sent: the Git sync repository, server and token, and the endpoints and keys of the AI assistant and of dictation. It can still push to and pull from the repository you configured.
- `POZNOTE_MCP_AUTH_TOKEN` is ignored while this mode is on.

#### Per-caller authentication (optional)

`POZNOTE_MCP_AUTH_TOKEN` above is one shared secret: every client presents the
same token, and the server acts as a single profile. When several people or
agents share one MCP instance, that cannot tell them apart.

Setting `POZNOTE_MCP_AUTH_PROVIDER` switches to per-caller authentication: each
client presents **its own** token, which is resolved against an external
identity provider and mapped to that caller's Poznote profile. One instance,
many callers, each correctly identified.

These variables go in `.env`, like the others. They reach the MCP container
through the `environment:` block of the `mcp-server` service, and an older
`docker-compose.yml` does not list them, so they are then silently ignored. If
you set them, download the latest `docker-compose.yml` first (see
[Update application](../README.md#update-application)) and check that the MCP
logs show `Per-caller authentication enabled` at startup.

| variable | default | meaning |
|---|---|---|
| `POZNOTE_MCP_AUTH_PROVIDER` | *(unset, feature off)* | `userinfo` or `introspection` (`poznote` is described [above](#sign-in-from-chat-apps-chatgpt-claude-gemini)) |
| `POZNOTE_MCP_AUTH_URL` | *(required)* | provider endpoint |
| `POZNOTE_MCP_IDENTITY_MATCH` | `oidc_subject:sub` | ordered `<profile-field>:<claim>` pairs |
| `POZNOTE_MCP_AUTH_AUDIENCE` | *(unset, feature off)* | expected `aud`, comma separated; refuses a token issued for another application |
| `POZNOTE_MCP_AUTH_HEADER` | `Authorization` | the header this server sends **to the provider** |
| `POZNOTE_MCP_AUTH_CLIENT_ID` / `_CLIENT_SECRET` | *(unset, feature off)* | `introspection` only, sent as HTTP Basic |
| `POZNOTE_MCP_AUTH_TIMEOUT` | `5` | seconds |
| `POZNOTE_MCP_AUTH_CACHE_TTL` | `60` | seconds a resolved token/profile is cached |

`userinfo` performs `GET <url>` with the caller's bearer token, the OpenID
Connect UserInfo endpoint. The token is never verified locally, so opaque tokens
work exactly as well as JWTs, and there is no JWKS or key-rotation surface to
maintain. `introspection` performs `POST <url>` with `token=<token>`
(RFC 7662); a response carrying `active: false` is an invalid token.

The first claim in `POZNOTE_MCP_IDENTITY_MATCH` that is present **and matches
exactly one profile** wins. Profile fields are those returned by
`GET /api/v1/admin/users`. The default matches on the subject alone. Matching on
`preferred_username` or `email` is available but weaker, because Poznote's own
sign-in matches an email only when it is verified, and a provider that lets users
edit those fields would let one of them claim another profile. Opt in
deliberately.

A value matching two profiles is refused as ambiguous, and an identity matching
no profile is refused outright: it never falls back to a default profile,
because the default is profile 1, the first administrator. A disabled profile is
never a match candidate.

Two consequences worth knowing before enabling it:

- **An explicit `user_id` argument may only agree with the resolved profile.**
  Most tools accept that argument, so one naming a different profile is refused
  rather than honoured.
- **The tools that take no `user_id`** (`get_system_info`, `list_backups`,
  `create_backup`, `delete_backup`) act as the server's default profile, so they
  are limited to callers whose resolved profile is an administrator.

With `POZNOTE_MCP_AUTH_PROVIDER` set it takes precedence over
`POZNOTE_MCP_AUTH_TOKEN`, and the server logs a warning if that token is still
set.

#### Tool scope

By default the server exposes every tool. `POZNOTE_MCP_SCOPE` limits it to one of three levels, which is useful for an agent that runs unattended, since note content could steer it towards a tool it should never call:

| level | tools |
|---|---|
| `read` | only tools that change nothing: get, list, search, backlinks, revisions, share status, system info, settings |
| `write` | `read`, plus changes that can be undone: notes, tasks, reminders, folders, moves, attachments, moving a note to the trash, restoring from the trash or a revision |
| `admin` *(default)* | everything, including what cannot be undone (emptying the trash, deleting from it), workspaces, backups, Git sync, app settings and public sharing |

```bash
# In .env
POZNOTE_MCP_SCOPE=read

# Recreate the MCP container so it picks up the new environment
docker compose up -d --force-recreate mcp-server
```

A tool above the level is not registered at all: clients do not see it, and a call to it is refused as an unknown tool, whatever the client is told. The startup log shows the level and how many tools are exposed. An unknown value stops the server rather than falling back to `admin`.

With the shared token, the level applies to the whole server: to give two clients different levels, run a second MCP container with its own `POZNOTE_MCP_SCOPE`, its own port and its own `POZNOTE_MCP_AUTH_TOKEN`.

With [per-caller authentication](#per-caller-authentication-optional), each caller can get its own level from a claim of its token. `POZNOTE_MCP_SCOPE_MAP` lists `<claim value>=<level>` pairs, read from the claim named by `POZNOTE_MCP_SCOPE_CLAIM` (default `scope`, the space-separated OAuth scopes; a list claim such as `groups` or `roles` works too):

```bash
# OAuth scopes granted to each client by the identity provider
POZNOTE_MCP_SCOPE_MAP=poznote.read=read,poznote.write=write,poznote.admin=admin

# Or groups, for providers that put them in the token
POZNOTE_MCP_SCOPE_CLAIM=groups
POZNOTE_MCP_SCOPE_MAP=/poznote-agents=read,/poznote-users=write,/poznote-admins=admin
```

A caller gets the highest level its claim maps to, never above `POZNOTE_MCP_SCOPE`, and tools above it are hidden from its tool list and refused when called. A caller whose claim maps to no level is refused outright (`401`), rather than given the server's level, and the reason is logged. Without `POZNOTE_MCP_SCOPE_MAP`, every caller gets the server's level.

Every tool also carries the standard MCP `readOnlyHint` and `destructiveHint` annotations, so clients that filter or confirm tools on their side can rely on them.

#### Debug mode

Set `POZNOTE_DEBUG=true` in the startup command to switch the log level from `INFO` to `DEBUG`. Set it back to `false` for normal use. Only the exact lowercase values `true` and `false` are recognized. Any other value is treated as `false` and a warning is written to the MCP logs. The web server is more tolerant and also accepts `1`, `on` or `yes`. Every HTTP request sent to the Poznote API, every tool call received from the AI assistant, and every response are written in detail to the container logs. Use it to diagnose connection or authentication issues:

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

### **ChatGPT, Claude Desktop / claude.ai, Gemini**
Chat apps sign in through Poznote: see **[Sign-in from chat apps](#sign-in-from-chat-apps-chatgpt-claude-gemini)**.

---

## Security

What a client that reaches the MCP endpoint can do depends on the [mode](#which-mode-for-which-use).

**Classic mode** (the default). Anyone who can reach the endpoint can read, create, modify and delete every note of every profile (tools accept a `user_id` argument), and can also trigger backups, restores and settings changes. Two layers keep that from being a problem:

1. **Network reachability.** The endpoint is only reachable from the local machine by default.
2. **Inbound bearer token** (optional). Set `POZNOTE_MCP_AUTH_TOKEN` and every request must carry `Authorization: Bearer <token>`.

With the default `docker-compose.yml`, layer 1 alone is enough. Add layer 2 whenever the port becomes reachable from somewhere you do not fully control.

**Sign-in from chat apps, and per-caller authentication.** Every request must carry a token bound to one person's account, so a client only reaches that account, at the level it was given. Here the endpoint is meant to be reachable from the internet, behind HTTPS: the chat apps connect from their own servers.

In every mode, a [tool scope](#tool-scope) narrows what a client can do.

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

In classic mode, if Poznote runs on a remote server and you want to connect from your workstation, use SSH port forwarding, and do **not** expose the port publicly (with [sign-in from chat apps](#sign-in-from-chat-apps-chatgpt-claude-gemini) exposing it behind HTTPS is the point, and this section does not apply):

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Then point your AI assistant to `http://127.0.0.1:8045/mcp` as usual.

### Production environments

If you must route the MCP server through a network, protect it with:
- `POZNOTE_MCP_AUTH_TOKEN` (see [Inbound authentication token](#inbound-authentication-token)), or [sign-in through Poznote](#sign-in-from-chat-apps-chatgpt-claude-gemini) so every client has its own revocable token bound to one account, and HTTPS in front of it so the token is not sent in clear
- A VPN (Tailscale, WireGuard)
- Optionally a reverse proxy with its own authentication or IP allowlist (nginx, Caddy) as an extra layer, except with sign-in from chat apps: the apps connect from their own, changing addresses and cannot answer another login, so the endpoint and its `/.well-known/` documents must stay reachable

### How the MCP server authenticates to Poznote

The MCP server connects to the Poznote REST API with an internal Bearer token stored in `data/.mcp_token`. Poznote creates this token automatically and the Docker Compose setup mounts `./data` read-only into the MCP container so the token never needs to live in `.env`.

Because that token identifies the MCP server, Poznote takes a snapshot of a note right before a request carrying it changes the note's content or tasks (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`, `add_subtask`, `update_subtask`, `delete_subtask`). It shows as "Before MCP edit" on the note's **Revisions** page, so an AI rewrite that dropped content can be restored in one click. No snapshot is taken when the latest one already holds the same content, and the 20 most recent safety snapshots of a note (Before AI edit and Before MCP edit) are kept, a number to raise in **Settings → Revisions** (up to 200) when the MCP server does enough editing to roll through 20 in an afternoon.

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
