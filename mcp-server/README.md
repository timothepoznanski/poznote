
# Poznote MCP Server

> **Note:** The Poznote MCP server has mainly been tested with Visual Studio Code. For more details and advanced customization options, see the official VS Code MCP documentation: [https://code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

Minimal MCP (Model Context Protocol) server for Poznote - enables AI-powered note management through natural language in VS Code.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Features](#features)
- [Installation](#installation)
- [VS Code Configuration](#vs-code-configuration)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Example Prompts](#example-prompts)

---

## Quick Start

**Prerequisites:**
1. A running Poznote instance (default port: `8040`)
2. Your Poznote username and password (same as web login)
3. VS Code with GitHub Copilot extension

**Essential Configuration Steps:**
1. Install the MCP server (see [Installation](#installation))
2. Configure environment variables:
   - `POZNOTE_API_URL` - Your Poznote API endpoint (e.g., `http://localhost:8040/api/v1`)
   - `POZNOTE_USERNAME` - Your Poznote username
   - `POZNOTE_PASSWORD` - Your Poznote password
3. Add configuration to VS Code `mcp.json` (see [VS Code Configuration](#vs-code-configuration))
4. Restart VS Code or reload MCP servers

---

## Transport Modes

The MCP server supports two transport modes:

| Mode | Command | Use Case |
|------|---------|----------|
| **stdio** | `poznote-mcp serve --transport=stdio` | Local/SSH connection, VS Code manages the process |
| **http** | `poznote-mcp serve --transport=http --port=8041` | Remote connection, server runs independently |

---

## How It Works

The MCP server acts as a bridge between VS Code Copilot and your Poznote instance.

### Architecture Components

- **`server.py`** - MCP server supporting stdio and HTTP modes
  - Runs on the server where Poznote is installed (Linux/Windows)
  - Handles communication with VS Code / Copilot
  - Defines tools (actions) for note management
  - Orchestrates calls between the AI and Poznote API

- **`client.py`** - HTTP client for communicating with Poznote REST API
  - Performs HTTP requests (GET, POST, PATCH, DELETE) to the Poznote API
  - Handles Basic Auth authentication
  - Transforms API responses into MCP server-compatible format

### Communication Flow

**stdio Mode (Local/SSH):**
1. VS Code launches `poznote-mcp serve --transport=stdio` locally or via SSH
2. Communication happens via stdin/stdout
3. The HTTP client calls the Poznote API at `http://localhost:8040/api/v1` (or your configured URL)

**HTTP Mode (Streamable HTTP):**
1. MCP server runs on the Poznote server: `poznote-mcp serve --transport=http --port=8041`
2. VS Code connects directly to `http://your-server:8041/mcp`
3. No local Python installation required on client machine

```
  ┌─────────────────────┐
  │   VS Code / AI      │
  │   (Copilot Chat)    │
  └─────────────────────┘
     ↕ stdio OR HTTP
  ┌─────────────────────┐
  │   MCP server.py     │
  │   (port 8041)       │
  └─────────────────────┘
     ↕ HTTP calls
  ┌─────────────────────┐
  │   client.py         │
  │   (PoznoteClient)   │
  └─────────────────────┘
     ↕ REST API
  ┌─────────────────────┐
  │   Poznote API       │
  │   (port 8040)       │
  └─────────────────────┘
```

---

## Features

### Resources (read-only)
- `poznote://notes` - List of available notes
- `poznote://note/{id}` - Content of a specific note

### Tools (actions)
- `get_note` - Get a specific note by ID with full content
- `list_notes` - List all notes from a specific workspace
- `search_notes` - Full-text search across notes
- `create_note` - Create a new note with title, content, tags, folder, and optional `note_type` (e.g. `markdown`)
- `update_note` - Update an existing note (title, content, tags)
- `delete_note` - Delete a note by ID
- `create_folder` - Create a new folder in a workspace

#### Creating Markdown notes

By default, `create_note` creates HTML notes (`note_type="note"`). To create a Markdown note stored as a `.md` entry in Poznote, pass `note_type="markdown"`.

Example:

```json
{
  "title": "Mon mémo en Markdown",
  "content": "# Titre\n\n- élément 1\n- élément 2\n",
  "workspace": "Poznote",
  "tags": "docs, markdown",
  "note_type": "markdown"
}
```

---

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
poznote-mcp serve --transport=http --port=8041
```

When configured in VS Code with stdio transport (SSH or local), the MCP server is automatically started on-demand. For HTTP transport, you must run the server as a persistent service.

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
poznote-mcp serve --transport=http --port=8041
```

When configured in VS Code with stdio transport (SSH or local), the MCP server is automatically started on-demand. For HTTP transport, you must run the server as a persistent service.

## VS Code Configuration

Configure the MCP server in VS Code by creating or editing the `mcp.json` file:

**Configuration file location:**
- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

There are three configuration methods:

| Method | Transport | Use Case | Python Required |
|--------|-----------|----------|-----------------|
| **SSH Command** | stdio | Remote Linux server via SSH | On server |
| **Local stdio** | stdio | Local development | On local machine |
| **HTTP** | streamable-http | Remote connection | On server only |

---

### Option 1: SSH Command Wrapper (Remote Linux Server)

For remote development, VS Code launches the MCP server via SSH.

**Example `mcp.json`** (assuming poznote-mcp-server is in `/home/user`):

```json
{
  "servers": {
    "poznote": {
      "command": "ssh",
      "args": [
        "user@your-server",
        "cd /home/user/poznote-mcp-server/mcp-server && source venv/bin/activate && poznote-mcp serve --transport=stdio"
      ],
      "env": {
        "POZNOTE_API_URL": "http://localhost:8040/api/v1",
        "POZNOTE_USERNAME": "your-poznote-username",
        "POZNOTE_PASSWORD": "your-poznote-password",
        "POZNOTE_DEFAULT_WORKSPACE": "Poznote",
        "POZNOTE_DEBUG": "1"
      }
    }
  }
}
```

**Important:**
- Replace `user@your-server` with your actual SSH connection
- Replace `your-poznote-username` and `your-poznote-password` with your Poznote credentials
- Adjust the port in `POZNOTE_API_URL` if Poznote runs on a different port (default: 8040)
- Ensure SSH key authentication is configured for passwordless login

---

### Option 2: Local stdio Mode (Windows Native)

For local development without SSH:

**Example `mcp.json`:**

```json
{
  "servers": {
    "poznote": {
      "command": "C:\\Users\\YOUR-USERNAME\\poznote-mcp-server\\mcp-server\\.venv\\Scripts\\poznote-mcp.exe",
      "args": ["serve", "--transport=stdio"],
      "env": {
        "POZNOTE_API_URL": "http://localhost:8040/api/v1",
        "POZNOTE_USERNAME": "your-poznote-username",
        "POZNOTE_PASSWORD": "your-poznote-password",
        "POZNOTE_DEBUG": "1"
      }
    }
  }
}
```

**Important:**
- Use double backslashes (`\\`) in Windows paths
- Replace `YOUR-USERNAME` with your Windows username
- Adjust paths to match your installation location

---

### Option 3: HTTP Mode (Recommended for Production)

**Step 1: Start the MCP server on your Poznote server**

Set environment variables and start the server:

```bash
cd /home/user/poznote-mcp-server/mcp-server
source venv/bin/activate
export POZNOTE_API_URL=http://localhost:8040/api/v1
export POZNOTE_USERNAME=your-poznote-username
export POZNOTE_PASSWORD=your-poznote-password
poznote-mcp serve --transport=http --port=8041
```

**Or run as a systemd service (Linux):**

Create `/etc/systemd/system/poznote-mcp.service`:

```ini
[Unit]
Description=Poznote MCP Server
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/poznote-mcp-server/mcp-server
Environment="POZNOTE_API_URL=http://localhost:8040/api/v1"
Environment="POZNOTE_USERNAME=your-poznote-username"
Environment="POZNOTE_PASSWORD=your-poznote-password"
Environment="POZNOTE_DEFAULT_WORKSPACE=Poznote"
ExecStart=/home/user/poznote-mcp-server/mcp-server/venv/bin/poznote-mcp serve --transport=http --port=8041
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable poznote-mcp
sudo systemctl start poznote-mcp
sudo systemctl status poznote-mcp
```

**Or run as a user systemd service (no sudo required):**

Create `~/.config/systemd/user/poznote-mcp.service`:

```ini
[Unit]
Description=Poznote MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/poznote-mcp-server/mcp-server
Environment="POZNOTE_API_URL=http://localhost:8040/api/v1"
Environment="POZNOTE_USERNAME=your-poznote-username"
Environment="POZNOTE_PASSWORD=your-poznote-password"
Environment="POZNOTE_DEFAULT_WORKSPACE=Poznote"
ExecStart=%h/poznote-mcp-server/mcp-server/venv/bin/poznote-mcp serve --transport=http --port=8041
Restart=always

[Install]
WantedBy=default.target
```

Enable and start the user service:

```bash
systemctl --user daemon-reload
systemctl --user enable poznote-mcp
systemctl --user start poznote-mcp
systemctl --user status poznote-mcp
```

**Step 2: Configure VS Code to connect via HTTP**

**Example `mcp.json`:**

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://your-server:8041/mcp"
    }
  }
}
```

**Important:**
- Replace `your-server` with your server's hostname or IP
- Ensure port 8041 is accessible from your workstation
- Configure firewall rules if needed
- For remote access, consider using SSH tunneling for security:
  ```bash
  ssh -L 8041:localhost:8041 user@your-server
  # Then use: "url": "http://localhost:8041/mcp"
  ```

---

### Verifying Configuration

After configuring, restart VS Code or reload MCP servers:

1. Open Command Palette: `Ctrl + Shift + P` (Windows/Linux) or `Cmd + Shift + P` (Mac)
2. Type: `MCP: List Servers`
3. You should see `poznote` listed
4. Right-click → `Restart` if needed

---

## Environment Variables

Configure these environment variables for the MCP server to connect to your Poznote instance.

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `POZNOTE_API_URL` | URL of the Poznote REST API | `http://localhost:8040/api/v1` | ✅ Yes |
| `POZNOTE_USERNAME` | Username for Basic Auth (same as web login) | `admin` | ✅ Yes |
| `POZNOTE_PASSWORD` | Password for Basic Auth (same as web login) | `your-password` | ✅ Yes |
| `POZNOTE_DEFAULT_WORKSPACE` | Default workspace name | `Poznote` | No |
| `POZNOTE_DEBUG` | Enable debug logging (`0` or `1`) | `1` | No |

### Important Notes

**Finding Your API URL:**
- If Poznote runs on port 8040 (default): `http://localhost:8040/api/v1`
- If Poznote runs on a custom port: `http://localhost:YOUR_PORT/api/v1`
- For remote servers: `http://your-server-ip:8040/api/v1`
- Check your `docker-compose.yml` for the `HTTP_WEB_PORT` variable

**Credentials:**
- Use the **same username and password** you use to log into Poznote's web interface
- These credentials are used for HTTP Basic Authentication with the Poznote API
- If you're unsure about your credentials, try logging into Poznote at `http://localhost:8040` first

**Security:**
- Never commit credentials to version control
- Use environment variables or secure secret management
- For HTTP mode in production, consider using HTTPS and/or SSH tunneling

---

## Troubleshooting

### Common Issues

#### 1. Error 404 Not Found - API endpoint not accessible

**Symptoms:** `Client error '404 Not Found' for url 'http://localhost/api/v1/notes'`

**Causes and Solutions:**

- **Wrong API URL:** 
  - ❌ `http://localhost/api/v1` (missing port)
  - ✅ `http://localhost:8040/api/v1` (correct with port)
  
- **Poznote not running:**
  ```bash
  # Check if Poznote is running
  docker ps | grep poznote
  # Or check the port
  curl http://localhost:8040
  ```

- **Wrong port configured:**
  ```bash
  # Check your docker-compose.yml for HTTP_WEB_PORT
  grep HTTP_WEB_PORT docker-compose.yml
  # Or check your .env file
  cat .env | grep HTTP_WEB_PORT
  ```

**Fix:**
```bash
# Set the correct URL with port
export POZNOTE_API_URL=http://localhost:8040/api/v1
```

---

#### 2. Authentication Failed - 401 Unauthorized

**Symptoms:** `Client error '401 Unauthorized'`

**Causes:**
- Wrong username or password
- User doesn't exist in Poznote

**Fix:**
1. Verify credentials by logging into Poznote web interface at `http://localhost:8040`
2. Update environment variables with correct credentials:
   ```bash
   export POZNOTE_USERNAME=your-actual-username
   export POZNOTE_PASSWORD=your-actual-password
   ```

---

#### 3. MCP Server Not Appearing in VS Code

**Symptoms:** Server not listed in `MCP: List Servers`

**Solutions:**

1. **Check mcp.json syntax:**
   - Ensure valid JSON (no trailing commas, proper quotes)
   - Verify file location:
     - Windows: `%APPDATA%\Code\User\mcp.json`
     - Linux: `~/.config/Code/User/mcp.json`
     - macOS: `~/Library/Application Support/Code/User/mcp.json`

2. **Reload VS Code:**
   - `Ctrl + Shift + P` → `Developer: Reload Window`

3. **Check MCP extension:**
   - Ensure GitHub Copilot extension is installed and activated
   - Check VS Code version (MCP requires recent versions)

---

#### 4. Connection Timeout (HTTP Mode)

**Symptoms:** Cannot connect to `http://your-server:8041/mcp`

**Solutions:**

1. **Check if MCP server is running:**
   ```bash
   # On the server
   ps aux | grep poznote-mcp
   # Or check systemd status
   sudo systemctl status poznote-mcp
   ```

2. **Verify port is listening:**
   ```bash
   netstat -tulpn | grep 8041
   # Or
   ss -tulpn | grep 8041
   ```

3. **Check firewall:**
   ```bash
   # Allow port 8041 (example for ufw)
   sudo ufw allow 8041/tcp
   # Or for firewalld
   sudo firewall-cmd --add-port=8041/tcp --permanent
   sudo firewall-cmd --reload
   ```

4. **Use SSH tunnel if needed:**
   ```bash
   ssh -L 8041:localhost:8041 user@your-server
   # Then use http://localhost:8041/mcp in VS Code
   ```

---

#### 5. Permission Denied (SSH Mode)

**Symptoms:** `Permission denied (publickey)`

**Solutions:**

1. **Set up SSH key authentication:**
   ```bash
   # Generate SSH key if you don't have one
   ssh-keygen -t rsa -b 4096
   # Copy to server
   ssh-copy-id user@your-server
   ```

2. **Test SSH connection:**
   ```bash
   ssh user@your-server "echo Connection successful"
   ```

3. **Use SSH config for easier connection:**
   
   Edit `~/.ssh/config`:
   ```
   Host poznote-server
       HostName your-server
       User your-username
       IdentityFile ~/.ssh/id_rsa
   ```
   
   Then in `mcp.json`, use: `"poznote-server"` instead of `"user@your-server"`

---

#### 6. Debug Mode

Enable detailed logging to troubleshoot:

```bash
export POZNOTE_DEBUG=1
```

In `mcp.json`:
```json
{
  "servers": {
    "poznote": {
      "env": {
        "POZNOTE_DEBUG": "1"
      }
    }
  }
}
```

Check logs:
- **stdio mode:** VS Code Output panel → select "MCP Server"
- **HTTP mode (systemd):** `journalctl -u poznote-mcp -f`
- **HTTP mode (manual):** Check console output or log file

---

#### 7. Testing API Connection Manually

Verify Poznote API is accessible:

```bash
# Test API endpoint
curl -u 'your-username:your-password' http://localhost:8040/api/v1/notes

# Should return JSON with your notes
```

If this fails, the issue is with Poznote itself, not the MCP server.

--- 


## Example Prompts

Once configured, you can use natural language in VS Code Copilot Chat to interact with Poznote:

### Getting Notes
- "Get the content of note ID 100034"
- "Display note 'Meeting Notes'"
- "Show me note 100041"

### Listing & Searching
- "List all notes in workspace 'Personal'"
- "Show all notes"
- "Search for notes about 'MCP'"
- "Find notes tagged with 'important'"

### Creating Notes
- "Create a note called 'Project Ideas' in workspace 'Work'"
- "Create a new note titled 'Shopping List'"
- "Make a note 'TODO' with content 'Buy groceries'"

### Updating Notes
- "Update note 100041 with new content"
- "Modify note 'Meeting Notes' to add action items"
- "Add tag 'urgent' to note 100034"

### Managing Folders
- "Create a folder 'Projects' in workspace 'Work'"
- "Create a subfolder 'Q1 2026' inside 'Projects'"
- "Make a new folder called 'Archive'"

### Deleting
- "Delete note 100034"
- "Remove note 'Old Draft'"

**Tip:** The AI understands context, so you can reference notes by ID or title, and chain multiple operations together.

---
