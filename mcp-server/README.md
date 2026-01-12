# Poznote MCP Server

Minimal MCP (Model Context Protocol) server for Poznote.

Allows an AI to **read**, **search** and **write** notes.

## Transport Modes

The server supports two transport modes:

| Mode | Usage | Best For |
|------|-------|----------|
| **stdio** | Local process (default) | Local development, Windows native |
| **SSE** | HTTP server | Remote development, VS Code Remote SSH |

## Features

### Resources (read-only)
- `poznote://notes` - List of available notes
- `poznote://note/{id}` - Content of a specific note

### Tools (actions)
- `search_notes` - Text search in notes
- `create_note` - Create a new note
- `update_note` - Update an existing note

## Installation

### Linux / Remote Server (Recommended for Remote SSH)

```bash
cd mcp-server
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -e .
```

### Powershell (Windows Local)

Install Python:

```
winget install python3
```

List existing Python installations and get the full path of your python.exe:

```
Get-ChildItem 'C:\Users\YOUR-USERNAME\AppData\Local\Programs\Python','C:\Program Files' -Recurse -Filter 'python.exe' -ErrorAction SilentlyContinue | Select-Object FullName
```

Create and activate the venv:

```
git clone https://github.com/timothepoznanski/poznote.git
cd poznote/mcp-server

& 'C:\Users\YOUR-USERNAME\AppData\Local\Programs\Python\Python314\python.exe' -m venv .venv

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\.venv\Scripts\Activate.ps1
```

Install the MCP server in your venv:

```
python -m pip install --upgrade pip
python -m pip install -e .
```

Run it to test it:

```
python -c "import poznote_mcp; print('poznote_mcp OK')"
$env:POZNOTE_DEBUG = "1"  # Optional: Run server in debug mode
python -m poznote_mcp.server
```

CTRL + C to stop it.

## Running the Server

### stdio Mode (Local - Default)

```bash
python -m poznote_mcp.server
```

### SSE Mode (Remote HTTP Server) ⭐

This is the recommended mode when using **VS Code Remote SSH**.

```bash
# Start on localhost only (secure, use with SSH tunnel)
python -m poznote_mcp.server --sse --port 3333

# Or bind to all interfaces (if behind firewall/VPN)
python -m poznote_mcp.server --sse --host 0.0.0.0 --port 3333
```

Options:
- `--sse`: Enable HTTP/SSE mode
- `--host`: Bind address (default: `127.0.0.1`)
- `--port`: Port number (default: `3333`)

## VS Code Configuration

### Option 1: Remote SSH with SSE Mode (Recommended) ⭐

When you're connected to a remote server via VS Code Remote SSH, run the MCP server on the remote:

**On the remote server:**
```bash
cd ~/poznote/mcp-server
source venv/bin/activate
export POZNOTE_API_URL="http://localhost/api/v1"
export POZNOTE_USERNAME="admin"
export POZNOTE_PASSWORD="your-password"
python -m poznote_mcp.server --sse --port 3333
```

**On your Windows machine**, create an SSH tunnel:
```powershell
ssh -L 3333:localhost:3333 user@your-server
```

**VS Code mcp.json** (`C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`):
```json
{
  "servers": {
    "poznote": {
      "url": "http://localhost:3333/sse"
    }
  }
}
```

### Option 2: SSH Command Wrapper (Alternative)

If you prefer not to run a persistent server, VS Code can launch the MCP via SSH:

**VS Code mcp.json:**
```json
{
  "servers": {
    "poznote": {
      "command": "ssh",
      "args": [
        "user@your-server",
        "cd ~/poznote/mcp-server && source venv/bin/activate && POZNOTE_API_URL=http://localhost/api/v1 POZNOTE_USERNAME=admin POZNOTE_PASSWORD=your-password python -m poznote_mcp.server"
      ]
    }
  }
}
```

### Option 3: Local stdio Mode (Windows Native)

For local development without SSH:

**VS Code mcp.json:**
```json
{
  "servers": {
    "poznote": {
      "command": "C:\\Users\\YOUR-USERNAME\\Desktop\\mcp-server\\.venv\\Scripts\\python.exe",
      "args": ["-m", "poznote_mcp.server"],
      "env": {
        "POZNOTE_API_URL": "http://localhost/api/v1",
        "POZNOTE_USERNAME": "admin",
        "POZNOTE_PASSWORD": "your-password"
      }
    }
  }
}
```

After configuring:
- Restart VS Code
- Check if your MCP server appears in `CTRL + SHIFT + P` > `MCP: List Servers`

## Running as a Service (Linux)

To keep the MCP server running permanently on your VPS:

### Using systemd

Create `/etc/systemd/system/poznote-mcp.service`:

```ini
[Unit]
Description=Poznote MCP Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/poznote/mcp-server
Environment="POZNOTE_API_URL=http://localhost/api/v1"
Environment="POZNOTE_USERNAME=admin"
Environment="POZNOTE_PASSWORD=your-password"
ExecStart=/home/your-username/poznote/mcp-server/venv/bin/python -m poznote_mcp.server --sse --port 3333
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable poznote-mcp
sudo systemctl start poznote-mcp
sudo systemctl status poznote-mcp
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

## Health Check

When running in SSE mode, you can verify the server is running:

```bash
curl http://localhost:3333/health
```

Response:
```json
{"status": "ok", "server": "poznote-mcp", "version": "1.0.0", "mode": "sse"}
```

## Example Prompts

Once configured, you can ask in VS Code Copilot chat:

- Display the content of note ID XXXXXX.
- Create a note "XXXXX" in poznote.
- Search for notes about "project ideas"
- Update note 12345 with new content
