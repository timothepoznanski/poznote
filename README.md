
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
This project started from a simple personal need: a practical way to write, organize, and synchronize my technical and personal notes. From the beginning, the priority has been simplicity and ease of use (I have no patience for bloated interfaces with unnecessary options). Advanced features exist, but they never get in the way of a clear and accessible experience.
<br>
<br>
<p align="center">
  <img src="images/poznote-light.png" alt="Poznote-light" width="100%">
</p>


Discover all the [features here](https://poznote.com/index.html#features).

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
- [Poznote Extension](#poznote-extension)
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

Poznote configuration is split between two locations:

<details>
<summary><strong>System Settings (`.env` file)</strong></summary>
<br>

System settings can be modified in the `.env` file. Several categories of settings are available:

- **Authentication** - Admin and user passwords
- **Web Server** - HTTP port configuration
- **OIDC / SSO Authentication** - OpenID Connect integration
- **Settings Access Control** - Restrict or password-protect settings page
- **Import Limits** - Maximum files for imports
- **Git Sync** - GitHub and Forgejo synchronization
- **MCP Server** - AI assistant integration

**How to Modify System Settings**

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running Poznote container:
```bash
docker compose down
```

Edit and modify the `.env` file with your preferred text editor.

Save the file and restart Poznote to apply changes:
```bash
docker compose up -d
```

</details>

<details>
<summary><strong>Application Settings (Settings Page)</strong></summary>
<br>

Additional settings are available through the Poznote web interface and are stored in the database or web browser local storage.

**How to Modify Application Settings**

1. Log in to Poznote
2. Click on the **Settings** icon (⚙️) in the navigation bar
3. Modify your preferences directly in the interface

> **Note:** Settings in the web interface are stored in the database and persist across container restarts. Only `.env` file changes require container restart.

</details>

## Authentication

<details>
<summary><strong>Traditional Authentication</strong></summary>
<br>

Poznote uses a password model based on the `.env` file. You define your administrator and standard user passwords in the `.env` file, and users log in with their username and password.

#### Authentication Model

- **Global Authentication**: Uses `POZNOTE_PASSWORD` (admin) and `POZNOTE_PASSWORD_USER` (standard users) defined in your `.env` file.
- **User-Specific Passwords**: You can set individual passwords for standard users using `POZNOTE_PASSWORD_{USERNAME}` in your `.env`.
- **User Profiles**: Each user has a unique profile (username) with isolated data.
- **Automatic Profile Selection**: The system automatically selects the correct profile when you log in based on your credentials.
- **First Account**: On a new installation or migration, the first user created is always an administrator named `admin_change_me`.



#### Login Flow

1. User opens Poznote.
2. User enters their **username** and **password**.
3. System automatically selects the appropriate user profile.
4. User accesses their personal data space.

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
- **All users** can restore backups to their own profile
- **Admins** can access additional disaster recovery tools
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

<details>
<summary><strong>Disaster Recovery (Reconstruct System Index)</strong></summary>
<br>

In case of system corruption or loss of the master database, Poznote can reconstruct its entire user index by scanning the data folders. This tool is accessible via Settings > Advanced > Reconstruct System Index.

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

## Poznote Extension

The **Poznote URL Saver** is a browser extension that allows you to quickly save the URL of the current page to your Poznote instance with a single click.

