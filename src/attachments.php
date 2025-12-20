<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
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
    <title><?php echo t_h('attachments.page.title'); ?> - <?php echo htmlspecialchars($note['heading']); ?> - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/attachments.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/theme-manager.js"></script>
</head>
<body>
    <div class="settings-container">
        <h1><?php echo t_h('attachments.page.title'); ?></h1>
        <p><?php echo t_h('attachments.page.subtitle'); ?> <strong><?php echo htmlspecialchars($note['heading']); ?></strong></p>
        
        <?php 
            $back_params = [];
            if ($workspace) $back_params[] = 'workspace=' . urlencode($workspace);
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>
    <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>

        <br><br>

        <!-- Upload Section -->
        <div class="settings-section">
            <h3><?php echo t_h('attachments.page.upload_section_title'); ?></h3>
            
            <div class="attachment-upload-section">
                <div class="drag-drop-info"><?php echo t_h('attachments.page.drag_drop_info'); ?></div><br>
                <div class="form-group">
                    <input type="file" id="attachmentFile" class="file-input" onchange="showFileName()">
                    <div class="accepted-types">
                        <?php echo t_h('attachments.page.all_types_accepted'); ?>
                    </div>
                    <br>
                    <div class="selected-filename" id="selectedFileName"></div>
                </div>
                
                <button type="button" onclick="uploadAttachment(event)" class="btn btn-primary" id="uploadBtn" disabled>
                    <?php echo t_h('attachments.page.upload_button'); ?>
                </button>
            </div>
            
            <div id="uploadProgress" class="upload-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText"><?php echo t_h('attachments.upload.button_uploading', [], 'Uploading...'); ?></div>
            </div>
        </div>

        <!-- Attachments List Section -->
        <div class="settings-section">
            <h3><?php echo t_h('attachments.page.current_attachments', [], 'Current Attachments'); ?></h3>
            <div id="attachmentsList" class="attachments-display">
                <div class="loading-attachments">
                    <?php echo t_h('attachments.page.loading_attachments', [], 'Loading attachments...'); ?>
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

        const TXT_UPLOADING = <?php echo json_encode(t('attachments.upload.button_uploading', [], 'Uploading...')); ?>;
        const TXT_SELECT_FILE = <?php echo json_encode(t('attachments.errors.select_file', [], 'Please select a file to upload.')); ?>;
        const TXT_FILE_TOO_LARGE = <?php echo json_encode(t('attachments.errors.file_too_large', ['maxSize' => '200MB'], 'The file is too large (max: {{maxSize}}).')); ?>;
        const TXT_UPLOAD_SUCCESS = <?php echo json_encode(t('attachments.messages.upload_success', [], 'File uploaded successfully!')); ?>;
        const TXT_UPLOAD_FAILED_PREFIX = <?php echo json_encode(t('attachments.errors.upload_failed', ['error' => '{{error}}'], 'Upload failed: {{error}}')); ?>;
        const TXT_UPLOAD_FAILED_GENERIC = <?php echo json_encode(t('attachments.errors.upload_failed_generic', [], 'Upload failed. Please try again.')); ?>;
        const TXT_UPLOAD_FAILED_CONNECTION = <?php echo json_encode(t('attachments.errors.upload_failed_connection', [], 'Upload failed. Please check your connection.')); ?>;
        const TXT_LOADING_FAILED = <?php echo json_encode(t('attachments.errors.loading_failed', [], 'Failed to load attachments')); ?>;
        const TXT_LOADING_ERROR = <?php echo json_encode(t('attachments.errors.loading_error', [], 'Error loading attachments')); ?>;
        const TXT_NO_ATTACHMENTS = <?php echo json_encode(t('attachments.empty', [], 'No attachments.')); ?>;
        const TXT_PREVIEW_ALT = <?php echo json_encode(t('attachments.page.preview_alt', [], 'Preview')); ?>;
        const TXT_UPLOADED_PREFIX = <?php echo json_encode(t('attachments.page.uploaded_prefix', [], 'Uploaded: ')); ?>;
        const TXT_VIEW = <?php echo json_encode(t('attachments.actions.view', [], 'View')); ?>;
        const TXT_DELETE = <?php echo json_encode(t('attachments.actions.delete', [], 'Delete')); ?>;
        const TXT_OPEN_NEW_TAB = <?php echo json_encode(t('attachments.page.open_in_new_tab', [], 'Open in new tab')); ?>;
        const TXT_DOWNLOAD = <?php echo json_encode(t('common.download', [], 'Download')); ?>;
        const TXT_DELETED_SUCCESS = <?php echo json_encode(t('attachments.messages.deleted_success', [], 'Attachment deleted successfully')); ?>;
        const TXT_DELETE_FAILED_PREFIX = <?php echo json_encode(t('attachments.errors.deletion_failed', ['error' => '{{error}}'], 'Deletion failed: {{error}}')); ?>;
        const TXT_DELETE_FAILED_GENERIC = <?php echo json_encode(t('attachments.errors.deletion_failed_generic', [], 'Deletion failed.')); ?>;
        const FILESIZE_UNITS = <?php echo json_encode([
            t('attachments.size.units.bytes', [], 'bytes'),
            t('attachments.size.units.kb', [], 'KB'),
            t('attachments.size.units.mb', [], 'MB'),
            t('attachments.size.units.gb', [], 'GB'),
        ]); ?>;

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
                showNotification(TXT_SELECT_FILE, 'error');
                return;
            }

            const file = fileInput.files[0];
            const maxSize = 200 * 1024 * 1024; // 200MB
            
            if (file.size > maxSize) {
                showNotification(TXT_FILE_TOO_LARGE, 'error');
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
                    progressText.textContent = `${TXT_UPLOADING} ${percent}%`;
                }
            });

            xhr.addEventListener('load', function() {
                uploadInProgress = false;
                progressDiv.style.display = 'none';
                
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        showNotification(TXT_UPLOAD_SUCCESS, 'success');
                        fileInput.value = '';
                        document.getElementById('selectedFileName').style.display = 'none';
                        document.getElementById('uploadBtn').disabled = true;
                        loadAttachments(); // Reload the list
                    } else {
                        showNotification(TXT_UPLOAD_FAILED_PREFIX.replaceAll('{{error}}', String(response.message || '')), 'error');
                        document.getElementById('uploadBtn').disabled = false;
                    }
                } catch (e) {
                    showNotification(TXT_UPLOAD_FAILED_GENERIC, 'error');
                    document.getElementById('uploadBtn').disabled = false;
                }
            });

            xhr.addEventListener('error', function() {
                uploadInProgress = false;
                progressDiv.style.display = 'none';
                showNotification(TXT_UPLOAD_FAILED_CONNECTION, 'error');
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
                            '<div class="error-message">' + TXT_LOADING_FAILED + '</div>';
                    }
                })
                .catch(error => {
                    document.getElementById('attachmentsList').innerHTML = 
                        '<div class="error-message">' + TXT_LOADING_ERROR + '</div>';
                });
        }

        function displayAttachments(attachments) {
            const container = document.getElementById('attachmentsList');
            
            if (attachments.length === 0) {
                container.innerHTML = '<div class="no-attachments">' + TXT_NO_ATTACHMENTS + '</div>';
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
                    previewContent = `<img src="${fileUrl}" alt="${TXT_PREVIEW_ALT}" class="attachment-thumbnail" onclick="previewImage('${fileUrl}', '${fileName}')">`;
                } else if (isPDF) {
                    previewContent = `<div class="pdf-thumbnail" onclick="previewPDF('${fileUrl}', '${fileName}')">
                        <iframe src="${fileUrl}" width="60" height="60" frameborder="0" style="pointer-events: none; transform: scale(0.8); transform-origin: top left;"></iframe>
                        <div class="pdf-overlay">
                            
                            <span>PDF</span>
                        </div>
                    </div>`;
                } else {
                    previewContent = "";
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
                                <span class="attachment-date">${TXT_UPLOADED_PREFIX}${uploadDate}</span>
                            </div>
                        </div>
                        <div class="attachment-actions">
                            <button onclick="downloadAttachment('${attachment.id}')" class="btn-icon btn-download" title="${TXT_VIEW}">
                                <!-- Eye / view icon -->
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            <button onclick="showDeleteAttachmentConfirm('${attachment.id}')" class="btn-icon btn-delete" title="${TXT_DELETE}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
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
                case 'pdf': return 'file-lines-light-full.svg';
                case 'doc':
                case 'docx': return 'file-lines-light-full.svg';
                case 'xls':
                case 'xlsx': return 'file-lines-light-full.svg';
                case 'ppt':
                case 'pptx': return 'file-lines-light-full.svg';
                case 'txt': return 'file-lines-light-full.svg';
                case 'zip':
                case 'rar': return 'file-lines-light-full.svg';
                default: return 'file-lines-light-full.svg';
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
                    <button onclick="window.open('${pdfUrl}', '_blank')" class="btn btn-primary">${TXT_OPEN_NEW_TAB}</button>
                    <button onclick="downloadAttachment('${pdfUrl.split('attachment_id=')[1]}')" class="btn btn-secondary">
                        ${TXT_DOWNLOAD}
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

        // NOTE: confirmation removed - delete immediately when called
        function deleteAttachment(attachmentId) {
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
                    showNotification(TXT_DELETED_SUCCESS, 'success');
                    loadAttachments(); // Reload the list
                } else {
                    showNotification(TXT_DELETE_FAILED_PREFIX.replaceAll('{{error}}', String(data.message || '')), 'error');
                }
            })
            .catch(error => {
                showNotification(TXT_DELETE_FAILED_GENERIC, 'error');
            });
        }

        // Attachment delete confirmation (reuses the same modal style as trash.php)
        let currentAttachmentIdForAction = null;

        function showDeleteAttachmentConfirm(attachmentId) {
            currentAttachmentIdForAction = attachmentId;
            const modal = document.getElementById('deleteAttachmentConfirmModal');
            console.log('showDeleteAttachmentConfirm called for', attachmentId);
            if (modal) {
                // Force display and stacking to avoid CSS conflicts from other stylesheets
                modal.style.display = 'flex';
                modal.style.zIndex = '30000';
                modal.style.pointerEvents = 'auto';
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.zIndex = '30001';
                }

                // Close when clicking outside the modal content
                function overlayClickHandler(e) {
                    if (e.target === modal) {
                        closeDeleteAttachmentConfirmModal();
                    }
                }

                // Remove any previous listener to avoid duplicates
                modal.removeEventListener('click', modal.__overlayHandler || overlayClickHandler);
                modal.__overlayHandler = overlayClickHandler;
                modal.addEventListener('click', modal.__overlayHandler);
            }
        }

        function closeDeleteAttachmentConfirmModal() {
            const modal = document.getElementById('deleteAttachmentConfirmModal');
            if (modal) modal.style.display = 'none';
            currentAttachmentIdForAction = null;
        }

        function executeDeleteAttachment() {
            if (currentAttachmentIdForAction) {
                deleteAttachment(currentAttachmentIdForAction);
            }
            closeDeleteAttachmentConfirmModal();
        }

        // Expose functions to global scope for inline onclick handlers
        window.showDeleteAttachmentConfirm = showDeleteAttachmentConfirm;
        window.closeDeleteAttachmentConfirmModal = closeDeleteAttachmentConfirmModal;
        window.executeDeleteAttachment = executeDeleteAttachment;
        window.deleteAttachment = deleteAttachment;

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = FILESIZE_UNITS;
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
            // If the success message is the specific upload success message, show text only (no icon)
            if (type === 'success' && message === TXT_UPLOAD_SUCCESS) {
                notification.textContent = message;
            } else {
                notification.innerHTML = message;
            }

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

        // Ensure Back to Notes preserves selected workspace if stored in localStorage
        try {
            var stored = localStorage.getItem('poznote_selected_workspace');
            if (stored && stored !== 'Poznote') {
                var a = document.getElementById('backToNotesLink');
                if (a) {
                    var params = [];
                    params.push('workspace=' + encodeURIComponent(stored));
                    <?php if ($note_id): ?>
                    params.push('note=<?php echo intval($note_id); ?>');
                    <?php endif; ?>
                    a.setAttribute('href', 'index.php?' + params.join('&'));
                }
            }
        } catch (e) {
            // ignore storage errors
        }
    </script>
    
    <!-- Delete Attachment Confirmation Modal -->
    <div id="deleteAttachmentConfirmModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('attachments.modals.delete.title', [], 'Delete Attachment'); ?></h3>
            <p><?php echo t_h('attachments.modals.delete.message', [], 'Do you want to delete this attachment? This action cannot be undone.'); ?></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeDeleteAttachmentConfirmModal()"><?php echo t_h('common.cancel'); ?></button>
                <button type="button" class="btn-danger" onclick="executeDeleteAttachment()"><?php echo t_h('attachments.actions.delete', [], 'Delete'); ?></button>
            </div>
        </div>
    </div>
</body>
</html>
