<?php
// Script de test complet pour simuler la sauvegarde d'une note
ini_set('display_errors', 1);
error_reporting(E_ALL);

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'functions.php';
include 'db_connect.php';

echo "<h1>Test complet de sauvegarde de note</h1>";

// Créer une note de test
echo "<h2>1. Création d'une note de test</h2>";

$test_folder = 'Test';
$created_date = date("Y-m-d H:i:s");

$query = "INSERT INTO entries (heading, entry, folder, created, updated) VALUES ('Test Note', '', ?, ?, ?)";
$stmt = $con->prepare($query);

if ($stmt->execute([$test_folder, $created_date, $created_date])) {
    $test_id = $con->lastInsertId();
    echo "<p style='color: green;'>✓ Note de test créée avec l'ID: $test_id</p>";
} else {
    echo "<p style='color: red;'>✗ Échec de création de la note de test</p>";
    die();
}

// Simuler une mise à jour de note avec contenu HTML
echo "<h2>2. Simulation de mise à jour avec contenu HTML</h2>";

$test_heading = "Note de test mise à jour";
$test_entry = "<h1>Titre de test</h1><p>Ceci est un <strong>test</strong> de contenu HTML.</p><p>Créé le: " . date('Y-m-d H:i:s') . "</p>";
$test_entrycontent = "Note de test mise à jour - Titre de test - Ceci est un test de contenu HTML. Créé le: " . date('Y-m-d H:i:s');
$test_tags = "test,debug";

echo "<p><strong>ID de la note:</strong> $test_id</p>";
echo "<p><strong>Titre:</strong> $test_heading</p>";
echo "<p><strong>Contenu HTML (longueur):</strong> " . strlen($test_entry) . " caractères</p>";
echo "<p><strong>Contenu texte (longueur):</strong> " . strlen($test_entrycontent) . " caractères</p>";

// Construire le nom de fichier
$filename = getEntriesRelativePath() . $test_id . ".html";
echo "<p><strong>Fichier cible:</strong> $filename</p>";

// Vérifications pré-écriture
echo "<h3>Vérifications pré-écriture</h3>";
$dir = dirname($filename);
echo "<p><strong>Répertoire:</strong> $dir</p>";
echo "<p><strong>Répertoire existe:</strong> " . (is_dir($dir) ? "✓ Oui" : "✗ Non") . "</p>";
echo "<p><strong>Répertoire accessible en lecture:</strong> " . (is_readable($dir) ? "✓ Oui" : "✗ Non") . "</p>";
echo "<p><strong>Répertoire accessible en écriture:</strong> " . (is_writable($dir) ? "✓ Oui" : "✗ Non") . "</p>";

if (file_exists($filename)) {
    echo "<p><strong>Fichier existe déjà:</strong> ✓ Oui (taille: " . filesize($filename) . " bytes)</p>";
    echo "<p><strong>Fichier accessible en écriture:</strong> " . (is_writable($filename) ? "✓ Oui" : "✗ Non") . "</p>";
} else {
    echo "<p><strong>Fichier existe déjà:</strong> ✗ Non (sera créé)</p>";
}

// Tentative d'écriture
echo "<h3>Tentative d'écriture du fichier HTML</h3>";
$write_result = file_put_contents($filename, $test_entry);

if ($write_result === false) {
    echo "<p style='color: red;'>✗ Échec de l'écriture</p>";
    $error = error_get_last();
    if ($error) {
        echo "<p><strong>Erreur PHP:</strong> " . $error['message'] . "</p>";
    }
} else {
    echo "<p style='color: green;'>✓ Écriture réussie ($write_result bytes écrits)</p>";
    
    // Vérification post-écriture
    if (file_exists($filename)) {
        $file_size = filesize($filename);
        echo "<p style='color: green;'>✓ Fichier existe après écriture (taille: $file_size bytes)</p>";
        
        // Vérifier le contenu
        $read_content = file_get_contents($filename);
        if ($read_content === $test_entry) {
            echo "<p style='color: green;'>✓ Contenu lu correspond au contenu écrit</p>";
        } else {
            echo "<p style='color: orange;'>⚠ Contenu lu diffère du contenu écrit</p>";
            echo "<p><strong>Longueur écrite:</strong> " . strlen($test_entry) . "</p>";
            echo "<p><strong>Longueur lue:</strong> " . strlen($read_content) . "</p>";
        }
    } else {
        echo "<p style='color: red;'>✗ Fichier n'existe pas après écriture</p>";
    }
}

