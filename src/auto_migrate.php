<?php
/**
 * Automatic Migration to Multi-User Mode
 * 
 * This file is included at startup to automatically migrate
 * existing single-user installations to the multi-user structure.
 * 
 * The migration is transparent:
 * - Creates master.db with a default user profile
 * - Moves existing data to user 1's directory
 * - Happens only once, automatically
 */

require_once __DIR__ . '/config.php';

/**
 * Check if migration is needed and perform it automatically
 * Returns the user ID to use (1 if migrated or single profile)
 */
function checkAndMigrateToMultiUser(): void {
    $dataDir = dirname(__DIR__) . '/data';
    $masterDbPath = $dataDir . '/master.db';
    $oldDbPath = $dataDir . '/database/poznote.db';
    $usersDir = $dataDir . '/users';
    $user1Dir = $usersDir . '/1';
    
    // If master.db exists, migration already done
    if (file_exists($masterDbPath)) {
        return;
    }
    
    // If no old database exists either, this is a fresh install
    // The master database will be created on first access
    if (!file_exists($oldDbPath)) {
        return;
    }
    
    // Migration needed: old database exists but no master.db
    error_log("Poznote: Auto-migrating to multi-user structure...");
    
    try {
        // Step 1: Create master database
        $masterCon = new PDO('sqlite:' . $masterDbPath);
        $masterCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Create users table
        $masterCon->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT,
                color TEXT DEFAULT '#007DB8',
                icon TEXT DEFAULT 'user',
                active INTEGER DEFAULT 1,
                is_admin INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )
        ");
        
        // Create global_settings table
        $masterCon->exec("
            CREATE TABLE IF NOT EXISTS global_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ");
        
        // Create indexes
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)");
        
        // Create default admin user
        $stmt = $masterCon->prepare("
            INSERT INTO users (id, username, display_name, is_admin, active)
            VALUES (1, ?, ?, 1, 1)
        ");
        $stmt->execute(['Admin', 'Administrateur']);
        
        error_log("Poznote: Created master database with default user profile");
        
        // Step 2: Create user directory structure
        $dirsToCreate = [
            $usersDir,
            $user1Dir,
            $user1Dir . '/database',
            $user1Dir . '/entries',
            $user1Dir . '/attachments',
            $user1Dir . '/backups'
        ];
        
        foreach ($dirsToCreate as $dir) {
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
        }
        
        // Step 3: Move database
        $newDbPath = $user1Dir . '/database/poznote.db';
        if (!file_exists($newDbPath)) {
            if (!rename($oldDbPath, $newDbPath)) {
                // Try copy instead
                copy($oldDbPath, $newDbPath);
                unlink($oldDbPath);
            }
            error_log("Poznote: Moved database to user directory");
        }
        
        // Step 4: Move entries
        $oldEntriesPath = $dataDir . '/entries';
        $newEntriesPath = $user1Dir . '/entries';
        if (is_dir($oldEntriesPath)) {
            $files = glob($oldEntriesPath . '/*.{html,md}', GLOB_BRACE);
            foreach ($files as $file) {
                $newPath = $newEntriesPath . '/' . basename($file);
                if (!file_exists($newPath)) {
                    rename($file, $newPath);
                }
            }
            error_log("Poznote: Moved " . count($files) . " entry files");
        }
        
        // Step 5: Move attachments
        $oldAttachmentsPath = $dataDir . '/attachments';
        $newAttachmentsPath = $user1Dir . '/attachments';
        if (is_dir($oldAttachmentsPath)) {
            moveDirectoryContents($oldAttachmentsPath, $newAttachmentsPath);
            error_log("Poznote: Moved attachments");
        }
        
        // Step 6: Move backups
        $oldBackupsPath = $dataDir . '/backups';
        $newBackupsPath = $user1Dir . '/backups';
        if (is_dir($oldBackupsPath)) {
            $backups = glob($oldBackupsPath . '/*');
            foreach ($backups as $backup) {
                $newPath = $newBackupsPath . '/' . basename($backup);
                if (!file_exists($newPath)) {
                    rename($backup, $newPath);
                }
            }
            error_log("Poznote: Moved " . count($backups) . " backup files");
        }
        
        error_log("Poznote: Migration complete!");
        
    } catch (Exception $e) {
        error_log("Poznote: Migration failed: " . $e->getMessage());
    }
}

/**
 * Move contents of a directory recursively
 */
function moveDirectoryContents(string $src, string $dest): void {
    if (!is_dir($src)) {
        return;
    }
    
    if (!is_dir($dest)) {
        mkdir($dest, 0755, true);
    }
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($src, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($iterator as $item) {
        $destPath = $dest . '/' . $iterator->getSubPathName();
        if ($item->isDir()) {
            if (!is_dir($destPath)) {
                mkdir($destPath, 0755, true);
            }
        } else {
            if (!file_exists($destPath)) {
                rename($item->getPathname(), $destPath);
            }
        }
    }
}

// Run migration check
checkAndMigrateToMultiUser();
