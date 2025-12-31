<?php
require 'auth.php';
requireApiAuth();
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

header('Content-Type: application/json');

try {
    // Get workspace filter if provided
    $workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;
    
    // Query to get all shared notes with their details
    $query = "SELECT 
        sn.id as share_id,
        sn.note_id,
        sn.token,
        sn.theme,
        sn.indexable,
        CASE WHEN sn.password IS NOT NULL AND sn.password != '' THEN 1 ELSE 0 END as hasPassword,
        sn.created as shared_date,
        e.heading,
        e.folder,
        e.workspace,
        e.updated
    FROM shared_notes sn
    INNER JOIN entries e ON sn.note_id = e.id
    WHERE e.trash = 0";
    
    $params = [];
    
    // Apply workspace filter if specified
    if ($workspace) {
        $query .= " AND e.workspace = ?";
        $params[] = $workspace;
    }
    
    $query .= " ORDER BY sn.created DESC";
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $shared_notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Build URLs for each shared note
    $protocol = get_protocol();
    $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
        $scriptDir = '';
    }
    $scriptDir = rtrim($scriptDir, '/\\');
    $base = $protocol . '://' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
    
    foreach ($shared_notes as &$note) {
        $token = $note['token'];
        $note['url'] = $base . '/' . rawurlencode($token);
        $note['url_query'] = $base . '/public_note.php?token=' . rawurlencode($token);
        $note['url_workspace'] = $base . '/workspace/' . rawurlencode($token);
    }
    
    echo json_encode([
        'success' => true,
        'shared_notes' => $shared_notes
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to retrieve shared notes: ' . $e->getMessage()
    ]);
}
