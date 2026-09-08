// Tree context menus for Poznote.
// 
// The shared folder and note three-dot dropdowns: populating them from the toggle's data
// attributes, positioning them, keeping their separators in sync with UI customization,
// and the tag-all-notes-in-folder dialog.
// 
// Menu scope rule: these menus are for organizing. Note-specific actions belong in the
// opened note's own menu.

// Folder actions menu toggle functions
//
// A single shared dropdown (#folder-actions-menu, rendered once by
// folders_display.php) serves every folder's three-dot toggle. On open it is
// populated from the toggle's data attributes (folder id/name, note count,
// shared/favorite state, current sort) and positioned next to the toggle.

function populateFolderActionsMenu(menu, toggle) {
    var folderId = toggle.getAttribute('data-folder-id') || '';
    var folderName = toggle.getAttribute('data-folder-name') || '';
    var noteCount = parseInt(toggle.getAttribute('data-note-count'), 10) || 0;
    var isShared = toggle.getAttribute('data-shared') === '1';
    var isFavorite = toggle.getAttribute('data-favorite') === '1';
    var currentSort = toggle.getAttribute('data-current-sort') || '';

    menu.setAttribute('data-folder-id', folderId);

    // Copy folder identity onto every action item (handlers read it there)
    menu.querySelectorAll('[data-action]').forEach(function (item) {
        item.setAttribute('data-folder-id', folderId);
        item.setAttribute('data-folder-name', folderName);
    });

    // Items only relevant when the folder contains notes
    menu.querySelectorAll('.requires-notes').forEach(function (item) {
        item.style.display = noteCount > 0 ? '' : 'none';
    });

    // Share item: show the variant matching the folder's shared state
    menu.querySelectorAll('.share-state-shared').forEach(function (item) {
        item.style.display = isShared ? '' : 'none';
    });
    menu.querySelectorAll('.share-state-not-shared').forEach(function (item) {
        item.style.display = isShared ? 'none' : '';
    });

    // Favorite item: show the variant matching the folder's favorite state
    menu.querySelectorAll('.favorite-state-favorite').forEach(function (item) {
        item.style.display = isFavorite ? '' : 'none';
    });
    menu.querySelectorAll('.favorite-state-not-favorite').forEach(function (item) {
        item.style.display = isFavorite ? 'none' : '';
    });

    // Sort options: highlight the active one and reflect it in the header label
    var activeLabel = null;
    menu.querySelectorAll('[data-action="sort-folder"]').forEach(function (item) {
        var isActive = currentSort && item.getAttribute('data-sort-type') === currentSort;
        item.classList.toggle('active', !!isActive);
        if (isActive) {
            var optionLabel = item.querySelector('.sort-option-label');
            if (optionLabel) activeLabel = optionLabel.textContent;
        }
    });
    var headerLabel = menu.querySelector('.sort-header-label');
    if (headerLabel) {
        headerLabel.textContent = activeLabel || headerLabel.getAttribute('data-default-label') || headerLabel.textContent;
    }

    // Start with the sort submenu collapsed
    menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
        submenu.style.display = 'none';
    });
    menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
        chevron.style.transform = 'rotate(0deg)';
    });

    syncActionsMenuSeparators(menu);

    // Copy / cut / paste items (js/tree-undo-clipboard.js): paste only
    // shows with something on the clipboard
    if (window.PoznoteTreeClipboard) {
        window.PoznoteTreeClipboard.syncMenu(menu);
    }
}

// Keeps exactly one folder toggle marked .open, so the hover-reveal rule in
// css/folders/actions-menu.css holds it visible while its menu is open.
function markFolderActionsToggleOpen(toggle) {
    document.querySelectorAll('.folder-actions-toggle.open').forEach(function (other) {
        if (other !== toggle) other.classList.remove('open');
    });
    if (toggle) toggle.classList.add('open');
}

function clearFolderActionsToggleOpen() {
    document.querySelectorAll('.folder-actions-toggle.open').forEach(function (toggle) {
        toggle.classList.remove('open');
    });
}

