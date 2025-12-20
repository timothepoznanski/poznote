// Attached file and image drag management

function tr(key, vars, fallback) {
    try {
        if (typeof window !== 'undefined' && typeof window.t === 'function') {
            return window.t(key, vars || {}, fallback);
        }
    } catch (e) {
        // ignore
    }
    let text = (fallback !== undefined && fallback !== null) ? String(fallback) : String(key);
    if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach((k) => {
            text = text.replaceAll('{{' + k + '}}', String(vars[k]));
        });
    }
    return text;
}

// Utility functions to check cursor position
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
    var ws = selectedWorkspace || 'Poznote';
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
    formData.append('action', 'upload');
    formData.append('note_id', currentNoteIdForAttachments);
    formData.append('file', file);
    
    fetch('api_attachments.php', {
        method: 'POST',
        body: formData
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error(tr('attachments.errors.http_error', { status: response.status }, 'HTTP Error: {{status}}'));
        }
        return response.text();
    })
    .then(function(text) {
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
            
            loadAttachments(currentNoteIdForAttachments);
            updateAttachmentCountInMenu(currentNoteIdForAttachments);
        } else {
            showAttachmentError(tr('attachments.errors.upload_failed', { error: data.message }, 'Upload failed: {{error}}'));
        }
    })
    .catch(function(error) {
        showAttachmentError(tr('attachments.errors.upload_failed', { error: error.message }, 'Upload failed: {{error}}'));
    })
    .finally(function() {
        uploadButton.textContent = originalText;
        uploadButton.disabled = false;
    });
}

function loadAttachments(noteId) {
    fetch('api_attachments.php?action=list&note_id=' + noteId)
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            displayAttachments(data.attachments);
        }
    })
    .catch(function(error) {
        console.log('Error loading attachments:', error);
    });
}

function displayAttachments(attachments) {
    var container = document.getElementById('attachmentsList');
    
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
        html += '<strong>' + attachment.original_filename + '</strong><br>';
        html += '<small>' + fileSize + ' - ' + uploadDate + '</small>';
        html += '</div>';
        html += '<div class="attachment-actions">';
    html += '<button onclick="downloadAttachment(\'' + attachment.id + '\')" title="' + titleView + '">';
    html += '<i class="fa-eye"></i>';
        html += '</button>';
        html += '<button onclick="deleteAttachment(\'' + attachment.id + '\')" title="' + titleDelete + '" class="delete-btn">';
        html += '<i class="fa-trash"></i>';
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
    window.open('api_attachments.php?action=download&note_id=' + noteIdToUse + '&attachment_id=' + attachmentId, '_blank');
}

