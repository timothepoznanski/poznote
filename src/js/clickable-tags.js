/**
 * Clickable Tags System with Inline Editing
 * Tags are displayed as clickable elements with inline editing capability
 */

// Global variables for note loading
let notesWithClickableTags = new Set();

/**
 * Initialize clickable tags system
 */
function initializeClickableTags() {
    // Convert tags to clickable format for all visible notes
    const tagsRows = document.querySelectorAll('.note-tags-row');
    
    tagsRows.forEach((tagsRow) => {
        const tagsInput = tagsRow.querySelector('input[id^="tags"]');
        if (tagsInput) {
            const noteId = tagsInput.id.replace('tags', '');
            convertTagsToEditable(noteId);
        }
    });
}

/**
 * Extract note ID from note container
 */
function extractNoteIdFromContainer(container) {
    // Look for an element with an ID that contains the note ID
    const titleInput = container.querySelector('input[id^="inp"]');
    if (titleInput) {
        return titleInput.id.replace('inp', '');
    }
    
    const tagsInput = container.querySelector('input[id^="tags"]');
    if (tagsInput) {
        return tagsInput.id.replace('tags', '');
    }
    
    return null;
}

/**
 * Convert tags input to editable tags display with inline editing
 */
function convertTagsToEditable(noteId) {
    const tagsInput = document.getElementById('tags' + noteId);
    const nameTagsContainer = tagsInput ? tagsInput.closest('.name_tags') : null;
    
    if (!tagsInput || !nameTagsContainer) {
        return;
    }
    
    const tagsValue = tagsInput.value.trim();
    
    // Remove existing editable container if it exists
    const existingContainer = nameTagsContainer.querySelector('.editable-tags-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Create editable tags container
    const editableContainer = document.createElement('div');
    editableContainer.className = 'editable-tags-container';
    
    // Add existing tags as clickable elements
    if (tagsValue) {
        const tags = tagsValue.split(/[,\s]+/).filter(tag => tag.trim() !== '');
        
        tags.forEach(tag => {
            addTagElement(editableContainer, tag.trim(), noteId);
        });
    }
    
    // Add input field for adding new tags
    const tagInput = document.createElement('input');
    tagInput.className = 'tag-input';
    tagInput.type = 'text';
    tagInput.placeholder = tagsValue ? 'Add tag...' : 'Add tags...';
    tagInput.setAttribute('autocomplete', 'off');
    tagInput.setAttribute('autocorrect', 'off');
    tagInput.setAttribute('spellcheck', 'false');
    
    // Prevent line breaks more aggressively more aggressively
    tagInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Space key will be handled in keydown to create tag
    });
    
    tagInput.addEventListener('keydown', function(e) {
        handleTagInput(e, noteId, editableContainer);
    });
    // Show suggestions while typing
    tagInput.addEventListener('input', function(e) {
        try {
            showTagSuggestions(tagInput, editableContainer, window.selectedWorkspace || window.pageWorkspace, noteId);
        } catch (err) { /* ignore */ }
    });
    // Hide suggestions on focus out (but allow click into suggestion via mousedown handler)
    tagInput.addEventListener('focus', function() {
        try { showTagSuggestions(tagInput, editableContainer, window.selectedWorkspace || window.pageWorkspace, noteId); } catch(e){}
    });
    tagInput.addEventListener('blur', function() {
        setTimeout(() => {
            const dd = editableContainer.querySelector('.tag-suggestions');
            if (dd) dd.style.display = 'none';
        }, 150);
    });
    
    tagInput.addEventListener('blur', function(e) {
        handleTagInputBlur(e, noteId, editableContainer);
    });
    
    editableContainer.appendChild(tagInput);
    
    // Add the editable container to the name_tags element
    nameTagsContainer.appendChild(editableContainer);
    nameTagsContainer.classList.add('showing-editable-tags');
    notesWithClickableTags.add(noteId);
}

// --- Autocompletion support for tag input ---
// Cache for tags per workspace
const _tagCache = { tags: null, fetchedForWorkspace: null };

/**
 * Fetch tags from server (cached per workspace)
 */
