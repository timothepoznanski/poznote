<?php
// Script pour afficher les logs d'erreur récents
ini_set('display_errors', 1);
error_reporting(E_ALL);

echo "<h1>Logs d'erreur Poznote</h1>";

// Lire les dernières lignes du log d'erreur PHP
$php_error_log = "/var/log/php_errors.log";

echo "<h2>Logs d'erreur PHP</h2>";
if (file_exists($php_error_log)) {
    $logs = file($php_error_log);
    $recent_logs = array_slice($logs, -50); // 50 dernières lignes
    
    echo "<div style='background: #f8f8f8; padding: 10px; border: 1px solid #ddd; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto;'>";
    foreach ($recent_logs as $log) {
        echo htmlspecialchars($log);
    }
    echo "</div>";
} else {
    echo "<p>Fichier de log PHP non trouvé à : $php_error_log</p>";
}

// Vérifier aussi les logs d'erreur Apache
$apache_error_log = "/var/log/apache2/error.log";

echo "<h2>Logs d'erreur Apache</h2>";
if (file_exists($apache_error_log)) {
    $logs = file($apache_error_log);
    $recent_logs = array_slice($logs, -20); // 20 dernières lignes
    
    echo "<div style='background: #f8f8f8; padding: 10px; border: 1px solid #ddd; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow-y: auto;'>";
    foreach ($recent_logs as $log) {
        echo htmlspecialchars($log);
    }
    echo "</div>";
} else {
    echo "<p>Fichier de log Apache non trouvé à : $apache_error_log</p>";
}

// Informations sur les derniers fichiers HTML créés
echo "<h2>Derniers fichiers HTML dans entries/</h2>";
$entries_path = 'data/entries/';
if (is_dir($entries_path)) {
    $files = glob($entries_path . '*.html');
    
    // Trier par date de modification (plus récent en premier)
    usort($files, function($a, $b) {
        return filemtime($b) - filemtime($a);
    });
    
    echo "<table style='border-collapse: collapse; width: 100%;'>";
    echo "<tr style='background: #f0f0f0;'><th style='border: 1px solid #ddd; padding: 8px;'>Fichier</th><th style='border: 1px solid #ddd; padding: 8px;'>Taille</th><th style='border: 1px solid #ddd; padding: 8px;'>Modifié</th><th style='border: 1px solid #ddd; padding: 8px;'>Contenu (début)</th></tr>";
    
    foreach (array_slice($files, 0, 10) as $file) { // 10 derniers fichiers
        $size = filesize($file);
        $modified = date('Y-m-d H:i:s', filemtime($file));
        $content = substr(file_get_contents($file), 0, 100);
        
        echo "<tr>";
        echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . basename($file) . "</td>";
        echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $size . " bytes</td>";
        echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $modified . "</td>";
        echo "<td style='border: 1px solid #ddd; padding: 4px; font-family: monospace; font-size: 12px;'>" . htmlspecialchars($content) . "...</td>";
        echo "</tr>";
    }
    
    echo "</table>";
} else {
    echo "<p>Répertoire entries/ non trouvé</p>";
}

// État actuel de la base de données
echo "<h2>Dernières notes en base de données</h2>";
require_once 'config.php';
include 'db_connect.php';

$stmt = $con->prepare("SELECT id, heading, folder, created, updated, LENGTH(entry) as content_length FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 10");
$stmt->execute();

echo "<table style='border-collapse: collapse; width: 100%;'>";
echo "<tr style='background: #f0f0f0;'><th style='border: 1px solid #ddd; padding: 8px;'>ID</th><th style='border: 1px solid #ddd; padding: 8px;'>Titre</th><th style='border: 1px solid #ddd; padding: 8px;'>Dossier</th><th style='border: 1px solid #ddd; padding: 8px;'>Créé</th><th style='border: 1px solid #ddd; padding: 8px;'>Modifié</th><th style='border: 1px solid #ddd; padding: 8px;'>Contenu (longueur)</th></tr>";

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "<tr>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $row['id'] . "</td>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . htmlspecialchars($row['heading']) . "</td>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . htmlspecialchars($row['folder']) . "</td>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $row['created'] . "</td>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $row['updated'] . "</td>";
    echo "<td style='border: 1px solid #ddd; padding: 4px;'>" . $row['content_length'] . " caractères</td>";
    echo "</tr>";
}

echo "</table>";
?>
