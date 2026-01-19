# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP *streamable-http*).

> **Note:** This MCP server is intended to be used with VS Code Copilot MCP. For advanced options, see the official VS Code MCP documentation: https://code.visualstudio.com/docs/copilot/customization/mcp-servers

## How It Works

The MCP server is a bridge between VS Code Copilot and your Poznote instance.

### Components

- **`server.py`** — MCP server (HTTP / streamable-http)
  - Exposes MCP endpoint at `http://POZNOTE_MCP_SERVER:POZNOTE_MCP_SERVER_PORT/mcp`
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and the Poznote API

- **`client.py`** — HTTP client for Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE)
  - Handles Basic Auth

### Communication flow (HTTP)

1. Start the MCP server
2. VS Code connects to the MCP Server
3. MCP server calls Poznote REST Poznote API


## Features

### Resources (read-only)
- `poznote://notes` : List of available notes
- `poznote://note/{id}` : Content of a specific note

### Tools (actions)
- `get_note`
- `list_notes`
- `search_notes`
- `create_note`
- `update_note`
- `delete_note`
- `create_folder`

---

To get everything working end-to-end, simply follow these three steps: 

1. Install the MCP server
2. Run it (either via command line or systemd)
3. Register the server in VS Code (Copilot MCP)

## 1. Install MCP Server (Linux)

```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip

git clone https://github.com/timothepoznanski/poznote.git poznote-mcp-server
cd poznote-mcp-server/mcp-server

python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -e .

python -c "import poznote_mcp; print('poznote_mcp OK')"
```

## 2. Run MCP Server (Linux)

Choose a way to run the MCP Server:

<details>
<summary><strong>Run (HTTP / streamable-http)</strong></summary>
<br>

Activate the venv:

```bash
cd /home/YOUR_LINUX_USER/poznote-mcp-server/mcp-server
source venv/bin/activate
```

Edit and export your values:

```
export POZNOTE_API_URL=http://POZNOTE_SERVER:POZNOTE_SERVER_PORT/api/v1
export POZNOTE_USERNAME=admin_change_me
export POZNOTE_PASSWORD=YOUR_GLOBAL_ADMIN_OR_USER_PASSWORD
export POZNOTE_USER_ID=1
export POZNOTE_DEFAULT_WORKSPACE=Poznote
```

> **Note:** 
> - `POZNOTE_USERNAME` must be a valid user profile name in your Poznote instance.
> - `POZNOTE_PASSWORD` must be the global password corresponding to that user's role (Administrator or Standard).
> - `POZNOTE_USER_ID` specifies which user profile to access. Use the Poznote web interface or API (`GET /api/v1/users/profiles`) to find your user ID.

Start the MCP Server:

```
poznote-mcp serve --host=0.0.0.0 --port=POZNOTE_MCP_PORT
```

Endpoint: `http://YOUR_SERVER_HOSTNAME_OR_IP:POZNOTE_MCP_SERVER_PORT/mcp`

</details>

<details>
<summary><strong>Run with systemd</strong></summary>
<br>

1) Create an environment file (example: `/etc/poznote-mcp.env`):

```bash
vim /etc/poznote-mcp.env
```

Content:

```bash
POZNOTE_API_URL=http://POZNOTE_SERVER:POZNOTE_SERVER_PORT/api/v1
POZNOTE_USERNAME=admin_change_me
POZNOTE_PASSWORD=YOUR_GLOBAL_ADMIN_OR_USER_PASSWORD
POZNOTE_USER_ID=1
POZNOTE_DEFAULT_WORKSPACE=Poznote
POZNOTE_DEBUG=1
MCP_HOST=0.0.0.0
MCP_PORT=POZNOTE_MCP_SERVER_PORT
```

2) Create `/etc/systemd/system/poznote-mcp.service`:

```ini
[Unit]
Description=Poznote MCP Server
After=network.target

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/home/YOUR_LINUX_USER/poznote-mcp-server/mcp-server
EnvironmentFile=/etc/poznote-mcp.env
ExecStart=/home/YOUR_LINUX_USER/poznote-mcp-server/mcp-server/venv/bin/poznote-mcp serve --host=${MCP_HOST} --port=${MCP_PORT}
Restart=always

[Install]
WantedBy=multi-user.target
```

3) Reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now poznote-mcp
sudo systemctl status poznote-mcp
```

</details>

<details>
<summary><strong>Run with user systemd</strong></summary>

<br>

This mode installs the unit for a single Linux user (no `sudo` for `systemctl`).

1) Create an environment file (example: `~/.config/poznote-mcp.env`):

```bash
vim ~/.config/poznote-mcp.env
```

Content:

```bash
POZNOTE_API_URL=http://POZNOTE_SERVER:POZNOTE_SERVER_PORT/api/v1
POZNOTE_USERNAME=admin_change_me
POZNOTE_PASSWORD=YOUR_GLOBAL_ADMIN_OR_USER_PASSWORD
POZNOTE_USER_ID=1
POZNOTE_DEFAULT_WORKSPACE=Poznote
POZNOTE_DEBUG=1
MCP_HOST=0.0.0.0
MCP_PORT=POZNOTE_MCP_SERVER_PORT
```

2) Create the user unit at `~/.config/systemd/user/poznote-mcp.service`:

```bash
mkdir -p ~/.config/systemd/user
$EDITOR ~/.config/systemd/user/poznote-mcp.service
```

Example unit:

```ini
[Unit]
Description=Poznote MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/poznote-mcp-server/mcp-server
EnvironmentFile=%h/.config/poznote-mcp.env
ExecStart=%h/poznote-mcp-server/mcp-server/venv/bin/poznote-mcp serve --host=${MCP_HOST} --port=${MCP_PORT}
Restart=always

[Install]
WantedBy=default.target
```

3) Reload and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now poznote-mcp
systemctl --user status poznote-mcp
```

Optional (start even when you’re not logged in):

```bash
sudo loginctl enable-linger $USER
```

</details>


## 3. Configure VS Code (HTTP)

`mcp.json` location:
- **Windows:** `C:\\Users\\YOUR-USERNAME\\AppData\\Roaming\\Code\\User\\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

Example:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://POZNOTE_MCP_SERVER:POZNOTE_MCP_SERVER_PORT/mcp"
    }
  }
}
```

---

## Example prompts

- List all notes in workspace 'Poznote' of my Poznote instance
- Search for notes about 'MCP'
- Create a markdown note type titled 'Birds' about birds
- Update note 100041 with new content
- Create a folder "Test" in workspace "Workspace1"
- ...
