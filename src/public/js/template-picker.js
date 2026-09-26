/**
 * Template picker: the dialog the "/template" slash command opens
 * (js/slash-command.js). It lists the notes GET /api/v1/notes/templates
 * returns, with a filter field, and hands the clicked one back to the caller,
 * which pastes it at the caret the menu was opened from.
 *
 * Keyboard: the filter keeps the focus, the arrows move through the list,
 * Enter picks, Escape closes.
 */
(function () {
    'use strict';

    var dialog = null;
    // The open picker: its options, the loaded templates and the one the
    // keyboard points at. Null while closed.
    var current = null;
    var templatesRequest = null;

    function tr(key, fallback) {
        return (typeof window.t === 'function') ? window.t(key, null, fallback) : fallback;
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    // ------------------------------------------------------------------
    // The dialog
    // ------------------------------------------------------------------

    function buildDialog() {
        var modal = element('div', 'modal template-picker-modal');
        modal.id = 'templatePickerModal';

        var content = element('div', 'modal-content template-picker-content');

        var title = element('h3');
        title.appendChild(element('i', 'lucide lucide-stamp'));
        title.appendChild(document.createTextNode(' '));
        var titleText = element('span', 'template-picker-title');
        title.appendChild(titleText);
        content.appendChild(title);

        var search = element('input', 'template-picker-search');
        search.type = 'text';
        search.autocomplete = 'off';
        search.spellcheck = false;
        content.appendChild(search);

        var list = element('div', 'template-picker-list');
        list.setAttribute('role', 'listbox');
        content.appendChild(list);

        var buttons = element('div', 'modal-buttons');
        var cancel = element('button', 'btn-cancel');
        cancel.type = 'button';
        buttons.appendChild(cancel);
        content.appendChild(buttons);

        modal.appendChild(content);
        document.body.appendChild(modal);

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function (event) {
            if (event.target === modal && pressedOnBackdrop) cancelPicker();
            pressedOnBackdrop = false;
        });
        cancel.addEventListener('click', cancelPicker);
        search.addEventListener('input', function () {
            if (current) current.activeIndex = 0;
            render();
        });
        modal.addEventListener('keydown', handleKeydown);

        return {
            modal: modal,
            titleText: titleText,
            search: search,
            list: list,
            cancel: cancel
        };
    }

    function handleKeydown(event) {
        if (!current) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelPicker();
            return;
        }
        // Tab and Enter on the Cancel button keep their usual meaning
        if (event.target !== dialog.search) return;

        var count = current.visible.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!count) return;
            var step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current.activeIndex + step + count) % count, true);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (count) pick(current.visible[current.activeIndex]);
        }
    }

    function close() {
        if (!dialog) return;
        dialog.modal.style.display = 'none';
        current = null;
        templatesRequest = null;
    }

    function cancelPicker() {
        var onCancel = current && current.onCancel;
        close();
        if (typeof onCancel === 'function') onCancel();
    }

    function pick(note) {
        if (!current || !note) return;
        var onPick = current.onPick;
        close();
        if (typeof onPick === 'function') onPick(note);
    }

    // ------------------------------------------------------------------
    // The list
    // ------------------------------------------------------------------

    function loadTemplates(workspace) {
        var url = '/api/v1/notes/templates' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
        return fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) {
                return (data && data.success && Array.isArray(data.notes)) ? data.notes : null;
            })
            .catch(function () { return null; });
    }

    function matches(note, query) {
        if (query === '') return true;
        var haystack = String(note.heading || '') + ' ' + String(note.folder || '') + ' ' + String(note.workspace || '');
        return haystack.toLowerCase().indexOf(query) !== -1;
    }

    function setActive(index, scroll) {
        if (!current) return;
        current.activeIndex = index;
        var items = dialog.list.querySelectorAll('.template-picker-item');
        for (var i = 0; i < items.length; i++) {
            var active = (i === index);
            items[i].classList.toggle('is-active', active);
            items[i].setAttribute('aria-selected', active ? 'true' : 'false');
            if (active && scroll && typeof items[i].scrollIntoView === 'function') {
                items[i].scrollIntoView({ block: 'nearest' });
            }
        }
    }

    function renderTemplate(note, index) {
        var item = element('div', 'template-picker-item');
        item.setAttribute('role', 'option');

        var icon = element('i', 'lucide ' + (note.icon || 'lucide-file-text') + ' template-picker-item-icon');
        var iconColor = window.poznoteIconColorCss ? window.poznoteIconColorCss(note.icon_color) : note.icon_color;
        if (iconColor) icon.style.color = iconColor;
        item.appendChild(icon);

        var body = element('div', 'template-picker-item-content');
        body.appendChild(element('span', 'template-picker-item-title',
            note.heading || tr('note_reference.untitled', 'Untitled')));

        // Where it lives: the folder when the templates are spread over
        // several, and the workspace when it is not the one in view (a
        // "Templates" workspace)
        var otherWorkspace = (note.workspace && note.workspace !== current.workspace) ? note.workspace : '';
        var folder = current.showFolders ? (note.folder || '') : '';
        if (folder || otherWorkspace) {
            var meta = element('span', 'template-picker-item-meta');
            if (otherWorkspace) {
                var workspaceTag = element('span', 'template-picker-item-tag');
                workspaceTag.appendChild(element('i', 'lucide lucide-layers'));
                workspaceTag.appendChild(element('span', null, otherWorkspace));
                meta.appendChild(workspaceTag);
            }
            if (folder) {
                var folderTag = element('span', 'template-picker-item-tag');
                folderTag.appendChild(element('i', 'lucide lucide-folder'));
                folderTag.appendChild(element('span', null, folder));
                meta.appendChild(folderTag);
            }
            body.appendChild(meta);
        }
        item.appendChild(body);

        // mousedown would move the focus out of the filter field
        item.addEventListener('mousedown', function (event) { event.preventDefault(); });
        item.addEventListener('mousemove', function () {
            if (current && current.activeIndex !== index) setActive(index, false);
        });
        item.addEventListener('click', function () { pick(note); });
        return item;
    }

    function renderEmpty(text, hint) {
        var empty = element('div', 'template-picker-empty', text);
        if (hint) empty.appendChild(element('div', 'template-picker-empty-hint', hint));
        dialog.list.appendChild(empty);
    }

    function render() {
        if (!current) return;

        dialog.list.textContent = '';
        current.visible = [];

        if (current.templates === undefined) {
            renderEmpty(tr('common.loading', 'Loading...'));
            return;
        }
        if (current.templates === null) {
            renderEmpty(tr('slash_menu.template_load_failed', 'Could not load the templates'));
            return;
        }

        var all = current.templates.filter(function (note) {
            return String(note.id) !== String(current.excludeNoteId);
        });
        if (!all.length) {
            renderEmpty(tr('slash_menu.template_none', 'No templates yet'),
                tr('slash_menu.template_none_hint', 'Put notes in a folder or a workspace named "Templates"'));
            return;
        }

        current.showFolders = all.some(function (note) { return (note.folder || '') !== (all[0].folder || ''); });

        var query = String(dialog.search.value || '').trim().toLowerCase();
        current.visible = all.filter(function (note) { return matches(note, query); });
        if (!current.visible.length) {
            renderEmpty(tr('slash_menu.template_no_match', 'No template matches this filter'));
            return;
        }

        current.visible.forEach(function (note, index) {
            dialog.list.appendChild(renderTemplate(note, index));
        });
        setActive(Math.min(current.activeIndex, current.visible.length - 1), false);
    }

    // ------------------------------------------------------------------
    // Public entry point
    // ------------------------------------------------------------------

    /**
     * @param {object} options
     *   workspace      the workspace in view, whose "Templates" folders count
     *   excludeNoteId  the note being edited, which cannot be its own template
     *   onPick         called with the chosen template ({id, heading, type, ...})
     *   onCancel       called when the dialog closes without a pick
     */
    window.openTemplatePickerDialog = function (options) {
        options = options || {};

        if (!dialog) {
            dialog = buildDialog();
        }

        current = {
            workspace: options.workspace || '',
            excludeNoteId: options.excludeNoteId || '',
            onPick: options.onPick,
            onCancel: options.onCancel,
            templates: undefined,
            visible: [],
            showFolders: false,
            activeIndex: 0
        };

        dialog.titleText.textContent = tr('slash_menu.template_picker_title', 'Insert a template');
        dialog.search.placeholder = tr('slash_menu.template_filter_placeholder', 'Filter templates...');
        dialog.search.value = '';
        dialog.cancel.textContent = tr('common.cancel', 'Cancel');

        dialog.modal.style.display = 'flex';
        render();
        // Right away rather than on a timer: until then, keys still land in
        // the editor the menu was opened from
        dialog.search.focus();

        var request = loadTemplates(current.workspace);
        templatesRequest = request;
        request.then(function (templates) {
            // A dialog closed and reopened in the meantime owns the list now
            if (templatesRequest !== request || !current) return;
            current.templates = templates;
            render();
        });
    };
})();
