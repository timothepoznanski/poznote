// Toolbar: markdown editor text and offsets.
// 
// Maps between a DOM range in the markdown editor and an offset in the markdown source,
// so toolbar actions can rewrite the source and put the caret back where it belongs.

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
      console.debug('toolbar-md-offsets: getMarkdownEditorText() failed:', e);
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
      console.debug('toolbar-md-offsets: replaceMarkdownRangeByOffsets() failed:', e);
  }

  return true;
}
