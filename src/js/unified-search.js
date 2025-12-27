
class SearchManager {
    constructor() {
        this.searchTypes = ['notes', 'tags'];
        this.isMobile = false;
        this.currentSearchType = 'notes';
    // When set, skip restore from recent user toggle (ms since epoch).
    this._suppressUntil = 0;
    // When set, skip restore from URL during initialization (used after AJAX)
    this.suppressURLRestore = false;
    // Focus handling after AJAX: when true, reinitializeAfterAjax will restore focus
    this.focusAfterAjax = false;
    this.focusCaretPos = null;
        this.eventHandlers = new Map();
    // Track which handlers are attached to which DOM element to avoid
    // attaching multiple handlers to the same icon element (desktop vs mobile)
    this._iconElementMap = new WeakMap();
        
        // Initialize both desktop and mobile
        this.initializeSearch();
        
        // Listen for i18n loaded event to update placeholders with translations
        document.addEventListener('poznote:i18n:loaded', () => {
            this.updatePlaceholder(false); // Desktop
            this.updatePlaceholder(true);  // Mobile
        });
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
                tags: document.getElementById(`search-tags-btn${suffix}`)
            },
            hiddenInputs: {
                // Separate the "flag" inputs (search-in-*) from the term-carrying hidden inputs
                notesFlag: document.getElementById(`search-in-notes${suffix}`),
                notesTerm: document.getElementById(`search-notes-hidden${suffix}`),
                tagsFlag: document.getElementById(`search-in-tags${suffix}`),
                tagsTerm: document.getElementById(`search-tags-hidden${suffix}`),
                // folders removed
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

        // Clear any previous search-only hiding so folders are visible by default
        this.clearSearchHiddenMarkers();

        // Check if there's an active search
        const urlParams = new URLSearchParams(window.location.search);
        const hasActiveSearch = Boolean(urlParams.get('search') || urlParams.get('tags_search'));
        
        // Show or hide system folders container based on search state
        if (hasActiveSearch) {
            this.hideSystemFoldersContainer();
        } else {
            this.showSystemFoldersContainer();
        }

        // Restore state from URL parameters or defaults
        if (!this.suppressURLRestore) {
            this.restoreSearchStateFromURL(isMobile);
        }
        this.updateInterface(isMobile);
    }

