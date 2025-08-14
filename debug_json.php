<?php
// Test script to debug the json_encode issue
include 'src/config.php';
include 'src/db_connect.php';

$note_id = '13'; // The note causing the issue

$stmt = $con->prepare("SELECT * FROM entries WHERE id = ?");
$stmt->execute([$note_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if ($row) {
    echo "Note data:\n";
    echo "ID: " . $row['id'] . "\n";
    echo "Heading: " . $row['heading'] . "\n";
    echo "Created: " . $row['created'] . "\n";
    echo "Updated: " . $row['updated'] . "\n";
    
    echo "\nJSON encode tests:\n";
    echo "json_encode(created): " . json_encode($row['created']) . "\n";
    echo "json_encode(updated): " . json_encode($row['updated']) . "\n";
    
    echo "\nGenerated JavaScript call:\n";
    echo "showNoteInfo('" . $row['id'] . "', " . json_encode($row['created']) . ", " . json_encode($row['updated']) . ")\n";
    
    echo "\nJSON errors:\n";
    echo "JSON last error: " . json_last_error() . "\n";
    echo "JSON last error msg: " . json_last_error_msg() . "\n";
} else {
    echo "Note not found\n";
}
?>
