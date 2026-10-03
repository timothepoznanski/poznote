// Toolbar: table picker and insertion.
// 
// Builds a markdown or HTML table depending on the note type, and holds the window.*
// exports for the whole toolbar module set, so it must load last.

function getNodeNoteEntry(node) {
  if (!node) return null;
  if (node.nodeType === 3) node = node.parentNode;
  return node && node.closest ? node.closest('.noteentry') : null;
}

function getSelectionNoteEntry() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  return getNodeNoteEntry(selection.getRangeAt(0).commonAncestorContainer);
}

function getCodeMirrorEditorForNoteEntry(noteEntry, cmApi) {
  if (!noteEntry || !noteEntry.querySelector || !cmApi || typeof cmApi.isCodeMirrorEditor !== 'function') {
    return null;
  }

  const candidate = noteEntry.querySelector('.markdown-editor');
  return candidate && cmApi.isCodeMirrorEditor(candidate) ? candidate : null;
}

function getCurrentTableCodeMirrorContext(triggerElement) {
  const cmApi = window.PoznoteMarkdownCodeMirror;
  if (!cmApi || typeof cmApi.isCodeMirrorEditor !== 'function') return null;

  let editor = null;

  const selectionNoteEntry = getSelectionNoteEntry();
  if (selectionNoteEntry) {
    editor = getCodeMirrorEditorForNoteEntry(selectionNoteEntry, cmApi);
    if (!editor) {
      return null;
    }
  }

  if (!editor && triggerElement && triggerElement.closest) {
    const triggerNoteCard = triggerElement.closest('.notecard');
    const triggerNoteEntry = triggerNoteCard ? triggerNoteCard.querySelector('.noteentry') : triggerElement.closest('.noteentry');
    if (triggerNoteEntry) {
      editor = getCodeMirrorEditorForNoteEntry(triggerNoteEntry, cmApi);
      if (!editor) {
        return null;
      }
    }
  }

  const active = document.activeElement;
  const activeNoteCard = active && active.closest ? active.closest('.notecard') : null;

  if (!editor && activeNoteCard && activeNoteCard.querySelector) {
    const activeNoteEntry = activeNoteCard.querySelector('.noteentry');
    editor = getCodeMirrorEditorForNoteEntry(activeNoteEntry, cmApi);
    if (!editor) return null;
  }

  if (!editor && active && active.closest) {
    const candidate = active.closest('.markdown-editor');
    if (candidate && cmApi.isCodeMirrorEditor(candidate)) {
      editor = candidate;
    }
  }

  if (!editor && typeof cmApi.getLastActiveEditor === 'function') {
    const candidate = cmApi.getLastActiveEditor();
    if (candidate && cmApi.isCodeMirrorEditor(candidate)) {
      editor = candidate;
    }
  }

  if (!editor) return null;

  const offsets = typeof cmApi.getSelectionOffsets === 'function' ? cmApi.getSelectionOffsets(editor) : null;
  const docLength = typeof cmApi.getValue === 'function' ? cmApi.getValue(editor).length : 0;
  const start = offsets ? Math.max(0, Math.min(offsets.start, docLength)) : docLength;
  const end = offsets ? Math.max(start, Math.min(offsets.end, docLength)) : start;

  return { editor, start, end };
}

function buildMarkdownTable(rows, cols) {
  const header = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(' | ');
  const separator = Array.from({ length: cols }, () => '---').join(' | ');
  const row = Array.from({ length: cols }, () => ' ').join(' | ');
  const lines = [`| ${header} |`, `| ${separator} |`].concat(
    Array.from({ length: rows - 1 }, () => `| ${row} |`)
  );
  if (typeof window.formatMarkdownTableBlockLines === 'function') {
    const formatted = window.formatMarkdownTableBlockLines(lines);
    if (formatted) return `\n${formatted.join('\n')}\n`;
  }
  return `\n${lines.join('\n')}\n`;
}