    /**
     * Remove search-only hidden markers from special folders; called on init
     */
    clearSearchHiddenMarkers() {
        try {
            const selectors = ['.folder-header[data-folder="Trash"]', '.folder-header[data-folder="Tags"]'];
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    el.classList.remove('search-hidden');
                    const folderToggle = el.querySelector('[data-folder-id]');
                    if (folderToggle) {
                        const folderId = folderToggle.getAttribute('data-folder-id');
                        const folderContent = document.getElementById(folderId);
                        if (folderContent) folderContent.classList.remove('search-hidden');
                    }
                });
            });
        } catch (err) {
            // ignore
        }
    }

    /**
     * Restore search state from URL parameters
     */
    restoreSearchStateFromURL(isMobile) {
        const urlParams = new URLSearchParams(window.location.search);
        const elements = this.getElements(isMobile);
        
        // Check URL preferences and explicit search params
        const preserveNotes = urlParams.get('preserve_notes') === '1';
        const preserveTags = urlParams.get('preserve_tags') === '1';
        const hasTagsSearchParam = urlParams.get('tags_search') && urlParams.get('tags_search').trim() !== '';
        const hasNotesSearchParam = urlParams.get('search') && urlParams.get('search').trim() !== '';
        
        // Check hidden field values: flags vs term-bearing inputs
        const hasNotesFlag = elements.hiddenInputs.notesFlag?.value === '1';
        const hasTagsFlag = elements.hiddenInputs.tagsFlag?.value === '1';
        
    // If a recent user toggle was performed, avoid restoring from URL
    if (this._suppressUntil && Date.now() < this._suppressUntil) return;

    // Determine active search type
        // Prefer explicit URL params (tags_search / search) if present
        if (hasTagsSearchParam || preserveTags || hasTagsFlag) {
            this.setActiveSearchType('tags', isMobile);
        } else if (hasNotesSearchParam || preserveNotes) {
            this.setActiveSearchType('notes', isMobile);
        } else {
            // Default to notes
            this.setActiveSearchType('notes', isMobile);
        }
    }

    /**
     * Set active search type and update UI
     */
    setActiveSearchType(searchType, isMobile) {
        if (!this.searchTypes.includes(searchType)) return;
        // start tracing removed; keep behavior unchanged
        
        const elements = this.getElements(isMobile);
        
        // If leaving a previous search type, clear highlights of that type
        const prev = this.currentSearchType;
        if (prev === 'notes' && searchType !== 'notes' && typeof clearSearchHighlights === 'function') {
            try { clearSearchHighlights(); } catch (e) { /* ignore */ }
        }
        if (prev === 'tags' && searchType !== 'tags' && typeof window.highlightMatchingTags === 'function') {
            try { window.highlightMatchingTags(''); } catch (e) { /* ignore */ }
        }

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
    // Expose last active search type globally for other modules (used by applyHighlightsWithRetries)
    try { window._lastActiveSearchType = searchType; } catch (e) { /* ignore */ }
    // update UI
    this.updateInterface(isMobile);

    // If switching into 'notes' search, (re-)apply highlights now that state is set
    if (searchType === 'notes' && typeof highlightSearchTerms === 'function') {
        try { highlightSearchTerms(); } catch (e) { /* ignore */ }
    }
    // If switching into 'tags' search, attempt to highlight matching tag UI elements
    if (searchType === 'tags' && typeof window.highlightMatchingTags === 'function') {
        try {
            // Prefer hidden term if present, else visible input
            var hiddenTerm = elements.hiddenInputs.tagsTerm?.value || '';
            var visibleTerm = elements.searchInput?.value || '';
            var term = hiddenTerm && hiddenTerm.trim() ? hiddenTerm.trim() : visibleTerm.trim();
            // Call highlightMatchingTags immediately and ensure retries if tags are created asynchronously
            window.highlightMatchingTags(term);
        } catch (e) { /* ignore */ }
    }
    }

    /**
     * Update interface based on current state
     */
    updateInterface(isMobile) {
        this.updatePlaceholder(isMobile);
    this.updateIcon(isMobile);
        // Hide or show special folders (Trash, Tags) depending on active search type
        this.hideSpecialFolders(isMobile);
        this.updateHiddenInputs(isMobile);
        this.hideValidationError(isMobile);
    }

    /**
     * Hide special folders (Trash and Tags) when searching notes or tags
     */
    hideSpecialFolders(isMobile) {
        try {
            const elements = this.getElements(isMobile);
            const activeType = this.getActiveSearchType(isMobile);

            // Only hide special folders when there is an actual search in progress
            const term = elements.searchInput?.value?.trim() || '';
            const urlParams = new URLSearchParams(window.location.search);
            const hasUrlSearch = Boolean(urlParams.get('search') || urlParams.get('tags_search'));
            // Also consider hidden inputs which are used during AJAX submissions
            // Only term-bearing hidden inputs should count as an ongoing search.
            const hasHiddenNotesTerm = Boolean(elements.hiddenInputs.notesTerm?.value && elements.hiddenInputs.notesTerm.value.trim());
            const hasHiddenTagsTerm = Boolean(elements.hiddenInputs.tagsTerm?.value && elements.hiddenInputs.tagsTerm.value.trim());
            const isSearching = term !== '' || hasUrlSearch || hasHiddenNotesTerm || hasHiddenTagsTerm;

            const selectors = ['.folder-header[data-folder="Trash"]', '.folder-header[data-folder="Tags"]'];
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                            if ((activeType === 'notes' || activeType === 'tags') && isSearching) {
                                el.classList.add('search-hidden');
                        // also hide its content pane if present
                        const folderToggle = el.querySelector('[data-folder-id]');
                        if (folderToggle) {
                            const folderId = folderToggle.getAttribute('data-folder-id');
                            const folderContent = document.getElementById(folderId);
                                    if (folderContent) folderContent.classList.add('search-hidden');
                        }
                    } else {
                                el.classList.remove('search-hidden');
                        const folderToggle = el.querySelector('[data-folder-id]');
                        if (folderToggle) {
                            const folderId = folderToggle.getAttribute('data-folder-id');
                            const folderContent = document.getElementById(folderId);
                                    if (folderContent) folderContent.classList.remove('search-hidden');
                        }
                    }
                });
            });
        } catch (err) {
            // ignore
        }
    }

    /**
     * Hide system folders container when executing search
     */
    hideSystemFoldersContainer() {
        try {
            const container = document.querySelector('.system-folders-container');
            if (container) {
                container.style.display = 'none';
            }
        } catch (err) {
            // ignore
        }
    }

    /**
     * Show system folders container when clearing search
     */
    showSystemFoldersContainer() {
        try {
            const container = document.querySelector('.system-folders-container');
            if (container) {
                container.style.display = 'flex';
            }
        } catch (err) {
            // ignore
        }
    }

    /**
     * Update search input placeholder
     */
    updatePlaceholder(isMobile) {
        const elements = this.getElements(isMobile);
        const activeType = this.getActiveSearchType(isMobile);

        const placeholders = {
            notes: (window.t ? window.t('search.placeholder_notes', null, 'Search for one or more words...') : 'Search for one or more words...'),
            tags: (window.t ? window.t('search.placeholder_tags', null, 'Search for one or more tags...') : 'Search for one or more tags...')
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
            notes: 'fa-file-alt',
            tags: 'fa-tags'
        };

        iconSpan.className = iconMap[activeType] || 'fa-search';
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

        // Update term-bearing hidden inputs (so AJAX receives the actual search term)
        // Only set the active type's term input; clear the other to avoid sending both params.
        if (elements.hiddenInputs.notesTerm) {
            elements.hiddenInputs.notesTerm.value = activeType === 'notes' ? searchValue : '';
        }
        if (elements.hiddenInputs.tagsTerm) {
            elements.hiddenInputs.tagsTerm.value = activeType === 'tags' ? searchValue : '';
        }

        // Update flag inputs (search-in-*) to reflect active type
        if (elements.hiddenInputs.notesFlag) {
            elements.hiddenInputs.notesFlag.value = activeType === 'notes' ? '1' : '';
        }
        if (elements.hiddenInputs.tagsFlag) {
            elements.hiddenInputs.tagsFlag.value = activeType === 'tags' ? '1' : '';
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
        this.setupInputListeners(false);
        this.setupInputListeners(true);
    }

    /**
     * Setup input listeners to handle typing in search field
     */
    setupInputListeners(isMobile) {
        const elements = this.getElements(isMobile);
        if (!elements.searchInput) return;

        // Remove existing listener if exists
        const handlerKey = `input-${isMobile ? 'mobile' : 'desktop'}`;
        const existingHandler = this.eventHandlers.get(handlerKey);
        if (existingHandler) {
            elements.searchInput.removeEventListener('input', existingHandler);
        }

        // Create new handler
        const handler = () => this.hideValidationError(isMobile);
        this.eventHandlers.set(handlerKey, handler);
        elements.searchInput.addEventListener('input', handler);
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

        // Ensure we don't leave multiple distinct handlers attached to the same
        // DOM element (this can happen when desktop and mobile setup both
        // resolve to the same icon node). Use a WeakMap from element -> Map
        // of handlerKey->handler so we can remove previously-attached handlers
        // before adding a new one.
        let elementHandlers = this._iconElementMap.get(iconWrapper);
        if (!elementHandlers) {
            elementHandlers = new Map();
            this._iconElementMap.set(iconWrapper, elementHandlers);
        } else if (elementHandlers.size > 0) {
            // Remove any handlers previously attached to this element to avoid
            // duplicate execution. We also remove their entries from
            // this.eventHandlers so the global registry stays consistent.
            for (const [hk, fn] of elementHandlers.entries()) {
                try { iconWrapper.removeEventListener('click', fn); } catch (e) {}
                elementHandlers.delete(hk);
                try { this.eventHandlers.delete(hk); } catch (e) {}
            }
        }

        const handler = (e) => {
            // Prevent double execution: mark the event handled immediately
            try {
                if (e) {
                    if (e._unifiedSearchHandled) return;
                    e._unifiedSearchHandled = true;
                }
            } catch (err) {}
            // Determine the actual view the click originated from. Use the
            // event target's closest container to figure out whether this
            // should be treated as a mobile or desktop toggle. This handles
            // situations where both handlers were attached to the same DOM
            // node or when containers exist but only one is active.
            let effectiveIsMobile = isMobile;
            try {
                const node = (e.currentTarget || e.target);
                if (node && typeof node.closest === 'function') {
                    const mobileContainer = node.closest('.unified-search-container.mobile');
                    if (mobileContainer && mobileContainer.offsetParent !== null) {
                        effectiveIsMobile = true;
                    } else {
                        const desktopContainer = node.closest('.unified-search-container');
                        if (desktopContainer && desktopContainer.offsetParent !== null) {
                            effectiveIsMobile = false;
                        }
                    }
                }
            } catch (err) {
                // ignore and fall back to provided isMobile
            }

            e.preventDefault();
            // Determine current type and a robust next type. When the
            // visible "pills" (buttons) are absent (mobile compact UI),
            // rely on a simple toggle between 'notes' and 'tags' so the
            // icon always switches as the user expects.
            const current = this.getActiveSearchType(effectiveIsMobile);
            const elements = this.getElements(effectiveIsMobile);

            let next;
            const buttonsExist = Object.values(elements.buttons).some(b => b != null);
            if (!buttonsExist && this.searchTypes.length === 2) {
                // Simple toggle when no explicit buttons are present
                next = (current === 'notes') ? 'tags' : 'notes';
            } else {
                const idx = this.searchTypes.indexOf(current);
                next = this.searchTypes[(idx + 1) % this.searchTypes.length];
            }

            // Persist the new type and update UI. Record a short-lived user
            // action so restore/reinit won't overwrite it. Use the effective
            // view (mobile/desktop) we just detected.
            try { this._suppressUntil = Date.now() + 250; } catch (e) {}
            this.setActiveSearchType(next, effectiveIsMobile);

            // Trigger behavior similar to clicking the pill
            if (elements.searchInput?.value.trim()) {
                const searchValue = elements.searchInput.value.trim();
                
                // Validate search terms before auto-searching (use the NEW 'next' type)
                if (!this.validateSearchTerms(searchValue, next, effectiveIsMobile)) {
                    // Validation failed, don't proceed with search
                    elements.searchInput?.focus();
                    return;
                }
                
                this.updateHiddenInputs(effectiveIsMobile);
                this.hideSpecialFolders(effectiveIsMobile);
                this.performAjaxSearch(elements.form, effectiveIsMobile);
            } else {
                elements.searchInput?.focus();
            }
            // event already marked handled at start
        };

        // Record handler in both registries and attach it once to the element.
        this.eventHandlers.set(handlerKey, handler);
        elementHandlers.set(handlerKey, handler);
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

        // Clear search highlights when switching search types
        if (typeof clearSearchHighlights === 'function') {
            clearSearchHighlights();
        }

        this.setActiveSearchType(searchType, isMobile);

        // Handle search if there's content
        if (elements.searchInput?.value.trim()) {
            const searchValue = elements.searchInput.value.trim();
            
            // Validate search terms before auto-searching (use the NEW searchType, not the current one)
            if (!this.validateSearchTerms(searchValue, searchType, isMobile)) {
                // Validation failed, don't proceed with search
                elements.searchInput?.focus();
                return;
            }
            
            // Auto-search if there's content and validation passed
            this.updateHiddenInputs(isMobile);
            this.hideSpecialFolders(isMobile);
            this.performAjaxSearch(elements.form, isMobile);
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

        if (!searchValue) {
            this.clearSearch();
            return;
        }

        // Validate that exactly one search type is active
        if (!this.validateSearchState(isMobile)) {
            return;
        }

        // Validate search terms length
        if (!this.validateSearchTerms(searchValue, activeType, isMobile)) {
            return;
        }

        // Hide system folders container when executing search
        this.hideSystemFoldersContainer();

        // Update hidden inputs and hide special folders immediately so UI reflects search
    // debug info removed
    // Save caret pos and request focus restoration after AJAX
    try {
        this.focusAfterAjax = true;
        this.focusCaretPos = elements.searchInput && typeof elements.searchInput.selectionStart === 'number' ? elements.searchInput.selectionStart : null;
    } catch (e) {
        this.focusAfterAjax = false;
        this.focusCaretPos = null;
    }
    this.updateHiddenInputs(isMobile);
    this.hideSpecialFolders(isMobile);
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
     * Validate search terms length
     */
    validateSearchTerms(searchValue, activeType, isMobile) {
        // Only validate for notes search
        if (activeType !== 'notes') {
            return true;
        }

        // Split search string into individual terms (whitespace separated)
        const searchTerms = searchValue.split(/\s+/).filter(term => term.trim().length > 0);
        
        // Check if all terms are single characters
        const allSingleChar = searchTerms.every(term => term.length === 1);
        
        if (allSingleChar && searchTerms.length > 0) {
            this.showValidationError(
                isMobile,
                (window.t
                    ? window.t('search.validation.single_letter_warning', null, 'Searching with single-letter words may return too many results. Try using longer words for more precise search.')
                    : 'Searching with single-letter words may return too many results. Try using longer words for more precise search.')
            );
            return false;
        }
        
        return true;
    }

    /**
     * Perform AJAX search
     */
    performAjaxSearch(form, isMobile) {
        try {
            // Hide any validation errors since we're performing a valid search
            this.hideValidationError(isMobile);
            
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
            // debug info removed
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
                // Extract the note ID from the displayed note in right column
                let displayedNoteId = null;
                try {
                    const rightCol = document.getElementById('right_col');
                    if (rightCol) {
                        const noteCard = rightCol.querySelector('.notecard[id^="note"]');
                        if (noteCard && noteCard.id) {
                            // Extract ID from "note123" format
                            const match = noteCard.id.match(/^note(\d+)$/);
                            if (match && match[1]) {
                                displayedNoteId = match[1];
                            }
                        }
                    }
                } catch (e) {
                    // ignore
                }

                // Add the displayed note ID to the URL params
                const urlParams = new URLSearchParams(formParams);
                if (displayedNoteId) {
                    urlParams.set('note', displayedNoteId);
                }

                const newUrl = window.location.pathname + '?' + urlParams.toString();
                history.pushState({}, '', newUrl);
                
                // Update global search mode flag so reinitialized code knows we're in search
                try {
                    const newParams = new URLSearchParams(urlParams.toString());
                    const unified = newParams.get('unified_search');
                    const search = newParams.get('search');
                    const tagsSearch = newParams.get('tags_search');
                    window.isSearchMode = Boolean(unified || search || tagsSearch);
                } catch (e) {
                    // ignore
                }
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
            // Restore search state first (before reinitializing content)
            if (searchState) {
                try {
                    this.restoreSearchState(searchState);
                    // Ensure placeholders, icons and hidden inputs reflect restored state
                    this.updateInterface(false);
                    this.updateInterface(true);
                } catch (e) {
                    // ignore
                }
            }

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
            // Reinitialize note click handlers for mobile navigation
            if (typeof window.initializeNoteClickHandlers === 'function') {
                window.initializeNoteClickHandlers();
            }

            // Reinitialize search (set up listeners/DOM hooks)
            // Prevent restore-from-URL happening during this reinit which may override saved state
            this.suppressURLRestore = true;
            try {
                this.initializeSearch();
            } finally {
                this.suppressURLRestore = false;
            }

            // Guard: reapply search state after a short delay in case other init code overrides
            if (searchState) {
                setTimeout(() => {
                    this.restoreSearchState(searchState);
                    this.updateInterface(false);
                    this.updateInterface(true);
                }, 50);
            }

            // Restore focus/caret if requested. Try immediate, then retry after short delays
            try {
                if (this.focusAfterAjax) {
                    const restore = () => {
                        const desktopInput = this.getElements(false).searchInput;
                        const mobileInput = this.getElements(true).searchInput;
                        const input = desktopInput && desktopInput.offsetParent !== null ? desktopInput : (mobileInput || desktopInput);
                        if (!input) return false;
                        try {
                            input.focus();
                            // If stored position is available use it, otherwise put caret at end
                            const pos = (typeof this.focusCaretPos === 'number' && this.focusCaretPos >= 0) ? this.focusCaretPos : input.value.length;
                            try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
                            return true;
                        } catch (e) {
                            return false;
                        }
                    };

                    // Try immediate
                    if (!restore()) {
                        // Retry shortly after to allow DOM/paint
                        setTimeout(() => { if (!restore()) setTimeout(restore, 150); }, 50);
                    }
                }
            } catch (e) {
                // ignore
            } finally {
                this.focusAfterAjax = false;
                this.focusCaretPos = null;
            }

            // Highlight search terms according to the active type.
            setTimeout(() => {
                try {
                    // If a centralized helper exists, prefer it (it handles notes/tags/folders correctly)
                    if (typeof applyHighlightsWithRetries === 'function') {
                        try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                        return;
                    }

                    const activeType = this.getActiveSearchType();
                    if (activeType === 'notes') {
                        if (typeof highlightSearchTerms === 'function') {
                            try { highlightSearchTerms(); } catch (e) { /* ignore */ }
                        }
                        if (typeof window.highlightMatchingTags === 'function') {
                            try { window.highlightMatchingTags(''); } catch (e) { /* ignore */ }
                        }
                    } else if (activeType === 'tags') {
                        if (typeof clearSearchHighlights === 'function') {
                            try { clearSearchHighlights(); } catch (e) { /* ignore */ }
                        }
                        if (typeof window.highlightMatchingTags === 'function') {
                            try {
                                const desktopElements = this.getElements(false);
                                const mobileElements = this.getElements(true);
                                const hiddenTagsTerm = desktopElements.hiddenInputs.tagsTerm?.value || mobileElements.hiddenInputs.tagsTerm?.value || '';
                                const visibleTerm = (desktopElements.searchInput && desktopElements.searchInput.value) || (mobileElements.searchInput && mobileElements.searchInput.value) || '';
                                const term = hiddenTagsTerm && hiddenTagsTerm.trim() ? hiddenTagsTerm.trim() : visibleTerm.trim();
                                window.highlightMatchingTags(term);
                            } catch (e) { /* ignore */ }
                        }
                    } else {
                        // unknown: clear any highlights
                        if (typeof clearSearchHighlights === 'function') {
                            try { clearSearchHighlights(); } catch (e) { /* ignore */ }
                        }
                        if (typeof window.highlightMatchingTags === 'function') {
                            try { window.highlightMatchingTags(''); } catch (e) { /* ignore */ }
                        }
                    }
                } catch (e) {
                    // ignore
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
        // Try to capture explicit button state; if buttons/pills were removed,
        // fall back to internal currentSearchType so the choice survives AJAX.
        const desktopElements = this.getElements(false);
        const mobileElements = this.getElements(true);

        const desktopButtonsExist = Object.values(desktopElements.buttons).some(b => b !== null && b !== undefined);
        const mobileButtonsExist = Object.values(mobileElements.buttons).some(b => b !== null && b !== undefined);

        const desktopState = {
            notes: false,
            tags: false
        };
        const mobileState = {
            notes: false,
            tags: false
        };

        if (desktopButtonsExist) {
            desktopState.notes = desktopElements.buttons.notes?.classList.contains('active') || false;
            desktopState.tags = desktopElements.buttons.tags?.classList.contains('active') || false;
        } else {
            // Fallback to internal state
            const t = this.currentSearchType || 'notes';
            desktopState[t] = true;
        }

        if (mobileButtonsExist) {
            mobileState.notes = mobileElements.buttons.notes?.classList.contains('active') || false;
            mobileState.tags = mobileElements.buttons.tags?.classList.contains('active') || false;
        } else {
            const t = this.currentSearchType || 'notes';
            mobileState[t] = true;
        }

        return {
            desktop: desktopState,
            mobile: mobileState
        };
    }

    /**
     * Restore search state
     */
    restoreSearchState(state) {
    if (!state) return;
    if (this._suppressUntil && Date.now() < this._suppressUntil) return;

        // Restore desktop state immediately to avoid intermediate UI reset
        if (state.desktop.notes) this.setActiveSearchType('notes', false);
        else if (state.desktop.tags) this.setActiveSearchType('tags', false);

        // Restore mobile state immediately
        if (state.mobile.notes) this.setActiveSearchType('notes', true);
        else if (state.mobile.tags) this.setActiveSearchType('tags', true);

    this.ensureAtLeastOneButtonActive();
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

            // If there are explicit buttons in the DOM, ensure one is active.
            // If buttons/pills were removed, respect the internal currentSearchType
            const buttonsExist = Object.values(elements.buttons).some(b => b !== null && b !== undefined);
            if (buttonsExist) {
                if (!hasActive) {
                    // Respect a recent user toggle: don't force state while suppression is active
                    if (this._suppressUntil && Date.now() < this._suppressUntil) return;
                    // Prefer the internal currentSearchType if possible so we don't
                    // overwrite a recent user action when buttons exist but no
                    // button is currently marked active (e.g. after AJAX DOM swaps).
                    const preferred = this.currentSearchType || 'notes';
                    if (elements.buttons[preferred]) {
                        this.setActiveSearchType(preferred, isMobile);
                    } else {
                        // Fallback to notes if preferred button isn't present
                        this.setActiveSearchType('notes', isMobile);
                    }
                }
            } else {
                // No buttons: apply internal state (avoid forcing 'notes')
                const t = this.currentSearchType || 'notes';
                this.setActiveSearchType(t, isMobile);
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

        // Show system folders container when clearing search
        this.showSystemFoldersContainer();

        // Build URL preserving workspace, folder, and search type
        const urlParams = new URLSearchParams(window.location.search);
        const newParams = new URLSearchParams();
        
        const currentWorkspace = urlParams.get('workspace') ||
                                (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : null) ||
                                (typeof window.selectedWorkspace !== 'undefined' ? window.selectedWorkspace : null) ||
                                '';
        
        // Always preserve workspace parameter if it exists, regardless of its name
        if (currentWorkspace) {
            newParams.set('workspace', currentWorkspace);
        }
        
        const currentFolder = urlParams.get('folder');
        if (currentFolder) {
            newParams.set('folder', currentFolder);
        }

        // Preserve the currently selected note
        const currentNote = urlParams.get('note');
        if (currentNote) {
            newParams.set('note', currentNote);
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
        } else {
            // Default to notes or explicitly preserve notes
            newParams.set('preserve_notes', '1');
        }

        const newUrl = 'index.php' + (newParams.toString() ? '?' + newParams.toString() : '');
        window.location.href = newUrl;
    }

    

    /**
     * Show validation error
     */
    showValidationError(isMobile, message) {
        const elements = this.getElements(isMobile);
        this.hideValidationError(isMobile);

        if (!message) {
            message = window.t
                ? window.t('search.validation.select_type', null, 'Please select at least one search option (Notes or Tags)')
                : 'Please select at least one search option (Notes or Tags)';
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'search-validation-error';
        errorDiv.textContent = message;

        const searchBar = elements.container?.querySelector('.searchbar-row');
        if (searchBar) {
            searchBar.parentNode.insertBefore(errorDiv, searchBar.nextSibling);
        }

        // Add error styling
        Object.values(elements.buttons).forEach(button => {
            if (button) button.classList.add('search-type-btn-error');
        });

        // Ne plus masquer automatiquement - le message reste visible jusqu'à ce que l'utilisateur tape ou lance une recherche valide
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
