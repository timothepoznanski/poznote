// JavaScript for tags page
// Requires: navigation.js (for getPageWorkspace, goBackToNotes)

document.addEventListener('DOMContentLoaded', function() {
    // Tag search/filtering management
    const searchInput = document.getElementById('tagsSearchInput');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterTags();
        });
    }

    // Attach back button event listener
    const backBtn = document.getElementById('backToNotesBtn');
    if (backBtn) {
        backBtn.addEventListener('click', goBackToNotes);
    }

    // Back to home button
    const backHomeBtn = document.getElementById('backToHomeBtn');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', goBackToHome);
    }

    // Attach click listeners to tag items (using event delegation)
    const tagsList = document.getElementById('tagsList');
    if (tagsList) {
        tagsList.addEventListener('click', function(e) {
            // Don't navigate when the context menu is triggering
            if (e.target.closest('.tag-context-menu')) return;

            const tagItem = e.target.closest('.tag-item');
            if (tagItem && tagItem.dataset.tag) {
                if (typeof window.redirectToTag === 'function') {
                    window.redirectToTag(tagItem.dataset.tag);
                }
            }
        });

        // Right-click context menu
        tagsList.addEventListener('contextmenu', function(e) {
            const tagItem = e.target.closest('.tag-item');
            if (tagItem && tagItem.dataset.tag) {
                e.preventDefault();
                showTagContextMenu(e.pageX, e.pageY, tagItem);
            }
        });
    }

    // Close context menu on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.tag-context-menu')) {
            closeTagContextMenu();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeTagContextMenu();
    });

    // Expose workspace for other scripts (like clickable-tags.js)
    window.pageWorkspace = getPageWorkspace();
});

// ─── Context Menu ──────────────────────────────────────────────────────────────

let activeContextMenu = null;
let activeTagItem = null;

function showTagContextMenu(x, y, tagItem) {
    closeTagContextMenu();

    const menu = document.createElement('div');
    menu.className = 'tag-context-menu';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'tag-context-menu-item';
    renameBtn.innerHTML = '<i class="lucide lucide-pencil"></i> ' +
        (window.t ? window.t('tags.action.rename', {}, 'Rename') : 'Rename');
    renameBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTagContextMenu();
        handleRenameTag(tagItem);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tag-context-menu-item danger';
    deleteBtn.innerHTML = '<i class="lucide lucide-trash-2"></i> ' +
        (window.t ? window.t('tags.action.delete', {}, 'Delete') : 'Delete');
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTagContextMenu();
        handleDeleteTag(tagItem);
    });

    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);

    // Position so the menu stays on screen
    const menuWidth = 160;
    const menuHeight = 80;
    const left = (x + menuWidth > window.innerWidth) ? x - menuWidth : x;
    const top  = (y + menuHeight > window.innerHeight) ? y - menuHeight : y;
    menu.style.left = left + 'px';
    menu.style.top  = top + 'px';

    activeContextMenu = menu;
    activeTagItem = tagItem;
}

function closeTagContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
        activeTagItem = null;
    }
}

// ─── Rename ────────────────────────────────────────────────────────────────────

function handleRenameTag(tagItem) {
    const oldName = tagItem.dataset.tag;

    showTagInputModal(
        window.t ? window.t('tags.rename.title', {}, 'Rename tag') : 'Rename tag',
        window.t ? window.t('tags.rename.label', {}, 'New name') : 'New name',
        oldName,
        window.t ? window.t('tags.action.rename', {}, 'Rename') : 'Rename',
        function(newName) {
            if (!newName || newName === oldName) return;
            renameTagRequest(tagItem, oldName, newName);
        }
    );
}

function renameTagRequest(tagItem, oldName, newName) {
    const workspace = window.pageWorkspace || '';

    fetch('/api/v1/tags/' + encodeURIComponent(oldName), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ new_name: newName, workspace: workspace || undefined })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            // Update DOM in place, keeping the count span
            tagItem.dataset.tag = newName;
            const nameEl = tagItem.querySelector('.tag-name');
            if (nameEl) {
                const countEl = nameEl.querySelector('.tag-note-count');
                nameEl.textContent = newName;
                if (countEl) nameEl.appendChild(countEl);
            }

            // Re-sort the grid
            resortTagGrid();
        } else {
            if (window.modalAlert) {
                window.modalAlert.alert(
                    data.message || (window.t ? window.t('tags.rename.error', {}, 'Rename failed') : 'Rename failed'),
                    'error'
                );
            }
        }
    })
    .catch(function() {
        if (window.modalAlert) {
            window.modalAlert.alert(
                window.t ? window.t('common.error.network', {}, 'Network error') : 'Network error',
                'error'
            );
        }
    });
}

// ─── Delete ────────────────────────────────────────────────────────────────────

function handleDeleteTag(tagItem) {
    const tagName = tagItem.dataset.tag;
    const message = window.t
        ? window.t('tags.delete.confirm', { tag: tagName }, 'Delete tag "{{tag}}" from all notes?')
        : `Delete tag "${tagName}" from all notes?`;

    if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
        window.modalAlert.confirm(
            message,
            window.t ? window.t('tags.delete.title', {}, 'Delete tag') : 'Delete tag',
            {
                alertType: 'warning',
                confirmText: window.t ? window.t('common.delete', {}, 'Delete') : 'Delete',
                confirmButtonClass: 'danger'
            }
        ).then(function(confirmed) {
            if (confirmed) deleteTagRequest(tagItem, tagName);
        });
    } else {
        if (confirm(message)) deleteTagRequest(tagItem, tagName);
    }
}

