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
    }
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
    
    <!-- Official CDN -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.min.css" />
    <script src="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.production.min.js"></script>
</head>
<body>
    <div style="display: flex; flex-direction: column; height: 100vh;">
        <!-- Simple toolbar -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f0f0f0; border-bottom: 1px solid #ddd;">
            <button id="backBtn" style="padding: 8px 16px;">Return to notes</button>
            <h3 style="margin: 0;"><?php echo htmlspecialchars($note_title, ENT_QUOTES); ?></h3>
            <button id="saveBtn" style="padding: 8px 16px;">Save</button>
        </div>
        
        <!-- Excalidraw container -->
        <div id="app" style="flex: 1; background: #fff;">
            <div id="loading" style="display: flex; justify-content: center; align-items: center; height: 100%; font-size: 18px;">
                Loading Excalidraw...
            </div>
        </div>
    </div>

    <script>
    const noteId = <?php echo $note_id; ?>;
    const workspace = <?php echo json_encode($workspace); ?>;
    const existingData = <?php echo $existing_data ? json_encode(json_decode($existing_data, true)) : 'null'; ?>;
    
    let attempts = 0;
    
    function init() {
        attempts++;
        console.log('Attempt', attempts, 'checking libraries...');
        console.log('React:', typeof window.React);
        console.log('ReactDOM:', typeof window.ReactDOM);
        console.log('ExcalidrawLib:', typeof window.ExcalidrawLib);
        console.log('window.ExcalidrawLib:', window.ExcalidrawLib);
        
        if (!window.React || !window.ReactDOM || !window.ExcalidrawLib) {
            if (attempts < 50) {
                setTimeout(init, 200);
                return;
            } else {
                document.getElementById('loading').innerHTML = 'Error: Failed to load libraries. Please refresh.';
                return;
            }
        }
        
        console.log('All libraries loaded, initializing Excalidraw...');
        
        try {
            const app = document.getElementById('app');
            const { Excalidraw } = window.ExcalidrawLib;
            
            console.log('Excalidraw component:', Excalidraw);
            
            let api = null;
            
            const element = React.createElement(Excalidraw, {
                ref: (excalidrawAPI) => { 
                    api = excalidrawAPI;
                    console.log('Excalidraw API set:', api);
                },
                initialData: existingData || { elements: [], appState: {} }
            });
            
            console.log('Rendering Excalidraw element...');
            ReactDOM.render(element, app);
            
            // Hide loading
            const loading = document.getElementById('loading');
            if (loading) loading.style.display = 'none';
            
            console.log('Excalidraw should be rendered now');
            
            // Save button handler
            document.getElementById('saveBtn').onclick = async function() {
                if (!api) {
                    alert('Editor not ready');
                    return;
                }
                
                this.textContent = 'Saving...';
                
                try {
                    const elements = api.getSceneElements();
                    const appState = api.getAppState();
                    const data = { elements, appState };
                    
                    // PNG
                    const canvas = await window.ExcalidrawLib.exportToCanvas({
                        elements: elements,
                        appState: appState,
                        files: api.getFiles()
                    });
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    
                    // Send
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
                        this.textContent = 'Saved!';
                        setTimeout(() => { this.textContent = 'Save'; }, 2000);
                    } else {
                        alert('Save failed');
                        this.textContent = 'Save';
                    }
                } catch (e) {
                    console.error('Save error:', e);
                    alert('Error: ' + e.message);
                    this.textContent = 'Save';
                }
            };
            
        } catch (error) {
            console.error('Error initializing Excalidraw:', error);
            document.getElementById('loading').innerHTML = 'Error initializing Excalidraw: ' + error.message;
        }
    }
        
    // Back button
    document.getElementById('backBtn').onclick = function() {
        const params = new URLSearchParams({ workspace: workspace });
        if (noteId > 0) params.append('note', noteId);
        window.location.href = 'index.php?' + params.toString();
    };
    
    console.log('Starting initialization...');
    init();
    </script>
</body>
</html>