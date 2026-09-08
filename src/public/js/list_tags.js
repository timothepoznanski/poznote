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

    initTagsColorFilter();

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

    const colorBtn = document.createElement('button');
    colorBtn.className = 'tag-context-menu-item';
    colorBtn.innerHTML = '<i class="lucide lucide-palette"></i> ' +
        (window.t ? window.t('tags.action.color', {}, 'Color') : 'Color');
    colorBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTagContextMenu();
        showTagColorModal(tagItem);
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
    menu.appendChild(colorBtn);
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);

    // Position so the menu stays on screen
    const menuWidth = 160;
    const menuHeight = 120;
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

            // Carry the tag color over to the new name
            const colorMap = getTagColorsMap();
            const oldKey = String(oldName).trim().toLowerCase();
            const newKey = String(newName).trim().toLowerCase();
            if (oldKey !== newKey && Object.prototype.hasOwnProperty.call(colorMap, oldKey)) {
                colorMap[newKey] = colorMap[oldKey];
                delete colorMap[oldKey];
                saveTagColors();
            }
            updateTagItemDot(tagItem);

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
                window.t ? window.t('ui.alerts.network_error', {}, 'Network error') : 'Network error',
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

            // Drop the deleted tag's color mapping
            const colorMap = getTagColorsMap();
            const key = String(tagName).trim().toLowerCase();
            if (Object.prototype.hasOwnProperty.call(colorMap, key)) {
                delete colorMap[key];
                saveTagColors();
            }

            // The removed tag may have been the last one wearing its color.
            refreshTagsColorFilterBar();
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
                window.t ? window.t('ui.alerts.network_error', {}, 'Network error') : 'Network error',
                'error'
            );
        }
    });
}

// ─── Tag colors ────────────────────────────────────────────────────────────────
// window.TAG_COLORS maps a lowercased tag name to a palette id or '#rrggbb'
// (same semantics as note colors). Persisted in the 'tag_colors' setting.

function getTagColorsMap() {
    if (!window.TAG_COLORS || typeof window.TAG_COLORS !== 'object') {
        window.TAG_COLORS = {};
    }
    return window.TAG_COLORS;
}

function getTagColorPalette() {
    return Array.isArray(window.NOTE_COLOR_PALETTE) ? window.NOTE_COLOR_PALETTE : [];
}

function resolveTagColorValueHex(value) {
    if (typeof value !== 'string' || value === '') return '';
    if (value.charAt(0) === '#') return value;
    const entry = getTagColorPalette().find(function(c) { return c.id === value.toLowerCase(); });
    return entry ? entry.hex : '';
}

function resolveTagHex(tagName) {
    const value = getTagColorsMap()[String(tagName || '').trim().toLowerCase()];
    return resolveTagColorValueHex(value);
}

