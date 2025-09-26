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
    var isNotesActive = false;
    
    // First try to detect from buttons
    if (notesBtn && notesBtn.classList.contains('active')) {
        isNotesActive = true;
    } else if (window.searchManager && typeof window.searchManager.getActiveSearchType === 'function') {
        // Fallback when pills/buttons were removed: consult SearchManager
        try {
            var desktopType = window.searchManager.getActiveSearchType(false);
            var mobileType = window.searchManager.getActiveSearchType(true);
            if (desktopType === 'notes' || mobileType === 'notes' || window.searchManager.currentSearchType === 'notes') {
                isNotesActive = true;
            }
        } catch (e) {
            // ignore and fallthrough
        }
    }
    
    // Additional fallback: if we're on mobile and no explicit search type is set, default to notes
    var isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isNotesActive && isMobile) {
        // In mobile, if no specific type is detected, assume notes search for highlighting
        isNotesActive = true;
    }

    if (!isNotesActive) {
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
    
    // Special handling for input elements (like note titles)
    if (element.tagName === 'INPUT' && element.type === 'text') {
        var inputValue = element.value;
        
        // Create a combined regex pattern for all search words
        var escapedWords = [];
        for (var i = 0; i < searchWords.length; i++) {
            escapedWords.push(escapeRegExp(searchWords[i]));
        }
        var pattern = escapedWords.join('|');
        var regex = new RegExp('(' + pattern + ')', 'gi');
        
        // Clear any existing overlays for this input
        clearInputOverlays(element);
        
        // Find matches and create overlay highlights
        var matches;
        var index = 0;
        while ((matches = regex.exec(inputValue)) !== null) {
            createInputOverlay(element, matches[0], matches.index);
            highlightCount++;
            // Prevent infinite loop with global regex
            if (regex.lastIndex === matches.index) {
                regex.lastIndex++;
            }
        }
        
        return highlightCount;
    }
    
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
    
    // Restore folder filter state after clearing search
    setTimeout(function() {
        if (typeof initializeFolderSearchFilters === 'function') {
            initializeFolderSearchFilters();
        }
    }, 200);
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
    overlay.style.backgroundColor = '#ffff00';
    overlay.style.color = 'transparent';
    overlay.style.pointerEvents = 'none';
    overlay.style.borderRadius = '2px';
    overlay.style.zIndex = '1';
    overlay.style.opacity = '0.7';
    
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
                    var searchWords = searchInput.value.trim().split(/\s+/).filter(function(word) { return word.length > 0; });
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
 */
function positionOverlay(overlay, inputElement, offsetX, wordWidth) {
    var inputRect = inputElement.getBoundingClientRect();
    var inputStyle = window.getComputedStyle(inputElement);
    var paddingLeft = parseInt(inputStyle.paddingLeft) || 0;
    var borderLeft = parseInt(inputStyle.borderLeftWidth) || 0;
    var borderTop = parseInt(inputStyle.borderTopWidth) || 0;
    var paddingTop = parseInt(inputStyle.paddingTop) || 0;
    var paddingBottom = parseInt(inputStyle.paddingBottom) || 0;
    var borderBottom = parseInt(inputStyle.borderBottomWidth) || 0;
    
    // Get viewport scaling for mobile devices
    var viewport = document.querySelector('meta[name="viewport"]');
    var scale = 1;
    if (viewport && viewport.content.includes('initial-scale=')) {
        var scaleMatch = viewport.content.match(/initial-scale=([0-9.]+)/);
        if (scaleMatch) {
            scale = parseFloat(scaleMatch[1]);
        }
    }
    
    // Calculate position accounting for page scroll and mobile viewport
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Position overlay to align with the input's content area (account for borders & padding)
    // Use clientHeight so the overlay height matches the inner area where text is rendered
    var contentTop = inputRect.top + scrollY + borderTop; // start after border
    var overlayHeight = inputElement.clientHeight || (inputRect.height - borderTop - borderBottom);

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
    
    // Ensure overlay is visible on mobile
    overlay.style.zIndex = '1000';
    overlay.style.pointerEvents = 'none';
}

/**
 * Measure the bounding rect of a substring inside a text input by creating
 * a hidden mirror positioned over the real input. Returns {left, top, width, height}
 * in viewport coordinates, or null if measurement failed.
 */
function measureWordRectInInput(inputElement, startIndex, word) {
    try {
        var inputRect = inputElement.getBoundingClientRect();
        var style = window.getComputedStyle(inputElement);

        var mirror = document.createElement('div');
        mirror.style.position = 'absolute';
        mirror.style.left = inputRect.left + 'px';
        mirror.style.top = inputRect.top + 'px';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre';
        mirror.style.overflow = 'hidden';
        mirror.style.boxSizing = style.boxSizing;
        mirror.style.font = style.font;
        mirror.style.padding = style.padding;
        mirror.style.border = style.border;
        mirror.style.letterSpacing = style.letterSpacing;
        mirror.style.textTransform = style.textTransform;
        mirror.style.width = inputRect.width + 'px';
        mirror.style.height = inputRect.height + 'px';
        mirror.style.lineHeight = style.lineHeight;

        // Build nodes: before text, highlighted span, after text
        var before = document.createTextNode(inputElement.value.substring(0, startIndex));
        var span = document.createElement('span');
        span.textContent = word;
        span.style.display = 'inline-block';
        // Ensure span has minimal styles to measure accurately
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
            
            // Recalculate position
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
        } else {
            // Input element no longer exists, remove overlay
            overlay.remove();
        }
    }
}

/**
 * Clear existing overlays for an input element
 */
function clearInputOverlays(inputElement) {
    var overlays = document.querySelectorAll('.input-highlight-overlay[data-input-id="' + inputElement.id + '"]');
    for (var i = 0; i < overlays.length; i++) {
        overlays[i].remove();
    }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
