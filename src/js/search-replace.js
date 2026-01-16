/**
 * Search and Replace functionality for notes (inline bar version)
 */

(function() {
    'use strict';

    // Translation helper
    function tr(key, vars, fallback) {
        try {
            return window.t ? window.t(key, vars || {}, fallback) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    // Store state for each note
    const noteStates = new Map();

    function getNoteState(noteId) {
        if (!noteStates.has(noteId)) {
            noteStates.set(noteId, {
                matches: [],
                currentIndex: -1,
                replaceVisible: false
            });
        }
        return noteStates.get(noteId);
    }

    /**
     * Get the note entry element
     */
    function getNoteEntry(noteId) {
        return document.getElementById('entry' + noteId);
    }

    /**
     * Get the search bar element
     */
    function getSearchBar(noteId) {
        return document.getElementById('searchReplaceBar' + noteId);
    }

    /**
     * Open the search and replace bar
     */
    window.openSearchReplaceModal = function(noteId) {
        const bar = getSearchBar(noteId);
        if (!bar) return;

        // Make sure listeners are initialized
        initNoteListeners(noteId);

        // Clear previous state
        clearHighlights(noteId);
        const state = getNoteState(noteId);
        state.matches = [];
        state.currentIndex = -1;
        state.replaceVisible = false;

        // Reset UI
        const searchInput = document.getElementById('searchInput' + noteId);
        const replaceInput = document.getElementById('replaceInput' + noteId);
        const replaceRow = document.getElementById('searchReplaceRow' + noteId);
        const toggleBtn = document.getElementById('searchToggleReplaceBtn' + noteId);
        const countEl = document.getElementById('searchCount' + noteId);

        if (searchInput) searchInput.value = '';
        if (replaceInput) replaceInput.value = '';
        if (replaceRow) replaceRow.style.display = 'none';
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (countEl) countEl.textContent = '';

        // Show bar with animation
        bar.style.display = 'block';

        // Focus search input
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    };

    /**
     * Close the search and replace bar
     */
    function closeSearchBar(noteId) {
        const bar = getSearchBar(noteId);
        
        // Clear highlights first
        const hadHighlights = clearHighlights(noteId);
        
        // Save the note if highlights were removed (to persist the cleanup)
        if (hadHighlights && typeof window.saveNote === 'function') {
            window.saveNote(noteId);
        }
        
        // Clear state
        const state = getNoteState(noteId);
        state.matches = [];
        state.currentIndex = -1;
        
        // Hide bar
        if (bar) {
            bar.style.display = 'none';
        }
        
        // Clear inputs
        const searchInput = document.getElementById('searchInput' + noteId);
        const replaceInput = document.getElementById('replaceInput' + noteId);
        const countEl = document.getElementById('searchCount' + noteId);
        
        if (searchInput) searchInput.value = '';
        if (replaceInput) replaceInput.value = '';
        if (countEl) countEl.textContent = '';
    }

    /**
     * Toggle replace row visibility
     */
    function toggleReplaceRow(noteId) {
        const state = getNoteState(noteId);
        state.replaceVisible = !state.replaceVisible;

        const replaceRow = document.getElementById('searchReplaceRow' + noteId);
        const toggleBtn = document.getElementById('searchToggleReplaceBtn' + noteId);

        if (replaceRow) {
            replaceRow.style.display = state.replaceVisible ? 'flex' : 'none';
        }
        if (toggleBtn) {
            if (state.replaceVisible) {
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.classList.remove('active');
            }
        }

        // Focus replace input when shown
        if (state.replaceVisible) {
            const replaceInput = document.getElementById('replaceInput' + noteId);
            if (replaceInput) {
                setTimeout(() => replaceInput.focus(), 100);
            }
        }
    }

    /**
     * Clear all search highlights
     */
    function clearHighlights(noteId) {
        const noteEntry = getNoteEntry(noteId);
        if (!noteEntry) return false;

        const highlights = noteEntry.querySelectorAll('.search-replace-highlight');
        const hadHighlights = highlights.length > 0;
        
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            }
        });
        
        return hadHighlights;
    }

    /**
     * Find all matches in the note
     */
    function findMatches(noteId, options) {
        const searchInput = document.getElementById('searchInput' + noteId);
        if (!searchInput) return;

        const searchText = searchInput.value;
        const state = getNoteState(noteId);
        const preserveIndex = options && options.preserveIndex === true;
        const skipScroll = options && options.skipScroll === true;
        const previousIndex = state.currentIndex;
        if (!searchText) {
            const countEl = document.getElementById('searchCount' + noteId);
            if (countEl) countEl.textContent = '';
            clearHighlights(noteId);
            state.matches = [];
            state.currentIndex = -1;
            return;
        }

        const noteEntry = getNoteEntry(noteId);
        if (!noteEntry) return;

        clearHighlights(noteId);
        state.matches = [];
        state.currentIndex = preserveIndex ? previousIndex : -1;

        // Build regex pattern - escape special chars
        let pattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(pattern, 'gi'); // Case insensitive for now

        // Search in the note
        highlightMatches(noteEntry, regex, noteId);

        // Update count
        const countEl = document.getElementById('searchCount' + noteId);
        const count = state.matches.length;
        if (countEl) {
            if (count > 0) {
                if (preserveIndex) {
                    let nextIndex = previousIndex;
                    if (nextIndex >= count) nextIndex = count - 1;
                    if (nextIndex < -1) nextIndex = -1;
                    state.currentIndex = nextIndex;
                } else {
                    state.currentIndex = 0;
                }
                countEl.textContent = `${count} ${count > 1 ? tr('search_replace.results', {}, 'results') : tr('search_replace.result', {}, 'result')}`;
                if (!skipScroll && state.currentIndex >= 0) {
                    scrollToMatch(noteId, state.currentIndex);
                }
            } else {
                state.currentIndex = -1;
                countEl.textContent = tr('search_replace.no_matches', {}, 'No results');
            }
        }
    }

    /**
     * Highlight matches in a node
     */
    function highlightMatches(node, regex, noteId) {
        const state = getNoteState(noteId);

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const matches = [...text.matchAll(regex)];

            if (matches.length > 0) {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                matches.forEach(match => {
                    // Text before match
                    if (match.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(
                            text.substring(lastIndex, match.index)
                        ));
                    }

                    // Highlighted match
                    const highlight = document.createElement('span');
                    highlight.className = 'search-replace-highlight';
                    highlight.textContent = match[0];
                    fragment.appendChild(highlight);
                    state.matches.push(highlight);

                    lastIndex = match.index + match[0].length;
                });

                // Text after last match
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(
                        text.substring(lastIndex)
                    ));
                }

                node.parentNode.replaceChild(fragment, node);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Skip script, style, and input elements
            if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(node.tagName)) {
                return;
            }

            // Process child nodes
            const children = Array.from(node.childNodes);
            children.forEach(child => highlightMatches(child, regex, noteId));
        }
    }

    /**
     * Go to next match
     */
    function nextMatch(noteId) {
        // Relancer la recherche pour avoir les résultats à jour
        findMatches(noteId, { preserveIndex: true, skipScroll: true });
        
        const state = getNoteState(noteId);
        if (state.matches.length === 0) return;

        state.currentIndex = (state.currentIndex + 1) % state.matches.length;
        scrollToMatch(noteId, state.currentIndex);
    }

    /**
     * Go to previous match
     */
    function prevMatch(noteId) {
        // Relancer la recherche pour avoir les résultats à jour
        findMatches(noteId, { preserveIndex: true, skipScroll: true });
        
        const state = getNoteState(noteId);
        if (state.matches.length === 0) return;

        state.currentIndex = state.currentIndex - 1;
        if (state.currentIndex < 0) {
            state.currentIndex = state.matches.length - 1;
        }
        scrollToMatch(noteId, state.currentIndex);
    }

    /**
     * Scroll to and highlight a specific match
     */
    function scrollToMatch(noteId, index) {
        const state = getNoteState(noteId);
        if (index < 0 || index >= state.matches.length) return;

        // Remove active class from all
        state.matches.forEach(m => m.classList.remove('active'));

        // Add active class to current
        const match = state.matches[index];
        match.classList.add('active');
        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Replace current match
     */
    function replaceOne(noteId) {
        const state = getNoteState(noteId);
        if (state.matches.length === 0 || state.currentIndex < 0) return;

        const replaceInput = document.getElementById('replaceInput' + noteId);
        if (!replaceInput) return;

        const replaceText = replaceInput.value;
        const currentMatch = state.matches[state.currentIndex];
        const noteEntry = getNoteEntry(noteId);

        if (currentMatch && currentMatch.parentNode && noteEntry) {
            // Replace the highlight span with a text node first
            const matchText = currentMatch.textContent;
            const textNode = document.createTextNode(matchText);
            const parent = currentMatch.parentNode;
            parent.replaceChild(textNode, currentMatch);
            parent.normalize();
            
            // Now select the text node and replace with new text
            const range = document.createRange();
            range.selectNodeContents(parent);
            // Find the text we just inserted
            const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
            let targetNode = null;
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.includes(matchText)) {
                    targetNode = walker.currentNode;
                    const startIndex = walker.currentNode.textContent.indexOf(matchText);
                    range.setStart(walker.currentNode, startIndex);
                    range.setEnd(walker.currentNode, startIndex + matchText.length);
                    break;
                }
            }
            
            if (targetNode) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                // Use execCommand to make the replacement undoable
                noteEntry.focus();
                document.execCommand('insertText', false, replaceText);
            }

            // Remove from matches array
            state.matches.splice(state.currentIndex, 1);

            // Adjust current index and update display
            const countEl = document.getElementById('searchCount' + noteId);
            if (state.matches.length > 0) {
                // Keep current index, or adjust if needed
                if (state.currentIndex >= state.matches.length) {
                    state.currentIndex = state.matches.length - 1;
                }
                // Update count
                if (countEl) {
                    countEl.textContent = `${state.matches.length} ${state.matches.length > 1 ? tr('search_replace.results', {}, 'results') : tr('search_replace.result', {}, 'result')}`;
                }
                scrollToMatch(noteId, state.currentIndex);
            } else {
                // No more matches - clear any remaining highlights
                clearHighlights(noteId);
                if (countEl) countEl.textContent = tr('search_replace.no_matches', {}, 'No results');
                state.currentIndex = -1;
                
                // Save the note to persist the cleanup
                if (typeof window.saveNote === 'function') {
                    setTimeout(() => window.saveNote(noteId), 100);
                }
            }

            // Mark note as modified
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
        }
    }

    /**
     * Replace all matches
     */
    function replaceAll(noteId) {
        const state = getNoteState(noteId);
        if (state.matches.length === 0) return;

        const replaceInput = document.getElementById('replaceInput' + noteId);
        if (!replaceInput) return;

        const replaceText = replaceInput.value;
        const count = state.matches.length;
        const noteEntry = getNoteEntry(noteId);

        if (!noteEntry) return;

        // Focus the note to enable execCommand
        noteEntry.focus();

        // Replace all matches in reverse order to maintain correct positions
        for (let i = state.matches.length - 1; i >= 0; i--) {
            const match = state.matches[i];
            if (match && match.parentNode) {
                // Replace the highlight span with text node first
                const matchText = match.textContent;
                const textNode = document.createTextNode(matchText);
                const parent = match.parentNode;
                parent.replaceChild(textNode, match);
                parent.normalize();
                
                // Find and select the text we just inserted
                const range = document.createRange();
                const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    if (walker.currentNode.textContent.includes(matchText)) {
                        const startIndex = walker.currentNode.textContent.indexOf(matchText);
                        range.setStart(walker.currentNode, startIndex);
                        range.setEnd(walker.currentNode, startIndex + matchText.length);
                        
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        
                        document.execCommand('insertText', false, replaceText);
                        break;
                    }
                }
            }
        }
        
        // Clear matches
        state.matches = [];
        state.currentIndex = -1;

        // Update display
        const countEl = document.getElementById('searchCount' + noteId);
        if (countEl) {
            countEl.textContent = tr('search_replace.replaced_all', { count: count },
                `Replaced ${count} match${count > 1 ? 'es' : ''}`);
        }

        // Mark note as modified
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
        
        // Save the note
        if (typeof window.saveNote === 'function') {
            setTimeout(() => window.saveNote(noteId), 100);
        }
    }

    /**
     * Initialize event listeners for a specific note
     */
    function initNoteListeners(noteId) {
        // Prevent double initialization
        const bar = getSearchBar(noteId);
        if (!bar || bar.dataset.initialized === 'true') {
            return;
        }

        // Close button
        const closeBtn = document.getElementById('searchCloseBtn' + noteId);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeSearchBar(noteId));
        }

        // Previous button
        const prevBtn = document.getElementById('searchPrevBtn' + noteId);
        if (prevBtn) {
            prevBtn.addEventListener('click', () => prevMatch(noteId));
        }

        // Next button
        const nextBtn = document.getElementById('searchNextBtn' + noteId);
        if (nextBtn) {
            nextBtn.addEventListener('click', () => nextMatch(noteId));
        }

        // Toggle replace button
        const toggleBtn = document.getElementById('searchToggleReplaceBtn' + noteId);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => toggleReplaceRow(noteId));
        }

        // Replace button
        const replaceBtn = document.getElementById('replaceBtn' + noteId);
        if (replaceBtn) {
            replaceBtn.addEventListener('click', () => replaceOne(noteId));
        }

        // Replace all button
        const replaceAllBtn = document.getElementById('replaceAllBtn' + noteId);
        if (replaceAllBtn) {
            replaceAllBtn.addEventListener('click', () => replaceAll(noteId));
        }

        // Search input - find on input
        const searchInput = document.getElementById('searchInput' + noteId);
        if (searchInput) {
            searchInput.addEventListener('input', () => findMatches(noteId));
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeSearchBar(noteId);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        prevMatch(noteId);
                    } else {
                        nextMatch(noteId);
                    }
                }
            });
        }

        // Replace input - replace on Enter
        const replaceInput = document.getElementById('replaceInput' + noteId);
        if (replaceInput) {
            replaceInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    replaceOne(noteId);
                } else if (e.key === 'Escape') {
                    closeSearchBar(noteId);
                }
            });
        }

        // Listen to note edits - clear highlights when user starts editing
        const noteEntry = getNoteEntry(noteId);
        if (noteEntry) {
            const clearHighlightsOnEdit = function() {
                const state = getNoteState(noteId);
                // Only clear if there are active matches
                if (state.matches.length > 0) {
                    clearHighlights(noteId);
                    state.matches = [];
                    state.currentIndex = -1;
                    
                    // Update count display
                    const countEl = document.getElementById('searchCount' + noteId);
                    if (countEl) countEl.textContent = '';
                    
                    // Save the note to persist the cleanup
                    if (typeof window.saveNote === 'function') {
                        setTimeout(() => window.saveNote(noteId), 100);
                    }
                }
            };
            
            // Attach listeners for user input
            noteEntry.addEventListener('input', clearHighlightsOnEdit);
            noteEntry.addEventListener('paste', clearHighlightsOnEdit);
        }

        // Mark as initialized
        bar.dataset.initialized = 'true';
    }

    /**
     * Initialize all search bars on the page
     */
    function initAllSearchBars() {
        const searchBars = document.querySelectorAll('[id^="searchReplaceBar"]');
        searchBars.forEach(bar => {
            const noteId = bar.id.replace('searchReplaceBar', '');
            initNoteListeners(noteId);
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAllSearchBars);
    } else {
        initAllSearchBars();
    }

    // Re-initialize when new notes are loaded
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && node.id && node.id.startsWith('searchReplaceBar')) {
                    const noteId = node.id.replace('searchReplaceBar', '');
                    initNoteListeners(noteId);
                }
            });
        });
    });

    // Start observing only when document.body is available
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } else {
        // If body is not yet available, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', function() {
            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        });
    }
})();
