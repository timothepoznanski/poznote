/**
 * Speed dial (public/speed_dial.php): a favicon can take seconds to fail on a
 * site that does not answer, and an image in the page holds its load event for
 * that long. So the icons are only asked for once the page has loaded, and an
 * icon only covers the letter under it once it is there. Listening in the
 * capture phase: load and error do not bubble.
 * The filter bar narrows the tiles down by title or link; Settings can hide it
 * (card:speedDialFilter).
 *
 * Tiles and groups are dragged the way the dashboard's cards are (js/dashboard-page.js):
 * the HTML5 drag for a mouse, a long press then a move on touch, the position
 * saved through POST /api/v1/notes/reorder. Not while the filter is on: a rank
 * among the tiles it leaves has no meaning.
 */
window.addEventListener('load', function () {
    document.querySelectorAll('.speed-dial-icon img[data-src]').forEach(function (img) {
        img.src = img.getAttribute('data-src');
    });
});

document.addEventListener('load', function (event) {
    var target = event.target;
    if (target && target.tagName === 'IMG' && target.closest('.speed-dial-icon')) {
        target.classList.add('is-loaded');
    }
}, true);

document.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target.tagName === 'IMG' && target.closest('.speed-dial-icon')) {
        target.remove();
    }
}, true);

// The address shown over a tile opens upwards at the bottom of the window
document.addEventListener('mouseover', function (event) {
    var tile = event.target && event.target.closest ? event.target.closest('.speed-dial-tile') : null;
    if (tile) tile.classList.toggle('is-url-above', tile.getBoundingClientRect().bottom + 100 > window.innerHeight);
});

// Background image, from its button in the floating stack at the bottom-right
// (ui_customization_panel.php): the modal of the workspaces' background
// (js/workspace-background.js), for the view's own image.
document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('edgeSpeedDialBackgroundBtn');
    if (!button) return;

    button.addEventListener('click', function () {
        window.openSpeedDialBackgroundModal(document.body.getAttribute('data-workspace') || '');
    });
});

