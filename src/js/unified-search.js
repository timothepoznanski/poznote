// UNIFIED SEARCH FUNCTIONALITY
function clearUnifiedSearch() {
    // Clear search highlights immediately when clearing search
    if (typeof clearSearchHighlights === 'function') {
        clearSearchHighlights();
    }
    
    // Preserve search type preferences by checking current button states
    const notesActive = document.getElementById('search-notes-btn') && document.getElementById('search-notes-btn').classList.contains('active');
    const tagsActive = document.getElementById('search-tags-btn') && document.getElementById('search-tags-btn').classList.contains('active');
    const foldersActive = document.getElementById('search-folders-btn') && document.getElementById('search-folders-btn').classList.contains('active');
    
    // Check mobile buttons if desktop aren't found
    const notesMobileActive = document.getElementById('search-notes-btn-mobile') && document.getElementById('search-notes-btn-mobile').classList.contains('active');
    const tagsMobileActive = document.getElementById('search-tags-btn-mobile') && document.getElementById('search-tags-btn-mobile').classList.contains('active');
    const foldersMobileActive = document.getElementById('search-folders-btn-mobile') && document.getElementById('search-folders-btn-mobile').classList.contains('active');
    
    // Use desktop state if available, otherwise mobile state
    const preserveNotes = notesActive || notesMobileActive;
    const preserveTags = tagsActive || tagsMobileActive;
    const preserveFolders = foldersActive || foldersMobileActive;
    
    // If folders mode was active, restore all folders visibility
    if (preserveFolders) {
        const folderHeaders = document.querySelectorAll('.folder-header');
        folderHeaders.forEach(folderHeader => {
            // Use CSS class to show/hide folders instead of inline styles
            folderHeader.classList.remove('hidden');
            
            // Restore folder content visibility based on their previous state
            const folderToggle = folderHeader.querySelector('[data-folder-id]');
            if (folderToggle) {
                const folderId = folderToggle.getAttribute('data-folder-id');
                const folderContent = document.getElementById(folderId);
                if (folderContent) {
                    // Use localStorage state if available, or show by default
                    const state = localStorage.getItem('folder_' + folderId);
                    if (state === 'closed') {
                        folderContent.classList.add('hidden');
                    } else {
                        folderContent.classList.remove('hidden');
                    }
                }
            }
        });
        
        // Clear search input
        const desktopInput = document.getElementById('unified-search');
        const mobileInput = document.getElementById('unified-search-mobile');
        if (desktopInput) desktopInput.value = '';
        if (mobileInput) mobileInput.value = '';
        
        // Reset to notes mode after clearing folders
        const desktopNotesBtn = document.getElementById('search-notes-btn');
        const desktopFoldersBtn = document.getElementById('search-folders-btn');
        const mobileNotesBtn = document.getElementById('search-notes-btn-mobile');
        const mobileFoldersBtn = document.getElementById('search-folders-btn-mobile');
        
        if (desktopNotesBtn && desktopFoldersBtn) {
            desktopNotesBtn.classList.add('active');
            desktopFoldersBtn.classList.remove('active');
            updateSearchPlaceholder(false);
        }
        if (mobileNotesBtn && mobileFoldersBtn) {
            mobileNotesBtn.classList.add('active');
            mobileFoldersBtn.classList.remove('active');
            updateSearchPlaceholder(true);
        }
        
        return;
    }
    
    // Build URL with preserved preferences
    let url = 'index.php';
    const params = new URLSearchParams();
    
    // CRITICAL: Preserve current workspace
    const currentWorkspace = new URLSearchParams(window.location.search).get('workspace') || selectedWorkspace || 'Poznote';
    if (currentWorkspace && currentWorkspace !== 'Poznote') {
        params.set('workspace', currentWorkspace);
    }
    
    // Preserve current folder filter if it exists
    const currentFolder = new URLSearchParams(window.location.search).get('folder');
    if (currentFolder) {
        params.set('folder', currentFolder);
    }
    
    // Add search type indicators to preserve button states
    if (preserveNotes) {
        params.set('preserve_notes', '1');
    }
    if (preserveTags) {
        params.set('preserve_tags', '1');
    }
    if (preserveFolders) {
        params.set('preserve_folders', '1');
    }
    
    if (params.toString()) {
        url += '?' + params.toString();
    }
    
    window.location.href = url;
}

// Helper utilities to reduce duplication
function getSuffix(isMobile) {
    return isMobile ? '-mobile' : '';
}

function getButtonsAndFields(isMobile) {
    const s = getSuffix(isMobile);
    return {
        notesBtn: document.getElementById('search-notes-btn' + s),
        tagsBtn: document.getElementById('search-tags-btn' + s),
        foldersBtn: document.getElementById('search-folders-btn' + s),
        searchInput: document.getElementById('unified-search' + s),
        notesHidden: document.getElementById('search-in-notes' + s) || document.getElementById('search-notes-hidden' + s),
        tagsHidden: document.getElementById('search-in-tags' + s) || document.getElementById('search-tags-hidden' + s),
        foldersHidden: document.getElementById('search-in-folders' + s) || document.getElementById('search-in-folders' + s)
    };
}

