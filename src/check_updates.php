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
        'current_date' => '',
        'remote_date' => '',
        'error' => null
    ];
    
    try {
        // Get current version from Git
        $git_command = 'git rev-parse HEAD 2>/dev/null';
        $git_hash = shell_exec($git_command);
        
        if ($git_hash && strlen(trim($git_hash)) >= 8) {
            $current_version = substr(trim($git_hash), 0, 8);
        } else {
            // Fallback: use modification date of index.php
            $current_version = date('Ymd-His', filemtime('index.php'));
            $result['current_date'] = date('Y-m-d H:i:s', filemtime('index.php'));
        }
        
        $result['current_version'] = $current_version;
        
        // Query GitHub API
        $github_api_url = 'https://api.github.com/repos/timothepoznanski/poznote/commits/main';
        
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
            $result['error'] = 'Cannot reach GitHub API (check internet connection)';
            return $result;
        }
        
        $github_data = json_decode($response, true);
        
        if (!$github_data || !isset($github_data['sha'])) {
            $result['error'] = 'Invalid response from GitHub API';
            return $result;
        }
        
        $remote_commit = substr($github_data['sha'], 0, 8);
        $remote_date = date('Y-m-d H:i:s', strtotime($github_data['commit']['committer']['date']));
        
        $result['remote_version'] = $remote_commit;
        $result['remote_date'] = $remote_date;
        
        // Compare versions intelligently
        if (preg_match('/^[a-f0-9]{8}$/', $current_version)) {
            // Current version is a Git hash, compare directly
            $result['has_updates'] = ($current_version !== $remote_commit);
        } else {
            // Current version is a date/timestamp, compare with remote date
            if (preg_match('/^\d{8}-\d{6}$/', $current_version)) {
                $current_timestamp = DateTime::createFromFormat('Ymd-His', $current_version)->getTimestamp();
            } else {
                $current_timestamp = filemtime('index.php');
            }
            $remote_timestamp = strtotime($github_data['commit']['committer']['date']);
            $result['has_updates'] = ($remote_timestamp > $current_timestamp);
        }
        
    } catch (Exception $e) {
        $result['error'] = $e->getMessage();
    }
    
    return $result;
}

echo json_encode(checkForUpdates());
?>
