// Attached file and image drag management
// All images (HTML and Markdown notes) are now uploaded as attachments for consistency

/**
 * Convert base64 images in loaded notes to attachments
 * This function is called after a note is loaded to migrate legacy base64 images
 * @param {HTMLElement} noteEntry - The note entry element to process
 */
function convertBase64ImagesToAttachments(noteEntry) {
    if (!noteEntry) return;

    // Only process HTML notes (not markdown, not excalidraw)
    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType === 'markdown' || noteType === 'excalidraw' || noteType === 'tasklist') {
        return;
    }

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    if (!noteId || noteId === '' || noteId === 'search') return;

    // Find all base64 images in the note
    var base64Images = noteEntry.querySelectorAll('img[src^="data:image/"]');
    if (base64Images.length === 0) return;

    // Convert each image
    var conversionPromises = [];

    base64Images.forEach(function (img, index) {
        var src = img.getAttribute('src');
        if (!src || !src.startsWith('data:image/')) return;

        // Parse the data URL
        var matches = src.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (!matches) return;

        var mimeSubtype = matches[1];
        var base64Data = matches[2];

        // Convert base64 to blob
        try {
            var byteCharacters = atob(base64Data);
            var byteNumbers = new Array(byteCharacters.length);
            for (var i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);
            var mimeType = 'image/' + (mimeSubtype === 'svg+xml' ? 'svg+xml' : mimeSubtype);
            var blob = new Blob([byteArray], { type: mimeType });

            // Determine file extension
            var extensionMap = {
                'jpeg': 'jpg', 'png': 'png', 'gif': 'gif',
                'webp': 'webp', 'svg+xml': 'svg', 'bmp': 'bmp'
            };
            var extension = extensionMap[mimeSubtype.toLowerCase()] || 'png';

            // Create a File object
            var altText = img.getAttribute('alt') || '';
            var fileName = altText ? altText + '.' + extension : 'image_' + Date.now() + '_' + index + '.' + extension;
            var file = new File([blob], fileName, { type: mimeType });

            // Add a loading indicator to the image
            img.style.opacity = '0.5';
            img.style.border = '2px dashed #ccc';

            // Upload as attachment
            var formData = new FormData();
            formData.append('note_id', noteId);
            formData.append('file', file);
            if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
                formData.append('workspace', selectedWorkspace);
            }

            var promise = fetch('/api/v1/notes/' + noteId + '/attachments', {
                method: 'POST',
                body: formData
            })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    if (data.success) {
                        // Replace the src with the attachment URL
                        var newSrc = '/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id;
                        img.setAttribute('src', newSrc);
                        img.setAttribute('loading', 'lazy');
                        img.setAttribute('decoding', 'async');
                        img.style.opacity = '';
                        img.style.border = '';
                        return true;
                    } else {
                        img.style.opacity = '';
                        img.style.border = '';
                        return false;
                    }
                })
                .catch(function (error) {
                    img.style.opacity = '';
                    img.style.border = '';
                    return false;
                });

            conversionPromises.push(promise);
        } catch (e) {
            // Silently continue if error processing image
        }
    });

    // After all conversions complete, save the note
    if (conversionPromises.length > 0) {
        Promise.all(conversionPromises).then(function (results) {
            var successCount = results.filter(function (r) { return r === true; }).length;
            if (successCount > 0) {
                // Update attachment count in menu
                if (typeof updateAttachmentCountInMenu === 'function') {
                    updateAttachmentCountInMenu(noteId);
                }

                // Mark note as modified and flag for git push
                window.noteid = noteId;
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }

                // Trigger save after a short delay
                setTimeout(function () {
                    if (typeof saveNoteToServer === 'function') {
                        saveNoteToServer();
                    } else if (typeof window.saveNoteImmediately === 'function') {
                        window.saveNoteImmediately();
                    }
                }, 200);
            }
        });
    }
}

// Expose function globally for use in note-loader-common.js
window.convertBase64ImagesToAttachments = convertBase64ImagesToAttachments;

/**
 * Use global translation function from globals.js
 * This avoids code duplication across files
 */
var tr = window.t || function (key, vars, fallback) {
    return fallback || key;
};

function isCursorInEditableNote() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;

    return container.closest && (
        container.closest('[contenteditable="true"]') ||
        container.closest('.noteentry') ||
        container.closest('.markdown-editor')
    );
}

function showAttachmentDialog(noteId) {
    var ws = selectedWorkspace || getSelectedWorkspace() || '';
    var wsParam = ws ? '&workspace=' + encodeURIComponent(ws) : '';
    window.location.href = 'attachments.php?note_id=' + noteId + wsParam;
}

