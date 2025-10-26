<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'page_init.php';

// Get parameters
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
$diagram_id = isset($_GET['diagram_id']) ? $_GET['diagram_id'] : null;
$workspace = isset($_GET['workspace']) ? $_GET['workspace'] : 'Poznote';

// Determine if we're in embedded diagram mode
$is_embedded_diagram = !empty($diagram_id);

// Load existing note data if editing
$existing_data = null;
$note_title = $is_embedded_diagram ? 'Embedded Diagram' : 'New note';

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
            $html_file = getEntriesRelativePath() . $note_id . '.html';
            if (file_exists($html_file)) {
                $html_content = file_get_contents($html_file);
                // Look for the specific diagram container
                $pattern = '/<div class="excalidraw-container" id="' . preg_quote($diagram_id, '/') . '"[^>]*data-excalidraw="([^"]*)"[^>]*>/';
                if (preg_match($pattern, $html_content, $matches)) {
                    $existing_data = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5);
                    error_log("Found embedded diagram data for $diagram_id in note $note_id");
                } else {
                    error_log("No existing data found for diagram $diagram_id in note $note_id");
                    $existing_data = null;
                }
            }
        } else {
            // Full note mode: extract from excalidraw-data div or legacy database (always in .html files)
            require_once 'functions.php';
            $html_file = getEntriesRelativePath() . $note_id . '.html';
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
    
    <!-- Theme -->
    <script>
    (function(){
        try {
            var theme = localStorage.getItem('poznote-theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        } catch (e) {}
    })();
    </script>
    
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/excalidraw.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    
    <style>
    @font-face {
        font-family: 'Inter';
        src: url('webfonts/Inter/static/Inter_24pt-Regular.ttf') format('truetype');
    }
    .excalidraw-toolbar-btn:hover {
        background: #1e40af !important;
    }
    .excalidraw-save-btn:hover {
        background: #2d7b3e !important;
    }
    </style>
    
    <!-- Modal alerts system -->
    <script src="js/modal-alerts.js"></script>
    <!-- Excalidraw Bundle (compiled with Vite) -->
    <script src="js/excalidraw-dist/excalidraw-bundle.iife.js"></script>
</head>
<body>
    <div style="display: flex; flex-direction: column; height: 100vh;">
        <!-- Clean toolbar -->
        <div class="poznote-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e1e4e8; box-shadow: 0 1px 3px rgba(0,0,0,0.1); position: relative; z-index: 9999;">
            <button id="backBtn" class="excalidraw-toolbar-btn" style="padding: 8px 16px; background: #2563eb; border: 1px solid #2563eb; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; color: #ffffff; transition: all 0.2s;">
                Return to notes
            </button>
            <h3 style="margin: 0; color: #24292f; font-weight: 400; font-size: 18px; font-family: 'Inter', sans-serif;">Poznote - <?php echo htmlspecialchars($note_title, ENT_QUOTES); ?></h3>
            <button id="saveBtn" class="excalidraw-save-btn" style="padding: 8px 16px; background: #238636; border: 1px solid #238636; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; color: #ffffff; transition: all 0.2s;">
                Save
            </button>
        </div>
        
        <!-- Excalidraw container -->
        <div id="app" style="flex: 1; background: #fff;">
            <div id="loading" style="display: flex; justify-content: center; align-items: center; height: 100%; font-size: 18px; font-family: 'Inter', sans-serif;">
                Loading Excalidraw Poznote...
            </div>
        </div>
    </div>

    <script>
    let noteId = <?php echo $note_id; ?>;
    const workspace = <?php echo json_encode($workspace); ?>;
    const diagramId = <?php echo json_encode($diagram_id); ?>;
    const isEmbeddedDiagram = <?php echo $is_embedded_diagram ? 'true' : 'false'; ?>;
    
    // Safer data handling
    let existingData = null;
    try {
        const rawData = <?php echo $existing_data ? json_encode($existing_data) : 'null'; ?>;
        
        if (rawData) {
            if (typeof rawData === 'object') {
                existingData = rawData;
            } else if (typeof rawData === 'string') {
                // If the string contains non-JSON characters, try to clean it
                let cleanedData = rawData.trim();
                
                // Look for complete JSON structure that starts with { and ends with }}
                let jsonMatch = cleanedData.match(/^(\{.*\}\})/);
                if (jsonMatch) {
                    cleanedData = jsonMatch[1];
                }
                
                existingData = JSON.parse(cleanedData);
            }
        }
        
        // Validate and clean the data structure for Excalidraw
        if (existingData) {
            // Ensure we have proper structure
            if (!existingData.elements) {
                existingData.elements = [];
            }
            if (!existingData.appState) {
                existingData.appState = {};
            }
            if (!existingData.files) {
                existingData.files = {};
            }
            
            // Ensure elements is an array
            if (!Array.isArray(existingData.elements)) {
                existingData.elements = [];
            }
            
            // Create a clean data structure with essential properties
            existingData = {
                elements: existingData.elements,
                appState: {
                    viewBackgroundColor: existingData.appState.viewBackgroundColor || "#ffffff",
                    zoom: existingData.appState.zoom || { value: 1 },
                    scrollX: existingData.appState.scrollX || 0,
                    scrollY: existingData.appState.scrollY || 0
                },
                files: existingData.files || {}
            };
        }
        
    } catch (parseError) {
        console.error('Failed to load diagram data');
        existingData = null;
    }
    
    let excalidrawAPI = null;

    window.addEventListener('DOMContentLoaded', function() {
        // Mobile optimizations
        if (window.innerWidth < 800) {
            // Prevent zoom on double tap for better touch experience
            let lastTouchEnd = 0;
            document.addEventListener('touchend', function (event) {
                const now = (new Date()).getTime();
                if (now - lastTouchEnd <= 300) {
                    event.preventDefault();
                }
                lastTouchEnd = now;
            }, false);
            
            // Force toolbar to stay visible
            const toolbar = document.querySelector('.poznote-toolbar');
            if (toolbar) {
                toolbar.style.position = 'fixed';
                toolbar.style.top = '0';
                toolbar.style.left = '0';
                toolbar.style.right = '0';
                toolbar.style.zIndex = '10000';
            }
            
            // Adjust app container for mobile
            const app = document.getElementById('app');
            if (app) {
                app.style.marginTop = '50px';
                app.style.height = 'calc(100vh - 50px)';
            }
        }
        
        // Wait for bundle to load
        setTimeout(function() {
            if (!window.PoznoteExcalidraw) {
                console.error('PoznoteExcalidraw not found');
                document.getElementById('loading').innerHTML = 'Error: Failed to load Excalidraw. Please refresh the page.';
                return;
            }
            
            try {
                // Initialize Excalidraw with safe fallback
                const safeInitialData = existingData || { elements: [], appState: {}, files: {} };
                
                excalidrawAPI = window.PoznoteExcalidraw.init('app', {
                    initialData: safeInitialData,
                    theme: getTheme()
                });
                
                // Hide loading message
                const loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';
                
            } catch (error) {
                console.error('Error initializing Excalidraw:', error);
                document.getElementById('loading').innerHTML = 'Error initializing Excalidraw: ' + error.message;
            }
        }, 1000);
    });

    function getTheme() {
        try {
            return localStorage.getItem('poznote-theme') || 'light';
        } catch (e) {
            return 'light';
        }
    }

    // Save button handler
    document.getElementById('saveBtn').onclick = async function() {
        if (!excalidrawAPI) {
            alert('Editor not ready');
            return;
        }
        
        this.textContent = 'Saving...';
        
        try {
            const elements = excalidrawAPI.getSceneElements();
            const appState = excalidrawAPI.getAppState();
            const files = excalidrawAPI.getFiles();
            
            // Convert files to serializable format with minimal required properties
            const serializableFiles = {};
            for (const [id, file] of Object.entries(files)) {
                if (file && file.dataURL) {
                    serializableFiles[id] = {
                        id: file.id || id,
                        dataURL: file.dataURL,
                        mimeType: file.mimeType || 'image/png',
                        created: file.created || Date.now()
                    };
                }
            }
            
            // Include files in the data object
            const data = { elements, appState, files: serializableFiles };
            
            if (isEmbeddedDiagram) {
                // Embedded diagram mode: save to existing note HTML
                await saveEmbeddedDiagram(data, elements, appState, files);
            } else {
                // Full note mode: save as complete Excalidraw note
                await saveFullNote(data, elements, appState, files);
            }
            
            this.textContent = 'Saved!';
            setTimeout(() => { this.textContent = 'Save'; }, 2000);
            
        } catch (e) {
            console.error('Save error:', e);
            alert('Error: ' + e.message);
            this.textContent = 'Save';
        }
    };
    
    // Save embedded diagram
    async function saveEmbeddedDiagram(data, elements, appState, files) {
        // Generate preview canvas
        const canvas = await excalidrawAPI.exportToCanvas({
            elements: elements,
            appState: appState,
            files: files
        });
        
        // Convert to base64 image for embedding
        const base64Image = canvas.toDataURL('image/png');
        
        const formData = new FormData();
        formData.append('action', 'save_embedded_diagram');
        formData.append('note_id', noteId);
        formData.append('diagram_id', diagramId);
        formData.append('workspace', workspace);
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_image_base64', base64Image);
        
        const response = await fetch('api_save_excalidraw.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Stay in editor after save - don't redirect
            
            // Optional: You could add a visual notification here
            // For now, the "Saved!" text in the button is sufficient
            
            // Commented out auto-redirect to stay in editor:
            // const context = JSON.parse(sessionStorage.getItem('excalidraw_context') || '{}');
            // if (context.returnUrl) {
            //     window.location.href = context.returnUrl;
            // } else {
            //     const params = new URLSearchParams({ workspace: workspace, note: noteId });
            //     window.location.href = 'index.php?' + params.toString();
            // }
        } else {
            throw new Error(result.message || 'Save failed');
        }
    }
    
    // Save full note
    async function saveFullNote(data, elements, appState, files) {
        // Generate PNG preview
        const canvas = await excalidrawAPI.exportToCanvas({
            elements: elements,
            appState: appState,
            files: files
        });
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        
        // Send to server
        const formData = new FormData();
        formData.append('note_id', noteId);
        formData.append('workspace', workspace);
        formData.append('heading', document.querySelector('h3').textContent);
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_image', blob, 'preview.png');
        
        const response = await fetch('api_save_excalidraw.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update the note ID if it was a new note
            if (result.note_id && noteId === 0) {
                noteId = result.note_id;
                
                // Update URL to include note_id for future reloads
                const url = new URL(window.location);
                url.searchParams.set('note_id', noteId);
                window.history.replaceState({}, '', url);
            }
        } else {
            throw new Error(result.message || 'Save failed');
        }
    }
        
    // Back button
    document.getElementById('backBtn').onclick = function() {
        const params = new URLSearchParams({ workspace: workspace });
        if (noteId > 0) params.append('note', noteId);
        window.location.href = 'index.php?' + params.toString();
    };
    </script>
</body>
</html>