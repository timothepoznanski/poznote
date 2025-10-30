<?php
/**
 * Test script for chunked restore API
 * Tests JSON response format without authentication
 */

// Test invalid method
echo "Testing invalid method (GET)...\n";
$ch = curl_init('http://localhost/api_chunked_restore.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP Code: $httpCode\n";
echo "Response: $response\n\n";

// Test if response is valid JSON
$json = json_decode($response, true);
if ($json === null) {
    echo "ERROR: Response is not valid JSON!\n";
    echo "Response starts with: " . substr($response, 0, 100) . "\n";
} else {
    echo "SUCCESS: Response is valid JSON\n";
    print_r($json);
}
?>