function showAttachmentError(message) {
    var errorElement = document.getElementById('attachmentErrorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideAttachmentError() {
    var errorElement = document.getElementById('attachmentErrorMessage');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function uploadAttachment() {
    var fileInput = document.getElementById('attachmentFile');
    var file = fileInput.files[0];

    if (!file) {
        showAttachmentError(tr('attachments.errors.select_file', {}, 'Please select a file'));
        return;
    }

    if (!currentNoteIdForAttachments) {
        showAttachmentError(tr('attachments.errors.no_note_selected', {}, 'No note selected'));
        return;
    }

    // Check file size (200MB limit)
    var maxSize = 200 * 1024 * 1024; // 200MB in bytes
    if (file.size > maxSize) {
        showAttachmentError(tr('attachments.errors.file_too_large', {}, 'File too large. Maximum size: 200MB.'));
        return;
    }

    hideAttachmentError();

    // Show progress
    var uploadButton = document.querySelector('.attachment-upload button');
    var originalText = uploadButton.textContent;
    uploadButton.textContent = tr('attachments.upload.button_uploading', {}, 'Uploading...');
    uploadButton.disabled = true;

    var formData = new FormData();
    formData.append('note_id', currentNoteIdForAttachments);
    formData.append('file', file);

    fetch('/api/v1/notes/' + currentNoteIdForAttachments + '/attachments', {
        method: 'POST',
        body: formData
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(tr('attachments.errors.http_error', { status: response.status }, 'HTTP Error: {{status}}'));
            }
            return response.text();
        })
        .then(function (text) {
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(tr('attachments.errors.invalid_server_response', {}, 'Invalid server response'));
            }

            if (data.success) {
                fileInput.value = '';
                document.getElementById('selectedFileName').textContent = '';

                var uploadButtonContainer = document.querySelector('.upload-button-container');
                if (uploadButtonContainer) {
                    uploadButtonContainer.classList.remove('show');
                }

                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }

                loadAttachments(currentNoteIdForAttachments);
                updateAttachmentCountInMenu(currentNoteIdForAttachments);
            } else {
                showAttachmentError(tr('attachments.errors.upload_failed', { error: data.message }, 'Upload failed: {{error}}'));
            }
        })
        .catch(function (error) {
            showAttachmentError(tr('attachments.errors.upload_failed', { error: error.message }, 'Upload failed: {{error}}'));
        })
        .finally(function () {
            uploadButton.textContent = originalText;
            uploadButton.disabled = false;
        });
}

function loadAttachments(noteId) {
    fetch('/api/v1/notes/' + noteId + '/attachments', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to load attachments');
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                displayAttachments(data.attachments);
                renderAttachmentPreviews(noteId, data.attachments, data.entry || '');
            }
        })
        .catch(function () {
        });
}

function displayAttachments(attachments) {
    var container = document.getElementById('attachmentsList');
    if (!container) return;

    if (attachments.length === 0) {
        container.innerHTML = '<p>' + tr('attachments.empty', {}, 'No attachments') + '</p>';
        return;
    }

    var html = '';
    var titleView = tr('attachments.actions.view', {}, 'View');
    var titleDelete = tr('attachments.actions.delete', {}, 'Delete');
    for (var i = 0; i < attachments.length; i++) {
        var attachment = attachments[i];
        var fileSize = formatFileSize(attachment.file_size);
        var uploadDate = typeof window.poznoteFormatDateTime === 'function'
            ? window.poznoteFormatDateTime(attachment.uploaded_at, { defaultDateOnly: true })
            : new Date(attachment.uploaded_at).toLocaleDateString();

        html += '<div class="attachment-item">';
        html += '<div class="attachment-info">';
        var safeFilename = attachment.original_filename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        html += '<strong>' + safeFilename + '</strong><br>';
        html += '<small>' + fileSize + ' - ' + uploadDate + '</small>';
        html += '</div>';
        html += '<div class="attachment-actions">';
        html += '<button onclick="downloadAttachment(\'' + attachment.id + '\')" title="' + titleView + '">';
        html += '<i class="lucide lucide-eye"></i>';
        html += '</button>';
        html += '<button onclick="deleteAttachment(\'' + attachment.id + '\')" title="' + titleDelete + '" class="delete-btn">';
        html += '<i class="lucide lucide-trash-2"></i>';
        html += '</button>';
        html += '</div>';
        html += '</div>';
    }

    container.innerHTML = html;
}

function downloadAttachment(attachmentId, noteId) {
    var noteIdToUse = noteId || currentNoteIdForAttachments;
    if (!noteIdToUse) {
        showNotificationPopup(tr('attachments.errors.no_note_selected', {}, 'No note selected'), 'error');
        return;
    }
    window.open('/api/v1/notes/' + noteIdToUse + '/attachments/' + attachmentId, '_blank');
}

function deleteAttachment(attachmentId, noteId) {
    // NOTE: confirmation removed - delete immediately when called
    var noteIdToUse = noteId || currentNoteIdForAttachments;

    if (!noteIdToUse) {
        showNotificationPopup(tr('attachments.errors.no_note_selected', {}, 'No note selected'), 'error');
        return;
    }

    fetch('/api/v1/notes/' + noteIdToUse + '/attachments/' + attachmentId, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to delete attachment');
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Remove the attachment from the note editor DOM (HTML notes)
                var noteEntry = document.getElementById('entry' + noteIdToUse);
                if (noteEntry && document.body.contains(noteEntry)) {
                    var noteType = noteEntry.getAttribute('data-note-type') || 'note';

                    if (noteType === 'note') {
                        var imgs = noteEntry.querySelectorAll('img[src*="' + attachmentId + '"]');
                        var removedAny = false;
                        imgs.forEach(function (img) {
                            img._manuallyDeleted = true; // prevent MutationObserver from triggering deleteAttachment again
                            img.parentNode.removeChild(img);
                            removedAny = true;
                        });
                        if (removedAny && typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }
                    } else if (noteType === 'markdown') {
                        var editor = noteEntry.querySelector('.markdown-editor');
                        if (editor) {
                            var walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
                            var node;
                            var regex = new RegExp('!?(?:\\[[^\\]]*\\])?\\([^)]*' + attachmentId + '[^)]*\\)', 'gi');
                            var markdownRemoved = false;
                            while (node = walker.nextNode()) {
                                if (node.nodeValue.includes(attachmentId)) {
                                    node.nodeValue = node.nodeValue.replace(regex, '');
                                    markdownRemoved = true;
                                }
                            }
                            if (markdownRemoved) {
                                var inputEvent = new Event('input', { bubbles: true });
                                editor.dispatchEvent(inputEvent);
                            }
                        }
                    }
                }

                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                loadAttachments(noteIdToUse);
                updateAttachmentCountInMenu(noteIdToUse);
            } else {
                showNotificationPopup(tr('attachments.errors.deletion_failed', { error: data.message }, 'Deletion failed: {{error}}'), 'error');
            }
        })
        .catch(function (error) {
            showNotificationPopup(tr('attachments.errors.deletion_failed_generic', {}, 'Deletion failed'), 'error');
        });
}

