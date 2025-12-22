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
   * Get clean text content (remove zero-width spaces)
   */
  function getCleanText(element) {
    if (!element) return '';
    return (element.textContent || '').replace(/\u200B/g, '').trim();
  }

  /**
   * Set cursor position in an element
   */
  function setCursorInElement(element, atEnd) {
    if (!element) return;
    
    const range = document.createRange();
    const sel = window.getSelection();
    
    if (element.childNodes.length > 0) {
      const textNode = element.firstChild;
      if (textNode.nodeType === 3) {
        const offset = atEnd ? textNode.textContent.length : 0;
        range.setStart(textNode, offset);
      } else {
        range.selectNodeContents(element);
        range.collapse(!atEnd);
      }
    } else {
      range.selectNodeContents(element);
      range.collapse(!atEnd);
    }
    
    range.collapse(atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
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
   */
  function createTextSpan(text) {
    const span = document.createElement('span');
    span.className = TEXT_CLASS;
    
    // Add zero-width space for empty spans to allow cursor placement
    if (text && text.length > 0) {
      span.appendChild(document.createTextNode(text));
    } else {
      span.appendChild(document.createTextNode('\u200B'));
    }
    
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

  /**
   * Create a paragraph element
   */
  function createParagraph() {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    return p;
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
    
    const isChecked = checkbox.checked;
    
    // Update data attribute
    checkbox.setAttribute('data-checked', isChecked ? '1' : '0');
    
    // Update checked attribute
    if (isChecked) {
      checkbox.setAttribute('checked', 'checked');
      item.classList.add(CHECKED_ITEM_CLASS);
    } else {
      checkbox.removeAttribute('checked');
      item.classList.remove(CHECKED_ITEM_CLASS);
    }
    
    // Mark as modified
    const noteentry = getNoteEntry(checkbox);
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Handle Enter key in checklist
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
    const cursorOffset = range.startOffset;
    
    // Get text before and after cursor
    let textBefore = '';
    let textAfter = '';
    
    const textNode = textSpan.firstChild;
    if (textNode && textNode.nodeType === 3) {
      const fullText = textNode.textContent.replace(/\u200B/g, '');
      const actualOffset = Math.min(cursorOffset, fullText.length);
      textBefore = fullText.substring(0, actualOffset);
      textAfter = fullText.substring(actualOffset);
    }
    
    // Update current item with text before cursor
    while (textSpan.firstChild) {
      textSpan.removeChild(textSpan.firstChild);
    }
    if (textBefore.length > 0) {
      textSpan.appendChild(document.createTextNode(textBefore));
    } else {
      textSpan.appendChild(document.createTextNode('\u200B'));
    }
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
      // Need a small delay to ensure DOM is updated
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
        // Remove this item and focus previous
        const prevItem = item.previousElementSibling;
        const nextItem = item.nextElementSibling;
        
        item.remove();
        
        if (prevItem) {
          const prevText = prevItem.querySelector('.' + TEXT_CLASS);
          if (prevText) {
            setCursorInElement(prevText, true);
          }
        } else if (nextItem) {
          const nextText = nextItem.querySelector('.' + TEXT_CLASS);
          if (nextText) {
            setCursorInElement(nextText, false);
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
          
          // Merge text
          const prevTextContent = getCleanText(prevText);
          const currentTextContent = getCleanText(textSpan);
          
          // Clear and set new content
          while (prevText.firstChild) {
            prevText.removeChild(prevText.firstChild);
          }
          prevText.appendChild(document.createTextNode(prevTextContent + currentTextContent));
          prevText.setAttribute('data-value', prevTextContent + currentTextContent);
          
          // Remove current item
          item.remove();
          
          // Position cursor at junction
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
    const textNode = p.firstChild;
    if (textNode) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(textNode, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    // Reset processing flag
    isProcessingEnter = false;
    
    if (noteentry) {
      markAsModified(noteentry);
    }
  }

  /**
   * Indent a checklist item
   */
  function indentItem(item) {
    const prevItem = item.previousElementSibling;
    if (!prevItem || !prevItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      return;
    }
    
    // Find or create nested list in previous item
    let nestedList = prevItem.querySelector(':scope > .' + CHECKLIST_CLASS);
    
    if (!nestedList) {
      nestedList = createChecklist();
      nestedList.style.paddingLeft = '24px';
      prevItem.appendChild(nestedList);
    }
    
    nestedList.appendChild(item);
    
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
   * Outdent a checklist item
   */
  function outdentItem(item) {
    const parentList = item.parentElement;
    if (!parentList || !parentList.classList.contains(CHECKLIST_CLASS)) {
      return;
    }
    
    const parentItem = parentList.parentElement;
    if (!parentItem || !parentItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      return;
    }
    
    const grandparentList = parentItem.parentElement;
    if (!grandparentList) return;
    
    // Move item after parent item
    if (parentItem.nextSibling) {
      grandparentList.insertBefore(item, parentItem.nextSibling);
    } else {
      grandparentList.appendChild(item);
    }
    
    // Clean up empty nested list
    if (parentList.querySelectorAll(':scope > .' + CHECKLIST_ITEM_CLASS).length === 0) {
      parentList.remove();
    }
    
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
        handleEnterKey(event);
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
   * Handle ArrowUp - navigate to previous item or exit list
   */
  function handleArrowUp(event, textSpan) {
    const item = findChecklistItem(textSpan);
    if (!item) return;
    
    const checklist = findChecklist(textSpan);
    if (!checklist) return;
    
    // Check if at start of text
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    
    // Only act if we're at the very beginning
    if (range.startOffset > 0) return;
    
    const prevItem = item.previousElementSibling;
    
    if (prevItem && prevItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      // Navigate to previous item
      event.preventDefault();
      const prevText = prevItem.querySelector('.' + TEXT_CLASS);
      if (prevText) {
        setCursorInElement(prevText, true);
      }
    } else {
      // First item - navigate to element above the checklist if exists
      const prevElement = checklist.previousElementSibling;
      if (prevElement) {
        event.preventDefault();
        // Position cursor at end of previous element
        const r = document.createRange();
        r.selectNodeContents(prevElement);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
  }
  
  /**
   * Handle ArrowDown - navigate to next item or exit list
   */
  function handleArrowDown(event, textSpan) {
    const item = findChecklistItem(textSpan);
    if (!item) return;
    
    const checklist = findChecklist(textSpan);
    if (!checklist) return;
    
    // Check if at end of text
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    
    // Get text length (excluding zero-width space)
    const textLen = getCleanText(textSpan).length;
    const textNode = textSpan.firstChild;
    const cursorAtEnd = textNode && range.startContainer === textNode && 
                        range.startOffset >= textNode.textContent.replace(/\u200B/g, '').length;
    
    if (!cursorAtEnd && range.startOffset < textLen) return;
    
    const nextItem = item.nextElementSibling;
    
    if (nextItem && nextItem.classList.contains(CHECKLIST_ITEM_CLASS)) {
      // Navigate to next item
      event.preventDefault();
      const nextText = nextItem.querySelector('.' + TEXT_CLASS);
      if (nextText) {
        setCursorInElement(nextText, false);
      }
    } else {
      // Last item - check if there's something below the checklist
      const nextElement = checklist.nextElementSibling;
      if (nextElement) {
        event.preventDefault();
        // Position cursor at start of next element
        const r = document.createRange();
        r.selectNodeContents(nextElement);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
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
   */
  function insertChecklist() {
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
    const firstItem = createChecklistItem(false, '');
    checklist.appendChild(firstItem);
    
    // Create empty line before
    const emptyLine = document.createElement('div');
    emptyLine.appendChild(document.createElement('br'));
    
    // Insert at cursor position
    range.deleteContents();
    range.insertNode(checklist);
    range.insertNode(emptyLine);
    
    // Focus first item
    const textSpan = firstItem.querySelector('.' + TEXT_CLASS);
    if (textSpan) {
      setTimeout(function() {
        setCursorInElement(textSpan, false);
      }, 10);
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
          const isChecked = checkbox.checked;
          const text = getCleanText(textSpan);
          
          checkbox.setAttribute('data-checked', isChecked ? '1' : '0');
          textSpan.setAttribute('data-value', text);
          
          if (isChecked) {
            checkbox.setAttribute('checked', 'checked');
            item.classList.add(CHECKED_ITEM_CLASS);
          } else {
            checkbox.removeAttribute('checked');
            item.classList.remove(CHECKED_ITEM_CLASS);
          }
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

  function init() {
    setupEventListeners();
    
    // Set up save hooks
    if (!window._checklistSaveHookInstalled) {
      window._checklistSaveHookInstalled = true;
      
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
      
      const originalMarkNoteAsModified = window.markNoteAsModified;
      if (typeof originalMarkNoteAsModified === 'function') {
        window.markNoteAsModified = function() {
          const noteentry = document.querySelector('.noteentry');
          if (noteentry) {
            serializeChecklistsBeforeSave(noteentry);
          }
          return originalMarkNoteAsModified.apply(this, arguments);
        };
      }
    }
    
    // Restore any existing checklists
    const noteentry = document.querySelector('.noteentry');
    if (noteentry) {
      restoreChecklistsAfterLoad(noteentry);
    }
  }

  // ===== EXPORTS =====

  window.insertChecklist = insertChecklist;
  window.serializeChecklistsBeforeSave = serializeChecklistsBeforeSave;
  window.restoreChecklistsAfterLoad = restoreChecklistsAfterLoad;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
