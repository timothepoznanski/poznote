// Attachments page management (attachments.php)
// This file handles the dedicated attachments management page

(function () {
    'use strict';

    // Get configuration from data attributes on body
    var noteId = null;
    var noteWorkspace = null;
    var uploadInProgress = false;
    var currentAttachmentIdForAction = null;

    // Translations cache (loaded from body data attributes)
    var TXT = {};
    var FILESIZE_UNITS = ['bytes', 'KB', 'MB', 'GB'];

    // Load translations from body data attributes
    function loadTranslations() {
        var body = document.body;
        TXT.uploading = body.getAttribute('data-txt-uploading') || 'Uploading...';
        TXT.selectFile = body.getAttribute('data-txt-select-file') || 'Please select a file to upload.';
        TXT.fileTooLarge = body.getAttribute('data-txt-file-too-large') || 'The file is too large (max: 200MB).';
        TXT.uploadSuccess = body.getAttribute('data-txt-upload-success') || 'File uploaded successfully!';
        TXT.uploadFailedPrefix = body.getAttribute('data-txt-upload-failed-prefix') || 'Upload failed: {{error}}';
        TXT.uploadFailedGeneric = body.getAttribute('data-txt-upload-failed-generic') || 'Upload failed. Please try again.';
        TXT.uploadFailedConnection = body.getAttribute('data-txt-upload-failed-connection') || 'Upload failed. Please check your connection.';
        TXT.loadingFailed = body.getAttribute('data-txt-loading-failed') || 'Failed to load attachments';
        TXT.loadingError = body.getAttribute('data-txt-loading-error') || 'Error loading attachments';
        TXT.noAttachments = body.getAttribute('data-txt-no-attachments') || 'No attachments.';
        TXT.previewAlt = body.getAttribute('data-txt-preview-alt') || 'Preview';
        TXT.uploadedPrefix = body.getAttribute('data-txt-uploaded-prefix') || 'Uploaded: ';
        TXT.view = body.getAttribute('data-txt-view') || 'View';
        TXT.deleteTxt = body.getAttribute('data-txt-delete') || 'Delete';
        TXT.openNewTab = body.getAttribute('data-txt-open-new-tab') || 'Open in new tab';
        TXT.download = body.getAttribute('data-txt-download') || 'Download';
        TXT.pdfLabel = body.getAttribute('data-txt-pdf-label') || 'PDF';
        TXT.deletedSuccess = body.getAttribute('data-txt-deleted-success') || 'Attachment deleted successfully';
        TXT.deleteFailedPrefix = body.getAttribute('data-txt-delete-failed-prefix') || 'Deletion failed: {{error}}';
        TXT.deleteFailedGeneric = body.getAttribute('data-txt-delete-failed-generic') || 'Deletion failed.';
        TXT.confirmAction = body.getAttribute('data-txt-confirm-action') || 'Confirm Action';
        TXT.deleteButton = body.getAttribute('data-txt-delete-button') || 'Delete';
        TXT.cancel = body.getAttribute('data-txt-cancel') || 'Cancel';

        // Parse filesize units
        try {
            var unitsJson = body.getAttribute('data-filesize-units');
            if (unitsJson) {
                FILESIZE_UNITS = JSON.parse(unitsJson);
            }
        } catch (e) {
            FILESIZE_UNITS = ['bytes', 'KB', 'MB', 'GB'];
        }
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 ' + FILESIZE_UNITS[0];
        var k = 1024;
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + FILESIZE_UNITS[i];
    }

    // Show notification
    function showNotification(message, type) {
        var notification = document.createElement('div');
        var cssClass = 'alert';
        if (type === 'success') cssClass += ' alert-success';
        else if (type === 'error') cssClass += ' alert-error attention';
        else cssClass += ' alert-' + type;

        notification.className = cssClass;
        notification.textContent = message;

        var container = document.querySelector('.settings-container');
        if (container.firstChild) {
            container.insertBefore(notification, container.firstChild);
        } else {
            container.appendChild(notification);
        }

        setTimeout(function () {
            notification.classList.remove('attention');
            notification.remove();
        }, 6000);
    }

    // Show file name when file is selected
    function showFileName() {
        var fileInput = document.getElementById('attachmentFile');
        var fileNameDiv = document.getElementById('selectedFileName');
        var uploadBtn = document.getElementById('uploadBtn');

        if (fileInput.files.length > 0) {
            var file = fileInput.files[0];
            var fileName = file.name;
            var fileSize = formatFileSize(file.size);

            var isImage = file.type.startsWith('image/');
            var isPDF = file.type === 'application/pdf';
            var isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(fileName);

            var htmlContent = '<div class="selected-file-info"><span>' + fileName + ' (' + fileSize + ')</span></div>';

            if (isImage) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    htmlContent += '<div class="image-preview"><img src="' + e.target.result + '" alt="' + TXT.previewAlt + '" style="max-width: 200px; max-height: 150px; border-radius: 4px; margin-top: 10px;"></div>';
                    fileNameDiv.innerHTML = htmlContent;
                };
                reader.readAsDataURL(file);
            } else if (isPDF) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    htmlContent += '<div class="pdf-preview"><embed src="' + e.target.result + '" type="application/pdf" width="200" height="150" style="border-radius: 4px; margin-top: 10px;"></div>';
                    fileNameDiv.innerHTML = htmlContent;
                };
                reader.readAsDataURL(file);
            } else if (isVideo) {
                var videoUrl = URL.createObjectURL(file);
                htmlContent += '<div class="video-preview"><video src="' + videoUrl + '" controls muted playsinline preload="metadata" width="200" height="150" style="border-radius: 4px; margin-top: 10px;"></video></div>';
                fileNameDiv.innerHTML = htmlContent;
                var videoEl = fileNameDiv.querySelector('video');
                if (videoEl) {
                    videoEl.onloadeddata = function () {
                        URL.revokeObjectURL(videoUrl);
                    };
                }
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

    // Upload attachment with progress
    function uploadAttachment(event) {
        if (uploadInProgress) return;

        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        var fileInput = document.getElementById('attachmentFile');
        var progressDiv = document.getElementById('uploadProgress');
        var progressFill = document.getElementById('progressFill');
        var progressText = document.getElementById('progressText');

        if (!fileInput.files.length) {
            showNotification(TXT.selectFile, 'error');
            return;
        }

        var file = fileInput.files[0];
        var maxSize = 200 * 1024 * 1024; // 200MB

        if (file.size > maxSize) {
            showNotification(TXT.fileTooLarge, 'error');
            return;
        }

        uploadInProgress = true;
        progressDiv.style.display = 'block';
        document.getElementById('uploadBtn').disabled = true;

        var formData = new FormData();
        formData.append('note_id', noteId);
        if (noteWorkspace) {
            formData.append('workspace', noteWorkspace);
        }
        formData.append('file', file);

        var xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                var percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + '%';
                progressText.textContent = TXT.uploading + ' ' + percent + '%';
            }
        });

        xhr.addEventListener('load', function () {
            uploadInProgress = false;
            progressDiv.style.display = 'none';

            try {
                var response = JSON.parse(xhr.responseText);
                if (response.success) {
                    showNotification(TXT.uploadSuccess, 'success');
                    fileInput.value = '';
                    document.getElementById('selectedFileName').style.display = 'none';
                    document.getElementById('uploadBtn').disabled = true;
                    loadAttachments();
                } else {
                    showNotification(TXT.uploadFailedPrefix.replace('{{error}}', response.message || ''), 'error');
                    document.getElementById('uploadBtn').disabled = false;
                }
            } catch (e) {
                showNotification(TXT.uploadFailedGeneric, 'error');
                document.getElementById('uploadBtn').disabled = false;
            }
        });

        xhr.addEventListener('error', function () {
            uploadInProgress = false;
            progressDiv.style.display = 'none';
            showNotification(TXT.uploadFailedConnection, 'error');
            document.getElementById('uploadBtn').disabled = false;
        });

        xhr.open('POST', '/api/v1/notes/' + noteId + '/attachments');
        xhr.send(formData);
    }

    // Load attachments list
    function loadAttachments() {
        var url = '/api/v1/notes/' + noteId + '/attachments';
        if (noteWorkspace) {
            url += '?workspace=' + encodeURIComponent(noteWorkspace);
        }

        fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success) {
                    displayAttachments(data.attachments, data.entry || '');
                } else {
                    document.getElementById('attachmentsList').innerHTML =
                        '<div class="error-message">' + TXT.loadingFailed + '</div>';
                }
            })
            .catch(function (error) {
                document.getElementById('attachmentsList').innerHTML =
                    '<div class="error-message">' + TXT.loadingError + '</div>';
            });
    }

    // Display attachments
    function displayAttachments(attachments, noteContent) {
        var container = document.getElementById('attachmentsList');

        var showInlineEverything = document.getElementById('showInlineImagesToggle') ? document.getElementById('showInlineImagesToggle').checked : true;
        var showThumbnails = showInlineEverything; // For this page, we use the same toggle for thumbnails and inline visibility for now, OR should we separate? The user wants same behavior as list.

        // Filter out inline attachments if toggle is off
        var visibleAttachments = attachments;
        if (!showInlineEverything) {
            visibleAttachments = attachments.filter(function (att) {
                return !noteContent || !noteContent.includes('attachments/' + att.id);
            });
        }

        if (visibleAttachments.length === 0) {
            container.innerHTML = '<div class="no-attachments">' + TXT.noAttachments + '</div>';
            return;
        }

        var html = '';
        visibleAttachments.forEach(function (attachment) {
            var fileSize = formatFileSize(attachment.file_size);
            var uploadDate = new Date(attachment.uploaded_at).toLocaleDateString();
            var fileName = attachment.original_filename;
            var shortName = fileName.length > 40 ? fileName.substring(0, 40) + '...' : fileName;

            var isImage = attachment.file_type && attachment.file_type.startsWith('image/');
            var isPDF = attachment.file_type && attachment.file_type === 'application/pdf';
            var isVideo = attachment.file_type && attachment.file_type.startsWith('video/');
            if (!isVideo && attachment.original_filename) {
                isVideo = /\.mp4$/i.test(attachment.original_filename);
            }
            var fileUrl = '/api/v1/notes/' + noteId + '/attachments/' + attachment.id;
            if (noteWorkspace) {
                fileUrl += '?workspace=' + encodeURIComponent(noteWorkspace);
            }

            var previewContent = '';
            // Only show previews if showThumbnails is true
            if (showThumbnails) {
                if (isImage) {
                    previewContent = '<img src="' + fileUrl + '" alt="' + TXT.previewAlt + '" class="attachment-thumbnail" onclick="previewImage(\'' + fileUrl + '\', \'' + fileName.replace(/'/g, "\\'") + '\')">';
                } else if (isPDF) {
                    previewContent = '<div class="pdf-thumbnail" onclick="previewPDF(\'' + fileUrl + '\', \'' + fileName.replace(/'/g, "\\'") + '\')">' +
                        '<iframe src="' + fileUrl + '" width="60" height="60" frameborder="0" style="pointer-events: none; transform: scale(0.8); transform-origin: top left;"></iframe>' +
                        '<div class="pdf-overlay"><span>' + TXT.pdfLabel + '</span></div>' +
                        '</div>';
                } else if (isVideo) {
                    previewContent = '<div class="video-thumbnail" onclick="downloadAttachment(\'' + attachment.id + '\')">' +
                        '<video src="' + fileUrl + '#t=0.1" muted playsinline preload="metadata"></video>' +
                        '<div class="video-overlay"><i class="fa fa-play"></i></div>' +
                        '</div>';
                }
            }

            // Fallback for no preview or if disabled
            if (!previewContent) {
                var iconClass = 'fa-file';
                if (isImage) iconClass = 'fa-file-image';
                else if (isPDF) iconClass = 'fa-file-pdf';
                else if (isVideo) iconClass = 'fa-file-video';

                previewContent = '<div class="file-icon-placeholder"><i class="fas ' + iconClass + '"></i></div>';
            }

            html += '<div class="attachment-card">' +
                '<div class="attachment-icon">' + previewContent + '</div>' +
                '<div class="attachment-details">' +
                '<div class="attachment-name" title="' + fileName + '">' + shortName + '</div>' +
                '<div class="attachment-meta">' +
                '<span class="attachment-size">' + fileSize + '</span>' +
                '<span class="attachment-date">' + TXT.uploadedPrefix + uploadDate + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="attachment-actions">' +
                '<button onclick="downloadAttachment(\'' + attachment.id + '\')" class="btn-icon btn-download" title="' + TXT.view + '">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>' +
                '<circle cx="12" cy="12" r="3"></circle>' +
                '</svg>' +
                '</button>' +
                '<button onclick="showDeleteAttachmentConfirm(\'' + attachment.id + '\')" class="btn-icon btn-delete" title="' + TXT.deleteTxt + '">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="3,6 5,6 21,6"></polyline>' +
                '<path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>' +
                '<line x1="10" y1="11" x2="10" y2="17"></line>' +
                '<line x1="14" y1="11" x2="14" y2="17"></line>' +
                '</svg>' +
                '</button>' +
                '</div>' +
                '</div>';
        });

        container.innerHTML = html;
    }

    // Preview image in modal
    function previewImage(imageUrl, fileName) {
        var modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = '<div class="image-preview-content">' +
            '<span class="image-preview-close">&times;</span>' +
            '<img src="' + imageUrl + '" alt="' + fileName + '" class="image-preview-large">' +
            '<div class="image-preview-title">' + fileName + '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.className === 'image-preview-close') {
                document.body.removeChild(modal);
            }
        });
    }

    // Preview PDF in modal
    function previewPDF(pdfUrl, fileName) {
        var modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = '<div class="pdf-preview-content">' +
            '<div class="pdf-preview-header">' +
            '<h3>' + fileName + '</h3>' +
            '<button class="pdf-preview-close">&times;</button>' +
            '</div>' +
            '<embed src="' + pdfUrl + '" type="application/pdf" width="90%" height="80%" style="margin: 20px auto; display: block; border-radius: 4px;">' +
            '<div class="pdf-preview-actions">' +
            '<button onclick="window.open(\'' + pdfUrl + '\', \'_blank\')" class="btn btn-primary">' + TXT.openNewTab + '</button>' +
            '<button onclick="downloadAttachment(\'' + pdfUrl.split('attachment_id=')[1].split('&')[0] + '\')" class="btn btn-secondary">' + TXT.download + '</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.className === 'pdf-preview-close') {
                document.body.removeChild(modal);
            }
        });
    }

    // Download/view attachment
    function downloadAttachment(attachmentId) {
        var url = '/api/v1/notes/' + noteId + '/attachments/' + attachmentId;
        if (noteWorkspace) {
            url += '?workspace=' + encodeURIComponent(noteWorkspace);
        }
        window.open(url, '_blank');
    }

    // Delete attachment
    function deleteAttachment(attachmentId) {
        var url = '/api/v1/notes/' + noteId + '/attachments/' + attachmentId;
        if (noteWorkspace) {
            url += '?workspace=' + encodeURIComponent(noteWorkspace);
        }

        fetch(url, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success) {
                    showNotification(TXT.deletedSuccess, 'success');
                    loadAttachments();
                } else {
                    showNotification(TXT.deleteFailedPrefix.replace('{{error}}', data.message || ''), 'error');
                }
            })
            .catch(function (error) {
                showNotification(TXT.deleteFailedGeneric, 'error');
            });
    }

    // Show delete confirmation modal
    function showDeleteAttachmentConfirm(attachmentId) {
        currentAttachmentIdForAction = attachmentId;
        var modal = document.getElementById('deleteAttachmentConfirmModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.style.zIndex = '30000';
            modal.style.pointerEvents = 'auto';
            var content = modal.querySelector('.modal-content');
            if (content) {
                content.style.zIndex = '30001';
            }

            function overlayClickHandler(e) {
                if (e.target === modal) {
                    closeDeleteAttachmentConfirmModal();
                }
            }

            modal.removeEventListener('click', modal.__overlayHandler || overlayClickHandler);
            modal.__overlayHandler = overlayClickHandler;
            modal.addEventListener('click', modal.__overlayHandler);
        }
    }

    // Close delete confirmation modal
    function closeDeleteAttachmentConfirmModal() {
        var modal = document.getElementById('deleteAttachmentConfirmModal');
        if (modal) modal.style.display = 'none';
        currentAttachmentIdForAction = null;
    }

    // Execute delete after confirmation
    function executeDeleteAttachment() {
        if (currentAttachmentIdForAction) {
            deleteAttachment(currentAttachmentIdForAction);
        }
        closeDeleteAttachmentConfirmModal();
    }

    // Update back link with current workspace from PHP
    function updateBackLink() {
        try {
            // Use workspace from PHP (set as global variable)
            var workspace = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() :
                (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace :
                    (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;
            if (workspace) {
                var a = document.getElementById('backToNotesLink');
                if (a) {
                    var params = [];
                    params.push('workspace=' + encodeURIComponent(workspace));
                    if (noteId) {
                        params.push('note=' + noteId);
                    }
                    a.setAttribute('href', 'index.php?' + params.join('&'));
                }
            }
        } catch (e) { }
    }

    // Initialize page
    function initializeAttachmentsPage() {
        // Load translations from body data attributes
        loadTranslations();

        // Get configuration from body data attributes
        noteId = parseInt(document.body.getAttribute('data-note-id'), 10) || 0;
        noteWorkspace = document.body.getAttribute('data-workspace') || null;

        if (!noteId) {
            console.error('No note ID found');
            return;
        }

        // Set up file input change handler
        var fileInput = document.getElementById('attachmentFile');
        if (fileInput) {
            fileInput.addEventListener('change', showFileName);
        }

        // Set up upload button
        var uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', uploadAttachment);
        }

        // Set up modal buttons
        var cancelBtn = document.querySelector('#deleteAttachmentConfirmModal .btn-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeDeleteAttachmentConfirmModal);
        }

        var confirmBtn = document.querySelector('#deleteAttachmentConfirmModal .btn-danger');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', executeDeleteAttachment);
        }

        // Update back link
        updateBackLink();

        // Set up inline images toggle
        var showInlineImagesToggle = document.getElementById('showInlineImagesToggle');
        if (showInlineImagesToggle) {
            showInlineImagesToggle.addEventListener('change', function () {
                var isChecked = this.checked;
                // Key: 'show_inline_attachments_in_list'. Logic: '1' SHOWS everything, '0' HIDES inline ones.
                var valToSet = isChecked ? '1' : '0';

                fetch('/api/v1/settings/show_inline_attachments_in_list', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ value: valToSet })
                })
                    .then(function (r) { return r.json(); })
                    .then(function (result) {
                        if (result && result.success) {
                            // Reload to apply the change and filter
                            loadAttachments();
                        }
                    })
                    .catch(function (e) { console.error('Error saving setting:', e); });
            });
        }

        // Load attachments
        loadAttachments();
    }

    // Expose functions globally for onclick handlers in dynamic HTML
    window.showFileName = showFileName;
    window.uploadAttachment = uploadAttachment;
    window.downloadAttachment = downloadAttachment;
    window.previewImage = previewImage;
    window.previewPDF = previewPDF;
    window.showDeleteAttachmentConfirm = showDeleteAttachmentConfirm;
    window.closeDeleteAttachmentConfirmModal = closeDeleteAttachmentConfirmModal;
    window.executeDeleteAttachment = executeDeleteAttachment;
    window.deleteAttachment = deleteAttachment;

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initializeAttachmentsPage);
})();