function fetchAllTags(workspace) {
    return new Promise((resolve, reject) => {
        if (_tagCache.tags !== null && _tagCache.fetchedForWorkspace === workspace) {
            resolve(_tagCache.tags);
            return;
        }

        const url = 'api_list_tags.php' + (workspace ? ('?workspace=' + encodeURIComponent(workspace)) : '');
        fetch(url, { credentials: 'same-origin' })
            .then(r => r.json())
            .then(data => {
                if (data && data.success && Array.isArray(data.tags)) {
                    _tagCache.tags = data.tags;
                    _tagCache.fetchedForWorkspace = workspace;
                    resolve(data.tags);
                } else {
                    resolve([]);
                }
            })
            .catch(err => { resolve([]); });
    });
}

/**
 * Create or reuse a suggestions dropdown for a given container
 */
function getOrCreateSuggestions(container) {
    let dd = container.querySelector('.tag-suggestions');
    if (!dd) {
        dd = document.createElement('div');
        dd.className = 'tag-suggestions';
        dd.style.position = 'absolute';
        dd.style.zIndex = '10000';
        dd.style.background = '#fff';
        dd.style.border = '1px solid #ddd';
        dd.style.borderRadius = '4px';
        dd.style.boxShadow = '0 4px 8px rgba(0,0,0,0.08)';
        dd.style.maxHeight = '200px';
        dd.style.overflow = 'auto';
        dd.style.display = 'none';
        dd.style.minWidth = '150px';
        dd.style.fontSize = '0.95em';
        container.appendChild(dd);
    }
    return dd;
}

/**
 * Highlight clickable tags that match the provided searchTerm (case-insensitive).
 * If searchTerm is falsy, remove any existing highlight classes.
 */
function highlightMatchingTags(searchTerm, _attempt = 0) {
    const normalized = searchTerm ? searchTerm.toString().trim().toLowerCase() : '';
    const tagEls = document.querySelectorAll('.clickable-tag');

    // If no tag elements yet, retry a few times (they may be created asynchronously after AJAX)
    if (tagEls.length === 0 && _attempt < 6) {
        // Elements not yet present; retry shortly
        setTimeout(() => highlightMatchingTags(searchTerm, _attempt + 1), 80);
        return;
    }

    if (!normalized) {
        tagEls.forEach(el => el.classList.remove('tag-highlight'));
        return;
    }

    // Support multiple tokens separated by commas or whitespace (e.g. "tag1, tag2" or "tag1 tag2")
    const tokens = normalized.split(/[\,\s]+/).map(t => t.trim()).filter(t => t.length > 0);
    if (tokens.length === 0) {
        tagEls.forEach(el => el.classList.remove('tag-highlight'));
        return;
    }

    let matched = 0;
    tagEls.forEach(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        const isMatch = tokens.some(tok => text === tok || text.includes(tok));
        const wrapper = el.closest('.clickable-tag-wrapper');
        if (isMatch) {
            if (wrapper) wrapper.classList.add('tag-highlight');
            else el.classList.add('tag-highlight');
            matched++;
        } else {
            if (wrapper) wrapper.classList.remove('tag-highlight');
            else el.classList.remove('tag-highlight');
        }
    });
    // debug logs removed
}

// Expose helper so other modules can call it after AJAX reinit
window.highlightMatchingTags = highlightMatchingTags;

/**
 * Show suggestions filtered by prefix
 */
