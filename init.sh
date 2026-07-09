#!/bin/sh
set -e

echo "Poznote Initialization Script - Setting up data directory..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"
MCP_TOKEN_FILE="${POZNOTE_SERVICE_TOKEN_FILE:-$DATA_DIR/.mcp_token}"

# Used by the rootless image variant (Dockerfile.rootless): when this script
# is not running as root, it cannot chown files/directories it does not
# already own (e.g. a host bind mount created with a different uid). Only
# root (uid 0) can perform the ownership fixups below; running non-root
# skips them and instead verifies the data directory is already owned by
# the current user, failing fast with an actionable message if not.
CURRENT_UID="$(id -u)"

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"

# Rootless (non-root) fail-fast check: must happen before anything else
# touches $DATA_DIR, since a non-root process cannot create/write inside a
# mount point it does not own (unlike root, which can chown its way out of
# a mismatch later in this script).
if [ "$CURRENT_UID" != "0" ]; then
    DATA_DIR_OWNER_UID="$(stat -c '%u' "$DATA_DIR" 2>/dev/null || echo "")"
    if [ "$DATA_DIR_OWNER_UID" != "$CURRENT_UID" ]; then
        echo "ERROR: $DATA_DIR is owned by uid $DATA_DIR_OWNER_UID, but this container is running as uid $CURRENT_UID (non-root)." >&2
        echo "Running rootlessly, this container cannot chown a mounted volume it does not already own." >&2
        echo "Fix ownership on the host before starting the container, e.g.:" >&2
        echo "    sudo chown -R $CURRENT_UID:$CURRENT_UID ./data" >&2
        exit 1
    fi
fi

mkdir -p "$DATA_DIR/database"

if [ ! -s "$MCP_TOKEN_FILE" ]; then
    echo "Creating MCP service token at $MCP_TOKEN_FILE..."
    umask 077
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "$MCP_TOKEN_FILE"
fi

# Ensure data directory and all its contents are owned by www-data
# Create essential subdirectories if they don't exist
mkdir -p "$DATA_DIR/users" "$DATA_DIR/backups"

echo "Running automatic base64 image conversion..."
if php /var/www/html/maintenance/convert-base64-images.php "$DATA_DIR"; then
    echo "Automatic base64 image conversion completed."
else
    echo "Warning: automatic base64 image conversion failed; continuing startup."
fi

echo "Running automatic attachment URL repair..."
if php /var/www/html/maintenance/repair-attachment-urls.php "$DATA_DIR"; then
    echo "Automatic attachment URL repair completed."
else
    echo "Warning: automatic attachment URL repair failed; continuing startup."
fi

echo "Running automatic orphan snapshot cleanup..."
if php /var/www/html/maintenance/cleanup-orphan-snapshots.php "$DATA_DIR"; then
    echo "Automatic orphan snapshot cleanup completed."
else
    echo "Warning: automatic orphan snapshot cleanup failed; continuing startup."
fi

if [ "$CURRENT_UID" = "0" ]; then
    echo "Setting correct permissions recursively on $DATA_DIR..."
    chown -R www-data:www-data "$DATA_DIR"
    find "$DATA_DIR" -type d -exec chmod 775 {} +
    find "$DATA_DIR" -type f -exec chmod 664 {} +
else
    echo "Running as non-root (uid $CURRENT_UID); $DATA_DIR is already correctly owned, skipping chown."
fi

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
    if [ "$CURRENT_UID" = "0" ]; then
        chown www-data:www-data "$MASTER_DB"
    fi
    chmod 664 "$MASTER_DB"
fi

if [ -f "$MCP_TOKEN_FILE" ]; then
    if [ "$CURRENT_UID" = "0" ]; then
        chown www-data:www-data "$MCP_TOKEN_FILE"
    fi
    chmod 644 "$MCP_TOKEN_FILE"
fi
