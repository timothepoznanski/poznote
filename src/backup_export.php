<?php
require_once 'auth.php';
require_once 'config.php';

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

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
                $error = "Export error: " . $result['error'];
            }
            break;
    }
}

function createBackup() {
    $dbPath = SQLITE_DATABASE;
    
    $filename = "poznote_backup_" . date('Y-m-d_H-i-s') . ".sql";
    
    // Use sqlite3 to create backup
    $command = "sqlite3 {$dbPath} .dump 2>&1";
    
    $output = [];
    exec($command, $output, $returnCode);
    
    if ($returnCode === 0) {
        $sqlContent = implode("\n", $output);
        
        // Set headers for download
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($sqlContent));
        
        echo $sqlContent;
        exit;
    } else {
        $errorMessage = implode("\n", $output);
        return ['success' => false, 'error' => $errorMessage];
    }
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Backup (Export) - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
</head>
<body>
    <div class="backup-container">
        <h1><i class="fas fa-download"></i> Backup (Export)</h1>
        <p>Export your data for backup or migration purposes.</p>
        
        <div class="navigation">
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
            <a href="restore_import.php" class="btn btn-secondary">
                <i class="fas fa-upload"></i> Go to Restore (Import)
            </a>
        </div>
        
        <!-- Information Section -->
        <div class="warning">
            <h4>For a complete backup, export all three components:</h4>
            <ol>
                <li><strong>Notes</strong> - Your note content (HTML files)</li>
                <li><strong>Attachments</strong> - Attachments files</li>
                <li><strong>Database</strong> - Structure, tags, folders, settings</li>
            </ol>
            <h4>For offline reading (no Poznote needed), export only html notes.</h4>
        </div>
        
        <?php if ($message): ?>
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($error): ?>
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($error); ?>
            </div>
        <?php endif; ?>
        
        <!-- Export Notes Section -->
        <div class="backup-section">
            <h3><i class="fas fa-file-archive"></i> Export Notes</h3>
            <p>Download all notes as HTML files in a ZIP archive (perfect for offline reading).</p>
            <button type="button" class="btn btn-primary" onclick="startDownload();">
                <i class="fas fa-download"></i> Download Notes (ZIP)
            </button>
        </div>
        
        <!-- Export Attachments Section -->
        <div class="backup-section">
            <h3><i class="fas fa-paperclip"></i> Export Attachments</h3>
            <p>Download all attached files in a ZIP archive.</p>
            <button type="button" class="btn btn-primary" onclick="startAttachmentsDownload();">
                <i class="fas fa-download"></i> Download Attachments (ZIP)
            </button>
        </div>
        
        <!-- Export Database Section -->
        <div class="backup-section">
            <h3><i class="fas fa-database"></i> Export Database</h3>
            <p>Download database structure (SQL format).</p>
            <form method="post">
                <input type="hidden" name="action" value="backup">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download Database (SQL)
                </button>
            </form>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>
    
    <script>
    // Function to download notes as ZIP
    function startDownload() {
        // Create a direct link to the export script
        window.location.href = 'exportEntries.php';
    }
    
    // Function to download attachments as ZIP
    function startAttachmentsDownload() {
        // Create a direct link to the attachments export script
        window.location.href = 'exportAttachments.php';
    }
    </script>
</body>
</html>
