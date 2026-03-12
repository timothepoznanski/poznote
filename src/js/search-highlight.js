// Search highlighting functions

function removeAccents(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/æ/g, 'ae').replace(/œ/g, 'oe')
        .replace(/ø/g, 'o').replace(/ł/g, 'l');
}

function parseSearchTerms(search) {
    var terms = [];
    var pattern = /"([^"]+)"|\S+/g;
    var match;
    while ((match = pattern.exec(search)) !== null) {
        terms.push(match[1] || match[0]);
    }
    return terms;
}

// ---------- Search mode helpers ----------

function isCombinedSearchActive() {
    var comb = document.getElementById('search-combined-mode') || document.getElementById('search-combined-mode-mobile');
    if (comb && comb.value === '1') return true;
    return !!(window.searchManager && typeof window.searchManager.isCombinedModeActive === 'function' &&
        (window.searchManager.isCombinedModeActive(false) || window.searchManager.isCombinedModeActive(true)));
}

function isTagsSearchActive() {
    var tagsBtn = document.getElementById('search-tags-btn') || document.getElementById('search-tags-btn-mobile');
    return (tagsBtn && tagsBtn.classList.contains('active')) ||
        !!(window.searchManager && window.searchManager.currentSearchType === 'tags');
}

/**
 * Highlight search terms in all note content areas
 */
function highlightSearchTerms() {
    var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
    if (!searchInput) return;

    var searchTerm = searchInput.value.trim();
    if (!searchTerm) { clearSearchHighlights(); return; }
    if (!isNotesSearchActive() && !isTagsSearchActive()) return;

    var termUnchanged = window.searchNavigation && searchTerm === window.searchNavigation.lastTerm;
    var existingHighlights = document.querySelectorAll('.search-highlight, .tag-highlight');

    if (termUnchanged && existingHighlights.length > 0) {
        updateHighlightsList();
        if (window.searchNavigation) {
            var nav = window.searchNavigation;
            if (nav.pendingAutoScroll && nav.highlights.length > 0) {
                nav.pendingAutoScroll = false;
                navigateToHighlight(0, true);
            } else if (nav.currentHighlightIndex >= 0 && nav.highlights.length > 0 &&
                       !document.querySelector('.search-highlight-active')) {
                navigateToHighlight(Math.min(nav.currentHighlightIndex, nav.highlights.length - 1), false);
            }
        }
        return;
    }

    clearSearchHighlights(termUnchanged);
    if (window.searchNavigation) window.searchNavigation.lastTerm = searchTerm;

    var searchWords = parseSearchTerms(searchTerm);
    if (!searchWords.length) return;

    // Only highlight note content when in notes or combined mode.
    // In tags-only mode we skip this to avoid briefly highlighting title text.
    if (isNotesSearchActive()) {
        document.querySelectorAll('.noteentry, .css-title').forEach(function(el) {
            highlightInElement(el, searchWords);
        });
    }

    if (isCombinedSearchActive() && typeof window.highlightMatchingTags === 'function') {
        try { window.highlightMatchingTags(searchTerm); } catch (e) {}
    }

    updateHighlightsList();

    if (window.searchNavigation) {
        var nav = window.searchNavigation;
        if (nav.highlights.length > 0) {
            if (nav.pendingAutoScroll) {
                nav.pendingAutoScroll = false;
                navigateToHighlight(0, true);
            } else if (nav.currentHighlightIndex >= 0) {
                nav.highlights[Math.min(nav.currentHighlightIndex, nav.highlights.length - 1)]
                    .classList.add('search-highlight-active');
            }
        }
    }
}

function isNotesSearchActive() {
    if (isCombinedSearchActive()) return true;

    var notesBtn = document.getElementById('search-notes-btn') || document.getElementById('search-notes-btn-mobile');
    if (notesBtn && notesBtn.classList.contains('active')) return true;

    if (window.searchManager) {
        try {
            if (typeof window.searchManager.getActiveSearchType === 'function') {
                var dt = window.searchManager.getActiveSearchType(false);
                var mt = window.searchManager.getActiveSearchType(true);
                if (dt === 'notes' || mt === 'notes') return true;
            }
            if (window.searchManager.currentSearchType === 'notes') return true;
        } catch (e) {}
    }

    return false;
}

