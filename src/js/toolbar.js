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

  // Highlight (background) colors — same picker UI as text color.
  const HIGHLIGHT_COLORS = [
    { key: 'editor.highlights.yellow', fallback: 'Yellow', value: '#ffe066' },
    { key: 'editor.highlights.red', fallback: 'Red', value: '#ffa8a8' },
    { key: 'editor.highlights.green', fallback: 'Green', value: '#b2f2bb' },
    { key: 'editor.highlights.blue', fallback: 'Blue', value: '#a5d8ff' },
    { key: 'editor.highlights.pink', fallback: 'Pink', value: '#ffc9de' },
    { key: 'editor.highlights.orange', fallback: 'Orange', value: '#ffd8a8' },
    { key: 'editor.highlights.purple', fallback: 'Purple', value: '#d0bfff' },
    { key: 'editor.highlights.gray', fallback: 'Gray', value: '#dee2e6' },
    { key: 'editor.colors.none', fallback: 'None', value: 'none' }
  ];

  // Use global translation function from globals.js.
  // Resolve window.t lazily: it may not be defined yet when this script loads.
  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      return window.t(key, null, fallback);
    }
    return fallback || key;
  }

  // Save/restore selection helpers
  function saveSelection(key) {
    key = key || 'color';
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      window.savedRanges[key] = sel.getRangeAt(0).cloneRange();
    } else {
      window.savedRanges[key] = null;
    }
  }

  function restoreSelection(key) {
    key = key || 'color';
    const r = window.savedRanges[key];
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

  }

  // Remove any existing popup
  function removeExistingPopup() {
    const prev = document.querySelector('.color-palette-popup');
    if (prev) prev.remove();
    window.savedRanges.color = null;
    window.savedRanges.highlight = null;
  }

  // Build popup DOM
  function buildPopup(colors) {
    const popup = document.createElement('div');
    popup.className = 'color-palette-popup';
    const grid = document.createElement('div');
    grid.className = 'color-grid';

    (colors || COLORS).forEach(c => {
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

  function getViewportBounds() {
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0;
    const top = viewport ? viewport.offsetTop : 0;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height
    };
  }

  function isMobileColorPaletteViewport() {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
    } catch (e) {
      return window.innerWidth <= 800;
    }
  }

  function positionColorPopup(popup, btn) {
    const margin = 8;
    const btnRect = btn ? btn.getBoundingClientRect() : { left: margin, right: margin + 30, bottom: 40, width: 30 };
    const popupRect = popup.getBoundingClientRect();
    const viewport = getViewportBounds();
    const viewportWidth = viewport.right - viewport.left;
    const preferredLeft = isMobileColorPaletteViewport()
      ? viewport.left + ((viewportWidth - popupRect.width) / 2)
      : btnRect.left + (btnRect.width / 2) - (popupRect.width / 2);
    const maxLeft = Math.max(viewport.left + margin, viewport.right - popupRect.width - margin);
    const left = Math.min(Math.max(preferredLeft, viewport.left + margin), maxLeft);
    const top = Math.min(
      Math.max(btnRect.bottom + 8, viewport.top + margin),
      Math.max(viewport.top + margin, viewport.bottom - popupRect.height - margin)
    );

    popup.style.position = 'fixed';
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    const caretX = (btnRect.left + (btnRect.width / 2)) - left;
    popup.style.setProperty('--caret-x', Math.max(8, Math.min(caretX, popupRect.width - 8)) + 'px');
  }

  function getColorTriggerButton(triggerButton, selector) {
    if (triggerButton && triggerButton.classList && triggerButton.classList.contains(selector.slice(1))) {
      return triggerButton;
    }

    const activeElement = document.activeElement;
    if (activeElement && activeElement.classList && activeElement.classList.contains(selector.slice(1))) {
      return activeElement;
    }

    return document.querySelector(selector);
  }

  // Apply a highlight (background) color to the saved selection, or remove it.
  function applyHighlightToSelection(color) {
    // Markdown mode uses the plain-text == wrapping (single style available)
    if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
      if (typeof applyMarkdownHighlight === 'function') {
        restoreSelection('highlight');
        applyMarkdownHighlight(color);
      }
      return;
    }

    // HTML mode
    restoreSelection('highlight');

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {
      // ignore
    }

    if (color === 'none') {
      try {
        document.execCommand('hiliteColor', false, 'inherit');
      } catch (e) {
        // ignore
      }
    } else {
      try {
        document.execCommand('hiliteColor', false, color);
      } catch (e) {
        // ignore
      }
    }

    try {
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {
      // ignore
    }
  }

  // Generic popup opener shared by the text-color and highlight buttons.
  function openColorPopup(triggerButton, options) {
    try {
      removeExistingPopup();
      saveSelection(options.key);

      const btn = getColorTriggerButton(triggerButton, options.selector);
      const popup = buildPopup(options.colors);
      document.body.appendChild(popup);

      positionColorPopup(popup, btn);

      // show class for CSS transitions
      setTimeout(() => popup.classList.add('show'), 10);

      // Dismiss on outside click / Escape
      const closePopup = setupPopupDismiss(popup, options.selector, function () {
        window.savedRanges[options.key] = null;
      });

      // Click handler
      popup.addEventListener('click', function (e) {
        const btnItem = e.target.closest('.color-item');
        if (!btnItem) return;
        const color = btnItem.getAttribute('data-color');
        options.apply(color);
        closePopup();
      });

    } catch (err) {

    }
  }

  // Main entry: show text-color popup centered under the palette button
  function toggleRedColor(triggerButton) {
    openColorPopup(triggerButton, {
      key: 'color',
      selector: '.btn-color',
      colors: COLORS,
      apply: applyColorToSelection
    });
  }

  // Main entry: show highlight-color popup centered under the highlight button
  function toggleYellowHighlight(triggerButton) {
    openColorPopup(triggerButton, {
      key: 'highlight',
      selector: '.btn-highlight',
      colors: HIGHLIGHT_COLORS,
      apply: applyHighlightToSelection
    });
  }

  // Export
  window.toggleRedColor = toggleRedColor;
  window.toggleYellowHighlight = toggleYellowHighlight;
  // Also expose apply helpers in case other scripts call them
  window.applyColorToSelection = applyColorToSelection;
  window.applyHighlightToSelection = applyHighlightToSelection;

})();

