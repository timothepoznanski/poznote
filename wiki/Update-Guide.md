# Update Guide

Keep your Poznote instance up to date with the latest features and security patches.

## Table of Contents
- [Update to Latest Version](#update-to-latest-version)
- [Update Frequency](#update-frequency)
- [Version Information](#version-information)
- [Troubleshooting Updates](#troubleshooting-updates)

---

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

---

## Update Frequency

### Recommended Update Schedule

- **Check for updates:** Weekly or bi-weekly
- **Apply updates:** As soon as available for security patches
- **Review release notes:** Before each update

### Checking Current Version

You can check your current version from within Poznote:
1. Log in to your Poznote instance
2. Go to **Settings**
3. Look for version information at the bottom

Or via API:
```bash
curl -u 'username:password' http://localhost:8040/api_version.php
```

---

## Version Information

### Release Channels

Poznote uses the following Docker image tags:

- `latest` - Most recent stable release (recommended)
- `dev` - Development version (for testing, not recommended for production)
- Specific version tags (e.g., `v1.2.3`) - Pin to a specific version

### Viewing Release Notes

Before updating, review what's new:
- Visit [Poznote Releases](https://github.com/timothepoznanski/poznote/releases)
- Read the changelog for breaking changes
- Check for any special update instructions

---

## Automated Update Script

You can create a simple script to automate updates:

```bash
#!/bin/bash
# update-poznote.sh

echo "Starting Poznote update..."

cd /path/to/your/poznote

echo "Stopping container..."
docker compose down

echo "Removing old image..."
docker rmi ghcr.io/timothepoznanski/poznote:latest

echo "Pulling latest image..."
docker compose pull

echo "Starting updated container..."
docker compose up -d

echo "Update complete!"
docker compose ps
```

Make it executable:
```bash
chmod +x update-poznote.sh
```

Run the update:
```bash
./update-poznote.sh
```

---

## Troubleshooting Updates

### Update Failed - Container Won't Start

1. Check the logs:
   ```bash
   docker compose logs
   ```

2. Verify your `.env` file is intact:
   ```bash
   cat .env
   ```

3. Try pulling the image again:
   ```bash
   docker compose pull
   docker compose up -d
   ```

### Can't Remove Old Image

If the image is in use by another container:

```bash
# List all containers
docker ps -a

# Stop and remove any old poznote containers
docker stop <container_id>
docker rm <container_id>

# Now remove the image
docker rmi ghcr.io/timothepoznanski/poznote:latest
```

### Lost Data After Update

This shouldn't happen if you followed the update procedure. Check if your data directory exists:

```bash
ls -la ./data
```

If the directory is empty or missing, restore from your backup. See [Backup and Restore Guide](Backup-and-Restore).

### Port Conflict After Update

If you get a port conflict error:

1. Check what's using your port:
   ```bash
   netstat -tulpn | grep 8040
   ```

2. Either stop the conflicting service or change Poznote's port in `.env`

---

## Rolling Back to Previous Version

If you encounter issues with a new version, you can roll back:

```bash
cd poznote

# Stop current version
docker compose down

# Pull specific older version (replace v1.0.0 with desired version)
docker pull ghcr.io/timothepoznanski/poznote:v1.0.0

# Modify docker-compose.yml to use specific version temporarily
# Change: image: ghcr.io/timothepoznanski/poznote:latest
# To:     image: ghcr.io/timothepoznanski/poznote:v1.0.0

# Start the container
docker compose up -d
```

**Important:** Report the issue on [GitHub](https://github.com/timothepoznanski/poznote/issues) so it can be fixed!

---

## Best Practices

### Before Updating

1. ✅ **Create a backup** - See [Backup Guide](Backup-and-Restore)
2. ✅ **Read release notes** - Check for breaking changes
3. ✅ **Test in development** - If running in production, test in a dev environment first

### After Updating

1. ✅ **Verify functionality** - Log in and test basic operations
2. ✅ **Check logs** - Ensure no errors: `docker compose logs`
3. ✅ **Test critical features** - Verify your workflow works as expected

---

## Related Guides

- [Installation Guide](Installation-Guide)
- [Backup and Restore](Backup-and-Restore)
- [Configuration](Configuration)
