// Search highlighting functions
// Manages highlighting of search terms in note content

/**
 * Highlight search terms in all note content areas
 */
function highlightSearchTerms() {
    // Get current search terms from the unified search input
    var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
    if (!searchInput) return;
    
    var searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        clearSearchHighlights();
        return;
    }
    
    // Check if we're in notes search mode
    var notesBtn = document.getElementById('search-notes-btn') || document.getElementById('search-notes-btn-mobile');
    if (!notesBtn || !notesBtn.classList.contains('active')) {
        return; // Only highlight in notes search mode
    }
    
    // Find all note content areas
    var noteContents = document.querySelectorAll('.noteentry');
    
    // Clear existing highlights first
    clearSearchHighlights();
    
    // Split search term into words and filter out empty ones
    var searchWords = searchTerm.split(/\s+/).filter(function(word) { return word.length > 0; });
    
    if (searchWords.length === 0) return;
    
    var totalHighlights = 0;
    
    for (var i = 0; i < noteContents.length; i++) {
        var highlightCount = highlightInElement(noteContents[i], searchWords);
        totalHighlights += highlightCount;
    }
    
    // Also highlight in note titles
    var noteTitles = document.querySelectorAll('.css-title');
    for (var i = 0; i < noteTitles.length; i++) {
        var highlightCount = highlightInElement(noteTitles[i], searchWords);
        totalHighlights += highlightCount;
    }
}

/**
 * Highlight search words within a specific element
 */
function highlightInElement(element, searchWords) {
    var highlightCount = 0;
    
    // Create a combined regex pattern for all search words
    var escapedWords = [];
    for (var i = 0; i < searchWords.length; i++) {
        escapedWords.push(escapeRegExp(searchWords[i]));
    }
    var pattern = escapedWords.join('|');
    var regex = new RegExp('(' + pattern + ')', 'gi');
    
    // Function to recursively process text nodes
    function processTextNodes(node) {
        if (node.nodeType === 3) { // Node.TEXT_NODE
            var text = node.textContent;
            if (regex.test(text)) {
                // Replace the text node with highlighted content
                var highlightedHTML = text.replace(regex, '<span class="search-highlight" style="background-color: #ffff00 !important; color: #000 !important; font-weight: normal !important; font-family: inherit !important;">$1</span>');
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = highlightedHTML;
                
                // Count highlights
                var highlights = tempDiv.querySelectorAll('.search-highlight');
                highlightCount += highlights.length;
                
                // Replace the text node with highlighted nodes
                var parent = node.parentNode;
                while (tempDiv.firstChild) {
                    parent.insertBefore(tempDiv.firstChild, node);
                }
                parent.removeChild(node);
            }
        } else if (node.nodeType === 1 && !node.classList.contains('search-highlight')) { // Node.ELEMENT_NODE
            // Process child nodes (but don't process already highlighted spans)
            var children = [];
            for (var i = 0; i < node.childNodes.length; i++) {
                children.push(node.childNodes[i]);
            }
            for (var i = 0; i < children.length; i++) {
                processTextNodes(children[i]);
            }
        }
    }
    
    processTextNodes(element);
    return highlightCount;
}

/**
 * Clear all search highlights
 */
function clearSearchHighlights() {
    var highlights = document.querySelectorAll('.search-highlight');
    for (var i = 0; i < highlights.length; i++) {
        var highlight = highlights[i];
        var parent = highlight.parentNode;
        // Replace the highlight span with its text content
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        // Normalize the parent to merge adjacent text nodes
        parent.normalize();
    }
    
    // Restore folder filter state after clearing search
    setTimeout(function() {
        if (typeof initializeFolderSearchFilters === 'function') {
            initializeFolderSearchFilters();
        }
    }, 200);
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
