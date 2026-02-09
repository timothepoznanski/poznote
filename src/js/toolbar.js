// === Shared popup helpers ===
function setupPopupDismiss(popupEl, triggerBtnSelector, onClose) {
  var animDelay = 200;
  function close() {
    popupEl.classList.remove('show');
    setTimeout(function () { if (popupEl.parentNode) popupEl.remove(); }, animDelay);
    document.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    if (onClose) onClose();
  }
  function outsideHandler(e) {
    if (!popupEl.contains(e.target) && !(triggerBtnSelector && e.target.closest && e.target.closest(triggerBtnSelector))) {
      close();
    }
  }
  function keyHandler(e) {
    if (e.key === 'Escape') close();
  }
  setTimeout(function () { document.addEventListener('click', outsideHandler); }, 100);
  document.addEventListener('keydown', keyHandler);
  return close;
}

function clampToViewport(el, margin) {
  margin = margin || 10;
  var vp = window.visualViewport;
  var vpW = vp ? vp.width : window.innerWidth;
  var vpH = vp ? vp.height : window.innerHeight;
  var vpOffL = vp ? vp.offsetLeft : 0;
  var vpOffT = vp ? vp.offsetTop : 0;
  var rect = el.getBoundingClientRect();
  var curL = parseFloat(el.style.left) || rect.left;
  var curT = parseFloat(el.style.top) || rect.top;
  el.style.left = Math.max(vpOffL + margin, Math.min(curL, vpOffL + vpW - rect.width - margin)) + 'px';
  el.style.top = Math.max(vpOffT + margin, Math.min(curT, vpOffT + vpH - rect.height - margin)) + 'px';
}

window.savedRanges = {};

// Clean, popup-only color picker for the toolbar palette button.
// Exposes window.toggleRedColor() which is called from the toolbar button.

