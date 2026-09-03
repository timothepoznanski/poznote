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

    // Get notes directly in parent folder (using 'entries' table and 'trash' column)
    // Completed cards are ordered by completion date so the newest finished card
    // sits at the top of the "completed" section.
    $stmt = $con->prepare("SELECT n.id, n.heading, n.updated, n.tags, n.type, n.linked_note_id, n.kanban_completed, n.reminder_at FROM entries n WHERE n.folder_id = ? AND n.trash = 0 ORDER BY n.kanban_completed DESC, n.updated DESC");
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
            $targetStmt = $con->prepare("SELECT type, tags, reminder_at FROM entries WHERE id = ? AND trash = 0");
            $targetStmt->execute([$note['linked_note_id']]);
            $targetNote = $targetStmt->fetch(PDO::FETCH_ASSOC);
            $contentType = $targetNote['type'] ?? 'note';
            $previewNoteId = $targetNote ? $note['linked_note_id'] : $previewNoteId;
            $filename = $targetNote ? getEntryFilename($note['linked_note_id'], $contentType) : '';
            if ($targetNote && trim((string) ($note['tags'] ?? '')) === '' && trim((string) ($targetNote['tags'] ?? '')) !== '') {
                $note['tags'] = $targetNote['tags'];
            }
            if ($targetNote && trim((string) ($note['reminder_at'] ?? '')) === '' && trim((string) ($targetNote['reminder_at'] ?? '')) !== '') {
                $note['reminder_at'] = $targetNote['reminder_at'];
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

    /**
     * Notes of one folder with their preview snippets loaded.
     */
    $loadKanbanFolderNotes = function ($folderId) use ($con, $loadNoteSnippet) {
        $stmt = $con->prepare("SELECT n.id, n.heading, n.updated, n.tags, n.type, n.linked_note_id, n.kanban_completed, n.reminder_at FROM entries n WHERE n.folder_id = ? AND n.trash = 0 ORDER BY n.kanban_completed DESC, n.updated DESC");
        $stmt->execute([$folderId]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($notes as &$note) {
            $loadNoteSnippet($note);
        }
        unset($note);

        return $notes;
    };

    /**
     * Build the folder tree below a folder, recursively. Each node holds the
     * folder row, its notes and its own child nodes. Direct children of the
     * board folder become columns, deeper folders become collapsible groups
     * nested inside their parent column. The visited set and the depth cap
     * guard against corrupted parent chains.
     */
    $KANBAN_MAX_DEPTH = 10;
    $buildKanbanFolderTree = function ($parentId, $depth, array $visited) use (&$buildKanbanFolderTree, $con, $loadKanbanFolderNotes, $KANBAN_MAX_DEPTH) {
        if ($depth > $KANBAN_MAX_DEPTH) {
            return [];
        }

        $stmt = $con->prepare("SELECT id, name, parent_id, icon, icon_color FROM folders WHERE parent_id = ? ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE");
        $stmt->execute([$parentId]);
        $folders = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $nodes = [];
        foreach ($folders as $folder) {
            $childId = (int) $folder['id'];
            if (isset($visited[$childId])) {
                continue;
            }
            $visited[$childId] = true;

            $nodes[] = [
                'folder' => $folder,
                'notes' => $loadKanbanFolderNotes($childId),
                'children' => $buildKanbanFolderTree($childId, $depth + 1, $visited),
            ];
        }

        return $nodes;
    };

    $kanbanColumns = $buildKanbanFolderTree($folder_id, 1, [$folder_id => true]);

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
     * Normalize a task due date ('Y-m-d' or 'Y-m-dTH:i', local time) or return ''.
     */
    function normalizeKanbanDueAt($value) {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/', $value, $m)) {
            return '';
        }
        return substr($value, 0, empty($m[1]) ? 10 : 16);
    }

    /**
     * Current date/time in the user's timezone as 'Y-m-d\TH:i', for
     * lexicographic comparison with task due dates (which are stored local).
     */
    function kanbanNowLocalString() {
        static $now = null;
        if ($now === null) {
            try {
                $date = new DateTime('now', new DateTimeZone(getUserTimezone()));
            } catch (Exception $e) {
                $date = new DateTime('now');
            }
            $now = $date->format('Y-m-d\TH:i');
        }
        return $now;
    }

    /**
     * True when a normalized local due date is in the past.
     * Date-only values are overdue starting the next day.
     */
    function isKanbanDueOverdue($due) {
        if ($due === '') {
            return false;
        }
        if (strlen($due) > 10) {
            return $due < kanbanNowLocalString();
        }
        return $due < substr(kanbanNowLocalString(), 0, 10);
    }

    /**
     * Compact label for a due date badge: 'd/m' or 'd/m H:i'.
     */
    function formatKanbanDueLabel($due) {
        if ($due === '') {
            return '';
        }
        $day = (int) substr($due, 8, 2);
        $month = (int) substr($due, 5, 2);
        $label = sprintf('%02d/%02d', $day, $month);
        if (strlen($due) > 10) {
            $label .= ' ' . substr($due, 11, 5);
        }
        return $label;
    }

    /**
     * Convert a note reminder (entries.reminder_at, stored UTC) to a local
     * 'Y-m-d\TH:i' string comparable with task due dates. Returns ''.
     */
    function kanbanReminderToLocalDue($reminderAt) {
        $reminderAt = trim((string) ($reminderAt ?? ''));
        if ($reminderAt === '') {
            return '';
        }
        try {
            $date = new DateTime($reminderAt, new DateTimeZone('UTC'));
            $date->setTimezone(new DateTimeZone(getUserTimezone()));
            return $date->format('Y-m-d\TH:i');
        } catch (Exception $e) {
            return '';
        }
    }

    /**
     * Earliest due date among the uncompleted tasks of a tasklist note.
     */
    function getKanbanNextTaskDue($content) {
        $tasks = getKanbanTasklistPreviewTasks($content);
        if ($tasks === null) {
            return '';
        }

        $next = '';
        foreach ($tasks as $task) {
            $completed = !empty($task['completed']) || !empty($task['checked']) || !empty($task['done']);
            if ($completed) {
                continue;
            }
            $due = normalizeKanbanDueAt($task['dueAt'] ?? null);
            if ($due === '') {
                continue;
            }
            if ($next === '' || $due < $next) {
                $next = $due;
            }
        }
        return $next;
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
    function renderKanbanTasklistPreview($content, $visibleRows = 3, $noteId = null) {
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
        $isCompleted = !empty($note['kanban_completed']);
        $toggleLabel = $isCompleted
            ? t_h('kanban.completed.mark_active', [], 'Mark as not completed')
            : t_h('kanban.completed.mark_completed', [], 'Mark as completed');

        // Due date badge: a tasklist card shows its next upcoming task due date,
        // any other card shows the note reminder (bell icon) when one is set.
        $reminderDue = kanbanReminderToLocalDue($note['reminder_at'] ?? '');
        $taskDue = $isTasklistPreview ? getKanbanNextTaskDue($note['entry'] ?? '') : '';
        $dueValue = $taskDue !== '' ? $taskDue : $reminderDue;
        $dueSource = $taskDue !== '' ? 'task' : 'reminder';
        $dueOverdue = isKanbanDueOverdue($dueValue);
        ?>
        <div class="kanban-card<?php echo $isCompleted ? ' kanban-card-completed' : ''; ?>"
             data-note-id="<?php echo $note['id']; ?>"
             data-folder-id="<?php echo $folderId; ?>"
             data-completed="<?php echo $isCompleted ? '1' : '0'; ?>"
             data-tags="<?php echo htmlspecialchars(implode(',', $kanbanTags), ENT_QUOTES); ?>"
             data-reminder-due="<?php echo htmlspecialchars($reminderDue, ENT_QUOTES); ?>"
             draggable="true">
            <button type="button"
                    class="kanban-card-complete-btn"
                    data-action="toggle-kanban-completed"
                    data-note-id="<?php echo $note['id']; ?>"
                    title="<?php echo $toggleLabel; ?>"
                    aria-label="<?php echo $toggleLabel; ?>"
                    aria-pressed="<?php echo $isCompleted ? 'true' : 'false'; ?>">
                <i class="lucide lucide-check"></i>
            </button>
            <?php if ($kanbanDate !== '' || $dueValue !== ''): ?>
            <div class="kanban-card-topline">
                <?php if ($dueValue !== ''): ?>
                <span class="kanban-card-due<?php echo $dueOverdue ? ' overdue' : ''; ?>"
                      data-due-source="<?php echo $dueSource; ?>"
                      title="<?php echo $dueOverdue ? t_h('kanban.due.overdue', [], 'Overdue') : t_h('kanban.due.label', [], 'Due date'); ?>">
                    <i class="lucide <?php echo $dueSource === 'task' ? 'lucide-alarm-clock' : 'lucide-bell'; ?>"></i><span class="kanban-card-due-text"><?php echo htmlspecialchars(formatKanbanDueLabel($dueValue), ENT_QUOTES); ?></span>
                </span>
                <?php endif; ?>

                <?php if ($kanbanDate !== ''): ?>
                <span class="kanban-card-date">
                    <?php echo htmlspecialchars($kanbanDate, ENT_QUOTES); ?>
                </span>
                <?php endif; ?>

            </div>
            <?php endif; ?>

            <?php if (!empty($kanbanTags)): ?>
            <div class="kanban-card-tags">
                <?php foreach ($kanbanTags as $tag): ?>
                    <?php $tagHex = resolveTagColorHex($tag); ?>
                    <span class="kanban-tag<?php echo $tagHex !== '' ? ' kanban-tag-colored' : ''; ?>"<?php echo $tagHex !== '' ? ' style="--tag-color: ' . htmlspecialchars($tagHex, ENT_QUOTES) . ';"' : ''; ?>><?php echo htmlspecialchars($tag, ENT_QUOTES); ?></span>
                <?php endforeach; ?>
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
                if (!$isTasklistPreview || !renderKanbanTasklistPreview($note['entry'] ?? '', 3, $note['kanban_preview_note_id'] ?? $note['id'])) {
                    $snippet = strip_tags($note['entry'] ?? '');
                    $snippet = html_entity_decode($snippet);
                    echo htmlspecialchars(mb_substr($snippet, 0, 80) . (mb_strlen($snippet) > 80 ? '...' : ''), ENT_QUOTES);
                }
                ?>
            </div>
        </div>
        <?php
    }

    /**
     * Split a column's notes into active cards and completed cards.
     */
    function splitKanbanNotesByCompletion($notes) {
        $active = [];
        $completed = [];
        foreach ($notes as $note) {
            if (!empty($note['kanban_completed'])) {
                $completed[] = $note;
            } else {
                $active[] = $note;
            }
        }
        return [$active, $completed];
    }

    /**
     * Render the cards of a folder: active cards first, then a collapsible
     * "completed" section holding the finished cards, then one collapsible
     * group per subfolder (each rendered the same way, recursively).
     */
    function renderKanbanColumnCards($notes, $folderId, $children = []) {
        [$activeNotes, $completedNotes] = splitKanbanNotesByCompletion($notes);

        foreach ($activeNotes as $note) {
            renderKanbanCard($note, $folderId);
        }

        if (!empty($completedNotes)) {
            renderKanbanCompletedSection($completedNotes, $folderId);
        }

        foreach ($children as $child) {
            renderKanbanSubfolderSection($child);
        }
    }

    /**
     * Render a nested, collapsible group for a subfolder inside a column.
     * The group content is a drop zone targeting that subfolder.
     */
    function renderKanbanSubfolderSection($node) {
        $folder = $node['folder'];
        $folderId = (int) $folder['id'];
        $folderName = (string) ($folder['name'] ?? '');
        $iconRaw = $folder['icon'] ?? null;
        $icon = $iconRaw ? convertFontAwesomeToLucide($iconRaw) : 'lucide-folder';
        $iconColor = (string) ($folder['icon_color'] ?? '');
        $activeCount = count(splitKanbanNotesByCompletion($node['notes'])[0]);
        ?>
        <div class="kanban-subfolder-section" data-folder-id="<?php echo $folderId; ?>">
            <div class="kanban-subfolder-header">
                <button type="button"
                        class="kanban-subfolder-toggle"
                        data-action="toggle-kanban-subfolder-section"
                        data-folder-id="<?php echo $folderId; ?>"
                        data-label-expand="<?php echo t_h('kanban.subfolder.expand', [], 'Expand subfolder'); ?>"
                        data-label-collapse="<?php echo t_h('kanban.subfolder.collapse', [], 'Collapse subfolder'); ?>"
                        title="<?php echo t_h('kanban.subfolder.expand', [], 'Expand subfolder'); ?>"
                        aria-expanded="false">
                    <i class="lucide lucide-chevron-right kanban-subfolder-chevron"></i>
                    <i class="<?php echo htmlspecialchars($icon); ?> folder-icon kanban-subfolder-icon"
                       data-folder-id="<?php echo $folderId; ?>"
                       data-icon-color="<?php echo htmlspecialchars($iconColor, ENT_QUOTES); ?>"
                       <?php echo $iconColor ? 'style="color: ' . htmlspecialchars($iconColor, ENT_QUOTES) . ' !important;"' : ''; ?>></i>
                    <span class="kanban-subfolder-name"><?php echo htmlspecialchars($folderName, ENT_QUOTES); ?></span>
                    <span class="kanban-subfolder-count"><?php echo $activeCount; ?></span>
                </button>
                <button type="button"
                        class="kanban-add-card-btn kanban-subfolder-add-btn"
                        data-action="create-kanban-note"
                        data-folder-id="<?php echo $folderId; ?>"
                        data-folder-name="<?php echo htmlspecialchars($folderName, ENT_QUOTES); ?>"
                        title="<?php echo t_h('kanban.add_note', [], 'Add note'); ?>">
                    <i class="lucide lucide-plus-circle"></i>
                </button>
            </div>
            <div class="kanban-subfolder-content" data-folder-id="<?php echo $folderId; ?>">
                <?php renderKanbanColumnCards($node['notes'], $folderId, $node['children']); ?>
            </div>
        </div>
        <?php
    }

    /**
     * Render the collapsible "completed" section of a folder.
     */
    function renderKanbanCompletedSection($completedNotes, $folderId) {
        $completedCount = count($completedNotes);
        ?>
        <div class="kanban-completed-section" data-folder-id="<?php echo $folderId; ?>">
            <button type="button"
                    class="kanban-completed-toggle"
                    data-action="toggle-kanban-completed-section"
                    data-folder-id="<?php echo $folderId; ?>"
                    aria-expanded="false">
                <i class="lucide lucide-chevron-right kanban-completed-chevron"></i>
                <span class="kanban-completed-label"><?php echo t_h('kanban.completed.show', [], 'Show completed'); ?></span>
                <span class="kanban-completed-count"><?php echo $completedCount; ?></span>
            </button>
            <div class="kanban-completed-content">
                <?php foreach ($completedNotes as $note): ?>
                <?php renderKanbanCard($note, $folderId); ?>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    // 6. Output HTML
    ?>
    <div id="kanban-view-container" class="kanban-inline-view" data-folder-id="<?php echo $folder_id; ?>">
        <!-- Kanban Header -->
        <div class="kanban-inline-header">
            <button class="kanban-scroll-btn-header left" id="kanbanScrollLeft" title="<?php echo t_h('common.scroll_left', [], 'Scroll Left'); ?>">
                <i class="lucide lucide-chevron-left"></i>
            </button>
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
                <button class="kanban-scroll-btn-header right" id="kanbanScrollRight" title="<?php echo t_h('common.scroll_right', [], 'Scroll Right'); ?>">
                    <i class="lucide lucide-chevron-right"></i>
                </button>
                <button class="kanban-sort-toggle"
                        data-action="cycle-kanban-card-sort"
                        data-label="<?php echo t_h('kanban.sort.label', [], 'Sort by'); ?>"
                        data-label-date="<?php echo t_h('kanban.sort.date', [], 'Date'); ?>"
                        data-label-tag="<?php echo t_h('kanban.sort.tag', [], 'Tag'); ?>"
                        title="<?php echo t_h('kanban.sort.label', [], 'Sort by'); ?>">
                    <i class="lucide lucide-calendar kanban-sort-icon"></i>
                </button>
                <button class="kanban-size-toggle"
                        data-action="cycle-kanban-card-size"
                        data-label="<?php echo t_h('kanban.card_size', [], 'Card size'); ?>"
                        data-label-small="<?php echo t_h('dashboard.view.size_small', [], 'Small'); ?>"
                        data-label-medium="<?php echo t_h('dashboard.view.size_medium', [], 'Medium'); ?>"
                        data-label-large="<?php echo t_h('dashboard.view.size_large', [], 'Large'); ?>"
                        title="<?php echo t_h('kanban.card_size', [], 'Card size'); ?>">
                    <span class="kanban-size-letter">M</span>
                </button>
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
                        <span class="kanban-column-count"><?php echo count(splitKanbanNotesByCompletion($parentNotes)[0]); ?></span>
                    </div>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $folder_id; ?>">
                    <?php renderKanbanColumnCards($parentNotes, $folder_id); ?>
                </div>
            </div>
            <?php endif; ?>

            <?php foreach ($kanbanColumns as $kanbanColumn): ?>
            <?php $subfolder = $kanbanColumn['folder']; ?>
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
                        <span class="kanban-column-count"><?php echo count(splitKanbanNotesByCompletion($kanbanColumn['notes'])[0]); ?></span>
                    </div>
                </div>
                <div class="kanban-column-content" data-folder-id="<?php echo $subfolder['id']; ?>">
                    <?php renderKanbanColumnCards($kanbanColumn['notes'], $subfolder['id'], $kanbanColumn['children']); ?>
                </div>
            </div>
            <?php endforeach; ?>

            <?php if (empty($kanbanColumns) && empty($parentNotes)): ?>
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