function showTagSuggestions(inputEl, container, workspace, noteId) {
    const dd = getOrCreateSuggestions(container);
    const value = inputEl.value.trim().toLowerCase();
    if (!value) { dd.style.display = 'none'; return; }

    fetchAllTags(workspace).then(allTags => {
        // Exclude tags already present
        const existing = Array.from(container.querySelectorAll('.clickable-tag')).map(t => t.textContent.toLowerCase());
        const matches = allTags.filter(t => t.toLowerCase().includes(value) && !existing.includes(t.toLowerCase()));

        dd.innerHTML = '';
        if (matches.length === 0) { dd.style.display = 'none'; return; }

        matches.slice(0, 50).forEach((tag, idx) => {
            const item = document.createElement('div');
            item.className = 'tag-suggestion-item';
            item.textContent = tag;
            item.style.padding = '6px 8px';
            item.style.cursor = 'pointer';
            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                addTagElement(container, tag, noteId);
                inputEl.value = '';
                const targetNoteId = noteId;
                updateTagsInput(targetNoteId, container);
                // Ensure edit flags and noteid are set, then trigger save
                try {
                    if (typeof window !== 'undefined' && targetNoteId) {
                        window.noteid = targetNoteId;
                        window.editedButNotSaved = 1;
                        try { console.debug('clickable-tags: set window.noteid=', window.noteid, 'editedButNotSaved=', window.editedButNotSaved); } catch(e){}
                        // Show modification indicator immediately
                        if (typeof displayModificationsDone === 'function') {
                            displayModificationsDone();
                        }
                    }
                    // Immediately save tags via AJAX to avoid relying on global save button/state
                    try {
                        const tagsInput = document.getElementById('tags' + targetNoteId);
                        const tagsValue = tagsInput ? tagsInput.value : '';
                        if (targetNoteId && typeof saveTagsDirectly === 'function') {
                            saveTagsDirectly(targetNoteId, tagsValue);
                        } else if (targetNoteId && typeof updatenote === 'function') {
                            setTimeout(() => { try { updatenote(); } catch(e){} }, 50);
                        } else {
                            console.warn('No save function available for tag selection');
                        }
                    } catch (inner) { console.error('Error in tag selection save:', inner); }
                } catch (err) { /* ignore */ }
                dd.style.display = 'none';
                setTimeout(() => inputEl.focus(), 10);
            });
            dd.appendChild(item);
        });

        // Position the dropdown under the input
        dd.style.display = 'block';
        dd.style.left = inputEl.offsetLeft + 'px';
        dd.style.top = (inputEl.offsetTop + inputEl.offsetHeight + 4) + 'px';
        dd.firstChild && dd.firstChild.classList.add('highlight');
        
        // Only add navigation handler once per input element
        if (!inputEl.hasNavigationHandler) {
            let highlighted = -1;
            inputEl.addEventListener('keydown', function navHandler(ev) {
                const items = dd.querySelectorAll('.tag-suggestion-item');
                if (!items || items.length === 0) return;
                if (ev.key === 'ArrowDown') {
                    ev.preventDefault(); 
                    highlighted = Math.min(highlighted + 1, items.length - 1);
                    items.forEach((it, i) => it.style.background = i === highlighted ? '#f0f7ff' : '');
                } else if (ev.key === 'ArrowUp') {
                    ev.preventDefault(); 
                    highlighted = Math.max(highlighted - 1, 0);
                    items.forEach((it, i) => it.style.background = i === highlighted ? '#f0f7ff' : '');
                } else if (ev.key === 'Enter' && highlighted >= 0) {
                    ev.preventDefault(); 
                    ev.stopPropagation();
                    // Dispatch mousedown to reuse the same handler which also triggers save
                    items[highlighted].dispatchEvent(new MouseEvent('mousedown'));
                                        // Also ensure flags are set and trigger save for keyboard selection
                    try {
                        const targetNoteId = noteId;
                        if (typeof window !== 'undefined' && targetNoteId) {
                            window.noteid = targetNoteId;
                            window.editedButNotSaved = 1;
                            try { console.debug('clickable-tags (keyboard): set window.noteid=', window.noteid, 'editedButNotSaved=', window.editedButNotSaved); } catch(e){}
                            // Show modification indicator immediately
                            if (typeof displayModificationsDone === 'function') {
                                displayModificationsDone();
                            }
                        }
                        try {
                            const tagsInput = document.getElementById('tags' + targetNoteId);
                            const tagsValue = tagsInput ? tagsInput.value : '';
                            if (targetNoteId && typeof saveTagsDirectly === 'function') {
                                saveTagsDirectly(targetNoteId, tagsValue);
                            } else if (targetNoteId && typeof updatenote === 'function') {
                                setTimeout(() => { try { updatenote(); } catch(e){} }, 50);
                            } else {
                                console.warn('No save function available for keyboard tag selection');
                            }
                        } catch (inner) { console.error('Error in keyboard tag selection save:', inner); }
                    } catch (err) { /* ignore */ }
                } else if (ev.key === 'Escape') {
                    dd.style.display = 'none';
                }
            });
            inputEl.hasNavigationHandler = true;
        }
    });
}

