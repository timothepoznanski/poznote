/**
 * Clickable Tags System with Inline Editing
 * Tags are displayed as clickable elements with inline editing capability
 */

// Global variables for note loading
let notesWithClickableTags = new Set();

/**
 * Update the tags count in the sidebar
 * @param {number} delta - The amount to change the count by (can be positive or negative)
 */
function updateTagsCount(delta) {
    const countEl = document.getElementById('count-tags');
    if (countEl) {
        // System folders display count without parentheses, e.g. "5" not "(5)"
        const currentCount = parseInt(countEl.textContent.trim(), 10) || 0;
        const newCount = Math.max(0, currentCount + delta);
        countEl.textContent = newCount.toString();
    }
}

/**
 * Refresh the tags count from the server
 * Fetches the actual count of unique tags and updates the sidebar badge
 */
function refreshTagsCount() {
    // Get current workspace from URL or default
    const urlParams = new URLSearchParams(window.location.search);
    const workspace = urlParams.get('workspace') || '';
    
    const url = '/api/v1/tags' + (workspace ? ('?workspace=' + encodeURIComponent(workspace)) : '');
    
    fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(r => r.json())
        .then(data => {
            if (data && data.success && Array.isArray(data.tags)) {
                const countEl = document.getElementById('count-tags');
                if (countEl) {
                    countEl.textContent = data.tags.length.toString();
                }
            }
        })
        .catch(err => {
            console.error('Error refreshing tags count:', err);
        });
}

/**
 * Initialize clickable tags system
 */
