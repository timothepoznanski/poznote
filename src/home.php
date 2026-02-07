<?php
/**
 * Home page - Central hub for system folders navigation
 */
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// GitHub Sync Logic
require_once 'GitHubSync.php';
$githubSync = new GitHubSync($con);
$githubEnabled = GitHubSync::isEnabled() && $githubSync->isConfigured();
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$showGitHubSync = $githubEnabled && $isAdmin; // For processing actions
$showGitHubTiles = $isAdmin; // Always show tiles for admin, even if not configured

$syncMessage = '';
$syncError = '';
$syncResult = null;

if ($showGitHubSync && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['sync_action'])) {
    $action = $_POST['sync_action'];
    $workspace = $_POST['workspace'] ?? null;
    if ($workspace === '') $workspace = null;
    
    if ($action === 'push') {
        $syncResult = $githubSync->pushNotes($workspace);
        if ($syncResult['success']) {
            $syncMessage = t('github_sync.messages.push_success', [
                'count' => $syncResult['pushed'],
                'deleted' => $syncResult['deleted'] ?? 0,
                'errors' => count($syncResult['errors'])
            ]);
        } else {
            $syncError = t('github_sync.messages.push_error', ['error' => $syncResult['errors'][0]['error'] ?? 'Unknown error']);
        }
    } else if ($action === 'pull') {
        $syncResult = $githubSync->pullNotes($workspace);
        if ($syncResult['success']) {
            $syncMessage = t('github_sync.messages.pull_success', [
                'pulled' => $syncResult['pulled'],
                'updated' => $syncResult['updated'],
                'deleted' => $syncResult['deleted'] ?? 0,
                'errors' => count($syncResult['errors'])
            ]);
        } else {
            $syncError = t('github_sync.messages.pull_error', ['error' => $syncResult['errors'][0]['error'] ?? 'Unknown error']);
        }
    }
}

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

// Count for Kanban boards
$kanban_boards_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM folders WHERE kanban_enabled = 1";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtKanban = $con->prepare($query);
        $stmtKanban->execute($params);
        $kanban_boards_count = (int)$stmtKanban->fetchColumn();
    }
} catch (Exception $e) {
    $kanban_boards_count = 0;
}

