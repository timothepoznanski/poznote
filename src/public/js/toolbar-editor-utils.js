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

  var formatTag = style === 'normal' ? 'div' : ('h' + style);
  var execValues = [formatTag, '<' + formatTag + '>'];

  for (var i = 0; i < execValues.length; i++) {
    try {
      if (document.execCommand('formatBlock', false, execValues[i])) {
        break;
      }
    } catch (e) {
        // Try the next formatBlock syntax
        console.debug('toolbar-editor-utils: applyHtmlBlockStyle() failed:', e);
    }
  }

  if (style === 'normal') {
    unwrapSelectedHtmlHeadings();
  }
}

// Bullet or numbered list on the selected lines. Chrome builds the list
// inside the line's block: fine in a <div>, invalid in a <p> (notes written by
// the API, the AI assistant or a paste use <p>), where the next reload splits
// it into <p></p><ul>…</ul><p></p> and leaves empty paragraphs around the
// list (issue #1580). Such a line becomes a <div> first, through execCommand
// so both steps stay on the undo stack.
function execHtmlListCommand(ordered) {
  var sel = window.getSelection();
  if (sel && sel.rangeCount) {
    var node = sel.getRangeAt(0).startContainer;
    if (node && node.nodeType === 3) node = node.parentNode;
    var block = node && node.closest ? node.closest('p, li') : null;
    if (block && block.tagName === 'P' && block.isContentEditable) {
      try {
        document.execCommand('formatBlock', false, 'div');
      } catch (e) {
        console.debug('toolbar-editor-utils: execHtmlListCommand() failed:', e);
      }
    }
  }
  return document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
}

var HTML_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function isHtmlHeadingBlockChild(node) {
  return node.nodeType === 1 && /^(DIV|P|ASIDE|UL|OL|TABLE|PRE|BLOCKQUOTE|HR|DETAILS|H[1-6])$/.test(node.tagName);
}

// The heading (h1 to h6) holding the start of the selection in a rich-text
// note, null in normal text
function getHtmlSelectionHeading() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  var node = sel.getRangeAt(0).startContainer;
  if (node && node.nodeType === 3) node = node.parentNode;
  var heading = node && node.closest ? node.closest(HTML_HEADING_SELECTOR) : null;
  return heading && heading.isContentEditable && heading.closest('.noteentry') ? heading : null;
}

// True when the selection covers the heading: a caret inside it, or a
// selection holding some of its text (a triple click ends at the start of the
// next block, which must stay as it is)
function isHtmlHeadingSelected(range, heading) {
  if (!range.intersectsNode(heading)) return false;
  if (range.collapsed) return true;

  var covered = document.createRange();
  covered.selectNodeContents(heading);
  if (range.compareBoundaryPoints(Range.START_TO_START, covered) > 0) {
    covered.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, covered) < 0) {
    covered.setEnd(range.endContainer, range.endOffset);
  }
  return covered.toString() !== '';
}

// Replaces a heading with plain blocks holding the same content. A heading
// that wraps blocks of its own (<h2><aside>…</aside><div>…</div></h2>) hands
// them to its parent, a run of loose text between them goes in a div.
function replaceHtmlHeadingWithPlainBlocks(heading) {
  var fragment = document.createDocumentFragment();
  var run = null;

  while (heading.firstChild) {
    var child = heading.firstChild;
    if (isHtmlHeadingBlockChild(child)) {
      run = null;
      fragment.appendChild(child);
      continue;
    }
    if (!run) {
      if (child.nodeType === 3 && !child.textContent.trim()) {
        heading.removeChild(child);
        continue;
      }
      run = document.createElement('div');
      if (heading.style.textAlign) run.style.textAlign = heading.style.textAlign;
      fragment.appendChild(run);
    }
    run.appendChild(child);
  }

  if (!fragment.firstChild) {
    fragment.appendChild(document.createElement('div')).innerHTML = '<br>';
  }
  heading.parentNode.replaceChild(fragment, heading);
}