function updateAttachmentCountInMenu(noteId) {
    fetch('/api/v1/notes/' + noteId + '/attachments', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to update attachment count');
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                var count = data.attachments.length;

                // Get the note content to check for inline images
                var noteContent = '';
                var noteEntry = document.getElementById('entry' + noteId);
                if (noteEntry) {
                    noteContent = noteEntry.innerHTML || '';
                }
                var effectiveNoteContent = noteContent || data.entry || '';

                renderAttachmentPreviews(noteId, data.attachments, effectiveNoteContent);

                // Calculate visible attachments count (excluding inline images)
                var visibleLinksCount = 0;
                for (var j = 0; j < data.attachments.length; j++) {
                    var attachment = data.attachments[j];
                    if (attachment.id && attachment.original_filename) {
                        var isActuallyInline = isEmbeddedImageAttachment(attachment, effectiveNoteContent);
                        if (!isActuallyInline) visibleLinksCount++;
                    }
                }

                var hasAttachmentIndicator = visibleLinksCount > 0;

                // Update dropdown menu
                var menu = document.getElementById('note-menu-' + noteId);
                if (menu) {
                    var attachmentItems = menu.querySelectorAll('.dropdown-item');
                    for (var i = 0; i < attachmentItems.length; i++) {
                        var item = attachmentItems[i];
                        if (item.innerHTML.includes('lucide-paperclip')) {
                            if (hasAttachmentIndicator) {
                                item.classList.add('has-attachments');
                            } else {
                                item.classList.remove('has-attachments');
                            }
                        }
                    }
                }

                // Update settings button
                var settingsBtn = document.getElementById('settings-btn-' + noteId);
                if (settingsBtn) {
                    if (hasAttachmentIndicator) {
                        settingsBtn.classList.add('has-attachments');
                    } else {
                        settingsBtn.classList.remove('has-attachments');
                    }
                }

                // Updates attachment buttons (mobile)
                var attachmentBtns = document.querySelectorAll('.btn-attachment[onclick*="' + noteId + '"]');
                for (var i = 0; i < attachmentBtns.length; i++) {
                    var btn = attachmentBtns[i];
                    if (hasAttachmentIndicator) {
                        btn.classList.add('has-attachments');
                    } else {
                        btn.classList.remove('has-attachments');
                    }
                }

                // Also update toolbar attachment button
                var toolbarAttachmentBtn = document.querySelector('.btn-attachment[data-note-id="' + noteId + '"]');
                if (toolbarAttachmentBtn) {
                    if (hasAttachmentIndicator) {
                        toolbarAttachmentBtn.classList.add('has-attachments');
                    } else {
                        toolbarAttachmentBtn.classList.remove('has-attachments');
                    }
                    // Update count in title
                    var attachmentTitle = tr('index.toolbar.attachments_with_count', { count: visibleLinksCount }, 'Attachments ({{count}})');
                    toolbarAttachmentBtn.setAttribute('title', attachmentTitle);
                }

                // Update the attachments row in the notes list (left column)
                var noteElement = document.getElementById('note' + noteId);
                if (noteElement) {
                    var existingAttachmentsRow = noteElement.querySelector('.note-attachments-row');

                    if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.inlineAttachmentPreviews === true) {
                        if (existingAttachmentsRow) {
                            existingAttachmentsRow.parentNode.removeChild(existingAttachmentsRow);
                        }
                        return;
                    }

                    if (count > 0 && data.attachments && data.attachments.length > 0) {
                        // Create or update the attachments row
                        if (!existingAttachmentsRow) {
                            // Create new attachments row
                            existingAttachmentsRow = document.createElement('div');
                            existingAttachmentsRow.className = 'note-attachments-row';

                            // Insert after tags-display div
                            var tagsDisplay = noteElement.querySelector('.tags-display');
                            if (tagsDisplay && tagsDisplay.nextSibling) {
                                tagsDisplay.parentNode.insertBefore(existingAttachmentsRow, tagsDisplay.nextSibling);
                            } else {
                                // Fallback: insert before the title
                                var titleElement = noteElement.querySelector('h4');
                                if (titleElement) {
                                    titleElement.parentNode.insertBefore(existingAttachmentsRow, titleElement);
                                }
                            }
                        }

                        // Build the HTML content
                        var openAttachmentsLabel = tr('attachments.actions.open_attachments', {}, 'Open attachments');
                        var attachmentsHtml = '<button type="button" class="icon-attachment-btn" title="' + openAttachmentsLabel + '" onclick="showAttachmentDialog(\'' + noteId + '\')" aria-label="' + openAttachmentsLabel + '"><span class="lucide lucide-paperclip icon_attachment"></span></button>';
                        attachmentsHtml += '<span class="note-attachments-list">';

                        var attachmentLinks = [];
                        var visibleLinksCountForRow = 0;
                        for (var k = 0; k < data.attachments.length; k++) {
                            var att = data.attachments[k];
                            if (att.id && att.original_filename) {
                                var isInline = isEmbeddedImageAttachment(att, effectiveNoteContent);

                                var safeFilename = att.original_filename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
                                var dlTitle = tr('attachments.actions.download', { filename: safeFilename }, 'Download {{filename}}');
                                var linkStyle = isInline ? ' style="display: none;"' : '';
                                var linkAttr = isInline ? ' data-is-inline-image="true"' : '';
                                attachmentLinks.push('<a href="#" class="attachment-link"' + linkAttr + linkStyle + ' onclick="downloadAttachment(\'' + att.id + '\', \'' + noteId + '\')" title="' + dlTitle + '">' + safeFilename + '</a>');
                                if (!isInline) visibleLinksCountForRow++;
                            }
                        }
                        attachmentsHtml += attachmentLinks.join(' ');
                        attachmentsHtml += '</span>';

                        existingAttachmentsRow.innerHTML = attachmentsHtml;

                        // Hide the entire row if no visible links
                        if (visibleLinksCountForRow === 0) {
                            existingAttachmentsRow.style.display = 'none';
                        } else {
                            existingAttachmentsRow.style.display = '';
                        }
                    } else if (existingAttachmentsRow) {
                        // Remove the attachments row if no attachments
                        existingAttachmentsRow.parentNode.removeChild(existingAttachmentsRow);
                    }
                }
            }
        })
        .catch(function () {
        });
}

