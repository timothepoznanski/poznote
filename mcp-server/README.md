# Poznote MCP Server

Minimal MCP (Model Context Protocol) server for Poznote.

Allows an AI to **read**, **search** and **write** notes.

## How It Works

The MCP server consists of two main modules:

- **`server.py`** : MCP server running in stdio mode
  - Runs on the server where Poznote is installed (Linux/Windows)
  - Handles communication with VS Code / Copilot via stdin/stdout
  - Defines resources (note reading) and tools (actions)
  - Orchestrates calls between the AI and Poznote API

- **`client.py`** : HTTP client for communicating with Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE) to the local API
  - Handles Basic Auth authentication
  - Transforms API responses into MCP server-compatible format

**Workflow:**

**Local (Windows):**
1. VS Code launches `python.exe -m poznote_mcp.server` locally
2. Communication happens via stdin/stdout on the same machine
3. The HTTP client calls the Poznote API at `http://localhost/api/v1`

**Remote (SSH):**
1. VS Code launches the server on the remote Linux server via SSH command
2. SSH tunnels stdin/stdout between your local VS Code and the remote server
3. The MCP server runs on the Linux server
4. The HTTP client calls the Poznote API on the same server (`http://localhost/api/v1`)
5. Responses flow back through the SSH tunnel to VS Code

## Features

### Resources (read-only)
- `poznote://notes` - List of available notes
- `poznote://note/{id}` - Content of a specific note

### Tools (actions)
- `get_note` - Get a specific note by ID with full content
- `search_notes` - Text search in notes
- `create_note` - Create a new note
- `update_note` - Update an existing note
- `delete_note` - Delete a note by ID
- `create_folder` - Create a new folder

## Installation

### Linux / Remote Server

```bash
cd mcp-server
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -e .
```

### Windows Local

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
python -m poznote_mcp.server
```

CTRL + C to stop it.

## VS Code Configuration

### Option 1: SSH Command Wrapper (Remote Server)

For remote development, VS Code launches the MCP server via SSH:

**VS Code mcp.json** (`C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json` on Windows or `~/.config/Code/User/mcp.json` on Linux):
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

### Option 2: Local stdio Mode (Windows Native)

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

## Example Prompts

Once configured, you can ask in VS Code Copilot chat:

- Get the content of note ID 12345
- Display the content of note ID XXXXXX
- Search for notes about "project ideas"
- Create a note "XXXXX" in poznote
- Update note 12345 with new content
- Delete note 12345
- Create a folder "My Projects"
- Create a folder "Subfolder" inside folder ID 5
