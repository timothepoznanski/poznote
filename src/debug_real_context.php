<?php
require_once 'config.php';
require_once 'db_connect.php';

echo "<h2>🔍 Test dans le contexte réel de Poznote</h2>";
echo "<style>body{font-family:monospace;margin:20px;} .error{color:red;} .success{color:green;}</style>";

// Reproduire exactement la même logique que index.php
try {
    // Same query as index.php line 495
    $where_clause = "trash = 0";
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    
    echo "<h3>Requête utilisée:</h3>";
    echo "<code>" . htmlspecialchars($query_right_secure) . "</code><br><br>";
    
    $res_right = $con->prepare($query_right_secure);
    $res_right->execute();
    
    if ($res_right) {
        while($row = $res_right->fetch(PDO::FETCH_ASSOC)) {
            echo "<h3>✅ Données récupérées:</h3>";
            echo "<strong>ID:</strong> " . htmlspecialchars($row['id'] ?? 'MISSING') . "<br>";
            echo "<strong>Heading:</strong> " . htmlspecialchars($row['heading'] ?? 'MISSING') . "<br>";
            echo "<strong>Created (raw):</strong> " . htmlspecialchars($row['created'] ?? 'MISSING') . "<br>";
            echo "<strong>Updated (raw):</strong> " . htmlspecialchars($row['updated'] ?? 'MISSING') . "<br>";
            echo "<strong>Attachments:</strong> " . htmlspecialchars($row['attachments'] ?? 'MISSING') . "<br>";
            echo "<strong>Favorite:</strong> " . htmlspecialchars($row['favorite'] ?? 'MISSING') . "<br><br>";
            
            // Test exact same logic as index.php
            $title = $row['heading'];
            $filename = 'data/entries/' . $row["id"] . ".html";
            
            // Encode title safely for JavaScript
            $title_safe = $title ?? 'Note';
            $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE);
            if ($title_json === false) $title_json = '"Note"';
            
            // Generate dates safely for JavaScript with robust encoding
            $created_raw = $row['created'] ?? '';
            $updated_raw = $row['updated'] ?? '';
            
            echo "<h3>🧪 Traitement des dates:</h3>";
            echo "<strong>Created raw:</strong> '" . htmlspecialchars($created_raw) . "'<br>";
            echo "<strong>Updated raw:</strong> '" . htmlspecialchars($updated_raw) . "'<br>";
            
            // Clean and validate dates
            $created_clean = trim($created_raw);
            $updated_clean = trim($updated_raw);
            
            echo "<strong>Created clean:</strong> '" . htmlspecialchars($created_clean) . "'<br>";
            echo "<strong>Updated clean:</strong> '" . htmlspecialchars($updated_clean) . "'<br>";
            
            // Use timestamp validation and formatting for safety
            $created_timestamp = strtotime($created_clean);
            $updated_timestamp = strtotime($updated_clean);
            
            echo "<strong>Created timestamp:</strong> " . ($created_timestamp ?: 'FAILED') . "<br>";
            echo "<strong>Updated timestamp:</strong> " . ($updated_timestamp ?: 'FAILED') . "<br>";
            
            $final_created = $created_timestamp ? date('Y-m-d H:i:s', $created_timestamp) : date('Y-m-d H:i:s');
            $final_updated = $updated_timestamp ? date('Y-m-d H:i:s', $updated_timestamp) : date('Y-m-d H:i:s');
            
            echo "<strong>Final created:</strong> '" . htmlspecialchars($final_created) . "'<br>";
            echo "<strong>Final updated:</strong> '" . htmlspecialchars($final_updated) . "'<br>";
            
            // Encode with minimal flags to avoid issues
            $created_json = json_encode($final_created, JSON_HEX_QUOT | JSON_HEX_APOS);
            $updated_json = json_encode($final_updated, JSON_HEX_QUOT | JSON_HEX_APOS);
            
            echo "<strong>Created JSON:</strong> " . htmlspecialchars($created_json ?: 'FAILED') . "<br>";
            echo "<strong>Updated JSON:</strong> " . htmlspecialchars($updated_json ?: 'FAILED') . "<br>";
            
            // Final safety check
            if ($created_json === false) $created_json = '"' . date('Y-m-d H:i:s') . '"';
            if ($updated_json === false) $updated_json = '"' . date('Y-m-d H:i:s') . '"';
            
            echo "<strong>Final Created JSON:</strong> " . htmlspecialchars($created_json) . "<br>";
            echo "<strong>Final Updated JSON:</strong> " . htmlspecialchars($updated_json) . "<br><br>";
            
            // Generate final JavaScript calls
            $info_js = "showNoteInfo('" . $row['id'] . "', " . $created_json . ", " . $updated_json . ")";
            $download_js = "downloadFile('" . $filename . "', " . $title_json . ")";
            
            echo "<h3>⚡ JavaScript généré:</h3>";
            echo "<strong>Info call:</strong> <code>" . htmlspecialchars($info_js) . "</code><br>";
            echo "<strong>Download call:</strong> <code>" . htmlspecialchars($download_js) . "</code><br><br>";
            
            echo "<h3>🧪 Test en direct:</h3>";
            echo '<button onclick="' . $info_js . '">Test Info</button> ';
            echo '<button onclick="' . $download_js . '">Test Download</button>';
            
            // Debug all columns
            echo "<h3>🔍 Toutes les colonnes de la table:</h3>";
            echo "<pre>";
            foreach ($row as $key => $value) {
                echo htmlspecialchars($key) . " => " . htmlspecialchars($value ?? 'NULL') . "\n";
            }
            echo "</pre>";
            
            break; // Only process first row
        }
    } else {
        echo "<span class='error'>❌ Aucune donnée trouvée</span>";
    }
    
} catch (Exception $e) {
    echo "<span class='error'>❌ Erreur: " . htmlspecialchars($e->getMessage()) . "</span>";
}

echo "<script>
if (typeof showNoteInfo === 'undefined') {
    window.showNoteInfo = function(id, created, updated) {
        alert('Info - ID: ' + id + '\\nCreated: ' + created + '\\nUpdated: ' + updated);
    };
}

if (typeof downloadFile === 'undefined') {
    window.downloadFile = function(filename, title) {
        alert('Download - File: ' + filename + '\\nTitle: ' + title);
    };
}
</script>";
?>
