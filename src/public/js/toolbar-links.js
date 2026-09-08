// Toolbar: link insertion.

// Link insertion functionality
function addLinkToNote() {
  try {
    // Check if we're in markdown mode
    const inMarkdown = typeof isInMarkdownEditor === 'function' && isInMarkdownEditor();

    const sel = window.getSelection();
    const currentRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    const toolbarSavedRange = !currentRange && savedMobileToolbarRange ? savedMobileToolbarRange.cloneRange() : null;
    const activeRange = currentRange || toolbarSavedRange;
    const hasSelection = activeRange && !activeRange.collapsed;
    let selectedText = hasSelection ? getNormalizedRangeText(activeRange) : '';

    // For markdown, handle differently
    if (inMarkdown) {
      const markdownEditor = getMarkdownEditorFromRange(activeRange);
      const markdownOffsets = markdownEditor && activeRange
        ? getRangeOffsetsWithinEditor(markdownEditor, activeRange)
        : null;

      // Check if selection looks like a markdown link
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/;
      const match = selectedText.match(linkPattern);
      
      let existingUrl = 'https://';
      let existingText = selectedText;
      
      if (match) {
        existingText = match[1];
        existingUrl = match[2];
      }

      // Save range for markdown mode too
      window.savedRanges.link = activeRange ? activeRange.cloneRange() : null;

      showLinkModal(existingUrl, existingText, function (url, text) {
        if (url === null) {
          // Remove link - replace with just text
          if (markdownEditor && markdownOffsets) {
            replaceMarkdownRangeByOffsets(markdownEditor, markdownOffsets.start, markdownOffsets.end, existingText);
          } else if (window.savedRanges.link) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(window.savedRanges.link);
            document.execCommand('insertText', false, existingText);
          }
          window.savedRanges.link = null;
          return;
        }

        if (!url) {
          window.savedRanges.link = null;
          return;
        }

        if (markdownEditor) {
          try { markdownEditor.focus({ preventScroll: true }); } catch (e) { markdownEditor.focus(); }
        }

        const linkMarkdown = buildSafeMarkdownLink(text || existingText || url || 'link', url);
        if (!linkMarkdown) {
          if (typeof showNotificationPopup === 'function') {
            showNotificationPopup((window.t || function (key, params, fallback) { return fallback; })('slash_menu.invalid_url', null, 'Invalid URL'), 'error');
          }
          window.savedRanges.link = null;
          return;
        }

        // Apply markdown link syntax
        if (markdownEditor && markdownOffsets) {
          replaceMarkdownRangeByOffsets(markdownEditor, markdownOffsets.start, markdownOffsets.end, linkMarkdown);
        } else if (typeof applyMarkdownLink === 'function') {
          applyMarkdownLink(url, text);
        }

        window.savedRanges.link = null;
      });
      return;
    }

    // HTML mode - original logic
    // Check if the selection is within an existing link
    let existingLink = null;
    let existingUrl = 'https://';

    if (hasSelection && activeRange) {
      const range = activeRange;
      const container = range.commonAncestorContainer;

      // Check if the selection is inside a link element
      if (container.nodeType === Node.TEXT_NODE) {
        existingLink = container.parentElement.closest('a');
      } else if (container.nodeType === Node.ELEMENT_NODE) {
        existingLink = container.closest('a');
      }

      // If we found an existing link, get its URL
      if (existingLink && existingLink.href) {
        existingUrl = existingLink.href;
      }
    }

    // Save the current selection before opening modal to preserve it
    if (hasSelection) {
      window.savedRanges.link = sel.getRangeAt(0).cloneRange();
      window.savedExistingLink = existingLink;
    } else {
      window.savedRanges.link = null;
      window.savedExistingLink = null;
    }

    showLinkModal(existingUrl, selectedText, function (url, text) {
      // If url is null, it means we want to remove the link
      if (url === null) {
        if (window.savedExistingLink) {
          // Remove the link but keep the text content
          const linkText = window.savedExistingLink.textContent;
          const textNode = document.createTextNode(linkText);
          window.savedExistingLink.parentNode.replaceChild(textNode, window.savedExistingLink);

          // Save the note automatically
          const noteentry = document.querySelector('.noteentry');
          if (noteentry && typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately();
          }
        }

        // Clean up
        window.savedRanges.link = null;
        window.savedExistingLink = null;
        return;
      }

      if (!url) return;

      // If we're editing an existing link, just update it
      if (window.savedExistingLink) {
        window.savedExistingLink.href = url;
        if (text) {
          window.savedExistingLink.textContent = text;
        }
      } else {
        // Create a new link element
        const a = document.createElement('a');
        a.href = url;
        a.textContent = text || url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        if (window.savedRanges.link) {
          // Restore the saved selection and replace it with the link
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(window.savedRanges.link);

          // Replace the selected text with the link
          window.savedRanges.link.deleteContents();
          window.savedRanges.link.insertNode(a);

          // Clear selection and position cursor after the link
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStartAfter(a);
          newRange.setEndAfter(a);
          sel.addRange(newRange);
        } else {
          // No saved selection, insert at current cursor position or end of editor
          const sel = window.getSelection();
          if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(a);
            // Position cursor after the link
            range.setStartAfter(a);
            range.setEndAfter(a);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            // Fallback: append to editor
            const noteentry = document.querySelector('.noteentry');
            if (noteentry) {
              noteentry.appendChild(a);
            }
          }
        }
      }

      // Save the note automatically
      const noteentry = document.querySelector('.noteentry');
      if (noteentry && typeof window.saveNoteImmediately === 'function') {
        window.saveNoteImmediately();
      }

      // Clean up saved range and existing link reference
      window.savedRanges.link = null;
      window.savedExistingLink = null;
    });
  } catch (err) {
    console.error('Error in addLinkToNote:', err);
  }
}
