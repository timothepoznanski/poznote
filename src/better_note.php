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
    <title>Better Note - <?php echo htmlspecialchars($note_title); ?></title>
    <link href="css/index.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        
        .better-note-page {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .better-note-header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .better-note-header h1 {
            color: #007DB8;
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        
        .better-note-content {
            background: white;
            padding: 30px;
            border-radius: 4px;
            margin-bottom: 30px;
            min-height: 150px;
            line-height: 1.6;
            font-size: 16px;
            border: 1px solid #ddd;
        }
        
        .loading-state {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            font-size: 18px;
        }
        
        .loading-state i {
            animation: spin 1s linear infinite;
            margin-right: 10px;
            font-size: 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .error-state {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            padding: 20px;
            border-radius: 4px;
            text-align: center;
        }
        
        .error-state i {
            margin-right: 10px;
        }
        
        .action-buttons {
            text-align: center;
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 12px 25px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            text-decoration: none;
            font-weight: 500;
        }
        
        .btn-primary {
            background: #007DB8;
            color: white;
        }
        
        .btn-primary:hover {
            background: #005a8a;
        }
        
        .btn-success {
            background: #28a745;
            color: white;
        }
        
        .btn-success:hover {
            background: #218838;
        }
        
        .btn-warning {
            background: #ffc107;
            color: #212529;
        }
        
        .btn-warning:hover {
            background: #e0a800;
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
        
        .copy-feedback {
            background: #28a745 !important;
        }
        
        .apply-feedback {
            background: #ffc107 !important;
        }
        
        @media (max-width: 600px) {
            body {
                padding: 15px;
            }
            
            .better-note-header h1 {
                font-size: 24px;
            }
            
            .better-note-content {
                padding: 20px;
            }
            
            .action-buttons {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 200px;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="better-note-page">
        <div class="better-note-content" id="betterNoteContent">
            <div id="loadingState" class="loading-state" style="display: none;">
                <i class="fas fa-magic"></i>
                Improving your note...
            </div>
            <div id="improvedText" style="display: none;"></div>
            <div id="errorState" class="error-state" style="display: none;">
                <i class="fas fa-exclamation-triangle"></i>
                <span id="errorMessage"></span>
            </div>
            <div id="initialState" style="text-align: center; color: #6c757d; font-style: italic;">
                Click "Improve Note" to enhance the content and structure of this note.
            </div>
        </div>
        
        <div class="action-buttons">
            <button onclick="generateBetterNote()" class="btn btn-primary" id="generateBtn">
                <i class="fas fa-magic"></i> Improve Note
            </button>
            
            <button onclick="copyToClipboard()" class="btn btn-success" id="copyBtn" style="display: none;">
                <i class="fas fa-copy"></i> Copy
            </button>
            
            <button onclick="applyToNote()" class="btn btn-warning" id="applyBtn" style="display: none;">
                <i class="fas fa-check"></i> Apply to Note
            </button>
            
            <button onclick="generateBetterNote()" class="btn btn-primary" id="regenerateBtn" style="display: none;">
                <i class="fas fa-redo"></i> Regenerate
            </button>
            
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-times"></i> Close
            </a>
        </div>
    </div>
    
    <script>
        const noteId = <?php echo json_encode($note_id); ?>;
        
        // Auto-generate better note if requested via URL parameter
        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('generate') === '1') {
                generateBetterNote();
            }
        });
        
        async function generateBetterNote() {
            const loadingState = document.getElementById('loadingState');
            const improvedText = document.getElementById('improvedText');
            const errorState = document.getElementById('errorState');
            const initialState = document.getElementById('initialState');
            const generateBtn = document.getElementById('generateBtn');
            const copyBtn = document.getElementById('copyBtn');
            const applyBtn = document.getElementById('applyBtn');
            const regenerateBtn = document.getElementById('regenerateBtn');
            
            // Show loading state
            loadingState.style.display = 'block';
            improvedText.style.display = 'none';
            errorState.style.display = 'none';
            initialState.style.display = 'none';
            generateBtn.style.display = 'none';
            
            try {
                const response = await fetch('api_better_note.php', {
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
                    // Store the original content with line breaks for later use
                    window.improvedContentText = data.improved_content;
                    
                    // Show the improved note with HTML formatting
                    improvedText.innerHTML = data.improved_content.replace(/\n/g, '<br>');
                    improvedText.style.display = 'block';
                    copyBtn.style.display = 'inline-flex';
                    applyBtn.style.display = 'inline-flex';
                    regenerateBtn.style.display = 'inline-flex';
                } else {
                    // Show the error
                    const errorMessage = document.getElementById('errorMessage');
                    errorMessage.textContent = data.error || 'An error occurred while improving the note';
                    errorState.style.display = 'block';
                    generateBtn.style.display = 'inline-flex';
                }
                
            } catch (error) {
                console.error('Error generating better note:', error);
                
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
            const copyBtn = document.getElementById('copyBtn');
            
            if (!copyBtn || !window.improvedContentText) return;
            
            try {
                await navigator.clipboard.writeText(window.improvedContentText);
                
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
                textArea.value = window.improvedContentText;
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
        
        async function applyToNote() {
            const applyBtn = document.getElementById('applyBtn');
            
            if (!applyBtn || !window.improvedContentText) return;
            
            try {
                const response = await fetch('api_apply_better_note.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        note_id: noteId,
                        improved_content: window.improvedContentText
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    // Close the window immediately
                    window.location.href = 'index.php';
                } else {
                    alert('Error applying changes: ' + (data.error || 'Unknown error'));
                }
                
            } catch (error) {
                console.error('Error applying better note:', error);
                alert('Connection error. Please try again.');
            }
        }
    </script>
</body>
</html>