function setActiveStyle(btn) {
    if (!btn) return;
    btn.classList.add('active');
}

function setInactiveStyle(btn) {
    if (!btn) return;
    btn.classList.remove('active');
}

function ajaxSubmitForm(form, formParams, searchState) {
    // Encapsulate duplicated AJAX fetch + DOM swap + reinit + state restore
    try {
        fetch(form.action || window.location.pathname, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formParams
        })
        .then(resp => resp.text())
        .then(html => {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const newLeft = doc.getElementById('left_col');
                const newRight = doc.getElementById('right_col');

                if (newLeft) {
                    const currentLeft = document.getElementById('left_col');
                    if (currentLeft) currentLeft.innerHTML = newLeft.innerHTML;
                }

                if (newRight) {
                    const currentRight = document.getElementById('right_col');
                    if (currentRight) currentRight.innerHTML = newRight.innerHTML;
                }

                try {
                    const baseUrl = window.location.pathname;
                    const newUrl = baseUrl + '?' + formParams;
                    history.pushState({}, '', newUrl);
                } catch (err) { /* ignore history errors */ }

                // Reinitialize dynamic behaviors on the updated DOM
                try { if (typeof reinitializeClickableTagsAfterAjax === 'function') reinitializeClickableTagsAfterAjax(); } catch(e) {}
                try { if (typeof initializeWorkspaceMenu === 'function') initializeWorkspaceMenu(); } catch(e) {}
                try { initializeSearchButtons(false); initializeSearchButtons(true); } catch(e) {}
                try { if (typeof reinitializeNoteContent === 'function') reinitializeNoteContent(); } catch(e) {}

                // Restore search button state if provided
                try { if (searchState) restoreSearchState(searchState); setTimeout(() => ensureAtLeastOneButtonActive(), 150); } catch(e) {}

                // Ensure highlighting runs after AJAX content replacement so search terms
                // are highlighted on the first AJAX search result update.
                try {
                    if (typeof highlightSearchTerms === 'function') {
                        // Small delay to allow DOM reinitialization to complete
                        setTimeout(highlightSearchTerms, 150);
                    }
                } catch(e) {}
            } catch (err) {
                // Fallback: reload the page
                form.submit();
            }
        })
        .catch(err => {
            // Fallback to normal submit
            form.submit();
        });
    } catch (err) {
        form.submit();
    }
}

// Function to go back to home while preserving search state (fallback for JavaScript calls)
function goHomeWithSearch() {
    try {
        // Check if there's an active search
        const desktopSearchInput = document.getElementById('unified-search');
        const mobileSearchInput = document.getElementById('unified-search-mobile');
        const hasDesktopSearch = desktopSearchInput && desktopSearchInput.value.trim() !== '';
        const hasMobileSearch = mobileSearchInput && mobileSearchInput.value.trim() !== '';
        
        // If there's an active search, preserve it
        if (hasDesktopSearch || hasMobileSearch) {
            // Build URL preserving current search parameters
            let url = 'index.php';
            const params = new URLSearchParams();
            
            // Check current search type and value
            const notesActive = document.getElementById('search-notes-btn') && document.getElementById('search-notes-btn').classList.contains('active');
            const tagsActive = document.getElementById('search-tags-btn') && document.getElementById('search-tags-btn').classList.contains('active');
            const notesMobileActive = document.getElementById('search-notes-btn-mobile') && document.getElementById('search-notes-btn-mobile').classList.contains('active');
            const tagsMobileActive = document.getElementById('search-tags-btn-mobile') && document.getElementById('search-tags-btn-mobile').classList.contains('active');
            
            // Get the search value
            const searchValue = hasDesktopSearch ? desktopSearchInput.value.trim() : mobileSearchInput.value.trim();
            
            // Add search parameters based on active type
            if (notesActive || notesMobileActive) {
                params.set('search', searchValue);
                params.set('preserve_notes', '1');
            } else if (tagsActive || tagsMobileActive) {
                params.set('tags_search', searchValue);
                params.set('preserve_tags', '1');
            }
            
            // Preserve current folder filter if it exists
            const currentFolder = new URLSearchParams(window.location.search).get('folder');
            if (currentFolder) {
                params.set('folder', currentFolder);
            }
            
            if (params.toString()) {
                url += '?' + params.toString();
            }
            
            window.location.href = url;
        } else {
            // No active search, just go to home
            window.location.href = 'index.php';
        }
    } catch (error) {
        // Fallback: simple navigation to home
        window.location.href = 'index.php';
    }
}

// Global references to event handlers for cleanup
let desktopSubmitHandler = null;
let mobileSubmitHandler = null;

