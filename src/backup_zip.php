<?php
/**
 * Shared complete-backup ZIP builder.
 *
 * Builds the same archive as the "Complete Backup" download of
 * backup_export.php (database dump + entries + index.html + attachments +
 * metadata) but returns the path of the ZIP instead of streaming it, so it
 * can be reused outside a web request: manual S3 backups triggered from the
 * settings page and the automatic S3 backup worker.
 */

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/storage/AttachmentStorage.php';

if (!function_exists('generateSQLDumpForConnection')) {
function generateSQLDumpForConnection($con) {
    $sql = "-- " . t('backup_export.dump.title') . "\n";
    $userTimezone = getUserTimezone();
    $dt = new DateTime('now', new DateTimeZone($userTimezone));
    $sql .= "-- " . t('backup_export.dump.generated_on', ['date' => $dt->format('Y-m-d H:i:s')]) . "\n\n";

    // Get all table names
    $tables = $con->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    $tableNames = [];
    while ($row = $tables->fetch(PDO::FETCH_ASSOC)) {
        $tableNames[] = $row['name'];
    }

    foreach ($tableNames as $table) {
        // Get CREATE TABLE statement using prepared statement to prevent SQL injection
        $stmt = $con->prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?");
        $stmt->execute([$table]);
        $createStmt = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($createStmt && $createStmt['sql']) {
            // Add DROP TABLE to ensure clean restoration
            $sql .= "DROP TABLE IF EXISTS \"{$table}\";\n";
            $sql .= $createStmt['sql'] . ";\n\n";
        }

        // Get all data using prepared statement
        $stmt = $con->prepare("SELECT * FROM \"{$table}\"");
        $stmt->execute();
        $data = $stmt;
        while ($row = $data->fetch(PDO::FETCH_ASSOC)) {
            $columns = array_keys($row);
            $values = array_map(function($value) use ($con) {
                if ($value === null) {
                    return 'NULL';
                }
                return $con->quote($value);
            }, array_values($row));

            $sql .= "INSERT INTO \"{$table}\" (" . implode(', ', array_map(function($col) {
                return "\"{$col}\"";
            }, $columns)) . ") VALUES (" . implode(', ', $values) . ");\n";
        }
        $sql .= "\n";
    }

    return $sql;
}
}

if (!function_exists('removeCopyButtonsFromHtml')) {
/**
 * Remove code block copy buttons from HTML export
 */
function removeCopyButtonsFromHtml($html) {
    if ($html === '' || $html === null) {
        return $html;
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);
    // Code block UI affordances (copy / delete / language badge / line numbers)
    $actionButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn') or contains(@class, 'code-block-delete-btn') or contains(@class, 'code-block-lang-btn') or contains(@class, 'code-block-line-numbers-btn')]");
    foreach ($actionButtons as $button) {
        $button->parentNode->removeChild($button);
    }

    // Strip the xml processing instruction added above for UTF-8 handling
    return preg_replace('/^<\?xml[^>]*\?>\s*/', '', $dom->saveHTML());
}
}

if (!function_exists('addDownloadAttributesToAttachmentLinks')) {
/**
 * Add a download attribute to <a> tags pointing at exported attachment files so
 * browsers save the file instead of navigating to it when the export is opened locally.
 * $downloadNames maps the exported basename (attachment id + extension) to the
 * original filename used as the suggested download name.
 */
function addDownloadAttributesToAttachmentLinks($html, $downloadNames) {
    if ($html === '' || $html === null) {
        return $html;
    }

    return preg_replace_callback(
        '#<a\b[^>]*href=("|\')(?:\.\./)*attachments/([^"\'?\#]+)(?:[?\#][^"\']*)?\1[^>]*>#i',
        function ($matches) use ($downloadNames) {
            $tag = $matches[0];

            // Keep the click-to-view behavior of image preview wrappers; their
            // caption link is the download entry point
            if (stripos($tag, 'note-attachment-preview-media') !== false) {
                return $tag;
            }

            // Skip tags that already carry a download attribute (compare with
            // quoted values blanked out so title="Download ..." does not match)
            $tagWithoutValues = preg_replace('/"[^"]*"|\'[^\']*\'/', '""', $tag);
            if (preg_match('/\sdownload\b/i', $tagWithoutValues)) {
                return $tag;
            }

            $basename = $matches[2];
            $downloadAttr = ' download';
            if (isset($downloadNames[$basename]) && $downloadNames[$basename] !== '') {
                $downloadAttr = ' download="' . htmlspecialchars($downloadNames[$basename], ENT_QUOTES, 'UTF-8') . '"';
            }

            return '<a' . $downloadAttr . substr($tag, 2);
        },
        $html
    );
}
}

