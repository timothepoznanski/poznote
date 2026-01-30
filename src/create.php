<?php
/**
 * Create page - Central hub for creating new items
 */
require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <?php
    require_once 'users/db_master.php';
    $login_display_name = getGlobalSetting('login_display_name', '');
    $pageTitle = ($login_display_name && trim($login_display_name) !== '') ? htmlspecialchars($login_display_name) : t_h('app.name');
    ?>
    <title><?php echo $pageTitle; ?> - <?php echo t_h('common.create', [], 'Create'); ?></title>
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
    <link type="text/css" rel="stylesheet" href="css/brands.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/home.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/note-reference.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="home-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container">
        <h1 class="create-page-title"><?php echo t_h('common.create', [], 'Create'); ?></h1>
        
        <div class="home-grid">


            <!-- Note -->
            <a href="#" class="home-card" data-create-type="html" title="<?php echo t_h('modals.create.note.title', [], 'Note'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.note.title', [], 'Note'); ?></span>
                    <span class="home-card-description"><?php echo t_h('modals.create.note.description', [], 'Not Markdown'); ?></span>
                </div>
            </a>

            <!-- Markdown Note -->
            <a href="#" class="home-card" data-create-type="markdown" title="<?php echo t_h('modals.create.markdown.title', [], 'Markdown Note'); ?>">
                <div class="home-card-icon">
                    <i class="fab fa-markdown"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.markdown.title', [], 'Markdown Note'); ?></span>
                    <span class="home-card-description"><?php echo t_h('modals.create.markdown.description', [], 'Not HTML'); ?></span>
                </div>
            </a>

            <!-- Task List -->
            <a href="#" class="home-card" data-create-type="list" title="<?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-list-ul"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span>
                </div>
            </a>

            <!-- Template -->
            <a href="#" class="home-card" data-create-type="template" title="<?php echo t_h('modals.create.template.title', [], 'Template'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-copy"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.template.title', [], 'Template'); ?></span>
                </div>
            </a>

            <!-- Folder -->
            <a href="#" class="home-card" data-create-type="folder" title="<?php echo t_h('modals.create.folder.title', [], 'Folder'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-folder"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span>
                </div>
            </a>

            <!-- Kanban Structure -->
            <a href="#" class="home-card" data-create-type="kanban" title="<?php echo t_h('modals.create.kanban.title', [], 'Kanban Structure'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-columns"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.kanban.title', [], 'Kanban Structure'); ?></span>
                </div>
            </a>

            <!-- Workspace -->
            <a href="#" class="home-card" data-create-type="workspace" title="<?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?></span>
                </div>
            </a>

            <!-- Cancel -->
            <a href="index.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card home-card-red" title="<?php echo t_h('common.cancel', [], 'Cancel'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-times"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('common.cancel', [], 'Cancel'); ?></span>
                </div>
            </a>
        </div>

    </div>
    
    <?php include 'modals.php'; ?>
    
    <script src="js/globals.js"></script>
    <script src="js/workspaces.js"></script>
    <script src="js/navigation.js"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/ui.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/utils.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/template-selector.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modals-events.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/notes.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/folder-hierarchy.js?v=<?php echo $cache_v; ?>"></script>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const cards = document.querySelectorAll('.home-card[data-create-type]');
        
        cards.forEach(card => {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                const createType = this.dataset.createType;
                
                // Set global variables
                window.selectedCreateType = createType;
                window.targetFolderId = null;
                window.targetFolderName = null;
                window.isCreatingInFolder = false;
                window.selectedWorkspace = document.body.dataset.workspace || '';
                
                // Execute create action
                if (typeof executeCreateAction === 'function') {
                    executeCreateAction();
                } else {
                    console.error('executeCreateAction not found');
                }
            });
        });
    });
    </script>
</body>
</html>
