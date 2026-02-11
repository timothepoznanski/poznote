// Search highlighting functions
// Manages highlighting of search terms in note content

/**
 * Remove accents from text for accent-insensitive search
 * @param {string} text - The text to normalize
 * @returns {string} Text without accents
 */
function removeAccents(text) {
    if (!text) return '';
    
    // Convert to lowercase for case-insensitive comparison
    text = text.toLowerCase();
    
    // Replace accented characters with their non-accented equivalents
    var accents = {
        'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'ā': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ė': 'e', 'ę': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'į': 'i',
        'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ø': 'o', 'ō': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u', 'ų': 'u',
        'ý': 'y', 'ÿ': 'y',
        'ñ': 'n', 'ń': 'n',
        'ç': 'c', 'ć': 'c', 'č': 'c',
        'ş': 's', 'š': 's', 'ś': 's',
        'ž': 'z', 'ź': 'z', 'ż': 'z',
        'ł': 'l',
        'æ': 'ae', 'œ': 'oe'
    };
    
    var result = '';
    for (var i = 0; i < text.length; i++) {
        var char = text[i];
        result += accents[char] || char;
    }
    
    return result;
}

/**
 * Parse search terms with support for quoted phrases
 * @param {string} search - The search string
 * @returns {Array<string>} Array of search terms (phrases kept as single strings)
 */
function parseSearchTerms(search) {
    var terms = [];
    var pattern = /"([^"]+)"|\S+/g;
    var match;
    
    while ((match = pattern.exec(search)) !== null) {
        // If match[1] exists, it's a quoted phrase
        if (match[1]) {
            terms.push(match[1]);
        } else {
            // Otherwise it's a single word
            terms.push(match[0]);
        }
    }
    
    return terms;
}

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
    var isNotesActive = isNotesSearchActive();
    if (!isNotesActive) {
        return; // Only highlight in notes search mode
    }
    
    // Clear existing highlights first
    clearSearchHighlights();
    
    // Parse search terms with support for quoted phrases
    var searchWords = parseSearchTerms(searchTerm);
    if (searchWords.length === 0) return;
    
    // Highlight in both note contents and titles
    var elementsToHighlight = document.querySelectorAll('.noteentry, .css-title');
    var totalHighlights = 0;
    
    for (var i = 0; i < elementsToHighlight.length; i++) {
        totalHighlights += highlightInElement(elementsToHighlight[i], searchWords);
    }
}

/**
 * Check if notes search mode is currently active
 * @returns {boolean} True if in notes search mode
 */
function isNotesSearchActive() {
    // Method 1: Check button state
    var notesBtn = document.getElementById('search-notes-btn') || document.getElementById('search-notes-btn-mobile');
    if (notesBtn && notesBtn.classList.contains('active')) {
        return true;
    }
    
    // Method 2: Check SearchManager if available
    if (window.searchManager) {
        try {
            if (typeof window.searchManager.getActiveSearchType === 'function') {
                var desktopType = window.searchManager.getActiveSearchType(false);
                var mobileType = window.searchManager.getActiveSearchType(true);
                if (desktopType === 'notes' || mobileType === 'notes') {
                    return true;
                }
            }
            if (window.searchManager.currentSearchType === 'notes') {
                return true;
            }
        } catch (e) {
            // Ignore errors and continue to next method
        }
    }
    
    // Method 3: Check hidden input fields
    try {
        var hiddenNotesDesktop = document.getElementById('search-in-notes');
        var hiddenNotesMobile = document.getElementById('search-in-notes-mobile');
        if ((hiddenNotesDesktop && hiddenNotesDesktop.value === '1') || 
            (hiddenNotesMobile && hiddenNotesMobile.value === '1')) {
            return true;
        }
    } catch (e) {
        // Ignore errors
    }
    
    return false;
}

/**
 * Highlight search words within a specific element
 */
