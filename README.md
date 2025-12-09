<p align="center">
  <img src="poznote.svg" alt="Poznote Logo" width="80">
</p>

<h1 align="center">Poznote - Lightweight Note-Taking Web App</h1>

<p align="center">
Poznote is a powerful, open-source note-taking platform.<br>Capture, organize, and access your notes while keeping full ownership of your data.
</p>

<p align="center">
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Supported-blue?logo=docker" alt="Docker"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Open%20Source-green" alt="License"></a>
  <a href="https://www.php.net/"><img src="https://img.shields.io/badge/PHP-8.x-purple?logo=php" alt="PHP"></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite" alt="SQLite"></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-Vanilla-yellow?logo=javascript" alt="JavaScript"></a>
  <a href="https://github.com/timothepoznanski/poznote/stargazers"><img src="https://img.shields.io/github/stars/timothepoznanski/poznote?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <br>Create HTML notes where you can directly paste images or screenshots, insert tables, checkboxes, format your text quickly and easily, add emojis, attach files, share publicly, and more. Paste the content of web pages directly into a note.<br><br>
  <img width="1893" height="899" alt="image" src="https://github.com/user-attachments/assets/222627e6-2baf-497d-b763-1e055fec6d46" />
  <br><br>Create special notes for your to-do lists or any other lists.<br><br>
  <img width="1906" height="895" alt="image" src="https://github.com/user-attachments/assets/867c6187-6fbb-42cb-b8c8-7105b66e5468" />
  <br><br>Insert diagrams directly into your notes using an Excalidraw editor.<br><br>
  <img width="1902" height="893" alt="image" src="https://github.com/user-attachments/assets/4a9fabfe-9956-4cef-a40d-01f7e78219b3" />
  <br><br>Insert code blocks where you can highlight or color the parts that matter to you.<br><br>
  <img width="1894" height="895" alt="image" src="https://github.com/user-attachments/assets/760ea811-dd64-40ea-aa88-f21ab73acdb9" />
  <br><br>And for the fans, create notes in Markdown.<br><br>
  <img width="1873" height="891" alt="image" src="https://github.com/user-attachments/assets/31450a06-cfb6-4d79-a66d-d60fd7a2fd17" />
</p>

## Play with Poznote demo

