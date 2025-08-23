<?php
// Debug version
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>Debug - Testing Attachments Page</h1>";
echo "<p>Starting tests...</p>";

try {
    echo "<p>1. Testing auth.php...</p>";
    require 'auth.php';
    echo "<p>✓ auth.php loaded</p>";
    
    echo "<p>2. Testing authentication...</p>";
    requireAuth();
    echo "<p>✓ Authentication passed</p>";
    
    echo "<p>3. Testing config...</p>";
    require_once 'config.php';
    echo "<p>✓ config.php loaded</p>";
    
    echo "<p>4. Testing database connection...</p>";
    include 'db_connect.php';
    echo "<p>✓ Database connected</p>";
    
    echo "<p>5. Testing note_id parameter...</p>";
    $note_id = isset($_GET['note_id']) ? (int)$_GET['note_id'] : 0;
    echo "<p>Note ID received: " . $note_id . "</p>";
    
    if (!$note_id) {
        echo "<p>❌ No note_id provided or invalid. Add ?note_id=1 to the URL</p>";
        exit;
    }
    
    echo "<p>6. Testing note exists...</p>";
    $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        echo "<p>❌ Note with ID $note_id not found</p>";
        
        // Show available notes
        $stmt = $con->prepare("SELECT id, heading FROM entries ORDER BY id LIMIT 10");
        $stmt->execute();
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "<p>Available notes:</p><ul>";
        foreach ($notes as $n) {
            echo "<li>ID: {$n['id']} - {$n['heading']}</li>";
        }
        echo "</ul>";
        exit;
    }
    
    echo "<p>✓ Note found: " . htmlspecialchars($note['heading']) . "</p>";
    echo "<p>7. All tests passed! The main page should work.</p>";
    
    echo '<p><a href="manage_attachments.php?note_id=' . $note_id . '">Go to Attachments Page</a></p>';
    
} catch (Exception $e) {
    echo "<p>❌ Error: " . $e->getMessage() . "</p>";
    echo "<p>File: " . $e->getFile() . "</p>";
    echo "<p>Line: " . $e->getLine() . "</p>";
}
?>
