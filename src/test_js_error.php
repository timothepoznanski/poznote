<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

echo "<h1>Test de génération JavaScript pour bouton info</h1>";

// Récupérer une note pour tester
$stmt = $con->prepare("SELECT id, heading, created, updated FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
$stmt->execute();
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    echo "<p>Aucune note trouvée pour le test</p>";
    exit;
}

echo "<h2>Données de la note</h2>";
echo "<p><strong>ID:</strong> " . $row['id'] . "</p>";
echo "<p><strong>Titre:</strong> " . htmlspecialchars($row['heading']) . "</p>";
echo "<p><strong>Créé (brut):</strong> " . $row['created'] . "</p>";
echo "<p><strong>Modifié (brut):</strong> " . $row['updated'] . "</p>";

echo "<h2>Test d'encodage JSON</h2>";

// Test 1: Encodage simple
$created_json_simple = json_encode($row['created']);
$updated_json_simple = json_encode($row['updated']);

echo "<p><strong>JSON simple:</strong></p>";
echo "<p>Created: " . htmlspecialchars($created_json_simple) . "</p>";
echo "<p>Updated: " . htmlspecialchars($updated_json_simple) . "</p>";

// Test 2: Encodage avec flags (version actuelle)
$created_json_flags = json_encode($row['created'], JSON_HEX_QUOT | JSON_HEX_APOS);
$updated_json_flags = json_encode($row['updated'], JSON_HEX_QUOT | JSON_HEX_APOS);

echo "<p><strong>JSON avec flags:</strong></p>";
echo "<p>Created: " . htmlspecialchars($created_json_flags) . "</p>";
echo "<p>Updated: " . htmlspecialchars($updated_json_flags) . "</p>";

// Test 3: Encodage avec protection (nouvelle version)
$created_safe = $row['created'] ?? date('Y-m-d H:i:s');
$updated_safe = $row['updated'] ?? date('Y-m-d H:i:s');
$created_json_safe = json_encode($created_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
$updated_json_safe = json_encode($updated_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);

if ($created_json_safe === false) $created_json_safe = '"' . date('Y-m-d H:i:s') . '"';
if ($updated_json_safe === false) $updated_json_safe = '"' . date('Y-m-d H:i:s') . '"';

echo "<p><strong>JSON avec protection:</strong></p>";
echo "<p>Created: " . htmlspecialchars($created_json_safe) . "</p>";
echo "<p>Updated: " . htmlspecialchars($updated_json_safe) . "</p>";

echo "<h2>JavaScript généré</h2>";

// Version originale
echo "<h3>Version originale:</h3>";
echo "<code style='background: #f8f8f8; padding: 10px; display: block;'>";
echo "showNoteInfo('" . $row['id'] . "', " . $created_json_flags . ", " . $updated_json_flags . ")";
echo "</code>";

// Version sécurisée
echo "<h3>Version sécurisée:</h3>";
echo "<code style='background: #f8f8f8; padding: 10px; display: block;'>";
echo "showNoteInfo('" . $row['id'] . "', " . $created_json_safe . ", " . $updated_json_safe . ")";
echo "</code>";

echo "<h2>Test de validité JavaScript</h2>";

// Test des boutons
echo "<p>Testez les boutons ci-dessous :</p>";

echo "<h3>Bouton version originale:</h3>";
echo '<button onclick="showNoteInfo(\'' . $row['id'] . '\', ' . $created_json_flags . ', ' . $updated_json_flags . ')">Test version originale</button>';

echo "<h3>Bouton version sécurisée:</h3>";
echo '<button onclick="showNoteInfo(\'' . $row['id'] . '\', ' . $created_json_safe . ', ' . $updated_json_safe . ')">Test version sécurisée</button>';

echo "<h2>Vérifications supplémentaires</h2>";

// Vérifier les erreurs JSON
echo "<p><strong>Erreurs JSON:</strong></p>";
echo "<p>json_last_error(): " . json_last_error() . "</p>";
echo "<p>json_last_error_msg(): " . json_last_error_msg() . "</p>";

// Vérifier le contenu des dates
echo "<p><strong>Analyse des dates:</strong></p>";
echo "<p>Type created: " . gettype($row['created']) . "</p>";
echo "<p>Type updated: " . gettype($row['updated']) . "</p>";
echo "<p>Longueur created: " . strlen($row['created']) . "</p>";
echo "<p>Longueur updated: " . strlen($row['updated']) . "</p>";

// Afficher en hexadécimal pour détecter des caractères étranges
echo "<p>Created (hex): " . bin2hex($row['created']) . "</p>";
echo "<p>Updated (hex): " . bin2hex($row['updated']) . "</p>";

?>

<script>
console.log("=== Test JavaScript ===");
console.log("Version originale:");
console.log("showNoteInfo('<?php echo $row['id']; ?>', <?php echo $created_json_flags; ?>, <?php echo $updated_json_flags; ?>)");

console.log("Version sécurisée:");
console.log("showNoteInfo('<?php echo $row['id']; ?>', <?php echo $created_json_safe; ?>, <?php echo $updated_json_safe; ?>)");

// Test de parsing des dates
try {
    var dateCreated = new Date(<?php echo $created_json_safe; ?>);
    var dateUpdated = new Date(<?php echo $updated_json_safe; ?>);
    console.log("Dates parsées avec succès:");
    console.log("Created:", dateCreated);
    console.log("Updated:", dateUpdated);
} catch (e) {
    console.error("Erreur lors du parsing des dates:", e);
}
</script>
