
# Poznote MCP Server

> **Note:** The Poznote MCP server has mainly been tested with Visual Studio Code. For more details and advanced customization options, see the official VS Code MCP documentation: [https://code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

Minimal MCP (Model Context Protocol) server for Poznote.

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

```
  +---------------------+
  |   VS Code / AI      |
  +---------------------+
     ^   |
     |   v
   (stdin/stdout, bidirectional)
  +---------------------+
  |   MCP server.py     |
  +---------------------+
     ^   |
     |   v
   (calls PoznoteClient)
  +---------------------+
  |   client.py         |
  +---------------------+
     ^   |
     |   v
   (HTTP, bidirectional)
  +---------------------+
  |   Poznote API       |
  |   (REST, port 80)   |
  +---------------------+
```

**Local**: everything runs on the same machine. <br>
**Remote**: VS Code communicates via SSH, MCP runs on the server, Poznote API is local to the server.

## Features

### Resources (read-only)
- `poznote://notes` - List of available notes
- `poznote://note/{id}` - Content of a specific note

### Tools (actions)
- `get_note` - Get a specific note by ID with full content
- `list_notes` - List all notes from a specific workspace
- `search_notes` - Text search in notes
- `create_note` - Create a new note
- `update_note` - Update an existing note
- `delete_note` - Delete a note by ID
- `create_folder` - Create a new folder

## Installation

### Linux / Remote Server

Install Python (if not already installed):

```
sudo apt update
sudo apt install python3 python3-venv python3-pip
```

Clone the repository:

```
git clone https://github.com/timothepoznanski/poznote.git
cd poznote/mcp-server
```

Create and activate the venv:

```
python3 -m venv venv
source venv/bin/activate
```

Install the MCP server in your venv:

```
pip install --upgrade pip
pip install -e .
```

Run it to test it:

```
python -c "import poznote_mcp; print('poznote_mcp OK')"
python -m poznote_mcp.server
```

When configured in VS Code, the MCP server is automatically started by VS Code and invoked on-demand when you make requests in Copilot Chat. Therefore use "CTRL + C" to stop it.

### Windows Local

Install Python:

```
winget install python3
```

List existing Python installations and get the full path of your python.exe:

```
Get-ChildItem 'C:\Users\YOUR-USERNAME\AppData\Local\Programs\Python','C:\Program Files' -Recurse -Filter 'python.exe' -ErrorAction SilentlyContinue | Select-Object FullName
```

Clone the repository:

```
git clone https://github.com/timothepoznanski/poznote.git
cd poznote/mcp-server
```

Create and activate the venv:

```
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

When configured in VS Code, the MCP server is automatically started by VS Code and invoked on-demand when you make requests in Copilot Chat. Therefore use "CTRL + C" to stop it.

## VS Code Configuration

There are two primary methods to configure the Poznote MCP server in VS Code, depending on your setup:

- **Remote (SSH)**: For accessing a Poznote instance on a remote Linux server. VS Code uses SSH tunneling to launch and communicate with the MCP server on the remote machine.
- **Local (Windows)**: For local development on Windows, where the MCP server runs directly on your machine using stdio communication.

### Option 1: SSH Command Wrapper (Remote Linux Server)

For remote development, VS Code launches the MCP server via SSH:

**VS Code mcp.json** 

**On Windows**: `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
**On Linux**:`~/.config/Code/User/mcp.json`

```json
{
  "servers": {
    "poznote": {
      "command": "ssh",
      "args": [
        "user@your-server",
        "cd ~/poznote/mcp-server && source venv/bin/activate && POZNOTE_API_URL=http://localhost:PORT/api/v1 POZNOTE_USERNAME=YOUR-LOGIN POZNOTE_PASSWORD=YOUR-PASSWORD POZNOTE_DEBUG=1 python3 -m poznote_mcp.server"
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
        "POZNOTE_API_URL": "http://localhost:PORT/api/v1",
        "POZNOTE_USERNAME": "YOUR-LOGIN",
        "POZNOTE_PASSWORD": "YOUR-PASSWORD",
        "POZNOTE_DEBUG": "1"
      }
    }
  }
}
```

## After configuring, restart the MCP server

Once configured, VS Code automatically starts and manages the MCP server on-demand when you use Copilot Chat. You can manually restart it via the command palette if needed, for example, after making changes to the server code.

- Check if your MCP server appears in `CTRL + SHIFT + P` > `MCP: List Servers` > `poznote` > `Restart` 


## Example Prompts

Once configured, you can ask in VS Code Copilot chat:

- Get the content of note ID 100034
- Get the content of note "Test Reload MCP"
- Display the content of note ID 100034
- List all notes in workspace MCP
- Search for notes about "MCP"
- Create a note "MCP" in the MCP workspace
- Update note 100041 with new content
- Create a folder "My Projects" in the namespace "MCP"
- Create a folder "Subfolder" inside folder "My Projects"
- Delete note 100034
