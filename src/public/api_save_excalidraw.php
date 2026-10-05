<?php
// API to save Excalidraw diagram data
require_once __DIR__ . '/../auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../lib/excalidraw-preview.php';
require_once __DIR__ . '/../lib/excalidraw-note-html.php';

// Everything below only reads the session. A save carries megabytes when
// the diagram holds a photo and may wait on attachment storage (S3), and
// PHP's session lock would make every other request of this browser wait
// for it (issue #1567).
session_write_close();

// Check that the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Check if this is an embedded diagram save
$action = isset($_POST['action']) ? $_POST['action'] : 'save_full_note';
$actor_user_id = (int)(getAuthenticatedUserId() ?? getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0));

/**
 * 423 when another editor holds this note's edit lock, the same rule the
 * REST PATCH endpoint applies; returns only when the write may proceed.
 */
function excalidrawAssertNoteNotLockedByOther(int $note_id): void {
    $blockingLock = getBlockingNoteEditLock(
        (int)(getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0)),
        $note_id,
        getNoteEditLockActorUserId()
    );
    if ($blockingLock !== null) {
        http_response_code(423);
        echo json_encode(['success' => false, 'message' => 'This note is currently being edited by ' . describeNoteEditLockHolder($blockingLock)]);
        exit;
    }
}

/**
 * The preview the note displays through <img>: the SVG Excalidraw exported,
 * crisp at any pixel density (issue #1434), with the theme it was exported
 * under taken back out of it (issue #1445). Returns null when the request
 * carries none, and answers 400 when it carries something that is not an
 * Excalidraw SVG. Both rules live in lib/excalidraw-preview.php.
 */
function excalidrawReadPreviewSvg(): ?string {
    $svg = $_POST['preview_svg'] ?? '';
    if (!is_string($svg) || trim($svg) === '') {
        return null;
    }
    $svg = poznoteStripExcalidrawPreviewTheme($svg);
    if (!poznoteIsAcceptableExcalidrawPreviewSvg($svg)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid image type']);
        exit;
    }
    return $svg;
}

/**
 * The attachment list without the previews a save replaces. A preview that a
 * revision of the note still shows stays on disk, hidden from the note
 * (snapshot_only), so that restoring the revision brings its image back
 * instead of a broken one; poznotePruneSnapshotOnlyAttachments() deletes it
 * once no revision references it any more.
 */
function excalidrawRetirePreviews(int $note_id, array $attachments, array $oldIds): array {
    $snapshotContents = null;
    $kept = [];
    foreach ($attachments as $attachment) {
        if (!is_array($attachment) || !isset($attachment['id']) || !in_array($attachment['id'], $oldIds, true)) {
            $kept[] = $attachment;
            continue;
        }
        $snapshotContents = $snapshotContents ?? poznoteReadNoteSnapshotContents($note_id);
        if (poznoteAttachmentIsReferencedInSnapshots($note_id, $attachment, $snapshotContents)) {
            $attachment['snapshot_only'] = true;
            $kept[] = $attachment;
        } else {
            // Delete the old file (local disk or S3 bucket)
            poznoteDeleteAttachmentFile($attachment['filename'] ?? '');
        }
    }
    return $kept;
}

if ($action === 'save_embedded_diagram') {
    // Handle embedded diagram save
    saveEmbeddedDiagram();
    exit;
}

// Continue with regular full note save
$note_id = intval($_POST['note_id'] ?? 0);
$workspace = trim($_POST['workspace'] ?? '') ?: getWorkspaceFilter();
$heading = trim($_POST['heading'] ?? '') ?: 'New note';
$diagram_data = $_POST['diagram_data'] ?? '';

if ($workspace === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => t('api.errors.workspace_required', [], 'Workspace is required')]);
    exit;
}

$wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
$wsStmt->execute([$workspace]);
if ((int)$wsStmt->fetchColumn() === 0) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
    exit;
}

