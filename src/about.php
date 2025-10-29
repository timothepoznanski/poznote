<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Include page initialization
require_once 'page_init.php';

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>About - Poznote</title>
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/about.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
</head>

<body>
    <div class="settings-container">
        <br>
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>
        <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            Back to Notes
        </a>
        <br><br>
        
        <div class="settings-grid">
            <!-- Tips -->
            <div class="settings-card" onclick="window.open('https://poznote.com/tips.html', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-lightbulb"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Tips & Tricks</h3>
                </div>
            </div>

            <!-- API Documentation -->
            <div class="settings-card" onclick="window.open('api-docs/', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-code"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Rest API</h3>
                </div>
            </div>

            <!-- Github repository -->
            <div class="settings-card" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-code-branch"></i>
                </div>
                <div class="settings-card-content">
                    <h3>GitHub Repository</h3>
                </div>
            </div>

            <!-- News -->
            <div class="settings-card" onclick="window.open('https://poznote.com/news.html', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-newspaper"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Poznote News</h3>
                </div>
            </div>

            <!-- Poznote Website -->
            <div class="settings-card" onclick="window.open('https://poznote.com', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-globe"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Poznote Website</h3>
                </div>
            </div>

            <!-- Support Developer -->
            <div class="settings-card" onclick="window.open('https://ko-fi.com/timothepoznanski', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-coffee"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Support Developer</h3>
                </div>
            </div>
        </div>
    </div>
    
    <!-- For Update modal -->
    <?php include 'modals.php'; ?>
    
    <!-- Include JavaScript files -->
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    
    <script>
        // Update Back to Notes link with workspace from localStorage
        (function() {
            try {
                var workspace = localStorage.getItem('poznote_selected_workspace');
                var backLink = document.getElementById('backToNotesLink');
                if (backLink && workspace && workspace !== '') {
                    var url = new URL(backLink.href, window.location.origin);
                    url.searchParams.set('workspace', workspace);
                    backLink.href = url.toString();
                }
            } catch(e) {
                // Ignore errors
            }
        })();
        
        // Set workspace context for JavaScript functions
        window.selectedWorkspace = <?php echo json_encode(getWorkspaceFilter()); ?>;
        
    </script>
</body>
</html>