/**
 * Convert API URLs to relative paths for offline viewing
 * Converts /api/v1/notes/{noteId}/attachments/{attachmentId} to attachments/{attachmentId}.ext
 *
 * @param string $html HTML content with API URLs
 * @param array $attachmentExtensions Mapping of attachment IDs to file extensions
 * @param int $noteId The note ID to match in URLs
 * @return string HTML with relative attachment paths
 */
function convertApiUrlsToRelativePaths($html, $attachmentExtensions, $noteId) {
    if (empty($html)) {
        return $html;
    }

    // Convert /api/v1/notes/{noteId}/attachments/{attachmentId} to attachments/{attachmentId}.ext
    $html = preg_replace_callback(
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9._-]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = resolveAttachmentReferenceId($matches[1], $attachmentExtensions);
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return '../attachments/' . $attachmentId . $extension;
        },
        $html
    );

    return $html;
}

/**
 * Convert API URLs to relative paths in Markdown files
 * Converts ![text](/api/v1/notes/{noteId}/attachments/{attachmentId}) to ![text](../attachments/{attachmentId}.ext)
 *
 * @param string $markdown Markdown content with API URLs
 * @param array $attachmentExtensions Mapping of attachment IDs to file extensions
 * @param int $noteId The note ID to match in URLs
 * @return string Markdown with relative attachment paths
 */
function convertMarkdownApiUrlsToRelativePaths($markdown, $attachmentExtensions, $noteId) {
    if (empty($markdown)) {
        return $markdown;
    }

    // Convert ![alt](/api/v1/notes/{noteId}/attachments/{attachmentId}) to ![alt](../attachments/{attachmentId}.ext)
    $markdown = preg_replace_callback(
        '#\!\[([^\]]*)\]\(/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9._-]+)\)#',
        function($matches) use ($attachmentExtensions) {
            $altText = $matches[1];
            $attachmentId = resolveAttachmentReferenceId($matches[2], $attachmentExtensions);
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return '![' . $altText . '](../attachments/' . $attachmentId . $extension . ')';
        },
        $markdown
    );

    return $markdown;
}

/**
 * Build the complete backup ZIP of one user in the system temp directory.
 *
 * @return array ['success' => bool, 'zip_path' => ?string, 'filename' => ?string, 'error' => ?string]
 *         On success the caller owns the temp file and must unlink it.
 */
