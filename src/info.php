<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
require_once 'default_folder_settings.php';

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
        $stmt = $con->prepare("SELECT heading, folder, created, updated, favorite, tags, attachments, location, subheading FROM entries WHERE id = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading, folder, created, updated, favorite, tags, attachments, location, subheading FROM entries WHERE id = ? AND trash = 0");
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

$title = $note['heading'] ?: 'Untitled Note';

// Format dates
function formatDate($dateStr) {
    if (empty($dateStr)) return 'Not available';
    try {
        $date = new DateTime($dateStr);
        return $date->format('d/m/Y H:i');
    } catch (Exception $e) {
        return 'Not available';
    }
}

$createdText = formatDate($note['created']);
$updatedText = formatDate($note['updated']);
$folderText = $note['folder'] ?: getDefaultFolderForNewNotes($workspace);
$isFavorite = (int)$note['favorite'] === 1;

// Build full path of the note
$fullPath = "./data/entries/{$note_id}.html";

// Process tags
$tags = [];
if (!empty($note['tags'])) {
    $tags = array_filter(array_map('trim', explode(',', $note['tags'])));
}
$tagsText = empty($tags) ? 'No tags' : implode(', ', $tags);

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

$subheadingText = $note['subheading'] ?: ($note['location'] ?: 'Not specified');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Note Information - <?php echo htmlspecialchars($title); ?></title>
    <link rel="stylesheet" href="css/info.css">
</head>
<body>
    <div class="info-page">
        <div class="info-buttons-back-container">
            <button class="btn btn-secondary" onclick="window.location = 'index.php<?php echo $workspace ? '?workspace=' . urlencode($workspace) : ''; ?>';" title="Back to notes">
                Back to notes
            </button>
        </div>
        
        <div class="info-content">
            <div class="info-row">
                <div class="info-label">Note title:</div>
                <div class="info-value"><?php echo htmlspecialchars($title); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Workspace:</div>
                <div class="info-value"><?php echo htmlspecialchars($note['workspace'] ?? ($workspace ?: 'Poznote')); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Folder:</div>
                <div class="info-value"><?php echo htmlspecialchars($folderText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Created:</div>
                <div class="info-value"><?php echo htmlspecialchars($createdText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Last Modified:</div>
                <div class="info-value"><?php echo htmlspecialchars($updatedText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Subheading:</div>
                <div class="info-value">
                    <span id="subheading-display" style="cursor:pointer;" role="button" tabindex="0" onclick='editSubheadingInline(<?php echo json_encode($note['subheading'] ?? ($note['location'] ?? ''), JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>);'><?php echo htmlspecialchars($subheadingText); ?></span>
                    <input type="text" id="subheading-input" style="display: none;" />
                    <div id="subheading-buttons" style="display: none; margin-left: 10px;">
                        <button type="button" class="btn-save" onclick="saveSubheading(<?php echo $note_id; ?>)">Save</button>
                        <button type="button" class="btn-cancel" onclick="cancelSubheadingEdit()">Cancel</button>
                    </div>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label">Tags:</div>
                <div class="info-value"><?php echo htmlspecialchars($tagsText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Favorite:</div>
                <div class="info-value">
                    <?php if ($isFavorite): ?>
                        <span class="favorite-yes"></i> Yes</span>
                    <?php else: ?>
                        <span class="favorite-no"></i> No</span>
                    <?php endif; ?>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label">Attachments:</div>
                <div class="info-value"><?php echo $attachmentsCount; ?> file(s)</div>
            </div>

            <div class="info-row">
                <div class="info-label">Note ID:</div>
                <div class="info-value"><?php echo htmlspecialchars($note_id); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Full Path:</div>
                <div class="info-value"><?php echo htmlspecialchars($fullPath); ?></div>
            </div>
        </div>
    </div>

    <script src="js/ui.js"></script>
    <script>
        // If requested via query param, auto-open subheading edit
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
                    document.getElementById('subheading-display').textContent = newSub || 'Not specified';
                    cancelSubheadingEdit();
                    // Success: no popup shown per user request
                } else {
                    showNotificationPopup('Failed to update heading: ' + (data.message || 'Unknown error'), 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotificationPopup('Network error while updating heading', 'error');
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
</body>
</html>
