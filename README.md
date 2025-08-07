# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-orange?logo=mysql)](https://www.mysql.com/)

A powerful note-taking tool with full control over your data.

## Features

- 📝 Rich Text Editor
- 🔍 Powerful Search
- 🏷️ Tag System
- 📎 File Attachments
- 📱 Responsive Design
- 🖥️ Multi-instance
- 🔒 Self-Hosted
- 💾 Built-in backup and export
- 🗑️ Trash System
- 🌐 REST API

## Demo

Try Poznote without installing anything! A live demo is available at:

**🌐 Demo URL:** [https://poznote.com](https://poznote.com)

**Login credentials:**
- **Username:** `demo`
- **Password:** `demo`

*Note: The demo environment is reset periodically. Any notes you create will not be permanently saved.*

## Table of Contents

- [Installation](#installation)
- [Change Login, Password, Application Name Displayed, or Port](#change-login-password-application-name-displayed-or-port)
- [Update Poznote application](#update-poznote-application)
- [Backup and Restore](#backup-and-restore)
- [Docker Architecture](#docker-architecture)
- [API](#api)

## Installation

Poznote runs in Docker and works seamlessly on both Windows and Linux.

### Windows

**Prerequisites:**
- Install **[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)**

#### Option 1: Automated Setup

Open PowerShell in the directory where you want to install Poznote and execute the following commands:

```powershell
$instanceName = Read-Host "Choose an instance name (poznote-tom, poznote-perso, poznote-pro, my-notes etc.)"
git clone https://github.com/timothepoznanski/poznote.git $instanceName
cd $instanceName
.\setup.ps1
```

The script will automatically:
- ✅ Verify Docker installation
- 🔍 Detect existing installations
- 📋 Guide you through configuration  
- 🚀 Start Poznote with your settings
- 📝 Set default application name to "Poznote" (can be changed later)

#### Option 2: Manual Setup

1. **Choose instance name and clone the repository**
   
   Open PowerShell in the directory where you want to install Poznote and execute the following commands:
   
   ```powershell
   $instanceName = Read-Host "Choose an instance name (poznote-tom, poznote-perso, poznote-pro, my-notes etc.)"
   git clone https://github.com/timothepoznanski/poznote.git $instanceName
   cd $instanceName
   ```

2. **Configure environment**
   ```powershell
   copy .env.template .env
   notepad .env
   ```

3. **Customize settings**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use
   - **Note**: If you plan to run multiple instances on the same server, each instance must use a different port (e.g., 8040, 8041, 8042)
   - **Note**: The application name displayed defaults to "Poznote". You can change it later by running the setup script again.

4. **Start Poznote**
   ```powershell
   docker compose up -d --build
   ```

### Linux/macOS

**Prerequisites:**
- **[Docker Engine](https://docs.docker.com/engine/install/)** (v20.10+)
- **[Docker Compose](https://docs.docker.com/compose/install/)** (v2.0+)

#### Option 1: Automated Setup

```bash
read -p "Choose an instance name (poznote-tom, poznote-perso, poznote-pro, my-notes etc.): " instanceName
git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
cd "$instanceName"
chmod +x setup.sh
./setup.sh
```

The script will automatically:
- ✅ Verify Docker installation
- 🔍 Detect existing installations  
- 📋 Guide you through configuration
- 🚀 Start Poznote with your settings
- 📝 Set default application name to "Poznote" (can be changed later)

#### Option 2: Manual Setup

1. **Choose instance name and clone the repository**
   ```bash
   read -p "Choose an instance name (poznote-tom, poznote-perso, poznote-pro, my-notes etc.): " instanceName
   git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
   cd "$instanceName"
   ```

2. **Configure environment**
   ```bash
   cp .env.template .env
   vim .env
   ```

3. **Customize settings**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use
   - **Note**: If you plan to run multiple instances on the same server, each instance must use a different port (e.g., 8040, 8041, 8042)
   - **Note**: The application name displayed defaults to "Poznote". You can change it later by running the setup script again.

4. **Start Poznote**
   ```bash
   docker compose up -d --build
   ```

### Access URLs

After starting Poznote, you can access it at:
- **URL Pattern**: `http://YOUR_SERVER:HTTP_WEB_PORT`

Where `YOUR_SERVER` depends on your environment:
- `localhost`
- Your server's IP address
- Your domain name

### Running Multiple Instances

You can run multiple Poznote instances on the same server by using different instance names and ports:

```bash
# First instance
read -p "Choose an instance name: " instanceName  # Example: poznote-personal
git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
cd "$instanceName"
./setup.sh  # Configure with port 8040

# Second instance (in a different directory)
cd ..
read -p "Choose another instance name: " instanceName  # Example: poznote-work
git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
cd "$instanceName"
./setup.sh  # Configure with port 8041
```

**Important**: 
- Each instance must use a **different port** (the setup script will check and prompt if a port is already in use)
- Each instance will have **isolated PHP sessions** - login on one instance doesn't affect others
- You can use different usernames/passwords for each instance

**Example configuration**:
- `poznote-personal`: Port 8040, username "alice", password "personal123"
- `poznote-work`: Port 8041, username "bob", password "work456"
- `poznote-demo`: Port 8042, username "demo", password "demo123"

## Change Login, Password, Application Name Displayed, or Port

### Option 1: Automated Configuration Change

**Linux/macOS:**
```bash
./setup.sh
```
Then select option 2 (Change configuration) from the menu.

**Windows:**
```powershell
.\setup.ps1
```
Then select option 2 (Change configuration) from the menu.

The script will:
- 📋 Show your current configuration
- ✏️ Allow you to update username, password, port and application name
- 🔄 Restart services automatically
- 🛡️ Preserve all your data

### Option 2: Manual Configuration Change

Open the folder of your project and edit the `.env` file to customize your installation:

```bash
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123
HTTP_WEB_PORT=8040
APP_NAME_DISPLAYED=Poznote
```

**Configuration options:**
- `POZNOTE_USERNAME` - Username for authentication
- `POZNOTE_PASSWORD` - Password for authentication  
- `HTTP_WEB_PORT` - Port where the application will be accessible
- `APP_NAME_DISPLAYED` - **Application name displayed** in the interface

**To modify settings manually:**

1. **Edit the .env file**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use
   - Optionally modify `APP_NAME_DISPLAYED=Poznote` to customize the **application name displayed** in the interface
   - **Note**: If you plan to run multiple instances on the same server, each instance must use a different port (e.g., 8040, 8041, 8042)

2. **Restart the application**

```bash
docker compose down
docker compose up -d
```

## Update Poznote application

You can update Poznote to the latest version using either the automated script or manual commands.

- **Automated Update**: Use the provided setup script to pull the latest code and restart the application while preserving your data and configuration.
- **Manual Update**: Pull the latest code from the repository and rebuild the Docker containers.

### Option 1: Automated Update

**Linux/macOS:**
```bash
./setup.sh
```
Then select option 1 (Update application) from the menu.

**Windows:**
```powershell
.\setup.ps1
```
Then select option 1 (Update application) from the menu.

The script will:
- 🔄 Pull the latest code automatically
- 🛡️ Preserve your existing configuration and data
- 🚀 Restart services with updates

### Option 2: Manual Update

To update Poznote manually to the latest version:

```bash
git pull origin main && docker compose down && docker compose up -d --build
```

## Backup and Restore

Poznote offers different backup options depending on your needs.

**Complete Application Restore**:
- Requires all 3 components: Notes (HTML files) + Attachments + Database
- Use this for full Poznote restoration (new server or current installation)

**Offline Notes Consultation (without Poznote)**:
- Export notes as ZIP file → Contains all HTML files + `index.html` menu
- No Poznote installation needed, works anywhere

⚠️ Database contains only note metadata like titles, tags, dates - not the actual note content which is stored in HTML files

### Backup

#### Option 1: Backup through the web interface

Poznote includes built-in backup functionality through the web interface in Settings → "Export/Import Database"

Available backup options:
- **📝 Export Notes** - Download complete ZIP with all your notes
- **📎 Export Attachments** - Download all file attachments  
- **🗄️ Export Database** - Download SQL dump

#### Option 2: Manual backups

- To backup your notes, copy your html files found in `./data/entries`
- To backup your attachements, copy your files found in `./data/attachments`
- To backup your database:

```bash
docker compose exec database mysqldump -u root -psfs466sfdgGH poznote_db > backup.sql
```

### Restore

#### Option 1: Restore through the web interface

Poznote includes built-in restore functionality through the web interface in Settings → "Export/Import Database"

**⚠️ Warning**: Database import will completely replace your current data!  
**ℹ️ Important**: Database contains only metadata (titles, tags, dates) - actual note content is stored in HTML files.

#### Option 2: Manual restore

**Restore notes and attachments**
```bash
# Stop Poznote
docker compose down
```

Copy your files to `./data/entries/` and `./data/attachments/`

Then restart Poznote:

```bash
# Start Poznote
docker compose up -d
```

**Restore database from SQL**

```bash
# Import SQL backup into database
docker compose exec -T database mysql -u root -psfs466sfdgGH poznote_db < backup.sql
```

### Docker Architecture

**Services:**
- 🌐 **webserver** - Apache/PHP serving the application
- 🗄️ **database** - MySQL for data storage

**Persistent Volumes:**
- 📁 `./data/entries` - Your note files (HTML format)
- 📎 `./data/attachments` - File attachments  
- 🗄️ `./data/mysql` - Database files

## API

Poznote provides a RESTful API for programmatic access to your notes.

### Authentication

All API requests require authentication using the same credentials configured in your `.env` file for each instance.

### HTTP Response Codes

The API uses standard HTTP status codes to indicate the success or failure of requests:

| Code | Status | Description |
|------|--------|-------------|
| **200** | OK | Request successful (for updates, deletes) |
| **201** | Created | Resource created successfully |
| **400** | Bad Request | Invalid request data (missing parameters, invalid JSON, etc.) |
| **401** | Unauthorized | Authentication failed or missing credentials |
| **404** | Not Found | Requested resource (note, folder) does not exist |
| **405** | Method Not Allowed | HTTP method not supported for this endpoint |
| **409** | Conflict | Resource already exists (duplicate folder name) |
| **500** | Internal Server Error | Server error (database issues, file system errors) |

**Error Response Format:**
```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

**Success Response Format:**
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { /* response data */ }
}
```

### Available Endpoints

#### List Notes
```bash
curl -u username:password http://localhost:8040/api_list_notes.php
```

**Response (200 OK):**
```json
{
  "success": true,
  "notes": [
    {
      "id": "123",
      "heading": "My Note",
      "tags": "personal,important",
      "created": "2025-01-15 10:30:00"
    }
  ]
}
```

#### Create Note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "tags": "personal,important"}'
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Note created successfully",
  "note_id": "124"
}
```

#### Create Folder
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Folder 'Work Projects' created successfully",
  "folder_path": "/var/www/html/data/entries/Work Projects"
}
```

**Error Response (409 Conflict):**
```json
{
  "error": "Folder 'Work Projects' already exists"
}
```

#### Move Note to Folder
```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123", "folder_name": "Work Projects"}'
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Note moved successfully to folder 'Work Projects'",
  "new_file_path": "/var/www/html/data/entries/Work Projects/123.html"
}
```

**Error Response (404 Not Found):**
```json
{
  "error": "Note with ID 123 not found"
}
```

#### Delete Note
```bash
# Soft delete (move to trash)
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123"}'
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Note moved to trash successfully"
}
```

```bash
# Permanent delete
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123", "permanent": true}'
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Note permanently deleted",
  "files_deleted": {
    "html_file": "/var/www/html/data/entries/123.html",
    "attachments": ["file1.pdf", "image.jpg"]
  }
}
```

#### Delete Folder
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Folder 'Work Projects' deleted successfully",
  "notes_moved": {
    "total": 5,
    "active": 3,
    "trash": 2
  },
  "folder_removed": "/var/www/html/data/entries/Work Projects"
}
```

**Error Response (400 Bad Request) - Protected Folder:**
```json
{
  "error": "Cannot delete the Uncategorized folder"
}
```

**⚠️ Protected Folders:**
- The `Uncategorized` folder cannot be deleted as it serves as the default location for notes without a specific folder
- When a folder is deleted, all its notes are automatically moved to `Uncategorized` to prevent data loss