// Several speed dials, as the diary has several journals: "New speed dial" asks
// for a name, and a right-click or a long press on a pill renames or deletes it
// (api/v1/speed-dial/boards.php). The default one has no menu: it cannot change.
document.addEventListener('DOMContentLoaded', function () {
    var bar = document.getElementById('speedDialBoards');
    if (!bar) return;

    var workspace = document.body.getAttribute('data-workspace') || '';
    var menu = null;

    function txt(name) {
        return bar.getAttribute('data-txt-' + name) || '';
    }

    function boardUrl(tag) {
        return 'speed_dial.php?workspace=' + encodeURIComponent(workspace) + (tag ? '&board=' + encodeURIComponent(tag) : '');
    }

    function send(method, fields) {
        fields.workspace = workspace;
        var options = {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(fields)
        };
        return fetch('api/v1/speed-dial/boards.php', options).then(function (response) {
            return response.json().catch(function () { return {}; });
        }).then(function (result) {
            if (result.success) return result;
            throw new Error(result.code === 'exists' ? txt('exists') : (result.code === 'invalid_name' ? txt('invalid') : txt('error')));
        });
    }

    // Same markup as js/modal-alerts.js, so it matches the app's other dialogs
    function openNameModal(title, value, confirmText, submit) {
        var overlay = document.createElement('div');
        overlay.className = 'alert-modal-overlay show';
        overlay.innerHTML =
            '<div class="alert-modal speed-dial-name-modal">' +
                '<div class="alert-modal-header"><h3 class="alert-modal-title"></h3></div>' +
                '<div class="alert-modal-body">' +
                    '<input type="text" class="speed-dial-name-input" maxlength="50">' +
                    '<p class="speed-dial-name-error" hidden></p>' +
                '</div>' +
                '<div class="alert-modal-footer">' +
                    '<button type="button" class="alert-modal-button secondary"></button>' +
                    '<button type="button" class="alert-modal-button primary"></button>' +
                '</div>' +
            '</div>';
        overlay.querySelector('.alert-modal-title').textContent = title;
        var input = overlay.querySelector('input');
        var error = overlay.querySelector('.speed-dial-name-error');
        var cancel = overlay.querySelector('.secondary');
        var confirm = overlay.querySelector('.primary');
        input.placeholder = txt('placeholder');
        input.value = value;
        cancel.textContent = txt('cancel');
        confirm.textContent = confirmText;
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
        }

        function go() {
            var name = input.value.trim();
            if (!name) {
                input.focus();
                return;
            }
            if (name === value) {
                close();
                return;
            }
            confirm.disabled = true;
            submit(name).catch(function (err) {
                confirm.disabled = false;
                error.textContent = err.message;
                error.hidden = false;
                input.focus();
            });
        }

        cancel.addEventListener('click', close);
        confirm.addEventListener('click', go);
        overlay.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                go();
            } else if (event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        });
        input.focus();
        input.select();
    }

    function closeMenu() {
        if (menu) menu.remove();
        menu = null;
    }

    function openMenu(event, pill) {
        closeMenu();
        menu = document.createElement('div');
        menu.className = 'speed-dial-board-menu';
        menu.setAttribute('role', 'menu');
        [
            { label: txt('rename'), icon: 'lucide-pencil', run: function () {
                openNameModal(txt('rename-title'), pill.getAttribute('data-name'), txt('rename'), function (name) {
                    return send('PATCH', { tag: pill.getAttribute('data-tag'), name: name }).then(function (result) {
                        window.location.href = boardUrl(result.tag);
                    });
                });
            } },
            { label: txt('delete'), icon: 'lucide-trash-2', danger: true, run: function () {
                window.modalAlert.confirm(txt('delete-confirm'), pill.getAttribute('data-name'), { danger: true, confirmText: txt('delete') }).then(function (confirmed) {
                    if (!confirmed) return;
                    send('DELETE', { tag: pill.getAttribute('data-tag') }).then(function () {
                        window.location.href = boardUrl('');
                    }).catch(function (err) {
                        window.modalAlert.alert(err.message, 'error');
                    });
                });
            } }
        ].forEach(function (entry) {
            var item = document.createElement('button');
            item.type = 'button';
            item.setAttribute('role', 'menuitem');
            item.className = 'speed-dial-board-menu-item' + (entry.danger ? ' danger' : '');
            item.innerHTML = '<i class="lucide ' + entry.icon + '"></i><span></span>';
            item.querySelector('span').textContent = entry.label;
            item.addEventListener('click', function () {
                closeMenu();
                entry.run();
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        var rect = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8)) + 'px';
    }

    var newButton = document.getElementById('speedDialNewBtn');
    if (newButton) {
        newButton.addEventListener('click', function () {
            openNameModal(txt('new-title'), '', txt('create'), function (name) {
                return send('POST', { name: name }).then(function (result) {
                    window.location.href = boardUrl(result.tag);
                });
            });
        });
    }

    // Only for the owner of the account
    if (bar.hasAttribute('data-can-edit')) {
        bar.addEventListener('contextmenu', function (event) {
            var pill = event.target.closest ? event.target.closest('.speed-dial-board[data-tag]') : null;
            if (!pill || event.shiftKey) return;
            event.preventDefault();
            openMenu(event, pill);
        });
    }

    document.addEventListener('mousedown', function (event) {
        if (menu && !menu.contains(event.target)) closeMenu();
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu();
    }, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
});

// Size of the tiles: the button opens a slider, which resizes them as it moves
// and saves on release, in the setting speed_dial_tile_size. speed_dial.php
// renders the width on <body>, css/speed-dial.css derives the rest from it.
document.addEventListener('DOMContentLoaded', function () {
    var wrapper = document.getElementById('speedDialSize');
    if (!wrapper) return;

    var button = document.getElementById('speedDialSizeBtn');
    var popover = document.getElementById('speedDialSizePopover');
    var slider = document.getElementById('speedDialSizeInput');
    var value = document.getElementById('speedDialSizeValue');
    var saved = slider.value;

    function showSize(size) {
        slider.value = size;
        value.textContent = size;
        document.body.style.setProperty('--speed-dial-tile-width', size + 'px');
    }

    function setOpen(open) {
        popover.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    button.addEventListener('click', function () {
        setOpen(popover.hidden);
        if (!popover.hidden) slider.focus();
    });

    slider.addEventListener('input', function () {
        showSize(slider.value);
    });

    slider.addEventListener('change', function () {
        var before = saved;
        var size = slider.value;
        saved = size;

        fetch('api/v1/settings/speed_dial_tile_size', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: size })
        }).then(function (response) {
            return window.readApiJson(response).then(function (data) {
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                }
            });
        }).catch(function (error) {
            saved = before;
            showSize(before);
            window.modalAlert.alert(window.apiErrorMessage(error), 'error');
        });
    });

    document.addEventListener('mousedown', function (event) {
        if (!wrapper.contains(event.target)) setOpen(false);
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !popover.hidden) {
            setOpen(false);
            button.focus();
        }
    }, true);
});