A Poznote demo is available on [poznote-demo.up.railway.app](https://poznote-demo.up.railway.app)

Username: `poznote`
<br>
Password: `poznote`

## Install

Choose your preferred installation method below.

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 2: Deploy Poznote

Open Powershell and run the following commands.

Create a new directory for Poznote:

```powershell
mkdir poznote
```

Navigate to the Poznote directory:
```powershell
cd poznote
```

Download the environment file with default credentials and port configuration:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Edit the `.env` file so that it fits your needs.

Download the Docker Compose configuration file for Poznote service:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
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

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Step 2: Install Poznote

Open a Terminal and run the following commands.

Create a new directory for Poznote:
```bash
mkdir poznote
```

Navigate to the Poznote directory:
```bash
cd poznote
```

Download the environment file with default credentials and port configuration:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Edit the `.env` file so that it fits your needs.

Download the Docker Compose configuration file for Poznote service:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
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

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Help Needed from the Community! 

Unfortunately, I don't have access to a Mac to test and document the installation procedure for macOS.

**If you're a macOS user and successfully install Poznote, I would greatly appreciate your help!** Please consider:

- Testing the installation process on your Mac
- Documenting any macOS-specific steps or requirements
- Sharing your experience via [GitHub Issues](https://github.com/timothepoznanski/poznote/issues) or [Pull Request](https://github.com/timothepoznanski/poznote/pulls)

**Expected process** (untested):
- Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- Follow similar steps to Linux using Terminal

Your contribution would help make Poznote accessible to the entire macOS community! 🙏

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Cloud</strong></summary>
<br>

**See section [Use Poznote in the Cloud](#use-poznote-in-the-cloud)**

</details>

## Access

After installation, access Poznote in your web browser:

**URL:** [http://localhost:8040](http://localhost:8040)

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`
- Port: `8040`

# Other informations

- [Change Settings](#change-settings)
- [Password Recovery](#password-recovery)
- [Update to the latest version](#update-to-the-latest-version)
- [Backup / Export and Restore / Import](#backup--export-and-restore--import)
  - [Complete Backup](#complete-backup)
  - [Import Individual Notes](#import-individual-notes)
  - [Complete Restore](#complete-restore)
  - [Automated Backups with Bash Script](#automated-backups-with-bash-script)
- [Offline View](#offline-view)
- [Multiple Instances](#multiple-instances)
- [Tech Stack](#tech-stack)
- [API Documentation](#api-documentation)
- [Use Poznote in the Cloud](#use-poznote-in-the-cloud)

## Change Settings

To modify your username, password, or port.

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

To update Poznote to the latest version.

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

<a id="complete-backup"></a>
**📦 Complete Backup**

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

<a id="import-individual-notes"></a>
**📥 Import Individual Notes**

Import one or more HTML or Markdown notes directly:

  - Upload `.html`, `.md`, or `.markdown` files
  - Multiple files can be selected at once
  - Notes are imported into the Poznote workspace
  - Titles are automatically extracted from file content or filename
  - Supports both full HTML documents and simple fragments

<a id="complete-restore"></a>
**🔄 Complete Restore** 

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

<a id="automated-backups-with-bash-script"></a>
**🤖 Automated Backups with Bash Script**

For automated scheduled backups, you can use the included `backup-poznote.sh` script. This script creates complete backups via the Poznote API and automatically manages retention.

**Script location:** `backup-poznote.sh` (in the Poznote installation directory)

**Usage:**
```bash
bash backup-poznote.sh '<poznote_url>' '<username>' '<password>' '<backup_directory>' '<retention_count>'
```

**Example with crontab:**

To schedule automatic backups twice daily (at midnight and noon), add this line to your crontab:

```bash
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.xxxxx.com' 'admin' 'xxxxx' '/root/poznote' '30'
```

**Parameters explained:**
- `'https://poznote.xxxxx.com'` - Your Poznote instance URL
- `'admin'` - Your Poznote username
- `'xxxxx'` - Your Poznote password
- `'/root/poznote'` - Parent directory where backups will be stored (the script creates a `backups-poznote` folder inside this path)
- `'30'` - Number of backups to keep (older ones are automatically deleted)

**How the backup process works:**

1. The script calls the Poznote API to create a backup at 00:00 (midnight) and 12:00 (noon) every day
2. The API generates a backup ZIP in the Poznote container: `/var/www/html/data/backups/`
3. The script downloads this backup locally to: `/root/poznote/backups-poznote/`
4. Old backups are automatically deleted from both locations to keep only the most recent ones based on retention count

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Each instance has its own data, port, and credentials.

### Why Multiple Instances?

Perfect for:
- Hosting for different users on the same server, each with their own separate instance and account
- Testing new features without affecting your production instance

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
- **React + Vite** - Excalidraw drawing component (bundled as IIFE)
- **AJAX** - Asynchronous data loading

### Storage
- **HTML/Markdown files** - Notes are stored as plain HTML or Markdown files in the filesystem
- **SQLite database** - Metadata, tags, relationships, and user data
- **File attachments** - Stored directly in the filesystem

### Infrastructure
- **Nginx + PHP-FPM** - High-performance web server with FastCGI Process Manager
- **Alpine Linux** - Secure, lightweight base image
- **Docker** - Containerization for easy deployment and portability
</details>

## API Documentation

Poznote provides a REST API for programmatic access to notes, folders, workspaces, tags, and attachments.

### Missing an API Endpoint?

If you need additional REST API functionality that isn't currently available, feel free to [open an issue on GitHub](https://github.com/timothepoznanski/poznote/issues) describing your use case. We're always looking to improve the API based on community feedback!

### Interactive Documentation (Swagger)

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
curl -X DELETE -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123}' \
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

Create or enable public sharing for a note (generates public link):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "create"}' \
  http://YOUR_SERVER/api_share_note.php
```

Revoke sharing for a note:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "revoke"}' \
  http://YOUR_SERVER/api_share_note.php
```

Get existing share URL:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "get"}' \
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

Delete a folder and move its contents to no folder (uncategorized):
```bash
curl -X DELETE -u 'username:password' \
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
  "http://YOUR_SERVER/api_workspaces.php?action=list"
```

**Create Workspace**

Create a new workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "name": "MyProject"
  }' \
  http://YOUR_SERVER/api_workspaces.php
```

**Delete Workspace**

Delete a workspace (notes are moved to Poznote default workspace):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "name": "OldWorkspace"
  }' \
  http://YOUR_SERVER/api_workspaces.php
```

**Rename Workspace**

Rename an existing workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rename",
    "old_name": "OldName",
    "new_name": "NewName"
  }' \
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

Add or update tags for a specific note (replaces existing tags).

Tags can be provided as a comma-separated string:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "tags": "work,urgent,meeting"
  }' \
  http://YOUR_SERVER/api_apply_tags.php
```

Or as an array:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "tags": ["work", "urgent", "meeting"]
  }' \
  http://YOUR_SERVER/api_apply_tags.php
```

</details>

<details>
<summary><strong>⭐ Favorites Management</strong></summary>
<br>

**Toggle Favorite**

Toggle favorite status for a note (add or remove):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "toggle_favorite",
    "note_id": 123,
    "workspace": "Personal"
  }' \
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
  "http://YOUR_SERVER/api_attachments.php?action=list&note_id=123"
```

**Upload Attachment**

Upload a file and attach it to a note:
```bash
curl -X POST -u 'username:password' \
  -F "action=upload" \
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

## Use Poznote in the Cloud

If you:

- Want access from anywhere (phone, tablet, computer) with almost zero setup
- Have no experience with server management or don't want to manage server and security
- Don't know how to use command line or don't want to use command line
- Prefer one-click updates
- Are okay with approximately $5/month (Cloud provider fees)

**👉 [View Poznote Cloud Install and Manage Guide](POZNOTE-CLOUD.md)**
