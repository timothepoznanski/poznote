<?php
/**
 * Kanban View - Display notes in subfolder columns
 * 
 * This view takes a parent folder and displays its subfolders as columns,
 * with notes as draggable cards within each column.
 */

require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
require_once 'version_helper.php';
include 'db_connect.php';

// Get current workspace
$workspace_filter = getWorkspaceFilter();

// Get folder_id from URL parameter
$folder_id = isset($_GET['folder_id']) ? (int)$_GET['folder_id'] : null;

if (!$folder_id) {
    header('Location: index.php?workspace=' . urlencode($workspace_filter));
    exit;
}

// Get parent folder information
$parentFolder = null;
try {
    $stmt = $con->prepare('SELECT id, name, parent_id, icon, icon_color FROM folders WHERE id = ? AND workspace = ?');
    $stmt->execute([$folder_id, $workspace_filter]);
    $parentFolder = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    error_log('Kanban: Error fetching parent folder: ' . $e->getMessage());
}

if (!$parentFolder) {
    header('Location: index.php?workspace=' . urlencode($workspace_filter));
    exit;
}

// Get all subfolders of this folder
$subfolders = [];
try {
    $stmt = $con->prepare('SELECT id, name, icon, icon_color FROM folders WHERE parent_id = ? AND workspace = ? ORDER BY name');
    $stmt->execute([$folder_id, $workspace_filter]);
    $subfolders = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    error_log('Kanban: Error fetching subfolders: ' . $e->getMessage());
}

// Get notes directly in the parent folder (uncategorized in Kanban context)
$parentNotes = [];
try {
    $stmt = $con->prepare('SELECT id, heading, entry, tags, updated, type FROM entries WHERE folder_id = ? AND trash = 0 ORDER BY updated DESC');
    $stmt->execute([$folder_id]);
    $parentNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    error_log('Kanban: Error fetching parent notes: ' . $e->getMessage());
}

// Get notes for each subfolder
$subfolderNotes = [];
foreach ($subfolders as $subfolder) {
    try {
        $stmt = $con->prepare('SELECT id, heading, entry, tags, updated, type FROM entries WHERE folder_id = ? AND trash = 0 ORDER BY updated DESC');
        $stmt->execute([$subfolder['id']]);
        $subfolderNotes[$subfolder['id']] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $subfolderNotes[$subfolder['id']] = [];
    }
}

