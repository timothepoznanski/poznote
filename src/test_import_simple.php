<?php
// Simplified version of database_backup.php for testing
require 'auth.php';
requireAuth();

require 'config.php';
include 'db_connect.php';

$error = '';
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'import_attachments') {
        if (isset($_FILES['attachments_file']) && $_FILES['attachments_file']['error'] === UPLOAD_ERR_OK) {
            // Simplified import that just copies files without metadata linking
            $result = simpleImportAttachmentsZip($_FILES['attachments_file']);
            if ($result['success']) {
                $message = "Attachments imported successfully! " . $result['count'] . " files processed.";
            } else {
                $error = "Import error: " . $result['error'];
            }
        } else {
            $error = "No attachments file selected or upload error.";
        }
    }
}

function simpleImportAttachmentsZip($uploadedFile) {
    // Simple version without metadata linking
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_attachments_import_' . uniqid() . '.zip';
    
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    $attachmentsPaths = [
        realpath('attachments'),
        realpath('../data/attachments'),
    ];
    
    $attachmentsPath = null;
    foreach ($attachmentsPaths as $path) {
        if ($path && is_dir($path)) {
            $attachmentsPath = $path;
            break;
        }
    }
    
    if (!$attachmentsPath) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Attachments directory not found'];
    }
    
    $zip = new ZipArchive();
    $result = $zip->open($tempFile);
    
    if ($result !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot open ZIP file. Error code: ' . $result];
    }
    
    $extractedCount = 0;
    
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $filename = $zip->getNameIndex($i);
        
        if (!str_ends_with($filename, '/') && $filename !== 'index.html' && $filename !== '_poznote_attachments_metadata.json') {
            $baseName = basename($filename);
            $targetPath = $attachmentsPath . '/' . $baseName;
            
            if ($zip->extractTo($attachmentsPath, $filename)) {
                $extractedPath = $attachmentsPath . '/' . $filename;
                if ($extractedPath !== $targetPath && file_exists($extractedPath)) {
                    rename($extractedPath, $targetPath);
                    $dir = dirname($extractedPath);
                    if ($dir !== $attachmentsPath && is_dir($dir) && count(scandir($dir)) === 2) {
                        rmdir($dir);
                    }
                }
                $extractedCount++;
            }
        }
    }
    
    $zip->close();
    unlink($tempFile);
    
    chmod($attachmentsPath, 0755);
    $files = glob($attachmentsPath . '/*');
    foreach ($files as $file) {
        if (is_file($file)) {
            chmod($file, 0644);
        }
    }
    
    return ['success' => true, 'count' => $extractedCount];
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Test Import Attachments</title>
</head>
<body>
    <h2>Test Import Attachments (Simplified)</h2>
    
    <?php if ($message): ?>
        <div style="color: green;"><?php echo htmlspecialchars($message); ?></div>
    <?php endif; ?>
    
    <?php if ($error): ?>
        <div style="color: red;"><?php echo htmlspecialchars($error); ?></div>
    <?php endif; ?>
    
    <form method="post" enctype="multipart/form-data">
        <input type="hidden" name="action" value="import_attachments">
        <div>
            <label for="attachments_file">ZIP file containing attachments:</label>
            <input type="file" id="attachments_file" name="attachments_file" accept=".zip" required>
        </div>
        <button type="submit">Import Attachments (Test)</button>
    </form>
    
    <p><strong>Note:</strong> This is a simplified test version that only copies files without linking them to notes.</p>
</body>
</html>
