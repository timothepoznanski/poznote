#!/bin/bash

# ==============================================================================
# Poznote Backup Script
# ==============================================================================
# This script can be used both manually and with cron
#
# Usage:
#   ./backup-poznote.sh <URL> <USERNAME> <PASSWORD> <BACKUP_PATH>
#
# Examples:
#   ./backup-poznote.sh 'http://localhost:8080' 'admin' 'mypassword' '/var/backups'
#   ./backup-poznote.sh 'https://poznote.example.com' 'user' 'my secure pass' '/home/user'
#
# Note: The script will create a 'backups-poznote' folder inside the specified path
#
# ==============================================================================

# Check if all required parameters are provided
if [ $# -ne 4 ]; then
    echo "ERROR: Missing required parameters"
    echo ""
    echo "Usage: $0 <URL> <USERNAME> <PASSWORD> <BACKUP_PATH>"
    echo ""
    echo "Parameters:"
    echo "  URL          - Base URL of your Poznote instance"
    echo "  USERNAME     - Your Poznote username"
    echo "  PASSWORD     - Your Poznote password"
    echo "  BACKUP_PATH  - Parent directory where 'backups-poznote' folder will be created"
    echo ""
    echo "Examples:"
    echo "  $0 'http://localhost:8080' 'admin' 'mypassword' '/var/backups'"
    echo "  $0 'https://poznote.example.com' 'user' 'my secure pass' '/home/user'"
    echo ""
    echo "Note: The script will create a 'backups-poznote' folder inside the specified path"
    echo ""
    exit 1
fi

# Get parameters
BASE_URL="$1"
USERNAME="$2"
PASSWORD="$3"
BACKUP_PATH="$4"

# Backup configuration
BACKUP_DIR="$BACKUP_PATH/backups-poznote"
MAX_BACKUPS=7

# Check if parent path exists
if [ ! -d "$BACKUP_PATH" ]; then
    echo "ERROR: Parent directory does not exist: $BACKUP_PATH"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if directory creation was successful
if [ ! -d "$BACKUP_DIR" ]; then
    echo "ERROR: Failed to create backup directory: $BACKUP_DIR"
    exit 1
fi

# Logging function with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Creating backup for: $BASE_URL"
log "Backup directory: $BACKUP_DIR"

# Call API to create backup
RESPONSE=$(curl -s -u "$USERNAME:$PASSWORD" -X POST "$BASE_URL/api_backup.php")

# Extract filename from response (API returns "backup_file" not "filename")
FILENAME=$(echo "$RESPONSE" | jq -r '.backup_file')

if [ "$FILENAME" = "null" ] || [ -z "$FILENAME" ]; then
    log "ERROR: Failed to create backup"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

# Get file size
SIZE=$(echo "$RESPONSE" | jq -r '.backup_size')
SIZE_MB=$(echo "$RESPONSE" | jq -r '.backup_size_mb')

log "Backup created: $FILENAME ($SIZE_MB MB)"

# Download the backup
DOWNLOAD_URL="$BASE_URL/api_download_backup.php?filename=$FILENAME"
OUTPUT_FILE="$BACKUP_DIR/$FILENAME"

if curl -s -u "$USERNAME:$PASSWORD" -o "$OUTPUT_FILE" "$DOWNLOAD_URL"; then
    log "Backup downloaded: $OUTPUT_FILE"
else
    log "ERROR: Failed to download backup"
    exit 1
fi

# Verify the downloaded file is a valid ZIP
if file "$OUTPUT_FILE" | grep -q "Zip archive"; then
    log "Backup is valid"
else
    log "ERROR: Downloaded file is not a valid ZIP"
    exit 1
fi

# Keep only the MAX_BACKUPS most recent backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/poznote_backup_*.zip 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    log "Removing $REMOVE_COUNT old backup(s) (keeping $MAX_BACKUPS most recent)"
    ls -t "$BACKUP_DIR"/poznote_backup_*.zip | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

log "Total backups stored: $(ls -1 "$BACKUP_DIR"/poznote_backup_*.zip 2>/dev/null | wc -l)"
log "SUCCESS"

exit 0
