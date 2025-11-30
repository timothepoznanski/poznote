(function() {
    'use strict';

    // Global variables
    let activeTable = null;
    let activeCell = null;
    let contextMenu = null;

    /**
     * Creates the context menu for tables
     */
    function createTableContextMenu() {
        if (contextMenu) {
            return contextMenu;
        }

        contextMenu = document.createElement('div');
        contextMenu.className = 'table-context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 4px 0;
            z-index: 10000;
            display: none;
            min-width: 180px;
            font-family: Inter, sans-serif;
            font-size: 14px;
        `;

        const menuItems = [
            { label: 'Insert row above', action: 'insertRowAbove', icon: '↑' },
            { label: 'Insert row below', action: 'insertRowBelow', icon: '↓' },
            { separator: true },
            { label: 'Insert column left', action: 'insertColLeft', icon: '←' },
            { label: 'Insert column right', action: 'insertColRight', icon: '→' },
            { separator: true },
            { label: 'Delete row', action: 'deleteRow', icon: '🗑️', danger: true },
            { label: 'Delete column', action: 'deleteCol', icon: '🗑️', danger: true },
            { separator: true },
            { label: 'Delete table', action: 'deleteTable', icon: '🗑️', danger: true }
        ];

        menuItems.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = `
                    height: 1px;
                    background: #eee;
                    margin: 4px 0;
                `;
                contextMenu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'table-context-menu-item';
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: background 0.15s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: ${item.danger ? '#dc2626' : '#374151'};
                `;
                
                menuItem.innerHTML = `
                    <span style="width: 20px; text-align: center;">${item.icon}</span>
                    <span>${item.label}</span>
                `;

                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = item.danger ? '#fee2e2' : '#f3f4f6';
                });

                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent';
                });

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
            alert('Cannot delete the last row of the table.');
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
            alert('Cannot delete the last column of the table.');
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
        if (confirm('Do you really want to delete this table?')) {
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
        });

        // Close the context menu with Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && contextMenu && contextMenu.style.display !== 'none') {
                hideTableContextMenu();
            }
        });
    }

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