(function () {
  'use strict';

  const COLORS = [
    { key: 'editor.colors.black', fallback: 'Black', value: 'rgb(55,53,47)' },
    { key: 'editor.colors.red', fallback: 'Red', value: 'red' },
    { key: 'editor.colors.orange', fallback: 'Orange', value: 'orange' },
    { key: 'editor.colors.yellow', fallback: 'Yellow', value: 'yellow' },
    { key: 'editor.colors.green', fallback: 'Green', value: 'green' },
    { key: 'editor.colors.blue', fallback: 'Blue', value: 'blue' },
    { key: 'editor.colors.purple', fallback: 'Purple', value: 'purple' },
    { key: 'editor.colors.none', fallback: 'None', value: 'none' }
  ];

  function tr(key, fallback, vars) {
    if (window.t) return window.t(key, vars || null, fallback);
    if (vars && typeof vars === 'object') {
      for (const k in vars) fallback = String(fallback).split('{{' + k + '}}').join(String(vars[k]));
    }
    return fallback;
  }

  // Save/restore selection helpers
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      window.savedRanges.color = sel.getRangeAt(0).cloneRange();
    } else {
      window.savedRanges.color = null;
    }
  }

  function restoreSelection() {
    const r = window.savedRanges.color;
    if (r) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    }
    return false;
  }

  // Remove inline color styles in the selected range (best-effort)
  function removeInlineColorInRange(range) {
    try {
      const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
      const toClean = [];
      while (walker.nextNode()) {
        const el = walker.currentNode;
        if (range.intersectsNode(el) && el.style && el.style.color) toClean.push(el);
      }
      toClean.forEach(el => {
        el.style.color = '';
        if (el.getAttribute('style') === '') el.removeAttribute('style');
      });
    } catch (e) {
      // swallow
    }
  }

  // Apply color (or remove it) to the saved selection
  function applyColorToSelection(color) {
    // Check if we're in markdown mode
    if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
      // For markdown, use HTML inline styles
      if (typeof applyMarkdownColor === 'function') {
        // Restore selection first
        restoreSelection();
        if (color === 'none') {
          // Try to remove color - this is tricky, just apply inherit
          applyMarkdownColor('inherit');
        } else {
          applyMarkdownColor(color);
        }
      }
      return;
    }

    // HTML mode - original logic
    // restore selection first
    restoreSelection();

    try {
      // Prefer CSS styling for foreColor
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {
      // ignore
    }

    if (color === 'none') {
      // Try to set to inherit and then remove inline styles where possible
      try {
        document.execCommand('foreColor', false, 'inherit');
      } catch (e) {
        // ignore
      }
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        removeInlineColorInRange(sel.getRangeAt(0));
      }
    } else {
      try {
        document.execCommand('foreColor', false, color);
      } catch (e) {
        // fallback: wrap selection in span with inline style
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.color = color;
          try {
            range.surroundContents(span);
          } catch (err) {
            // If surroundContents fails (partial selections), use insertNode
            const docFrag = range.cloneContents();
            span.appendChild(docFrag);
            range.deleteContents();
            range.insertNode(span);
          }
        }
      }
    }

    // trigger optional update callback if present
    const noteentry = document.querySelector('.noteentry');
  }

  // Remove any existing popup
  function removeExistingPopup() {
    const prev = document.querySelector('.color-palette-popup');
    if (prev) prev.remove();
    window.savedRanges.color = null;
  }

  // Build popup DOM
  function buildPopup() {
    const popup = document.createElement('div');
    popup.className = 'color-palette-popup';
    const grid = document.createElement('div');
    grid.className = 'color-grid';

    COLORS.forEach(c => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'color-item';
      item.setAttribute('data-color', c.value);
      item.setAttribute('title', tr(c.key, c.fallback));
      // Visual: a small swatch and label (screen readers)
      const sw = document.createElement('span');
      sw.className = 'color-swatch';
      sw.style.background = c.value === 'none' ? 'transparent' : c.value;
      if (c.value === 'none') {
        // Visual: neutral empty swatch with border (no cross)
        sw.style.border = '1px solid #ccc';
        sw.style.background = 'transparent';
        sw.style.display = 'inline-block';
      }
      sw.setAttribute('aria-hidden', 'true');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(' '));
      grid.appendChild(item);
    });

    popup.appendChild(grid);
    return popup;
  }

  // Main entry: show popup centered under the palette button
  function toggleRedColor() {
    try {
      removeExistingPopup();
      saveSelection();

      const btn = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('btn-color')
        ? document.activeElement
        : document.querySelector('.btn-color');

      const popup = buildPopup();
      document.body.appendChild(popup);

      // Positioning: center under button
      const btnRect = btn ? btn.getBoundingClientRect() : { left: 10, right: 40, bottom: 40, width: 30 };
      const popupRect = popup.getBoundingClientRect();
      const left = btnRect.left + (btnRect.width / 2) - (popupRect.width / 2) + window.scrollX;
      const top = btnRect.bottom + 8 + window.scrollY;
      popup.style.position = 'absolute';
      popup.style.left = Math.max(8, left) + 'px';
      popup.style.top = top + 'px';

      // caret alignment variable for CSS if used
      const caretX = (btnRect.left + (btnRect.width / 2)) - (left);
      popup.style.setProperty('--caret-x', Math.max(8, caretX) + 'px');

      // show class for CSS transitions
      setTimeout(() => popup.classList.add('show'), 10);

      // Dismiss on outside click / Escape
      const closePopup = setupPopupDismiss(popup, '.btn-color', function () {
        window.savedRanges.color = null;
      });

      // Click handler
      popup.addEventListener('click', function (e) {
        const btnItem = e.target.closest('.color-item');
        if (!btnItem) return;
        const color = btnItem.getAttribute('data-color');
        applyColorToSelection(color);
        closePopup();
      });

    } catch (err) {

    }
  }

  // Export
  window.toggleRedColor = toggleRedColor;
  // Also expose applyColorToSelection in case other scripts call it
  window.applyColorToSelection = applyColorToSelection;

})();

function toggleYellowHighlight() {
  // Check if we're in markdown mode
  if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
    if (typeof applyMarkdownHighlight === 'function') {
      applyMarkdownHighlight('#ffe066');
    }
    return;
  }

  // HTML mode - original logic
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let allYellow = true, hasText = false;
    const treeWalker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = treeWalker.currentNode;
    while (node) {
      if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
        hasText = true;
        let parent = node.parentNode;
        let bg = '';
        if (parent && parent.style && parent.style.backgroundColor) bg = parent.style.backgroundColor.replace(/\s/g, '').toLowerCase();
        if (bg !== '#ffe066' && bg !== 'rgb(255,224,102)') allYellow = false;
      }
      node = treeWalker.nextNode();
    }
    document.execCommand('styleWithCSS', false, true);
    if (hasText && allYellow) {
      document.execCommand('hiliteColor', false, 'inherit');
    } else {
      document.execCommand('hiliteColor', false, '#ffe066');
    }
    document.execCommand('styleWithCSS', false, false);
  }
}

