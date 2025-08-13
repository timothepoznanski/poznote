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

![alt text](image.png)

![alt text](image-1.png)

## Table of Contents

- [Installation](#installation)
- [Update settings](#update-settings-password-displayed-name-database-etc)
- [Update Poznote application](#update-poznote-application)
- [Backup and Restore](#backup-and-restore)
- [Docker Architecture](#docker-architecture)
- [API](#api)
- [Advanced Configuration](#advanced-configuration)

## Installation

Poznote is designed to run seamlessly in Docker containers, making installation and updates simple and consistent across all platforms.

### Windows

**Prerequisites:**
- Install **[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)**

Open PowerShell in the directory where you want to install Poznote and execute the following commands:

```powershell
$instanceName = Read-Host "Choose an instance name (poznote, poznote-tom, poznote-perso, poznote-pro, my-notes etc.)"
git clone https://github.com/timothepoznanski/poznote.git $instanceName
cd $instanceName
.\setup.ps1
```

### Linux/macOS

**Prerequisites:**
- **[Docker Engine](https://docs.docker.com/engine/install/)**
- **[Docker Compose](https://docs.docker.com/compose/install/)**

```bash
read -p "Choose an instance name (poznote, poznote-tom, poznote-perso, poznote-pro, my-notes etc.): " instanceName
git clone https://github.com/timothepoznanski/poznote.git "$instanceName"
cd "$instanceName"
chmod +x setup.sh
./setup.sh
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

## Update settings (Password, displayed name, database etc.)

**Linux/macOS:**
```bash
./setup.sh
```

**Windows:**
```powershell
.\setup.ps1
```
Then select option 2 (Change settings) from the menu.

The script will:
- 📋 Show your current configuration
- ✏️ Allow you to update username, password, port and application name
- 🔄 Restart services automatically
- 🛡️ Preserve all your data

## Update Poznote application

You can update Poznote to the latest version using the automated script.

**Linux/macOS:**
```bash
./setup.sh
```

**Windows:**
```powershell
.\setup.ps1
```
Then select option 1 (Update application) from the menu.

The script will:
- 🔄 Pull the latest code automatically
- 🛡️ Preserve your existing configuration and data
- 🚀 Restart services with updates

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

Poznote includes built-in backup functionality through the web interface in Settings → "Export/Import Database"

Available backup options:
- **📝 Export Notes** - Download complete ZIP with all your notes
- **📎 Export Attachments** - Download all file attachments  
- **🗄️ Export Database** - Download SQL dump

### Restore

Poznote includes built-in restore functionality through the web interface in Settings → "Export/Import Database"

**⚠️ Warning**: Database import will completely replace your current data!  
**ℹ️ Important**: Database contains only metadata (titles, tags, dates) - actual note content is stored in HTML files.

### Docker Architecture

**Services:**
- 🌐 **webserver** - Apache/PHP serving the application
- 🗄️ **database** - MySQL for data storage

**Persistent Volumes:**
- 📁 `./data/entries` - Your note files (HTML format)
- 📎 `./data/attachments` - File attachments  
- 🗄️ `./data/mysql` - Database files

## API

Poznote provides a comprehensive REST API for programmatic access to your notes and folders.

### 🔐 Authentication

All API requests require HTTP Basic authentication using the same credentials configured in your `.env` file.

**Authentication format:**
```bash
curl -u username:password http://localhost:8040/api_endpoint.php
```

### 📡 Base URL

The API is accessible at your Poznote instance address:
```
http://YOUR_SERVER:HTTP_WEB_PORT/
```

**Examples:**
- `http://localhost:8040/` (local installation)
- `http://myserver.com:8040/` (remote server)

### 📝 Response Format

#### HTTP Status Codes

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

#### Error Response Format
```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

#### Success Response Format
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { /* response data */ }
}
```

### 🛠️ Available Endpoints

**Quick Reference:**
- `GET /api_list_notes.php` - List all notes
- `POST /api_create_note.php` - Create a new note
- `POST /api_create_folder.php` - Create a new folder
- `POST /api_move_note.php` - Move note to folder
- `DELETE /api_delete_note.php` - Delete note (soft/permanent)
- `DELETE /api_delete_folder.php` - Delete folder

---

#### 📋 List Notes

**Retrieves all your notes with their metadata.**

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
      "folder": "Projects",
      "created": "2025-01-15 10:30:00",
      "updated": "2025-01-16 14:20:00",
      "favorite": 0,
      "trash": 0
    }
  ]
}
```

---

#### ✏️ Create Note

**Creates a new note with a title and optional tags.**

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

**Parameters:**
- `heading` (required): Note title
- `tags` (optional): Comma-separated tags
- `folder` (optional): Folder name (default: "Uncategorized")

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Note created successfully",
  "note_id": "124"
}
```

---

#### 📁 Create Folder

**Creates a new folder to organize your notes.**

```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Parameters:**
- `folder_name` (required): Name of the folder to create

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Folder 'Work Projects' created successfully",
  "folder_path": "/var/www/html/data/entries/Work Projects"
}
```

**Error (409 Conflict):**
```json
{
  "error": "Folder 'Work Projects' already exists"
}
```

---

#### 📂 Move Note

**Moves a note to a specific folder.**

```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "folder_name": "Work Projects"
  }'
```

**Parameters:**
- `note_id` (required): ID of the note to move
- `folder_name` (required): Destination folder name

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Note moved successfully to folder 'Work Projects'",
  "new_file_path": "/var/www/html/data/entries/Work Projects/123.html"
}
```

**Error (404 Not Found):**
```json
{
  "error": "Note with ID 123 not found"
}
```

---

#### 🗑️ Delete Note

**Deletes a note (soft delete to trash or permanent deletion).**

**Soft delete (move to trash):**
```bash
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

**Permanent delete:**
```bash
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "permanent": true
  }'
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

---

#### 🗂️ Delete Folder

**Deletes a folder and moves all its notes to "Uncategorized".**

```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects"}'
```

**Parameters:**
- `folder_name` (required): Name of the folder to delete

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

**Error (400 Bad Request) - Protected Folder:**
```json
{
  "error": "Cannot delete the Uncategorized folder"
}
```

### ⚠️ Protected Folders

- The `Uncategorized` folder cannot be deleted as it serves as the default location for notes without a specific folder
- When a folder is deleted, all its notes are automatically moved to `Uncategorized` to prevent data loss

### 💡 Usage Examples

**Complete workflow:**
```bash
# 1. Create a folder
curl -X POST http://localhost:8040/api_create_folder.php \
  -u admin:mypassword \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "My Projects"}'

# 2. Create a note in this folder
curl -X POST http://localhost:8040/api_create_note.php \
  -u admin:mypassword \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "Project Ideas",
    "tags": "brainstorming,important",
    "folder": "My Projects"
  }'

```bash
# 3. List all notes
curl -u admin:mypassword http://localhost:8040/api_list_notes.php
```

## Advanced Configuration

This section contains optional manual configuration methods for advanced users who prefer more control over the setup process.

### Manual Installation Setup

#### Windows - Manual Setup

1. **Choose instance name and clone the repository**
   
   Open PowerShell in the directory where you want to install Poznote and execute the following commands:
   
   ```powershell
   $instanceName = Read-Host "Choose an instance name (poznote, poznote-tom, poznote-perso, poznote-pro, my-notes etc.)"
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

#### Linux/macOS - Manual Setup

1. **Choose instance name and clone the repository**
   ```bash
   read -p "Choose an instance name (poznote, poznote-tom, poznote-perso, poznote-pro, my-notes etc.): " instanceName
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

### Manual Configuration Change

Open the folder of your project and edit the `.env` file to customize your installation:

```bash
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123
HTTP_WEB_PORT=8040
APP_NAME_DISPLAYED=Poznote
MYSQL_ROOT_PASSWORD=sfs466sfdgGH
MYSQL_DATABASE=poznote_db
MYSQL_USER=poznote_user
MYSQL_PASSWORD=RGG45566vfgdfgv
```

**Configuration options:**
- `POZNOTE_USERNAME` - Username for authentication
- `POZNOTE_PASSWORD` - Password for authentication  
- `HTTP_WEB_PORT` - Port where the application will be accessible
- `APP_NAME_DISPLAYED` - **Application name displayed** in the interface
- `MYSQL_ROOT_PASSWORD` - MySQL root password
- `MYSQL_DATABASE` - MySQL database name
- `MYSQL_USER` - MySQL user for the application
- `MYSQL_PASSWORD` - MySQL user password

**To modify settings manually:**

1. **Edit the .env file**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use
   - Optionally modify `APP_NAME_DISPLAYED=Poznote` to customize the **application name displayed** in the interface
   - Optionally modify MySQL settings for custom database configuration
   - **Note**: If you plan to run multiple instances on the same server, each instance must use a different port (e.g., 8040, 8041, 8042)

2. **Restart the application**

```bash
docker compose down
docker compose up -d
```

### Manual Update

To update Poznote manually to the latest version:

```bash
git pull origin main && docker compose down && docker compose up -d --build
```

### Manual Backup and Restore

#### Manual Backups

- To backup your notes, copy your html files found in `./data/entries`
- To backup your attachements, copy your files found in `./data/attachments`
- To backup your database:

```bash
docker compose exec database mysqldump -u root -p<YOUR_MYSQL_ROOT_PASSWORD> poznote_db > backup.sql
```

#### Manual Restore

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
docker compose exec -T database mysql -u root -p<YOUR_MYSQL_ROOT_PASSWORD> poznote_db < backup.sql
```
