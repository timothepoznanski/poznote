<?php
/**
 * Poznote Health Check Endpoint
 * 
 * Simple endpoint to verify server connectivity.
 * No authentication required - useful for reverse proxy health checks.
 * 
 * Endpoint: GET /api_health.php or via rewrite /api/health
 * 
 * Returns:
 * - 200 OK: Service is healthy
 * - 204 No Content: CORS preflight response
 * - 405 Method Not Allowed: Non-GET/OPTIONS request
 */

// Set response headers
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

// Handle CORS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only allow GET requests for actual health check
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Method not allowed. Use GET.'
    ], JSON_PRETTY_PRINT);
    exit;
}

// Build health check response
$response = [
    'status' => 'ok',
    'service' => 'poznote',
    'timestamp' => date('c')
];

// Add version if available
$versionFile = __DIR__ . '/version.txt';
if (file_exists($versionFile)) {
    $version = @file_get_contents($versionFile);
    if ($version !== false) {
        $response['version'] = trim($version);
    }
}

// Return successful health check
http_response_code(200);
echo json_encode($response, JSON_PRETTY_PRINT);
