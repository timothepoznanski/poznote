

<p align="center">
  <img src="images/poznote.svg" alt="Poznote Logo" width="80">
</p>

<h1 align="center">Poznote</h1>

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/timothepoznanski/poznote?style=flat&logo=github)](https://github.com/timothepoznanski/poznote/stargazers) [![License](https://img.shields.io/github/license/timothepoznanski/poznote?style=flat)](https://github.com/timothepoznanski/poznote/blob/main/LICENCE) [![Docker GHCR](https://img.shields.io/badge/Docker-GHCR-2496ED?style=flat&logo=docker&logoColor=white)](https://github.com/timothepoznanski/poznote/pkgs/container/poznote) [![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/timothepoznanski)

</div>

<h3 align="center">
Poznote is a lightweight, open-source personal note-taking and documentation platform.<br><br>
</h3>

<p align="center">
  <img src="images/github.png" alt="Poznote" width="100%">
</p>

## Features

<div align="center">

| 📝 **Editor** | 🔍 **Organization** | 🔧 **Technical** |
|:---:|:---:|:---:|
| Rich Text Editor | Powerful Search | Self-Hosted |
| Markdown Notes | Tag System | REST API |
| Excalidraw Integration | Workspaces | Multi-instance |
| Mermaid Diagrams | File Attachments | Built-in Backup |
| Mathematics Support | Folders | Trash System |
| Tasklist | Favorites | OpenID Connect |
| Dark Mode | Public Sharing | Responsive Design |

</div>

## Try the Poznote demo

Username: `poznote`
<br>
Password: `poznote`

[poznote-demo.up.railway.app](https://poznote-demo.up.railway.app)

## Table of content

- [Install](#install)
- [Access](#access)
- [Troubleshooting Installation](#troubleshooting-installation)
- [Change Settings](#change-settings)
- [Authentication](#authentication)
- [Update application](#update-application)
- [Backup / Export and Restore / Import](#backup--export-and-restore--import)
- [Offline View](#offline-view)
- [Multiple Instances](#multiple-instances)
- [Tech Stack](#tech-stack)
- [API Documentation](#api-documentation)
- [Use Poznote in the Cloud](#use-poznote-in-the-cloud)
- [Star History](#star-history)


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
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Edit the `.env` file:

```powershell
notepad .env
```

Download the Docker Compose configuration file:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Docker image:
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
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Edit the `.env` file:
```bash
vi .env
```

Download the Docker Compose configuration file:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Docker image:
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
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Edit the `.env` file:
```bash
vi .env
```

Download the Docker Compose configuration file:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest Docker image:
```bash
docker compose pull
```

Start Poznote container:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Cloud</strong></summary>
<br>

**See section [Use Poznote in the Cloud](#use-poznote-in-the-cloud)**

</details>

## Access

After installation, access Poznote in your web browser:

[http://localhost:8040](http://localhost:8040)


- Username: `admin`
- Password: `admin`
- Port: `8040`

## Troubleshooting Installation

<details>
<summary><strong>mkdir() warnings (permission denied) or Connection failed</strong></summary>
<br>

If you encounter errors like:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- The `database` folder is created with `root:root` instead of `www-data:www-data`

This is a known issue with Docker volume mounts in certain environments (Komodo, Portainer, etc.). The container cannot change permissions on mounted volumes in some configurations.

**Solution:** Before starting the container, set the correct permissions on your host machine:

```bash
# Navigate to your Poznote directory
cd poznote

# Create the data directory structure with correct permissions
mkdir -p data/database

# Set ownership to UID 82 (www-data in Alpine Linux)
sudo chown -R 82:82 data

# Start the container
docker compose up -d
```

> 💡 **Note:** UID 82 corresponds to the `www-data` user in Alpine Linux, which is used by the Poznote Docker image.

</details>

<details>
<summary><strong>"This site can't be reached"</strong></summary>
 <br>

If you see "This site can't be reached" in your browser, you may have SELinux enabled. In this case, check the container logs:

```bash
docker logs poznote-webserver-1
# or with podman
podman logs poznote-webserver-1
```

You'll likely find:
- `chown: /var/www/html/data: Permission denied`

This occurs when Docker volumes don't have the correct SELinux context, especially when installing from `/root` directory.

**Solution:** We strongly recommend using the `:Z` suffix for Docker volumes and avoiding the `/root` directory to ensure proper functioning on all distributions.

Edit your `docker-compose.yml` to add `:Z` to volume definitions:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Alternatively, install Poznote in a directory outside of `/root`, such as `/opt/poznote` or `~/poznote`.

</details>

## Change Settings

Poznote configuration is split between two locations:

<details>
<summary><strong>System Settings (`.env` file)</strong></summary>
<br>

The following settings are configured in the `.env` file located in your Poznote installation directory:

**Basic Authentication**
- `POZNOTE_USERNAME` - Admin username for login (default: `admin`)
- `POZNOTE_PASSWORD` - Admin password for login (default: `admin`)

**Web Server**
- `HTTP_WEB_PORT` - Port on which Poznote will be accessible (default: `8040`)

**OIDC / SSO Authentication**
- `POZNOTE_OIDC_ENABLED` - Enable OpenID Connect authentication (`true`/`false`)
- `POZNOTE_OIDC_PROVIDER_NAME` - Display name for the OIDC provider
- `POZNOTE_OIDC_ISSUER` - OIDC provider issuer URL
- `POZNOTE_OIDC_CLIENT_ID` - Client ID from OIDC provider
- `POZNOTE_OIDC_CLIENT_SECRET` - Client secret from OIDC provider
- `POZNOTE_OIDC_SCOPES` - Custom scopes (default: `"openid profile email"`)
- `POZNOTE_OIDC_DISCOVERY_URL` - Override auto-discovery URL
- `POZNOTE_OIDC_REDIRECT_URI` - Custom redirect URI
- `POZNOTE_OIDC_END_SESSION_ENDPOINT` - Custom logout endpoint
- `POZNOTE_OIDC_POST_LOGOUT_REDIRECT_URI` - Redirect URL after logout
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN` - Hide username/password login form (`true`/`false`)
- `POZNOTE_OIDC_DISABLE_BASIC_AUTH` - Disable HTTP Basic Auth for API (`true`/`false`)
- `POZNOTE_OIDC_ALLOWED_USERS` - Comma-separated list of allowed users (emails or usernames)

**Import Limits**
- `POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES` - Max number of individual files for import (default: `50`)
- `POZNOTE_IMPORT_MAX_ZIP_FILES` - Max number of files in ZIP archive for import (default: `300`)

**How to Modify Settings**

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

Additional settings are available through the Poznote web interface and are stored in the database:

- **General settings** - Application preferences, default workspace, language
- **Note editor** - Default note type (HTML/Markdown), editor preferences
- **Workspaces** - Create, rename, delete workspaces
- **Folders** - Manage folder structure and organization
- **Backup/Restore** - Create backups, restore from backups
- **And more** - Various application-level configurations

**How to Modify Settings**

1. Log in to Poznote
2. Click on the **Settings** icon (⚙️) in the navigation bar
3. Modify your preferences directly in the interface

> **Note:** Settings in the web interface are stored in the database and persist across container restarts. Only `.env` file changes require container restart.

</details>

## Authentication

Poznote supports two authentication methods:

<details>
<summary><strong>Traditional Authentication</strong></summary>
<br>

By default, Poznote uses traditional username/password authentication. Configure your credentials in the `.env` file:

```bash
POZNOTE_USERNAME=your_username
POZNOTE_PASSWORD=your_secure_password
```

</details>

<details>
<summary><strong>OIDC / SSO Authentication (Optional)</strong></summary>
<br>

Poznote can optionally authenticate users via OpenID Connect (authorization code + PKCE) for sign-on integration.

This allows users to log in using external identity providers such as:

- Auth0
- Keycloak
- Azure Active Directory
- Google Identity
- And any other OIDC-compliant provider

#### Configuration

Add the OIDC variables (see .env.example) to your `.env` file and restart the container.

#### How it works

When OIDC is enabled:
1. The login page displays a "Continue with [Provider Name]" button
2. Clicking the button redirects users to your identity provider
3. After successful authentication, users are redirected back to Poznote
4. Poznote validates the OIDC tokens and creates a session

If `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN` is set to `true`, the normal username/password login form will be hidden, forcing users to authenticate only through OIDC.

If `POZNOTE_OIDC_DISABLE_BASIC_AUTH` is set to `true`, HTTP Basic Auth for API requests will be disabled, rejecting API calls that use username/password credentials. This can be combined with `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN` to fully enforce OIDC-only authentication across both the UI and API.

Note that OIDC configuration is stored in `.env` file (not in the database) to keep sensitive credentials secure.


#### Access Control Example

Restrict access to specific users by email address or username:
```bash
POZNOTE_OIDC_ALLOWED_USERS=alice@example.com,bob@example.com,charlie@company.org
```

</details>

## Update application

<details>
<summary><strong>Update to the latest version</strong></summary>
<br>

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

Download the latest .env.example:
```bash
curl -o .env.example https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.example
```

Review `.env.example` and add any new variables to your `.env` file if needed.

Download the latest Poznote image:
```bash
docker compose pull
```

Start the updated container:
```bash
docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.

</details>

<details>
<summary><strong>Update to Beta version</strong></summary>
<br>

Occasionally, beta versions will be published as **pre-releases** on GitHub. These versions include more features and fixes than the stable production version, but may not be fully validated yet.

**How to install a beta version:**

You can install beta versions by modifying your `docker-compose.yml` to use a specific version tag instead of `latest`:

1. Edit your `docker-compose.yml` file and change the image line to:
   ```yaml
   image: ghcr.io/timothepoznanski/poznote:X.X.X-beta
   ```
   Replace `X.X.X-beta` with the specific beta version from the [GitHub Releases](https://github.com/timothepoznanski/poznote/releases) page.

2. Update and restart:
   ```bash
   docker compose down
   docker compose pull
   docker compose up -d
   ```

> **Note:** Beta versions are marked as "Pre-release" on GitHub and are not automatically suggested for updates in the application.

</details>

## Backup / Export and Restore / Import

Poznote includes built-in Backup / Export and Restoration / Import functionality accessible through Settings.

<a id="complete-backup"></a>
<details>
<summary><strong>Complete Backup to Poznote zip</strong></summary>
<br>

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

</details>

<a id="complete-restore"></a>
<details>
<summary><strong>Complete Restore from Poznote zip backup</strong></summary>
<br>

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

For more information about the different restore methods, see the [Backup & Restore Guide](https://github.com/timothepoznanski/poznote/blob/main/Docs/BACKUP_RESTORE_GUIDE.md).

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

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Automated Backups with Bash Script</strong></summary>
<br>

For automated scheduled backups, you can use the included `backup-poznote.sh` script. This script creates complete backups via the Poznote REST API v1 and automatically manages retention.

**Script location:** `backup-poznote.sh` in the `tools` folder of the Poznote repository

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

1. The script calls the Poznote REST API v1 (`POST /api/v1/backups`) to create a backup at 00:00 (midnight) and 12:00 (noon) every day
2. The API generates a backup ZIP in the Poznote container: `/var/www/html/data/backups/`
3. The script downloads this backup locally (`GET /api/v1/backups/{filename}`) to: `/root/poznote/backups-poznote/`
4. Old backups are automatically deleted from both locations (`DELETE /api/v1/backups/{filename}`) to keep only the most recent ones based on retention count

</details>

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
- **Swagger UI** - Interactive API documentation and testing interface

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

Poznote provides a RESTful API v1 for programmatic access to notes, folders, workspaces, tags, and attachments.

**Base URL:** `/api/v1`

### Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote from `Settings > API Documentation` and browse all endpoints, view request/response schemas, and test API calls interactively.

### Command Line Examples (Curl)

Ready-to-use curl commands for every API operation.

<details>
<summary><strong>📝 Notes Management</strong></summary>
<br>

**List Notes**

List all notes in the system:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes
```

Filter notes by workspace, folder, tag, or search:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/notes?workspace=Personal&folder=Projects&tag=important"
```

**List Notes with Attachments**

List all notes that have file attachments:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/with-attachments
```

**Get Note Content**

Get a specific note by ID:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123
```

Resolve a note by title (reference) inside a workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/notes/resolve?reference=My+Note&workspace=Personal"
```

**Create Note**

Create a new note with title, content, tags, folder and workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "content": "This is the content of my note",
    "tags": "work,important",
    "folder": "Projects",
    "workspace": "Personal",
    "type": "markdown"
  }' \
  http://YOUR_SERVER/api/v1/notes
```

**Update Note**

Update an existing note by ID:
```bash
curl -X PATCH -u 'username:password' \
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
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123
```

Permanently delete (bypass trash):
```bash
curl -X DELETE -u 'username:password' \
  "http://YOUR_SERVER/api/v1/notes/123?permanent=true"
```

**Restore Note**

Restore a note from trash:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/restore
```

**Duplicate Note**

Create a copy of an existing note:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/duplicate
```

**Convert Note Type**

Convert between markdown and HTML:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"target_type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes/123/convert
```

**Update Tags**

Replace all tags on a note:
```bash
curl -X PUT -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"tags": "work,urgent,meeting"}' \
  http://YOUR_SERVER/api/v1/notes/123/tags
```

**Toggle Favorite**

Toggle favorite status:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/favorite
```

**Move Note to Folder**

Move a note to a different folder:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"folder_id": 45}' \
  http://YOUR_SERVER/api/v1/notes/123/folder
```

Remove from folder (move to root):
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/remove-folder
```

</details>

<details>
<summary><strong>🔗 Public Sharing</strong></summary>
<br>

**Get Share Status**

Check if a note is shared:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**Create Share Link**

Create a public share link for a note:
```bash
curl -X POST -u 'username:password' \
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
curl -X PATCH -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark", "indexable": true}' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**Revoke Share Link**

Remove public access:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

**List All Shared Notes**

Get list of all publicly shared notes:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/shared
```

Filter by workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/shared?workspace=Personal"
```

</details>

<details>
<summary><strong>🗑️ Trash Management</strong></summary>
<br>

**List Trash**

Get all notes in trash:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/trash
```

Filter by workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/trash?workspace=Personal"
```

**Empty Trash**

Permanently delete all notes in trash:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/trash
```

**Permanently Delete Note**

Delete a specific note from trash:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/trash/123
```

</details>

<details>
<summary><strong>📁 Folders Management</strong></summary>
<br>

**List Folders**

List all folders in a workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal"
```

Get folder tree (nested structure):
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal&tree=true"
```

**Get Folder Counts**

Get note counts for all folders:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/folders/counts?workspace=Personal"
```

**Create Folder**

Create a new folder:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api/v1/folders
```

Create a subfolder:
```bash
curl -X POST -u 'username:password' \
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
curl -X PATCH -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"name": "New Folder Name"}' \
  http://YOUR_SERVER/api/v1/folders/12
```

**Move Folder**

Move folder to a different parent:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"parent_id": 56}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

Move to root (no parent):
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"parent_id": null}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

**Update Folder Icon**

Set a custom icon:
```bash
curl -X PUT -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"icon": "fa-folder-open"}' \
  http://YOUR_SERVER/api/v1/folders/12/icon
```

**Empty Folder**

Move all notes in folder to trash:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/folders/12/empty
```

**Delete Folder**

Delete a folder:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/folders/12
```

</details>

<details>
<summary><strong>🗂️ Workspaces Management</strong></summary>
<br>

**List Workspaces**

Get all workspaces:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/workspaces
```

**Create Workspace**

Create a new workspace:
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"name": "MyProject"}' \
  http://YOUR_SERVER/api/v1/workspaces
```

**Rename Workspace**

Rename an existing workspace:
```bash
curl -X PATCH -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"new_name": "NewName"}' \
  http://YOUR_SERVER/api/v1/workspaces/OldName
```

**Delete Workspace**

Delete a workspace:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/workspaces/OldWorkspace
```

</details>

<details>
<summary><strong>🏷️ Tags Management</strong></summary>
<br>

**List Tags**

Get all unique tags:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/tags
```

Filter by workspace:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api/v1/tags?workspace=Personal"
```

</details>

<details>
<summary><strong>📎 Attachments Management</strong></summary>
<br>

**List Attachments**

Get all attachments for a note:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

**Upload Attachment**

Upload a file to a note:
```bash
curl -X POST -u 'username:password' \
  -F "file=@/path/to/file.pdf" \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

**Download Attachment**

Download a specific attachment:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456 \
  -o downloaded-file.pdf
```

**Delete Attachment**

Delete an attachment:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456
```

</details>

<details>
<summary><strong>💾 Backup Management</strong></summary>
<br>

**List Backups**

Get a list of all backup files:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/backups
```

**Create Backup**

Create a complete backup:
```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/backups
```

**Download Backup**

Download a specific backup file:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip \
  -o backup.zip
```

**Delete Backup**

Delete a backup file:
```bash
curl -X DELETE -u 'username:password' \
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
curl -u 'username:password' \
  "http://YOUR_SERVER/api_export_note.php?id=123&format=html" \
  -o exported-note.html
```

**Export Folder**

Export a folder as ZIP:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api_export_folder.php?folder_id=123" \
  -o folder-export.zip
```

**Export Structured Notes**

Export all notes preserving folder hierarchy:
```bash
curl -u 'username:password' \
  "http://YOUR_SERVER/api_export_structured.php?workspace=Personal" \
  -o structured-export.zip
```

**Export All Notes**

Export all note files as ZIP:
```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api_export_entries.php \
  -o all-notes.zip
```

**Export All Attachments**

Export all attachments as ZIP:
```bash
curl -u 'username:password' \
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
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/settings/language
```

**Update Setting**

Set a setting value:
```bash
curl -X PUT -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"value": "fr"}' \
  http://YOUR_SERVER/api/v1/settings/language
```

</details>

<details>
<summary><strong>ℹ️ System Information</strong></summary>
<br>

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

## Use Poznote in the Cloud

<p align="center">
  <img src="images/railway-template.png" alt="Railway Template" width="100%">
</p>

If you:

- Want access from anywhere (phone, tablet, computer) with almost zero setup
- Have no experience with server management or don't want to manage server and security
- Don't know how to use command line or don't want to use command line
- Prefer one-click updates or automatic updates
- Are okay with approximately $5/month (Cloud provider fees)

**👉 [View Poznote Cloud Install and Manage Guide](Docs/POZNOTE-CLOUD.md)**

## Star History

<p align="center">
  <a href="https://star-history.com/#timothepoznanski/poznote&Date">
    <img src="https://api.star-history.com/svg?repos=timothepoznanski/poznote&type=Date" alt="Star History Chart">
  </a>
</p>