// Close suggestions when clicking outside
document.addEventListener('click', function(e) {
    document.querySelectorAll('.tag-suggestions').forEach(dd => {
        if (!dd.contains(e.target)) dd.style.display = 'none';
    });
});

// End autocompletion support

/**
 * Add a tag element to the container
 */
function addTagElement(container, tagText, noteId) {
    const tagWrapper = document.createElement('span');
    tagWrapper.className = 'clickable-tag-wrapper';
    
    const tagElement = document.createElement('span');
    tagElement.className = 'clickable-tag';
    tagElement.textContent = tagText;
    tagElement.setAttribute('data-tag', tagText);
    tagElement.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        redirectToTag(tagText);
    });
    
    const deleteButton = document.createElement('span');
    deleteButton.className = 'tag-delete-button';
    deleteButton.innerHTML = '×';
    deleteButton.title = 'Remove tag';
    deleteButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        removeTagElement(tagWrapper, noteId);
    });
    
    tagWrapper.appendChild(tagElement);
    tagWrapper.appendChild(deleteButton);
    
    // Insert before the input field
    const inputField = container.querySelector('.tag-input');
    container.insertBefore(tagWrapper, inputField);
}

/**
 * Handle input in the tag input field
 */
function handleTagInput(e, noteId, container) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === ',') {
        e.preventDefault(); // Prevents default behavior
        e.stopPropagation(); // Prevents event propagation
        
        const input = e.target;
        let tagText = input.value.trim();
        
        if (tagText && tagText !== '') {
            // Check if there's a visible suggestions dropdown
            const suggestionsDropdown = container.querySelector('.tag-suggestions');
            if (suggestionsDropdown && suggestionsDropdown.style.display !== 'none') {
                // If suggestions are visible, don't process the input text
                // The suggestion selection should be handled by the navigation handler
                return false;
            }
            
            // If user types words separated by spaces, treat them as separate tags
            const tags = tagText.split(/\s+/).filter(tag => tag.trim() !== '');
            
            tags.forEach(singleTag => {
                const trimmedTag = singleTag.trim();
                if (trimmedTag) {
                    // Check if tag already exists
                    const existingTags = container.querySelectorAll('.clickable-tag');
                    const tagExists = Array.from(existingTags).some(tag => 
                        tag.textContent.toLowerCase() === trimmedTag.toLowerCase()
                    );
                    
                    if (!tagExists) {
                        addTagElement(container, trimmedTag, noteId);
                    }
                }
            });
            
            input.value = '';
            updateTagsInput(noteId, container);
            
            // Trigger save after adding tags manually
            setTimeout(() => {
                try {
                    const tagsInput = document.getElementById('tags' + noteId);
                    const tagsValue = tagsInput ? tagsInput.value : '';
                    if (noteId && typeof saveTagsDirectly === 'function') {
                        saveTagsDirectly(noteId, tagsValue);
                    } else if (noteId && typeof updatenote === 'function') {
                        updatenote();
                    }
                } catch (error) {
                    console.error('Error saving after manual tag addition:', error);
                }
            }, 100);
            
            // Keep focus on input to continue typing
            setTimeout(() => {
                input.focus();
            }, 10);
        }
        
        return false; // Completely prevents propagation
    } else if (e.key === 'Backspace' && e.target.value === '') {
        // If backspace on empty input, remove last tag
        const tagWrappers = container.querySelectorAll('.clickable-tag-wrapper');
        if (tagWrappers.length > 0) {
            const lastTag = tagWrappers[tagWrappers.length - 1];
            removeTagElement(lastTag, noteId);
        }
    }
}

/**
 * Handle blur on tag input
 */