function toggleTablePicker(triggerElement) {
  const existingPicker = document.querySelector('.table-picker-popup');

  if (existingPicker) {
    if (typeof existingPicker._close === 'function') {
      existingPicker._close();
    } else {
      existingPicker.remove();
    }
    window.savedCodeMirrorTable = null;
    window.savedRanges.table = null;
    return;
  }

  const codeMirrorTableContext = getCurrentTableCodeMirrorContext(triggerElement);

  // Check if cursor is in editable note BEFORE opening picker
  if (!codeMirrorTableContext && !isCursorInEditableNote()) {
    window.showCursorWarning();
    return;
  }

  window.savedCodeMirrorTable = codeMirrorTableContext;

  // Save current selection/cursor position
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    window.savedRanges.table = sel.getRangeAt(0).cloneRange();
  } else {
    window.savedRanges.table = null;
  }

  // Grid of cells picked with the mouse (or the arrow keys), backed by two number
  // fields for sizes the grid does not show.
  const GRID_ROWS = 8;
  const GRID_COLS = 10;
  const MAX_SIZE = 20;
  const clampSize = (value) => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return 1;
    return Math.min(n, MAX_SIZE);
  };

  const titleText = tr('editor.table_picker.title', 'Insert table');
  let size = { rows: 3, cols: 3 };
  let inserted = false;

  const picker = document.createElement('div');
  picker.className = 'table-picker-popup';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', titleText);

  // Header: title + live size
  const header = document.createElement('div');
  header.className = 'table-picker-header';

  const title = document.createElement('span');
  title.className = 'table-picker-title';
  title.textContent = titleText;
  header.appendChild(title);

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'table-picker-size';
  sizeLabel.setAttribute('aria-live', 'polite');
  header.appendChild(sizeLabel);

  picker.appendChild(header);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'table-picker-grid';
  grid.tabIndex = 0;
  grid.setAttribute('aria-label', titleText);
  grid.style.setProperty('--table-picker-cols', GRID_COLS);

  const cells = [];
  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const cell = document.createElement('span');
      cell.className = 'table-picker-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      grid.appendChild(cell);
      cells.push(cell);
    }
  }
  picker.appendChild(grid);

  // Number fields + insert button
  const fields = document.createElement('div');
  fields.className = 'table-picker-fields';

  const createField = (labelText, value) => {
    const field = document.createElement('label');
    field.className = 'table-picker-field';

    const label = document.createElement('span');
    label.className = 'table-picker-input-field-label';
    label.textContent = labelText;
    field.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'table-picker-input-field';
    input.min = '1';
    input.max = String(MAX_SIZE);
    input.value = String(value);
    field.appendChild(input);

    fields.appendChild(field);
    return input;
  };

  const rowsInput = createField(tr('editor.table_picker.rows_placeholder', 'Rows'), size.rows);
  const colsInput = createField(tr('editor.table_picker.cols_placeholder', 'Columns'), size.cols);

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'table-picker-insert-btn';
  insertBtn.textContent = tr('editor.table_picker.insert', 'Insert');
  fields.appendChild(insertBtn);

  picker.appendChild(fields);

  const paint = (rows, cols) => {
    cells.forEach((cell) => {
      cell.classList.toggle('active', +cell.dataset.row <= rows && +cell.dataset.col <= cols);
    });
    sizeLabel.textContent = rows + ' × ' + cols;
  };

  const setSize = (rows, cols) => {
    size = { rows: clampSize(rows), cols: clampSize(cols) };
    rowsInput.value = String(size.rows);
    colsInput.value = String(size.cols);
    paint(size.rows, size.cols);
  };

  paint(size.rows, size.cols);

  // Append to body
  document.body.appendChild(picker);

  // Position near the caret (robust on mobile) and keep fully visible.
  const getCaretClientRect = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);

    const rects = range.getClientRects();
    if (rects && rects.length) return rects[rects.length - 1];

    const marker = document.createElement('span');
    marker.textContent = '​';
    marker.setAttribute('data-table-picker-caret', '1');
    marker.style.display = 'inline-block';
    marker.style.width = '0px';
    marker.style.height = '1em';
    marker.style.lineHeight = '1';
    marker.style.overflow = 'hidden';
    marker.style.pointerEvents = 'none';
    marker.style.userSelect = 'none';

    try {
      range.insertNode(marker);
      return marker.getBoundingClientRect();
    } finally {
      if (marker.parentNode) marker.parentNode.removeChild(marker);

      // Restore selection to avoid any surprises for the user.
      const restore = window.getSelection();
      if (restore) {
        restore.removeAllRanges();
        restore.addRange(range);
      }
    }
  };

  const vp = window.visualViewport;
  const vpW = vp ? vp.width : window.innerWidth;
  const vpH = vp ? vp.height : window.innerHeight;
  const vpOffL = vp ? vp.offsetLeft : 0;
  const vpOffT = vp ? vp.offsetTop : 0;

  const isMobile = isMobileDevice();
  const pickerWidth = Math.min(292, vpW - 24);

  picker.style.position = 'fixed';
  picker.style.width = pickerWidth + 'px';
  const pickerHeight = picker.offsetHeight || 200;

  const margin = 10;
  let left = vpOffL + (vpW - pickerWidth) / 2;
  let top = vpOffT + margin;

  const caretRect = getCaretClientRect();
  if (caretRect) {
    const anchorX = caretRect.left + caretRect.width / 2;
    const spaceAbove = caretRect.top;
    const spaceBelow = vpH - caretRect.bottom;

    if (spaceAbove >= pickerHeight + margin) {
      top = vpOffT + caretRect.top - pickerHeight - margin;
    } else if (spaceBelow >= pickerHeight + margin) {
      top = vpOffT + caretRect.bottom + margin;
    } else {
      top = vpOffT + (vpH - pickerHeight) / 2;
    }

    left = vpOffL + (anchorX - pickerWidth / 2);
  }

  picker.style.left = left + 'px';
  picker.style.top = top + 'px';
  clampToViewport(picker, margin);

  // Show picker with animation
  setTimeout(() => {
    picker.classList.add('show');
  }, 10);

  // Put the caret back where it was when the picker is dismissed from inside
  // (Escape while the grid or a field has focus).
  const restoreEditorFocus = () => {
    const cmApi = window.PoznoteMarkdownCodeMirror;
    const cmContext = window.savedCodeMirrorTable;
    if (cmContext && cmApi && typeof cmApi.setSelection === 'function') {
      cmApi.setSelection(cmContext.editor, cmContext.start, cmContext.end);
      return;
    }
    const range = window.savedRanges.table;
    const noteEntry = range ? getNodeNoteEntry(range.commonAncestorContainer) : null;
    if (!noteEntry) return;
    noteEntry.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const close = setupPopupDismiss(picker, '.btn-table', function () {
    if (!inserted && picker.contains(document.activeElement)) {
      restoreEditorFocus();
    }
    window.savedCodeMirrorTable = null;
    window.savedRanges.table = null;
  });
  picker._close = close;

  const commit = (rows, cols) => {
    inserted = true;
    insertTable(clampSize(rows), clampSize(cols));
    close();
  };

  // Grid: hover previews, click inserts, leaving shows the fields' size again
  grid.addEventListener('pointerover', (e) => {
    const cell = e.target.closest('.table-picker-cell');
    if (cell) paint(+cell.dataset.row, +cell.dataset.col);
  });
  grid.addEventListener('pointerleave', () => paint(size.rows, size.cols));
  grid.addEventListener('mousedown', (e) => e.preventDefault());
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.table-picker-cell');
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    commit(+cell.dataset.row, +cell.dataset.col);
  });

  grid.addEventListener('keydown', (e) => {
    const moves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    };
    if (moves[e.key]) {
      e.preventDefault();
      setSize(size.rows + moves[e.key][0], size.cols + moves[e.key][1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(size.rows, size.cols);
    }
  });

  // Fields: typing updates the grid, leaving a field normalises its value
  const syncFromFields = () => {
    size = { rows: clampSize(rowsInput.value), cols: clampSize(colsInput.value) };
    paint(size.rows, size.cols);
  };
  [rowsInput, colsInput].forEach((input) => {
    input.addEventListener('input', syncFromFields);
    input.addEventListener('change', () => setSize(rowsInput.value, colsInput.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncFromFields();
        commit(size.rows, size.cols);
      }
    });
  });

  insertBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    syncFromFields();
    commit(size.rows, size.cols);
  });

  // Keyboard users land on the grid; on touch devices moving focus would close
  // the virtual keyboard and shift the page under the picker.
  if (!isMobile) {
    grid.focus({ preventScroll: true });
  }
}

