function addLinkToNote() {
  // Check if there's a text selection and save it
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  let savedRange = null;
  
  // Save the current selection range
  if (selection.rangeCount > 0) {
    savedRange = selection.getRangeAt(0).cloneRange();
  }
  
  // Create the modal HTML
  const modalHTML = `
    <div id="linkModal" class="link-modal-overlay">
      <div class="link-modal-content">
        <div class="link-modal-header">
          <h3>Créer un lien</h3>
          <button class="link-modal-close" onclick="closeLinkModal()">&times;</button>
        </div>
        <div class="link-modal-body">
          <div class="link-modal-field">
            <label for="linkText">Texte du lien :</label>
            <input type="text" id="linkText" value="${selectedText}" placeholder="Entrez le texte du lien">
          </div>
          <div class="link-modal-field">
            <label for="linkUrl">URL :</label>
            <input type="url" id="linkUrl" placeholder="https://example.com">
          </div>
        </div>
        <div class="link-modal-footer">
          <button class="link-modal-btn link-modal-btn-cancel" onclick="closeLinkModal()">Annuler</button>
          <button class="link-modal-btn link-modal-btn-primary" onclick="createLinkFromModal()">Créer le lien</button>
        </div>
      </div>
    </div>
  `;
  
  // Remove any existing modal
  const existingModal = document.getElementById('linkModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Store the saved range for later use
  window.savedLinkRange = savedRange;
  window.originalSelectedText = selectedText;
  
  // Show modal with animation
  const modal = document.getElementById('linkModal');
  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('show');
  }, 10);
  
  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeLinkModal();
    }
  });
  
  // Focus URL input (only if it's not already focused)
  const linkUrlEl = document.getElementById('linkUrl');
  const linkTextEl = document.getElementById('linkText');
  try {
    if (linkUrlEl && document.activeElement !== linkUrlEl) {
      // Slight delay to ensure the modal is attached and visible before focusing
      setTimeout(() => {
        linkUrlEl.focus();
      }, 10);
    }
  } catch (e) {
    // ignore focus errors
  }

  // Handle Enter/Escape keys on inputs
  if (linkUrlEl) {
    linkUrlEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        createLinkFromModal();
      }
      if (e.key === 'Escape') {
        closeLinkModal();
      }
    });
  }

  if (linkTextEl) {
    linkTextEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        createLinkFromModal();
      }
      if (e.key === 'Escape') {
        closeLinkModal();
      }
    });
  }
}

// Function to close the link modal
function closeLinkModal() {
  const modal = document.getElementById('linkModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.remove();
    }, 200);
  }
  
  // Clean up global variables
  window.savedLinkRange = null;
  window.originalSelectedText = null;
}

