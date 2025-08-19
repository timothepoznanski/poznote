<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Get note ID from URL parameter
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get note details from database
try {
    $stmt = $con->prepare("SELECT heading, folder, created, updated, favorite, tags, attachments FROM entries WHERE id = ? AND trash = 0");
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        header('Location: index.php');
        exit;
    }
} catch (PDOException $e) {
    header('Location: index.php');
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
$folderText = $note['folder'] ?: 'Uncategorized';
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
        
        .info-header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .info-header h1 {
            color: #007DB8;
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        
        .info-subtitle {
            color: #6c757d;
            margin-top: 10px;
            font-size: 16px;
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
            padding: 20px 30px;
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
        }
        
        .info-value {
            flex: 1;
            color: #212529;
        }
        
        .favorite-yes {
            color: #ffc107;
            font-weight: 600;
        }
        
        .favorite-no {
            color: #6c757d;
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
        
        .btn-secondary:hover {
            background: #5a6268;
            color: white;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="info-page">
        <div class="info-header">
            <h1>Note Information</h1>
            <div class="info-subtitle"><?php echo htmlspecialchars($title); ?></div>
        </div>
        
        <div class="info-content">
            <div class="info-row">
                <div class="info-label">Note ID:</div>
                <div class="info-value"><?php echo htmlspecialchars($note_id); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Folder:</div>
                <div class="info-value"><?php echo htmlspecialchars($folderText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Full Path:</div>
                <div class="info-value"><?php echo htmlspecialchars($fullPath); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Favorite:</div>
                <div class="info-value <?php echo $isFavorite ? 'favorite-yes' : 'favorite-no'; ?>">
                    <?php echo $isFavorite ? 'Yes ⭐' : 'No'; ?>
                </div>
            </div>

            <div class="info-row">
                <div class="info-label">Attachments:</div>
                <div class="info-value"><?php echo $attachmentsCount; ?> file(s)</div>
            </div>

            <div class="info-row">
                <div class="info-label">Tags:</div>
                <div class="info-value"><?php echo htmlspecialchars($tagsText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Created:</div>
                <div class="info-value"><?php echo htmlspecialchars($createdText); ?></div>
            </div>

            <div class="info-row">
                <div class="info-label">Last Modified:</div>
                <div class="info-value"><?php echo htmlspecialchars($updatedText); ?></div>
            </div>
        </div>

        <div class="action-buttons">
            <a href="index.php" class="btn btn-secondary">Close</a>
        </div>
    </div>
</body>
</html>