function deleteAttachment(attachmentId) {
    // NOTE: confirmation removed - delete immediately when called
    if (!currentNoteIdForAttachments) {
        showNotificationPopup(tr('attachments.errors.no_note_selected', {}, 'No note selected'), 'error');
        return;
    }

    var formData = new FormData();
    formData.append('action', 'delete');
    formData.append('note_id', currentNoteIdForAttachments);
    formData.append('attachment_id', attachmentId);
    
    fetch('api_attachments.php', {
        method: 'POST',
        body: formData
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            loadAttachments(currentNoteIdForAttachments);
            updateAttachmentCountInMenu(currentNoteIdForAttachments);
        } else {
            showNotificationPopup(tr('attachments.errors.deletion_failed', { error: data.message }, 'Deletion failed: {{error}}'), 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup(tr('attachments.errors.deletion_failed_generic', {}, 'Deletion failed'), 'error');
    });
}

function updateAttachmentCountInMenu(noteId) {
    fetch('api_attachments.php?action=list&note_id=' + noteId)
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var count = data.attachments.length;
            var hasAttachments = count > 0;
            
            // Update dropdown menu
            var menu = document.getElementById('note-menu-' + noteId);
            if (menu) {
                var attachmentItems = menu.querySelectorAll('.dropdown-item');
                for (var i = 0; i < attachmentItems.length; i++) {
                    var item = attachmentItems[i];
                    if (item.innerHTML.includes('fa-paperclip')) {
                        if (hasAttachments) {
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
                if (hasAttachments) {
                    settingsBtn.classList.add('has-attachments');
                } else {
                    settingsBtn.classList.remove('has-attachments');
                }
            }
            
            // Updates attachment buttons (mobile)
            var attachmentBtns = document.querySelectorAll('.btn-attachment[onclick*="' + noteId + '"]');
            for (var i = 0; i < attachmentBtns.length; i++) {
                var btn = attachmentBtns[i];
                if (hasAttachments) {
                    btn.classList.add('has-attachments');
                } else {
                    btn.classList.remove('has-attachments');
                }
            }
            
            // Update the attachments row in the notes list (left column)
            var noteElement = document.getElementById('note' + noteId);
            if (noteElement) {
                var existingAttachmentsRow = noteElement.querySelector('.note-attachments-row');
                
                if (hasAttachments && data.attachments && data.attachments.length > 0) {
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
                    var attachmentsHtml = '<button type="button" class="icon-attachment-btn" title="' + openAttachmentsLabel + '" onclick="showAttachmentDialog(\'' + noteId + '\')" aria-label="' + openAttachmentsLabel + '"><span class="fa-paperclip icon_attachment"></span></button>';
                    attachmentsHtml += '<span class="note-attachments-list">';
                    
                    var attachmentLinks = [];
                    for (var j = 0; j < data.attachments.length; j++) {
                        var attachment = data.attachments[j];
                        if (attachment.id && attachment.original_filename) {
                            var safeFilename = attachment.original_filename.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            var dlTitle = tr('attachments.actions.download', { filename: safeFilename }, 'Download {{filename}}');
                            attachmentLinks.push('<a href="#" class="attachment-link" onclick="downloadAttachment(\'' + attachment.id + '\', \'' + noteId + '\')" title="' + dlTitle + '">' + safeFilename + '</a>');
                        }
                    }
                    attachmentsHtml += attachmentLinks.join(' ');
                    attachmentsHtml += '</span>';
                    
                    existingAttachmentsRow.innerHTML = attachmentsHtml;
                } else if (existingAttachmentsRow) {
                    // Remove the attachments row if no attachments
                    existingAttachmentsRow.parentNode.removeChild(existingAttachmentsRow);
                }
            }
        }
    })
    .catch(function(error) {
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

// Image drag & drop management
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
    formData.append('action', 'upload');
    formData.append('note_id', noteId);
    formData.append('file', file);
    if (typeof selectedWorkspace !== 'undefined') {
        formData.append('workspace', selectedWorkspace || 'Poznote');
    }
    
    fetch('api_attachments.php', {
        method: 'POST',
        body: formData
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            // Remplacer le texte de chargement par la syntaxe markdown finale
            var imageMarkdown = '![' + file.name + '](api_attachments.php?action=download&note_id=' + noteId + '&attachment_id=' + data.attachment_id + ')';
            replaceLoadingText(loadingText, imageMarkdown, dropTarget);
            
            // Marquer la note comme modifiée
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
            
            // Re-initialize image click handlers after markdown image insertion
            if (typeof reinitializeImageClickHandlers === 'function') {
                setTimeout(function() {
                    reinitializeImageClickHandlers();
                }, 200); // Wait for markdown rendering
            }
            
            // Rafraîchir la liste des pièces jointes et le compteur dans le menu
            updateAttachmentCountInMenu(noteId);
            
            // Si le modal des pièces jointes est ouvert pour cette note, rafraîchir la liste
            if (typeof currentNoteIdForAttachments !== 'undefined' && currentNoteIdForAttachments == noteId) {
                loadAttachments(noteId);
            }
            
            // Trigger automatic save after a short delay
            setTimeout(function() {
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
    .catch(function(error) {
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
            if (text.indexOf(oldText) !== -1) {
                textNode.textContent = text.replace(oldText, newText);
                break; // On remplace seulement la première occurrence
            }
        }
        
        // Déclencher l'événement input pour que les listeners de markdown soient informés
        var event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
    }
}

function handleHTMLImageInsert(file, dropTarget) {
    // Code existant pour les notes HTML
    var reader = new FileReader();
    reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        var imgHtml = '<img src="' + dataUrl + '" alt="image" />';
        
        // Get the note ID from the drop target
        var targetNoteId = dropTarget.id.replace('entry', '');
        
        var sel = window.getSelection();
        var inserted = false;
        
        if (sel && sel.rangeCount) {
            var range = sel.getRangeAt(0);
            var container = range.commonAncestorContainer;
            var noteEntry = container.nodeType === 1 ? 
                            container.closest('.noteentry') : 
                            container.parentElement.closest('.noteentry');
            
            if (noteEntry === dropTarget) {
                inserted = insertHTMLAtSelection(imgHtml);
            }
        }
        
        if (!inserted && dropTarget) {
            dropTarget.innerHTML += imgHtml;
        }
        
        // Update the global noteid to the target note for proper saving
        if (targetNoteId && targetNoteId !== '' && targetNoteId !== 'search') {
            window.noteid = targetNoteId;
        }
        
        // Trigger automatic save after image insertion
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }
        
        // Re-initialize image click handlers for the newly inserted image
        if (typeof reinitializeImageClickHandlers === 'function') {
            setTimeout(function() {
                reinitializeImageClickHandlers();
            }, 50);
        }
        
        // Trigger immediate save after a short delay to allow DOM to update
        setTimeout(function() {
            if (typeof saveNoteToServer === 'function') {
                saveNoteToServer(); // Direct call to save function
            } else if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Fallback to saveNoteImmediately
            }
        }, 100);
    };
    reader.readAsDataURL(file);
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
