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
            if (is_file($data) && str_starts_with((string)file_get_contents($entry), (string)($_GET['prefix'] ?? ''))) {
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
// Scripted answers for the panel of the AI assistant. A message that starts with
// TOOL:<name>:<json> asks for that tool, SLOW streams for a few seconds, ECHO
// answers the whole request. The requests can be read back at /ai-log.
if ($path === '/ai-log') {
    echo json_encode(['lines' => is_file($dir . '/ai.log') ? file($dir . '/ai.log', FILE_IGNORE_NEW_LINES) : []]);
    return;
}
if ($path === '/v1/chat/completions') {
    $raw = (string)file_get_contents('php://input');
    file_put_contents($dir . '/ai.log', $raw . "\n", FILE_APPEND);
    $sent = json_decode($raw, true);
    $sentMessages = is_array($sent['messages'] ?? null) ? $sent['messages'] : [];
    $lastMessage = $sentMessages === [] ? [] : end($sentMessages);
    $lastText = is_string($lastMessage['content'] ?? null) ? $lastMessage['content'] : '';
    $sse = static function (array $delta, ?string $finish = null): void {
        echo 'data: ' . json_encode(['choices' => [['delta' => $delta, 'finish_reason' => $finish]]]) . "\n\n";
        flush();
    };
    if (($lastMessage['role'] ?? '') === 'tool') {
        header('Content-Type: text/event-stream');
        $sse(['content' => 'Outil terminé : ' . mb_substr($lastText, 0, 4000)], 'stop');
        echo "data: [DONE]\n\n";
        return;
    }
    if (preg_match('/^TOOL:([a-zA-Z0-9_]+):(.*)$/s', $lastText, $scripted) === 1) {
        header('Content-Type: text/event-stream');
        $sse(['tool_calls' => [['index' => 0, 'id' => 'call_e2e', 'type' => 'function', 'function' => ['name' => $scripted[1], 'arguments' => $scripted[2]]]]], 'tool_calls');
        echo "data: [DONE]\n\n";
        return;
    }
    if (strncmp($lastText, 'SLOW', 4) === 0) {
        header('Content-Type: text/event-stream');
        for ($piece = 0; $piece < 40; $piece++) {
            $sse(['content' => "morceau$piece "]);
            usleep(150000);
        }
        echo "data: [DONE]\n\n";
        return;
    }
    if (strncmp($lastText, 'ECHO', 4) === 0) {
        header('Content-Type: text/event-stream');
        $sse(['content' => 'Requête reçue : ' . $raw], 'stop');
        echo "data: [DONE]\n\n";
        return;
    }
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
    if ($request['method'] === 'tools/call') {
        file_put_contents($dir . '/mcp-calls.log', json_encode($request['params']) . "\n", FILE_APPEND);
        echo json_encode(['jsonrpc' => '2.0', 'id' => $request['id'], 'result' => ['content' => [['type' => 'text', 'text' => 'réponse du mock_tool']]]]);
        return;
    }
    $result = $request['method'] === 'initialize'
        ? ['protocolVersion' => '2025-03-26', 'capabilities' => new stdClass(), 'serverInfo' => ['name' => 'mock', 'version' => '1']]
        : ['tools' => [['name' => 'mock_tool', 'description' => 'A tool', 'inputSchema' => ['type' => 'object']]]];
    echo json_encode(['jsonrpc' => '2.0', 'id' => $request['id'], 'result' => $result]);
    return;
}

// --- OIDC provider. The browser cannot reach this server, the suite answers the
// authorization endpoint itself and puts the claims wanted in the code --------
if (str_starts_with($path, '/oidc/')) {
    $keyFile = $dir . '/oidc.pem';
    if (!is_file($keyFile)) {
        openssl_pkey_export(openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]), $pem);
        file_put_contents($keyFile, $pem);
    }
    $key = openssl_pkey_get_private((string)file_get_contents($keyFile));
    $b64 = static fn(string $data): string => rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    $issuer = 'http://127.0.0.1:9912/oidc';
    if ($path === '/oidc/.well-known/openid-configuration') {
        echo json_encode(['issuer' => $issuer, 'authorization_endpoint' => "$issuer/authorize", 'token_endpoint' => "$issuer/token", 'jwks_uri' => "$issuer/jwks", 'end_session_endpoint' => "$issuer/logout"]);
        return;
    }
    if ($path === '/oidc/jwks') {
        $rsa = openssl_pkey_get_details($key)['rsa'];
        echo json_encode(['keys' => [['kty' => 'RSA', 'kid' => 'e2e', 'alg' => 'RS256', 'use' => 'sig', 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]]]);
        return;
    }
    if ($path === '/oidc/token') {
        $claims = json_decode((string)base64_decode((string)($_POST['code'] ?? '')), true);
        if (!is_array($claims)) {
            http_response_code(400);
            echo '{"error":"invalid_grant"}';
            return;
        }
        $claims += ['iss' => $issuer, 'aud' => (string)($_POST['client_id'] ?? ''), 'iat' => time(), 'exp' => time() + 600];
        $signed = $b64(json_encode(['alg' => 'RS256', 'kid' => 'e2e', 'typ' => 'JWT'])) . '.' . $b64(json_encode($claims));
        openssl_sign($signed, $signature, $key, OPENSSL_ALGO_SHA256);
        echo json_encode(['access_token' => 'mock-access', 'token_type' => 'Bearer', 'id_token' => $signed . '.' . $b64($signature)]);
        return;
    }
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

