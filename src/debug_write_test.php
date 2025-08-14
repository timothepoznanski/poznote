<?php
// Script de débogage pour tester l'écriture de fichiers HTML
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

include 'functions.php';

echo "<h1>Test d'écriture de fichier HTML</h1>";

// Test des chemins
echo "<h2>1. Vérification des chemins</h2>";
echo "<p><strong>Répertoire de travail actuel:</strong> " . getcwd() . "</p>";
echo "<p><strong>getEntriesRelativePath():</strong> " . getEntriesRelativePath() . "</p>";

// Test d'écriture avec un ID de test
$test_id = "999";
$test_content = "<h1>Test de contenu HTML</h1><p>Créé le: " . date('Y-m-d H:i:s') . "</p>";
$filename = getEntriesRelativePath() . $test_id . ".html";

echo "<h2>2. Test d'écriture</h2>";
echo "<p><strong>Fichier cible:</strong> $filename</p>";

// Vérifier si le répertoire existe
$dir = dirname($filename);
echo "<p><strong>Répertoire parent:</strong> $dir</p>";
echo "<p><strong>Répertoire existe:</strong> " . (is_dir($dir) ? "✓ Oui" : "✗ Non") . "</p>";
echo "<p><strong>Répertoire writable:</strong> " . (is_writable($dir) ? "✓ Oui" : "✗ Non") . "</p>";

// Tentative d'écriture
echo "<h3>Tentative d'écriture...</h3>";
$result = file_put_contents($filename, $test_content);

if ($result === false) {
    echo "<p style='color: red;'>✗ Échec de l'écriture</p>";
    $error = error_get_last();
    if ($error) {
        echo "<p><strong>Dernière erreur PHP:</strong> " . $error['message'] . "</p>";
    }
} else {
    echo "<p style='color: green;'>✓ Écriture réussie ($result bytes)</p>";
    
    // Vérifier si le fichier existe vraiment
    if (file_exists($filename)) {
        echo "<p style='color: green;'>✓ Fichier existe après écriture</p>";
        
        // Lire le contenu
        $read_content = file_get_contents($filename);
        if ($read_content === $test_content) {
            echo "<p style='color: green;'>✓ Contenu lu correspond au contenu écrit</p>";
        } else {
            echo "<p style='color: orange;'>⚠ Contenu lu diffère du contenu écrit</p>";
            echo "<p><strong>Écrit:</strong> " . htmlspecialchars($test_content) . "</p>";
            echo "<p><strong>Lu:</strong> " . htmlspecialchars($read_content) . "</p>";
        }
        
        // Nettoyer le fichier de test
        unlink($filename);
        echo "<p>✓ Fichier de test supprimé</p>";
    } else {
        echo "<p style='color: red;'>✗ Fichier n'existe pas après écriture</p>";
    }
}

// Test avec les permissions
echo "<h2>3. Informations de permissions</h2>";
if (is_dir($dir)) {
    $perms = fileperms($dir);
    printf("<p><strong>Permissions du répertoire:</strong> %o</p>", $perms);
    
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $owner_info = posix_getpwuid(posix_geteuid());
        echo "<p><strong>Processus PHP s'exécute sous:</strong> " . $owner_info['name'] . " (UID: " . posix_geteuid() . ")</p>";
    }
}

// Lister le contenu du répertoire entries
echo "<h2>4. Contenu du répertoire entries</h2>";
$entries_path = getEntriesPath();
if ($entries_path && is_dir($entries_path)) {
    echo "<p><strong>Chemin complet:</strong> $entries_path</p>";
    $files = scandir($entries_path);
    echo "<ul>";
    foreach ($files as $file) {
        if ($file !== '.' && $file !== '..') {
            $filepath = $entries_path . '/' . $file;
            $size = is_file($filepath) ? filesize($filepath) : 'N/A';
            $type = is_file($filepath) ? 'Fichier' : 'Répertoire';
            echo "<li>$file ($type, $size bytes)</li>";
        }
    }
    echo "</ul>";
} else {
    echo "<p style='color: red;'>Répertoire entries introuvable</p>";
}

echo "<h2>5. Test simulation updatenote.php</h2>";
// Simuler ce qui se passe dans updatenote.php
$sim_id = "998";
$sim_entry = "<h1>Simulation updatenote</h1><p>Test: " . date('H:i:s') . "</p>";
$sim_filename = getEntriesRelativePath() . $sim_id . ".html";

echo "<p><strong>Simulation avec ID:</strong> $sim_id</p>";
echo "<p><strong>Fichier:</strong> $sim_filename</p>";

$sim_result = file_put_contents($sim_filename, $sim_entry);
echo "<p><strong>Résultat file_put_contents:</strong> " . var_export($sim_result, true) . "</p>";

if ($sim_result !== false && file_exists($sim_filename)) {
    echo "<p style='color: green;'>✓ Simulation réussie</p>";
    unlink($sim_filename);
} else {
    echo "<p style='color: red;'>✗ Simulation échouée</p>";
}
?>
