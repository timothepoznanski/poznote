<?php
require_once 'auth.php';
require_once 'config.php';

// Verify that user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$filename = $_GET['file'] ?? '';

if (empty($filename)) {
    http_response_code(400);
    die('Nom de fichier manquant');
}

// Security: verify that filename is valid
if (!preg_match('/^poznote_backup_.*\.sql$/', $filename)) {
    http_response_code(400);
    die('Nom de fichier invalide');
}

$backupDir = '/var/www/html/backups';
$filepath = $backupDir . '/' . $filename;

// Verify that file exists
if (!file_exists($filepath)) {
    http_response_code(404);
    die('Fichier non trouvé');
}

// Set headers for download
header('Content-Type: application/sql');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($filepath));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Read and send file
readfile($filepath);
exit;
?>
