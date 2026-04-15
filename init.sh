#!/bin/sh
set -e

echo "Poznote Initialization Script - Setting up data directory..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"
MCP_TOKEN_FILE="${POZNOTE_SERVICE_TOKEN_FILE:-$DATA_DIR/.mcp_token}"

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/database"

if [ ! -s "$MCP_TOKEN_FILE" ]; then
    echo "Creating MCP service token at $MCP_TOKEN_FILE..."
    umask 077
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "$MCP_TOKEN_FILE"
fi

# Ensure data directory and all its contents are owned by www-data
echo "Setting correct permissions recursively on $DATA_DIR..."
# Create essential subdirectories if they don't exist
mkdir -p "$DATA_DIR/users" "$DATA_DIR/backups"

# Fix ownership and permissions for the entire data tree
chown -R www-data:www-data "$DATA_DIR"
find "$DATA_DIR" -type d -exec chmod 775 {} +
find "$DATA_DIR" -type f -exec chmod 664 {} +

echo "Final permissions check for $DATA_DIR:"
ls -la "$DATA_DIR"
# Cleanup old/unused files and directories
echo "Cleaning up old/unused database files and directories..."

# 1. Remove 0-byte database files at the root of data
find "$DATA_DIR" -maxdepth 1 -name "*.db" -size 0 -delete

# 2. Remove legacy/empty database files in the database/ subdirectory
if [ -d "$DATA_DIR/database" ]; then
    find "$DATA_DIR/database" -name "master.db" -size 0 -delete
    # Optional: If you want to keep data/database/poznote.db as a backup of the old system, 
    # don't delete it. But if it's 0-byte, we remove it.
    find "$DATA_DIR/database" -name "poznote.db" -size 0 -delete
fi

# 3. Remove legacy .old directories from previous migrations if they exist
for old_dir in "attachments.old" "database.old" "entries.old" "backups.old"; do
    if [ -d "$DATA_DIR/$old_dir" ]; then
        echo "Removing legacy directory: $old_dir"
        rm -rf "$DATA_DIR/$old_dir"
    fi
done

# 4. Remove legacy global storage directories (replaced by data/users/ID/...)
# Only if data/users/ is populated (at least one user dir exists) to avoid
# deleting data on a fresh install before first migration.
if [ -d "$DATA_DIR/users" ] && find "$DATA_DIR/users" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
    for legacy_dir in "attachments" "entries" "database"; do
        if [ -d "$DATA_DIR/$legacy_dir" ]; then
            echo "Removing legacy directory: $legacy_dir"
            rm -rf "$DATA_DIR/$legacy_dir"
        fi
    done
    # Remove 0-byte legacy db files at root of data/
    find "$DATA_DIR" -maxdepth 1 -name "*.db" -size 0 -delete
else
    echo "Skipping legacy dir cleanup: data/users/ is empty (fresh install)."
fi
# Check for master database
MASTER_DB="$DATA_DIR/master.db"
if [ -f "$MASTER_DB" ]; then
    echo "Master database found, ensuring permissions..."
    chown www-data:www-data "$MASTER_DB"
    chmod 664 "$MASTER_DB"
fi

if [ -f "$MCP_TOKEN_FILE" ]; then
    chown www-data:www-data "$MCP_TOKEN_FILE"
    chmod 644 "$MCP_TOKEN_FILE"
fi
