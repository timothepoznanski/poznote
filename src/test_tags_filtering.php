<?php
// Test script to verify that tags don't include notes from trash
require_once 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

echo "<h2>Test: Tags Filtering (Exclude Trash Notes)</h2>";

// Check notes in trash with tags
$trashNotesQuery = "SELECT id, heading, tags FROM entries WHERE trash = 1 AND tags IS NOT NULL AND tags != ''";
$trashResult = $con->query($trashNotesQuery);

echo "<h3>📝 Notes in trash with tags:</h3>";
if ($trashResult && $trashResult->num_rows > 0) {
    echo "<ul>";
    while ($row = $trashResult->fetch_assoc()) {
        echo "<li><strong>ID " . $row['id'] . ":</strong> " . htmlspecialchars($row['heading']) . " <em>(Tags: " . htmlspecialchars($row['tags']) . ")</em></li>";
    }
    echo "</ul>";
} else {
    echo "<p>No notes in trash with tags.</p>";
}

// Get all unique tags from non-trash notes
$activeTagsQuery = "SELECT tags FROM entries WHERE trash = 0 AND tags IS NOT NULL AND tags != ''";
$activeResult = $con->query($activeTagsQuery);
$activeTags = [];

if ($activeResult && $activeResult->num_rows > 0) {
    while ($row = $activeResult->fetch_assoc()) {
        $tags = array_map('trim', explode(',', $row['tags']));
        $activeTags = array_merge($activeTags, $tags);
    }
}
$activeTags = array_unique(array_filter($activeTags));

// Get all unique tags from trash notes
$trashTagsQuery = "SELECT tags FROM entries WHERE trash = 1 AND tags IS NOT NULL AND tags != ''";
$trashTagsResult = $con->query($trashTagsQuery);
$trashTags = [];

if ($trashTagsResult && $trashTagsResult->num_rows > 0) {
    while ($row = $trashTagsResult->fetch_assoc()) {
        $tags = array_map('trim', explode(',', $row['tags']));
        $trashTags = array_merge($trashTags, $tags);
    }
}
$trashTags = array_unique(array_filter($trashTags));

echo "<h3>🏷️ Tags comparison:</h3>";
echo "<p><strong>Active notes tags:</strong> " . count($activeTags) . " unique tags</p>";
echo "<p><strong>Trash notes tags:</strong> " . count($trashTags) . " unique tags</p>";

$trashOnlyTags = array_diff($trashTags, $activeTags);
if (!empty($trashOnlyTags)) {
    echo "<h4>⚠️ Tags that exist ONLY in trash notes:</h4>";
    echo "<p>These tags should NOT appear in the tags page:</p>";
    echo "<ul>";
    foreach ($trashOnlyTags as $tag) {
        echo "<li>" . htmlspecialchars($tag) . "</li>";
    }
    echo "</ul>";
} else {
    echo "<p>✅ No tags exist exclusively in trash notes.</p>";
}

echo "<h3>🧪 Test procedure:</h3>";
echo "<ol>";
echo "<li>Go to <a href='listtags.php' target='_blank'>Tags page</a></li>";
echo "<li>Check that trash-only tags (if any) don't appear</li>";
echo "<li>Try the tag search/filter functionality</li>";
echo "<li>Verify no tags from trash notes are suggested</li>";
echo "</ol>";

echo "<br><a href='listtags.php'>Go to Tags Page</a> | <a href='trash.php'>Go to Trash</a> | <a href='index.php'>Back to Notes</a>";
?>
