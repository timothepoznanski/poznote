<?php
// Test script to verify multi-tags search functionality
require_once 'src/config.php';
require 'src/db_connect.php';

echo "=== Testing Multi-Tags Search Logic ===\n\n";

// Test the logic
$tags_search = "php, javascript";
$search_tags = array_filter(array_map('trim', preg_split('/[,\s]+/', $tags_search)));

echo "Original search: '$tags_search'\n";
echo "Parsed tags: " . print_r($search_tags, true) . "\n";

// Simulate the new logic
$where_conditions = [];
$search_params = [];

if (!empty($tags_search)) {
    if (count($search_tags) == 1) {
        echo "Single tag search logic\n";
        $where_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $search_tags[0] . '%';
    } else {
        echo "Multiple tags search logic\n";
        $tag_conditions = [];
        foreach ($search_tags as $tag) {
            $tag_conditions[] = "tags LIKE ?";
            $search_params[] = '%' . $tag . '%';
        }
        $where_conditions[] = "(" . implode(" AND ", $tag_conditions) . ")";
    }
}

echo "WHERE conditions: " . print_r($where_conditions, true) . "\n";
echo "Search params: " . print_r($search_params, true) . "\n";

// Test with actual database query
try {
    $where_clause = "trash = 0";
    if (!empty($where_conditions)) {
        $where_clause .= " AND " . implode(" AND ", $where_conditions);
    }
    
    $query = "SELECT id, heading, tags FROM entries WHERE $where_clause LIMIT 10";
    echo "\nGenerated SQL: $query\n";
    
    $stmt = $con->prepare($query);
    if (!empty($search_params)) {
        $stmt->execute($search_params);
    } else {
        $stmt->execute();
    }
    
    echo "\nResults:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "ID: {$row['id']}, Heading: {$row['heading']}, Tags: {$row['tags']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

// Test different search patterns
echo "\n=== Testing Different Search Patterns ===\n";

$test_cases = [
    "php",           // Single tag
    "php, javascript", // Comma separated
    "php javascript",  // Space separated
    "php,javascript",  // Comma without spaces
    "web dev, frontend", // Multi-word tags
];

foreach ($test_cases as $test_search) {
    echo "\nTesting: '$test_search'\n";
    $test_tags = array_filter(array_map('trim', preg_split('/[,\s]+/', $test_search)));
    echo "Parsed: " . implode(" | ", $test_tags) . "\n";
}

echo "\n=== Test Complete ===\n";
?>
