<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'page_init.php';

// Get note ID and workspace
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
$workspace = isset($_GET['workspace']) ? $_GET['workspace'] : 'Poznote';

// Load existing note data if editing
$existing_data = null;
$note_title = 'New Excalidraw Diagram';

if ($note_id > 0) {
    $stmt = $con->prepare('SELECT heading, entry FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($note) {
        $note_title = $note['heading'];
        $existing_data = $note['entry']; // JSON data stored in entry field
        
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
    
    <!-- Excalidraw Bundle (compiled with Vite) -->
    <script src="js/excalidraw-dist/excalidraw-bundle.iife.js"></script>
</head>
<body>
    <div style="display: flex; flex-direction: column; height: 100vh;">
        <!-- Clean toolbar -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e1e4e8; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <button id="backBtn" class="excalidraw-toolbar-btn" style="padding: 8px 16px; background: #2563eb; border: 1px solid #2563eb; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; color: #ffffff; transition: all 0.2s;">
                Return to notes
            </button>
            <h3 style="margin: 0; color: #24292f; font-weight: 400; font-size: 18px; font-family: 'Inter', sans-serif;"><?php echo htmlspecialchars($note_title, ENT_QUOTES); ?></h3>
            <button id="saveBtn" class="excalidraw-save-btn" style="padding: 8px 16px; background: #238636; border: 1px solid #238636; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; color: #ffffff; transition: all 0.2s;">
                Save
            </button>
        </div>
        
        <!-- Excalidraw container -->
        <div id="app" style="flex: 1; background: #fff;">
            <div id="loading" style="display: flex; justify-content: center; align-items: center; height: 100%; font-size: 18px;">
                Loading Excalidraw...
            </div>
        </div>
    </div>

    <script>
    let noteId = <?php echo $note_id; ?>;
    const workspace = <?php echo json_encode($workspace); ?>;
    let existingData = <?php echo $existing_data ? json_encode($existing_data) : 'null'; ?>;
    
    // Debug PHP values
    console.log('PHP Debug:');
    console.log('- note_id from PHP:', <?php echo $note_id; ?>);
    console.log('- existing_data from PHP (raw):', <?php echo json_encode($existing_data); ?>);
    console.log('- existing_data length:', <?php echo $existing_data ? strlen($existing_data) : 0; ?>);
    
    // Parse and simplify existing data to avoid loading issues
    if (existingData) {
        try {
            console.log('Parsing existing data...');
            existingData = JSON.parse(existingData);
            console.log('Parsed data:', existingData);
            
            if (existingData && existingData.elements) {
                console.log('Simplifying existing data to avoid loading errors...');
                existingData = {
                    elements: existingData.elements,
                    appState: {} // Simplified app state
                };
                console.log('Simplified data:', existingData);
            }
        } catch (e) {
            console.error('Error parsing existing data:', e);
            existingData = null;
        }
    }
    
    let excalidrawAPI = null;

    window.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, checking PoznoteExcalidraw...');
        
        // Wait for bundle to load
        setTimeout(function() {
            console.log('PoznoteExcalidraw:', typeof window.PoznoteExcalidraw);
            
            if (!window.PoznoteExcalidraw) {
                console.error('PoznoteExcalidraw not found');
                document.getElementById('loading').innerHTML = 'Error: Failed to load Excalidraw. Please refresh the page.';
                return;
            }
            
            try {
                console.log('Initializing Excalidraw...');
                console.log('Initial data:', existingData);
                
                // Initialize Excalidraw
                excalidrawAPI = window.PoznoteExcalidraw.init('app', {
                    initialData: existingData || { elements: [], appState: {} },
                    theme: getTheme()
                });
                
                // Hide loading message
                const loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';
                
                console.log('Excalidraw initialized successfully');
                
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
            const data = { elements, appState };
            
            console.log('Saving data:', { elements: elements.length, appState, files });
            
            // Generate PNG preview
            const canvas = await excalidrawAPI.exportToCanvas({
                elements: elements,
                appState: appState,
                files: files
            });
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            console.log('Generated PNG blob:', blob.size, 'bytes');
            
            // Send to server
            const formData = new FormData();
            formData.append('note_id', noteId);
            formData.append('workspace', workspace);
            formData.append('heading', document.querySelector('h3').textContent);
            formData.append('diagram_data', JSON.stringify(data));
            formData.append('preview_image', blob, 'preview.png');
            
            console.log('Sending to server...');
            const response = await fetch('api_save_excalidraw.php', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            console.log('Server response:', result);
            
            if (result.success) {
                this.textContent = 'Saved!';
                setTimeout(() => { this.textContent = 'Save'; }, 2000);
                
                // Update the note ID if it was a new note
                if (result.note_id && noteId === 0) {
                    noteId = result.note_id;
                    console.log('New note ID:', noteId);
                    
                    // Update URL to include note_id for future reloads
                    const url = new URL(window.location);
                    url.searchParams.set('note_id', noteId);
                    window.history.replaceState({}, '', url);
                    console.log('Updated URL:', url.toString());
                }
            } else {
                alert('Save failed: ' + (result.message || 'Unknown error'));
                this.textContent = 'Save';
            }
        } catch (e) {
            console.error('Save error:', e);
            alert('Error: ' + e.message);
            this.textContent = 'Save';
        }
    };
        
    // Back button
    document.getElementById('backBtn').onclick = function() {
        const params = new URLSearchParams({ workspace: workspace });
        if (noteId > 0) params.append('note', noteId);
        window.location.href = 'index.php?' + params.toString();
    };
    </script>
</body>
</html>