// Function to attach search form event listeners (can be called multiple times)
function attachSearchFormListeners() {
    
    // Desktop form - remove existing listener if it exists, then add new one
    const unifiedForm = document.getElementById('unified-search-form');
    if (unifiedForm) {
        // Remove existing listener if it exists
        if (desktopSubmitHandler) {
            unifiedForm.removeEventListener('submit', desktopSubmitHandler);
        }
        
        // Create new handler and store reference
        desktopSubmitHandler = function(e) {
            handleUnifiedSearchSubmit(e, false);
        };
        
        unifiedForm.addEventListener('submit', desktopSubmitHandler);
    } else {
        
    }
    
    // Mobile form - same approach
    const unifiedFormMobile = document.getElementById('unified-search-form-mobile');
    if (unifiedFormMobile) {
        // Remove existing listener if it exists
        if (mobileSubmitHandler) {
            unifiedFormMobile.removeEventListener('submit', mobileSubmitHandler);
        }
        
        // Create new handler and store reference
        mobileSubmitHandler = function(e) {
            handleUnifiedSearchSubmit(e, true);
        };
        
        unifiedFormMobile.addEventListener('submit', mobileSubmitHandler);
    } else {
        
    }
}

// Handle unified search form submission
document.addEventListener('DOMContentLoaded', function() {
    
    // Attach form event listeners FIRST
    attachSearchFormListeners();
    
    // Then initialize search state for both desktop and mobile
    initializeSearchButtons(false); // Desktop
    initializeSearchButtons(true);  // Mobile
    
    // Ensure at least one button is active after initialization
    setTimeout(() => {
        ensureAtLeastOneButtonActive();
        
        // Double-check after a longer delay in case something else interferes
        setTimeout(() => {
            ensureAtLeastOneButtonActive();
        }, 200);
    }, 50);
    
    // Handle browser back button to preserve search state
    window.addEventListener('popstate', function(event) {
        // Check if we're going back from a note view to search results
        const urlParams = new URLSearchParams(window.location.search);
        const hasSearch = urlParams.get('search') || urlParams.get('tags_search');
        const preserveNotes = urlParams.get('preserve_notes');
        const preserveTags = urlParams.get('preserve_tags');
        
        // If there was a search and we're back to the main page, restore search state
        if (hasSearch && (preserveNotes || preserveTags)) {
            // Let the page reload normally to restore the search results
            // The PHP will handle restoring the search state based on URL parameters
            return;
        }
    });
    
    // Highlight search terms when page loads if we're in search mode
    setTimeout(function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search')) {
            if (typeof highlightSearchTerms === 'function') {
                highlightSearchTerms();
            }
        }
    }, 500);
});

function initializeSearchButtons(isMobile) {
    initializeSearchButtonsWithState(isMobile, null);
}