// Helper function to convert font size value to CSS size
function getFontSizeFromValue(value) {
  const sizeMap = {
    '1': '0.75rem',   // Very small
    '2': '0.875rem',  // Small  
    '3': '1rem',      // Normal
    '4': '1.125rem',  // Large
    '5': '1.5rem',    // Very large
    '6': '2rem',      // Huge
    '7': '3rem'       // Giant
  };
  return sizeMap[value] || '1rem';
}

function changeFontSize() {
  // Close any existing font size popup
  const existingPopup = document.querySelector('.font-size-popup');
  if (existingPopup) {
    existingPopup.remove();
    return;
  }

  // Save the current selection before opening popup - declare in function scope
  const selection = window.getSelection();
  const savedRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  // Check if we have selected text
  const hasSelection = savedRange && !savedRange.collapsed;

  if (!hasSelection) {
    // No selection - silently return
    return;
  }

  // Find the font size button to position the popup
  const fontSizeButton = document.querySelector('.btn-text-height');
  if (!fontSizeButton) return;

  // Create the popup
  const popup = document.createElement('div');
  popup.className = 'font-size-popup';

  // Font size options with labels
  const fontSizes = [
    { value: '1', key: 'editor.font_size.very_small', fallback: 'Very small', preview: 'Aa' },
    { value: '2', key: 'editor.font_size.small', fallback: 'Small', preview: 'Aa' },
    { value: '3', key: 'editor.font_size.normal', fallback: 'Normal', preview: 'Aa' },
    { value: '4', key: 'editor.font_size.large', fallback: 'Large', preview: 'Aa' },
    { value: '5', key: 'editor.font_size.very_large', fallback: 'Very large', preview: 'Aa' },
    { value: '6', key: 'editor.font_size.huge', fallback: 'Huge', preview: 'Aa' },
    { value: '7', key: 'editor.font_size.giant', fallback: 'Giant', preview: 'Aa' }
  ];

  // Build popup content
  let popupHTML = '';
  fontSizes.forEach(size => {
    popupHTML += `
      <div class="font-size-item" data-size="${size.value}">
        <span class="size-label">${tr(size.key, size.fallback)}</span>
        <span class="size-preview size-${size.value}">${size.preview}</span>
      </div>
    `;
  });

  popup.innerHTML = popupHTML;

  // Append popup to body and compute coordinates so it doesn't get clipped
  document.body.appendChild(popup);
  popup.style.position = 'absolute';
  popup.style.minWidth = '180px';

  // Position near the button, clamp to viewport
  const btnRect = fontSizeButton.getBoundingClientRect();
  popup.style.left = (btnRect.right - 220) + 'px';
  popup.style.top = (btnRect.bottom + 8) + 'px';
  clampToViewport(popup, 8);

  // Show popup with animation
  setTimeout(() => {
    popup.classList.add('show');
  }, 10);

  // Add click handlers for font size items
  popup.querySelectorAll('.font-size-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const size = item.getAttribute('data-size');
      const fontSize = getFontSizeFromValue(size);

      // Check if we're in markdown mode
      const inMarkdown = typeof isInMarkdownEditor === 'function' && isInMarkdownEditor();

      // Ensure editor has focus
      const editor = document.querySelector('[contenteditable="true"]');
      if (editor && savedRange) {
        editor.focus();

        // Restore the saved selection
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);

        if (inMarkdown && typeof applyMarkdownFontSize === 'function') {
          // Use markdown HTML inline style
          applyMarkdownFontSize(fontSize);
        } else {
          // HTML mode - original logic
          // Apply font size by wrapping selection in span with CSS class instead of inline style
          const range = selection.getRangeAt(0);
          const span = document.createElement('span');
          // Use cssText to set font-size with !important to prevent override
          span.style.cssText = 'font-size: ' + fontSize + ' !important';

          try {
            range.surroundContents(span);
          } catch (surroundErr) {
            // If surroundContents fails (partial selections), use insertNode
            const docFrag = range.cloneContents();
            span.appendChild(docFrag);
            range.deleteContents();
            range.insertNode(span);
          }

          // Remove selection (place cursor at the end of modified text)
          selection.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStartAfter(span);
          newRange.collapse(true);
          selection.addRange(newRange);
        }
      }

      // Close popup
      popup.classList.remove('show');
      setTimeout(() => {
        popup.remove();
      }, 200);
    });
  });

  setupPopupDismiss(popup, '.btn-text-height');
}

