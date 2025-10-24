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
$v = '20251021.1';
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
                <p>Please check all these quick tips. There might be a few things here you didn’t know Poznote could do.</p>
            </div>
            <div class="tips-header-right">
                <button class="btn-back" onclick="goBack()">
                    Back
                </button>
            </div>
        </div>

        <div class="tips-content">
            <div class="tips-list">
                <div class="tip-item">
                    <i class="fa-list-check"></i> Create tasklist notes with drag-and-drop reordering and clickable links.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip3.png" alt="Create tasklist notes" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-image"></i> Add images by dragging and dropping files or pasting screenshots directly. HTML notes embed them inline.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip4.png" alt="Add images - drag and drop" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-image"></i> Add images by dragging and dropping files or pasting screenshots directly. Markdown notes store images as attachments.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip5.png" alt="Add images - paste screenshots" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-tags"></i> Click on any tag in a displayed note to filter your note list by that tag.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip6.png" alt="Click on tag to filter" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-tags"></i> Search in tags list.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip7.png" alt="Search in tags list" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip8.png" alt="Search in tags list" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-search"></i> Search across multiple keywords simultaneously.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip2.png" alt="Search across multiple keywords" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-search"></i> Search across multiple tags simultaneously.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip1.png" alt="Search across multiple tags" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-share"></i> Generate read-only public links for your notes with the ability to revoke access or regenerate URLs.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip9.png" alt="Generate public links" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip10.png" alt="Public link access" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-arrows-up-down"></i> Drag notes into folders, favorites or trash.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip11.png" alt="Drag notes" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-download"></i> Export notes as ZIP backup that includes an HTML index for offline browsing and search.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip12.png" alt="Export backup" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip13.png" alt="Export backup" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip14.png" alt="Offline browsing" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-smile"></i> Add emojis to note titles using Ctrl + ; on Windows.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip15.png" alt="Add emojis" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-arrows-h"></i> Resize the left sidebar by dragging its border.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip16.png" alt="Resize sidebar" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-layer-group"></i> Create separate workspaces.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip17.png" alt="Create workspaces" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip18.png" alt="Separate workspaces" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-layer-group"></i> Transfer notes one by one or all at a time between workspaces.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip19.png" alt="Transfer notes" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip20.png" alt="Transfer notes between workspaces" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip21.png" alt="Transfer all notes" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-sort"></i> Toggle the markdown preview panel or use only the toolbar's preview/edit buttons.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip22.png" alt="Toggle markdown preview" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip23.png" alt="Markdown toolbar buttons" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip24.png" alt="Preview edit buttons" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-mobile"></i> On mobile, swipe between notes list and note view.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tip25.png" alt="Mobile swipe navigation" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-file-import"></i> Import existing HTML and Markdown notes directly into Poznote.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/dev/readme/tips/tip26.png" alt="Import existing notes" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
                <div class="tip-item">
                    <i class="fa-code"></i> Copy code from VSCode and paste it into an HTML note to automatically create a code block. You can also highlight, bold, italicize, underline, and colorize text within the code block.
                </div>
                <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                    <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/dev/readme/tips/tip27.png" alt="VSCode code paste with formatting" class="tip-image" style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
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