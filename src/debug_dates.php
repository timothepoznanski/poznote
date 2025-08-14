<?php
require_once 'config.php';
require_once 'db_connect.php';

echo "<h2>🔍 DIAGNOSTIC COMPLET DES DATES SQLITE</h2>";
echo "<style>body{font-family:monospace;margin:20px;} .error{color:red;} .success{color:green;} .warning{color:orange;} pre{background:#f5f5f5;padding:10px;border:1px solid #ddd;}</style>";

try {
    // Get a few notes to examine the date formats
    $stmt = $con->prepare("SELECT id, heading, created, updated FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 5");
    $stmt->execute();
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($notes)) {
        echo "<h3 class='error'>❌ Aucune note trouvée dans la base</h3>";
        exit;
    }

    echo "<h3>📋 Échantillon de notes de la base SQLite :</h3>";
    echo "<table border='1' style='border-collapse:collapse;'>";
    echo "<tr><th>ID</th><th>Titre</th><th>Created (raw)</th><th>Updated (raw)</th><th>Type Created</th><th>Type Updated</th></tr>";
    
    foreach ($notes as $note) {
        echo "<tr>";
        echo "<td>" . htmlspecialchars($note['id']) . "</td>";
        echo "<td>" . htmlspecialchars($note['heading'] ?: 'Sans titre') . "</td>";
        echo "<td>" . htmlspecialchars($note['created'] ?? 'NULL') . "</td>";
        echo "<td>" . htmlspecialchars($note['updated'] ?? 'NULL') . "</td>";
        echo "<td>" . gettype($note['created']) . "</td>";
        echo "<td>" . gettype($note['updated']) . "</td>";
        echo "</tr>";
    }
    echo "</table>";

    // Test avec la première note
    $testNote = $notes[0];
    echo "<h3>🧪 Tests d'encodage avec la note ID: " . $testNote['id'] . "</h3>";
    
    echo "<h4>📅 Analyse des dates :</h4>";
    echo "<strong>Created original:</strong> " . var_export($testNote['created'], true) . "<br>";
    echo "<strong>Updated original:</strong> " . var_export($testNote['updated'], true) . "<br><br>";

    // Test different encoding approaches
    echo "<h4>🔒 Tests d'encodage JSON :</h4>";
    
    // Method 1: Direct encoding
    $created_direct = json_encode($testNote['created']);
    $updated_direct = json_encode($testNote['updated']);
    echo "<strong>Encodage direct:</strong><br>";
    echo "Created: " . htmlspecialchars($created_direct ?: 'FAILED') . "<br>";
    echo "Updated: " . htmlspecialchars($updated_direct ?: 'FAILED') . "<br>";
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "<span class='error'>Erreur JSON: " . json_last_error_msg() . "</span><br>";
    }
    echo "<br>";

    // Method 2: With safety checks
    $created_safe = $testNote['created'] ?? date('Y-m-d H:i:s');
    $updated_safe = $testNote['updated'] ?? date('Y-m-d H:i:s');
    
    $created_safe_json = json_encode($created_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
    $updated_safe_json = json_encode($updated_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
    
    echo "<strong>Encodage sécurisé avec flags:</strong><br>";
    echo "Created: " . htmlspecialchars($created_safe_json ?: 'FAILED') . "<br>";
    echo "Updated: " . htmlspecialchars($updated_safe_json ?: 'FAILED') . "<br>";
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "<span class='error'>Erreur JSON: " . json_last_error_msg() . "</span><br>";
    }
    echo "<br>";

    // Method 3: Clean and validate
    echo "<strong>Nettoyage et validation:</strong><br>";
    
    // Clean the dates
    $created_clean = trim($testNote['created'] ?? '');
    $updated_clean = trim($testNote['updated'] ?? '');
    
    // Check if they are valid dates
    $created_timestamp = strtotime($created_clean);
    $updated_timestamp = strtotime($updated_clean);
    
    echo "Created timestamp: " . ($created_timestamp ?: 'INVALID') . "<br>";
    echo "Updated timestamp: " . ($updated_timestamp ?: 'INVALID') . "<br>";
    
    if ($created_timestamp) {
        $created_formatted = date('Y-m-d H:i:s', $created_timestamp);
        echo "Created formatted: " . $created_formatted . "<br>";
    }
    if ($updated_timestamp) {
        $updated_formatted = date('Y-m-d H:i:s', $updated_timestamp);
        echo "Updated formatted: " . $updated_formatted . "<br>";
    }
    echo "<br>";

    // Method 4: Test final JavaScript generation
    echo "<h4>⚡ Test de génération JavaScript finale :</h4>";
    
    // Use the safest approach
    $final_created = $created_timestamp ? date('Y-m-d H:i:s', $created_timestamp) : date('Y-m-d H:i:s');
    $final_updated = $updated_timestamp ? date('Y-m-d H:i:s', $updated_timestamp) : date('Y-m-d H:i:s');
    
    $final_created_json = json_encode($final_created, JSON_HEX_QUOT | JSON_HEX_APOS);
    $final_updated_json = json_encode($final_updated, JSON_HEX_QUOT | JSON_HEX_APOS);
    
    if ($final_created_json === false) $final_created_json = '"' . date('Y-m-d H:i:s') . '"';
    if ($final_updated_json === false) $final_updated_json = '"' . date('Y-m-d H:i:s') . '"';
    
    echo "Final created JSON: " . htmlspecialchars($final_created_json) . "<br>";
    echo "Final updated JSON: " . htmlspecialchars($final_updated_json) . "<br>";
    
    $js_call = "showNoteInfo('" . $testNote['id'] . "', " . $final_created_json . ", " . $final_updated_json . ")";
    echo "<strong>Appel JavaScript généré:</strong><br>";
    echo "<code>" . htmlspecialchars($js_call) . "</code><br><br>";

    // Test the title encoding too (for download button)
    echo "<h4>📝 Test du titre pour le bouton téléchargement :</h4>";
    $title = htmlspecialchars_decode($testNote['heading'] ?: 'Untitled note');
    $title_json = json_encode($title, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
    if ($title_json === false) $title_json = '"Note"';
    
    echo "Titre original: " . htmlspecialchars($title) . "<br>";
    echo "Titre JSON: " . htmlspecialchars($title_json) . "<br>";
    
    $filename = 'data/entries/' . $testNote['id'] . '.html';
    $download_js = "downloadFile('" . $filename . "', " . $title_json . ")";
    echo "<strong>Appel download JavaScript:</strong><br>";
    echo "<code>" . htmlspecialchars($download_js) . "</code><br>";

    // Test buttons
    echo "<h3>🧪 BOUTONS DE TEST EN DIRECT :</h3>";
    echo "<p>Testez ces boutons avec les données réelles :</p>";
    echo '<button onclick="' . $js_call . '">Test Info avec dates</button> ';
    echo '<button onclick="' . $download_js . '">Test Download</button>';

    echo "<script>
    // Add test functions if they don't exist
    if (typeof showNoteInfo === 'undefined') {
        window.showNoteInfo = function(id, created, updated) {
            alert('Note Info:\\nID: ' + id + '\\nCreated: ' + created + '\\nUpdated: ' + updated);
        };
    }
    
    if (typeof downloadFile === 'undefined') {
        window.downloadFile = function(filename, title) {
            alert('Download:\\nFile: ' + filename + '\\nTitle: ' + title);
        };
    }
    
    console.log('Test JavaScript calls:');
    console.log('Info: " . json_encode($js_call) . ");
    console.log('Download: " . json_encode($download_js) . ");
    </script>";

} catch (Exception $e) {
    echo "<h3 class='error'>❌ Erreur: " . htmlspecialchars($e->getMessage()) . "</h3>";
}
?>
