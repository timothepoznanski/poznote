<?php
/**
 * Home page - Central hub for system folders navigation
 */
require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// Count for Tags folder - OPTIMIZED: only fetch tags when needed
$tag_count = 0;
$unique_tags = [];
try {
    if (isset($con)) {
        // Optimized: Only fetch rows with non-empty tags to reduce processing
        $query = "SELECT tags FROM entries WHERE trash = 0 AND tags IS NOT NULL AND tags != ''";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtTags = $con->prepare($query);
        $stmtTags->execute($params);
        while ($r = $stmtTags->fetch(PDO::FETCH_ASSOC)) {
            $parts = explode(',', $r['tags'] ?? '');
            foreach ($parts as $p) {
                $t = trim($p);
                if ($t !== '' && !in_array($t, $unique_tags)) {
                    $unique_tags[] = $t;
                }
            }
        }
        $tag_count = count($unique_tags);
    }
} catch (Exception $e) {
    $tag_count = 0;
}

// Count for Trash
try {
    $trash_count = 0;
    if (isset($con)) {
        $stmtTrash = $con->prepare("SELECT COUNT(*) as cnt FROM entries WHERE trash = 1 AND workspace = ?");
        $stmtTrash->execute([$pageWorkspace]);
        $trash_count = (int)$stmtTrash->fetchColumn();
    }
} catch (Exception $e) {
    $trash_count = 0;
}

// Count for Public/Shared notes
$shared_notes_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM shared_notes sn INNER JOIN entries e ON sn.note_id = e.id WHERE e.trash = 0";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND e.workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtShared = $con->prepare($query);
        $stmtShared->execute($params);
        $shared_notes_count = (int)$stmtShared->fetchColumn();
    }
} catch (Exception $e) {
    $shared_notes_count = 0;
}

// Count for Shared folders
$shared_folders_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM shared_folders sf INNER JOIN folders f ON sf.folder_id = f.id";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " WHERE f.workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtSharedFolders = $con->prepare($query);
        $stmtSharedFolders->execute($params);
        $shared_folders_count = (int)$stmtSharedFolders->fetchColumn();
    }
} catch (Exception $e) {
    $shared_folders_count = 0;
}

// Count for Attachments
$attachments_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM entries WHERE trash = 0 AND attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtAttachments = $con->prepare($query);
        $stmtAttachments->execute($params);
        $attachments_count = (int)$stmtAttachments->fetchColumn();
    }
} catch (Exception $e) {
    $attachments_count = 0;
}

// Count favorites for the current workspace
$favorites_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM entries WHERE trash = 0 AND favorite = 1";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtFavorites = $con->prepare($query);
        $stmtFavorites->execute($params);
        $favorites_count = (int)$stmtFavorites->fetchColumn();
    }
} catch (Exception $e) {
    $favorites_count = 0;
}

// Count total notes in the workspace
$total_notes_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM entries WHERE trash = 0";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtTotalNotes = $con->prepare($query);
        $stmtTotalNotes->execute($params);
        $total_notes_count = (int)$stmtTotalNotes->fetchColumn();
    }
} catch (Exception $e) {
    $total_notes_count = 0;
}

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('home.title', [], 'Home'); ?> - <?php echo t_h('app.name'); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php 
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(trim($cache_v));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link type="text/css" rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/light.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/solid.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/regular.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/home.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="home-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container">
        <?php $currentUser = getCurrentUser(); ?>
        <div class="home-header">
            <div class="home-info-line">
                <span class="home-info-username"><i class="fa-user home-info-icon"></i><?php echo htmlspecialchars($currentUser['username'] ?? 'User', ENT_QUOTES); ?></span>
                <span class="home-workspace-name"><i class="fa-layer-group home-info-icon"></i><?php echo htmlspecialchars($pageWorkspace ?: 'Poznote', ENT_QUOTES); ?></span>
            </div>
        </div>
        
        <div class="home-grid">
            <!-- Notes -->
            <a href="index.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('common.notes', [], 'Notes'); ?>">
                <div class="home-card-icon">
                    <i class="fa-sticky-note"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('common.notes', [], 'Notes'); ?></span>
                    <span class="home-card-count"><?php echo $total_notes_count; ?></span>
                </div>
            </a>

            <!-- Tags -->
            <a href="list_tags.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?>">
                <div class="home-card-icon">
                    <i class="fa-tags"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?></span>
                    <span class="home-card-count"><?php echo $tag_count; ?></span>
                </div>
            </a>
            
            <!-- Favorites -->
            <a href="favorites.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('notes_list.system_folders.favorites', [], 'Favorites'); ?>">
                <div class="home-card-icon home-card-icon-favorites">
                    <i class="fa-star"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('notes_list.system_folders.favorites', [], 'Favorites'); ?></span>
                    <span class="home-card-count"><?php echo $favorites_count; ?></span>
                </div>
            </a>
            
            <!-- Shared Notes -->
            <a href="shared.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('home.shared_notes', [], 'Shared Notes'); ?>">
                <div class="home-card-icon home-card-icon-shared">
                    <i class="fa-share-alt"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('home.shared_notes', [], 'Shared Notes'); ?></span>
                    <span class="home-card-count"><?php echo $shared_notes_count; ?></span>
                </div>
            </a>
            
            <!-- Shared Folders -->
            <a href="list_shared_folders.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('home.shared_folders', [], 'Shared Folders'); ?>">
                <div class="home-card-icon home-card-icon-shared">
                    <i class="fa-folder-open"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('home.shared_folders', [], 'Shared Folders'); ?></span>
                    <span class="home-card-count"><?php echo $shared_folders_count; ?></span>
                </div>
            </a>
            
            <!-- Trash -->
            <a href="trash.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?>">
                <div class="home-card-icon home-card-icon-trash">
                    <i class="fa-trash"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?></span>
                    <span class="home-card-count"><?php echo $trash_count; ?></span>
                </div>
            </a>
            
            <!-- Attachments -->
            <a href="attachments_list.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?>">
                <div class="home-card-icon">
                    <i class="fa-paperclip"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?></span>
                    <span class="home-card-count"><?php echo $attachments_count; ?></span>
                </div>
            </a>


            <!-- Logout -->
            <a href="logout.php" class="home-card home-card-logout" title="<?php echo t_h('workspaces.menu.logout', [], 'Logout'); ?>">
                <div class="home-card-icon">
                    <i class="fa-sign-out-alt"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('workspaces.menu.logout', [], 'Logout'); ?></span>
                </div>
            </a>
        </div>

        <!-- Version Display (desktop bottom) -->
        <div class="version-display version-display-desktop-bottom">
            <small>Poznote <?php echo htmlspecialchars(trim(file_get_contents('version.txt')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></small><br>
            <small><a href="https://poznote.com/releases.html" target="_blank" class="release-notes-link"><?php echo t_h('settings.cards.release_notes'); ?></a></small>
        </div>
    </div>
    
    <script src="js/globals.js"></script>
    <script src="js/workspaces.js"></script>
    <script src="js/navigation.js"></script>
</body>
</html>