// Function to create the link from the modal
function createLinkFromModal() {
  const linkText = document.getElementById('linkText').value.trim();
  const linkUrl = document.getElementById('linkUrl').value.trim();
  
  if (!linkUrl || linkUrl === 'https://') {
    // Focus URL field if empty
    document.getElementById('linkUrl').focus();
    document.getElementById('linkUrl').style.borderColor = '#dc3545';
    setTimeout(() => {
      document.getElementById('linkUrl').style.borderColor = '';
    }, 2000);
    return;
  }
  
  // Get the saved range and original text
  const savedRange = window.savedLinkRange;
  const originalSelectedText = window.originalSelectedText;
  
  if (savedRange) {
    // Restore the selection
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
    
    // Create link element
    const link = document.createElement('a');
    link.href = linkUrl;
    link.textContent = linkText || originalSelectedText || linkUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    try {
      // If there was selected text, replace it
      if (originalSelectedText) {
        savedRange.deleteContents();
      }
      
      // Insert the link
      savedRange.insertNode(link);
      
      // Position cursor after the link
      savedRange.setStartAfter(link);
      savedRange.setEndAfter(link);
      selection.removeAllRanges();
      selection.addRange(savedRange);
      
    } catch (e) {
      // Link insertion fallback: silently attempt execCommand approach
      // Fallback: try using execCommand if modern approach fails
      if (originalSelectedText) {
        document.execCommand('createLink', false, linkUrl);
        // Try to set the link text
        const links = document.querySelectorAll('a[href="' + linkUrl + '"]');
        const lastLink = links[links.length - 1];
        if (lastLink && linkText && linkText !== originalSelectedText) {
          lastLink.textContent = linkText;
        }
      }
    }
  } else {
    // No saved range - try to insert at current cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      const link = document.createElement('a');
      link.href = linkUrl;
      link.textContent = linkText || linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      range.insertNode(link);
      
      // Position cursor after the link
      range.setStartAfter(link);
      range.setEndAfter(link);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  
  // Clean up
  window.savedLinkRange = null;
  window.originalSelectedText = null;
  
  // Close modal
  closeLinkModal();
  
  // Trigger update if available
  const noteentry = document.querySelector('.noteentry');
  if (noteentry && typeof update === 'function') {
    update();
  }
}

// Make functions globally available
window.closeLinkModal = closeLinkModal;
window.createLinkFromModal = createLinkFromModal;

function toggleRedColor() {
  document.execCommand('styleWithCSS', false, true);
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let allRed = true, hasText = false;
    const treeWalker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
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
        let color = '';
        if (parent && parent.style && parent.style.color) color = parent.style.color.replace(/\s/g, '').toLowerCase();
        if (color !== '#ff2222' && color !== 'rgb(255,34,34)') allRed = false;
      }
      node = treeWalker.nextNode();
    }
    if (hasText && allRed) {
      document.execCommand('foreColor', false, 'black');
    } else {
      document.execCommand('foreColor', false, '#ff2222');
    }
  }
  document.execCommand('styleWithCSS', false, false);
}

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

/**
 * Insert a checklist (list of checkboxes) at the current cursor position inside the noteentry.
 * Creates a <ul class="checklist"> with one <li><label><input type="checkbox"> Item</label></li>
 */
function insertChecklist() {
  // Insert a single simple line with a checkbox and an editable span at the caret
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');
  if (!noteentry) return;

  const line = document.createElement('div');
  line.className = 'checkline';
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'true');
  span.className = 'checkline-text';
  // small spacer text node
  const spacer = document.createTextNode('\u00A0');
  label.appendChild(checkbox);
  label.appendChild(spacer);
  label.appendChild(span);
  line.appendChild(label);

  // Insert node at current range
  try {
    if (!range.collapsed) range.deleteContents();
    range.insertNode(line);
  } catch (err) {
    // fallback: append at the end of note
    noteentry.appendChild(line);
  }

  // Attach listeners to mark note modified
  if (!checkbox._checkboxListenerAttached) {
    checkbox.addEventListener('change', function() { if (typeof update === 'function') update(); });
    checkbox._checkboxListenerAttached = true;
  }
  span.addEventListener('input', function() { if (typeof update === 'function') update(); });

  // Move caret into span
  setTimeout(function() {
    const r = document.createRange();
    r.selectNodeContents(span);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    span.focus();
  }, 20);
}

// Expose to global scope for inline onclick handlers
window.insertChecklist = insertChecklist;

