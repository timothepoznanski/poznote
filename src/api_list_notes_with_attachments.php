<?php
/**
 * API to list all notes with attachments
 */
require 'auth.php';
requireApiAuth();
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

header('Content-Type: application/json');

try {
    $workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;
    
    // Build query to get all notes with attachments (non-trashed)
    $query = "SELECT id, heading, attachments, updated 
              FROM entries 
              WHERE trash = 0 
              AND attachments IS NOT NULL 
              AND attachments != '' 
              AND attachments != '[]'";
    
    $params = [];
    
    if ($workspace !== null && $workspace !== '') {
        $query .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    $query .= " ORDER BY updated DESC";
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    
    $notes = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Parse attachments JSON
        $attachments = json_decode($row['attachments'], true);
        
        // Only include if attachments array is not empty
        if (is_array($attachments) && count($attachments) > 0) {
            $notes[] = [
                'id' => $row['id'],
                'heading' => $row['heading'],
                'attachments' => $attachments,
                'updated' => $row['updated']
            ];
        }
    }
    
    echo json_encode([
        'success' => true,
        'notes' => $notes,
        'count' => count($notes)
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
