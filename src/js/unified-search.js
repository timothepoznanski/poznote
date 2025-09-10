/**
 * Optimized Unified Search - Phase 1: Basic refactoring and cleanup
 * 
 * Key improvements:
 * 1. Centralized state management with SearchManager class
 * 2. Unified mobile/desktop handling
 * 3. Reduced code duplication
 * 4. Cleaner separation of concerns
 */

class SearchManager {
    constructor() {
        this.searchTypes = ['notes', 'tags', 'folders'];
        this.isMobile = false;
        this.currentSearchType = 'notes';
        this.eventHandlers = new Map();
        
        // Initialize both desktop and mobile
        this.initializeSearch();
    }

    /**
     * Get DOM elements for both mobile and desktop
     */
    getElements(isMobile = this.isMobile) {
        const suffix = isMobile ? '-mobile' : '';
        
        return {
            form: document.getElementById(`unified-search-form${suffix}`),
            searchInput: document.getElementById(`unified-search${suffix}`),
            buttons: {
                notes: document.getElementById(`search-notes-btn${suffix}`),
                tags: document.getElementById(`search-tags-btn${suffix}`),
                folders: document.getElementById(`search-folders-btn${suffix}`)
            },
            hiddenInputs: {
                notes: document.getElementById(`search-in-notes${suffix}`) || 
                       document.getElementById(`search-notes-hidden${suffix}`),
                tags: document.getElementById(`search-in-tags${suffix}`) || 
                      document.getElementById(`search-tags-hidden${suffix}`),
                folders: document.getElementById(`search-in-folders${suffix}`)
            },
            container: document.querySelector(isMobile ? '.unified-search-container.mobile' : '.unified-search-container')
        };
    }

    /**
     * Initialize search for both desktop and mobile
     */
    initializeSearch() {
        this.initializeSearchInterface(false); // Desktop
        this.initializeSearchInterface(true);  // Mobile
        this.setupEventListeners();
        this.ensureAtLeastOneButtonActive();
    }

    /**
     * Initialize search interface for specific device type
     */
    initializeSearchInterface(isMobile) {
        const elements = this.getElements(isMobile);
        if (!elements.form || !elements.searchInput) return;

        // Restore state from URL parameters or defaults
        this.restoreSearchStateFromURL(isMobile);
        this.updateInterface(isMobile);
    }

    /**
     * Restore search state from URL parameters
     */
    restoreSearchStateFromURL(isMobile) {
        const urlParams = new URLSearchParams(window.location.search);
        const elements = this.getElements(isMobile);
        
        // Check URL preferences
        const preserveNotes = urlParams.get('preserve_notes') === '1';
        const preserveTags = urlParams.get('preserve_tags') === '1';
        const preserveFolders = urlParams.get('preserve_folders') === '1';
        
        // Check hidden field values
        const hasNotesValue = elements.hiddenInputs.notes?.value === '1';
        const hasTagsValue = elements.hiddenInputs.tags?.value === '1';
        const hasFoldersValue = elements.hiddenInputs.folders?.value === '1';
        
        // Determine active search type
        if (preserveTags || hasTagsValue) {
            this.setActiveSearchType('tags', isMobile);
        } else if (preserveFolders || hasFoldersValue) {
            this.setActiveSearchType('folders', isMobile);
        } else {
            this.setActiveSearchType('notes', isMobile);
        }
    }

    /**
     * Set active search type and update UI
     */
    setActiveSearchType(searchType, isMobile) {
        if (!this.searchTypes.includes(searchType)) return;
        
        const elements = this.getElements(isMobile);
        
        // Clear all active states
        this.searchTypes.forEach(type => {
            const button = elements.buttons[type];
            if (button) {
                button.classList.remove('active');
            }
        });
        
        // Set active state
        const activeButton = elements.buttons[searchType];
        if (activeButton) {
            activeButton.classList.add('active');
        }
    // Persist state even if buttons are absent
    this.currentSearchType = searchType;

    this.updateInterface(isMobile);
    }

    /**
     * Update interface based on current state
     */
    updateInterface(isMobile) {
        this.updatePlaceholder(isMobile);
    this.updateIcon(isMobile);
        this.updateHiddenInputs(isMobile);
        this.hideValidationError(isMobile);
    }

    /**
     * Update search input placeholder
     */
    updatePlaceholder(isMobile) {
        const elements = this.getElements(isMobile);
        const activeType = this.getActiveSearchType(isMobile);
        
        const placeholders = {
            notes: 'Search in contents and titles...',
            tags: 'Search in one or more tags...',
            folders: 'Filter folders...'
        };
        
        if (elements.searchInput) {
            elements.searchInput.placeholder = placeholders[activeType] || placeholders.notes;
            elements.searchInput.disabled = false;
        }
    }