function formatFileSize(bytes) {
    var unitBytes = tr('attachments.size.units.bytes', {}, 'B');
    var unitKB = tr('attachments.size.units.kb', {}, 'KB');
    var unitMB = tr('attachments.size.units.mb', {}, 'MB');
    var unitGB = tr('attachments.size.units.gb', {}, 'GB');
    if (bytes === 0) return '0 ' + unitBytes;
    var k = 1024;
    var sizes = [unitBytes, unitKB, unitMB, unitGB];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeAttachmentPreviewHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAttachmentPreviewMimeType(attachment) {
    var mimeType = String(attachment.file_type || attachment.mime_type || attachment.type || '').toLowerCase();
    if (mimeType) return mimeType;

    var filename = attachment.original_filename || attachment.filename || '';
    var extension = filename.split('.').pop().toLowerCase();
    var extensionMap = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        bmp: 'image/bmp',
        pdf: 'application/pdf',
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        m4v: 'video/x-m4v',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        flac: 'audio/flac'
    };

    return extensionMap[extension] || '';
}

function getAttachmentPreviewKind(attachment) {
    var mimeType = getAttachmentPreviewMimeType(attachment);
    var filename = attachment.original_filename || attachment.filename || '';
    var extension = filename.split('.').pop().toLowerCase();

    if (mimeType.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].indexOf(extension) !== -1) {
        return 'image';
    }
    if (mimeType === 'application/pdf' || extension === 'pdf') {
        return 'pdf';
    }
    if (mimeType.indexOf('video/') === 0 || ['mp4', 'webm', 'mov', 'm4v'].indexOf(extension) !== -1) {
        return 'video';
    }
    if (mimeType.indexOf('audio/') === 0 || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].indexOf(extension) !== -1) {
        return 'audio';
    }

    return 'file';
}

function escapeAttachmentRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEmbeddedImageAttachment(attachment, content) {
    if (!attachment || !attachment.id || !content || getAttachmentPreviewKind(attachment) !== 'image') return false;

    var fragmentPattern = 'attachments\\/' + escapeAttachmentRegExp(attachment.id) + '(?:[?#][^\\s"\'<>)]*)?(?=$|[\\s"\'<>\\)])';
    var htmlImagePattern = new RegExp('<img\\b[^>]*' + fragmentPattern, 'i');
    var markdownImagePattern = new RegExp('!\\[[^\\]]*\\]\\([^)]*' + fragmentPattern + '[^)]*\\)', 'i');
    var noteContent = String(content);

    return htmlImagePattern.test(noteContent) || markdownImagePattern.test(noteContent);
}

function isAttachmentReferencedInContent(attachment, content) {
    if (!attachment || !attachment.id || !content) return false;

    var fragment = 'attachments/' + attachment.id;
    return content.indexOf(fragment) !== -1 ||
        content.indexOf(encodeURIComponent(fragment)) !== -1;
}

function buildAttachmentPreviewUrl(noteId, attachmentId, forceDownload) {
    var url = '/api/v1/notes/' + encodeURIComponent(noteId) + '/attachments/' + encodeURIComponent(attachmentId);
    var params = [];
    var workspace = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : (window.selectedWorkspace || selectedWorkspace || '');
    if (workspace) {
        params.push('workspace=' + encodeURIComponent(workspace));
    }
    if (forceDownload) {
        params.push('download=1');
    }
    return params.length ? url + '?' + params.join('&') : url;
}

function buildAttachmentAudioPreviewUrl(noteId, attachmentId) {
    var params = [
        'note=' + encodeURIComponent(noteId),
        'attachment=' + encodeURIComponent(attachmentId)
    ];
    var workspace = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : (window.selectedWorkspace || selectedWorkspace || '');
    if (workspace) {
        params.push('workspace=' + encodeURIComponent(workspace));
    }
    return '/audio_player.php?' + params.join('&');
}

