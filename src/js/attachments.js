// Attached file and image drag management

// Fonctions utilitaires pour vérifier la position du curseur
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
        showAttachmentError('Please select a file');
        return;
    }
    
    if (!currentNoteIdForAttachments) {
        showAttachmentError('No note selected');
        return;
    }
    
    // Check file size (200MB limit)
    var maxSize = 200 * 1024 * 1024; // 200MB in bytes
    if (file.size > maxSize) {
        showAttachmentError('Fichier trop volumineux. Taille maximale : 200MB.');
        return;
    }
    
    hideAttachmentError();
    
    // Show progress
    var uploadButton = document.querySelector('.attachment-upload button');
    var originalText = uploadButton.textContent;
    uploadButton.textContent = 'Uploading...';
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
            throw new Error('HTTP Error: ' + response.status);
        }
        return response.text();
    })
    .then(function(text) {
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid server response');
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
            showAttachmentError('Upload failed: ' + data.message);
        }
    })
    .catch(function(error) {
        showAttachmentError('Upload failed: ' + error.message);
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
        container.innerHTML = '<p>No attachments</p>';
        return;
    }
    
    var html = '';
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
    html += '<button onclick="downloadAttachment(\'' + attachment.id + '\')" title="View">';
    html += '<i class="fa-eye"></i>';
        html += '</button>';
        html += '<button onclick="deleteAttachment(\'' + attachment.id + '\')" title="Supprimer" class="delete-btn">';
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
        showNotificationPopup('No note selected', 'error');
        return;
    }
    window.open('api_attachments.php?action=download&note_id=' + noteIdToUse + '&attachment_id=' + attachmentId, '_blank');
}

function deleteAttachment(attachmentId) {
    // NOTE: confirmation removed - delete immediately when called
    if (!currentNoteIdForAttachments) {
        showNotificationPopup('No note selected', 'error');
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
            showNotificationPopup('Deletion failed: ' + data.message, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Deletion failed', 'error');
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
        }
    })
    .catch(function(error) {
        console.log('Counter update error:', error);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Octets';
    var k = 1024;
    var sizes = ['Octets', 'KB', 'MB', 'GB'];
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
    
    // Vérifier si c'est une note markdown
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
    
    // Montrer un indicateur de chargement
    var loadingText = '![Uploading ' + file.name + '...]()';
    insertMarkdownAtCursor(loadingText, dropTarget);
    
    // Trigger initial save for loading text
    if (typeof updateNote === 'function') {
        updateNote(); // Mark note as edited
    }
    
    // Uploader le fichier
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
            if (typeof markNoteAsModified === 'function') {
                markNoteAsModified(noteId);
            }
            
            // Trigger automatic save after a short delay
            setTimeout(function() {
                if (typeof updatenote === 'function') {
                    updatenote(); // Save to server
                }
            }, 500); // Longer delay for markdown to allow upload completion
        } else {
            // Supprimer le texte de chargement en cas d'erreur
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
    // Vérifier si le curseur est dans une zone éditable pour les insertions manuelles
    // (dropTarget indique un glisser-déposer, donc on ne vérifie pas)
    if (!dropTarget && !isCursorInEditableNote()) {
        window.showCursorWarning();
        return;
    }
    
    // Pour les notes markdown, insérer dans l'éditeur markdown
    var editor = dropTarget ? dropTarget.querySelector('.markdown-editor') : null;
    if (!editor) {
        // Si pas de dropTarget, chercher l'éditeur actuel
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
        
        // Fallback : ajouter à la fin
        var currentContent = editor.textContent || '';
        editor.textContent = currentContent + '\n' + text;
        editor.focus();
    }
}

function replaceLoadingText(oldText, newText, dropTarget) {
    var editor = dropTarget.querySelector('.markdown-editor');
    if (editor) {
        var content = editor.textContent || '';
        editor.textContent = content.replace(oldText, newText);
        
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
        
        // Trigger automatic save after image insertion
        if (typeof updateNote === 'function') {
            updateNote(); // Mark note as edited
        }
        
        // Trigger immediate save after a short delay to allow DOM to update
        setTimeout(function() {
            if (typeof updatenote === 'function') {
                updatenote(); // Save to server
            }
        }, 100);
    };
    reader.readAsDataURL(file);
}

function insertHTMLAtSelection(html) {
    // Vérifier si le curseur est dans une zone éditable
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
