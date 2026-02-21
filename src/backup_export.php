<?php
require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'users/db_master.php';
require_once 'users/UserDataManager.php';

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

// Process actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'backup':
            $result = createBackup();
            // createBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = t('backup_export.errors.export_error', ['error' => $result['error']]);
            }
            break;
        case 'complete_backup':
            // Get selected user ID (defaults to current user)
            $currentUserId = getCurrentUserId();
            $selectedUserId = isset($_POST['selected_user_id']) ? (int)$_POST['selected_user_id'] : $currentUserId;
            
            // Security check: Only admin can backup other users
            if ($selectedUserId !== $currentUserId && !isCurrentUserAdmin()) {
                $selectedUserId = $currentUserId;
            }
            
            $result = createCompleteBackup($selectedUserId);
            // createCompleteBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = t('backup_export.errors.complete_backup_error', ['error' => $result['error']]);
            }
            break;
    }
}

function generateSQLDump() {
    global $con;
    return generateSQLDumpForConnection($con);
}

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

function createCompleteBackup($userId = null) {
    // Use current user if no userId specified
    if ($userId === null) {
        $userId = getCurrentUserId();
    }
    
    // Get user data manager for the selected user
    $userDataManager = new UserDataManager($userId);
    $userProfile = getUserProfileById($userId);
    $username = $userProfile ? $userProfile['username'] : 'user';
    
    $tempDir = sys_get_temp_dir();
    $userTimezone = getUserTimezone();
    $dt = new DateTime('now', new DateTimeZone($userTimezone));
    $zipFileName = $tempDir . '/poznote_backup_' . $username . '_' . $dt->format('Y-m-d_H-i-s') . '.zip';
    
    $zip = new ZipArchive();
    if ($zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return ['success' => false, 'error' => t('backup_export.errors.cannot_create_zip')];
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
            return ['success' => false, 'error' => t('backup_export.errors.failed_to_create_db_backup')];
        }
    } else {
        $zip->close();
        unlink($zipFileName);
        return ['success' => false, 'error' => 'User database not found'];
    }
    
    // Add all note entries (HTML and Markdown) from user's data
    $entriesPath = $userDataManager->getUserEntriesPath();
    if ($entriesPath && is_dir($entriesPath)) {
        // First, build a mapping of note IDs to their attachment extensions
        $noteAttachments = [];
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
                        $noteId = pathinfo($relativePath, PATHINFO_FILENAME);
                        
                        if ($extension === 'html') {
                            // Remove copy buttons from HTML
                            $content = removeCopyButtonsFromHtml($content);
                            
                            // Convert API URLs to relative paths if this note has attachments
                            if (isset($noteAttachments[$noteId])) {
                                $content = convertApiUrlsToRelativePaths($content, $noteAttachments[$noteId], $noteId);
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
                    if (isset($attachment['filename'])) {
                        $filename = htmlspecialchars($attachment['filename']);
                        $attachmentLinks[] = "<a href='attachments/{$filename}' target='_blank'>{$filename}</a>";
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
    if ($attachmentsPath && is_dir($attachmentsPath)) {
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
                }
            }
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
    
    // Send file to browser
    if (file_exists($zipFileName) && filesize($zipFileName) > 0) {
        // If a download token was provided by the client, set a cookie with that token so
        // the page JS can detect when the download starts and hide the spinner.
        // This must be done before any output is sent.
        if (isset($_POST['download_token']) && !empty($_POST['download_token'])) {
            // Cookie will be session cookie and valid for path '/'
            setcookie('poznote_download_token', $_POST['download_token'], 0, '/');
        }
        $userTimezone = getUserTimezone();
        $dt = new DateTime('now', new DateTimeZone($userTimezone));
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="poznote_backup_' . $username . '_' . $dt->format('Y-m-d_H-i-s') . '.zip"');
        header('Content-Length: ' . filesize($zipFileName));
        header('Cache-Control: no-cache, must-revalidate');
        header('Expires: 0');
        
        readfile($zipFileName);
        unlink($zipFileName);
        exit;
    } else {
        unlink($zipFileName);
        return ['success' => false, 'error' => t('backup_export.errors.failed_to_create_backup_file')];
    }
}

function createBackup() {
    return createCompleteBackup();
}

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
    $copyButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn')]");
    foreach ($copyButtons as $button) {
        $button->parentNode->removeChild($button);
    }

    return $dom->saveHTML();
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
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = $matches[1];
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
        '#\!\[([^\]]*)\]\(/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)\)#',
        function($matches) use ($attachmentExtensions) {
            $altText = $matches[1];
            $attachmentId = $matches[2];
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return '![' . $altText . '](../attachments/' . $attachmentId . $extension . ')';
        },
        $markdown
    );
    
    return $markdown;
}
?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <title><?php echo getPageTitle(); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/backup_export.css">
    <link rel="stylesheet" href="css/modals/base.css">
    <link rel="stylesheet" href="css/modals/specific-modals.css">
    <link rel="stylesheet" href="css/modals/attachments.css">
    <link rel="stylesheet" href="css/modals/link-modal.css">
    <link rel="stylesheet" href="css/modals/share-modal.css">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css">
    <link rel="stylesheet" href="css/modals/responsive.css">
    <link rel="stylesheet" href="css/dark-mode/variables.css">
    <link rel="stylesheet" href="css/dark-mode/layout.css">
    <link rel="stylesheet" href="css/dark-mode/menus.css">
    <link rel="stylesheet" href="css/dark-mode/editor.css">
    <link rel="stylesheet" href="css/dark-mode/modals.css">
    <link rel="stylesheet" href="css/dark-mode/components.css">
    <link rel="stylesheet" href="css/dark-mode/pages.css">
    <link rel="stylesheet" href="css/dark-mode/markdown.css">
    <link rel="stylesheet" href="css/dark-mode/kanban.css">
    <link rel="stylesheet" href="css/dark-mode/icons.css">
    <script src="js/globals.js"></script>
    <script src="js/theme-manager.js"></script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="backup-container">
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_settings'); ?>
            </a>
        </div>
        <br>
        <!-- Complete Backup Section -->
        <div class="backup-section">
            <h3><?php echo t_h('backup_export.sections.complete_backup.title'); ?></h3>
            <?php if (!empty($message)): ?>
                <div class="alert alert-success">
                    <?php echo htmlspecialchars($message); ?>
                </div>
            <?php endif; ?>
            <?php if (!empty($error)): ?>
                <div class="alert alert-danger">
                    <?php echo htmlspecialchars($error); ?>
                </div>
            <?php endif; ?>
            <p>
                <?php echo t_h('backup_export.sections.complete_backup.description_prefix'); ?>
                <span class="text-warning-bold"><?php echo t_h('backup_export.common.all_workspaces'); ?></span>
                <?php echo t_h('backup_export.sections.complete_backup.description_suffix'); ?>
                <br><br>
                <?php echo t_h('backup_export.sections.complete_backup.use_cases'); ?><br>
            </p>
            <ul class="backup-list-styled">
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_restore_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_restore_text'); ?></li><br>
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_offline_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text'); ?> <b>index.html</b> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text_suffix'); ?></li><br>
            </ul>
            
            <form id="completeBackupForm" method="post">
                <input type="hidden" name="action" value="complete_backup">
                <?php if (isCurrentUserAdmin()): ?>
                    <div class="form-group form-group-export">
                        <label for="completeBackupUserSelect" class="export-label">
                            <?php echo t_h('backup_export.sections.complete_backup.select_user'); ?>
                        </label>
                        <select id="completeBackupUserSelect" name="selected_user_id" class="form-control export-select">
                            <?php
                            $allUsers = listAllUserProfiles();
                            foreach ($allUsers as $user) {
                                $selected = ($user['id'] == getCurrentUserId()) ? 'selected' : '';
                                echo '<option value="' . htmlspecialchars($user['id']) . '" ' . $selected . '>';
                                echo htmlspecialchars($user['username']);
                                if ($user['is_admin']) {
                                    echo ' (Admin)';
                                }
                                echo '</option>';
                            }
                            ?>
                        </select>
                    </div>
                    <br>
                <?php else: ?>
                    <input type="hidden" name="selected_user_id" value="<?php echo getCurrentUserId(); ?>">
                <?php endif; ?>
                <button id="completeBackupBtn" type="submit" class="btn btn-primary">
                    <span><?php echo t_h('backup_export.buttons.download_complete_backup'); ?></span>
                </button>
                <!-- Spinner shown while creating ZIP/download is in progress -->
                <div id="backupSpinner" class="backup-spinner initially-hidden" role="status" aria-live="polite" aria-hidden="true">
                    <div class="spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('backup_export.spinner.preparing'); ?></span>
                    <span class="backup-spinner-text"><?php echo t_h('backup_export.spinner.preparing_long'); ?></span>
                </div>
            </form>
        </div>
        
        <!-- Structured Export Section -->
        <div class="backup-section">
            <h3><?php echo t_h('backup_export.sections.structured_export.title'); ?></h3>
            <p>
                <?php echo t_h('backup_export.sections.structured_export.description'); ?>
                <br><br>
                <span class="text-danger"><?php echo t_h('backup_export.sections.structured_export.warning'); ?></span>
            </p>
            
            <div class="form-group form-group-export">
                <label for="structuredExportWorkspaceSelect" class="export-label">
                    <?php echo t_h('backup_export.sections.structured_export.select_workspace'); ?>
                </label>
                <select id="structuredExportWorkspaceSelect" class="form-control export-select">
                    <option value=""><?php echo t_h('backup_export.sections.structured_export.loading_workspaces'); ?></option>
                </select>
            </div>
            
            <button id="structuredExportBtn" type="button" class="btn btn-primary">
                <span><?php echo t_h('backup_export.buttons.download_structured_export'); ?></span>
            </button>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div class="section-bottom-spacer"></div>
    </div>
    
    <script src="js/backup-export.js?v=<?php echo filemtime(__DIR__ . '/js/backup-export.js'); ?>"></script>
    <script src="js/backup-export-init.js"></script>
</body>
</html>
