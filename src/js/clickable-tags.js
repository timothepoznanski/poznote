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
    
    // Empêcher les retours à la ligne de façon plus agressive
    tagInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Empêcher la saisie d'espaces
        if (e.key === ' ') {
            e.preventDefault();
            showTagError(tagInput, 'Les espaces ne sont pas autorisés dans les tags');
            return false;
        }
    });
    
    tagInput.addEventListener('keydown', function(e) {
        handleTagInput(e, noteId, editableContainer);
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
        e.preventDefault(); // Empêche le comportement par défaut (nouvelle ligne, etc.)
        e.stopPropagation(); // Empêche la propagation de l'événement
        
        const input = e.target;
        const tagText = input.value.trim();
        
        if (tagText && tagText !== '') {
            // Vérifier s'il y a des espaces dans le tag
            if (tagText.includes(' ')) {
                // Afficher un message d'erreur temporaire
                showTagError(input, 'Les tags ne peuvent pas contenir d\'espaces');
                return false;
            }
            
            // Check if tag already exists
            const existingTags = container.querySelectorAll('.clickable-tag');
            const tagExists = Array.from(existingTags).some(tag => 
                tag.textContent.toLowerCase() === tagText.toLowerCase()
            );
            
            if (!tagExists) {
                addTagElement(container, tagText, noteId);
                input.value = '';
                updateTagsInput(noteId, container);
                
                // Garde le focus sur l'input pour continuer à taper
                setTimeout(() => {
                    input.focus();
                }, 10);
            }
        }
        
        return false; // Empêche complètement la propagation
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
    const tagText = input.value.trim();
    
    if (tagText && tagText !== '') {
        // Vérifier s'il y a des espaces dans le tag
        if (tagText.includes(' ')) {
            // Afficher un message d'erreur temporaire et vider l'input
            showTagError(input, 'Les tags ne peuvent pas contenir d\'espaces');
            input.value = '';
            return;
        }
        
        // Check if tag already exists
        const existingTags = container.querySelectorAll('.clickable-tag');
        const tagExists = Array.from(existingTags).some(tag => 
            tag.textContent.toLowerCase() === tagText.toLowerCase()
        );
        
        if (!tagExists) {
            addTagElement(container, tagText, noteId);
            input.value = '';
            updateTagsInput(noteId, container);
        }
    }
}

/**
 * Remove a tag element
 */
function removeTagElement(tagWrapper, noteId) {
    const container = tagWrapper.closest('.editable-tags-container');
    tagWrapper.remove();
    updateTagsInput(noteId, container);
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
        console.error('Could not find note elements for saving tags');
        return;
    }
    
    // Set saving in progress
    if (typeof updateNoteEnCours !== 'undefined') {
        window.updateNoteEnCours = 1;
    }
    
    const params = new URLSearchParams({
        id: noteId,
        tags: tagsValue,
        folder: folderInput ? folderInput.value : '',
        heading: titleInput.value,
        entry: contentDiv.innerHTML,
        entrycontent: contentDiv.textContent || '',
        now: (new Date().getTime()/1000)-new Date().getTimezoneOffset()*60
    });
    
    fetch("updatenote.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        console.log('Tags saved successfully');
        // Clear the flags after successful save
        if (typeof editedButNotSaved !== 'undefined') {
            window.editedButNotSaved = 0;
        }
        if (typeof updateNoteEnCours !== 'undefined') {
            window.updateNoteEnCours = 0;
        }
    })
    .catch(function(error) {
        console.error('Error saving tags:', error);
        // Keep edited flag on error, clear saving flag
        if (typeof editedButNotSaved !== 'undefined') {
            window.editedButNotSaved = 1;
        }
        if (typeof updateNoteEnCours !== 'undefined') {
            window.updateNoteEnCours = 0;
        }
    });
}

/**
 * Redirect to notes with specific tag
 */
function redirectToTag(tag) {
    // Get excluded folders from localStorage like in listtags.js
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
        
        document.body.appendChild(form);
        form.submit();
    } else {
        // No exclusions, use simple GET redirect
        window.location.href = 'index.php?tags_search_from_list=' + encodeURIComponent(tag);
    }
}

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

// Make functions available globally for use by other scripts
window.initializeClickableTags = initializeClickableTags;
window.reinitializeClickableTagsAfterAjax = reinitializeClickableTagsAfterAjax;
