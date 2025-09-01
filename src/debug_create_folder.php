<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

// Test direct sans auth
require_once 'config.php';
require_once 'db_connect.php';

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

echo json_encode([
    'json_received' => $json,
    'data_parsed' => $data,
    'json_error' => json_last_error_msg(),
    'workspace' => isset($data['workspace']) ? $data['workspace'] : 'not set',
    'folder_name' => isset($data['folder_name']) ? $data['folder_name'] : 'not set'
]);
?>
