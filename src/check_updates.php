<?php
require_once 'auth.php';

if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

header('Content-Type: application/json');

function checkForUpdates() {
    $result = [
        'has_updates' => false,
        'current_version' => '',
        'remote_version' => '',
        'error' => null
    ];
    
    try {
        // Get current version from version.txt 
        $version_file = 'version.txt';
        if (file_exists($version_file)) {
            $current_version = trim(file_get_contents($version_file));
        } else {
            $result['error'] = 'Version file not found';
            return $result;
        }
        
        $result['current_version'] = $current_version;
        
        // Query GitHub API to get the version.txt from the main branch
        $github_api_url = 'https://raw.githubusercontent.com/timothepoznanski/poznote/main/src/version.txt';
        
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'User-Agent: Poznote-App/1.0'
                ],
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents($github_api_url, false, $context);
        
        if ($response === false) {
            $result['error'] = 'Cannot reach GitHub (check internet connection)';
            return $result;
        }
        
        $remote_version = trim($response);
        $result['remote_version'] = $remote_version;
        
        // Compare versions using semantic versioning
        $result['has_updates'] = version_compare($remote_version, $current_version, '>');
        
    } catch (Exception $e) {
        $result['error'] = $e->getMessage();
    }
    
    return $result;
}

echo json_encode(checkForUpdates());
?>