function initializeClickableTags() {
    // Convert tags to clickable format for all notes that have a tags input.
    // Search for inputs with id starting with 'tags' so hidden inputs still initialize.
    const tagsInputs = document.querySelectorAll('input[id^="tags"]');
    tagsInputs.forEach((tagsInput) => {
        const noteId = tagsInput.id.replace('tags', '');
        convertTagsToEditable(noteId);
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
    tagInput.placeholder = tagsValue 
        ? (window.t ? window.t('tags.add_single', null, 'Add tag...') : 'Add tag...') 
        : (window.t ? window.t('tags.add_multiple', null, 'Add tags...') : 'Add tags...');
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
        try { 
            showTagSuggestions(tagInput, editableContainer, window.selectedWorkspace || window.pageWorkspace, noteId); 
        } catch(e) {
            console.warn('Failed to show tag suggestions on focus:', e);
        }
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

        const url = '/api/v1/tags' + (workspace ? ('?workspace=' + encodeURIComponent(workspace)) : '');
        fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
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
                // Set global noteid and trigger auto-save
                try {
                    if (typeof window !== 'undefined' && targetNoteId) {
                        window.noteid = targetNoteId;
                        // Auto-save will handle the modification automatically
                        if (typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }
                    }
                } catch (err) { 
                    console.warn('Auto-save trigger failed:', err);
                }
                dd.style.display = 'none';
                setTimeout(() => inputEl.focus(), 10);
            });
            dd.appendChild(item);
        });

        // Position the dropdown under the input
        dd.style.display = 'block';
        const containerRect = container.getBoundingClientRect();
        const inputRect = inputEl.getBoundingClientRect();
        dd.style.left = (inputRect.left - containerRect.left + container.scrollLeft) + 'px';
        dd.style.top = (inputRect.bottom - containerRect.top + container.scrollTop + 4) + 'px';
        // Note: No item is highlighted by default, user must use arrow keys to highlight
        
        // Only add navigation handler once per input element
        if (!inputEl.hasNavigationHandler) {
            let highlighted = -1;
            inputEl.addEventListener('keydown', function navHandler(ev) {
                const items = dd.querySelectorAll('.tag-suggestion-item');
                if (!items || items.length === 0) return;
                if (ev.key === 'ArrowDown') {
                    ev.preventDefault(); 
                    highlighted = Math.min(highlighted + 1, items.length - 1);
                    items.forEach((it, i) => {
                        it.classList.toggle('highlighted', i === highlighted);
                        it.style.background = i === highlighted ? '#f0f7ff' : '';
                    });
                } else if (ev.key === 'ArrowUp') {
                    ev.preventDefault(); 
                    highlighted = Math.max(highlighted - 1, 0);
                    items.forEach((it, i) => {
                        it.classList.toggle('highlighted', i === highlighted);
                        it.style.background = i === highlighted ? '#f0f7ff' : '';
                    });
                } else if (ev.key === 'Enter' && highlighted >= 0) {
                    ev.preventDefault(); 
                    ev.stopPropagation();
                    // Dispatch mousedown to reuse the same handler which also triggers save
                    items[highlighted].dispatchEvent(new MouseEvent('mousedown'));
                    // Trigger auto-save for keyboard selection
                    try {
                        const targetNoteId = noteId;
                        if (typeof window !== 'undefined' && targetNoteId) {
                            window.noteid = targetNoteId;
                            // Auto-save will handle the modification automatically
                            if (typeof window.markNoteAsModified === 'function') {
                                window.markNoteAsModified();
                            }
                        }
                    } catch (err) { 
                        console.warn('Auto-save trigger failed for keyboard selection:', err);
                    }
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
                // For Enter key, check if any suggestion is highlighted
                if (e.key === 'Enter') {
                    // Check if there's a highlighted item
                    const highlightedItem = suggestionsDropdown.querySelector('.tag-suggestion-item.highlighted');
                    if (highlightedItem) {
                        // Let the navigation handler handle the highlighted suggestion
                        return false;
                    }
                    // No item highlighted, proceed to create the typed tag
                }
                // For space, comma, or Enter with no highlighted item, hide suggestions and allow creating the typed tag
                suggestionsDropdown.style.display = 'none';
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
            
            // updateTagsInput() already triggers auto-save via triggerAutoSaveForNote()
            
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
            // Hide suggestions and process the typed text
            suggestionsDropdown.style.display = 'none';
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
        
        // updateTagsInput() already triggers auto-save via triggerAutoSaveForNote()
    }
}

/**
 * Remove a tag element
 */
function removeTagElement(tagWrapper, noteId) {
    const container = tagWrapper.closest('.editable-tags-container');
    tagWrapper.remove();
    updateTagsInput(noteId, container);
    
    // updateTagsInput() already triggers auto-save via triggerAutoSaveForNote()
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
    
    // Update the placeholder based on whether there are tags
    const tagInput = container.querySelector('.tag-input');
    if (tagInput) {
        tagInput.placeholder = tags.length > 0
            ? (window.t ? window.t('tags.add_single', null, 'Add tag...') : 'Add tag...')
            : (window.t ? window.t('tags.add_multiple', null, 'Add tags...') : 'Add tags...');
    }
    
    // Trigger auto-save for this specific note (without changing global noteid)
    triggerAutoSaveForNote(noteId);
    
    // Trigger the input change event to notify any other listeners
    const changeEvent = new Event('input', { bubbles: true });
    tagsInput.dispatchEvent(changeEvent);
}

/**
 * Trigger auto-save for a specific note without relying on global noteid
 */
function triggerAutoSaveForNote(targetNoteId) {
    if (targetNoteId == 'search' || targetNoteId == -1 || targetNoteId === null || targetNoteId === undefined) return;
    
    
    // Use dedicated function that doesn't depend on global noteid
    updateNoteById(targetNoteId);
}

/**
 * Update note by specific ID without relying on global noteid variable
 */
function updateNoteById(noteId) {
    if (noteId == 'search' || noteId == -1 || noteId === null || noteId === undefined) return;
    
    // Get elements for this specific note
    var entryElem = document.getElementById("entry" + noteId);
    var titleInput = document.getElementById("inp" + noteId);
    var tagsElem = document.getElementById("tags" + noteId);
    
    var currentContent = entryElem ? entryElem.innerHTML : '';
    var currentTitle = titleInput ? titleInput.value : '';
    var currentTags = tagsElem ? tagsElem.value : '';
    
    
    // Save to localStorage immediately
    try {
        if (entryElem) {
            var draftKey = 'poznote_draft_' + noteId;
            localStorage.setItem(draftKey, currentContent);
            
            if (titleInput) {
                localStorage.setItem('poznote_title_' + noteId, currentTitle);
            }
            if (tagsElem) {
                localStorage.setItem('poznote_tags_' + noteId, currentTags);
            }
        }
    } catch (err) {
    }
    
    // Initialize lastSaved variables if this is the current note to prevent infinite loops
    if (window.noteid == noteId) {
        // Initialize the global lastSaved variables to prevent markNoteAsModified() infinite loops
        if (typeof lastSavedContent === 'undefined' || lastSavedContent === null) {
            lastSavedContent = currentContent;
        }
        if (typeof lastSavedTitle === 'undefined' || lastSavedTitle === null) {
            lastSavedTitle = currentTitle;
        }
        if (typeof lastSavedTags === 'undefined' || lastSavedTags === null) {
            lastSavedTags = currentTags;
        }
    }
    
    // Visual indicator: add red dot to page title when there are unsaved changes
    if (!document.title.startsWith('🔴')) {
        document.title = '🔴 ' + document.title;
    }
    
    // Debounced server save with preserved noteId context
    var saveKey = 'saveTimeout_' + noteId;
    if (window[saveKey]) {
        clearTimeout(window[saveKey]);
    }
    
    window[saveKey] = setTimeout(() => {
        saveNoteToServerById(noteId);
        delete window[saveKey]; // Clean up
    }, 2000);
}

/**
 * Save specific note to server by ID
 */
function saveNoteToServerById(noteId) {
    
    // Temporarily set global noteid for saveNoteToServer compatibility
    var originalNoteid = window.noteid;
    window.noteid = noteId;
    
    try {
        // Call the existing saveNoteToServer function
        if (typeof saveNoteToServer === 'function') {
            saveNoteToServer();
        } else {
            console.error('saveNoteToServer function not found');
        }
    } finally {
        // Restore original noteid
        window.noteid = originalNoteid;
    }
}

/**
 * Trigger auto-save for tag changes
 * @deprecated - auto-save system handles this automatically
 */
function saveTagsDirectly(noteId, tagsValue) {
    // Auto-save handles all saving automatically
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }
}

// Make saveTagsDirectly globally available immediately after definition
window.saveTagsDirectly = saveTagsDirectly;

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
    // Get current workspace from multiple sources, prioritizing URL then localStorage then global variables
    let currentWorkspace = null;
    let workspaceSource = 'none';
    
    // 1. Check URL parameters first
    try {
        const urlParams = new URLSearchParams(window.location.search);
        currentWorkspace = urlParams.get('workspace');
        if (currentWorkspace) {
            workspaceSource = 'URL';
        }
    } catch (e) {
        console.warn('redirectToTag: Error reading URL params:', e);
    }
    
    // 2. If not found in URL, check global variables (set by PHP from database)
    if (!currentWorkspace) {
        if (typeof pageWorkspace !== 'undefined' && pageWorkspace && pageWorkspace !== 'undefined') {
            currentWorkspace = pageWorkspace;
            workspaceSource = 'pageWorkspace';
        } else if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
            currentWorkspace = selectedWorkspace;
            workspaceSource = 'selectedWorkspace';
        } else if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
            currentWorkspace = window.selectedWorkspace;
            workspaceSource = 'window.selectedWorkspace';
        } else if (typeof window.pageWorkspace !== 'undefined' && window.pageWorkspace && window.pageWorkspace !== 'undefined') {
            currentWorkspace = window.pageWorkspace;
            workspaceSource = 'window.pageWorkspace';
        }
    }
    
    // 3. Fallback: try to get from workspaceSelector
    if (!currentWorkspace || currentWorkspace === '' || currentWorkspace === 'undefined') {
        var wsSelector = document.getElementById('workspaceSelector');
        if (wsSelector && wsSelector.value) {
            currentWorkspace = wsSelector.value;
            workspaceSource = 'workspaceSelector';
        }
    }
    
    // Get current search parameters
    let urlParams = new URLSearchParams(window.location.search);
    let currentTagsSearch = urlParams.get('tags_search') || '';
    
    // Parse the current tags (space or comma separated)
    let currentTags = [];
    if (currentTagsSearch.trim()) {
        currentTags = currentTagsSearch.split(/[\s,]+/).filter(t => t.trim() !== '');
    }
    
    // Check if the clicked tag is already in the search
    const tagIndex = currentTags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
    let newTagsSearch = '';
    
    if (tagIndex > -1) {
        // Tag is already selected - remove it
        currentTags.splice(tagIndex, 1);
        newTagsSearch = currentTags.join(' ');
    } else {
        // Tag is not selected - add it
        currentTags.push(tag);
        newTagsSearch = currentTags.join(' ');
    }
    
    // Build URL with updated tags parameter
    let finalUrl;
    if (newTagsSearch.trim()) {
        // If there are still tags, navigate with them
        finalUrl = 'index.php?tags_search=' + encodeURIComponent(newTagsSearch) + '&workspace=' + encodeURIComponent(currentWorkspace);
    } else {
        // If no tags left, clear the search (like clicking the clear search button)
        finalUrl = 'index.php?workspace=' + encodeURIComponent(currentWorkspace);
    }
    
    // Navigate to the URL
    window.location.href = finalUrl;
}



// Make functions available globally for use by other scripts
window.initializeClickableTags = initializeClickableTags;
window.reinitializeClickableTagsAfterAjax = reinitializeClickableTagsAfterAjax;
window.refreshTagsCount = refreshTagsCount;

// Listen for i18n loaded event to update tag input placeholders
document.addEventListener('poznote:i18n:loaded', function() {
    // Update all tag input placeholders with translations
    document.querySelectorAll('.tag-input').forEach(function(input) {
        const container = input.closest('.editable-tags-container');
        if (container) {
            const tagElements = container.querySelectorAll('.clickable-tag');
            input.placeholder = tagElements.length > 0
                ? (window.t ? window.t('tags.add_single', null, 'Add tag...') : 'Add tag...')
                : (window.t ? window.t('tags.add_multiple', null, 'Add tags...') : 'Add tags...');
        }
    });
});
window.redirectToTag = redirectToTag;
