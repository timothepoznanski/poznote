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

- **Deploy on your computer** to access your notes only from this device
- **Deploy on a linux server** to access your notes from anywhere

<details>
<summary><strong>🪟 Windows Installation</strong></summary>

1. Install [PowerShell 7](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows?view=powershell-7.5&viewFallbackFrom=powershell-7&WT.mc_id=THOMASMAURER-blog-thmaure)
2. Install [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 1: Run the following command to choose your instance name

```powershell
# Run this interactive script to choose your instance name
# It will validate the name and check for Docker conflicts

function Test-DockerConflict($name) {
    return (docker ps -a --format "{{.Names}}" | Select-String "^${name}-webserver-1$").Count -eq 0
}

do {
    $instanceName = Read-Host "Choose an instance name (poznote-tom, poznote-alice, my-notes, etc.) [poznote]"
    if ([string]::IsNullOrWhiteSpace($instanceName)) { $instanceName = "poznote" }
    if (-not ($instanceName -cmatch "^[a-z0-9_-]+$")) {
        Write-Host "Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces." -ForegroundColor Yellow
        continue
    }
    if (-not (Test-DockerConflict $instanceName)) {
        Write-Host "Docker container '${instanceName}-webserver-1' already exists!" -ForegroundColor Yellow
        continue
    }
    if (Test-Path $instanceName) {
        Write-Host "Folder '$instanceName' already exists!" -ForegroundColor Yellow
        continue
    }
    break
} while ($true)

$INSTANCE_NAME = $instanceName
Write-Host "Using instance name: $INSTANCE_NAME"
```

#### Step 2: Clone the repository and navigate to the directory

```powershell
# Clone the repository with your chosen instance name
git clone https://github.com/timothepoznanski/poznote.git $INSTANCE_NAME

# Navigate to the cloned directory
cd $INSTANCE_NAME
```

#### Step 3: Run the setup script

```powershell
# Run the interactive setup script
.\setup.ps1
```

#### Step 4: Access Your Instance

After installation, access Poznote at: `http://localhost:8041`

</details>


<details>
<summary><strong>🐧 Linux Installation</strong></summary>

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/)

#### Step 1: Choose your instance name

```bash
# Run this interactive script to choose your instance name
# It will validate the name and check for Docker conflicts

check_conflicts() {
    local name="$1"
    if docker ps -a --format "{{.Names}}" | grep -q "^${name}-webserver-1$"; then
        echo "Docker container '${name}-webserver-1' already exists!"
        return 1
    fi
    return 0
}

while true; do
    read -p "Choose an instance name (poznote-tom, poznote-alice, my-notes, etc.) [poznote]: " instanceName
    instanceName=${instanceName:-poznote}
    if [[ "$instanceName" =~ ^[a-z0-9_-]+$ ]] && check_conflicts "$instanceName" && [ ! -d "$instanceName" ]; then
        INSTANCE_NAME="$instanceName"
        break
    else
        if [[ ! "$instanceName" =~ ^[a-z0-9_-]+$ ]]; then
            echo "Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces."
        elif [ -d "$instanceName" ]; then
            echo "Folder '$instanceName' already exists!"
        fi
    fi
done

echo "Using instance name: $INSTANCE_NAME"
```

#### Step 2: Clone the repository and navigate to the directory

```bash
# Clone the repository with your chosen instance name
git clone https://github.com/timothepoznanski/poznote.git "$INSTANCE_NAME"

# Navigate to the cloned directory
cd "$INSTANCE_NAME"
```

#### Step 3: Run the setup script

```bash
# Run the interactive setup script
bash setup.sh
```

#### Step 4: Access Your Instance

After installation, access Poznote at: `http://localhost:8041`

</details>


## Workspaces

Workspaces allow you to organize your notes into separate environments within a single Poznote instance - like having different notebooks for work, personal life, or projects.

### What are Workspaces?

- **🔀 Separate environments** - Each workspace contains its own notes, tags, and folders
- **⚡ Easy switching** - Use the workspace selector to switch between environments instantly
- **🏷️ Independent organization** - Tags and folders are unique to each workspace

### Common Use Cases

