# Configuration Guide

Learn how to customize and manage your Poznote instance settings.

## Table of Contents
- [Change Settings](#change-settings)
- [Password Recovery](#password-recovery)
- [Environment Variables](#environment-variables)
- [Security Best Practices](#security-best-practices)

---

## Change Settings

To modify your username, password, or port.

### Step-by-Step Instructions

Navigate to your Poznote directory:
```bash
cd poznote
```

Stop the running Poznote container:
```bash
docker compose down
```

Edit the `.env` file with your preferred text editor and modify the values:

```
POZNOTE_USERNAME=your_new_username
POZNOTE_PASSWORD=your_new_password
HTTP_WEB_PORT=8040
```

Restart Poznote with new configuration:
```bash
docker compose up -d
```

---

## Password Recovery

Your credentials are stored in the `.env` file in your Poznote directory.

### To Retrieve Your Password:

1. Navigate to your Poznote directory
2. Open the `.env` file
3. Look for the `POZNOTE_PASSWORD` value

**Example:**

```bash
cd poznote
cat .env
```

You'll see output like:
```
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=your_password_here
HTTP_WEB_PORT=8040
```

---

## Environment Variables

Poznote uses the following environment variables for configuration:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POZNOTE_USERNAME` | Username for authentication | `admin` | Yes |
| `POZNOTE_PASSWORD` | Password for authentication | `admin123!` | Yes |
| `HTTP_WEB_PORT` | Port for accessing Poznote | `8040` | Yes |
| `SQLITE_DATABASE` | Path to SQLite database file | `/var/www/html/data/database/poznote.db` | Yes (set automatically) |

---

## Security Best Practices

### 1. Change Default Credentials

**Always** change the default username and password after installation:

```bash
# Edit .env file
nano .env

# Change these values:
POZNOTE_USERNAME=your_secure_username
POZNOTE_PASSWORD=your_strong_password_here
```

### 2. Use Strong Passwords

- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, and symbols
- Avoid common words or patterns

### 3. Restrict Network Access

If running on a server, consider using a reverse proxy (like Nginx) with SSL/TLS:

- Enable HTTPS
- Use a firewall to restrict access
- Consider IP whitelisting for sensitive deployments

### 4. Regular Backups

Set up automated backups to protect your data. See the [Backup and Restore Guide](Backup-and-Restore).

### 5. Keep Poznote Updated

Regularly update to the latest version to receive security patches and bug fixes. See the [Update Guide](Update-Guide).

---

## Advanced Configuration

### Custom Port

To use a different port (e.g., 3000 instead of 8040):

```bash
# In .env file
HTTP_WEB_PORT=3000
```

Then restart:
```bash
docker compose down
docker compose up -d
```

Access at: `http://localhost:3000`

### Multiple Users

For multiple separate users, see [Multiple Instances Setup](Multiple-Instances-Setup).

---

## Troubleshooting

### Can't Access After Changing Settings

1. Check if the container is running:
   ```bash
   docker compose ps
   ```

2. Check logs for errors:
   ```bash
   docker compose logs
   ```

3. Verify your `.env` file has no syntax errors

4. Ensure the new port isn't already in use:
   ```bash
   netstat -tulpn | grep <your_port>
   ```

### Forgot Username

Check your `.env` file:
```bash
cat .env | grep POZNOTE_USERNAME
```

---

## Related Guides

- [Installation Guide](Installation-Guide)
- [Update Guide](Update-Guide)
- [Backup and Restore](Backup-and-Restore)
