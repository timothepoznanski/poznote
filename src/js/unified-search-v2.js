/**
 * Unified Search - Ultra-Optimized Version
 */

// Import utilities (if using ES6 modules)
// import { SearchState, SearchConfig, DOMUtils, ValidationUtils } from './search-utils.js';

/**
 * Main unified search manager
 */
class UnifiedSearchManager {
    constructor() {
        this.state = new SearchState();
        this.eventHandlers = new Map();
        this.isInitialized = false;
        
        // Binding methods for event listeners
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleButtonClick = this.handleButtonClick.bind(this);
        this.handleStateChange = this.handleStateChange.bind(this);
        
        // Observer state changes
        this.state.addObserver(this.handleStateChange);
    }

    /**
     * Main initialization
     */
    initialize() {
        if (this.isInitialized) return;
        
        this.state.loadExcludedFolders();
        this.initializeFromURL();
        this.setupEventListeners();
        this.updateUI();
        this.isInitialized = true;
    }

    /**
     * Initializes state from URL parameters URL
     */
    initializeFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        this.state.deserialize(Object.fromEntries(urlParams));
    }

    /**
     * Configures event listeners
     */
    setupEventListeners() {
        [false, true].forEach(isMobile => {
            this.setupFormListener(isMobile);
            this.setupButtonListeners(isMobile);
        });
    }

    /**
     * Configures form listener
     */
    setupFormListener(isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.form) return;

        const handlerKey = `form-${isMobile ? 'mobile' : 'desktop'}`;
        this.removeEventHandler(elements.form, 'submit', handlerKey);
        
        const handler = (e) => this.handleFormSubmit(e, isMobile);
        this.addEventHandler(elements.form, 'submit', handler, handlerKey);
    }

    /**
     * Configures button listeners
     */
    setupButtonListeners(isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        
        SearchConfig.SEARCH_TYPES.forEach(type => {
            const button = elements.buttons[type];
            if (!button) return;

            const handlerKey = `button-${type}-${isMobile ? 'mobile' : 'desktop'}`;
            this.removeEventHandler(button, 'click', handlerKey);
            
            const handler = () => this.handleButtonClick(type, isMobile);
            this.addEventHandler(button, 'click', handler, handlerKey);
        });
    }

    /**
     * Handle form submissions
     */
    handleFormSubmit(e, isMobile) {
        e.preventDefault();
        
        const elements = DOMUtils.getSearchElements(isMobile);
        const searchValue = elements.searchInput?.value || '';
        
        // Update state
        this.state.setSearchValue(searchValue);
        
        // Validation
        const validation = ValidationUtils.validateSearchState(elements, searchValue);
        
        if (!validation.isFullyValid) {
            this.handleValidationError(validation, isMobile);
            return;
        }

        // Execute search based on type
        this.executeSearch(validation.activeType, searchValue, isMobile);
    }

    /**
     * Handle button clicks
     */
    handleButtonClick(searchType, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        const currentActive = DOMUtils.hasClass(elements.buttons[searchType], SearchConfig.CSS_CLASSES.active);
        
        // If already active, do nothing
        if (currentActive) return;
        
        // Update state
        this.state.setSearchType(searchType);
        
        // Special logic for type change
        if (searchType !== 'notes' && typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }
        
        // Focus and auto-search if necessary
        const searchValue = elements.searchInput?.value?.trim() || '';
        if (searchValue) {
            this.executeSearch(searchType, searchValue, isMobile);
        } else {
            elements.searchInput?.focus();
        }
    }

    /**
     * Executes search according to type
     */
    executeSearch(searchType, searchValue, isMobile) {
        this.state.setSearching(true);
        
        switch (searchType) {
            case 'folders':
                this.filterFolders(searchValue);
                this.state.setSearching(false);
                break;
                
            case 'notes':
            case 'tags':
                this.performAjaxSearch(searchType, searchValue, isMobile);
                break;
                
            default:
                this.state.setSearching(false);
        }
    }

    /**
     * Performs an AJAX search
     */
    async performAjaxSearch(searchType, searchValue, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.form) {
            this.state.setSearching(false);
            return;
        }

        try {
            // Prepare form data
            const formData = this.prepareFormData(elements.form, searchType, searchValue);
            
            // Save state before request
            this.state.saveState();
            
            // Execute request
            const response = await fetch(elements.form.action || window.location.pathname, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();
            await this.handleAjaxResponse(html, formData);
            
        } catch (error) {
            console.error('Erreur AJAX:', error);
            // Fallback : soumission normale
            elements.form.submit();
        } finally {
            this.state.setSearching(false);
        }
    }

    /**
     * Prepare form data
     */
    prepareFormData(form, searchType, searchValue) {
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        // Add all existing fields
        for (const [key, value] of formData.entries()) {
            params.append(key, value);
        }
        
        // Update specific fields
        params.set(`search-${searchType}-hidden`, searchValue);
        params.set(`search-in-${searchType}`, '1');
        
        // Add excluded folders
        const excludedFolders = [...this.state.excludedFolders];
        if (excludedFolders.length > 0) {
            params.set('excluded_folders', JSON.stringify(excludedFolders));
        }
        
        return params.toString();
    }

    /**
     * Processes AJAX response
     */
    async handleAjaxResponse(html, formParams) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Update les colonnes
            this.updateColumns(doc);
            
            // Update l'URL
            this.updateBrowserHistory(formParams);
            
            // Reset after DOM update
            await this.reinitializeAfterAjax();
            
        } catch (error) {
            console.error('Erreur lors du traitement AJAX:', error);
            throw error;
        }
    }

    /**
     * Updates DOM columns
     */
    updateColumns(doc) {
        const updates = [
            { selector: SearchConfig.SELECTORS.leftCol, source: doc },
            { selector: SearchConfig.SELECTORS.rightCol, source: doc }
        ];

        updates.forEach(({ selector, source }) => {
            const newElement = source.querySelector(selector);
            const currentElement = document.querySelector(selector);
            
            if (newElement && currentElement) {
                currentElement.innerHTML = newElement.innerHTML;
            }
        });
    }

    /**
     * Updates browser history
     */
    updateBrowserHistory(formParams) {
        try {
            const newUrl = `${window.location.pathname}?${formParams}`;
            history.pushState({}, '', newUrl);
        } catch (error) {
            // Ignore history errors
            console.warn('Cannot update history:', error);
        }
    }

    /**
     * Resets after AJAX request AJAX
     */
    async reinitializeAfterAjax() {
        // Invalide le cache DOM
        DOMUtils.invalidateCache();
        
        // Reset les composants externes
        const reinitTasks = [
            () => typeof reinitializeClickableTagsAfterAjax === 'function' && reinitializeClickableTagsAfterAjax(),
            () => typeof initializeWorkspaceMenu === 'function' && initializeWorkspaceMenu(),
            () => typeof reinitializeNoteContent === 'function' && reinitializeNoteContent()
        ];

        reinitTasks.forEach(task => {
            try { task(); } catch (error) {
                console.warn('Reset error:', error);
            }
        });
        
        // Reset the search
        this.isInitialized = false;
        this.initialize();
        
        // Restore state
        this.state.restoreState();
        
        // Highlight with delay
        setTimeout(() => {
            if (typeof highlightSearchTerms === 'function') {
                highlightSearchTerms();
            }
        }, SearchConfig.TIMEOUTS.highlight);
    }

    /**
     * Filters folders
     */
    filterFolders(filterValue) {
        const normalizedFilter = filterValue.toLowerCase().trim();
        const folderHeaders = document.querySelectorAll(SearchConfig.SELECTORS.folderHeader);

        folderHeaders.forEach(folderHeader => {
            const folderName = folderHeader.getAttribute('data-folder');
            if (!folderName) return;

            const matches = !filterValue || folderName.toLowerCase().includes(normalizedFilter);
            
            DOMUtils.toggleClass(folderHeader, SearchConfig.CSS_CLASSES.hidden, !matches);
            
            if (!matches) {
                // Cache aussi le contenu du dossier
                const folderToggle = folderHeader.querySelector('[data-folder-id]');
                if (folderToggle) {
                    const folderId = folderToggle.getAttribute('data-folder-id');
                    const folderContent = document.getElementById(folderId);
                    if (folderContent) {
                        DOMUtils.toggleClass(folderContent, SearchConfig.CSS_CLASSES.hidden, true);
                    }
                }
            }
        });
    }

    /**
     * Handles validation errors
     */
    handleValidationError(validation, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        
        if (!validation.isValid) {
            // Erreur de type de recherche
            this.showValidationError('Please select at least one search option (Notes or Tags)', isMobile);
            // Reset to 'notes' by default
            this.state.setSearchType('notes');
        } else if (validation.isEmpty) {
            // Recherche vide - nettoie
            this.clearSearch();
        }
    }

    /**
     * Displays a validation error
     */
    showValidationError(message, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.container) return;

        // Remove existing errors
        DOMUtils.removeValidationErrors(elements.container);

        // Create the new error
        const errorElement = DOMUtils.createValidationError(message);
        const searchBar = elements.container.querySelector(SearchConfig.SELECTORS.searchBarRow);
        
        if (searchBar) {
            searchBar.parentNode.insertBefore(errorElement, searchBar.nextSibling);
        }

        // Error style on buttons
        Object.values(elements.buttons).forEach(button => {
            DOMUtils.toggleClass(button, SearchConfig.CSS_CLASSES.error, true);
        });

        // Auto-suppression
        setTimeout(() => this.hideValidationError(isMobile), SearchConfig.TIMEOUTS.errorDisplay);
    }

    /**
     * Hides validation errors
     */
    hideValidationError(isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.container) return;

        DOMUtils.removeValidationErrors(elements.container);
        
        Object.values(elements.buttons).forEach(button => {
            DOMUtils.toggleClass(button, SearchConfig.CSS_CLASSES.error, false);
        });
    }

    /**
     * Update user interface
     */
    updateUI() {
        [false, true].forEach(isMobile => this.updateUIForDevice(isMobile));
    }

    /**
     * Update interface for specific device
     */
    updateUIForDevice(isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.form) return;

        // Update active buttons
        SearchConfig.SEARCH_TYPES.forEach(type => {
            const isActive = type === this.state.currentType;
            DOMUtils.toggleClass(elements.buttons[type], SearchConfig.CSS_CLASSES.active, isActive);
        });

        // Update the placeholder
        const placeholder = SearchConfig.PLACEHOLDERS[this.state.currentType];
        if (elements.searchInput && placeholder) {
            elements.searchInput.placeholder = placeholder;
            elements.searchInput.disabled = false;
        }

        // Update hidden fields
        this.updateHiddenInputs(elements);
    }

    /**
     * Updates hidden fields
     */
    updateHiddenInputs(elements) {
        SearchConfig.SEARCH_TYPES.forEach(type => {
            const input = elements.hiddenInputs[type];
            if (!input) return;

            if (type === this.state.currentType) {
                input.value = type === 'folders' ? '1' : this.state.searchValue;
            } else {
                input.value = '';
            }
        });
    }

    /**
     * Handles state changes
     */
    handleStateChange(event, data) {
        switch (event) {
            case 'searchTypeChanged':
            case 'searchValueChanged':
                this.updateUI();
                break;
                
            case 'searchingStateChanged':
                // Could add a loading indicator
                break;
                
            case 'stateReset':
                this.updateUI();
                break;
        }
    }

    /**
     * Clears the search
     */
    clearSearch() {
        if (typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }

        // Build the cleanup URL
        const urlParams = new URLSearchParams(window.location.search);
        const newParams = new URLSearchParams();
        
        // Preserve workspace and folder
        ['workspace', 'folder'].forEach(param => {
            const value = urlParams.get(param);
            if (value && (param !== 'workspace' || value !== 'Poznote')) {
                newParams.set(param, value);
            }
        });

        const newUrl = 'index.php' + (newParams.toString() ? '?' + newParams.toString() : '');
        window.location.href = newUrl;
    }

    /**
     * Event handler management
     */
    addEventHandler(element, event, handler, key) {
        element.addEventListener(event, handler);
        this.eventHandlers.set(key, { element, event, handler });
    }

    removeEventHandler(element, event, key) {
        const stored = this.eventHandlers.get(key);
        if (stored) {
            stored.element.removeEventListener(stored.event, stored.handler);
            this.eventHandlers.delete(key);
        }
    }

    /**
     * Cleans up all event handlers
     */
    cleanup() {
        this.eventHandlers.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventHandlers.clear();
        this.state.removeObserver(this.handleStateChange);
    }
}

