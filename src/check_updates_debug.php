<?php
// Script de test simple pour diagnostiquer les problèmes
header('Content-Type: application/json');

// Log de débogage
error_log("=== CHECK_UPDATES DEBUG START ===");

try {
    // 1. Vérifier la session
    $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
    $session_name = 'POZNOTE_SESSION_' . $configured_port;
    
    if (session_status() === PHP_SESSION_NONE) {
        session_name($session_name);
        session_start();
    }
    
    error_log("Session ID: " . session_id());
    error_log("Session name: " . session_name());
    error_log("Authenticated: " . (isset($_SESSION['authenticated']) ? 'true' : 'false'));
    
    // 2. Test d'authentification
    if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
        error_log("Authentication failed");
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required', 'debug' => 'Not authenticated']);
        exit;
    }
    
    // 3. Test git repository
    error_log("Current working directory: " . getcwd());
    error_log("User: " . get_current_user());
    error_log("Checking ../.git: " . (is_dir('../.git') ? 'true' : 'false'));
    error_log("Checking /root/poznote/poznote/.git: " . (is_dir('/root/poznote/poznote/.git') ? 'true' : 'false'));
    
    if (!is_dir('../.git')) {
        error_log("Git repository not found");
        echo json_encode([
            'error' => 'Not a git repository', 
            'debug' => 'No .git directory',
            'pwd' => getcwd(),
            'user' => get_current_user(),
            'check_relative' => is_dir('../.git'),
            'check_absolute' => is_dir('/root/poznote/poznote/.git')
        ]);
        exit;
    }
    
    // 4. Test changement de répertoire
    $original_dir = getcwd();
    error_log("Original directory: " . $original_dir);
    chdir('..');
    error_log("New directory: " . getcwd());
    
    // 5. Test des commandes git
    $current_commit = trim(shell_exec('git rev-parse HEAD 2>/dev/null') ?? '');
    error_log("Current commit: " . $current_commit);
    
    if (empty($current_commit)) {
        chdir($original_dir);
        echo json_encode(['error' => 'Cannot get current commit', 'debug' => 'git rev-parse failed']);
        exit;
    }
    
    // 6. Test fetch
    error_log("Attempting git fetch...");
    exec('git fetch origin main 2>/dev/null', $output, $return_code);
    error_log("Fetch return code: " . $return_code);
    
    if ($return_code !== 0) {
        chdir($original_dir);
        echo json_encode(['error' => 'Cannot fetch from remote', 'debug' => 'git fetch failed with code ' . $return_code]);
        exit;
    }
    
    // 7. Test remote commit
    $remote_commit = trim(shell_exec('git rev-parse origin/main 2>/dev/null') ?? '');
    error_log("Remote commit: " . $remote_commit);
    
    if (empty($remote_commit)) {
        chdir($original_dir);
        echo json_encode(['error' => 'Cannot get remote commit', 'debug' => 'git rev-parse origin/main failed']);
        exit;
    }
    
    // 8. Succès
    chdir($original_dir);
    
    $result = [
        'has_updates' => ($current_commit !== $remote_commit),
        'current_commit' => substr($current_commit, 0, 8),
        'remote_commit' => substr($remote_commit, 0, 8),
        'current_branch' => 'main',
        'behind_count' => 0,
        'error' => null,
        'debug' => 'Success'
    ];
    
    error_log("Result: " . json_encode($result));
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Exception: " . $e->getMessage());
    echo json_encode(['error' => $e->getMessage(), 'debug' => 'Exception caught']);
}

error_log("=== CHECK_UPDATES DEBUG END ===");
?>
