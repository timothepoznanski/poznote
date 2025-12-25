<?php
require_once 'auth.php';
requireApiAuth();

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
                $current_version = 'vX.X.X'; // Default if no tags found
            }
            $current_version_clean = ltrim($current_version, 'v');
            $result['current_version'] = $current_version_clean;
        }
        
        // Query GitHub API to get the latest release/tag
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
        
        $result['remote_version'] = $remote_version;
        
        // Check if remote version is a test or beta version (contains -test or -beta)
        $is_prerelease_version = (strpos($remote_version, '-test') !== false || strpos($remote_version, '-beta') !== false);
        
        // Don't show test/beta versions as available updates
        if ($is_prerelease_version) {
            $result['has_updates'] = false;
            $result['remote_version'] = $remote_version;
            return $result;
        }
        
        // Compare versions using semantic versioning
        $result['has_updates'] = version_compare($remote_version, $current_version_clean, '>');
        
    } catch (Exception $e) {
        $result['error'] = $e->getMessage();
    }
    
    return $result;
}

echo json_encode(checkForUpdates());
?>
