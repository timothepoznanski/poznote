<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require 'db_connect.php';

$search = $_POST['search'] ?? '';
$tags = [];

$tagSql = "SELECT tags FROM entries WHERE tags IS NOT NULL AND tags != '' AND trash = 0";
$params = [];

if (!empty($search)) {
    $tagSql .= " AND tags LIKE ?";
    $params[] = '%' . $search . '%';
}

$tagRs = $con->prepare($tagSql);
$tagRs->execute($params);

while ($row = $tagRs->fetch(PDO::FETCH_ASSOC)) {
    if ($row) {
        $tags = array_merge($tags, explode(',', $row['tags']));
    }
}

header('Content-Type: application/json');
echo json_encode(array_values(array_unique($tags))); 
?>