function buildAttachmentPreviewCard(noteId, attachment) {
    var attachmentId = attachment.id;
    var filename = attachment.original_filename || attachment.filename || attachmentId;
    var kind = getAttachmentPreviewKind(attachment);
    var fileUrl = buildAttachmentPreviewUrl(noteId, attachmentId, false);
    var downloadUrl = buildAttachmentPreviewUrl(noteId, attachmentId, true);
    var safeFilename = escapeAttachmentPreviewHtml(filename);
    var safeFileUrl = escapeAttachmentPreviewHtml(fileUrl);
    var safeDownloadUrl = escapeAttachmentPreviewHtml(downloadUrl);
    var sizeLabel = attachment.file_size ? formatFileSize(attachment.file_size) : '';
    var safeSize = escapeAttachmentPreviewHtml(sizeLabel);
    var iconClass = 'lucide lucide-file-text';

    if (kind === 'image') iconClass = 'lucide lucide-file-image';
    else if (kind === 'video') iconClass = 'lucide lucide-file-video';
    else if (kind === 'audio') iconClass = 'lucide lucide-music';

    var mediaHtml = '';
    if (kind === 'image') {
        mediaHtml = '<a class="note-attachment-preview-media" href="' + safeFileUrl + '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' + safeFileUrl + '" alt="' + safeFilename + '" loading="lazy" decoding="async">' +
            '</a>';
    } else if (kind === 'pdf') {
        mediaHtml = '<iframe class="note-attachment-preview-media note-attachment-preview-frame" src="' + safeFileUrl + '" title="' + safeFilename + '" loading="lazy"></iframe>';
    } else if (kind === 'video') {
        mediaHtml = '<div class="note-attachment-preview-media"><video controls preload="metadata" playsinline src="' + safeFileUrl + '"></video></div>';
    } else if (kind === 'audio') {
        var audioUrl = escapeAttachmentPreviewHtml(buildAttachmentAudioPreviewUrl(noteId, attachmentId));
        mediaHtml = '<iframe class="note-attachment-preview-media note-attachment-preview-audio-frame" src="' + audioUrl + '" title="' + safeFilename + '" scrolling="no" frameborder="0" allow="autoplay" loading="lazy"></iframe>';
    } else {
        mediaHtml = '<a class="note-attachment-preview-file-card" href="' + safeDownloadUrl + '" title="' + escapeAttachmentPreviewHtml(tr('attachments.actions.download', { filename: filename }, 'Download ' + filename)) + '">' +
            '<i class="' + iconClass + '"></i>' +
            '<span class="note-attachment-preview-file-meta">' +
            '<span class="note-attachment-preview-file-name">' + safeFilename + '</span>' +
            (safeSize ? '<span class="note-attachment-preview-size">' + safeSize + '</span>' : '') +
            '</span>' +
            '</a>';
    }

    var captionHtml = '';
    if (kind !== 'file') {
        captionHtml = '<figcaption class="note-attachment-preview-caption">' +
            '<i class="' + iconClass + '"></i>' +
            '<a href="' + safeDownloadUrl + '" title="' + escapeAttachmentPreviewHtml(tr('attachments.actions.download', { filename: filename }, 'Download ' + filename)) + '">' + safeFilename + '</a>' +
            (safeSize ? '<span class="note-attachment-preview-size">' + safeSize + '</span>' : '') +
            '</figcaption>';
    }

    return '<figure class="note-attachment-preview note-attachment-preview-' + kind + '" data-attachment-id="' + escapeAttachmentPreviewHtml(attachmentId) + '" contenteditable="false">' +
        mediaHtml +
        captionHtml +
        '</figure>';
}

function resolveAttachmentPreviewSetting(callback) {
    if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.inlineAttachmentPreviews === true) {
        callback(true);
        return;
    }

    fetch('/api/v1/settings/attachment_previews_in_note', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to load setting');
            return response.json();
        })
        .then(function (data) {
            var enabled = !!(data && data.success && (data.value === '1' || data.value === 'true'));
            window.POZNOTE_CONFIG = window.POZNOTE_CONFIG || {};
            window.POZNOTE_CONFIG.inlineAttachmentPreviews = enabled;
            callback(enabled);
        })
        .catch(function () {
            callback(false);
        });
}

function renderAttachmentPreviewsNow(noteId, attachments, noteContent) {
    var existing = document.getElementById('attachment-previews-' + noteId);
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var content = noteContent || noteEntry.innerHTML || '';
    var cards = [];
    (attachments || []).forEach(function (attachment) {
        if (!attachment || !attachment.id) return;
        if (isAttachmentReferencedInContent(attachment, content)) return;
        cards.push(buildAttachmentPreviewCard(noteId, attachment));
    });

    if (cards.length === 0) {
        if (existing) existing.remove();
        return;
    }

    var html = cards.join('');
    var wrapper = existing;
    if (existing) {
        existing.innerHTML = html;
    } else {
        wrapper = document.createElement('div');
        wrapper.id = 'attachment-previews-' + noteId;
        wrapper.className = 'note-attachment-previews';
        wrapper.setAttribute('data-note-id', noteId);
        wrapper.setAttribute('contenteditable', 'false');
        wrapper.innerHTML = html;
    }

    if (noteEntry.parentNode && wrapper.nextElementSibling !== noteEntry) {
        noteEntry.parentNode.insertBefore(wrapper, noteEntry);
    }
}

function renderAttachmentPreviews(noteId, attachments, noteContent) {
    var existing = document.getElementById('attachment-previews-' + noteId);

    resolveAttachmentPreviewSetting(function (enabled) {
        if (!enabled) {
            if (existing) existing.remove();
            return;
        }

        renderAttachmentPreviewsNow(noteId, attachments, noteContent);
    });
}

