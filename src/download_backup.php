<?php
require_once 'auth.php';
require_once 'config.php';

// Vérifier que l'utilisateur est connecté
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$filename = $_GET['file'] ?? '';

if (empty($filename)) {
    http_response_code(400);
    die('Nom de fichier manquant');
}

// Sécurité : vérifier que le nom de fichier est valide
if (!preg_match('/^poznote_backup_.*\.sql$/', $filename)) {
    http_response_code(400);
    die('Nom de fichier invalide');
}

$backupDir = '/var/www/html/backups';
$filepath = $backupDir . '/' . $filename;

// Vérifier que le fichier existe
if (!file_exists($filepath)) {
    http_response_code(404);
    die('Fichier non trouvé');
}

// Définir les en-têtes pour le téléchargement
header('Content-Type: application/sql');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($filepath));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Lire et envoyer le fichier
readfile($filepath);
exit;
?>
