<?php
/**
 * Restoring a full backup archive back into the database and the data directory.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * Report restore progress to an optional observer.
 *
 * The background restore worker (workers/job-runner.php) registers a
 * callable in $GLOBALS['poznote_restore_progress_hook'] to surface the
 * pipeline's milestones to the browser's progress bar; the synchronous
 * flows leave it unset and this is a no-op. The observer must never be
 * able to break a restore, so its failures are swallowed.
 *
 * @param string $stage One of extracting, preparing, database, notes,
 *        attachments
 * @param int|null $done Items processed so far in this stage, when the
 *        stage has countable items
 * @param int|null $total Total items of this stage
 */
function poznoteRestoreReportProgress(string $stage, ?int $done = null, ?int $total = null): void {
    $hook = $GLOBALS['poznote_restore_progress_hook'] ?? null;
    if (is_callable($hook)) {
        try {
            $hook($stage, $done, $total);
        } catch (Throwable $e) {
            // observer only
            error_log('functions: poznoteRestoreReportProgress() failed: ' . $e->getMessage());
        }
    }
}

/**
 * Restore a complete backup from ZIP file
 * Handles database, notes, and attachments restoration
 */
function restoreCompleteBackup($uploadedFile, $isLocalFile = false) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_complete_restore_' . uniqid() . '.zip';
    $tempExtractDir = null;
    
    try {
        // Move/copy uploaded file
        if ($isLocalFile) {
            // For locally created files
            if (!copy($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error copying local file'];
            }
        } else {
            // For HTTP uploaded files
            if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error uploading file'];
            }
        }
        
        // Extract ZIP to temporary directory
        $tempExtractDir = '/tmp/poznote_restore_' . uniqid();
        if (!createDirectoryWithPermissions($tempExtractDir)) {
            unlink($tempFile);
            return ['success' => false, 'error' => 'Cannot create temporary directory'];
        }
        
        // Ensure required data directories exist
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/../users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            if (!$dataManager->userDirectoriesExist()) {
                $dataManager->initializeUserDirectories();
            }
        } else {
            // Fallback for non-user mode (old structure compatibility)
            $dataDir = __DIR__ . '/../data';
            $requiredDirs = ['attachments', 'database', 'entries'];
            foreach ($requiredDirs as $dir) {
                $fullPath = $dataDir . '/' . $dir;
                if (!is_dir($fullPath)) {
                    mkdir($fullPath, 0755, true);
                    if (function_exists('posix_getuid') && posix_getuid() === 0) {
                        $current_uid = posix_getuid();
                        $current_gid = posix_getgid();
                        chown($fullPath, $current_uid);
                        chgrp($fullPath, $current_gid);
                    }
                }
            }
        }
        
        $zip = new ZipArchive;
        $res = $zip->open($tempFile);
        
        if ($res !== TRUE) {
            unlink($tempFile);
            rmdir($tempExtractDir);
            return ['success' => false, 'error' => 'Cannot open ZIP file'];
        }
        
        poznoteRestoreReportProgress('extracting');
        // A failed extraction (a full disk mid-way is the realistic case)
        // must not fall through to the wipe-and-restore below with only some
        // of the files on disk: the SQL dump is validated and executed, then
        // notes/attachments whose files never extracted would be silently
        // missing. Refuse before touching any existing data.
        if (!$zip->extractTo($tempExtractDir)) {
            $zip->close();
            unlink($tempFile);
            deleteDirectory($tempExtractDir);
            return ['success' => false, 'error' => 'Cannot extract the ZIP file (the server may be out of disk space). Nothing was restored.'];
        }
        $zip->close();
        unlink($tempFile);
        $tempFile = null; // Mark as cleaned

        // VALIDATE BACKUP CONTENT BEFORE ANY DESTRUCTIVE OPERATION
        // A complete backup must contain the SQL dump; refuse anything else
        // so a wrong ZIP never wipes existing data.
        $sqlFile = $tempExtractDir . '/database/poznote_backup.sql';
        if (!file_exists($sqlFile)) {
            deleteDirectory($tempExtractDir);
            $tempExtractDir = null;
            return [
                'success' => false,
                'error' => 'Invalid backup file: database/poznote_backup.sql not found in ZIP. Nothing was restored.',
                'message' => ''
            ];
        }

        // The dump is executed as SQL later on, so it must contain nothing
        // but the statements a Poznote backup is made of. Checked before the
        // wipe: a refused dump must leave the existing data untouched.
        require_once __DIR__ . '/../backup_sql_restore.php';
        $parsedDump = poznoteValidateBackupSqlFile($sqlFile);
        if (!$parsedDump['success']) {
            deleteDirectory($tempExtractDir);
            $tempExtractDir = null;
            return [
                'success' => false,
                'error' => 'Invalid backup file: database/poznote_backup.sql is not a Poznote database dump (' . $parsedDump['error'] . '). Nothing was restored.',
                'message' => ''
            ];
        }
        unset($parsedDump);

        // A backup made with the lighter-zip option references attachments in
        // its metadata but does not carry all of the files (none of them in
        // pure S3 mode, only the not-yet-migrated ones in a partially
        // migrated state). Restoring it while S3 storage is active would
        // purge the bucket below and lose every file the zip does not carry,
        // so refuse before wiping anything unless the zip has a file for
        // EVERY attachment its metadata references. Checking for "at least
        // one file" is not enough: one unmigrated file in the zip would let
        // the purge destroy all the migrated ones.
        // Mirrors the purge condition below: it only guards against wiping
        // the bucket, so it must not block restores that never purge.
        if (poznoteAttachmentsAreRemote()) {
            $backupAttachmentsDir = $tempExtractDir . '/attachments';
            $backupMetadataFile = $backupAttachmentsDir . '/poznote_attachments_metadata.json';
            if (file_exists($backupMetadataFile)) {
                $backupMetadata = json_decode((string)file_get_contents($backupMetadataFile), true);
                if (is_array($backupMetadata) && count($backupMetadata) > 0) {
                    // Files present in the zip, addressable the two ways
                    // restoreAttachmentsFromDir() resolves them: by attachment
                    // id ({id}.{ext}, complete-backup naming) or by storage
                    // filename (attachments-export naming, rebuilt archives)
                    $presentBasenames = [];
                    $presentIds = [];
                    $backupFiles = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($backupAttachmentsDir, RecursiveDirectoryIterator::SKIP_DOTS)
                    );
                    foreach ($backupFiles as $backupFile) {
                        if ($backupFile->isFile() && $backupFile->getFilename() !== 'poznote_attachments_metadata.json') {
                            $presentBasenames[$backupFile->getFilename()] = true;
                            $presentIds[pathinfo($backupFile->getFilename(), PATHINFO_FILENAME)] = true;
                        }
                    }

                    $referencedCount = 0;
                    $missingCount = 0;
                    foreach ($backupMetadata as $metadataItem) {
                        $attachmentId = (string)($metadataItem['attachment_data']['id'] ?? '');
                        $attachmentFilename = (string)($metadataItem['attachment_data']['filename'] ?? '');
                        if ($attachmentId === '' && $attachmentFilename === '') {
                            continue;
                        }
                        $referencedCount++;
                        if (($attachmentId !== '' && isset($presentIds[$attachmentId]))
                            || ($attachmentFilename !== '' && isset($presentBasenames[$attachmentFilename]))) {
                            continue;
                        }
                        $missingCount++;
                    }

                    if ($missingCount > 0) {
                        deleteDirectory($tempExtractDir);
                        $tempExtractDir = null;
                        return [
                            'success' => false,
                            'error' => 'This backup is missing ' . $missingCount . ' of the ' . $referencedCount . ' attachment file(s) it references (they were stored in S3 when it was created), and restoring it while S3 storage is enabled would remove every attachment from the bucket. Two options: turn off S3 storage in the settings (keep the credentials), restore this backup, then turn it back on, so attachments still in the bucket keep being served; or add the missing files to the attachments/ folder of the ZIP (the attachments export contains them) and restore the rebuilt zip. Nothing was modified: your notes, your attachments and the bucket content are untouched.',
                            'message' => ''
                        ];
                    }
                }
            }
        }

        // The restore below purges the user's bucket objects and rewrites the
        // archive's attachments through the bucket. Probe it first: wiping
        // the local files while the bucket is unreachable would leave the
        // attachments stored nowhere, with the upload failures only visible
        // in the server logs.
        if (poznoteAttachmentsAreRemote()) {
            try {
                $bucketProbe = AttachmentStorage::makeClient(AttachmentStorage::getConfig())->testConnection();
            } catch (Exception $bucketProbeError) {
                $bucketProbe = ['success' => false, 'error' => $bucketProbeError->getMessage()];
            }
            if (empty($bucketProbe['success'])) {
                deleteDirectory($tempExtractDir);
                $tempExtractDir = null;
                return [
                    'success' => false,
                    'error' => 'The S3 bucket cannot be reached (' . (string)($bucketProbe['error'] ?? 'unknown error') . '). This restore stores the attachments in the bucket, so nothing was restored. Check the S3 storage settings or try again once the bucket is reachable.',
                    'message' => ''
                ];
            }
        }

        // CLEAR ENTRIES DIRECTORY BEFORE RESTORATION
        poznoteRestoreReportProgress('preparing');
        $entriesPath = getEntriesPath();
        if (is_dir($entriesPath)) {
            // Delete all files in entries directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($entriesPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $entriesCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $entriesCleared++;
            }
            error_log("CLEARED $entriesCleared files from entries directory");
        } else {
            // Create entries directory if it doesn't exist
            createDirectoryWithPermissions($entriesPath);
        }
        
        // CLEAR ATTACHMENTS DIRECTORY BEFORE RESTORATION
        $attachmentsPath = getAttachmentsPath();
        if (is_dir($attachmentsPath)) {
            // Delete all files in attachments directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $attachmentsCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $attachmentsCleared++;
            }
            error_log("CLEARED $attachmentsCleared files from attachments directory");
        } else {
            // Create attachments directory if it doesn't exist
            createDirectoryWithPermissions($attachmentsPath);
        }

        // A full restore replaces all attachments, so purge the user's
        // objects from the bucket as well.
        //
        // Deliberately gated on the active mode, NOT on the credentials:
        // the restore rewrites files through storeFile(), which follows the
        // active mode too. Purging on credentials alone would empty the
        // bucket and then rewrite everything to local disk, destroying
        // objects nothing puts back.
        if (poznoteAttachmentsAreRemote()) {
            $remoteCleared = poznoteAttachmentStorage()->deleteAllRemote();
            error_log("CLEARED $remoteCleared attachment objects from S3 bucket");
        }
        
        $results = [];
        $hasErrors = false;
        $databaseRestored = false;
        $skippedAttachments = [];
        
        // Restore database (the SQL file was validated before the wipe)
        poznoteRestoreReportProgress('database');
        $dbResult = restoreDatabaseFromFile($sqlFile, true);
        if ($dbResult['success']) {
            $dbLabel = basename(poznoteGetActiveDatabasePath());
            $dbSummary = '';
            try {
                $statsCon = new PDO('sqlite:' . poznoteGetActiveDatabasePath());
                $statsCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $noteCount = (int)$statsCon->query('SELECT COUNT(*) FROM entries WHERE trash = 0')->fetchColumn();
                $trashCount = (int)$statsCon->query('SELECT COUNT(*) FROM entries WHERE trash != 0')->fetchColumn();
                $folderCount = (int)$statsCon->query('SELECT COUNT(*) FROM folders')->fetchColumn();
                $workspaceCount = (int)$statsCon->query('SELECT COUNT(*) FROM workspaces')->fetchColumn();
                $dbSummary = ' (' . $noteCount . ' note' . ($noteCount === 1 ? '' : 's')
                    . ($trashCount > 0 ? ' + ' . $trashCount . ' in trash' : '')
                    . ', ' . $folderCount . ' folder' . ($folderCount === 1 ? '' : 's')
                    . ', ' . $workspaceCount . ' workspace' . ($workspaceCount === 1 ? '' : 's') . ')';
                $statsCon = null;
            } catch (Throwable $statsError) {
                $dbSummary = '';
            }
            $results[] = 'Database: Restored ' . ($dbLabel !== '' ? $dbLabel : 'successfully') . $dbSummary;
        } else {
            $results[] = 'Database: Failed - ' . $dbResult['error'];
        }
        if (!$dbResult['success']) $hasErrors = true;
        $databaseRestored = $dbResult['success'];
        
        // Restore entries if entries directory exists in backup
        $entriesDir = $tempExtractDir . '/entries';
        if (is_dir($entriesDir)) {
            $entriesResult = restoreEntriesFromDir($entriesDir);
            $results[] = 'Notes: ' . ($entriesResult['success'] ? 'Restored ' . $entriesResult['count'] . ' note files (HTML/Markdown)' : 'Failed - ' . $entriesResult['error']);
            if (!$entriesResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Notes: No entries directory found in backup (entries directory cleared)';
        }
        
        // Restore attachments if attachments directory exists in backup
        $attachmentsDir = $tempExtractDir . '/attachments';
        if (is_dir($attachmentsDir)) {
            $attachmentsResult = restoreAttachmentsFromDir($attachmentsDir);
            if ($attachmentsResult['success']) {
                $skippedAttachments = $attachmentsResult['skipped_files'] ?? [];
                $restoredFilesCount = (int)$attachmentsResult['count'];
                $attachmentUsage = $databaseRestored
                    ? poznoteCountAttachmentUsageInActiveDatabase($attachmentsResult['filenames'] ?? [])
                    : null;
                $attachmentsMessage = 'Restored ' . $restoredFilesCount . ' file' . ($restoredFilesCount === 1 ? '' : 's');
                if (is_array($attachmentUsage)) {
                    $usageParts = [];
                    $usageParts[] = $attachmentUsage['attached'] . ' attached to notes';
                    if ($attachmentUsage['embedded'] > 0) {
                        $usageParts[] = $attachmentUsage['embedded'] . ' embedded in notes as images';
                    }
                    $unreferencedCount = $restoredFilesCount - $attachmentUsage['attached'] - $attachmentUsage['embedded'];
                    if ($unreferencedCount > 0) {
                        $usageParts[] = $unreferencedCount . ' not linked to any note';
                    }
                    $attachmentsMessage .= ' (' . implode(', ', $usageParts) . ')';
                }
                if (!empty($attachmentsResult['skipped'])) {
                    $attachmentsMessage .= ', skipped ' . $attachmentsResult['skipped'] . ' blocked files';
                    $skippedDetailsMessage = poznoteFormatSkippedAttachmentDetails($skippedAttachments);
                    if ($skippedDetailsMessage !== '') {
                        $attachmentsMessage .= "\n" . $skippedDetailsMessage;
                    }
                }
                if (!empty($attachmentsResult['failed'])) {
                    // Storage failures (bucket upload refused, disk full, ...)
                    // must fail the restore visibly: the archive still has the
                    // files, so the user can fix the storage and restore again
                    $attachmentsMessage .= ', FAILED to store ' . $attachmentsResult['failed'] . ' file(s), see the server logs; fix the storage (disk space, S3 bucket) and restore this backup again';
                    $hasErrors = true;
                }
                $results[] = 'Attachments: ' . $attachmentsMessage;
            } else {
                $results[] = 'Attachments: Failed - ' . $attachmentsResult['error'];
            }
            if (!$attachmentsResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Attachments: No attachments directory found in backup (attachments directory cleared)';
        }

        // Fix orphaned folders and missing entry snippets, now that both the
        // database and the note files are restored. Use a fresh connection to
        // the restored database: the global $con still points at the deleted
        // pre-restore database file and must not be used for writes here.
        if ($databaseRestored) {
            try {
                $repairCon = new PDO('sqlite:' . poznoteGetActiveDatabasePath());
                $repairCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $repairCon->exec('PRAGMA busy_timeout = 5000');
                $repairResult = repairDatabaseEntries($repairCon);
                // Housekeeping the user cannot act on: log it instead of
                // reporting it as a restore result
                if ($repairResult['success'] && ($repairResult['folders_fixed'] > 0 || $repairResult['entries_fixed'] > 0)) {
                    error_log("Post-restore repair: fixed {$repairResult['folders_fixed']} folders and {$repairResult['entries_fixed']} entry snippets");
                }
                $repairCon = null;
            } catch (Throwable $e) {
                error_log('Post-restore repair failed: ' . $e->getMessage());
            }
        }

        // Clean up temporary directory
        deleteDirectory($tempExtractDir);
        $tempExtractDir = null; // Mark as cleaned
        
        // Ensure proper permissions after restoration
        ensureDataPermissions();
        
        return [
            'success' => !$hasErrors,
            'message' => implode("\n", $results),
            'error' => $hasErrors ? 'Some components failed to restore' : '',
            'skipped_attachments' => $skippedAttachments
        ];
        
    } catch (Exception $e) {
        // Clean up on error
        if ($tempFile && file_exists($tempFile)) {
            unlink($tempFile);
        }
        if ($tempExtractDir && is_dir($tempExtractDir)) {
            deleteDirectory($tempExtractDir);
        }
        return ['success' => false, 'error' => 'Exception during restore: ' . $e->getMessage()];
    }
}

