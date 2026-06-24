(function() {
    'use strict';

    // Global variables
    let activeTable = null;
    let activeCell = null;
    let contextMenu = null;

    // Use global translation function from globals.js
    const tr = window.t || function(key, vars, fallback) {
        return fallback || key;
    };

    /**
     * Creates the context menu for tables
     */
    function createTableContextMenu() {
        if (contextMenu) {
            return contextMenu;
        }

        contextMenu = document.createElement('div');
        contextMenu.className = 'table-context-menu';

        const menuItems = [
            { label: tr('table.context_menu.insert_row_above', 'Insert row above'), action: 'insertRowAbove', icon: '↑' },
            { label: tr('table.context_menu.insert_row_below', 'Insert row below'), action: 'insertRowBelow', icon: '↓' },
            { separator: true },
            { label: tr('table.context_menu.insert_column_left', 'Insert column left'), action: 'insertColLeft', icon: '←' },
            { label: tr('table.context_menu.insert_column_right', 'Insert column right'), action: 'insertColRight', icon: '→' },
            { separator: true },
            { label: tr('table.context_menu.delete_row', 'Delete row'), action: 'deleteRow', icon: '🗑️', danger: true },
            { label: tr('table.context_menu.delete_column', 'Delete column'), action: 'deleteCol', icon: '🗑️', danger: true },
            { separator: true },
            { label: tr('table.context_menu.delete_table', 'Delete table'), action: 'deleteTable', icon: '🗑️', danger: true }
        ];

        menuItems.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'table-context-menu-separator';
                contextMenu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'table-context-menu-item' + (item.danger ? ' danger' : '');
                menuItem.innerHTML = `<span style="width:20px;text-align:center">${item.icon}</span><span>${item.label}</span>`;

                menuItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeTableAction(item.action);
                    hideTableContextMenu();
                });

                contextMenu.appendChild(menuItem);
            }
        });

        document.body.appendChild(contextMenu);
        return contextMenu;
    }

    /**
     * Shows the context menu at the mouse position
     */
    function showTableContextMenu(x, y, table, cell) {
        activeTable = table;
        activeCell = cell;
        
        const menu = createTableContextMenu();
        menu.style.display = 'block';
        
        // Menu position
        let left = x;
        let top = y;
        
        // Adjust if menu overflows the window
        const menuRect = menu.getBoundingClientRect();
        if (left + menuRect.width > window.innerWidth) {
            left = window.innerWidth - menuRect.width - 10;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    /**
     * Hides the context menu
     */
    function hideTableContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
        activeTable = null;
        activeCell = null;
    }

    /**
     * Gets the row or column index
     */
    function getCellIndex(cell) {
        const row = cell.parentElement;
        const cellIndex = Array.from(row.children).indexOf(cell);
        const rowIndex = Array.from(row.parentElement.children).indexOf(row);
        return { rowIndex, cellIndex };
    }

    /**
     * Executes the context menu action
     */
    function executeTableAction(action) {
        if (!activeTable || !activeCell) return;

        const { rowIndex, cellIndex } = getCellIndex(activeCell);
        const tbody = activeTable.querySelector('tbody') || activeTable;
        const rows = Array.from(tbody.querySelectorAll('tr'));

        switch (action) {
            case 'insertRowAbove':
                insertRow(tbody, rowIndex, false);
                break;
            case 'insertRowBelow':
                insertRow(tbody, rowIndex, true);
                break;
            case 'insertColLeft':
                insertColumn(rows, cellIndex, false);
                break;
            case 'insertColRight':
                insertColumn(rows, cellIndex, true);
                break;
            case 'deleteRow':
                deleteRow(tbody, rowIndex);
                break;
            case 'deleteCol':
                deleteColumn(rows, cellIndex);
                break;
            case 'deleteTable':
                deleteTable();
                break;
        }

        // Trigger input event to save
        const noteentry = activeTable.closest('.noteentry');
        if (noteentry) {
            noteentry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Inserts a new row
     */
    function insertRow(tbody, index, after) {
        const rows = tbody.querySelectorAll('tr');
        const referenceRow = rows[index];
        const numCols = referenceRow.querySelectorAll('td, th').length;
        
        const newRow = document.createElement('tr');
        for (let i = 0; i < numCols; i++) {
            const cell = document.createElement('td');
            cell.style.cssText = 'border: 1px solid #ddd; padding: 8px; min-width: 50px;';
            cell.innerHTML = '&nbsp;';
            newRow.appendChild(cell);
        }

        if (after) {
            referenceRow.parentNode.insertBefore(newRow, referenceRow.nextSibling);
        } else {
            referenceRow.parentNode.insertBefore(newRow, referenceRow);
        }
    }

    /**
     * Inserts a new column
     */
    function insertColumn(rows, index, after) {
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            const referenceCell = cells[index];
            const newCell = document.createElement(referenceCell.tagName);
            newCell.style.cssText = 'border: 1px solid #ddd; padding: 8px; min-width: 50px;';
            newCell.innerHTML = '&nbsp;';

            if (after) {
                referenceCell.parentNode.insertBefore(newCell, referenceCell.nextSibling);
            } else {
                referenceCell.parentNode.insertBefore(newCell, referenceCell);
            }
        });
    }

    /**
     * Deletes a row
     */
    function deleteRow(tbody, index) {
        const rows = tbody.querySelectorAll('tr');
        if (rows.length <= 1) {
            alert(tr('table.context_menu.errors.cannot_delete_last_row', 'Cannot delete the last row of the table.'));
            return;
        }
        rows[index].remove();
    }

    /**
     * Deletes a column
     */
    function deleteColumn(rows, index) {
        // Check that at least 2 columns remain
        const firstRowCells = rows[0].querySelectorAll('td, th');
        if (firstRowCells.length <= 1) {
            alert(tr('table.context_menu.errors.cannot_delete_last_column', 'Cannot delete the last column of the table.'));
            return;
        }

        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells[index]) {
                cells[index].remove();
            }
        });
    }

    /**
     * Deletes the entire table
     */
    function deleteTable() {
        if (confirm(tr('table.context_menu.confirm.delete_table', 'Do you really want to delete this table?'))) {
            activeTable.remove();
            
            // Trigger input event to save
            const noteentry = document.querySelector('.noteentry');
            if (noteentry) {
                noteentry.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    /**
     * Initializes event listeners for tables
     */
    function initTableContextMenu() {
        // Listener for right-click on table cells
        document.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            const table = cell.closest('table.inserted-table');
            if (!table) return;

            // Check that we are in an editable note
            const noteentry = table.closest('.noteentry[contenteditable="true"]');
            if (!noteentry) return;

            e.preventDefault();
            e.stopPropagation();

            showTableContextMenu(e.clientX, e.clientY, table, cell);
        });

        // Close the context menu by clicking elsewhere
        document.addEventListener('click', (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) {
                hideTableContextMenu();
            }
            if (mdContextMenu && !mdContextMenu.contains(e.target)) {
                hideMdTableContextMenu();
            }
        });

        // Close the context menu with Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (contextMenu && contextMenu.style.display !== 'none') {
                    hideTableContextMenu();
                }
                if (mdContextMenu && mdContextMenu.style.display !== 'none') {
                    hideMdTableContextMenu();
                }
            }
        });
    }

    // ─── Markdown preview table context menu ─────────────────────────────────

    let mdContextMenu = null;
    let mdActiveTable = null;
    let mdActiveCell = null;
    let mdActiveNoteEntry = null;
    let mdContextMenuIsHeader = null; // track whether the cached menu was built for a header row

    function createMdTableContextMenu(isHeader) {
        // Rebuild if the header status changed (menu items differ)
        if (mdContextMenu && mdContextMenuIsHeader !== isHeader) {
            if (mdContextMenu.parentNode) mdContextMenu.parentNode.removeChild(mdContextMenu);
            mdContextMenu = null;
        }
        if (mdContextMenu) return mdContextMenu;

        mdContextMenuIsHeader = isHeader;
        mdContextMenu = document.createElement('div');
        mdContextMenu.className = 'table-context-menu md-table-context-menu';

        var menuItems = [];
        if (!isHeader) {
            menuItems.push({ label: tr('table.context_menu.insert_row_above', 'Insert row above'), action: 'insertRowAbove', icon: '↑' });
        }
        menuItems.push({ label: tr('table.context_menu.insert_row_below', 'Insert row below'), action: 'insertRowBelow', icon: '↓' });
        menuItems.push({ separator: true });
        menuItems.push({ label: tr('table.context_menu.insert_column_left', 'Insert column left'), action: 'insertColLeft', icon: '←' });
        menuItems.push({ label: tr('table.context_menu.insert_column_right', 'Insert column right'), action: 'insertColRight', icon: '→' });
        menuItems.push({ separator: true });
        if (!isHeader) {
            menuItems.push({ label: tr('table.context_menu.delete_row', 'Delete row'), action: 'deleteRow', icon: '🗑️', danger: true });
        }
        menuItems.push({ label: tr('table.context_menu.delete_column', 'Delete column'), action: 'deleteCol', icon: '🗑️', danger: true });

        menuItems.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'table-context-menu-separator';
                mdContextMenu.appendChild(sep);
            } else {
                const el = document.createElement('div');
                el.className = 'table-context-menu-item' + (item.danger ? ' danger' : '');
                el.innerHTML = `<span style="width:20px;text-align:center">${item.icon}</span><span>${item.label}</span>`;
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeMdTableAction(item.action);
                    hideMdTableContextMenu();
                });
                mdContextMenu.appendChild(el);
            }
        });

        document.body.appendChild(mdContextMenu);
        return mdContextMenu;
    }

    function showMdTableContextMenu(x, y, table, cell, noteEntry) {
        mdActiveTable = table;
        mdActiveCell = cell;
        mdActiveNoteEntry = noteEntry;

        const { rowIndex } = getMdCellIndex(cell);
        const isHeader = rowIndex === 0;

        const menu = createMdTableContextMenu(isHeader);
        menu.style.display = 'block';

        let left = x, top = y;
        const rect = menu.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
        if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 10;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    function hideMdTableContextMenu() {
        if (mdContextMenu) mdContextMenu.style.display = 'none';
        mdActiveTable = null;
        mdActiveCell = null;
        mdActiveNoteEntry = null;
    }

    function getMdCellIndex(cell) {
        const row = cell.parentElement;
        const cellIndex = Array.from(row.children).indexOf(cell);
        const allRows = Array.from(mdActiveTable.querySelectorAll('tr'));
        const rowIndex = allRows.indexOf(row);
        return { rowIndex, cellIndex };
    }

    function addMdScrollSnapshot(snapshots, target) {
        if (!target || snapshots.some(snapshot => snapshot.target === target)) {
            return;
        }

        snapshots.push({
            target: target,
            top: target.scrollTop || 0,
            left: target.scrollLeft || 0,
            overflowAnchor: target.style ? target.style.overflowAnchor : null
        });
    }

    function isMdScrollableElement(element) {
        return !!(element &&
            (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth));
    }

    function captureMdTableScrollState(previewDiv, editorScrollTarget) {
        const snapshots = [];
        const rightCol = document.getElementById('right_col');
        const scrollingElement = document.scrollingElement || document.documentElement;

        addMdScrollSnapshot(snapshots, previewDiv);
        addMdScrollSnapshot(snapshots, editorScrollTarget);
        addMdScrollSnapshot(snapshots, rightCol);

        let parent = previewDiv ? previewDiv.parentElement : null;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            if (isMdScrollableElement(parent)) {
                addMdScrollSnapshot(snapshots, parent);
            }
            parent = parent.parentElement;
        }

        addMdScrollSnapshot(snapshots, scrollingElement);

        return {
            snapshots: snapshots,
            windowX: window.pageXOffset || scrollingElement.scrollLeft || 0,
            windowY: window.pageYOffset || scrollingElement.scrollTop || 0
        };
    }

    function setMdTableScrollAnchoring(scrollState, disabled) {
        scrollState.snapshots.forEach(snapshot => {
            if (!snapshot.target.style) return;
            snapshot.target.style.overflowAnchor = disabled ? 'none' : (snapshot.overflowAnchor || '');
        });
    }

    function restoreMdTableScrollState(scrollState) {
        scrollState.snapshots.forEach(snapshot => {
            snapshot.target.scrollTop = snapshot.top;
            snapshot.target.scrollLeft = snapshot.left;
        });

        if (typeof window.scrollTo === 'function') {
            window.scrollTo(scrollState.windowX, scrollState.windowY);
        }
    }

    function restoreMdTableScrollStateAfterLayout(scrollState) {
        restoreMdTableScrollState(scrollState);

        requestAnimationFrame(() => {
            restoreMdTableScrollState(scrollState);
            requestAnimationFrame(() => {
                restoreMdTableScrollState(scrollState);
                setTimeout(() => {
                    restoreMdTableScrollState(scrollState);
                    setMdTableScrollAnchoring(scrollState, false);
                }, 100);
            });
        });
    }

    function markMdTableActionAsModified(noteId) {
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        window.noteid = noteId;

        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }

    function executeMdTableAction(action) {
        if (!mdActiveTable || !mdActiveCell || !mdActiveNoteEntry) return;

        const startLine = parseInt(mdActiveTable.getAttribute('data-start-line'), 10);
        if (isNaN(startLine)) return;

        const noteId = mdActiveNoteEntry.getAttribute('data-note-id') ||
            (mdActiveNoteEntry.id || '').replace('entry', '');
        const rawContent = mdActiveNoteEntry.getAttribute('data-markdown-content') || '';
        const lines = rawContent.split('\n');

        // data-start-line is computed from the pre-processed text (where Excalidraw blocks
        // are collapsed to a single placeholder line), so it may be smaller than the real
        // line index in rawContent when Excalidraw blocks appear before the table.
        // Find the actual table start by searching forward from startLine for the first
        // line that belongs to a markdown table with the same column count as the rendered table.
        const expectedCols = mdActiveTable.querySelectorAll('tr')[0]
            ? mdActiveTable.querySelectorAll('tr')[0].children.length
            : 0;

        let tableStart = -1;
        for (let li = startLine; li < lines.length; li++) {
            if (isMarkdownTableLine(lines[li])) {
                const cols = expectedCols > 0 ? getMarkdownTableCells(lines[li]).length : 0;
                if (expectedCols === 0 || cols === expectedCols) {
                    // Walk back to the actual start of this table block
                    let blockStart = li;
                    while (blockStart > 0 && isMarkdownTableLine(lines[blockStart - 1])) {
                        blockStart--;
                    }
                    tableStart = blockStart;
                    break;
                }
            }
        }
        if (tableStart < 0) return;

        let tableEnd = tableStart;
        while (tableEnd + 1 < lines.length && isMarkdownTableLine(lines[tableEnd + 1])) {
            tableEnd++;
        }

        const tableLines = lines.slice(tableStart, tableEnd + 1);

        // Separate header, separator, and data rows (by line index within tableLines)
        const separatorIdx = tableLines.findIndex(l => isMarkdownTableSeparatorLine(l));
        if (separatorIdx < 0) return;

        const { rowIndex, cellIndex } = getMdCellIndex(mdActiveCell);
        const numCols = getMarkdownTableCells(tableLines[0]).length;

        function makeEmptyRow(cols) {
            return '| ' + Array(cols).fill('   ').join(' | ') + ' |';
        }

        function makeEmptySeparatorCell(colIndex) {
            // Preserve alignment from separator
            const sep = tableLines[separatorIdx];
            const cells = getMarkdownTableCells(sep);
            if (colIndex < cells.length) {
                const c = cells[colIndex].trim();
                const left = c.startsWith(':');
                const right = c.endsWith(':');
                if (left && right) return ':---:';
                if (right) return '---:';
                if (left) return ':---';
            }
            return '---';
        }

        // rowIndex in the <table> counts all tr including header; map to tableLines index
        // header row → tableLines[0], body rows start after separator
        // In the rendered table: row 0 = header, row 1+ = body rows
        // In tableLines: index 0 = header, index separatorIdx = separator, index separatorIdx+1.. = body rows
        const tableLineIndex = rowIndex === 0
            ? 0
            : separatorIdx + rowIndex; // body row: rowIndex 1 → tableLines[separatorIdx+1]

        switch (action) {
            case 'insertRowAbove': {
                if (rowIndex === 0) break; // can't insert above the header row
                const newRow = makeEmptyRow(numCols);
                lines.splice(tableStart + tableLineIndex, 0, newRow);
                break;
            }
            case 'insertRowBelow': {
                const newRow = makeEmptyRow(numCols);
                // Clicking header → insert first data row after separator
                const insertAt = rowIndex === 0 ? tableStart + separatorIdx + 1 : tableStart + tableLineIndex + 1;
                lines.splice(insertAt, 0, newRow);
                break;
            }
            case 'insertColLeft':
            case 'insertColRight': {
                const after = action === 'insertColRight';
                const insertColIdx = after ? cellIndex + 1 : cellIndex;
                for (let li = tableStart; li <= tableEnd; li++) {
                    const isSep = isMarkdownTableSeparatorLine(lines[li]);
                    const cells = getMarkdownTableCells(lines[li]);
                    const newCell = isSep ? makeEmptySeparatorCell(cellIndex) : '   ';
                    cells.splice(insertColIdx, 0, newCell);
                    lines[li] = '| ' + cells.join(' | ') + ' |';
                }
                break;
            }
            case 'deleteRow': {
                const allDataRows = tableLines.length - separatorIdx - 1;
                if (allDataRows <= 1 && rowIndex !== 0) {
                    alert(tr('table.context_menu.errors.cannot_delete_last_row', 'Cannot delete the last row of the table.'));
                    return;
                }
                if (rowIndex === 0) return; // don't delete header
                lines.splice(tableStart + tableLineIndex, 1);
                break;
            }
            case 'deleteCol': {
                if (numCols <= 1) {
                    alert(tr('table.context_menu.errors.cannot_delete_last_column', 'Cannot delete the last column of the table.'));
                    return;
                }
                for (let li = tableStart; li <= tableEnd; li++) {
                    const cells = getMarkdownTableCells(lines[li]);
                    cells.splice(cellIndex, 1);
                    lines[li] = '| ' + cells.join(' | ') + ' |';
                }
                break;
            }
        }

        const newContent = lines.join('\n');
        mdActiveNoteEntry.setAttribute('data-markdown-content', newContent);

        const previewDiv = mdActiveNoteEntry.querySelector('.markdown-preview');
        const editorDiv = mdActiveNoteEntry.querySelector('.markdown-editor');
        const cmScroller = editorDiv && editorDiv.querySelector('.cm-scroller');
        const editorScrollTarget = cmScroller || editorDiv;

        const scrollState = captureMdTableScrollState(previewDiv, editorScrollTarget);
        setMdTableScrollAnchoring(scrollState, true);

        // Re-render preview (postProcess:false skips the 100ms setTimeout)
        if (previewDiv && typeof window.renderMarkdownPreview === 'function') {
            window.renderMarkdownPreview(previewDiv, newContent, noteId, { postProcess: false });
            if (typeof window.setupPreviewInteractivity === 'function') {
                window.setupPreviewInteractivity(noteId);
            }
        }

        // Update editor source
        if (editorDiv && typeof renderMarkdownEditorContent === 'function') {
            const previousSuppressInput = editorDiv._suppressMarkdownTableContextInput;
            editorDiv._suppressMarkdownTableContextInput = true;
            try {
                renderMarkdownEditorContent(editorDiv, newContent);
            } finally {
                editorDiv._suppressMarkdownTableContextInput = previousSuppressInput;
            }
        }

        markMdTableActionAsModified(noteId);
        restoreMdTableScrollStateAfterLayout(scrollState);
    }

    function isMarkdownTableLine(line) {
        return typeof isMarkdownTableRowLine === 'function'
            ? isMarkdownTableRowLine(line)
            : /\|/.test(line);
    }

    function isMarkdownTableSeparatorLine(line) {
        var trimmed = String(line || '').trim();
        if (!trimmed || trimmed.indexOf('|') === -1) return false;
        var cells = getMarkdownTableCells(trimmed);
        return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c.trim()));
    }

    function getMarkdownTableCells(line) {
        var trimmed = String(line || '').trim();
        if (!trimmed || trimmed.indexOf('|') === -1) return [];
        if (trimmed.charAt(0) === '|') trimmed = trimmed.slice(1);
        if (trimmed.charAt(trimmed.length - 1) === '|') trimmed = trimmed.slice(0, -1);
        return trimmed.split('|').map(c => c.trim());
    }

    // Exposed so setupPreviewInteractivity (markdown-handler.js) can call it
    window.showMdTableContextMenu = showMdTableContextMenu;
    window.hideMdTableContextMenu = hideMdTableContextMenu;

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTableContextMenu);
    } else {
        initTableContextMenu();
    }

    // Expose functions globally if needed
    window.tableContextMenu = {
        init: initTableContextMenu,
        show: showTableContextMenu,
        hide: hideTableContextMenu
    };

})();
