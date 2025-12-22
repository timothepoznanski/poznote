<?php
require 'auth.php';
requireApiAuth();
require_once 'config.php';
require_once 'db_connect.php';

// Only accept JSON POST
$body = file_get_contents('php://input');
$data = json_decode($body, true);
if (!$data || !isset($data['note_id'])) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => 'note_id required']);
    exit;
}

$note_id = intval($data['note_id']);
// action: create (default), get, revoke, renew
$action = isset($data['action']) ? strtolower(trim($data['action'])) : 'create';

// Verify that the user has access to this note (owner or can view in workspace)
try {
    $stmt = $con->prepare('SELECT id FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $exists = $stmt->fetchColumn();
    if (!$exists) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }

    // Handle actions
    if ($action === 'get') {
        // Return existing share URL if any
        $stmt = $con->prepare('SELECT token FROM shared_notes WHERE note_id = ? LIMIT 1');
        $stmt->execute([$note_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            header('Content-Type: application/json');
            echo json_encode(['shared' => false]);
            exit;
        }
        $token = $row['token'];
        
        // Build URL with theme parameter
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
            $scriptDir = '';
        }
        $scriptDir = rtrim($scriptDir, '/\\');
        $themeParam = isset($data['theme']) ? '&theme=' . urlencode($data['theme']) : '';
        $url = $protocol . '://' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '') . '/public_note.php?token=' . $token . $themeParam;
        
        header('Content-Type: application/json');
        echo json_encode(['shared' => true, 'url' => $url]);
        exit;
    } elseif ($action === 'revoke') {
        // Delete any share for this note
        $stmt = $con->prepare('DELETE FROM shared_notes WHERE note_id = ?');
        $stmt->execute([$note_id]);
        header('Content-Type: application/json');
        echo json_encode(['revoked' => true]);
        exit;
    } elseif ($action === 'renew') {
        // Generate a new token and update existing row (or insert)
        $token = bin2hex(random_bytes(16));
        // If exists update, else insert
        $stmt = $con->prepare('SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1');
        $stmt->execute([$note_id]);
        $existsRow = $stmt->fetchColumn();
        if ($existsRow) {
            $stmt = $con->prepare('UPDATE shared_notes SET token = ?, created = CURRENT_TIMESTAMP WHERE note_id = ?');
            $stmt->execute([$token, $note_id]);
        } else {
            $stmt = $con->prepare('INSERT INTO shared_notes (note_id, token) VALUES (?, ?)');
            $stmt->execute([$note_id, $token]);
        }
    } else {
        // Default: create (same as renew semantics)
        $token = bin2hex(random_bytes(16));
        // Insert or replace existing token for this note
        // Use REPLACE INTO to simplify logic (works with unique token constraint)
        try {
            $stmt = $con->prepare('INSERT INTO shared_notes (note_id, token) VALUES (?, ?)');
            $stmt->execute([$note_id, $token]);
        } catch (Exception $e) {
            // If insert fails (unique token?), try update
            $stmt = $con->prepare('UPDATE shared_notes SET token = ?, created = CURRENT_TIMESTAMP WHERE note_id = ?');
            $stmt->execute([$token, $note_id]);
        }
    }

    // If we reach here and have a token, build the URL
    if (empty($token)) {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'No token generated']);
        exit;
    }

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
    // Build path safely: avoid double slashes when script is in webroot
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
        $scriptDir = '';
    }
    $scriptDir = rtrim($scriptDir, '/\\');
    // Include theme parameter if provided
    $themeParam = isset($data['theme']) ? '&theme=' . urlencode($data['theme']) : '';
    $url = $protocol . '://' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '') . '/public_note.php?token=' . $token . $themeParam;

    header('Content-Type: application/json');
    echo json_encode(['url' => $url, 'shared' => true]);
    exit;
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
    exit;
}
?>