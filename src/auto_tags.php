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
            <p style="color: #666; font-size: 14px; margin-top: 10px;">Automatically generate relevant tags based on your note's content using AI analysis.</p>
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
        const noteId = <?php echo json_encode($note_id); ?>;
        let generatedTags = [];
        
        async function generateTags() {
            const loadingState = document.getElementById('loadingState');
            const tagsDisplay = document.getElementById('tagsDisplay');
            const errorState = document.getElementById('errorState');
            const initialState = document.getElementById('initialState');
            const generateBtn = document.getElementById('generateBtn');
            const copyBtn = document.getElementById('copyBtn');
            const applyBtn = document.getElementById('applyBtn');
            const regenerateBtn = document.getElementById('regenerateBtn');
            
            // Show loading state
            loadingState.style.display = 'block';
            tagsDisplay.style.display = 'none';
            errorState.style.display = 'none';
            initialState.style.display = 'none';
            generateBtn.style.display = 'none';
            
            try {
                const response = await fetch('api_auto_tags.php', {
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
                    // Store and display the tags
                    generatedTags = data.tags;
                    displayTags(generatedTags);
                    tagsDisplay.style.display = 'block';
                    copyBtn.style.display = 'inline-flex';
                    applyBtn.style.display = 'inline-flex';
                    regenerateBtn.style.display = 'inline-flex';
                } else {
                    // Show the error
                    const errorMessage = document.getElementById('errorMessage');
                    errorMessage.textContent = data.error || 'An error occurred while generating tags';
                    errorState.style.display = 'block';
                    generateBtn.style.display = 'inline-flex';
                }
                
            } catch (error) {
                console.error('Error generating tags:', error);
                
                // Hide loading
                loadingState.style.display = 'none';
                
                // Show error
                const errorMessage = document.getElementById('errorMessage');
                errorMessage.textContent = 'Connection error. Please try again.';
                errorState.style.display = 'block';
                generateBtn.style.display = 'inline-flex';
            }
        }
        
        function displayTags(tags) {
            const tagsContainer = document.getElementById('tagsContainer');
            tagsContainer.innerHTML = '';
            
            tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag-item';
                tagElement.textContent = tag;
                tagsContainer.appendChild(tagElement);
            });
        }
        
        async function copyTags() {
            const copyBtn = document.getElementById('copyBtn');
            
            if (!copyBtn || !generatedTags.length) return;
            
            const tagsText = generatedTags.join(', ');
            
            try {
                await navigator.clipboard.writeText(tagsText);
                
                // Visual feedback
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.classList.add('copy-feedback');
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.classList.remove('copy-feedback');
                }, 2000);
                
            } catch (err) {
                console.error('Failed to copy tags: ', err);
                
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = tagsText;
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
        
        async function applyTags() {
            const applyBtn = document.getElementById('applyBtn');
            
            if (!applyBtn || !generatedTags.length) return;
            
            try {
                const response = await fetch('api_apply_tags.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        note_id: noteId,
                        tags: generatedTags
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    // Close the window immediately
                    window.location.href = 'index.php';
                } else {
                    alert('Error applying tags: ' + (data.error || 'Unknown error'));
                }
                
            } catch (error) {
                console.error('Error applying tags:', error);
                alert('Connection error. Please try again.');
            }
        }
    </script>
</body>
</html>