function deleteTagRequest(tagItem, tagName) {
    const workspace = window.pageWorkspace || '';
    const url = '/api/v1/tags/' + encodeURIComponent(tagName) +
        (workspace ? ('?workspace=' + encodeURIComponent(workspace)) : '');

    fetch(url, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            tagItem.remove();
            // Update count display
            updateTagCount();
        } else {
            if (window.modalAlert) {
                window.modalAlert.alert(
                    data.message || (window.t ? window.t('tags.delete.error', {}, 'Delete failed') : 'Delete failed'),
                    'error'
                );
            }
        }
    })
    .catch(function() {
        if (window.modalAlert) {
            window.modalAlert.alert(
                window.t ? window.t('common.error.network', {}, 'Network error') : 'Network error',
                'error'
            );
        }
    });
}

// ─── Input Modal (inline — no server round-trip for the prompt) ────────────────

function showTagInputModal(title, label, defaultValue, confirmText, onConfirm) {
    // Build a lightweight modal with an input field
    const overlay = document.createElement('div');
    overlay.className = 'alert-modal-overlay';
    overlay.style.zIndex = '10000';

    const modal = document.createElement('div');
    modal.className = 'alert-modal';

    const header = document.createElement('div');
    header.className = 'alert-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'alert-modal-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    const body = document.createElement('div');
    body.className = 'alert-modal-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '8px';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.fontWeight = '500';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.className = 'tag-rename-input';
    input.setAttribute('autocomplete', 'off');

    body.appendChild(labelEl);
    body.appendChild(input);

    const footer = document.createElement('div');
    footer.className = 'alert-modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'alert-modal-button secondary';
    cancelBtn.textContent = window.t ? window.t('common.cancel', {}, 'Cancel') : 'Cancel';
    function closeInputModal(cb) {
        overlay.classList.remove('show');
        setTimeout(function() { overlay.remove(); if (cb) cb(); }, 300);
    }

    cancelBtn.addEventListener('click', function() { closeInputModal(); });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'alert-modal-button primary';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', function() {
        const val = input.value.trim();
        closeInputModal(function() { onConfirm(val); });
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Trigger the CSS transition
    requestAnimationFrame(function() {
        overlay.classList.add('show');
    });

    // Select all text in the input for quick replacement
    setTimeout(function() { input.select(); }, 50);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function resortTagGrid() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;
    const items = Array.from(tagsList.querySelectorAll('.tag-item'));
    items.sort(function(a, b) {
        return a.dataset.tag.localeCompare(b.dataset.tag, undefined, { sensitivity: 'base', numeric: true });
    });
    items.forEach(function(item) { tagsList.appendChild(item); });
}

function updateTagCount() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;
    const count = tagsList.querySelectorAll('.tag-item').length;
    const infoEl = document.querySelector('.tags-info');
    if (!infoEl) return;
    if (count === 1) {
        infoEl.textContent = window.t
            ? window.t('tags.count.one', { count }, 'There is {{count}} tag total')
            : 'There is 1 tag total';
    } else {
        infoEl.textContent = window.t
            ? window.t('tags.count.other', { count }, 'There are {{count}} tags total')
            : `There are ${count} tags total`;
    }
}

// ─── Filter ────────────────────────────────────────────────────────────────────

function filterTags() {
    const input = document.getElementById('tagsSearchInput');
    const searchTerm = input.value;
    const filter = searchTerm.toUpperCase();
    const tagsList = document.getElementById('tagsList');
    const tagItems = tagsList.getElementsByClassName('tag-item');

    let visibleCount = 0;

    for (let i = 0; i < tagItems.length; i++) {
        const txtValue = tagItems[i].dataset.tag || '';
        if (tagItems[i].querySelector('.tag-name')) {
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tagItems[i].classList.remove('hidden');
                visibleCount++;
            } else {
                tagItems[i].classList.add('hidden');
            }
        }
    }

    // Update results counter
    updateSearchResults(visibleCount, searchTerm);
}

function updateSearchResults(count, searchTerm) {
    let resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) {
        const searchWrapper = document.querySelector('.home-search-wrapper');
        if (!searchWrapper) {
            return;
        }

        resultsDiv = document.createElement('div');
        resultsDiv.id = 'searchResults';
        resultsDiv.className = 'search-results';

        searchWrapper.appendChild(resultsDiv);
    }

    if (searchTerm.trim() === '') {
        resultsDiv.style.display = 'none';
    } else {
        resultsDiv.style.display = 'block';
        const term = String(searchTerm).trim();
        if (count === 1) {
            resultsDiv.textContent = (window.t ? window.t('tags.search.results_one', { count, term }, '1 tag found for "{{term}}"') : `1 tag found for "${term}"`);
        } else {
            resultsDiv.textContent = (window.t ? window.t('tags.search.results_other', { count, term }, '{{count}} tags found for "{{term}}"') : `${count} tags found for "${term}"`);
        }
    }
}