// Mise à jour de la base de données
echo "<h3>Mise à jour de la base de données</h3>";
$updated_date = date("Y-m-d H:i:s");

$query = "UPDATE entries SET heading = ?, entry = ?, updated = ?, tags = ?, folder = ? WHERE id = ?";
$stmt = $con->prepare($query);

if ($stmt->execute([$test_heading, $test_entrycontent, $updated_date, $test_tags, $test_folder, $test_id])) {
    echo "<p style='color: green;'>✓ Base de données mise à jour</p>";
} else {
    echo "<p style='color: red;'>✗ Échec de mise à jour de la base de données</p>";
    echo "<p><strong>Erreur:</strong> " . implode(' - ', $stmt->errorInfo()) . "</p>";
}

// Vérification finale - lecture de la note
echo "<h2>3. Vérification finale - lecture de la note</h2>";

$query = "SELECT * FROM entries WHERE id = ?";
$stmt = $con->prepare($query);
$stmt->execute([$test_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if ($row) {
    echo "<p><strong>Note trouvée en base:</strong></p>";
    echo "<ul>";
    echo "<li><strong>ID:</strong> " . $row['id'] . "</li>";
    echo "<li><strong>Titre:</strong> " . htmlspecialchars($row['heading']) . "</li>";
    echo "<li><strong>Contenu (base):</strong> " . strlen($row['entry']) . " caractères</li>";
    echo "<li><strong>Tags:</strong> " . htmlspecialchars($row['tags']) . "</li>";
    echo "<li><strong>Dossier:</strong> " . htmlspecialchars($row['folder']) . "</li>";
    echo "<li><strong>Créé:</strong> " . $row['created'] . "</li>";
    echo "<li><strong>Mis à jour:</strong> " . $row['updated'] . "</li>";
    echo "</ul>";
    
    // Lire le fichier HTML
    if (file_exists($filename)) {
        $html_content = file_get_contents($filename);
        echo "<p><strong>Fichier HTML:</strong> " . strlen($html_content) . " caractères</p>";
        echo "<p><strong>Contenu HTML:</strong></p>";
        echo "<div style='border: 1px solid #ccc; padding: 10px; background: #f9f9f9;'>";
        echo htmlspecialchars($html_content);
        echo "</div>";
        echo "<p><strong>Rendu HTML:</strong></p>";
        echo "<div style='border: 1px solid #ccc; padding: 10px; background: #fff;'>";
        echo $html_content;
        echo "</div>";
    } else {
        echo "<p style='color: red;'>✗ Fichier HTML non trouvé</p>";
    }
} else {
    echo "<p style='color: red;'>✗ Note non trouvée en base de données</p>";
}

// Nettoyage
echo "<h2>4. Nettoyage</h2>";
$query = "DELETE FROM entries WHERE id = ?";
$stmt = $con->prepare($query);
if ($stmt->execute([$test_id])) {
    echo "<p>✓ Note de test supprimée de la base</p>";
}

if (file_exists($filename)) {
    if (unlink($filename)) {
        echo "<p>✓ Fichier HTML de test supprimé</p>";
    } else {
        echo "<p style='color: orange;'>⚠ Impossible de supprimer le fichier HTML de test</p>";
    }
}

echo "<p><strong>Test terminé.</strong></p>";
?>