function handleTagInputBlur(e, noteId, container) {
    const input = e.target;
    let tagText = input.value.trim();
    
    if (tagText && tagText !== '') {
        // Check if there's a visible suggestions dropdown
        const suggestionsDropdown = container.querySelector('.tag-suggestions');
        if (suggestionsDropdown && suggestionsDropdown.style.display !== 'none') {
            // If suggestions are visible, don't process the input text on blur
            // This prevents adding the typed text when user clicks away from suggestions
            return;
        }
        
        // If user types words separated by spaces, treat them as separate tags
        const tags = tagText.split(/\s+/).filter(tag => tag.trim() !== '');
        
        tags.forEach(singleTag => {
            const trimmedTag = singleTag.trim();
            if (trimmedTag) {
                // Check if tag already exists
                const existingTags = container.querySelectorAll('.clickable-tag');
                const tagExists = Array.from(existingTags).some(tag => 
                    tag.textContent.toLowerCase() === trimmedTag.toLowerCase()
                );
                
                if (!tagExists) {
                    addTagElement(container, trimmedTag, noteId);
                }
            }
        });
        
        input.value = '';
        updateTagsInput(noteId, container);
        
        // Trigger save after adding tags on blur
        setTimeout(() => {
            try {
                const tagsInput = document.getElementById('tags' + noteId);
                const tagsValue = tagsInput ? tagsInput.value : '';
                if (noteId && typeof saveTagsDirectly === 'function') {
                    saveTagsDirectly(noteId, tagsValue);
                } else if (noteId && typeof updatenote === 'function') {
                    updatenote();
                }
            } catch (error) {
                console.error('Error saving after blur tag addition:', error);
            }
        }, 100);
    }
}

/**
 * Remove a tag element
 */
function removeTagElement(tagWrapper, noteId) {
    const container = tagWrapper.closest('.editable-tags-container');
    tagWrapper.remove();
    updateTagsInput(noteId, container);
    
    // Trigger save after removing tag
    setTimeout(() => {
        try {
            const tagsInput = document.getElementById('tags' + noteId);
            const tagsValue = tagsInput ? tagsInput.value : '';
            if (noteId && typeof saveTagsDirectly === 'function') {
                saveTagsDirectly(noteId, tagsValue);
            } else if (noteId && typeof updatenote === 'function') {
                updatenote();
            }
        } catch (error) {
            console.error('Error saving after tag removal:', error);
        }
    }, 100);
}

/**
 * Show a temporary error message for tag input
 */
function showTagError(input, message) {
    // Remove existing error message
    const existingError = input.parentNode.querySelector('.tag-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'tag-error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 2px; position: absolute; z-index: 1000; background: white; padding: 2px 5px; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
    
    // Insert after input
    input.parentNode.insertBefore(errorDiv, input.nextSibling);
    
    // Remove error after 3 seconds
    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 3000);
    
    // Clear the input
    input.value = '';
}

/**
 * Update the hidden tags input with current tags
 */
function updateTagsInput(noteId, container) {
    const tagsInput = document.getElementById('tags' + noteId);
    if (!tagsInput) return;
    
    const tagElements = container.querySelectorAll('.clickable-tag');
    const tags = Array.from(tagElements).map(tag => tag.textContent);
    
    tagsInput.value = tags.join(' ');
    
    // Set the global noteid to the note being modified
    // Don't restore the old noteid - we want the system to know this note is active
    window.noteid = noteId;
    
    // Use the existing update() function that properly sets all flags
    if (typeof update === 'function') {
        update();
    } else {
        // Fallback: set flags manually
        if (typeof editedButNotSaved !== 'undefined') {
            window.editedButNotSaved = 1;
        }
        if (typeof lastudpdate !== 'undefined') {
            window.lastudpdate = new Date().getTime();
        }
        // Show modification indicator
        if (typeof displayModificationsDone === 'function') {
            displayModificationsDone();
        }
    }
    
    // Trigger the input change event to notify any other listeners
    const changeEvent = new Event('input', { bubbles: true });
    tagsInput.dispatchEvent(changeEvent);
}

/**
 * Fallback function to save tags directly via AJAX
 */
