<?php
/**
 * AJAX Note Loader
 * Returns only the note content for AJAX requests to avoid full page reload
 */

// Include the necessary files
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'auth.php';

// Check if this is an AJAX request
$is_ajax = isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

// Get the note parameter
$note = isset($_GET['note']) ? trim($_GET['note']) : '';

if (empty($note)) {
    http_response_code(400);
    echo json_encode(['error' => 'No note specified']);
    exit;
}

// Preserve search parameters
$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$tags_search = isset($_GET['tags_search']) ? trim($_GET['tags_search']) : '';
$folder_filter = isset($_GET['folder']) ? trim($_GET['folder']) : '';
$preserve_notes = !empty($_GET['preserve_notes']);
$preserve_tags = !empty($_GET['preserve_tags']);

// Mobile detection (simple version)
$is_mobile = isMobile();

try {
    // Build secure query for the specific note
    $where_conditions = ["trash = 0", "heading = ?"];
    $search_params = [$note];
    
    // Add search conditions if they exist
    if (!empty($search)) {
        $where_conditions[] = "(heading LIKE ? OR entry LIKE ?)";
        $search_params[] = '%' . $search . '%';
        $search_params[] = '%' . $search . '%';
    }
    
    if (!empty($tags_search)) {
        $where_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $tags_search . '%';
    }
    
    if (!empty($folder_filter)) {
        if ($folder_filter === 'Favorites') {
            $where_conditions[] = "favorite = 1";
        } else {
            $where_conditions[] = "folder = ?";
            $search_params[] = $folder_filter;
        }
    }
    
    $where_clause = implode(" AND ", $where_conditions);
    $query = "SELECT * FROM entries WHERE $where_clause LIMIT 1";
    
    $stmt = $con->prepare($query);
    $stmt->execute($search_params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    // Get note content
    $filename = getEntriesRelativePath() . $row["id"] . ".html";
    $title = $row['heading'];             
    $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
    
    if ($is_ajax) {
        // For AJAX requests, return JSON with note data
        header('Content-Type: application/json');
        
        echo json_encode([
            'success' => true,
            'id' => $row['id'],
            'title' => $title,
            'content' => $entryfinal,
            'tags' => $row['tags'] ?? '',
            'folder' => $row['folder'] ?? 'Uncategorized',
            'favorite' => $row['favorite'] ?? 0,
            'created' => $row['created'] ?? '',
            'updated' => $row['updated'] ?? '',
            'attachments' => $row['attachments'] ?? ''
        ]);
        exit;
    }
    
} catch (Exception $e) {
    error_log("Error in ajax-note-loader.php: " . $e->getMessage());
    
    if ($is_ajax) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Internal server error']);
        exit;
    }
}

// If we get here and it's not AJAX, redirect to main index
if (!$is_ajax) {
    $redirect_url = 'index.php?note=' . urlencode($note);
    if (!empty($search)) $redirect_url .= '&search=' . urlencode($search);
    if (!empty($tags_search)) $redirect_url .= '&tags_search=' . urlencode($tags_search);
    if (!empty($folder_filter)) $redirect_url .= '&folder=' . urlencode($folder_filter);
    if ($preserve_notes) $redirect_url .= '&preserve_notes=1';
    if ($preserve_tags) $redirect_url .= '&preserve_tags=1';
    
    header('Location: ' . $redirect_url);
    exit;
}
?>
