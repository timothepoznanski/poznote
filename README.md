# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)](https://www.sqlite.org/)

A powerful note-taking application that puts you in complete control of your data. Poznote can be installed locally on your computer or on a remote server to access your notes from your phone or your computer web browser.

## Table of Contents

- [Features](#features)
- [Demo](#demo)
- [Installation](#installation)
- [Access Your Instance](#access-your-instance)
- [Workspaces](#workspaces)
- [Multiple Instances](#multiple-instances)
- [Change Settings](#change-settings)
- [Reset Password](#reset-password)
- [Update Application](#update-application)
- [Backup and Restore](#backup-and-restore)
- [Offline View](#offline-view)
- [AI Features](#ai-features)
- [API Documentation](#api-documentation)
- [Manual Operations](#manual-operations)

## Features

- 📝 Rich Text Editor
- 🔍 Powerful Search
- 🏷️ Tag system
- 📎 File Attachments
- 🤖 AI-powered features
- 📱 Responsive design for all devices
- 🖥️ Multi-instance support
- 🗂️ Workspaces
- 🏠 Self-hosted with secure authentication
- 💾 Built-in backup and export tools
- 🗑️ Trash system with restore functionality
- 🌐 REST API for automation

## Demo

Check out the Poznote website for a video demonstration!

🔗 **[Visit Poznote Website](https://poznote.com/)**

## Installation

Poznote runs in a Docker container, making it incredibly easy to deploy anywhere.

<details>
<summary><strong>🪟 Windows Installation</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 2: Install Poznote

Open Powershell where you want to install Poznote, paste and run the following block of commands:

```powershell
try { docker ps >$null } catch { Write-Host "Please start Docker Desktop" -ForegroundColor Red; exit 1 }

do {
    $instance = Read-Host "`nChoose an instance name (poznote-tom, my-notes, etc.) [poznote]"
    if ([string]::IsNullOrWhiteSpace($instance)) { $instance = "poznote" }
    if (-not ($instance -cmatch "^[a-z0-9_-]+$")) {
        Write-Host "Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces."
        continue
    }
    break
} while ($true)

if (docker ps -a --format "{{.Names}}" | Where-Object { $_ -match "^$instance-webserver-1$" }) {
    Write-Host "Container '$instance-webserver-1' already exists. Please choose a different instance name." -ForegroundColor Red
    exit 1
}

git clone https://github.com/timothepoznanski/poznote.git $instance
Set-Location $instance
powershell -ExecutionPolicy Bypass -NoProfile -File ".\setup.ps1"

```

</details>

<details>
<summary><strong>🐧 Linux Installation</strong></summary>

#### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/)

#### Step 2: Install Poznote

Open a terminal where you want to install Poznote, paste and run the following block of commands:

```bash
docker ps >/dev/null 2>&1 || { echo "Please start Docker"; exit 1; }

while true; do
    read -p "Choose an instance name (poznote-tom, my-notes, etc.) [poznote]: " instance
    instance=${instance:-poznote}
    if [[ ! "$instance" =~ ^[a-z0-9_-]+$ ]]; then
        echo "Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces."
        continue
    fi
    break
done

if docker ps -a --format "{{.Names}}" | grep -q "^$instance-webserver-1$"; then
    echo "Container '$instance-webserver-1' already exists. Please choose a different instance name."
    exit 1
fi
git clone https://github.com/timothepoznanski/poznote.git "$instance"
cd "$instance"
bash setup.sh

```

</details>

## Access Your Instance

After installation, access Poznote at: `http://YOUR_SERVER:YOUR_PORT`

where YOUR_SERVER depends on your environment:

- localhost
- Your server's IP address
- Your domain name

and where YOUR_PORT depends on your port choice (see your .env file).

The setup script will display the exact URL and credentials.

## Workspaces

Workspaces allow you to organize your notes into separate environments within a single Poznote instance - like having different notebooks for work, personal life, or projects.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Simply run the setup script multiple times with different instance names and ports.

### Example: Tom and Alice instances on the same server

```
Server: my-server.com
├── Poznote-Tom
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-tom-webserver-1
│   └── Data: ./poznote-tom/data/
│
└── Poznote-Alice
    ├── Port: 8041
    ├── URL: http://my-server.com:8041
    ├── Container: poznote-alice-webserver-1
    └── Data: ./poznote-alice/data/
```

## Change Settings

To change your username, password, or port:

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

Poznote includes built-in backup (export) and restoration (import) functionality accessible through Settings.

**Complete Backup**

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

**Complete Restore** 

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

⚠️ Database import completely replaces current data. The database contains metadata (titles, tags, dates) while actual note content is stored in HTML files.

🔒 Every time you import/restore a database through the web interface, Poznote automatically creates a backup of your current database before proceeding.

- **Location:** `data/database/poznote.db.backup.YYYY-MM-DD_HH-MM-SS`
- **Format:** Timestamped backup files (e.g., `poznote.db.backup.2025-08-15_14-36-19`)
- **Purpose:** Allows recovery if import fails or data needs to be rolled back

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser.

## AI Features

Poznote includes powerful AI capabilities powered by **OpenAI** or **Mistral AI** to enhance your note-taking experience. These features are optional and require an API key from your chosen provider.

### Available AI Features

- **AI Summary** - Generate intelligent summaries of your notes for quick understanding.
- **Auto Tags** - Automatically generate relevant tags based on note content.
- **Check Content** - Analyzes note content to detect factual errors, logical inconsistencies, and contradictions while deliberately ignoring spelling and grammar issues.

### Privacy & Data

⚠️ Note: Enabling AI features sends your data to the chosen AI provider’s servers (OpenAI or Mistral). You can disable these features anytime in settings.

## API Documentation

Poznote provides a REST API for programmatic access to notes and folders.

### API quick links

 - [List Notes](#list-notes)
 - [Create Note](#create-note)
 - [Create Task List](#create-task-list)
 - [Update Task List](#update-task-list)
 - [Update Note](#update-note)
 - [Create Folder](#create-folder)
 - [Move Note](#move-note)
 - [Delete Note](#delete-note)
 - [Delete Folder](#delete-folder)


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

### Endpoints

#### List Notes

```bash
curl -u 'username:password' http://localhost:8040/api_list_notes.php?workspace=MyWorkspace
```

You can pass the workspace as a query parameter (`?workspace=NAME`) or as POST data (`workspace=NAME`). If omitted, the API will return notes from all workspaces.

**Parameters:**
- `workspace` (string) - *Optional* - Filter notes by workspace name

---

#### Create Note

```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "entry": "<p>This is the <strong>HTML content</strong> of the note</p>",
    "entrycontent": "This is the plain text content of the note",
    "tags": "personal,important",
    "folder_name": "Projects",
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `heading` (string) - **Required** - The note title
- `entry` (string) - *Optional* - HTML content that will be saved to the note's HTML file
- `entrycontent` (string) - *Optional* - Plain text content that will be saved to the database
- `tags` (string) - *Optional* - Comma-separated tags
- `folder_name` (string) - *Optional* - Folder name (defaults to "Default")
- `workspace` (string) - *Optional* - Workspace name (defaults to "Poznote")

---

#### Create Task List

```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "Shopping list",
    "type": "tasklist",
    "entry": "",
    "entrycontent": "[ { \"id\": 1690000000000, \"text\": \"Buy bread\", \"completed\": false, \"important\": false } ]",
    "tags": "shopping,urgent",
    "folder_name": "Home",
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `heading` (string) - **Required** - The note title
- `type` (string) - *Optional* - Set to `tasklist` to create a task list note
- `entry` (string) - *Optional* - HTML content (can be empty for tasklist)
- `entrycontent` (string) - *Optional* - JSON string containing the tasks (see structure below)
- `tags` (string) - *Optional* - Comma-separated tags
- `folder_name` (string) - *Optional* - Folder name (defaults to "Default")
- `workspace` (string) - *Optional* - Workspace name (defaults to "Poznote")

Example `entrycontent` structure (JSON array of tasks):

```
[
  { "id": 1690000000000, "text": "Buy milk", "completed": false, "important": false, "noteId": 123 },
  { "id": 1690000001000, "text": "Prepare meeting", "completed": true, "important": true, "noteId": 123 }
]
```

---

#### Update Task List

```bash
curl -X POST http://localhost:8040/api_update_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123",
    "heading": "Shopping list",
    "entry": "",
    "entrycontent": "[ { \"id\":1690000000000, \"text\":\"Buy bread\", \"completed\":false, \"important\":false } ]",
    "tags": "shopping,urgent",
    "folder": "Home",
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `id` (string|number) - **Required** - The note id to update
- `heading` (string) - **Required** - The note title
- `entry` (string) - *Optional* - HTML content (for compatibility; usually empty for tasklist)
- `entrycontent` (string) - *Required* for tasklist updates - JSON string with the tasks
- `tags` (string) - *Optional* - Comma-separated tags
- `folder` (string) - *Optional* - Folder name
- `workspace` (string) - *Optional* - Workspace name

---

#### Update Note

```bash
curl -X POST http://localhost:8040/api_update_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123",
    "heading": "Meeting Notes",
    "entry": "Discussed the new project timeline and key deliverables.",
    "entrycontent": "Discussed the new project timeline and key deliverables.",
    "tags": "meeting,work,project",
    "folder": "Work",
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `id` (string|number) - **Required** - The note id to update
- `heading` (string) - **Required** - The note title
- `entry` (string) - *Optional* - HTML content that will be saved to the note's HTML file
- `entrycontent` (string) - *Optional* - Plain text content that will be saved to the database
- `tags` (string) - *Optional* - Comma-separated tags
- `folder` (string) - *Optional* - Folder name (if provided, must exist in the workspace or as an existing entry folder)
- `workspace` (string) - *Optional* - Workspace name

#### Create Folder
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects", "workspace": "MyWorkspace"}'
```

**Parameters:**
- `folder_name` (string) - **Required** - The folder name
- `workspace` (string) - *Optional* - Workspace name to scope the folder (defaults to "Poznote")

---

#### Move Note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "folder_name": "Work Projects",
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `note_id` (string) - **Required** - The ID of the note to move
- `folder_name` (string) - **Required** - The target folder name
- `workspace` (string) - *Optional* - If provided, moves the note into the specified workspace (handles title conflicts)

---

#### Delete Note
```bash
# Soft delete (to trash)
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123", "workspace": "MyWorkspace"}'

# Permanent delete
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "permanent": true,
    "workspace": "MyWorkspace"
  }'
```

**Parameters:**
- `note_id` (string) - **Required** - The ID of the note to delete
- `permanent` (boolean) - *Optional* - If true, permanently delete; otherwise move to trash
- `workspace` (string) - *Optional* - Workspace to scope the operation

---

#### Delete Folder
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Work Projects", "workspace": "MyWorkspace"}'
```

**Parameters:**
- `folder_name` (string) - **Required** - The folder name to delete
- `workspace` (string) - *Optional* - Workspace to scope the operation (defaults to "Poznote")

**Note:** The default folder ("Default", historically "Uncategorized") cannot be deleted. When a folder is deleted, all its notes are moved to the default folder.

## Manual Operations

For advanced users who prefer direct configuration:

**Install Poznote Linux (Bash):**

```bash
INSTANCE_NAME="VOTRE-NOM-DINSTANCE"
git clone https://github.com/timothepoznanski/poznote.git "$INSTANCE_NAME"
cd $INSTANCE_NAME
vim Dockerfile  # If necessary (for example to add proxies)
cp .env.template .env
vim .env
mkdir -p data/entries
mkdir -p data/database
mkdir -p data/attachments
docker compose up -d --build
```

**Change settings:**

```bash
docker compose down
vim .env
docker compose up -d
```

**Update Poznote to the latest version:** 

```bash
docker compose down
git stash push -m "Keep local modifications"
git pull
git stash pop
docker compose --build # --no-cache
docker compose up -d --force-recreate
```

**Backup:** 

Copy `./data/` directory (contains entries, attachments, database)

**Restore:** 

Replace `./data/` directory and restart container

**Password Reset:**

```bash
docker compose down
vim .env  # `POZNOTE_PASSWORD=new_password`
docker compose up -d
```
