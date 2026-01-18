#!/bin/bash

# ==============================================================================
# Poznote Backup Script
# ==============================================================================
# This script can be used both manually and with cron
#
# Usage:
#   ./backup-poznote.sh <URL> <USERNAME> <PASSWORD> <BACKUP_PATH> [MAX_BACKUPS]
#
# Examples:
#   ./backup-poznote.sh 'http://localhost:8080' 'admin' 'mypassword' '/var/backups'
#   ./backup-poznote.sh 'https://poznote.example.com' 'myuser' 'mypassword' '/home/user' '30'
#
# Note: The script will create a 'backups-poznote' folder inside the specified path
#       Default MAX_BACKUPS is 20 if not specified
#
# ==============================================================================

# Check if all required parameters are provided
if [ $# -lt 4 ] || [ $# -gt 5 ]; then
    echo "ERROR: Missing required parameters"
    echo ""
    echo "Usage: $0 <URL> <USERNAME> <PASSWORD> <BACKUP_PATH> [MAX_BACKUPS]"
    echo ""
    echo "Parameters:"
    echo "  URL          - Base URL of your Poznote instance"
    echo "  USERNAME     - Your Poznote username"
    echo "  PASSWORD     - Your Poznote password"
    echo "  BACKUP_PATH  - Parent directory where 'backups-poznote' folder will be created"
    echo "  MAX_BACKUPS  - Maximum number of backups to keep (default: 20)"
    echo ""
    echo "Examples:"
    echo "  $0 'http://localhost:8080' 'admin' 'mypassword' '/var/backups'"
    echo "  $0 'https://poznote.example.com' 'myuser' 'mypassword' '/home/myuser' '30'"
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
MAX_BACKUPS="${5:-20}"

# Backup configuration
BACKUP_DIR="$BACKUP_PATH/backups-poznote"

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
log "Using credentials: $USERNAME"

# Multi-user support: detect user ID from profiles
log "Detecting User ID for $USERNAME..."
PROFILES_RESPONSE=$(curl -s -u "$USERNAME:$PASSWORD" "$BASE_URL/api/v1/users/profiles")
USER_ID=$(echo "$PROFILES_RESPONSE" | jq -r ".[] | select(.username == \"$USERNAME\") | .id" 2>/dev/null)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
    log "Warning: User ID not found in profiles list. Attempting with default context."
    # If we can't find the ID (e.g. non-admin user), we'll try without the header
    # Poznote usually defaults to ID 1 or the first available user.
    AUTH_HEADER=""
else
    log "Detected User ID: $USER_ID"
    AUTH_HEADER="-H \"X-User-ID: $USER_ID\""
fi

log "Backup directory: $BACKUP_DIR"
log "Maximum backups to keep: $MAX_BACKUPS"

# Call API to create backup using REST API v1
# Note: we use eval to handle the dynamic AUTH_HEADER with quotes
RESPONSE=$(eval "curl -s -u \"$USERNAME:$PASSWORD\" $AUTH_HEADER -X POST \"$BASE_URL/api/v1/backups\"")

# Extract filename from response
FILENAME=$(echo "$RESPONSE" | jq -r '.backup_file' 2>/dev/null)

if [ "$FILENAME" = "null" ] || [ -z "$FILENAME" ]; then
    log "ERROR: Failed to create backup"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

# Get file size
SIZE=$(echo "$RESPONSE" | jq -r '.backup_size')
SIZE_MB=$(echo "$RESPONSE" | jq -r '.backup_size_mb')

log "Backup created: $FILENAME ($SIZE_MB MB)"

# Download the backup using REST API v1
DOWNLOAD_URL="$BASE_URL/api/v1/backups/$FILENAME"
OUTPUT_FILE="$BACKUP_DIR/$FILENAME"

if eval "curl -s -u \"$USERNAME:$PASSWORD\" $AUTH_HEADER -o \"$OUTPUT_FILE\" \"$DOWNLOAD_URL\""; then
    log "Backup downloaded: $OUTPUT_FILE"
else
    log "ERROR: Failed to download backup"
    exit 1
fi

# Verify the downloaded file is a valid ZIP
if file "$OUTPUT_FILE" | grep -q "Zip archive"; then
    ZIP_FILE_COUNT=$(unzip -l "$OUTPUT_FILE" | tail -1 | awk '{print $2}')
    log "Backup is valid ($ZIP_FILE_COUNT files)"
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

# List all existing backups with details
log "Existing backups:"
if [ -d "$BACKUP_DIR" ]; then
    ls -lh "$BACKUP_DIR"/poznote_backup_*.zip 2>/dev/null | awk '{print "  " $5 " " $6 " " $7 " " $8 " " $9}' | while read -r line; do
        log "$line"
    done
fi

# Clean old backups on server (via REST API v1)
log "Cleaning old backups on server..."
SERVER_BACKUPS=$(eval "curl -s -u \"$USERNAME:$PASSWORD\" $AUTH_HEADER \"$BASE_URL/api/v1/backups\"" | jq -r '.backups[] | .filename' | sort)
SERVER_COUNT=$(echo "$SERVER_BACKUPS" | grep -c "poznote_backup_")

if [ "$SERVER_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((SERVER_COUNT - MAX_BACKUPS))
    log "Removing $REMOVE_COUNT old backup(s) from server (keeping $MAX_BACKUPS most recent)"
    
    # Get oldest backups to remove
    echo "$SERVER_BACKUPS" | head -n "$REMOVE_COUNT" | while read -r OLD_BACKUP; do
        if [ -n "$OLD_BACKUP" ]; then
            DELETE_RESPONSE=$(eval "curl -s -u \"$USERNAME:$PASSWORD\" $AUTH_HEADER -X DELETE \"$BASE_URL/api/v1/backups/$OLD_BACKUP\"")
            
            if echo "$DELETE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
                log "Deleted from server: $OLD_BACKUP"
            else
                log "Warning: Failed to delete $OLD_BACKUP from server"
            fi
        fi
    done
fi

log "SUCCESS"

exit 0

