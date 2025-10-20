<?php
// Authentication check
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Get workspace parameter
$workspace = $_GET['workspace'] ?? 'Poznote';
$note_id = $_GET['note'] ?? '';

// Version for cache busting
$v = '20251020.6';
?>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Tips & Tricks - Poznote</title>
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
    <meta name="color-scheme" content="dark light">
    <link type="text/css" rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/light.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/brands.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/solid.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/regular.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/index.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/tips.css?v=<?php echo $v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
</head>
<body>
    <div class="tips-container">
        <div class="tips-header">
            <div class="tips-header-left">
                <h1><i class="fa-lightbulb"></i> Tips & Tricks</h1>
                <p>Quick tips to get the most out of Poznote</p>
            </div>
            <div class="tips-header-right">
                <button class="btn-back" onclick="goBack()">
                    Back
                </button>
            </div>
        </div>

        <div class="tips-content">
            
            <!-- Quick Start -->
            <div class="tip-section">
                <h2><i class="fa-bolt"></i> Quick Start</h2>
                <div class="tip-item">
                    <h3><i class="fa-plus-circle"></i> Create notes</h3>
                    <p>Click the <i class="fa-plus-circle"></i> button to create HTML notes, Markdown notes, or task lists.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-image"></i> Add images</h3>
                    <p>Drag & drop images directly into your notes. They're automatically saved.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-tags"></i> Search by tags</h3>
                    <p>Click any tag to filter notes, or search multiple tags at once.</p>
                </div>
            </div>

            <!-- Useful Features -->
            <div class="tip-section">
                <h2><i class="fa-star"></i> Useful Features</h2>
                <div class="tip-item">
                    <h3><i class="fa-code"></i> Copy code blocks</h3>
                    <p>Click on any code block to copy it to clipboard instantly.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-share-nodes"></i> Share notes</h3>
                    <p>Make notes public with read-only links. Revoke access anytime.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-paperclip"></i> Attachments</h3>
                    <p>Add files to notes using the <i class="fa-paperclip"></i> button in the toolbar.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-download"></i> Export offline</h3>
                    <p>Export all notes as a searchable HTML package for offline reading.</p>
                </div>
            </div>

            <!-- Pro Tips -->
            <div class="tip-section">
                <h2><i class="fa-lightbulb"></i> Pro Tips</h2>
                <div class="tip-item">
                    <h3><i class="fa-smile"></i> Emoji shortcuts</h3>
                    <p>Use <kbd>Ctrl + ;</kbd> to add emojis to note titles.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-arrows-alt-h"></i> Resize columns</h3>
                    <p>Drag the divider between columns to adjust their width.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-layer-group"></i> Workspaces</h3>
                    <p>Create separate workspaces to organize different projects.</p>
                </div>
                <div class="tip-item">
                    <h3><i class="fa-sort"></i> Sort notes</h3>
                    <p>Change note sorting in settings: by date modified, created, or alphabetically.</p>
                </div>
            </div>

        </div>
    </div>

    <script>
    function goBack() {
        // Build return URL with current workspace and note parameters
        var url = 'index.php';
        var params = [];
        
        // Add workspace parameter
        var workspace = '<?php echo htmlspecialchars($workspace, ENT_QUOTES); ?>';
        if (workspace && workspace !== 'Poznote') {
            params.push('workspace=' + encodeURIComponent(workspace));
        }
        
        // Add note parameter if provided
        var noteId = '<?php echo htmlspecialchars($note_id, ENT_QUOTES); ?>';
        if (noteId) {
            params.push('note=' + encodeURIComponent(noteId));
        }
        
        // Build final URL
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        window.location.href = url;
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Escape key to go back
        if (e.key === 'Escape') {
            goBack();
        }
    });
    
    // Mark tips as viewed when this page loads
    document.addEventListener('DOMContentLoaded', function() {
        localStorage.setItem('poznote-tips-viewed', 'true');
    });
    </script>
</body>
</html>