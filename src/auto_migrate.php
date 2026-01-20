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
    $dataDir = __DIR__ . '/data';
    $masterDbPath = $dataDir . '/master.db';
    $oldDbPath = $dataDir . '/database/poznote.db';
    $usersDir = $dataDir . '/users';
    $user1Dir = $usersDir . '/1';
    $user1DbPath = $user1Dir . '/database/poznote.db';
    
    // If no old database exists, this is either a fresh install or migration already complete
    if (!file_exists($oldDbPath)) {
        // Rename old directories to .old
        if (file_exists($masterDbPath)) {
            renameOldDirectories($dataDir);
        }
        return;
    }
    
    // Old database exists - check if we need to migrate data
    // Migration is needed if:
    // 1. User 1's database doesn't exist, OR
    // 2. User 1's database is much smaller than the old one (incomplete migration)
    $needsDataMigration = false;
    
    if (!file_exists($user1DbPath)) {
        $needsDataMigration = true;
        error_log("Poznote: User 1 database doesn't exist, migration needed");
    } else {
        // Check if user 1's database has significantly fewer records
        // This handles the case where master.db was created but data wasn't migrated
        $oldSize = filesize($oldDbPath);
        $newSize = filesize($user1DbPath);
        
        // If old database is more than 10x larger, data wasn't migrated properly
        if ($oldSize > ($newSize * 10) && $oldSize > 100000) {
            $needsDataMigration = true;
            error_log("Poznote: Old database ($oldSize bytes) much larger than user 1 database ($newSize bytes), re-migrating data");
        }
    }
    
    if (!$needsDataMigration) {
        // Rename old directories if they exist
        renameOldDirectories($dataDir);
        return;
    }
    
    // Migration needed: old database has data that wasn't migrated
    error_log("Poznote: Auto-migrating to multi-user structure...");
    
    try {
        // Step 1: Create master database
        $masterCon = new PDO('sqlite:' . $masterDbPath);
        $masterCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $masterCon->exec('PRAGMA busy_timeout = 5000');
        
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
        
        // Create default admin user if not exists (username 'admin_change_me' to warn about security)
        // Using INSERT OR IGNORE in case master.db already exists from a previous incomplete migration
        $stmt = $masterCon->prepare("
            INSERT OR IGNORE INTO users (id, username, is_admin, active)
            VALUES (1, ?, 1, 1)
        ");
        $stmt->execute(['admin_change_me']);
        
        error_log("Poznote: Master database ready with default user profile");
        
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
        
        // Step 3: Copy database (including WAL/SHM files if present for data integrity)
        // We copy instead of move to preserve the original until migration is verified complete
        $newDbPath = $user1DbPath;
        
        // Remove existing incomplete database if present
        if (file_exists($newDbPath)) {
            error_log("Poznote: Removing incomplete user database for re-migration");
            @unlink($newDbPath);
            @unlink($newDbPath . '-wal');
            @unlink($newDbPath . '-shm');
        }
        
        // First, handle WAL and SHM files to ensure data integrity
        // These files contain uncommitted transactions and must be copied together
        $walFile = $oldDbPath . '-wal';
        $shmFile = $oldDbPath . '-shm';
        $newWalFile = $newDbPath . '-wal';
        $newShmFile = $newDbPath . '-shm';
        
        // Copy WAL file if exists (contains pending transactions)
        if (file_exists($walFile)) {
            if (copy($walFile, $newWalFile)) {
                error_log("Poznote: Copied WAL file");
            }
        }
        
        // Copy SHM file if exists (shared memory map)
        if (file_exists($shmFile)) {
            if (copy($shmFile, $newShmFile)) {
                error_log("Poznote: Copied SHM file");
            }
        }
        
        // Copy main database file with safety checks
        $originalSize = filesize($oldDbPath);
        if (copy($oldDbPath, $newDbPath)) {
            // Verify the copy was successful by checking file sizes
            clearstatcache(true, $newDbPath);
            $copiedSize = filesize($newDbPath);
            if ($copiedSize === $originalSize && $copiedSize > 0) {
                error_log("Poznote: Copied database to user directory ($copiedSize bytes)");
            } else {
                error_log("Poznote: WARNING - Database copy verification failed (original: $originalSize, copy: $copiedSize)");
                // Remove the incomplete copy
                @unlink($newDbPath);
                throw new Exception("Database copy verification failed");
            }
        } else {
            throw new Exception("Failed to copy database file");
        }
        
        // Step 4: Copy entries files
        $oldEntriesPath = $dataDir . '/entries';
        $newEntriesPath = $user1Dir . '/entries';
        $entriesCopied = 0;
        $entriesSkipped = 0;
        $entriesFailed = 0;
        if (is_dir($oldEntriesPath)) {
            // Use scandir to get all files
            $items = scandir($oldEntriesPath);
            $totalItems = count($items) - 2; // Exclude . and ..
            error_log("Poznote: Found $totalItems items in old entries directory");
            
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') {
                    continue;
                }
                $file = $oldEntriesPath . '/' . $item;
                // Only copy files, not directories
                if (is_file($file)) {
                    $newPath = $newEntriesPath . '/' . $item;
                    if (!file_exists($newPath)) {
                        if (copy($file, $newPath)) {
                            $entriesCopied++;
                        } else {
                            $entriesFailed++;
                            if ($entriesFailed <= 5) {
                                error_log("Poznote: Failed to copy entry file: $item");
                            }
                        }
                    } else {
                        $entriesSkipped++;
                    }
                }
            }
            error_log("Poznote: Entries migration - copied: $entriesCopied, skipped: $entriesSkipped, failed: $entriesFailed");
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
            $user1Db->exec('PRAGMA busy_timeout = 5000');
            
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
        
        // Step 10: Fix permissions for migrated files
        // Ensure www-data can write to the migrated files
        fixMigratedPermissions($user1Dir);
        
        error_log("Poznote: Migration complete!");
        
        // Step 11: Rename old directories to .old
        renameOldDirectories($dataDir);
        
    } catch (Exception $e) {
        error_log("Poznote: Migration failed: " . $e->getMessage());
        // Don't throw - allow app to continue, user can manually fix
    }
}

