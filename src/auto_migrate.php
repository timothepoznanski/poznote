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
 * - Cleans up old directories
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
        
        // Create users table (schema must match db_master.php)
        $masterCon->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
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
        
        // Shared links registry (for public routing)
        $masterCon->exec("
            CREATE TABLE IF NOT EXISTS shared_links (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                target_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // Create indexes
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)");
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token)");
        $masterCon->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id)");
        
        // Create default admin user (username 'admin' lowercase for consistency)
        $stmt = $masterCon->prepare("
            INSERT INTO users (id, username, is_admin, active)
            VALUES (1, ?, 1, 1)
        ");
        $stmt->execute(['admin']);
        
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
        
        // Step 3: Move database (including WAL/SHM files if present for data integrity)
        $newDbPath = $user1Dir . '/database/poznote.db';
        if (!file_exists($newDbPath)) {
            // First, handle WAL and SHM files to ensure data integrity
            // These files contain uncommitted transactions and must be moved together
            $walFile = $oldDbPath . '-wal';
            $shmFile = $oldDbPath . '-shm';
            $newWalFile = $newDbPath . '-wal';
            $newShmFile = $newDbPath . '-shm';
            
            // Move WAL file if exists (contains pending transactions)
            if (file_exists($walFile)) {
                if (!rename($walFile, $newWalFile)) {
                    if (copy($walFile, $newWalFile)) {
                        // Verify copy before deleting
                        if (filesize($newWalFile) === filesize($walFile)) {
                            unlink($walFile);
                        }
                    }
                }
                error_log("Poznote: Moved WAL file");
            }
            
            // Move SHM file if exists (shared memory map)
            if (file_exists($shmFile)) {
                if (!rename($shmFile, $newShmFile)) {
                    if (copy($shmFile, $newShmFile)) {
                        // Verify copy before deleting
                        if (filesize($newShmFile) === filesize($shmFile)) {
                            unlink($shmFile);
                        }
                    }
                }
                error_log("Poznote: Moved SHM file");
            }
            
            // Move main database file with safety checks
            $originalSize = filesize($oldDbPath);
            if (!rename($oldDbPath, $newDbPath)) {
                // Try copy instead, but verify before deleting
                if (copy($oldDbPath, $newDbPath)) {
                    // Verify the copy was successful by checking file sizes
                    clearstatcache(true, $newDbPath);
                    $copiedSize = filesize($newDbPath);
                    if ($copiedSize === $originalSize && $copiedSize > 0) {
                        unlink($oldDbPath);
                    } else {
                        error_log("Poznote: WARNING - Database copy verification failed (original: $originalSize, copy: $copiedSize), keeping original");
                        // Remove the incomplete copy
                        if (file_exists($newDbPath)) {
                            unlink($newDbPath);
                        }
                        throw new Exception("Database copy verification failed");
                    }
                } else {
                    throw new Exception("Failed to copy database file");
                }
            }
            error_log("Poznote: Moved database to user directory");
        }
        
        // Step 4: Move entries
        $oldEntriesPath = $dataDir . '/entries';
        $newEntriesPath = $user1Dir . '/entries';
        $entriesMoved = 0;
        if (is_dir($oldEntriesPath)) {
            $files = glob($oldEntriesPath . '/*.{html,md}', GLOB_BRACE);
            foreach ($files as $file) {
                $newPath = $newEntriesPath . '/' . basename($file);
                if (!file_exists($newPath)) {
                    if (rename($file, $newPath)) {
                        $entriesMoved++;
                    }
                }
            }
            error_log("Poznote: Moved $entriesMoved entry files");
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
        $backupsMoved = 0;
        if (is_dir($oldBackupsPath)) {
            $backups = glob($oldBackupsPath . '/*');
            foreach ($backups as $backup) {
                $newPath = $newBackupsPath . '/' . basename($backup);
                if (!file_exists($newPath)) {
                    if (rename($backup, $newPath)) {
                        $backupsMoved++;
                    }
                }
            }
            error_log("Poznote: Moved $backupsMoved backup files");
        }
        
        // Step 8: Migrate shared links to master registry
        // This allows public links created in single-user mode to keep working
        try {
            $user1Db = new PDO('sqlite:' . $newDbPath);
            
            // Check for shared notes
            $stmt = $user1Db->query("SELECT token, note_id FROM shared_notes");
            if ($stmt) {
                $sharedNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $registryStmt = $masterCon->prepare("INSERT OR IGNORE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, 1, 'note', ?)");
                foreach ($sharedNotes as $row) {
                    $registryStmt->execute([$row['token'], $row['note_id']]);
                }
                error_log("Poznote: Migrated " . count($sharedNotes) . " shared note links to registry");
            }
            
            // Check for shared folders
            $stmt = $user1Db->query("SELECT token, folder_id FROM shared_folders");
            if ($stmt) {
                $sharedFolders = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $registryStmt = $masterCon->prepare("INSERT OR IGNORE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, 1, 'folder', ?)");
                foreach ($sharedFolders as $row) {
                    $registryStmt->execute([$row['token'], $row['folder_id']]);
                }
                error_log("Poznote: Migrated " . count($sharedFolders) . " shared folder links to registry");
            }
            
            $user1Db = null;
        } catch (Exception $e) {
            error_log("Poznote: Shared links migration skipped or failed: " . $e->getMessage());
        }
        
        // Step 9: Invalidate old "remember me" cookies by recording migration timestamp
        // This forces users to re-login and select their profile
        $masterCon->exec("INSERT OR REPLACE INTO global_settings (key, value) VALUES ('migration_timestamp', '" . time() . "')");
        
        error_log("Poznote: Migration complete!");
        
    } catch (Exception $e) {
        error_log("Poznote: Migration failed: " . $e->getMessage());
        // Don't throw - allow app to continue, user can manually fix
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

/**
 * Clean up old single-user directories after successful migration
 * Only removes directories that are completely empty
 */
function cleanupOldDirectories(string $dataDir): void {
    $oldDirs = [
        $dataDir . '/database',
        $dataDir . '/entries', 
        $dataDir . '/attachments',
        $dataDir . '/backups'
    ];
    
    foreach ($oldDirs as $dir) {
        if (is_dir($dir)) {
            // Recursively remove empty subdirectories first
            removeEmptySubdirectories($dir);
            
            // Then try to remove the main directory if empty
            if (isDirectoryEmpty($dir)) {
                if (@rmdir($dir)) {
                    error_log("Poznote: Cleaned up empty directory: " . basename($dir));
                }
            } else {
                error_log("Poznote: Directory not empty after migration, keeping: " . basename($dir));
            }
        }
    }
}

/**
 * Recursively remove empty subdirectories
 */
function removeEmptySubdirectories(string $dir): void {
    if (!is_dir($dir)) {
        return;
    }
    
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        
        $path = $dir . '/' . $item;
        if (is_dir($path)) {
            // Recurse first
            removeEmptySubdirectories($path);
            // Then try to remove if empty
            if (isDirectoryEmpty($path)) {
                @rmdir($path);
            }
        }
    }
}

/**
 * Check if a directory is empty (no files or subdirectories)
 */
function isDirectoryEmpty(string $dir): bool {
    if (!is_dir($dir)) {
        return true;
    }
    
    $iterator = new FilesystemIterator($dir);
    return !$iterator->valid();
}

// Run migration check
checkAndMigrateToMultiUser();