// Global instance
let unifiedSearchManager;

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    unifiedSearchManager = new UnifiedSearchManager();
    unifiedSearchManager.initialize();
    
    // Back button management
    window.addEventListener('popstate', function(event) {
        const urlParams = new URLSearchParams(window.location.search);
        const hasSearch = urlParams.get('search') || urlParams.get('tags_search');
        const hasPreserve = urlParams.get('preserve_notes') || urlParams.get('preserve_tags');
        
        if (hasSearch && hasPreserve) {
            return; // Let page reload to restore state
        }
    });

    // Initial highlight with delay
    setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search') && typeof highlightSearchTerms === 'function') {
            highlightSearchTerms();
        }
    }, 500);
});

// Compatibility functions for legacy code
window.clearUnifiedSearch = () => unifiedSearchManager?.clearSearch();
window.goHomeWithSearch = () => unifiedSearchManager?.clearSearch();

window.saveCurrentSearchState = () => {
    return unifiedSearchManager ? unifiedSearchManager.state.serialize() : null;
};

window.reinitializeSearchAfterWorkspaceChange = () => {
    if (unifiedSearchManager) {
        DOMUtils.invalidateCache();
        unifiedSearchManager.isInitialized = false;
        unifiedSearchManager.initialize();
    }
};

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    unifiedSearchManager?.cleanup();
});
