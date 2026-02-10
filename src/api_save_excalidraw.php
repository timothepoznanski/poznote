<?php
// API to save Excalidraw diagram data
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

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
$note_id = intval($_POST['note_id'] ?? 0);
$workspace = trim($_POST['workspace'] ?? '') ?: getFirstWorkspaceName();
$heading = trim($_POST['heading'] ?? '') ?: 'New note';
$diagram_data = $_POST['diagram_data'] ?? '';
$preview_image = $_FILES['preview_image'] ?? null;

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
    $folder_id = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
    // If folder_id is 0, treat it as null
    if ($folder_id === 0) {
        $folder_id = null;
    }
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : null;
    
    // If folder_id is provided, get folder name
    if ($folder_id !== null && $folder === null) {
        $fStmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
        $fStmt->execute([$folder_id, $workspace]);
        $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
        if ($folderData) {
            $folder = $folderData['name'];
        } else {
            $folder = null;
            $folder_id = null;
        }
    } elseif ($folder !== null && $folder_id === null) {
        // If folder name is provided, get folder_id
        $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
        $fStmt->execute([$folder, $workspace]);
        $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
        if ($folderData) {
            $folder_id = (int)$folderData['id'];
        }
    }
    
    // Validate workspace exists
    if (!empty($workspace)) {
        $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $wsStmt->execute([$workspace]);
        if ($wsStmt->fetchColumn() == 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
            exit;
        }
    }
    
    // Generate unique title (folder-aware)
    $uniqueTitle = generateUniqueTitle($heading, null, $workspace, $folder_id);
    
    // Create new note - store diagram data in entry column for backward compatibility
    $created_date = date("Y-m-d H:i:s");
    $query = "INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, created, updated) VALUES (?, ?, ?, ?, ?, 'note', ?, ?)";
    $stmt = $con->prepare($query);
    
    if ($stmt->execute([$uniqueTitle, $diagram_data, $folder, $folder_id, $workspace, $created_date, $created_date])) {
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
    $filename = getEntriesPath() . '/' . $note_id . ".html";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Check if file exists to preserve existing content
    $existing_content = '';
    $existing_img_classes = '';
    $existing_img_style = '';
    if (file_exists($filename)) {
        $existing_content = file_get_contents($filename);
        
        // Extract existing image classes and style to preserve border settings
        if (preg_match('/<img[^>]+class="([^"]*)"[^>]*\/?>/', $existing_content, $class_matches)) {
            $existing_img_classes = $class_matches[1];
        }
        if (preg_match('/<img[^>]+style="([^"]*)"[^>]*\/?>/', $existing_content, $style_matches)) {
            $existing_img_style = $style_matches[1];
        }
    }
    
    // Generate new Excalidraw HTML content
    $excalidraw_placeholder = t('editor.excalidraw.placeholder_outside', [], '…');
    $excalidraw_placeholder = htmlspecialchars($excalidraw_placeholder, ENT_QUOTES);

    if (!empty($base64_image)) {
        // Build class attribute preserving border classes
        $img_classes = 'excalidraw-image';
        if (!empty($existing_img_classes)) {
            // Preserve img-with-border and img-with-border-no-padding classes
            if (strpos($existing_img_classes, 'img-with-border-no-padding') !== false) {
                $img_classes .= ' img-with-border-no-padding';
            } elseif (strpos($existing_img_classes, 'img-with-border') !== false) {
                $img_classes .= ' img-with-border';
            }
        }
        
        // Build style attribute
        $img_style = !empty($existing_img_style) ? ' style="' . htmlspecialchars($existing_img_style) . '"' : '';
        
        // Build the core container without placeholders initially
        $new_excalidraw_html = '<div class="excalidraw-container" contenteditable="false">';
        $new_excalidraw_html .= '<img src="data:' . $mime_type . ';base64,' . $base64_image . '" alt="Excalidraw diagram" class="' . $img_classes . '" data-is-excalidraw="true" data-excalidraw-note-id="' . $note_id . '"' . $img_style . ' />';
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
        // Use regex to replace the existing excalidraw-container, including surrounding placeholders if they exist
        $pattern_with_placeholders = '/(<p class="excalidraw-placeholder"[^>]*><\/p>)?\s*<div class="excalidraw-container"[^>]*>.*?<\/div>\s*(<p class="excalidraw-placeholder"[^>]*><\/p>)?/s';
        
        if (preg_match($pattern_with_placeholders, $existing_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Found existing container, replace without placeholders
            $match_start = $matches[0][1];
            $match_end = $match_start + strlen($matches[0][0]);
            
            $html_content = substr($existing_content, 0, $match_start) . $new_excalidraw_html . substr($existing_content, $match_end);
        } else {
            // No existing Excalidraw container found, append without placeholders
            $html_content = $existing_content . $new_excalidraw_html;
        }
    } else {
        // New file, use the Excalidraw content without placeholders
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
    $workspace = isset($_POST['workspace']) ? trim($_POST['workspace']) : getFirstWorkspaceName();
    $diagram_data = isset($_POST['diagram_data']) ? $_POST['diagram_data'] : '';
    $preview_image_base64 = isset($_POST['preview_image_base64']) ? $_POST['preview_image_base64'] : '';
    $cursor_position = isset($_POST['cursor_position']) ? intval($_POST['cursor_position']) : null;
    $excalidraw_placeholder = t('editor.excalidraw.placeholder_outside', [], '…');
    $excalidraw_placeholder = htmlspecialchars($excalidraw_placeholder, ENT_QUOTES);
    
    if ($note_id <= 0 || empty($diagram_id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid note ID or diagram ID']);
        return;
    }
    
    try {
        // Load the existing note HTML (Excalidraw always uses .html files)
        require_once 'functions.php';
        $html_file = getEntriesPath() . '/' . $note_id . '.html';
        
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
        
        // Extract existing image classes and style to preserve border settings
        $existing_img_classes = '';
        $existing_img_style = '';
        // Pattern flexible: class before id, or id before class
        $pattern_for_extraction = '/<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<img[^>]+class="([^"]*)"[^>]*style="([^"]*)".*?<\/div>/s';
        $pattern_for_extraction_alt = '/<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>.*?<img[^>]+class="([^"]*)"[^>]*style="([^"]*)".*?<\/div>/s';
        if (preg_match($pattern_for_extraction, $html_content, $extraction_matches) || 
            preg_match($pattern_for_extraction_alt, $html_content, $extraction_matches)) {
            if (isset($extraction_matches[1])) {
                $existing_img_classes = $extraction_matches[1];
            }
            if (isset($extraction_matches[2])) {
                $existing_img_style = $extraction_matches[2];
            }
        } else {
            // Try extracting just class or just style separately (flexible order)
            $class_pattern = '/<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<img[^>]+class="([^"]*)".*?<\/div>/s';
            $class_pattern_alt = '/<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>.*?<img[^>]+class="([^"]*)".*?<\/div>/s';
            $style_pattern = '/<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<img[^>]+style="([^"]*)".*?<\/div>/s';
            $style_pattern_alt = '/<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>.*?<img[^>]+style="([^"]*)".*?<\/div>/s';
            
            if (preg_match($class_pattern, $html_content, $class_matches) || 
                preg_match($class_pattern_alt, $html_content, $class_matches)) {
                $existing_img_classes = $class_matches[1];
            }
            if (preg_match($style_pattern, $html_content, $style_matches) || 
                preg_match($style_pattern_alt, $html_content, $style_matches)) {
                $existing_img_style = $style_matches[1];
            }
        }
        
        // Build class attribute preserving border classes
        $img_classes = 'excalidraw-image';
        if (!empty($existing_img_classes)) {
            // Preserve img-with-border and img-with-border-no-padding classes
            if (strpos($existing_img_classes, 'img-with-border-no-padding') !== false) {
                $img_classes .= ' img-with-border-no-padding';
            } elseif (strpos($existing_img_classes, 'img-with-border') !== false) {
                $img_classes .= ' img-with-border';
            }
        }
        
        // Build style attribute
        $base_style = 'max-width: 100%; height: auto;';
        if (!empty($existing_img_style)) {
            // Merge existing style with base style
            $img_style_attr = ' style="' . htmlspecialchars($base_style . ' ' . $existing_img_style) . '"';
        } else {
            $img_style_attr = ' style="' . $base_style . '"';
        }
        
        // Create the core diagram HTML without placeholders initially
        // Keep all attributes on a single line for consistent regex matching
        $diagram_html_core = '<div class="excalidraw-container" id="' . htmlspecialchars($diagram_id) . '" style="padding: 10px; cursor: pointer; text-align: center;" data-diagram-id="' . htmlspecialchars($diagram_id) . '" data-excalidraw="' . htmlspecialchars($diagram_data) . '">';
        
        if (!empty($image_data)) {
            $diagram_html_core .= '<img src="data:image/png;base64,' . $image_data . '" class="' . $img_classes . '" data-is-excalidraw="true"' . $img_style_attr . ' alt="Excalidraw diagram" />';
        } else {
            $diagram_html_core .= '<i class="fa fa-draw-polygon" style="font-size: 48px; color: #666; margin-bottom: 10px;"></i>
                              <p style="color: #666; font-size: 16px; margin: 0;">Excalidraw diagram</p>';
        }
        
        $diagram_html_core .= '</div>';
        
        // Find and replace the existing diagram container or button placeholder
        // Flexible patterns to match both attribute orders (class before id, or id before class)
        $pattern_with_placeholders = '/(<p class="excalidraw-placeholder"[^>]*><\/p>)?\s*<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/div>\s*(<p class="excalidraw-placeholder"[^>]*><\/p>)?/s';
        $pattern_with_placeholders_alt = '/(<p class="excalidraw-placeholder"[^>]*><\/p>)?\s*<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>.*?<\/div>\s*(<p class="excalidraw-placeholder"[^>]*><\/p>)?/s';
        $button_pattern = '/<button[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/button>/s';
        
        if (preg_match($pattern_with_placeholders, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing diagram container without placeholders
            $match_start = $matches[0][1];
            $match_end = $match_start + strlen($matches[0][0]);
            
            $html_content = substr($html_content, 0, $match_start) . $diagram_html_core . substr($html_content, $match_end);
        } else if (preg_match($pattern_with_placeholders_alt, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing diagram container (alternate attribute order)
            $match_start = $matches[0][1];
            $match_end = $match_start + strlen($matches[0][0]);
            
            $html_content = substr($html_content, 0, $match_start) . $diagram_html_core . substr($html_content, $match_end);
        } else if (preg_match($button_pattern, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing button placeholder without placeholders
            $html_content = preg_replace($button_pattern, $diagram_html_core, $html_content);
        } else {
            // Neither container nor button exists, insert at cursor position if available
            // Build diagram without extra line breaks that cause shifting
            $diagram_html_new = $diagram_html_core;
            
            if ($cursor_position !== null && !empty($html_content)) {
                // Normalize HTML to text length comparable to DOM selection offsets
                $plain_text = html_entity_decode($html_content, ENT_QUOTES | ENT_HTML5);
                $plain_text = preg_replace('/<br\s*\/?\s*>/i', "\n", $plain_text);
                $plain_text = preg_replace('/<\/(p|div|li|h[1-6])\s*>/i', "\n", $plain_text);
                $plain_text = strip_tags($plain_text);
                
                // If cursor position is valid
                if ($cursor_position >= 0 && $cursor_position <= mb_strlen($plain_text)) {
                    // Find the HTML position that corresponds to the plain text position
                    $html_position = findHtmlPositionFromTextOffset($html_content, $cursor_position);
                    
                    if ($html_position !== false) {
                        // Insert the diagram at the calculated position
                        $html_content = mb_substr($html_content, 0, $html_position) . 
                                       $diagram_html_new . 
                                       mb_substr($html_content, $html_position);
                    } else {
                        // Fallback: add at the end if position calculation fails
                        $html_content .= $diagram_html_new;
                    }
                } else {
                    // Invalid cursor position, add at the end
                    $html_content .= $diagram_html_new;
                }
            } else if (empty($html_content)) {
                // If note is completely empty, just add the diagram
                $html_content = $diagram_html_new;
            } else {
                // No cursor position provided, add diagram at the end of existing content
                $html_content .= $diagram_html_new;
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

/**
 * Find the HTML position corresponding to a plain text offset
 * This helps insert content at the cursor position in HTML content
 */
function findHtmlPositionFromTextOffset($html_content, $text_offset) {
    // Decode HTML entities first to get accurate text position
    $decoded_html = html_entity_decode($html_content, ENT_QUOTES | ENT_HTML5);
    
    $html_length = mb_strlen($decoded_html);
    $text_position = 0;
    $html_position = 0;
    $in_tag = false;
    
    while ($html_position < $html_length && $text_position < $text_offset) {
        $char = mb_substr($decoded_html, $html_position, 1);
        
        if ($char === '<') {
            $in_tag = true;
            $tag_end = mb_strpos($decoded_html, '>', $html_position);
            if ($tag_end === false) {
                break;
            }

            $tag_content = mb_substr($decoded_html, $html_position + 1, $tag_end - $html_position - 1);
            $tag_trim = trim($tag_content);
            $tag_name = strtolower(preg_replace('/\s+.*/', '', ltrim($tag_trim, '/')));

            // Count line breaks for <br> and closing block tags
            if ($tag_name === 'br') {
                $text_position++;
            } else if (preg_match('/^\/(p|div|li|h[1-6])\b/i', $tag_trim)) {
                $text_position++;
            }

            $html_position = $tag_end;
            $in_tag = false;
        } else if ($char === '>') {
            $in_tag = false;
        } else if (!$in_tag) {
            // Count non-tag characters as text
            $text_position++;
        }
        
        $html_position++;
    }
    
    // Return position in original HTML (with entities)
    // We need to find the corresponding position in the original string
    $original_position = 0;
    $decoded_position = 0;
    
    while ($decoded_position < $html_position && $original_position < mb_strlen($html_content)) {
        // Check if we're at an HTML entity in the original content
        if (mb_substr($html_content, $original_position, 1) === '&') {
            // Find the end of the entity
            $entity_end = mb_strpos($html_content, ';', $original_position);
            if ($entity_end !== false) {
                $entity = mb_substr($html_content, $original_position, $entity_end - $original_position + 1);
                $decoded_entity = html_entity_decode($entity, ENT_QUOTES | ENT_HTML5);
                
                // Skip the entire entity in original, but only count decoded length in decoded
                $original_position = $entity_end + 1;
                $decoded_position += mb_strlen($decoded_entity);
                continue;
            }
        }
        
        $original_position++;
        $decoded_position++;
    }
    
    return $original_position;
}