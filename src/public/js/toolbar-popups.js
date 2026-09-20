// Toolbar popups and selection saving.
// 
// Dismiss-on-outside-click behaviour and viewport clamping shared by every toolbar
// popup, plus the saved-range module that remembers where the caret was before the
// toolbar stole focus.

// === Shared popup helpers ===
function setupPopupDismiss(popupEl, triggerBtnSelector, onClose) {
  var animDelay = 200;
  var closed = false;
  function close() {
    if (closed) return;
    closed = true;
    popupEl.classList.remove('show');
    setTimeout(function () { if (popupEl.parentNode) popupEl.remove(); }, animDelay);
    document.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    if (onClose) onClose();
  }
  function outsideHandler(e) {
    if (!popupEl.contains(e.target) && !(triggerBtnSelector && e.target.closest && e.target.closest(triggerBtnSelector))) {
      close();
    }
  }
  function keyHandler(e) {
    if (e.key === 'Escape') close();
  }
  // If the popup was closed before this deferred registration fires, do not
  // install the handler: it would never be removed and would run its cleanup
  // on an unrelated later click.
  setTimeout(function () { if (!closed) document.addEventListener('click', outsideHandler); }, 100);
  document.addEventListener('keydown', keyHandler);
  return close;
}

function clampToViewport(el, margin) {
  margin = margin || 10;
  var vp = window.visualViewport;
  var vpW = vp ? vp.width : window.innerWidth;
  var vpH = vp ? vp.height : window.innerHeight;
  var vpOffL = vp ? vp.offsetLeft : 0;
  var vpOffT = vp ? vp.offsetTop : 0;
  var rect = el.getBoundingClientRect();
  var curL = parseFloat(el.style.left) || rect.left;
  var curT = parseFloat(el.style.top) || rect.top;
  el.style.left = Math.max(vpOffL + margin, Math.min(curL, vpOffL + vpW - rect.width - margin)) + 'px';
  el.style.top = Math.max(vpOffT + margin, Math.min(curT, vpOffT + vpH - rect.height - margin)) + 'px';
}

window.savedRanges = {};

// Clean, popup-only color picker for the toolbar palette button.
// Exposes window.toggleRedColor() which is called from the toolbar button.

