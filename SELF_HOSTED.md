# Poznote - Self-Hosted Installation Guide

This guide will help you deploy Poznote on your own machine or server using Docker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Windows](#windows)
  - [Linux](#linux)
- [Access Your Instance](#access-your-instance)
- [Change Settings](#change-settings)
- [Forgot Your Password](#forgot-your-password)
- [Update to Latest Version](#update-to-latest-version)

## Prerequisites

### Windows
Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

### Linux
1. Install [Docker Engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

## Installation

Choose your operating system:

### Windows

Open PowerShell and run the following commands:

#### Step 1: Create Directory

```powershell
mkdir poznote && cd poznote
```

#### Step 2: Create Environment File

```powershell
@"
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
"@ | Out-File -FilePath .env -Encoding UTF8
```

#### Step 3: Create Docker Compose File

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

#### Step 4: Start Poznote

```powershell
docker compose pull && docker compose up -d
```

---

### Linux

Open a Terminal and run the following commands:

#### Step 1: Create Directory

```bash
mkdir poznote && cd poznote
```

#### Step 2: Create Environment File

```bash
cat <<EOF > .env
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
EOF
```

#### Step 3: Create Docker Compose File

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

#### Step 4: Start Poznote

```bash
docker compose pull && docker compose up -d
```

## Access Your Instance

After installation, access Poznote in your web browser:

**URL:** [http://localhost:8040](http://localhost:8040)

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`
- Port: `8040`

> ⚠️ **Important:** Change these default credentials after your first login!

## Change Settings

To modify your username, password, or port:

### Step 1: Navigate to Your Poznote Directory

```bash
cd poznote
```

### Step 2: Stop the Container

```bash
docker compose down
```

### Step 3: Edit Your `.env` File

Edit the `.env` file with your preferred text editor and modify the values:

```
POZNOTE_USERNAME=your_new_username
POZNOTE_PASSWORD=your_new_password
HTTP_WEB_PORT=8040
```

### Step 4: Restart the Container

```bash
docker compose up -d
```

## Forgot Your Password

Your credentials are stored in the `.env` file in your Poznote directory.

To retrieve your password:

1. Navigate to your Poznote directory
2. Open the `.env` file
3. Look for the `POZNOTE_PASSWORD` value

## Update to Latest Version

To update Poznote to the latest version:

### Step 1: Navigate to Your Poznote Directory

```bash
cd poznote
```

### Step 2: Stop the Container

```bash
docker compose down
```

### Step 3: Pull the Latest Image

```bash
docker compose pull
```

### Step 4: Restart the Container

```bash
docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.

---

## Custom Cloud Deployment

If you prefer using another cloud service that supports Docker, most platforms accept Docker commands with environment variables. Use the following command:

```bash
docker run -d \
  --name poznote-webserver \
  --restart always \
  -e SQLITE_DATABASE=/var/www/html/data/database/poznote.db \
  -e POZNOTE_USERNAME=admin \
  -e POZNOTE_PASSWORD=admin123! \
  -e HTTP_WEB_PORT=8040 \
  -p 8040:80 \
  -v ./data:/var/www/html/data \
  ghcr.io/timothepoznanski/poznote:latest
```

---

**Need help?** Check the [main README](README.md) for more information or open an issue on GitHub.
