<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'page_init.php';

// Get parameters
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
$diagram_id = isset($_GET['diagram_id']) ? $_GET['diagram_id'] : null;
$workspace = isset($_GET['workspace']) ? $_GET['workspace'] : getFirstWorkspaceName();

// Determine if we're in embedded diagram mode
$is_embedded_diagram = !empty($diagram_id);

// Load existing note data if editing
$existing_data = null;
$note_title = $is_embedded_diagram
    ? t('excalidraw.editor.titles.embedded_diagram', [], 'Embedded Diagram')
    : t('excalidraw.editor.titles.new_note', [], 'New note');

if ($note_id > 0) {
    $stmt = $con->prepare('SELECT heading, entry, type FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($note) {
        $note_title = $note['heading'];
        $entry_content = $note['entry']; // Full content from database
        $existing_data = null; // This will hold the extracted JSON
        
        if ($is_embedded_diagram) {
            // Embedded diagram mode: look for specific diagram data (always in .html files)
            require_once 'functions.php';
            $html_file = getEntriesPath() . '/' . $note_id . '.html';
            if (file_exists($html_file)) {
                $html_content = file_get_contents($html_file);
                // Look for the specific diagram container
                // Use 's' modifier (DOTALL) to match newlines, and be flexible with attribute order
                // First find the div with the matching id, then extract data-excalidraw from it
                $container_pattern = '/<div[^>]*class="excalidraw-container"[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*>/s';
                // Also try with id before class (attributes can be in any order)
                $container_pattern_alt = '/<div[^>]*id="' . preg_quote($diagram_id, '/') . '"[^>]*class="excalidraw-container"[^>]*>/s';
                
                $found = false;
                if (preg_match($container_pattern, $html_content, $container_match) || 
                    preg_match($container_pattern_alt, $html_content, $container_match)) {
                    // Now extract data-excalidraw from the matched div tag
                    // The sanitizer may convert double quotes to single quotes around attribute values
                    // If single quotes wrap the value, the JSON inside uses double quotes (safe to match)
                    // If double quotes wrap the value, the JSON inside uses HTML entities
                    $div_tag = $container_match[0];
                    
                    // Try single-quoted attribute first (more common after sanitization)
                    if (preg_match("/data-excalidraw='([^']*)'/", $div_tag, $data_match)) {
                        $existing_data = html_entity_decode($data_match[1], ENT_QUOTES | ENT_HTML5);
                        error_log("Found embedded diagram data (single-quoted) for $diagram_id in note $note_id");
                        $found = true;
                    }
                    // Then try double-quoted attribute
                    elseif (preg_match('/data-excalidraw="([^"]*)"/', $div_tag, $data_match)) {
                        $existing_data = html_entity_decode($data_match[1], ENT_QUOTES | ENT_HTML5);
                        error_log("Found embedded diagram data (double-quoted) for $diagram_id in note $note_id");
                        $found = true;
                    }
                }
                
                if (!$found) {
                    error_log("No existing data found for diagram $diagram_id in note $note_id");
                    $existing_data = null;
                }
            }
        } else {
            // Full note mode: extract from excalidraw-data div or legacy database (always in .html files)
            require_once 'functions.php';
            $html_file = getEntriesPath() . '/' . $note_id . '.html';
            if (file_exists($html_file)) {
                $html_content = file_get_contents($html_file);
                // Extract JSON from the hidden excalidraw-data div
                if (preg_match('/<div class="excalidraw-data"[^>]*>(.*?)<\/div>/s', $html_content, $matches)) {
                    $extracted_json = $matches[1];
                    // Decode HTML entities
                    $extracted_json = html_entity_decode($extracted_json, ENT_QUOTES | ENT_HTML5);
                    // Trim whitespace
                    $extracted_json = trim($extracted_json);
                    
                    // Validate JSON before using it
                    if (!empty($extracted_json) && $extracted_json !== '{}') {
                        $json_test = json_decode($extracted_json, true);
                        if (json_last_error() === JSON_ERROR_NONE && $json_test !== null) {
                            $existing_data = $extracted_json;
                            error_log("Successfully extracted JSON from HTML for note $note_id");
                        } else {
                            error_log("Invalid JSON extracted for note $note_id: " . json_last_error_msg());
                            $existing_data = null;
                        }
                    } else {
                        error_log("Empty JSON extracted for note $note_id");
                        $existing_data = null;
                    }
                } else {
                    // No excalidraw-data div found in HTML, try database as fallback
                    if ($entry_content && !strpos($entry_content, '<div class="excalidraw-container"')) {
                        // Legacy system: entry field contains direct JSON data
                        $existing_data = $entry_content;
                        error_log("Using legacy JSON from database for note $note_id");
                    } else {
                        error_log("No excalidraw-data div found in HTML and no legacy JSON in database for note $note_id");
                        $existing_data = null;
                    }
                }
            } else {
                // HTML file doesn't exist, use database content as fallback
                if ($entry_content && !strpos($entry_content, '<div class="excalidraw-container"')) {
                    $existing_data = $entry_content;
                    error_log("HTML file not found, using database content for note $note_id");
                } else {
                    error_log("HTML file not found and database content is HTML for note $note_id");
                    $existing_data = null;
                }
            }
        }
        
        // Debug: log the data we're loading
        error_log("Loading note $note_id: " . substr($existing_data, 0, 100) . "...");
    } else {
        error_log("Note $note_id not found");
    }
} else {
    error_log("Creating new note (note_id = 0)");
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, maximum-scale=5.0"/>
    <title><?php echo htmlspecialchars($note_title, ENT_QUOTES); ?> - Excalidraw</title>
    
    <!-- Theme initialization - CSP compliant -->
    <script src="js/excalidraw-theme-init.js"></script>
    
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/excalidraw.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    
    <!-- Modal alerts system -->
    <script src="js/modal-alerts.js"></script>
    <!-- Excalidraw Bundle (compiled with Vite) -->
    <script src="js/excalidraw-dist/excalidraw-bundle.iife.js"></script>
</head>
<body>
    <div class="excalidraw-page-wrapper">
        <!-- Clean toolbar -->
        <div class="poznote-toolbar">
            <div class="poznote-toolbar-buttons">
                <button id="saveBtn" class="excalidraw-btn excalidraw-save-btn" disabled>
                    <?php echo t_h('common.save', [], 'Save'); ?>
                </button>
                <button id="saveAndExitBtn" class="excalidraw-btn excalidraw-btn-blue" disabled>
                    <?php echo t_h('excalidraw.editor.toolbar.save_and_exit', [], 'Save and exit'); ?>
                </button>
                <button id="cancelBtn" class="excalidraw-btn excalidraw-btn-red">
                    <?php echo t_h('excalidraw.editor.toolbar.exit_without_saving', [], 'Exit without saving'); ?>
                </button>
            </div>
            <h3 class="poznote-toolbar-title">Poznote - <?php echo htmlspecialchars($note_title, ENT_QUOTES); ?></h3>
            <div class="poznote-toolbar-spacer"></div> <!-- Spacer pour équilibrer le layout -->
        </div>
        
        <!-- Excalidraw container -->
        <div id="app" class="excalidraw-app-container">
            <div id="loading" class="excalidraw-loading">
                <?php echo t_h('excalidraw.editor.loading', [], 'Loading Excalidraw Poznote...'); ?>
            </div>
        </div>
    </div>

    <!-- Library Warning Modal -->
    <div id="libraryWarningModal" class="library-warning-modal">
        <div class="library-warning-content">
            <h3 class="library-warning-title"><?php echo t_h('common.warning', [], 'Warning'); ?></h3>
            <p class="library-warning-text"><?php echo t_h('excalidraw.editor.library_warning.line1', [], 'The "Add to Excalidraw" button on the external library page does not work with this self-hosted version.'); ?></p>
            <p class="library-warning-text"><?php echo t_h('excalidraw.editor.library_warning.line2', [], 'You must download the library file (.excalidrawlib) and manually import it using the "Open" button in the library menu.'); ?></p>
            <div class="library-warning-buttons">
                <button id="libraryWarningCancel" class="library-warning-btn library-warning-btn-cancel"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button id="libraryWarningOk" class="library-warning-btn library-warning-btn-ok"><?php echo t_h('excalidraw.editor.library_warning.ok', [], 'I Understand'); ?></button>
            </div>
        </div>
    </div>

    <!-- CSP-compliant configuration via JSON -->
    <script type="application/json" id="excalidraw-config"><?php
        $excalidrawConfig = [
            'noteId' => $note_id,
            'workspace' => $workspace,
            'diagramId' => $diagram_id,
            'isEmbeddedDiagram' => $is_embedded_diagram,
            'existingData' => $existing_data,
            'txt' => [
                'editorNotReady' => t('excalidraw.editor.alerts.editor_not_ready', [], 'Editor not ready'),
                'saving' => t('excalidraw.editor.toolbar.saving', [], 'Saving...'),
                'saved' => t('excalidraw.editor.toolbar.saved', [], 'Saved!'),
                'save' => t('common.save', [], 'Save'),
                'saveAndExit' => t('excalidraw.editor.toolbar.save_and_exit', [], 'Save and exit'),
                'failedToLoad' => t('excalidraw.editor.errors.failed_to_load', [], 'Error: Failed to load Excalidraw. Please refresh the page.'),
                'initErrorTemplate' => t('excalidraw.editor.errors.initializing_prefix', ['error' => '{{error}}'], 'Error initializing Excalidraw: {{error}}'),
                'errorTemplate' => t('excalidraw.editor.alerts.error_prefix', ['error' => '{{error}}'], 'Error: {{error}}'),
                'saveFailed' => t('excalidraw.editor.errors.save_failed', [], 'Save failed')
            ]
        ];
        echo json_encode($excalidrawConfig);
    ?></script>
    <script src="js/excalidraw-editor.js"></script>
</body>
</html>