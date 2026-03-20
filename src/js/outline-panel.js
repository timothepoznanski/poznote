/**
 * Outline Panel
 *
 * Extracts headings from HTML/Markdown notes and displays them
 * in a navigable table of contents sidebar on the right.
 */

let isResizingOutline = false;
let currentNoteId = null;

function isPublicOutlinePage() {
    return !!(window.isPublicNotePage || document.querySelector('.public-note-page .public-note .content'));
}

function getCurrentOutlineNoteElement() {
    if (isPublicOutlinePage()) {
        return document.querySelector('.public-note .content');
    }

    return document.querySelector('.notecard:not([style*="display: none"]) .noteentry');
}

function getOutlineScrollContainer() {
    if (isPublicOutlinePage()) {
        return document.getElementById('publicNoteMain');
    }

    return document.getElementById('right_col');
}

function getOutlineObservationRoot() {
    if (isPublicOutlinePage()) {
        return document.querySelector('.public-note .content');
    }

    return document.getElementById('right_col');
}

function getOutlineInteractionRoot(target) {
    if (isPublicOutlinePage()) {
        return !!target.closest('#publicNoteMain, .public-note');
    }

    return !!target.closest('#right_col');
}

function getMarkdownEditorContent(markdownEditor) {
    if (!markdownEditor) return '';

    if (typeof markdownEditor.value === 'string' && markdownEditor.value !== '') {
        return markdownEditor.value;
    }

    if (typeof window.normalizeContentEditableText === 'function') {
        return window.normalizeContentEditableText(markdownEditor);
    }

    return markdownEditor.textContent || '';
}

