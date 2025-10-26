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
    $stmt = $con->prepare('SELECT heading, entry, type FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($note) {
        $note_title = $note['heading'];
        $existing_data = $note['entry']; // JSON data stored in entry field
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><?php echo htmlspecialchars($note_title, ENT_QUOTES); ?> - Excalidraw</title>
    
    <!-- Theme initialization -->
    <script>
    (function(){
        try {
            var theme = localStorage.getItem('poznote-theme');
            if (!theme) {
                theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
            }
            var root = document.documentElement;
            root.setAttribute('data-theme', theme);
            root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
            root.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        } catch (e) {}
    })();
    </script>
    
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/excalidraw.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    
    <!-- React from CDN -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Excalidraw from CDN - Using different approach -->
    <link rel="stylesheet" href="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.min.css" />
    <script type="text/javascript" src="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.production.min.js"></script>
</head>
<body>
    <div class="excalidraw-container">
        <!-- Toolbar -->
        <div class="excalidraw-toolbar">
            <div class="toolbar-left">
                <button id="backButton" class="toolbar-btn" title="Return to notes">
                    Return to notes
                </button>
            </div>
            <div class="toolbar-center">
                <h3 id="diagramTitle"><?php echo htmlspecialchars($note_title, ENT_QUOTES); ?></h3>
            </div>
            <div class="toolbar-right">
                <button id="saveButton" class="toolbar-btn btn-save" title="Save diagram">
                    Save
                </button>
            </div>
        </div>
        
        <!-- Excalidraw editor will be mounted here -->
        <div id="excalidraw-app" class="excalidraw-editor"></div>
        
        <!-- Loading indicator -->
        <div id="loadingIndicator" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; display: none;">
            <p>Loading Excalidraw...</p>
        </div>
    </div>
    
    <script>
    // Configuration
    const noteId = <?php echo $note_id; ?>;
    const workspace = <?php echo json_encode($workspace); ?>;
    const existingData = <?php echo $existing_data ? json_encode(json_decode($existing_data, true)) : 'null'; ?>;
    
    let initAttempts = 0;
    const maxAttempts = 20; // Try for 2 seconds (20 * 100ms)
    
    // Function to check if libraries are loaded
    function checkLibrariesLoaded() {
        const reactLoaded = typeof window.React !== 'undefined';
        const reactDOMLoaded = typeof window.ReactDOM !== 'undefined';
        const excalidrawLoaded = typeof window.ExcalidrawLib !== 'undefined' || typeof window.Excalidraw !== 'undefined';
        
        console.log('Library check:', {
            React: reactLoaded,
            ReactDOM: reactDOMLoaded,
            Excalidraw: excalidrawLoaded,
            ExcalidrawLib: typeof window.ExcalidrawLib !== 'undefined',
            ExcalidrawDirect: typeof window.Excalidraw !== 'undefined',
            attempt: initAttempts + 1
        });
        
        return reactLoaded && reactDOMLoaded && excalidrawLoaded;
    }
    
    // Function to initialize when everything is ready
    function initializeExcalidraw() {
        initAttempts++;
        
        // Check if all libraries are available
        if (!checkLibrariesLoaded()) {
            if (initAttempts < maxAttempts) {
                // Try again after a short delay
                setTimeout(initializeExcalidraw, 100);
                return;
            } else {
                // Max attempts reached
                console.error('Libraries failed to load after maximum attempts');
                document.getElementById('loadingIndicator').innerHTML = 
                    '<p style="color: red;">Error: Failed to load Excalidraw libraries.<br>Please refresh the page.</p>' +
                    '<button onclick="window.location.reload()">Refresh Page</button>';
                document.getElementById('loadingIndicator').style.display = 'block';
                return;
            }
        }
        
        // Hide loading indicator
        document.getElementById('loadingIndicator').style.display = 'none';
        console.log('All libraries loaded successfully, initializing Excalidraw...');
        
        // Initialize Excalidraw
        const excalidrawWrapper = document.getElementById('excalidraw-app');
        
        // Get Excalidraw from the correct namespace
        const ExcalidrawComponent = window.ExcalidrawLib?.Excalidraw || window.Excalidraw;
        
        if (!ExcalidrawComponent) {
            console.error('Excalidraw component not found');
            document.getElementById('loadingIndicator').innerHTML = 
                '<p style="color: red;">Error: Excalidraw component not found.<br>Please refresh the page.</p>' +
                '<button onclick="window.location.reload()">Refresh Page</button>';
            document.getElementById('loadingIndicator').style.display = 'block';
            return;
        }
        
        let excalidrawAPI = null;
        
        // Initial data
        const initialData = existingData || {
            elements: [],
            appState: {
                viewBackgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e1e1e' : '#ffffff'
            }
        };
        
        // Create Excalidraw instance
        const excalidrawInstance = React.createElement(ExcalidrawComponent, {
            ref: (api) => { 
                if (api) {
                    excalidrawAPI = api;
                    console.log('Excalidraw API initialized');
                }
            },
            initialData: initialData,
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
            UIOptions: {
                canvasActions: {
                    loadScene: true,
                    saveAsImage: true,
                    export: true,
                }
            }
        });
        
        // Mount Excalidraw
        ReactDOM.render(excalidrawInstance, excalidrawWrapper);
        
        // Save button handler
        document.getElementById('saveButton').addEventListener('click', async function() {
            if (!excalidrawAPI) {
                alert('Editor not ready. Please wait a moment and try again.');
                return;
            }
            
            const saveBtn = this;
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;
            
            try {
                // Get the scene data
                const elements = excalidrawAPI.getSceneElements();
                const appState = excalidrawAPI.getAppState();
                const files = excalidrawAPI.getFiles();
                
                // Prepare data to save
                const sceneData = {
                    elements: elements,
                    appState: {
                        viewBackgroundColor: appState.viewBackgroundColor,
                        currentItemFontFamily: appState.currentItemFontFamily,
                        currentItemFontSize: appState.currentItemFontSize,
                        currentItemStrokeColor: appState.currentItemStrokeColor,
                        currentItemBackgroundColor: appState.currentItemBackgroundColor,
                        currentItemFillStyle: appState.currentItemFillStyle,
                        currentItemStrokeWidth: appState.currentItemStrokeWidth,
                        currentItemRoughness: appState.currentItemRoughness,
                        currentItemOpacity: appState.currentItemOpacity,
                    },
                    files: files
                };
                
                // Export as PNG for preview
                const blob = await excalidrawAPI.exportToBlob({
                    mimeType: 'image/png',
                    quality: 0.9,
                    exportPadding: 20
                });
                
                // Convert blob to base64
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async function() {
                    const base64data = reader.result;
                    
                    // Send to server
                    const formData = new FormData();
                    formData.append('note_id', noteId);
                    formData.append('workspace', workspace);
                    formData.append('scene_data', JSON.stringify(sceneData));
                    formData.append('preview_image', base64data);
                    
                    const response = await fetch('api_save_excalidraw.php', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        saveBtn.innerHTML = '<i class="fa-check"></i> Saved!';
                        setTimeout(() => {
                            saveBtn.innerHTML = originalText;
                            saveBtn.disabled = false;
                        }, 2000);
                    } else {
                        throw new Error(result.message || 'Save failed');
                    }
                };
            } catch (error) {
                console.error('Save error:', error);
                alert('Error saving diagram: ' + error.message);
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        });
        
        // Update theme when it changes
        window.addEventListener('storage', function(e) {
            if (e.key === 'poznote-theme' && excalidrawAPI) {
                const newTheme = e.newValue === 'dark' ? 'dark' : 'light';
                excalidrawAPI.updateScene({
                    appState: {
                        theme: newTheme
                    }
                });
            }
        });
    }
    
    // Back button handler (independent of Excalidraw initialization)
    document.getElementById('backButton').addEventListener('click', function() {
        const params = new URLSearchParams({
            workspace: workspace
        });
        if (noteId > 0) {
            params.append('note', noteId);
        }
        window.location.href = 'index.php?' + params.toString();
    });
    
    // Start initialization immediately
    console.log('Starting Excalidraw initialization...');
    document.getElementById('loadingIndicator').style.display = 'block';
    
    // Start trying to initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExcalidraw);
    } else {
        initializeExcalidraw();
    }
    </script>
</body>
</html>
