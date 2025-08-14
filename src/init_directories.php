<?php
// Script d'initialisation des répertoires avec permissions correctes
ini_set('display_errors', 1);
error_reporting(E_ALL);

echo "<h1>Initialisation des répertoires Poznote</h1>";

// Fonction pour créer un répertoire avec les bonnes permissions
function createDirectoryWithPermissions($path, $permissions = 0775) {
    echo "<h3>Création/vérification de: $path</h3>";
    
    if (!is_dir($path)) {
        echo "<p>Répertoire n'existe pas, création en cours...</p>";
        if (mkdir($path, $permissions, true)) {
            echo "<p style='color: green;'>✓ Répertoire créé</p>";
        } else {
            echo "<p style='color: red;'>✗ Échec de création du répertoire</p>";
            return false;
        }
    } else {
        echo "<p style='color: blue;'>ℹ Répertoire existe déjà</p>";
    }
    
    // Vérifier et corriger les permissions
    $current_perms = fileperms($path);
    echo "<p>Permissions actuelles: " . sprintf('%o', $current_perms) . "</p>";
    
    if (chmod($path, $permissions)) {
        echo "<p style='color: green;'>✓ Permissions définies à " . sprintf('%o', $permissions) . "</p>";
    } else {
        echo "<p style='color: orange;'>⚠ Impossible de modifier les permissions</p>";
    }
    
    // Tenter de changer le propriétaire (si on est root)
    if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
        if (chown($path, 'www-data') && chgrp($path, 'www-data')) {
            echo "<p style='color: green;'>✓ Propriétaire changé vers www-data</p>";
        } else {
            echo "<p style='color: orange;'>⚠ Impossible de changer le propriétaire</p>";
        }
    }
    
    // Test d'écriture
    $test_file = $path . '/test_write_' . time() . '.tmp';
    if (file_put_contents($test_file, 'test') !== false) {
        echo "<p style='color: green;'>✓ Test d'écriture réussi</p>";
        unlink($test_file);
    } else {
        echo "<p style='color: red;'>✗ Test d'écriture échoué</p>";
        return false;
    }
    
    return true;
}

// Répertoires à créer/vérifier
$directories = [
    'data' => 0775,
    'data/entries' => 0775,
    'data/attachments' => 0777  // Plus permissif pour les attachments
];

$all_success = true;

foreach ($directories as $dir => $perms) {
    if (!createDirectoryWithPermissions($dir, $perms)) {
        $all_success = false;
    }
    echo "<hr>";
}

// Résumé
echo "<h2>Résumé</h2>";
if ($all_success) {
    echo "<p style='color: green; font-weight: bold;'>✓ Tous les répertoires sont prêts</p>";
} else {
    echo "<p style='color: red; font-weight: bold;'>✗ Problèmes détectés avec certains répertoires</p>";
}

// Informations système
echo "<h2>Informations système</h2>";
echo "<p><strong>Utilisateur PHP:</strong> " . (function_exists('posix_getpwuid') && function_exists('posix_geteuid') ? posix_getpwuid(posix_geteuid())['name'] : 'Inconnu') . "</p>";
echo "<p><strong>UID:</strong> " . (function_exists('posix_geteuid') ? posix_geteuid() : 'Inconnu') . "</p>";
echo "<p><strong>GID:</strong> " . (function_exists('posix_getegid') ? posix_getegid() : 'Inconnu') . "</p>";
echo "<p><strong>Répertoire de travail:</strong> " . getcwd() . "</p>";

// Test final avec une simulation d'écriture de note
echo "<h2>Test final - Simulation d'écriture de note</h2>";
include 'functions.php';

$test_id = '99999';
$test_content = '<h1>Test Note</h1><p>Contenu de test créé le ' . date('Y-m-d H:i:s') . '</p>';
$filename = getEntriesRelativePath() . $test_id . '.html';

echo "<p><strong>Fichier cible:</strong> $filename</p>";

$result = file_put_contents($filename, $test_content);
if ($result !== false) {
    echo "<p style='color: green;'>✓ Écriture de note simulée réussie ($result bytes)</p>";
    
    // Vérifier la lecture
    if (file_exists($filename) && file_get_contents($filename) === $test_content) {
        echo "<p style='color: green;'>✓ Lecture de note simulée réussie</p>";
        unlink($filename);
        echo "<p>✓ Fichier de test nettoyé</p>";
    } else {
        echo "<p style='color: red;'>✗ Problème avec la lecture du fichier</p>";
    }
} else {
    echo "<p style='color: red;'>✗ Échec de l'écriture de note simulée</p>";
    $error = error_get_last();
    if ($error) {
        echo "<p><strong>Erreur:</strong> " . $error['message'] . "</p>";
    }
}
?>