function saveTagsDirectly(noteId, tagsValue) {
    
    // Get note title and content for the update
    const titleInput = document.getElementById('inp' + noteId);
    const contentDiv = document.getElementById('entry' + noteId);
    const folderInput = document.getElementById('folder' + noteId);
    
    if (!titleInput || !contentDiv) {
        return;
    }
    
    // Set saving in progress
    if (typeof updateNoteEnCours !== 'undefined') {
        window.updateNoteEnCours = 1;
    }
    
    // Clean search highlights from content before saving (same as updatenote)
    let cleanContent = contentDiv.innerHTML;
    if (typeof cleanSearchHighlightsFromElement === 'function') {
        cleanContent = cleanSearchHighlightsFromElement(contentDiv);
    }
    
    // Get text content for entrycontent (also clean highlights)
    let textContent = contentDiv.textContent || '';
    if (typeof cleanSearchHighlightsFromElement === 'function') {
        const clonedForText = contentDiv.cloneNode(true);
        const highlights = clonedForText.querySelectorAll('.search-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        });
        textContent = clonedForText.textContent || '';
    }
    
    const params = new URLSearchParams({
        id: noteId,
        tags: tagsValue,
        folder: folderInput ? folderInput.value : '',
        heading: titleInput.value,
        entry: cleanContent,
        entrycontent: textContent,
    workspace: (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : 'Poznote'),
        now: (new Date().getTime()/1000)-new Date().getTimezoneOffset()*60
    });
    
    fetch("update_note.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        try {
            // Try to parse as JSON first
            var jsonData = JSON.parse(data);
            
            if (jsonData.status === 'error') {
                console.error('saveTagsDirectly: server returned error:', jsonData.message);
                // Keep edited flag on error
                if (typeof editedButNotSaved !== 'undefined') {
                    window.editedButNotSaved = 1;
                }
                if (typeof updateNoteEnCours !== 'undefined') {
                    window.updateNoteEnCours = 0;
                }
                if (typeof setSaveButtonRed === 'function') {
                    setSaveButtonRed(true);
                }
                // Show modification indicator for error state
                if (typeof displayModificationsDone === 'function') {
                    displayModificationsDone();
                }
                return;
            } else if (jsonData.date && jsonData.title) {
                // Handle response with date and title
                if (typeof editedButNotSaved !== 'undefined') {
                    window.editedButNotSaved = 0;
                }
                var lastUpdatedElem = document.getElementById('lastupdated' + noteId);
                if (lastUpdatedElem) lastUpdatedElem.innerHTML = jsonData.date;
                
                // Update the title input field with the unique title
                var titleInput = document.getElementById('inp' + noteId);
                if (titleInput && jsonData.title !== jsonData.original_title) {
                    titleInput.value = jsonData.title;
                }
                
                // Update the title in the left column
                if (typeof updateNoteTitleInLeftColumn === 'function') {
                    updateNoteTitleInLeftColumn();
                }
                if (typeof setSaveButtonRed === 'function') {
                    setSaveButtonRed(false);
                }
                return;
            }
        } catch(e) {
            // If not JSON, treat as normal response
            if (typeof editedButNotSaved !== 'undefined') {
                window.editedButNotSaved = 0;
            }
            var lastUpdatedElem = document.getElementById('lastupdated' + noteId);
            if (lastUpdatedElem) {
                if (data == '1') {
                    lastUpdatedElem.innerHTML = 'Last Saved Today';
                } else {
                    lastUpdatedElem.innerHTML = data;
                }
            }
            
            // Update the title in the left column
            if (typeof updateNoteTitleInLeftColumn === 'function') {
                updateNoteTitleInLeftColumn();
            } else {
                console.warn('saveTagsDirectly: updateNoteTitleInLeftColumn function not found');
            }
            if (typeof setSaveButtonRed === 'function') {
                setSaveButtonRed(false);
            } else {
                console.warn('saveTagsDirectly: setSaveButtonRed function not found');
            }
        }
        
        // Clear the flags after successful save
        if (typeof editedButNotSaved !== 'undefined') {
            window.editedButNotSaved = 0;
        }
        if (typeof updateNoteEnCours !== 'undefined') {
            window.updateNoteEnCours = 0;
        }
        
        // Update UI elements
        var lastUpdatedElem = document.getElementById('lastupdated' + noteId);
        if (lastUpdatedElem) {
            lastUpdatedElem.innerHTML = data;
        }
        
        // Update title in left column
        if (typeof updateNoteTitleInLeftColumn === 'function') {
            updateNoteTitleInLeftColumn();
        } else {
            console.warn('saveTagsDirectly: updateNoteTitleInLeftColumn function not found');
        }
        
        // Update save button
        if (typeof setSaveButtonRed === 'function') {
            setSaveButtonRed(false);
        } else {
            console.warn('saveTagsDirectly: setSaveButtonRed function not found');
        }
        
    })
    .catch(function(error) {
        console.error('saveTagsDirectly: network error:', error);
        // Keep edited flag on error, clear saving flag
        if (typeof editedButNotSaved !== 'undefined') {
            window.editedButNotSaved = 1;
        }
        if (typeof updateNoteEnCours !== 'undefined') {
            window.updateNoteEnCours = 0;
        }
        if (typeof setSaveButtonRed === 'function') {
            setSaveButtonRed(true);
        }
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup('Network error while saving: ' + error.message, 'error');
        }
        // Show modification indicator for error state
        if (typeof displayModificationsDone === 'function') {
            displayModificationsDone();
        }
    });
}

