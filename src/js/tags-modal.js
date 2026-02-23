/**
 * Note Tags Modal Management
 */

/**
 * Show a modal to manage tags for a specific note
 * @param {string} noteId - The ID of the note
 */
function showNoteTagsModal(noteId) {
    const modal = document.getElementById('tagsModal');
    const tagsListContainer = document.getElementById('tagsModalTagsList');
    const noteIdInput = document.getElementById('tagsModalNoteId');
    const tagInput = document.getElementById('tagsModalInput');
    
    if (!modal || !tagsListContainer || !tagInput) return;
    
    // Set note ID
    noteIdInput.value = noteId;
    tagInput.value = '';
    
    // Get tags from the main index page hidden input
    const originalTagsInput = document.getElementById('tags' + noteId);
    if (!originalTagsInput) {
        console.error('Could not find tags input for note ' + noteId);
        return;
    }
    
    // Initial render
    renderTagsList(noteId, originalTagsInput.value);
    
    // Show modal
    modal.style.display = 'block';
    
    // Setup input handler
    tagInput.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            const tagValue = tagInput.value.trim();
            if (tagValue) {
                addTagToModal(noteId, tagValue);
                tagInput.value = '';
            }
        }
    };

    // Auto-focus the tag input
    setTimeout(() => {
        tagInput.focus();
    }, 100);
}

/**
 * Render the list of tags in the modal
 * @param {string} noteId - The ID of the note
 * @param {string} tagsValue - The space-separated tags string
 */
function renderTagsList(noteId, tagsValue) {
    const container = document.getElementById('tagsModalTagsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    const tags = tagsValue.split(/[,\s]+/).filter(tag => tag.trim() !== '');
    
    if (tags.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'tags-modal-empty';
        emptyMsg.textContent = window.t ? window.t('tags.empty') : 'Aucun tag.';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.padding = '10px';
        emptyMsg.style.color = '#94a3b8';
        container.appendChild(emptyMsg);
        return;
    }
    
    tags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'tags-modal-item';
        
        const name = document.createElement('span');
        name.className = 'tags-modal-item-name';
        name.textContent = tag;
        name.contentEditable = true;
        name.spellcheck = false;
        
        let originalValue = tag;
        
        name.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                name.blur();
            } else if (e.key === 'Escape') {
                name.textContent = originalValue;
                name.blur();
            }
        };
        
        name.onblur = function() {
            const newValue = name.textContent.trim().split(/\s+/)[0]; // No spaces in tags
            if (newValue && newValue !== originalValue) {
                renameTagInModal(noteId, originalValue, newValue);
                originalValue = newValue;
            } else {
                name.textContent = originalValue;
            }
        };
        
        const delBtn = document.createElement('span');
        delBtn.className = 'tags-modal-item-delete lucide lucide-x';
        delBtn.onclick = function() {
            removeTagFromModal(noteId, tag);
        };
        
        item.appendChild(name);
        item.appendChild(delBtn);
        container.appendChild(item);
    });
}

/**
 * Rename a tag in the modal
 * @param {string} noteId - The ID of the note
 * @param {string} oldTag - The old tag text
 * @param {string} newTag - The new tag text
 */
function renameTagInModal(noteId, oldTag, newTag) {
    if (oldTag === newTag || !newTag.trim()) return;
    
    const originalTagsInput = document.getElementById('tags' + noteId);
    if (!originalTagsInput) return;
    
    let currentTags = originalTagsInput.value.split(/[,\s]+/).filter(t => t.trim() !== '');
    const index = currentTags.indexOf(oldTag);
    
    if (index !== -1) {
        // Remove old tag
        currentTags.splice(index, 1);
        
        // Add new tag if it doesn't exist already at this or another position
        if (currentTags.indexOf(newTag) === -1) {
            currentTags.splice(index, 0, newTag);
        }
        
        updateAndSaveTags(noteId, currentTags);
    }
}

/**
 * Add a tag and sync back
 * @param {string} noteId - The ID of the note
 * @param {string} tagText - The tag text to add
 */
function addTagToModal(noteId, tagText) {
    const originalTagsInput = document.getElementById('tags' + noteId);
    if (!originalTagsInput) return;
    
    let currentTags = originalTagsInput.value.split(/[,\s]+/).filter(t => t.trim() !== '');
    
    // Don't add duplicate
    if (currentTags.indexOf(tagText) === -1) {
        currentTags.push(tagText);
        updateAndSaveTags(noteId, currentTags);
    }
}

/**
 * Remove a tag and sync back
 * @param {string} noteId - The ID of the note
 * @param {string} tagText - The tag text to remove
 */
function removeTagFromModal(noteId, tagText) {
    const originalTagsInput = document.getElementById('tags' + noteId);
    if (!originalTagsInput) return;
    
    let currentTags = originalTagsInput.value.split(/[,\s]+/).filter(t => t.trim() !== '');
    const index = currentTags.indexOf(tagText);
    
    if (index !== -1) {
        currentTags.splice(index, 1);
        updateAndSaveTags(noteId, currentTags);
    }
}

/**
 * Update the original input, re-render and trigger save
 * @param {string} noteId - The ID of the note
 * @param {Array} tagsArray - The new array of tags
 */
function updateAndSaveTags(noteId, tagsArray) {
    const originalTagsInput = document.getElementById('tags' + noteId);
    if (!originalTagsInput) return;
    
    const newValue = tagsArray.join(' ');
    originalTagsInput.value = newValue;
    
    // Update modal display
    renderTagsList(noteId, newValue);
    
    // Sync UI on main page if convertTagsToEditable exists
    if (typeof window.convertTagsToEditable === 'function') {
        window.convertTagsToEditable(noteId);
    }
    
    // Trigger auto-save
    if (typeof window.triggerAutoSaveForNote === 'function') {
        window.triggerAutoSaveForNote(noteId);
    }
    
    // Trigger input event for any other listeners
    const event = new Event('input', { bubbles: true });
    originalTagsInput.dispatchEvent(event);
}

// Make it global
window.showNoteTagsModal = showNoteTagsModal;
