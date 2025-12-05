# Update Guide

Keep your Poznote instance up to date with the latest features and security patches.

## Table of Contents
- [Update to Latest Version](#update-to-latest-version)
- [Version Information](#version-information)
- [Troubleshooting Updates](#troubleshooting-updates)

## Update to Latest Version

Follow these steps to update Poznote to the latest version.

### Step-by-Step Update Process

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running container before updating:
```bash
docker compose down
```

Remove the current image to force download of latest version:
```bash
docker rmi ghcr.io/timothepoznanski/poznote:latest
```

Download the latest Poznote image:
```bash
docker compose pull
```

Start the updated container:
```bash
docker compose up -d
```

### Data Safety

✅ **Your data is safe!** 

Your data is preserved in the `./data` directory and will **not** be affected by the update. This includes:
- All your notes
- Attachments
- Database
- Settings
- Workspaces and folders

## Checking Current Version

You can check your current version from within Poznote:
1. Log in to your Poznote instance
2. Go to **Settings**
3. Look for version information at the bottom

Or via API:
```bash
curl -u 'username:password' http://localhost:8040/api_version.php
```
