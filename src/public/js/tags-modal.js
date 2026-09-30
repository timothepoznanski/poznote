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
    
    // Suggest the workspace's existing tags while typing (discussion #1520),
    // from the cache the inline tag editor shares (js/clickable-tags.js).
    hideTagsModalSuggestions();
    if (typeof prefetchAllTags === 'function') {
        prefetchAllTags(_tagSuggestionWorkspace());
    }

    tagInput.oninput = function() {
        showTagsModalSuggestions(noteId);
    };
    tagInput.onblur = function() {
        hideTagsModalSuggestions();
    };

    // Setup input handler
    tagInput.onkeydown = function(e) {
        const dd = document.getElementById('tagsModalSuggestions');
        const items = (dd && dd.style.display !== 'none') ? dd.querySelectorAll('.tag-suggestion-item') : [];

        if (items.length > 0) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                const current = Array.prototype.findIndex.call(items, it => it.classList.contains('highlighted'));
                const next = current === -1
                    ? (step === 1 ? 0 : items.length - 1)
                    : Math.max(0, Math.min(items.length - 1, current + step));
                items.forEach((it, i) => it.classList.toggle('highlighted', i === next));
                items[next].scrollIntoView({ block: 'nearest' });
                return;
            }
            if (e.key === 'Escape') {
                // Close the list only; the modal's own Escape handler skips a
                // prevented event, so the dialog stays open.
                e.preventDefault();
                hideTagsModalSuggestions();
                return;
            }
            const highlighted = dd.querySelector('.tag-suggestion-item.highlighted');
            if (highlighted && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                pickTagsModalSuggestion(noteId, highlighted.textContent);
                return;
            }
        }

        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            const tagValue = tagInput.value.trim();
            if (tagValue) {
                addTagToModal(noteId, tagValue);
                tagInput.value = '';
            }
            hideTagsModalSuggestions();
        }
    };

    // Auto-focus the tag input
    setTimeout(() => {
        tagInput.focus();
    }, 100);
}

/**
 * Show the existing tags matching what is typed in the modal input, minus the
 * tags the note already has. Matching mirrors the inline tag editor.
 * @param {string} noteId - The ID of the note
 */
function showTagsModalSuggestions(noteId) {
    const tagInput = document.getElementById('tagsModalInput');
    if (!tagInput || typeof fetchAllTags !== 'function') return;

    const value = tagInput.value.trim().toLowerCase();
    if (!value) {
        hideTagsModalSuggestions();
        return;
    }

    fetchAllTags(_tagSuggestionWorkspace()).then(allTags => {
        // A slow response must not answer a prefix the user has already changed
        if (tagInput.value.trim().toLowerCase() !== value) return;

        const originalTagsInput = document.getElementById('tags' + noteId);
        const existing = (originalTagsInput ? originalTagsInput.value : '')
            .split(/[,\s]+/).filter(t => t !== '').map(t => t.toLowerCase());
        const matches = allTags.filter(t => t.toLowerCase().includes(value) && !existing.includes(t.toLowerCase()));

        if (matches.length === 0) {
            hideTagsModalSuggestions();
            return;
        }

        const dd = getTagsModalSuggestions();
        dd.innerHTML = '';
        matches.slice(0, 50).forEach(tag => {
            const item = document.createElement('div');
            item.className = 'tag-suggestion-item';
            item.textContent = tag;
            // mousedown, not click: keep the focus in the input so the next tag
            // can be typed straight away.
            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                pickTagsModalSuggestion(noteId, tag);
            });
            dd.appendChild(item);
        });

        // The modal body clips overflow, so the list hangs off the overlay
        // (the positioned, scrolling ancestor) right under the input.
        const modal = document.getElementById('tagsModal');
        const modalRect = modal.getBoundingClientRect();
        const inputRect = tagInput.getBoundingClientRect();
        dd.style.left = (inputRect.left - modalRect.left + modal.scrollLeft) + 'px';
        dd.style.top = (inputRect.bottom - modalRect.top + modal.scrollTop + 4) + 'px';
        dd.style.width = inputRect.width + 'px';
        dd.style.display = 'block';
        dd.scrollTop = 0;
    });
}

/**
 * Create or reuse the suggestions list of the tags modal
 * @returns {HTMLElement} The suggestions list element
 */
function getTagsModalSuggestions() {
    let dd = document.getElementById('tagsModalSuggestions');
    if (!dd) {
        dd = document.createElement('div');
        dd.id = 'tagsModalSuggestions';
        // tag-suggestions picks up the dark-mode look of the inline editor's list
        dd.className = 'tag-suggestions tags-modal-suggestions';
        dd.style.display = 'none';
        document.getElementById('tagsModal').appendChild(dd);
    }
    return dd;
}

/**
 * Hide the suggestions list of the tags modal
 */
function hideTagsModalSuggestions() {
    const dd = document.getElementById('tagsModalSuggestions');
    if (dd) {
        dd.style.display = 'none';
        dd.innerHTML = '';
    }
}

/**
 * Add the suggestion the user picked and clear the input for the next tag
 * @param {string} noteId - The ID of the note
 * @param {string} tag - The picked tag
 */
function pickTagsModalSuggestion(noteId, tag) {
    const tagInput = document.getElementById('tagsModalInput');
    if (tagInput) tagInput.value = '';
    hideTagsModalSuggestions();
    addTagToModal(noteId, tag);
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

        // The dot sits outside the editable name so renaming never picks it up.
        const dotHex = typeof resolveNoteTagHex === 'function' ? resolveNoteTagHex(tag) : '';
        if (dotHex) {
            const dot = document.createElement('span');
            dot.className = 'tag-color-dot';
            dot.style.background = dotHex;
            item.appendChild(dot);
        }

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

    // A tag created here is suggested from now on, here and in the inline editor
    if (typeof rememberTagsForSuggestions === 'function') {
        rememberTagsForSuggestions(tagsArray);
    }
    
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
