// Tables of the notes: a bar above the table being worked on, and "+"
// buttons along a table under the mouse (discussion #1673). Markdown notes
// and HTML (rich text) notes alike.
//
// The bar shows while a cell is in use: a cell typed in (rich text), the caret
// in the source of a table (live preview, the editor of the classic and split
// views), a cell clicked in the preview, the caret in a cell of an HTML note.
// It inserts rows and columns, aligns
// the column, deletes, and its Σ sets a formula in the cell (the right click
// still opens the whole table menu). It steps aside while text is selected
// in the table: the formatting bar of the selection takes that place.
// The "+" buttons below and to the right of a drawn table add a row or a
// column at the end, mouse only (touch screens have the bar).
//
// Everything goes through the table menus (js/table-context-menu.js). For
// Markdown (window.pzMdTable) a target names the table and the cell, the
// change is made in the note's source by line; an HTML note's table is
// changed in place (window.pzHtmlTable).
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) {
        return fallback || key;
    };

    // The table in use:
    //   kind       'drawn' (the editor's drawn table: rich text, live preview),
    //              'source' (the editor shows its source), 'preview',
    //              'html' (a table of an HTML note)
    //   noteEntry, editor (the CodeMirror host, editor kinds)
    //   table      the table element (html)
    //   startLine  the table's first line (editor kinds)
    //   tableIndex the table's place among the preview's tables (preview)
    //   rowIndex, cellIndex  the cell, as drawn (row 0: the header)
    let active = null;
    let bar = null;
    let deleteMenu = null;
    let rowHandle = null;
    let columnHandle = null;
    let hoverTable = null;
    let hoverHideTimer = null;
    let repositionFrame = 0;

    function getApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    function getMdTable() {
        return window.pzMdTable || null;
    }

    function getHtmlTable() {
        return window.pzHtmlTable || null;
    }

    function isHtml() {
        return !!active && active.kind === 'html';
    }

    // The menu of the kind in use (Markdown or HTML)
    function isAnyMenuOpen() {
        return !!((getMdTable() && getMdTable().isMenuOpen()) || (getHtmlTable() && getHtmlTable().isMenuOpen()));
    }

    function icon(name) {
        return '<i class="lucide ' + name + '"></i>';
    }

    // Lucide has no "row above / below, column left / right": the row or the
    // column next to which a "+" is inserted, drawn in the same stroke
    const INSERT_ICONS = {
        insertRowAbove: '<rect x="4" y="12" width="16" height="7" rx="1"/><path d="M12 3v6M9 6h6"/>',
        insertRowBelow: '<rect x="4" y="5" width="16" height="7" rx="1"/><path d="M12 15v6M9 18h6"/>',
        insertColLeft: '<rect x="12" y="4" width="7" height="16" rx="1"/><path d="M3 12h6M6 9v6"/>',
        insertColRight: '<rect x="5" y="4" width="7" height="16" rx="1"/><path d="M15 12h6M18 9v6"/>'
    };

    function insertIcon(action) {
        return '<svg class="md-table-bar-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + INSERT_ICONS[action] + '</svg>';
    }

    // ─── The table in use ────────────────────────────────────────────────────

    function getPreviewTables(noteEntry) {
        const preview = noteEntry ? noteEntry.querySelector('.markdown-preview') : null;
        return preview ? Array.from(preview.querySelectorAll('table[data-start-line]')) : [];
    }

    // The drawn table in use, null when the editor shows it as source
    function getActiveTableElement() {
        if (!active) return null;
        if (active.kind === 'html') return active.table.isConnected ? active.table : null;
        if (active.kind === 'preview') {
            const table = getPreviewTables(active.noteEntry)[active.tableIndex];
            return table && table.offsetParent !== null ? table : null;
        }
        const api = getApi();
        return api && typeof api.getTableElement === 'function' ? api.getTableElement(active.editor, active.startLine) : null;
    }

    function getCellOf(table, rowIndex, cellIndex) {
        const rows = table ? table.querySelectorAll('tr') : [];
        const row = rows[Math.max(0, Math.min(rowIndex, rows.length - 1))];
        return row ? row.children[Math.max(0, Math.min(cellIndex, row.children.length - 1))] || null : null;
    }

    // An HTML note's table: what the bar needs to know of the cell
    function getHtmlTarget(table, cell) {
        const htmlTable = getHtmlTable();
        if (!htmlTable || !cell) return null;
        const rows = htmlTable.getRows(table);
        const row = cell.parentElement;
        return {
            html: true,
            table: table,
            cell: cell,
            rowIndex: rows.indexOf(row),
            cellIndex: Array.from(row.children).indexOf(cell),
            rowCount: rows.length,
            columnCount: rows[0] ? rows[0].children.length : 0,
            align: window.pzTableColumns ? window.pzTableColumns.readLineAlignment(table, cell, 'column') : null
        };
    }

    // A target for js/table-context-menu.js, as the table is now
    function getActiveTarget() {
        if (isHtml()) {
            const table = getActiveTableElement();
            const rows = table && getHtmlTable() ? getHtmlTable().getRows(table) : [];
            const row = rows[Math.min(active.rowIndex, rows.length - 1)];
            return row ? getHtmlTarget(table, row.children[Math.min(active.cellIndex, row.children.length - 1)]) : null;
        }
        const mdTable = getMdTable();
        if (!active || !mdTable) return null;
        if (active.kind === 'source') {
            const api = getApi();
            const located = api && typeof api.getTableAtSelection === 'function' ? api.getTableAtSelection(active.editor) : null;
            return located ? mdTable.getSourceTarget(active.editor, located) : null;
        }
        const cell = getCellOf(getActiveTableElement(), active.rowIndex, active.cellIndex);
        return cell ? mdTable.getTarget(cell) : null;
    }

    function activate(state) {
        const changed = !active || active.kind !== state.kind || active.editor !== state.editor || active.table !== state.table ||
            active.noteEntry !== state.noteEntry || active.startLine !== state.startLine || active.tableIndex !== state.tableIndex;
        active = state;
        if (changed) closeDeleteMenu();
        markPreviewCell();
        refreshBar();
    }

    function deactivate() {
        if (!active) return;
        active = null;
        closeDeleteMenu();
        markPreviewCell();
        if (bar) bar.hidden = true;
    }

    // The preview has no caret: the cell in use is outlined
    function markPreviewCell() {
        document.querySelectorAll('.md-table-active-cell').forEach(cell => cell.classList.remove('md-table-active-cell'));
        if (!active || active.kind !== 'preview') return;
        const cell = getCellOf(getActiveTableElement(), active.rowIndex, active.cellIndex);
        if (cell) cell.classList.add('md-table-active-cell');
    }

    // ─── The bar ─────────────────────────────────────────────────────────────

    function createButton(action, iconName, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'md-table-bar-btn';
        button.dataset.action = action;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.innerHTML = INSERT_ICONS[iconName] ? insertIcon(iconName) : icon(iconName);
        return button;
    }

    function createSeparator() {
        const separator = document.createElement('span');
        separator.className = 'md-table-bar-separator';
        return separator;
    }

    function createBar() {
        if (bar) return bar;
        bar = document.createElement('div');
        bar.className = 'md-table-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', tr('table.toolbar.label', 'Table'));
        bar.hidden = true;

        bar.appendChild(createButton('insertRowAbove', 'insertRowAbove', tr('table.context_menu.insert_row_above', 'Insert row above')));
        bar.appendChild(createButton('insertRowBelow', 'insertRowBelow', tr('table.context_menu.insert_row_below', 'Insert row below')));
        bar.appendChild(createButton('insertColLeft', 'insertColLeft', tr('table.context_menu.insert_column_left', 'Insert column left')));
        bar.appendChild(createButton('insertColRight', 'insertColRight', tr('table.context_menu.insert_column_right', 'Insert column right')));
        bar.appendChild(createSeparator());
        [
            { align: 'left', icon: 'lucide-align-left', title: tr('table.context_menu.align_left', 'Left') },
            { align: 'center', icon: 'lucide-align-center', title: tr('table.context_menu.align_center', 'Center') },
            { align: 'right', icon: 'lucide-align-right', title: tr('table.context_menu.align_right', 'Right') }
        ].forEach(option => {
            const button = createButton('align', option.icon, tr('table.context_menu.align_column', 'Align column') + ': ' + option.title);
            button.dataset.align = option.align;
            bar.appendChild(button);
        });
        bar.appendChild(createSeparator());
        bar.appendChild(createButton('delete', 'lucide-trash-2', tr('table.toolbar.delete', 'Delete')));
        bar.appendChild(createButton('formulas', 'lucide-sigma', tr('table.context_menu.formulas', 'Formulas')));

        // The cell typed in, or the editor, keeps the focus and the caret
        bar.addEventListener('mousedown', e => e.preventDefault());
        bar.addEventListener('click', e => {
            const button = e.target.closest('.md-table-bar-btn');
            if (!button || button.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            const action = button.dataset.action;
            if (action === 'delete') {
                toggleDeleteMenu(button);
            } else if (action === 'formulas') {
                openFormulaMenu(button);
            } else {
                closeDeleteMenu();
                runAction(action, button.dataset.align);
            }
        });

        document.body.appendChild(bar);
        return bar;
    }

    // Text selected in the table in use (or in the source of it): the
    // formatting bar shows over the selection, the table bar would cover it
    function hasTextSelected() {
        if (!active) return false;
        if (active.kind === 'source') {
            const api = getApi();
            const offsets = api && typeof api.getSelectionOffsets === 'function' ? api.getSelectionOffsets(active.editor) : null;
            return !!offsets && offsets.end > offsets.start;
        }
        const sel = window.getSelection();
        const table = getActiveTableElement();
        // (an HTML table's range of cells, highlighted by a drag, too)
        const cells = window.pzTableCellSelection;
        if (isHtml() && cells && cells.isActive() && cells.getTable() === table) return true;
        return !!(sel && !sel.isCollapsed && sel.rangeCount && table && sel.getRangeAt(0).intersectsNode(table));
    }

    function refreshBar() {
        if (!active) return;
        const target = hasTextSelected() ? null : getActiveTarget();
        if (!target) {
            if (bar) bar.hidden = true;
            closeDeleteMenu();
            return;
        }
        createBar();
        // (an HTML table has no header row of its own: rows go anywhere)
        const isHeader = !target.html && target.rowIndex === 0;
        bar.querySelector('[data-action="insertRowAbove"]').disabled = isHeader;
        // Formulas: body cells, whose shown value is known (not the source)
        bar.querySelector('[data-action="formulas"]').disabled = !window.pzTableFormulas ||
            (target.html ? target.cell.tagName !== 'TD' : (isHeader || target.cellText === undefined));
        bar.querySelectorAll('[data-action="align"]').forEach(button => {
            button.classList.toggle('active', button.dataset.align === target.align);
        });
        bar.hidden = false;
        positionBar();
    }

    // The part of the screen the element can be seen in: the window, cut by
    // every box around it that scrolls or hides what overflows, in the
    // direction it does (a wide table's own box scrolls sideways only, and
    // must not push the bar down into the table)
    function getClipRect(element) {
        let clip = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
        const cuts = (overflow, scrollSize, clientSize) =>
            overflow === 'hidden' || overflow === 'clip' || (overflow !== 'visible' && scrollSize > clientSize + 1);
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = window.getComputedStyle(parent);
            const vertical = cuts(style.overflowY, parent.scrollHeight, parent.clientHeight);
            const horizontal = cuts(style.overflowX, parent.scrollWidth, parent.clientWidth);
            if (!vertical && !horizontal) continue;
            const rect = parent.getBoundingClientRect();
            if (vertical) {
                clip.top = Math.max(clip.top, rect.top);
                clip.bottom = Math.min(clip.bottom, rect.bottom);
            }
            if (horizontal) {
                clip.left = Math.max(clip.left, rect.left);
                clip.right = Math.min(clip.right, rect.right);
            }
        }
        return clip;
    }

    function getActiveRect() {
        const table = getActiveTableElement();
        if (table) return { rect: table.getBoundingClientRect(), element: table };
        if (active && active.kind !== 'preview') {
            const api = getApi();
            const rect = api && typeof api.getTableRect === 'function' ? api.getTableRect(active.editor, active.startLine) : null;
            if (rect) return { rect: rect, element: active.editor.querySelector('.cm-content') || active.editor };
        }
        return null;
    }

    function positionBar() {
        if (!bar || bar.hidden || !active) return;
        const box = getActiveRect();
        if (!box || !box.element.isConnected) {
            deactivate();
            return;
        }
        const rect = box.rect;
        const clip = getClipRect(box.element);
        const height = bar.offsetHeight;
        const width = bar.offsetWidth;
        const gap = 6;

        let top = rect.top - height - gap;
        // Scrolled past the top of the table: the bar stays at the top of what
        // is seen of it, as long as some of it is left
        if (top < clip.top + 2) top = clip.top + 2;
        const visible = rect.bottom > clip.top + height + gap && rect.top < clip.bottom - gap;
        bar.style.visibility = visible ? '' : 'hidden';

        const left = Math.max(clip.left + 2, Math.min(rect.left, clip.right - width - 2));
        bar.style.top = Math.round(top) + 'px';
        bar.style.left = Math.round(Math.max(4, Math.min(left, window.innerWidth - width - 4))) + 'px';
        if (deleteMenu && deleteMenu.style.display !== 'none') placeMenuUnder(deleteMenu, bar.querySelector('[data-action="delete"]'));
    }

    let refreshFrame = 0;

    function scheduleRefresh() {
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            followHtmlCaret();
            refreshBar();
        });
    }

    function schedulePosition() {
        if (repositionFrame) return;
        repositionFrame = requestAnimationFrame(() => {
            repositionFrame = 0;
            positionBar();
            positionHandles();
        });
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    function runAction(action, value) {
        const target = getActiveTarget();
        if (!target) return;
        if (target.html) {
            runOnHtmlTable(target, action, value);
            return;
        }
        if (!getMdTable()) return;
        runOnTarget(target, action, value, getActiveTableElement());
    }

    // The table changes in place and the caret goes to the cell the action
    // leaves the user in, which the bar follows (selectionchange)
    function runOnHtmlTable(target, action, value) {
        const htmlTable = getHtmlTable();
        if (!htmlTable) return;
        if (action === 'align') value = { scope: 'column', align: value };
        htmlTable.run(target.table, target.cell, action, value);
        scheduleRefresh();
    }

    // table: the drawn table of the target (preview: the bar goes back to it)
    function runOnTarget(target, action, value, table) {
        const mdTable = getMdTable();
        // The cell being typed in is written back first
        const api = getApi();
        if (target.editor && api && typeof api.finishTableEdit === 'function') api.finishTableEdit(target.editor);
        const kind = target.editor ? null : 'preview';
        const tableIndex = kind && table ? getPreviewTables(target.noteEntry).indexOf(table) : -1;
        mdTable.run(target, action, value).then(result => {
            if (!result) {
                refreshBar();
                return;
            }
            if (!result.focus) {
                deactivate();
                return;
            }
            if (kind) {
                activate({
                    kind: 'preview',
                    noteEntry: target.noteEntry,
                    tableIndex: tableIndex,
                    rowIndex: result.focus.rowIndex,
                    cellIndex: result.focus.cellIndex
                });
                return;
            }
            // The editor goes to the cell (js/table-context-menu.js): rich text
            // opens it, which brings the bar back (focusin); the source moves
            // the caret (markdown-selection-change)
            if (active && active.editor === target.editor) {
                active.startLine = result.startLine;
                active.rowIndex = result.focus.rowIndex;
                active.cellIndex = result.focus.cellIndex;
            }
            requestAnimationFrame(refreshBar);
        });
    }

    function openFormulaMenu(button) {
        const htmlTable = getHtmlTable();
        if (isHtml() && htmlTable) {
            if (htmlTable.isMenuOpen()) {
                htmlTable.hideMenu();
                return;
            }
            closeDeleteMenu();
            const target = getActiveTarget();
            if (!target) return;
            const rect = button.getBoundingClientRect();
            htmlTable.showFormulaMenu(rect.left, rect.bottom + 4, target.table, target.cell);
            return;
        }
        const mdTable = getMdTable();
        if (!mdTable) return;
        if (mdTable.isMenuOpen()) {
            mdTable.hideMenu();
            return;
        }
        closeDeleteMenu();
        // The cell being typed in shows its raw text: written back first, it
        // shows the value a removed formula leaves
        const api = getApi();
        if (active && active.kind === 'drawn' && api && typeof api.finishTableEdit === 'function') api.finishTableEdit(active.editor);
        const target = getActiveTarget();
        if (!target) return;
        const rect = button.getBoundingClientRect();
        mdTable.showFormulaMenu(rect.left, rect.bottom + 4, target);
    }

    function closeDeleteMenu() {
        if (deleteMenu) deleteMenu.style.display = 'none';
    }

    function placeMenuUnder(menu, button) {
        const rect = button.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        let top = rect.bottom + 4;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
        menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
        menu.style.top = top + 'px';
    }

    function toggleDeleteMenu(button) {
        if (deleteMenu && deleteMenu.style.display !== 'none') {
            closeDeleteMenu();
            return;
        }
        const target = getActiveTarget();
        if (!target) return;
        if (!deleteMenu) {
            deleteMenu = document.createElement('div');
            deleteMenu.className = 'table-context-menu md-table-bar-menu';
            [
                { action: 'deleteRow', label: tr('table.context_menu.delete_row', 'Delete row') },
                { action: 'deleteCol', label: tr('table.context_menu.delete_column', 'Delete column') },
                { separator: true },
                { action: 'deleteTable', label: tr('table.context_menu.delete_table', 'Delete table') }
            ].forEach(item => {
                if (item.separator) {
                    const separator = document.createElement('div');
                    separator.className = 'table-context-menu-separator';
                    deleteMenu.appendChild(separator);
                    return;
                }
                const el = document.createElement('div');
                el.className = 'table-context-menu-item danger';
                el.dataset.action = item.action;
                el.innerHTML = '<span style="width:20px;text-align:center">' + icon('lucide-trash-2') + '</span><span></span>';
                el.lastChild.textContent = item.label;
                deleteMenu.appendChild(el);
            });
            deleteMenu.addEventListener('mousedown', e => e.preventDefault());
            deleteMenu.addEventListener('click', e => {
                const item = e.target.closest('.table-context-menu-item');
                if (!item || item.classList.contains('disabled')) return;
                e.preventDefault();
                e.stopPropagation();
                closeDeleteMenu();
                runAction(item.dataset.action);
            });
            document.body.appendChild(deleteMenu);
        }
        // A table keeps one row and one column, a Markdown table its header too
        deleteMenu.querySelector('[data-action="deleteRow"]').classList.toggle('disabled',
            target.html ? target.rowCount <= 1 : (target.rowIndex === 0 || target.rowCount <= 2));
        deleteMenu.querySelector('[data-action="deleteCol"]').classList.toggle('disabled', target.columnCount <= 1);
        deleteMenu.style.display = 'block';
        placeMenuUnder(deleteMenu, button);
    }

    // ─── "+" buttons along a table under the mouse ───────────────────────────

    const canHover = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;

    // A table of an HTML note being edited, or null
    function getHtmlNoteTable(element) {
        const table = element && element.closest ? element.closest('table') : null;
        const noteEntry = table ? table.closest('.noteentry[contenteditable="true"]') : null;
        if (!noteEntry || noteEntry.getAttribute('data-note-type') === 'markdown') return null;
        return table.closest('.markdown-preview, .markdown-editor') ? null : table;
    }

    // A drawn table of a note that can be edited (Markdown or HTML), or null
    function getEditableTable(element) {
        const table = element && element.closest ? element.closest('table') : null;
        if (!table) return null;
        if (getHtmlNoteTable(table)) return table;
        const noteEntry = table.closest('.noteentry');
        if (!noteEntry || (typeof isMarkdownEntryReadOnly === 'function' && isMarkdownEntryReadOnly(noteEntry))) return null;
        if (table.matches('.markdown-preview table[data-start-line]')) return table;
        const editor = table.closest('.markdown-editor');
        if (editor && table.closest('.cm-live-block-table') && !editor.classList.contains('markdown-editor-readonly')) return table;
        return null;
    }

    function createHandle(className, title, onClick) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'md-table-handle ' + className;
        handle.title = title;
        handle.setAttribute('aria-label', title);
        handle.innerHTML = icon('lucide-plus');
        handle.hidden = true;
        handle.addEventListener('mousedown', e => e.preventDefault());
        handle.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        handle.addEventListener('mouseenter', () => clearTimeout(hoverHideTimer));
        handle.addEventListener('mouseleave', e => leaveHover(e.relatedTarget));
        document.body.appendChild(handle);
        return handle;
    }

    function createHandles() {
        if (rowHandle) return;
        rowHandle = createHandle('md-table-handle-row', tr('table.toolbar.add_row', 'Add a row'), () => addAtEnd('row'));
        columnHandle = createHandle('md-table-handle-column', tr('table.toolbar.add_column', 'Add a column'), () => addAtEnd('column'));
    }

    function addAtEnd(what) {
        const mdTable = getMdTable();
        const table = hoverTable;
        hideHandles();
        if (!table || !table.isConnected) return;
        const html = !!getHtmlNoteTable(table);
        const rows = html && getHtmlTable() ? getHtmlTable().getRows(table) : Array.from(table.querySelectorAll('tr'));
        if (!rows.length) return;
        const cell = what === 'row'
            ? rows[rows.length - 1].children[0]
            : rows[0].children[rows[0].children.length - 1];
        if (html) {
            const target = getHtmlTarget(table, cell);
            if (target) runOnHtmlTable(target, what === 'row' ? 'insertRowBelow' : 'insertColRight');
            return;
        }
        if (!mdTable) return;
        const target = cell ? mdTable.getTarget(cell) : null;
        if (!target) return;
        runOnTarget(target, what === 'row' ? 'insertRowBelow' : 'insertColRight', undefined, table);
    }

    function hideHandles() {
        clearTimeout(hoverHideTimer);
        hoverTable = null;
        if (rowHandle) rowHandle.hidden = true;
        if (columnHandle) columnHandle.hidden = true;
    }

    function leaveHover(related) {
        clearTimeout(hoverHideTimer);
        // (the box of a wide table counts as the table: its scrollbar is on the
        // way to the row button)
        const area = hoverTable ? hoverTable.closest('.markdown-table-scroll') || hoverTable : null;
        if (related && (related === rowHandle || related === columnHandle ||
            (area && area.contains(related)))) return;
        // (time to cross the gap between the table and a button)
        hoverHideTimer = setTimeout(hideHandles, 250);
    }

    function positionHandles() {
        if (!hoverTable || !rowHandle) return;
        if (!hoverTable.isConnected) {
            hideHandles();
            return;
        }
        const rect = hoverTable.getBoundingClientRect();
        // A wide Markdown table scrolls in its box (#1701): the buttons go around
        // the box, the row button under its scrollbar and the column button
        // beside it, wherever the table is scrolled to
        const box = hoverTable.closest('.markdown-table-scroll');
        const edges = box ? box.getBoundingClientRect() : rect;
        const clip = getClipRect(box || hoverTable);
        const size = 16;
        // (clear of the column resize grip along an HTML table's edge)
        const gap = 6;

        const rowTop = edges.bottom + gap;
        const rowLeft = Math.max(edges.left, clip.left);
        const rowWidth = Math.min(edges.right, clip.right) - rowLeft;
        rowHandle.hidden = rowTop + size > clip.bottom || rowTop < clip.top || rowWidth < size;
        rowHandle.style.top = Math.round(rowTop) + 'px';
        rowHandle.style.left = Math.round(rowLeft) + 'px';
        rowHandle.style.width = Math.round(rowWidth) + 'px';

        const columnLeft = box ? Math.min(edges.right + gap, clip.right - size) : rect.right + gap;
        const columnTop = Math.max(rect.top, clip.top);
        const columnHeight = Math.min(rect.bottom, clip.bottom) - columnTop;
        columnHandle.hidden = columnLeft + size > clip.right || columnHeight < size;
        columnHandle.style.left = Math.round(columnLeft) + 'px';
        columnHandle.style.top = Math.round(columnTop) + 'px';
        columnHandle.style.height = Math.round(columnHeight) + 'px';
    }

    function onMouseOver(e) {
        if (canHover && !canHover.matches) return;
        if (e.target === rowHandle || e.target === columnHandle || (e.target.closest && e.target.closest('.md-table-handle'))) return;
        const table = getEditableTable(e.target);
        if (!table) {
            if (hoverTable) leaveHover(e.target);
            return;
        }
        clearTimeout(hoverHideTimer);
        if (table === hoverTable) return;
        createHandles();
        hoverTable = table;
        positionHandles();
    }

    // ─── Following the cell in use ───────────────────────────────────────────

    function onFocusIn(e) {
        const cell = e.target.closest ? e.target.closest('.cm-live-cell-editing') : null;
        if (!cell) return;
        const editor = cell.closest('.markdown-editor');
        const mdTable = getMdTable();
        const target = editor && mdTable ? mdTable.getTarget(cell) : null;
        if (!target) return;
        activate({
            kind: 'drawn',
            noteEntry: target.noteEntry,
            editor: editor,
            startLine: target.startLine,
            rowIndex: target.rowIndex,
            cellIndex: target.cellIndex
        });
    }

    function onSelectionChange(e) {
        const editor = e.target && e.target.closest ? e.target.closest('.markdown-editor') : null;
        const api = getApi();
        if (!editor || !api || typeof api.getTableAtSelection !== 'function') return;
        const located = api.hasFocus(editor) ? api.getTableAtSelection(editor) : null;
        const mdTable = getMdTable();
        const target = located && mdTable ? mdTable.getSourceTarget(editor, located) : null;
        if (target) {
            activate({
                kind: 'source',
                noteEntry: target.noteEntry,
                editor: editor,
                startLine: target.startLine,
                rowIndex: target.rowIndex,
                cellIndex: target.cellIndex
            });
        } else if (active && active.kind === 'source' && active.editor === editor) {
            deactivate();
        }
    }

    // The caret in a cell of an HTML note's table brings the bar there
    function followHtmlCaret() {
        const sel = window.getSelection();
        let node = sel && sel.rangeCount ? sel.anchorNode : null;
        if (node && node.nodeType === 3) node = node.parentElement;
        const cell = node && node.closest ? node.closest('td, th') : null;
        const table = cell ? getHtmlNoteTable(cell) : null;
        const target = table && table === cell.closest('table') ? getHtmlTarget(table, cell) : null;
        if (target) {
            if (!isHtml() || active.table !== table || active.rowIndex !== target.rowIndex || active.cellIndex !== target.cellIndex) {
                activate({
                    kind: 'html',
                    noteEntry: table.closest('.noteentry'),
                    table: table,
                    rowIndex: target.rowIndex,
                    cellIndex: target.cellIndex
                });
            }
        } else if (isHtml()) {
            deactivate();
        }
    }

    function onPreviewClick(e) {
        const cell = e.target.closest ? e.target.closest('td, th') : null;
        const table = cell ? getEditableTable(cell) : null;
        if (!table || !table.matches('.markdown-preview table')) return;
        const noteEntry = table.closest('.noteentry');
        const row = cell.parentElement;
        activate({
            kind: 'preview',
            noteEntry: noteEntry,
            tableIndex: getPreviewTables(noteEntry).indexOf(table),
            rowIndex: Array.from(table.querySelectorAll('tr')).indexOf(row),
            cellIndex: Array.from(row.children).indexOf(cell)
        });
    }

    function isInsideTools(node) {
        if (!node || !node.closest) return false;
        if (node.closest('.md-table-bar, .md-table-bar-menu, .md-table-handle, .table-context-menu')) return true;
        // The confirmation of "Delete table"
        return !!node.closest('.modal, .modal-alert, [role="dialog"]');
    }

    function onPointerDown(e) {
        if (!active || isInsideTools(e.target)) return;
        closeDeleteMenu();
        // A click in the table in use, or in the editor whose source is in use
        // (the caret then says), keeps the bar
        const table = getActiveTableElement();
        if (table && table.contains(e.target)) return;
        if (active.kind === 'source' && active.editor.contains(e.target)) return;
        // (HTML: the caret says, once the click has moved it)
        if (isHtml() && active.noteEntry.contains(e.target)) return;
        deactivate();
    }

    // Right click in the source of a table (live preview, classic and split
    // editor): the table menu, as on a drawn table; Shift + right click leaves
    // the menu of the editor
    function onContextMenu(e) {
        if (e.shiftKey || !e.target.closest) return;
        const content = e.target.closest('.markdown-editor .cm-content');
        if (!content || e.target.closest('.cm-live-block')) return;
        const editor = content.closest('.markdown-editor');
        const api = getApi();
        const mdTable = getMdTable();
        if (!api || !mdTable || typeof api.getTableAtPoint !== 'function') return;
        const target = mdTable.getSourceTarget(editor, api.getTableAtPoint(editor, e.clientX, e.clientY));
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        const offsets = api.getSelectionOffsets(editor);
        const copyText = offsets && offsets.end > offsets.start && typeof api.sliceText === 'function'
            ? api.sliceText(editor, offsets.start, offsets.end)
            : '';
        mdTable.showMenu(e.clientX, e.clientY, target, copyText);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && active && !isAnyMenuOpen()) {
            if (deleteMenu && deleteMenu.style.display !== 'none') {
                closeDeleteMenu();
                return;
            }
            deactivate();
        }
    }

    function init() {
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('markdown-selection-change', onSelectionChange);
        document.addEventListener('focusin', e => {
            if (e.target && e.target.classList && e.target.classList.contains('cm-content')) onSelectionChange(e);
        });
        document.addEventListener('click', onPreviewClick);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('mouseover', onMouseOver);
        document.addEventListener('scroll', schedulePosition, true);
        window.addEventListener('resize', schedulePosition);
        // Selecting text hides the bar, letting go of it brings it back
        document.addEventListener('selectionchange', scheduleRefresh);
        // Typing in the source moves the table's edges
        document.addEventListener('input', e => {
            if (active && active.editor && e.target === active.editor) schedulePosition();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
