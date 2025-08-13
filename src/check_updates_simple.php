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
        // Méthode 1: Vérifier avec un fichier VERSION local
        $version_file = 'version.txt';
        if (file_exists($version_file)) {
            $current_version = trim(file_get_contents($version_file));
            $result['current_version'] = $current_version;
        } else {
            // Fallback: utiliser la date du fichier index.php
            $current_version = date('Y-m-d H:i:s', filemtime('index.php'));
            $result['current_version'] = $current_version;
            $result['current_date'] = $current_version;
        }
        
        // Méthode 2: Interroger l'API GitHub
        $github_api_url = 'https://api.github.com/repos/timothepoznanski/poznote/commits/main';
        
        // Créer le contexte pour la requête HTTP
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
        
        // Comparer les versions
        if (file_exists($version_file)) {
            // Si on a un fichier version, comparer les commits
            $result['has_updates'] = ($current_version !== $remote_commit);
        } else {
            // Sinon, comparer les dates (si remote est plus récent que notre fichier)
            $current_timestamp = filemtime('index.php');
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
