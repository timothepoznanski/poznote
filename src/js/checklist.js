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
    
    if (element.childNodes.length > 0) {
      const textNode = element.firstChild;
      if (textNode.nodeType === 3) { // Text node
        const offset = atEnd ? textNode.textContent.length : 0;
        range.setStart(textNode, offset);
        range.collapse(true);
      } else {
        range.selectNodeContents(element);
        range.collapse(!atEnd);
      }
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
   * Check if cursor is at the beginning of an element
   */
  function isCursorAtStart(element) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;
    
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    
    // Check if at position 0
    if (range.startOffset !== 0) return false;
    
    // Check if in the element or its first child
    let container = range.startContainer;
    if (container === element) return true;
    if (container.parentNode === element && container === element.firstChild) return true;
    
    return false;
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
   * Find the checklist-text element that contains the cursor
   */
  function findCurrentChecklistText() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    
    // Walk up to find checklist-text
    while (node && node !== document) {
      if (node.nodeType === 1 && node.classList && node.classList.contains(TEXT_CLASS)) {
        return node;
      }
      node = node.parentNode;
    }
    
    return null;
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
   * - If item is empty: exit checklist
   * - Otherwise: split text at cursor and create new item below
   */
  function handleEnterKey(event) {
    // Prevent double execution
    if (isProcessingEnter) return;
    
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;
    
    const item = findChecklistItem(textSpan);
    const checklist = findChecklist(textSpan);
    const noteentry = getNoteEntry(textSpan);
    
    if (!item || !checklist) return;
    
    // Set flag to prevent double execution
    isProcessingEnter = true;
    
    // Prevent default Enter behavior and stop all other handlers
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const currentText = getCleanText(textSpan);
    
    // If empty item, exit checklist
    if (currentText === '') {
      exitChecklist(item, checklist, noteentry);
      return;
    }
    
    // Get cursor position to split text
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      isProcessingEnter = false;
      return;
    }
    
    const range = sel.getRangeAt(0);
    const textNode = textSpan.firstChild;
    
    // Split text at cursor position
    let textBefore = '';
    let textAfter = '';
    
    if (textNode && textNode.nodeType === 3) {
      const fullText = textNode.textContent.replace(/\u200B/g, '');
      const actualOffset = Math.min(range.startOffset, fullText.length);
      textBefore = fullText.substring(0, actualOffset);
      textAfter = fullText.substring(actualOffset);
    }
    
    // Update current item with text before cursor
    while (textSpan.firstChild) {
      textSpan.removeChild(textSpan.firstChild);
    }
    const beforeContent = textBefore.length > 0 ? textBefore : '\u200B';
    textSpan.appendChild(document.createTextNode(beforeContent));
    textSpan.setAttribute('data-value', textBefore);
    
    // Create new item with text after cursor
    const newItem = createChecklistItem(false, textAfter);
    
    // Insert after current item
    if (item.nextSibling) {
      checklist.insertBefore(newItem, item.nextSibling);
    } else {
      checklist.appendChild(newItem);
    }
    
    // Position cursor in new item's text span
    const newTextSpan = newItem.querySelector('.' + TEXT_CLASS);
    if (newTextSpan) {
      // Small delay ensures DOM is fully updated
      setTimeout(function() {
        setCursorInElement(newTextSpan, false);
        isProcessingEnter = false;
      }, 10);
    } else {
      isProcessingEnter = false;
    }
    
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Backspace key in checklist
   * - If at start of empty item: remove item (or exit if only item)
   * - If at start of non-empty item: merge with previous item
   */
  function handleBackspaceKey(event) {
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;
    
    // Only handle if at start of text
    if (!isCursorAtStart(textSpan)) return;
    
    const item = findChecklistItem(textSpan);
    const checklist = findChecklist(textSpan);
    const noteentry = getNoteEntry(textSpan);
    
    if (!item || !checklist) return;
    
    const currentText = getCleanText(textSpan);
    const items = checklist.querySelectorAll(':scope > .' + CHECKLIST_ITEM_CLASS);
    
    // Prevent default backspace behavior
    event.preventDefault();
    event.stopPropagation();
    
    if (currentText === '') {
      // Empty item: remove it
      if (items.length === 1) {
        // Last item: remove entire checklist
        exitChecklist(item, checklist, noteentry);
      } else {
        // Remove this item and focus adjacent item
        const prevItem = item.previousElementSibling;
        const nextItem = item.nextElementSibling;
        
        item.remove();
        
        const targetItem = prevItem || nextItem;
        if (targetItem) {
          const targetText = targetItem.querySelector('.' + TEXT_CLASS);
          if (targetText) {
            setCursorInElement(targetText, !!prevItem); // End if prev, start if next
          }
        }
        
        if (noteentry) {
          markAsModified(noteentry);
        }
      }
    } else {
      // Not empty: merge with previous item
      const prevItem = item.previousElementSibling;
      
      if (prevItem && prevItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
        const prevText = prevItem.querySelector('.' + TEXT_CLASS);
        if (prevText) {
          const prevLength = getCleanText(prevText).length;
          const mergedText = getCleanText(prevText) + currentText;
          
          // Update previous item with merged text
          while (prevText.firstChild) {
            prevText.removeChild(prevText.firstChild);
          }
          prevText.appendChild(document.createTextNode(mergedText));
          prevText.setAttribute('data-value', mergedText);
          
          // Remove current item
          item.remove();
          
          // Position cursor at merge point
          const textNode = prevText.firstChild;
          if (textNode) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(textNode, prevLength);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          
          if (noteentry) {
            markAsModified(noteentry);
          }
        }
      }
    }
  }

  /**
   * Handle Tab key for indentation
   */
  function handleTabKey(event) {
    const textSpan = findCurrentChecklistText();
    if (!textSpan) return;
    
    const item = findChecklistItem(textSpan);
    if (!item) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    if (event.shiftKey) {
      outdentItem(item);
    } else {
      indentItem(item);
    }
  }

  /**
   * Exit checklist and create a paragraph
   */
  function exitChecklist(item, checklist, noteentry) {
    // Create paragraph with zero-width space for cursor placement
    const p = document.createElement('p');
    p.appendChild(document.createTextNode('\u200B'));
    
    // Insert paragraph right after the checklist
    if (checklist.nextSibling) {
      checklist.parentNode.insertBefore(p, checklist.nextSibling);
    } else {
      checklist.parentNode.appendChild(p);
    }
    
    // Remove the current item
    const items = checklist.querySelectorAll(':scope > .' + CHECKLIST_ITEM_CLASS);
    if (items.length === 1) {
      // Only item: remove entire checklist
      checklist.remove();
    } else {
      // Remove just this item
      item.remove();
    }
    
    // Position cursor in paragraph
    setCursorInElement(p, false);
    
    // Reset processing flag
    isProcessingEnter = false;
    
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Indent a checklist item (TAB key)
   * Moves current item as a child of the previous sibling
   * Limited to one level of nesting
   * @param {HTMLElement} item - The checklist item to indent
   */
  function indentItem(item) {
    const prevItem = item.previousElementSibling;
    if (!prevItem || !prevItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      return; // Cannot indent first item
    }
    
    const parentList = item.parentElement;
    if (!parentList || !parentList.classList.contains(CHECKLIST_CLASS)) {
      return;
    }
    
    // Check if already nested (limit to one level)
    const parentListParent = parentList.parentElement;
    if (parentListParent && parentListParent.classList.contains(CHECKLIST_ITEM_CLASS)) {
      return; // Already at max nesting level
    }
    
    // Find or create nested list in previous item
    let nestedList = prevItem.querySelector(':scope > .' + CHECKLIST_CLASS);
    if (!nestedList) {
      nestedList = createChecklist();
      prevItem.appendChild(nestedList);
    }
    
    // Move item to nested list
    nestedList.appendChild(item);
    
    // Restore cursor position
    const textSpan = item.querySelector('.' + TEXT_CLASS);
    if (textSpan) {
      setCursorInElement(textSpan, true);
    }
    
    const noteentry = getNoteEntry(item);
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Outdent a checklist item (SHIFT+TAB key)
   * Moves item from nested list back to parent level
   * @param {HTMLElement} item - The checklist item to outdent
   */
  function outdentItem(item) {
    const parentList = item.parentElement;
    if (!parentList || !parentList.classList.contains(CHECKLIST_CLASS)) {
      return;
    }
    
    const parentItem = parentList.parentElement;
    if (!parentItem || !parentItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      return; // Already at root level
    }
    
    const grandparentList = parentItem.parentElement;
    if (!grandparentList) return;
    
    // Move item after parent item in grandparent list
    if (parentItem.nextSibling) {
      grandparentList.insertBefore(item, parentItem.nextSibling);
    } else {
      grandparentList.appendChild(item);
    }
    
    // Remove empty nested list
    if (parentList.querySelectorAll(':scope > .' + CHECKLIST_ITEM_CLASS).length === 0) {
      parentList.remove();
    }
    
    // Restore cursor position
    const textSpan = item.querySelector('.' + TEXT_CLASS);
    if (textSpan) {
      setCursorInElement(textSpan, true);
    }
    
    const noteentry = getNoteEntry(item);
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
   * Handle keyboard events for checklist
   */
  function handleKeyDown(event) {
    // Only handle if in a contenteditable context
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') {
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
        handleBackspaceKey(event);
        break;
      case 'Tab':
        handleTabKey(event);
        break;
      case 'ArrowUp':
        handleArrowUp(event, textSpan);
        break;
      case 'ArrowDown':
        handleArrowDown(event, textSpan);
        break;
    }
  }
  
  /**
   * Navigate between checklist items using arrow keys
   * @param {Event} event - Keyboard event
   * @param {HTMLElement} textSpan - Current text span element
   * @param {boolean} isUp - True for ArrowUp, false for ArrowDown
   */
  function handleArrowNavigation(event, textSpan, isUp) {
    const item = findChecklistItem(textSpan);
    const checklist = findChecklist(textSpan);
    if (!item || !checklist) return;
    
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    
    // Check cursor position (start for up, end for down)
    if (isUp) {
      if (range.startOffset > 0) return;
    } else {
      const textLen = getCleanText(textSpan).length;
      const textNode = textSpan.firstChild;
      const cursorAtEnd = textNode && range.startContainer === textNode && 
                          range.startOffset >= textNode.textContent.replace(/\u200B/g, '').length;
      if (!cursorAtEnd && range.startOffset < textLen) return;
    }
    
    // Get target item
    const targetItem = isUp ? item.previousElementSibling : item.nextElementSibling;
    
    if (targetItem && targetItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      // Navigate to adjacent item
      event.preventDefault();
      const targetText = targetItem.querySelector('.' + TEXT_CLASS);
      if (targetText) {
        setCursorInElement(targetText, !isUp); // End for up, start for down
      }
    } else {
      // Navigate outside checklist if element exists
      const outsideElement = isUp ? checklist.previousElementSibling : checklist.nextElementSibling;
      if (outsideElement) {
        event.preventDefault();
        setCursorInElement(outsideElement, !isUp);
      }
    }
  }
  
  /**
   * Handle ArrowUp - navigate to previous item or exit list
   */
  function handleArrowUp(event, textSpan) {
    handleArrowNavigation(event, textSpan, true);
  }
  
  /**
   * Handle ArrowDown - navigate to next item or exit list
   */
  function handleArrowDown(event, textSpan) {
    handleArrowNavigation(event, textSpan, false);
  }

  /**
   * Update data-value on input
   */
  function handleInput(event) {
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') {
      return;
    }
    
    // Find all checklist-text elements and update their data-value
    const textSpan = findCurrentChecklistText();
    if (textSpan) {
      const cleanText = getCleanText(textSpan);
      textSpan.setAttribute('data-value', cleanText);
    }
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
  }

  // ===== PUBLIC API =====

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
    if (!blocks.length) return;

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
    
    const checklists = noteentry.querySelectorAll('.' + CHECKLIST_CLASS);
    checklists.forEach(function(checklist) {
      const items = checklist.querySelectorAll('.' + CHECKLIST_ITEM_CLASS);
      items.forEach(function(item) {
        const checkbox = item.querySelector('.' + CHECKBOX_CLASS);
        
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