if ($note_id > 0) {
    $existingNoteStmt = $con->prepare('SELECT id FROM entries WHERE id = ? AND workspace = ? AND trash = 0');
    $existingNoteStmt->execute([$note_id, $workspace]);
    if (!$existingNoteStmt->fetch(PDO::FETCH_ASSOC)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        exit;
    }
    excalidrawAssertNoteNotLockedByOther($note_id);
}

// Save the preview as an attachment if provided
$attachmentId = null;
$image_data = excalidrawReadPreviewSvg();
if ($image_data !== null) {
    $attachmentId = uniqid();
}

// If note_id is 0, we need to create a new note
$is_new_note = ($note_id === 0);
if ($note_id === 0) {
    $quotaError = poznoteCheckNoteQuota($con)
        ?? poznoteCheckStorageQuota(strlen((string)$diagram_data));
    if ($quotaError !== null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => $quotaError]);
        exit;
    }

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
    
    // Generate unique title (folder-aware)
    $uniqueTitle = generateUniqueTitle($heading, null, $workspace, $folder_id);
    
    // Create new note - store diagram data in entry column for backward compatibility
    $created_date = date("Y-m-d H:i:s");
    $query = "INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, created, updated, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, 'note', ?, ?, ?, ?)";
    $stmt = $con->prepare($query);
    
    if ($stmt->execute([$uniqueTitle, $diagram_data, $folder, $folder_id, $workspace, $created_date, $created_date, $actor_user_id, $actor_user_id])) {
        $note_id = $con->lastInsertId();
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error creating note']);
        exit;
    }
} else {
    // Update existing note. The heading is deliberately left untouched: the
    // editor has no title field, and the posted heading is only meaningful
    // when creating the note (it may also have been de-duplicated by
    // generateUniqueTitle at creation time). The entry column is written
    // further down, once the note's HTML is known.
    $stmt = $con->prepare('UPDATE entries SET updated = datetime("now"), updated_by_user_id = ? WHERE id = ? AND workspace = ? AND trash = 0');
    if (!$stmt->execute([$actor_user_id, $note_id, $workspace])) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error updating note']);
        exit;
    }
}

