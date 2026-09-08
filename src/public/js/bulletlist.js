/**
 * BULLET LIST FEATURE - Tab Indentation for Nested Lists
 * 
 * Enables Tab/Shift+Tab for indenting/outdenting bullet list items.
 * Works with standard <ul><li> elements that are NOT checklists.
 */

(function() {
  'use strict';

  // ===== CONSTANTS =====
  
  // Class names for checklist items to exclude from bullet list handling
  const CHECKLIST_CLASSES = {
    ITEM: ['checklist-item', 'task-list-item'],
    LIST: ['checklist', 'task-list']
  };

  // Track if event listeners are already set up
  let listenersInitialized = false;

  // ===== UTILITY FUNCTIONS =====

  /**
   * Get the noteentry element from a given element
   * @param {HTMLElement} element - The element to search from
   * @returns {HTMLElement|null} The noteentry element or null
   */
  function getNoteEntry(element) {
    if (!element) return null;
    return element.closest('.noteentry');
  }

  /**
   * Check if an element is a checklist item or list
   * Checklists are handled by a separate module and should be excluded
   * @param {HTMLElement} element - The element to check
   * @param {boolean} isList - Whether checking a list (ul/ol) or list item (li)
   * @returns {boolean} True if element is a checklist
   */
  function isChecklistElement(element, isList = false) {
    if (!element) return false;
    const classesToCheck = isList ? CHECKLIST_CLASSES.LIST : CHECKLIST_CLASSES.ITEM;
    return classesToCheck.some(className => element.classList.contains(className));
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
   * Set cursor position in an element
   * @param {HTMLElement} element - The element to place cursor in
   * @param {boolean} atEnd - If true, place cursor at end; if false, at beginning
   */
  function setCursorInElement(element, atEnd) {
    if (!element) return;
    
    const range = document.createRange();
    const sel = window.getSelection();
    
    if (element.childNodes.length > 0) {
      const textNode = element.firstChild;
      if (textNode.nodeType === Node.TEXT_NODE) {
        const offset = atEnd ? textNode.textContent.length : 0;
        range.setStart(textNode, offset);
      } else {
        range.selectNodeContents(element);
      }
    } else {
      range.selectNodeContents(element);
    }
    
    range.collapse(atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Find the current list item (li) that contains the cursor
   * Excludes checklist items which are handled by a separate module
   * @returns {HTMLElement|null} The list item element or null
   */
  function findCurrentBulletListItem() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    
    // Walk up the DOM tree to find a list item
    while (node && node !== document) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'LI') {
        // Exclude checklist items
        if (isChecklistElement(node, false)) {
          return null;
        }
        
        // Verify parent is a regular list (ul/ol), not a checklist
        const parentList = node.parentElement;
        if (parentList && (parentList.tagName === 'UL' || parentList.tagName === 'OL')) {
          if (!isChecklistElement(parentList, true)) {
            return node;
          }
        }
      }
      node = node.parentNode;
    }
    
    return null;
  }

  /**
   * Find the parent list (ul/ol) from a list item
   * @param {HTMLElement} listItem - The list item element
   * @returns {HTMLElement|null} The parent ul or ol element
   */
  function findParentList(listItem) {
    if (!listItem) return null;
    const parent = listItem.parentElement;
    if (parent && (parent.tagName === 'UL' || parent.tagName === 'OL')) {
      return parent;
    }
    return null;
  }

  /**
   * Create a new list of the same type as the parent
   * @param {HTMLElement} parentList - The parent list to match type
   * @returns {HTMLElement} A new ul or ol element
   */
  function createNestedList(parentList) {
    const tagName = parentList ? parentList.tagName : 'UL';
    const list = document.createElement(tagName);
    list.style.marginTop = '0';
    list.style.marginBottom = '0';
    return list;
  }

  // ===== INDENTATION FUNCTIONS =====

  /**
   * Indent a list item (TAB key)
   * Moves the current item as a child of the previous sibling item
   * Limited to one level of indentation only
   * @param {HTMLElement} item - The list item to indent
   * @returns {boolean} True if indentation was successful
   */
  function indentListItem(item) {
    const prevItem = item.previousElementSibling;
    if (!prevItem || prevItem.tagName !== 'LI') {
      // Cannot indent first item or if previous is not a list item
      return false;
    }
    
    // Verify previous item is not a checklist item
    if (isChecklistElement(prevItem, false)) {
      return false;
    }

    const parentList = findParentList(item);
    
    // Limit indentation to one level only
    // Check if we're already in a nested list (parentList is inside a LI)
    const parentListParent = parentList.parentElement;
    if (parentListParent && parentListParent.tagName === 'LI') {
      // Already indented once, cannot indent further
      return false;
    }
    
    // Find or create nested list in previous item
    let nestedList = null;
    
    // Check for existing nested ul/ol at the end of prevItem
    const lastChild = prevItem.lastElementChild;
    if (lastChild && (lastChild.tagName === 'UL' || lastChild.tagName === 'OL')) {
      nestedList = lastChild;
    }
    
    if (!nestedList) {
      nestedList = createNestedList(parentList);
      prevItem.appendChild(nestedList);
    }
    
    // Move item to nested list
    nestedList.appendChild(item);
    
    // Restore cursor position
    setCursorInElement(item, true);
    
    const noteentry = getNoteEntry(item);
    if (noteentry) {
      markAsModified(noteentry);
    }
    
    return true;
  }

  /**
   * Outdent a list item (SHIFT+TAB key)
   * Moves the current item from a nested list back to the parent level
   * @param {HTMLElement} item - The list item to outdent
   * @returns {boolean} True if outdentation was successful
   */
  function outdentListItem(item) {
    const parentList = findParentList(item);
    if (!parentList) return false;
    
    const parentListItem = parentList.parentElement;
    // Check if we're in a nested list (parent list is inside another li)
    if (!parentListItem || parentListItem.tagName !== 'LI') {
      // Already at root level, cannot outdent
      return false;
    }
    
    // Verify parent item is not a checklist
    if (isChecklistElement(parentListItem, false)) {
      return false;
    }
    
    const grandparentList = findParentList(parentListItem);
    if (!grandparentList) return false;
    
    // Move item after parent item in the grandparent list
    if (parentListItem.nextSibling) {
      grandparentList.insertBefore(item, parentListItem.nextSibling);
    } else {
      grandparentList.appendChild(item);
    }
    
    // Clean up empty nested list
    if (parentList.querySelectorAll(':scope > li').length === 0) {
      parentList.remove();
    }
    
    // Restore cursor position
    setCursorInElement(item, true);
    
    const noteentry = getNoteEntry(item);
    if (noteentry) {
      markAsModified(noteentry);
    }
    
    return true;
  }

  // ===== KEYBOARD HANDLER =====

  /**
   * Handle Tab key for bullet list indentation
   */
  function handleTabKey(event) {
    const listItem = findCurrentBulletListItem();
    if (!listItem) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    if (event.shiftKey) {
      outdentListItem(listItem);
    } else {
      indentListItem(listItem);
    }
  }

  /**
   * Handle keyboard events for bullet lists
   */
  function handleKeyDown(event) {
    // Only handle Tab key
    if (event.key !== 'Tab') return;
    
    // Only handle if in a contenteditable context
    const target = event.target;
    if (!target.isContentEditable && target.contentEditable !== 'true') {
      return;
    }
    
    // Check if we're in a bullet list item (not checklist)
    const listItem = findCurrentBulletListItem();
    if (!listItem) return;
    
    handleTabKey(event);
  }

  // ===== INITIALIZATION =====

  /**
   * Initialize bullet list keyboard handling
   * Sets up event listeners for Tab/Shift+Tab indentation
   */
  function initBulletList() {
    if (listenersInitialized) return;
    
    // Use capture phase to handle Tab before other handlers (like checklists)
    document.addEventListener('keydown', handleKeyDown, true);
    
    listenersInitialized = true;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulletList);
  } else {
    initBulletList();
  }

  // Expose for external use if needed
  window.bulletListIndent = indentListItem;
  window.bulletListOutdent = outdentListItem;

})();
