/**
 * Tag actions shared by the tags page (js/list_tags.js) and the right-click
 * menu on a tag inside a note (js/clickable-tags.js): the tag colors, the
 * color and rename dialogs, and renaming a tag in every note (the tags page;
 * a note's menu renames the tag in that note only).
 *
 * window.TAG_COLORS maps a lowercased tag name to a palette id or '#rrggbb'
 * (same semantics as note colors), persisted in the 'tag_colors' setting.
 * window.NOTE_COLOR_PALETTE is the palette those ids resolve through.
 */
(function () {
    'use strict';

    function t(key, fallback) {
        return window.t ? window.t(key, {}, fallback) : fallback;
    }

    function colorKey(tagName) {
        return String(tagName || '').trim().toLowerCase();
    }

    // ─── Colors ────────────────────────────────────────────────────────────────

    function getColorsMap() {
        if (!window.TAG_COLORS || typeof window.TAG_COLORS !== 'object') {
            window.TAG_COLORS = {};
        }
        return window.TAG_COLORS;
    }

    function getPalette() {
        return Array.isArray(window.NOTE_COLOR_PALETTE) ? window.NOTE_COLOR_PALETTE : [];
    }

    function resolveColorValueHex(value) {
        if (typeof value !== 'string' || value === '') return '';
        if (value.charAt(0) === '#') return value;
        const entry = getPalette().find(function (c) { return c.id === value.toLowerCase(); });
        return entry ? entry.hex : '';
    }

    /** The tag's color as a hex value, or '' when it has none. */
    function resolveHex(tagName) {
        return resolveColorValueHex(getColorsMap()[colorKey(tagName)]);
    }

    function saveColors(callback) {
        fetch('/api/v1/settings/tag_colors', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: JSON.stringify(getColorsMap()) })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) { if (callback) callback(!!(data && data.success)); })
        .catch(function () { if (callback) callback(false); });
    }

    /** Set (or with an empty value, remove) a tag's color and persist it. */
    function setColor(tagName, colorValue, callback) {
        const key = colorKey(tagName);
        if (!key) return;
        const map = getColorsMap();
        if (colorValue) {
            map[key] = colorValue;
        } else {
            delete map[key];
        }
        saveColors(callback);
    }

    /**
     * Carry a renamed tag's color over to its new name. A tag renamed into one
     * that already has a color (merging a typo into the right tag) keeps that
     * color rather than taking the typo's.
     */
    function moveColor(oldName, newName) {
        const map = getColorsMap();
        const oldKey = colorKey(oldName);
        const newKey = colorKey(newName);
        if (oldKey === newKey || !Object.prototype.hasOwnProperty.call(map, oldKey)) return;
        if (!Object.prototype.hasOwnProperty.call(map, newKey)) {
            map[newKey] = map[oldKey];
        }
        delete map[oldKey];
        saveColors();
    }

    /**
     * Color picker for one tag. Resolves true once the new color is saved,
     * false when saving failed (the user has been told), null when cancelled.
     */
    function openColorDialog(tagName) {
        return new Promise(function (resolve) {
            const currentValue = getColorsMap()[colorKey(tagName)] || '';

            const overlay = document.createElement('div');
            overlay.className = 'alert-modal-overlay';
            overlay.style.zIndex = '10000';

            const modal = document.createElement('div');
            modal.className = 'alert-modal';

            const header = document.createElement('div');
            header.className = 'alert-modal-header';
            const titleEl = document.createElement('h3');
            titleEl.className = 'alert-modal-title';
            titleEl.textContent = t('tags.color.modal_title', 'Tag color') + ' — ' + tagName;
            header.appendChild(titleEl);

            const body = document.createElement('div');
            body.className = 'alert-modal-body';

            let selectedValue = currentValue;

            const grid = document.createElement('div');
            grid.className = 'tag-color-grid';

            // Custom hex color, mirroring the note color picker's custom option
            const customInput = document.createElement('input');

            function refreshSelection() {
                grid.querySelectorAll('.tag-color-swatch').forEach(function (swatch) {
                    swatch.classList.toggle('selected', swatch.dataset.value === selectedValue);
                });
                customInput.classList.toggle('selected', !!selectedValue && selectedValue.charAt(0) === '#');
            }

            getPalette().forEach(function (color) {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'tag-color-swatch';
                swatch.dataset.value = color.id;
                swatch.style.background = color.hex;
                swatch.title = color.name || color.id;
                swatch.addEventListener('click', function () {
                    selectedValue = (selectedValue === color.id) ? '' : color.id;
                    refreshSelection();
                });
                grid.appendChild(swatch);
            });

            customInput.type = 'color';
            customInput.className = 'tag-color-swatch tag-color-custom';
            customInput.title = t('note_color.custom', 'Custom color');
            customInput.value = (currentValue && currentValue.charAt(0) === '#') ? currentValue : '#3b82f6';
            customInput.addEventListener('input', function () {
                selectedValue = customInput.value;
                refreshSelection();
            });
            grid.appendChild(customInput);

            body.appendChild(grid);

            const footer = document.createElement('div');
            footer.className = 'alert-modal-footer';

            function closeColorModal(cb) {
                document.removeEventListener('keydown', onKeydown, true);
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); if (cb) cb(); }, 300);
            }

            function cancel() {
                closeColorModal(function () { resolve(null); });
            }

            function onKeydown(e) {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    cancel();
                }
            }

            function persist(value) {
                closeColorModal(function () {
                    setColor(tagName, value, function (success) {
                        if (!success && window.modalAlert) {
                            window.modalAlert.alert(
                                t('tags.color.apply_error', 'Could not update the tag color.'),
                                'error'
                            );
                        }
                        resolve(success);
                    });
                });
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'alert-modal-button secondary';
            removeBtn.textContent = t('note_color.remove', 'Remove color');
            removeBtn.addEventListener('click', function () { persist(''); });

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'alert-modal-button secondary';
            cancelBtn.textContent = t('common.cancel', 'Cancel');
            cancelBtn.addEventListener('click', cancel);

            const applyBtn = document.createElement('button');
            applyBtn.className = 'alert-modal-button primary';
            applyBtn.textContent = t('common.apply', 'Apply');
            applyBtn.addEventListener('click', function () { persist(selectedValue); });

            footer.appendChild(removeBtn);
            footer.appendChild(cancelBtn);
            footer.appendChild(applyBtn);

            modal.appendChild(header);
            modal.appendChild(body);
            modal.appendChild(footer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', onKeydown, true);

            refreshSelection();
            requestAnimationFrame(function () { overlay.classList.add('show'); });
        });
    }

    // ─── Rename ────────────────────────────────────────────────────────────────

    /**
     * A tag name as the server stores it: separators become underscores, as
     * in the rename endpoint (spaces and commas both split a tag list).
     */
    function normalizeName(name) {
        return String(name || '').trim().replace(/[\s,]+/g, '_');
    }

    /** Resolves the typed name, or null when cancelled or left empty. */
    function openRenameDialog(oldName) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'alert-modal-overlay';
            overlay.style.zIndex = '10000';

            const modal = document.createElement('div');
            modal.className = 'alert-modal';

            const header = document.createElement('div');
            header.className = 'alert-modal-header';

            const titleEl = document.createElement('h3');
            titleEl.className = 'alert-modal-title';
            titleEl.textContent = t('tags.rename.title', 'Rename tag');
            header.appendChild(titleEl);

            const body = document.createElement('div');
            body.className = 'alert-modal-body';
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.gap = '8px';

            const labelEl = document.createElement('label');
            labelEl.textContent = t('tags.rename.label', 'New name');
            labelEl.style.fontWeight = '500';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.className = 'tag-rename-input';
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('spellcheck', 'false');

            body.appendChild(labelEl);
            body.appendChild(input);

            const footer = document.createElement('div');
            footer.className = 'alert-modal-footer';

            function closeInputModal(value) {
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); resolve(value); }, 300);
            }

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'alert-modal-button secondary';
            cancelBtn.textContent = t('common.cancel', 'Cancel');
            cancelBtn.addEventListener('click', function () { closeInputModal(null); });

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'alert-modal-button primary';
            confirmBtn.textContent = t('tags.action.rename', 'Rename');
            confirmBtn.addEventListener('click', function () {
                closeInputModal(input.value.trim() || null);
            });

            input.addEventListener('keydown', function (e) {
                // Kept away from the note's own key handlers underneath
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmBtn.click();
                }
                if (e.key === 'Escape') cancelBtn.click();
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);

            modal.appendChild(header);
            modal.appendChild(body);
            modal.appendChild(footer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            requestAnimationFrame(function () {
                overlay.classList.add('show');
            });

            // Select all text in the input for quick replacement
            setTimeout(function () { input.focus(); input.select(); }, 50);
        });
    }

    /**
     * Rename a tag in every note of the workspace ('' = every workspace the
     * session may touch) and carry its color over. Resolves the name as
     * stored on success, null when nothing was renamed (the user has been
     * told why when it failed).
     */
    function rename(oldName, newName, workspace) {
        const target = normalizeName(newName);
        if (!target || target === oldName) return Promise.resolve(null);

        function fail(message) {
            if (window.modalAlert) {
                window.modalAlert.alert(message, 'error');
            }
            return null;
        }

        return fetch('/api/v1/tags/' + encodeURIComponent(oldName), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ new_name: target, workspace: workspace || undefined })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data || !data.success) {
                return fail((data && data.message) || t('tags.rename.error', 'Rename failed'));
            }
            moveColor(oldName, target);
            return target;
        })
        .catch(function () {
            return fail(t('ui.alerts.network_error', 'Network error'));
        });
    }

    window.PoznoteTagActions = {
        getColorsMap: getColorsMap,
        resolveHex: resolveHex,
        setColor: setColor,
        openColorDialog: openColorDialog,
        normalizeName: normalizeName,
        openRenameDialog: openRenameDialog,
        rename: rename
    };
})();
