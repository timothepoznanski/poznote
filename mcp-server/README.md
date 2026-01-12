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

- Display the content of note ID XXXXXX.
- Create a note "XXXXX" in poznote.
- Search for notes about "project ideas"
- Update note 12345 with new content
