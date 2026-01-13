
# Poznote MCP Server

> **Note:** The Poznote MCP server has mainly been tested with Visual Studio Code. For more details and advanced customization options, see the official VS Code MCP documentation: [https://code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

Minimal MCP (Model Context Protocol) server for Poznote.

## Transport Modes

The MCP server supports two transport modes:

| Mode | Command |
|------|---------|
| **stdio** | `poznote-mcp serve --transport=stdio` |
| **http** | `poznote-mcp serve --transport=http --port=8081` |

## How It Works

The MCP server consists of two main modules:

- **`server.py`** : MCP server supporting stdio and HTTP modes
  - Runs on the server where Poznote is installed (Linux/Windows)
  - Handles communication with VS Code / Copilot
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and Poznote API

- **`client.py`** : HTTP client for communicating with Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE) to the local API
  - Handles Basic Auth authentication
  - Transforms API responses into MCP server-compatible format

**Workflow:**

**stdio Mode (Local/SSH):**
1. VS Code launches `poznote-mcp serve --transport=stdio` locally or via SSH
2. Communication happens via stdin/stdout
3. The HTTP client calls the Poznote API at `http://localhost/api/v1`

**HTTP Mode (Streamable HTTP):**
1. MCP server runs on the Poznote server: `poznote-mcp serve --transport=http --port=8081`
2. VS Code connects directly to `http://your-server:8081/mcp`
3. No local Python installation required on client machine
4. Works through corporate proxies and firewalls

```
  +---------------------+
  |   VS Code / AI      |
  +---------------------+
     ^   |
     |   v
   (stdio OR HTTP, bidirectional)
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
git clone https://github.com/timothepoznanski/poznote.git poznote-mcp-server
cd poznote-mcp-server/mcp-server
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

```bash
python -c "import poznote_mcp; print('poznote_mcp OK')"

# Test stdio mode (press CTRL+C to stop)
poznote-mcp serve --transport=stdio

# Test HTTP mode (press CTRL+C to stop)
poznote-mcp serve --transport=http --port=8081
```

When configured in VS Code, the MCP server is automatically started by VS Code and invoked on-demand when you make requests in Copilot Chat.

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
git clone https://github.com/timothepoznanski/poznote.git poznote-mcp-server
cd poznote-mcp-server/mcp-server
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

```powershell
python -c "import poznote_mcp; print('poznote_mcp OK')"

# Test stdio mode (press CTRL+C to stop)
poznote-mcp serve --transport=stdio

# Test HTTP mode (press CTRL+C to stop)
poznote-mcp serve --transport=http --port=8081
```

When configured in VS Code, the MCP server is automatically started by VS Code and invoked on-demand when you make requests in Copilot Chat.

## VS Code Configuration

There are three methods to configure the Poznote MCP server in VS Code:

| Method | Transport | Use Case |
|--------|-----------|----------|
| **SSH Command** | stdio | Remote Linux server via SSH tunnel |
| **Local stdio** | stdio | Local development with Python installed |
| **HTTP** | streamable-http | No local Python needed |

Create the following file on the computer where your VS Code is located: 

`C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`

and add to it one of the following configurations depending on your case:

### Option 1: SSH Command Wrapper (Remote Linux Server)

For remote development, VS Code launches the MCP server via SSH:

**VS Code mcp.json** 

If poznote-mcp-server has been cloned on /root for example :

```json
{
  "servers": {
    "poznote": {
      "command": "ssh",
      "args": [
        "user@your-server",
        "cd /root/poznote-mcp-server/mcp-server && source venv/bin/activate && POZNOTE_API_URL=http://localhost:PORT/api/v1 POZNOTE_USERNAME=YOUR-LOGIN POZNOTE_PASSWORD=YOUR-PASSWORD poznote-mcp serve --transport=stdio"
      ]
    }
  }
}
```

### Option 2: Local stdio Mode (Windows Native)

For local development without SSH:

**VS Code mcp.json** 

```json
{
  "servers": {
    "poznote": {
      "command": "C:\\Users\\YOUR-USERNAME\\Desktop\\mcp-server\\.venv\\Scripts\\poznote-mcp.exe",
      "args": ["serve", "--transport=stdio"],
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

### Option 3: HTTP Mode

**Step 1: Start the MCP server on your Poznote server (Linux)**

```bash
cd /root/poznote-mcp-server/mcp-server
source venv/bin/activate
export POZNOTE_API_URL=http://localhost:PORT/api/v1
export POZNOTE_USERNAME=YOUR-LOGIN
export POZNOTE_PASSWORD=YOUR-PASSWORD
poznote-mcp serve --transport=http --port=8081
```

Or run as a background service (optional):

```bash
nohup poznote-mcp serve --transport=http --port=8081 > /var/log/poznote-mcp.log 2>&1 &
```

**Step 2: Configure VS Code to connect via HTTP**

**VS Code mcp.json**

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://your-server:8081/mcp"
    }
  }
}
```

> **Note:** Make sure port 8081 is accessible from your workstation. You may need to configure firewall rules or use an SSH tunnel if direct access is not available.

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `POZNOTE_API_URL` | URL of the Poznote REST API | `http://localhost/api/v1` |
| `POZNOTE_USERNAME` | Username for Basic Auth | (required) |
| `POZNOTE_PASSWORD` | Password for Basic Auth | (required) |
| `POZNOTE_DEFAULT_WORKSPACE` | Default workspace name | `Poznote` |
| `POZNOTE_DEBUG` | Enable debug logging | `0` |
| `MCP_TRANSPORT` | Transport mode (legacy) | `stdio` |
| `MCP_HOST` | HTTP host (legacy) | `0.0.0.0` |
| `MCP_PORT` | HTTP port (legacy) | `8081` |

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

## Evolution

This is currently a minimal implementation of the Poznote MCP server. It is expected to expand with additional features, improved error handling, and more comprehensive tool support in future updates.
