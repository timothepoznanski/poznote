<?php
// Test script to verify attachment deletion on permanent note deletion
require_once 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

echo "<h2>Test: Attachment Deletion on Permanent Note Deletion</h2>";

// Check if we have any notes in trash with attachments
$stmt = $con->prepare("SELECT id, title, attachments FROM entries WHERE trash = 1 AND attachments IS NOT NULL AND attachments != '[]'");
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    echo "<h3>Notes in trash with attachments:</h3>";
    while ($row = $result->fetch_assoc()) {
        $attachments = json_decode($row['attachments'], true);
        echo "<div style='border: 1px solid #ccc; margin: 10px; padding: 10px;'>";
        echo "<strong>Note ID:</strong> " . $row['id'] . "<br>";
        echo "<strong>Title:</strong> " . htmlspecialchars($row['title']) . "<br>";
        echo "<strong>Attachments:</strong><br>";
        
        if (is_array($attachments)) {
            foreach ($attachments as $attachment) {
                $filename = $attachment['filename'] ?? 'unknown';
                $filepath = 'attachments/' . $filename;
                $exists = file_exists($filepath) ? '✅ EXISTS' : '❌ MISSING';
                echo "- " . htmlspecialchars($filename) . " $exists<br>";
            }
        }
        echo "</div>";
    }
    
    echo "<p><strong>Test procedure:</strong></p>";
    echo "<ol>";
    echo "<li>Go to trash page</li>";
    echo "<li>Permanently delete one of the notes above</li>";
    echo "<li>Check that the attachment files are deleted from the filesystem</li>";
    echo "<li>Refresh this page to verify</li>";
    echo "</ol>";
} else {
    echo "<p>No notes in trash with attachments found.</p>";
    echo "<p>To test:</p>";
    echo "<ol>";
    echo "<li>Create a note with an attachment</li>";
    echo "<li>Move the note to trash</li>";
    echo "<li>Come back to this test page</li>";
    echo "</ol>";
}

echo "<br><a href='trash.php'>Go to Trash</a> | <a href='index.php'>Back to Notes</a>";
?>
