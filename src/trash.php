<?php
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

/**
 * Convert plain-text URLs into safe HTML anchors
 * @param string|null $text Text to process
 * @return string HTML with clickable links
 */
function linkify_html($text) {
    if ($text === null || $text === '') {
        return '';
    }
    
    // Escape first to avoid XSS
    $escaped = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    
    // Use # as regex delimiter to make quoting easier. Matches http(s)://... or www....
    $regex = '#\b(?:https?://|www\.)[^\s"\'<>]+#i';
    $result = preg_replace_callback($regex, function($m) {
        $url = $m[0];
        $href = preg_match('/^https?:/i', $url) ? $url : 'http://' . $url;
        $h = htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
        $label = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
        return '<a href="' . $h . '" target="_blank" rel="noopener noreferrer">' . $label . '</a>';
    }, $escaped);
    
    return $result;
}

/**
 * Render a tasklist from JSON data as HTML
 * @param array $tasks Array of task objects
 * @return string HTML representation of the tasklist
 */
function renderTasklistHtml($tasks) {
    $html = '<div class="task-list-container">';
    $html .= '<div class="tasks-list">';
    
    foreach ($tasks as $task) {
        $text = isset($task['text']) ? linkify_html($task['text']) : '';
        $completed = !empty($task['completed']) ? ' completed' : '';
        $checked = !empty($task['completed']) ? ' checked' : '';
        
        $html .= '<div class="task-item' . $completed . '">';
        $html .= '<input type="checkbox" disabled' . $checked . ' /> ';
        $html .= '<span class="task-text">' . $text . '</span>';
        $html .= '</div>';
    }
    
    $html .= '</div></div>';
    return $html;
}

$search = trim($_POST['search'] ?? $_GET['search'] ?? '');
$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link type="text/css" rel="stylesheet" href="css/lucide.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/base.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/attachments.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/link-modal.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/share-modal.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
    <link type="text/css" rel="stylesheet" href="css/trash.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/components.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/markdown.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/kanban.css"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css"/>
    <script src="js/theme-manager.js"></script>