function toggleCodeBlock() {
  // Check if we're in markdown mode
  if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
    if (typeof applyMarkdownCodeBlock === 'function') {
      applyMarkdownCodeBlock();
    }
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;

  // If already in a code block, remove it
  const existingPre = container.closest ? container.closest('pre') : null;
  if (existingPre) {
    const text = existingPre.textContent;
    existingPre.outerHTML = text.replace(/\n/g, '<br>');
    return;
  }

  // Find the note entry container
  const noteEntry = container.closest ? container.closest('.noteentry') : null;

  // Helper function to check if we're at the first line of the note
  function isAtFirstLine() {
    if (!noteEntry) return false;
    try {
      const rangeToStart = document.createRange();
      rangeToStart.setStart(noteEntry, 0);
      rangeToStart.setEnd(range.startContainer, range.startOffset);
      const textBefore = rangeToStart.toString();
      // Check if there's no text or only whitespace before the selection
      return !textBefore.trim();
    } catch (e) {
      return false;
    }
  }

  // Helper function to check if we're at the last line of the note
  function isAtLastLine() {
    if (!noteEntry) return false;
    try {
      const rangeToEnd = document.createRange();
      rangeToEnd.setStart(range.endContainer, range.endOffset);
      rangeToEnd.selectNodeContents(noteEntry);
      rangeToEnd.setStart(range.endContainer, range.endOffset);
      const textAfter = rangeToEnd.toString();
      // Check if there's no text or only whitespace after the selection
      return !textAfter.trim();
    } catch (e) {
      return false;
    }
  }

  const atFirstLine = isAtFirstLine();
  const atLastLine = isAtLastLine();

  // Otherwise, create a code block with the selected text
  if (sel.isCollapsed) {
    // No selection: insert empty block
    // Add blank line before only if at first line, after only if at last line
    const brBefore = atFirstLine ? '<br>' : '';
    const brAfter = atLastLine ? '<br>' : '';
    document.execCommand('insertHTML', false, `${brBefore}<pre class="code-block"><br></pre>${brAfter}`);
    return;
  }

  // Get selected text with normalized line breaks to avoid extra blank lines
  const selectedText = getNormalizedRangeText(range);
  if (!selectedText.trim()) return;

  // Escape HTML and create code block
  const escapedText = selectedText
    .replace(/\u200B/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Add blank line before only if at first line, after only if at last line
  const brBefore = atFirstLine ? '<br>' : '';
  const brAfter = atLastLine ? '<br>' : '';
  const codeHTML = `${brBefore}<pre class="code-block">${escapedText}</pre>${brAfter}`;
  document.execCommand('insertHTML', false, codeHTML);
}

function getNormalizedRangeText(range) {
  if (!range) return '';
  try {
    const fragment = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);

    if (typeof window.normalizeContentEditableText === 'function') {
      return window.normalizeContentEditableText(wrapper);
    }

    return wrapper.innerText || wrapper.textContent || '';
  } catch (e) {
    return '';
  }
}