function initializeSearchButtonsWithState(isMobile, forcedState) {
    
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    const notesHidden = document.getElementById('search-in-notes' + suffix);
    const tagsHidden = document.getElementById('search-in-tags' + suffix);
    const foldersHidden = document.getElementById('search-in-folders' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput) {
        return;
    }
    
    // Check if there are existing search preferences from hidden inputs
    const hasNotesPreference = notesHidden && notesHidden.value === '1';
    const hasTagsPreference = tagsHidden && tagsHidden.value === '1';
    const hasFoldersPreference = foldersHidden && foldersHidden.value === '1';
    
    // Check current visual button state to preserve user's current selection
    const currentNotesActive = notesBtn && notesBtn.classList.contains('active');
    const currentTagsActive = tagsBtn && tagsBtn.classList.contains('active');
    const currentFoldersActive = foldersBtn && foldersBtn.classList.contains('active');
    
    // Safety check: ensure only one preference is active at a time
    // If we're reinitializing, prefer current visual state over hidden field conflicts
    let finalNotesActive = false;
    let finalTagsActive = false;
    let finalFoldersActive = false;
    
    // If there are multiple hidden field conflicts, use current visual state
    const hasMultiplePreferences = [hasNotesPreference, hasTagsPreference, hasFoldersPreference].filter(Boolean).length > 1;
    const hasCurrentVisualState = currentNotesActive || currentTagsActive || currentFoldersActive;
    
    // If we have a forced state from DOM replacement, use it with highest priority
    if (forcedState) {
        finalNotesActive = (isMobile ? forcedState.mobile?.notes : forcedState.desktop?.notes) || false;
        finalTagsActive = (isMobile ? forcedState.mobile?.tags : forcedState.desktop?.tags) || false;
        finalFoldersActive = (isMobile ? forcedState.mobile?.folders : forcedState.desktop?.folders) || false;
    } else if (hasMultiplePreferences && hasCurrentVisualState) {
        finalNotesActive = currentNotesActive;
        finalTagsActive = currentTagsActive;
        finalFoldersActive = currentFoldersActive;
    } else {
        // Normal priority logic: respect the exact preferences without automatic priority
        if (hasNotesPreference && !hasTagsPreference && !hasFoldersPreference) {
            finalNotesActive = true;
        } else if (hasTagsPreference && !hasNotesPreference && !hasFoldersPreference) {
            finalTagsActive = true;
        } else if (hasFoldersPreference && !hasNotesPreference && !hasTagsPreference) {
            finalFoldersActive = true;
        } else if (hasNotesPreference && hasTagsPreference) {
            // If both notes and tags are preferred, check URL parameters to decide
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('preserve_tags') === '1') {
                finalTagsActive = true;
            } else if (urlParams.get('preserve_notes') === '1') {
                finalNotesActive = true;
            } else {
                // Default to notes only if no clear preference from URL
                finalNotesActive = true;
            }
        } else {
            // Default: activate notes
            finalNotesActive = true;
        }
    }
    
    // Apply the final button states and synchronize hidden fields
    if (finalNotesActive) {
        setActiveStyle(notesBtn);
        setInactiveStyle(tagsBtn);
        setInactiveStyle(foldersBtn);
        if (notesHidden) notesHidden.value = '1';
        if (tagsHidden) tagsHidden.value = '';
        if (foldersHidden) foldersHidden.value = '';
    } else if (finalTagsActive) {
        setActiveStyle(tagsBtn);
        setInactiveStyle(notesBtn);
        setInactiveStyle(foldersBtn);
        if (notesHidden) notesHidden.value = '';
        if (tagsHidden) tagsHidden.value = '1';
        if (foldersHidden) foldersHidden.value = '';
    } else if (finalFoldersActive) {
        setActiveStyle(foldersBtn);
        setInactiveStyle(notesBtn);
        setInactiveStyle(tagsBtn);
        if (notesHidden) notesHidden.value = '';
        if (tagsHidden) tagsHidden.value = '';
        if (foldersHidden) foldersHidden.value = '1';
    }
    
    // Remove any existing event listeners first to avoid duplicates
    try { notesBtn.removeEventListener('click', notesBtn._clickHandler); } catch(e) {}
    try { tagsBtn.removeEventListener('click', tagsBtn._clickHandler); } catch(e) {}
    try { foldersBtn.removeEventListener('click', foldersBtn._clickHandler); } catch(e) {}
    
    // Create new handlers and store references for cleanup
    notesBtn._clickHandler = function() {
        toggleSearchType('notes', isMobile);
    };
    
    tagsBtn._clickHandler = function() {
        toggleSearchType('tags', isMobile);
    };
    
    foldersBtn._clickHandler = function() {
        toggleSearchType('folders', isMobile);
    };
    
    // Add click handlers
    notesBtn.addEventListener('click', notesBtn._clickHandler);
    tagsBtn.addEventListener('click', tagsBtn._clickHandler);
    foldersBtn.addEventListener('click', foldersBtn._clickHandler);
    
    // Update placeholder and input state
    updateSearchPlaceholder(isMobile);
}

function toggleSearchType(type, isMobile) {
    
    const suffix = isMobile ? '-mobile' : '';
    const btn = document.getElementById('search-' + type + '-btn' + suffix);
    
    if (!btn) {
        return;
    }
    
    // Get all three buttons
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    
    // If button is already active, do nothing (keep it active)
    if (btn.classList.contains('active')) {
        return;
    }
    
    // Clear search highlights when switching away from notes mode
    if (type !== 'notes' && typeof clearSearchHighlights === 'function') {
        clearSearchHighlights();
    }
    
    // Deactivate all buttons first - reset to default search-pill style
    setInactiveStyle(notesBtn);
    setInactiveStyle(tagsBtn);
    setInactiveStyle(foldersBtn);
    
    // Activate the clicked button via CSS class
    setActiveStyle(btn);
    
    // Remove error styling
    hideSearchValidationError(isMobile);
    
    // Update search input state and placeholder
    updateSearchPlaceholder(isMobile);
    updateHiddenInputs(isMobile);
    
    // Get search input to check for content
    const searchInput = document.getElementById('unified-search' + suffix);
    
    // If this is folders mode, trigger folder filtering immediately
    if (type === 'folders') {
        if (searchInput && searchInput.value.trim() !== '') {
            filterFolders(searchInput.value.trim(), isMobile);
        }
        // Focus the search input to encourage typing
        if (searchInput) {
            searchInput.focus();
        }
        return;
    }
    
    // For notes and tags: If there's content in the search input, trigger search automatically
    if (searchInput && searchInput.value.trim() !== '') {
        // Update hidden inputs with current search value before submitting
        updateHiddenInputs(isMobile);

        // Instead of triggering form submission, directly submit with excluded folders
        submitSearchWithExcludedFolders(isMobile);
    } else {
        // If no content, just focus the search input to encourage typing
        if (searchInput) {
            searchInput.focus();
        }
    }
}

function submitSearchWithExcludedFolders(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const formId = 'unified-search-form' + suffix;
    const form = document.getElementById(formId);
    
    if (!form) return;

    // Add excluded folders to form before submission
    addExcludedFoldersToForm(form, isMobile);

    // Build form parameters manually to ensure all fields are included
    const formData = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
        params.append(key, value);
    }
    const formParams = params.toString();

    // Save current search button state before AJAX
    const searchState = saveCurrentSearchState(isMobile);

    // Mark the form as performing an AJAX submit so other listeners
    // (like the general highlighting submit listener) can skip
    // immediate highlighting to avoid a duplicate highlight cycle.
    try { form.dataset.ajaxSubmitting = '1'; } catch(e) {}
    ajaxSubmitForm(form, formParams, searchState);
}

