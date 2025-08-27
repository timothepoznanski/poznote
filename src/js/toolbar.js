// Clean, popup-only color picker for the toolbar palette button.
// Exposes window.toggleRedColor() which is called from the toolbar button.

(function () {
  'use strict';

  const COLORS = [
    { name: 'Black', value: 'rgb(55,53,47)' },
    { name: 'Red', value: 'red' },
    { name: 'Orange', value: 'orange' },
    { name: 'Yellow', value: 'yellow' },
    { name: 'Green', value: 'green' },
    { name: 'Blue', value: 'blue' },
    { name: 'Purple', value: 'purple' },
    { name: 'None', value: 'none' }
  ];

  // Save/restore selection helpers
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      window.savedColorRange = sel.getRangeAt(0).cloneRange();
    } else {
      window.savedColorRange = null;
    }
  }

  function restoreSelection() {
    const r = window.savedColorRange;
    if (r) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    }
    return false;
  }

  // Remove inline color styles in the selected range (best-effort)
  function removeInlineColorInRange(range) {
    try {
      const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
      const toClean = [];
      while (walker.nextNode()) {
        const el = walker.currentNode;
        if (range.intersectsNode(el) && el.style && el.style.color) toClean.push(el);
      }
      toClean.forEach(el => {
        el.style.color = '';
        if (el.getAttribute('style') === '') el.removeAttribute('style');
      });
    } catch (e) {
      // swallow
    }
  }

  // Apply color (or remove it) to the saved selection
  function applyColorToSelection(color) {
    // restore selection first
    restoreSelection();

    try {
      // Prefer CSS styling for foreColor
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {
      // ignore
    }

    if (color === 'none') {
      // Try to set to inherit and then remove inline styles where possible
      try {
        document.execCommand('foreColor', false, 'inherit');
      } catch (e) {
        // ignore
      }
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        removeInlineColorInRange(sel.getRangeAt(0));
      }
    } else {
      try {
        document.execCommand('foreColor', false, color);
      } catch (e) {
        // fallback: wrap selection in span with inline style
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.color = color;
          try {
            range.surroundContents(span);
          } catch (err) {
            // If surroundContents fails (partial selections), use insertNode
            const docFrag = range.cloneContents();
            span.appendChild(docFrag);
            range.deleteContents();
            range.insertNode(span);
          }
        }
      }
    }

    // trigger optional update callback if present
    const noteentry = document.querySelector('.noteentry');
    if (noteentry && typeof window.update === 'function') {
      window.update();
    }
  }

  // Remove any existing popup
  function removeExistingPopup() {
    const prev = document.querySelector('.color-palette-popup');
    if (prev) prev.remove();
    window.savedColorRange = null;
  }

  // Build popup DOM
  function buildPopup() {
    const popup = document.createElement('div');
    popup.className = 'color-palette-popup';
    const grid = document.createElement('div');
    grid.className = 'color-grid';

    COLORS.forEach(c => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'color-item';
      item.setAttribute('data-color', c.value);
      item.setAttribute('title', c.name);
      // Visual: a small swatch and label (screen readers)
      const sw = document.createElement('span');
      sw.className = 'color-swatch';
      sw.style.background = c.value === 'none' ? 'transparent' : c.value;
      if (c.value === 'none') {
        // Visual: neutral empty swatch with border (no cross)
        sw.style.border = '1px solid #ccc';
        sw.style.background = 'transparent';
        sw.style.display = 'inline-block';
      }
      sw.setAttribute('aria-hidden', 'true');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(' '));
      grid.appendChild(item);
    });

    popup.appendChild(grid);
    return popup;
  }

  // Main entry: show popup centered under the palette button
  function toggleRedColor() {
    try {
      removeExistingPopup();
      saveSelection();

      const btn = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('btn-color')
        ? document.activeElement
        : document.querySelector('.btn-color');

      const popup = buildPopup();
      document.body.appendChild(popup);

      // Positioning: center under button
      const btnRect = btn ? btn.getBoundingClientRect() : { left: 10, right: 40, bottom: 40, width: 30 };
      const popupRect = popup.getBoundingClientRect();
      const left = btnRect.left + (btnRect.width / 2) - (popupRect.width / 2) + window.scrollX;
      const top = btnRect.bottom + 8 + window.scrollY;
      popup.style.position = 'absolute';
      popup.style.left = Math.max(8, left) + 'px';
      popup.style.top = top + 'px';

      // caret alignment variable for CSS if used
      const caretX = (btnRect.left + (btnRect.width / 2)) - (left);
      popup.style.setProperty('--caret-x', Math.max(8, caretX) + 'px');

      // show class for CSS transitions
      setTimeout(() => popup.classList.add('show'), 10);

      // Click handler
      popup.addEventListener('click', function (e) {
        const btnItem = e.target.closest('.color-item');
        if (!btnItem) return;
        const color = btnItem.getAttribute('data-color');
        applyColorToSelection(color);
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 160);
        window.savedColorRange = null;
      });

      // Close on outside click
      function outsideHandler(e) {
        if (!popup.contains(e.target) && !(e.target.closest && e.target.closest('.btn-color'))) {
          popup.classList.remove('show');
          setTimeout(() => popup.remove(), 160);
          document.removeEventListener('click', outsideHandler);
          document.removeEventListener('keydown', keyHandler);
          window.savedColorRange = null;
        }
      }

      function keyHandler(e) {
        if (e.key === 'Escape') {
          popup.classList.remove('show');
          setTimeout(() => popup.remove(), 160);
          document.removeEventListener('click', outsideHandler);
          document.removeEventListener('keydown', keyHandler);
          window.savedColorRange = null;
        }
      }

      setTimeout(() => document.addEventListener('click', outsideHandler), 20);
      document.addEventListener('keydown', keyHandler);

    } catch (err) {
      console.error('toggleRedColor error', err);
    }
  }

  // Export
  window.toggleRedColor = toggleRedColor;
  // Also expose applyColorToSelection in case other scripts call it
  window.applyColorToSelection = applyColorToSelection;

})();
function toggleYellowHighlight() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let allYellow = true, hasText = false;
    const treeWalker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = treeWalker.currentNode;
    while(node) {
      if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
        hasText = true;
        let parent = node.parentNode;
        let bg = '';
        if (parent && parent.style && parent.style.backgroundColor) bg = parent.style.backgroundColor.replace(/\s/g, '').toLowerCase();
        if (bg !== '#ffe066' && bg !== 'rgb(255,224,102)') allYellow = false;
      }
      node = treeWalker.nextNode();
    }
    document.execCommand('styleWithCSS', false, true);
    if (hasText && allYellow) {
      document.execCommand('hiliteColor', false, 'inherit');
    } else {
      document.execCommand('hiliteColor', false, '#ffe066');
    }
    document.execCommand('styleWithCSS', false, false);
  }
}

