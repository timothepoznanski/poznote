// Markdown view modes for Poznote.
//
// Rendering a note's preview, initialising a markdown note, and switching a
// note between edit, preview and split mode.

function renderMarkdownPreview(previewDiv, markdownContent, noteId, options) {
    options = options || {};
    var placeholder = options.placeholder || (window.t ? window.t('editor.messages.preview_mode_hint', null, 'You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.') : 'You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.');
    var postProcess = options.postProcess !== false;
    var delay = options.delay || 100;

    if (markdownContent.trim() === '') {
        previewDiv.innerHTML = '<div class="markdown-preview-placeholder">' + placeholder + '</div>';
        previewDiv.classList.add('empty');
    } else {
        previewDiv.innerHTML = parseMarkdown(markdownContent);
        prioritizeInitialMarkdownPreviewImages(previewDiv);
        previewDiv.classList.remove('empty');
        if (typeof window.initializeTaskListEmbeds === 'function') {
            window.initializeTaskListEmbeds(previewDiv);
        }
        if (postProcess && noteId) {
            setTimeout(function () {
                initMermaid();
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(previewDiv);
                }
                if (typeof applySyntaxHighlighting === 'function') {
                    applySyntaxHighlighting(previewDiv);
                }
                setupPreviewInteractivity(noteId);
            }, delay);
        }
    }
}

function prioritizeInitialMarkdownPreviewImages(previewDiv) {
    if (!previewDiv || !previewDiv.querySelectorAll) return;

    var images = previewDiv.querySelectorAll('img');
    for (var i = 0; i < images.length; i++) {
        var img = images[i];
        img.setAttribute('decoding', 'async');

        if (i < 3) {
            img.setAttribute('loading', 'eager');
            if (i === 0) {
                img.setAttribute('fetchpriority', 'high');
            }
        } else if (!img.hasAttribute('loading')) {
            img.setAttribute('loading', 'lazy');
        }
    }
}

/**
 * Initialize markdown note functionality
 */
function initializeMarkdownNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') {
        return;
    }

    // Check for corrupted content (both editor and preview elements present)
    var existingEditor = noteEntry.querySelector('.markdown-editor');
    var existingPreview = noteEntry.querySelector('.markdown-preview');

    // Also check for escaped HTML content that contains editor/preview elements
    var htmlContent = noteEntry.innerHTML;
    var hasEscapedEditor = htmlContent.includes('&lt;div class="markdown-editor"');
    var hasEscapedPreview = htmlContent.includes('&lt;div class="markdown-preview"');

    // Declare markdownContent variable once
    var markdownContent = '';

    // Only treat as corrupted if we have ESCAPED HTML (not real elements)
    if (hasEscapedEditor && hasEscapedPreview) {
        // Create a temporary element to safely decode the escaped HTML
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // The browser's innerHTML parsing of escaped HTML will put the escaped string as text content
        var decodedHtml = tempDiv.textContent || tempDiv.innerText || '';

        // Now decodedHtml is something like '<div class="markdown-editor">...</div>'
        // We can parse THIS as HTML to extract the content correctly
        tempDiv.innerHTML = decodedHtml;
        var recreatedEditor = tempDiv.querySelector('.markdown-editor');

        if (recreatedEditor) {
            // Use our robust normalization function which preserves line breaks
            markdownContent = normalizeContentEditableText(recreatedEditor);
        } else {
            // Fallback: if we couldn't find the editor div, just use textContent
            markdownContent = tempDiv.textContent || '';
        }

        // Clear the corrupted HTML and restore clean content
        destroyMarkdownCodeMirrorEditorsWithin(noteEntry);
        noteEntry.innerHTML = '';
        noteEntry.textContent = markdownContent;

        // Update the data attribute with clean content
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    } else if (existingEditor && existingPreview) {

        // Real markdown elements exist - extract content and re-initialize

        // Extract the markdown content from the existing editor
        markdownContent = normalizeContentEditableText(existingEditor);

        // Store in data attribute
        noteEntry.setAttribute('data-markdown-content', markdownContent);

        // Clear existing elements to re-initialize cleanly (content was
        // extracted above, so the live editor can be destroyed now)
        destroyMarkdownCodeMirrorEditorsWithin(noteEntry);
        noteEntry.innerHTML = '';
        noteEntry.textContent = markdownContent;
    } else {
        // No existing elements - get content from data attribute or text
        markdownContent = noteEntry.getAttribute('data-markdown-content') || noteEntry.textContent || '';
    }

    // Store the original markdown in a data attribute
    if (!noteEntry.getAttribute('data-markdown-content')) {
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    }

    // Try to restore saved view mode (global for all notes)
    var savedMode = null;
    try {
        savedMode = localStorage.getItem('poznote-markdown-view-mode');
    } catch (e) {
        console.warn('Could not read view mode from localStorage:', e);
    }

    // Determine initial mode: edit or preview
    var isEmpty = markdownContent.trim() === '';
    var startInEditMode;
    var startInSplitMode = false;
    var forceSplitForNewMarkdown = false;
    var isSearchContext = false;

    try {
        var params = new URLSearchParams(window.location.search || '');
        forceSplitForNewMarkdown = params.get('md_split') === '1';
        isSearchContext = (params.get('search') && params.get('search').trim() !== '') ||
                         (params.get('tags_search') && params.get('tags_search').trim() !== '');

        // Clean up the URL parameter after reading it
        if (forceSplitForNewMarkdown) {
            params.delete('md_split');
            var newUrl = window.location.pathname + '?' + params.toString();
            window.history.replaceState({}, '', newUrl);
        }
    } catch (e) {
        forceSplitForNewMarkdown = false;
    }

    // Check if we're in mobile viewport
    var isMobileViewportCheck = false;
    try {
        isMobileViewportCheck = (window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    } catch (e) {
        isMobileViewportCheck = false;
    }

    // Default behavior for new notes:
    // - Desktop: split mode (edit + preview side by side)
    // - Mobile: edit mode only
    // IMPORTANT: Never use split mode on mobile
    // IMPORTANT: Never use split mode when displaying search results (preview only)
    if (isSearchContext) {
        // In search context: always show preview only, never split
        startInSplitMode = false;
        startInEditMode = false;
    } else if (isEmpty && !isMobileViewportCheck) {
        // New notes on desktop: start in split mode
        startInSplitMode = true;
        startInEditMode = false;
    } else if (isEmpty) {
        // New notes on mobile: start in edit mode
        startInEditMode = true;
    } else if (savedMode && savedMode === 'split' && !isMobileViewportCheck) {
        startInSplitMode = true;
        startInEditMode = false;
    } else if (savedMode && (savedMode === 'edit' || savedMode === 'preview')) {
        startInEditMode = (savedMode === 'edit');
    } else {
        // Default: preview mode if content exists
        startInEditMode = false;
    }

    // Create preview and editor containers
    var previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    // Render the preview now only if it will be visible. In edit-only mode it
    // stays hidden and switchToPreviewMode/switchToSplitMode re-render it from
    // the live editor content when the user switches view.
    if (!startInEditMode || startInSplitMode) {
        renderMarkdownPreview(previewDiv, markdownContent, noteId, { postProcess: false });
    }

    // Create container for editor
    var editorContainer = document.createElement('div');
    editorContainer.className = 'markdown-editor-container';

    var editorDiv = document.createElement('div');
    editorDiv.className = 'markdown-editor';
    // No content is rendered here: initializeCodeMirrorMarkdownEditor below
    // creates the CodeMirror document directly (and falls back to
    // renderMarkdownEditorContent itself if CodeMirror is unavailable).
    var isMobileViewport = false;
    try {
        isMobileViewport = (window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    } catch (e) {
        isMobileViewport = false;
    }
    const mobilePlaceholder = window.t ? window.t('editor.markdown_placeholder_mobile', null, 'Write your markdown or paste images here...') : 'Write your markdown or paste images here...';
    const desktopPlaceholder = window.t ? window.t('editor.markdown_placeholder', null, 'Write your markdown, use / for command menu, paste images or drop an image at cursor.') : 'Write your markdown, use / for command menu, paste images or drop an image at cursor.';
    editorDiv.setAttribute('data-ph', isMobileViewport ? mobilePlaceholder : desktopPlaceholder);

    // Update placeholder when translations load
    document.addEventListener('poznote:i18n:loaded', function () {
        const mobilePh = window.t('editor.markdown_placeholder_mobile', null, 'Write your markdown or paste images here...');
        const desktopPh = window.t('editor.markdown_placeholder', null, 'Write your markdown, use / for command menu, paste images or drop an image at cursor.');
        editorDiv.setAttribute('data-ph', isMobileViewport ? mobilePh : desktopPh);

        var liveContent = normalizeContentEditableText(editorDiv);
        if (liveContent.trim() === '') {
            var placeholderText;
            if (noteEntry.classList.contains('markdown-split-mode')) {
                placeholderText = window.t('editor.messages.split_preview_placeholder', null, 'Preview will appear here as you type...');
            } else {
                placeholderText = window.t('editor.messages.preview_mode_hint', null, 'You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.');
            }

            renderMarkdownPreview(previewDiv, liveContent, noteId, {
                postProcess: false,
                placeholder: placeholderText
            });
        }
    });

    editorContainer.appendChild(editorDiv);

    // Ensure proper line break handling in contentEditable
    editorDiv.style.whiteSpace = 'pre-wrap';

    // Handle paste to ensure plain text only for the legacy contenteditable editor.
    editorDiv.addEventListener('paste', function (e) {
        if (isCodeMirrorMarkdownEditor(editorDiv)) {
            return;
        }

        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text/plain');

        // Normalize line endings
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        document.execCommand('insertText', false, text);
    });

    // Set initial display states using setProperty to override any CSS !important rules
    if (startInSplitMode) {
        // Split mode: show both editor and preview side by side
        noteEntry.classList.add('markdown-split-mode');
        editorContainer.style.setProperty('display', 'flex', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
        setMarkdownEditorEditable(editorDiv, true);
    } else if (startInEditMode) {
        // Edit mode: show editor, hide preview
        editorContainer.style.setProperty('display', 'flex', 'important');
        previewDiv.style.setProperty('display', 'none', 'important');
        setMarkdownEditorEditable(editorDiv, true);
    } else {
        // Preview mode: show preview, hide editor
        editorContainer.style.setProperty('display', 'none', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
        setMarkdownEditorEditable(editorDiv, false);
    }

    // Replace note content with preview and editor
    destroyMarkdownCodeMirrorEditorsWithin(noteEntry);
    noteEntry.innerHTML = '';
    noteEntry.appendChild(editorContainer);
    noteEntry.appendChild(previewDiv);
    noteEntry.contentEditable = false;

    initializeCodeMirrorMarkdownEditor(
        editorDiv,
        markdownContent,
        !(startInSplitMode || startInEditMode) || isMarkdownEntryReadOnly(noteEntry)
    );

    // Re-apply editable state after CM init, using the known mode rather than
    // getComputedStyle (which is unreliable on a not-yet-live-DOM element).
    setMarkdownEditorEditable(editorDiv, (startInSplitMode || startInEditMode) && !isMarkdownEntryReadOnly(noteEntry));

    if (typeof window.highlightSearchTerms === 'function') {
        setTimeout(function () {
            try {
                window.highlightSearchTerms(true);
            } catch (e) {}
        }, 0);
    }

    // Initialize Mermaid diagrams and Math equations if in preview mode or split mode
    if ((!startInEditMode || startInSplitMode) && !isEmpty) {
        setTimeout(function () {
            initMermaid();
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(previewDiv);
            }
            // Apply syntax highlighting to code blocks
            if (typeof applySyntaxHighlighting === 'function') {
                applySyntaxHighlighting(previewDiv);
            }
            // Setup checkbox and click-to-navigate handlers
            setupPreviewInteractivity(noteId);
        }, 100);
    }

    var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
    if (toolbar) {
        // Check if view mode toggle button already exists, if not create it
        var existingViewModeBtn = toolbar.querySelector('.markdown-view-mode-btn');
        if (!existingViewModeBtn) {
            // Create unified view mode toggle button that cycles through: Edit -> Preview
            var viewModeBtn = document.createElement('button');
            viewModeBtn.type = 'button';
            viewModeBtn.className = 'toolbar-btn markdown-view-mode-btn note-action-btn';

            // Determine current view mode and set icon/title
            var currentMode;
            if (startInSplitMode) {
                currentMode = 'split';
                viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                viewModeBtn.style.display = 'none'; // Hide in split mode
            } else if (startInEditMode) {
                currentMode = 'edit';
                viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
            } else {
                currentMode = 'preview';
                viewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
            }

            viewModeBtn.setAttribute('data-current-mode', currentMode);

            viewModeBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleMarkdownMode(noteId);
            };

            toolbar.insertBefore(viewModeBtn, toolbar.firstChild);

            // Create markdown help button

            // Create split view button (only on desktop, not on mobile)
            if (!isMobileViewport) {
                var splitBtn = document.createElement('button');
                splitBtn.type = 'button';
                splitBtn.className = 'toolbar-btn markdown-split-btn note-action-btn';
                splitBtn.innerHTML = '<i class="lucide lucide-columns-2"></i>';
                splitBtn.title = window.t('editor.toolbar.split_view', null, 'Toggle split view');
                splitBtn.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    var noteEntry = document.getElementById('entry' + noteId);
                    if (noteEntry && noteEntry.classList.contains('markdown-split-mode')) {
                        exitSplitMode(noteId);
                        splitBtn.classList.remove('active');
                    } else {
                        switchToSplitMode(noteId);
                        splitBtn.classList.add('active');
                    }
                };

                // Set initial state based on split mode
                if (startInSplitMode) {
                    splitBtn.classList.add('active');
                }

                // Insert split button before favorite button (star)
                var favoriteBtn = toolbar.querySelector('.btn-favorite');
                if (favoriteBtn) {
                    toolbar.insertBefore(splitBtn, favoriteBtn);
                } else {
                    toolbar.appendChild(splitBtn);
                }
            }
        } else {
            // Update existing button based on current state
            var currentMode;
            if (startInSplitMode) {
                currentMode = 'split';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = 'none'; // Hide in split mode
            } else if (startInEditMode) {
                currentMode = 'edit';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = '';
            } else {
                currentMode = 'preview';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = '';
            }
            existingViewModeBtn.setAttribute('data-current-mode', currentMode);
        }
    }

    // Setup live preview update if starting in split mode
    if (startInSplitMode) {
        setupSplitModePreviewUpdate(noteId);
        scheduleMarkdownSplitPaneHeightUpdate(noteEntry);
        setTimeout(function () {
            updateMarkdownSplitPaneHeight(noteEntry);
        }, 100);
    }

    // Setup event listeners for the editor
    setupMarkdownEditorListeners(noteId);

    // Set the global noteid
    noteid = noteId;
    window.noteid = noteId;

    // Restore scroll position for this tab now that markdown DOM is ready
    if (window.tabManager && typeof window.tabManager._restoreScrollForNote === 'function') {
        window.tabManager._restoreScrollForNote(String(noteId));
    }
}

function switchToEditMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');

    if (!previewDiv || !editorDiv) return;

    // Save scroll position of the container before layout changes
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    // Switch to edit mode - use setProperty to override !important rules
    previewDiv.style.setProperty('display', 'none', 'important');
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'block', 'important');
    } else {
        editorDiv.style.setProperty('display', 'block', 'important');
    }
    setMarkdownEditorEditable(editorDiv, true);
    noteEntry.setAttribute('contenteditable', 'false');

    // Determine scroll ratio based on source mode
    // If preview was scrollable (Split Mode), use its internal scroll
    // If preview was expanded (Preview Mode), use page scroll
    var scrollRatio = 0;
    var previewIsScrollable = previewDiv.scrollHeight > previewDiv.clientHeight &&
        window.getComputedStyle(previewDiv).overflowY !== 'visible';

    if (previewIsScrollable) {
        var pHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
        scrollRatio = pHeight > 0 ? previewDiv.scrollTop / pHeight : 0;
    } else {
        var cHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
        scrollRatio = cHeight > 0 ? savedScrollTop / cHeight : 0;
    }

    // Restore scroll position in editor using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                // In normal Edit Mode, editor expands and main container scrolls
                if (scrollContainer) {
                    var containerScrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                    if (containerScrollHeight > 0) {
                        scrollContainer.scrollTop = scrollRatio * containerScrollHeight;
                    }
                }

                // If editor happens to be scrollable internally (e.g. still in split mode or minimal height)
                var editorScrollHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
                if (editorScrollHeight > 0) {
                    editorDiv.scrollTop = scrollRatio * editorScrollHeight;
                }
            }, 50);
        });
    });

    // Show preview button, hide edit button (legacy support)
    if (editBtn) editBtn.style.display = 'none';
    if (previewBtn) previewBtn.style.display = '';

    // Update view mode button
    updateViewModeButton(noteId, 'edit');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'edit');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }

    // Refresh outline panel if available
    if (window.outlinePanel && window.outlinePanel.refresh) {
        setTimeout(function() {
            window.outlinePanel.refresh();
        }, 100);
    }
}

function switchToPreviewMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    // Read previous content BEFORE we overwrite the attribute below
    var previousContent = noteEntry.getAttribute('data-markdown-content') || '';

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');

    if (!previewDiv || !editorDiv) return;

    // Save scroll position of the container before layout changes
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;



    // Switch to preview mode
    // Use helper function to properly normalize content
    var markdownContent = normalizeContentEditableText(editorDiv);

    renderMarkdownPreview(previewDiv, markdownContent, noteId);

    noteEntry.setAttribute('data-markdown-content', markdownContent);

    // Use setProperty to override !important rules
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'none', 'important');
    } else {
        editorDiv.style.setProperty('display', 'none', 'important');
    }
    previewDiv.style.setProperty('display', 'block', 'important');
    setMarkdownEditorEditable(editorDiv, false);
    noteEntry.setAttribute('contenteditable', 'false');

    // Determine scroll ratio based on source mode
    // If editor was scrollable (Split Mode), use its internal scroll
    // If editor was expanded (Edit Mode), use page scroll
    var scrollRatio = 0;
    var editorIsScrollable = editorDiv.scrollHeight > editorDiv.clientHeight &&
        window.getComputedStyle(editorDiv).overflowY !== 'visible';

    if (editorIsScrollable) {
        var eHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
        scrollRatio = eHeight > 0 ? editorDiv.scrollTop / eHeight : 0;
    } else {
        var cHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
        scrollRatio = cHeight > 0 ? savedScrollTop / cHeight : 0;
    }

    // Restore scroll position in preview using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                // In Normal Preview Mode, preview expands and main container scrolls
                if (scrollContainer) {
                    var containerScrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                    if (containerScrollHeight > 0) {
                        scrollContainer.scrollTop = scrollRatio * containerScrollHeight;
                    }
                }

                // If preview happens to be scrollable internally
                var previewScrollHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
                if (previewScrollHeight > 0) {
                    previewDiv.scrollTop = scrollRatio * previewScrollHeight;
                }
            }, 50);
        });
    });

    // Show edit button, hide preview button (legacy support)
    if (editBtn) editBtn.style.display = '';
    if (previewBtn) previewBtn.style.display = 'none';

    // Update view mode button
    updateViewModeButton(noteId, 'preview');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'preview');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }

    // Only mark as edited and trigger save if content has changed
    if (previousContent !== markdownContent) {
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }

    // Refresh outline panel if available
    if (window.outlinePanel && window.outlinePanel.refresh) {
        setTimeout(function() {
            window.outlinePanel.refresh();
        }, 100);
    }
}

function toggleMarkdownMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');

    if (!previewDiv || !editorDiv) return;

    // Check which element is visible: editor container or preview
    var elementToCheck = editorContainer || editorDiv;
    var isPreviewMode = window.getComputedStyle(elementToCheck).display === 'none';

    if (isPreviewMode) {
        switchToEditMode(noteId);
    } else {
        switchToPreviewMode(noteId);
    }
}

// Override the global getMarkdownContent to be accessible
function getMarkdownContentForNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') return null;

    // Check if we're in edit mode or preview mode
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv && isMarkdownEditorDisplayed(noteEntry, editorDiv)) {
        // In edit mode, get content from editor
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }

    // In preview mode, get from data attribute
    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Listen to input events in markdown editor to mark note as edited
function setupMarkdownEditorListeners(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (!editorDiv) return;

    // Set noteid on focus (like normal notes)
    editorDiv.addEventListener('focus', function () {
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        // Also set it globally for compatibility
        window.noteid = noteId;
    });

    editorDiv.addEventListener('keydown', function (e) {
        if (isCodeMirrorMarkdownEditor(editorDiv)) { return; }

        if (handleMarkdownOrderedListTab(e, editorDiv, noteEntry, noteId)) {
            return;
        }

        if (handleMarkdownTableEnter(e, editorDiv, noteEntry, noteId)) {
            return;
        }

        handleMarkdownOrderedListEnter(e, editorDiv, noteEntry, noteId);
    });

    // Mirroring the whole document into data-markdown-content on every
    // keystroke is expensive on long notes (full serialization + huge DOM
    // attribute write), so the mirror is refreshed on a short debounce and
    // flushed when the editor loses focus.
    var contentSyncTimer = null;
    function syncMarkdownContentAttribute() {
        if (contentSyncTimer !== null) {
            clearTimeout(contentSyncTimer);
            contentSyncTimer = null;
        }
        noteEntry.setAttribute('data-markdown-content', normalizeContentEditableText(editorDiv));
    }

    editorDiv.addEventListener('input', function () {
        if (contentSyncTimer !== null) {
            clearTimeout(contentSyncTimer);
        }
        contentSyncTimer = setTimeout(syncMarkdownContentAttribute, 300);

        // Make sure noteid is set
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        window.noteid = noteId;

        if (editorDiv._suppressMarkdownTableContextInput) {
            return;
        }

        // Mark as edited
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    });

    editorDiv.addEventListener('focusout', syncMarkdownContentAttribute);
}