/**
 * Fix permissions for migrated files
 * Ensures www-data can write to the files
 */
function fixMigratedPermissions(string $userDir): void {
    // Get www-data user info
    $wwwDataInfo = posix_getpwnam('www-data');
    if (!$wwwDataInfo) {
        error_log("Poznote: Could not find www-data user, skipping permission fix");
        return;
    }
    
    $uid = $wwwDataInfo['uid'];
    $gid = $wwwDataInfo['gid'];
    
    // Recursively fix permissions
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($userDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    $fixedCount = 0;
    foreach ($iterator as $item) {
        $path = $item->getPathname();
        // Only fix if not already owned by www-data
        $stat = stat($path);
        if ($stat && $stat['uid'] !== $uid) {
            @chown($path, $uid);
            @chgrp($path, $gid);
            $fixedCount++;
        }
    }
    
    // Also fix the user directory itself
    @chown($userDir, $uid);
    @chgrp($userDir, $gid);
    
    if ($fixedCount > 0) {
        error_log("Poznote: Fixed permissions for $fixedCount files");
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
 * Rename old single-user directories to .old after migration
 * This preserves old data instead of deleting it
 */
function renameOldDirectories(string $dataDir): void {
    $oldDirs = ['database', 'entries', 'attachments', 'backups'];
    
    foreach ($oldDirs as $dirName) {
        $oldPath = $dataDir . '/' . $dirName;
        $newPath = $dataDir . '/' . $dirName . '.old';
        
        if (is_dir($oldPath)) {
            // Case-insensitive check if it's already renamed or if migration was already done
            if (!file_exists($newPath)) {
                if (@rename($oldPath, $newPath)) {
                    error_log("Poznote: Renamed old directory $dirName to $dirName.old");
                } else {
                    error_log("Poznote: Failed to rename old directory $dirName");
                }
            } else {
                // If .old already exists but the original still exists, it might be a failed previous attempt
                // or some files were left behind. We could try to merge or just leave it.
                // For safety, we just log it.
                error_log("Poznote: Directory $dirName.old already exists, skipping rename of $dirName");
            }
        }
    }
}

// Run migration check
checkAndMigrateToMultiUser();