function applyHtmlBlockStyle(style) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  try {
    document.execCommand('styleWithCSS', false, false);
  } catch (e) {
    // ignore
  }

  // Strip heading-anchor links from the current block before formatBlock.
  // The <a contenteditable="false"> inside a heading confuses the browser's
  // formatBlock implementation: instead of replacing e.g. <h2> with <h1> in
  // place it can create a second heading element, causing the outline to show
  // duplicates until the page is refreshed.
  var currentRange = sel.getRangeAt(0);
  var anchorContainer = currentRange.commonAncestorContainer;
  if (anchorContainer.nodeType === 3) anchorContainer = anchorContainer.parentNode;
  var currentHeading = anchorContainer.closest ? anchorContainer.closest('h1,h2,h3,h4,h5,h6') : null;
  if (currentHeading) {
    var headingAnchors = currentHeading.querySelectorAll('.heading-anchor');
    for (var a = 0; a < headingAnchors.length; a++) {
      headingAnchors[a].remove();
    }
  }

  var formatTag = style === 'normal' ? 'div' : ('h' + style);
  var execValues = [formatTag, '<' + formatTag + '>'];

  for (var i = 0; i < execValues.length; i++) {
    try {
      if (document.execCommand('formatBlock', false, execValues[i])) {
        return;
      }
    } catch (e) {
      // Try the next formatBlock syntax
    }
  }
}

