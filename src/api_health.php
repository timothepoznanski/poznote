<?php
/**
 * Poznote Health Check Endpoint
 * 
 * Simple endpoint to verify server connectivity.
 * No authentication required - useful for reverse proxy health checks.
 * 
 * Endpoint: GET /api_health.php or via rewrite /api/health
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// Basic health response
$response = [
    'status' => 'ok',
    'service' => 'poznote',
    'timestamp' => date('c')
];

// Optionally include version
$versionFile = __DIR__ . '/version.txt';
if (file_exists($versionFile)) {
    $response['version'] = trim(file_get_contents($versionFile));
}

http_response_code(200);
echo json_encode($response);
