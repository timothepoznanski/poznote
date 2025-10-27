# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)](https://www.sqlite.org/)

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Play with Poznote demo](#play-with-poznote-demo)
- [Install](#install)
- [Access](#access)
- [Change Settings](#change-settings)
- [Password Recovery](#password-recovery)
- [Update to the latest version](#update-to-the-latest-version)
- [Backup / Export and Restore / Import](#backup--export-and-restore--import)
- [Offline View](#offline-view)
- [Multiple Instances](#multiple-instances)
- [Tech Stack](#tech-stack)
- [API Documentation](#api-documentation)
- [Poznote on the Cloud](#poznote-on-the-cloud)

## Introduction

Poznote is a free, self-hosted, and beautifully simple note manager built for speed and clarity.<br><br>
Capture, organize, and access your notes while keeping full ownership of your data.<br>
Created for those who put efficiency and control of their data first.<br><br>

![poznote](readme/poznote.png)

## Features

- 📝 Rich Text Editor
- 🔍 Powerful Search
- 🏷️ Tag system
- 📎 File Attachments
- 📱 Responsive design
- 🖥️ Multi-instance support
- 🗂️ Workspaces
- 🏠 Self-hosted
- 💾 Built-in backup and restore tools
- 📖 Export tool for offline reading
- 🗑️ Trash system with restore functionality
- 🔗 Public note sharing
- 🌐 REST API for automation

## Play with Poznote demo

A Poznote demo is available on [poznote-demo.up.railway.app](https://poznote-demo.up.railway.app)

Username: `poznote`
<br>
Password: `poznote`

## Install

Choose your preferred installation method below.

<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 2: Deploy Poznote

Open Powershell and run the following commands:

Create a new directory for Poznote:
```powershell
mkdir poznote
```

Navigate to the Poznote directory:
```powershell
cd poznote
```

Create environment file with default credentials and port configuration:
```powershell
@"
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
"@ | Out-File -FilePath .env -Encoding UTF8
```

Create Docker Compose configuration file for Poznote service:
```powershell
@"
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest
    restart: always
    environment:
      SQLITE_DATABASE: /var/www/html/data/database/poznote.db
      POZNOTE_USERNAME: `${POZNOTE_USERNAME}
      POZNOTE_PASSWORD: `${POZNOTE_PASSWORD}
      HTTP_WEB_PORT: `${HTTP_WEB_PORT}
    ports:
      - "`${HTTP_WEB_PORT}:80"
    volumes:
      - "./data:/var/www/html/data"
"@ | Out-File -FilePath docker-compose.yml -Encoding UTF8
```

Download the latest Poznote Docker image:
```powershell
docker compose pull
```

Start Poznote container in detached mode (runs in background):
```powershell
docker compose up -d
```

</details>

<details>
<summary><strong>🐧 Linux</strong></summary>

#### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Step 2: Install Poznote

Open a Terminal and run the following commands:

Create a new directory for Poznote:
```bash
mkdir poznote
```

Navigate to the Poznote directory:
```bash
cd poznote
```

Create environment file with default credentials and port configuration:
```bash
cat <<EOF > .env
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
EOF
```

Create Docker Compose configuration file for Poznote service:
```bash
cat <<'EOF' > docker-compose.yml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest
    restart: always
    environment:
      SQLITE_DATABASE: /var/www/html/data/database/poznote.db
      POZNOTE_USERNAME: ${POZNOTE_USERNAME}
      POZNOTE_PASSWORD: ${POZNOTE_PASSWORD}
      HTTP_WEB_PORT: ${HTTP_WEB_PORT}
    ports:
      - "${HTTP_WEB_PORT}:80"
    volumes:
      - "./data:/var/www/html/data"
EOF
```

Download the latest Poznote Docker image:
```bash
docker compose pull
```

Start Poznote container in detached mode (runs in background):
```bash
docker compose up -d
```

</details>

## Access

After installation, access Poznote in your web browser:

**URL:** [http://localhost:8040](http://localhost:8040)

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`
- Port: `8040`

> ⚠️ **Important:** Change these default credentials after your first login!

## Change Settings

To modify your username, password, or port:

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running Poznote container:
```bash
docker compose down
```

Edit the `.env` file with your preferred text editor and modify the values:

```
POZNOTE_USERNAME=your_new_username
POZNOTE_PASSWORD=your_new_password
HTTP_WEB_PORT=8040
```

Restart Poznote with new configuration:
```bash
docker compose up -d
```

## Password Recovery

Your credentials are stored in the `.env` file in your Poznote directory.

To retrieve your password:

1. Navigate to your Poznote directory
2. Open the `.env` file
3. Look for the `POZNOTE_PASSWORD` value

## Update to the latest version

To update Poznote to the latest version:

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running container before updating:
```bash
docker compose down
```

Remove the current image to force download of latest version:
```bash
docker rmi ghcr.io/timothepoznanski/poznote:latest
```

Download the latest Poznote image:
```bash
docker compose pull
```

Start the updated container:
```bash
docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.

## Backup / Export and Restore / Import

Poznote includes built-in Backup / Export and Restoration / Import functionality accessible through Settings.

**📦 Complete Backup**

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

**📥 Import Individual Notes**

Import one or more HTML or Markdown notes directly:

  - Upload `.html`, `.md`, or `.markdown` files
  - Multiple files can be selected at once
  - Notes are imported into the Default folder of the Poznote workspace
  - Titles are automatically extracted from file content or filename
  - Supports both full HTML documents and simple fragments

**🔄 Complete Restore** 

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

⚠️ Database import completely replaces current data. The database contains metadata (titles, tags, dates) while actual note content is stored in HTML files.

**🤖 Automated Backup Script**

For automated backups via cron or manual execution, use the `backup-poznote.sh` script located at the repository root:

Execute backup script with your server details and destination path:
```bash
./backup-poznote.sh 'http://localhost:8040' 'admin' 'admin123!' '/var/backups'
```

The script will:
- Create backups via the Poznote API
- Download and verify backup files
- Store backups in a `backups-poznote` folder
- Automatically rotate backups (keeps 7 most recent by default)
- Can be scheduled with cron for automatic daily/weekly backups

See the script file for detailed usage instructions and examples. 

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Each instance has its own data, port, and credentials.

### Why Multiple Instances?

Perfect for:
- Different family members with separate accounts
- Separating personal and work notes
- Testing new features without affecting production
- Hosting for multiple users on the same server

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

### How to Deploy Multiple Instances

Simply repeat the installation steps in different directories with different ports.

And then you will have two completely isolated instances, for example:

- Tom's Poznote: http://localhost:8040
- Alice's Poznote: http://localhost:8041

> 💡 **Tip:** Make sure each instance uses a different port number to avoid conflicts!

## Tech Stack

Poznote prioritizes simplicity and portability - no complex frameworks, no heavy dependencies. Just straightforward, reliable web technologies that ensure your notes remain accessible and under your control.

<details>
<summary>If you are interested in the tech stack on which Poznote is built, <strong>have a look here.</strong></summary>

### Backend
- **PHP 8.x** - Server-side scripting language
- **SQLite 3** - Lightweight, file-based relational database

### Frontend
- **HTML5** - Markup and structure
- **CSS3** - Styling and responsive design
- **JavaScript (Vanilla)** - Interactive features and dynamic content
- **AJAX** - Asynchronous data loading

### Storage
- **HTML files** - Notes are stored as plain HTML files in the filesystem
- **SQLite database** - Metadata, tags, relationships, and user data
- **File attachments** - Stored directly in the filesystem

### Infrastructure
- **Apache HTTP Server** - Web server
- **Docker** - Containerization for easy deployment and portability
</details>

## API Documentation

Poznote provides a REST API for programmatic access to notes, folders, workspaces, tags, and attachments.

### 📚 Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote from `Settings > API Documentation` and browse all endpoints, view request/response schemas, and test API calls interactively.

### 📖 Command Line Examples (Curl)

Ready-to-use curl commands for every API operation.

<details>
<summary><strong>📝 Notes Management</strong></summary>
<br>

**List Notes**

List all notes in the system:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_list_notes.php
```

Filter notes by specific workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api_list_notes.php?workspace=Personal"
```

**Create Note**

Create a new note with title, content, tags, folder and workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "entrycontent": "This is the content of my note",
    "tags": "work,important",
    "folder_name": "Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api_create_note.php
```

**Update Note**

Update an existing note by ID with new content:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123,
    "heading": "Updated Title",
    "entrycontent": "Updated content",
    "tags": "work,updated",
    "folder": "Projects"
  }' \
  http://YOUR_SERVER/api_update_note.php
```

**Delete Note**

Move a note to trash by ID:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123}' \
  http://YOUR_SERVER/api_delete_note.php
```

**Move Note**

Move a note to a different folder or workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "folder_name": "Archive",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api_move_note.php
```

**Share Note**

Enable public sharing for a note (generates public link):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "shared": 1}' \
  http://YOUR_SERVER/api_share_note.php
```

</details>

<details>
<summary><strong>🗑️ Trash Management</strong></summary>
<br>

**List Trash**

Get all notes currently in the trash:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_list_trash.php
```

**Restore Note**

Restore a note from trash back to its original location:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123}' \
  http://YOUR_SERVER/api_restore_note.php
```

</details>

<details>
<summary><strong>📁 Folders Management</strong></summary>
<br>

**Create Folder**

Create a new folder in the specified workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "folder_name": "My Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api_create_folder.php
```

**Delete Folder**

Delete a folder and move its contents to Default folder:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "folder_name": "Old Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api_delete_folder.php
```

</details>

<details>
<summary><strong>🗂️ Workspaces Management</strong></summary>
<br>

**List Workspaces**

Get all available workspaces in your Poznote instance:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_workspaces.php
```

</details>

<details>
<summary><strong>🏷️ Tags Management</strong></summary>
<br>

**List Tags**

Get all tags used across all notes:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_list_tags.php
```

**Apply Tags**

Add or update tags for a specific note (replaces existing tags):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123,
    "tags": "work,urgent,meeting"
  }' \
  http://YOUR_SERVER/api_apply_tags.php
```

</details>

<details>
<summary><strong>⭐ Favorites Management</strong></summary>
<br>

**Add to Favorites**

Mark a note as favorite for quick access:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "favorite": 1}' \
  http://YOUR_SERVER/api_favorites.php
```

**Remove from Favorites**

Remove favorite status from a note:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "favorite": 0}' \
  http://YOUR_SERVER/api_favorites.php
```

</details>

<details>
<summary><strong>📎 Attachments Management</strong></summary>
<br>

**List Attachments**

Get all file attachments for a specific note:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api_attachments.php?note_id=123"
```

**Upload Attachment**

Upload a file and attach it to a note:
```bash
curl -X POST -u 'username:password' \
  -F "note_id=123" \
  -F "file=@/path/to/file.pdf" \
  http://YOUR_SERVER/api_attachments.php
```

</details>

<details>
<summary><strong>💾 Backup Management</strong></summary>
<br>

**Create Backup**

Create a complete backup of all notes, attachments and database:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  http://YOUR_SERVER/api_backup.php
```

**List Backups**

Get a list of all available backup files:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_list_backups.php
```

**Download Backup**

Download a specific backup file by filename:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api_download_backup.php?filename=poznote_backup_2025-10-24_14-30-15.zip" \
  -o backup.zip
```

Backups are stored in the `data/backups/` directory with the naming pattern: `poznote_backup_YYYY-MM-DD_HH-MM-SS.zip`

</details>

<details>
<summary><strong>ℹ️ System Information</strong></summary>
<br>

**Check Version**

Get the current Poznote version and system information:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_version.php
```

</details>

## Poznote on the Cloud

If you:

- Want access from anywhere (phone, tablet, computer) with almost zero setup
- Have no experience with server management or don't want to manage server and security
- Don't know how to use command line or don't want to use command line 
- Prefer one-click updates
- Are okay with approximately $5/month (Cloud provider fees)

**👉 [View Poznote Cloud Install and Manage Guide](readme/POZNOTE-CLOUD.md)**