- **📝 Personal vs Work** - Separate professional and personal notes
- **🎓 Projects** - Organize by client, course, or research topic
- **🗂️ Archive** - Keep active and archived notes separate

### Managing Workspaces

**Access:** Go to **Settings → Manage Workspaces**

**Basic Operations:**
- **Create:** Enter a name and click "Create"
- **Switch:** Use the workspace selector at the top of the interface
- **Rename/Move/Delete:** Use the buttons in workspace management

⚠️ **Note:** The default "Poznote" workspace cannot be deleted and contains any pre-existing notes.

### How to Switch Workspaces

To switch between workspaces:
1. **Click on the workspace name** displayed at the top of the interface
2. **Select your target workspace** from the dropdown menu that appears
3. The interface will automatically reload and display notes from the selected workspace

💡 **Tip:** The current workspace name is always visible at the top of the page, making it easy to know which environment you're working in.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Simply run the setup script multiple times with different instance names and ports.

Each instance will have:
- Separate Docker containers
- Independent data storage
- Different ports
- Isolated configurations

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

For deployments on different servers, you only need to run the setup script to update configuration (no need for different instance names or ports).

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

**📦Complete Backup**

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

**🔄 Complete Restore** 

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

### Supported AI Providers

- **🤖 OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo (Recommended for quality)
- **🚀 Mistral AI** - Mistral Large, Medium, Small, Open Mistral (European alternative)

### Available AI Features

- **🤖 AI Summary** - Generate intelligent summaries of your notes for quick understanding
- **🏷️ Auto Tags** - Automatically generate relevant tags based on note content
- **🔍 Check Faults** - Verify consistency, logic, and grammar in your notes

### Setup AI Features

1. **Choose your AI Provider**
   - **OpenAI**: Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Mistral AI**: Visit [Mistral Console](https://console.mistral.ai/)
   - Create an account or sign in
   - Generate a new API key

2. **Configure Poznote**
   - Go to **Settings → AI Settings** in your Poznote interface
   - Enable AI features by checking the box
   - Select your preferred AI provider
   - Enter your API key
   - Choose your desired model
   - Test the connection using the "Test Connection" button
   - Save the configuration

3. **Start Using AI Features**
   - Open any note and look for AI buttons in the toolbar
   - Use **AI Summary** to generate note summaries
   - Use **Auto Tags** to suggest relevant tags
   - Use **Correct Faults** to fix grammar and style issues

### Requirements

- ✅ Active internet connection
- ✅ Valid API key (OpenAI or Mistral AI)

### Privacy & Data

When AI features are enabled:
- Note content is sent to your chosen AI provider's servers for processing
- **OpenAI**: Data is processed according to [OpenAI's privacy policy](https://openai.com/privacy/)
- **Mistral AI**: Data is processed according to [Mistral AI's terms of service](https://mistral.ai/terms/)
- You can disable AI features at any time in settings

## API Documentation

Poznote provides a REST API for programmatic access to notes and folders.

### API quick links

 - [List Notes](#list-notes)
 - [Create Note](#create-note)
 - [Create Task List](#create-task-list)
 - [Update Task List](#update-task-list)
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
curl -X POST http://localhost:8040/update_note.php \
  -u 'username:password' \
  -d 'id=123&heading=Shopping%20list&entry=&entrycontent=%5B%7B%22id%22%3A1690000000000%2C%22text%22%3A%22Buy%20bread%22%2C%22completed%22%3Afalse%2C%22important%22%3Afalse%7D%5D&workspace=MyWorkspace'
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

#### Update Note (JSON API)

```bash
curl -X POST http://localhost:8040/api_update_note.php \
  -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123",
    "heading": "Shopping list",
    "entry": "",
    "entrycontent": "[ { \"id\":1690000000000, \"text\":\"Buy milk\", \"completed\":false } ]",
    "tags": "shopping,urgent",
    "folder": "Home",
    "workspace": "MyWorkspace"
  }'
```

Parameters:
- `id` (string|number) - **Required** - The note id to update
- `heading` (string) - **Required** - The note title
- `entry` (string) - *Optional* - HTML content (for compatibility; usually empty for tasklist)
- `entrycontent` (string) - *Optional* - JSON string containing tasklist data or other structured content
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
