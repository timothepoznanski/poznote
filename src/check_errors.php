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

$error_check = '';
$error_message = '';
$is_generating = false;

// Don't generate automatically on page load, we'll do it via AJAX
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Verification - <?php echo htmlspecialchars($note_title); ?></title>
    <link href="css/index.css" rel="stylesheet">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/ai.css">
</head>
<body class="ai-page">
    <div class="summary-page">
        <div class="summary-header">
            <h1>Content Verification</h1>
            <br>
            <p style="color: #6c757d; margin: 10px 0 0 0; font-size: 14px;"><?php echo htmlspecialchars($note_title); ?></p>
        </div>        
        <div class="summary-content" id="summaryContent">
            <div id="loadingState" class="loading-state" style="display: none;">
                <i class="fas fa-robot"></i>
                Checking content accuracy and coherence...
            </div>
            <div id="summaryText" style="display: none;"></div>
            <div id="errorState" class="error-state" style="display: none;">
                <i class="fas fa-exclamation-triangle"></i>
                <span id="errorMessage"></span>
            </div>
            <div id="initialState" style="text-align: center; color: #6c757d; font-style: italic;">
                Click "Check Content" below to start verifying the accuracy and coherence of your note.
            </div>
        </div>
        
        <div class="action-buttons">
            <button onclick="checkErrors()" class="btn btn-primary" id="generateBtn">
                <i class="fas fa-search"></i> Check Content
            </button>
            
            <button onclick="copyToClipboard()" class="btn btn-success" id="copyBtn" style="display: none;">
                <i class="fas fa-copy"></i> Copy
            </button>
            
            <button onclick="checkErrors()" class="btn btn-primary" id="regenerateBtn" style="display: none;">
                <i class="fas fa-redo"></i> Re-check
            </button>
            
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
        </div>
    </div>
    
    <script>
        const noteId = <?php echo json_encode($note_id); ?>;
        
        // Auto-generate error check if requested via URL parameter
        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            // Disabled auto-generation: if (urlParams.get('check') === '1') {
            //     checkErrors();
            // }
        });
        
        async function checkErrors() {
            const loadingState = document.getElementById('loadingState');
            const summaryText = document.getElementById('summaryText');
            const errorState = document.getElementById('errorState');
            const initialState = document.getElementById('initialState');
            const generateBtn = document.getElementById('generateBtn');
            const copyBtn = document.getElementById('copyBtn');
            const regenerateBtn = document.getElementById('regenerateBtn');
            
            // Show loading state
            loadingState.style.display = 'block';
            summaryText.style.display = 'none';
            errorState.style.display = 'none';
            initialState.style.display = 'none';
            generateBtn.style.display = 'none';
            
            try {
                const response = await fetch('api_check_errors.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        note_id: noteId
                    })
                });
                
                const data = await response.json();
                
                // Hide loading
                loadingState.style.display = 'none';
                
                if (response.ok && data.success) {
                    // Show the error check result with preserved line breaks
                    summaryText.innerHTML = data.error_check.replace(/\n/g, '<br>');
                    summaryText.style.display = 'block';
                    copyBtn.style.display = 'inline-flex';
                    regenerateBtn.style.display = 'inline-flex';
                } else {
                    // Show the error
                    const errorMessage = document.getElementById('errorMessage');
                    errorMessage.textContent = data.error || 'An error occurred while checking for errors';
                    errorState.style.display = 'block';
                    generateBtn.style.display = 'inline-flex';
                }
                
            } catch (error) {
                console.error('Error checking for errors:', error);
                
                // Hide loading
                loadingState.style.display = 'none';
                
                // Show error
                const errorMessage = document.getElementById('errorMessage');
                errorMessage.textContent = 'Connection error. Please try again.';
                errorState.style.display = 'block';
                generateBtn.style.display = 'inline-flex';
            }
        }
        
        async function copyToClipboard() {
            const summaryText = document.getElementById('summaryText');
            const copyBtn = document.getElementById('copyBtn');
            
            if (!summaryText || !copyBtn) return;
            
            try {
                // Get the text content without HTML tags for copying
                const textToCopy = summaryText.innerText || summaryText.textContent;
                await navigator.clipboard.writeText(textToCopy);
                
                // Visual feedback
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.classList.add('copy-feedback');
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.classList.remove('copy-feedback');
                }, 2000);
                
            } catch (err) {
                console.error('Failed to copy text: ', err);
                
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = summaryText.innerText || summaryText.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    copyBtn.classList.add('copy-feedback');
                    
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                        copyBtn.classList.remove('copy-feedback');
                    }, 2000);
                    
                } catch (fallbackErr) {
                    console.error('Fallback copy failed: ', fallbackErr);
                }
                
                document.body.removeChild(textArea);
            }
        }
    </script>
</body>
</html>