// Save markdown content when updating note
function getMarkdownContent(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv) {
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }

    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Helper function to update view mode button icon and title
function updateViewModeButton(noteId, mode) {
    var viewModeBtn = document.querySelector('#note' + noteId + ' .markdown-view-mode-btn');
    if (!viewModeBtn) return;

    viewModeBtn.setAttribute('data-current-mode', mode);

    if (mode === 'edit') {
        viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
        viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
        viewModeBtn.classList.remove('active');
        viewModeBtn.style.display = '';
    } else if (mode === 'preview') {
        viewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
        viewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
        viewModeBtn.classList.remove('active');
        viewModeBtn.style.display = '';
    } else if (mode === 'split') {
        // Hide the view mode button in split mode
        viewModeBtn.style.display = 'none';
    }
}

// Switch to split view mode (editor on left, preview on right)
function switchToSplitMode(noteId) {
    // Never allow split mode on mobile
    var isMobileViewport = false;
    try {
        isMobileViewport = (window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    } catch (e) {
        isMobileViewport = false;
    }

    if (isMobileViewport) {
        return; // Exit early on mobile
    }

    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');

    if (!previewDiv || !editorDiv) return;

    // Calculate scroll ratio relative to the content content (approximated by right_col scroll)
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    var scrollHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
    var scrollRatio = (scrollHeight > 0) ? (savedScrollTop / scrollHeight) : 0;

    // Update preview content before showing
    var markdownContent = normalizeContentEditableText(editorDiv);

    renderMarkdownPreview(previewDiv, markdownContent, noteId, {
        placeholder: window.t ? window.t('editor.messages.split_preview_placeholder', null, 'Preview will appear here as you type...') : 'Preview will appear here as you type...'
    });

    noteEntry.setAttribute('data-markdown-content', markdownContent);

    // Add split mode class to note entry
    noteEntry.classList.add('markdown-split-mode');

    // Show both editor and preview
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'flex', 'important');
    } else {
        editorDiv.style.setProperty('display', 'block', 'important');
    }
    previewDiv.style.setProperty('display', 'block', 'important');
    setMarkdownEditorEditable(editorDiv, true);
    noteEntry.setAttribute('contenteditable', 'false');

    // Restore scroll position after layout changes
    // In split mode, the right_col becomes hidden overflow, and panels scroll internally.
    // We must reset right_col to 0 to show the toolbar, and scroll the panels instead.
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                if (scrollContainer) {
                    // Reset main container scroll so toolbar (sticky/relative) is visible at top
                    scrollContainer.scrollTop = 0;
                }

                updateMarkdownSplitPaneHeight(noteEntry);

                // Apply proportional scroll to editor and preview
                if (scrollRatio > 0) {
                    // editorDiv is the scroll target, not editorContainer: in split
                    // mode the CSS puts overflow-y on .markdown-editor itself
                    // (.noteentry.markdown-split-mode .markdown-editor).
                    if (editorDiv) {
                        var eHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
                        editorDiv.scrollTop = scrollRatio * eHeight;
                    }

                    // Scroll preview
                    if (previewDiv) {
                        var pHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
                        previewDiv.scrollTop = scrollRatio * pHeight;
                    }
                }

                scheduleMarkdownPreviewScrollToEditorCaret(noteEntry);
            }, 50);
        });
    });

    // Update view mode button
    updateViewModeButton(noteId, 'split');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'split');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }

    // Setup live preview update on input
    setupSplitModePreviewUpdate(noteId);

    // Refresh outline panel if available
    if (window.outlinePanel && window.outlinePanel.refresh) {
        setTimeout(function() {
            window.outlinePanel.refresh();
        }, 100);
    }
}

