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
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                displayAttachments(data.attachments);
            }
        })
        .catch(function (error) {
            console.log('Error loading attachments:', error);
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
        var uploadDate = new Date(attachment.uploaded_at).toLocaleDateString();

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
        .then(function (response) { return response.json(); })
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
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                var count = data.attachments.length;

                // Get the note content to check for inline images
                var noteContent = '';
                var noteEntry = document.getElementById('entry' + noteId);
                if (noteEntry) {
                    noteContent = noteEntry.innerHTML || '';
                }

                // Calculate visible attachments count (excluding inline images)
                var visibleLinksCount = 0;
                for (var j = 0; j < data.attachments.length; j++) {
                    var attachment = data.attachments[j];
                    if (attachment.id && attachment.original_filename) {
                        var isActuallyInline = false;
                        var mimeType = attachment.mime_type || '';
                        var isImage = mimeType.startsWith('image/');
                        if (!isImage && attachment.original_filename) {
                            var ext = attachment.original_filename.split('.').pop().toLowerCase();
                            isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].indexOf(ext) !== -1;
                        }
                        if (isImage) {
                            var pattern = 'attachments/' + attachment.id;
                            isActuallyInline = noteContent.indexOf(pattern) !== -1 ||
                                noteContent.indexOf(encodeURIComponent(pattern)) !== -1;
                        }
                        if (!isActuallyInline) visibleLinksCount++;
                    }
                }

                var hasVisibleAttachments = visibleLinksCount > 0;

                // Update dropdown menu
                var menu = document.getElementById('note-menu-' + noteId);
                if (menu) {
                    var attachmentItems = menu.querySelectorAll('.dropdown-item');
                    for (var i = 0; i < attachmentItems.length; i++) {
                        var item = attachmentItems[i];
                        if (item.innerHTML.includes('lucide-paperclip')) {
                            if (hasVisibleAttachments) {
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
                    if (hasVisibleAttachments) {
                        settingsBtn.classList.add('has-attachments');
                    } else {
                        settingsBtn.classList.remove('has-attachments');
                    }
                }

                // Updates attachment buttons (mobile)
                var attachmentBtns = document.querySelectorAll('.btn-attachment[onclick*="' + noteId + '"]');
                for (var i = 0; i < attachmentBtns.length; i++) {
                    var btn = attachmentBtns[i];
                    if (hasVisibleAttachments) {
                        btn.classList.add('has-attachments');
                    } else {
                        btn.classList.remove('has-attachments');
                    }
                }

                // Also update toolbar attachment button
                var toolbarAttachmentBtn = document.querySelector('.btn-attachment[data-note-id="' + noteId + '"]');
                if (toolbarAttachmentBtn) {
                    if (hasVisibleAttachments) {
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
                                // Check if this is an image that's displayed inline in the note content
                                // Inline images (pasted) are hidden from the attachments list
                                var isInline = false;
                                var mime = att.mime_type || '';
                                var isImg = mime.startsWith('image/');

                                // Fallback to extension check
                                if (!isImg && att.original_filename) {
                                    var extCheck = att.original_filename.split('.').pop().toLowerCase();
                                    isImg = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].indexOf(extCheck) !== -1;
                                }

                                if (isImg) {
                                    // Look for the attachment ID specifically in the content
                                    var patternCheck = 'attachments/' + att.id;
                                    isInline = noteContent.indexOf(patternCheck) !== -1 ||
                                        noteContent.indexOf(encodeURIComponent(patternCheck)) !== -1;
                                }

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
        .catch(function (error) {
            console.log('Counter update error:', error);
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

function handleMarkdownImageUpload(file, dropTarget, noteEntry) {
    var noteId = noteEntry.id.replace('entry', '');

    // Show loading indicator
    var loadingText = '![Uploading ' + file.name + '...]()';
    insertMarkdownAtCursor(loadingText, dropTarget);

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
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Remplacer le texte de chargement par la syntaxe markdown finale
                var imageMarkdown = '![' + file.name + '](/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id + ')';
                replaceLoadingText(loadingText, imageMarkdown, dropTarget);

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

                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
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
                replaceLoadingText(loadingText, '', dropTarget);
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Upload failed: ' + data.message, 'error');
                }
            }
        })
        .catch(function (error) {
            replaceLoadingText(loadingText, '', dropTarget);
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
        return;
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

                return;
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
    }
}

function replaceLoadingText(oldText, newText, dropTarget) {
    var editor = dropTarget.querySelector('.markdown-editor');
    if (editor) {
        // Parcourir les nodes de texte pour remplacer oldText sans perdre les sauts de ligne
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
    var placeholderHtml = '<img src="" alt="' + tr('attachments.upload.uploading', {}, 'Uploading...') + '" class="image-uploading-placeholder" style="opacity: 0.5; min-width: 100px; min-height: 100px; background: #f0f0f0; border: 2px dashed #ccc;" />';

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
            placeholderImg = dropTarget.querySelector('.image-uploading-placeholder');
        }
    }

    if (!inserted && dropTarget) {
        dropTarget.insertAdjacentHTML('beforeend', placeholderHtml);
        placeholderImg = dropTarget.querySelector('.image-uploading-placeholder');
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
                    placeholderImg.style.opacity = '';
                    placeholderImg.style.minWidth = '';
                    placeholderImg.style.minHeight = '';
                    placeholderImg.style.background = '';
                    placeholderImg.style.border = '';
                    placeholderImg.setAttribute('loading', 'lazy');
                    placeholderImg.setAttribute('decoding', 'async');
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
