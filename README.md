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
- 📱 Responsive design for all devices
- 🖥️ Multi-instance support
- 🔒 Self-hosted with secure authentication
- 💾 Built-in backup and export tools
- 🗑️ Trash system with restore functionality
- 🌐 REST API for automation


![alt text](image.png)

![alt text](image-1.png)

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Backup and Restore](#backup-and-restore)
- [API Documentation](#api-documentation)
- [Advanced Usage](#advanced-usage)

## Installation

PozNote runs in a Docker container, making it incredibly easy to deploy anywhere. You can:

- **Run locally** on your computer using Docker Desktop (Windows) or Docker Engine (Linux/macOS)
- **Deploy on a server** to access your notes from anywhere - phone, tablet, or any web browser

*Real-world example: Successfully deployed on a Debian VPS (Hostinger) with HTTPS enabled through Nginx Proxy Manager for secure remote access.*

### Prerequisites

**Windows:**
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)

**Linux/macOS:**
- [Docker Engine](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Quick Start

**Windows (PowerShell):**
```powershell
$instanceName = Read-Host "Choose an instance name (poznote, poznote-work, my-notes, etc.)"
git clone https://github.com/timothepoznanski/poznote.git $instanceName
cd $instanceName
.\setup.ps1
```

**Linux/macOS:**
```bash
read -p "Choose an instance name (poznote, poznote-work, my-notes, etc.): " instanceName
git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
cd "$instanceName"
chmod +x setup.sh
./setup.sh
```

### Access Your Instance

After installation, access Poznote at: `http://localhost:YOUR_PORT`

The setup script will display the exact URL and credentials.

### Multiple Instances

You can run multiple isolated Poznote instances:

```bash
# Personal notes
git clone https://github.com/timothepoznanski/poznote.git poznote-personal
cd poznote-personal
./setup.sh  # Configure with port 8040

# Work notes  
cd ..
git clone https://github.com/timothepoznanski/poznote.git poznote-work
cd poznote-work
./setup.sh  # Configure with port 8041
```

Each instance has:
- Separate authentication and data
- Different ports (8040, 8041, etc.)
- Independent configuration

## Configuration

### Update Settings

To change your username, password, port, or application name:

**Linux/macOS:**
```bash
./setup.sh
```

**Windows:**
```powershell
.\setup.ps1
```

Select option 2 (Change settings) from the menu. The script will preserve all your data.

### Reset Password

If you've forgotten your password:

1. Run the setup script and select "Change settings"
2. Enter any value for the current password (it will be ignored)
3. Set your new password
4. Your notes and data remain intact

### Update Application

To update Poznote to the latest version:

1. Run the setup script and select "Update application"
2. The script will pull updates while preserving your configuration and data

## Backup and Restore

Poznote includes built-in backup functionality accessible through Settings → "Export/Import Database".

### Backup Options

- **📝 Export Notes** - Complete ZIP with all your notes (includes offline viewer)
- **📎 Export Attachments** - All file attachments as ZIP
- **🗄️ Export Database** - SQLite database dump

### Restore Options

- **Complete Restore** - Requires notes + attachments + database for full functionality
- **Offline Viewing** - Exported notes work independently with included `index.html`

⚠️ **Important:** Database import completely replaces current data. The database contains metadata (titles, tags, dates) while actual note content is stored in HTML files.

### Docker Data Structure

**Persistent Volumes:**
```
data/
├── database/          # SQLite database
│   └── poznote.db
├── entries/          # Note content (HTML files)  
│   ├── 1.html
│   └── 2.html
└── attachments/      # File attachments
    └── uploaded_files
```

**Services:**
- 🌐 **webserver** - Apache/PHP with embedded SQLite

## API Documentation

Poznote provides a REST API for programmatic access to notes and folders.

### Authentication

All API requests require HTTP Basic authentication:
```bash
curl -u username:password http://localhost:8040/api_endpoint.php
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
curl -u username:password http://localhost:8040/api_list_notes.php
```

#### Create Note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "tags": "personal,important",
    "folder": "Projects"
  }'
```

#### Create Folder
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

#### Move Note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "folder_name": "Work Projects"
  }'
```

#### Delete Note
```bash
# Soft delete (to trash)
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123"}'

# Permanent delete
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "permanent": true
  }'
```

#### Delete Folder
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Note:** The `Uncategorized` folder cannot be deleted. When a folder is deleted, all its notes are moved to `Uncategorized`.

## Advanced Usage

### Manual Configuration

For advanced users who prefer direct configuration:

**Environment Variables (.env file):**
```bash
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123  
HTTP_WEB_PORT=8040
APP_NAME_DISPLAYED=Poznote
SQLITE_DATABASE=/var/www/html/data/database/poznote.db
```

**Manual Setup:**
1. Copy `.env.template` to `.env`
2. Edit configuration values
3. Run `docker compose up -d --build`

### Manual Operations

**Update:** `git pull origin main && docker compose down && docker compose up -d --build`

**Backup:** Copy `./data/` directory (contains entries, attachments, database)

**Restore:** Replace `./data/` directory and restart container

### Password Reset (CLI)

Alternative method for password reset:
1. Stop: `docker compose down`
2. Edit `.env` file: `POZNOTE_PASSWORD=new_password`  
3. Restart: `docker compose up -d`
