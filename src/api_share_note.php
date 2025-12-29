<?php
require 'auth.php';
requireApiAuth();
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// Only accept JSON POST
$body = file_get_contents('php://input');
$data = json_decode($body, true);
if (!$data || !isset($data['note_id'])) {
    header('Content-Type: application/json');
    http_response_code(400);
        echo json_encode(['error' => t('api.errors.note_id_required', [], 'note_id required')]);
    exit;
}

$note_id = intval($data['note_id']);
// action: create (default), get, revoke, renew, update_indexable
$action = isset($data['action']) ? strtolower(trim($data['action'])) : 'create';

// Verify that the user has access to this note (owner or can view in workspace)
try {
    $stmt = $con->prepare('SELECT id FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $exists = $stmt->fetchColumn();
    if (!$exists) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['error' => t('api.errors.note_not_found', [], 'Note not found')]);
        exit;
    }

    // Handle actions
    if ($action === 'get') {
        // Return existing public note URL if any
        $stmt = $con->prepare('SELECT token, indexable, password FROM shared_notes WHERE note_id = ? LIMIT 1');
        $stmt->execute([$note_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            header('Content-Type: application/json');
            echo json_encode(['public' => false]);
            exit;
        }
        $token = $row['token'];
        $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
        $hasPassword = !empty($row['password']);
        
        // Build pretty URLs (same as create/renew)
        $protocol = get_protocol();
        $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
            $scriptDir = '';
        }
        $scriptDir = rtrim($scriptDir, '/\\');
        $base = $protocol . '://' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
        $url_query = $base . '/public_note.php?token=' . rawurlencode($token);
        $url_path = $base . '/' . rawurlencode($token);
        $url_workspace = $base . '/workspace/' . rawurlencode($token);

        header('Content-Type: application/json');
        echo json_encode(['public' => true, 'url' => $url_path, 'url_query' => $url_query, 'url_workspace' => $url_workspace, 'indexable' => $indexable, 'hasPassword' => $hasPassword]);
        exit;
    } elseif ($action === 'revoke') {
        // Delete any public note for this note
        $stmt = $con->prepare('DELETE FROM shared_notes WHERE note_id = ?');
        $stmt->execute([$note_id]);
        header('Content-Type: application/json');
        echo json_encode(['revoked' => true]);
        exit;
    } elseif ($action === 'update_indexable') {
        // Update the indexable status for this note's public version
        $indexable = isset($data['indexable']) ? (int)$data['indexable'] : 0;
        $stmt = $con->prepare('UPDATE shared_notes SET indexable = ? WHERE note_id = ?');
        $stmt->execute([$indexable, $note_id]);
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'indexable' => $indexable]);
        exit;
    } elseif ($action === 'update_password') {
        // Update the password for this note's public version
        $password = isset($data['password']) ? trim($data['password']) : '';
        // Hash the password if not empty, otherwise set to null
        $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
        $stmt = $con->prepare('UPDATE shared_notes SET password = ? WHERE note_id = ?');
        $stmt->execute([$hashedPassword, $note_id]);
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'hasPassword' => $password !== '']);
        exit;
    } elseif ($action === 'renew') {
        // Generate a new token and update existing row (or insert)
        $token = bin2hex(random_bytes(16));
        // Theme passed optionally — store with the token (do not expose in URL)
        $theme = isset($data['theme']) ? trim($data['theme']) : null;
        // Indexable parameter (default: 0 = not indexable)
        $indexable = isset($data['indexable']) ? (int)$data['indexable'] : 0;
        // Password parameter (optional)
        $password = isset($data['password']) ? trim($data['password']) : '';
        $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
        // If exists update, else insert
        $stmt = $con->prepare('SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1');
        $stmt->execute([$note_id]);
        $existsRow = $stmt->fetchColumn();
        if ($existsRow) {
            $stmt = $con->prepare('UPDATE shared_notes SET token = ?, theme = ?, indexable = ?, password = ?, created = CURRENT_TIMESTAMP WHERE note_id = ?');
            $stmt->execute([$token, $theme, $indexable, $hashedPassword, $note_id]);
        } else {
            $stmt = $con->prepare('INSERT INTO shared_notes (note_id, token, theme, indexable, password) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$note_id, $token, $theme, $indexable, $hashedPassword]);
        }
    } else {
        // Default: create (same as renew semantics)
        // Allow an optional custom token (slug) provided by the client
        $custom = isset($data['custom_token']) ? trim($data['custom_token']) : '';
        if ($custom !== '') {
            // Validate custom token: allow letters, numbers, dash, underscore and dots; length 4-128
            if (!preg_match('/^[A-Za-z0-9\-_.]{4,128}$/', $custom)) {
                header('Content-Type: application/json');
                http_response_code(400);
                echo json_encode(['error' => t('api.errors.invalid_custom_token', [], 'Invalid custom token. Allowed: letters, numbers, -, _, . (4-128 chars)')]);
                exit;
            }
            // Ensure uniqueness (except when it's already used by this note)
            $stmt = $con->prepare('SELECT note_id FROM shared_notes WHERE token = ? LIMIT 1');
            $stmt->execute([$custom]);
            $existing = $stmt->fetchColumn();
            if ($existing && intval($existing) !== $note_id) {
                header('Content-Type: application/json');
                http_response_code(409);
                echo json_encode(['error' => t('api.errors.token_already_in_use', [], 'Token already in use')]);
                exit;
            }
            $token = $custom;
        } else {
            $token = bin2hex(random_bytes(16));
        }

        // Insert or update existing token for this note; also store optional theme, indexable and password
        $theme = isset($data['theme']) ? trim($data['theme']) : null;
        $indexable = isset($data['indexable']) ? (int)$data['indexable'] : 0; // Default: not indexable
        $password = isset($data['password']) ? trim($data['password']) : '';
        $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
        $stmt = $con->prepare('SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1');
        $stmt->execute([$note_id]);
        $existsRow = $stmt->fetchColumn();
        if ($existsRow) {
            $stmt = $con->prepare('UPDATE shared_notes SET token = ?, theme = ?, indexable = ?, password = ?, created = CURRENT_TIMESTAMP WHERE note_id = ?');
            $stmt->execute([$token, $theme, $indexable, $hashedPassword, $note_id]);
        } else {
            $stmt = $con->prepare('INSERT INTO shared_notes (note_id, token, theme, indexable, password) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$note_id, $token, $theme, $indexable, $hashedPassword]);
        }
    }

    // If we reach here and have a token, build the URL
    if (empty($token)) {
        header('Content-Type: application/json');
        echo json_encode(['error' => t('api.errors.no_token_generated', [], 'No token generated')]);
        exit;
    }

    $protocol = get_protocol();
    $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
    // Build path safely: avoid double slashes when script is in webroot
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
        $scriptDir = '';
    }
    $scriptDir = rtrim($scriptDir, '/\\');
    // Build three variants without the theme parameter so the mode is not visible in the public URL
    $base = $protocol . '://' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
    $url_query = $base . '/public_note.php?token=' . rawurlencode($token);
    $url_path = $base . '/' . rawurlencode($token);
    $url_workspace = $base . '/workspace/' . rawurlencode($token);

    header('Content-Type: application/json');
    echo json_encode(['url' => $url_path, 'url_query' => $url_query, 'url_workspace' => $url_workspace, 'public' => true]);
    exit;
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => t('api.errors.server_error', ['error' => $e->getMessage()], 'Server error: ' . $e->getMessage())]);
    exit;
}
?>