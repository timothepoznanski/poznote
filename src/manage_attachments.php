<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Get note ID from URL
$note_id = isset($_GET['note_id']) ? (int)$_GET['note_id'] : 0;
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get note details
$query = "SELECT heading FROM entries WHERE id = ?";
if ($workspace) {
    $query = "SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
    $stmt = $con->prepare($query);
    $stmt->execute([$note_id, $workspace, $workspace]);
} else {
    $stmt = $con->prepare($query);
    $stmt->execute([$note_id]);
}
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
        
    <a href="index.php<?php echo $workspace ? '?workspace=' . urlencode($workspace) : ''; ?>" class="btn btn-secondary">
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
                
                <button type="button" onclick="uploadAttachment(event)" class="btn btn-primary" id="uploadBtn" disabled>
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
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <script>
    const noteId = <?php echo $note_id; ?>;
    const noteWorkspace = <?php echo $workspace ? json_encode($workspace) : 'undefined'; ?>;
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
                const file = fileInput.files[0];
                const fileName = file.name;
                const fileSize = formatFileSize(file.size);
                
                // Check if file is an image or PDF
                const isImage = file.type.startsWith('image/');
                const isPDF = file.type === 'application/pdf';
                
                let iconType = 'file';
                if (isImage) iconType = 'image';
                else if (isPDF) iconType = 'file-pdf';
                
                let htmlContent = `<div class="selected-file-info">
                    <i class="fas fa-${iconType}"></i> 
                    <span>${fileName} (${fileSize})</span>
                </div>`;
                
                if (isImage) {
                    // Create image preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        htmlContent += `<div class="image-preview">
                            <img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 150px; border-radius: 4px; margin-top: 10px;">
                        </div>`;
                        fileNameDiv.innerHTML = htmlContent;
                    };
                    reader.readAsDataURL(file);
                } else if (isPDF) {
                    // Create PDF preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        htmlContent += `<div class="pdf-preview">
                            <embed src="${e.target.result}" type="application/pdf" width="200" height="150" style="border-radius: 4px; margin-top: 10px;">
                            <p style="font-size: 12px; color: #666; margin-top: 5px;">Aperçu PDF</p>
                        </div>`;
                        fileNameDiv.innerHTML = htmlContent;
                    };
                    reader.readAsDataURL(file);
                } else {
                    fileNameDiv.innerHTML = htmlContent;
                }
                
                fileNameDiv.style.display = 'block';
                uploadBtn.disabled = false;
            } else {
                fileNameDiv.style.display = 'none';
                uploadBtn.disabled = true;
            }
        }

        function uploadAttachment(event) {
            if (uploadInProgress) {
                return;
            }
            
            // Prevent any default form submission or link following
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            
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
            // Include workspace if present on the page
            if (typeof noteWorkspace !== 'undefined' && noteWorkspace) {
                formData.append('workspace', noteWorkspace);
            }
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
            fetch(`api_attachments.php?action=list&note_id=${noteId}${typeof noteWorkspace !== 'undefined' && noteWorkspace ? '&workspace=' + encodeURIComponent(noteWorkspace) : ''}`)
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
                
                // Check if attachment is an image or PDF
                const isImage = attachment.file_type && attachment.file_type.startsWith('image/');
                const isPDF = attachment.file_type && attachment.file_type === 'application/pdf';
                const fileUrl = `api_attachments.php?action=download&note_id=${noteId}&attachment_id=${attachment.id}${typeof noteWorkspace !== 'undefined' && noteWorkspace ? '&workspace=' + encodeURIComponent(noteWorkspace) : ''}`;
                
                let previewContent = '';
                if (isImage) {
                    previewContent = `<img src="${fileUrl}" alt="Preview" class="attachment-thumbnail" onclick="previewImage('${fileUrl}', '${fileName}')">`;
                } else if (isPDF) {
                    previewContent = `<div class="pdf-thumbnail" onclick="previewPDF('${fileUrl}', '${fileName}')">
                        <iframe src="${fileUrl}" width="60" height="60" frameborder="0" style="pointer-events: none; transform: scale(0.8); transform-origin: top left;"></iframe>
                        <div class="pdf-overlay">
                            <i class="fas fa-file-pdf"></i>
                            <span>PDF</span>
                        </div>
                    </div>`;
                } else {
                    previewContent = `<i class="fas fa-${getFileIcon(fileName)}"></i>`;
                }
                
                html += `
                    <div class="attachment-card">
                        <div class="attachment-icon">
                            ${previewContent}
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

        function getFileIcon(fileName) {
            const ext = fileName.split('.').pop().toLowerCase();
            switch (ext) {
                case 'pdf': return 'file-pdf';
                case 'doc':
                case 'docx': return 'file-word';
                case 'xls':
                case 'xlsx': return 'file-excel';
                case 'ppt':
                case 'pptx': return 'file-powerpoint';
                case 'txt': return 'file-alt';
                case 'zip':
                case 'rar': return 'file-archive';
                default: return 'file';
            }
        }

        function previewImage(imageUrl, fileName) {
            // Create modal for image preview
            const modal = document.createElement('div');
            modal.className = 'image-preview-modal';
            modal.innerHTML = `
                <div class="image-preview-content">
                    <span class="image-preview-close">&times;</span>
                    <img src="${imageUrl}" alt="${fileName}" class="image-preview-large">
                    <div class="image-preview-title">${fileName}</div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Close modal on click
            modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.className === 'image-preview-close') {
                document.body.removeChild(modal);
            }
        });
    }

    function previewPDF(pdfUrl, fileName) {
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = `
            <div class="pdf-preview-content">
                <div class="pdf-preview-header">
                    <h3>${fileName}</h3>
                    <button class="pdf-preview-close">&times;</button>
                </div>
                <embed src="${pdfUrl}" type="application/pdf" width="90%" height="80%" style="margin: 20px auto; display: block; border-radius: 4px;">
                <div class="pdf-preview-actions">
                    <button onclick="window.open('${pdfUrl}', '_blank')" class="btn btn-primary">
                        <i class="fas fa-external-link-alt"></i> Ouvrir dans un nouvel onglet
                    </button>
                    <button onclick="downloadAttachment('${pdfUrl.split('attachment_id=')[1]}')" class="btn btn-secondary">
                        <i class="fas fa-download"></i> Télécharger
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.className === 'pdf-preview-close') {
                document.body.removeChild(modal);
            }
        });
    }        function downloadAttachment(attachmentId) {
            window.open(`api_attachments.php?action=download&note_id=${noteId}&attachment_id=${attachmentId}${typeof noteWorkspace !== 'undefined' && noteWorkspace ? '&workspace=' + encodeURIComponent(noteWorkspace) : ''}`, '_blank');
        }

        function deleteAttachment(attachmentId) {
            showConfirmDialog(
                'Are you sure you want to delete this attachment?',
                function() {
                    fetch('api_attachments.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: `action=delete&note_id=${noteId}&attachment_id=${attachmentId}${typeof noteWorkspace !== 'undefined' && noteWorkspace ? '&workspace=' + encodeURIComponent(noteWorkspace) : ''}`
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
                        showNotification('Error deleting attachment', 'error');
                    });
                },
                null // onCancel callback
            );
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Custom confirmation modal using application's modal style
        function showConfirmDialog(message, onConfirm, onCancel) {
            // Remove existing confirmation modal if any
            const existingModal = document.getElementById('confirmationModal');
            if (existingModal) {
                existingModal.remove();
            }

            // Create modal HTML using the same structure as other modals
            const modalHTML = `
                <div id="confirmationModal" class="modal" style="display: flex;">
                    <div class="modal-content" style="max-width: 400px;">
                        <h3>Confirm Action</h3>
                        <p id="confirmationMessage">${message}</p>
                        <div class="modal-buttons">
                            <button type="button" id="confirmBtn" class="btn-primary">Delete</button>
                            <button type="button" id="cancelBtn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to page
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            const modal = document.getElementById('confirmationModal');
            const confirmBtn = document.getElementById('confirmBtn');
            const cancelBtn = document.getElementById('cancelBtn');

            function closeModal() {
                modal.remove();
            }

            function handleCancel() {
                closeModal();
                if (onCancel) onCancel();
            }

            function handleConfirm() {
                closeModal();
                if (onConfirm) onConfirm();
            }

            function handleOverlayClick(e) {
                if (e.target === modal) {
                    handleCancel();
                }
            }

            // Add event listeners
            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);
            modal.addEventListener('click', handleOverlayClick);

            // Focus on cancel button for accessibility
            setTimeout(() => cancelBtn.focus(), 100);
        }

        function showNotification(message, type) {
            // Simple notification function with clearer error visuals
            const notification = document.createElement('div');
            let cssClass = 'alert';
            if (type === 'success') cssClass += ' alert-success';
            else if (type === 'error') cssClass += ' alert-error attention';
            else cssClass += ` alert-${type}`;

            notification.className = cssClass;
            notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;

            const container = document.querySelector('.settings-container');
            // insert right below the main title so it's immediately visible
            const titleEl = container.querySelector('h1');
            container.insertBefore(notification, titleEl.nextSibling);

            // Remove after 6s
            setTimeout(() => {
                // remove attention class to avoid re-animation if re-inserted
                notification.classList.remove('attention');
                notification.remove();
            }, 6000);
        }
    </script>
</body>
</html>
