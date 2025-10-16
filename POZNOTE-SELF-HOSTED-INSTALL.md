# Poznote - Self-Hosted Install Guide

This guide will help you **Install** Poznote on your own machine or server using Docker.

## Table of Contents

- [Installation](#installation)
- [Access Poznote](#access-poznote)
- [Multiple Instances](#multiple-instances)

## Installation

Choose your preferred installation method below. Docker makes it simple to run Poznote on Windows or Linux.

<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Step 1: Prerequisite

Install and start [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Step 2: Deploy Poznote

Open Powershell and run the following commands:

```powershell
mkdir poznote && cd poznote
```

```powershell
@"
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
"@ | Out-File -FilePath .env -Encoding UTF8
```

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

```powershell
docker compose pull && docker compose up -d
```

</details>

<details>
<summary><strong>🐧 Linux</strong></summary>

#### Step 1: Prerequisite

1. Install [Docker engine](https://docs.docker.com/engine/install/)
2. Install [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Step 2: Install Poznote

Open a Terminal and run the following commands:

```bash
mkdir poznote && cd poznote
```

```bash
cat <<EOF > .env
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
EOF
```

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

```bash
docker compose pull && docker compose up -d
```

</details>

## Access Poznote

After installation, access Poznote in your web browser:

**URL:** [http://localhost:8040](http://localhost:8040)

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`
- Port: `8040`

> ⚠️ **Important:** Change these default credentials after your first login!

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

#### Example: Creating Tom's instance

```bash
mkdir poznote-tom && cd poznote-tom

cat <<EOF > .env
POZNOTE_USERNAME=tom
POZNOTE_PASSWORD=tom_password123!
HTTP_WEB_PORT=8040
EOF

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

docker compose pull && docker compose up -d
```

#### Example: Creating Alice's instance

```bash
cd .. # Go back to parent directory
mkdir poznote-alice && cd poznote-alice

cat <<EOF > .env
POZNOTE_USERNAME=alice
POZNOTE_PASSWORD=alice_password123!
HTTP_WEB_PORT=8041
EOF

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

docker compose pull && docker compose up -d
```

Now you have two completely isolated instances:
- Tom's Poznote: http://localhost:8040
- Alice's Poznote: http://localhost:8041

> 💡 **Tip:** Make sure each instance uses a different port number to avoid conflicts!