/**
 * Restore database from SQL file
 *
 * The dump comes from a user-supplied archive, so it is never executed as-is:
 * it is parsed into DROP TABLE / CREATE TABLE / INSERT statements first and
 * anything else (ATTACH, PRAGMA, triggers...) is refused. See
 * backup_sql_restore.php.
 *
 * The dump is read as a stream, one statement at a time: the dump of a large
 * account weighs as much as its notes and must not be loaded whole.
 *
 * @param string $sqlFile Path of the dump
 * @param bool $alreadyValidated true when the caller already ran
 *        poznoteValidateBackupSqlFile() on this file (restoreCompleteBackup
 *        does, before wiping anything), to save one pass over it. The
 *        statements are checked again as they are executed either way.
 */
function restoreDatabaseFromFile($sqlFile, $alreadyValidated = false) {
    require_once __DIR__ . '/../backup_sql_restore.php';

    // Nothing must be wiped before the whole dump is known to be a Poznote
    // one, so an unchecked file gets its own pass first
    if (!$alreadyValidated) {
        $parsed = poznoteValidateBackupSqlFile($sqlFile);
        if (!$parsed['success']) {
            return ['success' => false, 'error' => 'Invalid SQL dump: ' . $parsed['error']];
        }
    }

    // Use the active database path from db_connect.php or determine it for the current user
    global $dbPath; 
    if (!isset($dbPath) || empty($dbPath)) {
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/../users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            $dbPath = $dataManager->getUserDatabasePath();
        } else {
            $dbPath = SQLITE_DATABASE;
        }
    }
    
    // Remove current database
    if (file_exists($dbPath)) {
        if (!unlink($dbPath)) {
            // If unlink fails (e.g. open handle), try to truncate the file
            if (file_put_contents($dbPath, '') === false) {
                return ['success' => false, 'error' => 'Failed to delete or clear existing database file. Please check permissions or restarting the service.'];
            }
        }
    }
    // Remove leftover WAL/SHM files so the old connection's journal cannot
    // be replayed into the freshly restored database
    foreach (['-wal', '-shm'] as $suffix) {
        if (file_exists($dbPath . $suffix)) {
            @unlink($dbPath . $suffix);
        }
    }
    
    $executed = poznoteExecuteBackupSqlFile($dbPath, $sqlFile);
    if (!$executed['success']) {
        return ['success' => false, 'error' => $executed['error']];
    }

    // Ensure proper permissions on restored database
    setFilePermissions($dbPath, 0664);

    return ['success' => true];
}

