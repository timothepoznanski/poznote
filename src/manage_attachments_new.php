<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Get note ID from URL
$note_id = isset($_GET['note_id']) ? (int)$_GET['note_id'] : 0;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get note details
$stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
$stmt->execute([$note_id]);
$note = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$note) {
    header('Location: index.php');
    exit;
}

?>
<!DOCTYPE html>
<html>
<head>
    <title>Manage Attachments - <?php echo htmlspecialchars($note['heading']); ?> - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="css/attachments.css">
</head>
<body>
    <div class="settings-container">
        <h1><i class="fas fa-paperclip"></i> Manage Attachments</h1>
        <p>Manage attachments for note: <strong><?php echo htmlspecialchars($note['heading']); ?></strong></p>
        
        <a href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
        </a>

        <br><br>

        <!-- Upload Section -->
        <div class="settings-section">
            <h3><i class="fas fa-upload"></i> Upload New Attachment</h3>
            
            <div class="attachment-upload-section">
                <div class="form-group">
                    <label for="attachmentFile">Choose File</label>
                    <input type="file" id="attachmentFile" class="file-input" onchange="showFileName()">
                    <div class="accepted-types">
                        Accepted: pdf, doc, docx, txt, jpg, jpeg, png, gif, zip, rar (max 200MB)
                    </div>
                    <div class="selected-filename" id="selectedFileName"></div>
                </div>
                
                <button type="button" onclick="uploadAttachment()" class="btn btn-primary" id="uploadBtn" disabled>
                    <i class="fas fa-upload"></i> Upload File
                </button>
            </div>
            
            <div id="uploadProgress" class="upload-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText">Uploading...</div>
            </div>
        </div>

        <!-- Attachments List Section -->
        <div class="settings-section">
            <h3><i class="fas fa-list"></i> Current Attachments</h3>
            <div id="attachmentsList" class="attachments-display">
                <div class="loading-attachments">
                    <i class="fas fa-spinner fa-spin"></i> Loading attachments...
                </div>
            </div>
        </div>
        
        <!-- Help Section -->
        <div class="warning">
            <p><i class="fas fa-info-circle"></i> Attachments are stored securely and can be downloaded or deleted at any time.</p>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <script>
        const noteId = <?php echo $note_id; ?>;
        let uploadInProgress = false;

        // Load attachments when page loads
        document.addEventListener('DOMContentLoaded', function() {
            loadAttachments();
        });

        function showFileName() {
            const fileInput = document.getElementById('attachmentFile');
            const fileNameDiv = document.getElementById('selectedFileName');
            const uploadBtn = document.getElementById('uploadBtn');
            
            if (fileInput.files.length > 0) {
                const fileName = fileInput.files[0].name;
                const fileSize = formatFileSize(fileInput.files[0].size);
                fileNameDiv.innerHTML = `<i class="fas fa-file"></i> ${fileName} (${fileSize})`;
                fileNameDiv.style.display = 'block';
                uploadBtn.disabled = false;
            } else {
                fileNameDiv.style.display = 'none';
                uploadBtn.disabled = true;
            }
        }

        function uploadAttachment() {
            if (uploadInProgress) return;
            
            const fileInput = document.getElementById('attachmentFile');
            const progressDiv = document.getElementById('uploadProgress');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            
            if (!fileInput.files.length) {
                showNotification('Please select a file', 'error');
                return;
            }

            const file = fileInput.files[0];
            const maxSize = 200 * 1024 * 1024; // 200MB
            
            if (file.size > maxSize) {
                showNotification('File too large. Maximum size is 200MB.', 'error');
                return;
            }

            uploadInProgress = true;
            progressDiv.style.display = 'block';
            document.getElementById('uploadBtn').disabled = true;

            const formData = new FormData();
            formData.append('action', 'upload');
            formData.append('note_id', noteId);
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', function(e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressText.textContent = `Uploading... ${percent}%`;
                }
            });

            xhr.addEventListener('load', function() {
                uploadInProgress = false;
                progressDiv.style.display = 'none';
                
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        showNotification('File uploaded successfully!', 'success');
                        fileInput.value = '';
                        document.getElementById('selectedFileName').style.display = 'none';
                        document.getElementById('uploadBtn').disabled = true;
                        loadAttachments(); // Reload the list
                    } else {
                        showNotification('Upload failed: ' + response.message, 'error');
                        document.getElementById('uploadBtn').disabled = false;
                    }
                } catch (e) {
                    showNotification('Upload failed. Please try again.', 'error');
                    document.getElementById('uploadBtn').disabled = false;
                }
            });

            xhr.addEventListener('error', function() {
                uploadInProgress = false;
                progressDiv.style.display = 'none';
                showNotification('Upload failed. Please check your connection.', 'error');
                document.getElementById('uploadBtn').disabled = false;
            });

            xhr.open('POST', 'api_attachments.php');
            xhr.send(formData);
        }

        function loadAttachments() {
            fetch(`api_attachments.php?action=list&note_id=${noteId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        displayAttachments(data.attachments);
                    } else {
                        document.getElementById('attachmentsList').innerHTML = 
                            '<div class="error-message">Failed to load attachments</div>';
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    document.getElementById('attachmentsList').innerHTML = 
                        '<div class="error-message">Error loading attachments</div>';
                });
        }

        function displayAttachments(attachments) {
            const container = document.getElementById('attachmentsList');
            
            if (attachments.length === 0) {
                container.innerHTML = '<div class="no-attachments"><i class="fas fa-info-circle"></i> No attachments yet</div>';
                return;
            }
            
            let html = '';
            attachments.forEach(attachment => {
                const fileSize = formatFileSize(attachment.file_size);
                const uploadDate = new Date(attachment.uploaded_at).toLocaleDateString();
                const fileName = attachment.original_filename;
                const shortName = fileName.length > 40 ? fileName.substring(0, 40) + '...' : fileName;
                
                html += `
                    <div class="attachment-card">
                        <div class="attachment-icon">
                            <i class="fas fa-file"></i>
                        </div>
                        <div class="attachment-details">
                            <div class="attachment-name" title="${fileName}">${shortName}</div>
                            <div class="attachment-meta">
                                <span class="attachment-size">${fileSize}</span>
                                <span class="attachment-date">Uploaded: ${uploadDate}</span>
                            </div>
                        </div>
                        <div class="attachment-actions">
                            <button onclick="downloadAttachment('${attachment.id}')" class="btn-icon btn-download" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button onclick="deleteAttachment('${attachment.id}')" class="btn-icon btn-delete" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }

        function downloadAttachment(attachmentId) {
            window.open(`api_attachments.php?action=download&note_id=${noteId}&attachment_id=${attachmentId}`, '_blank');
        }

        function deleteAttachment(attachmentId) {
            if (!confirm('Are you sure you want to delete this attachment?')) {
                return;
            }

            fetch('api_attachments.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `action=delete&note_id=${noteId}&attachment_id=${attachmentId}`
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Attachment deleted successfully', 'success');
                    loadAttachments(); // Reload the list
                } else {
                    showNotification('Failed to delete attachment: ' + data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification('Error deleting attachment', 'error');
            });
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function showNotification(message, type) {
            // Simple notification function
            const notification = document.createElement('div');
            notification.className = `alert alert-${type}`;
            notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
            
            const container = document.querySelector('.settings-container');
            container.insertBefore(notification, container.firstChild.nextSibling.nextSibling);
            
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }
    </script>
</body>
</html>