</head>
<body class="trash-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="trash-container">
        
        <?php if (!empty($search)): ?>
            <div class="trash-search-notice">
                <?php echo t_h('trash.search.results_for', ['term' => htmlspecialchars($search, ENT_QUOTES)], 'Results for "{{term}}"'); ?>
                <span class="trash-clear-search">
                    <i class="lucide lucide-x"></i>
                </span>
            </div>
        <?php endif; ?>
        
        <div class="trash-buttons-container">
            <button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
                <?php echo t_h('common.back_to_notes'); ?>
            </button>
            <button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
                <?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
            </button>
            <button class="btn btn-danger" id="emptyTrashBtn" title="<?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?>">
                <?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?>
            </button>
        </div>

        <div class="trash-filter-bar">
            <div class="filter-input-wrapper">
                <form action="trash.php" method="POST" id="trashSearchForm">
                    <input 
                        type="text" 
                        name="search" 
                        id="searchInput"
                        class="trash-search-input"
                        placeholder="<?php echo t_h('trash.search.placeholder', [], 'Search in trash...'); ?>" 
                        value="<?php echo htmlspecialchars($search); ?>"
                        autocomplete="off"
                    >
                </form>
                <?php if (!empty($search)): ?>
                    <button id="clearTrashSearchBtn" class="clear-filter-btn">
                        <i class="lucide lucide-x"></i>
                    </button>
                <?php endif; ?>
            </div>
        </div>
        
        <div class="trash-content">
            <?php
            // Build search condition supporting multiple terms (AND) with accent-insensitive search
            $search_params = [];
            $search_condition = '';
            
            if ($search) {
                $terms = array_filter(array_map('trim', preg_split('/\s+/', $search)));
                
                if (count($terms) <= 1) {
                    $search_condition = " AND (remove_accents(heading) LIKE remove_accents(?) OR remove_accents(entry) LIKE remove_accents(?))";
                    $search_params[] = "%{$search}%";
                    $search_params[] = "%{$search}%";
                } else {
                    $parts = [];
                    foreach ($terms as $term) {
                        $parts[] = "(remove_accents(heading) LIKE remove_accents(?) OR remove_accents(entry) LIKE remove_accents(?))";
                        $search_params[] = "%{$term}%";
                        $search_params[] = "%{$term}%";
                    }
                    $search_condition = " AND (" . implode(" AND ", $parts) . ")";
                }
            }
            
            $workspace_condition = $pageWorkspace ? " AND workspace = ?" : '';
            $sql = "SELECT * FROM entries WHERE trash = 1" . $search_condition . $workspace_condition . " ORDER BY updated DESC LIMIT 50";
            
            // Build parameters array
            $params = $search_params;
            if ($pageWorkspace) {
                $params[] = $pageWorkspace;
            }
            
            // Execute query
            if (!empty($params)) {
                $stmt = $con->prepare($sql);
                $stmt->execute($params);
            } else {
                $stmt = $con->query($sql);
            }
            
            // Display notes
            $hasNotes = false;
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $hasNotes = true;
                $id = $row['id'];
                $filename = getEntryFilename($id, $row['type'] ?? 'note');
                $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
                $heading = $row['heading'];
                $updated = formatDateTime(strtotime($row['updated']));
                $lastModifiedLabel = t_h('trash.note.last_modified_on', ['date' => $updated], 'Last modified on {{date}}');
                
                // Handle tasklist type notes
                $displayContent = $entryfinal;
                if (isset($row['type']) && $row['type'] === 'tasklist') {
                    $decoded = json_decode($entryfinal, true);
                    if (is_array($decoded)) {
                        $displayContent = renderTasklistHtml($decoded);
                    } else {
                        // If JSON parse fails, escape raw content
                        $displayContent = htmlspecialchars($entryfinal, ENT_QUOTES);
                    }
                }
                
                echo '<div id="note' . $id . '" class="trash-notecard">'
                    . '<div class="trash-innernote">'
                    . '<div class="trash-action-icons">'
                    . '<i title="' . t_h('trash.actions.restore_note_tooltip', [], 'Restore this note') . '" class="lucide lucide-undo-2" data-noteid="' . $id . '"></i>'
                    . '<i title="' . t_h('trash.actions.delete_permanently_tooltip', [], 'Delete permanently') . '" class="lucide lucide-trash-2" data-noteid="' . $id . '"></i>'
                    . '</div>'
                    . '<div class="lastupdated">' . $lastModifiedLabel . '</div>'
                    . '<h3 class="css-title">' . htmlspecialchars($heading, ENT_QUOTES) . '</h3>'
                    . '<hr>'
                    . '<div class="noteentry">' . $displayContent . '</div>'
                    . '</div></div>';
            }
            
            if (!$hasNotes) {
                echo '<div class="trash-no-notes">' . t_h('trash.empty', [], 'No notes in trash.') . '</div>';
            }
            ?>
        </div>
    </div>
    
    <!-- Empty Trash Confirmation Modal -->
    <div id="emptyTrashConfirmModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('trash.modals.empty.title', [], 'Empty Trash'); ?></h3>
            <p><?php echo t_h('trash.modals.empty.message', [], 'Do you want to empty the trash completely? This action cannot be undone.'); ?></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
                <button type="button" class="btn-danger"><?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- Information Modal -->
    <div id="infoModal" class="modal">
        <div class="modal-content">
            <h3 id="infoModalTitle"><?php echo t_h('common.information'); ?></h3>
            <p id="infoModalMessage"></p>
            <div class="modal-buttons">
                <button type="button" class="btn-primary"><?php echo t_h('common.close'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- Restore Confirmation Modal -->
    <div id="restoreConfirmModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('trash.modals.restore.title', [], 'Restore Note'); ?></h3>
            <p><?php echo t_h('trash.modals.restore.message', [], 'Do you want to restore this note?'); ?></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
                <button type="button" class="btn-primary"><?php echo t_h('trash.actions.restore', [], 'Restore'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div id="deleteConfirmModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('trash.modals.delete.title', [], 'Permanently Delete Note'); ?></h3>
            <p><?php echo t_h('trash.modals.delete.message', [], 'Do you want to permanently delete this note? This action cannot be undone.'); ?></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
                <button type="button" class="btn-danger"><?php echo t_h('trash.actions.delete_forever', [], 'Delete Forever'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- JavaScript modules -->
    <script src="js/globals.js"></script>
    <script src="js/workspaces.js"></script>
    <script src="js/notes.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/attachments.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/search-highlight.js"></script>
    <script src="js/toolbar.js"></script>
    <script src="js/checklist.js"></script>
    <script src="js/bulletlist.js"></script>
    <script src="js/main.js"></script>
    <script src="js/navigation.js"></script>
    <script src="js/trash.js"></script>
</body>
</html>
