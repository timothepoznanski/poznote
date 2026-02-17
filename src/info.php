<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// Get note ID from URL parameter
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
// Preserve workspace parameter if provided
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;

if (!$note_id) {
    $loc = 'index.php';
    if ($workspace) $loc .= '?workspace=' . urlencode($workspace);
    header('Location: ' . $loc);
    exit;
}

// Get note details from database
try {
    if ($workspace) {
        $stmt = $con->prepare("SELECT heading, folder, folder_id, created, updated, favorite, tags, attachments, type, workspace FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
        $stmt->execute([$note_id, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading, folder, folder_id, created, updated, favorite, tags, attachments, type, workspace FROM entries WHERE id = ? AND trash = 0");
        $stmt->execute([$note_id]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        $loc = 'index.php';
        if ($workspace) $loc .= '?workspace=' . urlencode($workspace);
        header('Location: ' . $loc);
        exit;
    }
} catch (PDOException $e) {
    $loc = 'index.php';
    if ($workspace) $loc .= '?workspace=' . urlencode($workspace);
    header('Location: ' . $loc);
    exit;
}

$title = $note['heading'] ?: t('index.note.new_note', [], 'New note');

// Format dates
function formatDateString($dateStr) {
    if (empty($dateStr)) return t('common.not_available', [], 'Not available');
    try {
        // Dates are stored in UTC in the database
        // Convert to the user's configured timezone for display
        $timezone = getUserTimezone();
        $date = new DateTime($dateStr, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($timezone));
        return $date->format('Y-m-d H:i');
    } catch (Exception $e) {
        return t('common.not_available', [], 'Not available');
    }
}

$createdText = formatDateString($note['created']);
$updatedText = formatDateString($note['updated']);

// Build full folder path using the shared helper function
$folderText = t('modals.folder.no_folder', [], 'No folder');
if (!empty($note['folder_id'])) {
    $folderPath = getFolderPath($note['folder_id'], $con);
    if (!empty($folderPath)) {
        $folderText = $folderPath;
    }
} elseif (!empty($note['folder'])) {
    // Fallback for old data that might not have folder_id
    $folderText = $note['folder'];
}

$isFavorite = (int)$note['favorite'] === 1;

// Build full path of the note with appropriate extension
$noteType = $note['type'] ?? 'note';
$fullPath = getEntryFilename($note_id, $noteType);
// Convert absolute path to relative path starting with "data/"
$fullPath = str_replace(__DIR__ . '/', '', $fullPath);

// Process tags
$tags = [];
if (!empty($note['tags'])) {
    $tags = array_filter(array_map('trim', explode(',', $note['tags'])));
}
$tagsText = empty($tags) ? t('info.empty.no_tags', [], 'No tags') : implode(', ', $tags);

// Count attachments
$attachmentsCount = 0;
if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
    // Handle both comma-separated format and JSON format
    if (substr($note['attachments'], 0, 1) === '[' && substr($note['attachments'], -1) === ']') {
        // JSON format - decode and count
        $attachmentsArray = json_decode($note['attachments'], true);
        if (is_array($attachmentsArray)) {
            $attachmentsCount = count(array_filter($attachmentsArray));
        }
    } else {
        // Comma-separated format
        $attachmentsArray = explode(',', $note['attachments']);
        $attachmentsCount = count(array_filter(array_map('trim', $attachmentsArray)));
    }
}


?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('info.page_title', [], 'Note Information'); ?> - <?php echo htmlspecialchars($title); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/info.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/dark-mode/variables.css">
    <link rel="stylesheet" href="css/dark-mode/layout.css">
    <link rel="stylesheet" href="css/dark-mode/menus.css">
    <link rel="stylesheet" href="css/dark-mode/editor.css">
    <link rel="stylesheet" href="css/dark-mode/modals.css">
    <link rel="stylesheet" href="css/dark-mode/components.css">
    <link rel="stylesheet" href="css/dark-mode/pages.css">
    <link rel="stylesheet" href="css/dark-mode/markdown.css">
    <link rel="stylesheet" href="css/dark-mode/kanban.css">
    <link rel="stylesheet" href="css/dark-mode/icons.css">
    <script src="js/theme-manager.js"></script>
</head>
<body data-note-id="<?php echo $note_id; ?>" data-workspace="<?php echo htmlspecialchars($workspace ?? '', ENT_QUOTES, 'UTF-8'); ?>">
    
    <div class="info-page">
        <div class="info-buttons-back-container">
            <button id="backToNoteBtn" class="btn btn-secondary" title="<?php echo t_h('info.actions.back_to_note', [], 'Back to note'); ?>">
                <?php echo t_h('info.actions.back_to_note', [], 'Back to note'); ?>
            </button>
        </div>
        
        <div class="info-content">
            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.note_title', [], 'Note title:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($title); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.workspace', [], 'Workspace:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($note['workspace'] ?? $workspace); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.folder', [], 'Folder:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($folderText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.created', [], 'Created:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($createdText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.last_modified', [], 'Last Modified:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($updatedText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.tags', [], 'Tags:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($tagsText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.favorite', [], 'Favorite:'); ?></div>
                <div class="info-value">
                    <?php if ($isFavorite): ?>
                        <span class="favorite-yes"><?php echo t_h('common.yes', [], 'Yes'); ?></span>
                    <?php else: ?>
                        <span class="favorite-no"><?php echo t_h('common.no', [], 'No'); ?></span>
                    <?php endif; ?>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.attachments', [], 'Attachments:'); ?></div>
                <div class="info-value">
                    <?php
                        if ((int)$attachmentsCount === 1) {
                            echo t_h('info.attachments.count_singular', ['count' => $attachmentsCount], '1 file');
                        } else {
                            echo t_h('info.attachments.count_plural', ['count' => $attachmentsCount], '{{count}} files');
                        }
                    ?>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.note_id', [], 'Note ID:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($note_id); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.full_path', [], 'Full Path:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($fullPath); ?></div>
            </div>
        </div>
    </div>

    <script src="js/ui.js"></script>
    <script src="js/modal-alerts.js"></script>
    <script src="js/navigation.js"></script>
    <script src="js/info-page.js"></script>
</body>
</html>
