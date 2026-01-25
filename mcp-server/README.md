# Poznote MCP Server

MCP (Model Context Protocol) server for Poznote — enables AI-powered note management through natural language.

This server supports **HTTP transport only** (MCP *streamable-http*).

> **Note:** This MCP server is intended to be used with VS Code Copilot MCP. For advanced options, see the official VS Code MCP documentation: https://code.visualstudio.com/docs/copilot/customization/mcp-servers

## How It Works

The MCP server is a bridge between VS Code Copilot and your Poznote instance.

### Components

- **`server.py`** — MCP server (HTTP / streamable-http)
  - Exposes MCP endpoint at `http://localhost:8045/mcp`
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and the Poznote API

- **`client.py`** — HTTP client for Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE)
  - Handles Basic Auth

### Communication flow

1. VS Code Copilot connects to the MCP Server
2. MCP server calls Poznote REST API
3. Results are returned to the AI assistant

## Features

### Resources (read-only)
- `poznote://notes` : List of available notes
- `poznote://note/{id}` : Content of a specific note

### Tools (actions)
- `get_note` — Get a specific note by ID with full content
- `list_notes` — List all notes from a workspace
- `search_notes` — Search notes by text query
- `create_note` — Create a new note
- `update_note` — Update an existing note
- `delete_note` — Delete a note by ID
- `create_folder` — Create a new folder

All tools accept an optional `user_id` argument to target a specific user profile. When provided, the MCP server sends the `X-User-ID` header for that request, allowing you to create or read notes across different profiles without changing the global MCP environment.

---

## Installation & Setup

The MCP server is already integrated in Poznote's main `docker-compose.yml`. Just enable it!

### Quick Start

Edit your `.env` file (at Poznote root) and add:
```bash
COMPOSE_PROFILES=mcp
```

Then start normally:
```bash
docker compose up -d
```

That's it! Check the logs:
```bash
docker compose logs -f mcp-server
```

### Configuration

Add these variables to your `.env` file (at Poznote root):

```bash
# Enable MCP server
COMPOSE_PROFILES=mcp

# MCP Server port (default: 8045)
POZNOTE_MCP_PORT=8045

# Poznote username for MCP authentication
POZNOTE_MCP_USERNAME=admin

# User ID for MCP operations (1 = admin)
POZNOTE_MCP_USER_ID=1

# Default workspace
POZNOTE_MCP_WORKSPACE=Poznote

# Enable debug logging (optional)
POZNOTE_MCP_DEBUG=false
```

To disable the MCP server, comment out the `COMPOSE_PROFILES=mcp` line in your `.env`.

### Reverse Proxy Compatibility

If you use a reverse proxy (Nginx Proxy Manager, Traefik, Caddy, etc.) to expose Poznote, connect the MCP container to your proxy's network:

```bash
# Start Poznote and MCP
docker compose up -d

# Connect MCP to your reverse proxy network
# Replace with your actual network name (npm-poznote-webserver-net, traefik_default, etc.)
docker network connect YOUR_PROXY_NETWORK poznote-mcp
```

This allows the MCP server to communicate with the Poznote webserver through the proxy network while remaining accessible externally.

### VS Code Configuration

Add to your `mcp.json`:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

`mcp.json` location:
- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

### Docker Commands

```bash
# Start (if COMPOSE_PROFILES=mcp is in .env)
docker compose up -d

# Stop
docker compose down

# View MCP logs
docker compose logs -f mcp-server

# Rebuild MCP after updates
docker compose build mcp-server
docker compose up -d
```

---

## Example Prompts

Once configured in VS Code, you can interact with Poznote using natural language:

- "List all notes in workspace 'Poznote' of my Poznote instance"
- "Search for notes about 'MCP'"
- "Create a markdown note titled 'Birds' about birds"
- "Update note 100041 with new content"
- "Create a folder 'Test' in workspace 'Workspace1'"

---

## Development

### Manual Installation (for development only)

If you need to modify the MCP server code:

```bash
# Clone and setup
git clone https://github.com/timothepoznanski/poznote.git
cd poznote/mcp-server

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -e .

# Configure environment
export POZNOTE_API_URL=http://localhost:8040/api/v1
export POZNOTE_USERNAME=admin
export POZNOTE_PASSWORD=admin
export POZNOTE_USER_ID=1
export POZNOTE_DEFAULT_WORKSPACE=Poznote

# Run development server
poznote-mcp serve --host=0.0.0.0 --port=8045
```

### Building the Docker Image

```bash
# From the mcp-server directory
docker build -t poznote-mcp:latest .

# Test the image
docker run -d \
  -e POZNOTE_API_URL=http://host.docker.internal:8040/api/v1 \
  -e POZNOTE_USERNAME=admin \
  -e POZNOTE_PASSWORD=admin \
  -p 8045:8045 \
  poznote-mcp:latest
```
