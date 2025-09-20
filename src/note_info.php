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
    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        
        .info-page {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .info-content {
            background: white;
            border-radius: 4px;
            border: 1px solid #ddd;
            overflow: hidden;
        }
        
        .info-row {
            display: flex;
            align-items: center;
            padding: 15px 30px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .info-row:last-child {
            border-bottom: none;
        }
        
        .info-row:hover {
            background-color: #f8f9fa;
        }
        
        .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 140px;
            margin-right: 20px;
        }
        
        .info-value {
            flex: 1;
            color: #212529;
            display: flex;
            align-items: center;
        }
        
        .favorite-yes {
            color: #ffc107;
            font-weight: 600;
        }
        
        .favorite-no {
            /* Use the same color as regular info values to match surrounding text */
            color: inherit;
            font-weight: 400;
        }
        
        .action-buttons {
            text-align: center;
            margin-top: 30px;
        }
        
        .btn {
            padding: 12px 25px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            font-weight: 500;
            margin: 0 10px;
        }
        
        .btn-primary {
            background: #007DB8;
            color: white;
        }
        
        .btn-primary:hover {
            background: #005a8a;
            text-decoration: none;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        #subheading-input {
            width: 350px;
            max-width: 100%;
            padding: 7px 12px;
            border: 1px solid #ced4da;
            border-radius: 5px;
            font-size: 15px;
            margin-right: 12px;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        
        #subheading-input:focus {
            border-color: #007db8;
            outline: none;
        }
        
        #subheading-buttons {
            display: flex;
            gap: 8px;
        }

        /* Responsive adjustments for mobile: stack label/value and make inputs full-width */
        @media (max-width: 640px) {
            .info-row {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                padding: 12px 16px;
            }
            .info-label {
                min-width: auto;
                margin-bottom: 8px;
            }
            .info-value {
                width: 100%;
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
            }
            #subheading-input {
                width: 100% !important;
                margin-right: 0;
                display: block;
            }
            #subheading-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 6px;
            }
            .btn-save, .btn-cancel { padding: 8px 14px; }
            #edit-subheading-btn { margin-left: 0; }
        }
        
        .btn-save {
            background: linear-gradient(90deg, #28a745 100%);
            color: white;
            border: none;
            padding: 6px 18px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        }
        
        .btn-save:hover {
            background: linear-gradient(90deg, #218838 100%);
        }
        
        .btn-cancel {
            background: linear-gradient(90deg, #6c757d 100%);
            color: white;
            border: none;
            padding: 6px 18px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        }
        
        .btn-cancel:hover {
            background: linear-gradient(90deg, #5a6268 100%);
        }
        
        .btn-edit {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            margin-left: 10px;
            padding: 2px 8px;
            border-radius: 3px;
            opacity: 0.7;
            transition: background 0.2s, opacity 0.2s;
        }
        
        .btn-edit:hover {
            opacity: 1;
            background-color: #e9ecef;
        }
        /* Make subheading appear clickable (blue) but not underlined */
        #subheading-display {
            color: #007DB8;
            font-weight: 600;
        }
        #subheading-display:hover, #subheading-display:focus {
            color: #005a8a;
            outline: none;
        }
    </style>
</head>
<body>
    <div class="info-page">
        
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
                        <span class="favorite-yes"><i class="fa-star"></i> Yes</span>
                    <?php else: ?>
                        <span class="favorite-no"><i class="fa-star"></i> No</span>
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

        <div class="action-buttons">
            <?php $close_href = 'index.php' . ($workspace ? '?workspace=' . urlencode($workspace) : ''); ?>
            <a href="<?php echo $close_href; ?>" class="btn btn-secondary">Close</a>
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