function handleUnifiedSearchSubmit(e, isMobile) {
    
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput) {
        return;
    }
    
    const searchValue = searchInput.value.trim();
    
    // Check button states
    const hasNotesActive = notesBtn.classList.contains('active');
    const hasTagsActive = tagsBtn.classList.contains('active');
    const hasFoldersActive = foldersBtn.classList.contains('active');
    
    // If folders mode is active, prevent form submission and handle folder filtering
    if (hasFoldersActive) {
        e.preventDefault();
        filterFolders(searchValue, isMobile);
        return;
    }
    
    // If no search value, clear search
    if (!searchValue) {
        e.preventDefault();
        clearUnifiedSearch();
        return;
    }
    
    // Safety check: ensure exactly one is active
    const activeCount = [hasNotesActive, hasTagsActive, hasFoldersActive].filter(Boolean).length;
    if (activeCount !== 1) {
        e.preventDefault();
        // Reset to notes only as default
        notesBtn.classList.add('active');
        tagsBtn.classList.remove('active');
        foldersBtn.classList.remove('active');
        updateSearchPlaceholder(isMobile);
        updateHiddenInputs(isMobile);
        return;
    }
    if (!hasNotesActive && !hasTagsActive) {
        e.preventDefault();
        // Activate notes as default
        notesBtn.classList.add('active');
        updateSearchPlaceholder(isMobile);
        updateHiddenInputs(isMobile);
        return;
    }
    
    // Remove any existing validation error
    hideSearchValidationError(isMobile);
    
    // Update hidden inputs before form submission
    updateHiddenInputs(isMobile);
    
    // Add excluded folders to form data - this handles normal form submissions
    addExcludedFoldersToForm(e.target, isMobile);

    // Intercept the normal submit and perform AJAX request to update columns
    try {
        e.preventDefault();

        const form = e.target;
        // Build form parameters manually to ensure all fields are included
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        // Explicitly add all form fields
        for (const [key, value] of formData.entries()) {
            params.append(key, value);
        }
        
        const formParams = params.toString();
        
        // Save current search button state before AJAX in handleUnifiedSearchSubmit
        const searchState = saveCurrentSearchState(isMobile);

    // Delegate to ajax helper (single AJAX path)
    ajaxSubmitForm(form, formParams, searchState);
    } catch (err) {
        // On unexpected error, allow default submit
    }
}

function addExcludedFoldersToForm(form, isMobile) {
    // Get excluded folders from our folder search system
    const excludedFolders = getExcludedFoldersFromLocalStorage();
    
    if (excludedFolders.length > 0) {
        // Remove any existing excluded_folders input
        const existingInput = form.querySelector('input[name="excluded_folders"]');
        if (existingInput) {
            existingInput.remove();
        }
        
        // Add new hidden input with excluded folders
        const excludedInput = document.createElement('input');
        excludedInput.type = 'hidden';
        excludedInput.name = 'excluded_folders';
        excludedInput.value = JSON.stringify(excludedFolders);
        form.appendChild(excludedInput);
    }
}

function getExcludedFoldersFromLocalStorage() {
    const excludedFolders = [];
    
    // Instead of relying on DOM elements, read directly from localStorage
    // We'll scan localStorage for all keys that start with 'folder_search_'
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('folder_search_')) {
            const state = localStorage.getItem(key);
            if (state === 'excluded') {
                // Extract folder name from key (remove 'folder_search_' prefix)
                const folderName = key.substring('folder_search_'.length);
                excludedFolders.push(folderName);
            }
        }
    }
    
    return excludedFolders;
}

function showSearchValidationError(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const container = document.querySelector(isMobile ? '.unified-search-container.mobile' : '.unified-search-container');
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    
    // Remove existing error message
    hideSearchValidationError(isMobile);
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'search-validation-error';
    errorDiv.textContent = 'Please select at least one search option (Notes or Tags)';
    
    // Insert error message after search bar
    const searchBar = container.querySelector('.searchbar-row');
    searchBar.parentNode.insertBefore(errorDiv, searchBar.nextSibling);
    
    // Add error styling to buttons
    notesBtn.classList.add('search-type-btn-error');
    tagsBtn.classList.add('search-type-btn-error');
    
    // Auto-hide error after 3 seconds
    setTimeout(() => hideSearchValidationError(isMobile), 3000);
}

function hideSearchValidationError(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const container = document.querySelector(isMobile ? '.unified-search-container.mobile' : '.unified-search-container');
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    
    // Remove error message
    const errorMessage = container.querySelector('.search-validation-error');
    if (errorMessage) {
        errorMessage.remove();
    }
    
    // Remove error styling from buttons
    if (notesBtn) notesBtn.classList.remove('search-type-btn-error');
    if (tagsBtn) tagsBtn.classList.remove('search-type-btn-error');
}

