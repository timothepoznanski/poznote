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
    require_once __DIR__ . '/auth.php';
    requireAuth();

    // 2. Configuration and Includes
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/functions.php';
    require_once __DIR__ . '/db_connect.php';

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
        $contentType = $note['type'] ?? 'note';
        $previewNoteId = $note['id'];

        // For linked notes, load the target note's content
        if (($note['type'] ?? 'note') === 'linked' && !empty($note['linked_note_id'])) {
            $targetStmt = $con->prepare("SELECT type, tags FROM entries WHERE id = ? AND trash = 0");
            $targetStmt->execute([$note['linked_note_id']]);
            $targetNote = $targetStmt->fetch(PDO::FETCH_ASSOC);
            $contentType = $targetNote['type'] ?? 'note';
            $previewNoteId = $targetNote ? $note['linked_note_id'] : $previewNoteId;
            $filename = $targetNote ? getEntryFilename($note['linked_note_id'], $contentType) : '';
            if ($targetNote && trim((string) ($note['tags'] ?? '')) === '' && trim((string) ($targetNote['tags'] ?? '')) !== '') {
                $note['tags'] = $targetNote['tags'];
            }
        } else {
            $filename = getEntryFilename($note['id'], $note['type'] ?? 'note');
        }

        $note['kanban_preview_type'] = $contentType;
        $note['kanban_preview_note_id'] = $previewNoteId;

        if ($filename && file_exists($filename)) {
            $content = file_get_contents($filename);
            if ($contentType === 'tasklist') {
                $note['entry'] = resolveTasklistStoredContent($content, '');
            } else {
                $note['entry'] = mb_substr(strip_tags($content), 0, 150);
            }
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
     * Format a note update date without breaking the whole Kanban view on malformed data.
     */
    function formatKanbanDate($updated) {
        if (empty($updated)) {
            return '';
        }

        try {
            $date = new DateTime($updated, new DateTimeZone('UTC'));
            $date->setTimezone(new DateTimeZone(getUserTimezone()));
            return $date->format('d/m H:i');
        } catch (Exception $e) {
            return '';
        }
    }

    /**
     * Parse note tags for Kanban badges. Tags are stored comma-separated, but older UI values may be space-separated.
     */
    function getKanbanTags($tags) {
        $tags = trim((string) ($tags ?? ''));
        if ($tags === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', preg_split('/\s*,\s*|\s+/', $tags)), static function ($tag) {
            return $tag !== '';
        }));
    }

    /**
     * Decode normalized tasklist content for compact Kanban previews.
     */
    function getKanbanTasklistPreviewTasks($content) {
        $normalized = resolveTasklistStoredContent((string) ($content ?? ''), '');
        $tasks = json_decode($normalized, true);

        if (json_last_error() !== JSON_ERROR_NONE || !is_array($tasks)) {
            return null;
        }

        if (isset($tasks['tasks']) && is_array($tasks['tasks'])) {
            $tasks = $tasks['tasks'];
        }

        if ($tasks !== [] && !isset($tasks[0])) {
            return null;
        }

        return array_values(array_filter($tasks, static function ($task) {
            return is_array($task);
        }));
    }

    /**
     * Render task rows in a scrollable Kanban card preview.
     */
    function renderKanbanTasklistPreview($content, $visibleRows = 5, $noteId = null) {
        $tasks = getKanbanTasklistPreviewTasks($content);
        if ($tasks === null) {
            return false;
        }

        $visibleRows = max(1, (int) $visibleRows);
        $maxHeight = ($visibleRows * 20) + (($visibleRows - 1) * 4);

        echo '<div class="kanban-tasklist-preview' . (empty($tasks) ? ' is-empty' : '') . '" data-task-note-id="' . (int) $noteId . '" style="--kanban-task-preview-max-height: ' . (int) $maxHeight . 'px;">';
        foreach ($tasks as $taskIndex => $task) {
            $text = $task['text'] ?? ($task['content'] ?? '');
            if (!is_scalar($text)) {
                $text = '';
            }

            $completed = !empty($task['completed']) || !empty($task['checked']) || !empty($task['done']);
            $important = !empty($task['important']);
            $className = 'kanban-task-preview-item' . ($completed ? ' completed' : '') . ($important ? ' important' : '');
            $taskId = $task['id'] ?? '';
            $taskIdAttr = is_scalar($taskId) ? htmlspecialchars((string) $taskId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : '';

            echo '<label class="' . $className . '">';
            echo '<input type="checkbox" class="kanban-task-checkbox" data-task-index="' . (int) $taskIndex . '" data-task-id="' . $taskIdAttr . '"' . ($completed ? ' checked' : '') . '>';
            echo '<span class="kanban-task-preview-text">' . htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span>';
            echo '</label>';
        }
        echo '</div>';

        return true;
    }

    /**
     * Render a single kanban card HTML for a note.
     */
    function renderKanbanCard($note, $folderId) {
        $isTasklistPreview = (($note['kanban_preview_type'] ?? ($note['type'] ?? 'note')) === 'tasklist');
        $kanbanTags = getKanbanTags($note['tags'] ?? '');
        $kanbanDate = formatKanbanDate($note['updated'] ?? '');
        ?>
        <div class="kanban-card" 
             data-note-id="<?php echo $note['id']; ?>" 
             data-folder-id="<?php echo $folderId; ?>"
             draggable="true">
            <?php if ($kanbanDate !== '' || !empty($kanbanTags)): ?>
            <div class="kanban-card-topline">
                <?php if ($kanbanDate !== ''): ?>
                <span class="kanban-card-date">
                    <?php echo htmlspecialchars($kanbanDate, ENT_QUOTES); ?>
                </span>
                <?php endif; ?>

                <?php if (!empty($kanbanTags)): ?>
                <div class="kanban-card-tags">
                    <?php foreach ($kanbanTags as $tag): ?>
                        <span class="kanban-tag"><?php echo htmlspecialchars($tag, ENT_QUOTES); ?></span>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            <?php endif; ?>

            <div class="kanban-card-title">
                <?php 
                $noteTitle = $note['heading'] ?: t('index.note.new_note', [], 'New note');
                echo htmlspecialchars($noteTitle, ENT_QUOTES); 
                ?>
            </div>

            <div class="kanban-card-snippet<?php echo $isTasklistPreview ? ' kanban-card-tasklist' : ''; ?>">
                <?php 
                if (!$isTasklistPreview || !renderKanbanTasklistPreview($note['entry'] ?? '', 5, $note['kanban_preview_note_id'] ?? $note['id'])) {
                    $snippet = strip_tags($note['entry'] ?? '');
                    $snippet = html_entity_decode($snippet);
                    echo htmlspecialchars(mb_substr($snippet, 0, 80) . (mb_strlen($snippet) > 80 ? '...' : ''), ENT_QUOTES);
                }
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
                $pFolderIconRaw = $parentFolder['icon'] ?? null;
                $pFolderIcon = $pFolderIconRaw ? convertFontAwesomeToLucide($pFolderIconRaw) : 'lucide-folder';
                $pIconColor = $parentFolder['icon_color'] ?? '';
                $pIconStyle = $pIconColor ? "style=\"color: {$pIconColor} !important;\"" : '';
                ?>
                <i class="<?php echo htmlspecialchars($pFolderIcon); ?> folder-icon" 
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
            <div class="kanban-header-actions">
                <button class="kanban-add-column-btn" 
                        data-action="create-kanban-column" 
                        data-parent-id="<?php echo $folder_id; ?>" 
                        title="<?php echo t_h('kanban.add_column', [], 'Add column'); ?>">
                    <i class="lucide lucide-plus-circle"></i>
                </button>
            </div>
        </div>

        <!-- Kanban Board Wrapper -->
        <div class="kanban-board-wrapper">
            <!-- Scroll Buttons -->
            <button class="kanban-scroll-btn left" id="kanbanScrollLeft" title="<?php echo t_h('common.scroll_left', [], 'Scroll Left'); ?>">
                <i class="lucide lucide-chevron-left"></i>
            </button>
            <button class="kanban-scroll-btn right" id="kanbanScrollRight" title="<?php echo t_h('common.scroll_right', [], 'Scroll Right'); ?>">
                <i class="lucide lucide-chevron-right"></i>
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
                    <div class="kanban-column-header-actions">
                        <button class="kanban-add-card-btn" 
                                data-action="create-kanban-note" 
                                data-folder-id="<?php echo $folder_id; ?>" 
                                data-folder-name="<?php echo htmlspecialchars($parentFolder['name'], ENT_QUOTES); ?>" 
                                title="<?php echo t_h('kanban.add_note', [], 'Add note'); ?>">
                            <i class="lucide lucide-plus-circle"></i>
                        </button>
                        <span class="kanban-column-count"><?php echo count($parentNotes); ?></span>
                    </div>
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
                        $folderIconRaw = $subfolder['icon'] ?? null;
                        $folderIcon = $folderIconRaw ? convertFontAwesomeToLucide($folderIconRaw) : 'lucide-folder';
                        $iconColor = $subfolder['icon_color'] ?? '';
                        $iconStyle = $iconColor ? "style=\"color: {$iconColor} !important;\"" : '';
                        ?>
                        <i class="<?php echo htmlspecialchars($folderIcon); ?> folder-icon" 
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
                    <div class="kanban-column-header-actions">
                        <button class="kanban-add-card-btn" 
                                data-action="create-kanban-note" 
                                data-folder-id="<?php echo $subfolder['id']; ?>" 
                                data-folder-name="<?php echo htmlspecialchars($subfolder['name'], ENT_QUOTES); ?>" 
                                title="<?php echo t_h('kanban.add_note', [], 'Add note'); ?>">
                            <i class="lucide lucide-plus-circle"></i>
                        </button>
                        <span class="kanban-column-count"><?php echo count($subfolderNotes[$subfolder['id']] ?? []); ?></span>
                    </div>
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
    <?php

} catch (Exception $e) {
    // Graceful error handling in inline view
    ?>
    <div class="kanban-error" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary, #64748b); padding: 40px; text-align: center;">
        <i class="lucide lucide-alert-triangle" style="font-size: 3rem; margin-bottom: 20px; color: #f59e0b;"></i>
        <h2 style="font-size: 1.5rem; margin-bottom: 10px;"><?php echo t_h('common.error', [], 'Error'); ?></h2>
        <p style="margin-bottom: 20px; color: var(--text-tertiary, #94a3b8); max-width: 400px;">
            <?php echo htmlspecialchars($e->getMessage()); ?>
        </p>
        <button type="button" class="btn btn-primary" onclick="window.closeKanbanView ? window.closeKanbanView() : window.location.reload();">
            <i class="lucide lucide-arrow-left"></i> <?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
        </button>
    </div>
    <?php
}
?>