function toggleInlineCode() {
  // Check if we're in markdown mode
  if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
    if (typeof applyMarkdownInlineCode === 'function') {
      applyMarkdownInlineCode();
    }
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;

  // Check if we're already in an inline code element
  const existingCode = container.closest ? container.closest('code') : null;
  if (existingCode && existingCode.tagName === 'CODE' && existingCode.parentNode.tagName !== 'PRE') {
    // We're in inline code, remove it
    const text = existingCode.textContent;
    existingCode.outerHTML = text;
    return;
  }

  // If no selection, insert empty inline code
  if (sel.isCollapsed) {
    document.execCommand('insertHTML', false, '<code></code>');
    // Position cursor inside the code
    const codeElement = container.querySelector('code:empty') || container.closest('.noteentry').querySelector('code:empty');
    if (codeElement) {
      const newRange = document.createRange();
      newRange.setStart(codeElement, 0);
      newRange.setEnd(codeElement, 0);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    return;
  }

  // Get selected text
  const selectedText = sel.toString();
  if (!selectedText.trim()) return;

  // Check if we're dealing with a partial word with hyphens
  if (selectedText.indexOf('-') === -1 && // No hyphens in selection
    container.nodeType === 3 && // Text node
    container.textContent.indexOf('-') !== -1) { // Parent contains hyphens

    // Get the current word including hyphens
    const startPoint = range.startOffset;
    const endPoint = range.endOffset;
    const fullText = container.textContent;

    // Find word boundaries including hyphens
    let wordStart = startPoint;
    while (wordStart > 0 && /[\w\-]/.test(fullText.charAt(wordStart - 1))) {
      wordStart--;
    }

    let wordEnd = endPoint;
    while (wordEnd < fullText.length && /[\w\-]/.test(fullText.charAt(wordEnd))) {
      wordEnd++;
    }

    // If we found a larger word with hyphens, adjust the selection
    if (wordStart < startPoint || wordEnd > endPoint) {
      const newRange = document.createRange();
      newRange.setStart(container, wordStart);
      newRange.setEnd(container, wordEnd);
      sel.removeAllRanges();
      sel.addRange(newRange);

      // Get the new selected text
      const newSelectedText = sel.toString();

      // Escape HTML and create inline code for the new selection
      const escapedText = newSelectedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const codeHTML = `<code>${escapedText}</code>`;
      document.execCommand('insertHTML', false, codeHTML);
      return;
    }
  }

  // Escape HTML and create inline code for normal selections
  const escapedText = selectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const codeHTML = `<code>${escapedText}</code>`;
  document.execCommand('insertHTML', false, codeHTML);
}

/**
 * Check if cursor is in an editable note area
 */
function isCursorInEditableNote() {
  const selection = window.getSelection();

  // Check if there's a selection/cursor
  if (!selection.rangeCount) {
    return false;
  }

  // Get the current element
  const range = selection.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) { // Text node
    container = container.parentNode;
  }

  // Check if we're inside a contenteditable note area
  const editableElement = container.closest && container.closest('[contenteditable="true"]');
  const noteEntry = container.closest && container.closest('.noteentry');
  const markdownEditor = container.closest && container.closest('.markdown-editor');

  // Check for title input
  if (document.activeElement && document.activeElement.classList.contains('css-title')) {
    return true;
  }

  // Return true if we're in any editable note context
  return (editableElement && noteEntry) || markdownEditor || (editableElement && editableElement.classList.contains('noteentry'));
}

function insertSeparator() {
  // Check if cursor is in editable note
  if (!isCursorInEditableNote()) {
    window.showCursorWarning();
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');

  if (!noteentry) return;

  // Try execCommand first for browsers that still support it
  try {
    const hrHTML = '<hr style="border: none; border-top: 1px solid #bbb; margin: 12px 0;">';
    const success = document.execCommand('insertHTML', false, hrHTML);

    if (success) {
      // Trigger input event
      noteentry.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  } catch (e) {
    // execCommand failed, use manual approach
  }

  // Fallback: manual insertion with undo support via modern API
  const hr = document.createElement('hr');
  hr.style.border = 'none';
  hr.style.borderTop = '1px solid #bbb';
  hr.style.margin = '12px 0';

  // Trigger beforeinput event for undo history
  const beforeInputEvent = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: null
  });

  if (noteentry.dispatchEvent(beforeInputEvent)) {
    // Insert the element
    if (!range.collapsed) {
      range.deleteContents();
    }
    range.insertNode(hr);

    // Position cursor after the HR
    range.setStartAfter(hr);
    range.setEndAfter(hr);
    sel.removeAllRanges();
    sel.addRange(range);

    // Trigger input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: null
    });
    noteentry.dispatchEvent(inputEvent);
  }
}

