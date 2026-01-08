#!/bin/sh
set -e

echo "Poznote Initialization Script - Setting up data directory..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/database"

# Set correct Alpine permissions (UID 82)
echo "Setting correct permissions..."
chown -R www-data:www-data "$DATA_DIR"

chmod -R 775 "$DATA_DIR"

echo "Final permissions check:"
ls -la "$DATA_DIR"

# Ensure final permissions are correct for database files
if [ -f "$DB_PATH" ]; then
    chown www-data:www-data "$DB_PATH"
    chmod 664 "$DB_PATH"
fi

# Auto-fix empty entry columns (runs once)
echo "Running entry column fix check..."
php /var/www/html/tools/auto-fix-entries.php || true

