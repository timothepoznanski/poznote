<?php
/**
 * Standalone Database Migration Script
 * Adds parent_id column to folders table for backward compatibility
 * Can be called independently without requiring db_connect.php
 */

function migrateDatabase($dbPath) {
    try {
        // Direct connection without db_connect.php to avoid circular dependencies
        $con = new PDO('sqlite:' . $dbPath);
        $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Check if folders table exists
        $result = $con->query("SELECT name FROM sqlite_master WHERE type='table' AND name='folders'");
        $foldersExists = $result->fetchColumn() !== false;
        
        if (!$foldersExists) {
            return ['success' => true, 'migrated' => false, 'message' => 'No folders table found'];
        }
        
        // Check if parent_id column exists
        $hasParentId = $con->query("SELECT COUNT(*) FROM pragma_table_info('folders') WHERE name='parent_id'")->fetchColumn();
        
        if ($hasParentId > 0) {
            return ['success' => true, 'migrated' => false, 'message' => 'Database already up to date'];
        }
        
        // Perform migration
        error_log('MIGRATION: Migrating folders table schema');
        
        // Check for very old schema with UNIQUE constraint on name only
        $oldUniqueConstraint = false;
        try {
            $indexes = $con->query("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='folders'")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($indexes as $index) {
                // Check if there's an auto-index (UNIQUE constraint in CREATE TABLE)
                if (strpos($index['name'], 'sqlite_autoindex') !== false && empty($index['sql'])) {
                    $oldUniqueConstraint = true;
                    error_log('MIGRATION: Detected very old schema with UNIQUE constraint on name only');
                    break;
                }
            }
        } catch (Exception $e) {
            // Ignore index check errors
        }
        
        $con->exec('PRAGMA foreign_keys = OFF');
        
        // Clean up any failed previous migration attempt
        $con->exec('DROP TABLE IF EXISTS folders_new');
        $con->exec('DROP TABLE IF EXISTS folders_backup');
        
        $con->exec('BEGIN TRANSACTION');
        
        // Create new table with correct schema (workspace-scoped uniqueness + parent_id)
        $con->exec('CREATE TABLE folders_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            workspace TEXT DEFAULT "Poznote",
            parent_id INTEGER DEFAULT NULL,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES folders_new(id) ON DELETE CASCADE
        )');
        
        // Copy data from old table (handles all schema versions)
        $con->exec('INSERT INTO folders_new (id, name, workspace, created)
                    SELECT id, name, 
                           COALESCE(workspace, "Poznote") as workspace,
                           COALESCE(created, CURRENT_TIMESTAMP) as created
                    FROM folders');
        
        // Drop old table (removes old UNIQUE constraint if it existed)
        $con->exec('DROP TABLE folders');
        
        // Rename new table
        $con->exec('ALTER TABLE folders_new RENAME TO folders');
        
        // Drop any old indexes
        $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace');
        $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace_parent');
        $con->exec('DROP INDEX IF EXISTS sqlite_autoindex_folders_1');
        
        // Create new partial unique indexes (workspace-scoped + parent-scoped)
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_parent_notnull 
                    ON folders(name, workspace, parent_id) 
                    WHERE parent_id IS NOT NULL');
        
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_root 
                    ON folders(name, workspace) 
                    WHERE parent_id IS NULL');
        
        $con->exec('COMMIT');
        $con->exec('PRAGMA foreign_keys = ON');
        
        $migrationDetails = 'Added parent_id column for subfolder support';
        if ($oldUniqueConstraint) {
            $migrationDetails .= ' + Fixed UNIQUE constraints to be workspace-scoped';
        }
        
        error_log('MIGRATION: Successfully migrated folders table - ' . $migrationDetails);
        
        return ['success' => true, 'migrated' => true, 'message' => 'Database migrated successfully'];
        
    } catch (Exception $e) {
        if (isset($con)) {
            try {
                $con->exec('ROLLBACK');
                $con->exec('PRAGMA foreign_keys = ON');
            } catch (Exception $rollbackError) {
                // Ignore rollback errors
            }
        }
        error_log('MIGRATION ERROR: ' . $e->getMessage());
        return ['success' => false, 'migrated' => false, 'error' => $e->getMessage()];
    }
}

// If called directly from command line
if (php_sapi_name() === 'cli' && isset($argv[0]) && basename($argv[0]) === 'db_migration.php') {
    if (!isset($argv[1])) {
        echo "Usage: php db_migration.php <path_to_database>\n";
        exit(1);
    }
    
    $dbPath = $argv[1];
    if (!file_exists($dbPath)) {
        echo "Error: Database file not found: $dbPath\n";
        exit(1);
    }
    
    echo "Migrating database: $dbPath\n";
    $result = migrateDatabase($dbPath);
    
    if ($result['success']) {
        echo "✓ " . $result['message'] . "\n";
        exit(0);
    } else {
        echo "✗ Migration failed: " . $result['error'] . "\n";
        exit(1);
    }
}
?>