// ---------- Text highlighting ----------

/**
 * Find all non-overlapping match positions for searchWords in normalizedText.
 * Returns array of {start, end} objects sorted by position.
 */
function findMatchPositions(normalizedText, searchWords) {
    var matches = [];
    for (var i = 0; i < searchWords.length; i++) {
        var needle = removeAccents(searchWords[i]);
        var pos = 0;
        while (pos < normalizedText.length) {
            var found = normalizedText.indexOf(needle, pos);
            if (found === -1) break;
            matches.push({ start: found, end: found + searchWords[i].length });
            pos = found + 1;
        }
    }
    matches.sort(function(a, b) { return a.start - b.start; });
    // Remove overlaps
    var result = [];
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (!result.length || m.start >= result[result.length - 1].end) result.push(m);
    }
    return result;
}

function highlightInElement(element, searchWords) {
    // Input elements: use overlay highlights
    if (element.tagName === 'INPUT' && element.type === 'text') {
        var elStyle = window.getComputedStyle(element);
        if (elStyle.display === 'none' || elStyle.visibility === 'hidden' ||
            element.offsetWidth === 0 || element.getClientRects().length === 0 ||
            element.offsetParent === null) {
            return;
        }
        var inputValue = element.value;
        var normalizedValue = removeAccents(inputValue);
        clearInputOverlays(element);
        for (var i = 0; i < searchWords.length; i++) {
            var needle = removeAccents(searchWords[i]);
            var pos = 0;
            while (pos < normalizedValue.length) {
                var found = normalizedValue.indexOf(needle, pos);
                if (found === -1) break;
                createInputOverlay(element, inputValue.substring(found, found + searchWords[i].length), found);
                pos = found + 1;
            }
        }
        return;
    }

    // Regular elements: wrap matching text nodes in <span class="search-highlight">
    function processTextNodes(node) {
        if (node.nodeType === 3) { // TEXT_NODE
            var text = node.textContent;
            var matches = findMatchPositions(removeAccents(text), searchWords);
            if (!matches.length) return;

            var frag = document.createDocumentFragment();
            var lastIndex = 0;
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i];
                if (m.start > lastIndex) frag.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
                var span = document.createElement('span');
                span.className = 'search-highlight';
                span.textContent = text.substring(m.start, m.end);
                frag.appendChild(span);
                lastIndex = m.end;
            }
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.substring(lastIndex)));
            node.parentNode.insertBefore(frag, node);
            node.parentNode.removeChild(node);
        } else if (node.nodeType === 1 && !node.classList.contains('search-highlight')) { // ELEMENT_NODE
            // Skip hidden containers (e.g. markdown editor in preview mode)
            try { if (window.getComputedStyle(node).display === 'none') return; } catch (e) {}
            Array.from(node.childNodes).forEach(processTextNodes);
        }
    }

    processTextNodes(element);
}

// ---------- Highlight clearing ----------

function clearSearchHighlights(skipResetNavigation) {
    if (window.searchNavigation) {
        if (!skipResetNavigation) {
            window.searchNavigation.currentHighlightIndex = -1;
            window.searchNavigation.lastTerm = '';
        }
        window.searchNavigation.highlights = [];
    }

    document.querySelectorAll('.search-highlight-active, .tag-highlight').forEach(function(el) {
        el.classList.remove('search-highlight-active');
        el.classList.remove('tag-highlight');
    });

    document.querySelectorAll('.search-highlight').forEach(function(highlight) {
        var parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
    });

    document.querySelectorAll('.input-highlight-overlay').forEach(function(o) { o.remove(); });

    if (window.inputOverlayListeners) {
        window.removeEventListener('scroll', updateAllOverlayPositions, true);
        window.removeEventListener('resize', updateAllOverlayPositions);
        window.inputOverlayListeners = false;
    }

    document.querySelectorAll('input[data-overlay-listener]').forEach(function(el) {
        el.removeAttribute('data-overlay-listener');
    });
}

// ---------- Input overlay highlights ----------