function saveTagColors(callback) {
    fetch('/api/v1/settings/tag_colors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ value: JSON.stringify(getTagColorsMap()) })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (callback) callback(!!(data && data.success)); })
    .catch(function() { if (callback) callback(false); });
}

function setTagColor(tagName, colorValue, callback) {
    const key = String(tagName || '').trim().toLowerCase();
    if (!key) return;
    const map = getTagColorsMap();
    if (colorValue) {
        map[key] = colorValue;
    } else {
        delete map[key];
    }
    saveTagColors(callback);
}

function updateTagItemDot(tagItem) {
    const nameEl = tagItem.querySelector('.tag-name');
    if (!nameEl) return;
    let dot = nameEl.querySelector('.tag-color-dot');
    const hex = resolveTagHex(tagItem.dataset.tag);
    // data-color backs the color filter, so it has to track the dot.
    tagItem.dataset.color = hex ? hex.toLowerCase() : '';
    if (!hex) {
        if (dot) dot.remove();
        refreshTagsColorFilterBar();
        return;
    }
    if (!dot) {
        dot = document.createElement('span');
        dot.className = 'tag-color-dot';
        nameEl.insertBefore(dot, nameEl.firstChild);
    }
    dot.style.background = hex;
    refreshTagsColorFilterBar();
}

function showTagColorModal(tagItem) {
    const tagName = tagItem.dataset.tag;
    const currentValue = getTagColorsMap()[String(tagName).trim().toLowerCase()] || '';

    const overlay = document.createElement('div');
    overlay.className = 'alert-modal-overlay';
    overlay.style.zIndex = '10000';

    const modal = document.createElement('div');
    modal.className = 'alert-modal';

    const header = document.createElement('div');
    header.className = 'alert-modal-header';
    const titleEl = document.createElement('h3');
    titleEl.className = 'alert-modal-title';
    titleEl.textContent = (window.t ? window.t('tags.color.modal_title', {}, 'Tag color') : 'Tag color') + ' — ' + tagName;
    header.appendChild(titleEl);

    const body = document.createElement('div');
    body.className = 'alert-modal-body';

    let selectedValue = currentValue;

    const grid = document.createElement('div');
    grid.className = 'tag-color-grid';

    function refreshSelection() {
        grid.querySelectorAll('.tag-color-swatch').forEach(function(swatch) {
            swatch.classList.toggle('selected', swatch.dataset.value === selectedValue);
        });
        customInput.classList.toggle('selected', !!selectedValue && selectedValue.charAt(0) === '#');
    }

    getTagColorPalette().forEach(function(color) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'tag-color-swatch';
        swatch.dataset.value = color.id;
        swatch.style.background = color.hex;
        swatch.title = color.name || color.id;
        swatch.addEventListener('click', function() {
            selectedValue = (selectedValue === color.id) ? '' : color.id;
            refreshSelection();
        });
        grid.appendChild(swatch);
    });

    // Custom hex color, mirroring the note color picker's custom option
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'tag-color-swatch tag-color-custom';
    customInput.title = window.t ? window.t('note_color.custom', {}, 'Custom color') : 'Custom color';
    customInput.value = (currentValue && currentValue.charAt(0) === '#') ? currentValue : '#3b82f6';
    customInput.addEventListener('input', function() {
        selectedValue = customInput.value;
        refreshSelection();
    });
    grid.appendChild(customInput);

    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'alert-modal-footer';

    function closeColorModal(cb) {
        overlay.classList.remove('show');
        setTimeout(function() { overlay.remove(); if (cb) cb(); }, 300);
    }

    function persist(value) {
        closeColorModal(function() {
            setTagColor(tagName, value, function(success) {
                if (success) {
                    updateTagItemDot(tagItem);
                } else if (window.modalAlert) {
                    window.modalAlert.alert(
                        window.t ? window.t('tags.color.apply_error', {}, 'Could not update the tag color.') : 'Could not update the tag color.',
                        'error'
                    );
                }
            });
        });
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'alert-modal-button secondary';
    removeBtn.textContent = window.t ? window.t('note_color.remove', {}, 'Remove color') : 'Remove color';
    removeBtn.addEventListener('click', function() { persist(''); });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'alert-modal-button secondary';
    cancelBtn.textContent = window.t ? window.t('common.cancel', {}, 'Cancel') : 'Cancel';
    cancelBtn.addEventListener('click', function() { closeColorModal(); });

    const applyBtn = document.createElement('button');
    applyBtn.className = 'alert-modal-button primary';
    applyBtn.textContent = window.t ? window.t('common.apply', {}, 'Apply') : 'Apply';
    applyBtn.addEventListener('click', function() { persist(selectedValue); });

    footer.appendChild(removeBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    refreshSelection();
    requestAnimationFrame(function() { overlay.classList.add('show'); });
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

// Active color filters, as lowercased hex values. '__none__' matches the
// uncolored tags. Empty means "no color filter", i.e. every color passes.
const activeColorFilters = new Set();

function tagMatchesColorFilter(tagItem) {
    if (activeColorFilters.size === 0) return true;

    const color = (tagItem.dataset.color || '').toLowerCase();
    return activeColorFilters.has(color === '' ? '__none__' : color);
}

function filterTags() {
    const input = document.getElementById('tagsSearchInput');
    const tagsList = document.getElementById('tagsList');
    if (!input || !tagsList) return;

    const searchTerm = input.value;
    const filter = searchTerm.toUpperCase();
    const tagItems = tagsList.getElementsByClassName('tag-item');

    let visibleCount = 0;

    for (let i = 0; i < tagItems.length; i++) {
        const txtValue = tagItems[i].dataset.tag || '';
        if (tagItems[i].querySelector('.tag-name')) {
            const matchesText = txtValue.toUpperCase().indexOf(filter) > -1;
            if (matchesText && tagMatchesColorFilter(tagItems[i])) {
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

// ─── Color filter ──────────────────────────────────────────────────────────────

/**
 * Rebuild the swatch bar from the colors the grid actually uses, so recoloring
 * a tag adds or drops swatches instead of leaving stale ones behind. Filters on
 * a color that disappeared are dropped, and the bar hides when nothing is
 * colored at all.
 */
function refreshTagsColorFilterBar() {
    const bar = document.getElementById('tagsColorFilter');
    if (!bar) return;

    const items = Array.from(document.querySelectorAll('#tagsList .tag-item'));
    const used = [];
    let hasUncolored = false;
    items.forEach(function (item) {
        const color = (item.dataset.color || '').toLowerCase();
        if (color === '') {
            hasUncolored = true;
        } else if (used.indexOf(color) === -1) {
            used.push(color);
        }
    });
    used.sort();

    // Drop filters whose color is no longer present, so nothing filters on a
    // swatch the user can no longer see (and untoggle).
    Array.from(activeColorFilters).forEach(function (value) {
        const stillThere = value === '__none__' ? hasUncolored : used.indexOf(value) !== -1;
        if (!stillThere) activeColorFilters.delete(value);
    });

    const clearBtn = document.getElementById('tagsColorFilterClear');
    bar.querySelectorAll('.tag-color-filter-swatch').forEach(function (s) { s.remove(); });

    used.forEach(function (hex) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'tag-color-filter-swatch';
        swatch.dataset.colorFilter = hex;
        swatch.style.setProperty('--filter-color', hex);
        swatch.title = hex;
        bar.insertBefore(swatch, clearBtn);
    });

    if (hasUncolored) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'tag-color-filter-swatch tag-color-filter-none';
        swatch.dataset.colorFilter = '__none__';
        swatch.title = window.t ? window.t('tags.color_filter.none', {}, 'No color') : 'No color';
        bar.insertBefore(swatch, clearBtn);
    }

    bar.classList.toggle('initially-hidden', used.length === 0);
    syncTagsColorFilterUi();

    // Dropping a stale filter changes what should be visible, and a recolored
    // tag may no longer match the filters still active.
    filterTags();
}

/** Reflect the active filters on the swatches and the clear button. */
function syncTagsColorFilterUi() {
    const bar = document.getElementById('tagsColorFilter');
    if (!bar) return;

    bar.querySelectorAll('.tag-color-filter-swatch').forEach(function (swatch) {
        const active = activeColorFilters.has(swatch.dataset.colorFilter);
        swatch.classList.toggle('active', active);
        swatch.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const clearBtn = document.getElementById('tagsColorFilterClear');
    if (clearBtn) {
        clearBtn.classList.toggle('initially-hidden', activeColorFilters.size === 0);
    }
}

/**
 * Wire the color swatch bar: each swatch toggles one color, and several can be
 * active at once. Runs on top of the text filter rather than replacing it.
 */
function initTagsColorFilter() {
    const bar = document.getElementById('tagsColorFilter');
    if (!bar) return;

    bar.addEventListener('click', function (e) {
        const swatch = e.target.closest('.tag-color-filter-swatch');
        if (swatch) {
            const value = swatch.dataset.colorFilter;
            if (activeColorFilters.has(value)) {
                activeColorFilters.delete(value);
            } else {
                activeColorFilters.add(value);
            }
            syncTagsColorFilterUi();
            filterTags();
            return;
        }

        if (e.target.closest('.tag-color-filter-clear')) {
            activeColorFilters.clear();
            syncTagsColorFilterUi();
            filterTags();
        }
    });

    syncTagsColorFilterUi();
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
        // No search term, but a color filter still narrows the grid, so report
        // the count rather than leaving the "N tags total" line contradicting it.
        if (activeColorFilters.size > 0) {
            resultsDiv.style.display = 'block';
            resultsDiv.textContent = count === 1
                ? (window.t ? window.t('tags.color_filter.results_one', { count }, '1 tag matches the selected colors') : '1 tag matches the selected colors')
                : (window.t ? window.t('tags.color_filter.results_other', { count }, '{{count}} tags match the selected colors') : count + ' tags match the selected colors');
        } else {
            resultsDiv.style.display = 'none';
        }
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