function updateSearchPlaceholder(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput) return;
    
    const hasNotesActive = notesBtn.classList.contains('active');
    const hasTagsActive = tagsBtn.classList.contains('active');
    const hasFoldersActive = foldersBtn.classList.contains('active');
    
    let placeholder = 'Search in contents and titles...'; // Default placeholder
    
    if (hasNotesActive) {
        placeholder = 'Search in contents and titles...';
    } else if (hasTagsActive) {
        placeholder = 'Search in one or more tags...';
    } else if (hasFoldersActive) {
        placeholder = 'Filter folders...';
    }
    
    searchInput.placeholder = placeholder;
    
    // Always enable search input since there's always a selection
    searchInput.disabled = false;
}

function updateHiddenInputs(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    const notesHidden = document.getElementById('search-notes-hidden' + suffix);
    const tagsHidden = document.getElementById('search-tags-hidden' + suffix);
    const foldersHidden = document.getElementById('search-in-folders' + suffix);
    const notesCheckHidden = document.getElementById('search-in-notes' + suffix);
    const tagsCheckHidden = document.getElementById('search-in-tags' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput || !notesHidden || !tagsHidden) return;
    
    const searchValue = searchInput.value.trim();
    const hasNotesActive = notesBtn.classList.contains('active');
    const hasTagsActive = tagsBtn.classList.contains('active');
    const hasFoldersActive = foldersBtn.classList.contains('active');
    
    // Update hidden inputs based on button states
    if (hasNotesActive) {
        notesHidden.value = searchValue;
        if (notesCheckHidden) notesCheckHidden.value = '1';
    } else {
        notesHidden.value = '';
        if (notesCheckHidden) notesCheckHidden.value = '';
    }
    
    if (hasTagsActive) {
        tagsHidden.value = searchValue;
        if (tagsCheckHidden) tagsCheckHidden.value = '1';
    } else {
        tagsHidden.value = '';
        if (tagsCheckHidden) tagsCheckHidden.value = '';
    }
    
    // Folders don't use the form submission, so just mark the state
    if (foldersHidden) {
        foldersHidden.value = hasFoldersActive ? '1' : '';
    }
}

// Function to handle folder filtering from unified search
function filterFolders(filterValue, isMobile) {
    if (filterValue === undefined) {
        const suffix = isMobile ? '-mobile' : '';
        const searchInput = document.getElementById('unified-search' + suffix);
        filterValue = searchInput ? searchInput.value.toLowerCase().trim() : '';
    } else {
        filterValue = filterValue.toLowerCase().trim();
    }
    
    // Get all folder headers
    const folderHeaders = document.querySelectorAll('.folder-header');
    
    folderHeaders.forEach(folderHeader => {
        const folderName = folderHeader.getAttribute('data-folder');
        if (!folderName) return;
        
        // Check if folder name matches filter
        const matches = folderName.toLowerCase().includes(filterValue);
        
        if (matches || !filterValue) {
            // Show folder
            folderHeader.classList.remove('hidden');
        } else {
            // Hide folder and its content
            folderHeader.classList.add('hidden');
            
            // Also hide folder content using the data-folder-id approach
            const folderToggle = folderHeader.querySelector('[data-folder-id]');
            if (folderToggle) {
                const folderId = folderToggle.getAttribute('data-folder-id');
                const folderContent = document.getElementById(folderId);
                if (folderContent) {
                    folderContent.classList.add('hidden');
                }
            }
        }
    });
}

// Functions to save and restore search button state across AJAX calls
function saveCurrentSearchState(isMobile) {
    const state = {
        desktop: {
            notes: false,
            tags: false,
            folders: false
        },
        mobile: {
            notes: false,
            tags: false,
            folders: false
        }
    };
    
    // Save desktop state
    const notesBtn = document.getElementById('search-notes-btn');
    const tagsBtn = document.getElementById('search-tags-btn');
    const foldersBtn = document.getElementById('search-folders-btn');
    
    if (notesBtn) state.desktop.notes = notesBtn.classList.contains('active');
    if (tagsBtn) state.desktop.tags = tagsBtn.classList.contains('active');
    if (foldersBtn) state.desktop.folders = foldersBtn.classList.contains('active');
    
    // Save mobile state
    const notesBtnMobile = document.getElementById('search-notes-btn-mobile');
    const tagsBtnMobile = document.getElementById('search-tags-btn-mobile');
    const foldersBtnMobile = document.getElementById('search-folders-btn-mobile');
    
    if (notesBtnMobile) state.mobile.notes = notesBtnMobile.classList.contains('active');
    if (tagsBtnMobile) state.mobile.tags = tagsBtnMobile.classList.contains('active');
    if (foldersBtnMobile) state.mobile.folders = foldersBtnMobile.classList.contains('active');
    
    return state;
}

