
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
This project started from a simple personal need: a practical way to write, organize, and synchronize my technical and personal notes. From the beginning, the priority has been simplicity and ease of use.<br>

<br>

<p align="center">
  <a href="https://poznote.com/about.html">Learn more about the project and its background on the Poznote About page</a>
</p>

<br>
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
- [Note types](#note-types)
- [Change Settings](#change-settings)
- [Authentication](#authentication)
- [Update application](#update-application)
- [Multi-users](#multi-users)
- [Backup / Export](#backup--export)
- [Git Synchronization](#git-synchronization)
- [Restore / Import](#restore--import)
- [PWA](#pwa)
- [Offline View](#offline-view)
- [Multiple Instances](#multiple-instances)
- [MCP Server](#mcp-server)
- [Chrome Extension](#chrome-extension)
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


- Username: `admin_change_me`
- Password: value of `POZNOTE_PASSWORD` (`admin` in `.env.template` by default)
- Port: `8040`

Rename the default administrator account after the first login.

## Note types

Poznote supports two primary note formats, each tailored for different workflows.

<details>
<summary><strong>HTML Notes</strong></summary>
&nbsp;

*   **Editor:** Direct WYSIWYG (What You See Is What You Get) editing.
*   **Storage:** Saved as `.html` files in the user data directory. Since they are standard HTML, they can be opened directly in any web browser.
*   **Exclusive Features:**
    *   **Excalidraw:** Integrated drawing board for hand-drawn diagrams and sketches.
    *   **Rich Formatting:** Native support for text colors, highlighting, and standard HTML elements.
    *   **Interactive UI:** Direct manipulation of elements in the editor.
</details>

<details>
<summary><strong>Markdown Notes</strong></summary>
&nbsp;

*   **Editor:** Markdown syntax editor with real-time preview.
*   **Storage:** Saved as `.md` files in the user data directory.
*   **Exclusive Features:**
    *   **Mermaid Diagrams:</strong> Native support for generating diagrams (flowcharts, sequence, etc.) via ` ```mermaid ` code blocks.
    *   **Math Equations:** Robust LaTeX support for mathematical formulas using `$ inline $` and `$$ block $$` syntax.
    *   **Portability:** Standard Markdown format compatible with any external editor or static site generator.
</details>

## Change Settings

Most settings can be modified directly in the application through the settings page. Some system settings can only be changed in the `.env` file and require a container restart.

- **Authentication** - Initial/default passwords and login configuration
- **Web Server** - HTTP port configuration
- **OIDC / SSO Authentication** - OpenID Connect integration
- **MCP Server** - AI assistant integration

Passwords can be changed directly in the application from `Settings > Change Password`. The `.env` authentication variables remain available to define the initial or fallback passwords used when no custom password has been set for a user.

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

Poznote supports multiple authentication methods including local accounts and external identity providers.

<details>
<summary><strong>Local Accounts Authentication</strong></summary>
<br>

Poznote authenticates users against their profile using a username or email address and a password.

#### Password resolution order

When a user signs in, Poznote checks passwords in this order:

1. A custom bcrypt password hash stored in the master database for that user.
2. Fallback values from `.env`:
  - `POZNOTE_PASSWORD` for the administrator profile
  - `POZNOTE_PASSWORD_USER` for standard users
  - `POZNOTE_PASSWORD_{USERNAME}` for per-user overrides

This means `.env` acts as the default or seed credential source, while a password changed from the interface takes priority afterward.

#### Default account

On a fresh installation, Poznote creates one active administrator profile:

- Username: `admin_change_me`
- Password: `POZNOTE_PASSWORD`

Rename this account after the first login.

</details>

<a id="oidc"></a>
<details>
<summary><strong>OIDC / SSO Authentication (Optional)</strong></summary>
<br>

Poznote supports OpenID Connect (authorization code + PKCE) for single sign-on integration. This allows users to log in using external identity providers such as Auth0, Keycloak, Azure AD, or Google Identity.

#### How it works

1. The login page displays a `Continue with [Provider Name]` button when OIDC is enabled.
2. Users authenticate with the OIDC authorization code flow secured by PKCE.
3. Access can be restricted with `POZNOTE_OIDC_ALLOWED_GROUPS` and, if needed, the legacy `POZNOTE_OIDC_ALLOWED_USERS` allowlist.
4. After authentication, Poznote links the identity in this order: `sub` (`oidc_subject`), then `preferred_username`, then `email`.
5. If no profile matches and `POZNOTE_OIDC_AUTO_CREATE_USERS=true`, Poznote creates one automatically.
6. If `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, the username/password form is hidden and the login page becomes SSO-only.

#### Configuration

Add the OIDC variables to your `.env` file (see `.env.template`).

Minimum required settings:

```bash
POZNOTE_OIDC_ENABLED=true
POZNOTE_OIDC_ISSUER=https://your-identity-provider.com
POZNOTE_OIDC_CLIENT_ID=your_client_id
```

Notes:

- `POZNOTE_OIDC_DISCOVERY_URL` can be used instead of deriving discovery from the issuer.
- `POZNOTE_OIDC_CLIENT_SECRET` is optional and mainly needed for confidential clients.
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` hides the local login form.
- `POZNOTE_OIDC_DISABLE_BASIC_AUTH=true` rejects HTTP Basic Auth on the API.
- `POZNOTE_OIDC_GROUPS_CLAIM` defaults to `groups`.

#### Access Control Example (Groups + Auto-Provision)

Restrict access to specific groups and auto-create users at first login:
```bash
POZNOTE_OIDC_GROUPS_CLAIM=groups
POZNOTE_OIDC_ALLOWED_GROUPS=poznote
POZNOTE_OIDC_AUTO_CREATE_USERS=true
```

`POZNOTE_OIDC_ALLOWED_USERS` remains available for backward compatibility, but group-based access is recommended.

If auto-provisioning is enabled, Poznote generates a username from the OIDC claims (`preferred_username`, `nickname`, email local part, `name`, then `sub`) and stores the OIDC subject on the created profile.

</details>

## Personalization

Customize the look and feel of your Poznote instance to match your preferences and workflow.

<details>
<summary><strong>Custom CSS Overrides</strong></summary>
<br>

If you want to adjust fonts, spacing, or other visual details beyond the built-in options, you can load an extra stylesheet on every HTML page.

Configure it in **Settings > Appearance > Custom CSS path**.

Notes:

- Enter only the filename, for example `custom.css`.
- The file must be placed in `src/css/`, and Poznote will load it as `css/custom.css`.
- Poznote appends a cache-busting `v=` parameter automatically when the target file exists locally.
- The stylesheet is injected near the end of `<head>`, so it can override the default application styles.

</details>

<details>
<summary><strong>Element Visibility</strong></summary>
<br>

Poznote allows you to declutter the interface by hiding elements you don't use.

Configure it in **Settings > Appearance > UI Customization**.

- **Granular Control:** Toggle visibility for home cards, toolbar actions, slash menu items, and more.
- **Per-User:** Each user can have their own unique interface layout.
- **Searchable:** Easily find the element you want to hide using the filter in the configuration modal.

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
- **Hybrid Password Model**: Access uses per-profile credentials with custom passwords stored in database, falling back to `.env` defaults when no custom password has been set.
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
Use the current password of the admin profile you authenticate with. If that profile has a custom password set in Poznote, the `.env` fallback password is no longer valid for API calls until the custom password is reset.

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
- `'admin_password'` - Current admin password for the API profile (custom password or `.env` fallback)
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

Poznote supports automatic and manual synchronization with **GitHub** or **Forgejo**. Each user configures their own repository independently. There is no shared global repository.

<details>
<summary><strong>How to configure Git Sync</strong></summary>
<br>

**Step 1 — Enable the feature (admin, in Settings > Advanced Settings)**

Toggle **Git Sync** to enabled in the **Advanced Settings** section of the Settings page. This will reveal the **Git Sync** menu in the sidebar for all users.

---

**Step 2 — Each user configures their own repo (Settings > Git Sync)**

| Field | Description |
|---|---|
| Provider | `GitHub` or `Forgejo` |
| API Base URL | GitHub: auto-filled (read-only). Forgejo: your instance URL, e.g. `https://forgejo.example.com/api/v1` |
| Access Token | GitHub PAT (`ghp_...`) or Forgejo token (Settings > Applications) |
| Repository | `owner/repo` format |
| Branch | Default: `main` |
| Author Name / Email | Used for commit metadata |

> 🔒 Access tokens are encrypted at rest using AES-256-GCM. Set `POZNOTE_APP_SECRET` in your `.env` (generated with `openssl rand -hex 32`) to ensure the encryption key survives container rebuilds. If not set, a key is auto-generated and stored in `data/.app_secret`.

---

**Automatic sync**

When enabled by the user, Poznote will automatically:
- **Pull** on login
- **Push** on every note create, update, or delete

Manual push/pull is also available from the **Sync Status** page (cloud icon in the header).

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
  - Up to 50 files can be selected at once, configurable in Settings > Advanced Settings > Import Limits

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Import ZIP file</strong></summary>
<br>

Import a ZIP archive containing multiple notes:

  - Support `.html`, `.md`, `.markdown` or `.txt` files types
  - ZIP archives can contain up to 300 files, configurable in Settings > Advanced Settings > Import Limits
  - When importing a ZIP archive, Poznote automatically detects and recreates the folder structure

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Import Obsidian Notes</strong></summary>
<br>

Import a ZIP archive containing multiple notes from Obsidian:

  - ZIP archives can contain up to 300 files, configurable in Settings > Advanced Settings > Import Limits
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

## Admin Tools

Admins can access additional tools via Settings > Admin Tools:

- **Disaster Recovery** - Reconstruct the entire user index from data folders in case of system corruption or database loss.
- **Base64 Image Converter** - Convert inline Base64 encoded images to attachments.
- **Orphan attachments scanner** - Scan and clean up orphaned attachment files.

## PWA

Poznote can be installed as a **Progressive Web App (PWA)** in compatible browsers (Chrome, Edge, Safari on iOS, etc.).

### Install on desktop

1. Open your Poznote URL in the browser.
2. Use the browser install action (for example **Install app** in the address bar/menu), or use the install button in **Settings** → **PWA Installation**.
3. Launch Poznote from your applications list like a native app.

### Install on mobile

- **Android (Chrome/Edge):** open menu → **Install app** / **Add to Home screen**
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**

### Offline behavior

Poznote can be installed as a PWA, but this does not provide offline access to your notes content. For offline access to your notes, you must use the **Complete Backup** export feature (see section below).

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser. This allows you to read your notes offline, but without the full Poznote functionality, it's a read-only export.

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

Poznote provides a comprehensive RESTful API v1 for programmatic access to notes, folders, workspaces, tags, attachments, backups, settings, and more.

For the complete API reference with all endpoints, parameters, and curl examples, see the **[REST API Documentation](docs/API-REST.md)**.

### Quick Start

```bash
# List all notes for user ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Create a note
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote at `Settings > API Documentation` to browse all endpoints, view request/response schemas, and test API calls interactively.

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