// Count total folders
$folder_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM folders";
        $params = [];
        if (!empty($pageWorkspace)) {
            $query .= " WHERE workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmtFolders = $con->prepare($query);
        $stmtFolders->execute($params);
        $folder_count = (int)$stmtFolders->fetchColumn();
    }
} catch (Exception $e) {
    $folder_count = 0;
}

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo getPageTitle(); ?></title>
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
    <link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="home-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container">
        <?php $currentUser = getCurrentUser(); ?>
        <div class="home-header">
            <div class="home-info-line">
                <span class="home-info-username"><i class="fa-user home-info-icon"></i><?php echo htmlspecialchars($currentUser['username'] ?? 'User', ENT_QUOTES); ?></span>
                <span class="home-info-dash">-</span>
                <span class="home-workspace-name"><i class="fa-layer-group home-info-icon"></i><?php echo htmlspecialchars($pageWorkspace ?: 'Poznote', ENT_QUOTES); ?></span>
            </div>
        </div>

        <div style="display: flex; justify-content: center; margin-bottom: 20px;">
            <a href="index.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="btn btn-secondary">
                <?php echo t_h('common.back_to_notes', [], 'Back to Notes'); ?>
            </a>
        </div>

        <div class="home-search-container">
            <div class="home-search-wrapper">
                <i class="fas fa-search home-search-icon"></i>
                <input type="text" id="home-search-input" class="home-search-input" placeholder="Filtrer" autocomplete="off">
            </div>
        </div>
        
        <div class="home-grid">
            <?php if ($syncMessage): ?>
            <div class="alert alert-success" style="grid-column: 1 / -1; margin-bottom: 10px;">
                <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($syncMessage); ?>
            </div>
            <?php endif; ?>
            <?php if ($syncError): ?>
            <div class="alert alert-error" style="grid-column: 1 / -1; margin-bottom: 10px;">
                <i class="fas fa-exclamation-circle"></i> <?php echo htmlspecialchars($syncError); ?>
            </div>
            <?php endif; ?>

            <?php if ($syncResult && isset($syncResult['debug']) && !empty($syncResult['debug'])): ?>
            <div style="grid-column: 1 / -1; margin-bottom: 20px;">
                <div style="display: flex; gap: 10px; margin-bottom: 10px; justify-content: center;">
                    <button id="debug-toggle-btn" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
                        <i class="fas fa-bug"></i> <span id="debug-toggle-text"><?php echo t_h('github_sync.debug.show'); ?></span>
                    </button>
                    <button id="debug-copy-btn" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px; display: none;">
                        <i class="fas fa-copy"></i> <?php echo t_h('github_sync.debug.copy'); ?>
                    </button>
                </div>
                <div id="debug-info" class="debug-info" style="display: none; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; max-height: 250px; overflow-y: auto;">
                    <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600;">Debug Info:</h4>
                    <pre style="margin: 0; font-size: 11px; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; text-align: left;"><?php echo htmlspecialchars(implode("\n", $syncResult['debug'])); ?></pre>
                </div>
                <script>
                (function() {
                    const debugContent = <?php echo json_encode(implode("\n", $syncResult['debug'])); ?>;
                    const toggleBtn = document.getElementById('debug-toggle-btn');
                    const debugDiv = document.getElementById('debug-info');
                    const toggleText = document.getElementById('debug-toggle-text');
                    const copyBtn = document.getElementById('debug-copy-btn');

                    toggleBtn?.addEventListener('click', function() {
                        if (debugDiv.style.display === 'none') {
                            debugDiv.style.display = 'block';
                            copyBtn.style.display = 'inline-block';
                            toggleText.textContent = <?php echo json_encode(t_h('github_sync.debug.hide')); ?>;
                        } else {
                            debugDiv.style.display = 'none';
                            copyBtn.style.display = 'none';
                            toggleText.textContent = <?php echo json_encode(t_h('github_sync.debug.show')); ?>;
                        }
                    });

                    copyBtn?.addEventListener('click', function() {
                        navigator.clipboard.writeText(debugContent).then(function() {
                            const originalHTML = copyBtn.innerHTML;
                            copyBtn.innerHTML = '<i class="fas fa-check"></i> ' + <?php echo json_encode(t_h('github_sync.debug.copied')); ?>;
                            setTimeout(function() {
                                copyBtn.innerHTML = originalHTML;
                            }, 2000);
                        });
                    });
                })();
                </script>
            </div>
            <?php endif; ?>

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
            
            <!-- Folders -->
            <a href="list_folders.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" title="<?php echo t_h('home.folders', [], 'Folders'); ?>">
                <div class="home-card-icon home-card-icon-kanban">
                    <i class="fa-folder-open"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('home.folders', [], 'Folders'); ?></span>
                    <span class="home-card-count"><?php echo $folder_count; ?></span>
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

            <?php if ($showGitHubTiles): ?>
                <?php if ($githubEnabled): ?>
                    <!-- GitHub Push (Enabled) -->
                    <form method="post" class="home-card home-card-green" onclick="handleSyncClick(this);">
                        <input type="hidden" name="sync_action" value="push">
                        <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($pageWorkspace); ?>">
                        <div class="home-card-icon">
                            <i class="fa-upload"></i>
                        </div>
                        <div class="home-card-content">
                            <span class="home-card-title"><?php echo t_h('github_sync.actions.push.button', [], 'Push'); ?></span>
                            <span class="home-card-count"><?php echo htmlspecialchars($pageWorkspace ?: 'All'); ?></span>
                        </div>
                    </form>

                    <!-- GitHub Pull (Enabled) -->
                    <form method="post" class="home-card home-card-green" onclick="handleSyncClick(this);">
                        <input type="hidden" name="sync_action" value="pull">
                        <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($pageWorkspace); ?>">
                        <div class="home-card-icon">
                            <i class="fa-download"></i>
                        </div>
                        <div class="home-card-content">
                            <span class="home-card-title"><?php echo t_h('github_sync.actions.pull.button', [], 'Pull'); ?></span>
                            <span class="home-card-count"><?php echo htmlspecialchars($pageWorkspace ?: 'All'); ?></span>
                        </div>
                    </form>
                <?php else: ?>
                    <!-- GitHub Push (Disabled) -->
                    <a href="github_sync.php" class="home-card home-card-green">
                        <div class="home-card-icon">
                            <i class="fa-upload"></i>
                        </div>
                        <div class="home-card-content">
                            <span class="home-card-title"><?php echo t_h('github_sync.actions.push.button', [], 'Push'); ?></span>
                            <span class="home-card-count" style="color: #6b7280; font-size: 0.85em;"><?php echo t_h('github_sync.config.not_configured_yet', [], 'Not configured yet'); ?></span>
                        </div>
                    </a>

                    <!-- GitHub Pull (Disabled) -->
                    <a href="github_sync.php" class="home-card home-card-green">
                        <div class="home-card-icon">
                            <i class="fa-download"></i>
                        </div>
                        <div class="home-card-content">
                            <span class="home-card-title"><?php echo t_h('github_sync.actions.pull.button', [], 'Pull'); ?></span>
                            <span class="home-card-count" style="color: #6b7280; font-size: 0.85em;"><?php echo t_h('github_sync.config.not_configured_yet', [], 'Not configured yet'); ?></span>
                        </div>
                    </a>
                <?php endif; ?>
            <?php endif; ?>

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

    </div>
    
    <script src="js/globals.js"></script>
    <script src="js/workspaces.js"></script>
    <script src="js/navigation.js"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>

    <script>
    function handleSyncClick(card) {
        if (card.classList.contains('is-loading')) return;
        
        const action = card.querySelector('input[name="sync_action"]')?.value;
        const workspaceName = card.querySelector('input[name="workspace"]')?.value || 'All';
        
        let confirmMsg = '';
        if (action === 'push') {
            confirmMsg = window.t ? 
                window.t('github_sync.confirm_push', { workspace: workspaceName }, 'Push all notes to GitHub?') : 
                'Push all notes to GitHub?';
        } else if (action === 'pull') {
            confirmMsg = window.t ? 
                window.t('github_sync.confirm_pull', { workspace: workspaceName }, 'Pull all notes from GitHub? This may overwrite local changes.') : 
                'Pull all notes from GitHub? This may overwrite local changes.';
        }
        
        if (confirmMsg) {
            window.modalAlert.confirm(confirmMsg).then(function(confirmed) {
                if (confirmed) {
                    executeSync(card);
                }
            });
        } else {
            executeSync(card);
        }
    }

    function executeSync(card) {
        card.classList.add('is-loading');
        const icon = card.querySelector('.home-card-icon i');
        if (icon) {
            icon.className = 'fa-spinner fa-spin';
        }
        card.submit();
    }

    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('home-search-input');
        const cards = document.querySelectorAll('.home-grid .home-card');
        const grid = document.querySelector('.home-grid');
        
        // Create no results message if it doesn't exist
        let noResults = document.createElement('div');
        noResults.className = 'home-no-results';
        noResults.style.display = 'none';
        noResults.style.gridColumn = '1 / -1';
        noResults.style.textAlign = 'center';
        noResults.style.padding = '40px 20px';
        noResults.style.color = '#6b7280';
        noResults.innerHTML = '<i class="fas fa-search" style="font-size: 24px; display: block; margin-bottom: 10px; opacity: 0.5;"></i><?php echo addslashes(t_h('public.no_filter_results', [], 'No results found.')); ?>';
        grid.appendChild(noResults);

        searchInput?.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            let visibleCount = 0;

            cards.forEach(card => {
                const title = card.querySelector('.home-card-title')?.textContent.toLowerCase() || '';
                if (title.includes(term)) {
                    card.style.display = 'flex';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            noResults.style.display = (visibleCount === 0) ? 'block' : 'none';
        });

        // Focus search on / key press if not in input
        document.addEventListener('keydown', function(e) {
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                searchInput?.focus();
            }
        });
    });
    </script>
</body>
</html>
