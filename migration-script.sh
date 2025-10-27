#!/bin/sh
set -e

echo "🔄 Poznote Migration Script - Checking for legacy permissions..."

DATA_DIR="/var/www/html/data"
ALPINE_WWW_DATA_UID=82
DEBIAN_WWW_DATA_UID=33

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo "📁 Creating data directory..."
    mkdir -p "$DATA_DIR"
    chown -R www-data:www-data "$DATA_DIR"
    chmod -R 775 "$DATA_DIR"
    echo "✅ Data directory created with correct permissions"
    exit 0
fi

# Check ownership of data directory
CURRENT_UID=$(stat -c %u "$DATA_DIR" 2>/dev/null || echo "0")

if [ "$CURRENT_UID" = "$DEBIAN_WWW_DATA_UID" ]; then
    echo "🔧 Detected legacy Debian installation (UID 33)"
    echo "   Converting to Alpine permissions (UID 82)..."
    
    # Convert all files from Debian www-data (33) to Alpine www-data (82)
    chown -R www-data:www-data "$DATA_DIR"
    chmod -R 775 "$DATA_DIR"
    
    # Ensure database files are writable
    if [ -d "$DATA_DIR/database" ]; then
        chmod 775 "$DATA_DIR/database"
        find "$DATA_DIR/database" -name "*.db" -exec chmod 664 {} \;
    fi
    
    # Ensure attachment directory is writable
    if [ -d "$DATA_DIR/attachments" ]; then
        chmod -R 775 "$DATA_DIR/attachments"
    fi
    
    echo "✅ Migration completed successfully!"
    echo "   All files now owned by Alpine www-data (UID 82)"
    
elif [ "$CURRENT_UID" = "$ALPINE_WWW_DATA_UID" ]; then
    echo "✅ Alpine permissions already correct (UID 82)"
    
elif [ "$CURRENT_UID" = "0" ]; then
    echo "🔧 Root ownership detected, fixing to www-data..."
    chown -R www-data:www-data "$DATA_DIR"
    chmod -R 775 "$DATA_DIR"
    echo "✅ Permissions corrected to www-data"
    
else
    echo "⚠️  Unknown ownership (UID $CURRENT_UID), standardizing to www-data..."
    chown -R www-data:www-data "$DATA_DIR"
    chmod -R 775 "$DATA_DIR"
    echo "✅ Permissions standardized to www-data"
fi

# Final verification
echo "📊 Final permissions check:"
ls -la "$DATA_DIR" | head -5

echo "🚀 Starting Poznote services..."