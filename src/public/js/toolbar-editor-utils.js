// Toolbar editor helpers.
// 
// Finding the editor a range belongs to, preserving scroll position across a focus
// change, and building safe markdown links.

function applyHtmlBlockStyle(style) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  try {
    document.execCommand('styleWithCSS', false, false);
  } catch (e) {
      // ignore
      console.debug('toolbar-editor-utils: applyHtmlBlockStyle() failed:', e);
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
        console.debug('toolbar-editor-utils: applyHtmlBlockStyle() failed:', e);
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