function createInputOverlay(inputElement, word, startIndex) {
    var overlay = document.createElement('div');
    overlay.className = 'input-highlight-overlay';
    overlay.style.position = 'absolute';
    overlay.setAttribute('data-input-id', inputElement.id);
    overlay.setAttribute('data-start-index', startIndex.toString());
    overlay.setAttribute('data-word', word);
    document.body.appendChild(overlay);

    // Use accurate mirror-based measurement; fall back to simple span measurer
    var rect = measureWordRectInInput(inputElement, startIndex, word);
    if (rect) {
        positionOverlay(overlay, inputElement, rect.left - inputElement.getBoundingClientRect().left, rect.width);
    } else {
        var m = measureWordOffsetSimple(inputElement, startIndex, word);
        positionOverlay(overlay, inputElement, m.offsetX, m.wordWidth);
    }

    if (!inputElement.hasAttribute('data-overlay-listener')) {
        inputElement.setAttribute('data-overlay-listener', 'true');
        inputElement.addEventListener('input', function() {
            setTimeout(function() {
                var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
                if (searchInput && searchInput.value.trim()) {
                    var searchWords = parseSearchTerms(searchInput.value.trim());
                    if (searchWords.length > 0) highlightInElement(inputElement, searchWords);
                }
            }, 50);
        });
    }

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

    var paddingLeft = parseInt(inputStyle.paddingLeft) || 0;
    var borderLeft = parseInt(inputStyle.borderLeftWidth) || 0;
    var borderTop = parseInt(inputStyle.borderTopWidth) || 0;
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    var overlayHeight = inputElement.clientHeight;
    var computedLineHeight = parseFloat(inputStyle.lineHeight);
    if (!computedLineHeight || isNaN(computedLineHeight)) {
        computedLineHeight = parseFloat(inputStyle.fontSize) || overlayHeight;
    }
    var finalLineHeight = Math.min(computedLineHeight, overlayHeight);
    var topOffsetForText = Math.round((overlayHeight - finalLineHeight) / 2);

    overlay.style.left = (inputRect.left + scrollX + paddingLeft + borderLeft + offsetX) + 'px';
    overlay.style.top = (inputRect.top + scrollY + borderTop + topOffsetForText) + 'px';
    overlay.style.width = wordWidth + 'px';
    overlay.style.height = finalLineHeight + 'px';
    overlay.style.lineHeight = finalLineHeight + 'px';
}

function measureWordOffsetSimple(inputElement, startIndex, word) {
    var measurer = document.createElement('span');
    measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' +
        window.getComputedStyle(inputElement).font;
    document.body.appendChild(measurer);
    measurer.textContent = inputElement.value.substring(0, startIndex);
    var offsetX = measurer.offsetWidth;
    measurer.textContent = word;
    var wordWidth = measurer.offsetWidth;
    document.body.removeChild(measurer);
    return { offsetX: offsetX, wordWidth: wordWidth };
}

function measureWordRectInInput(inputElement, startIndex, word) {
    try {
        var inputRect = inputElement.getBoundingClientRect();
        var style = window.getComputedStyle(inputElement);
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

        var span = document.createElement('span');
        span.textContent = word;
        span.style.cssText = 'display:inline-block;background:transparent';
        mirror.appendChild(document.createTextNode(inputElement.value.substring(0, startIndex)));
        mirror.appendChild(span);
        mirror.appendChild(document.createTextNode(inputElement.value.substring(startIndex + word.length)));

        document.body.appendChild(mirror);
        var rect = span.getBoundingClientRect();
        document.body.removeChild(mirror);
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    } catch (e) {
        return null;
    }
}

function updateAllOverlayPositions() {
    document.querySelectorAll('.input-highlight-overlay').forEach(function(overlay) {
        var inputElement = document.getElementById(overlay.getAttribute('data-input-id'));
        if (!inputElement) { overlay.remove(); return; }
        var startIndex = parseInt(overlay.getAttribute('data-start-index'));
        var word = overlay.getAttribute('data-word');
        var rect = measureWordRectInInput(inputElement, startIndex, word);
        if (rect) {
            positionOverlay(overlay, inputElement, rect.left - inputElement.getBoundingClientRect().left, rect.width);
        } else {
            var m = measureWordOffsetSimple(inputElement, startIndex, word);
            positionOverlay(overlay, inputElement, m.offsetX, m.wordWidth);
        }
    });
}

