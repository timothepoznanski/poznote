// Note toolbar kept on one line (css/toolbar.css).
//
// The buttons that do not fit, keeping a margin on each side, leave the row
// from the end and are listed in a menu instead: the ⋮ menu when it is shown
// (note actions), otherwise a "…" button added for it (the formatting buttons
// of a selection, where ⋮ is hidden). An entry clicks the hidden button
// through the ⋮ menu's own trigger-mobile-action (js/toolbar-tables.js), so
// every button keeps its handler. A popup anchored on a button in a menu opens
// under the menu button instead (getToolbarButtonRect).
//
// The toolbar clips what overflows it, so a menu opened from it is placed
// with position: fixed under its button (positionToolbarDropdown).

(function () {
  'use strict';

  var EDGE_MARGIN = 16;             // px kept free on each side of the row
  var OVERFLOWED = 'is-toolbar-overflowed';
  var ITEM = 'toolbar-overflow-item';
  var t = function (key, fallback) {
    return typeof window.t === 'function' ? window.t(key, null, fallback) : fallback;
  };

  var tracked = new WeakSet();
  var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  var queued = new Set();

  // Takes room in the row: the ⋮ wrapper is empty while its button hides
  function isShown(el) {
    return !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
  }

  function outerWidth(el) {
    var style = getComputedStyle(el);
    return el.getBoundingClientRect().width + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  }

  // Buttons that may leave the row: the plain ones. Wrappers (⋮, "…", the
  // task list actions with their menu) and the absolute Back / Forward stay.
  function isMovable(el) {
    return el.classList.contains('toolbar-btn') && !el.classList.contains('btn-history-nav');
  }

  function ensureOverflowAnchor(toolbar) {
    var anchor = toolbar.querySelector(':scope > .toolbar-overflow-anchor');
    if (anchor) return anchor;

    anchor = document.createElement('div');
    anchor.className = 'toolbar-overflow-anchor';
    anchor.hidden = true;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-btn btn-toolbar-overflow';
    button.title = t('editor.toolbar.more', 'More');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<i class="lucide lucide-more-horizontal"></i>';
    var menu = document.createElement('div');
    menu.className = 'dropdown-menu toolbar-overflow-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    anchor.appendChild(button);
    anchor.appendChild(menu);

    // Keep the note selection: the formatting buttons act on it
    anchor.addEventListener('mousedown', function (e) { e.preventDefault(); });
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) openOverflowMenu(anchor); else closeOverflowMenu(anchor);
    });
    // An entry runs its action through the document handler, after this
    menu.addEventListener('click', function (e) {
      if (e.target.closest('.dropdown-item')) closeOverflowMenu(anchor);
    });

    var menuAnchor = toolbar.querySelector(':scope > .toolbar-menu-anchor');
    toolbar.insertBefore(anchor, menuAnchor || null);
    return anchor;
  }

  function openOverflowMenu(anchor) {
    var button = anchor.querySelector('.btn-toolbar-overflow');
    var menu = anchor.querySelector('.toolbar-overflow-menu');
    window.positionToolbarDropdown(menu, button);
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      document.addEventListener('click', function outside(e) {
        if (!anchor.contains(e.target)) closeOverflowMenu(anchor);
        if (menu.hidden) document.removeEventListener('click', outside, true);
      }, true);
    }, 0);
  }

  function closeOverflowMenu(anchor) {
    var menu = anchor.querySelector('.toolbar-overflow-menu');
    if (menu) menu.hidden = true;
    var button = anchor.querySelector('.btn-toolbar-overflow');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function menuEntry(button) {
    var key = Array.prototype.find.call(button.classList, function (cls) {
      return cls.indexOf('btn-') === 0;
    });
    if (!key) return null;
    var entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'dropdown-item mobile-toolbar-item ' + ITEM;
    entry.setAttribute('role', 'menuitem');
    entry.setAttribute('data-action', 'trigger-mobile-action');
    entry.setAttribute('data-selector', '.' + key);
    var icon = button.querySelector('i');
    if (icon) entry.appendChild(icon.cloneNode(false));
    entry.appendChild(document.createTextNode(' ' + (button.getAttribute('title') || button.getAttribute('aria-label') || '')));
    return entry;
  }

  function layout(toolbar) {
    // Not displayed (another view): measured again once it shows
    if (!toolbar.isConnected || !toolbar.clientWidth) return;
    var anchor = ensureOverflowAnchor(toolbar);
    var overflowMenu = anchor.querySelector('.toolbar-overflow-menu');
    var moreMenu = toolbar.querySelector(':scope > .toolbar-menu-anchor .mobile-toolbar-menu');

    // Back to every button in the row
    Array.prototype.forEach.call(toolbar.querySelectorAll('.' + OVERFLOWED), function (el) {
      el.classList.remove(OVERFLOWED);
    });
    Array.prototype.forEach.call(toolbar.querySelectorAll('.' + ITEM), function (el) { el.remove(); });
    anchor.hidden = true;

    var style = getComputedStyle(toolbar);
    var gap = parseFloat(style.columnGap) || 0;
    var reserve = EDGE_MARGIN;
    Array.prototype.forEach.call(toolbar.querySelectorAll(':scope > .btn-history-nav'), function (nav) {
      if (isShown(nav)) reserve = Math.max(reserve, nav.getBoundingClientRect().width + 6);
    });
    var available = toolbar.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - 2 * reserve;

    var inRow = Array.prototype.filter.call(toolbar.children, function (el) {
      return isShown(el) && getComputedStyle(el).position !== 'absolute';
    });
    var total = inRow.reduce(function (sum, el) { return sum + outerWidth(el); }, 0) + gap * Math.max(0, inRow.length - 1);
    if (total <= available + 0.5) {
      closeOverflowMenu(anchor);
      return;
    }

    // The ⋮ button takes the extra entries when it is there, "…" otherwise
    var moreButton = toolbar.querySelector(':scope > .toolbar-menu-anchor .mobile-more-btn');
    var useMoreMenu = !!(moreMenu && isShown(moreButton));
    if (!useMoreMenu) {
      anchor.hidden = false;
      inRow.push(anchor);
    }

    var fixed = inRow.filter(function (el) { return !isMovable(el); });
    var budget = available - fixed.reduce(function (sum, el) { return sum + outerWidth(el) + gap; }, 0);
    var used = 0;
    var overflowing = false;
    var moved = [];
    inRow.forEach(function (el) {
      if (!isMovable(el)) return;
      var width = outerWidth(el) + gap;
      if (!overflowing && used + width <= budget + 0.5) {
        used += width;
        return;
      }
      overflowing = true;
      moved.push(el);
    });

    var target = useMoreMenu ? moreMenu : overflowMenu;
    var first = target.firstChild;
    moved.forEach(function (el) {
      el.classList.add(OVERFLOWED);
      var entry = menuEntry(el);
      // The ⋮ menu may already list that button
      if (!entry || (useMoreMenu && target.querySelector('[data-selector="' + entry.getAttribute('data-selector') + '"]:not(.' + ITEM + ')'))) return;
      target.insertBefore(entry, first);
    });
    if (!moved.length) anchor.hidden = true;
  }

  function schedule(toolbar) {
    if (queued.has(toolbar)) return;
    queued.add(toolbar);
    requestAnimationFrame(function () {
      queued.delete(toolbar);
      layout(toolbar);
    });
  }

  // The row changes width, or one of its buttons shows or hides (selection,
  // note state, Element visibility): both resize an observed box
  function onResize(entries) {
    entries.forEach(function (entry) {
      var toolbar = entry.target.classList.contains('note-edit-toolbar')
        ? entry.target
        : entry.target.closest('.note-edit-toolbar');
      if (toolbar) schedule(toolbar);
    });
  }

  function track(toolbar) {
    if (tracked.has(toolbar)) return;
    tracked.add(toolbar);
    if (resizeObserver) {
      resizeObserver.observe(toolbar);
      Array.prototype.forEach.call(toolbar.children, function (child) {
        if (isMovable(child) || child.classList.contains('toolbar-menu-anchor') || child.classList.contains('tasklist-actions-dropdown')) {
          resizeObserver.observe(child);
        }
      });
    }
    schedule(toolbar);
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.classList.contains('note-edit-toolbar')) track(root);
    Array.prototype.forEach.call(root.getElementsByClassName('note-edit-toolbar'), track);
  }

  // The toolbar is rendered again each time a note opens
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes, scan);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) scan(document.body);
  document.addEventListener('DOMContentLoaded', function () { scan(document.body); });
  document.addEventListener('poznote-ui-customization-updated', function () {
    Array.prototype.forEach.call(document.getElementsByClassName('note-edit-toolbar'), schedule);
  });

  window.positionToolbarDropdown = function (menu, trigger) {
    if (!menu || !trigger) return;
    var rect = window.getToolbarButtonRect(trigger);
    menu.style.position = 'fixed';
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    menu.style.left = 'auto';
  };

  // Where a popup of this toolbar button opens: under the button, or under
  // the menu button that lists it while it is out of the row
  window.getToolbarButtonRect = function (button) {
    var rect = button ? button.getBoundingClientRect() : null;
    if (rect && (rect.width || rect.height)) return rect;
    var toolbar = button && button.closest ? button.closest('.note-edit-toolbar') : null;
    var candidates = toolbar ? toolbar.querySelectorAll('.btn-toolbar-overflow, .mobile-more-btn') : [];
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i].getBoundingClientRect();
      if (r.width || r.height) return r;
    }
    return rect || { left: 8, right: 38, top: 8, bottom: 40, width: 30, height: 32 };
  };
})();
