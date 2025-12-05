# Backup and Restore Guide

Complete guide for backing up and restoring your Poznote data.

## Table of Contents
- [Complete Backup](#complete-backup)
- [Import Individual Notes](#import-individual-notes)
- [Complete Restore](#complete-restore)
- [Automated Backups with Bash Script](#automated-backups-with-bash-script)
- [Offline View](#offline-view)
- [Manual Backup Methods](#manual-backup-methods)

---

## Complete Backup

Create a complete backup of all your Poznote data through the web interface.

### What's Included

The complete backup creates a single ZIP file containing:
- **Database** - All metadata, tags, and relationships
- **All notes** - Every note from all workspaces
- **Attachments** - All uploaded files
- **Offline viewer** - `index.html` for browsing notes without Poznote

### How to Create a Backup

1. Log in to your Poznote instance
2. Go to **Settings**
3. Navigate to **Backup / Export** section
4. Click **Create Complete Backup**
5. Download the generated ZIP file

### Backup Structure

```
poznote_backup_YYYY-MM-DD_HH-MM-SS.zip
├── index.html                    # Offline viewer
├── poznote.db                    # SQLite database
├── attachments/                  # All file attachments
│   ├── note_123/
│   │   ├── document.pdf
│   │   └── image.png
│   └── note_456/
│       └── file.txt
└── entries/                      # All note files
    ├── Workspace_Personal/
    │   ├── Folder_Projects/
    │   │   ├── 123.html
    │   │   └── 124.html
    │   └── No_Folder/
    │       └── 125.html
    └── Workspace_Work/
        └── 126.html
```

---

## Import Individual Notes

Import one or multiple notes into Poznote.

### Supported Formats

- **HTML files** (`.html`)
- **Markdown files** (`.md`, `.markdown`)

### How to Import Notes

1. Go to **Settings** > **Backup / Export**
2. Click **Import Individual Notes**
3. Select one or more files (HTML or Markdown)
4. Click **Upload**

### Import Behavior

- **Title extraction:** Automatically extracted from file content or filename
- **Workspace:** Notes are imported into the current active workspace
- **Folder:** Notes are placed in "No Folder" (uncategorized)
- **Multiple files:** All selected files are imported in one operation

---

## Complete Restore

Restore a complete backup, replacing all current data.

### ⚠️ Warning

Complete restore will **replace** all existing data:
- All current notes will be replaced
- Database will be overwritten
- All workspaces affected

**Always create a backup of your current state before restoring!**

### How to Restore

1. Go to **Settings** > **Backup / Export**
2. Click **Complete Restore**
3. Select your backup ZIP file
4. Confirm the restoration
5. Wait for the process to complete

The restore process:
- Extracts the backup archive
- Replaces the database
- Restores all notes and attachments
- Maintains original folder structure and workspaces

---

## Automated Backups with Bash Script

Set up automated scheduled backups using the included script.

### Overview

The `backup-poznote.sh` script:
- Creates backups via Poznote API
- Manages retention (keeps only recent backups)
- Can be scheduled with cron
- Works for all workspaces at once

### Script Location

The script is included in your Poznote installation directory:
```
poznote/
├── backup-poznote.sh    ← Backup script
├── docker-compose.yml
├── .env
└── data/
```

### Manual Usage

```bash
bash backup-poznote.sh '<poznote_url>' '<username>' '<password>' '<backup_directory>' '<retention_count>'
```

**Parameters:**
- `poznote_url` - Your Poznote instance URL (e.g., `https://poznote.example.com`)
- `username` - Your Poznote username
- `password` - Your Poznote password
- `backup_directory` - Parent directory where backups will be stored
- `retention_count` - Number of backups to keep (older ones are deleted)

### Example: Manual Backup

```bash
bash backup-poznote.sh 'http://localhost:8040' 'admin' 'admin123!' '/root/poznote' '30'
```

This creates a backup and keeps the 30 most recent backups.

### Automated Backups with Crontab

Schedule automatic backups using cron.

#### Setup Instructions

1. Edit your crontab:
   ```bash
   crontab -e
   ```

2. Add a backup schedule:
   ```bash
   # Backup twice daily at midnight and noon, keep 30 backups
   0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'your_password' '/root/poznote' '30'
   ```

#### Common Cron Schedules

```bash
# Every 6 hours, keep 60 backups
0 */6 * * * bash /path/to/backup-poznote.sh '...' '...' '...' '/path/to/poznote' '60'

# Daily at 2 AM, keep 14 backups (2 weeks)
0 2 * * * bash /path/to/backup-poznote.sh '...' '...' '...' '/path/to/poznote' '14'

# Every hour, keep 48 backups (2 days)
0 * * * * bash /path/to/backup-poznote.sh '...' '...' '...' '/path/to/poznote' '48'

# Weekly on Sunday at 3 AM, keep 8 backups (2 months)
0 3 * * 0 bash /path/to/backup-poznote.sh '...' '...' '...' '/path/to/poznote' '8'
```

### How the Backup Process Works

1. **Trigger:** Cron runs the script at scheduled time
2. **API Call:** Script calls Poznote API to create backup
3. **Container Backup:** API generates ZIP in `/var/www/html/data/backups/`
4. **Download:** Script downloads backup to local machine
5. **Cleanup:** Old backups are deleted from both locations (based on retention count)

### Backup Storage Locations

```
Local Machine:
/root/poznote/backups-poznote/
├── poznote_backup_2025-12-01_00-00-15.zip
├── poznote_backup_2025-12-01_12-00-15.zip
├── poznote_backup_2025-12-02_00-00-15.zip
└── ...

Docker Container:
/var/www/html/data/backups/
├── poznote_backup_2025-12-01_00-00-15.zip
├── poznote_backup_2025-12-01_12-00-15.zip
└── ...
```

### Backup Naming Convention

Backups use timestamp format:
```
poznote_backup_YYYY-MM-DD_HH-MM-SS.zip
```

Example: `poznote_backup_2025-12-05_14-30-15.zip`

---

## Offline View

View your notes without a running Poznote instance.

### How It Works

Every complete backup includes an `index.html` file that allows you to:
- Browse all notes offline
- Navigate by workspace and folder
- View attachments
- Works in any web browser
- No server required

### Using Offline View

1. Extract your backup ZIP file
2. Open `index.html` in a web browser
3. Browse your notes organized by workspace and folder
4. Click attachment links to view files

### Limitations

- **Read-only:** Cannot edit notes
- **No search:** No search functionality
- **Static:** Shows notes as they were at backup time

---

## Manual Backup Methods

### Method 1: Copy Data Directory

The simplest manual backup:

```bash
cd poznote
tar -czf poznote-manual-backup-$(date +%Y%m%d).tar.gz data/
```

This creates a compressed archive of your entire data directory.

### Method 2: Docker Volume Backup

If using Docker volumes:

```bash
docker run --rm \
  -v poznote_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/poznote-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Manual Backup

To restore a manual backup:

```bash
cd poznote
docker compose down
tar -xzf poznote-manual-backup-YYYYMMDD.tar.gz
docker compose up -d
```

---

## Backup Best Practices

### 1. Regular Backups

- **Production:** At least daily backups
- **Active use:** Multiple times per day
- **Critical data:** Consider hourly backups

### 2. Multiple Backup Locations

Store backups in multiple places:
- Local server
- External drive
- Cloud storage (Dropbox, Google Drive, S3)
- Remote server

### 3. Test Your Backups

Regularly test backup restoration:
- Verify backup files aren't corrupted
- Test restore process in a separate environment
- Ensure all data is present after restore

### 4. Monitor Backup Jobs

Check your automated backups regularly:
- Verify cron jobs are running
- Check backup file sizes
- Monitor available disk space

### 5. Retention Policy

Balance storage space with recovery needs:
- Keep recent backups (hourly/daily)
- Keep periodic backups (weekly/monthly)
- Archive important milestones

Example retention strategy:
- Last 48 hours: Keep all backups
- Last 2 weeks: Keep daily backups
- Last 6 months: Keep weekly backups
- Older: Keep monthly backups

---

## Troubleshooting

### Backup Creation Fails

1. Check available disk space:
   ```bash
   df -h
   ```

2. Check Poznote logs:
   ```bash
   docker compose logs
   ```

3. Verify API is accessible:
   ```bash
   curl -u 'username:password' http://localhost:8040/api_version.php
   ```

### Automated Script Not Running

1. Check cron is running:
   ```bash
   systemctl status cron
   ```

2. Check crontab entries:
   ```bash
   crontab -l
   ```

3. Check cron logs:
   ```bash
   grep CRON /var/log/syslog
   ```

4. Test script manually:
   ```bash
   bash /path/to/backup-poznote.sh 'url' 'user' 'pass' '/path' '30'
   ```

### Restore Fails

1. Verify backup ZIP is not corrupted:
   ```bash
   unzip -t poznote_backup_*.zip
   ```

2. Check file permissions:
   ```bash
   ls -la data/
   ```

3. Ensure enough disk space for extraction

---

## Related Guides

- [Configuration](Configuration)
- [Update Guide](Update-Guide)
- [API Documentation](API-Documentation)