// Consolidated keydown handler for both checkline and checklist Enter behaviors
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return; // allow newline with Shift+Enter

  // Try to locate the editable span from selection
  let selNode = (window.getSelection && window.getSelection().anchorNode) || null;
  if (!selNode) return;
  const nodeElement = selNode.nodeType === 3 ? selNode.parentElement : selNode;
  if (!nodeElement || !nodeElement.closest) return;

  // Check for simplified checkline (single-line checkbox + span)
  const checklineSpan = nodeElement.closest('.checkline-text');
  const checklineDiv = checklineSpan && checklineSpan.closest('.checkline');

  // Check for checklist (ul/li structure)
  let checklistSpan = null, itemLi = null, ul = null;
  if (!checklineSpan) {
    checklistSpan = nodeElement.closest('span[contenteditable]');
    itemLi = checklistSpan && checklistSpan.closest('li');
    ul = checklistSpan && checklistSpan.closest('ul.checklist');
  }

  // Handle simplified checkline
  if (checklineSpan && checklineDiv) {
    // If the span is empty (placeholder shown), insert a normal empty line instead of a new checkbox item
    const spanText = (checklineSpan.textContent || '').replace(/\u00A0/g, '').trim();
    if (spanText === '') {
      e.preventDefault();
      // Replace the empty checkline with a normal empty line (no checkbox)
      const normalLine = document.createElement('div');
      normalLine.innerHTML = '<br>';
      const parent = checklineDiv.parentNode;
      if (parent) {
        try {
          parent.replaceChild(normalLine, checklineDiv);
        } catch (err) {
          // Fallback to insert/remove if replaceChild fails
          if (checklineDiv.nextSibling) parent.insertBefore(normalLine, checklineDiv.nextSibling);
          else parent.appendChild(normalLine);
          try { parent.removeChild(checklineDiv); } catch (e) {}
        }
      }
      // Move caret into the normal line
      setTimeout(function() {
        const r = document.createRange();
        r.selectNodeContents(normalLine);
        r.collapse(true);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        normalLine.focus && normalLine.focus();
        if (typeof update === 'function') update();
      }, 20);
      return;
    }

    e.preventDefault();

    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Build new simple line
    const newLine = document.createElement('div');
    newLine.className = 'checkline';
    const newLabel = document.createElement('label');
    const newCheckbox = document.createElement('input');
    newCheckbox.type = 'checkbox';
    const spacer = document.createTextNode('\u00A0');
    const newSpan = document.createElement('span');
    newSpan.setAttribute('contenteditable', 'true');
    newSpan.className = 'checkline-text';
    newLabel.appendChild(newCheckbox);
    newLabel.appendChild(spacer);
    newLabel.appendChild(newSpan);
    newLine.appendChild(newLabel);

    // If caret is not at end, move trailing content into new span
    try {
      const caretAtEnd = (range.endContainer.nodeType === 3 && range.endOffset === range.endContainer.length && checklineSpan.contains(range.endContainer)) || (range.endContainer === checklineSpan && range.endOffset === checklineSpan.childNodes.length);
      if (!caretAtEnd) {
        const tailRange = document.createRange();
        tailRange.setStart(range.endContainer, range.endOffset);
        tailRange.setEndAfter(checklineSpan);
        const frag = tailRange.extractContents();
        newSpan.appendChild(frag);
      }
    } catch (err) {
      // ignore
    }

    // Insert new line after current
    if (checklineDiv.nextSibling) checklineDiv.parentNode.insertBefore(newLine, checklineDiv.nextSibling);
    else checklineDiv.parentNode.appendChild(newLine);

    // Attach listeners
    if (!newCheckbox._checkboxListenerAttached) {
      newCheckbox.addEventListener('change', function() { if (typeof update === 'function') update(); });
      newCheckbox._checkboxListenerAttached = true;
    }
    newSpan.addEventListener('input', function() { if (typeof update === 'function') update(); });

    // Focus new span
    setTimeout(function() {
      const r = document.createRange();
      r.selectNodeContents(newSpan);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      newSpan.focus();
      if (typeof update === 'function') update();
    }, 20);
    return;
  }

  // Handle checklist (ul/li structure)
  if (checklistSpan && itemLi && ul) {
    // If the checklist span is empty, remove the current li and insert a normal line after the list
    const checklistText = (checklistSpan.textContent || '').replace(/\u00A0/g, '').trim();
    if (checklistText === '') {
      e.preventDefault();
      const normalLine = document.createElement('div');
      normalLine.innerHTML = '<br>';
      const listParent = ul.parentNode;
      if (listParent) {
        if (ul.nextSibling) listParent.insertBefore(normalLine, ul.nextSibling);
        else listParent.appendChild(normalLine);
      }
      // Remove the empty li
      try { itemLi.parentNode.removeChild(itemLi); } catch (err) {}
      // If the ul has no more li children, remove the ul entirely
      try {
        if (!ul.querySelector || !ul.querySelector('li')) {
          ul.parentNode.removeChild(ul);
        }
      } catch (err) {}
      // Focus the normal line
      setTimeout(function() {
        const r = document.createRange();
        r.selectNodeContents(normalLine);
        r.collapse(true);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        normalLine.focus && normalLine.focus();
        if (typeof update === 'function') update();
      }, 20);
      return;
    }

    e.preventDefault();

    // Get current selection/range
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // Prepare new li structure
    const newLi = document.createElement('li');
    const newLabel = document.createElement('label');
    const newCheckbox = document.createElement('input');
    newCheckbox.type = 'checkbox';
    const spacer = document.createTextNode(' \u00A0');
    const newSpan = document.createElement('span');
    newSpan.setAttribute('contenteditable', 'true');

    newLabel.appendChild(newCheckbox);
    newLabel.appendChild(spacer);
    newLabel.appendChild(newSpan);
    newLi.appendChild(newLabel);

    // Helper: check if caret is at the end of the span
    function isCaretAtEndOf(node, range) {
      // If caret is in a text node inside span
      if (range.endContainer.nodeType === 3) {
        return range.endOffset === range.endContainer.length && node === range.endContainer.parentElement.closest('span[contenteditable]') || node.contains(range.endContainer) && range.endOffset === range.endContainer.length;
      }
      // If caret is the span element itself
      if (range.endContainer === node) {
        return range.endOffset === node.childNodes.length;
      }
      // Fallback: if span contains endContainer and offset equals length of that container
      if (node.contains(range.endContainer)) {
        if (range.endContainer.nodeType === 1) return range.endOffset === range.endContainer.childNodes.length;
      }
      return false;
    }

    const caretAtEnd = isCaretAtEndOf(checklistSpan, range);

    if (!caretAtEnd) {
      // If caret not at end, attempt to move trailing content into new span
      try {
        const tailRange = document.createRange();
        tailRange.setStart(range.endContainer, range.endOffset);
        tailRange.setEndAfter(checklistSpan);
        const fragment = tailRange.extractContents();
        newSpan.appendChild(fragment);
      } catch (err) {
        // ignore and leave newSpan empty
      }
    }

    // Insert new li after current li
    if (itemLi.nextSibling) ul.insertBefore(newLi, itemLi.nextSibling);
    else ul.appendChild(newLi);

    // Attach change listener to the new checkbox
    if (!newCheckbox._checkboxListenerAttached) {
      newCheckbox.addEventListener('change', function() { if (typeof update === 'function') update(); });
      newCheckbox._checkboxListenerAttached = true;
    }

    // Move caret to the new span
    setTimeout(function() {
      const newRange = document.createRange();
      newRange.selectNodeContents(newSpan);
      newRange.collapse(true);
      const newSel = window.getSelection();
      newSel.removeAllRanges();
      newSel.addRange(newRange);
      newSpan.focus();
      if (typeof update === 'function') update();
    }, 20);
    return;
  }
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

// Ensure all toolbar functions are available in global scope
window.addLinkToNote = addLinkToNote;
window.toggleRedColor = toggleRedColor;
window.toggleYellowHighlight = toggleYellowHighlight;
window.changeFontSize = changeFontSize;
window.toggleCodeBlock = toggleCodeBlock;
window.toggleInlineCode = toggleInlineCode;
window.toggleEmojiPicker = toggleEmojiPicker;
window.insertEmoji = insertEmoji;
