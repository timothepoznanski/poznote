/**
 * Note content re-initialisation.
 * 
 * Runs after a note's HTML lands in the DOM: translating callout titles to the current
 * language and re-wiring everything interactive inside the note body.
 */

/**
 * Translate callout titles in HTML content
 * This function finds all callout elements and translates their titles to the current language
 */
function translateCalloutTitles() {
    try {
        const callouts = document.querySelectorAll('.callout');
        callouts.forEach(function (callout) {
            // Get callout type from class name
            let calloutType = null;
            const classList = callout.className.split(' ');
            for (let i = 0; i < classList.length; i++) {
                if (classList[i].startsWith('callout-')) {
                    calloutType = classList[i].replace('callout-', '');
                    break;
                }
            }

            if (!calloutType) return;

            // Find the title text element
            const titleTextElement = callout.querySelector('.callout-title-text');
            if (!titleTextElement) return;

            // Get current text
            const currentText = titleTextElement.textContent.trim();

            // List of possible English titles (in case the content is in English)
            const englishTitles = {
                'note': 'Note',
                'tip': 'Tip',
                'important': 'Important',
                'warning': 'Warning',
                'caution': 'Caution'
            };

            // Only translate if it's the default title (not a custom title)
            const expectedEnglishTitle = englishTitles[calloutType];
            if (expectedEnglishTitle && currentText === expectedEnglishTitle) {
                // Translate using the translation function
                const defaultTitle = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
                const translatedTitle = (window.t ? window.t('slash_menu.callout_' + calloutType, null, defaultTitle) : defaultTitle);
                titleTextElement.textContent = translatedTitle;
            }
        });
    } catch (e) {
        console.error('Error translating callout titles:', e);
    }
}

/**
 * Re-initialize note content after AJAX load
 */
