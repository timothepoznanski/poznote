<?php
require 'auth.php';
requireAuth();

include 'functions.php';

echo "<h1>Poznote - Diagnostic du système de fichiers</h1>";

echo "<h2>Configuration des répertoires</h2>";

// Test des fonctions
echo "<p><strong>getEntriesPath():</strong> " . (getEntriesPath() ?: 'ERREUR - Répertoire non trouvé') . "</p>";
echo "<p><strong>getAttachmentsPath():</strong> " . (getAttachmentsPath() ?: 'ERREUR - Répertoire non trouvé') . "</p>";
echo "<p><strong>getEntriesRelativePath():</strong> " . getEntriesRelativePath() . "</p>";
echo "<p><strong>getAttachmentsRelativePath():</strong> " . getAttachmentsRelativePath() . "</p>";

// Vérification des répertoires
echo "<h2>Vérification des répertoires</h2>";

$checks = [
    'data' => 'data',
    'data/entries' => 'data/entries',
    'data/attachments' => 'data/attachments'
];

foreach ($checks as $name => $path) {
    $exists = is_dir($path);
    $readable = $exists && is_readable($path);
    $writable = $exists && is_writable($path);
    
    echo "<p><strong>$name ($path):</strong> ";
    echo $exists ? "✓ Existe" : "✗ N'existe pas";
    echo " | ";
    echo $readable ? "✓ Lecture" : "✗ Lecture";
    echo " | ";
    echo $writable ? "✓ Écriture" : "✗ Écriture";
    
    if ($exists) {
        $perms = substr(sprintf('%o', fileperms($path)), -4);
        echo " | Permissions: $perms";
    }
    echo "</p>";
}

// Test d'écriture
echo "<h2>Test d'écriture</h2>";

$testFile = getEntriesRelativePath() . "test_write.html";
$testContent = "<h1>Test d'écriture - " . date('Y-m-d H:i:s') . "</h1>";

if (file_put_contents($testFile, $testContent)) {
    echo "<p>✓ Écriture réussie dans: $testFile</p>";
    
    if (file_exists($testFile)) {
        $content = file_get_contents($testFile);
        echo "<p>✓ Lecture réussie. Contenu: " . htmlspecialchars($content) . "</p>";
        
        // Nettoyage
        unlink($testFile);
        echo "<p>✓ Fichier de test supprimé</p>";
    } else {
        echo "<p>✗ Fichier non trouvé après écriture</p>";
    }
} else {
    echo "<p>✗ Échec de l'écriture dans: $testFile</p>";
}

// Liste des fichiers HTML existants
echo "<h2>Fichiers HTML existants</h2>";

$entriesPath = getEntriesPath();
if ($entriesPath && is_dir($entriesPath)) {
    $files = glob($entriesPath . "/*.html");
    if ($files) {
        echo "<ul>";
        foreach ($files as $file) {
            $size = filesize($file);
            $modified = date('Y-m-d H:i:s', filemtime($file));
            echo "<li>" . basename($file) . " ($size bytes, modifié: $modified)</li>";
        }
        echo "</ul>";
    } else {
        echo "<p>Aucun fichier HTML trouvé</p>";
    }
} else {
    echo "<p>Impossible d'accéder au répertoire des entrées</p>";
}

// Informations système
echo "<h2>Informations système</h2>";
echo "<p><strong>Répertoire de travail:</strong> " . getcwd() . "</p>";
echo "<p><strong>Utilisateur PHP:</strong> " . (function_exists('posix_getpwuid') ? posix_getpwuid(posix_geteuid())['name'] : 'Inconnu') . "</p>";
echo "<p><strong>UID PHP:</strong> " . (function_exists('posix_geteuid') ? posix_geteuid() : 'Inconnu') . "</p>";
echo "<p><strong>GID PHP:</strong> " . (function_exists('posix_getegid') ? posix_getegid() : 'Inconnu') . "</p>";
?>
