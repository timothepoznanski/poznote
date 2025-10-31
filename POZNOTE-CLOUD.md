# Poznote - Cloud Install and Manage Guide

This guide will help you **install and manage** Poznote on cloud platforms without managing your own infrastructure.

## Table of Contents

- [Option 1: Railway (Recommended)](#option-1-railway-recommended)
  - [Installation on Railway](#installation-on-railway)
  - [Access](#access)
  - [Get Your Instance URL](#get-your-instance-url)
  - [Change Username or Password](#change-username-or-password)
  - [Password Recovery](#password-recovery)
  - [Update to the latest version](#update-to-the-latest-version)
- [Option 2: Other Cloud Providers](#option-2-other-cloud-providers)
  - [Generic Docker Deployment](#generic-docker-deployment)
  - [Key Considerations](#key-considerations)
  - [Manage](#manage)

## Option 1: Railway (Recommended)

Railway.com offers the easiest way to install Poznote in the cloud. The platform provides:

- Automated deployments
- Automatic HTTPS
- Easy scaling
- One-click updates
- No infrastructure management

### Installation on Railway

Create a Railway account at [Railway.com](https://railway.com) and choose the **$5/month plan**.

Create your instance:

1. Go to your Railway dashboard -> https://railway.com/dashboard
2. Click on "New"
3. Choose "Template"
4. Search for "Poznote"
5. Create a password and then a username
6. Click on "Deploy"
7. Click on "Poznote" to open the side panel if it's not already open
8. Click on the "Settings" tab
9. Click on the "Networking" menu on the right
10. Click on "Generate domain"
11. In the input "Enter the port your app is listening on", enter 80
12. Click on "Generate Domain"
13. A URL like "poznote-production.up.railway.app" will appear. This is the URL of your Poznote instance. You can edit it if you wish.
14. Click on the "Deploy" menu on the right
15. Scroll down and enable "Enable Serverless"
16. Click on the "Deploy" button that appears at the top left

### Access

After deployment is complete:

1. Go to your Railway dashboard -> https://railway.com/dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Settings** tab
5. Find your public URL in the **Networking** section
6. Open this url and connect with the Username and Passwod you configured earlier

### Change Username or Password

To change your username or password on Railway:

1. Go to your Railway dashboard -> https://railway.com/dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Variables** tab
5. Click the three‑dot menu next to the POZNOTE_USERNAME or POZNOTE_PASSWORD variable, choose "Edit", update the value, then save with the submit button
6. Click on the Deploy button

### Password Recovery

If you forgot your password, you can retrieve it from Railway:

1. Go to your Railway dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Variables** tab
5. Click the eye icon to show value

### Update to the latest version

To update your Poznote instance to the latest version:

1. Go to your Railway dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Deployments** tab
5. Click the three‑dot menu and choose "Redeploy"

## Option 2: Other Cloud Providers

If you prefer using another cloud platform, Poznote can be deployed on any service that supports Docker containers.

### Generic Docker Deployment

Most cloud platforms accept standard Docker deployment configurations. Use this as a starting point:

**Docker Image:**
```
ghcr.io/timothepoznanski/poznote:latest
```

**Required Environment Variables:**
```bash
SQLITE_DATABASE=/var/www/html/data/database/poznote.db
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=admin123!
HTTP_WEB_PORT=8040
```

**Docker Run Command (for platforms that support it):**
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

**Docker Compose (if supported):**
```yaml
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
```

### Key Considerations

When deploying to custom cloud providers, keep these important points in mind:

**1. Persistent Storage**
- ✅ Ensure the platform supports **persistent volumes** for the `./data` directory
- ✅ Data must persist across container restarts and redeployments
- ⚠️ Without persistent storage, you'll lose your notes on every restart

**2. Networking & Security**
- ✅ Configure firewall rules to allow HTTP/HTTPS traffic
- ✅ Set up SSL/TLS certificates for HTTPS (most platforms do this automatically)
- ✅ Consider using a custom domain name
- ✅ Ensure the platform exposes port 80 or maps to your configured port

**3. Backups**
- ✅ Set up regular backups of the `./data` directory
- ✅ Use Poznote's built-in backup feature (Settings → Backup)
- ✅ Store backups in a separate location (cloud storage, local machine)

### Manage

The management of your Poznote instance will depend on your chosen cloud provider. Each platform has its own interface and procedures for:

- **Configuration**: Accessing and modifying environment variables (username, password, port settings)
- **Updates**: Redeploying with the latest Poznote Docker image
- **Monitoring**: Viewing logs and managing your instance
- **Password Recovery**: Accessing your credentials through the platform's interface

Please refer to your cloud provider's documentation for specific instructions on how to manage Docker-based applications and environment variables.