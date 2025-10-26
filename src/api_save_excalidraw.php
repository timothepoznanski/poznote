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

// Check if this is an embedded diagram save
$action = isset($_POST['action']) ? $_POST['action'] : 'save_full_note';

if ($action === 'save_embedded_diagram') {
    // Handle embedded diagram save
    saveEmbeddedDiagram();
    exit;
}

// Continue with regular full note save
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
    $query = "INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, ?, ?, ?, 'note', ?, ?)";
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

// Save HTML content to file (Excalidraw notes always use HTML files due to embedded diagrams)
if ($note_id > 0) {
    // Excalidraw notes always use .html extension regardless of the getFileExtensionForType function
    // because they contain complex HTML with embedded SVG/PNG diagrams
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
        $new_excalidraw_html = '<div class="excalidraw-container" contenteditable="false">';
        $new_excalidraw_html .= '<img src="data:' . $mime_type . ';base64,' . $base64_image . '" alt="Excalidraw diagram" class="excalidraw-image" data-is-excalidraw="true" data-excalidraw-note-id="' . $note_id . '" />';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
    } else {
        // If no image, create a placeholder with just the diagram data
        $new_excalidraw_html = '<div class="excalidraw-container" contenteditable="false">';
        $new_excalidraw_html .= '<p style="text-align:center; padding: 40px; color: #999;">Excalidraw diagram</p>';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
    }
    
    // If we have existing content, replace just the Excalidraw part
    if (!empty($existing_content)) {
        // Use regex to replace the existing excalidraw-container
        $updated_content = preg_replace(
            '/<div class="excalidraw-container"[^>]*>.*?<\/div>/s',
            $new_excalidraw_html,
            $existing_content
        );
        
        // If no replacement was made (no existing container), append to content
        if ($updated_content === $existing_content) {
            // No existing Excalidraw container found, append the new content
            $html_content = $existing_content . $new_excalidraw_html;
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

function saveEmbeddedDiagram() {
    global $con;
    
    $note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
    $diagram_id = isset($_POST['diagram_id']) ? trim($_POST['diagram_id']) : '';
    $workspace = isset($_POST['workspace']) ? trim($_POST['workspace']) : 'Poznote';
    $diagram_data = isset($_POST['diagram_data']) ? $_POST['diagram_data'] : '';
    $preview_image_base64 = isset($_POST['preview_image_base64']) ? $_POST['preview_image_base64'] : '';
    
    if ($note_id <= 0 || empty($diagram_id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid note ID or diagram ID']);
        return;
    }
    
    try {
        // Load the existing note HTML (Excalidraw always uses .html files)
        require_once 'functions.php';
        $html_file = getEntriesRelativePath() . $note_id . '.html';
        
        if (!file_exists($html_file)) {
            // HTML file doesn't exist, try to get content from database
            $stmt = $con->prepare("SELECT entry FROM entries WHERE id = ?");
            $stmt->execute([$note_id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Note not found']);
                return;
            }
            
            $html_content = $row['entry'] ?? '';
            
            // Create the HTML file with the database content
            $entriesDir = dirname($html_file);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            if (!empty($html_content)) {
                file_put_contents($html_file, $html_content);
            }
        } else {
            $html_content = file_get_contents($html_file);
        }
        
        // Extract preview image data (remove data:image/png;base64, prefix)
        $image_data = '';
        if (!empty($preview_image_base64) && strpos($preview_image_base64, 'data:image/png;base64,') === 0) {
            $image_data = substr($preview_image_base64, strlen('data:image/png;base64,'));
        }
        
        // Create the updated diagram HTML with embedded data and preview
        $diagram_html = '<div class="excalidraw-container" id="' . htmlspecialchars($diagram_id) . '" 
                              style="padding: 10px; margin: 10px 0; cursor: pointer; text-align: center;" 
                              data-diagram-id="' . htmlspecialchars($diagram_id) . '"
                              data-excalidraw="' . htmlspecialchars($diagram_data) . '">';
        
        if (!empty($image_data)) {
            $diagram_html .= '<img src="data:image/png;base64,' . $image_data . '" class="excalidraw-image" data-is-excalidraw="true" style="max-width: 100%; height: auto;" alt="Excalidraw diagram" />';
        } else {
            $diagram_html .= '<i class="fa fa-draw-polygon" style="font-size: 48px; color: #666; margin-bottom: 10px;"></i>
                              <p style="color: #666; font-size: 16px; margin: 0;">Excalidraw diagram</p>';
        }
        
        $diagram_html .= '</div>';
        
        // Find and replace the existing diagram container or button placeholder
        $pattern = '/<div class="excalidraw-container" id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/div>/s';
        $button_pattern = '/<button[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/button>/s';
        
        if (preg_match($pattern, $html_content)) {
            // Replace existing diagram container
            $html_content = preg_replace($pattern, $diagram_html, $html_content);
        } else if (preg_match($button_pattern, $html_content)) {
            // Replace existing button placeholder
            $html_content = preg_replace($button_pattern, $diagram_html, $html_content);
        } else {
            // Neither container nor button exists, add it to the end of the note
            if (empty($html_content)) {
                // If note is completely empty, just add the diagram
                $html_content = $diagram_html;
            } else {
                // Add diagram at the end of existing content
                $html_content .= "\n" . $diagram_html;
            }
        }
        
        // Save the updated HTML
        if (file_put_contents($html_file, $html_content) === false) {
            throw new Exception('Failed to write HTML file');
        }
        
        // Update the database with the new content and last modified time
        $stmt = $con->prepare("UPDATE entries SET entry = ?, updated = datetime('now') WHERE id = ?");
        $stmt->execute([$html_content, $note_id]);
        
        echo json_encode([
            'success' => true,
            'note_id' => $note_id,
            'diagram_id' => $diagram_id,
            'message' => 'Embedded diagram saved successfully'
        ]);
        
    } catch (Exception $e) {
        error_log("Error saving embedded diagram: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
    }
}