    /**
     * Update the searchbar icon according to active search type
     */
    updateIcon(isMobile) {
        const elements = this.getElements(isMobile);
        // Prefer the container's icon element
        let iconSpan = elements.container?.querySelector('.searchbar-icon span');

        // Fallback to searching globally by id/class
        if (!iconSpan) {
            const selector = isMobile ? '.unified-search-container.mobile .searchbar-icon span' : '.unified-search-container .searchbar-icon span';
            iconSpan = document.querySelector(selector);
        }

        if (!iconSpan) return;

        const activeType = this.getActiveSearchType(isMobile);
        const iconMap = {
            notes: 'fas fa-file-alt',
            tags: 'fas fa-tags',
            folders: 'fas fa-folder'
        };

        iconSpan.className = iconMap[activeType] || 'fas fa-search';
    }

    /**
     * Get currently active search type
     */
    getActiveSearchType(isMobile) {
        const elements = this.getElements(isMobile);
        // Prefer DOM state if buttons are present
        for (const type of this.searchTypes) {
            if (elements.buttons[type]?.classList.contains('active')) {
                // keep internal sync
                this.currentSearchType = type;
                return type;
            }
        }

        // Fallback to internal state (useful when pills were removed)
        return this.currentSearchType || 'notes'; // Default
    }

