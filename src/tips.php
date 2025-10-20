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
    <title>Did you kown? - Poznote</title>
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
                <h1>Did you know?</h1>
                <p>Please check all these quick tips to get the most out of Poznote.</p>
            </div>
            <div class="tips-header-right">
                <button class="btn-back" onclick="goBack()">
                    Back
                </button>
            </div>
        </div>

        <div class="tips-content">
            <div class="tips-list">
                <div class="tip-item"><i class="fa-plus"></i> Click + button to create notes</div>
                <div class="tip-item"><i class="fa-image"></i> Drag & drop images into notes</div>
                <div class="tip-item"><i class="fa-tags"></i> Click tags to filter notes</div>
                <div class="tip-item"><i class="fa-search"></i> Search bar finds any note instantly</div>
                <div class="tip-item"><i class="fa-code"></i> Click code blocks to copy them</div>
                <div class="tip-item"><i class="fa-share"></i> Share notes with public links</div>
                <div class="tip-item"><i class="fa-paperclip"></i> Add file attachments with paperclip button</div>
                <div class="tip-item"><i class="fa-download"></i> Export all notes for offline reading</div>
                <div class="tip-item"><i class="fa-smile"></i> Use Ctrl + ; for emoji shortcuts</div>
                <div class="tip-item"><i class="fa-arrows-h"></i> Drag divider to resize columns</div>
                <div class="tip-item"><i class="fa-layer-group"></i> Create workspaces for different projects</div>
                <div class="tip-item"><i class="fa-sort"></i> Change note sorting in settings</div>
                <div class="tip-item"><i class="fa-star"></i> Star notes to mark as favorites</div>
                <div class="tip-item"><i class="fa-moon"></i> Toggle dark mode in settings</div>
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