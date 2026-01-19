#!/bin/sh
set -e

echo "Poznote Initialization Script - Setting up data directory..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/database"

# Ensure data directory and all its contents are owned by www-data
echo "Setting correct permissions recursively on $DATA_DIR..."
# Create essential subdirectories if they don't exist
mkdir -p "$DATA_DIR/database" "$DATA_DIR/users" "$DATA_DIR/entries" "$DATA_DIR/attachments" "$DATA_DIR/backups"

# Fix ownership and permissions for the entire data tree
chown -R www-data:www-data "$DATA_DIR"
find "$DATA_DIR" -type d -exec chmod 775 {} +
find "$DATA_DIR" -type f -exec chmod 664 {} +

echo "Final permissions check for $DATA_DIR:"
ls -la "$DATA_DIR"

# Check for master database
MASTER_DB="$DATA_DIR/master.db"
if [ -f "$MASTER_DB" ]; then
    echo "Master database found, ensuring permissions..."
    chown www-data:www-data "$MASTER_DB"
    chmod 664 "$MASTER_DB"
fi