function highlightInElement(element, searchWords) {
    var highlightCount = 0;
    
    // Special handling for input elements (like note titles)
    if (element.tagName === 'INPUT' && element.type === 'text') {
        // Ensure the input is visible and rendered; if not, skip overlay logic
        var elStyle = window.getComputedStyle(element);
        var rects = element.getClientRects();
        if (elStyle.display === 'none' || elStyle.visibility === 'hidden' || element.offsetWidth === 0 || rects.length === 0 || element.offsetParent === null) {
            return 0; // no overlays for hidden inputs (visible heading will be highlighted instead)
        }
        var inputValue = element.value;
        var normalizedInputValue = removeAccents(inputValue);
        
        // Clear any existing overlays for this input
        clearInputOverlays(element);
        
        // Find matches for each search word with accent-insensitive matching
        for (var i = 0; i < searchWords.length; i++) {
            var searchWord = searchWords[i];
            var normalizedSearchWord = removeAccents(searchWord);
            var startPos = 0;
            
            while (startPos < normalizedInputValue.length) {
                var foundPos = normalizedInputValue.indexOf(normalizedSearchWord, startPos);
                if (foundPos === -1) break;
                
                // Get the actual word from the original input (with accents)
                var actualWord = inputValue.substring(foundPos, foundPos + searchWord.length);
                createInputOverlay(element, actualWord, foundPos);
                highlightCount++;
                startPos = foundPos + 1;
            }
        }
        
        return highlightCount;
    }
    
    // Function to recursively process text nodes with accent-insensitive matching
    function processTextNodes(node) {
        if (node.nodeType === 3) { // Node.TEXT_NODE
            var text = node.textContent;
            var normalizedText = removeAccents(text);
            var hasMatch = false;
            
            // Check if any search word matches (accent-insensitive)
            for (var i = 0; i < searchWords.length; i++) {
                var normalizedSearchWord = removeAccents(searchWords[i]);
                if (normalizedText.indexOf(normalizedSearchWord) !== -1) {
                    hasMatch = true;
                    break;
                }
            }
            
            if (hasMatch) {
                // Build highlighted HTML by finding all matches
                var fragments = [];
                var lastIndex = 0;
                
                // Find all positions where search words match (accent-insensitive)
                var matches = [];
                for (var i = 0; i < searchWords.length; i++) {
                    var normalizedSearchWord = removeAccents(searchWords[i]);
                    var startPos = 0;
                    
                    while (startPos < normalizedText.length) {
                        var foundPos = normalizedText.indexOf(normalizedSearchWord, startPos);
                        if (foundPos === -1) break;
                        
                        matches.push({
                            start: foundPos,
                            end: foundPos + searchWords[i].length,
                            length: searchWords[i].length
                        });
                        startPos = foundPos + 1;
                    }
                }
                
                // Sort matches by position and remove overlaps
                matches.sort(function(a, b) { return a.start - b.start; });
                var cleanedMatches = [];
                for (var matchIdx = 0; matchIdx < matches.length; matchIdx++) {
                    var match = matches[matchIdx];
                    var overlap = false;
                    for (var cleanIdx = 0; cleanIdx < cleanedMatches.length; cleanIdx++) {
                        if (match.start < cleanedMatches[cleanIdx].end && match.end > cleanedMatches[cleanIdx].start) {
                            overlap = true;
                            break;
                        }
                    }
                    if (!overlap) {
                        cleanedMatches.push(match);
                    }
                }
                
                // Build the highlighted HTML
                var tempDiv = document.createElement('div');
                lastIndex = 0;
                for (var matchIdx = 0; matchIdx < cleanedMatches.length; matchIdx++) {
                    var match = cleanedMatches[matchIdx];
                    // Add text before match
                    if (match.start > lastIndex) {
                        tempDiv.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));
                    }
                    // Add highlighted match
                    var span = document.createElement('span');
                    span.className = 'search-highlight';
                    // We remove inline styles to allow CSS classes to handle the color
                    span.textContent = text.substring(match.start, match.end);
                    tempDiv.appendChild(span);
                    highlightCount++;
                    lastIndex = match.end;
                }
                // Add remaining text
                if (lastIndex < text.length) {
                    tempDiv.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                
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
            for (var childIdx = 0; childIdx < node.childNodes.length; childIdx++) {
                children.push(node.childNodes[childIdx]);
            }
            for (var childIdx = 0; childIdx < children.length; childIdx++) {
                processTextNodes(children[childIdx]);
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
    // Reset navigation state
    if (window.searchNavigation) {
        window.searchNavigation.currentHighlightIndex = -1;
        window.searchNavigation.highlights = [];
    }

    var highlights = document.querySelectorAll('.search-highlight');
    for (var i = 0; i < highlights.length; i++) {
        var highlight = highlights[i];
        var parent = highlight.parentNode;
        // Replace the highlight span with its text content
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        // Normalize the parent to merge adjacent text nodes
        parent.normalize();
    }
    
    // Clear input overlays
    var overlays = document.querySelectorAll('.input-highlight-overlay');
    for (var i = 0; i < overlays.length; i++) {
        overlays[i].remove();
    }
    
    // Clean up event listeners if no more overlays exist
    if (window.inputOverlayListeners) {
        window.removeEventListener('scroll', updateAllOverlayPositions, true);
        window.removeEventListener('resize', updateAllOverlayPositions);
        window.inputOverlayListeners = false;
    }
    
    // Clean up input event listeners
    var inputsWithListeners = document.querySelectorAll('input[data-overlay-listener]');
    for (var i = 0; i < inputsWithListeners.length; i++) {
        inputsWithListeners[i].removeAttribute('data-overlay-listener');
        // Note: We don't remove the event listener as it's anonymous, but the attribute prevents duplicates
    }
}

/**
 * Create an overlay highlight for a word in an input element
 */
function createInputOverlay(inputElement, word, startIndex) {
    // Create a hidden span to measure text width
    var measurer = document.createElement('span');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.whiteSpace = 'pre';
    measurer.style.font = window.getComputedStyle(inputElement).font;
    document.body.appendChild(measurer);
    
    // Measure the position of the word
    var textBefore = inputElement.value.substring(0, startIndex);
    measurer.textContent = textBefore;
    var offsetX = measurer.offsetWidth;
    
    measurer.textContent = word;
    var wordWidth = measurer.offsetWidth;
    
    document.body.removeChild(measurer);
    
    // Create the overlay
    var overlay = document.createElement('div');
    overlay.className = 'input-highlight-overlay';
    overlay.style.position = 'absolute';
    
    // Add data attribute to link it to the input
    overlay.setAttribute('data-input-id', inputElement.id);
    overlay.setAttribute('data-start-index', startIndex.toString());
    overlay.setAttribute('data-word', word);
    
    // Position the overlay
    positionOverlay(overlay, inputElement, offsetX, wordWidth);
    
    document.body.appendChild(overlay);
    
    // Add input event listener to update overlay when content changes
    if (!inputElement.hasAttribute('data-overlay-listener')) {
        inputElement.setAttribute('data-overlay-listener', 'true');
        inputElement.addEventListener('input', function() {
            // Delay to allow the input value to update
            setTimeout(function() {
                // Re-run highlighting for this specific input
                var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
                if (searchInput && searchInput.value.trim()) {
                    var searchWords = parseSearchTerms(searchInput.value.trim());
                    if (searchWords.length > 0) {
                        highlightInElement(inputElement, searchWords);
                    }
                }
            }, 50);
        });
    }
    
    // Update position on scroll or resize
    if (!window.inputOverlayListeners) {
        window.inputOverlayListeners = true;
        window.addEventListener('scroll', updateAllOverlayPositions, true);
        window.addEventListener('resize', updateAllOverlayPositions);
    }
}

/**
 * Position an overlay relative to its input element
 * Calculates the exact position to overlay a highlight on top of text in an input field
 */
function positionOverlay(overlay, inputElement, offsetX, wordWidth) {
    var inputRect = inputElement.getBoundingClientRect();
    var inputStyle = window.getComputedStyle(inputElement);
    
    // Calculate padding and borders to position overlay correctly
    var paddingLeft = parseInt(inputStyle.paddingLeft) || 0;
    var borderLeft = parseInt(inputStyle.borderLeftWidth) || 0;
    var borderTop = parseInt(inputStyle.borderTopWidth) || 0;
    
    // Calculate position accounting for page scroll
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Position overlay to align with the input's content area (account for borders)
    var contentTop = inputRect.top + scrollY + borderTop;
    var overlayHeight = inputElement.clientHeight;

    // Try to align overlay to the text baseline by using the computed line-height
    var computedLineHeight = parseFloat(inputStyle.lineHeight);
    if (!computedLineHeight || isNaN(computedLineHeight)) {
        computedLineHeight = parseFloat(inputStyle.fontSize) || overlayHeight;
    }

    // Clamp line height to available overlay height
    var finalLineHeight = Math.min(computedLineHeight, overlayHeight);

    // Center the overlay vertically on the text line inside the input
    var topOffsetForText = Math.round((overlayHeight - finalLineHeight) / 2);
    var overlayTop = contentTop + topOffsetForText;

    overlay.style.left = (inputRect.left + scrollX + paddingLeft + borderLeft + offsetX) + 'px';
    overlay.style.top = overlayTop + 'px';
    overlay.style.width = wordWidth + 'px';
    overlay.style.height = finalLineHeight + 'px';
    overlay.style.lineHeight = finalLineHeight + 'px';
}

/**
 * Measure the bounding rect of a substring inside a text input
 * Creates a hidden mirror element to accurately measure word position
 * @param {HTMLInputElement} inputElement - The input element containing the text
 * @param {number} startIndex - Start position of the word in the input value
 * @param {string} word - The word to measure
 * @returns {Object|null} Object with {left, top, width, height} in viewport coords, or null if failed
 */
function measureWordRectInInput(inputElement, startIndex, word) {
    try {
        var inputRect = inputElement.getBoundingClientRect();
        var style = window.getComputedStyle(inputElement);

        // Create a hidden mirror div that matches the input's styling exactly
        var mirror = document.createElement('div');
        mirror.style.position = 'absolute';
        mirror.style.left = (inputRect.left + (window.pageXOffset || document.documentElement.scrollLeft)) + 'px';
        mirror.style.top = (inputRect.top + (window.pageYOffset || document.documentElement.scrollTop)) + 'px';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre';
        mirror.style.overflow = 'hidden';
        mirror.style.boxSizing = style.boxSizing;
        mirror.style.font = style.font;
        mirror.style.fontFamily = style.fontFamily;
        mirror.style.fontWeight = style.fontWeight;
        mirror.style.fontStyle = style.fontStyle;
        mirror.style.padding = style.padding;
        mirror.style.border = style.border;
        mirror.style.letterSpacing = style.letterSpacing;
        mirror.style.wordSpacing = style.wordSpacing;
        mirror.style.textTransform = style.textTransform;
        mirror.style.textIndent = style.textIndent;
        mirror.style.textAlign = style.textAlign;
        mirror.style.width = inputRect.width + 'px';
        mirror.style.height = inputRect.height + 'px';
        mirror.style.lineHeight = style.lineHeight;

        // Build the mirror content: text before + highlighted word + text after
        var before = document.createTextNode(inputElement.value.substring(0, startIndex));
        var span = document.createElement('span');
        span.textContent = word;
        span.style.display = 'inline-block';
        span.style.background = 'transparent';
        var after = document.createTextNode(inputElement.value.substring(startIndex + word.length));

        mirror.appendChild(before);
        mirror.appendChild(span);
        mirror.appendChild(after);

        document.body.appendChild(mirror);
        var rect = span.getBoundingClientRect();
        document.body.removeChild(mirror);

        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    } catch (e) {
        return null;
    }
}

/**
 * Update positions of all overlay highlights
 */
function updateAllOverlayPositions() {
    var overlays = document.querySelectorAll('.input-highlight-overlay');
    for (var i = 0; i < overlays.length; i++) {
        var overlay = overlays[i];
        var inputId = overlay.getAttribute('data-input-id');
        var inputElement = document.getElementById(inputId);
        
        if (inputElement) {
            var startIndex = parseInt(overlay.getAttribute('data-start-index'));
            var word = overlay.getAttribute('data-word');
            
            // Use the centralized measurement helper to compute bounds for the word
            var rect = measureWordRectInInput(inputElement, startIndex, word);
            if (rect) {
                // Convert rect.left/top (viewport coords) to offsets relative to input's content
                var inputRect = inputElement.getBoundingClientRect();
                var offsetX = rect.left - inputRect.left;
                var wordWidth = rect.width;
                positionOverlay(overlay, inputElement, offsetX, wordWidth);
            } else {
                // Fallback to the older measurer technique if measurement failed
                var measurer = document.createElement('span');
                measurer.style.position = 'absolute';
                measurer.style.visibility = 'hidden';
                measurer.style.whiteSpace = 'pre';
                measurer.style.font = window.getComputedStyle(inputElement).font;
                document.body.appendChild(measurer);

                var textBefore = inputElement.value.substring(0, startIndex);
                measurer.textContent = textBefore;
                var offsetX = measurer.offsetWidth;

                measurer.textContent = word;
                var wordWidth = measurer.offsetWidth;

                document.body.removeChild(measurer);

                positionOverlay(overlay, inputElement, offsetX, wordWidth);
            }
        } else {
            // Input element no longer exists, remove overlay
            overlay.remove();
        }
    }
}

/**
 * Clear existing overlays for an input element
 * @param {HTMLInputElement} inputElement - The input element to clear overlays for
 */
function clearInputOverlays(inputElement) {
    var overlays = document.querySelectorAll('.input-highlight-overlay[data-input-id="' + inputElement.id + '"]');
    for (var i = 0; i < overlays.length; i++) {
        overlays[i].remove();
    }
}

/**
 * Navigation state for highlights
 */
window.searchNavigation = {
    currentHighlightIndex: -1,
    highlights: []
};

/**
 * Update the list of available highlights in the current view
 */
function updateHighlightsList() {
    // Get both standard highlights and input overlays
    var highlights = Array.from(document.querySelectorAll('.search-highlight, .input-highlight-overlay'));
    
    // Sort highlights by their position in the DOM (vertical position first, then horizontal)
    highlights.sort(function(a, b) {
        var rectA = a.getBoundingClientRect();
        var rectB = b.getBoundingClientRect();
        var topA = rectA.top + window.scrollY;
        var topB = rectB.top + window.scrollY;
        
        if (Math.abs(topA - topB) < 5) { // Same line approximately
            return rectA.left - rectB.left;
        }
        return topA - topB;
    });
    
    window.searchNavigation.highlights = highlights;
}

/**
 * Navigate to a specific highlight by index
 */
function navigateToHighlight(index) {
    var highlights = window.searchNavigation.highlights;
    if (index < 0 || index >= highlights.length) return;
    
    var target = highlights[index];
    
    // Remove active class from all highlights
    highlights.forEach(h => {
        h.classList.remove('search-highlight-active');
    });
    
    // Add active class and scroll
    target.classList.add('search-highlight-active');
    
    // Smooth scroll to the target
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    window.searchNavigation.currentHighlightIndex = index;
}

/**
 * Navigate to the next highlight
 */
function navigateToNextHighlight() {
    updateHighlightsList();
    var highlights = window.searchNavigation.highlights;
    
    if (highlights.length === 0) {
        // No highlights in current note, try to go to next note
        navigateToNextNote();
        return;
    }
    
    var nextIndex = window.searchNavigation.currentHighlightIndex + 1;
    
    if (nextIndex < highlights.length) {
        navigateToHighlight(nextIndex);
    } else {
        // End of current note reached, go to next note
        navigateToNextNote();
    }
}

/**
 * Navigate to the next note in the list
 */
function navigateToNextNote() {
    // Find the currently selected note in the left column
    var currentNote = document.querySelector('.links_arbo_left.selected-note, [data-action="load-note"].selected-note');
    
    // Find all visible notes that match search (not hidden)
    // We use a more robust selector to include ALL notes in the sidebar
    var allNotes = Array.from(document.querySelectorAll('[data-action="load-note"]')).filter(function(el) {
        // Skip explicitly hidden notes
        if (el.classList.contains('search-hidden')) return false;
        // Skip notes in folders that are hidden by search
        if (el.closest('.folder-header.search-hidden')) return false;
        // Skip trash notes if we aren't searching in trash specifically
        if (el.closest('.folder-header[data-folder="Trash"]') && !el.closest('.folder-header:not(.search-hidden)')) return false;
        
        return true;
    });
    
    if (allNotes.length === 0) return;
    
    var currentIndex = currentNote ? allNotes.indexOf(currentNote) : -1;
    var nextNote = allNotes[currentIndex + 1];
    
    // If we're at the end, wrap around to the first note
    if (!nextNote) {
        nextNote = allNotes[0];
    }
    
    if (nextNote) {
        // Reset highlight index for the next note
        window.searchNavigation.currentHighlightIndex = -1;
        // Click the next note to load it
        nextNote.click();
        
        // Auto-scroll to first highlight after note is loaded
        window.searchNavigation.pendingAutoScroll = true;
    }
}

/**
 * Automatically scroll to the first highlight
 */
function scrollToFirstHighlight() {
    // Clear pending flag
    window.searchNavigation.pendingAutoScroll = false;
    
    // Wait a bit for everything to be rendered and overlays to be positioned
    setTimeout(function() {
        updateHighlightsList();
        if (window.searchNavigation.highlights.length > 0) {
            navigateToHighlight(0);
        }
    }, 300);
}