// Exit split view mode (return to edit mode)
function exitSplitMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    // Remove split mode class
    noteEntry.classList.remove('markdown-split-mode');
    clearMarkdownSplitPaneHeight(noteEntry);

    // Remove split mode input listener
    if (editorDiv && editorDiv._splitModeInputListener) {
        editorDiv.removeEventListener('input', editorDiv._splitModeInputListener);
        editorDiv._splitModeInputListener = null;
    }

    teardownMarkdownPreviewScrollSync(editorDiv);

    // Hide preview
    if (previewDiv) {
        previewDiv.style.setProperty('display', 'none', 'important');
    }

    // Switch to preview mode instead of edit mode
    switchToPreviewMode(noteId);
}

// Public API of this file.
window.initializeMarkdownNote = initializeMarkdownNote;
window.switchToEditMode = switchToEditMode;
window.switchToPreviewMode = switchToPreviewMode;
window.switchToSplitMode = switchToSplitMode;
window.exitSplitMode = exitSplitMode;
window.getMarkdownContent = getMarkdownContent;
window.getMarkdownContentForNote = getMarkdownContentForNote;
window.renderMarkdownPreview = renderMarkdownPreview;
window.setupMarkdownEditorListeners = setupMarkdownEditorListeners;
window.updateViewModeButton = updateViewModeButton;