function refreshAttachmentPreviewsForNote(noteId) {
    if (!noteId) return;

    fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/attachments', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to load attachments');
            return response.json();
        })
        .then(function (data) {
            if (!data || !data.success) return;
            var noteEntry = document.getElementById('entry' + noteId);
            renderAttachmentPreviews(noteId, data.attachments || [], data.entry || (noteEntry ? noteEntry.innerHTML : ''));
        })
        .catch(function () {
        });
}

function refreshAttachmentPreviewsForVisibleNotes() {
    var entries = document.querySelectorAll('.noteentry[data-note-id]');
    entries.forEach(function (entry) {
        refreshAttachmentPreviewsForNote(entry.getAttribute('data-note-id'));
    });
}

window.refreshAttachmentPreviewsForNote = refreshAttachmentPreviewsForNote;
window.refreshAttachmentPreviewsForVisibleNotes = refreshAttachmentPreviewsForVisibleNotes;

document.addEventListener('DOMContentLoaded', function () {
    refreshAttachmentPreviewsForVisibleNotes();
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        window.POZNOTE_CONFIG = window.POZNOTE_CONFIG || {};
        delete window.POZNOTE_CONFIG.inlineAttachmentPreviews;
        refreshAttachmentPreviewsForVisibleNotes();
    }
});

function createUploadPlaceholderId(prefix) {
    return (prefix || 'upload') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function handleImageFilesAndInsert(files, dropTarget) {
    if (!files || files.length === 0) return;

    for (var i = 0; i < files.length; i++) {
        handleSingleImageFile(files[i], dropTarget);
    }
}

function handleSingleImageFile(file, dropTarget) {
    if (!file.type || !file.type.startsWith('image/')) return;

    // Check if it's a markdown note
    var noteEntry = dropTarget;
    var isMarkdown = noteEntry && noteEntry.hasAttribute('data-note-type') &&
        noteEntry.getAttribute('data-note-type') === 'markdown';

    if (isMarkdown) {
        handleMarkdownImageUpload(file, dropTarget, noteEntry);
    } else {
        handleHTMLImageInsert(file, dropTarget);
    }
}

function _getCmApi() {
    return window.PoznoteMarkdownCodeMirror || null;
}

function _isCmEditor(editor) {
    var api = _getCmApi();
    return !!(api && editor && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(editor));
}

function handleMarkdownImageUpload(file, dropTarget, noteEntry) {
    var noteId = noteEntry.id.replace('entry', '');

    var editor = dropTarget ? dropTarget.querySelector('.markdown-editor') : null;
    var cmApi = _getCmApi();
    var isCm = editor && _isCmEditor(editor);

    // ── CodeMirror path ──────────────────────────────────────────────
    if (isCm && cmApi && typeof cmApi.replaceRange === 'function' && typeof cmApi.getSelectionOffsets === 'function') {
        var safeName = String(file.name || 'image').replace(/[\r\n\t]+/g, ' ').trim().replace(/[\\\[\]]/g, '\\$&') || 'image';
        var offsets = cmApi.getSelectionOffsets(editor);
        var insertPos = offsets ? offsets.end : 0;
        var loadingText = '![Uploading ' + safeName + '...]()';
        var uniqueToken = '![Uploading_' + safeName + '_' + Date.now() + '...]()';

        // Insert placeholder, then overwrite with unique token for safe find-replace
        cmApi.replaceRange(editor, insertPos, insertPos, loadingText);
        cmApi.replaceRange(editor, insertPos, insertPos + loadingText.length, uniqueToken);

        // Trigger initial save marker
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }

        var formData = new FormData();
        formData.append('note_id', noteId);
        formData.append('file', file);
        if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
            formData.append('workspace', selectedWorkspace);
        }

        fetch('/api/v1/notes/' + noteId + '/attachments', {
            method: 'POST',
            body: formData
        })
            .then(function (response) {
                if (!response.ok) throw new Error('Failed to upload attachment');
                return response.json();
            })
            .then(function (data) {
                if (data.success) {
                    var borderSuffix = window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.defaultImageBorderNoPadding ? '{.img-with-border-no-padding}' : '';
                    var imageMarkdown = '![' + safeName + '](/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id + ')' + borderSuffix;

                    // Replace unique token with final markdown
                    if (typeof cmApi.getValue === 'function') {
                        var current = cmApi.getValue(editor);
                        var idx = current.indexOf(uniqueToken);
                        if (idx !== -1) {
                            cmApi.replaceRange(editor, idx, idx + uniqueToken.length, imageMarkdown);
                        }
                    }

                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }

                    if (typeof reinitializeImageClickHandlers === 'function') {
                        setTimeout(function () { reinitializeImageClickHandlers(); }, 200);
                    }

                    updateAttachmentCountInMenu(noteId);

                    if (typeof currentNoteIdForAttachments !== 'undefined' && currentNoteIdForAttachments == noteId) {
                        loadAttachments(noteId);
                    }

                    if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }

                    setTimeout(function () {
                        if (typeof window.saveNoteImmediately === 'function') {
                            window.saveNoteImmediately();
                        }
                    }, 500);
                } else {
                    // Remove placeholder on error
                    if (typeof cmApi.getValue === 'function') {
                        var cur = cmApi.getValue(editor);
                        var i = cur.indexOf(uniqueToken);
                        if (i !== -1) {
                            cmApi.replaceRange(editor, i, i + uniqueToken.length, '');
                        }
                    }
                    if (typeof showNotificationPopup === 'function') {
                        showNotificationPopup('Upload failed: ' + data.message, 'error');
                    }
                }
            })
            .catch(function (error) {
                if (typeof cmApi.getValue === 'function') {
                    var cur = cmApi.getValue(editor);
                    var i = cur.indexOf(uniqueToken);
                    if (i !== -1) {
                        cmApi.replaceRange(editor, i, i + uniqueToken.length, '');
                    }
                }
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Upload failed: ' + error.message, 'error');
                }
            });

        return;
    }

    // ── Legacy contenteditable path ───────────────────────────────────
    // Show loading indicator
    var loadingText = '![Uploading ' + file.name + '...]()';
    var loadingTextNode = insertMarkdownAtCursor(loadingText, dropTarget);

    // Trigger initial save for loading text
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified(); // Mark note as edited
    }

    // Upload the file
    var formData = new FormData();
    formData.append('note_id', noteId);
    formData.append('file', file);
    if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
        formData.append('workspace', selectedWorkspace);
    }

    fetch('/api/v1/notes/' + noteId + '/attachments', {
        method: 'POST',
        body: formData
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to upload attachment');
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Remplacer le texte de chargement par la syntaxe markdown finale
                var borderSuffix = window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.defaultImageBorderNoPadding ? '{.img-with-border-no-padding}' : '';
                var imageMarkdown = '![' + file.name + '](/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id + ')' + borderSuffix;
                replaceLoadingText(loadingText, imageMarkdown, dropTarget, loadingTextNode);

                // Marquer la note comme modifiée
                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }

                // Re-initialize image click handlers after markdown image insertion
                if (typeof reinitializeImageClickHandlers === 'function') {
                    setTimeout(function () {
                        reinitializeImageClickHandlers();
                    }, 200); // Wait for markdown rendering
                }

                // Rafraîchir la liste des pièces jointes et le compteur dans le menu
                updateAttachmentCountInMenu(noteId);

                // Si le modal des pièces jointes est ouvert pour cette note, rafraîchir la liste
                if (typeof currentNoteIdForAttachments !== 'undefined' && currentNoteIdForAttachments == noteId) {
                    loadAttachments(noteId);
                }

                if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }

                // Trigger automatic save after a short delay
                setTimeout(function () {
                    if (typeof window.saveNoteImmediately === 'function') {
                        window.saveNoteImmediately(); // Save to server
                    }
                }, 500); // Longer delay for markdown to allow upload completion
            } else {
                // Remove loading text in case of error
                replaceLoadingText(loadingText, '', dropTarget, loadingTextNode);
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Upload failed: ' + data.message, 'error');
                }
            }
        })
        .catch(function (error) {
            replaceLoadingText(loadingText, '', dropTarget, loadingTextNode);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup('Upload failed: ' + error.message, 'error');
            }
        });
}

