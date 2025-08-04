<?php
require 'config.php';
include 'db_connect.php';

// Test the export attachments functionality
echo "Testing export attachments...\n";

// Test database connection
if ($con->ping()) {
    echo "Database connection: OK\n";
} else {
    echo "Database connection: FAILED\n";
    exit(1);
}

// Test query for attachments
$query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != ''";
$result = $con->query($query);

if ($result === false) {
    echo "Query failed: " . $con->error . "\n";
    exit(1);
}

echo "Query executed successfully\n";
echo "Found " . $result->num_rows . " notes with attachments\n";

$metadata = [];
while ($row = $result->fetch_assoc()) {
    $attachments = json_decode($row['attachments'], true);
    if (is_array($attachments) && !empty($attachments)) {
        foreach ($attachments as $attachment) {
            $metadata[] = [
                'note_id' => $row['id'],
                'note_heading' => $row['heading'],
                'attachment' => $attachment
            ];
        }
    }
}

echo "Generated metadata for " . count($metadata) . " attachments\n";

// Test JSON encoding
$metadataJson = json_encode($metadata, JSON_PRETTY_PRINT);
if ($metadataJson === false) {
    echo "JSON encoding failed: " . json_last_error_msg() . "\n";
} else {
    echo "JSON encoding successful\n";
    echo "Sample metadata:\n";
    echo substr($metadataJson, 0, 500) . "...\n";
}

echo "Export test completed successfully\n";
?>
