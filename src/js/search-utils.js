/**
 * SearchState - Centralized state management for unified search
 * Separates state logic from DOM manipulation
 */
class SearchState {
    constructor() {
        this.currentType = 'notes';
        this.searchValue = '';
        this.isSearching = false;
        this.lastSearchState = null;
        this.excludedFolders = new Set();
        this.observers = new Set();
    }

    /**
     * Change le type de recherche actuel
     */
    setSearchType(type) {
        if (['notes', 'tags', 'folders'].includes(type) && type !== this.currentType) {
            const oldType = this.currentType;
            this.currentType = type;
            this.notifyChange('searchTypeChanged', { oldType, newType: type });
        }
    }

    /**
     * Sets search value
     */
    setSearchValue(value) {
        const trimmedValue = value.trim();
        if (trimmedValue !== this.searchValue) {
            this.searchValue = trimmedValue;
            this.notifyChange('searchValueChanged', { value: trimmedValue });
        }
    }

    /**
     * Marks search state in progress
     */
    setSearching(isSearching) {
        if (this.isSearching !== isSearching) {
            this.isSearching = isSearching;
            this.notifyChange('searchingStateChanged', { isSearching });
        }
    }

    /**
     * Ajoute un dossier aux exclusions
     */
    excludeFolder(folderName) {
        if (!this.excludedFolders.has(folderName)) {
            this.excludedFolders.add(folderName);
            this.saveExcludedFolders();
            this.notifyChange('excludedFoldersChanged', { 
                action: 'added', 
                folder: folderName,
                excludedFolders: [...this.excludedFolders]
            });
        }
    }

    /**
     * Retire un dossier des exclusions
     */
    includeFolder(folderName) {
        if (this.excludedFolders.has(folderName)) {
            this.excludedFolders.delete(folderName);
            this.saveExcludedFolders();
            this.notifyChange('excludedFoldersChanged', { 
                action: 'removed', 
                folder: folderName,
                excludedFolders: [...this.excludedFolders]
            });
        }
    }

    /**
     * Save current state
     */
    saveState() {
        this.lastSearchState = {
            type: this.currentType,
            value: this.searchValue,
            timestamp: Date.now()
        };
    }

    /**
     * Restore saved state
     */
    restoreState() {
        if (this.lastSearchState) {
            this.setSearchType(this.lastSearchState.type);
            this.setSearchValue(this.lastSearchState.value);
        }
    }

    /**
     * Charge les dossiers exclus depuis localStorage
     */
    loadExcludedFolders() {
        this.excludedFolders.clear();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('folder_search_')) {
                const state = localStorage.getItem(key);
                if (state === 'excluded') {
                    const folderName = key.substring('folder_search_'.length);
                    this.excludedFolders.add(folderName);
                }
            }
        }
    }

    /**
     * Save excluded folders
     */
    saveExcludedFolders() {
        // Clean up old entries
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('folder_search_')) {
                localStorage.removeItem(key);
            }
        }
        
        // Save new ones
        this.excludedFolders.forEach(folder => {
            localStorage.setItem(`folder_search_${folder}`, 'excluded');
        });
    }

    /**
     * Reset state
     */
    reset() {
        this.currentType = 'notes';
        this.searchValue = '';
        this.isSearching = false;
        this.notifyChange('stateReset', {});
    }

    /**
     * Adds observer for state changes of state
     */
    addObserver(callback) {
        this.observers.add(callback);
    }

    /**
     * Retire un observateur
     */
    removeObserver(callback) {
        this.observers.delete(callback);
    }

    /**
     * Notifie tous les observateurs d'un changement
     */
    notifyChange(event, data) {
        this.observers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in SearchState observer:', error);
            }
        });
    }

    /**
     * Serializes state for URL/formulaires
     */
    serialize() {
        return {
            type: this.currentType,
            value: this.searchValue,
            excludedFolders: [...this.excludedFolders]
        };
    }

    /**
     * Deserializes state from URL parameters URL
     */
    deserialize(params) {
        if (params.preserve_notes === '1') {
            this.setSearchType('notes');
            this.setSearchValue(params.search || '');
        } else if (params.preserve_tags === '1') {
            this.setSearchType('tags');
            this.setSearchValue(params.tags_search || '');
        } else if (params.preserve_folders === '1') {
            this.setSearchType('folders');
            this.setSearchValue(params.folder_filter || '');
        }
    }
}

/**
 * SearchConfig - Centralized configuration
 */
class SearchConfig {
    static get SEARCH_TYPES() {
        return ['notes', 'tags', 'folders'];
    }

