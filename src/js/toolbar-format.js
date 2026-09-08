// Toolbar: font size and code blocks.

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

  // Append popup to body and compute coordinates so it doesn't get clipped.
  // position: fixed, not absolute: on mobile <body> is itself the horizontal
  // scroller (css/index-mobile.css), so while a note is open body.scrollLeft is
  // one viewport wide and an absolutely-positioned popup lands off-screen.
  document.body.appendChild(popup);
  popup.style.position = 'fixed';
  popup.style.minWidth = '180px';

  // Position near the button, clamp to viewport. Right-align the popup on the
  // button, but never past the left edge: a fixed -220px offset put it fully
  // off-screen on narrow (mobile) viewports, where the button sits near x=220.
  const btnRect = fontSizeButton.getBoundingClientRect();
  const popupWidth = popup.offsetWidth || 220;
  popup.style.left = Math.max(8, btnRect.right - popupWidth) + 'px';
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

  // If already in a code block, unwrap it: keep the code as plain lines and
  // drop the copy/delete/language buttons that copy-code-on-focus.js added
  // around the <pre> (the .code-block-actions-host wrapper)
  const existingPre = container.closest ? container.closest('pre') : null;
  if (existingPre) {
    const host = existingPre.parentElement;
    const isActionButton = node => !!(node && node.nodeType === 1 && node.classList &&
      (node.classList.contains('code-block-copy-btn') ||
       node.classList.contains('code-block-delete-btn') ||
       node.classList.contains('code-block-lang-btn') ||
       node.classList.contains('code-block-line-numbers-btn')));
    const hostIsDedicated = !!(host && host.classList && host.classList.contains('code-block-actions-host') &&
      Array.from(host.childNodes).every(node =>
        node === existingPre || isActionButton(node) || (node.nodeType === 3 && !node.textContent.trim())));

    const replaceTarget = hostIsDedicated ? host : existingPre;
    // innerText keeps the <br> line breaks typed inside the block as newlines
    const codeText = (typeof existingPre.innerText === 'string' ? existingPre.innerText : existingPre.textContent)
      .replace(/\u200B/g, '').replace(/\r/g, '').replace(/\n$/, '');
    // Keep the unwrapped lines as their own block so they do not merge with
    // the text that precedes the code block (unless the block already sits
    // alone inside a line container such as a <div> created by Enter)
    const unwrappedNoteEntry = replaceTarget.closest ? replaceTarget.closest('.noteentry') : null;
    const lineParent = replaceTarget.parentElement;
    const alreadyOnOwnLine = !!(lineParent && lineParent !== unwrappedNoteEntry &&
      /^(DIV|P|LI)$/.test(lineParent.tagName) &&
      Array.from(lineParent.childNodes).every(node =>
        node === replaceTarget || (node.nodeType === 1 && node.tagName === 'BR') || (node.nodeType === 3 && !node.textContent.trim())));
    const fragment = alreadyOnOwnLine ? document.createDocumentFragment() : document.createElement('div');
    codeText.split('\n').forEach((line, index) => {
      if (index > 0) fragment.appendChild(document.createElement('br'));
      fragment.appendChild(document.createTextNode(line));
    });
    const lastNode = fragment.lastChild;

    if (!hostIsDedicated && host && host.classList && host.classList.contains('code-block-actions-host')) {
      Array.from(host.children).forEach(child => { if (isActionButton(child)) child.remove(); });
    }
    replaceTarget.parentNode.replaceChild(fragment, replaceTarget);

    if (lastNode) {
      const caretRange = document.createRange();
      caretRange.setStart(lastNode, lastNode.nodeType === 3 ? lastNode.length : 0);
      caretRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caretRange);
    }
    if (unwrappedNoteEntry) {
      unwrappedNoteEntry.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
