<?php
require 'auth.php';
requireAuth();

require 'config.php';
require 'db_connect.php';

$search = $_POST['search'] ?? '';
$tags = [];

$tagSql = "SELECT tags FROM entries WHERE tags IS NOT NULL AND tags != ''";
if (!empty($search)) $tagSql .= " AND tags LIKE '%$search%'";

$tagRs = $con->query($tagSql);
if ($tagRs && $tagRs->num_rows > 0) {
    while ($row = mysqli_fetch_array($tagRs, MYSQLI_ASSOC)) {
        $tags = array_merge($tags, explode(',', $row['tags']));
    }
}

header('Content-Type: application/json');
echo json_encode(array_values(array_unique($tags))); 
?>