// Helper function to convert font size value to CSS size
function getFontSizeFromValue(value) {
  const sizeMap = {
    '1': '0.75rem',   // Très petit
    '2': '0.875rem',  // Petit  
    '3': '1rem',      // Normal
    '4': '1.125rem',  // Grand
    '5': '1.5rem',    // Très grand
    '6': '2rem',      // Énorme
    '7': '3rem'       // Géant
  };
  return sizeMap[value] || '1rem';
}

function changeFontSize() {
  // Close any existing font size popup
  const existingPopup = document.querySelector('.font-size-popup');
  if (existingPopup) {
    existingPopup.remove();
    return;
  }

  // Save the current selection before opening popup
  const selection = window.getSelection();
  let savedRange = null;
  
  if (selection.rangeCount > 0) {
    savedRange = selection.getRangeAt(0).cloneRange();
  }
  
  // Check if we have selected text
  const hasSelection = savedRange && !savedRange.collapsed;
  
  if (!hasSelection) {
    // No selection - silently return
    return;
  }

  // Find the font size button to position the popup
  const fontSizeButton = document.querySelector('.btn-text-height');
  if (!fontSizeButton) return;

  // Create the popup
  const popup = document.createElement('div');
  popup.className = 'font-size-popup';
  
  // Font size options with labels
  const fontSizes = [
    { value: '1', label: 'Très petit', preview: 'Aa' },
    { value: '2', label: 'Petit', preview: 'Aa' },
    { value: '3', label: 'Normal', preview: 'Aa' },
    { value: '4', label: 'Grand', preview: 'Aa' },
    { value: '5', label: 'Très grand', preview: 'Aa' },
    { value: '6', label: 'Énorme', preview: 'Aa' },
    { value: '7', label: 'Géant', preview: 'Aa' }
  ];

  // Build popup content
  let popupHTML = '';
  fontSizes.forEach(size => {
    popupHTML += `
      <div class="font-size-item" data-size="${size.value}">
        <span class="size-label">${size.label}</span>
        <span class="size-preview size-${size.value}">${size.preview}</span>
      </div>
    `;
  });
  
  popup.innerHTML = popupHTML;
  
  // Append popup to body and compute coordinates so it doesn't get clipped
  document.body.appendChild(popup);
  popup.style.position = 'absolute';
  popup.style.minWidth = '180px';

  // Position near the button but keep inside viewport
  const btnRect = fontSizeButton.getBoundingClientRect();
  const popupRectEstimate = { width: 220, height: (fontSizes.length * 44) };
  let left = btnRect.right - popupRectEstimate.width;
  if (left < 8) left = 8;
  let top = btnRect.bottom + 8;
  // If popup would overflow bottom, place it above the button
  if (top + popupRectEstimate.height > window.innerHeight - 8) {
    top = btnRect.top - popupRectEstimate.height - 8;
    if (top < 8) top = 8;
  }
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // Show popup with animation
  setTimeout(() => {
    popup.classList.add('show');
  }, 10);

  // Add click handlers for font size items
  popup.querySelectorAll('.font-size-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const size = item.getAttribute('data-size');
      
      // Ensure editor has focus
      const editor = document.querySelector('[contenteditable="true"]');
      if (editor) {
        editor.focus();
        
        // Restore the saved selection
        if (savedRange) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(savedRange);
          // Apply font size to the restored selection
          document.execCommand('fontSize', false, size);
        }
      }
      
      // Close popup
      popup.classList.remove('show');
      setTimeout(() => {
        popup.remove();
      }, 200);
    });
  });

  // Close popup when clicking outside
  const closePopup = (e) => {
    if (!popup.contains(e.target) && !fontSizeButton.contains(e.target)) {
      popup.classList.remove('show');
      setTimeout(() => {
        popup.remove();
      }, 200);
      document.removeEventListener('click', closePopup);
    }
  };
  
  // Add delay to prevent immediate closure
  setTimeout(() => {
    document.addEventListener('click', closePopup);
  }, 100);

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      popup.classList.remove('show');
      setTimeout(() => {
        popup.remove();
      }, 200);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  
  document.addEventListener('keydown', handleEscape);
}

function toggleCodeBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  
  // If already in a code block, remove it
  const existingPre = container.closest ? container.closest('pre') : null;
  if (existingPre) {
    const text = existingPre.textContent;
    existingPre.outerHTML = text.replace(/\n/g, '<br>');
    return;
  }
  
  // Otherwise, create a code block with the selected text
  if (sel.isCollapsed) {
    // No selection: insert empty block
    document.execCommand('insertHTML', false, '<pre class="code-block"><br></pre>');
    return;
  }
  
  // Get selected text
  const selectedText = sel.toString();
  if (!selectedText.trim()) return;
  
  // Escape HTML and create code block
  const escapedText = selectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const codeHTML = `<pre class="code-block">${escapedText}</pre>`;
  document.execCommand('insertHTML', false, codeHTML);
}

function toggleInlineCode() {
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
  
  // Escape HTML and create inline code
  const escapedText = selectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const codeHTML = `<code>${escapedText}</code>`;
  document.execCommand('insertHTML', false, codeHTML);
}

function insertSeparator() {
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
      noteentry.dispatchEvent(new Event('input', {bubbles:true}));
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
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return; // allow newline with Shift+Enter

});

function toggleEmojiPicker() {
  const existingPicker = document.querySelector('.emoji-picker');
  
  if (existingPicker) {
    existingPicker.remove();
    return;
  }
  
  // Create emoji popup
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  
  // Simplified popular emojis collection
  const emojis = ['😀', '😃', '😄', '😊', '😍', '😘', '😎', '🤔', '😅', '😂', '😢', '😭', '😡', '👍', '👎', '👉', '👌', '✌️', '👏', '🙌', '👋', '🤝', '🙏', '✊', '👊', '❤️', '➜', '✅', '🟩', '🟪', '☑️', '❌', '✔️', '❗', '❓', '⭐', '🔥', '💯', '🎯', '📌', '🚀', '💡', '🔔', '⚡', '🌟', '💎', '📱', '💻', '📧', '📁', '📄', '📝', '🔍', '🔑', '⚙️', '🛠️', '📊', '📈', '⚠️', '🚩', '🟢', '🔴', '🔵', '☀️', '🌙', '☕', '🍕', '🎂', '🍎', '🌱', '🌸', '🐱', '🐶', '🎵', '🎨'];  
  
  // Create picker content
  let content = '<div class="emoji-category">';
  content += '<div class="emoji-grid">';
  
  emojis.forEach(emoji => {
    content += `<span class="emoji-item" data-emoji="${emoji}">${emoji}</span>`;
  });
  
  content += '</div></div>';
  
  picker.innerHTML = content;
  
  // Position picker near emoji button
  document.body.appendChild(picker);
  
  // Position picker with overflow management
  const emojiBtn = document.querySelector('.btn-emoji');
  if (emojiBtn) {
    const rect = emojiBtn.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const isMobile = windowWidth <= 800;
    
    // Picker dimensions according to screen
    const pickerWidth = isMobile ? Math.min(300, windowWidth - 40) : 360;
    const pickerHeight = isMobile ? 350 : 400;
    
    picker.style.position = 'fixed';
    picker.style.width = pickerWidth + 'px';
    picker.style.maxHeight = pickerHeight + 'px';
    
    // Calculate vertical position
    let top = rect.bottom + 10;
    if (top + pickerHeight > windowHeight - 20) {
      // If picker overflows bottom, place above button
      top = rect.top - pickerHeight - 10;
      if (top < 20) {
        // If it doesn't fit above either, center vertically
        top = Math.max(20, (windowHeight - pickerHeight) / 2);
      }
    }
    
    // Calculate horizontal position
    let left;
    if (isMobile) {
      // On mobile, center in screen
      left = (windowWidth - pickerWidth) / 2;
    } else {
      // On desktop, center on button
      left = rect.left - (pickerWidth / 2) + (rect.width / 2);
      if (left + pickerWidth > windowWidth - 20) {
        left = windowWidth - pickerWidth - 20;
      }
      if (left < 20) {
        left = 20;
      }
    }
    
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
  }
  
  // Handle emoji clicks
  picker.addEventListener('click', function(e) {
    if (e.target.classList.contains('emoji-item')) {
      const emoji = e.target.getAttribute('data-emoji');
      insertEmoji(emoji);
      picker.remove();
    }
  });
  
  // Close picker when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeEmojiPicker(e) {
      if (!picker.contains(e.target) && !e.target.closest('.btn-emoji')) {
        picker.remove();
        document.removeEventListener('click', closeEmojiPicker);
      }
    });
  }, 100);
}

