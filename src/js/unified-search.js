// UNIFIED SEARCH FUNCTIONALITY
function clearUnifiedSearch() {
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
            folderHeader.style.display = 'block';
            
            // Restore folder content visibility based on their previous state
            const folderToggle = folderHeader.querySelector('[data-folder-id]');
            if (folderToggle) {
                const folderId = folderToggle.getAttribute('data-folder-id');
                const folderContent = document.getElementById(folderId);
                if (folderContent) {
                    // Use localStorage state if available, or show by default
                    const state = localStorage.getItem('folder_' + folderId);
                    if (state === 'closed') {
                        folderContent.style.display = 'none';
                    } else {
                        folderContent.style.display = 'block';
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
        console.error('Error in goHomeWithSearch:', error);
        window.location.href = 'index.php';
    }
}

// Handle unified search form submission
document.addEventListener('DOMContentLoaded', function() {
    // Initialize search state for both desktop and mobile
    initializeSearchButtons(false); // Desktop
    initializeSearchButtons(true);  // Mobile
    
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
    
    // Desktop form
    const unifiedForm = document.getElementById('unified-search-form');
    if (unifiedForm) {
        unifiedForm.addEventListener('submit', function(e) {
            handleUnifiedSearchSubmit(e, false);
        });
    }
    
    // Mobile form
    const unifiedFormMobile = document.getElementById('unified-search-form-mobile');
    if (unifiedFormMobile) {
        unifiedFormMobile.addEventListener('submit', function(e) {
            handleUnifiedSearchSubmit(e, true);
        });
    }
    
    // Add input event listeners for real-time folder filtering
    const desktopSearchInput = document.getElementById('unified-search');
    const mobileSearchInput = document.getElementById('unified-search-mobile');
    
    if (desktopSearchInput) {
        desktopSearchInput.addEventListener('input', function() {
            const foldersBtn = document.getElementById('search-folders-btn');
            if (foldersBtn && foldersBtn.classList.contains('active')) {
                filterFolders(this.value, false);
            }
        });
    }
    
    // Highlight search terms when page loads if we're in search mode
    setTimeout(function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search')) {
            if (typeof highlightSearchTerms === 'function') {
                highlightSearchTerms();
            }
        }
    }, 500);
    
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', function() {
            const foldersBtn = document.getElementById('search-folders-btn-mobile');
            if (foldersBtn && foldersBtn.classList.contains('active')) {
                filterFolders(this.value, true);
            }
        });
    }
});

function initializeSearchButtons(isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    const notesHidden = document.getElementById('search-in-notes' + suffix);
    const tagsHidden = document.getElementById('search-in-tags' + suffix);
    const foldersHidden = document.getElementById('search-in-folders' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput) return;
    
    // Check if there are existing search preferences from hidden inputs
    const hasNotesPreference = notesHidden && notesHidden.value === '1';
    const hasTagsPreference = tagsHidden && tagsHidden.value === '1';
    const hasFoldersPreference = foldersHidden && foldersHidden.value === '1';
    
    // Respect existing search type preferences
    if (hasNotesPreference) {
        notesBtn.classList.add('active');
        tagsBtn.classList.remove('active');
        foldersBtn.classList.remove('active');
    } else if (hasTagsPreference) {
        tagsBtn.classList.add('active');
        notesBtn.classList.remove('active');
        foldersBtn.classList.remove('active');
    } else if (hasFoldersPreference) {
        foldersBtn.classList.add('active');
        notesBtn.classList.remove('active');
        tagsBtn.classList.remove('active');
    } else {
        // Default state: activate notes search
        notesBtn.classList.add('active');
        tagsBtn.classList.remove('active');
        foldersBtn.classList.remove('active');
    }
    
    // Add click handlers
    notesBtn.addEventListener('click', function() {
        toggleSearchType('notes', isMobile);
    });
    
    tagsBtn.addEventListener('click', function() {
        toggleSearchType('tags', isMobile);
    });
    
    foldersBtn.addEventListener('click', function() {
        toggleSearchType('folders', isMobile);
    });
    
    // Update placeholder and input state
    updateSearchPlaceholder(isMobile);
}

function toggleSearchType(type, isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const btn = document.getElementById('search-' + type + '-btn' + suffix);
    
    if (!btn) return;
    
    // Get all three buttons
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    
    // If button is already active, do nothing (keep it active)
    if (btn.classList.contains('active')) {
        return;
    }
    
    // Deactivate all buttons first
    if (notesBtn) notesBtn.classList.remove('active');
    if (tagsBtn) tagsBtn.classList.remove('active');
    if (foldersBtn) foldersBtn.classList.remove('active');
    
    // Activate the clicked button
    btn.classList.add('active');
    
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
    
    // Submit the form normally (this will bypass our event handler to avoid recursion)
    form.submit();
}

function handleUnifiedSearchSubmit(e, isMobile) {
    const suffix = isMobile ? '-mobile' : '';
    const notesBtn = document.getElementById('search-notes-btn' + suffix);
    const tagsBtn = document.getElementById('search-tags-btn' + suffix);
    const foldersBtn = document.getElementById('search-folders-btn' + suffix);
    const searchInput = document.getElementById('unified-search' + suffix);
    
    if (!notesBtn || !tagsBtn || !foldersBtn || !searchInput) return;
    
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
    
    // Let the form submit normally (don't prevent default)
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
    
    let placeholder = 'Search in notes...'; // Default placeholder
    
    if (hasNotesActive) {
        placeholder = 'Search in notes...';
    } else if (hasTagsActive) {
        placeholder = 'Search in tags...';
    } else if (hasFoldersActive) {
        placeholder = 'Filter folders...';
    }
    
    searchInput.placeholder = placeholder;
    
    // Always enable search input since there's always a selection
    searchInput.disabled = false;
    searchInput.style.opacity = '1';
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
            folderHeader.style.display = 'block';
        } else {
            // Hide folder and its content
            folderHeader.style.display = 'none';
            
            // Also hide folder content using the data-folder-id approach
            const folderToggle = folderHeader.querySelector('[data-folder-id]');
            if (folderToggle) {
                const folderId = folderToggle.getAttribute('data-folder-id');
                const folderContent = document.getElementById(folderId);
                if (folderContent) {
                    folderContent.style.display = 'none';
                }
            }
        }
    });
}
