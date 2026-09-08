// Toolbar: emoji picker.

function toggleEmojiPicker() {
  const existingPicker = document.querySelector('.emoji-picker');

  if (existingPicker) {
    existingPicker.remove();
    if (window.savedActiveInput && window.savedActiveInput.classList && window.savedActiveInput.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(window.savedActiveInput);
    }
    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
    return;
  }

  // If the cursor is not in an editable note, warn immediately
  // instead of waiting until an emoji is selected.
  if (!isCursorInEditableNote() && !window.savedActiveInput) {
    window.showCursorWarning();
    return;
  }

  // Save current selection so clicking inside the picker doesn't lose the caret.
  try {
    const sel = window.getSelection();
    window.savedRanges.emoji = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  } catch (e) {
    window.savedRanges.emoji = null;
  }

  // Save active input for title support
  // Don't overwrite if already set (e.g., by slash command)
  if (document.activeElement && document.activeElement.classList.contains('css-title')) {
    window.savedActiveInput = document.activeElement;
    // Only save selection if not already saved
    if (!window.savedActiveInputSelection) {
      window.savedActiveInputSelection = {
        start: document.activeElement.selectionStart,
        end: document.activeElement.selectionEnd
      };
    }
  } else if (!window.savedActiveInput) {
    window.savedActiveInput = null;
  }

  // Create emoji popup
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Simplified popular emojis collection
  const emojis = ['😀', '😃', '😄', '😊', '😍', '😘', '😎', '🤔', '😅', '😂', '😢', '😭', '😡', '👍', '👎', '👉', '👌', '✌️', '👏', '🙌', '👋', '🤝', '🙏', '✊', '👊', '❤️', '➜', '🚧', '✅', '🟩', '🟪', '☑️', '❌', '✔️', '❗', '❓', '⭐', '🔥', '💯', '🎯', '📌', '🚀', '💡', '🔔', '⚡', '🌟', '💎', '📱', '💻', '📧', '📁', '📄', '📝', '🔍', '🔑', '⚙️', '🛠️', '📊', '📈', '⚠️', '🚩', '🟢', '🔴', '🔵', '☀️', '🌙', '☕', '🍕', '🎂', '🍎', '🌱', '🌸', '🐱', '🐶', '🎵', '🎨'];

  // Create picker content
  const defaultHint = '💡 On Windows, press <kbd>Win</kbd> + <kbd>;</kbd> to open native emoji picker';
  let content = '<div class="emoji-hint">' + tr('editor.emoji.hint_windows', defaultHint) + '</div>';
  content += '<div class="emoji-category">';
  content += '<div class="emoji-grid">';

  emojis.forEach(emoji => {
    content += `<span class="emoji-item" data-emoji="${emoji}">${emoji}</span>`;
  });

  content += '</div></div>';

  picker.innerHTML = content;

  // Position picker near emoji button
  document.body.appendChild(picker);

  // Position picker with overflow management
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const isMobile = isMobileDevice();

  let anchorRect = null;
  const emojiBtn = document.querySelector('.btn-emoji');
  if (emojiBtn) {
    const rect = emojiBtn.getBoundingClientRect();
    let isVisible = rect.width > 0 && rect.height > 0;
    try {
      const style = window.getComputedStyle(emojiBtn);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) isVisible = false;
    } catch (e) {
        console.debug('toolbar-emoji: toggleEmojiPicker() failed:', e);
    }

    if (isVisible) {
      anchorRect = rect;
    }
  }

  if (!anchorRect) {
    try {
      const range = window.savedRanges.emoji;
      if (range) {
        const rect = range.getBoundingClientRect();
        if (rect && (rect.top || rect.left || rect.bottom || rect.right)) {
          anchorRect = rect;
        } else {
          const rects = range.getClientRects();
          if (rects && rects.length) anchorRect = rects[0];
        }
      }
    } catch (e) {
        console.debug('toolbar-emoji: toggleEmojiPicker() failed:', e);
    }
  }

  // Picker dimensions according to screen
  const pickerWidth = isMobile ? Math.min(300, windowWidth - 40) : 360;
  const pickerHeight = isMobile ? 450 : 550;
  picker.style.position = 'fixed';
  picker.style.width = pickerWidth + 'px';
  picker.style.maxHeight = pickerHeight + 'px';

  if (anchorRect) {
    const rect = anchorRect;
    let top = rect.bottom + 10;
    if (top + pickerHeight > windowHeight - 20) {
      top = rect.top - pickerHeight - 10;
    }
    let left = isMobile ? (windowWidth - pickerWidth) / 2 : rect.left - (pickerWidth / 2) + (rect.width / 2);
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
  } else {
    picker.style.top = ((windowHeight - pickerHeight) / 2) + 'px';
    picker.style.left = ((windowWidth - pickerWidth) / 2) + 'px';
  }
  clampToViewport(picker, 20);

  // Handle emoji clicks. Close through setupPopupDismiss's close function so
  // its document-level listeners are removed; a bare picker.remove() leaves
  // them active and the next click anywhere would wipe the saved input state.
  let closePicker = null;
  picker.addEventListener('click', function (e) {
    if (e.target.classList.contains('emoji-item')) {
      const emoji = e.target.getAttribute('data-emoji');
      insertEmoji(emoji);
      if (closePicker) closePicker(); else picker.remove();
    }
  });

  closePicker = setupPopupDismiss(picker, '.btn-emoji', function () {
    if (window.savedActiveInput && window.savedActiveInput.classList && window.savedActiveInput.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(window.savedActiveInput);
    }
    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
  });
}

