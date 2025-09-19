<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include_once 'functions.php';

// Get note ID from URL parameter
// Preserve optional workspace parameter
$note_id = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get the note metadata
try {
    if ($workspace) {
        $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
        $stmt->execute([$note_id]);
    }
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

$summary = '';
$error_message = '';
$is_generating = false;

// Don't generate automatically on page load, we'll do it via AJAX
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Summary - <?php echo htmlspecialchars($note_title); ?></title>
    <link href="css/index.css" rel="stylesheet">
    <link href="css/modal.css" rel="stylesheet">
    <link rel="stylesheet" href="css/images.css">
    <link rel="stylesheet" href="css/ai.css">
</head>
<body class="ai-page">
    <div class="summary-page">
        <div class="summary-header">
            <h1>AI Summary</h1>
            <br>
            <p style="color: #6c757d; margin: 10px 0 0 0; font-size: 14px;">Note: <?php echo htmlspecialchars($note_title); ?></p>
        </div>        
        <div class="summary-content" id="summaryContent">
            <div id="loadingState" class="loading-state" style="display: none;">
                <i class="fa-robot-svg"></i>
                Generating summary...
            </div>
            <div id="summaryText" style="display: none;"></div>
            <div id="errorState" class="error-state" style="display: none;">
                <i class="fas fa-exclamation-triangle"></i>
                <span id="errorMessage"></span>
            </div>
            <div id="initialState" style="text-align: center; color: #6c757d; font-style: italic;">
                Click "Generate Summary" below to create an intelligent summary of your note.
            </div>
        </div>
        
        <div class="action-buttons">
            <button onclick="generateSummary()" class="btn btn-primary" id="generateBtn">
                Generate Summary
            </button>
            
            <button onclick="copyToClipboard()" class="btn btn-success" id="copyBtn" style="display: none;">
                Copy
            </button>
            
            <button onclick="generateSummary()" class="btn btn-primary" id="regenerateBtn" style="display: none;">
                Regenerate
            </button>
            
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
                Back to Notes
            </a>
        </div>
    </div>
    
    <script>
        // Set the note ID as global variable for use by the external JavaScript
        var noteId = <?php echo json_encode($note_id); ?>;
        var noteWorkspace = <?php echo $workspace ? json_encode($workspace) : 'undefined'; ?>;
    </script>
    <script src="js/ai-summary.js"></script>
    <script>
    (function(){ try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored && stored !== 'Poznote') {
            var a = document.getElementById('backToNotesLink'); if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
        }
    } catch(e){} })();
    </script>
</body>
</html>