// Colour of a group's label, from its right-click menu, saved straight away in
// the setting speed_dial_label_colors: note id => #rrggbb. Touch
// screens keep their own menu: a long press moves the group.
document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('speedDialGrid');
    var menu = document.getElementById('noteTitleMenu');
    if (!grid || !menu) return;

    var colors = JSON.parse(grid.getAttribute('data-label-colors'));
    var swatches = menu.querySelectorAll('.note-title-menu-swatch');
    var current = null; // the label the menu is open on

    function noteIdOf(label) {
        return label.closest('.speed-dial-group').getAttribute('data-note-id');
    }

    function colorOf(label) {
        return colors[noteIdOf(label)] || '';
    }

    function setColor(label, color) {
        if (color) {
            colors[noteIdOf(label)] = color;
            label.style.setProperty('--speed-dial-label-color', window.poznoteIconColorCss(color));
        } else {
            delete colors[noteIdOf(label)];
            label.style.removeProperty('--speed-dial-label-color');
            if (!label.getAttribute('style')) label.removeAttribute('style');
        }
    }

    function refreshSwatches() {
        var color = current ? colorOf(current) : '';
        swatches.forEach(function (swatch) {
            var on = swatch.getAttribute('data-color') === color;
            swatch.classList.toggle('is-selected', on);
            swatch.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function closeMenu(restoreFocus) {
        if (menu.hidden) return;
        menu.hidden = true;
        if (restoreFocus && current) current.focus();
        current = null;
    }

    function openMenu(event, label) {
        current = label;
        menu.hidden = false;
        refreshSwatches();

        // A keyboard context menu (Shift+F10, menu key) reports no pointer
        // position: open under the label instead.
        var fromKeyboard = event.clientX === 0 && event.clientY === 0;
        var labelRect = label.getBoundingClientRect();
        var x = fromKeyboard ? labelRect.left : event.clientX;
        var y = fromKeyboard ? labelRect.bottom : event.clientY;
        var padding = 8;
        var rect = menu.getBoundingClientRect();
        var left = x + rect.width > window.innerWidth - padding ? x - rect.width : x;
        var top = y + rect.height > window.innerHeight - padding ? y - rect.height : y;
        menu.style.left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding)) + 'px';
        menu.style.top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding)) + 'px';

        if (fromKeyboard) (menu.querySelector('.is-selected') || swatches[0]).focus();
    }

    grid.addEventListener('contextmenu', function (event) {
        if (event.shiftKey) return;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
        var label = event.target.closest && event.target.closest('.speed-dial-group-name');
        if (!label) return;
        event.preventDefault();
        openMenu(event, label);
    });

    // Shown at once, put back when the server refuses it
    swatches.forEach(function (swatch) {
        swatch.addEventListener('click', function () {
            if (!current) return;
            var label = current;
            var before = colorOf(label);
            setColor(label, swatch.getAttribute('data-color'));
            refreshSwatches();

            fetch('api/v1/settings/speed_dial_label_colors', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ value: JSON.stringify(colors) })
            }).then(function (response) {
                return window.readApiJson(response).then(function (data) {
                    if (!response.ok || !data || !data.success) {
                        throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                    }
                });
            }).catch(function (error) {
                setColor(label, before);
                refreshSwatches();
                window.modalAlert.alert(window.apiErrorMessage(error), 'error');
            });
        });
    });

    menu.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    menu.addEventListener('keydown', function (event) {
        if (event.key === 'Tab') {
            // Tabbing cycles inside the menu rather than leaving it open behind the focus
            var items = Array.prototype.slice.call(swatches);
            var next = items.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1);
            event.preventDefault();
            items[(next + items.length) % items.length].focus();
        }
    });

    document.addEventListener('mousedown', function (event) {
        if (!menu.contains(event.target)) closeMenu(false);
    }, true);
    document.addEventListener('scroll', function () { closeMenu(false); }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu(true);
    }, true);
    window.addEventListener('resize', function () { closeMenu(false); });
    window.addEventListener('blur', function () { closeMenu(false); });
});