function insertMarkdownAtCursor(text, dropTarget) {
    // Check if cursor is in an editable area for manual insertions
    // (dropTarget indicates a drag-and-drop, so we don't check)
    if (!dropTarget && !isCursorInEditableNote()) {
        window.showCursorWarning();
        return null;
    }

    // For markdown notes, insert into the markdown editor
    var editor = dropTarget ? dropTarget.querySelector('.markdown-editor') : null;
    if (!editor) {
        // If no dropTarget, look for current editor
        var sel = window.getSelection();
        if (sel.rangeCount) {
            var range = sel.getRangeAt(0);
            var container = range.commonAncestorContainer;
            if (container.nodeType === 3) container = container.parentNode;
            editor = container.closest('.markdown-editor');
        }
    }

    if (editor) {
        var sel = window.getSelection();
        if (sel.rangeCount) {
            var range = sel.getRangeAt(0);
            if (editor.contains(range.commonAncestorContainer) ||
                editor === range.commonAncestorContainer) {

                // Insérer le texte à la position du curseur
                range.deleteContents();
                var textNode = document.createTextNode(text);
                range.insertNode(textNode);

                // Placer le curseur après le texte inséré
                range.setStartAfter(textNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);

                return textNode;
            }
        }

        // Fallback : ajouter à la fin sans écraser les sauts de ligne
        // Créer un node de texte pour le retour à la ligne et le nouveau texte
        var newLineNode = document.createTextNode('\n' + text);
        editor.appendChild(newLineNode);
        editor.focus();

        // Placer le curseur à la fin
        var range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        return newLineNode;
    }

    return null;
}

function replaceLoadingText(oldText, newText, dropTarget, textNodeHint) {
    var editor = dropTarget.querySelector('.markdown-editor');
    if (editor) {
        var replaced = false;

        if (textNodeHint && textNodeHint.parentNode && editor.contains(textNodeHint)) {
            var hintedText = textNodeHint.textContent || '';
            var hintedIndex = hintedText.indexOf(oldText);

            if (hintedIndex !== -1) {
                textNodeHint.textContent = hintedText.replace(oldText, newText);

                try {
                    var hintedSelection = window.getSelection();
                    var hintedRange = document.createRange();
                    hintedRange.setStart(textNodeHint, hintedIndex + newText.length);
                    hintedRange.collapse(true);
                    hintedSelection.removeAllRanges();
                    hintedSelection.addRange(hintedRange);
                } catch (e) { }

                replaced = true;
            }
        }

        // Parcourir les nodes de texte pour remplacer oldText sans perdre les sauts de ligne
        if (!replaced) {
            var walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            var textNodes = [];
            var node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }

            // Chercher et remplacer dans les nodes de texte
            for (var i = 0; i < textNodes.length; i++) {
                var textNode = textNodes[i];
                var text = textNode.textContent;
                var index = text.indexOf(oldText);
                if (index !== -1) {
                    textNode.textContent = text.replace(oldText, newText);

                    // Placer le curseur après le texte inséré sans le sélectionner
                    try {
                        var sel = window.getSelection();
                        var newRange = document.createRange();
                        newRange.setStart(textNode, index + newText.length);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    } catch (e) { }

                    break; // On remplace seulement la première occurrence
                }
            }
        }

        // Déclencher l'événement input pour que les listeners de markdown soient informés
        var event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
    }
}