function toggleFolderActionsMenu(folderId) {
    var menu = document.getElementById('folder-actions-menu');
    if (!menu) return;

    var toggle = document.querySelector('.folder-actions-toggle[data-folder-id="' + folderId + '"]');
    if (!toggle) return;

    // Clicking the toggle of the folder whose menu is already open closes it;
    // any other toggle re-populates and moves the menu
    var isOpenForFolder = menu.classList.contains('show') &&
        menu.getAttribute('data-folder-id') === String(folderId);

    if (isOpenForFolder) {
        closeFolderActionsMenu(folderId);
        return;
    }

    populateFolderActionsMenu(menu, toggle);
    menu.classList.add('show');
    // Folder toggles only show on row hover (css/folders/actions-menu.css);
    // while the menu is open the pointer is over the menu, not the row, so
    // mark the toggle to keep it visible. Mirrors .note-actions-toggle.open.
    markFolderActionsToggleOpen(toggle);
    adjustMenuPosition(menu, toggle);
}

function adjustMenuPosition(menu, toggleButton) {
    // Reset any previous adjustments
    menu.style.bottom = '';
    menu.style.top = '';
    menu.style.marginTop = '';
    menu.style.marginBottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';

    // Position relative to the toggle button (passed for the shared folder
    // menu; falls back to the previous sibling for legacy inline menus)
    toggleButton = toggleButton || menu.previousElementSibling;
    if (!toggleButton) {
        return;
    }

    var toggleRect = toggleButton.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;

    // Position menu below the toggle button by default (fixed positioning)
    var topPosition = toggleRect.bottom + 4;
    var leftPosition = toggleRect.left;

    menu.style.top = topPosition + 'px';
    menu.style.left = leftPosition + 'px';

    // Now get the menu's dimensions after positioning
    var rect = menu.getBoundingClientRect();

    // Check vertical overflow
    if (rect.bottom > viewportHeight) {
        // Try positioning above instead
        var topAltPosition = toggleRect.top - rect.height - 4;

        if (topAltPosition >= 0) {
            // Fits above
            menu.style.top = topAltPosition + 'px';
            rect = menu.getBoundingClientRect();
        } else {
            // Doesn't fit above either, constrain height below
            var availableHeight = viewportHeight - topPosition - 10;
            menu.style.maxHeight = Math.max(100, availableHeight) + 'px';
            menu.style.overflowY = 'auto';
            rect = menu.getBoundingClientRect();
        }
    }

    // Check horizontal overflow
    var leftCol = document.getElementById('left_col');
    if (leftCol) {
        var leftColRect = leftCol.getBoundingClientRect();

        // If menu overflows right edge of left column, align to right edge of toggle button
        if (rect.right > leftColRect.right) {
            leftPosition = toggleRect.right - rect.width;
            menu.style.left = Math.max(leftColRect.left, leftPosition) + 'px';
        }
    }

    // Also check viewport overflow
    rect = menu.getBoundingClientRect();
    if (rect.right > viewportWidth) {
        leftPosition = viewportWidth - rect.width - 10;
        menu.style.left = Math.max(0, leftPosition) + 'px';
    }
    if (rect.left < 0) {
        menu.style.left = '10px';
    }
}

/**
 * Place an already-populated dropdown at a point instead of next to a toggle,
 * for the right-click context menus. Same overflow handling as
 * adjustMenuPosition, but constrained to the viewport rather than to #left_col:
 * a menu opened at the cursor is allowed to spill over the note pane.
 */
function positionMenuAtPoint(menu, x, y) {
    menu.style.bottom = '';
    menu.style.top = '';
    menu.style.marginTop = '';
    menu.style.marginBottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';

    menu.style.top = y + 'px';
    menu.style.left = x + 'px';

    var rect = menu.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;

    if (rect.bottom > viewportHeight) {
        var topAbove = y - rect.height;
        if (topAbove >= 0) {
            menu.style.top = topAbove + 'px';
        } else {
            menu.style.maxHeight = Math.max(100, viewportHeight - y - 10) + 'px';
            menu.style.overflowY = 'auto';
        }
        rect = menu.getBoundingClientRect();
    }

    if (rect.right > viewportWidth) {
        menu.style.left = Math.max(0, viewportWidth - rect.width - 10) + 'px';
        rect = menu.getBoundingClientRect();
    }

    if (rect.left < 0) {
        menu.style.left = '10px';
    }
}