function getEditorFromRange(range) {
  if (!range) return null;

  var node = range.commonAncestorContainer;
  if (node && node.nodeType === 3) {
    node = node.parentNode;
  }

  if (!node || !node.closest) return null;

  var markdownEditor = node.closest('.markdown-editor');
  if (markdownEditor) return markdownEditor;

  var editable = node.closest('[contenteditable="true"]');
  if (editable) return editable;

  return node.closest('.noteentry');
}

function captureScrollState(editor) {
  var rightCol = document.getElementById('right_col');
  var noteCard = editor && editor.closest ? editor.closest('.notecard') : null;

  return {
    rightCol: rightCol,
    rightColTop: rightCol ? rightCol.scrollTop : null,
    rightColLeft: rightCol ? rightCol.scrollLeft : null,
    noteCard: noteCard,
    noteCardTop: noteCard ? noteCard.scrollTop : null,
    noteCardLeft: noteCard ? noteCard.scrollLeft : null,
    windowX: window.scrollX || window.pageXOffset || 0,
    windowY: window.scrollY || window.pageYOffset || 0
  };
}

function restoreScrollState(scrollState) {
  if (!scrollState) return;

  if (scrollState.rightCol) {
    scrollState.rightCol.scrollTop = scrollState.rightColTop;
    scrollState.rightCol.scrollLeft = scrollState.rightColLeft;
  }

  if (scrollState.noteCard) {
    scrollState.noteCard.scrollTop = scrollState.noteCardTop;
    scrollState.noteCard.scrollLeft = scrollState.noteCardLeft;
  }

  window.scrollTo(scrollState.windowX, scrollState.windowY);
}

function focusEditorWithoutScroll(editor, scrollState) {
  if (!editor) return;

  if (window.PoznoteMarkdownCodeMirror &&
    typeof window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor === 'function' &&
    window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor(editor) &&
    typeof window.PoznoteMarkdownCodeMirror.focus === 'function') {
    window.PoznoteMarkdownCodeMirror.focus(editor);
    restoreScrollState(scrollState);
    return;
  }

  try {
    editor.focus({ preventScroll: true });
  } catch (e) {
    editor.focus();
    restoreScrollState(scrollState);
  }
}

function escapeMarkdownLinkLabel(text, fallback) {
  const normalized = String(text || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  const value = normalized || fallback || '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function normalizeMarkdownLinkDestination(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/[\u0000-\u001F\u007F]/.test(value)) return '';
  const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto' && scheme !== 'tel') {
      return '';
    }
  }
  return value.replace(/[()\s<>]/g, function (match) {
    return encodeURIComponent(match);
  });
}