    static get PLACEHOLDERS() {
        return {
            notes: 'Search in contents and titles...',
            tags: 'Search in one or more tags...',
            folders: 'Filter folders...'
        };
    }

    static get CSS_CLASSES() {
        return {
            active: 'active',
            hidden: 'hidden',
            error: 'search-type-btn-error',
            validationError: 'search-validation-error'
        };
    }

    static get SELECTORS() {
        return {
            leftCol: '#left_col',
            rightCol: '#right_col',
            folderHeader: '.folder-header',
            searchBarRow: '.searchbar-row'
        };
    }

    static get TIMEOUTS() {
        return {
            ajaxReinit: 150,
            highlight: 150,
            errorDisplay: 3000,
            stateRestore: 100
        };
    }
}

/**
 * DOMUtils - Utilitaires pour la manipulation DOM
 */
class DOMUtils {
    /**
     * Gets DOM elements for given mode given
     */
    static getSearchElements(isMobile) {
        const suffix = isMobile ? '-mobile' : '';
        const cache = isMobile ? DOMUtils._mobileCache : DOMUtils._desktopCache;
        
        // Simple cache to avoid repeated searches
        if (!cache.elements) {
            cache.elements = {
                form: document.getElementById(`unified-search-form${suffix}`),
                searchInput: document.getElementById(`unified-search${suffix}`),
                container: document.querySelector(isMobile ? 
                    '.unified-search-container.mobile' : 
                    '.unified-search-container'
                ),
                buttons: SearchConfig.SEARCH_TYPES.reduce((acc, type) => {
                    acc[type] = document.getElementById(`search-${type}-btn${suffix}`);
                    return acc;
                }, {}),
                hiddenInputs: {
                    notes: document.getElementById(`search-in-notes${suffix}`) || 
                           document.getElementById(`search-notes-hidden${suffix}`),
                    tags: document.getElementById(`search-in-tags${suffix}`) || 
                          document.getElementById(`search-tags-hidden${suffix}`),
                    folders: document.getElementById(`search-in-folders${suffix}`)
                }
            };
        }
        
        return cache.elements;
    }

    /**
     * Invalidate DOM cache (call after AJAX)
     */
    static invalidateCache() {
        DOMUtils._desktopCache = {};
        DOMUtils._mobileCache = {};
    }

    /**
     * Ajoute ou retire une classe CSS
     */
    static toggleClass(element, className, add) {
        if (!element) return;
        
        if (add) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
    }

    /**
     * Create validation error element
     */
    static createValidationError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = SearchConfig.CSS_CLASSES.validationError;
        errorDiv.textContent = message;
        return errorDiv;
    }

    /**
     * Remove existing validation errors
     */
    static removeValidationErrors(container) {
        if (!container) return;
        
        const errors = container.querySelectorAll(`.${SearchConfig.CSS_CLASSES.validationError}`);
        errors.forEach(error => error.remove());
    }

    /**
     * Checks if element has CSS class CSS
     */
    static hasClass(element, className) {
        return element && element.classList.contains(className);
    }
}

// Initialisation des caches DOM
DOMUtils._desktopCache = {};
DOMUtils._mobileCache = {};

/**
 * ValidationUtils - Utilitaires de validation
 */
class ValidationUtils {
    /**
     * Valide qu'exactement un type de recherche est actif
     */
    static validateSearchType(elements) {
        const activeTypes = SearchConfig.SEARCH_TYPES.filter(type => 
            DOMUtils.hasClass(elements.buttons[type], SearchConfig.CSS_CLASSES.active)
        );
        
        return {
            isValid: activeTypes.length === 1,
            activeCount: activeTypes.length,
            activeType: activeTypes[0] || null
        };
    }

    /**
     * Valide la valeur de recherche
     */
    static validateSearchValue(value, searchType) {
        const trimmedValue = (value || '').trim();
        
        return {
            isValid: searchType === 'folders' || trimmedValue.length > 0,
            value: trimmedValue,
            isEmpty: trimmedValue.length === 0
        };
    }

    /**
     * Validates complete search state
     */
    static validateSearchState(elements, searchValue) {
        const typeValidation = this.validateSearchType(elements);
        const valueValidation = this.validateSearchValue(searchValue, typeValidation.activeType);
        
        return {
            ...typeValidation,
            ...valueValidation,
            isFullyValid: typeValidation.isValid && valueValidation.isValid
        };
    }
}

export { SearchState, SearchConfig, DOMUtils, ValidationUtils };