function restoreSearchState(state) {
    if (!state) return;
    
    // Use a small delay to ensure DOM elements are ready
    setTimeout(() => {
        
        // Restore desktop state
        const notesBtn = document.getElementById('search-notes-btn');
        const tagsBtn = document.getElementById('search-tags-btn');
        const foldersBtn = document.getElementById('search-folders-btn');
        
        if (notesBtn) {
            if (state.desktop.notes) {
                notesBtn.classList.add('active');
            } else {
                notesBtn.classList.remove('active');
            }
        }
        
        if (tagsBtn) {
            if (state.desktop.tags) {
                tagsBtn.classList.add('active');
            } else {
                tagsBtn.classList.remove('active');
            }
        }
        
        if (foldersBtn) {
            if (state.desktop.folders) {
                foldersBtn.classList.add('active');
            } else {
                foldersBtn.classList.remove('active');
            }
        }
        
        // Restore mobile state
        const notesBtnMobile = document.getElementById('search-notes-btn-mobile');
        const tagsBtnMobile = document.getElementById('search-tags-btn-mobile');
        const foldersBtnMobile = document.getElementById('search-folders-btn-mobile');
        
        if (notesBtnMobile) {
            if (state.mobile.notes) {
                notesBtnMobile.classList.add('active');
            } else {
                notesBtnMobile.classList.remove('active');
            }
        }
        
        if (tagsBtnMobile) {
            if (state.mobile.tags) {
                tagsBtnMobile.classList.add('active');
            } else {
                tagsBtnMobile.classList.remove('active');
            }
        }
        
        if (foldersBtnMobile) {
            if (state.mobile.folders) {
                foldersBtnMobile.classList.add('active');
            } else {
                foldersBtnMobile.classList.remove('active');
            }
        }
        
        // Update placeholders and hidden inputs to match restored state
        updateSearchPlaceholder(false); // Desktop
        updateSearchPlaceholder(true);  // Mobile
        
        // Safety check: ensure at least one button is active
        ensureAtLeastOneButtonActive();
    }, 100); // 100ms delay to ensure DOM is ready
}

// Global function to save current search state (callable from other scripts)
window.saveCurrentSearchState = function() {
    const notesBtn = document.getElementById('search-notes-btn');
    const tagsBtn = document.getElementById('search-tags-btn');
    const foldersBtn = document.getElementById('search-folders-btn');
    
    return {
        desktop: {
            notes: notesBtn ? notesBtn.classList.contains('active') : false,
            tags: tagsBtn ? tagsBtn.classList.contains('active') : false,
            folders: foldersBtn ? foldersBtn.classList.contains('active') : false
        },
        mobile: {
            notes: false,
            tags: false, 
            folders: false
        }
    };
};

// Global function to reinitialize search after workspace changes (can be called from other scripts)
window.reinitializeSearchAfterWorkspaceChange = function() {
    
    // Get the current workspace to add specific handling for Poznote
    const currentWorkspace = selectedWorkspace || 'Poznote';
    
    // Check if we have a pending search state to restore from DOM replacement
    const pendingState = window.pendingSearchStateRestore;
    const pendingSearchTerm = window.pendingSearchTermRestore;
    if (pendingState) {
        // Clear it so it's not used again
        window.pendingSearchStateRestore = null;
    }
    if (pendingSearchTerm) {
        // Clear it so it's not used again  
        window.pendingSearchTermRestore = null;
    }
    
    // Do NOT clear existing search terms during workspace reinitialization
    // The search should persist even when workspace changes or when no results are found
    
    // CRITICAL: Reattach search form event listeners after DOM replacement
    attachSearchFormListeners();
    
    // Initialize search state for both desktop and mobile with pending state if available
    if (pendingState) {
        initializeSearchButtonsWithState(false, pendingState); // Desktop
        initializeSearchButtonsWithState(true, pendingState);  // Mobile
    } else {
        initializeSearchButtons(false); // Desktop
        initializeSearchButtons(true);  // Mobile
    }
    
    // Ensure at least one button is active after initialization
    setTimeout(() => {
        ensureAtLeastOneButtonActive();
        
        // If we have a search term to restore, restore it AND resubmit the search
        if (pendingSearchTerm) {
            const searchInput = document.getElementById('unified-search');
            const searchInputMobile = document.getElementById('unified-search-mobile');
            if (searchInput) {
                searchInput.value = pendingSearchTerm;
                
                // Automatically resubmit the search to get proper state (with clear button, etc.)
                setTimeout(() => {
                    const form = document.getElementById('unified-search-form');
                    if (form) {
                        // Create a synthetic submit event
                        const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
                        form.dispatchEvent(submitEvent);
                    }
                }, 100);
            }
            if (searchInputMobile) {
                searchInputMobile.value = pendingSearchTerm;
            }
        }
        
    }, 50);
};