    /**
     * Update hidden form inputs
     */
    updateHiddenInputs(isMobile) {
        const elements = this.getElements(isMobile);
        const activeType = this.getActiveSearchType(isMobile);
        const searchValue = elements.searchInput?.value.trim() || '';
        
        // Clear all hidden inputs
        this.searchTypes.forEach(type => {
            const input = elements.hiddenInputs[type];
            if (input) {
                input.value = type === activeType ? (type === 'folders' ? '1' : searchValue) : '';
            }
        });
        
        // Special handling for checkbox-style hidden inputs
        if (activeType === 'notes' && elements.hiddenInputs.notes) {
            elements.hiddenInputs.notes.value = '1';
        }
        if (activeType === 'tags' && elements.hiddenInputs.tags) {
            elements.hiddenInputs.tags.value = '1';
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.setupFormListeners(false); // Desktop
        this.setupFormListeners(true);  // Mobile
        this.setupButtonListeners(false);
        this.setupButtonListeners(true);
        this.setupIconListeners(false);
        this.setupIconListeners(true);
    }

    /**
     * Setup click listeners on the searchbar icon to cycle search type
     */
    setupIconListeners(isMobile) {
        const elements = this.getElements(isMobile);
        // Try to get the icon wrapper from the container; if not available (timing/AJAX),
        // fall back to a global query to ensure the listener is attached.
        let iconWrapper = elements?.container?.querySelector('.searchbar-icon');
        if (!iconWrapper) {
            const selector = isMobile ? '.unified-search-container.mobile .searchbar-icon' : '.unified-search-container .searchbar-icon';
            iconWrapper = document.querySelector(selector);
        }

        if (!iconWrapper) return;

        const handlerKey = `icon-${isMobile ? 'mobile' : 'desktop'}`;
        const existingHandler = this.eventHandlers.get(handlerKey);
        if (existingHandler) {
            try { iconWrapper.removeEventListener('click', existingHandler); } catch (e) {}
        }

        const handler = (e) => {
            e.preventDefault();
            // Cycle to next search type
            const current = this.getActiveSearchType(isMobile);
            const idx = this.searchTypes.indexOf(current);
            const next = this.searchTypes[(idx + 1) % this.searchTypes.length];

            // Persist the new type and update UI
            this.setActiveSearchType(next, isMobile);

            // Trigger behavior similar to clicking the pill
            const elements = this.getElements(isMobile);
            if (next === 'folders') {
                const searchValue = elements.searchInput?.value.trim();
                if (searchValue) this.filterFolders(searchValue, isMobile);
                elements.searchInput?.focus();
            } else if (elements.searchInput?.value.trim()) {
                this.submitSearchWithExcludedFolders(isMobile);
            } else {
                elements.searchInput?.focus();
            }
        };

        this.eventHandlers.set(handlerKey, handler);
        iconWrapper.addEventListener('click', handler);
        // make it look clickable
        iconWrapper.style.cursor = 'pointer';
    }

    /**
     * Setup form submission listeners
     */
    setupFormListeners(isMobile) {
        const elements = this.getElements(isMobile);
        if (!elements.form) return;

        // Remove existing listener if exists
        const handlerKey = `form-${isMobile ? 'mobile' : 'desktop'}`;
        const existingHandler = this.eventHandlers.get(handlerKey);
        if (existingHandler) {
            elements.form.removeEventListener('submit', existingHandler);
        }

        // Create new handler
        const handler = (e) => this.handleSearchSubmit(e, isMobile);
        this.eventHandlers.set(handlerKey, handler);
        elements.form.addEventListener('submit', handler);
    }

    /**
     * Setup button click listeners
     */
    setupButtonListeners(isMobile) {
        const elements = this.getElements(isMobile);
        
        this.searchTypes.forEach(type => {
            const button = elements.buttons[type];
            if (!button) return;

            // Remove existing listener
            const handlerKey = `button-${type}-${isMobile ? 'mobile' : 'desktop'}`;
            const existingHandler = this.eventHandlers.get(handlerKey);
            if (existingHandler) {
                button.removeEventListener('click', existingHandler);
            }

            // Create new handler
            const handler = () => this.handleButtonClick(type, isMobile);
            this.eventHandlers.set(handlerKey, handler);
            button.addEventListener('click', handler);
        });
    }

    /**
     * Handle button clicks
     */
    handleButtonClick(searchType, isMobile) {
        const elements = this.getElements(isMobile);
        const button = elements.buttons[searchType];
        
        if (!button || button.classList.contains('active')) {
            return; // Already active, do nothing
        }

        // Clear search highlights when switching away from notes
        if (searchType !== 'notes' && typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }

        this.setActiveSearchType(searchType, isMobile);

        // Handle special cases
        if (searchType === 'folders') {
            const searchValue = elements.searchInput?.value.trim();
            if (searchValue) {
                this.filterFolders(searchValue, isMobile);
            }
            elements.searchInput?.focus();
        } else if (elements.searchInput?.value.trim()) {
            // Auto-search if there's content
            this.submitSearchWithExcludedFolders(isMobile);
        } else {
            elements.searchInput?.focus();
        }
    }

    /**
     * Handle form submission
     */
    handleSearchSubmit(e, isMobile) {
        e.preventDefault();
        
        const elements = this.getElements(isMobile);
        const searchValue = elements.searchInput?.value.trim() || '';
        const activeType = this.getActiveSearchType(isMobile);

        // Handle different search types
        if (activeType === 'folders') {
            this.filterFolders(searchValue, isMobile);
            return;
        }

        if (!searchValue) {
            this.clearSearch();
            return;
        }

        // Validate that exactly one search type is active
        if (!this.validateSearchState(isMobile)) {
            return;
        }

        this.updateHiddenInputs(isMobile);
        this.addExcludedFoldersToForm(elements.form, isMobile);
        this.performAjaxSearch(elements.form, isMobile);
    }

    /**
     * Validate search state
     */
    validateSearchState(isMobile) {
        const elements = this.getElements(isMobile);
        // If explicit buttons exist in the DOM (older UI with pills), use them
        const buttonsExist = Object.values(elements.buttons).some(b => b !== null && b !== undefined);
        if (buttonsExist) {
            const activeTypes = this.searchTypes.filter(type => elements.buttons[type]?.classList.contains('active'));
            if (activeTypes.length !== 1) {
                // Reset to notes as default
                this.setActiveSearchType('notes', isMobile);
                return false;
            }
            return true;
        }

        // When buttons/pills have been removed, rely on internal state (currentSearchType)
        const activeType = this.getActiveSearchType(isMobile);
        if (this.searchTypes.includes(activeType)) {
            return true;
        }

        // As a last resort, reset to notes
        this.setActiveSearchType('notes', isMobile);
        return false;
    }

    /**
     * Perform AJAX search
     */
    performAjaxSearch(form, isMobile) {
        try {
            const formData = new FormData(form);
            const params = new URLSearchParams();
            
            for (const [key, value] of formData.entries()) {
                params.append(key, value);
            }

            const searchState = this.saveCurrentSearchState();

            fetch(form.action || window.location.pathname, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: params.toString()
            })
            .then(response => response.text())
            .then(html => this.handleAjaxResponse(html, params.toString(), searchState))
            .catch(() => form.submit());

        } catch (error) {
            form.submit();
        }
    }

    /**
     * Handle AJAX response
     */
    handleAjaxResponse(html, formParams, searchState) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Update DOM columns
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

            // Update URL
            try {
                const newUrl = window.location.pathname + '?' + formParams;
                history.pushState({}, '', newUrl);
            } catch (err) {
                // Ignore history errors
            }

