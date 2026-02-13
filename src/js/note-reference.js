// Note Reference Handler for Poznote
// Allows inserting references to other notes with [[Note Title]] syntax

(function() {
    'use strict';

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    const RECENT_NOTES_KEY = 'poznote_recent_notes';
    const MAX_RECENT_NOTES = 10;
    const SEARCH_DEBOUNCE_MS = 200;
    const MAX_SEARCH_RESULTS = 20;
    const MAX_RECENT_DISPLAY = 4;

    // ============================================================================
    // STATE
    // ============================================================================
    
    // Store the selection/range before opening the modal
    let savedSelection = null;
    let savedRange = null;
    let savedEditableElement = null;
    let currentNoteId = null;

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /**
     * Translation helper function (alias for window.t from globals.js)
     */
    const tr = window.t || function(key, vars, fallback) {
        return fallback || key;
    };

    /**
     * Get the current workspace
     */
    function getCurrentWorkspace() {
        if (typeof getSelectedWorkspace === 'function') {
            return getSelectedWorkspace();
        }
        if (typeof selectedWorkspace !== 'undefined') {
            return selectedWorkspace;
        }
        return '';
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================================
    // RECENT NOTES MANAGEMENT
    // ============================================================================

    // ============================================================================
    // RECENT NOTES MANAGEMENT
    // ============================================================================

    /**
     * Get recently opened notes from localStorage
     */
    function getRecentNotes() {
        try {
            const stored = localStorage.getItem(RECENT_NOTES_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Add a note to the recent notes list
     */
    function addToRecentNotes(noteId, heading) {
        try {
            let recent = getRecentNotes();
            // Remove if already exists
            recent = recent.filter(n => n.id !== noteId);
            // Add to the beginning
            recent.unshift({ id: noteId, heading: heading, timestamp: Date.now() });
            // Keep only the last MAX_RECENT_NOTES
            recent = recent.slice(0, MAX_RECENT_NOTES);
            localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(recent));
        } catch (e) {
            console.error('Error saving recent notes:', e);
        }
    }

    /**
     * Track when a note is opened (call this from the main app)
     */
    window.trackNoteOpened = function(noteId, heading) {
        if (noteId && heading) {
            addToRecentNotes(String(noteId), heading);
        }
    };

    // ============================================================================
    // SELECTION MANAGEMENT
    // ============================================================================

    // ============================================================================
    // SELECTION MANAGEMENT
    // ============================================================================

    /**
     * Save the current selection before opening the modal
     */
    function saveSelection() {
        // Preference for input fields (slash command support)
        if (window._slashCommandInputCursor && window._slashCommandSavedEditableElement && window._slashCommandSavedEditableElement.tagName === 'INPUT') {
            savedEditableElement = window._slashCommandSavedEditableElement;
            savedRange = null;
            savedSelection = null;
            // Note: we'll use window._slashCommandInputCursor during insertion
        } else {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                savedRange = selection.getRangeAt(0).cloneRange();
                savedSelection = selection;
            } else if (window._slashCommandSavedRange) {
                // Fallback: use the range saved by the slash command menu's executeCommand,
                // in case hideSlashMenu() caused the browser to lose the selection.
                savedRange = window._slashCommandSavedRange.cloneRange();
                savedSelection = selection;
            }
            
            // Save the editable element so we can focus it before restoring the range
            // (needed for document.execCommand to work in markdown mode).
            try {
                if (window._slashCommandSavedEditableElement) {
                    savedEditableElement = window._slashCommandSavedEditableElement;
                } else {
                    let container = savedRange && savedRange.startContainer;
                    if (container && container.nodeType === 3) container = container.parentNode;
                    savedEditableElement = container && container.closest
                        ? container.closest('[contenteditable="true"]')
                        : null;
                }
            } catch (e) {
                savedEditableElement = null;
            }
        }
        
        // Store the current note ID
        const noteEntry = document.querySelector('.noteentry');
        if (noteEntry) {
            currentNoteId = noteEntry.getAttribute('data-note-id');
        }
    }

    /**
     * Restore the saved selection
     */
    function restoreSelection() {
        if (savedRange) {
            // Focus the editable element first — required for document.execCommand
            // to work (e.g. markdown insertText).
            if (savedEditableElement) {
                try { savedEditableElement.focus({ preventScroll: true }); } catch (e) { savedEditableElement.focus(); }
            }
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            return true;
        } else if (savedEditableElement && savedEditableElement.tagName === 'INPUT') {
            // Support for input fields (task lists, title)
            try { 
                savedEditableElement.focus(); 
                // Return true if we managed to focus it
                return true;
            } catch (e) { }
        }
        return false;
    }

    // ============================================================================
    // MODAL MANAGEMENT
    // ============================================================================

    // ============================================================================
    // MODAL MANAGEMENT
    // ============================================================================

    /**
     * Open the note reference modal
     */
    window.openNoteReferenceModal = function() {
        saveSelection();
        
        const modal = document.getElementById('noteReferenceModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        // Clear and focus search input
        const searchInput = document.getElementById('noteReferenceSearch');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 100);
        }
        
        // Load recent notes and all notes
        loadNotesList();
    };

    /**
     * Close the note reference modal
     */
    window.closeNoteReferenceModal = function() {
        const modal = document.getElementById('noteReferenceModal');
        if (modal) {
            modal.style.display = 'none';
        }
        // Restore selection to the note editor
        restoreSelection();
    };

    // ============================================================================
    // NOTES LIST LOADING
    // ============================================================================

    /**
     * Sort notes by recency: recent notes first, then by updated date
     */
    function sortNotesByRecency(notes, recentIds) {
        return notes.sort((a, b) => {
            const aIsRecent = recentIds.indexOf(String(a.id));
            const bIsRecent = recentIds.indexOf(String(b.id));
            
            if (aIsRecent !== -1 && bIsRecent !== -1) {
                return aIsRecent - bIsRecent; // Both recent, maintain order
            } else if (aIsRecent !== -1) {
                return -1; // a is recent, comes first
            } else if (bIsRecent !== -1) {
                return 1; // b is recent, comes first
            }
            // Neither recent, sort by updated date
            return new Date(b.updated) - new Date(a.updated);
        });
    }

    /**
     * Filter notes by search query
     */
    function filterNotesBySearch(notes, searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        return notes.filter(n => {
            const heading = (n.heading || '').toLowerCase();
            return heading.includes(query);
        });
    }

    /**
     * Render a single note item in the list
     */
    function renderNoteItem(note, isRecent) {
        const item = document.createElement('div');
        item.className = 'note-reference-item';
        if (isRecent) {
            item.classList.add('is-recent');
        }
        
        const heading = note.heading || tr('note_reference.untitled', {}, 'Untitled');
        const folder = note.folder || '';
        
        item.innerHTML = `
            <div class="note-reference-item-content">
                <span class="note-reference-item-title">${escapeHtml(heading)}</span>
                ${folder ? `<span class="note-reference-item-folder"><i class="fa-folder"></i> ${escapeHtml(folder)}</span>` : ''}
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            insertNoteReference(note.id, heading);
        });
        
        return item;
    }

    /**
     * Load notes list (recent + search results)
     */
    async function loadNotesList(searchQuery = '') {
        const listContainer = document.getElementById('noteReferenceList');
        const recentLabel = document.querySelector('.note-reference-recent-label');
        if (!listContainer) return;
        
        listContainer.innerHTML = '<div class="note-reference-loading"><i class="fa-spinner fa-spin"></i> ' + tr('note_reference.loading', {}, 'Loading...') + '</div>';
        
        try {
            const workspace = getCurrentWorkspace();
            
            // Fetch notes from RESTful API: GET /api/v1/notes
            const response = await fetch(`/api/v1/notes?workspace=${encodeURIComponent(workspace)}`);
            const data = await response.json();
            
            if (!data.success || !data.notes) {
                listContainer.innerHTML = '<div class="note-reference-empty">' + tr('note_reference.empty.no_notes_found', {}, 'No notes found') + '</div>';
                return;
            }
            
            let notes = data.notes;
            
            // Filter out current note
            if (currentNoteId) {
                notes = notes.filter(n => String(n.id) !== String(currentNoteId));
            }
            
            const isSearching = searchQuery.trim() !== '';
            
            // Apply search filter if searching
            if (isSearching) {
                notes = filterNotesBySearch(notes, searchQuery);
                if (recentLabel) recentLabel.style.display = 'none';
            } else {
                if (recentLabel) recentLabel.style.display = 'block';
                
                // Sort by recency
                const recentNotes = getRecentNotes();
                const recentIds = recentNotes.map(r => String(r.id));
                notes = sortNotesByRecency(notes, recentIds);
            }
            
            // Limit displayed notes
            const maxResults = isSearching ? MAX_SEARCH_RESULTS : MAX_RECENT_DISPLAY;
            const displayNotes = notes.slice(0, maxResults);
            
            // Handle empty results
            if (displayNotes.length === 0) {
                const emptyMessage = isSearching
                    ? tr('note_reference.empty.no_match', {}, 'No notes match your search')
                    : tr('note_reference.empty.no_other', {}, 'No other notes available');
                listContainer.innerHTML = `<div class="note-reference-empty">${emptyMessage}</div>`;
                return;
            }
            
            // Render notes list
            listContainer.innerHTML = '';
            const recentIds = isSearching ? [] : getRecentNotes().map(r => String(r.id));
            
            displayNotes.forEach(note => {
                const isRecent = recentIds.includes(String(note.id));
                const item = renderNoteItem(note, isRecent);
                listContainer.appendChild(item);
            });
            
        } catch (error) {
            console.error('Error loading notes:', error);
            listContainer.innerHTML = '<div class="note-reference-empty">' + tr('note_reference.error.loading_notes', {}, 'Error loading notes') + '</div>';
        }
    }

    // ============================================================================
    // NOTE REFERENCE INSERTION
    // ============================================================================

    // ============================================================================
    // NOTE REFERENCE INSERTION
    // ============================================================================

    /**
     * Insert a note reference in markdown format
     */
    function insertMarkdownReference(heading, noteId) {
        const referenceText = `[${heading}](index.php?note=${noteId})`;
        
        // Use DOM insertion for precise positioning
        try {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(referenceText);
                range.insertNode(node);

                // Position cursor after the inserted text
                const newRange = document.createRange();
                newRange.setStart(node, referenceText.length);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
        } catch (e) {
            console.error('Error inserting markdown reference:', e);
            // Fallback to execCommand if DOM insertion fails
            document.execCommand('insertText', false, referenceText);
        }
    }

    /**
     * Insert a note reference in HTML format
     */
    function insertHtmlReference(heading, noteId) {
        const link = document.createElement('a');
        link.href = `index.php?note=${noteId}`;
        link.className = 'note-internal-link';
        link.setAttribute('data-note-id', noteId);
        link.setAttribute('data-note-reference', 'true');
        link.textContent = heading;
        link.title = `Go to: ${heading}`;
        
        // Prevent default navigation, handle via JavaScript
        link.onclick = function(e) {
            e.preventDefault();
            navigateToNote(noteId);
            return false;
        };
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(link);
            
            // Move cursor after the link
            range.setStartAfter(link);
            range.setEndAfter(link);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Insert a space after the link for easier continued typing
            document.execCommand('insertText', false, ' ');
        }
    }

    /**
     * Insert a note reference at the cursor position
     */
    function insertNoteReference(noteId, heading) {
        closeNoteReferenceModal();
        
        // Restore selection first
        restoreSelection();
        
        // Determine note type and insert appropriate reference
        const noteEntry = document.querySelector('.noteentry');

        // Handle input fields (task lists, titles)
        if (savedEditableElement && savedEditableElement.tagName === 'INPUT') {
            insertInputReference(heading, noteId);
            return;
        }

        const isMarkdown = noteEntry && noteEntry.closest('.innernote[data-markdown-note="true"]');
        
        if (isMarkdown) {
            insertMarkdownReference(heading, noteId);
        } else {
            insertHtmlReference(heading, noteId);
        }
    }

    /**
     * Insert a note reference in an input field (e.g. [[Note Title]])
     */
    function insertInputReference(heading, noteId) {
        if (!savedEditableElement) return;
        
        const referenceText = `[[${heading}]]`;
        const input = savedEditableElement;
        const text = input.value;
        
        let start = input.selectionStart;
        let end = input.selectionEnd;
        
        // Fallback to slash command saved position if selection is lost
        if (typeof start !== 'number' && window._slashCommandInputCursor) {
            start = window._slashCommandInputCursor.start;
            end = window._slashCommandInputCursor.end;
        }
        
        const safeStart = Math.max(0, Math.min(start, text.length));
        const safeEnd = Math.max(safeStart, Math.min(end, text.length));
        
        if (typeof input.setRangeText === 'function') {
            input.setRangeText(referenceText, safeStart, safeEnd, 'end');
        } else {
            input.value = text.substring(0, safeStart) + referenceText + text.substring(safeEnd);
        }
        
        const caretPos = safeStart + referenceText.length;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        try {
            input.setSelectionRange(caretPos, caretPos);
        } catch (e) { }
        
        // Force immediate save if it's a task input
        if (input.classList.contains('task-edit-input')) {
            // No direct action needed here as 'input' event is dispatched above,
            // but for tasklist we might want to ensure the edit is saved if they don't blur.
        }
    }

    /**
     * Navigate to a referenced note
     */
    window.navigateToNote = function(noteId) {
        const workspace = getCurrentWorkspace();
        const isMobile = window.innerWidth <= 800;
        
        // Use AJAX load if available for a smoother experience
        if (typeof window.loadNoteDirectly === 'function') {
            const url = `index.php?note=${noteId}&workspace=${encodeURIComponent(workspace)}`;
            window.loadNoteDirectly(url, noteId, null);
            return;
        }
        
        // Fallback to full page reload
        const scrollParam = isMobile ? '&scroll=1' : '';
        window.location.href = `index.php?note=${noteId}&workspace=${encodeURIComponent(workspace)}${scrollParam}`;
    };

    // ============================================================================
    // EVENT LISTENERS & INITIALIZATION
    // ============================================================================

    // ============================================================================
    // EVENT LISTENERS & INITIALIZATION
    // ============================================================================

    /**
     * Initialize search input handler
     */
    function initSearchInput() {
        const searchInput = document.getElementById('noteReferenceSearch');
        if (!searchInput) return;
        
        let searchTimeout;
        
        // Debounced search on input
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadNotesList(this.value);
            }, SEARCH_DEBOUNCE_MS);
        });
        
        // Keyboard shortcuts
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Select first result on Enter
                const firstItem = document.querySelector('.note-reference-item');
                if (firstItem) {
                    firstItem.click();
                }
            } else if (e.key === 'Escape') {
                closeNoteReferenceModal();
            }
        });
    }

    /**
     * Initialize modal backdrop click handler
     */
    function initModalBackdrop() {
        const modal = document.getElementById('noteReferenceModal');
        if (!modal) return;
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeNoteReferenceModal();
            }
        });
    }

    /**
     * Initialize all event listeners
     */
    function init() {
        document.addEventListener('DOMContentLoaded', function() {
            initSearchInput();
            initModalBackdrop();
        });
    }

    // ============================================================================
    // NOTE CONTENT PROCESSING
    // ============================================================================

    // ============================================================================
    // NOTE CONTENT PROCESSING
    // ============================================================================

    /**
     * Create a tree walker to find text nodes containing [[...]]
     */
    function createReferenceWalker(container) {
        return document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (node.nodeValue && node.nodeValue.includes('[[') && node.nodeValue.includes(']]')) {
                        // Skip if inside code or pre elements
                        let parent = node.parentNode;
                        while (parent && parent !== container) {
                            if (parent.tagName === 'CODE' || parent.tagName === 'PRE') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            parent = parent.parentNode;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );
    }

    /**
     * Extract all [[...]] references from a text string
     */
    function extractReferences(text) {
        const regex = /\[\[([^\]]+)\]\]/g;
        const replacements = [];
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            replacements.push({
                full: match[0],
                title: match[1],
                index: match.index
            });
        }
        
        return replacements;
    }

    /**
     * Create a link element for a resolved note reference
     */
    function createResolvedLink(noteId, heading, title, workspace) {
        const link = document.createElement('a');
        link.href = `index.php?note=${noteId}&workspace=${encodeURIComponent(workspace)}`;
        link.className = 'note-internal-link';
        link.setAttribute('data-note-id', noteId);
        link.setAttribute('data-note-reference', 'true');
        link.textContent = title;
        link.title = `Go to: ${heading || title}`;
        
        // Prevent event propagation so clicking links doesn't trigger 
        // edit mode in task lists or other parent click handlers
        link.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        return link;
    }

    /**
     * Create a broken link element for an unresolved reference
     */
    function createBrokenLink(title) {
        const span = document.createElement('span');
        span.className = 'note-internal-link note-link-broken';
        span.textContent = title;
        span.title = 'Note not found';
        
        // Prevent event propagation
        span.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        return span;
    }

    /**
     * Resolve a note reference via API
     */
    async function resolveReference(title, workspace) {
        try {
            const response = await fetch(`/api/v1/notes/resolve?reference=${encodeURIComponent(title)}&workspace=${encodeURIComponent(workspace)}`);
            const data = await response.json();
            
            if (data.success && data.id) {
                return { success: true, id: data.id, heading: data.heading };
            }
            return { success: false };
        } catch (e) {
            console.error('Error resolving reference:', e);
            return { success: false };
        }
    }

    /**
     * Process a single text node to convert [[...]] references to links
     */
    async function processTextNode(textNode, workspace) {
        const text = textNode.nodeValue;
        const replacements = extractReferences(text);
        
        if (replacements.length === 0) return;
        
        // Create a document fragment to replace the text node
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        for (const rep of replacements) {
            // Add text before the match
            if (rep.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, rep.index)));
            }
            
            // Resolve the note reference
            const resolved = await resolveReference(rep.title, workspace);
            
            if (resolved.success) {
                fragment.appendChild(createResolvedLink(resolved.id, resolved.heading, rep.title, workspace));
            } else {
                fragment.appendChild(createBrokenLink(rep.title));
            }
            
            lastIndex = rep.index + rep.full.length;
        }
        
        // Add remaining text after last match
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        
        // Replace the text node with the fragment
        if (textNode.parentNode) {
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    /**
     * Process note content to convert [[Note Title]] to clickable links
     * Called after markdown rendering
     */
    window.processNoteReferences = async function(container, workspace) {
        if (!container) return;
        
        workspace = workspace || getCurrentWorkspace();
        
        // Find all text nodes containing [[...]]
        const walker = createReferenceWalker(container);
        const textNodes = [];
        let node;
        
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        // Process each text node
        for (const textNode of textNodes) {
            await processTextNode(textNode, workspace);
        }
    };

    // ============================================================================
    // CLICK HANDLER FOR INTERNAL LINKS
    // ============================================================================

    // ============================================================================
    // CLICK HANDLER FOR INTERNAL LINKS
    // ============================================================================

    /**
     * Handle clicks on internal note links
     */
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a.note-internal-link, a[data-note-reference="true"]');
        if (link) {
            e.preventDefault();
            const noteId = link.getAttribute('data-note-id');
            if (noteId) {
                navigateToNote(noteId);
            }
        }
    });

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    // Initialize on load
    init();

})();
