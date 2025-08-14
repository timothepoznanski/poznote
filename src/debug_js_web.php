<?php
require_once 'config.php';
require_once 'db_connect.php';

// Get the first note for testing using PDO
try {
    $stmconsole.log('Info JS:', " . json_encode($info_js) . ");

// Add test functions if they don't exist
if (typeof downloadFile === 'undefined') {
    window.downloadFile = function(filename, title) {
        console.log('downloadFile called:', filename, title);
        alert('Download function called with: ' + filename + ', ' + title);
    };
}

if (typeof showNoteInfo === 'undefined') {
    window.showNoteInfo = function(id, created, updated) {
        console.log('showNoteInfo called:', id, created, updated);
        alert('Info function called with ID: ' + id + ', Created: ' + created + ', Updated: ' + updated);
    };
}
</script>";

?>ELECT * FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    echo "<h3>Erreur base de données: " . htmlspecialchars($e->getMessage()) . "</h3>";
    exit;
}

if (!$row) {
    echo "<h3>Aucune note trouvée pour les tests.</h3>";
    exit;
}

echo "<h2>🔍 DIAGNOSTIC JAVASCRIPT DÉTAILLÉ</h2>";
echo "<style>body{font-family:monospace;margin:20px;} .error{color:red;} .success{color:green;} .warning{color:orange;}</style>";

echo "<h3>📋 Informations de la note</h3>";
echo "<strong>Note ID:</strong> " . $row['id'] . "<br>";
echo "<strong>Title:</strong> " . ($row['heading'] ?: 'Untitled note') . "<br>";
echo "<strong>Created:</strong> " . ($row['created'] ?? 'NULL') . "<br>";
echo "<strong>Updated:</strong> " . ($row['updated'] ?? 'NULL') . "<br><br>";

// Test all variables used in JavaScript generation
$title = htmlspecialchars_decode($row['heading'] ?: 'Untitled note');
$filename = 'data/entries/' . $row['id'] . '.html';

echo "<h3>🧪 VARIABLES AVANT ENCODAGE</h3>";
echo "<strong>Title raw:</strong> '" . htmlspecialchars($title) . "' (length: " . strlen($title) . ")<br>";
echo "<strong>Title type:</strong> " . gettype($title) . "<br>";
echo "<strong>Created raw:</strong> '" . htmlspecialchars($row['created'] ?? 'NULL') . "'<br>";
echo "<strong>Updated raw:</strong> '" . htmlspecialchars($row['updated'] ?? 'NULL') . "'<br><br>";

// Test JSON encoding with different flags
echo "<h3>🔒 TEST JSON ENCODING</h3>";

// Title encoding
$title_basic = json_encode($title);
$title_safe = json_encode($title, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
echo "<strong>Title json_encode():</strong> " . htmlspecialchars($title_basic ?: 'FAILED') . "<br>";
echo "<strong>Title safe encoding:</strong> " . htmlspecialchars($title_safe ?: 'FAILED') . "<br>";

// Date encoding  
$created_safe = $row['created'] ?? date('Y-m-d H:i:s');
$updated_safe = $row['updated'] ?? date('Y-m-d H:i:s');

$created_json = json_encode($created_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
$updated_json = json_encode($updated_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);

echo "<strong>Created json:</strong> " . htmlspecialchars($created_json ?: 'FAILED') . "<br>";
echo "<strong>Updated json:</strong> " . htmlspecialchars($updated_json ?: 'FAILED') . "<br><br>";

// Test final JavaScript generation
echo "<h3>⚙️ GÉNÉRATION JAVASCRIPT FINALE</h3>";

// Download button
$download_js = "downloadFile('$filename', " . ($title_safe ?: '"Note"') . ")";
echo "<strong>Download onclick:</strong> <code>" . htmlspecialchars($download_js) . "</code><br>";

// Info button  
$info_js = "showNoteInfo('" . $row['id'] . "', " . ($created_json ?: '"' . date('Y-m-d H:i:s') . '"') . ", " . ($updated_json ?: '"' . date('Y-m-d H:i:s') . '"') . ")";
echo "<strong>Info onclick:</strong> <code>" . htmlspecialchars($info_js) . "</code><br><br>";

// Test JavaScript syntax validation
echo "<h3>✅ VALIDATION SYNTAXE JAVASCRIPT</h3>";

// Test if the generated JS would be valid
$test_download = '<button onclick="' . $download_js . '">Test Download</button>';
$test_info = '<button onclick="' . $info_js . '">Test Info</button>';

echo "<strong>HTML Download button:</strong><br><code>" . htmlspecialchars($test_download) . "</code><br><br>";
echo "<strong>HTML Info button:</strong><br><code>" . htmlspecialchars($test_info) . "</code><br><br>";

// Check for potential issues
echo "<h3>⚠️ VÉRIFICATION D'ERREURS POTENTIELLES</h3>";

$issues = [];

if (strpos($title, "'") !== false) {
    $issues[] = "Title contains single quotes";
}
if (strpos($title, '"') !== false) {
    $issues[] = "Title contains double quotes";
}
if (strpos($title, "\n") !== false) {
    $issues[] = "Title contains newlines";
}
if (strpos($title, "\r") !== false) {
    $issues[] = "Title contains carriage returns";
}
if (!$created_json || $created_json === 'false') {
    $issues[] = "Created date JSON encoding failed";
}
if (!$updated_json || $updated_json === 'false') {
    $issues[] = "Updated date JSON encoding failed";
}
if (json_last_error() !== JSON_ERROR_NONE) {
    $issues[] = "JSON error: " . json_last_error_msg();
}

if (empty($issues)) {
    echo "<span class='success'>✅ Aucun problème détecté dans les données</span><br>";
} else {
    echo "<span class='error'>⚠️ Problèmes détectés:</span><br>";
    foreach ($issues as $issue) {
        echo "<span class='warning'>• $issue</span><br>";
    }
}

// Test actual buttons
echo "<h3>🧪 TESTS EN DIRECT</h3>";
echo "<p>Cliquez sur ces boutons pour tester :</p>";
echo $test_download . " ";
echo $test_info;

echo "<script>
console.log('=== DEBUG JAVASCRIPT ===');
console.log('Download JS:', " . json_encode($download_js) . ");
console.log('Info JS:', " . json_encode($info_js) . ");

// Add test functions if they don't exist
if (typeof downloadFile === 'undefined') {
    window.downloadFile = function(filename, title) {
        console.log('downloadFile called:', filename, title);
        alert('Download function called with: ' + filename + ', ' + title);
    };
}

if (typeof showNoteInfo === 'undefined') {
    window.showNoteInfo = function(id, created, updated) {
        console.log('showNoteInfo called:', id, created, updated);
        alert('Info function called with ID: ' + id + ', Created: ' + created + ', Updated: ' + updated);
    };
}
</script>";

$conn->close();
?>
