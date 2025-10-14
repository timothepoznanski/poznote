# Poznote - Cloud Deployment Guide

This guide will help you deploy Poznote on cloud platforms without managing your own infrastructure. Benefits include:
- No server maintenance
- Automatic HTTPS and domain management
- Easy scaling and updates
- Access from anywhere
- Built-in monitoring and logging

## Table of Contents

- [Option 1: Railway (Recommended)](#option-1-railway-recommended)
  - [Poznote Installation on Railway](#poznote-installation-on-railway)
  - [Access Poznote](#access-poznote)
  - [Poznote Settings](#poznote-settings)
  - [Poznote Password Recovery](#poznote-password-recovery)
  - [Poznote Updates](#poznote-updates)
- [Option 2: Other Cloud Providers](#option-2-other-cloud-providers)
  - [Generic Docker Deployment](#generic-docker-deployment)
  - [Key Considerations](#key-considerations)

## Option 1: Railway (Recommended)

Railway.com offers the easiest way to deploy Poznote in the cloud. The platform provides:
- Automated deployments from GitHub
- Automatic HTTPS
- Easy scaling
- No infrastructure management

### Poznote Installation on Railway

Create a Railway account at [Railway.com](https://railway.com) and choose the **$5/month plan**

For a **ready-to-use setup**, use the official Poznote template on Railway.

Click the button below to start the deployment:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/poznote)

Watch this 2-minute video tutorial that guides you through the entire deployment process:

**[Watch the deployment tutorial](https://youtu.be/Q22kqv82bHQ)**

> 💡 **Tip:** You can export your notes anytime from the Poznote interface if you ever decide to leave Railway, switch providers, or back up your data.

### Poznote Access

After deployment is complete:

**Step 1: Get Your Instance URL**

1. Go to your Railway dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Settings** tab
5. Find your public URL in the **Networking** section

Or watch the end of the [deployment tutorial video](https://youtu.be/Q22kqv82bHQ) to see how to get the URL.

**Step 2: Log In**

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`

> ⚠️ **Important:** Change these default credentials after your first login!

Your instance URL will look like: `https://poznote-production-xxxx.up.railway.app` but you can change it. See the [deployment tutorial video](https://youtu.be/Q22kqv82bHQ) to see how to. 

### Poznote Settings

To change your username or password on Railway, watch this video tutorial that shows you step by step how to change your settings:

**[Change Settings on Railway](https://youtu.be/_h5pP7LreZc)**

> 📝 **Note:** Unlike self-hosted installations, you cannot change the port.

### Poznote Password Recovery

If you forgot your password, you can retrieve it from Railway:

Watch this video tutorial:

**[Retrieve Your Password on Railway](https://youtu.be/_h5pP7LreZc)**

### Poznote Updates

To update your Poznote instance to the latest version:

**Video Tutorial**

**[Update Poznote on Railway](https://youtu.be/Mhpk6gitul8)**

Railway will automatically:
- Pull the latest Poznote image
- Redeploy your instance
- Preserve all your data (notes, attachments, database)

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