// Safety function to ensure at least one search button is always active
function ensureAtLeastOneButtonActive() {
    // Check desktop buttons
    const notesBtn = document.getElementById('search-notes-btn');
    const tagsBtn = document.getElementById('search-tags-btn');
    const foldersBtn = document.getElementById('search-folders-btn');
    const notesHidden = document.getElementById('search-in-notes');
    const tagsHidden = document.getElementById('search-in-tags');
    const foldersHidden = document.getElementById('search-in-folders');
    
    if (notesBtn && tagsBtn && foldersBtn) {
        const hasActive = notesBtn.classList.contains('active') || 
                         tagsBtn.classList.contains('active') || 
                         foldersBtn.classList.contains('active');
        
        if (!hasActive) {
            // Check URL parameters to see if we should preserve a specific search type
            const urlParams = new URLSearchParams(window.location.search);
            const preserveNotes = urlParams.get('preserve_notes') === '1';
            const preserveTags = urlParams.get('preserve_tags') === '1';
            const preserveFolders = urlParams.get('preserve_folders') === '1';
            
            // Also check hidden field values to see what should be active
            const hasNotesPreference = notesHidden && notesHidden.value === '1';
            const hasTagsPreference = tagsHidden && tagsHidden.value === '1';
            const hasFoldersPreference = foldersHidden && foldersHidden.value === '1';
            
            if (preserveTags || hasTagsPreference) {
                setActiveStyle(tagsBtn);
                setInactiveStyle(notesBtn);
                setInactiveStyle(foldersBtn);
                updateSearchPlaceholder(false);
                if (notesHidden) notesHidden.value = '';
                if (tagsHidden) tagsHidden.value = '1';
                if (foldersHidden) foldersHidden.value = '';
            } else if (preserveFolders || hasFoldersPreference) {
                setActiveStyle(foldersBtn);
                setInactiveStyle(notesBtn);
                setInactiveStyle(tagsBtn);
                updateSearchPlaceholder(false);
                if (notesHidden) notesHidden.value = '';
                if (tagsHidden) tagsHidden.value = '';
                if (foldersHidden) foldersHidden.value = '1';
            } else {
                // Default to notes only if no specific preservation requested
                setActiveStyle(notesBtn);
                setInactiveStyle(tagsBtn);
                setInactiveStyle(foldersBtn);
                updateSearchPlaceholder(false);
                if (notesHidden) notesHidden.value = '1';
                if (tagsHidden) tagsHidden.value = '';
                if (foldersHidden) foldersHidden.value = '';
            }
        }
    }
    
    // Check mobile buttons
    const notesBtnMobile = document.getElementById('search-notes-btn-mobile');
    const tagsBtnMobile = document.getElementById('search-tags-btn-mobile');
    const foldersBtnMobile = document.getElementById('search-folders-btn-mobile');
    const notesHiddenMobile = document.getElementById('search-in-notes-mobile');
    const tagsHiddenMobile = document.getElementById('search-in-tags-mobile');
    const foldersHiddenMobile = document.getElementById('search-in-folders-mobile');
    
    if (notesBtnMobile && tagsBtnMobile && foldersBtnMobile) {
        const hasMobileActive = notesBtnMobile.classList.contains('active') || 
                               tagsBtnMobile.classList.contains('active') || 
                               foldersBtnMobile.classList.contains('active');
        
        if (!hasMobileActive) {
            // Check URL parameters to see if we should preserve a specific search type
            const urlParams = new URLSearchParams(window.location.search);
            const preserveNotes = urlParams.get('preserve_notes') === '1';
            const preserveTags = urlParams.get('preserve_tags') === '1';
            const preserveFolders = urlParams.get('preserve_folders') === '1';
            
            // Also check hidden field values to see what should be active
            const hasNotesPreference = notesHiddenMobile && notesHiddenMobile.value === '1';
            const hasTagsPreference = tagsHiddenMobile && tagsHiddenMobile.value === '1';
            const hasFoldersPreference = foldersHiddenMobile && foldersHiddenMobile.value === '1';
            
            if (preserveTags || hasTagsPreference) {
                setActiveStyle(tagsBtnMobile);
                setInactiveStyle(notesBtnMobile);
                setInactiveStyle(foldersBtnMobile);
                updateSearchPlaceholder(true);
                if (notesHiddenMobile) notesHiddenMobile.value = '';
                if (tagsHiddenMobile) tagsHiddenMobile.value = '1';
                if (foldersHiddenMobile) foldersHiddenMobile.value = '';
            } else if (preserveFolders || hasFoldersPreference) {
                setActiveStyle(foldersBtnMobile);
                setInactiveStyle(notesBtnMobile);
                setInactiveStyle(tagsBtnMobile);
                updateSearchPlaceholder(true);
                if (notesHiddenMobile) notesHiddenMobile.value = '';
                if (tagsHiddenMobile) tagsHiddenMobile.value = '';
                if (foldersHiddenMobile) foldersHiddenMobile.value = '1';
            } else {
                // Default to notes only if no specific preservation requested
                setActiveStyle(notesBtnMobile);
                setInactiveStyle(tagsBtnMobile);
                setInactiveStyle(foldersBtnMobile);
                updateSearchPlaceholder(true);
                if (notesHiddenMobile) notesHiddenMobile.value = '1';
                if (tagsHiddenMobile) tagsHiddenMobile.value = '';
                if (foldersHiddenMobile) foldersHiddenMobile.value = '';
            }
        }
    }
}
