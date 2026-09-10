#!/bin/sh
set -e

echo "Poznote Initialization Script - Setting up data directory..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"
MCP_TOKEN_FILE="${POZNOTE_SERVICE_TOKEN_FILE:-$DATA_DIR/.mcp_token}"

# Used by the rootless build stage of the Dockerfile: when this script is
# not running as root, it cannot chown files/directories it does not
# already own (e.g. a host bind mount created with a different uid). Only
# root (uid 0) can perform the ownership fixups below; running non-root
# skips them and instead verifies the data directory is already owned by
# the current user, failing fast with an actionable message if not.
CURRENT_UID="$(id -u)"

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

# php-fpm worker count. The image default (docker/php-fpm/www.conf) suits
# most instances; a busy one (several users, AI chat, S3, git sync) can raise
# it with POZNOTE_PHP_FPM_MAX_CHILDREN, each busy worker costing about
# 25-30 MB. The start/spare settings are kept consistent with it, php-fpm
# refuses to start otherwise. Applied on every start, so the value follows
# the environment of the container.
FPM_POOL="/usr/local/etc/php-fpm.d/www.conf"
if [ -n "${POZNOTE_PHP_FPM_MAX_CHILDREN:-}" ]; then
    FPM_MAX="$POZNOTE_PHP_FPM_MAX_CHILDREN"
    case "$FPM_MAX" in
        *[!0-9]*|'')
            echo "WARNING: POZNOTE_PHP_FPM_MAX_CHILDREN='$FPM_MAX' is not a whole number, keeping the image default." >&2
            ;;
        *)
            if [ "$FPM_MAX" -lt 1 ] || [ "$FPM_MAX" -gt 1000 ]; then
                echo "WARNING: POZNOTE_PHP_FPM_MAX_CHILDREN=$FPM_MAX is outside 1-1000, keeping the image default." >&2
            elif [ ! -w "$FPM_POOL" ]; then
                echo "WARNING: $FPM_POOL is not writable, POZNOTE_PHP_FPM_MAX_CHILDREN not applied." >&2
            else
                FPM_START=2
                FPM_MAX_SPARE=3
                if [ "$FPM_MAX" -lt 2 ]; then FPM_START="$FPM_MAX"; fi
                if [ "$FPM_MAX" -lt 3 ]; then FPM_MAX_SPARE="$FPM_MAX"; fi
                # Rewritten through /tmp rather than sed -i: in the rootless
                # image the file is ours but its directory stays root's, and
                # sed -i needs to create a temporary file next to it.
                FPM_TMP="$(mktemp)"
                sed \
                    -e "s/^pm\.max_children = .*/pm.max_children = $FPM_MAX/" \
                    -e "s/^pm\.start_servers = .*/pm.start_servers = $FPM_START/" \
                    -e "s/^pm\.max_spare_servers = .*/pm.max_spare_servers = $FPM_MAX_SPARE/" \
                    "$FPM_POOL" > "$FPM_TMP" \
                    && cat "$FPM_TMP" > "$FPM_POOL"
                rm -f "$FPM_TMP"
                echo "php-fpm: pm.max_children = $FPM_MAX (POZNOTE_PHP_FPM_MAX_CHILDREN)"
            fi
            ;;
    esac
fi

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"

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
