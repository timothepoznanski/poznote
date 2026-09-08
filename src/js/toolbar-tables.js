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
    existingPicker.remove();
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

  // Create table picker popup
  const picker = document.createElement('div');
  picker.className = 'table-picker-popup';

  // Create header
  const header = document.createElement('div');
  header.className = 'table-picker-header';
  header.textContent = tr('editor.table_picker.title', 'Insert Table');
  picker.appendChild(header);

  // Create direct input section
  const inputSection = document.createElement('div');
  inputSection.className = 'table-picker-input-section';

  const inputContainer = document.createElement('div');
  inputContainer.className = 'table-picker-input-container';

  // Rows input
  const rowsWrapper = document.createElement('div');
  rowsWrapper.className = 'table-picker-input-wrapper';

  const rowsLabel = document.createElement('label');
  rowsLabel.textContent = tr('editor.table_picker.rows_label', 'Rows:');
  rowsLabel.className = 'table-picker-input-field-label';
  rowsWrapper.appendChild(rowsLabel);

  const rowsInput = document.createElement('input');
  rowsInput.type = 'number';
  rowsInput.className = 'table-picker-input-field';
  rowsInput.min = '1';
  rowsInput.max = '20';
  rowsInput.value = '3';
  rowsInput.placeholder = tr('editor.table_picker.rows_placeholder', 'Rows');
  rowsWrapper.appendChild(rowsInput);

  inputContainer.appendChild(rowsWrapper);

  // Columns input
  const colsWrapper = document.createElement('div');
  colsWrapper.className = 'table-picker-input-wrapper';

  const colsLabel = document.createElement('label');
  colsLabel.textContent = tr('editor.table_picker.cols_label', 'Cols:');
  colsLabel.className = 'table-picker-input-field-label';
  colsWrapper.appendChild(colsLabel);

  const colsInput = document.createElement('input');
  colsInput.type = 'number';
  colsInput.className = 'table-picker-input-field';
  colsInput.min = '1';
  colsInput.max = '20';
  colsInput.value = '3';
  colsInput.placeholder = tr('editor.table_picker.cols_placeholder', 'Cols');
  colsWrapper.appendChild(colsInput);

  inputContainer.appendChild(colsWrapper);

  // Insert button
  const insertBtn = document.createElement('button');
  insertBtn.className = 'table-picker-insert-btn';
  insertBtn.textContent = tr('editor.table_picker.insert', 'Insert');
  inputContainer.appendChild(insertBtn);

  inputSection.appendChild(inputContainer);
  picker.appendChild(inputSection);

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
    marker.textContent = '\u200b';
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
  const pickerWidth = isMobile ? Math.min(280, vpW - 40) : 320;

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

  // Handle insert button click
  insertBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    let rows = parseInt(rowsInput.value);
    let cols = parseInt(colsInput.value);

    // Validate inputs
    if (isNaN(rows) || rows < 1) rows = 1;
    if (isNaN(cols) || cols < 1) cols = 1;
    if (rows > 20) rows = 20;
    if (cols > 20) cols = 20;

    insertTable(rows, cols);
    picker.classList.remove('show');
    setTimeout(() => {
      picker.remove();
    }, 200);
  });

  // Handle Enter key in input fields
  const handleInputEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertBtn.click();
    }
  };

  rowsInput.addEventListener('keydown', handleInputEnter);
  colsInput.addEventListener('keydown', handleInputEnter);

  setupPopupDismiss(picker, '.btn-table', function () {
    window.savedCodeMirrorTable = null;
    window.savedRanges.table = null;
  });
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
      tableHTML += '<td style="border: 1px solid #ddd; padding: 8px; min-width: 50px;">';
      if (r === 0 && c === 0) {
        tableHTML += '&nbsp;'; // Non-breaking space for first cell
      } else {
        tableHTML += '&nbsp;';
      }
      tableHTML += '</td>';
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
