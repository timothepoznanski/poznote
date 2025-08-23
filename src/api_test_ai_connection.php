<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
require_once 'AIHelper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Check AI status
$status = AIHelper::checkAIStatus($con);

if (!$status['enabled']) {
    http_response_code(400);
    echo json_encode(['error' => $status['error']]);
    exit;
}

// Get provider and test connection
$provider = AIHelper::getProvider($con);
if (!$provider) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not initialize AI provider']);
    exit;
}

$test_result = $provider->testConnection();

if (!$test_result['success']) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Connection failed: ' . $test_result['error'],
        'provider' => $provider->getProviderName()
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'provider' => $provider->getProviderName(),
    'message' => 'Connection successful!',
    'response' => isset($test_result['response']) ? $test_result['response'] : null
]);
?>