function isMarkdownFence(line) {
    return /^\s*```/.test(line);
}

/**
 * Initialize the outline panel
 */
function initOutlinePanel() {
    const outlineResizeHandle = document.getElementById('outlineResizeHandle');
    const outlinePanel = document.getElementById('outline-panel');

    if (!outlineResizeHandle || !outlinePanel) {
        return; // Elements not found
    }

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('outlineWidth');
    if (savedWidth && parseInt(savedWidth) >= 200 && parseInt(savedWidth) <= 500) {
        document.documentElement.style.setProperty('--outline-width', savedWidth + 'px');
        outlinePanel.style.width = savedWidth + 'px';
    }

    // Load saved collapsed state from localStorage
    const isMobile = window.innerWidth <= 800;

    if (isMobile) {
        // On mobile, collapsed by default, can be opened with swipe
        const isOpen = localStorage.getItem('outlineMobileOpen') === 'true';
        if (isOpen) {
            document.body.classList.add('outline-mobile-open');
        }
    } else {
        // On desktop, keep the outline hidden until the user explicitly opens it.
        const storedCollapsed = localStorage.getItem('outlineCollapsed');
        const isCollapsed = storedCollapsed === null ? true : storedCollapsed === 'true';
        if (isCollapsed) {
            document.body.classList.add('outline-collapsed');
        }
    }

    // Initialize toggle button
    initToggleOutline();

    // Initialize resize functionality
    outlineResizeHandle.addEventListener('mousedown', startResizingOutline);
    document.addEventListener('mousemove', handleResizeOutline);
    document.addEventListener('mouseup', stopResizingOutline);

    // Prevent text selection during resize
    outlineResizeHandle.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });

    // Listen for note changes to update outline
    observeNoteChanges();

    // Re-apply translations once loaded
    document.addEventListener('poznote:i18n:loaded', function() {
        if (typeof window.applyI18nToDom === 'function') {
            window.applyI18nToDom(outlinePanel);
        }
        // Force a re-render to ensure the empty state matches the current language
        refreshOutline();
    });
}

/**
 * Start resizing outline panel
 */
function startResizingOutline(e) {
    // Don't start resizing if clicking on the toggle button
    if (e.target.closest('.toggle-outline-btn')) {
        return;
    }

    e.preventDefault();
    isResizingOutline = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

/**
 * Handle outline panel resize
 */
function handleResizeOutline(e) {
    if (!isResizingOutline) return;

    e.preventDefault();
    const outlinePanel = document.getElementById('outline-panel');
    const minWidth = 200;
    const maxWidth = 500;

    // Calculate new width based on distance from right edge
    const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, minWidth), maxWidth);

    // Update CSS variable and element width
    document.documentElement.style.setProperty('--outline-width', newWidth + 'px');
    if (outlinePanel) {
        outlinePanel.style.width = newWidth + 'px';
    }
}

/**
 * Stop resizing outline panel
 */
function stopResizingOutline() {
    if (!isResizingOutline) return;

    isResizingOutline = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save the new width to localStorage
    const outlinePanel = document.getElementById('outline-panel');
    if (outlinePanel) {
        const currentWidth = outlinePanel.offsetWidth;
        localStorage.setItem('outlineWidth', currentWidth);
    }
}

/**
 * Initialize toggle outline button
 */
function initToggleOutline() {
    const toggleBtn = document.getElementById('toggleOutlineBtn');
    const closeButtons = document.querySelectorAll('.outline-close-btn');

    function bindOutlineToggleButton(button) {
        if (!button) return;

        button.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleOutline();
        });

        button.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleOutline();
            }
        });
    }

    bindOutlineToggleButton(toggleBtn);
    closeButtons.forEach(bindOutlineToggleButton);
}

/**
 * Toggle outline panel visibility
 */
function toggleOutline() {
    // Prevent opening outline in Kanban view
    if (window._isKanbanViewActive) {
        return;
    }

    const isMobile = window.innerWidth <= 800;

    if (isMobile) {
        // On mobile, use overlay mode
        const isOpen = document.body.classList.toggle('outline-mobile-open');
        localStorage.setItem('outlineMobileOpen', isOpen);
    } else {
        // On desktop, use collapse mode
        const isCollapsed = document.body.classList.toggle('outline-collapsed');
        localStorage.setItem('outlineCollapsed', isCollapsed);
    }

    // Remove focus from the toggle button after click
    const toggleBtn = document.getElementById('toggleOutlineBtn');
    if (toggleBtn) {
        toggleBtn.blur();
    }
}

/**
 * Extract headings from a note element
 */
function extractHeadings(noteElement) {
    if (!noteElement) return [];

    const headings = [];

    // Check if this is a markdown note
    const markdownEditor = noteElement.querySelector('.markdown-editor');
    const markdownPreview = noteElement.querySelector('.markdown-preview');
    const isSplitMode = noteElement.classList.contains('markdown-split-mode');

    // For markdown notes, always extract from source (works for all modes)
    if (markdownEditor) {
        const markdownContent = getMarkdownEditorContent(markdownEditor);
        if (markdownContent) {
            const lines = markdownContent.split('\n');
            let inCodeBlock = false;

            lines.forEach((line, lineIndex) => {
                if (isMarkdownFence(line)) {
                    inCodeBlock = !inCodeBlock;
                    return;
                }

                if (inCodeBlock) {
                    return;
                }

                // Match markdown headings: # Title, ## Title, etc.
                const match = line.match(/^(#{1,6})\s+(.+)$/);
                if (match) {
                    const level = match[1].length;
                    const rawText = match[2].trim();
                    // Strip inline markdown formatting for display in the outline panel
                    const text = rawText
                        .replace(/\*\*(.+?)\*\*/g, '$1')          // bold **text**
                        .replace(/__(.+?)__/g, '$1')               // bold __text__
                        .replace(/\*(.+?)\*/g, '$1')               // italic *text*
                        .replace(/_(.+?)_/g, '$1')                 // italic _text_
                        .replace(/~~(.+?)~~/g, '$1')               // strikethrough ~~text~~
                        .replace(/`(.+?)`/g, '$1')                 // inline code `text`
                        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links [text](url)
                    const id = `md-heading-${lineIndex}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

                    // Find corresponding element in preview if available
                    let previewElement = null;
                    if (markdownPreview) {
                        const previewHeadings = markdownPreview.querySelectorAll('h1, h2, h3, h4, h5, h6');
                        // Try to find matching heading by text content
                        for (const h of previewHeadings) {
                            if (h.textContent.trim() === text) {
                                previewElement = h;
                                if (!h.id) h.id = id;
                                break;
                            }
                        }
                    }

                    headings.push({
                        id: id,
                        level: level,
                        text: text,
                        element: previewElement,
                        lineNumber: lineIndex,
                        isMarkdownSource: true,
                        isSplitMode: isSplitMode,
                        hasPreview: markdownPreview && markdownPreview.offsetParent !== null
                    });
                }
            });
            return headings;
        }
    }

    // Default: extract from HTML headings (regular HTML notes)
    const headingElements = noteElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headingElements.forEach((heading, index) => {
        const level = parseInt(heading.tagName.substring(1)); // h1 -> 1, h2 -> 2, etc.
        const text = heading.textContent.trim();

        if (text) {
            // Add an ID to the heading if it doesn't have one (for navigation)
            if (!heading.id) {
                heading.id = `heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            }

            headings.push({
                id: heading.id,
                level: level,
                text: text,
                element: heading
            });
        }
    });

    return headings;
}

/**
 * Render the outline navigation
 */
function renderOutline(headings) {
    const outlineNav = document.getElementById('outline-nav');
    if (!outlineNav) return;

    // Clear existing outline
    outlineNav.innerHTML = '';

    if (!headings || headings.length === 0) {
        // Show empty state
        const noHeadingsText = typeof window.t === 'function' ? window.t('common.outline.no_headings', null, 'No headings in this note') : 'No headings in this note';
        outlineNav.innerHTML = `
            <div class="outline-empty">
                <div class="outline-empty-icon">📄</div>
                <p class="outline-empty-text">${noHeadingsText}</p>
            </div>
        `;
        return;
    }

    // Create navigation items
    headings.forEach(heading => {
        const li = document.createElement('li');
        li.className = 'outline-nav-item';

        const link = document.createElement('a');
        link.className = 'outline-nav-link';
        link.setAttribute('data-level', heading.level);
        link.setAttribute('data-heading-id', heading.id);
        link.textContent = heading.text;
        link.href = '#' + heading.id;
        link.title = heading.text;

        // Handle click to scroll to heading
        link.addEventListener('click', function(e) {
            e.preventDefault();
            scrollToHeading(heading);

            // Update active state
            document.querySelectorAll('.outline-nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // On mobile, close the outline panel after selection
            const isMobile = window.innerWidth <= 800;
            if (isMobile && document.body.classList.contains('outline-mobile-open')) {
                // Delay closing slightly to allow scroll animation to start
                setTimeout(function() {
                    toggleOutline();
                }, 200);
            }
        });

        li.appendChild(link);
        outlineNav.appendChild(li);
    });
}

/**
 * Scroll to a heading in the note
 */
function scrollToHeading(heading) {
    const visibleNote = getCurrentOutlineNoteElement();
    if (!visibleNote) return;

    if (isPublicOutlinePage()) {
        const headingElement = heading.element || document.getElementById(heading.id);
        if (headingElement) {
            scrollToElement(headingElement);
        }
        return;
    }

    // Handle markdown notes
    if (heading.isMarkdownSource && heading.lineNumber !== undefined) {
        const markdownEditor = visibleNote.querySelector('.markdown-editor');
        const markdownPreview = visibleNote.querySelector('.markdown-preview');

        // Split mode: scroll both editor and preview
        if (heading.isSplitMode) {
            // Scroll editor to line
            if (markdownEditor && markdownEditor.offsetParent !== null) {
                const lines = getMarkdownEditorContent(markdownEditor).split('\n');
                const lineHeight = parseFloat(getComputedStyle(markdownEditor).lineHeight) || 20;
                const targetPosition = heading.lineNumber * lineHeight;

                markdownEditor.scrollTop = Math.max(0, targetPosition - 100);

                // Set cursor position
                if (markdownEditor.setSelectionRange) {
                    const textBeforeHeading = lines.slice(0, heading.lineNumber).join('\n');
                    const cursorPosition = textBeforeHeading.length + (heading.lineNumber > 0 ? 1 : 0);
                    markdownEditor.focus();
                    markdownEditor.setSelectionRange(cursorPosition, cursorPosition);
                }
            }

            // Scroll preview to heading element
            if (heading.element && markdownPreview && markdownPreview.offsetParent !== null) {
                const previewRect = markdownPreview.getBoundingClientRect();
                const headingRect = heading.element.getBoundingClientRect();
                const scrollTop = markdownPreview.scrollTop;
                const offset = headingRect.top - previewRect.top + scrollTop - 20;

                markdownPreview.scrollTop = Math.max(0, offset);

                // Highlight the heading in preview
                heading.element.style.transition = 'background-color 0.3s ease';
                heading.element.style.backgroundColor = 'rgba(0, 125, 184, 0.1)';
                setTimeout(() => {
                    heading.element.style.backgroundColor = '';
                }, 1000);
            }
            return;
        }

        // Edit mode only (no preview visible)
        if (markdownEditor && (!markdownPreview || markdownPreview.offsetParent === null)) {
            const lines = getMarkdownEditorContent(markdownEditor).split('\n');
            const lineHeight = parseFloat(getComputedStyle(markdownEditor).lineHeight) || 20;
            const targetLinePosition = heading.lineNumber * lineHeight;

            // In edit mode, the main container (right_col) scrolls, not the editor itself
            const scrollContainer = getOutlineScrollContainer();

            if (scrollContainer) {
                // Calculate the editor's position in the container
                const containerRect = scrollContainer.getBoundingClientRect();
                const editorRect = markdownEditor.getBoundingClientRect();
                const editorOffsetInContainer = editorRect.top - containerRect.top + scrollContainer.scrollTop;

                // Target position = editor position + line position - padding
                const targetScrollPosition = editorOffsetInContainer + targetLinePosition - 100;

                scrollContainer.scrollTo({
                    top: Math.max(0, targetScrollPosition),
                    behavior: 'smooth'
                });
            }

            // Set cursor position
            if (markdownEditor.setSelectionRange) {
                const textBeforeHeading = lines.slice(0, heading.lineNumber).join('\n');
                const cursorPosition = textBeforeHeading.length + (heading.lineNumber > 0 ? 1 : 0);
                markdownEditor.focus();
                markdownEditor.setSelectionRange(cursorPosition, cursorPosition);
            }
            return;
        }

        // Preview mode only
        if (markdownPreview && markdownPreview.offsetParent !== null) {
            // Try to find the heading element in preview if not already set
            if (!heading.element) {
                const previewHeadings = markdownPreview.querySelectorAll('h1, h2, h3, h4, h5, h6');
                for (const h of previewHeadings) {
                    if (h.textContent.trim() === heading.text) {
                        heading.element = h;
                        if (!h.id) h.id = heading.id;
                        break;
                    }
                }
            }

            if (heading.element) {
                scrollToElement(heading.element);
                return;
            }
        }
    }

    // Handle preview mode or HTML notes (scroll to element)
    const headingElement = heading.element || document.getElementById(heading.id);
    if (headingElement) {
        scrollToElement(headingElement);
    }
}

/**
 * Scroll to a specific element with highlighting
 */
function scrollToElement(element) {
    if (!element) return;

    // Find the scroll container (right_col)
    const scrollContainer = getOutlineScrollContainer();
    if (!scrollContainer) {
        // Fallback to element scroll
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Calculate position relative to scroll container
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const offset = elementRect.top - containerRect.top + scrollTop - 100; // 100px padding to avoid toolbar

    // Smooth scroll
    scrollContainer.scrollTo({
        top: offset,
        behavior: 'smooth'
    });

    // Briefly highlight the element
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(0, 125, 184, 0.1)';
    setTimeout(() => {
        element.style.backgroundColor = '';
    }, 1000);
}

/**
 * Update outline for currently active note
 */
function updateOutlineForCurrentNote(forceUpdate = false) {
    // Find the currently visible note
    const visibleNote = getCurrentOutlineNoteElement();

    if (!visibleNote) {
        renderOutline([]);
        return;
    }

    // Extract note ID from the element
    const noteId = isPublicOutlinePage() ? 'public-note' : visibleNote.id.replace('entry', '');

    // Only update if note has changed, unless forced
    if (!forceUpdate && currentNoteId === noteId) {
        return;
    }

    currentNoteId = noteId;

    // Extract headings
    const headings = extractHeadings(visibleNote);

    // Render outline
    renderOutline(headings);
}

/**
 * Observe note changes in the DOM
 */
function observeNoteChanges() {
    const observationRoot = getOutlineObservationRoot();
    if (!observationRoot) return;

    // Initial update
    updateOutlineForCurrentNote();

    // Watch for changes to note content
    const observer = new MutationObserver(function(mutations) {
        // Skip outline update when all mutations come from search highlighting.
        // Search adds/removes <span class="search-highlight"> wrappers and text
        // nodes around them.  Re-rendering the outline during this window can
        // interfere with the smooth-scroll animation that positions the active
        // search result in the viewport.
        var onlySearch = mutations.every(function (m) {
            if (m.type === 'characterData') return true; // text-node splits
            if (m.type !== 'childList') return false;
            var nodes = [];
            for (var i = 0; i < m.addedNodes.length; i++) nodes.push(m.addedNodes[i]);
            for (var i = 0; i < m.removedNodes.length; i++) nodes.push(m.removedNodes[i]);
            return nodes.every(function (n) {
                if (n.nodeType === 3) return true; // text node
                if (n.nodeType === 1) {
                    var cl = n.classList;
                    return cl && (cl.contains('search-highlight') ||
                                  cl.contains('tag-highlight') ||
                                  cl.contains('input-highlight-overlay'));
                }
                return false;
            });
        });
        if (onlySearch) return;

        // Debounce the update
        clearTimeout(window.outlineUpdateTimeout);
        window.outlineUpdateTimeout = setTimeout(() => {
            updateOutlineForCurrentNote(true); // Force update if DOM changes
        }, 300);
    });

    // Observe changes to the right column
    observer.observe(observationRoot, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Handle input events for real-time updates while typing
    const handleOutlineInput = function(e) {
        // Only trigger if typing in a note entry or markdown editor
        if (e.target.closest('.noteentry') || e.target.closest('.markdown-editor')) {
            clearTimeout(window.outlineUpdateTimeout);
            window.outlineUpdateTimeout = setTimeout(() => {
                updateOutlineForCurrentNote(true); // Force update while typing
            }, 600); // Slightly longer debounce for typing to be less intrusive
        }
    };

    document.addEventListener('input', handleOutlineInput);

    // Also listen for custom events if notes are loaded dynamically
    if (!isPublicOutlinePage()) {
        document.addEventListener('noteLoaded', function() {
            updateOutlineForCurrentNote();
        });

        // Listen for note visibility changes
        document.addEventListener('noteVisibilityChanged', function() {
            updateOutlineForCurrentNote();
        });
    }

    // Add touch/swipe support for mobile
    initTouchSupport();

    // Add backdrop click handler for mobile
    const backdrop = document.getElementById('outlineMobileBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            if (document.body.classList.contains('outline-mobile-open')) {
                toggleOutline();
            }
        });
    }
}

/**
 * Manually trigger outline update (can be called from other scripts)
 */
function refreshOutline() {
    currentNoteId = null; // Force refresh
    updateOutlineForCurrentNote();
}

/**
 * Initialize touch/swipe support for mobile
 */
function initTouchSupport() {
    // Disable touch/swipe for outline in Kanban view
    if (window._isKanbanViewActive) {
        return;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;

    const minSwipeDistance = 80; // Minimum distance for a swipe (increased to avoid accidental triggers)
    const maxVerticalDistance = 100; // Max vertical movement allowed for horizontal swipe

    function isHorizontallyScrollableCodeBlock(target) {
        const codeBlock = target.closest('pre, .code-block');
        if (!codeBlock) {
            return false;
        }

        return codeBlock.scrollWidth > codeBlock.clientWidth;
    }

    // Swipe from anywhere on the note content area to open outline
    document.addEventListener('touchstart', function(e) {
        // Don't track swipes that start on the outline panel itself
        if (e.target.closest('#outline-panel')) {
            return;
        }

        // Only enable swipe on the note content area.
        if (!getOutlineInteractionRoot(e.target)) {
            return;
        }

        // Let horizontally scrollable code blocks handle touch gestures on mobile.
        if (isHorizontallyScrollableCodeBlock(e.target)) {
            return;
        }

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = true;
    }, { passive: true });

    document.addEventListener('touchmove', function(_e) {
        if (!isSwiping) return;
        // Track movement but don't prevent default to keep scroll working
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!isSwiping) {
            return;
        }

        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;

        const horizontalDistance = touchStartX - touchEndX;
        const verticalDistance = Math.abs(touchStartY - touchEndY);

        // Swipe left from right edge (open outline)
        if (horizontalDistance > minSwipeDistance &&
            verticalDistance < maxVerticalDistance &&
            !document.body.classList.contains('outline-mobile-open')) {
            toggleOutline();
        }

        isSwiping = false;
    }, { passive: true });

    // Swipe right on outline panel to close it
    const outlinePanel = document.getElementById('outline-panel');
    if (outlinePanel) {
        let panelTouchStartX = 0;
        let panelTouchStartY = 0;

        outlinePanel.addEventListener('touchstart', function(e) {
            panelTouchStartX = e.touches[0].clientX;
            panelTouchStartY = e.touches[0].clientY;
        }, { passive: true });

        outlinePanel.addEventListener('touchend', function(e) {
            const panelTouchEndX = e.changedTouches[0].clientX;
            const panelTouchEndY = e.changedTouches[0].clientY;

            const horizontalDistance = panelTouchEndX - panelTouchStartX;
            const verticalDistance = Math.abs(panelTouchEndY - panelTouchStartY);

            // Swipe right to close
            if (horizontalDistance > minSwipeDistance &&
                verticalDistance < maxVerticalDistance &&
                document.body.classList.contains('outline-mobile-open')) {
                toggleOutline();
            }
        }, { passive: true });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initOutlinePanel();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    initOutlinePanel();
}

// Expose functions globally for external access
window.outlinePanel = {
    init: initOutlinePanel,
    refresh: refreshOutline,
    toggle: toggleOutline,
    isCollapsed: function() {
        const isMobile = window.innerWidth <= 800;
        if (isMobile) {
            return !document.body.classList.contains('outline-mobile-open');
        } else {
            return document.body.classList.contains('outline-collapsed');
        }
    },
    extractHeadings: extractHeadings,
    renderOutline: renderOutline
};
