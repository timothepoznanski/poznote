<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
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
        $stmt = $con->prepare("SELECT heading, folder, folder_id, created, updated, favorite, tags, attachments, location, subheading, type FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
        $stmt->execute([$note_id, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading, folder, folder_id, created, updated, favorite, tags, attachments, location, subheading, type FROM entries WHERE id = ? AND trash = 0");
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
        return $date->format('d/m/Y H:i');
    } catch (Exception $e) {
        return t('common.not_available', [], 'Not available');
    }
}

$createdText = formatDateString($note['created']);
$updatedText = formatDateString($note['updated']);
$folderText = $note['folder'] ?: t('modals.folder.no_folder', [], 'No folder');
$isFavorite = (int)$note['favorite'] === 1;

// Build full path of the note with appropriate extension
$noteType = $note['type'] ?? 'note';
$fullPath = "./data/entries/{$note_id}" . getFileExtensionForType($noteType);

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

$subheadingText = $note['subheading'] ?: ($note['location'] ?: t('common.not_specified', [], 'Not specified'));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('info.page_title', [], 'Note Information'); ?> - <?php echo htmlspecialchars($title); ?></title>
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/info.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/theme-manager.js"></script>
</head>
<body>
    
    <div class="info-page">
        <div class="info-buttons-back-container">
            <button id="backToNoteBtn" class="btn btn-secondary" onclick="goBackToNote()" title="<?php echo t_h('info.actions.back_to_note', [], 'Back to note'); ?>">
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
                <div class="info-label"><?php echo t_h('info.labels.subheading', [], 'Subheading:'); ?></div>
                <div class="info-value">
                    <span id="subheading-display" style="cursor:pointer;" role="button" tabindex="0" onclick='editSubheadingInline(<?php echo json_encode($note['subheading'] ?? ($note['location'] ?? ''), JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>);'><?php echo htmlspecialchars($subheadingText); ?></span>
                    <input type="text" id="subheading-input" style="display: none;" />
                    <div id="subheading-buttons" style="display: none; margin-left: 10px;">
                        <button type="button" class="btn-save" onclick="saveSubheading(<?php echo $note_id; ?>)"><?php echo t_h('common.save', [], 'Save'); ?></button>
                        <button type="button" class="btn-cancel" onclick="cancelSubheadingEdit()"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    </div>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.tags', [], 'Tags:'); ?></div>
                <div class="info-value"><?php echo htmlspecialchars($tagsText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label"><?php echo t_h('info.labels.favorite', [], 'Favorite:'); ?></div>
                <div class="info-value">
                    <?php if ($isFavorite): ?>
                        <span class="favorite-yes"></i> <?php echo t_h('common.yes', [], 'Yes'); ?></span>
                    <?php else: ?>
                        <span class="favorite-no"></i> <?php echo t_h('common.no', [], 'No'); ?></span>
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
    <script>
        <?php if (isset($_GET['edit_subheading']) && $_GET['edit_subheading'] == '1'): ?>
            document.addEventListener('DOMContentLoaded', function() {
                try { editSubheadingInline(<?php echo json_encode($note['subheading'] ?? ($note['location'] ?? ''), JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>); } catch(e) { console.error(e); }
            });
        <?php endif; ?>
        function editSubheadingInline(currentSub) {
            // Masquer le texte (le bouton d'édition a été retiré)
            document.getElementById('subheading-display').style.display = 'none';
            var editBtnEl = document.getElementById('edit-subheading-btn');
            if (editBtnEl) editBtnEl.style.display = 'none';
            
            // Afficher l'input et les boutons
            const input = document.getElementById('subheading-input');
            const buttons = document.getElementById('subheading-buttons');
            
            input.style.display = 'inline-block';
            input.value = currentSub || '';
            input.focus();
            input.select();
            
            buttons.style.display = 'inline-block';
        }
        
        function saveSubheading(noteId) {
            const input = document.getElementById('subheading-input');
            const newSub = input.value.trim();
            
            // Envoyer la requête de mise à jour
            fetch('api_update_subheading.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'note_id=' + encodeURIComponent(noteId) + '&subheading=' + encodeURIComponent(newSub)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Mettre à jour l'affichage et quitter le mode édition
                    document.getElementById('subheading-display').textContent = newSub || (window.t ? window.t('common.not_specified', null, 'Not specified') : 'Not specified');
                    cancelSubheadingEdit();
                    // Success: no popup shown per user request
                } else {
                    showNotificationPopup(
                        (window.t
                            ? window.t('info.errors.failed_to_update_subheading_prefix', { error: (data.message || 'Unknown error') }, 'Failed to update heading: {{error}}')
                            : ('Failed to update heading: ' + (data.message || 'Unknown error'))),
                        'error'
                    );
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotificationPopup(
                    (window.t
                        ? window.t('info.errors.network_error_updating_subheading', null, 'Network error while updating heading')
                        : 'Network error while updating heading'),
                    'error'
                );
            });
        }
        
        function cancelSubheadingEdit() {
            // Masquer l'input et les boutons
            document.getElementById('subheading-input').style.display = 'none';
            document.getElementById('subheading-buttons').style.display = 'none';
            
            // Afficher le texte (le bouton d'édition a été retiré)
            document.getElementById('subheading-display').style.display = 'inline';
            var editBtnEl2 = document.getElementById('edit-subheading-btn');
            if (editBtnEl2) editBtnEl2.style.display = 'inline-block';
        }
        
        // Gérer la touche Enter pour sauvegarder
        document.getElementById('subheading-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const noteId = <?php echo $note_id; ?>;
                saveSubheading(noteId);
            } else if (e.key === 'Escape') {
                cancelSubheadingEdit();
            }
        });
    </script>
    
    <script>
    function goBackToNote() {
        // Build return URL with workspace from localStorage and note parameter
        var url = 'index.php';
        var params = [];
        
        // Add note parameter
        params.push('note=<?php echo $note_id; ?>');
        
        // Get workspace from localStorage first, fallback to PHP value
        try {
            var workspace = localStorage.getItem('poznote_selected_workspace');
            if (!workspace || workspace === '') {
                workspace = '<?php echo htmlspecialchars($workspace ?? '', ENT_QUOTES); ?>';
            }
            if (workspace && workspace !== '') {
                params.push('workspace=' + encodeURIComponent(workspace));
            }
        } catch(e) {
            // Fallback to PHP workspace if localStorage fails
            var workspace = '<?php echo htmlspecialchars($workspace ?? '', ENT_QUOTES); ?>';
            if (workspace && workspace !== '') {
                params.push('workspace=' + encodeURIComponent(workspace));
            }
        }
        
        // Build final URL
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        window.location.href = url;
    }
    </script>
</body>
</html>
