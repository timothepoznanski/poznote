# Installation Guide

Choose your preferred installation method below.

## Table of Contents
- [Windows](#windows)
- [Linux](#linux)
- [macOS](#macos)

---

<a id="windows"></a>
## 🖥️ Windows

### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

### Step 2: Deploy Poznote

Open Powershell and run the following commands.

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

### Next Steps

After installation, proceed to [accessing your instance](#access).

---

<a id="linux"></a>
## 🐧 Linux

### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

### Step 2: Install Poznote

Open a Terminal and run the following commands.

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

### Next Steps

After installation, proceed to [accessing your instance](#access).

---

<a id="macos"></a>
## 🍎 macOS

### Help Needed from the Community! 

Unfortunately, I don't have access to a Mac to test and document the installation procedure for macOS.

**If you're a macOS user and successfully install Poznote, I would greatly appreciate your help!** Please consider:

- Testing the installation process on your Mac
- Documenting any macOS-specific steps or requirements
- Sharing your experience via [GitHub Issues](https://github.com/timothepoznanski/poznote/issues) or [Pull Request](https://github.com/timothepoznanski/poznote/pulls)

**Expected process** (untested):
- Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- Follow similar steps to Linux using Terminal

Your contribution would help make Poznote accessible to the entire macOS community! 🙏

---

<a id="access"></a>
## 🌐 Access Your Instance

After installation, access Poznote in your web browser:

**URL:** [http://localhost:8040](http://localhost:8040)

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`
- Port: `8040`

⚠️ **Security Note:** Change these default credentials immediately after first login! See [Configuration Guide](Configuration) for instructions.

---

## Troubleshooting

### Port Already in Use

If port 8040 is already in use, modify the `HTTP_WEB_PORT` in your `.env` file:

```
HTTP_WEB_PORT=8041
```

Then restart the container:
```bash
docker compose down
docker compose up -d
```

### Container Won't Start

Check the logs to diagnose issues:
```bash
docker compose logs
```

### Data Persistence

Your notes and data are stored in the `./data` directory. This ensures your data persists even if the container is removed or updated.

---

## Next Steps

- [Configure your settings](Configuration)
- [Set up automated backups](Backup-and-Restore#automated-backups)
- [Explore the API](API-Documentation)
