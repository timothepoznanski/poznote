<?php
require 'auth.php';
requireApiAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json; charset=utf-8');

$workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? null;

$where_conditions = ["trash = 0"];
$params = [];

// Build base query
$select_query = "SELECT tags FROM entries WHERE " . implode(' AND ', $where_conditions);

if ($workspace !== null) {
    // Scope to workspace
    $select_query .= " AND workspace = ?";
    $params[] = $workspace;
}

try {
    $stmt = $con->prepare($select_query);
    $stmt->execute($params);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Query failed']);
    exit;
}

$tags_list = [];

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    if (empty($row['tags'])) continue;
    $words = preg_split('/[,\s]+/', $row['tags']);
    foreach ($words as $word) {
        $w = trim($word);
        if ($w === '') continue;
        if (!in_array($w, $tags_list, true)) $tags_list[] = $w;
    }
}

sort($tags_list, SORT_NATURAL | SORT_FLAG_CASE);

echo json_encode(['success' => true, 'tags' => $tags_list]);

?>