// --- Stateful forge: /forge/<scope>/ speaks the GitHub, Forgejo and GitLab APIs ---
// The files live per scope, so that a pull really gets back what a push sent.
if (preg_match('#^/forge/([a-z0-9-]+)/(.*)$#', $path, $forge)) {
    $store = $dir . '/forge-' . $forge[1] . '.json';
    $files = is_file($store) ? json_decode((string)file_get_contents($store), true) : [];
    $save = function () use (&$files, $store) { file_put_contents($store, json_encode($files)); };
    $blob = fn(string $bytes) => sha1('blob ' . strlen($bytes) . "\0" . $bytes);
    $route = $forge[2];
    $input = json_decode((string)file_get_contents('php://input'), true) ?: [];
    if ($route === '_files') {
        echo json_encode(array_map('base64_decode', $files), JSON_INVALID_UTF8_SUBSTITUTE | JSON_FORCE_OBJECT);
        return;
    }
    if ($route === '_write') {
        $files[(string)$_GET['path']] = (string)$_GET['b64'];
        $save();
        echo '{}';
        return;
    }
    if ($route === '_remove') {
        unset($files[(string)$_GET['path']]);
        $save();
        echo '{}';
        return;
    }
    if ($route === '_log') {
        echo json_encode(is_file($store . '.log') ? file($store . '.log', FILE_IGNORE_NEW_LINES) : []);
        return;
    }
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_PRIVATE_TOKEN'] ?? '');
    file_put_contents($store . '.log', "$method $route auth=$auth\n", FILE_APPEND);
    if (str_contains($auth, 'mauvais')) {
        http_response_code(401);
        echo json_encode(['message' => 'Bad credentials']);
        return;
    }
    if ($route === 'user') {
        echo json_encode(['login' => 'mock-user']);
        return;
    }
    $write = function (string $name, string $content) use (&$files, $save) { $files[$name] = $content; $save(); };
    // GitLab
    if (preg_match('#^projects/([^/]+)$#', $route, $m)) {
        echo json_encode(['id' => 7, 'path_with_namespace' => rawurldecode($m[1]), 'default_branch' => 'main', 'visibility' => 'private']);
        return;
    }
    if (preg_match('#^projects/[^/]+/repository/tree$#', $route)) {
        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 20);
        $all = [];
        foreach ($files as $name => $content) {
            $all[] = ['id' => $blob((string)base64_decode($content)), 'path' => $name, 'type' => 'blob'];
        }
        echo json_encode(array_slice($all, ($page - 1) * $perPage, $perPage));
        return;
    }
    if (preg_match('#^projects/[^/]+/repository/files/(.+)$#', $route, $m)) {
        $name = rawurldecode($m[1]);
        if ($method === 'GET') {
            if (!isset($files[$name])) {
                http_response_code(404);
                echo json_encode(['message' => '404 File Not Found']);
                return;
            }
            echo json_encode(['file_path' => $name, 'encoding' => 'base64', 'content' => $files[$name], 'blob_id' => $blob((string)base64_decode($files[$name]))]);
            return;
        }
        if ($method === 'DELETE') {
            unset($files[$name]);
            $save();
            http_response_code(204);
            return;
        }
        if ($method === 'POST' && isset($files[$name])) {
            http_response_code(400);
            echo json_encode(['message' => 'A file with this name already exists']);
            return;
        }
        $write($name, (string)$input['content']);
        http_response_code($method === 'POST' ? 201 : 200);
        echo json_encode(['file_path' => $name, 'branch' => $input['branch'] ?? 'main']);
        return;
    }
    // GitHub and Forgejo
    if (preg_match('#^repos/[^/]+/[^/]+$#', $route)) {
        echo json_encode(['id' => 1, 'full_name' => 'mock/repo', 'default_branch' => 'main', 'private' => true, 'description' => 'mock']);
        return;
    }
    if (preg_match('#^repos/[^/]+/[^/]+/git/trees/#', $route)) {
        $tree = [];
        foreach ($files as $name => $content) {
            $tree[] = ['path' => $name, 'type' => 'blob', 'sha' => $blob((string)base64_decode($content))];
        }
        echo json_encode(['sha' => 'tree', 'tree' => $tree, 'truncated' => false]);
        return;
    }
    if (preg_match('#^repos/[^/]+/[^/]+/contents/(.+)$#', $route, $m)) {
        $name = implode('/', array_map('rawurldecode', explode('/', $m[1])));
        $known = isset($files[$name]);
        $sha = $known ? $blob((string)base64_decode($files[$name])) : null;
        if ($method === 'GET') {
            if (!$known) {
                http_response_code(404);
                echo json_encode(['message' => 'Not Found']);
                return;
            }
            echo json_encode(['path' => $name, 'encoding' => 'base64', 'content' => $files[$name], 'sha' => $sha]);
            return;
        }
        // As the real forges do: changing a file requires its current SHA
        if ($known && ($input['sha'] ?? null) !== $sha) {
            http_response_code(422);
            echo json_encode(['message' => 'sha does not match']);
            return;
        }
        if ($method === 'DELETE') {
            unset($files[$name]);
            $save();
            echo json_encode(['commit' => ['sha' => 'del']]);
            return;
        }
        $write($name, (string)$input['content']);
        http_response_code($known ? 200 : 201);
        echo json_encode(['content' => ['sha' => $blob((string)base64_decode((string)$input['content']))], 'commit' => ['sha' => 'c']]);
        return;
    }
    http_response_code(404);
    echo json_encode(['message' => 'forge: unknown route ' . $route]);
    return;
}

// --- Webhook receiver with headers, one log per scope ---------------------------
if (preg_match('#^/hook/([a-z0-9-]+)$#', $path, $hook)) {
    file_put_contents($dir . '/hook-' . $hook[1] . '.log', json_encode([
        'event' => $_SERVER['HTTP_X_POZNOTE_EVENT'] ?? '',
        'delivery' => $_SERVER['HTTP_X_POZNOTE_DELIVERY'] ?? '',
        'signature' => $_SERVER['HTTP_X_POZNOTE_SIGNATURE_256'] ?? '',
        'body' => (string)file_get_contents('php://input'),
    ]) . "\n", FILE_APPEND);
    echo '{}';
    return;
}
if (preg_match('#^/hook-log/([a-z0-9-]+)$#', $path, $hook)) {
    $log = $dir . '/hook-' . $hook[1] . '.log';
    echo '[' . (is_file($log) ? implode(',', file($log, FILE_IGNORE_NEW_LINES)) : '') . ']';
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
