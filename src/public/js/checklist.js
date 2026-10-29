/**
 * CHECKLIST FEATURE - Native DOM Implementation
 * 
 * Complete checkbox list implementation using only native DOM APIs.
 * No document.execCommand, no innerHTML for content manipulation.
 */

(function() {
  'use strict';

  // ===== CONSTANTS =====
  const CHECKLIST_CLASS = 'checklist';
  const CHECKLIST_ITEM_CLASS = 'checklist-item';
  const CHECKBOX_CLASS = 'checklist-checkbox';
  const TEXT_CLASS = 'checklist-text';
  const CHECKED_ITEM_CLASS = 'checklist-item-checked';

  // Track if event listeners are already set up
  let listenersInitialized = false;
  
  // Flag to prevent double event handling
  let isProcessingEnter = false;

  // ===== UTILITY FUNCTIONS =====

  /**
   * Check if cursor is in an editable note
   */
  function isCursorInEditableNote() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;
    
    const range = sel.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    
    return container.closest && container.closest('.noteentry');
  }

  /**
   * Get the noteentry element from a given element
   */
  function getNoteEntry(element) {
    if (!element) return null;
    return element.closest('.noteentry');
  }

  /**
   * Mark note as modified and trigger save
   */
  function markAsModified(noteentry) {
    if (!noteentry) return;
    if (typeof window.markNoteAsModified === 'function') {
      window.markNoteAsModified();
    }
    noteentry.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Get clean text content
   * Removes zero-width spaces (\u200B) used for cursor positioning in empty elements
   * @param {Element} element - The element to get text from
   * @returns {string} Clean trimmed text
   */
  function getCleanText(element) {
    if (!element) return '';
    return (element.textContent || '').replace(/\u200B/g, '').trim();
  }

  /**
   * Set cursor position in an element
   * @param {Element} element - Element to place cursor in
   * @param {boolean} atEnd - If true, place cursor at end; otherwise at start
   */
  function setCursorInElement(element, atEnd) {
    if (!element) return;
    
    const range = document.createRange();
    const sel = window.getSelection();

    // The end of a line that holds a link is past the link, not at the end
    // of the text before it
    const edge = atEnd ? element.lastChild : element.firstChild;
    if (edge && edge.nodeType === 3) { // Text node
      const offset = atEnd ? edge.textContent.length : 0;
      range.setStart(edge, offset);
      range.collapse(true);
    } else {
      range.selectNodeContents(element);
      range.collapse(!atEnd);
    }
    
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Sync checkbox visual state with its checked property
   */
  function syncCheckboxState(checkbox) {
    const item = findChecklistItem(checkbox);
    if (!item) return;
    const isChecked = checkbox.checked;
    checkbox.setAttribute('data-checked', isChecked ? '1' : '0');
    if (isChecked) {
      checkbox.setAttribute('checked', 'checked');
      item.classList.add(CHECKED_ITEM_CLASS);
    } else {
      checkbox.removeAttribute('checked');
      item.classList.remove(CHECKED_ITEM_CLASS);
    }
  }

  /**
   * True when a range holds nothing visible (zero-width spaces aside)
   */
  function isRangeBlank(range) {
    if (range.toString().replace(/​/g, '') !== '') return false;
    return !range.cloneContents().querySelector('img, video, iframe, input');
  }

  /**
   * Check if the caret has nothing before it (atEnd: after it) in an
   * element. Measured on the content, not on the offset in the caret's own
   * node, so it holds inside a link or other inline formatting.
   */
  function isCursorAtEdge(element, atEnd) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;

    const range = sel.getRangeAt(0);
    if (!range.collapsed || !element.contains(range.startContainer)) return false;

    const side = document.createRange();
    side.selectNodeContents(element);
    if (atEnd) {
      side.setStart(range.startContainer, range.startOffset);
    } else {
      side.setEnd(range.startContainer, range.startOffset);
    }
    return isRangeBlank(side);
  }

  function isCursorAtStart(element) {
    return isCursorAtEdge(element, false);
  }

  function isCursorAtEnd(element) {
    return isCursorAtEdge(element, true);
  }

  /**
   * Remove the inline elements a range split left with nothing in them
   * (the empty half of a link cut at its edge)
   */
  function removeEmptyInlines(root, keep) {
    Array.prototype.slice.call(root.querySelectorAll('*')).reverse().forEach(function(el) {
      if (/^(BR|IMG|VIDEO|IFRAME|INPUT)$/.test(el.tagName)) return;
      if (keep && el.contains(keep)) return;
      if (el.querySelector('img, video, iframe, input, br')) return;
      if ((el.textContent || '').replace(/​/g, '') === '') el.remove();
    });
  }

  // ===== DOM CREATION FUNCTIONS =====

  /**
   * Create a checkbox input element
   */
  function createCheckbox(checked) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CHECKBOX_CLASS;
    checkbox.checked = !!checked;
    checkbox.setAttribute('contenteditable', 'false');
    
    if (checked) {
      checkbox.setAttribute('checked', 'checked');
      checkbox.setAttribute('data-checked', '1');
    } else {
      checkbox.setAttribute('data-checked', '0');
    }
    
    return checkbox;
  }

  /**
   * Create text span element for the checklist item
   * @param {string} text - Initial text content
   * @returns {HTMLElement} Span element with checklist-text class
   */
  function createTextSpan(text) {
    const span = document.createElement('span');
    span.className = TEXT_CLASS;
    
    // Zero-width space (\u200B) allows cursor placement in empty spans
    const content = (text && text.length > 0) ? text : '\u200B';
    span.appendChild(document.createTextNode(content));
    span.setAttribute('data-value', text || '');
    
    return span;
  }

  /**
   * Create a single checklist item (li element)
   */
  function createChecklistItem(checked, text) {
    const li = document.createElement('li');
    li.className = CHECKLIST_ITEM_CLASS;
    
    if (checked) {
      li.classList.add(CHECKED_ITEM_CLASS);
    }
    
    // Create and append checkbox
    const checkbox = createCheckbox(checked);
    li.appendChild(checkbox);
    
    // Add a space between checkbox and text
    li.appendChild(document.createTextNode(' '));
    
    // Create and append text span
    const textSpan = createTextSpan(text);
    li.appendChild(textSpan);
    
    return li;
  }

  /**
   * Create a checklist container (ul element)
   */
  function createChecklist() {
    const ul = document.createElement('ul');
    ul.className = CHECKLIST_CLASS;
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    ul.style.margin = '8px 0';
    
    return ul;
  }

  // ===== FIND CHECKLIST ELEMENTS =====

  /**
   * The item's own text span (not the one of an item nested in it)
   */
  function getItemTextSpan(item) {
    // Older markup kept the box and the text in a label
    return item.querySelector(':scope > .' + TEXT_CLASS + ', :scope > label > .' + TEXT_CLASS);
  }

  /**
   * The parts of an item that are not its text: the checkbox, the space
   * after it, a nested checklist, line breaks and formatting whitespace
   */
  function isItemFrame(node, span) {
    if (node === span) return true;
    if (node.nodeType === 3) return /^[ \t\n\r]*$/.test(node.textContent);
    if (node.nodeType !== 1) return true;
    if (node.tagName === 'UL' || node.tagName === 'OL') return node.classList.contains(CHECKLIST_CLASS);
    return node.tagName === 'INPUT' || node.tagName === 'BR';
  }

  /**
   * Move the content that ended up beside an item's text span back into it.
   * Chrome's insertHTML puts a pasted link before the span when the span
   * only holds its zero-width space: the link then sat against the checkbox,
   * the item read as empty and Enter deleted it, link included (issue #1690).
   * Returns the item's text span.
   */
  function adoptStrayNodes(item) {
    const span = getItemTextSpan(item);
    if (!span || span.parentNode !== item) return span;
    const isStray = function(node) { return !isItemFrame(node, span); };
    if (!Array.prototype.some.call(item.childNodes, isStray)) return span;

    // A caret between the item's own children is held by an empty text node
    // that moves along with its neighbours
    const sel = window.getSelection();
    let range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (range && !item.contains(range.startContainer)) range = null;
    let start = null;
    let end = null;
    let marker = null;
    if (range) {
      if (range.collapsed && range.startContainer === item) {
        marker = document.createTextNode('');
        item.insertBefore(marker, item.childNodes[range.startOffset] || null);
        start = end = { container: marker, offset: 0 };
      } else {
        start = { container: range.startContainer, offset: range.startOffset };
        end = { container: range.endContainer, offset: range.endOffset };
      }
    }
    const strays = Array.prototype.filter.call(item.childNodes, function(node) {
      return node === marker || isStray(node);
    });

    const hadText = getCleanText(span) !== '' || !!span.querySelector('img, video, iframe');
    const firstText = span.firstChild;
    strays.forEach(function(node) {
      if (node.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING) {
        span.insertBefore(node, firstText);
      } else {
        span.appendChild(node);
      }
    });

    // The zero-width space only stood in for an empty line
    if (!hadText) {
      Array.prototype.slice.call(span.childNodes).forEach(function(node) {
        if (node.nodeType === 3 && node !== marker && node.textContent.replace(/​/g, '') === ''
            && (!start || (node !== start.container && node !== end.container))) {
          node.remove();
        }
      });
    }

    if (start) {
      const restored = document.createRange();
      if (marker) {
        const parent = marker.parentNode;
        restored.setStart(parent, Array.prototype.indexOf.call(parent.childNodes, marker));
        restored.collapse(true);
        sel.removeAllRanges();
        sel.addRange(restored);
        marker.remove();
      } else {
        restored.setStart(start.container, start.offset);
        restored.setEnd(end.container, end.offset);
        sel.removeAllRanges();
        sel.addRange(restored);
      }
    }
    span.setAttribute('data-value', getCleanText(span));
    return span;
  }

  /**
   * Find the checklist-text element that contains the cursor
   * @param {boolean} [keepStrays] - Leave content sitting beside the span
   *   where it is (during an IME composition, which a move would break)
   */
  function findCurrentChecklistText(keepStrays) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;

    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    const item = node && node.closest ? node.closest('.' + CHECKLIST_ITEM_CLASS) : null;
    if (!item) return null;

    const span = keepStrays ? getItemTextSpan(item) : adoptStrayNodes(item);
    if (!span || !sel.rangeCount || !span.contains(sel.getRangeAt(0).startContainer)) return null;
    return span;
  }

  /**
   * Find the checklist-item (li) from any child element
   */
  function findChecklistItem(element) {
    if (!element) return null;
    return element.closest('.' + CHECKLIST_ITEM_CLASS);
  }

  /**
   * Find the checklist (ul) from any child element
   */
  function findChecklist(element) {
    if (!element) return null;
    return element.closest('.' + CHECKLIST_CLASS);
  }

  // ===== LINE MODEL =====

  /**
   * Element a DOM boundary sits in
   */
  function elementOf(node) {
    return node && node.nodeType === 3 ? node.parentNode : node;
  }

  /**
   * Place a collapsed caret
   */
  function setCaret(node, offset) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Caret at the end of an element's content, in its last text node when
   * there is one
   */
  function setCaretAtEnd(element) {
    const last = element.lastChild;
    if (last && last.nodeType === 3) {
      setCaret(last, last.textContent.length);
    } else {
      setCaret(element, element.childNodes.length);
    }
  }

  /**
   * Outermost checklist an element belongs to
   */
  function getRootChecklist(element) {
    let list = findChecklist(element);
    while (list && list.parentElement) {
      const outer = list.parentElement.closest('.' + CHECKLIST_CLASS);
      if (!outer) break;
      list = outer;
    }
    return list;
  }

  /**
   * A checklist as the lines it shows, in reading order, each with its
   * nesting depth. Edits change this run of lines, then rebuildChecklist()
   * nests it again: an item's sub-items are the deeper lines that follow it,
   * so every line keeps its place and indentation whatever happens to the
   * line above it. Removing an item used to take its sub-items with it.
   */
  function getLines(root) {
    const lines = [];
    (function walk(list, depth) {
      Array.prototype.forEach.call(list.children, function(child) {
        if (!child.classList.contains(CHECKLIST_ITEM_CLASS)) return;
        lines.push({ item: child, depth: depth });
        const nested = child.querySelector(':scope > .' + CHECKLIST_CLASS);
        if (nested) walk(nested, depth + 1);
      });
    })(root, 0);
    return lines;
  }

  function lineIndex(lines, item) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].item === item) return i;
    }
    return -1;
  }

  /**
   * Put the lines back into the checklist, nested by depth. A line can be at
   * most one level deeper than the line before it. The selection is kept.
   */
  function rebuildChecklist(root, lines) {
    const sel = window.getSelection();
    let saved = null;
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      saved = [range.startContainer, range.startOffset, range.endContainer, range.endOffset];
      sel.removeAllRanges();
    }

    lines.forEach(function(line) {
      line.sublist = line.item.querySelector(':scope > .' + CHECKLIST_CLASS);
    });
    lines.forEach(function(line) {
      if (line.sublist) line.sublist.remove();
      line.item.remove();
    });

    const parents = []; // parents[d]: the last line placed at depth d
    lines.forEach(function(line) {
      const depth = Math.max(0, Math.min(line.depth, parents.length));
      line.depth = depth;
      parents.length = depth;
      let list = root;
      if (depth > 0) {
        const parent = parents[depth - 1];
        list = parent.item.querySelector(':scope > .' + CHECKLIST_CLASS);
        if (!list) {
          list = parent.sublist || createChecklist();
          parent.item.appendChild(list);
        }
      }
      list.appendChild(line.item);
      parents.push(line);
    });

    if (saved && saved[0].isConnected && saved[2].isConnected) {
      try {
        const range = document.createRange();
        range.setStart(saved[0], saved[1]);
        range.setEnd(saved[2], saved[3]);
        sel.addRange(range);
      } catch (e) {
        // The boundary was between children that moved: the caller places it
      }
    }
  }

  /**
   * Join line b's content to the end of line a and drop line b, the caret
   * at the joint. Into an empty line, line b stays and line a goes, so the
   * text keeps its own checkbox.
   */
  function mergeLines(root, lines, a, b) {
    const target = getItemTextSpan(lines[a].item);
    const source = getItemTextSpan(lines[b].item);
    if (!target || !source) return;

    if (getCleanText(target) === '' && !target.querySelector('img, video, iframe')) {
      lines[a].item.remove();
      lines[b].depth = lines[a].depth;
      lines.splice(a, 1);
      setCursorInElement(source, false);
      rebuildChecklist(root, lines);
      return;
    }

    stripZeroWidthSpaces(target);
    while (target.lastChild && target.lastChild.nodeName === 'BR') {
      target.removeChild(target.lastChild);
    }
    // Caret at the joint first: Chrome patches the hole left by the node
    // that holds the caret with a placeholder span
    setCaretAtEnd(target);
    stripZeroWidthSpaces(source);
    while (source.firstChild) {
      target.appendChild(source.firstChild);
    }
    target.setAttribute('data-value', getCleanText(target));

    lines[b].item.remove();
    lines.splice(b, 1);
    rebuildChecklist(root, lines);
  }

  /**
   * Take line i out of the list as a paragraph holding its content: the
   * lines before it stay in the list, the lines after it go to a new list
   * after the paragraph
   */
  function lineToParagraph(root, lines, i) {
    const line = lines[i];
    const span = getItemTextSpan(line.item);
    const p = document.createElement('p');

    window.getSelection().removeAllRanges();
    if (span) {
      while (span.firstChild) p.appendChild(span.firstChild);
    }
    stripZeroWidthSpaces(p);
    if (!p.firstChild) p.appendChild(document.createTextNode('​'));
    root.parentNode.insertBefore(p, root.nextSibling);

    const after = lines.slice(i + 1);
    if (after.length) {
      const tail = root.cloneNode(false);
      root.parentNode.insertBefore(tail, p.nextSibling);
      rebuildChecklist(tail, after);
    }
    line.item.remove();
    const before = lines.slice(0, i);
    if (before.length) {
      rebuildChecklist(root, before);
    } else {
      root.remove();
    }

    setCursorInElement(p, false);
  }

  /**
   * Move a DOM boundary into a text span: one outside it (on the checkbox,
   * around the span) goes to the span's nearest end
   */
  function clampToSpan(span, node, offset) {
    if (span.contains(node)) return { node: node, offset: offset };
    const contents = document.createRange();
    contents.selectNodeContents(span);
    let side = 1;
    try { side = contents.comparePoint(node, offset); } catch (e) { /* keep the end */ }
    return side < 0 ? { node: span, offset: 0 } : { node: span, offset: span.childNodes.length };
  }

  /**
   * A non-collapsed selection the browser would get wrong in a checklist:
   * one across several items (Chrome deletes the next checkbox, Firefox
   * leaves an empty item), or one that takes in an item's checkbox
   */
  function getChecklistSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const startEl = elementOf(range.startContainer);
    const endEl = elementOf(range.endContainer);
    if (!startEl || !endEl || !startEl.closest || !endEl.closest) return null;
    const first = startEl.closest('.' + CHECKLIST_ITEM_CLASS);
    const last = endEl.closest('.' + CHECKLIST_ITEM_CLASS);
    if (!first || !last || !first.isContentEditable) return null;
    const root = getRootChecklist(first);
    if (!root || getRootChecklist(last) !== root) return null;
    if (first === last) {
      const span = getItemTextSpan(first);
      if (!span || (span.contains(range.startContainer) && span.contains(range.endContainer))) return null;
    }
    return { root: root, range: range, first: first, last: last };
  }

  /**
   * Delete such a selection line by line: the end of the first line joins
   * what is left of the last one, the lines in between go, their sub-items
   * keep their place. The caret ends at the joint.
   */
  function deleteChecklistSelection(selection) {
    const firstSpan = getItemTextSpan(selection.first);
    const lastSpan = getItemTextSpan(selection.last);
    if (!firstSpan || !lastSpan) return false;
    const range = selection.range;
    const start = clampToSpan(firstSpan, range.startContainer, range.startOffset);
    const end = clampToSpan(lastSpan, range.endContainer, range.endOffset);

    if (selection.first === selection.last) {
      const inside = document.createRange();
      inside.setStart(start.node, start.offset);
      inside.setEnd(end.node, end.offset);
      inside.deleteContents();
      if (!firstSpan.firstChild) firstSpan.appendChild(document.createTextNode('​'));
      setCaret(inside.startContainer, inside.startOffset);
      firstSpan.setAttribute('data-value', getCleanText(firstSpan));
      return true;
    }

    const head = document.createRange();
    head.setStart(start.node, start.offset);
    head.setEnd(firstSpan, firstSpan.childNodes.length);
    const tail = document.createRange();
    tail.setStart(end.node, end.offset);
    tail.setEnd(lastSpan, lastSpan.childNodes.length);
    window.getSelection().removeAllRanges();
    head.deleteContents();
    const moved = tail.extractContents();
    stripZeroWidthSpaces(moved);
    removeEmptyInlines(moved);

    const lines = getLines(selection.root);
    const a = lineIndex(lines, selection.first);
    const b = lineIndex(lines, selection.last);
    lines.splice(a + 1, b - a).forEach(function(line) {
      line.item.remove();
    });

    stripZeroWidthSpaces(firstSpan);
    removeEmptyInlines(firstSpan);
    if (!firstSpan.firstChild && !moved.firstChild) {
      firstSpan.appendChild(document.createTextNode('​'));
      setCaret(firstSpan.firstChild, 0);
    } else {
      setCaretAtEnd(firstSpan);
    }
    firstSpan.appendChild(moved);
    firstSpan.setAttribute('data-value', getCleanText(firstSpan));
    rebuildChecklist(selection.root, lines);
    return true;
  }

  /**
   * Caret at the start or the end of a block outside the checklist
   */
  function placeCaretAtEdge(block, atEnd) {
    if (block.classList && block.classList.contains(CHECKLIST_CLASS)) {
      const lines = getLines(block);
      const line = atEnd ? lines[lines.length - 1] : lines[0];
      const span = line && getItemTextSpan(line.item);
      if (span) {
        setCursorInElement(span, atEnd);
        return;
      }
    }
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let target = null;
    let node;
    while ((node = walker.nextNode())) {
      // Source formatting between blocks is not a place to type
      if (/^[\n\r\t]*$/.test(node.textContent)) continue;
      target = node;
      if (!atEnd) break;
    }
    if (target) {
      setCaret(target, atEnd ? target.textContent.length : 0);
    } else if (atEnd && block.lastChild && block.lastChild.nodeName === 'BR') {
      setCaret(block, block.childNodes.length - 1);
    } else {
      setCaret(block, atEnd ? block.childNodes.length : 0);
    }
  }

  // ===== REPAIR =====

  // Text blocks a paste can bring into a line: each one becomes a line
  const LINE_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li, dl, dt, dd, '
    + 'section, article, header, footer, hr';

  /**
   * Cut a line's text where pasted content had line breaks or text blocks.
   * Returns the content of the lines that follow, in order (none when the
   * text is a single line). Chrome pastes plain text with its line breaks
   * kept as characters, Firefox as <br>, and both put pasted paragraphs
   * inside the line.
   */
  function splitPastedLines(span) {
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    const texts = [];
    let node;
    while ((node = walker.nextNode())) {
      if (/[\r\n]/.test(node.data)) texts.push(node);
    }
    texts.forEach(function(text) {
      // Firefox turns the \n of a Windows line end into a <br> and keeps the \r
      const next = text.nextSibling;
      if (next && next.nodeName === 'BR') text.data = text.data.replace(/\r$/, '');
      text.data = text.data.replace(/\r\n?/g, '\n');
      let current = text;
      let at;
      while ((at = current.data.indexOf('\n')) !== -1) {
        const rest = current.splitText(at);
        rest.deleteData(0, 1);
        rest.parentNode.insertBefore(document.createElement('br'), rest);
        current = rest;
      }
    });

    // Inner blocks first, so a list's items each get their line
    Array.prototype.slice.call(span.querySelectorAll(LINE_BLOCKS)).reverse().forEach(function(block) {
      const parent = block.parentNode;
      if (block.tagName === 'HR') {
        parent.replaceChild(document.createElement('br'), block);
        return;
      }
      while (block.lastChild && block.lastChild.nodeName === 'BR') block.removeChild(block.lastChild);
      const before = document.createRange();
      before.setStart(span, 0);
      before.setEndBefore(block);
      if (!isRangeBlank(before) && !(block.previousSibling && block.previousSibling.nodeName === 'BR')) {
        parent.insertBefore(document.createElement('br'), block);
      }
      const after = document.createRange();
      after.setStartAfter(block);
      after.setEnd(span, span.childNodes.length);
      if (!isRangeBlank(after) && !(block.nextSibling && block.nextSibling.nodeName === 'BR')) {
        parent.insertBefore(document.createElement('br'), block.nextSibling);
      }
      while (block.firstChild) parent.insertBefore(block.firstChild, block);
      block.remove();
    });

    // Then one line per break, from the last one
    const fragments = [];
    const breaks = Array.prototype.slice.call(span.querySelectorAll('br')).reverse();
    breaks.forEach(function(br, index) {
      const after = document.createRange();
      after.setStartAfter(br);
      after.setEnd(span, span.childNodes.length);
      if (index === 0 && isRangeBlank(after)) {
        // A trailing break ends the text, it opens no line
        if (getCleanText(span) !== '') br.remove();
        return;
      }
      const fragment = after.extractContents();
      br.remove();
      fragments.unshift(fragment);
    });
    return fragments;
  }

  /**
   * Put a checklist's items back in shape after an edit the browser made on
   * its own: an item without its checkbox (Chrome clones the line without
   * it when a paste splits it), without its text span, with two checkboxes,
   * with a text span inside its text (Firefox keeps the class of a pasted
   * line), content beside the span. With splitLines (right after a paste),
   * a line holding several lines of text becomes that many items.
   */
  function repairChecklist(root, splitLines) {
    const sel = window.getSelection();
    let marker = null;
    if (splitLines && sel.rangeCount && sel.isCollapsed && root.contains(sel.getRangeAt(0).startContainer)) {
      // On a copy: inserting through the selection's own range would select
      // the marker
      marker = document.createTextNode('');
      sel.getRangeAt(0).cloneRange().insertNode(marker);
    }

    const splits = [];
    Array.prototype.slice.call(root.querySelectorAll('li')).forEach(function(item) {
      const list = item.parentElement;
      if (!list || !list.classList.contains(CHECKLIST_CLASS)) return;
      if (item.querySelector(':scope > label > .' + TEXT_CLASS)) return;
      if (!item.classList.contains(CHECKLIST_ITEM_CLASS)) item.classList.add(CHECKLIST_ITEM_CLASS);

      const boxes = item.querySelectorAll(':scope > .' + CHECKBOX_CLASS);
      let box = boxes[0];
      for (let i = 1; i < boxes.length; i++) boxes[i].remove();
      if (!box) {
        box = createCheckbox(false);
        item.insertBefore(box, item.firstChild);
        item.insertBefore(document.createTextNode(' '), box.nextSibling);
      }
      if (!getItemTextSpan(item)) {
        const gap = box.nextSibling && box.nextSibling.nodeType === 3 ? box.nextSibling : box;
        const span = document.createElement('span');
        span.className = TEXT_CLASS;
        item.insertBefore(span, gap.nextSibling);
      }

      const span = adoptStrayNodes(item);
      span.querySelectorAll('.' + TEXT_CLASS).forEach(function(inner) {
        while (inner.firstChild) inner.parentNode.insertBefore(inner.firstChild, inner);
        inner.remove();
      });
      if (splitLines) {
        const fragments = splitPastedLines(span);
        if (fragments.length) splits.push({ item: item, fragments: fragments });
      }
      // Checkboxes of pasted checklist lines: their state goes to the line
      // they open, the boxes themselves do not stay inside the text
      span.querySelectorAll('input').forEach(function(input) { input.remove(); });
      if (!span.firstChild) span.appendChild(document.createTextNode('\u200B'));
      const value = getCleanText(span);
      if (span.getAttribute('data-value') !== value) span.setAttribute('data-value', value);
    });

    if (splits.length) {
      const lines = getLines(root);
      splits.forEach(function(split) {
        const at = lineIndex(lines, split.item);
        const depth = lines[at].depth;
        const added = split.fragments.map(function(fragment) {
          const pastedBox = fragment.querySelector('input.' + CHECKBOX_CLASS);
          const checked = !!pastedBox && (pastedBox.checked || pastedBox.getAttribute('data-checked') === '1');
          fragment.querySelectorAll('input').forEach(function(input) { input.remove(); });
          // In place: the caret marker is an empty text node that has to stay
          const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode())) {
            if (text.data.indexOf('\u200B') !== -1) text.data = text.data.replace(/\u200B/g, '');
          }
          removeEmptyInlines(fragment, marker);
          const item = createChecklistItem(checked, '');
          const span = getItemTextSpan(item);
          span.replaceChildren(fragment);
          if (marker && span.contains(marker) && !span.textContent) {
            span.insertBefore(document.createTextNode('\u200B'), marker);
          }
          if (!span.firstChild) span.appendChild(document.createTextNode('\u200B'));
          span.setAttribute('data-value', getCleanText(span));
          return { item: item, depth: depth };
        });
        Array.prototype.splice.apply(lines, [at + 1, 0].concat(added));
      });
      rebuildChecklist(root, lines);
    }

    if (marker) {
      if (marker.isConnected) {
        const parent = marker.parentNode;
        setCaret(parent, Array.prototype.indexOf.call(parent.childNodes, marker));
      }
      marker.remove();
    }
  }

  /**
   * Text spans and checkboxes left outside any item, once a deletion that
   * started before a checklist took its items' lines into a paragraph
   */
  function removeOrphanParts(noteentry) {
    noteentry.querySelectorAll('.' + TEXT_CLASS + ', .' + CHECKBOX_CLASS).forEach(function(part) {
      if (part.closest('.' + CHECKLIST_ITEM_CLASS)) return;
      if (part.classList.contains(CHECKBOX_CLASS)) {
        part.remove();
        return;
      }
      while (part.firstChild) part.parentNode.insertBefore(part.firstChild, part);
      part.remove();
    });
  }

  // ===== EVENT HANDLERS =====

  /**
   * Handle checkbox state change
   */
  function handleCheckboxChange(event) {
    const checkbox = event.target;
    if (!checkbox.classList.contains(CHECKBOX_CLASS)) return;
    
    const item = findChecklistItem(checkbox);
    if (!item) return;
    
    syncCheckboxState(checkbox);
    
    // Mark as modified
    const noteentry = getNoteEntry(checkbox);
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Enter key in checklist
   * - Empty sub-item: back one level
   * - Empty item: leave the checklist, the lines after it start a new one
   * - Otherwise: split the line at the caret, the new line at the same level
   */
  function handleEnterKey(event) {
    // Prevent double execution
    if (isProcessingEnter) return;

    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    const noteentry = getNoteEntry(textSpan);

    if (!item || !root) return;

    // Set flag to prevent double execution
    isProcessingEnter = true;

    // Prevent default Enter behavior and stop all other handlers
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const sel = window.getSelection();
    if (!sel.rangeCount) {
      isProcessingEnter = false;
      return;
    }

    // Enter over a selection replaces it, as on any other line
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
      if (textSpan.contains(range.endContainer)) {
        range.deleteContents();
      } else {
        range.collapse(true);
      }
    }

    const lines = getLines(root);
    const i = lineIndex(lines, item);
    const line = lines[i];

    if (getCleanText(textSpan) === '' && !textSpan.querySelector('img, video, iframe')) {
      if (line.depth > 0) {
        line.depth--;
        rebuildChecklist(root, lines);
      } else {
        lineToParagraph(root, lines, i);
      }
    } else {
      const newItem = createChecklistItem(false, '');
      const newTextSpan = getItemTextSpan(newItem);

      if (isCursorAtStart(textSpan)) {
        // At the start of the line: a new empty item above, the line keeps its
        // content, its checkbox and the caret
        lines.splice(i, 0, { item: newItem, depth: line.depth });
        rebuildChecklist(root, lines);
      } else {
        if (!isCursorAtEnd(textSpan)) {
          // Everything after the caret goes to the new item as it is: links,
          // bold, colours. Only reading the text used to drop all of them and
          // cut the line where the offset in the caret's own node fell.
          const after = document.createRange();
          after.selectNodeContents(textSpan);
          after.setStart(range.startContainer, range.startOffset);
          const moved = after.extractContents();
          stripZeroWidthSpaces(moved);
          removeEmptyInlines(moved);
          removeEmptyInlines(textSpan);
          newTextSpan.replaceChildren(moved);
          if (!newTextSpan.firstChild) newTextSpan.appendChild(document.createTextNode('​'));
          newTextSpan.setAttribute('data-value', getCleanText(newTextSpan));
          if (!textSpan.firstChild) textSpan.appendChild(document.createTextNode('​'));
          textSpan.setAttribute('data-value', getCleanText(textSpan));
        }
        lines.splice(i + 1, 0, { item: newItem, depth: line.depth });
        rebuildChecklist(root, lines);
        setCursorInElement(newTextSpan, false);
      }
    }
    isProcessingEnter = false;

    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Backspace key in checklist, at the start of a line
   * - First line: it leaves the checklist as a paragraph, content kept
   * - Otherwise: joins the line above (an empty line above just goes)
   */
  function handleBackspaceKey(event) {
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;

    // Only handle if at start of text
    if (!isCursorAtStart(textSpan)) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    const noteentry = getNoteEntry(textSpan);

    if (!item || !root) return;

    // Prevent default backspace behavior
    event.preventDefault();
    event.stopPropagation();

    const lines = getLines(root);
    const i = lineIndex(lines, item);
    if (i === 0) {
      lineToParagraph(root, lines, 0);
    } else {
      mergeLines(root, lines, i - 1, i);
    }

    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Delete key at the end of a line: the next line joins it. Chrome
   * used to delete the next item's checkbox instead, Firefox did nothing.
   */
  function handleDeleteKey(event) {
    const textSpan = findCurrentChecklistText();
    if (!textSpan || !isCursorAtEnd(textSpan)) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    const noteentry = getNoteEntry(textSpan);
    if (!item || !root) return;

    event.preventDefault();
    event.stopPropagation();

    const lines = getLines(root);
    const i = lineIndex(lines, item);
    if (i < lines.length - 1) {
      // From an empty line, the next one comes up with its own checkbox
      mergeLines(root, lines, i, i + 1);
    } else {
      // Last line: the paragraph after the list comes up into it
      const next = root.nextElementSibling;
      if (!next || !/^(P|DIV)$/.test(next.tagName) || !next.isContentEditable
          || next.querySelector('p, div, ul, ol, table, pre, blockquote, h1, h2, h3, h4, h5, h6')) return;
      stripZeroWidthSpaces(textSpan);
      while (textSpan.lastChild && textSpan.lastChild.nodeName === 'BR') {
        textSpan.removeChild(textSpan.lastChild);
      }
      setCaretAtEnd(textSpan);
      stripZeroWidthSpaces(next);
      while (next.lastChild && next.lastChild.nodeName === 'BR') next.removeChild(next.lastChild);
      while (next.firstChild) textSpan.appendChild(next.firstChild);
      next.remove();
      if (!textSpan.firstChild) {
        textSpan.appendChild(document.createTextNode('​'));
        setCaret(textSpan.firstChild, 0);
      }
      textSpan.setAttribute('data-value', getCleanText(textSpan));
    }

    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Tab key for indentation, limited to one level. The caret stays
   * where it was.
   */
  function handleTabKey(event) {
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    if (!item || !root) return;

    event.preventDefault();
    event.stopPropagation();

    const lines = getLines(root);
    const i = lineIndex(lines, item);
    const line = lines[i];
    if (event.shiftKey) {
      if (line.depth === 0) return;
      line.depth--;
    } else {
      // Not the first line, and one level at most
      if (i === 0 || line.depth >= 1) return;
      line.depth = 1;
    }
    rebuildChecklist(root, lines);

    const noteentry = getNoteEntry(root);
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  // ===== MAIN KEYBOARD HANDLER =====

  /**
   * Handle CTRL + Enter to toggle checkbox
   */
  function handleCtrlEnter(event, textSpan) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const item = findChecklistItem(textSpan);
    if (!item) return;

    const checkbox = item.querySelector('.' + CHECKBOX_CLASS);
    if (!checkbox) return;

    // Toggle checkbox
    checkbox.checked = !checkbox.checked;
    syncCheckboxState(checkbox);

    // Mark as modified
    const noteentry = getNoteEntry(checkbox);
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * A key that types a character (AltGr counts, shortcuts do not)
   */
  function isTypingKey(event) {
    if (event.key.length !== 1 || event.metaKey) return false;
    return !event.ctrlKey || event.altKey;
  }

  /**
   * Keys over a selection that spans checklist lines: the selection is
   * deleted line by line first, then Enter splits and a typed character
   * goes in at the joint
   */
  function handleSelectionKey(event, selection) {
    const noteentry = getNoteEntry(selection.root);
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      deleteChecklistSelection(selection);
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      deleteChecklistSelection(selection);
      handleEnterKey(event);
    } else if (isTypingKey(event)) {
      deleteChecklistSelection(selection);
    } else {
      return;
    }
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle keyboard events for checklist
   */
  function handleKeyDown(event) {
    // Only handle if in a contenteditable context
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') {
      return;
    }

    // While the slash menu is open, Enter and the arrows are its own: this
    // listener runs first, and Enter used to split the item instead of
    // running the command (issue #1686)
    if ((event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown')
      && document.querySelector('.slash-command-menu')) return;
    if (event.isComposing) return;

    const selection = getChecklistSelection();
    if (selection) {
      handleSelectionKey(event, selection);
      return;
    }

    // Check if we're in a checklist-text
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;

    switch (event.key) {
      case 'Enter':
        // Handle CTRL + ENTER to toggle checkbox
        if (event.ctrlKey || event.metaKey) {
          handleCtrlEnter(event, textSpan);
        } else {
          handleEnterKey(event);
        }
        break;
      case 'Backspace':
        if (!event.ctrlKey && !event.altKey && !event.metaKey) handleBackspaceKey(event);
        break;
      case 'Delete':
        if (!event.ctrlKey && !event.altKey && !event.metaKey) handleDeleteKey(event);
        break;
      case 'Tab':
        handleTabKey(event);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        handleVerticalArrow(event, textSpan, event.key === 'ArrowUp');
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        handleHorizontalArrow(event, textSpan, event.key === 'ArrowLeft');
        break;
    }
  }

  /**
   * Where the browser draws a collapsed caret, or null
   */
  function getCaretRect(range) {
    const rects = range.getClientRects();
    if (rects.length && rects[0].height > 0) return rects[0];
    // Chrome gives no box to a caret at the end of a text node or between
    // elements: measure the character before it (or after it, at the start)
    let node = range.startContainer;
    let offset = range.startOffset;
    if (node.nodeType === 1) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let text;
      let last = null;
      let next = null;
      while ((text = walker.nextNode())) {
        if (!text.length) continue;
        const pos = range.comparePoint(text, 0);
        if (pos < 0) {
          last = text;
        } else if (!next) {
          next = text;
        }
      }
      if (last) {
        node = last;
        offset = last.length;
      } else if (next) {
        node = next;
        offset = 0;
      }
    }
    if (node.nodeType !== 3 || !node.length) return null;
    const glyph = document.createRange();
    const before = offset > 0;
    glyph.setStart(node, before ? offset - 1 : offset);
    glyph.setEnd(node, before ? offset : offset + 1);
    const boxes = glyph.getClientRects();
    const box = boxes.length ? boxes[before ? boxes.length - 1 : 0] : null;
    if (!box || box.height <= 0) return null;
    const x = before ? box.right : box.left;
    return { left: x, right: x, top: box.top, bottom: box.bottom, height: box.height };
  }

  /**
   * The line boxes of a span's text
   */
  function getContentRects(span) {
    const range = document.createRange();
    range.selectNodeContents(span);
    return Array.prototype.filter.call(range.getClientRects(), function(rect) {
      return rect.height > 0;
    });
  }

  /**
   * DOM position under a point of the page
   */
  function caretFromPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
  }

  /**
   * Caret into a line's text (or a block outside the list) at a horizontal
   * position, on its last visual line coming from below, on its first one
   * coming from above
   */
  function moveCaretToLine(target, x, fromBelow) {
    const box = target.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) target.scrollIntoView({ block: 'nearest' });
    const isText = target.classList.contains(TEXT_CLASS);
    const rects = getContentRects(target);
    const left = target.getBoundingClientRect().left;
    if (x !== null && rects.length) {
      const line = rects.reduce(function(best, rect) {
        if (fromBelow) return rect.bottom > best.bottom ? rect : best;
        return rect.top < best.top ? rect : best;
      });
      const pos = caretFromPoint(Math.max(x, left + 1), (line.top + line.bottom) / 2);
      if (pos && target.contains(pos.node) && (isText || elementOf(pos.node).isContentEditable)) {
        setCaret(pos.node, pos.offset);
        return;
      }
    }
    const atEnd = x === null ? fromBelow : x > left + 2;
    if (isText) {
      setCursorInElement(target, atEnd);
    } else {
      placeCaretAtEdge(target, fromBelow);
    }
  }

  /**
   * Arrow up / down between checklist lines, keeping the caret's column.
   * Chrome dropped the caret before the checkbox, outside the text.
   */
  function handleVerticalArrow(event, textSpan, isUp) {
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

    // Only from the first visual line going up, the last one going down:
    // inside a wrapped line the browser moves the caret itself
    const caret = getCaretRect(range);
    const rects = getContentRects(textSpan);
    let onEdge;
    if (!caret || !rects.length) {
      onEdge = isUp ? isCursorAtStart(textSpan) : isCursorAtEnd(textSpan);
    } else if (isUp) {
      onEdge = caret.top - Math.min.apply(null, rects.map(function(r) { return r.top; })) < caret.height / 2;
    } else {
      onEdge = Math.max.apply(null, rects.map(function(r) { return r.bottom; })) - caret.bottom < caret.height / 2;
    }
    if (!onEdge) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    const lines = getLines(root);
    const j = lineIndex(lines, item) + (isUp ? -1 : 1);
    const x = caret ? caret.left : null;

    if (j >= 0 && j < lines.length) {
      event.preventDefault();
      const target = getItemTextSpan(lines[j].item);
      if (target) moveCaretToLine(target, x, isUp);
      return;
    }

    // Past the first or the last line: into the block beyond the list (Chrome
    // dropped the caret before the checkbox there too), or to the line's edge
    const outside = isUp ? root.previousElementSibling : root.nextElementSibling;
    if (outside && !outside.isContentEditable) return;
    event.preventDefault();
    if (!outside) {
      setCursorInElement(textSpan, !isUp);
    } else if (outside.classList.contains(CHECKLIST_CLASS)) {
      placeCaretAtEdge(outside, isUp);
    } else {
      moveCaretToLine(outside, x, isUp);
    }
  }

  /**
   * Arrow left at the start of a line goes to the end of the line above,
   * arrow right at the end to the start of the next one. The browser
   * stopped on the checkbox, and on the zero-width space of an empty line.
   */
  function handleHorizontalArrow(event, textSpan, isLeft) {
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    if (isLeft ? !isCursorAtStart(textSpan) : !isCursorAtEnd(textSpan)) return;

    const item = findChecklistItem(textSpan);
    const root = getRootChecklist(textSpan);
    const lines = getLines(root);
    const j = lineIndex(lines, item) + (isLeft ? -1 : 1);

    if (j >= 0 && j < lines.length) {
      event.preventDefault();
      const target = getItemTextSpan(lines[j].item);
      if (target) setCursorInElement(target, isLeft);
      return;
    }

    const outside = isLeft ? root.previousElementSibling : root.nextElementSibling;
    if (outside && !outside.isContentEditable) return;
    event.preventDefault();
    if (outside) placeCaretAtEdge(outside, isLeft);
  }

  /**
   * Remove the zero-width spaces of a line that has text, in place, so the
   * caret keeps its position. Left in, they cost an extra key press at the
   * edges of the line.
   */
  function dropZeroWidthSpaces(span) {
    if (span.textContent.indexOf('​') === -1 || getCleanText(span) === '') return;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      for (let i = node.data.length - 1; i >= 0; i--) {
        if (node.data[i] === '​') node.deleteData(i, 1);
      }
    }
  }

  /**
   * Update data-value on input
   */
  function handleInput(event) {
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') {
      return;
    }

    if (!event.isComposing) {
      const noteentry = getNoteEntry(target);
      if (noteentry) removeOrphanParts(noteentry);
      const sel = window.getSelection();
      const element = sel.rangeCount ? elementOf(sel.getRangeAt(0).startContainer) : null;
      const root = element && element.closest ? getRootChecklist(element) : null;
      if (root && root.isContentEditable) repairChecklist(root, false);
    }

    // Find all checklist-text elements and update their data-value
    const textSpan = findCurrentChecklistText(event.isComposing);
    if (textSpan) {
      if (!event.isComposing) dropZeroWidthSpaces(textSpan);
      const cleanText = getCleanText(textSpan);
      textSpan.setAttribute('data-value', cleanText);
    }
  }

  /**
   * The same edits when they come without a usable keydown: Android
   * keyboards send key code 229 for Enter and Backspace
   */
  function handleBeforeInput(event) {
    if (event.isComposing || !event.cancelable) return;
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') return;
    const type = event.inputType;

    const selection = getChecklistSelection();
    if (selection) {
      if (type === 'deleteContentBackward' || type === 'deleteContentForward') {
        event.preventDefault();
        deleteChecklistSelection(selection);
      } else if (type === 'insertParagraph') {
        deleteChecklistSelection(selection);
        handleEnterKey(event);
      } else if (type === 'insertText' && event.data) {
        event.preventDefault();
        deleteChecklistSelection(selection);
        document.execCommand('insertText', false, event.data);
      } else {
        return;
      }
      markAsModified(getNoteEntry(selection.root));
      return;
    }

    if (type === 'insertParagraph') {
      handleEnterKey(event);
    } else if (type === 'deleteContentBackward') {
      handleBackspaceKey(event);
    } else if (type === 'deleteContentForward') {
      handleDeleteKey(event);
    }
  }

  /**
   * A paste or a cut over a selection that spans checklist lines: the
   * selection goes line by line first (for a cut, once it is on the
   * clipboard), then the paste lands at the joint
   */
  function handleClipboard(event) {
    const selection = getChecklistSelection();
    if (event.type === 'paste') {
      // Once the paste is in, its lines become items of their own
      const sel = window.getSelection();
      const element = sel.rangeCount ? elementOf(sel.getRangeAt(0).startContainer) : null;
      const root = element && element.closest ? getRootChecklist(element) : null;
      if (root && root.isContentEditable && element.closest('.' + CHECKLIST_ITEM_CLASS)) {
        setTimeout(function() {
          if (!root.isConnected) return;
          repairChecklist(root, true);
          markAsModified(getNoteEntry(root));
        }, 0);
      }
    }
    if (!selection) return;
    if (event.type === 'cut') {
      if (!event.clipboardData) return;
      const holder = document.createElement('div');
      holder.appendChild(selection.range.cloneContents());
      event.clipboardData.setData('text/html', holder.innerHTML);
      event.clipboardData.setData('text/plain', window.getSelection().toString());
      event.preventDefault();
    }
    deleteChecklistSelection(selection);
    markAsModified(getNoteEntry(selection.root));
  }

  /**
   * Keep a collapsed caret inside the line's text: a click left of the
   * text or beside the checkbox put it between the item's own parts, where
   * typed text and Enter escaped the checklist handling
   */
  function handleSelectionChange() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const element = elementOf(range.startContainer);
    if (!element || !element.closest) return;
    const item = element.closest('.' + CHECKLIST_ITEM_CLASS);
    if (!item || !item.isContentEditable || !getNoteEntry(item)) return;
    const span = getItemTextSpan(item);
    if (!span || span.contains(range.startContainer)) return;
    const pos = clampToSpan(span, range.startContainer, range.startOffset);
    setCursorInElement(span, pos.offset > 0);
  }

  // ===== EVENT SETUP =====

  /**
   * Set up event delegation
   */
  function setupEventListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;
    
    // Checkbox change
    document.addEventListener('change', function(event) {
      if (event.target.classList && event.target.classList.contains(CHECKBOX_CLASS)) {
        handleCheckboxChange(event);
      }
    }, true);
    
    // Keyboard events
    document.addEventListener('keydown', handleKeyDown, true);
    
    // Input events
    document.addEventListener('input', handleInput, true);
    document.addEventListener('beforeinput', handleBeforeInput, true);
    document.addEventListener('paste', handleClipboard, true);
    document.addEventListener('cut', handleClipboard, true);
    document.addEventListener('selectionchange', handleSelectionChange);
  }

  // ===== PUBLIC API =====

  /**
   * Insert a built checklist at the caret through execCommand. Returns its
   * first item as it now stands in the note, or null when the command did not
   * take and the caller has to insert the nodes itself.
   */
  function insertChecklistUndoable(checklist, noteentry) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    if (!sel.isCollapsed) {
      // The slash menu leaves a selected zero-width space where its "/" stood
      // when it was not typed (right-click, Insert button): it goes, unless it
      // is all the line holds, in which case the checklist replaces it
      const selected = sel.getRangeAt(0);
      const holder = selected.startContainer;
      if (selected.toString() !== '\u200B' || holder.nodeType !== 3 || holder !== selected.endContainer) return null;
      if (holder.textContent !== '\u200B' || holder.previousSibling || holder.nextSibling) selected.deleteContents();
    }

    let line = sel.getRangeAt(0).startContainer;
    if (line.nodeType === 3) line = line.parentNode;
    line = line.closest('p, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote');
    if (!line || !noteentry.contains(line)) line = noteentry;
    if (getCleanText(line) !== '' || line.querySelector('img, video, iframe, input, table')) {
      // A new line after this one: only on an empty line does the browser
      // keep the inserted markup whole
      if (line !== noteentry) {
        const lineEnd = document.createRange();
        lineEnd.selectNodeContents(line);
        lineEnd.collapse(false);
        sel.removeAllRanges();
        sel.addRange(lineEnd);
      }
      document.execCommand('insertParagraph');
    }
    if (typeof window.selectLineBreakAfterCaret === 'function') window.selectLineBreakAfterCaret();

    const marker = 'data-checklist-new';
    checklist.setAttribute(marker, '1');
    const html = checklist.outerHTML;
    checklist.removeAttribute(marker);
    if (!document.execCommand('insertHTML', false, html)) return null;

    const live = noteentry.querySelector('[' + marker + ']');
    if (!live) return null;
    live.removeAttribute(marker);
    // The browser may drop the attribute that keeps the caret out of the box
    live.querySelectorAll('input[type="checkbox"]').forEach(function(box) {
      box.setAttribute('contenteditable', 'false');
    });
    return live.querySelector('li');
  }

  /**
   * Insert a new checklist at cursor position
   * @param {{checked?: boolean}} [options] - checked: start with a completed item
   *   (the slash menu's "Done" entry, for journaling what was achieved)
   */
  function insertChecklist(options) {
    const startChecked = !!(options && options.checked);
    if (!isCursorInEditableNote()) {
      if (typeof window.showCursorWarning === 'function') {
        window.showCursorWarning();
      }
      return;
    }
    
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    
    const noteentry = getNoteEntry(container);
    if (!noteentry) return;
    
    // Create checklist with one item
    const checklist = createChecklist();
    const firstItem = createChecklistItem(startChecked, '');
    checklist.appendChild(firstItem);
    
    // Through insertHTML first, so Ctrl+Z takes the checklist back and a redo
    // puts it where it was: nodes inserted directly are invisible to the
    // browser's undo history (issue #1580). The checklist goes on a line of
    // its own, where the browser keeps its markup as it is.
    const liveItem = insertChecklistUndoable(checklist, noteentry);
    if (liveItem) {
      const liveText = liveItem.querySelector('.' + TEXT_CLASS);
      if (liveText) {
        setTimeout(function() {
          setCursorInElement(liveText, false);
        }, 10);
      }
      markAsModified(noteentry);
      return;
    }

    range.deleteContents();

    // Top-level block the caret sits in (the line the slash command was
    // typed on, empty once the "/..." text is gone)
    let block = container;
    while (block && block !== noteentry && block.parentNode !== noteentry) {
      block = block.parentNode;
    }
    const blockIsEmpty = block && block !== noteentry && block.nodeType === 1
      && getCleanText(block) === ''
      && !block.querySelector('img, video, iframe, input, table');

    if (blockIsEmpty) {
      // Typed on an empty line: the checklist takes that line's place, no
      // extra blank line is added
      noteentry.insertBefore(checklist, block);
      block.remove();
    } else {
      // Mid-content: keep a blank line before the checklist
      const emptyLine = document.createElement('div');
      emptyLine.appendChild(document.createElement('br'));
      range.insertNode(checklist);
      range.insertNode(emptyLine);
    }
    
    // Focus first item
    const textSpan = firstItem.querySelector('.' + TEXT_CLASS);
    if (textSpan) {
      setTimeout(function() {
        setCursorInElement(textSpan, false);
      }, 10);
    }
    
    markAsModified(noteentry);
  }

  // ===== SELECTION CONVERSION =====

  /**
   * Remove zero-width spaces from all text nodes of an element
   */
  function stripZeroWidthSpaces(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(node) {
      node.textContent = node.textContent.replace(/\u200B/g, '');
      if (!node.textContent) node.remove();
    });
  }

  /**
   * A block that holds no line content (tables, code blocks, separators,
   * media wrappers) cannot become a checklist item
   */
  function isConvertibleBlock(block) {
    if (block.nodeType === 3) return true;
    if (block.nodeType !== 1) return false;
    const tag = block.tagName;
    if (tag === 'TABLE' || tag === 'PRE' || tag === 'HR' || tag === 'IMG') return false;
    if (block.querySelector && block.querySelector('table, pre')) return false;
    if (block.isContentEditable === false && block.getAttribute('contenteditable') === 'false') return false;
    return true;
  }

  /**
   * Blank lines are left in place and split the selection into
   * separate checklists
   */
  function isBlankBlock(block) {
    if (block.nodeType === 3) return block.textContent.replace(/\u200B/g, '').trim() === '';
    if (block.nodeType !== 1) return true;
    if (block.querySelector && block.querySelector('img, video, iframe, input')) return false;
    return getCleanText(block) === '';
  }

  /**
   * Build a checklist item from an existing line, keeping its inline
   * formatting (bold, links, colors...)
   */
  function createChecklistItemFromNode(sourceBlock) {
    const item = createChecklistItem(false, '');
    const span = item.querySelector('.' + TEXT_CLASS);
    while (span.firstChild) span.removeChild(span.firstChild);

    if (sourceBlock.nodeType === 3) {
      span.appendChild(document.createTextNode(sourceBlock.textContent));
    } else {
      while (sourceBlock.firstChild) {
        span.appendChild(sourceBlock.firstChild);
      }
    }

    stripZeroWidthSpaces(span);
    while (span.lastChild && span.lastChild.nodeType === 1 && span.lastChild.tagName === 'BR') {
      span.removeChild(span.lastChild);
    }
    if (!span.firstChild) {
      span.appendChild(document.createTextNode('\u200B'));
    }
    span.setAttribute('data-value', getCleanText(span));
    return item;
  }

  /**
   * Get the li elements of a list that intersect the selection
   */
  function getSelectedListItems(list, range) {
    const items = Array.prototype.filter.call(list.children, function(child) {
      return child.tagName === 'LI';
    });
    const selected = items.filter(function(li) {
      try { return range.intersectsNode(li); } catch (e) { return false; }
    });
    return selected.length ? selected : items;
  }

  /**
   * Convert the selected top-level blocks into checklist items.
   * Returns the created/kept text spans for selection restore.
   */
  function convertBlocksToChecklist(blocks, range, noteentry) {
    let currentUl = null;
    const spans = [];

    blocks.forEach(function(block) {
      if (!isConvertibleBlock(block) || (block.nodeType === 1 && block.tagName !== 'UL' && block.tagName !== 'OL' && isBlankBlock(block)) || (block.nodeType === 3 && isBlankBlock(block))) {
        currentUl = null;
        return;
      }

      if (!currentUl) {
        currentUl = createChecklist();
        noteentry.insertBefore(currentUl, block);
      }

      if (block.nodeType === 1 && (block.tagName === 'UL' || block.tagName === 'OL')) {
        const isAlreadyChecklist = block.classList.contains(CHECKLIST_CLASS);
        const lis = Array.prototype.filter.call(block.children, function(child) {
          return child.tagName === 'LI';
        });
        lis.forEach(function(li) {
          if (isAlreadyChecklist) {
            currentUl.appendChild(li);
            const span = li.querySelector('.' + TEXT_CLASS);
            if (span) spans.push(span);
          } else {
            const item = createChecklistItemFromNode(li);
            currentUl.appendChild(item);
            spans.push(item.querySelector('.' + TEXT_CLASS));
          }
        });
        block.remove();
      } else {
        const item = createChecklistItemFromNode(block);
        currentUl.appendChild(item);
        spans.push(item.querySelector('.' + TEXT_CLASS));
        if (block.parentNode) block.remove();
      }
    });

    return spans;
  }

  /**
   * Convert the selected items of a checklist back to plain lines,
   * splitting the checklist when the selection is partial.
   * Returns the created line divs for selection restore.
   */
  function unwrapChecklistItems(checklist, selectedLis) {
    const parent = checklist.parentNode;
    const divs = [];
    const frag = document.createDocumentFragment();

    selectedLis.forEach(function(li) {
      const div = document.createElement('div');
      const span = li.querySelector('.' + TEXT_CLASS);
      const source = span || li;
      while (source.firstChild) div.appendChild(source.firstChild);
      stripZeroWidthSpaces(div);
      if (!div.firstChild) div.appendChild(document.createElement('br'));
      frag.appendChild(div);
      divs.push(div);
    });

    const items = Array.prototype.filter.call(checklist.children, function(child) {
      return child.tagName === 'LI';
    });
    const firstIdx = items.indexOf(selectedLis[0]);
    const lastIdx = items.indexOf(selectedLis[selectedLis.length - 1]);

    if (firstIdx <= 0 && lastIdx >= items.length - 1) {
      parent.replaceChild(frag, checklist);
    } else if (firstIdx <= 0) {
      parent.insertBefore(frag, checklist);
      selectedLis.forEach(function(li) { li.remove(); });
    } else if (lastIdx >= items.length - 1) {
      parent.insertBefore(frag, checklist.nextSibling);
      selectedLis.forEach(function(li) { li.remove(); });
    } else {
      const tail = createChecklist();
      items.slice(lastIdx + 1).forEach(function(li) { tail.appendChild(li); });
      parent.insertBefore(tail, checklist.nextSibling);
      parent.insertBefore(frag, tail);
      selectedLis.forEach(function(li) { li.remove(); });
    }

    return divs;
  }

  /**
   * Toggle checklist on the current selection in an HTML note.
   * Selected lines become checklist items; if the selection is already
   * entirely inside checklists, the items go back to plain lines.
   */
  function toggleChecklistSelection() {
    if (!isCursorInEditableNote()) {
      if (typeof window.showCursorWarning === 'function') {
        window.showCursorWarning();
      }
      return;
    }

    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    const noteentry = getNoteEntry(container);
    if (!noteentry) return;

    // Collect the top-level blocks the selection intersects
    const blocks = Array.prototype.filter.call(noteentry.childNodes, function(node) {
      try { return range.intersectsNode(node); } catch (e) { return false; }
    });

    // Drop a trailing block the selection only touches at its very start
    // (shift+down selections end at offset 0 of the next line)
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const startOfLast = document.createRange();
      if (last.nodeType === 1) {
        startOfLast.selectNodeContents(last);
      } else {
        startOfLast.selectNode(last);
      }
      startOfLast.collapse(true);
      if (range.compareBoundaryPoints(Range.END_TO_END, startOfLast) <= 0) {
        blocks.pop();
      } else {
        break;
      }
    }
    // Caret on an empty line (the mobile editor bar, where the button shows
    // with no selection): a new checklist takes that line's place
    if (range.collapsed && blocks.length === 1 && blocks[0].nodeType === 1
        && blocks[0].tagName !== 'UL' && blocks[0].tagName !== 'OL' && isBlankBlock(blocks[0])) {
      insertChecklist();
      return;
    }
    if (!blocks.length) {
      if (range.collapsed && isBlankBlock(noteentry)) insertChecklist();
      return;
    }

    const allChecklists = blocks.every(function(block) {
      return block.nodeType === 1 && block.classList && block.classList.contains(CHECKLIST_CLASS);
    });

    let focusTargets;
    if (allChecklists) {
      focusTargets = [];
      blocks.forEach(function(checklist) {
        const lis = getSelectedListItems(checklist, range);
        focusTargets = focusTargets.concat(unwrapChecklistItems(checklist, lis));
      });
    } else {
      focusTargets = convertBlocksToChecklist(blocks, range, noteentry);
    }

    // Restore the selection over the converted lines
    if (focusTargets.length) {
      const newRange = document.createRange();
      newRange.setStartBefore(focusTargets[0]);
      newRange.setEndAfter(focusTargets[focusTargets.length - 1]);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    markAsModified(noteentry);
  }

  /**
   * Serialize checklists before save
   */
  function serializeChecklistsBeforeSave(noteentry) {
    if (!noteentry) return;
    
    const checklists = noteentry.querySelectorAll('.' + CHECKLIST_CLASS);
    checklists.forEach(function(checklist) {
      const items = checklist.querySelectorAll('.' + CHECKLIST_ITEM_CLASS);
      items.forEach(function(item) {
        const checkbox = item.querySelector('.' + CHECKBOX_CLASS);
        const textSpan = item.querySelector('.' + TEXT_CLASS);
        
        if (checkbox && textSpan) {
          textSpan.setAttribute('data-value', getCleanText(textSpan));
          syncCheckboxState(checkbox);
        }
      });
    });
  }

  /**
   * Restore checklists after load
   */
  function restoreChecklistsAfterLoad(noteentry) {
    if (!noteentry) return;
    
    // Notes saved with a pasted link beside the text (issue #1690), or with
    // an item the browser left without its checkbox
    noteentry.querySelectorAll('.' + CHECKLIST_CLASS).forEach(function(list) {
      if (!list.parentElement.closest('.' + CHECKLIST_CLASS)) repairChecklist(list, false);
    });
    
    const checklists = noteentry.querySelectorAll('.' + CHECKLIST_CLASS);
    checklists.forEach(function(checklist) {
      const items = checklist.querySelectorAll('.' + CHECKLIST_ITEM_CLASS);
      items.forEach(function(item) {
        const checkbox = item.querySelector('.' + CHECKBOX_CLASS);
        // Notes saved with the zero-width space left in a line that has text
        const span = getItemTextSpan(item);
        if (span) dropZeroWidthSpaces(span);
        
        if (checkbox) {
          const isChecked = checkbox.getAttribute('data-checked') === '1' || 
                           checkbox.hasAttribute('checked');
          checkbox.checked = isChecked;
          
          if (isChecked) {
            item.classList.add(CHECKED_ITEM_CLASS);
          }
        }
      });
    });
  }

  // ===== INITIALIZATION =====

  /**
   * Initialize checklist functionality
   * Sets up event listeners and save hooks
   */
  function init() {
    setupEventListeners();
    
    // Set up save hooks (only once)
    if (!window._checklistSaveHookInstalled) {
      window._checklistSaveHookInstalled = true;
      
      // Hook into saveNoteImmediately to serialize before saving
      const originalSaveNoteImmediately = window.saveNoteImmediately;
      if (typeof originalSaveNoteImmediately === 'function') {
        window.saveNoteImmediately = function() {
          const noteentry = document.querySelector('.noteentry');
          if (noteentry) {
            serializeChecklistsBeforeSave(noteentry);
          }
          return originalSaveNoteImmediately.apply(this, arguments);
        };
      }
    }
    
    // Restore any existing checklists on page load
    const noteentry = document.querySelector('.noteentry');
    if (noteentry) {
      restoreChecklistsAfterLoad(noteentry);
    }
  }

  // ===== EXPORTS =====

  window.insertChecklist = insertChecklist;
  window.toggleChecklistSelection = toggleChecklistSelection;
  window.serializeChecklistsBeforeSave = serializeChecklistsBeforeSave;
  window.restoreChecklistsAfterLoad = restoreChecklistsAfterLoad;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
