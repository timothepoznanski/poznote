<?php
// API to save Excalidraw diagram data
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'default_folder_settings.php';

// Check that the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
$workspace = isset($_POST['workspace']) ? trim($_POST['workspace']) : 'Poznote';
$heading = isset($_POST['heading']) ? trim($_POST['heading']) : 'New note';
$diagram_data = isset($_POST['diagram_data']) ? $_POST['diagram_data'] : '';
$preview_image = isset($_FILES['preview_image']) ? $_FILES['preview_image'] : null;

// Convert preview image to base64 HTML if provided
$base64_image = '';
$mime_type = '';
if ($preview_image && $preview_image['error'] === UPLOAD_ERR_OK) {
    // Validate it's an image
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime_type = finfo_file($finfo, $preview_image['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mime_type, ['image/png', 'image/jpeg', 'image/gif'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid image type']);
        exit;
    }
    
    // Convert image to base64
    $image_data = file_get_contents($preview_image['tmp_name']);
    $base64_image = base64_encode($image_data);
}

// If note_id is 0, we need to create a new note
if ($note_id === 0) {
    // Get folder from POST or use default
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : getDefaultFolderForNewNotes($workspace);
    
    // Validate workspace exists
    if (!empty($workspace)) {
        $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $wsStmt->execute([$workspace]);
        if ($wsStmt->fetchColumn() == 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Workspace not found']);
            exit;
        }
    }
    
    // Generate unique title
    $uniqueTitle = generateUniqueTitle($heading, null, $workspace);
    
    // Create new note - store diagram data in entry column for backward compatibility
    $created_date = date("Y-m-d H:i:s");
    $query = "INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, ?, ?, ?, 'excalidraw', ?, ?)";
    $stmt = $con->prepare($query);
    
    if ($stmt->execute([$uniqueTitle, $diagram_data, $folder, $workspace, $created_date, $created_date])) {
        $note_id = $con->lastInsertId();
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error creating note']);
        exit;
    }
} else {
    // Update existing note
    $stmt = $con->prepare('UPDATE entries SET heading = ?, entry = ?, updated = datetime("now") WHERE id = ?');
    if (!$stmt->execute([$heading, $diagram_data, $note_id])) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error updating note']);
        exit;
    }
}

// Save HTML content to file (same as other note types)
if ($note_id > 0) {
    $filename = getEntriesRelativePath() . $note_id . ".html";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Check if file exists to preserve existing content
    $existing_content = '';
    if (file_exists($filename)) {
        $existing_content = file_get_contents($filename);
    }
    
    // Generate new Excalidraw HTML content
    if (!empty($base64_image)) {
        $new_excalidraw_html = '<div><br></div>'; // Editable line above
        $new_excalidraw_html .= '<div class="excalidraw-container">';
        $new_excalidraw_html .= '<img src="data:' . $mime_type . ';base64,' . $base64_image . '" alt="Excalidraw diagram" class="excalidraw-image" data-is-excalidraw="true" data-excalidraw-note-id="' . $note_id . '" style="border: 1px solid #9ca3af; border-radius: 4px;" contenteditable="false" />';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
        $new_excalidraw_html .= '<div><br></div>'; // Editable line below
    } else {
        // If no image, create a placeholder with just the diagram data
        $new_excalidraw_html = '<div><br></div>'; // Editable line above
        $new_excalidraw_html .= '<div class="excalidraw-container">';
        $new_excalidraw_html .= '<p style="text-align:center; padding: 40px; color: #999;" contenteditable="false">Excalidraw diagram</p>';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
        $new_excalidraw_html .= '<div><br></div>'; // Editable line below
    }
    
    // If we have existing content, replace just the Excalidraw part
    if (!empty($existing_content)) {
        // Use regex to replace the existing excalidraw-container and surrounding divs
        // This pattern matches: optional empty div + excalidraw-container + optional empty div
        $updated_content = preg_replace(
            '/(?:<div><br><\/div>)?\s*<div class="excalidraw-container"[^>]*>.*?<\/div>\s*(?:<div><br><\/div>)?/s',
            $new_excalidraw_html,
            $existing_content
        );
        
        // If no replacement was made (no existing container), keep original content
        if ($updated_content === $existing_content) {
            // No existing Excalidraw container found, this shouldn't happen for updates
            // but let's handle it gracefully by replacing all content
            $html_content = $new_excalidraw_html;
        } else {
            $html_content = $updated_content;
        }
    } else {
        // New file, use just the Excalidraw content
        $html_content = $new_excalidraw_html;
    }
    
    // Write HTML content to file
    if (file_put_contents($filename, $html_content) === false) {
        error_log("Failed to write HTML file for Excalidraw note ID $note_id: $filename");
    }
}

echo json_encode([
    'success' => true,
    'note_id' => $note_id,
    'message' => 'Diagram saved successfully'
]);