document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('speedDialGrid');
    var input = document.getElementById('speedDialFilterInput');
    if (!grid || !input) return;

    var clear = document.getElementById('speedDialFilterClear');
    var noResults = document.getElementById('speedDialNoResults');
    var tiles = grid.querySelectorAll('.speed-dial-tile');
    // What moves: a note, as a tile or as the group of its links
    var items = grid.querySelectorAll('.speed-dial-item');
    var groups = grid.querySelectorAll('.speed-dial-group');
    var workspace = document.body.getAttribute('data-workspace') || '';

    function isFiltered() {
        return input.value.trim() !== '';
    }

    // The list of a page spanning every workspace mixes notes no rank can join
    function tilesReorderable() {
        return workspace !== '' && !isFiltered();
    }

    function syncDraggable() {
        var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        var draggable = !coarse && tilesReorderable();
        items.forEach(function (item) {
            item.setAttribute('draggable', draggable ? 'true' : 'false');
        });
    }

    function applyFilter() {
        var query = input.value.trim().toLowerCase();
        var shown = 0;

        function matches(element) {
            return element.getAttribute('data-filter').toLowerCase().indexOf(query) !== -1;
        }

        tiles.forEach(function (tile) {
            // The name of a group shows all its tiles
            var group = tile.closest('.speed-dial-group');
            var match = matches(tile) || (!!group && matches(group));
            tile.hidden = !match;
            if (match) shown++;
        });
        groups.forEach(function (group) {
            group.querySelectorAll('.speed-dial-group-row').forEach(function (row) {
                row.hidden = !row.querySelector('.speed-dial-tile:not([hidden])');
            });
            group.hidden = !group.querySelector('.speed-dial-tile:not([hidden])');
        });
        grid.classList.toggle('is-filtered', query !== '');
        noResults.hidden = shown > 0;
        input.parentNode.classList.toggle('has-value', input.value !== '');
        syncDraggable();
    }

    input.addEventListener('input', applyFilter);
    clear.addEventListener('click', function () {
        input.value = '';
        applyFilter();
        input.focus();
    });
    syncDraggable();

    // --- Moving a tile ------------------------------------------------------

    var dragged = null; // the item being moved, by mouse or finger

    // A group takes the whole width: above or below it, not beside it
    function dropPosition(event, item) {
        var rect = item.getBoundingClientRect();
        if (item.classList.contains('speed-dial-group')) {
            return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        }
        return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    }

    // Tile under the pointer or, over a gap, the nearest one, so a drop
    // between two tiles still lands somewhere.
    function findDropTarget(event) {
        if (!event.target || !event.target.closest) return null;
        var direct = event.target.closest('.speed-dial-item');
        if (direct && direct !== dragged) {
            return { tile: direct, position: dropPosition(event, direct) };
        }
        if (direct || !grid.contains(event.target)) return null;

        var best = null;
        items.forEach(function (tile) {
            if (tile === dragged) return;
            var rect = tile.getBoundingClientRect();
            var dx = event.clientX < rect.left ? rect.left - event.clientX : (event.clientX > rect.right ? event.clientX - rect.right : 0);
            var dy = event.clientY < rect.top ? rect.top - event.clientY : (event.clientY > rect.bottom ? event.clientY - rect.bottom : 0);
            var distance = dx * dx + dy * dy;
            if (!best || distance < best.distance) {
                best = { tile: tile, distance: distance };
            }
        });
        return best ? { tile: best.tile, position: dropPosition(event, best.tile) } : null;
    }

    function clearDropIndicators() {
        items.forEach(function (tile) {
            tile.classList.remove('drop-before', 'drop-after');
        });
    }

    function showDropIndicator(target) {
        clearDropIndicators();
        if (target) target.tile.classList.add(target.position === 'before' ? 'drop-before' : 'drop-after');
    }

    function endDrag() {
        clearDropIndicators();
        if (dragged) dragged.classList.remove('is-dragging');
        dragged = null;
    }

    // Moved at once; on failure the tile goes back and the error is shown.
    function moveTile(tile, target) {
        var previousNext = tile.nextElementSibling;
        grid.insertBefore(tile, target.position === 'before' ? target.tile : target.tile.nextElementSibling);

        fetch('api/v1/notes/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                scope: 'speed_dial',
                note_id: parseInt(tile.getAttribute('data-note-id'), 10),
                target_note_id: parseInt(target.tile.getAttribute('data-note-id'), 10),
                position: target.position,
                workspace: workspace,
                board: document.body.getAttribute('data-board') || ''
            })
        }).then(function (response) {
            return window.readApiJson(response).then(function (data) {
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                }
            });
        }).catch(function (error) {
            grid.insertBefore(tile, previousNext);
            var detail = error && window.apiErrorMessage(error);
            var message = grid.getAttribute('data-txt-reorder-error');
            window.modalAlert.alert(detail ? message + ' ' + detail : message, 'error');
        });
    }

    // Mouse

    grid.addEventListener('dragstart', function (event) {
        var tile = event.target && event.target.closest ? event.target.closest('.speed-dial-item') : null;
        if (!tile || !tilesReorderable()) {
            event.preventDefault();
            return;
        }
        dragged = tile;
        // Firefox needs data for the drag to start at all
        try {
            event.dataTransfer.setData('text/plain', tile.getAttribute('data-note-id'));
            event.dataTransfer.effectAllowed = 'move';
        } catch (error) { /* ignore */ }
        // Faded once the browser has taken its drag image of the tile
        setTimeout(function () { tile.classList.add('is-dragging'); }, 0);
    });

    grid.addEventListener('dragover', function (event) {
        if (!dragged) return;
        var target = findDropTarget(event);
        showDropIndicator(target);
        if (!target) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    });

    grid.addEventListener('dragleave', function (event) {
        if (!dragged) return;
        // Moving between children of the grid is not leaving it
        if (event.relatedTarget && grid.contains(event.relatedTarget)) return;
        clearDropIndicators();
    });

    grid.addEventListener('drop', function (event) {
        if (!dragged) return;
        event.preventDefault();
        var target = findDropTarget(event);
        var tile = dragged;
        endDrag();
        if (target) moveTile(tile, target);
    });

    // Cancelled drags (Escape, drop outside the grid)
    grid.addEventListener('dragend', endDrag);

    // Touch

    var LONG_PRESS_MS = 450;
    // How far the finger may wander before a press counts as a scroll, and
    // how far a held tile must move before it is dragged
    var TOUCH_SLOP = 8;
    var press = null; // the finger currently down on a tile

    function activatePress() {
        if (!press || press.active) return;
        clearTimeout(press.timer);
        press.active = true;
        if (navigator.vibrate) {
            try { navigator.vibrate(10); } catch (error) { /* not allowed */ }
        }
    }

    function startTouchDrag() {
        var rect = press.tile.getBoundingClientRect();
        var ghost = press.tile.cloneNode(true);
        ghost.classList.add('speed-dial-ghost');
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        document.body.appendChild(ghost);
        dragged = press.tile;
        dragged.classList.add('is-dragging');
        press.ghost = ghost;
        press.frame = requestAnimationFrame(autoScroll);
    }

    function updateTouchTarget() {
        var element = document.elementFromPoint(press.x, press.y);
        press.target = element ? findDropTarget({ target: element, clientX: press.x, clientY: press.y }) : null;
        showDropIndicator(press.target);
    }

    // Scrolls the page while the finger holds a tile near the top or the
    // bottom of the screen, faster closer to the edge
    function autoScroll() {
        if (!press || !press.ghost) return;
        var edge = 64;
        var speed = 0;
        if (press.y < edge) {
            speed = -Math.ceil((edge - press.y) / 5);
        } else if (press.y > window.innerHeight - edge) {
            speed = Math.ceil((press.y - (window.innerHeight - edge)) / 5);
        }
        if (speed) {
            var scroller = document.scrollingElement || document.documentElement;
            var before = scroller.scrollTop;
            scroller.scrollTop = before + speed;
            if (scroller.scrollTop !== before) updateTouchTarget();
        }
        press.frame = requestAnimationFrame(autoScroll);
    }

    function finishPress(drop) {
        var ended = press;
        press = null;
        if (!ended) return null;
        clearTimeout(ended.timer);
        if (ended.ghost) {
            cancelAnimationFrame(ended.frame);
            ended.ghost.remove();
            var tile = dragged;
            endDrag();
            if (drop && ended.target) moveTile(tile, ended.target);
        }
        return ended;
    }

    grid.addEventListener('touchstart', function (event) {
        finishPress(false);
        if (event.touches.length !== 1 || !event.target.closest) return;
        var tile = event.target.closest('.speed-dial-item');
        if (!tile || event.target.closest('.speed-dial-edit') || !tilesReorderable()) return;
        var touch = event.touches[0];
        press = {
            tile: tile,
            startX: touch.clientX,
            startY: touch.clientY,
            x: touch.clientX,
            y: touch.clientY,
            active: false,
            ghost: null,
            target: null,
            frame: 0,
            timer: setTimeout(activatePress, LONG_PRESS_MS)
        };
    }, { passive: true });

    grid.addEventListener('touchmove', function (event) {
        if (!press || !event.touches.length) return;
        press.x = event.touches[0].clientX;
        press.y = event.touches[0].clientY;
        var moved = Math.abs(press.x - press.startX) > TOUCH_SLOP || Math.abs(press.y - press.startY) > TOUCH_SLOP;

        if (!press.active) {
            // Moving before the long press is a scroll, and so is any move
            // the browser no longer lets us cancel
            if (moved || !event.cancelable) finishPress(false);
            return;
        }
        // Held: the finger now moves the tile instead of the page
        if (event.cancelable) event.preventDefault();
        if (!press.ghost) {
            if (!moved) return;
            startTouchDrag();
        }
        press.ghost.style.transform = 'translate(' + (press.x - press.startX) + 'px, ' + (press.y - press.startY) + 'px)';
        updateTouchTarget();
    }, { passive: false });

    grid.addEventListener('touchend', function (event) {
        var ended = finishPress(true);
        // The long press already acted: no click must follow the link
        if (ended && ended.active && event.cancelable) event.preventDefault();
    });

    grid.addEventListener('touchcancel', function () {
        finishPress(false);
    });

    // Android fires it for a long press, possibly ahead of the timer: the
    // press goes on, without the browser's link menu
    grid.addEventListener('contextmenu', function (event) {
        if (!press) return;
        event.preventDefault();
        activatePress();
    });
});