/**
 * Hidden by UI customization? syncFolderActionToggles / syncNoteActionToggles
 * in js/ui-customization.js set that inline display when every item of the
 * matching menu is unchecked. Checked instead of the computed style because
 * note toggles are display:none until their row is hovered.
 */
function isActionsToggleDisabled(toggle) {
    return !toggle || toggle.style.display === 'none';
}

// Right-click on a folder row: same dropdown as its three-dot toggle, opened
// at the cursor. Returns false when there is no menu to show, so the caller
// can leave the browser's own context menu alone.
function openFolderActionsMenuAtPoint(folderId, x, y) {
    var menu = document.getElementById('folder-actions-menu');
    var toggle = document.querySelector('.folder-actions-toggle[data-folder-id="' + folderId + '"]');
    if (!menu || isActionsToggleDisabled(toggle)) return false;

    closeNoteActionsMenu();
    populateFolderActionsMenu(menu, toggle);
    menu.classList.add('show');
    markFolderActionsToggleOpen(toggle);
    positionMenuAtPoint(menu, x, y);
    return true;
}

// Same for a note row. Takes the row's own toggle element because a favorited
// note appears twice in the tree under the same note id.
function openNoteActionsMenuAtPoint(toggle, x, y) {
    var menu = document.getElementById('note-actions-menu');
    if (!menu || isActionsToggleDisabled(toggle)) return false;

    closeFolderActionsMenu();
    closeNoteActionsMenu();
    populateNoteActionsMenu(menu, toggle);
    menu.classList.add('show');
    toggle.classList.add('open');
    openNoteActionsToggle = toggle;
    positionMenuAtPoint(menu, x, y);
    return true;
}

window.openFolderActionsMenuAtPoint = openFolderActionsMenuAtPoint;
window.openNoteActionsMenuAtPoint = openNoteActionsMenuAtPoint;

function closeFolderActionsMenu(folderId) {
    // Single shared menu: folderId is accepted for backwards compatibility
    // but closing is unconditional
    var menu = document.getElementById('folder-actions-menu');
    if (menu) {
        menu.classList.remove('show');
        // Unexpand sort submenus
        menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
            submenu.style.display = 'none';
        });
        menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
            chevron.style.transform = 'rotate(0deg)';
        });
    }
    clearFolderActionsToggleOpen();
}

function showTagFolderNotesDialog(folderId, folderName, noteCount) {
    var modal = document.getElementById('tagFolderNotesModal');
    var input = document.getElementById('tagFolderNotesInput');
    if (!modal || !input) return;

    modal.dataset.folderId = String(folderId || '');
    modal.dataset.folderName = folderName || '';
    modal.dataset.noteCount = String(parseInt(noteCount, 10) || 0);

    var sourceName = document.getElementById('tagFolderNotesSourceName');
    var countText = document.getElementById('tagFolderNotesCountText');
    var errorMessage = document.getElementById('tagFolderNotesErrorMessage');
    var suggestions = document.getElementById('tagFolderNotesSuggestions');
    var includeSubfolders = document.getElementById('tagFolderNotesIncludeSubfolders');

    if (sourceName) sourceName.textContent = folderName || '';
    if (countText) {
        var count = parseInt(noteCount, 10) || 0;
        var message = count === 1 ? modal.dataset.msgCountOne : modal.dataset.msgCountOther;
        countText.textContent = (message || '').replace('{{count}}', String(count));
    }
    if (errorMessage) errorMessage.textContent = '';
    if (suggestions) suggestions.style.display = 'none';
    if (includeSubfolders) includeSubfolders.checked = false;
    input.value = '';

    if (typeof openModal === 'function') {
        openModal('tagFolderNotesModal');
    } else {
        modal.style.display = 'flex';
    }
    input.focus();
}

