<?php
/**
 * Kanban Content - Generates only the HTML content for inline Kanban view
 * This file is included via AJAX to display Kanban in the right column of index.php
 */

// Headers for AJAX
if (isset($_GET['ajax']) && $_GET['ajax'] === '1') {
    header('Content-Type: text/html; charset=utf-8');
}

// Enable error logging (not display, to avoid breaking HTML output)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

try {
    // 1. Authentication
    require 'auth.php';
    requireAuth();

    // 2. Configuration and Includes
    require_once 'config.php';
    include 'functions.php';
    include 'db_connect.php';

    // 3. Input Validation
    $folder_id = intval($_GET['folder_id'] ?? 0);
    $workspace_filter = $_GET['workspace'] ?? '';

    if (!$folder_id) {
        throw new Exception('Invalid folder ID');
    }

    if (!isset($con)) {
       throw new Exception('Database connection not established ($con is null)');
    }

    // 5. Data Fetching
    // Get parent folder info
    $stmt = $con->prepare("SELECT id, name, parent_id, icon, icon_color FROM folders WHERE id = ?");
    $stmt->execute([$folder_id]);
    $parentFolder = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$parentFolder) {
        throw new Exception('Folder not found');
    }

    // Get subfolders
    $stmt = $con->prepare("SELECT id, name, parent_id, icon, icon_color FROM folders WHERE parent_id = ? ORDER BY name");
    $stmt->execute([$folder_id]);
    $subfolders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get notes directly in parent folder (using 'entries' table and 'trash' column)
    $stmt = $con->prepare("SELECT n.id, n.heading, n.updated, n.tags, n.type, n.linked_note_id FROM entries n WHERE n.folder_id = ? AND n.trash = 0 ORDER BY n.updated DESC");
    $stmt->execute([$folder_id]);
    $parentNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    /**
     * Load a text snippet for a note (resolves linked notes).
     * Modifies the note array in-place, adding an 'entry' key.
     */
    $loadNoteSnippet = function (&$note) use ($con) {
        // For linked notes, load the target note's content
        if (($note['type'] ?? 'note') === 'linked' && !empty($note['linked_note_id'])) {
            $targetStmt = $con->prepare("SELECT type FROM entries WHERE id = ?");
            $targetStmt->execute([$note['linked_note_id']]);
            $targetNote = $targetStmt->fetch(PDO::FETCH_ASSOC);
            $filename = $targetNote ? getEntryFilename($note['linked_note_id'], $targetNote['type'] ?? 'note') : '';
        } else {
            $filename = getEntryFilename($note['id'], $note['type'] ?? 'note');
        }

        if ($filename && file_exists($filename)) {
            $content = file_get_contents($filename);
            $note['entry'] = mb_substr(strip_tags($content), 0, 150);
        } else {
            $note['entry'] = '';
        }
    };

    // Load entry snippets for parent notes
    foreach ($parentNotes as &$note) {
        $loadNoteSnippet($note);
    }
    unset($note);

    // Get notes for each subfolder
    $subfolderNotes = [];
    foreach ($subfolders as $subfolder) {
        $stmt = $con->prepare("SELECT n.id, n.heading, n.updated, n.tags, n.type, n.linked_note_id FROM entries n WHERE n.folder_id = ? AND n.trash = 0 ORDER BY n.updated DESC");
        $stmt->execute([$subfolder['id']]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($notes as &$note) {
            $loadNoteSnippet($note);
        }
        unset($note);
        
        $subfolderNotes[$subfolder['id']] = $notes;
    }

    /**
     * Render a single kanban card HTML for a note.
     */
    function renderKanbanCard($note, $folderId) {
        ?>
        <div class="kanban-card" 
             data-note-id="<?php echo $note['id']; ?>" 
             data-folder-id="<?php echo $folderId; ?>"
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
        <?php
    }

    // 6. Output HTML
    ?>
    <div id="kanban-view-container" class="kanban-inline-view" data-folder-id="<?php echo $folder_id; ?>">
        <!-- Kanban Header -->
        <div class="kanban-inline-header">
            <h1 class="kanban-title">
                <?php 
                $pFolderIcon = $parentFolder['icon'] ?? 'fa-folder';
                $pIconColor = $parentFolder['icon_color'] ?? '';
                $pIconStyle = $pIconColor ? "style=\"color: {$pIconColor} !important;\"" : '';
                ?>
                <i class="fas <?php echo htmlspecialchars($pFolderIcon); ?> folder-icon" 
                   data-action="open-folder-icon-picker" 
                   data-folder-id="<?php echo $folder_id; ?>" 
                   data-folder-name="<?php echo htmlspecialchars($parentFolder['name'], ENT_QUOTES); ?>"
                   data-icon-color="<?php echo htmlspecialchars($pIconColor, ENT_QUOTES); ?>"
                   style="cursor: pointer; <?php echo $pIconColor ? "color: {$pIconColor} !important;" : ''; ?>"></i>
                <span data-action="rename-folder" 
                      data-folder-id="<?php echo $folder_id; ?>" 
                      data-folder-name="<?php echo htmlspecialchars($parentFolder['name'], ENT_QUOTES); ?>"
                      style="cursor: pointer;"><?php echo htmlspecialchars($parentFolder['name'], ENT_QUOTES); ?></span>
            </h1>
        </div>

        <!-- Kanban Board Wrapper -->
        <div class="kanban-board-wrapper">
            <!-- Scroll Buttons -->
            <button class="kanban-scroll-btn left" id="kanbanScrollLeft" title="<?php echo t_h('common.scroll_left', [], 'Scroll Left'); ?>">
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="kanban-scroll-btn right" id="kanbanScrollRight" title="<?php echo t_h('common.scroll_right', [], 'Scroll Right'); ?>">
                <i class="fas fa-chevron-right"></i>
            </button>

            <!-- Kanban Board -->
            <div class="kanban-board" id="kanbanBoard">
            
            <?php if (!empty($parentNotes)): ?>
            <!-- Column for notes directly in parent folder -->
            <div class="kanban-column" data-folder-id="<?php echo $folder_id; ?>">
                <div class="kanban-column-header">
                    <div class="kanban-column-title">
                        <span><?php echo t_h('kanban.uncategorized', [], 'Uncategorized'); ?></span>
                    </div>
                    <span class="kanban-column-count"><?php echo count($parentNotes); ?></span>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $folder_id; ?>">
                    <?php foreach ($parentNotes as $note): ?>
                    <?php renderKanbanCard($note, $folder_id); ?>
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
                        $iconStyle = $iconColor ? "style=\"color: {$iconColor} !important;\"" : '';
                        ?>
                        <i class="fas <?php echo htmlspecialchars($folderIcon); ?> folder-icon" 
                           data-action="open-folder-icon-picker" 
                           data-folder-id="<?php echo $subfolder['id']; ?>" 
                           data-folder-name="<?php echo htmlspecialchars($subfolder['name'], ENT_QUOTES); ?>"
                           data-icon-color="<?php echo htmlspecialchars($iconColor, ENT_QUOTES); ?>"
                           style="cursor: pointer; <?php echo $iconColor ? "color: {$iconColor} !important;" : ''; ?>"></i>
                        <span data-action="rename-folder" 
                              data-folder-id="<?php echo $subfolder['id']; ?>" 
                              data-folder-name="<?php echo htmlspecialchars($subfolder['name'], ENT_QUOTES); ?>"
                              style="cursor: pointer;"><?php echo htmlspecialchars($subfolder['name'], ENT_QUOTES); ?></span>
                    </div>
                    <span class="kanban-column-count"><?php echo count($subfolderNotes[$subfolder['id']] ?? []); ?></span>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $subfolder['id']; ?>">
                    <?php foreach ($subfolderNotes[$subfolder['id']] ?? [] as $note): ?>
                    <?php renderKanbanCard($note, $subfolder['id']); ?>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endforeach; ?>

            <?php if (empty($subfolders) && empty($parentNotes)): ?>
            <!-- Empty state -->
            <div class="kanban-empty-state">
                <h2><?php echo t_h('kanban.empty.title', [], 'No subfolders yet'); ?></h2>
                <p><?php echo t_h('kanban.empty.message', [], 'Create subfolders in this folder to use the Kanban view. Each subfolder will become a column.'); ?></p>
            </div>
            <?php endif; ?>

            </div>
        </div>
    </div>
    
    <script>
    // Initialize Kanban drag and drop for inline view
    (function() {
        if (typeof window.initKanbanDragDrop === 'function') {
            window.initKanbanDragDrop();
        }
        
        // Initialize card click handlers
        if (typeof window.initKanbanCardClicks === 'function') {
            window.initKanbanCardClicks();
        }
    })();
    </script>
    <?php

} catch (Exception $e) {
    // Graceful error handling in inline view
    ?>
    <div class="kanban-error" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary, #64748b); padding: 40px; text-align: center;">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 20px; color: #f59e0b;"></i>
        <h2 style="font-size: 1.5rem; margin-bottom: 10px;"><?php echo t_h('common.error', [], 'Error'); ?></h2>
        <p style="margin-bottom: 20px; color: var(--text-tertiary, #94a3b8); max-width: 400px;">
            <?php echo htmlspecialchars($e->getMessage()); ?>
        </p>
        <button type="button" class="btn btn-primary" onclick="window.closeKanbanView ? window.closeKanbanView() : window.location.reload();">
            <i class="fas fa-arrow-left"></i> <?php echo t_h('common.back_to_notes', [], 'Back to Notes'); ?>
        </button>
    </div>
    <?php
}
?>
