<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="docs/README.fr.md">Français</a> ·
  <a href="docs/README.de.md">Deutsch</a> ·
  <a href="docs/README.es.md">Español</a> ·
  <a href="docs/README.pt.md">Português</a> ·
  <a href="docs/README.ru.md">Русский</a> ·
  <a href="docs/README.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="images/poznote-logo-text.png" alt="Poznote Logo" width="400">
</p>

<h2 align="center">
Powerful note-taking without the hassle.
</h2>

<h3 align="center">
A free, self-hosted, open-source alternative to Notion, Obsidian, Evernote, or OneNote.
</h3>

<p align="center">
  <a href="https://github.com/timothepoznanski/poznote/releases"><img src="https://img.shields.io/github/v/release/timothepoznanski/poznote?label=release&color=1f6feb" alt="Latest release"></a>
  <a href="https://github.com/timothepoznanski/poznote/pkgs/container/poznote"><img src="https://img.shields.io/badge/ghcr.io-poznote-2496ed?logo=docker&logoColor=white" alt="Docker image"></a>
  <a href="https://github.com/timothepoznanski/poznote/blob/main/LICENCE"><img src="https://img.shields.io/github/license/timothepoznanski/poznote?color=44cc11" alt="License MIT"></a>
  <a href="https://github.com/timothepoznanski/poznote/stargazers"><img src="https://img.shields.io/github/stars/timothepoznanski/poznote?color=f5b400" alt="GitHub stars"></a>
  <a href="https://github.com/timothepoznanski/poznote/issues?q=is%3Aissue+is%3Aclosed"><img src="https://img.shields.io/github/issues-closed/timothepoznanski/poznote?label=issues%20closed&color=44cc11" alt="Closed issues"></a>
  <a href="https://github.com/timothepoznanski/poznote/discussions"><img src="https://img.shields.io/github/discussions/timothepoznanski/poznote?label=discussions&logo=github&color=8957e5" alt="GitHub Discussions"></a>
  <a href="https://demo.poznote.com"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live demo"></a>
</p>

<p align="center">
  <img src="images/pres1.png" alt="Poznote-light" width="100%">
</p>

### Features