function executeTagFolderNotes() {
    var modal = document.getElementById('tagFolderNotesModal');
    var input = document.getElementById('tagFolderNotesInput');
    if (!modal || !input) return;

    var tags = input.value.split(',').map(function(tag) { return tag.trim(); }).filter(Boolean);
    var errorMessage = document.getElementById('tagFolderNotesErrorMessage');
    if (!tags.length) {
        if (errorMessage) errorMessage.textContent = modal.dataset.msgNoTags || 'Enter at least one tag';
        input.focus();
        return;
    }

    var applyButton = modal.querySelector('[data-action="execute-tag-folder-notes"]');
    var defaultLabel = applyButton ? applyButton.textContent : 'Add tags';
    if (applyButton) {
        applyButton.disabled = true;
        applyButton.textContent = modal.dataset.msgApplying || 'Tagging...';
    }

    var workspace = document.body.getAttribute('data-workspace') || '';
    var includeSubfolders = document.getElementById('tagFolderNotesIncludeSubfolders');
    fetch('/api/v1/folders/' + encodeURIComponent(modal.dataset.folderId) + '/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            tags: tags,
            workspace: workspace,
            include_subfolders: !!(includeSubfolders && includeSubfolders.checked)
        })
    })
        .then(function(response) {
            return response.json().then(function(data) {
                if (!response.ok || !data.success) throw new Error(data.message || modal.dataset.msgError || 'Could not tag the notes');
                return data;
            });
        })
        .then(function(data) {
            var message = data.updated_count === 1 ? modal.dataset.msgSuccessOne : modal.dataset.msgSuccessOther;
            if (data.updated_count === 0) message = modal.dataset.msgSuccessNone;
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup((message || '').replace('{{count}}', String(data.updated_count || 0)), 'success');
            }
            if (typeof closeModal === 'function') closeModal('tagFolderNotesModal');
        })
        .catch(function(error) {
            if (errorMessage) errorMessage.textContent = error.message;
        })
        .finally(function() {
            if (applyButton) {
                applyButton.disabled = false;
                applyButton.textContent = defaultLabel;
            }
        });
}

window.showTagFolderNotesDialog = showTagFolderNotesDialog;
window.executeTagFolderNotes = executeTagFolderNotes;

// Close folder menus when clicking outside
document.addEventListener('click', function (event) {
    // If click is neither on a folder-actions toggle nor inside the shared
    // dropdown (which lives outside .folder-actions), close all menus
    if (!event.target.closest('.folder-actions') && !event.target.closest('.folder-actions-menu')) {
        document.querySelectorAll('.folder-actions-menu.show').forEach(function (menu) {
            menu.classList.remove('show');
            // Unexpand sort submenus
            menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
                submenu.style.display = 'none';
            });
            menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            });
        });
        clearFolderActionsToggleOpen();
    }
});

// ============================================
// Note actions menu (three-dot toggle on each note row in the tree)
//
// Same arrangement as the folder menu above: one shared #note-actions-menu is
// rendered per page, and opening a toggle copies that note's identity onto
// every item before positioning the menu. The items reuse the data-action
// values the note toolbar already uses, so js/index-events.js handles them
// without any per-item wiring here.
// ============================================

/**
 * Hide the group separators of a shared actions menu that no longer sit
 * between two visible items.
 *
 * Both menus are rendered once with every item they can ever show, then
 * trimmed on open: by note type, by folder contents, and by the user's UI
 * customization. Any of those can empty a whole group, which would otherwise
 * leave a rule at the top or bottom of the menu, or two rules in a row.
 *
 * Reads the live style rather than offsetParent: the menu is populated while
 * it is still display:none, so nothing has a layout box yet.
 *
 * @param {HTMLElement} menu The .note-actions-menu or .folder-actions-menu
 */
function syncActionsMenuSeparators(menu) {
    if (!menu) return;

    var children = Array.prototype.slice.call(menu.children);
    var seenVisibleItem = false;
    var pendingSeparators = [];

    children.forEach(function (child) {
        if (!child.classList) return;

        var isSeparator = child.classList.contains('note-actions-menu-separator') ||
            child.classList.contains('folder-actions-menu-separator');

        if (isSeparator) {
            // Undecided until a visible item turns up after it
            child.style.display = 'none';
            if (seenVisibleItem) pendingSeparators.push(child);
            return;
        }

        if (window.getComputedStyle(child).display === 'none') return;

        // A visible item closes every separator still waiting behind it, but
        // only the last one: consecutive separators would double the rule.
        if (pendingSeparators.length) {
            pendingSeparators[pendingSeparators.length - 1].style.display = '';
            pendingSeparators = [];
        }
        seenVisibleItem = true;
    });
}

