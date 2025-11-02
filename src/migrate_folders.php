<?php
/**
 * Migration script to add parent_id support to existing folders table
 * Run this once to update the database schema for subfolder support
 */

require_once 'config.php';
require_once 'db_connect.php';

echo "Starting folders table migration...\n";

try {
    // Check if parent_id column already exists
    $check = $con->query("PRAGMA table_info(folders)");
    $columns = $check->fetchAll(PDO::FETCH_ASSOC);
    
    $hasParentId = false;
    foreach ($columns as $column) {
        if ($column['name'] === 'parent_id') {
            $hasParentId = true;
            break;
        }
    }
    
    if ($hasParentId) {
        echo "✓ parent_id column already exists. No migration needed.\n";
    } else {
        echo "Adding parent_id column...\n";
        
        // SQLite doesn't support adding foreign keys via ALTER TABLE
        // We need to recreate the table
        
        // 1. Create new table with parent_id
        $con->exec('CREATE TABLE folders_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            workspace TEXT DEFAULT "Poznote",
            parent_id INTEGER DEFAULT NULL,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES folders_new(id) ON DELETE CASCADE
        )');
        
        // 2. Copy data from old table
        $con->exec('INSERT INTO folders_new (id, name, workspace, created)
                    SELECT id, name, workspace, created FROM folders');
        
        // 3. Drop old table
        $con->exec('DROP TABLE folders');
        
        // 4. Rename new table
        $con->exec('ALTER TABLE folders_new RENAME TO folders');
        
        // 5. Drop old indexes if they exist
        $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace');
        $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace_parent');
        
        // 6. Create new partial unique indexes
        // For subfolders: allow same name in different parents
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_parent_notnull 
                    ON folders(name, workspace, parent_id) 
                    WHERE parent_id IS NOT NULL');
        
        // For root folders: enforce unique names
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_root 
                    ON folders(name, workspace) 
                    WHERE parent_id IS NULL');
        
        echo "✓ Migration completed successfully!\n";
        echo "✓ parent_id column added to folders table\n";
        echo "✓ Foreign key constraint added\n";
        echo "✓ Partial unique indexes created\n";
        echo "  - Root folders: unique name per workspace\n";
        echo "  - Subfolders: same name allowed in different parents\n";
    }
    
    echo "\nFinal table structure:\n";
    $check = $con->query("PRAGMA table_info(folders)");
    $columns = $check->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $column) {
        echo "  - {$column['name']} ({$column['type']})\n";
    }
    
} catch (Exception $e) {
    echo "✗ Error during migration: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\nMigration script completed.\n";
