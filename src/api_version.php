<?php
require_once 'auth.php';

if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

header('Content-Type: application/json');

function getVersionInfo() {
    $result = [
        'current_version' => '',
        'latest_version' => '',
        'is_up_to_date' => false,
        'has_update' => false,
        'update_available' => false,
        'error' => null
    ];
    
    try {
        // Get current version from version.txt file
        $version_file = __DIR__ . '/version.txt';
        if (file_exists($version_file)) {
            $current_version = trim(file_get_contents($version_file));
            $result['current_version'] = $current_version;
        } else {
            $result['error'] = 'version.txt file not found';
            return $result;
        }
        
        // Query GitHub API to get the latest release
        $github_api_url = 'https://api.github.com/repos/timothepoznanski/poznote/releases/latest';
        
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'User-Agent: Poznote-App/1.0',
                    'Accept: application/vnd.github.v3+json'
                ],
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents($github_api_url, false, $context);
        
        if ($response === false) {
            // Fallback: try to get tags directly
            $github_tags_url = 'https://api.github.com/repos/timothepoznanski/poznote/tags';
            $response = @file_get_contents($github_tags_url, false, $context);
            
            if ($response === false) {
                $result['error'] = 'Cannot reach GitHub API';
                $result['is_up_to_date'] = null;
                return $result;
            }
            
            $tags_data = json_decode($response, true);
            if (empty($tags_data)) {
                $result['error'] = 'No tags found in repository';
                $result['is_up_to_date'] = null;
                return $result;
            }
            
            $latest_version = ltrim($tags_data[0]['name'], 'v');
        } else {
            $release_data = json_decode($response, true);
            $latest_version = ltrim($release_data['tag_name'], 'v');
        }
        
        $result['latest_version'] = $latest_version;
        
        // Clean versions for comparison
        $current_clean = ltrim($current_version, 'v');
        $latest_clean = ltrim($latest_version, 'v');
        
        // Compare versions using semantic versioning
        $comparison = version_compare($latest_clean, $current_clean);
        
        $result['is_up_to_date'] = ($comparison <= 0);
        $result['has_update'] = ($comparison > 0);
        $result['update_available'] = ($comparison > 0);
        
    } catch (Exception $e) {
        $result['error'] = $e->getMessage();
    }
    
    return $result;
}

echo json_encode(getVersionInfo(), JSON_PRETTY_PRINT);
?>