function insertTable(rows, cols) {
  // CodeMirror markdown editor: insert markdown table syntax
  const cmApi = window.PoznoteMarkdownCodeMirror;
  const cmContext = window.savedCodeMirrorTable || getCurrentTableCodeMirrorContext();
  if (cmContext && cmApi && typeof cmApi.isCodeMirrorEditor === 'function' && cmApi.isCodeMirrorEditor(cmContext.editor) && typeof cmApi.replaceRange === 'function') {
    const tableMarkdown = buildMarkdownTable(rows, cols);
    cmApi.replaceRange(cmContext.editor, cmContext.start, cmContext.end, tableMarkdown);
    if (typeof cmApi.setSelection === 'function') {
      const caretPos = cmContext.start + tableMarkdown.length;
      cmApi.setSelection(cmContext.editor, caretPos, caretPos);
    }
    window.savedCodeMirrorTable = null;
    window.savedRanges.table = null;
    return;
  }

  window.savedCodeMirrorTable = null;

  // Use saved range if available, otherwise check current cursor position
  if (window.savedRanges.table) {
    // Restore the saved selection
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(window.savedRanges.table);

    // Clear the saved range
    window.savedRanges.table = null;
  } else {
    // Fallback: check if cursor is in editable note
    if (!isCursorInEditableNote()) {
      window.showCursorWarning();
      return;
    }
  }

  // Find the active note editor
  const noteentry = document.querySelector('.noteentry[contenteditable="true"]');

  if (!noteentry) {
    console.error('No editable note found');
    return;
  }

  // Focus the editor first
  noteentry.focus();

  // Build table HTML
  let tableHTML = '<table class="inserted-table" style="border-collapse: collapse; width: 100%; margin: 12px 0;">';
  tableHTML += '<tbody>';

  for (let r = 0; r < rows; r++) {
    tableHTML += '<tr>';
    for (let c = 0; c < cols; c++) {
      // A <br> keeps the height of a line without putting a character in the cell
      tableHTML += '<td style="border: 1px solid #ddd; padding: 8px; min-width: 50px;"><br></td>';
    }
    tableHTML += '</tr>';
  }

  tableHTML += '</tbody></table><p><br></p>'; // Add paragraph after table

  // Insert table at saved cursor position
  try {
    let insertSuccess = false;

    // Try to restore the saved range
    if (window.savedRanges.table) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(window.savedRanges.table);

      // Try to insert at the saved position
      insertSuccess = document.execCommand('insertHTML', false, tableHTML);

      // Clean up saved range
      window.savedRanges.table = null;
    } else {
      // No saved range, try current selection
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);

        // Make sure we're inside the noteentry
        if (noteentry.contains(range.commonAncestorContainer) || noteentry === range.commonAncestorContainer) {
          insertSuccess = document.execCommand('insertHTML', false, tableHTML);
        }
      }
    }

    // If insertHTML didn't work, use fallback insertion
    if (!insertSuccess) {
      const sel = window.getSelection();
      let range;

      if (window.savedRanges.table) {
        range = window.savedRanges.table;
        window.savedRanges.table = null;
      } else if (sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
      } else {
        // Create a range at the end of noteentry
        range = document.createRange();
        range.selectNodeContents(noteentry);
        range.collapse(false);
      }

      // Manual insertion using range
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = tableHTML;
      const table = tempDiv.firstChild;

      if (range) {
        range.deleteContents();
        range.insertNode(table);

        // Move cursor after the table
        range.setStartAfter(table);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // Trigger input event to save
    noteentry.dispatchEvent(new Event('input', { bubbles: true }));

    // Focus on first cell
    setTimeout(() => {
      const insertedTable = noteentry.querySelector('table.inserted-table:last-of-type');
      if (insertedTable) {
        const firstCell = insertedTable.querySelector('td');
        if (firstCell) {
          // Place cursor in first cell
          firstCell.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(firstCell);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, 100);

  } catch (e) {
    console.error('Error inserting table:', e);

    // Final fallback: append to end of noteentry
    try {
      noteentry.insertAdjacentHTML('beforeend', tableHTML);
      noteentry.dispatchEvent(new Event('input', { bubbles: true }));
      window.savedRanges.table = null;
    } catch (fallbackError) {
      console.error('Fallback insertion also failed:', fallbackError);
      window.savedRanges.table = null;
    }
  }
}

// Ensure all toolbar functions are available in global scope
window.addLinkToNote = addLinkToNote;
window.toggleRedColor = toggleRedColor;
window.toggleYellowHighlight = toggleYellowHighlight;
window.changeFontSize = changeFontSize;
window.toggleCodeBlock = toggleCodeBlock;
window.toggleInlineCode = toggleInlineCode;
window.toggleEmojiPicker = toggleEmojiPicker;
window.insertEmoji = insertEmoji;
window.toggleTablePicker = toggleTablePicker;
window.insertTable = insertTable;

// Mobile toolbar overflow menu helpers (Used by inline onclick handlers generated in index.php)
(function () {
  'use strict';

  let savedMobileToolbarRange = null;

  function captureCurrentSelectionRange(toolbar) {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        let container = r.commonAncestorContainer;
        if (container && container.nodeType === 3) container = container.parentNode;

        // Only capture if the selection is inside the same note card.
        if (toolbar) {
          const noteCard = toolbar.closest ? toolbar.closest('.notecard') : null;
          const selectionCard = container && container.closest ? container.closest('.notecard') : null;
          if (noteCard && selectionCard && noteCard !== selectionCard) {
            savedMobileToolbarRange = null;
            return;
          }
        }

        savedMobileToolbarRange = r.cloneRange();
      } else {
        savedMobileToolbarRange = null;
      }
    } catch (e) {
      savedMobileToolbarRange = null;
    }
  }

  function getToolbarRoot(el) {
    return el && el.closest ? el.closest('.note-edit-toolbar') : null;
  }

  function getMenu(toolbar) {
    return toolbar ? toolbar.querySelector('.mobile-toolbar-menu') : null;
  }

  function closeMenu(toolbar) {
    const menu = getMenu(toolbar);
    if (!menu) return;
    menu.hidden = true;
    menu.style.position = '';
    menu.style.top = '';
    menu.style.right = '';
    menu.style.left = '';
    const toggleBtn = toolbar.querySelector('.mobile-more-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu(toolbar) {
    const menu = getMenu(toolbar);
    if (!menu) return;

    // Use position: fixed to escape overflow clipping ancestors, including the single-line mobile toolbar.
    const anchor = toolbar.querySelector('.toolbar-menu-anchor');
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = rect.bottom + 4 + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      menu.style.left = 'auto';
    } else {
      menu.style.position = '';
      menu.style.top = '';
      menu.style.right = '';
      menu.style.left = '';
    }

    menu.hidden = false;
    const toggleBtn = toolbar.querySelector('.mobile-more-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function getMobileToolbarContext(toolbar, rangeToRestore) {
    const noteCard = toolbar && toolbar.closest ? toolbar.closest('.notecard') : null;
    const noteEntry = noteCard ? noteCard.querySelector('.noteentry') : null;
    if (!noteEntry) return null;

    let editableElement = getEditorFromRange(rangeToRestore);
    if (!editableElement || !noteEntry.contains(editableElement)) {
      editableElement = noteEntry.querySelector('.markdown-editor')
        || (noteEntry.matches('[contenteditable="true"]') ? noteEntry : noteEntry.querySelector('[contenteditable="true"]'));
    }

    return {
      noteEntry,
      editableElement,
      noteType: (noteEntry.getAttribute('data-note-type') || 'note').toLowerCase()
    };
  }

  function restoreMobileToolbarRange(editor, rangeToRestore) {
    if (!editor) return null;

    const scrollState = captureScrollState(editor);
    focusEditorWithoutScroll(editor, scrollState);

    let nextRange = rangeToRestore && typeof rangeToRestore.cloneRange === 'function'
      ? rangeToRestore.cloneRange()
      : rangeToRestore;

    if (!nextRange) {
      nextRange = document.createRange();
      nextRange.selectNodeContents(editor);
      nextRange.collapse(false);
    }

    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }
    } catch (e) {
        console.debug('toolbar-tables: restoreMobileToolbarRange() failed:', e);
    }

    restoreScrollState(scrollState);
    return nextRange;
  }

  window.toggleMobileToolbarMenu = function (btn) {
    const toolbar = getToolbarRoot(btn);
    if (!toolbar) return;

    // Close any other open menus
    document.querySelectorAll('.note-edit-toolbar .mobile-toolbar-menu:not([hidden])').forEach(m => {
      const root = m.closest('.note-edit-toolbar');
      if (root && root !== toolbar) closeMenu(root);
    });

    const menu = getMenu(toolbar);
    if (!menu) return;
    if (menu.hidden) {
      // Capture selection before the menu steals focus.
      captureCurrentSelectionRange(toolbar);
      openMenu(toolbar);
    } else {
      closeMenu(toolbar);
      savedMobileToolbarRange = null;
    }
  };

  window.triggerMobileToolbarAction = function (menuItemEl, targetSelector) {
    const toolbar = getToolbarRoot(menuItemEl);
    if (!toolbar) return;

    // Preserve selection before closing the menu.
    const rangeToRestore = savedMobileToolbarRange;
    closeMenu(toolbar);
    savedMobileToolbarRange = null;

    // For emoji insertion, restore caret so toggleEmojiPicker/isCursorInEditableNote succeeds.
    if (targetSelector === '.btn-emoji' && rangeToRestore) {
      try {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(rangeToRestore);
        }

        // Also keep a copy for the picker insertion pipeline.
        try {
          window.savedRanges.emoji = rangeToRestore.cloneRange();
        } catch (e) {
          window.savedRanges.emoji = rangeToRestore;
        }
      } catch (e) {
          console.debug('toolbar-tables: restoreMobileToolbarRange() failed:', e);
      }
    }

    const target = toolbar.querySelector(targetSelector);
    if (target && typeof target.click === 'function') {
      target.click();
    } else if (targetSelector === '.btn-uncheck-all') {
      // Special handling for uncheck all tasks action
      const noteId = toolbar.closest('.note-entry')?.id?.replace('entry', '');
      if (noteId && typeof uncheckAllTasks === 'function') {
        uncheckAllTasks(noteId);
      }
    }
  };

  window.triggerMobileToolbarAudioInsert = function (menuItemEl) {
    const toolbar = getToolbarRoot(menuItemEl);
    if (!toolbar) return;

    const rangeToRestore = savedMobileToolbarRange;
    closeMenu(toolbar);
    savedMobileToolbarRange = null;

    const context = getMobileToolbarContext(toolbar, rangeToRestore);
    if (!context || !context.editableElement) return;
    if (context.noteType !== 'note' && context.noteType !== 'markdown') return;

    const restoredRange = restoreMobileToolbarRange(context.editableElement, rangeToRestore);
    if (typeof window.insertAudioFileWithContext === 'function') {
      window.insertAudioFileWithContext({
        noteEntry: context.noteEntry,
        editableElement: context.editableElement,
        savedRange: restoredRange,
        isMarkdown: context.noteType === 'markdown'
      });
    }
  };

  // Global close on outside click + Escape
  document.addEventListener('click', function (e) {
    const openMenus = document.querySelectorAll('.note-edit-toolbar .mobile-toolbar-menu:not([hidden])');
    if (!openMenus.length) return;
    openMenus.forEach(menu => {
      const toolbar = menu.closest('.note-edit-toolbar');
      if (!toolbar) return;
      const toggleBtn = toolbar.querySelector('.mobile-more-btn');
      const clickedInside = menu.contains(e.target) || (toggleBtn && toggleBtn.contains(e.target));
      if (!clickedInside) {
        closeMenu(toolbar);
        savedMobileToolbarRange = null;
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.note-edit-toolbar .mobile-toolbar-menu:not([hidden])').forEach(menu => {
      const toolbar = menu.closest('.note-edit-toolbar');
      if (toolbar) {
        closeMenu(toolbar);
        savedMobileToolbarRange = null;
      }
    });
  });
})();