function buildUserBackupZip($userId, $skipS3Attachments = false) {
    $userId = (int)$userId;

    // Get user data manager for the selected user
    $userDataManager = new UserDataManager($userId);
    $userProfile = getUserProfileById($userId);
    $username = $userProfile ? $userProfile['username'] : 'user';

    $tempDir = sys_get_temp_dir();
    $userTimezone = getUserTimezone();
    $dt = new DateTime('now', new DateTimeZone($userTimezone));
    $downloadName = 'poznote_backup_' . $username . '_' . $dt->format('Y-m-d_H-i-s') . '.zip';
    $zipFileName = $tempDir . '/' . $downloadName;

    $zip = new ZipArchive();
    if ($zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return ['success' => false, 'zip_path' => null, 'filename' => null, 'error' => t('backup_export.errors.cannot_create_zip')];
    }

    // Add SQL dump from user's database
    $userDbPath = $userDataManager->getUserDatabasePath();
    if (file_exists($userDbPath)) {
        // Temporarily connect to user's database to generate dump
        $tempCon = new PDO('sqlite:' . $userDbPath);
        $tempCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $tempCon->exec('PRAGMA busy_timeout = 5000');

        $sqlContent = generateSQLDumpForConnection($tempCon);
        if ($sqlContent) {
            $zip->addFromString('database/poznote_backup.sql', $sqlContent);
        } else {
            $zip->close();
            unlink($zipFileName);
            return ['success' => false, 'zip_path' => null, 'filename' => null, 'error' => t('backup_export.errors.failed_to_create_db_backup')];
        }
    } else {
        $zip->close();
        unlink($zipFileName);
        return ['success' => false, 'zip_path' => null, 'filename' => null, 'error' => 'User database not found'];
    }

    // Add all note entries (HTML and Markdown) from user's data
    $entriesPath = $userDataManager->getUserEntriesPath();
    if ($entriesPath && is_dir($entriesPath)) {
        // Include trashed notes: their files are exported too, and a trashed
        // tasklist mistaken for an HTML note would get its JSON mangled below
        $noteTypeMap = [];
        $typesResult = $tempCon->query("SELECT id, type FROM entries");
        if ($typesResult) {
            while ($typeRow = $typesResult->fetch(PDO::FETCH_ASSOC)) {
                $noteTypeMap[(int)$typeRow['id']] = $typeRow['type'] ?? 'note';
            }
        }

        // First, build a mapping of note IDs to their attachment extensions
        $noteAttachments = [];
        // Exported basename (id + extension) => original filename, for download attributes
        $attachmentDownloadNames = [];
        $query = "SELECT id, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $attachmentsResult = $tempCon->query($query);

        if ($attachmentsResult) {
            while ($row = $attachmentsResult->fetch(PDO::FETCH_ASSOC)) {
                $attachments = json_decode($row['attachments'], true);
                if (is_array($attachments)) {
                    $attachmentExtensions = [];
                    foreach ($attachments as $attachment) {
                        if (isset($attachment['id']) && isset($attachment['filename'])) {
                            $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                            $attachmentExtensions[$attachment['id']] = $ext ? '.' . $ext : '';
                            $attachmentDownloadNames[$attachment['id'] . ($ext ? '.' . $ext : '')] = $attachment['original_filename'] ?? $attachment['filename'];
                        }
                    }
                    $noteAttachments[$row['id']] = $attachmentExtensions;
                }
            }
        }

        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($entriesPath),
            RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($entriesPath) + 1);
                $extension = pathinfo($relativePath, PATHINFO_EXTENSION);

                // Include both HTML and Markdown files
                if ($extension === 'html' || $extension === 'md') {
                    $content = file_get_contents($filePath);
                    if ($content !== false) {
                        // Get note ID from filename (e.g., "123.html" -> "123")
                        $noteId = (int) pathinfo($relativePath, PATHINFO_FILENAME);
                        $noteType = $noteTypeMap[$noteId] ?? 'note';

                        if ($extension === 'html' && $noteType !== 'tasklist') {
                            // Remove copy buttons from HTML
                            $content = removeCopyButtonsFromHtml($content);

                            // Convert API URLs to relative paths if this note has attachments
                            if (isset($noteAttachments[$noteId])) {
                                $content = convertApiUrlsToRelativePaths($content, $noteAttachments[$noteId], $noteId);
                                $content = addDownloadAttributesToAttachmentLinks($content, $attachmentDownloadNames);
                            }
                        } else if ($extension === 'md') {
                            // Convert Markdown image URLs to relative paths if this note has attachments
                            if (isset($noteAttachments[$noteId])) {
                                $content = convertMarkdownApiUrlsToRelativePaths($content, $noteAttachments[$noteId], $noteId);
                            }
                        }

                        $zip->addFromString('entries/' . $relativePath, $content);
                    } else {
                        $zip->addFile($filePath, 'entries/' . $relativePath);
                    }
                }
            }
        }
    }

    // Generate index.html for entries using user's database
    $query = "SELECT id, heading, tags, folder, folder_id, workspace, attachments, type FROM entries WHERE trash = 0 ORDER BY workspace, folder, updated DESC";
    $result = $tempCon->query($query);
    // Generate a simple, icon-free index.html header
    $indexContent = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>" . htmlspecialchars(t('backup_export.index.title'), ENT_QUOTES) . "</title>\n<style>\nbody { font-family: Arial, sans-serif; }\nh2 { margin-top: 30px; }\nh3 { color: #28a745; margin-top: 20px; }\nul { list-style-type: none; }\nli { margin: 5px 0; }\na { text-decoration: none; color: #007bff; }\na:hover { text-decoration: underline; }\n.attachments { color: #17a2b8; }\n</style>\n</head>\n<body>\n";

    $currentWorkspace = '';
    $currentFolder = '';
    if ($result) {
        while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $workspace = htmlspecialchars($row['workspace'] ?: 'Default');

            // Get the complete folder path including parents
            $folder_id = $row['folder_id'] ?? null;
            $folderPath = getFolderPath($folder_id, $tempCon);
            $folder = htmlspecialchars($folderPath);

            if ($currentWorkspace !== $workspace) {
                if ($currentWorkspace !== '') {
                    if ($currentFolder !== '') {
                        $indexContent .= "</ul>\n";
                    }
                    $indexContent .= "</div>\n";
                }
                // Workspace header (no icon)
                $indexContent .= "<h2>{$workspace}</h2>\n<div>\n";
                $currentWorkspace = $workspace;
                $currentFolder = '';
            }
            if ($currentFolder !== $folder) {
                if ($currentFolder !== '') {
                    $indexContent .= "</ul>\n";
                }
                // Folder header (no icon)
                $indexContent .= "<h3>{$folder}</h3>\n<ul>\n";
                $currentFolder = $folder;
            }
            $heading = htmlspecialchars($row['heading'] ?: 'Untitled');
            $tags = $row['tags'];
            $tagsStr = '';
            if (!empty($tags)) {
                // Tags are stored as comma-separated string, not JSON
                $tagsArray = array_map('trim', explode(',', $tags));
                $tagsArray = array_filter($tagsArray); // Remove empty tags
                if (!empty($tagsArray)) {
                    $tagsStr = implode(', ', array_map('htmlspecialchars', $tagsArray));
                }
            }
            $attachments = json_decode($row['attachments'], true);
            $attachmentsStr = '';
            if (is_array($attachments) && !empty($attachments)) {
                $attachmentLinks = [];
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename']) && isset($attachment['id'])) {
                        // Files are stored in the ZIP as {id}.{ext}, so the link
                        // must use that name while showing the real filename
                        $extension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                        $zipName = $attachment['id'] . ($extension ? '.' . $extension : '');
                        $displayName = (string)($attachment['original_filename'] ?? $attachment['filename']);

                        $href = htmlspecialchars('attachments/' . rawurlencode($zipName), ENT_QUOTES);
                        $safeDisplayName = htmlspecialchars($displayName, ENT_QUOTES);
                        $attachmentLinks[] = "<a href='{$href}' download='{$safeDisplayName}'>{$safeDisplayName}</a>";
                    }
                }
                    if (!empty($attachmentLinks)) {
                        // Attachments list (no icon)
                        $attachmentsStr = implode(', ', $attachmentLinks);
                    }
            }
            // Note line (no icons) — put dashes between title, tags and attachments when present
            $parts = [];

            // Determine the correct file extension based on note type
            $noteType = $row['type'] ?? 'note';
            $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';

            $parts[] = "<a href='entries/{$row['id']}.{$fileExtension}'>{$heading}</a>";
            if (!empty($tagsStr)) { $parts[] = $tagsStr; }
            if (!empty($attachmentsStr)) { $parts[] = $attachmentsStr; }
            $indexContent .= "<li>" . implode(' - ', $parts) . "</li>\n";
        }
        if ($currentFolder !== '') {
            $indexContent .= "</ul>\n";
        }
        if ($currentWorkspace !== '') {
            $indexContent .= "</div>\n";
        }
    }

    $indexContent .= "</body>\n</html>";
    $zip->addFromString('index.html', $indexContent);

    // Add attachments from user's data
    $attachmentsPath = $userDataManager->getUserAttachmentsPath();
    // Build a mapping from attachment filenames to IDs for proper naming in ZIP
    $query = "SELECT id, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $attachmentsQueryResult = $tempCon->query($query);
    $filenameToIdMap = [];

    if ($attachmentsQueryResult) {
        while ($row = $attachmentsQueryResult->fetch(PDO::FETCH_ASSOC)) {
            $attachments = json_decode($row['attachments'], true);
            if (is_array($attachments)) {
                foreach ($attachments as $attachment) {
                    if (isset($attachment['id']) && isset($attachment['filename'])) {
                        $filenameToIdMap[$attachment['filename']] = $attachment['id'];
                    }
                }
            }
        }
    }

    $addedAttachmentFiles = [];
    if ($attachmentsPath && is_dir($attachmentsPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($attachmentsPath),
            RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($attachmentsPath) + 1);

                // Skip hidden files
                if (!str_starts_with($relativePath, '.')) {
                    // Get the base filename
                    $filename = basename($relativePath);

                    // If this file is mapped to an attachment ID, use ID.ext as the name in the ZIP
                    if (isset($filenameToIdMap[$filename])) {
                        $attachmentId = $filenameToIdMap[$filename];
                        $ext = pathinfo($filename, PATHINFO_EXTENSION);
                        $zipPath = 'attachments/' . $attachmentId . ($ext ? '.' . $ext : '');
                        $zip->addFile($filePath, $zipPath);
                    } else {
                        // Otherwise, just add it with its original name (shouldn't normally happen)
                        $zip->addFile($filePath, 'attachments/' . $relativePath);
                    }
                    $addedAttachmentFiles[$filename] = true;
                }
            }
        }
    }

    // Fetch the exported user's remaining attachments from the bucket,
    // unless the lighter-zip option was checked. Gated on isConfigured()
    // rather than the S3 switch: files left in the bucket after S3 storage
    // was turned off must still land in the backup, otherwise the archive
    // would silently omit them. Files already on disk were added above, so
    // this only reaches the network for the ones that are not; an
    // unreachable bucket trips the per-request circuit breaker in
    // AttachmentStorage after the first failure. The metadata file below
    // lists them either way; a full archive can be rebuilt later by
    // dropping the files from the attachments export into attachments/.
    $exportStorage = AttachmentStorage::forUser($userId);
    if (AttachmentStorage::isConfigured() && !$skipS3Attachments) {
        // Fresh bucket state for THIS build: a failure remembered from
        // earlier in the request (or from another user's build, in the
        // backup worker's loop) must not fail this archive's completeness
        // check below, and this build's fetches deserve a fresh attempt.
        AttachmentStorage::resetRequestBucketState();

        foreach ($filenameToIdMap as $filename => $attachmentId) {
            if (isset($addedAttachmentFiles[$filename])) {
                continue;
            }
            $localCopy = $exportStorage->localFile($filename);
            if ($localCopy !== null) {
                $ext = pathinfo($filename, PATHINFO_EXTENSION);
                $zip->addFile($localCopy, 'attachments/' . $attachmentId . ($ext ? '.' . $ext : ''));
            }
        }

        // A file the bucket answers 404 for is simply gone and must not block
        // the backup, but a bucket that errored means the lookups after it
        // were skipped: we cannot tell what is missing. Refuse rather than
        // hand back an archive that looks complete and is not.
        if (AttachmentStorage::remoteFailedThisRequest()) {
            $zip->close();
            @unlink($zipFileName);
            AttachmentStorage::resetRequestBucketState();
            return [
                'success' => false,
                'zip_path' => null,
                'filename' => null,
                'error' => t('backup_export.errors.s3_unreachable', [],
                    'The S3 bucket could not be read while building the archive, so some attachments would be missing from it. Nothing was saved. Check the bucket and try again.'),
            ];
        }
    }

    // Add metadata file for attachments using user's database
    $query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $queryResult = $tempCon->query($query);
    $metadataInfo = [];

    if ($queryResult) {
        while ($row = $queryResult->fetch(PDO::FETCH_ASSOC)) {
            $attachments = json_decode($row['attachments'], true);
            if (is_array($attachments) && !empty($attachments)) {
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $metadataInfo[] = [
                            'note_id' => $row['id'],
                            'note_heading' => $row['heading'],
                            'attachment_data' => $attachment
                        ];
                    }
                }
            }
        }
    }

    if (!empty($metadataInfo)) {
        $metadataContent = json_encode($metadataInfo, JSON_PRETTY_PRINT);
        $zip->addFromString('attachments/poznote_attachments_metadata.json', $metadataContent);
    }

    // No external icon/font files added to ZIP — index.html is icon-free

    $zip->close();

    // The bucket downloads were only needed until close() read them into the
    // archive; dropping them now keeps long worker runs from accumulating
    // every user's attachments in the temp dir until the process exits.
    AttachmentStorage::resetRequestBucketState();

    if (!file_exists($zipFileName) || filesize($zipFileName) <= 0) {
        if (file_exists($zipFileName)) {
            unlink($zipFileName);
        }
        return ['success' => false, 'zip_path' => null, 'filename' => null, 'error' => t('backup_export.errors.failed_to_create_backup_file')];
    }

    return ['success' => true, 'zip_path' => $zipFileName, 'filename' => $downloadName, 'error' => null];
}