function insertEmoji(emoji) {
  // Restore selection saved when opening the picker.
  const sel = window.getSelection();
  try {
    if (window.savedRanges.emoji) {
      sel.removeAllRanges();
      sel.addRange(window.savedRanges.emoji);
    }
  } catch (e) {
      console.debug('toolbar-emoji: insertEmoji() failed:', e);
  }

  // Ensure focus is back on the editor before inserting.
  try {
    if (sel && sel.rangeCount) {
      const rangeForFocus = sel.getRangeAt(0);
      let focusContainer = rangeForFocus.commonAncestorContainer;
      if (focusContainer && focusContainer.nodeType === 3) focusContainer = focusContainer.parentNode;
      const focusTarget = (focusContainer && focusContainer.closest && (focusContainer.closest('.markdown-editor') || focusContainer.closest('[contenteditable="true"]')));
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (e) {
          focusTarget.focus();
        }
      }
    }
  } catch (e) {
      console.debug('toolbar-emoji: focusTarget() failed:', e);
  }

  // Handle input insertion (title and task fields)
  if (window.savedActiveInput) {
    const input = window.savedActiveInput;
    input.focus();

    if (window.savedActiveInputSelection) {
      // Validate selection positions to avoid errors
      const maxLength = input.value.length;
      const safeStart = Math.max(0, Math.min(window.savedActiveInputSelection.start, maxLength));
      const safeEnd = Math.max(safeStart, Math.min(window.savedActiveInputSelection.end, maxLength));
      input.setSelectionRange(safeStart, safeEnd);
    } else {
      // Restore to saved position or end
    }

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.setRangeText(emoji, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (input.classList && input.classList.contains('task-edit-input') && typeof window.resumeTaskEditBlurSave === 'function') {
      window.resumeTaskEditBlurSave(input);
    }

    window.savedRanges.emoji = null;
    window.savedActiveInput = null;
    window.savedActiveInputSelection = null;
    return;
  }

  // Vérifier si le curseur est dans une zone éditable
  if (!isCursorInEditableNote()) {
    window.showCursorWarning();
    window.savedRanges.emoji = null;
    return;
  }

  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;
  const noteentry = container.closest && container.closest('.noteentry');

  if (!noteentry) return;

  // Insert emoji
  document.execCommand('insertText', false, emoji);

  window.savedRanges.emoji = null;

  // Trigger input event
  if (noteentry) {
    noteentry.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Ensure functions are available in global scope
window.insertSeparator = insertSeparator;