(function () {
  'use strict';

  // The swatches of the text colour and highlight pickers, from the theme
  // palette (js/color-palette.js, issue #1408). A value is what gets written
  // into the note, var(--pz-color-red, #dc2626): the colour follows the theme
  // and an export still reads the hex. 'none' removes the colour.
  // A highlight swatch is painted at 65% whatever the theme. That is what
  // yellow applies on a light theme and a little more than the other colours
  // do, but far more than the 25% of a dark theme, where a row at the real
  // strength looked greyed out, as if disabled.
  function paletteSwatches(kind) {
    const palette = window.PoznoteColorPalette;
    const swatches = palette ? palette.colors.map(c => ({
      key: 'colors.' + c.id,
      fallback: c.id.charAt(0).toUpperCase() + c.id.slice(1),
      value: kind === 'highlight' ? palette.highlightColor(c.id) : palette.textColor(c.id),
      swatch: kind === 'highlight'
        ? 'color-mix(in srgb, ' + palette.textColor(c.id) + ' 65%, var(--pz-bg))'
        : ''
    })) : [];
    swatches.push({ key: 'editor.colors.none', fallback: 'None', value: 'none' });
    return swatches;
  }

  // The hex after the comma of a palette value, '' for anything else.
  function paletteFallback(value) {
    const match = /^var\(--pz-color-[a-z]+(?:-soft)?,\s*(#[0-9a-f]{6})\)$/i.exec(String(value || ''));
    return match ? match[1] : '';
  }

  // execCommand only takes a plain colour, so a palette value is applied as
  // its fallback hex and the inline styles it produced are then pointed at the
  // token. Matching on the exact hex is enough: the command has just written
  // it, and a copy of the same hex elsewhere in the note is the same colour.
  function applyPaletteCommand(command, property, value) {
    const hex = paletteFallback(value);
    if (!hex) {
      document.execCommand(command, false, value);
      return;
    }

    document.execCommand(command, false, hex);

    const sel = window.getSelection();
    const anchor = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
    const anchorEl = anchor && anchor.nodeType === 1 ? anchor : (anchor ? anchor.parentElement : null);
    const root = anchorEl ? (anchorEl.closest('.noteentry') || anchorEl.closest('[contenteditable="true"]')) : null;
    if (!root) return;

    const probe = document.createElement('span');
    probe.style[property] = hex;
    const written = probe.style[property];
    let changed = false;

    root.querySelectorAll('[style]').forEach(el => {
      if (el.style[property] === written) {
        el.style[property] = value;
        changed = true;
      }
    });
    // With styleWithCSS unsupported, foreColor falls back to <font color>.
    if (property === 'color') {
      root.querySelectorAll('font[color]').forEach(font => {
        probe.style.color = font.getAttribute('color');
        if (probe.style.color === written) {
          font.removeAttribute('color');
          font.style.color = value;
          changed = true;
        }
      });
    }

    if (changed) {
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Use global translation function from globals.js.
  // Resolve window.t lazily: it may not be defined yet when this script loads.
  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      return window.t(key, null, fallback);
    }
    return fallback || key;
  }

  // Save/restore selection helpers
  function saveSelection(key) {
    key = key || 'color';
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      window.savedRanges[key] = sel.getRangeAt(0).cloneRange();
    } else {
      window.savedRanges[key] = null;
    }
  }

  function restoreSelection(key) {
    key = key || 'color';
    const r = window.savedRanges[key];
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
        console.debug('toolbar-popups: removeInlineColorInRange() failed:', e);
    }
  }

  // The highlight counterpart of removeInlineColorInRange(). hiliteColor with a
  // keyword is not honoured by every browser: where it is ignored the span stays
  // put with its background, so the "None" swatch looked like it did nothing
  // (#1425). Strip the inline background by hand and unwrap the spans that are
  // left with nothing else to say.
  function removeInlineHighlightInRange(range) {
    try {
      const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
      const toClean = [];
      while (walker.nextNode()) {
        const el = walker.currentNode;
        if (!el.style || (!el.style.backgroundColor && !el.style.background)) continue;
        if (range.intersectsNode(el)) toClean.push(el);
      }
      if (!toClean.length) return;

      toClean.forEach(el => {
        el.style.removeProperty('background-color');
        el.style.removeProperty('background');
        if (el.getAttribute('style') === '') el.removeAttribute('style');
        unwrapBareInlineWrapper(el);
      });

      const host = root.closest ? (root.closest('.noteentry') || root.closest('[contenteditable="true"]')) : null;
      if (host) {
        host.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
        // swallow
        console.debug('toolbar-popups: removeInlineHighlightInRange() failed:', e);
    }
  }

  // A <span> or <font> the highlighter left behind once its background is gone
  // carries nothing, so it is unwrapped rather than kept: repeated highlight and
  // unhighlight rounds would otherwise pile empty wrappers into the note.
  function unwrapBareInlineWrapper(el) {
    if (el.tagName !== 'SPAN' && el.tagName !== 'FONT') return;
    if (el.attributes.length) return;
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  // Apply color (or remove it) to the saved selection
  function applyColorToSelection(color) {
    // Check if we're in markdown mode
    if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
      // For markdown, use HTML inline styles
      if (typeof applyMarkdownColor === 'function') {
        // Restore selection first
        restoreSelection();
        if (color === 'none') {
          // Try to remove color - this is tricky, just apply inherit
          applyMarkdownColor('inherit');
        } else {
          applyMarkdownColor(color);
        }
      }
      return;
    }

    // HTML mode - original logic
    // restore selection first
    restoreSelection();

    try {
      // Prefer CSS styling for foreColor
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {
        // ignore
        console.debug('toolbar-popups: applyColorToSelection() failed:', e);
    }

    if (color === 'none') {
      // Try to set to inherit and then remove inline styles where possible
      try {
        document.execCommand('foreColor', false, 'inherit');
      } catch (e) {
          // ignore
          console.debug('toolbar-popups: applyColorToSelection() failed:', e);
      }
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        removeInlineColorInRange(sel.getRangeAt(0));
      }
    } else {
      try {
        applyPaletteCommand('foreColor', 'color', color);
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

  }

  // Remove any existing popup
  function removeExistingPopup() {
    const prev = document.querySelector('.color-palette-popup');
    if (prev) prev.remove();
    window.savedRanges.color = null;
    window.savedRanges.highlight = null;
  }

  // Build popup DOM
  function buildPopup(colors) {
    const popup = document.createElement('div');
    popup.className = 'color-palette-popup';
    const grid = document.createElement('div');
    grid.className = 'color-grid';

    (colors || paletteSwatches('text')).forEach(c => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'color-item';
      item.setAttribute('data-color', c.value);
      item.setAttribute('title', tr(c.key, c.fallback));
      // Visual: a small swatch, the title carries the name. "None" is a
      // "no" sign rather than an empty square, which read as white.
      const sw = document.createElement(c.value === 'none' ? 'i' : 'span');
      if (c.value === 'none') {
        sw.className = 'lucide lucide-ban color-swatch-none';
      } else {
        sw.className = 'color-swatch';
        sw.style.background = c.swatch || c.value;
      }
      sw.setAttribute('aria-hidden', 'true');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(' '));
      grid.appendChild(item);
    });

    popup.appendChild(grid);
    return popup;
  }

  function getViewportBounds() {
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0;
    const top = viewport ? viewport.offsetTop : 0;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height
    };
  }

  function isMobileColorPaletteViewport() {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
    } catch (e) {
      return window.innerWidth <= 800;
    }
  }

  function positionColorPopup(popup, btn) {
    const margin = 8;
    const btnRect = btn ? btn.getBoundingClientRect() : { left: margin, right: margin + 30, bottom: 40, width: 30 };
    const popupRect = popup.getBoundingClientRect();
    const viewport = getViewportBounds();
    const viewportWidth = viewport.right - viewport.left;
    const preferredLeft = isMobileColorPaletteViewport()
      ? viewport.left + ((viewportWidth - popupRect.width) / 2)
      : btnRect.left + (btnRect.width / 2) - (popupRect.width / 2);
    const maxLeft = Math.max(viewport.left + margin, viewport.right - popupRect.width - margin);
    const left = Math.min(Math.max(preferredLeft, viewport.left + margin), maxLeft);
    const top = Math.min(
      Math.max(btnRect.bottom + 8, viewport.top + margin),
      Math.max(viewport.top + margin, viewport.bottom - popupRect.height - margin)
    );

    popup.style.position = 'fixed';
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    const caretX = (btnRect.left + (btnRect.width / 2)) - left;
    popup.style.setProperty('--caret-x', Math.max(8, Math.min(caretX, popupRect.width - 8)) + 'px');
  }

  function getColorTriggerButton(triggerButton, selector) {
    if (triggerButton && triggerButton.classList && triggerButton.classList.contains(selector.slice(1))) {
      return triggerButton;
    }

    const activeElement = document.activeElement;
    if (activeElement && activeElement.classList && activeElement.classList.contains(selector.slice(1))) {
      return activeElement;
    }

    return document.querySelector(selector);
  }

  // Apply a highlight (background) color to the saved selection, or remove it.
  function applyHighlightToSelection(color) {
    // Markdown mode uses the plain-text == wrapping (single style available)
    if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
      if (typeof applyMarkdownHighlight === 'function') {
        restoreSelection('highlight');
        applyMarkdownHighlight(color);
      }
      return;
    }

    // HTML mode
    restoreSelection('highlight');

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {
        // ignore
        console.debug('toolbar-popups: applyHighlightToSelection() failed:', e);
    }

    if (color === 'none') {
      try {
        document.execCommand('hiliteColor', false, 'inherit');
      } catch (e) {
          // ignore
          console.debug('toolbar-popups: applyHighlightToSelection() failed:', e);
      }
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        removeInlineHighlightInRange(sel.getRangeAt(0));
      }
    } else {
      try {
        applyPaletteCommand('hiliteColor', 'backgroundColor', color);
      } catch (e) {
          // ignore
          console.debug('toolbar-popups: applyHighlightToSelection() failed:', e);
      }
    }

    try {
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {
        // ignore
        console.debug('toolbar-popups: applyHighlightToSelection() failed:', e);
    }
  }

  // Generic popup opener shared by the text-color and highlight buttons.
  function openColorPopup(triggerButton, options) {
    try {
      removeExistingPopup();
      saveSelection(options.key);

      const btn = getColorTriggerButton(triggerButton, options.selector);
      const popup = buildPopup(options.colors);
      document.body.appendChild(popup);

      positionColorPopup(popup, btn);

      // show class for CSS transitions
      setTimeout(() => popup.classList.add('show'), 10);

      // Dismiss on outside click / Escape
      const closePopup = setupPopupDismiss(popup, options.selector, function () {
        window.savedRanges[options.key] = null;
      });

      // Click handler
      popup.addEventListener('click', function (e) {
        const btnItem = e.target.closest('.color-item');
        if (!btnItem) return;
        const color = btnItem.getAttribute('data-color');
        options.apply(color);
        closePopup();
      });

    } catch (err) {
        console.debug('toolbar-popups: openColorPopup() failed:', err);
    }
  }

  // Main entry: show text-color popup centered under the palette button
  function toggleRedColor(triggerButton) {
    openColorPopup(triggerButton, {
      key: 'color',
      selector: '.btn-color',
      colors: paletteSwatches('text'),
      apply: applyColorToSelection
    });
  }

  // Main entry: show highlight-color popup centered under the highlight button
  function toggleYellowHighlight(triggerButton) {
    openColorPopup(triggerButton, {
      key: 'highlight',
      selector: '.btn-highlight',
      colors: paletteSwatches('highlight'),
      apply: applyHighlightToSelection
    });
  }

  // Export
  window.toggleRedColor = toggleRedColor;
  window.toggleYellowHighlight = toggleYellowHighlight;
  // Also expose apply helpers in case other scripts call them
  window.applyColorToSelection = applyColorToSelection;
  window.applyHighlightToSelection = applyHighlightToSelection;

})();