/**
 * Restore entries from directory
 */
function restoreEntriesFromDir($sourceDir) {
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }

    // A restored archive is untrusted input, so every note file is sanitized
    // before it lands in the entries directory the note page reads from
    // (GHSA-xjh4-q36h-mcvv). The policy depends on the note type, which the
    // file extension alone does not give: a task list is JSON stored in a
    // .html file. The SQL dump has already been restored at this point, so the
    // types are read back from it; a note with no row falls back to the strict
    // HTML treatment.
    require_once __DIR__ . '/html-sanitize.php';
    $noteTypes = [];
    try {
        $typeCon = new PDO('sqlite:' . poznoteGetActiveDatabasePath());
        $typeCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        foreach ($typeCon->query('SELECT id, type FROM entries') as $row) {
            $noteTypes[(string) $row['id']] = $row['type'];
        }
        $typeCon = null;
    } catch (Throwable $e) {
        // No readable database means no type hints, not a failed restore:
        // every file then takes the strict path below.
        error_log('backup-restore: could not read note types for sanitization: ' . $e->getMessage());
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    // Total for the progress observer (cheap directory walk)
    $totalFiles = iterator_count(new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    ));
    $processedFiles = 0;
    poznoteRestoreReportProgress('notes', 0, $totalFiles);

    $importedCount = 0;

    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $processedFiles++;
            if ($processedFiles % 20 === 0 || $processedFiles === $totalFiles) {
                poznoteRestoreReportProgress('notes', $processedFiles, $totalFiles);
            }
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
            
            // Include both HTML and Markdown files
            if ($extension === 'html' || $extension === 'md') {
                $content = file_get_contents($filePath);
                
                if ($content !== false) {
                    // Get note ID from filename (e.g., "123.html" -> "123")
                    $noteId = pathinfo($relativePath, PATHINFO_FILENAME);
                    
                    // Convert relative attachment paths back to API URLs
                    if ($extension === 'html') {
                        // Convert ../attachments/{attachmentId}.ext to /api/v1/notes/{noteId}/attachments/{attachmentId}
                        $content = preg_replace_callback(
                            '#\.\./attachments/([^"\'\s<>]+)#',
                            function($matches) use ($noteId) {
                                $attachmentId = preg_replace('/\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|mov|webm|mp3|wav|ogg|m4a|txt|md|markdown|json|csv|xml|zip|tar|gz|7z|rar)$/i', '', basename($matches[1]));
                                return '/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId;
                            },
                            $content
                        );
                    } else if ($extension === 'md') {
                        // Convert ![alt](../attachments/{attachmentId}.ext) to ![alt](/api/v1/notes/{noteId}/attachments/{attachmentId})
                        $content = preg_replace_callback(
                            '#\!\[([^\]]*)\]\(\.\./attachments/([^\)]+)\)#',
                            function($matches) use ($noteId) {
                                $attachmentId = preg_replace('/\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|mov|webm|mp3|wav|ogg|m4a|txt|md|markdown|json|csv|xml|zip|tar|gz|7z|rar)$/i', '', basename($matches[2]));
                                return '![' . $matches[1] . '](/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . ')';
                            },
                            $content
                        );
                    }
                    
                    $noteType = $noteTypes[(string) $noteId]
                        ?? (($extension === 'md') ? 'markdown' : 'note');
                    $content = poznoteSanitizeImportedNoteContent($content, $noteType);

                    $targetFile = $entriesPath . '/' . basename($relativePath);
                    if (file_put_contents($targetFile, $content) !== false) {
                        chmod($targetFile, 0644);
                        $importedCount++;
                    }
                } else {
                    // Unreadable here means unreadable for the sanitizer too, so
                    // the file is skipped rather than copied through unchecked.
                    error_log('backup-restore: skipped unreadable note file ' . $relativePath);
                }
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