// Consolidated keydown handler for Enter behaviors
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return; // allow newline with Shift+Enter

  // Check if we're in a contenteditable note
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  
  // Check if we're in a contenteditable noteentry
  const noteentry = container.closest && container.closest('.noteentry');
  if (!noteentry || !noteentry.isContentEditable) return;
  
  // Check if cursor is inside a span with font-size style
  let fontSizeSpan = container.closest('span[style*="font-size"]');
  
  if (fontSizeSpan) {
    // Let the browser handle the Enter key first
    setTimeout(function() {
      try {
        const newSel = window.getSelection();
        if (!newSel.rangeCount) return;
        
        const newRange = newSel.getRangeAt(0);
        let newContainer = newRange.startContainer;
        if (newContainer.nodeType === 3) newContainer = newContainer.parentNode;
        
        // Check if we're still in a font-size span after Enter
        let newFontSizeSpan = newContainer.closest('span[style*="font-size"]');
        
        if (newFontSizeSpan) {
          // Remove font-size from the style
          const currentStyle = newFontSizeSpan.getAttribute('style') || '';
          const newStyle = currentStyle.replace(/font-size:[^;]+;?\s*/gi, '').trim();
          
          if (newStyle) {
            newFontSizeSpan.setAttribute('style', newStyle);
          } else {
            // If no other styles, unwrap the span
            const parent = newFontSizeSpan.parentNode;
            while (newFontSizeSpan.firstChild) {
              parent.insertBefore(newFontSizeSpan.firstChild, newFontSizeSpan);
            }
            parent.removeChild(newFontSizeSpan);
          }
          
          // Restore cursor position
          const restoreRange = document.createRange();
          restoreRange.setStart(newContainer, newRange.startOffset);
          restoreRange.collapse(true);
          newSel.removeAllRanges();
          newSel.addRange(restoreRange);
        }
      } catch (err) {
        // Silently fail if something goes wrong
      }
    }, 0);
  }
});

function toggleEmojiPicker() {
  const existingPicker = document.querySelector('.emoji-picker');

  if (existingPicker) {
    existingPicker.remove();
    window.savedRanges.emoji = null;
    return;
  }

  // If the cursor is not in an editable note, warn immediately
  // instead of waiting until an emoji is selected.
  if (!isCursorInEditableNote() && !window.savedActiveInput) {
    window.showCursorWarning();
    return;
  }

  // Save current selection so clicking inside the picker doesn't lose the caret.
  try {
    const sel = window.getSelection();
    window.savedRanges.emoji = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  } catch (e) {
    window.savedRanges.emoji = null;
  }

  // Save active input for title support
  if (document.activeElement && document.activeElement.classList.contains('css-title')) {
    window.savedActiveInput = document.activeElement;
    window.savedActiveInputSelection = {
      start: document.activeElement.selectionStart,
      end: document.activeElement.selectionEnd
    };
  } else if (!window.savedActiveInput) {
    window.savedActiveInput = null;
  }

  // Create emoji popup
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Simplified popular emojis collection
  const emojis = ['😀', '😃', '😄', '😊', '😍', '😘', '😎', '🤔', '😅', '😂', '😢', '😭', '😡', '👍', '👎', '👉', '👌', '✌️', '👏', '🙌', '👋', '🤝', '🙏', '✊', '👊', '❤️', '➜', '🚧', '✅', '🟩', '🟪', '☑️', '❌', '✔️', '❗', '❓', '⭐', '🔥', '💯', '🎯', '📌', '🚀', '💡', '🔔', '⚡', '🌟', '💎', '📱', '💻', '📧', '📁', '📄', '📝', '🔍', '🔑', '⚙️', '🛠️', '📊', '📈', '⚠️', '🚩', '🟢', '🔴', '🔵', '☀️', '🌙', '☕', '🍕', '🎂', '🍎', '🌱', '🌸', '🐱', '🐶', '🎵', '🎨'];

  // Create picker content
  const defaultHint = '💡 On Windows, press <kbd>Win</kbd> + <kbd>;</kbd> to open native emoji picker';
  let content = '<div class="emoji-hint">' + tr('editor.emoji.hint_windows', defaultHint) + '</div>';
  content += '<div class="emoji-category">';
  content += '<div class="emoji-grid">';

  emojis.forEach(emoji => {
    content += `<span class="emoji-item" data-emoji="${emoji}">${emoji}</span>`;
  });

  content += '</div></div>';

  picker.innerHTML = content;

  // Position picker near emoji button
  document.body.appendChild(picker);

  // Position picker with overflow management
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const isMobile = isMobileDevice();

  let anchorRect = null;
  const emojiBtn = document.querySelector('.btn-emoji');
  if (emojiBtn) {
    const rect = emojiBtn.getBoundingClientRect();
    let isVisible = rect.width > 0 && rect.height > 0;
    try {
      const style = window.getComputedStyle(emojiBtn);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) isVisible = false;
    } catch (e) { }

    if (isVisible) {
      anchorRect = rect;
    }
  }

  if (!anchorRect) {
    try {
      const range = window.savedRanges.emoji;
      if (range) {
        const rect = range.getBoundingClientRect();
        if (rect && (rect.top || rect.left || rect.bottom || rect.right)) {
          anchorRect = rect;
        } else {
          const rects = range.getClientRects();
          if (rects && rects.length) anchorRect = rects[0];
        }
      }
    } catch (e) { }
  }

  // Picker dimensions according to screen
  const pickerWidth = isMobile ? Math.min(300, windowWidth - 40) : 360;
  const pickerHeight = isMobile ? 450 : 550;
  picker.style.position = 'fixed';
  picker.style.width = pickerWidth + 'px';
  picker.style.maxHeight = pickerHeight + 'px';

  if (anchorRect) {
    const rect = anchorRect;
    let top = rect.bottom + 10;
    if (top + pickerHeight > windowHeight - 20) {
      top = rect.top - pickerHeight - 10;
    }
    let left = isMobile ? (windowWidth - pickerWidth) / 2 : rect.left - (pickerWidth / 2) + (rect.width / 2);
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
  } else {
    picker.style.top = ((windowHeight - pickerHeight) / 2) + 'px';
    picker.style.left = ((windowWidth - pickerWidth) / 2) + 'px';
  }
  clampToViewport(picker, 20);

  // Handle emoji clicks
  picker.addEventListener('click', function (e) {
    if (e.target.classList.contains('emoji-item')) {
      const emoji = e.target.getAttribute('data-emoji');
      insertEmoji(emoji);
      picker.remove();
    }
  });

  setupPopupDismiss(picker, '.btn-emoji', function () {
    window.savedRanges.emoji = null;
  });
}

