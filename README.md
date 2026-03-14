
<p align="center">
  <img src="images/poznote.svg" alt="Poznote Logo" width="80">
</p>

<h1 align="center">Poznote</h1>

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/timothepoznanski/poznote?style=flat&logo=github)](https://github.com/timothepoznanski/poznote/stargazers) [![License](https://img.shields.io/github/license/timothepoznanski/poznote?style=flat)](https://github.com/timothepoznanski/poznote/blob/main/LICENCE) [![Docker GHCR](https://img.shields.io/badge/Docker-GHCR-2496ED?style=flat&logo=docker&logoColor=white)](https://github.com/timothepoznanski/poznote/pkgs/container/poznote)

</div>

<h3 align="center">
Poznote is a personal note-taking and documentation platform.
</h3>
This project started from a simple personal need: a practical way to write, organize, and synchronize my technical and personal notes. From the beginning, the priority has been simplicity and ease of use.

<p align="center">
  <a href="https://poznote.com/about.html">Learn more about the project and its background on the Poznote About page</a>
</p>

<p align="center">
  <img src="images/poznote-light.png" alt="Poznote-light" width="100%">
</p>

### Features

Discover all the features [here](https://poznote.com/index.html#features)

<p align="center">
  <img src="images/poznote-features.png" alt="Poznote Features" width="100%">
</p>

## Table of content

- [Install](#install)
- [Access](#access)
- [Change Settings](#change-settings)
- [Authentication](#authentication)
- [Update application](#update-application)
- [Multi-users](#multi-users)
- [Backup / Export](#backup--export)
- [Git Synchronization](#git-synchronization)
- [Restore / Import](#restore--import)
- [Offline View](#offline-view)
- [Multiple Instances](#multiple-instances)
- [MCP Server](#mcp-server)
- [Chrome Extension](#poznote-extension)
- [API Documentation](#api-documentation)
- [Tech Stack](#tech-stack)

## Install

> The official image is multi-arch (linux/amd64, linux/arm64) and supports Windows/macOS via Docker Desktop, as well as ARM64 devices like Raspberry Pi, NAS systems etc.

Choose your preferred installation method below:

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 2: Deploy Poznote

Create a new directory:

```powershell
mkdir poznote
```

Navigate to the Poznote directory:
```powershell
cd poznote
```

Create the environment file:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edit the `.env` file:

```powershell
notepad .env
```

Download the Docker Compose configuration file:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Poznote Webserver and Poznote MCP images :
```powershell
docker compose pull
```

Start Poznote container:
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

Create a new directory:
```bash
mkdir poznote
```

Navigate to the Poznote directory:
```bash
cd poznote
```

Create the environment file:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edit the `.env` file:
```bash
vi .env
```

Download the Docker Compose configuration file:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Poznote Webserver and Poznote MCP images:
```bash
docker compose pull
```

Start Poznote container:
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Step 2: Deploy Poznote

Create a new directory:
```bash
mkdir poznote
```

Navigate to the Poznote directory:
```bash
cd poznote
```

Download the environment file:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edit the `.env` file:
```bash
vi .env
```

Download the Docker Compose configuration file:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Poznote Webserver and Poznote MCP images:
```bash
docker compose pull
```

Start Poznote container:
```bash
docker compose up -d
```

</details>

> If you encounter installation issues, see the [Troubleshooting Guide](docs/TROUBLESHOOTING.md).

## Access

After installation, access Poznote in your web browser:

[http://localhost:8040](http://localhost:8040)


- Username: `admin`
- Password: `admin`
- Port: `8040`

## Change Settings

Most settings can be modified directly in the application through the settings page, but some system settings can only be changed in the `.env` file and require a container restart.

- **Authentication** - Admin and user passwords
- **Web Server** - HTTP port configuration
- **OIDC / SSO Authentication** - OpenID Connect integration
- **Settings Access Control** - Restrict or password-protect settings page
- **Import Limits** - Maximum files for imports
- **Git Sync** - GitHub and Forgejo synchronization
- **MCP Server** - AI assistant integration

### Modify System Settings (`.env`)

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running Poznote container:
```bash
docker compose down
```

Edit your `.env` file with your preferred text editor.

Save the file and restart Poznote to apply changes:
```bash
docker compose up -d
```


## Authentication

<details>
<summary><strong>Traditional Authentication</strong></summary>
<br>

Poznote uses a password model based on the `.env` file. Define your administrator and user passwords, and users log in with their username and password.

#### Configuration

- **Global Authentication**: Set `POZNOTE_PASSWORD` (admin) and `POZNOTE_PASSWORD_USER` (standard users) in your `.env` file.
- **User-Specific Passwords**: Set individual passwords using `POZNOTE_PASSWORD_{USERNAME}` in your `.env`.

</details>

<a id="oidc"></a>
<details>
<summary><strong>OIDC / SSO Authentication (Optional)</strong></summary>
<br>

Poznote supports OpenID Connect (authorization code + PKCE) for single sign-on integration. This allows users to log in using external identity providers such as Auth0, Keycloak, Azure AD, or Google Identity.

#### How it works

1. Optionally restrict access by OIDC group membership.
2. The login page displays a "Continue with [Provider Name]" button.
3. Clicking the button redirects users to your identity provider.
4. After successful authentication, Poznote links the OIDC identity to an existing profile (by `sub`, then `preferred_username`, then `email`) and can auto-create a profile if enabled.

#### Configuration

Add the OIDC variables to your `.env` file (see `.env.template`). If `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN` is `true`, the standard login form will be hidden.

#### Access Control Example (Groups + Auto-Provision)

Restrict access to specific groups and auto-create users at first login:
```bash
POZNOTE_OIDC_GROUPS_CLAIM=groups
POZNOTE_OIDC_ALLOWED_GROUPS=poznote
POZNOTE_OIDC_AUTO_CREATE_USERS=true
```

`POZNOTE_OIDC_ALLOWED_USERS` remains available for backward compatibility, but group-based access is recommended.

</details>

## Update application

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running container before updating:
```bash
docker compose down
```

Download the latest Docker Compose configuration:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest .env.template:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Review `.env.template` and add any new variables to your `.env` file if needed:
```bash
sdiff .env .env.template
```

Download the latest Poznote Webserver and Poznote MCP images:
```bash
docker compose pull
```

Start the updated container:
```bash
docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.

## Multi-users

Poznote features a multi-user architecture with isolated data space for each user (ideal for families, teams, or personal personas).

- **Data Isolation**: Each user has their own separate notes, workspaces, tags, folders and attachments.
- **Global Passwords**: Access is managed via passwords defined in the `.env` file, with optional per-user passwords.
- **User Management**: Administrators can manage profiles via the Settings panel.

> ⚠️ **Warning:** It is not possible to share notes between users. Each user has their own isolated space. The only way to share notes or a profile is to share a common account.

### Architecture & Structure

Poznote uses a master database (`data/master.db`) to track profiles and global settings, and individual databases for each user.

```
data/
├── master.db                    # Master database (profiles, global settings)
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   └── attachments/         # User's attachments
    ├── 2/                       # User ID 2
    └── ...
```

## Backup / Export

Poznote includes built-in Backup / Export functionality accessible through Settings.

<a id="complete-backup"></a>
<details>
<summary><strong>Complete Backup to Poznote zip</strong></summary>
<br>

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

#### Per-User vs Complete Backups

Poznote provides flexible backup options:

**Via Web Interface (Settings > Backup/Export):**
- **All users** can backup and restore their own profile
- **Admins** can select which user profile to backup or restore
- Backups contain the user's database, notes, and attachments

**Via API/Script (Administrators only):**
- Automated backups using the `backup-poznote.sh` script
- Programmatic access via REST API v1
- Requires admin credentials

**Backup Scopes:**

1. **Per-User Backups**: Created from Settings or via API. Contains *only* the data belonging to a specific user (their database, notes, and attachments).
2. **Complete System Backup**: Created manually by backing up the entire `/data` directory. This is the only way to backup the master configuration and all users' data at once.

```bash
# Complete system backup via CLI
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Export Individual Notes</strong></summary>
<br>

Export individual notes using the **Export** button in the note toolbar:

  - **HTML notes:** Export to HTML or PDF format
  - **Markdown notes:** Export to HTML, Markdown or PDF format

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Automated Backups with Bash Script</strong></summary>
<br>

For automated scheduled backups via API, you can use the included `backup-poznote.sh` script.

**IMPORTANT:** Only administrators can create backups via the API.

**Script location:** `backup-poznote.sh` in the `tools` folder of the Poznote repository

**Administrator Usage:**

Admins can backup any user profile - **no need to know user IDs**, just the username:

```bash
# Backup your own profile
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Backup another user's profile (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Usage:**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Example with crontab (admin backing up Nina):**

```bash
# Add to crontab for automated backups twice daily
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Parameters explained:**
- `'https://poznote.example.com'` - Your Poznote instance URL
- `'admin'` - Admin username for authentication (must be an admin)
- `'admin_password'` - Admin password (POZNOTE_PASSWORD from .env)
- `'Nina'` - Target username to backup
- `'/root/backups'` - Parent directory where backups will be stored (creates `backups-poznote-<username>` folder)
- `'30'` - Number of backups to keep (older ones are automatically deleted)

**How the backup process works:**

1. The script authenticates with admin credentials
2. Automatically looks up the user ID from the username
3. Creates a backup via the API
4. Calls the Poznote REST API v1 (`POST /api/v1/backups` with `X-User-ID` header)
5. Downloads the backup ZIP locally to `backups-poznote-<username>/`
6. Automatically manages retention (keeps only the specified number of recent backups)

**Note:** Each user's backups are stored in separate folders (`backups-poznote-Nina`, `backups-poznote-Tim`, etc.)

</details>

## Git Synchronization

Poznote supports automatic and manual synchronization with Git providers like **GitHub** or **Forgejo**. This allows you to keep a versioned history of your notes and sync them across multiple instances.

<details>
<summary><strong>How to configure Git Sync</strong></summary>
<br>

To enable Git synchronization, you need to configure the following variables in your `.env` file:

```bash
# Enable Git Sync
POZNOTE_GIT_SYNC_ENABLED=true

# Provider: 'github' or 'forgejo'
POZNOTE_GIT_PROVIDER=github

# Your Personal Access Token (PAT)
POZNOTE_GIT_TOKEN=ghp_your_token

# Repository (format: username/repo)
POZNOTE_GIT_REPO=yourname/notes-backup

# Branch (default: main)
POZNOTE_GIT_BRANCH=main

# API Base URL (Required for Forgejo)
# Example: http://your-instance:3000/api/v1
POZNOTE_GIT_API_BASE=
```

> 💡 **Note:** For GitHub, the API Base URL is automatically set to `https://api.github.com`. For Forgejo, ensure you include the `/api/v1` suffix.

#### Automatic Sync

When enabled, Poznote will automatically:
- **Pull** changes from the repository upon login.
- **Push** changes (commits) to the repository whenever a note is created, updated, or deleted.

You can also trigger manual push/pull from the **Sync Status** page (accessible via the cloud icon in the header).

</details>

## Restore / Import

**Via Web Interface (Settings > Restore/Import):**
- All users can restore backups to their own profile
- Supports complete backup restoration and individual file imports

**Via API (Administrators only):**
- Restore via REST API v1 endpoint `POST /api/v1/backups/{filename}/restore`
- Requires admin credentials

<a id="complete-restore"></a>
<details>
<summary><strong>Complete Restore from Poznote zip backup</strong></summary>
<br>

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Import Individual files</strong></summary>
<br>

Import one or more HTML, Markdown or text notes directly:

  - Support `.html`, `.md`, `.markdown` or `.txt` files types
  - Up to 50 files can be selected at once, configurable via `POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES` in your `.env`

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Import ZIP file</strong></summary>
<br>

Import a ZIP archive containing multiple notes:

  - Support `.html`, `.md`, `.markdown` or `.txt` files types
  - ZIP archives can contain up to 300 files, configurable via `POZNOTE_IMPORT_MAX_ZIP_FILES` in your `.env`
  - When importing a ZIP archive, Poznote automatically detects and recreates the folder structure

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Import Obsidian Notes</strong></summary>
<br>

Import a ZIP archive containing multiple notes from Obsidian:

  - ZIP archives can contain up to 300 files, configurable via `POZNOTE_IMPORT_MAX_ZIP_FILES` in your `.env`
  - Poznote automatically detects and recreates the folder structure
  - Poznote automatically detects existing tags to create
  - Poznote automatically imports images if they are at the zip file root

</details>

## Admin Tools

Admins can access additional tools via Settings > Admin Tools:

- **Disaster Recovery** - Reconstruct the entire user index from data folders in case of system corruption or database loss.
- **Base64 Image Converter** - Convert inline Base64 encoded images to attachments.
- **Orphan attachments scanner** - Scan and clean up orphaned attachment files.

<a id="import-standard-notes"></a>
<details>
<summary><strong>Import from Standard Notes</strong></summary>
<br>

Convert and import your Standard Notes export to Poznote using the included conversion script:

**Script location:** `standard-notes-to-poznote.sh` in the `tools` folder of the Poznote repository

**Prerequisites:**
- `jq`, `unzip`, `zip`, and `find` utilities must be installed

**Usage:**
```bash
bash standard-notes-to-poznote.sh <standard_notes_export.zip>
```

**How it works:**

1. Export your notes from Standard Notes (this creates a ZIP file)
2. Run the conversion script with your Standard Notes export ZIP as parameter
3. The script generates a `poznote_export.zip` file compatible with Poznote
4. Import the generated ZIP into Poznote using the "Import ZIP file" feature

**What gets converted:**
- All notes are converted to Markdown format with front matter
- Note creation dates are preserved
- Tags are automatically extracted and included in the front matter
- Note content is preserved from the Standard Notes export

**Example:**
```bash
bash tools/standard-notes-to-poznote.sh my_standard_notes_backup.zip
# This creates: poznote_export.zip
```

After conversion, import the generated `poznote_export.zip` file into Poznote.

</details>

<details>
<summary><strong>Markdown Front Matter Support</strong></summary>
<br>

Markdown files can include YAML front matter to specify note metadata. The following keys are supported:

  - `title` — Override the note title (default: filename without extension)
  - `folder` — Override the target folder selection (folder must exist in the workspace)
  - `tags` — Array of tags to apply to the note. Supports both inline `[tag1, tag2]` and multi-line syntax
  - `favorite` — Mark note as favorite (`true`/`false` or `1`/`0`)
  - `created` — Set custom creation date (format: `YYYY-MM-DD HH:MM:SS`)
  - `updated` — Set custom update date (format: `YYYY-MM-DD HH:MM:SS`)

Example with inline array syntax:
```yaml
---
title: My Important Note
folder: Projects
tags: [important, work]
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

Example with multi-line syntax:
```yaml
---
title: My Important Note
folder: Projects
tags:
  - important
  - work
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

</details>

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser.

## Multiple Instances

You can run multiple isolated Poznote instances on the same server. Each instance has its own data, port, and credentials.

Perfect for:
- Hosting for different users on the same server, each with their own separate instance and account
- Testing new features without affecting your production instance

Simply repeat the installation steps in different directories with different ports.

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
  ├── Port: YOUR_POZNOTE_API_PORT
  ├── URL: http://my-server.com:YOUR_POZNOTE_API_PORT
    ├── Container: poznote-alice-webserver-1
    └── Data: ./poznote-alice/data/
```

## MCP Server

Poznote includes a Model Context Protocol (MCP) server that enables AI assistants like GitHub Copilot to interact with your notes using natural language. For example:

- "Create a new note titled 'Meeting Notes' with the content..."
- "Search for notes about 'Docker'"
- "List all notes in my Poznote workspace"
- "Update note 42 with new information"

For installation, configuration, and setup instructions, see the [MCP Server documentation](docs/MCP-SERVER.md).

## Chrome Extension

The **Poznote URL Saver** is a browser extension that allows you to quickly save the URL of the current page to your Poznote instance with a single click.

<p align="center">
  <img src="images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Install the extension directly from the Chrome Web Store → [Install extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## API Documentation

Poznote provides a RESTful API v1 for programmatic access to notes, folders, workspaces, tags, and attachments.

**Base URL:** `/api/v1`

### Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote from `Settings > API Documentation` and browse all endpoints, view request/response schemas, and test API calls interactively.

### Multi-User Mode

Poznote supports multiple user profiles, each with their own isolated data. For API calls that access **user data** (notes, folders, workspaces, tags, attachments, backups, settings, etc.), you must include the `X-User-ID` header:

```bash
# Get notes for user ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes
```

**Endpoints that do NOT require the `X-User-ID` header:**
- **Admin endpoints**: `/api/v1/admin/*`
- **Public endpoints**: `/api/v1/users/profiles`
- **System endpoints**: `/api/v1/system/*` (version, updates, i18n)

Use `GET /api/v1/users/profiles` to list available user profiles and their IDs.

### Command Line Examples (Curl)

Ready-to-use curl commands for every API operation.

<details>
<summary><strong>📝 Notes Management</strong></summary>
<br>

**List Notes**

List all notes for a user:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes
```

Filter notes by workspace, folder, tag, or search:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes?workspace=Personal&folder=Projects&tag=important"
```

**List Notes with Attachments**

List all notes that have file attachments:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/with-attachments
```

**Get Note Content**

Get a specific note by ID:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123
```

Resolve a note by title (reference) inside a workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes/resolve?reference=My+Note&workspace=Personal"
```

**Create Note**

Create a new note with title, content, tags, folder and workspace:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "content": "This is the content of my note",
    "tags": "work,important",
    "folder_id": 12,
    "workspace": "Personal",
    "type": "markdown"
  }' \
  http://YOUR_SERVER/api/v1/notes
```

**Update Note**

Update an existing note by ID:
```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "Updated Title",
    "content": "Updated content here",
    "tags": "work,updated"
  }' \
  http://YOUR_SERVER/api/v1/notes/123
```

**Delete Note**

Move a note to trash:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123
```

Permanently delete (bypass trash):
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes/123?permanent=true"
```

**Restore Note**

Restore a note from trash:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/restore
```

**Duplicate Note**

Create a copy of an existing note:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/duplicate
```

**Update Tags**

Replace all tags on a note:
```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"tags": "work,urgent,meeting"}' \
  http://YOUR_SERVER/api/v1/notes/123/tags
```

**Toggle Favorite**

Toggle favorite status:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/favorite
```

**Move Note to Folder**

Move a note to a different folder:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"folder_id": 45}' \
  http://YOUR_SERVER/api/v1/notes/123/folder
```

Remove from folder (move to root):
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/remove-folder
```

</details>

<details>
<summary><strong>🔗 Note Sharing</strong></summary>
<br>

**Get Share Status**

Check if a note is shared:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**Create Share Link**

Create a share link for a note:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "indexable": false,
    "password": "optional-password"
  }' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**Update Share Settings**

Update share settings:
```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark", "indexable": true}' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**Revoke Share Link**

Remove sharing access:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**List All Shared Notes**

Get list of all shared notes:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/shared
```

Filter by workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/shared?workspace=Personal"
```

</details>

<details>
<summary><strong>📂 Folder Sharing</strong></summary>
<br>

**Get Folder Share Status**

Check if a folder is shared:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/5/share
```

**Create Folder Share Link**

Share a folder (all notes in the folder will also be shared):
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "indexable": 0,
    "password": "optional-password"
  }' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

With custom token:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_token": "my-shared-folder"
  }' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

**Update Folder Share Settings**

Update share settings:
```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"indexable": 1, "password": "new-password"}' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

**Revoke Folder Share Link**

Revoke folder sharing (all notes in the folder will also be unshared):
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/5/share
```

</details>

<details>
<summary><strong>🗑️ Trash Management</strong></summary>
<br>

**List Trash**

Get all notes in trash:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash
```

Filter by workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/trash?workspace=Personal"
```

**Empty Trash**

Permanently delete all notes in trash:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash
```

**Permanently Delete Note**

Delete a specific note from trash:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash/123
```

</details>

<details>
<summary><strong>📁 Folders Management</strong></summary>
<br>

**List Folders**

List all folders in a workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal"
```

Get folder tree (nested structure):
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal&tree=true"
```

**Get Folder Counts**

Get note counts for all folders:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders/counts?workspace=Personal"
```

**Create Folder**

Create a new folder:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api/v1/folders
```

Create a subfolder:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "2024",
    "workspace": "Personal",
    "parent_id": 12
  }' \
  http://YOUR_SERVER/api/v1/folders
```

**Rename Folder**

Rename an existing folder:
```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Folder Name"}' \
  http://YOUR_SERVER/api/v1/folders/12
```

**Move Folder**

Move folder to a different parent:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"parent_id": 56}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

Move to root (no parent):
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"parent_id": null}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

Move to another workspace (recursive):
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"target_workspace": "New Workspace", "parent_id": null}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

**Update Folder Icon**

Set a custom icon:
```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"icon": "fa-folder-open"}' \
  http://YOUR_SERVER/api/v1/folders/12/icon
```

**Empty Folder**

Move all notes in folder to trash:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12/empty
```

**Delete Folder**

Delete a folder:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12
```

</details>

<details>
<summary><strong>🗂️ Workspaces Management</strong></summary>
<br>

**List Workspaces**

Get all workspaces:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/workspaces
```

**Create Workspace**

Create a new workspace:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "MyProject"}' \
  http://YOUR_SERVER/api/v1/workspaces
```

**Rename Workspace**

Rename an existing workspace:
```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"new_name": "NewName"}' \
  http://YOUR_SERVER/api/v1/workspaces/OldName
```

**Delete Workspace**

Delete a workspace:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/workspaces/OldWorkspace
```

</details>

<details>
<summary><strong>🏷️ Tags Management</strong></summary>
<br>

**List Tags**

Get all unique tags:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/tags
```

Filter by workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/tags?workspace=Personal"
```

</details>

<details>
<summary><strong>📎 Attachments Management</strong></summary>
<br>

**List Attachments**

Get all attachments for a note:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

**Upload Attachment**

Upload a file to a note:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -F "file=@/path/to/file.pdf" \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

**Download Attachment**

Download a specific attachment:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456 \
  -o downloaded-file.pdf
```

**Delete Attachment**

Delete an attachment:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456
```

</details>

<details>
<summary><strong>💾 Backup Management</strong></summary>
<br>

**List Backups**

Get a list of all backup files:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups
```

**Create Backup**

Create a complete backup:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups
```

**Download Backup**

Download a specific backup file:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip \
  -o backup.zip
```

**Restore Backup**

Restore a backup file (replaces all current user data):
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip/restore
```

**Delete Backup**

Delete a backup file:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip
```

</details>

<details>
<summary><strong>📤 Export Management</strong></summary>
<br>

> Note: Export endpoints remain as legacy URLs for file downloads.

**Export Note**

Export a note as HTML or Markdown:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_note.php?id=123&format=html" \
  -o exported-note.html
```

**Export Folder**

Export a folder as ZIP:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_folder.php?folder_id=123" \
  -o folder-export.zip
```

**Export Structured Notes**

Export all notes preserving folder hierarchy:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_structured.php?workspace=Personal" \
  -o structured-export.zip
```

**Export All Notes**

Export all note files as ZIP:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api_export_entries.php \
  -o all-notes.zip
```

**Export All Attachments**

Export all attachments as ZIP:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api_export_attachments.php \
  -o all-attachments.zip
```

</details>

<details>
<summary><strong>⚙️ Settings</strong></summary>
<br>

**Get Setting**

Get a setting value:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/settings/language
```

**Update Setting**

Set a setting value:
```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"value": "fr"}' \
  http://YOUR_SERVER/api/v1/settings/language
```

</details>

<details>
<summary><strong>ℹ️ System Information</strong></summary>
<br>

> Note: System endpoints do not require the `X-User-ID` header.

**Get Version**

Get current version and system info:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/version
```

**Check for Updates**

Check if a newer version is available:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/updates
```

**Get Translations**

Get translation strings:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/i18n
```

</details>

<details>
<summary><strong>👥 User Management (Admin Only)</strong></summary>
<br>

User management endpoints are for administrators only and do **not** require the `X-User-ID` header.

**List All User Profiles (Public)**

Get list of active user profiles (no authentication required):
```bash
curl http://YOUR_SERVER/api/v1/users/profiles
```

**List All Users with Statistics**

Get detailed list of all users with storage info (admin only):
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users
```

**Get Specific User**

Get detailed information about a user:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users/1
```

**Create New User**

Create a new user profile:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser"}' \
  http://YOUR_SERVER/api/v1/admin/users
```

**Update User**

Update user properties (username, active status, admin status):
```bash
curl -X PATCH -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "username": "renameduser",
    "active": true,
    "is_admin": false
  }' \
  http://YOUR_SERVER/api/v1/admin/users/2
```

**Delete User**

Delete a user profile (without data):
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users/2
```

Delete a user profile and all their data:
```bash
curl -X DELETE -u 'username:password' \
  "http://YOUR_SERVER/api/v1/admin/users/2?delete_data=true"
```

**Get System Statistics**

Get aggregated statistics for all users:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/stats
```

**Repair Master Database**

Scan and rebuild the master database registry:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/repair
```

</details>

## Tech Stack

Poznote prioritizes simplicity and portability - no complex frameworks, no heavy dependencies. Just straightforward, reliable web technologies that ensure your notes remain accessible and under your control.

**Privacy-First Architecture:** Poznote operates entirely locally with no external connections required for functionality. All libraries (Excalidraw, Mermaid, KaTeX) are bundled and served from your own instance. The only outbound connection is a daily update check.

<details>
<summary>If you are interested in the tech stack on which Poznote is built, <strong>have a look here.</strong></summary>

### Backend
- **PHP 8.x** - Server-side scripting language
- **SQLite 3** - Lightweight, file-based relational database

### Frontend
- **HTML5** - Markup and structure
- **CSS3** - Styling and responsive design
- **JavaScript (Vanilla)** - Interactive features and dynamic content
- **React + Vite** - Build toolchain for Excalidraw component (bundled as IIFE)
- **AJAX** - Asynchronous data loading

### Libraries
- **Excalidraw** - Virtual whiteboard for sketching diagrams and drawings
- **Mermaid** - Client-side JavaScript library for diagram and flowchart generation from text
- **KaTeX** - Client-side JavaScript library for fast math typesetting and rendering mathematical equations
- **Sortable.js** - JavaScript library for drag-and-drop sorting
- **highlight.js** - Syntax highlighting for code blocks
- **Swagger UI** - Interactive API documentation and testing interface

### Storage
- **HTML/Markdown files** - Notes are stored as plain HTML or Markdown files in the filesystem
- **SQLite database** - Metadata, tags, relationships, and user data
- **File attachments** - Stored directly in the filesystem

### Infrastructure
- **Nginx + PHP-FPM** - High-performance web server with FastCGI Process Manager
- **Alpine Linux** - Secure, lightweight base image
- **Docker** - Containerization for easy deployment and portability
- **Python 3.12 (Alpine)** - MCP server runtime with httpx, fastmcp, and mcp libraries for AI assistant integration
</details>