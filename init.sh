#!/bin/sh
set -e

echo "Poznote Migration Script - Checking for legacy permissions..."

DATA_DIR="/var/www/html/data"
DB_PATH="$DATA_DIR/database/poznote.db"
MIGRATION_MARKER="$DATA_DIR/database/.parent_id_migrated"

# Get current UID for www-data
WWW_DATA_UID=$(id -u www-data)

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"

# Check if we're using old Debian permissions (UID 33) and migrate to Alpine (UID 82)
if [ -d "$DATA_DIR" ] && [ "$(stat -c '%u' "$DATA_DIR" 2>/dev/null || stat -f '%u' "$DATA_DIR")" = "33" ] && [ "$WWW_DATA_UID" = "82" ]; then
    echo "Migrating from Debian (UID 33) to Alpine (UID 82) permissions..."
    chown -R 82:82 "$DATA_DIR"
    echo "Permission migration complete"
elif [ "$(stat -c '%u' "$DATA_DIR" 2>/dev/null || stat -f '%u' "$DATA_DIR")" = "82" ]; then
    echo "Alpine permissions already correct (UID 82)"
else
    echo "Setting correct permissions..."
    chown -R www-data:www-data "$DATA_DIR"
fi

chmod -R 775 "$DATA_DIR"

echo "Final permissions check:"
ls -la "$DATA_DIR"

# Run database schema migration if needed
if [ -f "$DB_PATH" ] && [ ! -f "$MIGRATION_MARKER" ]; then
    echo "Checking database schema..."
    
    # Check if folders table exists and if it has parent_id column
    HAS_FOLDERS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='folders';" 2>/dev/null || echo "0")
    
    if [ "$HAS_FOLDERS" = "1" ]; then
        # Check if parent_id column exists
        PARENT_ID_CHECK=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('folders') WHERE name='parent_id';" 2>/dev/null || echo "error")
        
        if [ "$PARENT_ID_CHECK" = "0" ]; then
            echo "WARNING: Old database schema detected - migrating folders table..."
            
            # Check if we have the old UNIQUE constraint on name only (very old schema)
            OLD_UNIQUE_CHECK=$(sqlite3 "$DB_PATH" "SELECT sql FROM sqlite_master WHERE type='index' AND name='sqlite_autoindex_folders_1' AND sql IS NULL;" 2>/dev/null | wc -l)
            
            if [ "$OLD_UNIQUE_CHECK" -gt "0" ]; then
                echo "Detected very old schema with UNIQUE constraint on name only - fixing..."
            fi
            
            # Run comprehensive migration SQL
            sqlite3 "$DB_PATH" <<'EOF'
PRAGMA foreign_keys = OFF;

-- Clean up any failed previous migration
DROP TABLE IF EXISTS folders_new;
DROP TABLE IF EXISTS folders_backup;

BEGIN TRANSACTION;

-- Create new table with correct schema (workspace-scoped uniqueness + parent_id support)
CREATE TABLE folders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    workspace TEXT DEFAULT "Poznote",
    parent_id INTEGER DEFAULT NULL,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES folders_new(id) ON DELETE CASCADE
);

-- Copy data from old table (handles all schema versions)
INSERT INTO folders_new (id, name, workspace, created)
SELECT id, name, 
       COALESCE(workspace, "Poznote") as workspace,
       COALESCE(created, CURRENT_TIMESTAMP) as created
FROM folders;

-- Drop old table (this removes the old UNIQUE constraint if it existed)
DROP TABLE folders;

-- Rename new table
ALTER TABLE folders_new RENAME TO folders;

-- Drop any old indexes
DROP INDEX IF EXISTS idx_folders_name_workspace;
DROP INDEX IF EXISTS idx_folders_name_workspace_parent;
DROP INDEX IF EXISTS sqlite_autoindex_folders_1;

-- Create new partial unique indexes (workspace-scoped + parent-scoped)
-- For subfolders: same name allowed in different parents within same workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_parent_notnull 
    ON folders(name, workspace, parent_id) 
    WHERE parent_id IS NOT NULL;

-- For root folders: unique name per workspace (allows same name in different workspaces)
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_root 
    ON folders(name, workspace) 
    WHERE parent_id IS NULL;

COMMIT;
PRAGMA foreign_keys = ON;
EOF

            if [ $? -eq 0 ]; then
                echo "Database migration completed successfully!"
                echo "   - Added parent_id column for subfolder support"
                echo "   - Fixed UNIQUE constraints to be workspace-scoped"
                touch "$MIGRATION_MARKER"
                
                # Fix permissions after migration
                echo "Fixing database permissions after migration..."
                chown www-data:www-data "$DB_PATH"
                chmod 664 "$DB_PATH"
            else
                echo "ERROR: Database migration failed - continuing anyway..."
            fi
        else
            echo "Database schema is up to date"
            touch "$MIGRATION_MARKER"
        fi
    else
        echo "INFO: No folders table found (fresh install or will be created)"
        touch "$MIGRATION_MARKER"
    fi
else
    echo "Database migration check complete"
fi

# Ensure final permissions are correct for database files
if [ -f "$DB_PATH" ]; then
    chown www-data:www-data "$DB_PATH"
    chmod 664 "$DB_PATH"
fi

echo "Starting Poznote services..."
echo ""
echo "======================================"
echo "  Poznote is ready!"
echo "======================================"
echo ""
echo "  Access your instance at:"
echo "  → http://localhost:${HTTP_WEB_PORT}"
echo ""
echo "======================================"
echo ""