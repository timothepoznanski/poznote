/**
 * Unified Search - Version Ultra-Optimisée
 * 
 * Utilise les patterns modernes :
 * - Séparation des responsabilités
 * - Gestion d'état centralisée  
 * - Pattern Observer
 * - Utilitaires réutilisables
 * - Cache DOM intelligent
 */

// Import des utilitaires (si utilisation de modules ES6)
// import { SearchState, SearchConfig, DOMUtils, ValidationUtils } from './search-utils.js';

/**
 * Gestionnaire principal de recherche unifié
 */
class UnifiedSearchManager {
    constructor() {
        this.state = new SearchState();
        this.eventHandlers = new Map();
        this.isInitialized = false;
        
        // Binding des méthodes pour les event listeners
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleButtonClick = this.handleButtonClick.bind(this);
        this.handleStateChange = this.handleStateChange.bind(this);
        
        // Observer des changements d'état
        this.state.addObserver(this.handleStateChange);
    }

    /**
     * Initialisation principale
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
     * Initialise l'état depuis les paramètres URL
     */
    initializeFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        this.state.deserialize(Object.fromEntries(urlParams));
    }

    /**
     * Configure les écouteurs d'événements
     */
    setupEventListeners() {
        [false, true].forEach(isMobile => {
            this.setupFormListener(isMobile);
            this.setupButtonListeners(isMobile);
        });
    }

    /**
     * Configure l'écouteur de formulaire
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
     * Configure les écouteurs de boutons
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
     * Gestion des soumissions de formulaire
     */
    handleFormSubmit(e, isMobile) {
        e.preventDefault();
        
        const elements = DOMUtils.getSearchElements(isMobile);
        const searchValue = elements.searchInput?.value || '';
        
        // Met à jour l'état
        this.state.setSearchValue(searchValue);
        
        // Validation
        const validation = ValidationUtils.validateSearchState(elements, searchValue);
        
        if (!validation.isFullyValid) {
            this.handleValidationError(validation, isMobile);
            return;
        }

        // Exécute la recherche selon le type
        this.executeSearch(validation.activeType, searchValue, isMobile);
    }

    /**
     * Gestion des clics sur les boutons
     */
    handleButtonClick(searchType, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        const currentActive = DOMUtils.hasClass(elements.buttons[searchType], SearchConfig.CSS_CLASSES.active);
        
        // Si déjà actif, ne rien faire
        if (currentActive) return;
        
        // Met à jour l'état
        this.state.setSearchType(searchType);
        
        // Logique spéciale pour le changement de type
        if (searchType !== 'notes' && typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }
        
        // Focus et recherche automatique si nécessaire
        const searchValue = elements.searchInput?.value?.trim() || '';
        if (searchValue) {
            this.executeSearch(searchType, searchValue, isMobile);
        } else {
            elements.searchInput?.focus();
        }
    }

    /**
     * Exécute la recherche selon le type
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
     * Effectue une recherche AJAX
     */
    async performAjaxSearch(searchType, searchValue, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.form) {
            this.state.setSearching(false);
            return;
        }

        try {
            // Prépare les données du formulaire
            const formData = this.prepareFormData(elements.form, searchType, searchValue);
            
            // Sauvegarde l'état avant la requête
            this.state.saveState();
            
            // Effectue la requête
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
     * Prépare les données du formulaire
     */
    prepareFormData(form, searchType, searchValue) {
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        // Ajoute tous les champs existants
        for (const [key, value] of formData.entries()) {
            params.append(key, value);
        }
        
        // Met à jour les champs spécifiques
        params.set(`search-${searchType}-hidden`, searchValue);
        params.set(`search-in-${searchType}`, '1');
        
        // Ajoute les dossiers exclus
        const excludedFolders = [...this.state.excludedFolders];
        if (excludedFolders.length > 0) {
            params.set('excluded_folders', JSON.stringify(excludedFolders));
        }
        
        return params.toString();
    }

    /**
     * Traite la réponse AJAX
     */
    async handleAjaxResponse(html, formParams) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Met à jour les colonnes
            this.updateColumns(doc);
            
            // Met à jour l'URL
            this.updateBrowserHistory(formParams);
            
            // Réinitialise après mise à jour DOM
            await this.reinitializeAfterAjax();
            
        } catch (error) {
            console.error('Erreur lors du traitement AJAX:', error);
            throw error;
        }
    }

    /**
     * Met à jour les colonnes du DOM
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
     * Met à jour l'historique du navigateur
     */
    updateBrowserHistory(formParams) {
        try {
            const newUrl = `${window.location.pathname}?${formParams}`;
            history.pushState({}, '', newUrl);
        } catch (error) {
            // Ignore les erreurs d'historique
            console.warn('Impossible de mettre à jour l\'historique:', error);
        }
    }

    /**
     * Réinitialise après une requête AJAX
     */
    async reinitializeAfterAjax() {
        // Invalide le cache DOM
        DOMUtils.invalidateCache();
        
        // Réinitialise les composants externes
        const reinitTasks = [
            () => typeof reinitializeClickableTagsAfterAjax === 'function' && reinitializeClickableTagsAfterAjax(),
            () => typeof initializeWorkspaceMenu === 'function' && initializeWorkspaceMenu(),
            () => typeof reinitializeNoteContent === 'function' && reinitializeNoteContent()
        ];

        reinitTasks.forEach(task => {
            try { task(); } catch (error) {
                console.warn('Erreur lors de la réinitialisation:', error);
            }
        });
        
        // Réinitialise la recherche
        this.isInitialized = false;
        this.initialize();
        
        // Restaure l'état
        this.state.restoreState();
        
        // Highlight avec délai
        setTimeout(() => {
            if (typeof highlightSearchTerms === 'function') {
                highlightSearchTerms();
            }
        }, SearchConfig.TIMEOUTS.highlight);
    }

    /**
     * Filtre les dossiers
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
     * Gère les erreurs de validation
     */
    handleValidationError(validation, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        
        if (!validation.isValid) {
            // Erreur de type de recherche
            this.showValidationError('Please select at least one search option (Notes or Tags)', isMobile);
            // Réinitialise à 'notes' par défaut
            this.state.setSearchType('notes');
        } else if (validation.isEmpty) {
            // Recherche vide - nettoie
            this.clearSearch();
        }
    }

    /**
     * Affiche une erreur de validation
     */
    showValidationError(message, isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.container) return;

        // Supprime les erreurs existantes
        DOMUtils.removeValidationErrors(elements.container);

        // Crée la nouvelle erreur
        const errorElement = DOMUtils.createValidationError(message);
        const searchBar = elements.container.querySelector(SearchConfig.SELECTORS.searchBarRow);
        
        if (searchBar) {
            searchBar.parentNode.insertBefore(errorElement, searchBar.nextSibling);
        }

        // Style d'erreur sur les boutons
        Object.values(elements.buttons).forEach(button => {
            DOMUtils.toggleClass(button, SearchConfig.CSS_CLASSES.error, true);
        });

        // Auto-suppression
        setTimeout(() => this.hideValidationError(isMobile), SearchConfig.TIMEOUTS.errorDisplay);
    }

    /**
     * Cache les erreurs de validation
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
     * Met à jour l'interface utilisateur
     */
    updateUI() {
        [false, true].forEach(isMobile => this.updateUIForDevice(isMobile));
    }

    /**
     * Met à jour l'interface pour un appareil spécifique
     */
    updateUIForDevice(isMobile) {
        const elements = DOMUtils.getSearchElements(isMobile);
        if (!elements.form) return;

        // Met à jour les boutons actifs
        SearchConfig.SEARCH_TYPES.forEach(type => {
            const isActive = type === this.state.currentType;
            DOMUtils.toggleClass(elements.buttons[type], SearchConfig.CSS_CLASSES.active, isActive);
        });

        // Met à jour le placeholder
        const placeholder = SearchConfig.PLACEHOLDERS[this.state.currentType];
        if (elements.searchInput && placeholder) {
            elements.searchInput.placeholder = placeholder;
            elements.searchInput.disabled = false;
        }

        // Met à jour les champs cachés
        this.updateHiddenInputs(elements);
    }

    /**
     * Met à jour les champs cachés
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
     * Gère les changements d'état
     */
    handleStateChange(event, data) {
        switch (event) {
            case 'searchTypeChanged':
            case 'searchValueChanged':
                this.updateUI();
                break;
                
            case 'searchingStateChanged':
                // Pourrait ajouter un indicateur de chargement
                break;
                
            case 'stateReset':
                this.updateUI();
                break;
        }
    }

    /**
     * Nettoie la recherche
     */
    clearSearch() {
        if (typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }

        // Construit l'URL de nettoyage
        const urlParams = new URLSearchParams(window.location.search);
        const newParams = new URLSearchParams();
        
        // Préserve workspace et folder
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
     * Gestion des gestionnaires d'événements
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
     * Nettoie tous les gestionnaires d'événements
     */
    cleanup() {
        this.eventHandlers.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventHandlers.clear();
        this.state.removeObserver(this.handleStateChange);
    }
}

// Instance globale
let unifiedSearchManager;

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    unifiedSearchManager = new UnifiedSearchManager();
    unifiedSearchManager.initialize();
    
    // Gestion du bouton retour
    window.addEventListener('popstate', function(event) {
        const urlParams = new URLSearchParams(window.location.search);
        const hasSearch = urlParams.get('search') || urlParams.get('tags_search');
        const hasPreserve = urlParams.get('preserve_notes') || urlParams.get('preserve_tags');
        
        if (hasSearch && hasPreserve) {
            return; // Laisse la page se recharger pour restaurer l'état
        }
    });

    // Highlight initial avec délai
    setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search') && typeof highlightSearchTerms === 'function') {
            highlightSearchTerms();
        }
    }, 500);
});

// Fonctions de compatibilité pour l'ancien code
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

// Nettoyage lors du déchargement
window.addEventListener('beforeunload', () => {
    unifiedSearchManager?.cleanup();
});
