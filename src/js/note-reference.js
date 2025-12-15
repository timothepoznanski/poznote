// Note Reference Handler for Poznote
// Allows inserting references to other notes with [[Note Title]] syntax

(function() {
    'use strict';

    // Store the selection/range before opening the modal
    let savedSelection = null;
    let savedRange = null;
    let currentNoteId = null;

    // Track recently opened notes in localStorage
    const RECENT_NOTES_KEY = 'poznote_recent_notes';
    const MAX_RECENT_NOTES = 10;

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

    /**
     * Save the current selection before opening the modal
     */
    function saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
            savedSelection = selection;
        }
        // Also store the current note ID
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
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            return true;
        }
        return false;
    }

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

    /**
     * Load notes list (recent + search results)
     */
    async function loadNotesList(searchQuery = '') {
        const listContainer = document.getElementById('noteReferenceList');
        const recentLabel = document.querySelector('.note-reference-recent-label');
        if (!listContainer) return;
        
        listContainer.innerHTML = '<div class="note-reference-loading"><i class="fa-spinner fa-spin"></i> Loading...</div>';
        
        try {
            // Get current workspace
            const workspace = localStorage.getItem('poznote_selected_workspace') || 'Poznote';
            
            // Fetch notes from API
            const response = await fetch(`api_list_notes.php?workspace=${encodeURIComponent(workspace)}`);
            const data = await response.json();
            
            if (!data.success || !data.notes) {
                listContainer.innerHTML = '<div class="note-reference-empty">No notes found</div>';
                return;
            }
            
            let notes = data.notes;
            
            // Filter out current note
            if (currentNoteId) {
                notes = notes.filter(n => String(n.id) !== String(currentNoteId));
            }
            
            // If searching, filter by heading
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                notes = notes.filter(n => {
                    const heading = (n.heading || '').toLowerCase();
                    return heading.includes(query);
                });
                
                if (recentLabel) recentLabel.style.display = 'none';
            } else {
                if (recentLabel) recentLabel.style.display = 'block';
                
                // Get recent notes
                const recentNotes = getRecentNotes();
                const recentIds = recentNotes.map(r => String(r.id));
                
                // Sort: recent notes first (in order of recency), then the rest by updated date
                notes.sort((a, b) => {
                    const aIsRecent = recentIds.indexOf(String(a.id));
                    const bIsRecent = recentIds.indexOf(String(b.id));
                    
                    if (aIsRecent !== -1 && bIsRecent !== -1) {
                        return aIsRecent - bIsRecent; // Both recent, keep order
                    } else if (aIsRecent !== -1) {
                        return -1; // a is recent, comes first
                    } else if (bIsRecent !== -1) {
                        return 1; // b is recent, comes first
                    }
                    // Neither recent, sort by updated date
                    return new Date(b.updated) - new Date(a.updated);
                });
            }
            
            // Limit displayed notes
            const displayNotes = notes.slice(0, searchQuery ? 20 : 4);
            
            if (displayNotes.length === 0) {
                listContainer.innerHTML = searchQuery 
                    ? '<div class="note-reference-empty">No notes match your search</div>'
                    : '<div class="note-reference-empty">No other notes available</div>';
                return;
            }
            
            // Render notes list
            listContainer.innerHTML = '';
            const recentNotes = getRecentNotes();
            const recentIds = recentNotes.map(r => String(r.id));
            
            displayNotes.forEach(note => {
                const item = document.createElement('div');
                item.className = 'note-reference-item';
                if (recentIds.includes(String(note.id)) && !searchQuery) {
                    item.classList.add('is-recent');
                }
                
                const heading = note.heading || 'Untitled';
                const folder = note.folder || '';
                
                item.innerHTML = `
                    <div class="note-reference-item-content">
                        <span class="note-reference-item-title">${escapeHtml(heading)}</span>
                        ${folder ? `<span class="note-reference-item-folder"><i class="fa-folder"></i> ${escapeHtml(folder)}</span>` : ''}
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    insertNoteReference(note.id, heading);
                });
                
                listContainer.appendChild(item);
            });
            
        } catch (error) {
            console.error('Error loading notes:', error);
            listContainer.innerHTML = '<div class="note-reference-empty">Error loading notes</div>';
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Insert a note reference at the cursor position
     */
    function insertNoteReference(noteId, heading) {
        closeNoteReferenceModal();
        
        // Restore selection first
        restoreSelection();
        
        // Create the reference link element
        const noteEntry = document.querySelector('.noteentry');
        const isMarkdown = noteEntry && noteEntry.closest('.innernote[data-markdown-note="true"]');
        
        if (isMarkdown) {
            // For markdown notes, insert [[Note Title]] syntax
            const referenceText = `[[${heading}]]`;
            document.execCommand('insertText', false, referenceText);
        } else {
            // For HTML notes, insert a clickable link
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
        
        // Trigger save
        if (typeof window.update === 'function') {
            window.update();
        }
    }

    /**
     * Navigate to a referenced note
     */
    window.navigateToNote = function(noteId) {
        const workspace = localStorage.getItem('poznote_selected_workspace') || 'Poznote';
        const isMobile = window.innerWidth <= 800;
        
        // Add scroll parameter for mobile to trigger auto-scroll to note content
        const scrollParam = isMobile ? '&scroll=1' : '';
        window.location.href = `index.php?note=${noteId}&workspace=${encodeURIComponent(workspace)}${scrollParam}`;
    };

    /**
     * Initialize event listeners
     */
    function init() {
        // Search input handler
        document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('noteReferenceSearch');
            if (searchInput) {
                let searchTimeout;
                searchInput.addEventListener('input', function() {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        loadNotesList(this.value);
                    }, 200);
                });
                
                // Handle Enter key to select first result
                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        const firstItem = document.querySelector('.note-reference-item');
                        if (firstItem) {
                            firstItem.click();
                        }
                    } else if (e.key === 'Escape') {
                        closeNoteReferenceModal();
                    }
                });
            }
            
            // Close modal on backdrop click
            const modal = document.getElementById('noteReferenceModal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        closeNoteReferenceModal();
                    }
                });
            }
        });
    }

    /**
     * Process note content to convert [[Note Title]] to clickable links
     * Called after markdown rendering
     */
    window.processNoteReferences = async function(container, workspace) {
        if (!container) return;
        
        workspace = workspace || localStorage.getItem('poznote_selected_workspace') || 'Poznote';
        
        // Find all text nodes containing [[...]]
        const walker = document.createTreeWalker(
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
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        // Process each text node
        for (const textNode of textNodes) {
            const text = textNode.nodeValue;
            const regex = /\[\[([^\]]+)\]\]/g;
            let match;
            const replacements = [];
            
            while ((match = regex.exec(text)) !== null) {
                replacements.push({
                    full: match[0],
                    title: match[1],
                    index: match.index
                });
            }
            
            if (replacements.length === 0) continue;
            
            // Create a document fragment to replace the text node
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            
            for (const rep of replacements) {
                // Add text before the match
                if (rep.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, rep.index)));
                }
                
                // Try to resolve the note reference
                try {
                    const response = await fetch(`api_resolve_note_reference.php?reference=${encodeURIComponent(rep.title)}&workspace=${encodeURIComponent(workspace)}`);
                    const data = await response.json();
                    
                    if (data.success && data.id) {
                        // Create a link to the note
                        const link = document.createElement('a');
                        link.href = `index.php?note=${data.id}&workspace=${encodeURIComponent(workspace)}`;
                        link.className = 'note-internal-link';
                        link.setAttribute('data-note-id', data.id);
                        link.setAttribute('data-note-reference', 'true');
                        link.textContent = rep.title;
                        link.title = `Go to: ${data.heading || rep.title}`;
                        fragment.appendChild(link);
                    } else {
                        // Note not found, show as broken link
                        const span = document.createElement('span');
                        span.className = 'note-internal-link note-link-broken';
                        span.textContent = rep.title;
                        span.title = 'Note not found';
                        fragment.appendChild(span);
                    }
                } catch (e) {
                    // Error resolving, keep original text
                    fragment.appendChild(document.createTextNode(rep.full));
                }
                
                lastIndex = rep.index + rep.full.length;
            }
            
            // Add remaining text after last match
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            // Replace the text node with the fragment
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    };

    /**
     * Handle click on internal note links
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

    // Initialize
    init();

})();
