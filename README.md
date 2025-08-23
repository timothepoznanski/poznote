
<div align="center" style="border:2px solid #0078d7; border-radius:8px; padding:20px; background:#f0f8ff; margin-bottom:20px;">
<h3 style="margin:0; display:flex; justify-content:center; align-items:center;">
<a href="README.fr.md" style="text-decoration:none; display:flex; align-items:center;">
  <span>Cliquez ici pour lire cette documentation en français</span>
  <img src="https://flagcdn.com/24x18/fr.png" alt="FR flag" style="margin-left:10px;">
</a>
</h3>
</div>

# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)](https://www.sqlite.org/)

A powerful note-taking application that puts you in complete control of your data. Poznote can be installed locally on your computer or on a remote server to access your notes from your phone or your computer web browser.

## Features

- 📝 Rich Text Editor
- 🔍 Powerful Search
- 🏷️ Tag system
- 📎 File Attachments
- 🤖 AI-powered features
- 📱 Responsive design for all devices
- 🖥️ Multi-instance support
- 🔒 Self-hosted with secure authentication
- 💾 Built-in backup and export tools
- 🗑️ Trash system with restore functionality
- 🌐 REST API for automation

## Examples

![alt text](image.png)

![alt text](image-1.png)

## Table of Contents

- [Installation](#installation)
- [Access Your Instance](#access-your-instance)
- [Multiple Instances](#multiple-instances)
- [Change Settings](#change-settings)
- [Reset Password](#reset-password)
- [Update Application](#update-application)
- [Backup and Restore](#backup-and-restore)
- [Offline View](#offline-view)
- [AI Features](#ai-features)
- [API Documentation](#api-documentation)
- [Manual Operations](#manual-operations)

## Installation

Poznote runs in a Docker container, making it incredibly easy to deploy anywhere. You can:

- **Run locally** on your computer using Docker Desktop (Windows) or Docker Engine (Linux)
- **Deploy on a server** to access your notes from anywhere - phone, tablet, or any web browser

### Prerequisites (Docker installation)

**🐳 What is Docker?**
Docker is a platform that packages and runs applications in isolated containers. Poznote uses Docker to simplify installation and ensure the application works consistently across all systems.

**Windows:**
1. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Follow the installation wizard (restart required)
3. Launch Docker Desktop from Start menu
4. Wait for Docker to start (Docker icon in system tray)

**Linux:**
1. Install Docker Engine based on your distribution:
   - **Ubuntu/Debian:** `curl -fsSL https://get.docker.com | sh`
   - **CentOS/RHEL:** Follow the [official guide](https://docs.docker.com/engine/install/centos/)
   - **Arch Linux:** `sudo pacman -S docker docker-compose`
2. Start Docker: `sudo systemctl start docker && sudo systemctl enable docker`
3. Add your user to docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```
4. Restart your session
5. Test installation: `docker --version && docker compose version`

### Quick Start (Poznote installation)

**Windows (PowerShell):**
```powershell
function Test-DockerConflict($name) { return (docker ps -a --format "{{.Names}}" | Select-String "^${name}-webserver-1$").Count -eq 0 }; do { $instanceName = Read-Host "
Choose an instance name (poznoteapp, poznotework, mynotes, etc.) [poznote]"; if ([string]::IsNullOrWhiteSpace($instanceName)) { $instanceName = "poznote" }; if (-not ($instanceName -match "^[a-z0-9]+$")) { Write-Host "⚠️  Name must contain only lowercase letters and numbers, without spaces." -ForegroundColor Yellow; continue }; if (-not (Test-DockerConflict $instanceName)) { Write-Host "⚠️  Docker container '${instanceName}-webserver-1' already exists!" -ForegroundColor Yellow; continue }; break } while ($true); git clone https://github.com/timothepoznanski/poznote.git $instanceName; cd $instanceName; .\setup.ps1
```

**Linux (Bash):**
```bash
check_conflicts() { local name="$1"; if docker ps -a --format "{{.Names}}" | grep -q "^${name}-webserver-1$"; then echo "⚠️  Docker container '${name}-webserver-1' already exists!"; return 1; fi; return 0; }; while true; do read -p "
Choose an instance name (poznoteapp, poznotework, mynotes, etc.) [poznote]: " instanceName; instanceName=${instanceName:-poznote}; if [[ "$instanceName" =~ ^[a-z0-9]+$ ]] && check_conflicts "$instanceName"; then break; else echo "⚠️  Name must contain only lowercase letters and numbers, without spaces."; fi; done; git clone https://github.com/timothepoznanski/poznote.git "$instanceName"; cd "$instanceName"; chmod +x setup.sh; ./setup.sh
```

## Access Your Instance

After installation, access Poznote at: `http://YOUR_SERVER:YOUR_PORT`

where YOUR_SERVER depends on your environment:

- localhost
- Your server's IP address
- Your domain name

The setup script will display the exact URL and credentials.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Simply run the setup script multiple times with different instance names and ports.

Each instance will have:
- Separate Docker containers
- Independent data storage
- Different ports
- Isolated configurations

### Example: Personal and Work instances on the same server

```
Server: my-server.com
├── Poznote Personal
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-personal-webserver-1
│   └── Data: ./poznote-personal/data/
│
└── Poznote Work
    ├── Port: 8041
    ├── URL: http://my-server.com:8041
    ├── Container: poznote-work-webserver-1
    └── Data: ./poznote-work/data/
```

For deployments on different servers, you only need to run the setup script and use menu option 2 to update the displayed application name parameter - no need for different instance names or ports.

## Change Settings

To change your username, password, port, or application name:

**Linux:**
```bash
./setup.sh
```

**Windows:**
```powershell
.\setup.ps1
```

Select option 2 (Change settings) from the menu. The script will preserve all your data.

## Reset Password

If you've forgotten your password, run the setup script and select "Change settings".

## Update Application

You can check if your application is up to date directly from the Poznote interface by using the **Settings → Check Updates** menu option.

To update Poznote to the latest version, run the setup script and select "Update application". The script will pull updates while preserving your configuration and data.

## Backup and Restore

Poznote includes built-in backup functionality accessible through Settings → "Export/Import Database".

### Backup Options

- **📝 Export Notes** - Complete ZIP with all your notes (Allows offline viewing without Poznote)
- **📎 Export Attachments** - All file attachments as ZIP
- **🗄️ Export Database** - SQLite database dump

### Restore Options

- **Complete Restore** - Requires notes + attachments + database for full functionality
- **Offline Viewing** - Exported notes work independently with included `index.html`

⚠️ **Important:** Database import completely replaces current data. The database contains metadata (titles, tags, dates) while actual note content is stored in HTML files.

### Automatic Database Backup

🔒 **Safety Feature:** Every time you import/restore a database through the web interface, Poznote automatically creates a backup of your current database before proceeding.

- **Location:** `data/database/poznote.db.backup.YYYY-MM-DD_HH-MM-SS`
- **Format:** Timestamped backup files (e.g., `poznote.db.backup.2025-08-15_14-36-19`)
- **Purpose:** Allows recovery if import fails or data needs to be rolled back

## Offline View

When you export notes using the **📝 Export Notes** option, you get a ZIP file containing all your notes in HTML format along with a special `index.html` file. This creates a completely standalone offline version of your notes that works without Poznote installed.

**Features of offline view:**
- **Search by title and tags** - Find notes quickly using the search functionality of your browser
- **No installation required** - Works in any web browser
- **Portable** - Share or archive your notes easily

Simply extract the ZIP file and open `index.html` in any web browser to access your notes offline.

## AI Features

Poznote includes powerful AI capabilities powered by OpenAI to enhance your note-taking experience. These features are optional and require an OpenAI API key to function.

### Available AI Features

- **🤖 AI Summarization** - Generate intelligent summaries of your notes to quickly understand key points
- **🏷️ Auto Tag Generation** - Automatically generate relevant tags based on your note content
- **🔍 Check Content** - Verify the accuracy, coherence, and logical consistency of your note content

### Setup AI Features

1. **Get an OpenAI API Key**
   - Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create an account or sign in
   - Generate a new API key

2. **Configure Poznote**
   - Go to **Settings → AI Settings** in your Poznote interface
   - Enable AI features by checking the box
   - Enter your OpenAI API key
   - Save the configuration

3. **Start Using AI Features**
   - Open any note and look for AI buttons in the toolbar
   - Use **AI Summary** to generate note summaries
   - Use **Auto Tags** to suggest relevant tags
   - Use **Correct Faults** to fix grammar and style issues

### Requirements

- ✅ Active internet connection
- ✅ Valid OpenAI API key
- ✅ Sufficient OpenAI credits in your account

### Privacy & Data

When AI features are enabled:
- Note content is sent to OpenAI's servers for processing
- Data is processed according to [OpenAI's privacy policy](https://openai.com/privacy/)
- You can disable AI features at any time in settings

## API Documentation

Poznote provides a REST API for programmatic access to notes and folders.

### Authentication

All API requests require HTTP Basic authentication:
```bash
curl -u 'username:password' http://localhost:8040/API_ENDPOINT_NAME.php
```

### Base URL

Access the API at your Poznote instance:
```
http://YOUR_SERVER:HTTP_WEB_PORT/
```

### Response Format

**HTTP Status Codes:**
- `200` - Success (updates, deletes)
- `201` - Created  
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Server Error

**Success Response:**
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { /* response data */ }
}
```

**Error Response:**
```json
{
  "error": "Error description",
  "details": "Additional details (optional)"
}
```

### Endpoints

#### List Notes
```bash
curl -u 'username:password' http://localhost:8040/api_list_notes.php
```

#### Create Note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "tags": "personal,important",
    "folder_name": "Projects"
  }'
```
**Required parameters:**
- `heading` (string) - The note title
**Optional parameters:**
- `tags` (string) - Comma-separated tags
- `folder_name` (string) - Folder name (defaults to "Uncategorized")

#### Create Folder
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```
**Required parameters:**
- `folder_name` (string) - The folder name

#### Move Note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "folder_name": "Work Projects"
  }'
```
**Required parameters:**
- `note_id` (string) - The ID of the note to move
- `folder_name` (string) - The target folder name

#### Delete Note
```bash
# Soft delete (to trash)
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123"}'

# Permanent delete
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "permanent": true
  }'
```

#### Delete Folder
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Note:** The `Uncategorized` folder cannot be deleted. When a folder is deleted, all its notes are moved to `Uncategorized`.

## Manual Operations

For advanced users who prefer direct configuration:

**Change settings:**

1. Stop Poznote: `docker compose down`
2. Edit `.env` file
3. Restart Poznote: `docker compose up -d`

**Update Poznote to the latest version:** 

```bash
git pull origin main && docker compose down && docker compose up -d --build
```

**Backup:** 

Copy `./data/` directory (contains entries, attachments, database)

**Restore:** 

Replace `./data/` directory and restart container

**Password Reset:**

1. Stop Poznote: `docker compose down`
2. Edit `.env` file: `POZNOTE_PASSWORD=new_password`  
3. Restart Poznote: `docker compose up -d`