            // Reinitialize components
            this.reinitializeAfterAjax(searchState);

        } catch (error) {
            // Fallback to page reload
            window.location.reload();
        }
    }

    /**
     * Reinitialize components after AJAX
     */
    reinitializeAfterAjax(searchState) {
        try {
            // Reinitialize other components
            if (typeof reinitializeClickableTagsAfterAjax === 'function') {
                reinitializeClickableTagsAfterAjax();
            }
            if (typeof initializeWorkspaceMenu === 'function') {
                initializeWorkspaceMenu();
            }
            if (typeof reinitializeNoteContent === 'function') {
                reinitializeNoteContent();
            }

            // Reinitialize search
            this.initializeSearch();
            
            // Restore search state
            if (searchState) {
                this.restoreSearchState(searchState);
            }

            // Highlight search terms
            setTimeout(() => {
                if (typeof highlightSearchTerms === 'function') {
                    highlightSearchTerms();
                }
            }, 150);

        } catch (error) {
            console.error('Error reinitializing after AJAX:', error);
        }
    }

    /**
     * Save current search state
     */
    saveCurrentSearchState() {
        return {
            desktop: {
                notes: this.getElements(false).buttons.notes?.classList.contains('active') || false,
                tags: this.getElements(false).buttons.tags?.classList.contains('active') || false,
                folders: this.getElements(false).buttons.folders?.classList.contains('active') || false
            },
            mobile: {
                notes: this.getElements(true).buttons.notes?.classList.contains('active') || false,
                tags: this.getElements(true).buttons.tags?.classList.contains('active') || false,
                folders: this.getElements(true).buttons.folders?.classList.contains('active') || false
            }
        };
    }

    /**
     * Restore search state
     */
    restoreSearchState(state) {
        if (!state) return;

        setTimeout(() => {
            // Restore desktop state
            if (state.desktop.notes) this.setActiveSearchType('notes', false);
            else if (state.desktop.tags) this.setActiveSearchType('tags', false);
            else if (state.desktop.folders) this.setActiveSearchType('folders', false);

            // Restore mobile state
            if (state.mobile.notes) this.setActiveSearchType('notes', true);
            else if (state.mobile.tags) this.setActiveSearchType('tags', true);
            else if (state.mobile.folders) this.setActiveSearchType('folders', true);

            this.ensureAtLeastOneButtonActive();
        }, 100);
    }

    /**
     * Ensure at least one button is active
     */
    ensureAtLeastOneButtonActive() {
        [false, true].forEach(isMobile => {
            const elements = this.getElements(isMobile);
            const hasActive = this.searchTypes.some(type => 
                elements.buttons[type]?.classList.contains('active')
            );

            if (!hasActive) {
                this.setActiveSearchType('notes', isMobile);
            }
        });
    }

    /**
     * Clear search
     */
    clearSearch() {
        if (typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }

        // Build URL preserving workspace, folder, and search type
        const urlParams = new URLSearchParams(window.location.search);
        const newParams = new URLSearchParams();
        
        const currentWorkspace = urlParams.get('workspace') || selectedWorkspace || 'Poznote';
        if (currentWorkspace && currentWorkspace !== 'Poznote') {
            newParams.set('workspace', currentWorkspace);
        }
        
        const currentFolder = urlParams.get('folder');
        if (currentFolder) {
            newParams.set('folder', currentFolder);
        }

        // Preserve the currently active search type
        // Try to detect if we're in mobile mode first
        const mobileContainer = document.querySelector('.unified-search-container.mobile');
        const isMobile = mobileContainer && mobileContainer.offsetParent !== null;
        
        let activeSearchType = this.getActiveSearchType(isMobile);
        
        // If we couldn't determine the type from the current view, try the other view
        if (activeSearchType === 'notes' && !isMobile) {
            // Check if mobile view has an active type different from notes
            const mobileActiveType = this.getActiveSearchType(true);
            if (mobileActiveType !== 'notes') {
                activeSearchType = mobileActiveType;
            }
        } else if (activeSearchType === 'notes' && isMobile) {
            // Check if desktop view has an active type different from notes
            const desktopActiveType = this.getActiveSearchType(false);
            if (desktopActiveType !== 'notes') {
                activeSearchType = desktopActiveType;
            }
        }
        
        // Set the appropriate preserve parameter based on active search type
        if (activeSearchType === 'tags') {
            newParams.set('preserve_tags', '1');
        } else if (activeSearchType === 'folders') {
            newParams.set('preserve_folders', '1');
        } else {
            // Default to notes or explicitly preserve notes
            newParams.set('preserve_notes', '1');
        }

        const newUrl = 'index.php' + (newParams.toString() ? '?' + newParams.toString() : '');
        window.location.href = newUrl;
    }

    /**
     * Filter folders
     */
    filterFolders(filterValue, isMobile) {
        const normalizedFilter = filterValue.toLowerCase().trim();
        const folderHeaders = document.querySelectorAll('.folder-header');

        folderHeaders.forEach(folderHeader => {
            const folderName = folderHeader.getAttribute('data-folder');
            if (!folderName) return;

            const matches = folderName.toLowerCase().includes(normalizedFilter);
            
            if (matches || !filterValue) {
                folderHeader.classList.remove('hidden');
            } else {
                folderHeader.classList.add('hidden');
                
                // Hide folder content
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

    /**
     * Submit search with excluded folders
     */
    submitSearchWithExcludedFolders(isMobile) {
        const elements = this.getElements(isMobile);
        if (!elements.form) return;

        this.addExcludedFoldersToForm(elements.form, isMobile);
        this.updateHiddenInputs(isMobile);
        
        const formData = new FormData(elements.form);
        const params = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
            params.append(key, value);
        }

        const searchState = this.saveCurrentSearchState();
        this.performAjaxSearch(elements.form, isMobile);
    }

    /**
     * Add excluded folders to form
     */
    addExcludedFoldersToForm(form, isMobile) {
        const excludedFolders = this.getExcludedFoldersFromLocalStorage();
        
        if (excludedFolders.length > 0) {
            // Remove existing input
            const existingInput = form.querySelector('input[name="excluded_folders"]');
            if (existingInput) {
                existingInput.remove();
            }
            
            // Add new input
            const excludedInput = document.createElement('input');
            excludedInput.type = 'hidden';
            excludedInput.name = 'excluded_folders';
            excludedInput.value = JSON.stringify(excludedFolders);
            form.appendChild(excludedInput);
        }
    }

    /**
     * Get excluded folders from localStorage
     */
    getExcludedFoldersFromLocalStorage() {
        const excludedFolders = [];
        
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
     * Show validation error
     */
    showValidationError(isMobile) {
        const elements = this.getElements(isMobile);
        this.hideValidationError(isMobile);

        const errorDiv = document.createElement('div');
        errorDiv.className = 'search-validation-error';
        errorDiv.textContent = 'Please select at least one search option (Notes or Tags)';

        const searchBar = elements.container?.querySelector('.searchbar-row');
        if (searchBar) {
            searchBar.parentNode.insertBefore(errorDiv, searchBar.nextSibling);
        }

        // Add error styling
        Object.values(elements.buttons).forEach(button => {
            if (button) button.classList.add('search-type-btn-error');
        });

        setTimeout(() => this.hideValidationError(isMobile), 3000);
    }

    /**
     * Hide validation error
     */
    hideValidationError(isMobile) {
        const elements = this.getElements(isMobile);
        
        const errorMessage = elements.container?.querySelector('.search-validation-error');
        if (errorMessage) {
            errorMessage.remove();
        }

        Object.values(elements.buttons).forEach(button => {
            if (button) button.classList.remove('search-type-btn-error');
        });
    }
}

// Global instance
let searchManager;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    searchManager = new SearchManager();
    
    // Make searchManager globally accessible
    window.searchManager = searchManager;
    
    // Handle browser back button
    window.addEventListener('popstate', function(event) {
        const urlParams = new URLSearchParams(window.location.search);
        const hasSearch = urlParams.get('search') || urlParams.get('tags_search');
        const preserveNotes = urlParams.get('preserve_notes');
        const preserveTags = urlParams.get('preserve_tags');
        
        if (hasSearch && (preserveNotes || preserveTags)) {
            return; // Let page reload to restore search
        }
    });

    // Highlight search terms on page load
    setTimeout(function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search') && typeof highlightSearchTerms === 'function') {
            highlightSearchTerms();
        }
    }, 500);
});

// Legacy function compatibility
function clearUnifiedSearch() {
    if (searchManager) {
        searchManager.clearSearch();
    }
}

function goHomeWithSearch() {
    if (searchManager) {
        searchManager.clearSearch();
    }
}

// Global functions for external scripts
window.saveCurrentSearchState = function() {
    return searchManager ? searchManager.saveCurrentSearchState() : null;
};

window.reinitializeSearchAfterWorkspaceChange = function() {
    if (searchManager) {
        searchManager.initializeSearch();
    }
};

// Make searchManager globally accessible
window.searchManager = searchManager;