function insertEmoji(emoji) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');
  
  if (!noteentry) return;
  
  // Insert emoji
  document.execCommand('insertText', false, emoji);
  
  // Trigger input event
  if (noteentry) {
    noteentry.dispatchEvent(new Event('input', {bubbles: true}));
  }
}

// Ensure functions are available in global scope
window.insertSeparator = insertSeparator;

// ==============================================
// MOBILE TOOLBAR BEHAVIOR (conditional display)
// ==============================================

document.addEventListener('DOMContentLoaded', function() {
    // Check if on mobile
    const isMobile = window.innerWidth <= 800;
    
    if (!isMobile) return; // Don't execute this script on desktop
    
    let selectionTimer;
    
    // Function to show/hide formatting buttons
    function toggleFormatButtons() {
        const selection = window.getSelection();
        const toolbar = document.querySelector('.note-edit-toolbar');
        
        if (selection.toString().length > 0) {
            // Text is selected, show formatting buttons
            if (toolbar) {
                toolbar.classList.add('show-format-buttons');
            }
        } else {
            // No selection, hide formatting buttons
            if (toolbar) {
                toolbar.classList.remove('show-format-buttons');
            }
        }
    }
    
    // Listen to selection events
    document.addEventListener('selectionchange', function() {
        // Use timer to avoid too many calls
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(toggleFormatButtons, 100);
    });
    
    // Also listen to clicks on editable elements
    document.addEventListener('click', function(e) {
        if (e.target.closest('.noteentry')) {
            setTimeout(toggleFormatButtons, 100);
        }
    });
    
    // Listen to touch events for mobile
    document.addEventListener('touchend', function(e) {
        if (e.target.closest('.noteentry')) {
            setTimeout(toggleFormatButtons, 150);
        }
    });
    
    // Hide buttons when clicking outside a note
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.notecard')) {
            const toolbar = document.querySelector('.note-edit-toolbar');
            if (toolbar) {
                toolbar.classList.remove('show-format-buttons');
            }
        }
    });
});

    // Minimal link helpers (lightweight, prompt-based fallback)
    function addLinkToNote() {
      try {
        const sel = window.getSelection();
        const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
        const url = window.prompt('Enter URL', 'https://');
        if (!url) return;
        if (hasSelection) {
          // Try to create link around selection
          try {
            document.execCommand('createLink', false, url);
          } catch (e) {
            const range = sel.getRangeAt(0);
            const a = document.createElement('a');
            a.href = url;
            a.textContent = sel.toString();
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            range.deleteContents();
            range.insertNode(a);
          }
        } else {
          // No selection: ask for link text and insert at caret or end of editor
          const text = window.prompt('Link text (optional)', url) || url;
          const a = document.createElement('a');
          a.href = url;
          a.textContent = text;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
          if (range) {
            range.insertNode(a);
            // move caret after inserted link
            range.setStartAfter(a);
            range.setEndAfter(a);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            const noteentry = document.querySelector('.noteentry');
            if (noteentry) noteentry.appendChild(a);
          }
        }

        const noteentry = document.querySelector('.noteentry');
        if (noteentry && typeof window.update === 'function') window.update();
      } catch (err) {
        console.error('addLinkToNote error', err);
      }
    }

    function createLinkFromModal() {
      // Backwards-compatible stub: fallback to addLinkToNote behaviour
      return addLinkToNote();
    }

    function closeLinkModal() {
      // No modal in this minimal implementation
      return;
    }

// Ensure all toolbar functions are available in global scope
window.addLinkToNote = addLinkToNote;
window.toggleRedColor = toggleRedColor;
window.toggleYellowHighlight = toggleYellowHighlight;
window.changeFontSize = changeFontSize;
window.toggleCodeBlock = toggleCodeBlock;
window.toggleInlineCode = toggleInlineCode;
window.toggleEmojiPicker = toggleEmojiPicker;
window.insertEmoji = insertEmoji;
