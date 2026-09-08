// Toolbar: inline code and separators.
// 
// Also registers the toolbar's keydown shortcuts.

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