function handleHTMLImageInsert(file, dropTarget) {
    // Get the note ID from the drop target
    var noteId = dropTarget.id.replace('entry', '');

    if (!noteId || noteId === '' || noteId === 'search') {
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup('Cannot upload image: note ID not found', 'error');
        }
        return;
    }

    // Insert a placeholder while uploading
    var placeholderId = createUploadPlaceholderId('image-upload');
    var placeholderHtml = '<img src="" alt="' + tr('attachments.upload.uploading', {}, 'Uploading...') + '" class="image-uploading-placeholder" data-upload-placeholder-id="' + placeholderId + '" style="opacity: 0.5; min-width: 100px; min-height: 100px; background: #f0f0f0; border: 2px dashed #ccc;" />';

    var sel = window.getSelection();
    var inserted = false;
    var placeholderImg = null;

    if (sel && sel.rangeCount) {
        var range = sel.getRangeAt(0);
        var container = range.commonAncestorContainer;
        var noteEntry = container.nodeType === 1 ?
            container.closest('.noteentry') :
            container.parentElement.closest('.noteentry');

        if (noteEntry === dropTarget) {
            inserted = insertHTMLAtSelection(placeholderHtml);
            placeholderImg = dropTarget.querySelector('[data-upload-placeholder-id="' + placeholderId + '"]');
        }
    }

    if (!inserted && dropTarget) {
        dropTarget.insertAdjacentHTML('beforeend', placeholderHtml);
        placeholderImg = dropTarget.querySelector('[data-upload-placeholder-id="' + placeholderId + '"]');
    }

    // Upload the file as attachment
    var formData = new FormData();
    formData.append('note_id', noteId);
    formData.append('file', file);
    if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
        formData.append('workspace', selectedWorkspace);
    }

    fetch('/api/v1/notes/' + noteId + '/attachments', {
        method: 'POST',
        body: formData
    })
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to upload attachment');
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Replace placeholder with actual image
                var imgSrc = '/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id;

                if (placeholderImg) {
                    placeholderImg.src = imgSrc;
                    placeholderImg.alt = file.name;
                    placeholderImg.classList.remove('image-uploading-placeholder');
                    placeholderImg.removeAttribute('data-upload-placeholder-id');
                    placeholderImg.style.opacity = '';
                    placeholderImg.style.minWidth = '';
                    placeholderImg.style.minHeight = '';
                    placeholderImg.style.background = '';
                    placeholderImg.style.border = '';
                    placeholderImg.setAttribute('loading', 'lazy');
                    placeholderImg.setAttribute('decoding', 'async');
                    if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.defaultImageBorderNoPadding) {
                        placeholderImg.classList.add('img-with-border-no-padding');
                    }
                }

                // Update the global noteid to the target note for proper saving
                window.noteid = noteId;

                // Trigger automatic save after image insertion
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }

                // Re-initialize image click handlers for the newly inserted image
                if (typeof reinitializeImageClickHandlers === 'function') {
                    setTimeout(function () {
                        reinitializeImageClickHandlers();
                    }, 50);
                }

                // Update attachment count in menu
                updateAttachmentCountInMenu(noteId);

                // Save after a short delay
                setTimeout(function () {
                    if (typeof saveNoteToServer === 'function') {
                        saveNoteToServer();
                    } else if (typeof window.saveNoteImmediately === 'function') {
                        window.saveNoteImmediately();
                    }
                }, 100);
            } else {
                // Remove placeholder on error
                if (placeholderImg) {
                    placeholderImg.remove();
                }
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Upload failed: ' + data.message, 'error');
                }
            }
        })
        .catch(function (error) {
            // Remove placeholder on error
            if (placeholderImg) {
                placeholderImg.remove();
            }
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup('Upload failed: ' + error.message, 'error');
            }
        });
}

function insertHTMLAtSelection(html) {
    // Check if cursor is in an editable area
    if (!isCursorInEditableNote()) {
        window.showCursorWarning();
        return false;
    }

    try {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;

        var range = sel.getRangeAt(0);
        range.deleteContents();

        var el = document.createElement('div');
        el.innerHTML = html;

        var frag = document.createDocumentFragment();
        var node, lastNode;

        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node);
        }

        range.insertNode(frag);

        // Place cursor after inserted content
        if (lastNode) {
            try {
                if (lastNode.nodeType === 1 && lastNode.tagName && lastNode.tagName.toUpperCase() === 'IMG') {
                    // For images, create new paragraph after
                    var newP = document.createElement('div');
                    newP.innerHTML = '<br>';
                    lastNode.parentNode.insertBefore(newP, lastNode.nextSibling);

                    range = document.createRange();
                    range.setStart(newP, 0);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } else {
                    range = range.cloneRange();
                    range.setStartAfter(lastNode);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            } catch (e) {
                // Fallback
                range = range.cloneRange();
                range.setStartAfter(lastNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}
