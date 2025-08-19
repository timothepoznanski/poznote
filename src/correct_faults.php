<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Get note ID from URL
$note_id = $_GET['note_id'] ?? null;
$auto_generate = $_GET['generate'] ?? false;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get note details
try {
    $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
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

$title = $note['heading'] ?: 'Untitled';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Correct Faults - <?php echo htmlspecialchars($title); ?></title>
    <link rel="stylesheet" href="css/font-awesome.css">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        
        .correct-page {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .note-title {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            text-align: center;
            border-left: 4px solid #007DB8;
        }
        
        .note-title h2 {
            color: #333;
            margin: 0;
            font-size: 20px;
            font-weight: 500;
        }
        
        .correct-content {
            background: white;
            padding: 30px;
            border-radius: 4px;
            margin-bottom: 30px;
            min-height: 200px;
            line-height: 1.6;
            font-size: 16px;
            border: 1px solid #ddd;
            white-space: pre-wrap;
            word-wrap: break-word;
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
        
        .button-container {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .btn {
            background: #007DB8;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 0 10px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        
        .btn:hover {
            background: #005a8b;
        }
        
        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        
        .btn-secondary {
            background: #6c757d;
        }
        
        .btn-secondary:hover {
            background: #545b62;
        }
        
        .btn-warning {
            background: #ffc107;
            color: #212529;
        }
        
        .btn-warning:hover {
            background: #e0a800;
        }
        
        .btn-success {
            background: #28a745;
        }
        
        .btn-success:hover {
            background: #218838;
        }
        
        .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #f5c6cb;
            margin: 20px 0;
            display: none;
        }
        
        .error-message.show {
            display: block;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .correct-header h1 {
                font-size: 24px;
            }
            
            .correct-content {
                padding: 20px;
                font-size: 14px;
            }
            
            .btn {
                margin: 5px;
                padding: 10px 20px;
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="correct-page">
        <div class="note-title">
            <h2><?php echo htmlspecialchars($title); ?></h2>
        </div>

        <div class="correct-content" id="correctedContent">
            <?php if ($auto_generate): ?>
                <div class="loading-state">
                    Correcting grammar and spelling faults...
                </div>
            <?php else: ?>
                Click "Correct Faults" to analyze and fix grammar, spelling, and syntax errors in your note.
            <?php endif; ?>
        </div>

        <div class="button-container">
            <button onclick="generateCorrection()" class="btn" id="generateBtn" <?php echo $auto_generate ? 'disabled' : ''; ?>>
                <i class="fas fa-spell-check"></i> Regenerate
            </button>
            <button onclick="copyToClipboard()" class="btn btn-secondary" id="copyBtn" style="display: none;">
                <i class="fas fa-copy"></i> Copy
            </button>
            <button onclick="applyToNote()" class="btn btn-warning" id="applyBtn" style="display: none;">
                <i class="fas fa-check"></i> Apply to note
            </button>
            <a href="index.php" class="btn btn-success">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
        </div>

        <div class="error-message" id="errorMessage"></div>
    </div>

    <script>
        const noteId = <?php echo json_encode($note_id); ?>;
        const autoGenerate = <?php echo json_encode($auto_generate); ?>;
        let correctedContentText = '';

        document.addEventListener('DOMContentLoaded', function() {
            if (autoGenerate) {
                generateCorrection();
            }
        });

        async function generateCorrection() {
            const correctedContent = document.getElementById('correctedContent');
            const errorMessage = document.getElementById('errorMessage');
            const generateBtn = document.getElementById('generateBtn');
            const copyBtn = document.getElementById('copyBtn');
            const applyBtn = document.getElementById('applyBtn');
            
            // Show loading state
            correctedContent.innerHTML = '<div class="loading-state">Correcting grammar and spelling faults...</div>';
            errorMessage.classList.remove('show');
            generateBtn.disabled = true;
            copyBtn.style.display = 'none';
            applyBtn.style.display = 'none';
            
            try {
                const response = await fetch('api_correct_faults.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        note_id: noteId
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    correctedContentText = data.corrected_content;
                    correctedContent.textContent = correctedContentText;
                    
                    // Show action buttons
                    copyBtn.style.display = 'inline-flex';
                    applyBtn.style.display = 'inline-flex';
                    
                } else {
                    throw new Error(data.error || 'Failed to correct faults');
                }
                
            } catch (error) {
                console.error('Error correcting faults:', error);
                correctedContent.innerHTML = 'Click "Correct Faults" to analyze and fix grammar, spelling, and syntax errors in your note.';
                errorMessage.textContent = 'Error: ' + error.message;
                errorMessage.classList.add('show');
            } finally {
                generateBtn.disabled = false;
            }
        }

        function copyToClipboard() {
            if (!correctedContentText) return;
            
            const textArea = document.createElement('textarea');
            textArea.value = correctedContentText;
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                
                const copyBtn = document.getElementById('copyBtn');
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = 'Copied!';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            } finally {
                document.body.removeChild(textArea);
            }
        }

        async function applyToNote() {
            const applyBtn = document.getElementById('applyBtn');
            
            if (!applyBtn || !correctedContentText) return;
            
            try {
                applyBtn.disabled = true;
                applyBtn.innerHTML = '<span>Applying...</span>';
                
                const response = await fetch('api_apply_correct_faults.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        note_id: noteId,
                        corrected_content: correctedContentText
                    })
                });
                
                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);
                
                const responseText = await response.text();
                console.log('Response text:', responseText);
                
                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    throw new Error('Invalid response format: ' + responseText);
                }
                
                if (data.success) {
                    // Close the window immediately
                    window.location.href = 'index.php';
                } else {
                    alert('Error applying corrections: ' + (data.error || 'Unknown error'));
                }
                
            } catch (error) {
                console.error('Error applying corrections:', error);
                alert('Connection error: ' + error.message);
            } finally {
                applyBtn.disabled = false;
                applyBtn.innerHTML = 'Apply';
            }
        }
    </script>
</body>
</html>