function insertEmoji(emoji) {
  // Restore selection saved when opening the picker.
  const sel = window.getSelection();
  try {
    if (window.savedRanges.emoji) {
      sel.removeAllRanges();
      sel.addRange(window.savedRanges.emoji);
    }
  } catch (e) { }

  // Ensure focus is back on the editor before inserting.
  try {
    if (sel && sel.rangeCount) {
      const rangeForFocus = sel.getRangeAt(0);
      let focusContainer = rangeForFocus.commonAncestorContainer;
      if (focusContainer && focusContainer.nodeType === 3) focusContainer = focusContainer.parentNode;
      const focusTarget = (focusContainer && focusContainer.closest && (focusContainer.closest('.markdown-editor') || focusContainer.closest('[contenteditable="true"]')));
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (e) {
          focusTarget.focus();
        }
      }
    }
  } catch (e) { }

  // Handle title input insertion
  if (window.savedActiveInput) {
    const input = window.savedActiveInput;
    input.focus();

    if (window.savedActiveInputSelection) {
      input.setSelectionRange(window.savedActiveInputSelection.start, window.savedActiveInputSelection.end);
    } else {
      // Restore to saved position or end
    }

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.setRangeText(emoji, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    return;
  }

  // Vérifier si le curseur est dans une zone éditable
  if (!isCursorInEditableNote()) {
    window.showCursorWarning();
    window.savedRanges.emoji = null;
    return;
  }

  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');

  if (!noteentry) return;

  // Insert emoji
  document.execCommand('insertText', false, emoji);

  window.savedRanges.emoji = null;

  // Trigger input event
  if (noteentry) {
    noteentry.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Ensure functions are available in global scope
window.insertSeparator = insertSeparator;

// Link insertion functionality
function addLinkToNote() {
  try {
    // Check if we're in markdown mode
    const inMarkdown = typeof isInMarkdownEditor === 'function' && isInMarkdownEditor();

    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
    const selectedText = hasSelection ? sel.toString() : '';

    // For markdown, handle differently
    if (inMarkdown) {
      // Check if selection looks like a markdown link
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/;
      const match = selectedText.match(linkPattern);
      
      let existingUrl = 'https://';
      let existingText = selectedText;
      
      if (match) {
        existingText = match[1];
        existingUrl = match[2];
      }

      // Save selection
      if (hasSelection) {
        window.savedRanges.link = sel.getRangeAt(0).cloneRange();
      } else {
        window.savedRanges.link = null;
      }

      showLinkModal(existingUrl, existingText, function (url, text) {
        if (url === null) {
          // Remove link - replace with just text
          if (window.savedRanges.link) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(window.savedRanges.link);
            document.execCommand('insertText', false, existingText);
          }
          window.savedRanges.link = null;
          return;
        }

        if (!url) return;

        // Apply markdown link syntax
        if (typeof applyMarkdownLink === 'function') {
          applyMarkdownLink(url, text);
        }

        window.savedRanges.link = null;
      });
      return;
    }

    // HTML mode - original logic
    // Check if the selection is within an existing link
    let existingLink = null;
    let existingUrl = 'https://';

    if (hasSelection) {
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Check if the selection is inside a link element
      if (container.nodeType === Node.TEXT_NODE) {
        existingLink = container.parentElement.closest('a');
      } else if (container.nodeType === Node.ELEMENT_NODE) {
        existingLink = container.closest('a');
      }

      // If we found an existing link, get its URL
      if (existingLink && existingLink.href) {
        existingUrl = existingLink.href;
      }
    }

    // Save the current selection before opening modal to preserve it
    if (hasSelection) {
      window.savedRanges.link = sel.getRangeAt(0).cloneRange();
      window.savedExistingLink = existingLink;
    } else {
      window.savedRanges.link = null;
      window.savedExistingLink = null;
    }

    showLinkModal(existingUrl, selectedText, function (url, text) {
      // If url is null, it means we want to remove the link
      if (url === null) {
        if (window.savedExistingLink) {
          // Remove the link but keep the text content
          const linkText = window.savedExistingLink.textContent;
          const textNode = document.createTextNode(linkText);
          window.savedExistingLink.parentNode.replaceChild(textNode, window.savedExistingLink);

          // Save the note automatically
          const noteentry = document.querySelector('.noteentry');
          if (noteentry && typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately();
          }
        }

        // Clean up
        window.savedRanges.link = null;
        window.savedExistingLink = null;
        return;
      }

      if (!url) return;

      // If we're editing an existing link, just update it
      if (window.savedExistingLink) {
        window.savedExistingLink.href = url;
        if (text) {
          window.savedExistingLink.textContent = text;
        }
      } else {
        // Create a new link element
        const a = document.createElement('a');
        a.href = url;
        a.textContent = text;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        if (window.savedRanges.link) {
          // Restore the saved selection and replace it with the link
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(window.savedRanges.link);

          // Replace the selected text with the link
          window.savedRanges.link.deleteContents();
          window.savedRanges.link.insertNode(a);

          // Clear selection and position cursor after the link
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStartAfter(a);
          newRange.setEndAfter(a);
          sel.addRange(newRange);
        } else {
          // No saved selection, insert at current cursor position or end of editor
          const sel = window.getSelection();
          if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(a);
            // Position cursor after the link
            range.setStartAfter(a);
            range.setEndAfter(a);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            // Fallback: append to editor
            const noteentry = document.querySelector('.noteentry');
            if (noteentry) {
              noteentry.appendChild(a);
            }
          }
        }
      }

      // Save the note automatically
      const noteentry = document.querySelector('.noteentry');
      if (noteentry && typeof window.saveNoteImmediately === 'function') {
        window.saveNoteImmediately();
      }

      // Clean up saved range and existing link reference
      window.savedRanges.link = null;
      window.savedExistingLink = null;
    });
  } catch (err) {
    console.error('Error in addLinkToNote:', err);
  }
}

function toggleTablePicker() {
  const existingPicker = document.querySelector('.table-picker-popup');

  if (existingPicker) {
    existingPicker.remove();
    return;
  }

  // Check if cursor is in editable note BEFORE opening picker
  if (!isCursorInEditableNote()) {
    window.showCursorWarning();
    return;
  }

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

  setupPopupDismiss(picker, '.btn-table');
}

function insertTable(rows, cols) {
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
    const toggleBtn = toolbar.querySelector('.mobile-more-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu(toolbar) {
    const menu = getMenu(toolbar);
    if (!menu) return;
    menu.hidden = false;
    const toggleBtn = toolbar.querySelector('.mobile-more-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
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
      } catch (e) { }
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