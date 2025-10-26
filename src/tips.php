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

// Function to get tips content from GitHub
function getTipsFromGitHub() {
    // GitHub raw content URL for tips.json
    $github_url = 'https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/tips.json';
    
    // Try to fetch from GitHub
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'Poznote-Tips-Loader/1.0'
        ]
    ]);
    
    $content = @file_get_contents($github_url, false, $context);
    
    if ($content !== false) {
        $tips_data = json_decode($content, true);
        if ($tips_data !== null) {
            return $tips_data;
        }
    }
    
    // Return empty structure if GitHub is unavailable
    return [
        'header' => [
            'title' => 'Tips unavailable',
            'subtitle' => 'Unable to load tips from GitHub.'
        ],
        'tips' => []
    ];
}

// Get tips data
$tips_data = getTipsFromGitHub();
$header = $tips_data['header'] ?? ['title' => 'Tips unavailable', 'subtitle' => ''];
$tips = $tips_data['tips'] ?? [];
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
                <h1><?php echo htmlspecialchars($header['title']); ?></h1>
                <p><?php echo htmlspecialchars($header['subtitle']); ?></p>
            </div>
            <div class="tips-header-right">
                <button class="btn-back" onclick="goBack()">
                    Back
                </button>
            </div>
        </div>

        <div class="tips-content">
            <div class="tips-list">
                <?php foreach ($tips as $tip): ?>
                <div class="tip-item">
                    <i class="<?php echo htmlspecialchars($tip['icon']); ?>"></i> <?php echo htmlspecialchars($tip['text']); ?>
                </div>
                <?php if (isset($tip['images']) && is_array($tip['images'])): ?>
                    <?php foreach ($tip['images'] as $image): ?>
                    <div style="padding-left: 40px; margin-top: 10px; margin-bottom: 15px;">
                        <img src="https://raw.githubusercontent.com/timothepoznanski/poznote/main/readme/tips/<?php echo htmlspecialchars($image); ?>" 
                             alt="<?php echo htmlspecialchars($tip['text']); ?>" 
                             class="tip-image" 
                             style="display: block; max-width: 60%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <script>
    function goBack() {
        // Build return URL with workspace from localStorage and note parameters
        var url = 'index.php';
        var params = [];
        
        // Get workspace from localStorage first, fallback to PHP value
        try {
            var workspace = localStorage.getItem('poznote_selected_workspace');
            if (!workspace || workspace === '') {
                workspace = '<?php echo htmlspecialchars($workspace, ENT_QUOTES); ?>';
            }
            if (workspace && workspace !== '') {
                params.push('workspace=' + encodeURIComponent(workspace));
            }
        } catch(e) {
            // Fallback to PHP workspace if localStorage fails
            var workspace = '<?php echo htmlspecialchars($workspace, ENT_QUOTES); ?>';
            if (workspace && workspace !== '') {
                params.push('workspace=' + encodeURIComponent(workspace));
            }
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
    </script>
</body>
</html>