// Make saveTagsDirectly globally available immediately after definition
window.saveTagsDirectly = saveTagsDirectly;

/**
 * Get excluded folders from localStorage (copied from listtags.js)
 */
function getExcludedFoldersFromLocalStorage() {
    const excludedFolders = [];
    
    // Read excluded folders from localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('folder_search_')) {
            const state = localStorage.getItem(key);
            if (state === 'excluded') {
                const folderName = key.substring('folder_search_'.length);
                excludedFolders.push(folderName);
            }
        }
    }
    
    return excludedFolders;
}

/**
 * Setup handlers (minimal now since we use inline editing)
 */
function setupTagsEditingHandlers() {
    // Minimal setup since tags are always editable
}

/**
 * Re-initialize clickable tags after AJAX content load
 */
function reinitializeClickableTagsAfterAjax() {
    // Clear the tracking set since notes might have changed
    notesWithClickableTags.clear();
    
    // Re-initialize for all visible notes
    setTimeout(() => {
        initializeClickableTags();
    }, 100);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setupTagsEditingHandlers();
    initializeClickableTags();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    setupTagsEditingHandlers();
    initializeClickableTags();
}

/**
 * Redirect to notes with specific tag
 */
function redirectToTag(tag) {
    const excludedFolders = getExcludedFoldersFromLocalStorage();

    if (excludedFolders.length > 0) {
        // Create a form to post the tag search with excluded folders
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'index.php';

        // Add tag search parameter
        const tagInput = document.createElement('input');
        tagInput.type = 'hidden';
        tagInput.name = 'tags_search';
        tagInput.value = tag;
        form.appendChild(tagInput);

        // Add search type parameters
        const searchInTagsInput = document.createElement('input');
        searchInTagsInput.type = 'hidden';
        searchInTagsInput.name = 'search_in_tags';
        searchInTagsInput.value = '1';
        form.appendChild(searchInTagsInput);

        // Add excluded folders
        const excludedInput = document.createElement('input');
        excludedInput.type = 'hidden';
        excludedInput.name = 'excluded_folders';
        excludedInput.value = JSON.stringify(excludedFolders);
        form.appendChild(excludedInput);

        // Include current workspace
        const currentWorkspace = new URLSearchParams(window.location.search).get('workspace') ||
                               (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : null) ||
                               (typeof window.selectedWorkspace !== 'undefined' ? window.selectedWorkspace : null) ||
                               'Poznote';
        if (currentWorkspace && currentWorkspace !== 'Poznote') {
            const wsInput = document.createElement('input');
            wsInput.type = 'hidden';
            wsInput.name = 'workspace';
            wsInput.value = currentWorkspace;
            form.appendChild(wsInput);
        }

        document.body.appendChild(form);
        form.submit();
    } else {
        // No exclusions, use simple GET redirect
        const currentWorkspace = new URLSearchParams(window.location.search).get('workspace') ||
                               (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : null) ||
                               (typeof window.selectedWorkspace !== 'undefined' ? window.selectedWorkspace : null) ||
                               'Poznote';
        const wsParam = (currentWorkspace && currentWorkspace !== 'Poznote') ? '&workspace=' + encodeURIComponent(currentWorkspace) : '';
        window.location.href = 'index.php?tags_search_from_list=' + encodeURIComponent(tag) + wsParam;
    }
}

// Make functions available globally for use by other scripts
window.initializeClickableTags = initializeClickableTags;
window.reinitializeClickableTagsAfterAjax = reinitializeClickableTagsAfterAjax;
window.redirectToTag = redirectToTag;