function buildSafeMarkdownLink(label, url) {
  const destination = normalizeMarkdownLinkDestination(url);
  if (!destination) return '';
  return '[' + escapeMarkdownLinkLabel(label || url || 'link', 'link') + '](' + destination + ')';
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

  // Detect if we're in markdown BEFORE opening the popup
  const savedIsMarkdown = typeof isInMarkdownEditor === 'function' && isInMarkdownEditor();

  // Find the font size button to position the popup
  const fontSizeButton = document.querySelector('.btn-text-height');
  if (!fontSizeButton) return;

  // Create the popup
  const popup = document.createElement('div');
  popup.className = 'font-size-popup';

  // Block style options aligned with the slash menu title commands
  const textStyles = [
    { value: 'normal', key: 'slash_menu.back_to_normal', fallback: 'Back to normal text', preview: 'Text', previewClass: 'style-normal' },
    { value: '1', key: 'slash_menu.heading_1', fallback: 'Heading 1', preview: 'H1', previewClass: 'style-h1' },
    { value: '2', key: 'slash_menu.heading_2', fallback: 'Heading 2', preview: 'H2', previewClass: 'style-h2' },
    { value: '3', key: 'slash_menu.heading_3', fallback: 'Heading 3', preview: 'H3', previewClass: 'style-h3' }
  ];

  // Build popup content
  let popupHTML = '';
  textStyles.forEach(style => {
    popupHTML += `
      <div class="font-size-item" data-style="${style.value}">
        <span class="size-label">${tr(style.key, null, style.fallback)}</span>
        <span class="size-preview ${style.previewClass}">${style.preview}</span>
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

  // Add click handlers for text style items
  popup.querySelectorAll('.font-size-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const style = item.getAttribute('data-style');

      // Restore selection on the same editor without changing the current scroll position.
      const editor = getEditorFromRange(savedRange) || document.querySelector('.noteentry[contenteditable="true"], .markdown-editor, [contenteditable="true"]');
      if (editor && savedRange) {
        const scrollState = captureScrollState(editor);
        focusEditorWithoutScroll(editor, scrollState);

        // Restore the saved selection
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
        restoreScrollState(scrollState);

        if (savedIsMarkdown) {
          // Use the markdown-specific heading function
          if (typeof applyMarkdownHeadingLevel === 'function') {
            applyMarkdownHeadingLevel(style);
          }
          // Force refresh outline panel for markdown notes after preview update
          // Wait 350ms for markdown preview debounce (300ms) + rendering time
          if (window.outlinePanel && window.outlinePanel.refresh) {
            setTimeout(() => {
              window.outlinePanel.refresh();
            }, 350);
          }
        } else {
          // Use HTML formatBlock
          applyHtmlBlockStyle(style);
          // Force refresh outline panel after DOM change so it reflects the new
          // heading tag immediately rather than waiting for the debounced
          // MutationObserver (which can show a stale or duplicate entry).
          if (window.outlinePanel && window.outlinePanel.refresh) {
            setTimeout(() => {
              window.outlinePanel.refresh();
            }, 50);
          }
        }

        const noteentry = editor.closest('.noteentry') || document.querySelector('.noteentry');
        if (noteentry) {
          noteentry.dispatchEvent(new Event('input', { bubbles: true }));
        }

        requestAnimationFrame(() => restoreScrollState(scrollState));
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

  function focusNoteEntry() {
    if (!noteEntry) return;
    try {
      noteEntry.focus({ preventScroll: true });
    } catch (e) {
      noteEntry.focus();
    }
  }

  function placeCaretInsideCodeBlock(pre, collapseToEnd) {
    if (!pre) return;

    const selection = window.getSelection();
    if (!selection) return;

    const editableCode = pre.querySelector('code') || pre;
    const newRange = document.createRange();
    const textNode = collapseToEnd ? getLastTextNode(editableCode) : null;

    if (textNode) {
      newRange.setStart(textNode, textNode.textContent.length);
    } else {
      newRange.setStart(editableCode, 0);
    }

    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }

  function getLastTextNode(root) {
    if (!root) return null;
    if (root.nodeType === 3) return root;

    for (let i = root.childNodes.length - 1; i >= 0; i--) {
      const textNode = getLastTextNode(root.childNodes[i]);
      if (textNode) return textNode;
    }

    return null;
  }

  function insertCodeBlock(textContent) {
    const fragment = document.createDocumentFragment();
    const pre = document.createElement('pre');
    const code = document.createElement('code');

    pre.className = 'code-block';
    pre.setAttribute('data-language', 'CODE');
    code.setAttribute('data-language', 'CODE');

    if (textContent) {
      code.textContent = textContent;
    } else {
      code.appendChild(document.createElement('br'));
    }

    pre.appendChild(code);

    if (atFirstLine) {
      fragment.appendChild(document.createElement('br'));
    }

    fragment.appendChild(pre);

    if (atLastLine) {
      fragment.appendChild(document.createElement('br'));
    }

    range.deleteContents();
    range.insertNode(fragment);

    focusNoteEntry();
    placeCaretInsideCodeBlock(pre, !!textContent);

    setTimeout(function () {
      focusNoteEntry();
      placeCaretInsideCodeBlock(pre, !!textContent);

      if (noteEntry) {
        noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 50);
  }

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
    insertCodeBlock('');
    return;
  }

  // Get selected text with normalized line breaks to avoid extra blank lines
  const selectedText = getNormalizedRangeText(range);
  if (!selectedText.trim()) return;

  insertCodeBlock(selectedText.replace(/\u200B/g, ''));
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

function getMarkdownEditorText(editor) {
  if (!editor) return '';

  try {
    if (typeof window.normalizeContentEditableText === 'function') {
      return window.normalizeContentEditableText(editor);
    }
  } catch (e) {
    // Fall through to plain text extraction.
  }

  return editor.innerText || editor.textContent || '';
}

function getMarkdownEditorFromRange(range) {
  var editor = getEditorFromRange(range);
  if (!editor) return null;

  if (editor.classList && editor.classList.contains('markdown-editor')) {
    return editor;
  }

  return editor.querySelector ? editor.querySelector('.markdown-editor') : null;
}

function getRangeOffsetsWithinEditor(editor, range) {
  if (!editor || !range) return null;

  if (window.PoznoteMarkdownCodeMirror &&
    typeof window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor === 'function' &&
    window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor(editor) &&
    typeof window.PoznoteMarkdownCodeMirror.getSelectionOffsets === 'function') {
    return window.PoznoteMarkdownCodeMirror.getSelectionOffsets(editor);
  }

  try {
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return null;
    }

    var fullTextLength = getMarkdownEditorText(editor).length;
    var start = getNormalizedOffsetForEditorBoundary(editor, range.startContainer, range.startOffset);
    var end = getNormalizedOffsetForEditorBoundary(editor, range.endContainer, range.endOffset);

    if (start === null || end === null) {
      var startRange = range.cloneRange();
      startRange.selectNodeContents(editor);
      startRange.setEnd(range.startContainer, range.startOffset);
      start = startRange.toString().length;

      var endRange = range.cloneRange();
      endRange.selectNodeContents(editor);
      endRange.setEnd(range.endContainer, range.endOffset);
      end = endRange.toString().length;
    }

    start = Math.max(0, Math.min(start, fullTextLength));
    end = Math.max(0, Math.min(end, fullTextLength));

    return {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  } catch (e) {
    return null;
  }
}

function isMarkdownEditorPlaceholder(node) {
  return !!(node && node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('markdown-excalidraw-placeholder'));
}

function getMarkdownEditorPlaceholderSource(node) {
  if (!isMarkdownEditorPlaceholder(node)) return '';
  return node.getAttribute('data-markdown-source') || node.textContent || '';
}

function isMarkdownEditorBlockElement(node) {
  return !!(node && node.nodeType === Node.ELEMENT_NODE && ['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(node.tagName) !== -1);
}

function pushNormalizedEditorPart(state, part) {
  var text = String(part || '');
  state.length += text.length;
  state.lastPart = text;
  state.hasParts = true;
}

function getNormalizedEditorBlockPrefixLength(state) {
  return state.hasParts && state.lastPart && !state.lastPart.endsWith('\n') ? 1 : 0;
}

function getTextContentOffsetWithinNode(rootNode, container, offset) {
  var traversed = 0;
  var found = false;

  function getNodeTextLength(node) {
    return (node && node.textContent ? node.textContent : '').length;
  }

  function walk(node) {
    if (!node || found) return;

    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        var textLength = node.nodeValue ? node.nodeValue.length : 0;
        traversed += Math.max(0, Math.min(offset, textLength));
      } else if (node.childNodes) {
        var childLimit = Math.max(0, Math.min(offset, node.childNodes.length));
        for (var i = 0; i < childLimit; i++) {
          traversed += getNodeTextLength(node.childNodes[i]);
        }
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      traversed += node.nodeValue ? node.nodeValue.length : 0;
      return;
    }

    if (node.childNodes) {
      for (var j = 0; j < node.childNodes.length; j++) {
        walk(node.childNodes[j]);
        if (found) return;
      }
    }
  }

  walk(rootNode);
  return found ? traversed : getNodeTextLength(rootNode);
}

function getNormalizedOffsetWithinEditorNode(node, container, offset, state) {
  if (node.nodeType === Node.TEXT_NODE) {
    var textLength = node.nodeValue ? node.nodeValue.length : 0;
    return Math.max(0, Math.min(offset, textLength));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return 0;
  }

  if (isMarkdownEditorPlaceholder(node)) {
    if (node === container) {
      return offset > 0 ? getMarkdownEditorPlaceholderSource(node).length : 0;
    }
    return 0;
  }

  if (isMarkdownEditorBlockElement(node)) {
    var prefixLength = getNormalizedEditorBlockPrefixLength(state);
    var blockText = node.textContent || '';
    var isEmptyBlock = blockText === '' && node.querySelector && node.querySelector('br');

    if (isEmptyBlock) {
      return prefixLength + (node === container && offset > 0 ? 1 : 0);
    }

    return prefixLength + getTextContentOffsetWithinNode(node, container, offset);
  }

  if (node.tagName === 'BR') {
    return node === container && offset > 0 ? 1 : 0;
  }

  return getTextContentOffsetWithinNode(node, container, offset);
}

function appendNormalizedEditorNode(state, node) {
  if (node.nodeType === Node.TEXT_NODE) {
    pushNormalizedEditorPart(state, node.textContent || node.nodeValue || '');
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  if (isMarkdownEditorPlaceholder(node)) {
    pushNormalizedEditorPart(state, getMarkdownEditorPlaceholderSource(node));
    return;
  }

  if (isMarkdownEditorBlockElement(node)) {
    if (getNormalizedEditorBlockPrefixLength(state)) {
      pushNormalizedEditorPart(state, '\n');
    }

    var blockText = node.textContent || '';
    var isEmptyBlock = blockText === '' && node.querySelector && node.querySelector('br');

    if (isEmptyBlock) {
      pushNormalizedEditorPart(state, '\n');
    } else {
      pushNormalizedEditorPart(state, blockText);
      pushNormalizedEditorPart(state, '\n');
    }
    return;
  }

  if (node.tagName === 'BR') {
    pushNormalizedEditorPart(state, '\n');
    return;
  }

  pushNormalizedEditorPart(state, node.textContent || '');
}

function getNormalizedOffsetForEditorBoundary(editor, container, offset) {
  if (!editor || !container) return null;

  var state = {
    length: 0,
    lastPart: '',
    hasParts: false
  };

  var childNodes = editor.childNodes || [];

  for (var i = 0; i < childNodes.length; i++) {
    var child = childNodes[i];

    if (container === editor && i === offset) {
      return state.length + (isMarkdownEditorBlockElement(child) ? getNormalizedEditorBlockPrefixLength(state) : 0);
    }

    if (child === container || (child.contains && child.contains(container))) {
      return state.length + getNormalizedOffsetWithinEditorNode(child, container, offset, state);
    }

    appendNormalizedEditorNode(state, child);
  }

  if (container === editor && offset >= childNodes.length) {
    return state.length;
  }

  return null;
}

function findTextNodeAtOffset(rootEl, offset) {
  var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  var node = walker.nextNode();
  var remaining = offset;

  while (node) {
    var length = node.nodeValue ? node.nodeValue.length : 0;
    if (remaining <= length) {
      return { node: node, offset: remaining };
    }

    remaining -= length;
    node = walker.nextNode();
  }

  return {
    node: rootEl,
    offset: rootEl.childNodes ? rootEl.childNodes.length : 0
  };
}

function setSelectionByEditorOffsets(editor, startOffset, endOffset) {
  if (!editor) return;

  if (window.PoznoteMarkdownCodeMirror &&
    typeof window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor === 'function' &&
    window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor(editor) &&
    typeof window.PoznoteMarkdownCodeMirror.setSelection === 'function') {
    window.PoznoteMarkdownCodeMirror.setSelection(editor, startOffset, endOffset);
    return;
  }

  var selection = window.getSelection();
  if (!selection) return;

  var startPos = findTextNodeAtOffset(editor, Math.max(0, startOffset));
  var endPos = findTextNodeAtOffset(editor, Math.max(0, endOffset));
  var range = document.createRange();

  try {
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
  } catch (e) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceMarkdownRangeByOffsets(editor, start, end, replacement) {
  if (!editor) return false;

  if (window.PoznoteMarkdownCodeMirror &&
    typeof window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor === 'function' &&
    window.PoznoteMarkdownCodeMirror.isCodeMirrorEditor(editor) &&
    typeof window.PoznoteMarkdownCodeMirror.replaceRange === 'function') {
    return window.PoznoteMarkdownCodeMirror.replaceRange(editor, start, end, replacement);
  }

  var fullText = getMarkdownEditorText(editor);
  var safeStart = Math.max(0, Math.min(start, fullText.length));
  var safeEnd = Math.max(safeStart, Math.min(end, fullText.length));
  var newText = fullText.slice(0, safeStart) + replacement + fullText.slice(safeEnd);

  editor.textContent = newText;
  setSelectionByEditorOffsets(editor, safeStart + replacement.length, safeStart + replacement.length);

  try {
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (e) {
    // Ignore input dispatch failures.
  }

  return true;
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

      // Wrap the new selection (with hyphens) in inline code
      insertInlineCode(sel.toString());
      return;
    }
  }

  // Wrap normal selections in inline code
  insertInlineCode(selectedText);
}

/**
 * Replace the current selection with a real <code> element.
 *
 * We insert through document.execCommand('insertHTML', ...) so the operation is
 * recorded on the browser's native undo stack (Ctrl+Z). A plain
 * range.insertNode would keep the <code> tag but is NOT undoable — worse, it
 * corrupts the native stack so Ctrl+Z then chews through earlier typing while
 * the code stays stuck.
 *
 * The catch: when the selection sits inside an element carrying an inline
 * font-family, Chrome "normalizes" the inserted markup, dropping the <code>
 * tag (and any attribute/class we put on it) and re-emitting a styled <span>
 * that copies code's background/color/size but NOT its font — so the word keeps
 * the surrounding font instead of the monospace face.
 *
 * Since the tag and our markers don't survive, we detect that stripped span by
 * diffing the note's elements before and after the insertion: the newly created
 * non-<code> element that holds exactly our text is the culprit, and we convert
 * it back to <code>. Undo still removes it in one step because the surrounding
 * insertHTML operation is what's on the stack.
 */
function insertInlineCode(text) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let container = sel.getRangeAt(0).commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteEntry = container && container.closest ? container.closest('.noteentry') : null;
  const scope = noteEntry || document;

  // Snapshot existing elements so we can spot the one the insertion creates.
  const before = new Set(scope.querySelectorAll('*'));

  document.execCommand('insertHTML', false, '<code>' + escapedText + '</code>');

  // If Chrome kept the <code> tag we're done. Otherwise find the new styled
  // element holding our text and rebuild it as <code> so monospace applies.
  scope.querySelectorAll('*').forEach(function (el) {
    if (before.has(el) || el.tagName === 'CODE') return;
    const style = el.getAttribute && el.getAttribute('style') || '';
    if (el.textContent === text && /background-color/.test(style) && /color/.test(style)) {
      const code = document.createElement('code');
      code.textContent = el.textContent;
      el.replaceWith(code);
    }
  });
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
    if (window.savedActiveInput && window.savedActiveInput.classList && window.savedActiveInput.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(window.savedActiveInput);
    }
    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
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
  // Don't overwrite if already set (e.g., by slash command)
  if (document.activeElement && document.activeElement.classList.contains('css-title')) {
    window.savedActiveInput = document.activeElement;
    // Only save selection if not already saved
    if (!window.savedActiveInputSelection) {
      window.savedActiveInputSelection = {
        start: document.activeElement.selectionStart,
        end: document.activeElement.selectionEnd
      };
    }
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
    if (window.savedActiveInput && window.savedActiveInput.classList && window.savedActiveInput.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(window.savedActiveInput);
    }
    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
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

  // Handle input insertion (title and task fields)
  if (window.savedActiveInput) {
    const input = window.savedActiveInput;
    input.focus();

    if (window.savedActiveInputSelection) {
      // Validate selection positions to avoid errors
      const maxLength = input.value.length;
      const safeStart = Math.max(0, Math.min(window.savedActiveInputSelection.start, maxLength));
      const safeEnd = Math.max(safeStart, Math.min(window.savedActiveInputSelection.end, maxLength));
      input.setSelectionRange(safeStart, safeEnd);
    } else {
      // Restore to saved position or end
    }

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.setRangeText(emoji, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (input.classList && input.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(input);
    }

    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
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
    const currentRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    const toolbarSavedRange = !currentRange && savedMobileToolbarRange ? savedMobileToolbarRange.cloneRange() : null;
    const activeRange = currentRange || toolbarSavedRange;
    const hasSelection = activeRange && !activeRange.collapsed;
    let selectedText = hasSelection ? getNormalizedRangeText(activeRange) : '';

    // For markdown, handle differently
    if (inMarkdown) {
      const markdownEditor = getMarkdownEditorFromRange(activeRange);
      const markdownOffsets = markdownEditor && activeRange
        ? getRangeOffsetsWithinEditor(markdownEditor, activeRange)
        : null;

      // Check if selection looks like a markdown link
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/;
      const match = selectedText.match(linkPattern);
      
      let existingUrl = 'https://';
      let existingText = selectedText;
      
      if (match) {
        existingText = match[1];
        existingUrl = match[2];
      }

      // Save range for markdown mode too
      window.savedRanges.link = activeRange ? activeRange.cloneRange() : null;

      showLinkModal(existingUrl, existingText, function (url, text) {
        if (url === null) {
          // Remove link - replace with just text
          if (markdownEditor && markdownOffsets) {
            replaceMarkdownRangeByOffsets(markdownEditor, markdownOffsets.start, markdownOffsets.end, existingText);
          } else if (window.savedRanges.link) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(window.savedRanges.link);
            document.execCommand('insertText', false, existingText);
          }
          window.savedRanges.link = null;
          return;
        }

        if (!url) {
          window.savedRanges.link = null;
          return;
        }

        if (markdownEditor) {
          try { markdownEditor.focus({ preventScroll: true }); } catch (e) { markdownEditor.focus(); }
        }

        const linkMarkdown = buildSafeMarkdownLink(text || existingText || url || 'link', url);
        if (!linkMarkdown) {
          if (typeof showNotificationPopup === 'function') {
            showNotificationPopup((window.t || function (key, params, fallback) { return fallback; })('slash_menu.invalid_url', null, 'Invalid URL'), 'error');
          }
          window.savedRanges.link = null;
          return;
        }

        // Apply markdown link syntax
        if (markdownEditor && markdownOffsets) {
          replaceMarkdownRangeByOffsets(markdownEditor, markdownOffsets.start, markdownOffsets.end, linkMarkdown);
        } else if (typeof applyMarkdownLink === 'function') {
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

    if (hasSelection && activeRange) {
      const range = activeRange;
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
        a.textContent = text || url;
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
  return `\n| ${header} |\n| ${separator} |\n${Array.from({ length: rows - 1 }, () => `| ${row} |`).join('\n')}\n`;
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
    } catch (e) { }

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