// Save HTML content to file (Excalidraw notes always use HTML files due to embedded diagrams)
if ($note_id > 0) {
    // Excalidraw notes always use .html extension regardless of the getFileExtensionForType function
    // because they contain complex HTML with embedded SVG/PNG diagrams
    $noteFilename = getEntriesPath() . '/' . $note_id . ".html";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($noteFilename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Check if file exists to preserve existing content
    $existing_content = '';
    $existing_diagrams = [];
    $existing_img_classes = '';
    $existing_img_style = '';
    if (file_exists($noteFilename)) {
        $existing_content = (string)file_get_contents($noteFilename);
        // The diagram this save replaces, plus any copy an older save
        // appended instead of replacing (issue #1567)
        $existing_diagrams = poznoteFindExcalidrawNoteDiagrams($existing_content);

        // Extract existing image classes and style to preserve border settings
        if (preg_match('/<img[^>]+class="([^"]*)"[^>]*\/?>/', $existing_content, $class_matches)) {
            $existing_img_classes = $class_matches[1];
        }
        if (preg_match('/<img[^>]+style="([^"]*)"[^>]*\/?>/', $existing_content, $style_matches)) {
            $existing_img_style = $style_matches[1];
        }
    }
    
    // Handle attachment if a preview was provided
    if ($attachmentId !== null && $image_data !== null) {
        // Get existing attachments
        $stmt = $con->prepare("SELECT attachments FROM entries WHERE id = ? AND workspace = ? AND trash = 0");
        $stmt->execute([$note_id, $workspace]);
        $noteData = $stmt->fetch(PDO::FETCH_ASSOC);
        $existingAttachments = $noteData && $noteData['attachments'] ? json_decode($noteData['attachments'], true) : [];
        if (!is_array($existingAttachments)) $existingAttachments = [];
        
        // Remove the preview images of the diagrams being replaced. The
        // drawing before this save gets its automatic revision first (at
        // most one every ten minutes), so that the preview it shows is
        // known to be still needed.
        $oldAttachmentIds = $existing_diagrams
            ? poznoteExcalidrawNoteDiagramAttachmentIds($existing_content, $existing_diagrams, (int)$note_id)
            : [];
        if ($oldAttachmentIds) {
            poznoteCreateAutomaticSnapshot($con, $note_id);
            $existingAttachments = excalidrawRetirePreviews((int)$note_id, $existingAttachments, $oldAttachmentIds);
        }

        // Save the new preview as attachment
        $attachmentFilename = $attachmentId . '_' . time() . '.svg';

        if (poznoteStoreAttachmentContent($image_data, $attachmentFilename, 'image/svg+xml')) {
            // Add to attachments list
            $existingAttachments[] = [
                'id' => $attachmentId,
                'filename' => $attachmentFilename,
                'original_filename' => 'excalidraw_preview.svg',
                'file_size' => strlen($image_data),
                'file_type' => 'image/svg+xml',
                'uploaded_at' => date('Y-m-d H:i:s')
            ];
            
            // Update attachments in database
            $updateStmt = $con->prepare("UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ? AND trash = 0");
            $updateStmt->execute([json_encode($existingAttachments), $note_id, $workspace]);
        }
    }
    
    // Generate new Excalidraw HTML content
    $excalidraw_placeholder = t('editor.excalidraw.placeholder_outside', [], 'Write outside the diagram here…');
    $excalidraw_placeholder = htmlspecialchars($excalidraw_placeholder, ENT_QUOTES);

    if ($attachmentId) {
        // Build img classes preserving border settings.
        // excalidraw-image-neutral says the file carries no theme, so the page
        // may paint the ground behind it and invert it in a dark theme
        // (issue #1445). A preview saved before that has the theme baked in
        // and keeps the class off, which leaves it rendered untouched.
        $img_classes = 'excalidraw-image excalidraw-image-neutral';
        if (!empty($existing_img_classes)) {
            if (strpos($existing_img_classes, 'img-with-border-no-padding') !== false) {
                $img_classes .= ' img-with-border-no-padding';
            } elseif (strpos($existing_img_classes, 'img-with-border') !== false) {
                $img_classes .= ' img-with-border';
            }
        }
        
        // Build style attribute
        $img_style = !empty($existing_img_style) ? ' style="' . htmlspecialchars($existing_img_style) . '"' : '';
        
        // Build the core container with attachment URL instead of base64
        $new_excalidraw_html = '<div class="excalidraw-container" contenteditable="false">';
        $new_excalidraw_html .= '<img src="/api/v1/notes/' . $note_id . '/attachments/' . $attachmentId . '" alt="Excalidraw diagram" class="' . $img_classes . '" data-is-excalidraw="true" data-excalidraw-note-id="' . $note_id . '"' . $img_style . ' />';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
    } else {
        // If no image, create a placeholder with just the diagram data
        $new_excalidraw_html = '<div class="excalidraw-container" contenteditable="false">';
        $new_excalidraw_html .= '<p style="text-align:center; padding: 40px; color: #999;">Excalidraw diagram</p>';
        $new_excalidraw_html .= '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($diagram_data, ENT_QUOTES) . '</div>';
        $new_excalidraw_html .= '</div>';
    }
    
    // If we have existing content, replace just the Excalidraw part, keeping
    // whatever text the note has around it
    if (!empty($existing_content)) {
        $html_content = poznoteReplaceExcalidrawNoteDiagram($existing_content, $new_excalidraw_html, $existing_diagrams);
    } else {
        // New file, use the Excalidraw content without placeholders
        $html_content = $new_excalidraw_html;
    }
    
    // The drawing before this save: its automatic revision, at most one
    // every ten minutes. A note created by this save has no "before": its
    // revision used to hold the bare diagram JSON of the entry column, and
    // restoring it turned the note into that JSON.
    if (!$is_new_note) {
        poznoteCreateAutomaticSnapshot($con, $note_id);
    }

    // Write HTML content to file
    if (file_put_contents($noteFilename, $html_content) === false) {
        error_log("Failed to write HTML file for Excalidraw note ID $note_id");
    } else {
        // The entry column is what search reads, and it holds the note's HTML
        // like after any other save. It used to get the diagram JSON alone,
        // so text written around the diagram stopped being found until the
        // note page saved it again.
        $entryStmt = $con->prepare('UPDATE entries SET entry = ? WHERE id = ? AND workspace = ? AND trash = 0');
        $entryStmt->execute([$html_content, $note_id, $workspace]);
    }
}

echo json_encode([
    'success' => true,
    'note_id' => $note_id,
    'message' => 'Diagram saved successfully'
]);

function saveEmbeddedDiagram() {
    global $con, $actor_user_id;
    
    $note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
    $diagram_id = isset($_POST['diagram_id']) ? trim($_POST['diagram_id']) : '';
    $workspace = trim($_POST['workspace'] ?? '') ?: getWorkspaceFilter();
    $diagram_data = isset($_POST['diagram_data']) ? $_POST['diagram_data'] : '';
    $cursor_position = isset($_POST['cursor_position']) ? intval($_POST['cursor_position']) : null;
    $excalidraw_placeholder = t('editor.excalidraw.placeholder_outside', [], 'Write outside the diagram here…');
    $excalidraw_placeholder = htmlspecialchars($excalidraw_placeholder, ENT_QUOTES);
    
    if ($note_id <= 0 || empty($diagram_id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid note ID or diagram ID']);
        return;
    }
    
    try {
        // Load the existing note content using the note's native storage file.
        require_once __DIR__ . '/../functions.php';
        $stmt = $con->prepare("SELECT entry, type, attachments FROM entries WHERE id = ? AND workspace = ? AND trash = 0");
        $stmt->execute([$note_id, $workspace]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Note not found']);
            return;
        }

        excalidrawAssertNoteNotLockedByOther($note_id);

        $note_type = !empty($row['type']) ? $row['type'] : 'note';
        $content_file = getEntryFilename($note_id, $note_type);
        $read_file = $content_file;
        $legacy_html_file = getEntriesPath() . '/' . $note_id . '.html';
        if (!file_exists($read_file) && file_exists($legacy_html_file)) {
            $read_file = $legacy_html_file;
        }
        
        if (!file_exists($read_file)) {
            // Content file doesn't exist, try to get content from database.
            $html_content = $row['entry'] ?? '';
            
            // Create the native note file with the database content.
            $entriesDir = dirname($content_file);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            if (!empty($html_content)) {
                file_put_contents($content_file, $html_content);
            }
        } else {
            $html_content = file_get_contents($read_file);
            if ($html_content === false) {
                $html_content = $row['entry'] ?? '';
            }
        }
        
        // Save the preview as an attachment if provided
        $attachmentId = null;
        $image_data = excalidrawReadPreviewSvg();
        if ($image_data !== null) {
            // Get existing attachments from the already validated note row.
            $existingAttachments = !empty($row['attachments']) ? json_decode($row['attachments'], true) : [];
            if (!is_array($existingAttachments)) $existingAttachments = [];

            // Find and remove old Excalidraw image for this diagram
            $oldAttachmentId = null;

            // Extract old attachment ID from existing HTML for this specific diagram
            $diagram_pattern = '/<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<img[^>]+src="\/api\/v1\/notes\/' . preg_quote($note_id, '/') . '\/attachments\/([a-zA-Z0-9._-]+)"[^>]*>.*?<\/div>/s';
            $diagram_pattern_alt = '/<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<img[^>]+src="\/api\/v1\/notes\/' . preg_quote($note_id, '/') . '\/attachments\/([a-zA-Z0-9._-]+)"[^>]*>.*?<\/div>/s';

            if (preg_match($diagram_pattern, $html_content, $matches) || preg_match($diagram_pattern_alt, $html_content, $matches)) {
                $oldAttachmentId = $matches[1];
            }

            // Remove old attachment if found. The note before this save
            // gets its automatic revision first, so that the preview it
            // shows is known to be still needed.
            if ($oldAttachmentId) {
                poznoteCreateAutomaticSnapshot($con, $note_id);
                $existingAttachments = excalidrawRetirePreviews((int)$note_id, $existingAttachments, [$oldAttachmentId]);
            }

            // Save the new preview as attachment
            $attachmentId = uniqid();
            $filename = $attachmentId . '_' . time() . '.svg';

            if (poznoteStoreAttachmentContent($image_data, $filename, 'image/svg+xml')) {
                // Add to attachments list
                $existingAttachments[] = [
                    'id' => $attachmentId,
                    'filename' => $filename,
                    'original_filename' => 'excalidraw_' . $diagram_id . '.svg',
                    'file_size' => strlen($image_data),
                    'file_type' => 'image/svg+xml',
                    'uploaded_at' => date('Y-m-d H:i:s')
                ];

                // Update attachments in database
                $updateStmt = $con->prepare("UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ? AND trash = 0");
                $updateStmt->execute([json_encode($existingAttachments), $note_id, $workspace]);
            }
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
        
        // Build class attribute preserving border classes.
        // excalidraw-image-neutral: see the note on the full-note save above.
        $img_classes = 'excalidraw-image excalidraw-image-neutral';
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
        $diagram_html_core = '<div class="excalidraw-container" id="' . htmlspecialchars($diagram_id) . '" style="cursor: pointer; text-align: center;" data-diagram-id="' . htmlspecialchars($diagram_id) . '" data-excalidraw="' . htmlspecialchars($diagram_data) . '">';
        
        if ($attachmentId) {
            // Use attachment URL instead of base64
            $diagram_html_core .= '<img src="/api/v1/notes/' . $note_id . '/attachments/' . $attachmentId . '" class="' . $img_classes . '" data-is-excalidraw="true"' . $img_style_attr . ' alt="Excalidraw diagram" />';
        } else {
            $diagram_html_core .= '<i class="lucide lucide-draw-polygon" style="font-size: 48px; color: #666; margin-bottom: 10px;"></i>
                              <p style="color: #666; font-size: 16px; margin: 0;">Excalidraw diagram</p>';
        }
        
        $diagram_html_core .= '</div>';
        
        $is_markdown_note = ($note_type === 'markdown');
        $diagram_html_replacement = $is_markdown_note ? "\n\n" . $diagram_html_core . "\n\n" : $diagram_html_core;

        // Find and replace the existing diagram container or button placeholder
        // Flexible patterns to match both attribute orders (class before id, or id before class)
        $pattern_with_placeholders = '/(<p class="excalidraw-placeholder"[^>]*><\/p>)?\s*<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/div>\s*(<p class="excalidraw-placeholder"[^>]*><\/p>)?/s';
        $pattern_with_placeholders_alt = '/(<p class="excalidraw-placeholder"[^>]*><\/p>)?\s*<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>.*?<\/div>\s*(<p class="excalidraw-placeholder"[^>]*><\/p>)?/s';
        $button_pattern = '/<button[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>.*?<\/button>/s';
        
        if (preg_match($pattern_with_placeholders, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing diagram container, keeping surrounding empty placeholders
            $match_start = $matches[0][1];
            $match_end = $match_start + strlen($matches[0][0]);
            $ph_before = (isset($matches[1]) && $matches[1][1] !== -1) ? $matches[1][0] : '';
            $ph_after = (isset($matches[2]) && $matches[2][1] !== -1) ? $matches[2][0] : '';

            $html_content = substr($html_content, 0, $match_start) . $ph_before . $diagram_html_replacement . $ph_after . substr($html_content, $match_end);
        } else if (preg_match($pattern_with_placeholders_alt, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing diagram container (alternate attribute order), keeping surrounding empty placeholders
            $match_start = $matches[0][1];
            $match_end = $match_start + strlen($matches[0][0]);
            $ph_before = (isset($matches[1]) && $matches[1][1] !== -1) ? $matches[1][0] : '';
            $ph_after = (isset($matches[2]) && $matches[2][1] !== -1) ? $matches[2][0] : '';

            $html_content = substr($html_content, 0, $match_start) . $ph_before . $diagram_html_replacement . $ph_after . substr($html_content, $match_end);
        } else if (preg_match($button_pattern, $html_content, $matches, PREG_OFFSET_CAPTURE)) {
            // Replace existing button placeholder without placeholders
            $html_content = preg_replace($button_pattern, $diagram_html_replacement, $html_content);
        } else {
            if ($is_markdown_note) {
                // Markdown stores the editable source directly, so insert a raw HTML block.
                $diagram_html_new = $diagram_html_replacement;

                if ($cursor_position !== null && $html_content !== '') {
                    $content_length = mb_strlen($html_content, 'UTF-8');
                    if ($cursor_position >= 0 && $cursor_position <= $content_length) {
                        $html_content = mb_substr($html_content, 0, $cursor_position, 'UTF-8') .
                                       $diagram_html_new .
                                       mb_substr($html_content, $cursor_position, $content_length - $cursor_position, 'UTF-8');
                    } else {
                        $html_content .= $diagram_html_new;
                    }
                } else if ($html_content === '') {
                    $html_content = trim($diagram_html_new) . "\n";
                } else {
                    $html_content .= $diagram_html_new;
                }
            } else {
                // Neither container nor button exists, insert at cursor position if available
                // Build diagram with empty placeholder paragraphs for easier cursor navigation;
                // the dots are rendered by CSS (:empty:before with data-ph) and disappear once the user types
                $diagram_html_new = '<p class="excalidraw-placeholder" data-ph="' . $excalidraw_placeholder . '"></p>' .
                                   $diagram_html_core .
                                   '<p class="excalidraw-placeholder" data-ph="' . $excalidraw_placeholder . '"></p>';
                
                if ($cursor_position !== null && !empty($html_content)) {
                    // Normalize HTML to text length comparable to DOM selection offsets
                    $plain_text = html_entity_decode($html_content, ENT_QUOTES | ENT_HTML5);
                    $plain_text = preg_replace('/<br\s*\/?\s*>/i', "\n", $plain_text);
                    $plain_text = preg_replace('/<\/(p|div|li|h[1-6])\s*>/i', "\n", $plain_text);
                    $plain_text = strip_tags($plain_text);
                    
                    // If cursor position is valid
                    if ($cursor_position >= 0 && $cursor_position <= mb_strlen($plain_text)) {
                        // Find the HTML position (a byte offset) that corresponds to the plain text position
                        $html_position = poznoteHtmlOffsetForTextPosition($html_content, $cursor_position);

                        // Insert the diagram at the calculated position
                        $html_content = substr($html_content, 0, $html_position) .
                                       $diagram_html_new .
                                       substr($html_content, $html_position);
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
        }
        
        $content_to_save = $is_markdown_note ? sanitizeMarkdownContent($html_content) : $html_content;

        // The note before this save: its automatic revision, at most one
        // every ten minutes
        poznoteCreateAutomaticSnapshot($con, $note_id);

        // Save the updated note content
        if (file_put_contents($content_file, $content_to_save) === false) {
            throw new Exception('Failed to write note file');
        }
        
        // Update the database with the new content and last modified time
        $stmt = $con->prepare("UPDATE entries SET entry = ?, updated = datetime('now'), updated_by_user_id = ? WHERE id = ? AND workspace = ? AND trash = 0");
        $stmt->execute([$content_to_save, $actor_user_id, $note_id, $workspace]);
        
        echo json_encode([
            'success' => true,
            'note_id' => $note_id,
            'diagram_id' => $diagram_id,
            'message' => 'Embedded diagram saved successfully'
        ]);
        
    } catch (Exception $e) {
        error_log("Error saving embedded diagram: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Server error']);
    }
}

