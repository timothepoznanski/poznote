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
    
    // Check if old database exists
    // If it doesn't, this is either a fresh install or migration is already complete
    if (!file_exists($oldDbPath)) {
        // If master database exists, clean up any remaining old directories
        if (file_exists($masterDbPath)) {
            renameOldDirectories($dataDir);
        }
        return;
    }
    
    // Determine if we need to migrate data
    // Migration is needed if:
    // 1. User 1's database doesn't exist, OR
    // 2. User 1's database is much smaller than the old one (incomplete previous migration)
    $needsDataMigration = false;
    
    if (!file_exists($user1DbPath)) {
        $needsDataMigration = true;
        error_log("Poznote: User 1 database doesn't exist, migration needed");
    } else {
        // Compare database sizes to detect incomplete migrations
        $oldSize = filesize($oldDbPath);
        $newSize = filesize($user1DbPath);
        
        // If old database is more than 10x larger and substantial (>100KB),
        // the data likely wasn't migrated properly
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
        
        // Create default admin user if not exists
        // Username 'admin_change_me' serves as a security warning to change it
        // Using INSERT OR IGNORE to skip if user already exists from previous incomplete migration
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
        
        // Step 3: Copy database files
        // We copy instead of move to preserve the original until migration is verified
        // WAL (Write-Ahead Log) and SHM (Shared Memory) files contain uncommitted transactions
        // and must be copied together with the main database for data integrity
        $newDbPath = $user1DbPath;
        
        // Remove existing incomplete database if present
        if (file_exists($newDbPath)) {
            error_log("Poznote: Removing incomplete user database for re-migration");
            @unlink($newDbPath);
            @unlink($newDbPath . '-wal');
            @unlink($newDbPath . '-shm');
        }
        
        // Copy SQLite WAL and SHM files to ensure data integrity
        $walFile = $oldDbPath . '-wal';
        $shmFile = $oldDbPath . '-shm';
        $newWalFile = $newDbPath . '-wal';
        $newShmFile = $newDbPath . '-shm';
        
        // Copy WAL file if it exists (contains pending transactions)
        if (file_exists($walFile)) {
            if (copy($walFile, $newWalFile)) {
                error_log("Poznote: Copied WAL file");
            }
        }
        
        // Copy SHM file if it exists (shared memory index for WAL)
        if (file_exists($shmFile)) {
            if (copy($shmFile, $newShmFile)) {
                error_log("Poznote: Copied SHM file");
            }
        }
        
        // Copy main database file with verification
        $originalSize = filesize($oldDbPath);
        if (copy($oldDbPath, $newDbPath)) {
            // Verify the copy by comparing file sizes
            // clearstatcache ensures we get fresh file info, not cached data
            clearstatcache(true, $newDbPath);
            $copiedSize = filesize($newDbPath);
            
            if ($copiedSize === $originalSize && $copiedSize > 0) {
                error_log("Poznote: Copied database to user directory ($copiedSize bytes)");
            } else {
                error_log("Poznote: WARNING - Database copy verification failed (original: $originalSize, copy: $copiedSize)");
                // Remove the incomplete copy to avoid data corruption
                @unlink($newDbPath);
                throw new Exception("Database copy verification failed");
            }
        } else {
            throw new Exception("Failed to copy database file");
        }
        
        // Step 4: Copy note entry files
        // Each note's content is stored as a separate HTML file
        $oldEntriesPath = $dataDir . '/entries';
        $newEntriesPath = $user1Dir . '/entries';
        $entriesCopied = 0;
        $entriesSkipped = 0;
        $entriesFailed = 0;
        
        if (is_dir($oldEntriesPath)) {
            $items = scandir($oldEntriesPath);
            $totalItems = count($items) - 2; // Exclude '.' and '..'
            error_log("Poznote: Found $totalItems items in old entries directory");
            
            foreach ($items as $item) {
                // Skip directory navigation entries
                if ($item === '.' || $item === '..') {
                    continue;
                }
                
                $file = $oldEntriesPath . '/' . $item;
                
                // Only copy files, not subdirectories
                if (is_file($file)) {
                    $newPath = $newEntriesPath . '/' . $item;
                    
                    if (!file_exists($newPath)) {
                        if (copy($file, $newPath)) {
                            $entriesCopied++;
                        } else {
                            $entriesFailed++;
                            // Log only first 5 failures to avoid log spam
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
        
        // Step 5: Move attachment files
        // Attachments are files uploaded by users (images, PDFs, etc.)
        $oldAttachmentsPath = $dataDir . '/attachments';
        $newAttachmentsPath = $user1Dir . '/attachments';
        if (is_dir($oldAttachmentsPath)) {
            moveDirectoryContents($oldAttachmentsPath, $newAttachmentsPath);
            error_log("Poznote: Moved attachments");
        }
        
        // Step 6: Move backups to user directory
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
        
        // Step 7: Migrate shared links to master registry
        // This preserves public sharing links that were created in single-user mode
        // so they continue working after the migration
        try {
            $user1Db = new PDO('sqlite:' . $newDbPath);
            $user1Db->exec('PRAGMA busy_timeout = 5000');
            
            // Migrate shared notes to the central registry
            $stmt = $user1Db->query("SELECT token, note_id FROM shared_notes");
            if ($stmt) {
                $sharedNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $registryStmt = $masterCon->prepare("INSERT OR IGNORE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, 1, 'note', ?)");
                foreach ($sharedNotes as $row) {
                    $registryStmt->execute([$row['token'], $row['note_id']]);
                }
                error_log("Poznote: Migrated " . count($sharedNotes) . " shared note links to registry");
            }
            
            // Migrate shared folders to the central registry
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
        
        // Step 8: Invalidate old "remember me" cookies
        // Record migration timestamp to force users to re-login and select their profile
        // This ensures proper multi-user session handling
        $masterCon->exec("INSERT OR REPLACE INTO global_settings (key, value) VALUES ('migration_timestamp', '" . time() . "')");
        
        // Step 9: Fix file permissions
        // Ensure the web server (www-data) can read and write to all migrated files
        fixMigratedPermissions($user1Dir);
        
        error_log("Poznote: Migration complete!");
        
        // Step 10: Archive old directories
        // Rename old single-user directories to .old for backup purposes
        renameOldDirectories($dataDir);
        
    } catch (Exception $e) {
        error_log("Poznote: Migration failed: " . $e->getMessage());
        // Don't throw - allow app to continue, user can manually fix
    }
}

/**
 * Fix permissions for migrated files
 * 
 * Changes ownership of all migrated files to www-data user/group
 * This ensures the web server can properly read and write to these files
 * 
 * @param string $userDir Path to the user directory to fix permissions for
 */
function fixMigratedPermissions(string $userDir): void {
    // Get www-data user information from the system
    // www-data is the default web server user on Debian/Ubuntu systems
    $wwwDataInfo = posix_getpwnam('www-data');
    if (!$wwwDataInfo) {
        error_log("Poznote: Could not find www-data user, skipping permission fix");
        return;
    }
    
    $uid = $wwwDataInfo['uid']; // User ID
    $gid = $wwwDataInfo['gid']; // Group ID
    
    // Recursively iterate through all files and directories
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($userDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    $fixedCount = 0;
    foreach ($iterator as $item) {
        $path = $item->getPathname();
        $stat = stat($path);
        
        // Only change ownership if not already owned by www-data
        // This prevents unnecessary system calls
        if ($stat && $stat['uid'] !== $uid) {
            @chown($path, $uid);  // Change owner to www-data
            @chgrp($path, $gid);  // Change group to www-data
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
 * 
 * Moves all files and subdirectories from source to destination
 * Only moves files that don't already exist at the destination
 * 
 * @param string $src Source directory path
 * @param string $dest Destination directory path
 */
function moveDirectoryContents(string $src, string $dest): void {
    if (!is_dir($src)) {
        return;
    }
    
    // Create destination directory if it doesn't exist
    if (!is_dir($dest)) {
        mkdir($dest, 0755, true);
    }
    
    // Iterate through all files and subdirectories
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($src, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($iterator as $item) {
        $destPath = $dest . '/' . $iterator->getSubPathName();
        
        if ($item->isDir()) {
            // Create subdirectory in destination
            if (!is_dir($destPath)) {
                mkdir($destPath, 0755, true);
            }
        } else {
            // Move file only if it doesn't already exist at destination
            if (!file_exists($destPath)) {
                rename($item->getPathname(), $destPath);
            }
        }
    }
}

/**
 * Rename old single-user directories to .old after migration
 * 
 * This preserves the original data for safety instead of deleting it
 * Allows manual recovery if something goes wrong with the migration
 * 
 * @param string $dataDir Path to the data directory containing old directories
 */
function renameOldDirectories(string $dataDir): void {
    $oldDirs = ['database', 'entries', 'attachments', 'backups'];
    
    foreach ($oldDirs as $dirName) {
        $oldPath = $dataDir . '/' . $dirName;
        $newPath = $dataDir . '/' . $dirName . '.old';
        
        if (is_dir($oldPath)) {
            if (!file_exists($newPath)) {
                // Rename the directory to .old for backup
                if (@rename($oldPath, $newPath)) {
                    error_log("Poznote: Renamed old directory $dirName to $dirName.old");
                } else {
                    error_log("Poznote: Failed to rename old directory $dirName");
                }
            } else {
                // If .old already exists, this might be from a previous failed migration
                // We keep both for safety and manual inspection
                error_log("Poznote: Directory $dirName.old already exists, skipping rename of $dirName");
            }
        }
    }
}

// Run migration check
checkAndMigrateToMultiUser();

/**
 * Run versioned data migrations
 * This system allows running one-time migrations on the database
 */
function runDataMigrations(): void {
    // Skip if we're not connected to a database yet
    if (!isset($GLOBALS['con']) || !$GLOBALS['con']) {
        return;
    }
    
    $con = $GLOBALS['con'];
    
    try {
        // Create migrations table if it doesn't exist
        $con->exec("
            CREATE TABLE IF NOT EXISTS _migrations (
                version TEXT PRIMARY KEY,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                description TEXT
            )
        ");
        
        // Define all migrations
        $migrations = [
            '2026_02_base64_to_attachments' => [
                'description' => 'Convert base64 images in HTML notes to attachments',
                'function' => 'migrateBase64ImagesToAttachments'
            ]
        ];
        
        // Run each migration if not already executed
        foreach ($migrations as $version => $migration) {
            $stmt = $con->prepare("SELECT version FROM _migrations WHERE version = ?");
            $stmt->execute([$version]);
            
            if (!$stmt->fetch()) {
                error_log("Poznote: Running migration: {$migration['description']}");
                
                // Execute migration function
                if (function_exists($migration['function'])) {
                    call_user_func($migration['function'], $con);
                    
                    // Mark as executed
                    $stmt = $con->prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)");
                    $stmt->execute([$version, $migration['description']]);
                    
                    error_log("Poznote: Migration {$version} completed successfully");
                } else {
                    error_log("Poznote: Migration function {$migration['function']} not found");
                }
            }
        }
    } catch (Exception $e) {
        error_log("Poznote: Error running migrations: " . $e->getMessage());
    }
}

/**
 * Migration: Convert base64 images in HTML notes to attachments
 * This improves performance and reduces database size
 */
function migrateBase64ImagesToAttachments($con): void {
    try {
        require_once __DIR__ . '/functions.php';
        
        // Get all HTML notes (type='note' or type is NULL/empty)
        $stmt = $con->prepare("
            SELECT id, entry, attachments 
            FROM entries 
            WHERE (type = 'note' OR type IS NULL OR type = '') 
            AND trash = 0
        ");
        $stmt->execute();
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $totalConverted = 0;
        $notesProcessed = 0;
        
        foreach ($notes as $note) {
            $noteId = $note['id'];
            $content = $note['entry'] ?? '';
            
            // Skip if no base64 images found
            if (stripos($content, 'data:image/') === false) {
                continue;
            }
            
            // Get existing attachments
            $existingAttachments = !empty($note['attachments']) ? json_decode($note['attachments'], true) : [];
            if (!is_array($existingAttachments)) {
                $existingAttachments = [];
            }
            
            $newAttachments = [];
            $attachmentsPath = getAttachmentsPath();
            
            // Pattern 1: src before alt
            $content = preg_replace_callback(
                '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
                function($matches) use ($noteId, $attachmentsPath, &$newAttachments, &$totalConverted) {
                    return convertBase64ImageToAttachment($matches[1], $matches[2], $matches[3] ?? '', $noteId, $attachmentsPath, $newAttachments, $totalConverted);
                },
                $content
            );
            
            // Pattern 2: alt before src
            $content = preg_replace_callback(
                '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
                function($matches) use ($noteId, $attachmentsPath, &$newAttachments, &$totalConverted) {
                    return convertBase64ImageToAttachment($matches[2], $matches[3], $matches[1], $noteId, $attachmentsPath, $newAttachments, $totalConverted);
                },
                $content
            );
            
            // If images were converted, update the note
            if (!empty($newAttachments)) {
                $updatedAttachments = array_merge($existingAttachments, $newAttachments);
                $attachmentsJson = json_encode($updatedAttachments);
                
                // Read current content from file and update it
                $filename = getEntryFilename($noteId, 'note');
                if (file_exists($filename)) {
                    file_put_contents($filename, $content);
                }
                
                // Update database
                $updateStmt = $con->prepare("UPDATE entries SET entry = ?, attachments = ? WHERE id = ?");
                $updateStmt->execute([$content, $attachmentsJson, $noteId]);
                
                $notesProcessed++;
            }
        }
        
        if ($totalConverted > 0) {
            error_log("Poznote: Converted {$totalConverted} base64 images in {$notesProcessed} notes to attachments");
        }
    } catch (Exception $e) {
        error_log("Poznote: Error in base64 to attachments migration: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Helper function to convert a single base64 image to attachment
 */
function convertBase64ImageToAttachment($imageType, $base64Data, $altText, $noteId, $attachmentsPath, &$newAttachments, &$totalConverted) {
    $imageType = strtolower($imageType);
    
    $extensionMap = [
        'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
        'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
    ];
    $extension = $extensionMap[$imageType] ?? 'png';
    $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
    
    $imageData = base64_decode($base64Data);
    if ($imageData === false) {
        // Return original if decode fails
        return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
    }
    
    $attachmentId = uniqid();
    $filename = $attachmentId . '_' . time() . '.' . $extension;
    $filePath = $attachmentsPath . '/' . $filename;
    
    // Ensure attachments directory exists
    if (!is_dir($attachmentsPath)) {
        mkdir($attachmentsPath, 0755, true);
    }
    
    if (file_put_contents($filePath, $imageData) === false) {
        // Return original if write fails
        return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
    }
    chmod($filePath, 0644);
    
    $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
    $newAttachments[] = [
        'id' => $attachmentId,
        'filename' => $filename,
        'original_filename' => $originalFilename,
        'file_size' => strlen($imageData),
        'file_type' => $mimeType,
        'uploaded_at' => date('Y-m-d H:i:s')
    ];
    
    $totalConverted++;
    
    return '<img src="/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '" loading="lazy" decoding="async">';
}

// Note: Data migrations are run from db_connect.php after database connection is established