Discover all the features [here](https://poznote.com/#features).

### Screenshots

See all the screenshots [here](https://poznote.com/screenshots.html).

### Demo

https://demo.poznote.com

**Login**: poznote<br>
**Password**: poznote

### They talk about Poznote

https://poznote.com/press.html

### Discord

Join the community to ask questions, share feedback or follow the development:

https://discord.gg/AWhWWSEkJ

## Table of content

- [Install](#install)
- [Access](#access)
- [Change Settings](#change-settings)
- [Update application](#update-application)
- [Authentication](#authentication)
- [App Passwords](#app-passwords)
- [Note types](#note-types)
- [Snapshots](#snapshots)
- [Personalization](#personalization)
- [Multi-users](#multi-users)
- [Activity Log](#activity-log)
- [Webhooks](#webhooks)
- [Git Synchronization](#git-synchronization)
- [S3 Attachment Storage](#s3-attachment-storage)
- [S3 Backups](#s3-backups)
- [Backup / Export](#backup--export)
- [Restore / Import](#restore--import)
- [Offline](#offline)
- [Multiple Instances](#multiple-instances)
- [AI Assistant](#ai-assistant)
- [Transcription (speech to text)](#transcription-speech-to-text)
- [MCP Server](#mcp-server)
- [Chrome Extension](#chrome-extension)
- [Share to Poznote on Android](#share-to-poznote-on-android)
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

Start Poznote containers:
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

Start Poznote containers:
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

Start Poznote containers:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Cloud</strong></summary><br>

Don't want to manage a server? A hosting company can run Poznote for you and keep it online. See the available hosts and how to choose between them [here](https://poznote.com/hosting.html).

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

On a Proxmox VE host, the Proxmox VE Community Scripts project installs Poznote in its own container with a single command, no Docker involved: it creates an unprivileged Debian 13 LXC (1 vCPU, 512 MB of RAM and a 4 GB disk by default) and serves Poznote from nginx and PHP inside it.

Run this from the Proxmox host shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

Poznote then answers at `http://<container-ip>:8040`, with the same default credentials as any other install. To update it later, run `update` in the container console.

This script is written and maintained by the community, not by Poznote. See the [Poznote script page](https://community-scripts.org/scripts/poznote) for its options and notes.

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes with Helm</strong></summary>

#### Step 1: Prerequisite

Install [Helm](https://helm.sh/docs/intro/install/) and make sure your Kubernetes context points to the cluster where you want to deploy Poznote.

#### Step 2: Deploy Poznote

Add the HelmForge chart repository:

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Update your local chart index:

```bash
helm repo update
```

Install Poznote:

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

The Poznote Helm chart is maintained by the HelmForge community as a Kubernetes-native installation option. See the [HelmForge Poznote chart documentation](https://helmforge.dev/docs/charts/poznote) for values, persistence, service exposure, probes, security contexts, and other production-oriented settings.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

Poznote also ships a rootless image variant that runs entirely as an unprivileged user (uid/gid `1000`) instead of root — for environments that forbid root inside containers (Kubernetes restricted `PodSecurityStandard`, rootless Podman, `docker run --user`, etc). It works exactly like the default image; the only differences are that it listens internally on port `8080` and cannot fix the ownership of your data directory at startup.

#### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Step 2: Deploy Poznote

Create a new directory:
```bash
mkdir poznote
```

Navigate to the Poznote directory:
```bash
cd poznote
```

Create the data directory and make it owned by uid/gid `1000` (**required**: unlike the default image, the rootless container cannot fix this ownership itself at startup):
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

`sudo` is often not needed here: if your user already has uid `1000` the `chown` can be skipped, and on rootless Podman/Docker it can run without root, see [Running rootless](docs/TROUBLESHOOTING.md#running-rootless).

Create the environment file:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edit the `.env` file:
```bash
vi .env
```

Download the rootless Docker Compose configuration file:
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Download the latest Poznote rootless Webserver and Poznote MCP images:
```bash
docker compose -f docker-compose.rootless.yml pull
```

Start Poznote containers:
```bash
docker compose -f docker-compose.rootless.yml up -d
```

To migrate an existing Poznote instance to the rootless variant, or for more details, see [Running rootless](docs/TROUBLESHOOTING.md#running-rootless) in the Troubleshooting Guide.

</details>

<br>

> If you encounter installation issues, see the [Troubleshooting Guide](docs/TROUBLESHOOTING.md).

## Access

After installation, access Poznote in your web browser:

[http://localhost:8040](http://localhost:8040)


- Username: `admin_change_me`
- Password: `admin`
- Port: `8040`

Rename the default administrator account and change the default password after the first login.

## Change Settings

Most day-to-day settings are changed from the Poznote interface. Use the `.env` file only for deployment/runtime values that are read when containers start.

<details>
<summary><strong>Use the <code>.env</code> file for</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Optional runtime overrides such as `POZNOTE_MCP_PORT` and `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN` to change the number of simultaneous PHP requests (default 10) on a busy instance, see the [Troubleshooting Guide](docs/TROUBLESHOOTING.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT` to change the PHP memory limit per request, in MB (default 512), see the [Troubleshooting Guide](docs/TROUBLESHOOTING.md#a-request-runs-out-of-memory)
- `POZNOTE_LISTEN_PORT` to change the port the web server listens on inside the container (default 80), only needed with `network_mode: host`, see the [Troubleshooting Guide](docs/TROUBLESHOOTING.md#running-with-host-network)
- `POZNOTE_SETTINGS_PASSWORD` to ask for an extra password before the Settings page opens, left empty by default
- `POZNOTE_MCP_AUTH_TOKEN` to require a bearer token from MCP clients, see [MCP Server](#mcp-server)

</details>

<details>
<summary><strong>Use the UI for</strong></summary>
<br>

- Admin/global settings such as OIDC provider settings, Git Sync enablement, import limits, and custom CSS upload
- User/profile settings such as local account passwords, theme, font sizes, note sorting, workspace background, and hidden UI elements

</details>


### Modify System Settings (`.env`)

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running Poznote containers:
```bash
docker compose down
```

Edit your `.env` file with your preferred text editor (e.g., `nano .env` or `notepad .env`).

Save the file and start the containers again to apply changes:
```bash
docker compose up -d
```

## Update application

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running containers before updating:
```bash
docker compose down
```

Download the latest Docker Compose configuration:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Download the latest `.env.template`:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Use sdiff to review `.env.template` and add any new variables to your `.env` file if needed:
```bash
sdiff .env .env.template
```

Download the latest Poznote Webserver and Poznote MCP images:
```bash
docker compose pull
```

Start the updated containers:
```bash
docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.

### Beta versions

Beta versions bring new features before they are released as stable, and are listed as pre-releases on the [releases page](https://github.com/timothepoznanski/poznote/releases). They are published under the `latest-and-beta` tag, which always points to the newest version, beta or stable.

To use them, change the two `image` lines of your `docker-compose.yml` and keep the rest of the file as it is:
```yaml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest-and-beta
    ...
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:latest-and-beta
    ...
```

With the [rootless](#rootless) variant, the webserver image in `docker-compose.rootless.yml` becomes `poznote:latest-and-beta-rootless`, and the MCP image is the same `poznote-mcp:latest-and-beta`.

Download the images and restart the containers:
```bash
docker compose pull
docker compose up -d
```

*   **Before switching:** a beta can still contain bugs, so make a [backup](#backup--export) first. Problems can be reported in the [GitHub issues](https://github.com/timothepoznanski/poznote/issues) or on [Discord](https://discord.gg/AWhWWSEkJ).
*   **Updates:** each `docker compose pull` then gets the newest beta, or the stable version once it is released. The update procedure above downloads a new `docker-compose.yml` that uses the stable tags again, so change the two `image` lines once more after that step.
*   **Back to stable:** a beta can change the database, so going back to an older stable version may not work. Wait for the next stable version, which includes the changes of the beta, then follow the update procedure above.

## Authentication

Poznote supports multiple authentication methods including local accounts and external identity providers. Apps and extensions that talk to the REST API use [app passwords](#app-passwords), a separate credential described in the next section.

<details>
<summary><strong>Local Accounts Authentication</strong></summary>
<br>

Poznote authenticates users against their profile using a username or email address and a password.


#### Default account

On a fresh installation, Poznote creates one active administrator profile:

- Username: `admin_change_me`
- Password: `admin`

Change the default password and rename the account after the first login.

#### Password management

Passwords are managed through the Poznote web interface, not through `.env`:

- Users can change their own password from **Settings > Change Password**.
- Administrators can set a custom password for any user or reset it to the default from **Settings > Admin Tools > User Management**.
- The **Remember me** option keeps the session for 30 days.
- Changing a password invalidates existing remember-me cookies for that user.

#### Two-factor authentication

Each user can turn on two-factor authentication (TOTP) from **Settings > Two-factor authentication**. After the password, the login form then asks for a 6-digit code from an authenticator app (Aegis, Google Authenticator, 1Password, Bitwarden...).

- Setup shows a QR code, drawn in the browser, and ten single-use recovery codes to keep in case the phone is lost.
- It protects password sign-in. An SSO login is left to the identity provider and its own second factor.
- While it is on, the REST API no longer accepts the account password on its own: give clients an [app password](#app-passwords), or send the current code in the `X-Poznote-OTP` header.
- An administrator can turn it off for a user who lost both their device and their recovery codes, from **Settings > Admin Tools > User Management** (password dialog).
- Turning it on or off invalidates existing remember-me cookies for that user.

#### Default passwords

- Administrator accounts: `admin`
- Standard user accounts: `user`

When a user has not yet changed their password, the default value above is used. Once a password is changed through the interface, a secure bcrypt hash is stored in the database and takes priority.

</details>

<a id="oidc"></a>
<details>
<summary><strong>OIDC / SSO Authentication (Optional)</strong></summary>
<br>

Poznote supports OpenID Connect (authorization code + PKCE) for single sign-on integration. This allows users to log in using external identity providers such as Auth0, Keycloak, Azure AD, or Google Identity.

#### How it works

1. The login page displays a `Continue with [Provider Name]` button when OIDC is enabled.
2. Users authenticate with the OIDC authorization code flow secured by PKCE.
3. Access can be restricted with allowed groups and, if needed, a legacy allowed users list.
4. After authentication, Poznote links the identity in this order: `sub` (`oidc_subject`), then `preferred_username`, then `email`.
5. If auto-create users is enabled and no profile matches, Poznote creates one automatically. Such a profile has **no password at all**: it never went through the initial-credential handover an admin does when creating an account, so it does not answer to the default password. Sign-in goes through the provider, or an admin sets an explicit password from **Settings > Admin Tools > User Management**.
6. If `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, the username/password form is hidden and the login page becomes SSO-only.
7. REST API clients can authenticate with `Authorization: Bearer <OIDC JWT>` when OIDC is enabled; Poznote validates the provider JWKS, issuer, expiration, audience, and configured access controls.
8. Clients that cannot perform an OIDC flow at all (browser extension, mobile app, scripts) use an [app password](#app-passwords) instead, which each user creates from their own settings.
9. [Two-factor authentication](#two-factor-authentication) only covers the password form: an SSO login never asks for the Poznote code. Require a second factor in the identity provider instead. A user who has both a password and an SSO identity keeps both ways in, and the SSO one is only as strong as the provider's policy.

#### Configuration

OIDC is configured from the **admin UI**: go to **Settings > Admin Tools > OIDC / SSO**.

Most settings (enabled, issuer, provider name, scopes, access control, allowed groups/users, auto-create users, HTTP Basic Auth behavior, etc.) are managed from this page and stored in the database.

For REST API Bearer JWT authentication, configure **API JWT audience** if your provider issues access tokens for a dedicated API audience. When it is empty, Poznote accepts the configured OIDC Client ID as the JWT audience.

The following settings remain in the `.env` file:

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Use `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` if you want to hide the local username/password form and force SSO-only login. This is the only switch that blocks password authentication: it removes the form, rejects password POSTs server-side, and hides the "Change Password" setting.

> **Recovering from an identity provider outage.** SSO-only means exactly that: while `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, nobody can sign in with a password, admins included, so there is no in-browser escape hatch. This is deliberate, since an attacker who compromised an admin account cannot re-enable password login to give themselves a persistent way in. Recovery needs server access: set `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` in `.env`, restart the container, and sign in with a local password. Before enabling SSO-only, make sure at least one admin account has an explicit password set (**Settings > Admin Tools > User Management**), otherwise flipping the flag back will not help. Note that an admin profile auto-provisioned by OIDC has no password until one is set.

> **Breaking change:** previous OIDC settings in `.env` are no longer read, except `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET`, and `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. After upgrading, re-enter the other OIDC settings from the admin page.

#### Access Control Example (Groups + Auto-Provision)

From the OIDC admin page, configure:
- **Groups claim:** `groups`
- **Allowed groups:** `poznote`
- **Auto-create users:** enabled

If auto-provisioning is enabled, Poznote generates a username from the OIDC claims (`preferred_username`, `nickname`, email local part, `name`, then `sub`) and stores the OIDC subject on the created profile.

</details>

## App Passwords

Apps cannot sign in through an identity provider the way a browser can. An **app password** is a separate credential you create for one client (the browser extension, a phone, a script) and can revoke at any time, so you never have to hand out your account password.

Create one from **Settings > App passwords**: give it a name, optionally an expiry, and copy the generated secret. It is shown once and never again. Then, in the client, enter your usual username and the app password where it asks for a password. It travels as ordinary HTTP Basic Auth, so every existing client works as-is:

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

An app password only reaches the REST API, and only for its own profile: it cannot open the web interface, call an admin endpoint, change your password or manage your account, even when the account is an administrator. A leaked one therefore exposes the notes of one account and nothing more, and revoking it closes the hole. On an SSO-only instance, where accounts created by OIDC have no password at all, it is the only credential the API accepts over Basic Auth.

The full list of limits and the endpoints that manage app passwords are in the [REST API documentation](docs/API-REST.md#authentication).

## Note types

Poznote supports two primary note formats, each tailored for different workflows.

<details>
<summary><strong>Rich Text Notes</strong></summary>
&nbsp;

*   **Editor:** Direct WYSIWYG (What You See Is What You Get) editing.
*   **Storage:** Saved as `.html` files in the user data directory. Since they are standard HTML, they can be opened directly in any web browser.
*   **Exclusive Features:**
    *   **Rich Formatting:** Native support for text colors, highlighting, and standard HTML elements.
    *   **Interactive UI:** Direct manipulation of elements in the editor.
</details>

<details>
<summary><strong>Markdown Notes</strong></summary>
&nbsp;

*   **Editor:** Markdown syntax editor with real-time preview.
*   **Storage:** Saved as `.md` files in the user data directory.
*   **Exclusive Features:**
    *   **Mermaid Diagrams:** Native support for generating diagrams (flowcharts, sequence, etc.) via ` ```mermaid ` code blocks.
    *   **Math Equations:** Robust LaTeX support for mathematical formulas using `$ inline $` and `$$ block $$` syntax.
    *   **Portability:** Standard Markdown format compatible with any external editor or static site generator.
</details>

<details>
<summary><strong>Task Lists</strong></summary>
&nbsp;

*   **Usage:** Manage tasks and projects with interactive checklists.
*   **Workflow:** Track progress with checkboxes that can be toggled directly in the editor or the notes list. A progress bar shows the completion of each list.
*   **Task Options:** Each task can have a due date with an optional time, a reminder notification that fires at the due time, and an important flag, and can be moved to another list.
*   **Tasks Page:** A dedicated Tasks page, opened from the left icon rail, gathers in one place every task of your task lists and, optionally, the checkboxes sitting inside ordinary notes. It offers status filters (to do, important, overdue, with due date, completed), a text filter, and a calendar view of the tasks that carry a due date.
*   **Public Collaboration:** Task lists can be shared via a public URL. If edit permissions are granted, external collaborators can check items off the list without needing a Poznote account.
</details>

<details>
<summary><strong>Shortcuts</strong></summary>
&nbsp;

*   **Functionality:** Create a reference to an existing note in another location.
*   **Use Case:** Allows a note to be referenced in two different places simultaneously. For example, a note can live in a classification folder while its shortcut appears on a Kanban board for active tracking.
</details>

<details>
<summary><strong>Templates</strong></summary>
&nbsp;

*   **Functionality:** Reuse pre-written content to standardize your documentation, from a full note to a short snippet.
*   **Setup:** Put the notes you want to reuse in a folder named `Templates` (sub-folders are fine). A workspace named `Templates` works too and is offered from every workspace. The name is also recognized in the language of the interface (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`).
*   **Insert into a note:** Type `/template` (or `/` followed by the template's title) in a rich text or Markdown note and pick a template: its content is pasted at the cursor, converted if the template and the note are not of the same type.
*   **New note from a template:** Duplicate the template note, or duplicate a whole `Templates` folder to start a project with a ready-made folder structure.
</details>

<details>
<summary><strong>Daily Notes (Diary)</strong></summary>
&nbsp;

*   **Usage:** Write one note per day, journal-style, from a dedicated Diary board.
*   **Workflow:** The "Create today's entry" button creates today's note (it reads "Go to today's entry" once the note exists), titled with the current date and stored automatically in a `Diary/YYYY/MM` folder structure.
*   **Board View:** Entries are displayed as cards grouped by month, newest first, with a filter to quickly find past entries.
*   **Journal View:** The scroll button next to the view controls switches to one reading column: every entry with its full content, newest first, loaded as you scroll. The filter works there too. Click an entry, or its pencil, to edit it right there; changes are saved as you type.
*   **Format:** New entries are created as rich text or Markdown notes, depending on the "Diary entry format" setting under **Settings > Behavior**.
</details>

## Snapshots

Snapshots keep earlier versions of a note's content so you can go back to a previous state from the note's **Snapshots** menu.

<details>
<summary><strong>How snapshots work</strong></summary>
<br>

*   **Automatic:** a snapshot is taken the first time a note is opened each day. The 3 most recent automatic snapshots are kept per note; this number can be changed under **Settings > Actions > Snapshots**.
*   **Manual:** "Take snapshot now" adds a snapshot at any time, and so does **Ctrl + Alt + S** (Cmd + Alt + S on Mac) while a note is open. Manual snapshots are unlimited and do not count toward that number.
*   **Before an AI edit:** a snapshot is taken automatically right before the [AI assistant](#ai-assistant) or the [MCP server](#mcp-server) changes the content of a note, so a rewrite that goes wrong is one click away from being undone. These snapshots are labeled "Before AI edit" or "Before MCP edit" in the history, are skipped when the latest snapshot already holds the same content, and the 20 most recent ones are kept per note, a number you can change in **Settings → Snapshots** (1 to 200) if your instance edits a lot of notes through AI or MCP.
*   **Expiry:** every snapshot, automatic or manual, is deleted 30 days after it was taken. A snapshot can also be deleted by hand from the Snapshots modal.
*   **Attachments and images:** snapshots only store the note text. Attachments are never copied, so a file referenced by several snapshots exists once on disk. A file removed from a note stays on disk, hidden from the note, as long as a snapshot still contains it, so restoring that snapshot brings it back. It is deleted for good once the last snapshot containing it expires or is deleted, or when the note is permanently deleted. Keeping more snapshots therefore never duplicates files. It only keeps removed files around for longer, 30 days at most.

</details>

## Personalization

Poznote offers several built-in personalization options directly from the application, without requiring any configuration file changes.

<details>
<summary><strong>Display, Behavior and Markdown Settings</strong></summary>
<br>

Under **Settings > Display**, you can configure:

- **App font:** pick the typeface used across the interface
- **Font size:** adjust text size for notes, sidebar, code blocks, and the settings page
- **Note colors:** choose the palette offered when colouring a note
- **Icons by note type:** give task lists and Markdown notes their own icon in the notes list
- **Index icon scaling:** resize icons in the note index
- **Icon sidebar order:** reorder the buttons of the left icon rail and change their colors (a right-click on a button of the rail also opens the color picker)
- **Note content width:** control the max width of the note editor area
- **Attachment previews:** show attachments as previews inside the note
- **Default image border:** frame inserted images without adding padding
- **Highlight current folder tree:** dim the notes and folders outside the folder hierarchy you are working in
- **Login page title:** change the title shown on the login page
- **Element visibility:** hide the interface elements you do not use, see below

Under **Settings > Behavior**, you can configure:

- **Note sorting:** choose how notes are ordered in the list
- **Note age filter:** only list the notes updated within the chosen number of days
- **Snapshots:** how many automatic snapshots are kept per note
- **Task list insert order:** control where new tasks are inserted
- **Show notes after folders:** list notes without folders below the folder list
- **Code block word wrap:** enable or disable word wrap in code blocks
- **Diary entry format:** create diary entries as rich text or Markdown notes
- Interface language, timezone and date format, attachments and backlinks at the bottom of a note, spell check, and the keyboard shortcuts

Under **Settings > Markdown**, you can configure the default view mode, the editor font, framed and coloured Markdown, and code block line numbers.

The theme is not a card here: the button at the bottom of the left icon rail walks through the themes, and an administrator chooses which ones it offers in **Settings > Admin Tools > Theme list**.

</details>

<details>
<summary><strong>Workspace Background Image</strong></summary>
<br>

You can set a background image per workspace: open the **Workspaces** page and use the **Background** action of the workspace to upload an image and adjust its opacity, so each workspace gets its own visual identity.

</details>

<details>
<summary><strong>Element Visibility</strong></summary>
<br>

Poznote allows you to declutter the interface by hiding elements you don't use.

Configure it in **Settings > Display > Element visibility**.

- **Granular Control:** Toggle visibility for home cards, toolbar actions, slash menu items, and more. The creation date badge on notes (**Show creation date**) and the note count next to each folder (**Show folder note counts**) are turned on and off here too.
- **Per-User:** Each user can have their own unique interface layout.
- **Administrators:** The same modal shows a second "Users" column next to the administrator's own "Me" column, to hide elements for every user of the instance (administrators excepted).
- **Searchable:** Easily find the element you want to hide using the filter in the configuration modal.

</details>

<details>
<summary><strong>Custom CSS Overrides</strong></summary>
<br>

If you want to adjust fonts, spacing, or other visual details beyond the built-in options, you can upload extra stylesheets that are applied to every HTML page for all users.

Configure them in **Settings > Admin Tools > Custom CSS path**.

Notes:

- Click **Upload CSS file** to select a `.css` file from your computer.
- Every uploaded file is kept, so you can store several themes and switch between them without uploading again.
- The modal lists what is stored: pick the one to apply to every user, or **No custom CSS** to go back to the built-in appearance, then click **Save**.
- Uploading a file that has the name of a stored one replaces that theme.
- The files are stored in `data/css/` (your Docker volume), so they survive image updates.
- Click the bin icon next to a theme to delete that file from your volume.
- Poznote appends a cache-busting `v=` parameter automatically.
- The stylesheet is injected near the end of `<head>`, so it can override the default application styles.
- Only administrators can upload, apply or delete a custom CSS file.

### The theme list

**Settings > Admin Tools > Theme list** says what the theme button at the bottom of the icon rail walks through: one theme per click, in the order shown.

- Tick the built-in themes you want to keep, and leave out the ones nobody uses.
- Tick a stored CSS file to offer it as a theme of its own. It gets a palette icon and the name of the file.
- Use the arrows to set the order the button walks through.
- A custom theme paints over a light or a dark base, which the file cannot say on its own: choose it next to the file. That is what `data-theme` is set to, so a stylesheet written for the dark mode needs **Dark** here.
- The list is a global setting, so everyone walks through the same themes; which one is applied stays each user's own choice.
- Whoever is on a theme you take out of the list gets the first theme of the list right away.
- Picking a custom theme loads that file for that user only, in place of the stylesheet applied instance-wide.
- Deleting a CSS file removes it from the list too.
- With a single theme in the list there is nothing to walk to, so the button opens this list for an administrator, and does nothing for everyone else.

**Before writing any CSS**, check whether a built-in theme already does what you want: the theme button at the bottom of the icon rail walks through Light, Dark, Black, Lavender, Sepia and Terminal.

### Examples

Colours, spacing, radii and font weights are design tokens, so most changes are a short list of variable overrides rather than a fight with selectors. The full list is in `src/public/css/tokens.css`.

**Change the accent colour**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --pz-accent-text: #f783ac;       /* lighter, because it sits on a dark ground */
}
```

Two tokens rather than one because a *fill* and a *label* cannot be the same colour: `--pz-accent` fills buttons, `--pz-accent-text` is the accent as text, icons and outlines. In a light theme it follows `--pz-accent` by itself; a dark ground needs a lighter value. Every token keeps the same `--pz-*` name in every theme, only its value changes. The `--dm-*` names of older stylesheets keep working.

**Recolour the note toolbar icons**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Icons are CSS masks painted with `background-color: currentColor`, so `color` is all you need. `!important` is needed here because a few of those icons already carry a colour of their own (the star when a note is a favourite, the share icon when it is published, the paperclip when it has attachments).

No CSS needed to colour a single icon: right-click it in the note toolbar or in the icon rail and pick a colour. Those colours are saved per user and leave the state colours above alone.

**Warm up the whole interface**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Write a full theme**

Override the tokens on `:root` for light and on `:root[data-theme='dark']` for dark, and nothing else. `src/public/css/README.md` documents every token and shows a complete example; the built-in Lavender, Sepia and Terminal themes in `src/public/css/tokens.css` are the same thing, written the same way.

</details>

## Multi-users

> Not to be confused with the [Multiple Instances](#multiple-instances) feature.

Poznote is multi-user: each profile has its own notes, workspaces, tags, folders, attachments and settings, and signs in with its own username or email address and password.

- **User management**: administrators create, disable and manage profiles from **Settings > Admin Tools > User Management**, and can give a user access to another user's account without transferring its ownership.
- **Sharing**: notes and folders can be shared with other users of the instance, read-only or editable, or publicly through dedicated links. An entire workspace can be shared with other users of the instance, who find it in their workspace menu and edit it alongside its owner. When several users can access the same note, only one edits it at a time and the others see who holds the lock.
- **Editing the same note**: one person edits at a time. When a note is locked, the read-only banner offers to **take over**: the previous editor's screen turns read-only and their unsaved changes stay in their browser, offered again once the note is free. An open note picks up changes made elsewhere within a few seconds. For a **Markdown** note with unsaved edits on both sides, the two sets of changes are merged automatically when they touch different lines, and a banner lets you choose when they overlap. Rich-text notes are never merged, you choose which version to keep. Keep scripts and other code in fenced code blocks (```` ``` ````): raw HTML outside a code block is sanitized on save, which can make an otherwise clean merge look like a conflict.
- **Tenant isolation (SaaS mode)**: administrators can stop non-admin users from discovering the other accounts of the instance, sharing with them, or registering personal webhooks. Leave everything unchecked for a family or team instance.

<details>
<summary><strong>Data layout on disk</strong></summary>
<br>

Poznote uses a master database (`data/master.db`) for shared coordination data, and separate per-user databases and files for actual note content.

```
data/
├── master.db                    # Profiles, global settings, shared links, account access, edit locks
├── css/                         # Custom CSS files uploaded by an administrator
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   ├── snapshots/           # Earlier versions of the user's notes
    │   ├── backgrounds/         # Workspace background images
    │   └── backups/             # Backup archives prepared for download
    ├── 2/                       # User ID 2
    └── ...
```

</details>

## Activity Log

Poznote keeps a history of the sensitive operations performed on the instance, so administrators can see what happened, when, and by whom: logins and logouts, account and quota changes, workspace creation and sharing, backups and restores, trash emptying and permanent deletions, app passwords. It is available from **Settings > Admin Tools > Activity log**, restricted to administrators, and the help icon at the top of the page lists every recorded operation.

The log records that an operation happened, not the data it touched: note content and passwords are never written to it, and routine activity such as writing a note or moving it to the trash is left out. Entries are kept for 90 days by default (30, 90, 365 days or unlimited), and the log can be cleared from the same page.

## Webhooks

Poznote can notify external services when something happens on the instance, by sending outgoing webhooks (HTTP POST requests with a JSON payload) to the endpoints you register, so it plugs into automation tools such as n8n, Zapier, or your own scripts. Administrators register instance events (accounts, quotas, signups) under **Settings > Admin Tools > Admin Webhooks**, and every user can register endpoints for their own notes and reminders under **Settings > User Webhooks**.

Deliveries are signed with HMAC-SHA256 when the webhook has a secret, and note content is never sent. Every event, the payload fields, signature verification and delivery guarantees are covered in the **[Webhooks documentation](docs/WEBHOOKS.md)**.

## Git Synchronization

Poznote supports automatic and manual synchronization with **GitHub**, **GitLab** (gitlab.com or a self-hosted instance) or **Forgejo**. Each user configures their own repository independently. There is no shared global repository.

Git Sync talks to the provider's REST API over HTTPS, so authentication is always token-based. SSH keys are not used.

<details>
<summary><strong>How to configure Git Sync</strong></summary>
<br>

**Step 1 — Enable the feature (admin, in Settings > Admin Tools)**

Toggle **Git Sync** to enabled in the **Admin Tools** section of the Settings page. This enables Git Sync globally and makes the user-level **Git Sync** card/configuration available from **Settings**.

---

**Step 2 — Each user configures their own repo (Settings > Git Sync)**

| Field | Description |
|---|---|
| Provider | `GitHub`, `GitLab` or `Forgejo` |
| API Base URL | GitHub: auto-filled (read-only). GitLab: `https://gitlab.com/api/v4`, or your instance URL, e.g. `https://gitlab.example.com/api/v4`. Forgejo: your instance URL, e.g. `https://forgejo.example.com/api/v1` |
| Access Token | GitHub PAT (`ghp_...`), GitLab token with the `api` scope (`glpat-...`, personal or project access token) or Forgejo token (Settings > Applications) |
| Repository | `owner/repo` format. GitLab: the full project path, including subgroups, e.g. `group/subgroup/project` |
| Branch | Default: `main` |
| Author Name / Email | Used for commit metadata |

> 🔒 Access tokens are encrypted at rest using AES-256-GCM. An encryption key is automatically generated and stored in `data/.app_secret`.

---

**Automatic sync**

When enabled by the user, Poznote will automatically:
- **Pull** on login
- **Push** on every note create, update, or delete

Manual push/pull is also available from the **Push** and **Pull** buttons of the left icon rail.

---

**Synced workspaces**

By default every workspace is synced. In **Settings > Git Sync**, each user can instead restrict Git Sync to selected workspaces:

- Only notes and attachments from the selected workspaces are pushed and pulled.
- A pull never touches notes in the other workspaces.
- A push removes repository files that fall outside the selected workspaces, so the repository always mirrors exactly the synced set.
- The Push and Pull sidebar buttons, automatic push, and the pull prompt only appear while viewing a synced workspace.

</details>

## S3 Attachment Storage

By default, note attachments are stored on the local disk. Administrators can instead store them in an S3-compatible object storage (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2, ...). The setting applies to all users of the instance.

<details>
<summary><strong>How to configure S3 storage</strong></summary>
<br>

Configure it in **Settings > S3 Attachments** (administrators only).

- **Configuration**: Endpoint URL, region, bucket, access key, secret key, and path-style addressing, with a built-in connection test.
- **Migration**: Move existing attachment files between the local disk and the bucket, in both directions and for every user. Migration runs in batches and can be safely interrupted and resumed.
- **Privacy**: Attachments are stored under `attachments/{user id}/` in the bucket and are always served through Poznote, so the bucket can stay private.
- **Quotas**: A per-user S3 storage quota can be set, and S3 usage appears in the admin storage statistics.
- **Backups**: Zip exports include S3 attachments by default (fetched from the bucket on the fly), whether they are made from the Backup window, through the REST API or by the automatic S3 backups. An option in the Backup window lets you leave them out for a lighter archive. If the bucket cannot be read while an archive is being built, the export fails with an error instead of producing an archive with missing files.

Restoring a backup that is missing some of the attachment files it references is refused while S3 storage is enabled, because a full restore replaces the bucket content and the missing files would be lost. Two ways to restore such a backup:

- **Easiest**: turn off the "Store attachments in S3" switch (keep the credentials), restore the backup, then turn the switch back on. A restore in local mode never touches the bucket, and the attachments still stored there keep being served. This is also the right path on a fresh server when the bucket is intact, since the attachments export of the other option needs an instance that still knows the notes.
- **Rebuild a complete archive**:
  1. Download the **Attachments Export** from the Backup window: it contains every attachment of your account in a `files/` folder.
  2. Unzip the backup, copy the files from `files/` into the backup's `attachments/` folder, and zip it again. Careful when re-zipping: select the backup's contents (`database/`, `entries/`, `attachments/`, ...) and compress that selection, not the folder containing them. The folders must sit at the root of the zip, otherwise the restore reports that `database/poznote_backup.sql` is missing.
  3. Restore the rebuilt zip normally.

> Git Sync ignores attachments while S3 storage is enabled.

</details>

## S3 Backups

Administrators can send complete backup archives (one ZIP per user, identical to the Complete Backup download) to an S3-compatible bucket, manually or automatically on a schedule. The configuration is independent from the S3 Attachment Storage one, so backups can target a different bucket or provider.

<details>
<summary><strong>How to configure S3 backups</strong></summary>
<br>

Configure it in **Settings > S3 Backups** (administrators only).

- **Master switch**: A toggle at the top of the page enables or disables the whole feature. When disabled, automatic backups stop and the S3 backup and restore sections disappear for every user (the self-service actions are refused server-side too).
- **Configuration**: Endpoint URL, region, bucket, access key, secret key, and path-style addressing, with a built-in connection test.
- **User selection**: Checkboxes choose which users are covered by the backups. Everyone is checked by default, and while everyone is checked, new accounts are included automatically.
- **Manual backups**: A "Back up now" button uploads a fresh archive for each selected user, one user at a time, with per-user progress. It works as soon as the connection is configured, even when automatic backups are off.
- **Automatic backups**: When enabled, a background worker backs up the selected users on the chosen frequency (daily, weekly, or monthly). The first run happens within a few minutes of enabling, the next ones after the chosen interval.
- **Retention**: Only the most recent N archives are kept per user, older ones are deleted from the bucket after each backup (0 keeps everything).
- **Browsing**: The page lists the archives currently in the bucket, with download and delete actions.
- **Restore**: Archives are stored under `backups/{user id}/` in the bucket and can be restored with the standard [Restore / Import](#restore--import) page.
- **Self-service**: Once the bucket is configured, every user gets an "S3 Backups" section on their Backup / Export page to upload a fresh archive of their own account, and to download or delete their existing archives. A "Restore from S3" section on the Restore / Import page restores their account directly from one of those archives.
- **Tenant isolation**: Two options ("S3 backups on the Backup page" and "S3 restore on the Restore page") disable these self-service sections for non-admin users. They are enforced server-side, so the blocked actions are refused even when called directly.

When attachments are stored in S3 (S3 Attachment Storage), they are included in the archives by default, fetched from the bucket on the fly. An option lets you leave them out of the backups for lighter archives and faster runs.

</details>

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

The archive is built in the background by a worker process, not during the request that starts it, so a large account cannot hit a browser or reverse proxy timeout. The page follows the progress of the job, and the download starts on its own once the file is ready. You can leave the page and come back, the preparation continues. A prepared archive stays available for 24 hours, and a button lets you delete it right away.

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

  - **Rich text notes:** Export to HTML, or to a single HTML file with the images embedded
  - **Markdown notes:** Export to Markdown, to HTML, or to a single HTML file with the images embedded
  - **Task lists:** the same options, plus a raw JSON export of the list

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Automated Backups with Bash Script</strong></summary>
<br>

For automated scheduled backups via API, you can use the included `backup-poznote.sh` script.

**IMPORTANT:** Only administrators can create backups via the API.
Use the current password of the admin profile you authenticate with. On a fresh installation, that is the default admin password (`admin`) until it is changed in Poznote. Once a custom password is set, that custom password is required for API calls.

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
- `'admin_password'` - Current admin password for the API profile (default `admin` until changed, then the custom password)
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


## Restore / Import

Poznote provides flexible restoration options through the web interface (**Settings > Restore/Import**) or programmatically via the REST API for administrators. Users can restore their own profile data from a full ZIP backup or import individual files, while administrators can manage restorations across the entire system.

<a id="complete-restore"></a>
<details>
<summary><strong>Complete Restore from Poznote zip backup</strong></summary>
<br>

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

There is no practical size limit. The archive is uploaded in slices (a slice that fails is retried instead of losing the whole upload), reassembled on the server, then extracted and restored by a background worker, so neither the browser nor a reverse proxy in front of the instance can time the restore out. A progress bar covers the whole pipeline: upload, extraction, database, notes, then attachments. When the restore finishes, Poznote asks which workspace you want to open.

Restoring from an S3 bucket (see [S3 Backups](#s3-backups)) runs as the same background job, so fetching a large archive from the bucket and restoring it does not depend on a request staying alive either.

If the upload is not possible at all, the Restore / Import page also offers a direct copy fallback: copy the archive into the Poznote container at exactly `/tmp/backup_restore.zip` over SSH, reload the page, and restore from there.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Import Individual files</strong></summary>
<br>

Import one or more HTML, Markdown or text notes directly:

  - Supports `.html`, `.md`, `.markdown`, `.txt` and `.json` file types
  - Up to 50 files can be selected at once, configurable in Settings > Admin Tools > Import Limits

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Import ZIP file</strong></summary>
<br>

Import a ZIP archive containing multiple notes:

  - Supports `.html`, `.md`, `.markdown` or `.txt` file types
  - ZIP archives can contain up to 300 files, configurable in Settings > Admin Tools > Import Limits
  - When importing a ZIP archive, Poznote automatically detects and recreates the folder structure

There is no practical size limit on the archive. Like a complete restore, it is uploaded in slices (a slice that fails is retried instead of losing the whole upload), reassembled on the server, then processed by a background worker, so neither the browser nor a reverse proxy in front of the instance can time the import out. A progress bar covers the whole pipeline: upload, images and attachments, then notes.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Migrate an Obsidian vault</strong></summary>
<br>

An Obsidian vault is a folder of Markdown files, so it can be imported as it is, in a single ZIP archive.

**Steps**

1. Compress your vault folder into a ZIP file. There is nothing to clean up first: hidden folders such as `.obsidian` or `.trash` are ignored.
2. In Poznote, open **Settings > Restore/Import** and go to the section that imports files and ZIP archives. Pick the destination workspace (a new, empty workspace makes the result easy to check), select the ZIP and start the import. Dropping the ZIP onto the notes list of the main page does the same thing.
3. Read the summary shown at the end: it gives the number of notes, folders, images and PDF files imported, and names the files that could not be.

A ZIP can hold up to 300 notes (images and PDF files do not count), a limit an administrator can raise in Settings > Admin Tools > Import Limits. The size of the archive is not limited, see [Import ZIP file](#import-zip-notes).

**What is carried over**

  - Notes: every `.md` file becomes a Markdown note named after the file, or after the `title` key of its front matter.
  - Folders: the folder tree of the vault is recreated, subfolders included. When the whole vault sits in a single top-level folder of the ZIP, that folder is skipped.
  - Tags: the `tags` key of the front matter, and a line of `#tags` at the very top of a note. Spaces in a tag become underscores.
  - Front matter: `title`, `folder`, `tags`, `favorite`, `created` and `updated` are read, see [Markdown Front Matter Support](#markdown-front-matter).
  - Links between notes: `[[Note title]]` works as it is. Poznote resolves it by title, shows it as an internal link and counts it in the backlinks and in the graph.
  - Images: `![[image.png]]`, `![[image.png|caption]]` and `![caption](image.png)` become attachments of the note and are displayed in place, wherever the image is stored in the vault (next to the notes, in a subfolder or in an `attachments` folder).
  - PDF files: a PDF linked from a note (`![[file.pdf]]`, `[[file.pdf]]` or a Markdown link) is attached to that note, and the link points to the attachment. Any other PDF, next to the notes or in an `attachments` folder, becomes a note named after the file, with the PDF as its attachment, in the folder matching its place in the vault.

**What is not**

  - Links with an alias or a heading (`[[Note|alias]]`, `[[Note#Heading]]`) stay in the text but do not resolve to a note.
  - Note embeds (`![[Other note]]`) and plugin content: Dataview queries, `.canvas` files, drawings made with the Obsidian Excalidraw plugin.
  - Tags written in the middle of a note stay as plain text.
  - Files of other types lying next to the notes (audio, video, Office documents) are ignored. Attach them to the relevant note afterwards.

Images and PDF files are matched by file name, not by path. If two files of the vault share the same name, rename one of them before the import.

</details>

<a id="markdown-front-matter"></a>
<details>
<summary><strong>Markdown Front Matter Support</strong></summary>
<br>

Markdown files can include YAML front matter to specify note metadata. The following keys are supported:

  - `title` — Override the note title (default: filename without extension)
  - `folder` — Override the target folder. A plain name must match a folder that already exists in the workspace; a path such as `Projects/2026` creates the folders it needs.
  - `tags` — Array of tags to apply to the note. Supports both inline `[tag1, tag2]` and multi-line syntax
  - `favorite` — Mark note as favorite (`true` or `false`)
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


## Offline

Poznote keeps working without a network in two ways: the notes you modified recently, your favorites and the notes or folders you choose to keep stay available in your browser, ready to be read and edited, and a complete backup can be browsed anywhere as a read-only export.

<details>
<summary><strong>Offline notes</strong></summary>
<br>

The notes you modified in the last 5 days are kept in each browser where you use Poznote, and this copy is refreshed after every save. In a classroom, on a train or anywhere without Wi-Fi, open the usual Poznote address: the browser shows the offline version of Poznote, with the same sidebar, editors, toolbar, search and tabs (a double-click or a middle-click opens a note in a new tab, and the tabs open online come back), listing only the notes kept offline.

*   **Signing in:** type the password you last signed in with in this browser, it is checked without the server. If you never typed your password in this browser (SSO, automatic sign-in), the last account used there opens with a **Continue as** button.
*   **Reading and editing:** Rich text notes, Markdown notes and task lists open in their usual editor, and new notes can be created. The / menu and the right-click menu work too, without the commands that need the server (pictures and files to upload, templates, drawings, links to other notes). Other note types, such as drawings, stay online only. Changes are kept in the browser until they are sent.
*   **Keep offline:** favorites are always kept, and **Keep offline** in the menu of a note or of a folder (subfolders included) keeps it whatever its date, with all its attachments (PDF, audio, files) up to 25 MB each. The same menu of a note says whether it is available offline in this browser, and the Notes and Folders pages mark the notes and folders available offline in this browser. The Notes page can also keep several notes offline at once (or stop), from its bulk actions, and the Folders page has **Keep offline** in the menu of each folder.
*   **Offline page:** the **Offline** button of the icon sidebar lists the notes and folders kept offline, like the Shares page: folders as a tree with their notes, why each note is kept (kept offline, in a folder kept offline, favorite, modified recently), a filter, and a button to keep a note offline or stop. A warning icon marks a note this browser does not hold yet.
*   **Back online:** the changes are sent automatically. If a note was also changed on the server in the meantime, both versions are merged when possible, otherwise your offline version is kept as a separate note named "... (offline copy)". A note deleted on the server in the meantime is created again.
*   **Settings:** **Settings > Actions > Offline notes** sets how many days of notes are kept (5 by default, up to 30, 0 turns offline notes off) and shows what the current browser holds.
*   **Limits:** at most 300 notes and 50 MB of text, the most recently modified first. Files are kept too: the pictures shown in these notes, and every attachment (PDF, audio, files) of the favorites and the notes kept with **Keep offline**, up to 25 MB each, 400 files and 200 MB in total, and never more than half the free space of the browser. A larger file stays online only, and the note says so when it is opened offline.
*   **Requirements:** Poznote must be served over HTTPS (browsers keep pages offline only on a secure connection, `http://localhost` also works) and opened once online in the browser, after signing in, for the copy to be made.
*   **Privacy:** only the notes of your own account are kept, not those of an account or a workspace shared with you. They are stored unencrypted in the browser. Signing out removes them from the browser (changes not sent yet too, after a warning that lists them): on a shared computer, sign out when you leave. Signing out also works without a network, from the offline page: the notes are removed at once, and the session on the server ends the next time Poznote opens online.

</details>

<details>
<summary><strong>Offline export</strong></summary>
<br>

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser. This allows you to read your notes offline, but without the full Poznote functionality, it's a read-only export.

</details>

## Multiple Instances

> Not to be confused with the [Multi-users](#multi-users) feature.

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

## AI Assistant

Poznote includes an integrated AI chat that connects to a local [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) instance, a cloud provider like [Anthropic (Claude)](https://www.anthropic.com) or OpenAI, or any OpenAI-compatible server. It searches and reads your notes to answer questions and, when you ask for it, creates, rewrites and organizes them, within the workspace you opened the chat in.

An administrator enables it from **Settings → Admin Tools → AI Assistant**, and every profile then gets an **AI assistant** button in the left icon rail. The AI server is called from the Poznote server, never from your browser, so with a local Ollama instance your notes never leave your machine.

What the assistant can do, choosing a provider and a model, personal API keys, and connecting a local server from the Poznote container are covered in the [AI Assistant documentation](docs/AI-ASSISTANT.md). To let an external AI assistant (VS Code Copilot, Claude CLI...) manage your notes instead, see the [MCP Server](#mcp-server) below.

## Transcription (speech to text)

Turn voice into note text with a speech-to-text server you run yourself. Poznote embeds no speech model: it talks to any server exposing the OpenAI audio API (`POST /v1/audio/transcriptions`), such as a self-hosted Whisper, so the audio never has to leave your machine.

Once an administrator enables it in **Settings → Admin Tools → Transcription**, **Record audio** under **Insert** in the slash menu gains a **Transcribe** button next to **Insert the audio**, and audio attachments get a **Transcribe** button.

Setting up a server, choosing a model, and everything else is in the [Transcription documentation](docs/TRANSCRIPTION.md).

## MCP Server

Poznote includes a Model Context Protocol (MCP) server that enables AI assistants like GitHub Copilot or Claude CLI to interact with your notes using natural language. For example:

- "Create a new note titled 'Meeting Notes' with the content..."
- "Search for notes about 'Docker'"
- "List all notes in my Poznote workspace"
- "Update note 42 with new information"

The MCP server ships with the official `docker-compose.yml` and is published on `127.0.0.1` only, so nothing outside your machine can reach it by default. Setup, client configuration, port and debug overrides, and how to protect it with `POZNOTE_MCP_AUTH_TOKEN` when you expose it further are covered in the [MCP Server documentation](docs/MCP-SERVER.md).

## Chrome Extension

The **Poznote URL Saver** is a browser extension that saves the URL, or even a full-page screenshot, of the current page to your Poznote instance with a single click. Install it from the Chrome Web Store: [Install extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

The extension connects to your instance with your username and an [app password](#app-passwords). The setup steps are in the [Chrome Extension documentation](docs/CHROME-EXTENSION.md).

## Share to Poznote on Android

On Android, Poznote appears in the system **Share** menu once the PWA is installed. Share a page from Chrome (or a link/text from any app), pick Poznote, and a new note is created with the page title and a clickable link — no extension needed.

To use it:

1. Open your Poznote instance in Chrome on Android and install it as an app (menu → **Add to Home screen** → **Install**).
2. In any app, tap **Share**, then choose **Poznote**.

> If Poznote does not appear in the share menu right away, make sure the app is installed (not just a bookmark). If you installed the PWA before this feature was released, Chrome picks up the new capability automatically after a few days, or immediately if you reinstall the app.

## API Documentation

Poznote provides a comprehensive RESTful API v1 for programmatic access to notes, folders, workspaces, tags, attachments, backups, settings, and more.

For the complete API reference with all endpoints, parameters, and curl examples, see the **[REST API Documentation](docs/API-REST.md)**.

### Quick Start

```bash
# List all notes for user ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Same, with an app password created in Settings > App passwords
# (works on SSO-only instances; X-User-ID is implied)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Create a note
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote at `Settings > About > API REST` to browse all endpoints, view request/response schemas, and test API calls interactively.

## Tech Stack

Poznote prioritizes simplicity and portability - no complex frameworks, no heavy dependencies. Just straightforward, reliable web technologies that ensure your notes remain accessible and under your control.

**Privacy-First Architecture:** Poznote operates entirely locally with no external connections required for functionality. All libraries (Excalidraw, Mermaid, KaTeX) are bundled and served from your own instance. Out of the box the only outbound connection is a daily update check; the optional features you turn on yourself (Git Sync, S3, an AI provider, webhooks, SMTP, OIDC) are the only other ones.

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
- **CodeMirror 6** - Extensible code and text editor for the Markdown editing experience
- **Excalidraw** - Virtual whiteboard for sketching diagrams and drawings
- **Mermaid** - Client-side JavaScript library for diagram and flowchart generation from text
- **KaTeX** - Client-side JavaScript library for fast math typesetting and rendering mathematical equations
- **Sortable.js** - JavaScript library for drag-and-drop sorting
- **highlight.js** - Syntax highlighting for code blocks
- **Swagger UI** - Interactive API documentation and testing interface

### Storage
- **HTML/Markdown files** - Notes are stored as plain HTML or Markdown files in the filesystem
- **SQLite database** - Metadata, tags, relationships, and user data
- **File attachments** - Stored on the local filesystem, or optionally in an S3-compatible object storage

### Infrastructure
- **Nginx + PHP-FPM** - High-performance web server with FastCGI Process Manager
- **Alpine Linux** - Secure, lightweight base image
- **Docker** - Containerization for easy deployment and portability
- **Python 3.12 (Alpine)** - MCP server runtime with the httpx, uvicorn and fastmcp libraries for AI assistant integration
</details>
