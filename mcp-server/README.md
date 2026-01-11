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

### Powershell

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

### VS Code Configuration

Create a `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json` config file:

```json
{
  "mcp": {
    "servers": {
      "poznote": {
        "command": "C:\\Users\\YOUR-USERNAME\\Desktop\\mcp-server\\.venv\\Scripts\\python.exe",
        "args": ["-m", "poznote_mcp.server"],
        "env": {
          "POZNOTE_API_URL": "http://localhost/api/v1",
          "POZNOTE_USERNAME": "admin",
          "POZNOTE_PASSWORD": "your-poznote-password"
        }
      }
    }
  }
}
```

- Restart VS Code.
- Check if your MCP server appears in CTRL + SHIFT + P > MCP: List Servers

Note: 

Choose your AI model with "CTRL + SHIFT + P > MCP: List Servers > poznote > Configure model

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
