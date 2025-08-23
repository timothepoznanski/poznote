<?php
// Test script for multi-tag search functionality
require_once 'src/config.php';
include 'src/db_connect.php';

echo "=== Test de la recherche multi-tags ===\n\n";

// Test 1: Single tag search (backward compatibility)
echo "Test 1: Recherche d'un seul tag 'php'\n";
$tags_search = 'php';
$search_tags = array_map('trim', explode(',', $tags_search));
$search_tags = array_filter($search_tags);

echo "Tags détectés: " . json_encode($search_tags) . "\n";
echo "Nombre de tags: " . count($search_tags) . "\n";

$where_conditions = ["trash = 0"];
$search_params = [];

if (count($search_tags) > 1) {
    $tag_conditions = [];
    foreach ($search_tags as $tag) {
        $tag_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $tag . '%';
    }
    $where_conditions[] = "(" . implode(" AND ", $tag_conditions) . ")";
} else {
    $where_conditions[] = "tags LIKE ?";
    $search_params[] = '%' . $tags_search . '%';
}

$where_clause = implode(" AND ", $where_conditions);
$sql = "SELECT id, heading, tags FROM entries WHERE $where_clause LIMIT 3";

echo "SQL: $sql\n";
echo "Paramètres: " . json_encode($search_params) . "\n";

$stmt = $con->prepare($sql);
$stmt->execute($search_params);
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Résultats trouvés: " . count($results) . "\n";
foreach ($results as $row) {
    echo "- {$row['id']}: {$row['heading']} (tags: {$row['tags']})\n";
}

echo "\n" . str_repeat("-", 50) . "\n\n";

// Test 2: Multiple tags search
echo "Test 2: Recherche de plusieurs tags 'vmware,reset'\n";
$tags_search = 'vmware,reset';
$search_tags = array_map('trim', explode(',', $tags_search));
$search_tags = array_filter($search_tags);

echo "Tags détectés: " . json_encode($search_tags) . "\n";
echo "Nombre de tags: " . count($search_tags) . "\n";

$where_conditions = ["trash = 0"];
$search_params = [];

if (count($search_tags) > 1) {
    $tag_conditions = [];
    foreach ($search_tags as $tag) {
        $tag_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $tag . '%';
    }
    $where_conditions[] = "(" . implode(" AND ", $tag_conditions) . ")";
} else {
    $where_conditions[] = "tags LIKE ?";
    $search_params[] = '%' . $tags_search . '%';
}

$where_clause = implode(" AND ", $where_conditions);
$sql = "SELECT id, heading, tags FROM entries WHERE $where_clause LIMIT 3";

echo "SQL: $sql\n";
echo "Paramètres: " . json_encode($search_params) . "\n";

$stmt = $con->prepare($sql);
$stmt->execute($search_params);
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Résultats trouvés: " . count($results) . "\n";
foreach ($results as $row) {
    echo "- {$row['id']}: {$row['heading']} (tags: {$row['tags']})\n";
}

echo "\n" . str_repeat("-", 50) . "\n\n";

// Test 3: Multiple tags with spaces
echo "Test 3: Recherche avec espaces 'find, trouver'\n";
$tags_search = 'find, trouver';
$search_tags = array_map('trim', explode(',', $tags_search));
$search_tags = array_filter($search_tags);

echo "Tags détectés: " . json_encode($search_tags) . "\n";
echo "Nombre de tags: " . count($search_tags) . "\n";

$where_conditions = ["trash = 0"];
$search_params = [];

if (count($search_tags) > 1) {
    $tag_conditions = [];
    foreach ($search_tags as $tag) {
        $tag_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $tag . '%';
    }
    $where_conditions[] = "(" . implode(" AND ", $tag_conditions) . ")";
} else {
    $where_conditions[] = "tags LIKE ?";
    $search_params[] = '%' . $tags_search . '%';
}

$where_clause = implode(" AND ", $where_conditions);
$sql = "SELECT id, heading, tags FROM entries WHERE $where_clause LIMIT 3";

echo "SQL: $sql\n";
echo "Paramètres: " . json_encode($search_params) . "\n";

$stmt = $con->prepare($sql);
$stmt->execute($search_params);
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Résultats trouvés: " . count($results) . "\n";
foreach ($results as $row) {
    echo "- {$row['id']}: {$row['heading']} (tags: {$row['tags']})\n";
}

echo "\n=== Fin des tests ===\n";
?>