// Cache version for assets
$cache_v = getAppVersion();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang ?? 'en', ENT_QUOTES); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('kanban.title', ['folder' => $parentFolder['name']], 'Kanban - {{folder}}'); ?></title>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <meta name="color-scheme" content="dark light">
    <link type="text/css" rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/light.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/brands.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/solid.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/regular.min.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/kanban.css?v=<?php echo $cache_v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="kanban-page" data-workspace="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>" data-folder-id="<?php echo $folder_id; ?>">
    
    <div class="kanban-container">
        <!-- Header -->
        <div class="kanban-header">
            <div class="kanban-header-left">
                <a href="index.php?workspace=<?php echo urlencode($workspace_filter); ?>" class="kanban-back-btn">
                    <span><?php echo t_h('common.back_to_notes', [], 'Back to notes'); ?></span>
                </a>
                <h1 class="kanban-title">
                    <?php 
                    $pFolderIcon = $parentFolder['icon'] ?? 'fa-folder';
                    $pIconColor = $parentFolder['icon_color'] ?? '';
                    $pIconStyle = $pIconColor ? "style=\"color: {$pIconColor};\"" : '';
                    ?>
                    <i class="fas <?php echo htmlspecialchars($pFolderIcon); ?>" <?php echo $pIconStyle; ?>></i>
                    <span><?php echo htmlspecialchars($parentFolder['name'], ENT_QUOTES); ?></span>
                </h1>
            </div>
            <div class="kanban-header-right">
            </div>
        </div>

        <!-- Kanban Board -->
        <div class="kanban-board" id="kanbanBoard">
            
            <?php if (!empty($parentNotes)): ?>
            <!-- Column for notes directly in parent folder -->
            <div class="kanban-column" data-folder-id="<?php echo $folder_id; ?>">
                <div class="kanban-column-header">
                    <div class="kanban-column-title">
                        <i class="fas fa-inbox"></i>
                        <span><?php echo t_h('kanban.uncategorized', [], 'Uncategorized'); ?></span>
                    </div>
                    <span class="kanban-column-count"><?php echo count($parentNotes); ?></span>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $folder_id; ?>">
                    <?php foreach ($parentNotes as $note): ?>
                    <div class="kanban-card" 
                         data-note-id="<?php echo $note['id']; ?>" 
                         data-folder-id="<?php echo $folder_id; ?>"
                         draggable="true">
                        <?php if (!empty($note['tags'])): ?>
                        <div class="kanban-card-tags">
                            <?php 
                            $tags = explode(',', $note['tags']);
                            foreach ($tags as $tag): 
                                $tag = trim($tag);
                                if ($tag === '') continue;
                            ?>
                                <span class="kanban-tag"><?php echo htmlspecialchars($tag, ENT_QUOTES); ?></span>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>

                        <div class="kanban-card-meta">
                            <span class="kanban-card-date">
                                <?php 
                                $updated = $note['updated'] ?? '';
                                if ($updated) {
                                    $dt = new DateTime($updated);
                                    echo $dt->format('d/m H:i');
                                }
                                ?>
                            </span>
                        </div>

                        <div class="kanban-card-title">
                            <?php 
                            $noteTitle = $note['heading'] ?: t('index.note.new_note', [], 'New note');
                            echo htmlspecialchars($noteTitle, ENT_QUOTES); 
                            ?>
                        </div>

                        <div class="kanban-card-snippet">
                            <?php 
                            $snippet = strip_tags($note['entry'] ?? '');
                            $snippet = html_entity_decode($snippet);
                            echo htmlspecialchars(mb_substr($snippet, 0, 80) . (mb_strlen($snippet) > 80 ? '...' : ''), ENT_QUOTES);
                            ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>

            <?php foreach ($subfolders as $subfolder): ?>
            <!-- Column for subfolder: <?php echo htmlspecialchars($subfolder['name']); ?> -->
            <div class="kanban-column" data-folder-id="<?php echo $subfolder['id']; ?>">
                <div class="kanban-column-header">
                    <div class="kanban-column-title">
                        <?php 
                        $folderIcon = $subfolder['icon'] ?? 'fa-folder';
                        $iconColor = $subfolder['icon_color'] ?? '';
                        $iconStyle = $iconColor ? "style=\"color: {$iconColor};\"" : '';
                        ?>
                        <i class="fas <?php echo htmlspecialchars($folderIcon); ?>" <?php echo $iconStyle; ?>></i>
                        <span><?php echo htmlspecialchars($subfolder['name'], ENT_QUOTES); ?></span>
                    </div>
                    <span class="kanban-column-count"><?php echo count($subfolderNotes[$subfolder['id']] ?? []); ?></span>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $subfolder['id']; ?>">
                    <?php foreach ($subfolderNotes[$subfolder['id']] ?? [] as $note): ?>
                    <div class="kanban-card" 
                         data-note-id="<?php echo $note['id']; ?>" 
                         data-folder-id="<?php echo $subfolder['id']; ?>"
                         draggable="true">
                        <?php if (!empty($note['tags'])): ?>
                        <div class="kanban-card-tags">
                            <?php 
                            $tags = explode(',', $note['tags']);
                            foreach ($tags as $tag): 
                                $tag = trim($tag);
                                if ($tag === '') continue;
                            ?>
                                <span class="kanban-tag"><?php echo htmlspecialchars($tag, ENT_QUOTES); ?></span>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>

                        <div class="kanban-card-meta">
                            <span class="kanban-card-date">
                                <?php 
                                $updated = $note['updated'] ?? '';
                                if ($updated) {
                                    $dt = new DateTime($updated);
                                    echo $dt->format('d/m H:i');
                                }
                                ?>
                            </span>
                        </div>

                        <div class="kanban-card-title">
                            <?php 
                            $noteTitle = $note['heading'] ?: t('index.note.new_note', [], 'New note');
                            echo htmlspecialchars($noteTitle, ENT_QUOTES); 
                            ?>
                        </div>

                        <div class="kanban-card-snippet">
                            <?php 
                            $snippet = strip_tags($note['entry'] ?? '');
                            $snippet = html_entity_decode($snippet);
                            echo htmlspecialchars(mb_substr($snippet, 0, 80) . (mb_strlen($snippet) > 80 ? '...' : ''), ENT_QUOTES);
                            ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endforeach; ?>

            <?php if (empty($subfolders) && empty($parentNotes)): ?>
            <!-- Empty state -->
            <div class="kanban-empty-state">
                <h2><?php echo t_h('kanban.empty.title', [], 'No subfolders yet'); ?></h2>
                <p><?php echo t_h('kanban.empty.message', [], 'Create subfolders in this folder to use the Kanban view. Each subfolder will become a column.'); ?></p>
                <a href="index.php?workspace=<?php echo urlencode($workspace_filter); ?>" class="kanban-empty-btn">
                    <?php echo t_h('common.back_to_notes'); ?>
                </a>
            </div>
            <?php endif; ?>

        </div>
    </div>

    <!-- JavaScript for drag and drop -->
    <script src="js/kanban.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