// Turns the headings still under the selection into normal text. formatBlock
// leaves a heading alone when the selection sits in a block nested inside it
// (<h2><div>text</div></h2>): the nearest block is a div already.
function unwrapSelectedHtmlHeadings() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  var range = sel.getRangeAt(0);
  var editor = getEditorFromRange(range);
  if (!editor || !editor.isContentEditable || editor.classList.contains('markdown-editor')) return false;

  var headings = Array.prototype.filter.call(editor.querySelectorAll(HTML_HEADING_SELECTOR), function (heading) {
    return isHtmlHeadingSelected(range, heading);
  });
  if (!headings.length) return false;

  // Moving a node resets a selection that ends inside it
  var saved = {
    startContainer: range.startContainer, startOffset: range.startOffset,
    endContainer: range.endContainer, endOffset: range.endOffset
  };
  var restorable = headings.indexOf(saved.startContainer) === -1 && headings.indexOf(saved.endContainer) === -1;

  headings.forEach(function (heading) {
    if (heading.parentNode) replaceHtmlHeadingWithPlainBlocks(heading);
  });

  if (restorable) {
    try {
      var restored = document.createRange();
      restored.setStart(saved.startContainer, saved.startOffset);
      restored.setEnd(saved.endContainer, saved.endOffset);
      sel.removeAllRanges();
      sel.addRange(restored);
    } catch (e) {
      console.debug('toolbar-editor-utils: unwrapSelectedHtmlHeadings() failed:', e);
    }
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// Clear formatting: inline styles go, and a heading goes back to normal text
function clearHtmlFormatting() {
  document.execCommand('removeFormat');
  unwrapSelectedHtmlHeadings();
}

// Aligns the paragraphs under the selection (left, center, right, justify),
// as an inline text-align on their block. Firefox writes <div align> when
// styleWithCSS is off, and the sanitizer drops that attribute on save, so
// CSS output is forced and any align attribute left behind is converted.
function applyHtmlAlignment(align) {
  var commands = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
  var sel = window.getSelection();
  if (!commands[align] || !sel || sel.rangeCount === 0) return;
  var editor = getEditorFromRange(sel.getRangeAt(0));
  if (!editor || editor.classList.contains('markdown-editor')) return;

  var range = sel.getRangeAt(0);
  var anchor = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  var diagrams = Array.prototype.filter.call(editor.querySelectorAll('.excalidraw-container'), function (container) {
    return range.intersectsNode(container);
  });
  var images = Array.prototype.filter.call(editor.querySelectorAll('img'), function (img) {
    if (img.closest('.excalidraw-container')) return false;
    return range.intersectsNode(img) || (img.parentNode !== editor && img.parentNode.contains(anchor));
  });

  // Before the command: Chrome writes the text-align on a block picture
  // itself, where it does nothing
  releaseHtmlImagePlacement(images);

  try {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(commands[align], false, null);
  } catch (e) {
    console.debug('toolbar-editor-utils: applyHtmlAlignment() failed:', e);
  } finally {
    try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* unsupported */ }
  }

  Array.prototype.forEach.call(editor.querySelectorAll('div[align], p[align], h1[align], h2[align], h3[align], h4[align], h5[align], h6[align], li[align], blockquote[align]'), function (el) {
    el.style.textAlign = el.getAttribute('align');
    el.removeAttribute('align');
  });
  alignHtmlDiagrams(diagrams, align);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

// An embedded diagram is a block as wide as its picture: text-align has
// nothing to move, so it stayed where it was whatever the Align command said
// (issue #1580). Its side margins place it instead, inline, since the note's
// blanket `.noteentry div { margin: 0 }` outranks a class rule;
// api_save_excalidraw.php carries them over when the diagram is edited.
function alignHtmlDiagrams(diagrams, align) {
  diagrams.forEach(function (container) {
    container.style.marginLeft = (align === 'center' || align === 'right') ? 'auto' : '0px';
    container.style.marginRight = (align === 'center' || align === 'left' || align === 'justify') ? 'auto' : '0px';
  });
}

// A picture that came with a placement of its own (display: block with auto
// margins, a float: pasted pages and AI-written notes do that) ignores the
// text-align of its line and stayed centred. Aligning it hands the placement
// back to the line.
function releaseHtmlImagePlacement(images) {
  images.forEach(function (img) {
    if (img.style.display === 'block') img.style.display = '';
    if (img.style.cssFloat) img.style.cssFloat = '';
    if (img.style.marginLeft === 'auto') img.style.marginLeft = '';
    if (img.style.marginRight === 'auto') img.style.marginRight = '';
  });
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
