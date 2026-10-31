<?php
// Stands in for the external services Poznote talks to: an OpenAI-compatible
// server (chat, models, transcription), an MCP server, a Git forge and an S3
// bucket. Runs inside the throwaway instance, see run.sh.

$path = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$dir = '/tmp/poznote-e2e-mock';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

// --- S3: path-style bucket, signatures are not checked -----------------------
if (str_starts_with($path, '/bucket')) {
    $key = ltrim(substr($path, 7), '/');
    $file = $dir . '/' . md5($key);
    if ($key === '') {
        header('Content-Type: application/xml');
        echo '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>';
        foreach (glob($dir . '/*.key') ?: [] as $entry) {
            $data = substr($entry, 0, -4);
            if (is_file($data)) {
                echo '<Contents><Key>' . htmlspecialchars((string)file_get_contents($entry)) . '</Key><Size>'
                    . filesize($data) . '</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>';
            }
        }
        echo '</ListBucketResult>';
        return;
    }
    if ($method === 'PUT') {
        file_put_contents($file, (string)file_get_contents('php://input'));
        file_put_contents($file . '.key', $key);
        header('ETag: "e2e"');
        return;
    }
    if ($method === 'DELETE') {
        @unlink($file);
        @unlink($file . '.key');
        http_response_code(204);
        return;
    }
    if (!is_file($file)) {
        http_response_code(404);
        return;
    }
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($file));
    if ($method !== 'HEAD') {
        readfile($file);
    }
    return;
}

header('Content-Type: application/json');

// --- OpenAI-compatible server -------------------------------------------------
if ($path === '/v1/models') {
    echo json_encode(['data' => [['id' => 'mock-model'], ['id' => 'whisper-1']]]);
    return;
}
if ($path === '/v1/chat/completions') {
    header('Content-Type: text/event-stream');
    foreach (['Bon', 'jour ', 'depuis le mock'] as $piece) {
        echo 'data: ' . json_encode(['choices' => [['delta' => ['content' => $piece]]]]) . "\n\n";
        flush();
    }
    echo "data: [DONE]\n\n";
    return;
}
if ($path === '/v1/audio/transcriptions') {
    echo json_encode(['text' => 'transcription du mock']);
    return;
}

// --- MCP server ---------------------------------------------------------------
if ($path === '/mcp') {
    $request = json_decode((string)file_get_contents('php://input'), true);
    if (!isset($request['id'])) {
        http_response_code(202);
        return;
    }
    $result = $request['method'] === 'initialize'
        ? ['protocolVersion' => '2025-03-26', 'capabilities' => new stdClass(), 'serverInfo' => ['name' => 'mock', 'version' => '1']]
        : ['tools' => [['name' => 'mock_tool', 'description' => 'A tool', 'inputSchema' => ['type' => 'object']]]];
    echo json_encode(['jsonrpc' => '2.0', 'id' => $request['id'], 'result' => $result]);
    return;
}

// --- Git forge (GitHub contents API) -------------------------------------------
if (str_starts_with($path, '/git/')) {
    $route = substr($path, 5);
    $log = $dir . '/git.log';
    file_put_contents($log, "$method $route\n", FILE_APPEND);
    if ($route === 'user') {
        echo json_encode(['login' => 'mock-user', 'name' => 'Mock']);
        return;
    }
    if (preg_match('#^repos/[^/]+/[^/]+$#', $route)) {
        echo json_encode(['id' => 1, 'full_name' => 'mock/repo', 'default_branch' => 'main', 'private' => true, 'permissions' => ['push' => true]]);
        return;
    }
    if (preg_match('#/contents/#', $route)) {
        if ($method === 'GET') {
            http_response_code(404);
            echo json_encode(['message' => 'Not Found']);
            return;
        }
        http_response_code(201);
        echo json_encode(['content' => ['sha' => 'abc'], 'commit' => ['sha' => 'def']]);
        return;
    }
    if (preg_match('#/git/trees/#', $route)) {
        echo json_encode(['sha' => 'tree', 'tree' => [], 'truncated' => false]);
        return;
    }
    if (preg_match('#/branches/#', $route) || preg_match('#/git/ref#', $route) || preg_match('#/commits/#', $route)) {
        echo json_encode(['name' => 'main', 'ref' => 'refs/heads/main', 'object' => ['sha' => 'def'], 'commit' => ['sha' => 'def', 'tree' => ['sha' => 'tree']], 'sha' => 'def', 'tree' => ['sha' => 'tree']]);
        return;
    }
    if ($method === 'POST') {
        http_response_code(201);
        echo json_encode(['sha' => 'new', 'url' => 'mock', 'object' => ['sha' => 'new'], 'tree' => ['sha' => 'new']]);
        return;
    }
    echo json_encode([]);
    return;
}

// --- Webhook receiver: the suite reads back what was delivered ------------------
if ($path === '/webhook') {
    file_put_contents($dir . '/webhook.log', (string)file_get_contents('php://input') . "\n", FILE_APPEND);
    echo '{}';
    return;
}
if ($path === '/webhook-log') {
    echo json_encode(['lines' => is_file($dir . '/webhook.log') ? file($dir . '/webhook.log', FILE_IGNORE_NEW_LINES) : []]);
    return;
}

http_response_code(404);
echo '{"error":"mock: unknown route"}';