function clearInputOverlays(inputElement) {
    document.querySelectorAll('.input-highlight-overlay[data-input-id="' + inputElement.id + '"]')
        .forEach(function(o) { o.remove(); });
}

/**
 * Navigation state for highlights
 */
window.searchNavigation = {
    currentHighlightIndex: -1,
    highlights: [],
    lastTerm: '',
    pendingAutoScroll: false
};

/**
 * Update the list of available highlights in the current view
 */
function updateHighlightsList() {
    var highlights = Array.from(document.querySelectorAll('.search-highlight, .input-highlight-overlay, .tag-highlight'));

    // Exclude highlights inside hidden containers (e.g. markdown editor in preview mode)
    highlights = highlights.filter(function(el) {
        if (el.classList.contains('input-highlight-overlay')) return true;
        try {
            var current = el;
            while (current && current !== document.body) {
                if (window.getComputedStyle(current).display === 'none') return false;
                current = current.parentElement;
            }
        } catch (e) {}
        return true;
    });

    highlights.sort(function(a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        var ta = ra.top + window.scrollY, tb = rb.top + window.scrollY;
        return Math.abs(ta - tb) < 5 ? ra.left - rb.left : ta - tb;
    });

    window.searchNavigation.highlights = highlights;
}

/**
 * Returns the combined height of sticky UI elements above the given target.
 */
function getStickyOffset(target) {
    var offset = 0;
    var tabBar = document.getElementById('app-tab-bar');
    if (tabBar) offset += tabBar.offsetHeight;
    if (!target.closest('.css-title, .note-header .title')) {
        var noteCard = target.closest('.notecard');
        if (noteCard) {
            var noteHeader = noteCard.querySelector('.note-header');
            if (noteHeader) offset += noteHeader.offsetHeight;
        }
    }
    return offset;
}

function navigateToHighlight(index, smooth) {
    var highlights = window.searchNavigation.highlights;
    if (!highlights || index < 0 || index >= highlights.length) return;

    var target = highlights[index];
    if (!target) return;

    document.querySelectorAll('.search-highlight-active, .input-highlight-overlay.search-highlight-active, .tag-highlight.search-highlight-active')
        .forEach(function(h) { h.classList.remove('search-highlight-active'); });
    target.classList.add('search-highlight-active');

    var isMobile = window.innerWidth <= 800;
    var behavior = (smooth === false || isMobile) ? 'auto' : 'smooth';
    var isTagHighlight = target.classList.contains('tag-highlight') ||
        !!target.closest('.clickable-tag-wrapper, .note-tags-row');

    setTimeout(function() {
        try {
            // In split mode, scroll only the inner pane to keep the outer toolbar stable
            var noteEntry = target.closest('.noteentry');
            if (noteEntry && noteEntry.classList.contains('markdown-split-mode')) {
                var pane = target.parentElement;
                while (pane && pane !== noteEntry) {
                    var ps = window.getComputedStyle(pane);
                    if ((ps.overflowY === 'auto' || ps.overflowY === 'scroll') &&
                        pane.scrollHeight > pane.clientHeight) break;
                    pane = pane.parentElement;
                }
                if (pane && pane !== noteEntry) {
                    var paneRect = pane.getBoundingClientRect();
                    var targetRect = target.getBoundingClientRect();
                    var desired = pane.scrollTop + (targetRect.top - paneRect.top) + (isTagHighlight ? 0 : -16);
                    pane.scrollTo({
                        top: Math.max(0, Math.min(desired, pane.scrollHeight - pane.clientHeight)),
                        behavior: behavior
                    });
                    return;
                }
            }

            var stickyOffset = getStickyOffset(target);
            var vpH = window.innerHeight || document.documentElement.clientHeight;

            if (isTagHighlight) {
                // Tags live in the note header — already visible when the note loads.
                // Only scroll if the tag is completely outside the viewport (e.g. user scrolled far away).
                var tagRect = target.getBoundingClientRect();
                var tagVisible = tagRect.top >= 0 && tagRect.bottom <= vpH;
                if (!tagVisible) {
                    target.scrollIntoView({ behavior: behavior, block: 'nearest', inline: 'nearest' });
                }
                // No verification pass needed: we either did nothing or brought it barely into view.
                return;
            }

            // Only scroll if the element is not already visible in the viewport.
            var rect = target.getBoundingClientRect();
            var alreadyVisible = rect.top >= stickyOffset + 12 && rect.bottom <= vpH;
            if (!alreadyVisible) {
                target.style.scrollMarginTop = (stickyOffset + 12) + 'px';
                target.scrollIntoView({
                    behavior: behavior,
                    block: 'start',
                    inline: isMobile ? 'start' : 'nearest'
                });
            }
        } catch (e) {
            try { target.scrollIntoView(behavior === 'smooth'); } catch (_) {}
        }
    }, isMobile ? 250 : 50);

    window.searchNavigation.currentHighlightIndex = index;
}