function reinitializeNoteContent(options) {
    options = options || {};
    var skipStructuralInit = options.skipStructuralInit === true;
    var preserveRuntimeState = options.preserveRuntimeState === true || skipStructuralInit;

    // Re-initialize any JavaScript components that might be in the loaded content

    // Re-initialize auto-save state for the current note
    if (typeof window.reinitializeAutoSaveState === 'function') {
        window.reinitializeAutoSaveState();
    }

    // Convert base64 images in HTML notes to attachments (migration)
    try {
        var noteEntries = document.querySelectorAll('.noteentry[data-note-type="note"], .noteentry:not([data-note-type])');
        if (!skipStructuralInit) {
            noteEntries.forEach(function (entry) {
                if (typeof window.convertBase64ImagesToAttachments === 'function') {
                    // Small delay to ensure DOM is stable
                    setTimeout(function () {
                        window.convertBase64ImagesToAttachments(entry);
                    }, 100);
                }
            });
        }
    } catch (e) {
        // Silently continue if error
    }

    // Re-initialize search highlighting if in search mode.
    // Prefer the centralized helper which knows about notes/tags/folders.
    if (isSearchMode) {
        if (typeof applyHighlightsWithRetries === 'function') {
            try {
                setTimeout(function () {
                    try {
                        applyHighlightsWithRetries();
                        if (window.searchNavigation && window.searchNavigation.pendingAutoScroll && typeof scrollToFirstHighlight === 'function') {
                            scrollToFirstHighlight();
                        }
                    } catch (e) { }
                }, 60);
            } catch (e) { }
        } else if (typeof highlightSearchTerms === 'function') {
            setTimeout(function () {
                highlightSearchTerms();
                if (window.searchNavigation && window.searchNavigation.pendingAutoScroll && typeof scrollToFirstHighlight === 'function') {
                    scrollToFirstHighlight();
                }
            }, 100);
        }
    }

    // Re-initialize clickable tags
    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
        reinitializeClickableTagsAfterAjax();
    }

    // Process note references [[Note Title]] and track opened note
    if (typeof window.trackAndProcessNotes === 'function') {
        window.trackAndProcessNotes();
    }

    // Re-initialize image click handlers
    reinitializeImageClickHandlers();

    // Refresh attachment previews after initial and AJAX note loads.
    if (!preserveRuntimeState && typeof window.refreshAttachmentPreviewsForVisibleNotes === 'function') {
        window.refreshAttachmentPreviewsForVisibleNotes();
    }

    // Update note history navigation buttons
    if (typeof NoteHistory !== 'undefined' && NoteHistory.updateButtons) {
        NoteHistory.updateButtons();
    }

    // Re-initialize note drag and drop events
    if (typeof setupNoteDragDropEvents === 'function') {
        setupNoteDragDropEvents();
    }

    // Re-initialize any other components that might be needed
    // (emoji picker, toolbar handlers, etc.)

    // Focus on the note content if it exists - DISABLED
    // const noteContent = document.querySelector('[contenteditable="true"]');
    // Only focus the note content when not in search mode; otherwise keep focus in the search input
    // if (noteContent && !isSearchMode) {
    //     setTimeout(() => {
    //         noteContent.focus();
    //     }, 100);
    // }

    // If the loaded note(s) include any tasklist entries, initialize them so the JSON content
    // is replaced with the interactive task list UI when notes are loaded via AJAX.
    try {
        if (!skipStructuralInit) {
            const taskEntries = document.querySelectorAll('[data-note-type="tasklist"]');
            taskEntries.forEach(function (entry) {
                const idAttr = entry.id || '';
                if (!idAttr) return;
                const noteId = idAttr.replace('entry', '');
                if (typeof initializeTaskList === 'function') {
                    // Call initializeTaskList after a short delay to ensure the DOM is stable
                    setTimeout(function () {
                        try {
                            initializeTaskList(noteId, 'tasklist');
                        } catch (e) {
                            console.error('Error initializing tasklist for noteId', noteId, e);
                        }
                    }, 50);
                }
            });
        }
    } catch (e) {
        console.error('Error while initializing tasklist entries after AJAX load:', e);
    }

    // Hydrate embedded task-list widgets in regular HTML notes. Also runs on
    // DOM-cache restores (skipStructuralInit): the source list may have
    // changed since the host note's DOM was cached, and re-rendering the
    // widget from the API is idempotent.
    try {
        if (typeof window.initializeTaskListEmbeds === 'function') {
            window.initializeTaskListEmbeds();
        }
    } catch (e) { }

    // If the loaded note(s) include any markdown entries, initialize them so the markdown content
    // is replaced with the interactive markdown editor/preview UI when notes are loaded via AJAX.
    try {
        if (!skipStructuralInit) {
            const markdownEntries = document.querySelectorAll('[data-note-type="markdown"]');
            markdownEntries.forEach(function (entry) {
                const idAttr = entry.id || '';
                if (!idAttr) return;
                const noteId = idAttr.replace('entry', '');
                if (typeof initializeMarkdownNote === 'function') {
                    // Call initializeMarkdownNote after a short delay to ensure the DOM is stable
                    setTimeout(function () {
                        try {
                            initializeMarkdownNote(noteId);
                        } catch (e) {
                            console.error('Error initializing markdown note for noteId', noteId, e);
                        }
                    }, 50);
                }
            });
        }
    } catch (e) {
        console.error('Error while initializing markdown entries after AJAX load:', e);
    }

    // Re-initialize toolbar functionality
    if (typeof initializeToolbarHandlers === 'function') {
        initializeToolbarHandlers();
    }

    // Re-initialize copy buttons for code blocks
    if (typeof window.reinitializeCodeCopyButtons === 'function') {
        window.reinitializeCodeCopyButtons();
    }

    // Convert bare <audio> elements to iframes for contenteditable compatibility
    if (typeof window.convertNoteAudioToIframes === 'function') {
        window.convertNoteAudioToIframes();
    }

    // Fix existing audio iframes to use audio_player.php
    if (typeof window.fixAudioIframes === 'function') {
        window.fixAudioIframes();
    }

    // Translate callout titles to the current language
    translateCalloutTitles();

    // Close all toggle blocks on page load (toggles should always start closed)
    try {
        const toggleBlocks = document.querySelectorAll('details.toggle-block');
        if (!preserveRuntimeState) {
            toggleBlocks.forEach(function (toggle) {
                toggle.removeAttribute('open');
            });
        }
    } catch (e) {
        console.error('Error closing toggle blocks:', e);
    }

    // On mobile, ensure the right column is properly displayed only when a specific note is selected
    if (isMobileDevice()) {
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        const searchParam = urlParams.get('search');

        // If a specific note is selected, make sure the note pane is visible.
        // .note-open is NOT added here: this runs right before the slide to
        // the note, and the class resizes the columns (icon rail), which
        // showed as a jerky pre-animation. window.scrollToRightColumn applies
        // it once the slide is over.
        if (noteParam) {
            const rightColumn = document.getElementById('right_col');
            if (rightColumn) {
                rightColumn.style.display = 'block';
            }
        } else {
            // If no specific note is selected, show the list
            if (document.body.classList.contains('note-open')) {
                document.body.classList.remove('note-open');
            }
            const leftColumn = document.getElementById('left_col');
            if (leftColumn) {
                leftColumn.style.display = 'block';
            }
        }
    }

    // Force interface refresh to sync with loaded content - but don't trigger auto-save
    // since content was just loaded from server and is already saved

    // Refresh backlinks panel for the newly loaded note
    if (typeof window.initBacklinksPanel === 'function') {
        window.initBacklinksPanel();
    }

    try {
        document.dispatchEvent(new CustomEvent('noteLoaded', {
            detail: {
                noteId: (typeof window.noteid !== 'undefined' && window.noteid !== null) ? String(window.noteid) : null
            }
        }));
    } catch (e) {
        // Ignore event dispatch issues
    }

    // Mark that note loading is complete
    window.isLoadingNote = false;
}
