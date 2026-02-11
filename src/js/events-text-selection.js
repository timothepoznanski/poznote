/**
 * Text Selection Module
 * Manages formatting toolbar visibility based on text selection context
 */

// Text selection management for formatting toolbar
function initTextSelectionHandlers() {
    var selectionTimeout;

    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function () {
            var selection = window.getSelection();

            // Desktop handling (existing code)
            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            var noteActionButtons = document.querySelectorAll('.note-action-btn');

            // Check if the selection contains text
            if (selection && selection.toString().trim().length > 0) {
                var range = selection.getRangeAt(0);
                var container = range.commonAncestorContainer;

                // Helper function to check if element is title or tag field
                function isTitleOrTagElement(elem) {
                    if (!elem) return false;
                    if (elem.classList && elem.classList.contains('one_note_title')) return true;
                    if (elem.classList && elem.classList.contains('tags')) return true;
                    if (elem.id === 'search') return true;
                    if (elem.classList && elem.classList.contains('searchbar')) return true;
                    if (elem.classList && elem.classList.contains('searchtrash')) return true;
                    return false;
                }

                // Improve detection of editable area
                var currentElement = container.nodeType === 3 ? container.parentElement : container; // Node.TEXT_NODE
                var editableElement = null;

                // Go up the DOM tree to find an editable area
                var isTitleOrTagField = false;
                while (currentElement && currentElement !== document.body) {

                    if (isTitleOrTagElement(currentElement)) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a markdown editor, allow formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-editor')) {
                        editableElement = currentElement;
                        break;
                    }
                    // If selection is inside a markdown preview (read-only), hide formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-preview')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a task list, treat it as non-editable for formatting
                    try {
                        if (currentElement && currentElement.closest && currentElement.closest('.task-list-container, .tasks-list, .task-item, .task-text')) {
                            // Consider as not editable so formatting buttons won't appear
                            editableElement = null;
                            isTitleOrTagField = true;
                            break;
                        }
                    } catch (err) { }
                    // Treat selection inside the note metadata subline as title-like (do not toggle toolbar)
                    if (currentElement.classList && currentElement.classList.contains('note-subline')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    if (currentElement.classList && currentElement.classList.contains('noteentry')) {
                        editableElement = currentElement;
                        break;
                    }
                    if (currentElement.contentEditable === 'true') {
                        editableElement = currentElement;
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }

                if (isTitleOrTagField) {
                    // Text selected in a title or tags field: keep normal state (actions visible, formatting hidden)
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.remove('hide-on-selection');
                    }
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.add('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                } else {
                    // Text selected but not in an editable area: hide everything
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                }
            } else {
                // No text selection: show actions, hide formatting
                for (var i = 0; i < textFormatButtons.length; i++) {
                    textFormatButtons[i].classList.remove('show-on-selection');
                }
                for (var i = 0; i < noteActionButtons.length; i++) {
                    noteActionButtons[i].classList.remove('hide-on-selection');
                }
            }

        }, 50); // Short delay to avoid too frequent calls
    }

    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);

    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', function (e) {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });
}

// Expose to global scope
window.initTextSelectionHandlers = initTextSelectionHandlers;