function navigateToPreviousHighlight() {
    updateHighlightsList();
    var highlights = window.searchNavigation.highlights;
    if (!highlights.length) return;
    var prevIndex = window.searchNavigation.currentHighlightIndex - 1;
    navigateToHighlight(prevIndex >= 0 ? prevIndex : highlights.length - 1, true);
}

function navigateToNextHighlight() {
    updateHighlightsList();
    var highlights = window.searchNavigation.highlights;

    if (!highlights.length) {
        var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
        var term = searchInput ? searchInput.value.trim() : '';
        if (term) {
            highlightSearchTerms();
            updateHighlightsList();
            highlights = window.searchNavigation.highlights;
        }
    }

    if (!highlights.length) { navigateToNextNote(); return; }

    var nextIndex = window.searchNavigation.currentHighlightIndex + 1;
    if (nextIndex < highlights.length) {
        navigateToHighlight(nextIndex, true);
    } else {
        navigateToNextNote();
    }
}

function navigateToNextNote() {
    var allNotes = Array.from(document.querySelectorAll('[data-action="load-note"]'));
    if (!allNotes.length) return;

    // De-duplicate by note ID, preferring visible instances
    var seen = new Map();
    allNotes.forEach(function(el) {
        var id = el.getAttribute('data-note-id');
        if (!id) return;
        var hidden = el.classList.contains('search-hidden') || !!el.closest('.search-hidden') ||
            (el.offsetWidth === 0 && el.offsetHeight === 0);
        if (!seen.has(id) || (!hidden && seen.get(id).hidden)) {
            seen.set(id, { el: el, hidden: hidden });
        }
    });

    var notes = Array.from(seen.values()).filter(function(e) { return !e.hidden; }).map(function(e) { return e.el; });

    // Fallback: use all non-search-hidden notes if no visible ones found
    if (!notes.length) {
        var usedIds = new Set();
        notes = allNotes.filter(function(el) {
            var id = el.getAttribute('data-note-id');
            if (el.classList.contains('search-hidden') || !!el.closest('.search-hidden') || usedIds.has(id)) return false;
            usedIds.add(id);
            return true;
        });
    }

    if (!notes.length) return;

    var currentEl = document.querySelector('.selected-note[data-action="load-note"]');
    var currentId = currentEl ? currentEl.getAttribute('data-note-id') : null;
    var currentIndex = notes.findIndex(function(el) { return el.getAttribute('data-note-id') === currentId; });
    var nextNote = notes[currentIndex + 1] || notes[0];

    if (nextNote) {
        if (window.searchNavigation) {
            window.searchNavigation.currentHighlightIndex = -1;
            window.searchNavigation.pendingAutoScroll = true;
        }
        nextNote.click();
    }
}

function scrollToFirstHighlight() {
    var isMobile = window.innerWidth <= 800;
    setTimeout(function() {
        updateHighlightsList();
        if (window.searchNavigation && window.searchNavigation.highlights.length > 0) {
            window.searchNavigation.pendingAutoScroll = false;
            if (!isMobile) navigateToHighlight(0, true);
        }
    }, isMobile ? 800 : 400);
}