/**
 * Restore attachments from directory
 */
function restoreAttachmentsFromDir($sourceDir) {
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        return ['success' => false, 'error' => 'Cannot find attachments directory'];
    }
    
    // Read metadata file to get original filenames
    $metadataFile = $sourceDir . '/poznote_attachments_metadata.json';
    $idToAttachmentMap = [];
    
    if (file_exists($metadataFile)) {
        $metadataContent = file_get_contents($metadataFile);
        $metadata = json_decode($metadataContent, true);
        
        if (is_array($metadata)) {
            foreach ($metadata as $item) {
                if (isset($item['attachment_data']['id']) && isset($item['attachment_data']['filename'])) {
                    $idToAttachmentMap[$item['attachment_data']['id']] = [
                        'filename' => $item['attachment_data']['filename'],
                        'original_filename' => $item['attachment_data']['original_filename'] ?? '',
                        'note_id' => $item['note_id'] ?? '',
                        'note_heading' => $item['note_heading'] ?? ''
                    ];
                }
            }
        }
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    // Total for the progress observer: attachments are the long pole of a
    // big restore (each one can be a slow bucket upload), so they are
    // reported file by file.
    $totalFiles = iterator_count(new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    ));
    $processedFiles = 0;
    poznoteRestoreReportProgress('attachments', 0, $totalFiles);

    $importedCount = 0;
    $skippedCount = 0;
    $failedCount = 0;
    $restoredFilenames = [];
    $skippedFiles = [];

    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $processedFiles++;
            poznoteRestoreReportProgress('attachments', $processedFiles, $totalFiles);
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $basename = basename($relativePath);

            // Skip metadata file
            if ($basename === 'poznote_attachments_metadata.json') {
                continue;
            }
            
            // Check if this file is named with an attachment ID (e.g., "abc123.jpg")
            // Extract ID without extension
            $filenameWithoutExt = pathinfo($basename, PATHINFO_FILENAME);
            
            // If we have a mapping for this ID, use the real filename
            $attachmentMetadata = $idToAttachmentMap[$filenameWithoutExt] ?? [];
            if (!empty($attachmentMetadata['filename'])) {
                $targetFilename = $attachmentMetadata['filename'];
            } else {
                // Otherwise, use the original basename (for backwards compatibility)
                $targetFilename = $basename;
            }
            
            $validation = poznoteValidateAttachmentFile($targetFilename, $filePath);
            if (!$validation['success']) {
                $skippedCount++;
                $sourcePath = 'attachments/' . str_replace('\\', '/', $relativePath);
                $skippedFiles[] = [
                    'source_path' => $sourcePath,
                    'target_filename' => $targetFilename,
                    'original_filename' => $attachmentMetadata['original_filename'] ?? '',
                    'note_id' => $attachmentMetadata['note_id'] ?? '',
                    'note_heading' => $attachmentMetadata['note_heading'] ?? '',
                    'reason' => $validation['error']
                ];
                error_log('Skipped blocked attachment during restore: ' . $sourcePath . ' -> ' . $targetFilename . ' - ' . $validation['error']);
                continue;
            }

            // Store on local disk or in the S3 bucket
            if (poznoteStoreAttachmentFromPath($filePath, $validation['filename'], $validation['mime_type'] ?? 'application/octet-stream')) {
                $importedCount++;
                $restoredFilenames[] = $validation['filename'];
            } else {
                // Disk full, bucket upload refused, ...: the file is in the
                // archive but could not be stored. Counted so the caller can
                // report a failed restore instead of a quietly partial one.
                $failedCount++;
                error_log('Failed to store attachment during restore: ' . $relativePath . ' -> ' . $validation['filename']);
            }
        }
    }

    return [
        'success' => true,
        'count' => $importedCount,
        'skipped' => $skippedCount,
        'failed' => $failedCount,
        'filenames' => $restoredFilenames,
        'skipped_files' => $skippedFiles
    ];
}