function populateNoteActionsMenu(menu, toggle) {
    var noteId = toggle.getAttribute('data-note-id') || '';
    var noteTitle = toggle.getAttribute('data-note-title') || '';
    var noteType = toggle.getAttribute('data-note-type') || 'note';
    var folderId = toggle.getAttribute('data-folder-id') || '';
    var folderName = toggle.getAttribute('data-folder') || '';
    var isFavorite = toggle.getAttribute('data-favorite') === '1';

    menu.setAttribute('data-note-id', noteId);

    // Type-sensitive items: a shortcut row only keeps the actions that act on
    // the link itself, so duplicating and re-linking it are dropped
    var isLinkedNote = noteType === 'linked';
    menu.querySelectorAll('.note-real-only').forEach(function (item) {
        item.style.display = isLinkedNote ? 'none' : '';
    });

    // Favorite item: show the variant matching the note's favorite state
    menu.querySelectorAll('.favorite-state-favorite').forEach(function (item) {
        item.style.display = isFavorite ? '' : 'none';
    });
    menu.querySelectorAll('.favorite-state-not-favorite').forEach(function (item) {
        item.style.display = isFavorite ? 'none' : '';
    });

    // Copy note identity onto every action item (handlers read it there).
    // The names match what each existing handler expects:
    // show-move-folder-dialog reads the folder, and the icon picker and
    // rename read data-note-title.
    menu.querySelectorAll('[data-action]').forEach(function (item) {
        item.setAttribute('data-note-id', noteId);
        item.setAttribute('data-note-title', noteTitle);
        item.setAttribute('data-title', noteTitle);
        item.setAttribute('data-note-type', noteType);
        item.setAttribute('data-folder-id', folderId);
        item.setAttribute('data-folder', folderName);
    });

    syncActionsMenuSeparators(menu);

    // Copy / cut / paste items (js/tree-undo-clipboard.js): paste only
    // shows with something on the clipboard
    if (window.PoznoteTreeClipboard) {
        window.PoznoteTreeClipboard.syncMenu(menu);
    }
}

// The toggle that opened the menu, so it can be closed by a second click and
// so the menu stays anchored to the row that was actually clicked. A note can
// appear more than once in the tree (its folder plus the Favorites section),
// so the caller passes the element instead of us looking it up by note id.
var openNoteActionsToggle = null;

function toggleNoteActionsMenu(noteId, toggleElement) {
    var menu = document.getElementById('note-actions-menu');
    if (!menu) return;

    var toggle = toggleElement ||
        document.querySelector('.note-actions-toggle[data-note-id="' + noteId + '"]');
    if (!toggle) return;

    // Clicking the toggle whose menu is already open closes it; any other
    // toggle re-populates and moves the menu
    var isOpenForToggle = menu.classList.contains('show') && openNoteActionsToggle === toggle;

    closeNoteActionsMenu();
    if (isOpenForToggle) return;

    populateNoteActionsMenu(menu, toggle);
    menu.classList.add('show');
    toggle.classList.add('open');
    openNoteActionsToggle = toggle;
    adjustMenuPosition(menu, toggle);
}

function closeNoteActionsMenu() {
    var menu = document.getElementById('note-actions-menu');
    if (menu) {
        menu.classList.remove('show');
    }
    document.querySelectorAll('.note-actions-toggle.open').forEach(function (btn) {
        btn.classList.remove('open');
    });
    openNoteActionsToggle = null;
}

window.toggleNoteActionsMenu = toggleNoteActionsMenu;
window.closeNoteActionsMenu = closeNoteActionsMenu;

// Dismiss the menu as soon as one of its items is clicked. Capture phase
// because some item handlers (the icon picker) call stopImmediatePropagation,
// which would otherwise prevent the bubble-phase closer in
// js/notes-list-events.js from ever running. Hiding the menu leaves it in the
// DOM, so the handlers still resolve their data-action target normally.
document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('#note-actions-menu')) {
        closeNoteActionsMenu();
    }
}, true);
