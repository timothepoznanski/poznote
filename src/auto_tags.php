<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include_once 'functions.php';

// Get note ID from URL parameter
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get the note metadata
try {
    $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        header('Location: index.php');
        exit;
    }
    
    $note_title = $note['heading'] ?: 'Untitled Note';
} catch (Exception $e) {
    header('Location: index.php');
    exit;
}

// Don't generate automatically on page load, we'll do it via AJAX
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Auto Generate Tags - <?php echo htmlspecialchars($note_title); ?></title>
    <link href="css/index.css" rel="stylesheet">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/ai.css">
</head>
<body class="ai-page">
    <div class="auto-tags-page">
        <div class="auto-tags-header">
            <h1>Auto Generate Tags</h1>
            <br>
            <p style="color: #6c757d; margin: 10px 0 0 0; font-size: 14px;">Note: <?php echo htmlspecialchars($note_title); ?></p>
        </div>

        <div class="auto-tags-content" id="autoTagsContent">
            <div id="loadingState" class="loading-state" style="display: none;">
                <i class="fas fa-tags"></i>
                Generating tags...
            </div>
            <div id="tagsDisplay" style="display: none;">
                <div id="tagsContainer" class="tags-display"></div>
            </div>
            <div id="errorState" class="error-state" style="display: none;">
                <i class="fas fa-exclamation-triangle"></i>
                <span id="errorMessage"></span>
            </div>
            <div id="initialState" style="text-align: center; color: #6c757d; font-style: italic;">
                Click "Generate Tags" to automatically create relevant tags for this note.
            </div>
        </div>
        
        <div class="action-buttons">
            <button onclick="generateTags()" class="btn btn-primary" id="generateBtn">
                <i class="fas fa-magic"></i> Generate Tags
            </button>
            
            <button onclick="copyTags()" class="btn btn-success" id="copyBtn" style="display: none;">
                <i class="fas fa-copy"></i> Copy
            </button>
            
            <button onclick="applyTags()" class="btn btn-warning" id="applyBtn" style="display: none;">
                <i class="fas fa-check"></i> Apply Tags
            </button>
            
            <button onclick="generateTags()" class="btn btn-primary" id="regenerateBtn" style="display: none;">
                <i class="fas fa-redo"></i> Regenerate
            </button>
            
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
        </div>
    </div>
    
    <script>
        // Set the note ID as global variable for use by the external JavaScript
        var noteId = <?php echo json_encode($note_id); ?>;
    </script>
    <script src="js/auto-tags.js"></script>
</body>
</html>
