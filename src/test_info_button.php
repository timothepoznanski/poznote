<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

echo "<h1>Test du format des dates pour le bouton info</h1>";

// Récupérer quelques notes avec leurs dates
$stmt = $con->prepare("SELECT id, heading, created, updated FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 5");
$stmt->execute();

echo "<h2>Données de la base</h2>";
echo "<table border='1' style='border-collapse: collapse; width: 100%;'>";
echo "<tr><th>ID</th><th>Titre</th><th>Créé (brut)</th><th>Modifié (brut)</th><th>Créé (JSON)</th><th>Modifié (JSON)</th></tr>";

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $created_json = json_encode($row['created'], JSON_HEX_QUOT | JSON_HEX_APOS);
    $updated_json = json_encode($row['updated'], JSON_HEX_QUOT | JSON_HEX_APOS);
    
    echo "<tr>";
    echo "<td>" . $row['id'] . "</td>";
    echo "<td>" . htmlspecialchars($row['heading']) . "</td>";
    echo "<td>" . $row['created'] . "</td>";
    echo "<td>" . $row['updated'] . "</td>";
    echo "<td>" . $created_json . "</td>";
    echo "<td>" . $updated_json . "</td>";
    echo "</tr>";
}

echo "</table>";

// Test de génération du JavaScript
echo "<h2>Test de génération du JavaScript</h2>";
$stmt = $con->prepare("SELECT id, heading, created, updated FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
$stmt->execute();
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if ($row) {
    $created_json = json_encode($row['created'], JSON_HEX_QUOT | JSON_HEX_APOS);
    $updated_json = json_encode($row['updated'], JSON_HEX_QUOT | JSON_HEX_APOS);
    
    echo "<p><strong>Note testée:</strong> " . htmlspecialchars($row['heading']) . " (ID: " . $row['id'] . ")</p>";
    echo "<p><strong>JavaScript généré:</strong></p>";
    echo "<code style='background: #f8f8f8; padding: 10px; display: block; font-family: monospace;'>";
    echo "showNoteInfo('" . $row['id'] . "', " . $created_json . ", " . $updated_json . ")";
    echo "</code>";
    
    echo "<h3>Test JavaScript en direct</h3>";
    echo "<button onclick=\"showNoteInfo('" . $row['id'] . "', " . $created_json . ", " . $updated_json . ")\">Tester le bouton info</button>";
    
    echo "<script>";
    echo "console.log('Test avec les données:', {";
    echo "id: '" . $row['id'] . "',";
    echo "created: " . $created_json . ",";
    echo "updated: " . $updated_json;
    echo "});";
    echo "</script>";
}

// Test de formatage des dates
echo "<h2>Test de formatage des dates</h2>";
$test_date = "2025-08-14 17:07:24";
echo "<p><strong>Date test:</strong> $test_date</p>";

echo "<script>";
echo "console.log('=== Test de formatage des dates ===');";
echo "var testDate = new Date('$test_date');";
echo "console.log('Date originale:', '$test_date');";
echo "console.log('Date parsée:', testDate);";
echo "console.log('Date formatée FR:', testDate.toLocaleString('fr-FR'));";
echo "console.log('Date formatée avec options:', testDate.toLocaleString('fr-FR', {";
echo "    year: 'numeric',";
echo "    month: '2-digit',";
echo "    day: '2-digit',";
echo "    hour: '2-digit',";
echo "    minute: '2-digit',";
echo "    second: '2-digit'";
echo "}));";
echo "</script>";
?>
