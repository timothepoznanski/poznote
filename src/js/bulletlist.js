/**
 * BULLET LIST FEATURE - Tab Indentation for Nested Lists
 * 
 * Enables Tab/Shift+Tab for indenting/outdenting bullet list items.
 * Works with standard <ul><li> elements that are NOT checklists.
 */

(function() {
  'use strict';

  // Track if event listeners are already set up
  let listenersInitialized = false;

  // ===== UTILITY FUNCTIONS =====

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
   * Find the current list item (li) that contains the cursor
   * Excludes checklist items which are handled separately
   */
  function findCurrentBulletListItem() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    
    // Walk up to find li
    while (node && node !== document) {
      if (node.nodeType === 1 && node.tagName === 'LI') {
        // Make sure it's NOT a checklist item
        if (!node.classList.contains('checklist-item') && !node.classList.contains('task-list-item')) {
          // Make sure parent is ul or ol (not a checklist)
          const parentList = node.parentElement;
          if (parentList && (parentList.tagName === 'UL' || parentList.tagName === 'OL')) {
            if (!parentList.classList.contains('checklist') && !parentList.classList.contains('task-list')) {
              return node;
            }
          }
        }
      }
      node = node.parentNode;
    }
    
    return null;
  }

  /**
   * Find the parent list (ul/ol) from a list item
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
   */
  function indentListItem(item) {
    const prevItem = item.previousElementSibling;
    if (!prevItem || prevItem.tagName !== 'LI') {
      // Cannot indent first item or if previous is not a list item
      return false;
    }
    
    // Also check that prevItem is not a checklist item
    if (prevItem.classList.contains('checklist-item') || prevItem.classList.contains('task-list-item')) {
      return false;
    }

    const parentList = findParentList(item);
    
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
    
    // Also check parent is not a checklist
    if (parentListItem.classList.contains('checklist-item') || parentListItem.classList.contains('task-list-item')) {
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
   */
  function initBulletList() {
    if (listenersInitialized) return;
    
    // Use capture phase to handle before other handlers
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
