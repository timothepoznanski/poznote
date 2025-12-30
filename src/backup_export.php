<?php
require_once 'auth.php';
require_once 'config.php';
include 'functions.php';
require_once 'db_connect.php';

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$currentLang = getUserLanguage();

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
            $result = createCompleteBackup();
            // createCompleteBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = t('backup_export.errors.complete_backup_error', ['error' => $result['error']]);
            }
            break;
    }
}

function generateSQLDump() {
    global $con;

    $sql = "-- " . t('backup_export.dump.title') . "\n";
    $sql .= "-- " . t('backup_export.dump.generated_on', ['date' => date('Y-m-d H:i:s')]) . "\n\n";
    
    // Get all table names
    $tables = $con->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    $tableNames = [];
    while ($row = $tables->fetch(PDO::FETCH_ASSOC)) {
        $tableNames[] = $row['name'];
    }
    
    foreach ($tableNames as $table) {
        // Get CREATE TABLE statement
        $createStmt = $con->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='{$table}'")->fetch(PDO::FETCH_ASSOC);
        if ($createStmt && $createStmt['sql']) {
            $sql .= $createStmt['sql'] . ";\n\n";
        }
        
        // Get all data
        $data = $con->query("SELECT * FROM \"{$table}\"");
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

function createCompleteBackup() {
    $tempDir = sys_get_temp_dir();
    $zipFileName = $tempDir . '/poznote_complete_backup_' . date('Y-m-d_H-i-s') . '.zip';
    
    $zip = new ZipArchive();
    if ($zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return ['success' => false, 'error' => t('backup_export.errors.cannot_create_zip')];
    }
    
    // Add SQL dump
    $sqlContent = generateSQLDump();
    if ($sqlContent) {
        $zip->addFromString('database/poznote_backup.sql', $sqlContent);
    } else {
        $zip->close();
        unlink($zipFileName);
        return ['success' => false, 'error' => t('backup_export.errors.failed_to_create_db_backup')];
    }
    
    // Add all note entries (HTML and Markdown)
    $entriesPath = getEntriesPath();
    if ($entriesPath && is_dir($entriesPath)) {
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
                    $zip->addFile($filePath, 'entries/' . $relativePath);
                }
            }
        }
    }
    
    // Generate index.html for entries
    global $con;
    $query = "SELECT id, heading, tags, folder, folder_id, workspace, attachments, type FROM entries WHERE trash = 0 ORDER BY workspace, folder, updated DESC";
    $result = $con->query($query);
    // Generate a simple, icon-free index.html header
    $indexContent = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>" . htmlspecialchars(t('backup_export.index.title'), ENT_QUOTES) . "</title>\n<style>\nbody { font-family: Arial, sans-serif; }\nh2 { margin-top: 30px; }\nh3 { color: #28a745; margin-top: 20px; }\nul { list-style-type: none; }\nli { margin: 5px 0; }\na { text-decoration: none; color: #007bff; }\na:hover { text-decoration: underline; }\n.attachments { color: #17a2b8; }\n</style>\n</head>\n<body>\n";
    
    $currentWorkspace = '';
    $currentFolder = '';
    if ($result) {
        while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $workspace = htmlspecialchars($row['workspace'] ?: 'Default');
            
            // Get the complete folder path including parents
            $folder_id = $row['folder_id'] ?? null;
            $folderPath = getFolderPath($folder_id, $con);
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
    
    // Add attachments
    $attachmentsPath = getAttachmentsPath();
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
                    $zip->addFile($filePath, 'attachments/' . $relativePath);
                }
            }
        }
    }
    
    // Add metadata file for attachments
    include 'db_connect.php';
    $query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $queryResult = $con->query($query);
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
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="poznote_complete_backup_' . date('Y-m-d_H-i-s') . '.zip"');
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
?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <title><?php echo t_h('backup_export.page.title'); ?> - <?php echo t_h('app.name'); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/backup_export.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/globals.js"></script>
    <script src="js/theme-manager.js"></script>
</head>
<body>
    <div class="backup-container">
        <h1><?php echo t_h('backup_export.page.title'); ?></h1>
        
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>
        <a href="settings.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_settings'); ?>
        </a>

        <br><br>
        
        <!-- Info about individual note export -->
        <div class="info-box">
            <p style="margin: 0;">
                <?php echo t_h('backup_export.info.individual_export'); ?>
            </p>
        </div>
        
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
                <span style="color: #dc3545; font-weight: bold;"><?php echo t_h('backup_export.common.all_workspaces'); ?></span>
                <?php echo t_h('backup_export.sections.complete_backup.description_suffix'); ?>
                <br><br>
                <?php echo t_h('backup_export.sections.complete_backup.use_cases'); ?><br>
            </p>
            <ul style="margin: 10px 0; padding-left: 20px; padding-bottom: 10px;">
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_restore_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_restore_text'); ?></li><br>
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_offline_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text'); ?> <b>index.html</b> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text_suffix'); ?></li><br>
            </ul>
            
            <form id="completeBackupForm" method="post">
                <input type="hidden" name="action" value="complete_backup">
                <button id="completeBackupBtn" type="submit" class="btn btn-primary">
                    <span><?php echo t_h('backup_export.buttons.download_complete_backup'); ?></span>
                </button>
                <!-- Spinner shown while creating ZIP/download is in progress -->
                <div id="backupSpinner" class="backup-spinner" role="status" aria-live="polite" aria-hidden="true" style="display:none;">
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
                <strong><?php echo t_h('backup_export.sections.structured_export.features'); ?></strong><br>
            </p>
            <ul style="margin: 10px 0; padding-left: 20px; padding-bottom: 10px;">
                <li><?php echo t_h('backup_export.sections.structured_export.feature_folders'); ?></li>
                <li><?php echo t_h('backup_export.sections.structured_export.feature_subfolders'); ?></li>
                <li><?php echo t_h('backup_export.sections.structured_export.feature_metadata'); ?></li>
                <li><?php echo t_h('backup_export.sections.structured_export.feature_formats'); ?></li>
            </ul>
            
            <button id="structuredExportBtn" type="button" class="btn btn-primary" onclick="startStructuredExport();">
                <span><?php echo t_h('backup_export.buttons.download_structured_export'); ?></span>
            </button>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>
    
    <script src="js/backup-export.js?v=<?php echo filemtime(__DIR__ . '/js/backup-export.js'); ?>"></script>
    <script>
    (function(){ try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) {
            var a = document.getElementById('backToNotesLink'); 
            if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
        }
    } catch(e){} })();
    </script>
</body>
</html>
