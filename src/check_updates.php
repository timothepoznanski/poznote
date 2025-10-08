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
        // Get current version from version.txt file
        $version_file = __DIR__ . '/version.txt';
        if (file_exists($version_file)) {
            $current_version_clean = trim(file_get_contents($version_file));
            $result['current_version'] = $current_version_clean;
        } else {
            // Fallback to git tags if version.txt doesn't exist
            $current_version = exec('git describe --tags --abbrev=0 2>/dev/null', $output, $return_code);
            if ($return_code !== 0 || empty($current_version)) {
                $current_version = 'v1.0.0'; // Default if no tags found
            }
            $current_version_clean = ltrim($current_version, 'v');
            $result['current_version'] = $current_version_clean;
        }
        
        // Query GitHub Container Registry API to get the latest version
        $ghcr_api_url = 'https://api.github.com/users/timothepoznanski/packages/container/poznote/versions';
        
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'User-Agent: Poznote-App/1.0',
                    'Accept: application/vnd.github.v3+json',
                    'Authorization: Bearer ' . (isset($_SERVER['GITHUB_TOKEN']) ? $_SERVER['GITHUB_TOKEN'] : '')
                ],
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents($ghcr_api_url, false, $context);
        
        if ($response === false) {
            // Fallback: try to get tags from GitHub releases
            $github_api_url = 'https://api.github.com/repos/timothepoznanski/poznote/releases/latest';
            $response = @file_get_contents($github_api_url, false, $context);
            
            if ($response === false) {
                // Final fallback: get tags directly
                $github_tags_url = 'https://api.github.com/repos/timothepoznanski/poznote/tags';
                $response = @file_get_contents($github_tags_url, false, $context);
                
                if ($response === false) {
                    $result['error'] = 'Cannot reach GitHub (check internet connection)';
                    return $result;
                }
                
                $tags_data = json_decode($response, true);
                if (empty($tags_data)) {
                    $result['error'] = 'No tags found in repository';
                    return $result;
                }
                
                $remote_version = ltrim($tags_data[0]['name'], 'v');
            } else {
                $release_data = json_decode($response, true);
                $remote_version = ltrim($release_data['tag_name'], 'v');
            }
        } else {
            $versions_data = json_decode($response, true);
            if (empty($versions_data)) {
                $result['error'] = 'No versions found in GHCR';
                return $result;
            }
            
            // Find the latest version (excluding 'latest' tag)
            $latest_version = null;
            foreach ($versions_data as $version) {
                if (isset($version['metadata']['container']['tags'])) {
                    foreach ($version['metadata']['container']['tags'] as $tag) {
                        if ($tag !== 'latest' && version_compare($tag, $latest_version ?? '0.0.0', '>')) {
                            $latest_version = $tag;
                        }
                    }
                }
            }
            
            if ($latest_version === null) {
                $result['error'] = 'No valid version tags found in GHCR';
                return $result;
            }
            
            $remote_version = $latest_version;
        }
        
        $result['remote_version'] = $remote_version;
        
        // Compare versions using semantic versioning
        $result['has_updates'] = version_compare($remote_version, $current_version_clean, '>');
        
    } catch (Exception $e) {
        $result['error'] = $e->getMessage();
    }
    
    return $result;
}

echo json_encode(checkForUpdates());
?>
