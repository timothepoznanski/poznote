/**
 * Index icon scale: sizes the icons of the notes page from the per-user
 * 'index_icon_scale' value, which the slider of the settings page writes
 * (Display > Index icon scaling, js/settings-page.js).
 */

// Per-user storage (defined in theme-init.js); falls back to the shared
// localStorage keys on pages loaded without theme-init.js.
const indexIconScaleStore = window.__poznoteUserStorage || window.localStorage;


// Function to apply the scale (index.php only)
function applyIndexIconScale(scale) {
    if (!scale || parseFloat(scale) === 1.0) {
        const styleTag = document.getElementById('index-icon-scale-style');
        if (styleTag) styleTag.remove();
        return;
    }

    let styleTag = document.getElementById('index-icon-scale-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'index-icon-scale-style';
        document.head.appendChild(styleTag);
    }
    
    const s = parseFloat(scale);
    // Boxes that hold a glyph grow with it but never shrink below their base size
    const grow = Math.max(1, s);
    styleTag.innerHTML = `
        /* Sidebar: howto / home / settings / create */
        .sidebar-howto i,
        .sidebar-howto [class*="lucide-"],
        .sidebar-folder-toggle i,
        .sidebar-folder-toggle [class*="lucide-"],
        .sidebar-plus i,
        .sidebar-plus [class*="lucide-"],
        .sidebar-plus .lucide-plus-circle {
            font-size: ${1.0 * s}em !important;
        }

        /* Folder icon */
        #left_col .folder-toggle .folder-icon {
            font-size: ${1.0 * s}em !important;
        }

        /* Note icons */
        #left_col .note-title .note-icon {
            font-size: ${0.85 * s}em !important;
        }
        #left_col .note-title .note-type-icon-inline {
            font-size: ${0.85 * s}em !important;
        }

        /* Other accounts' trees mirror the main tree's folder and note icons */
        #left_col .other-account-row-folder .lucide {
            font-size: ${1.0 * s}em !important;
        }
        #left_col .other-account-row-note .lucide {
            font-size: ${0.85 * s}em !important;
        }

        /* "Expand all folders" on the rule after Favorites: css/sidebar.css
           sizes it through .notes-list-actions, which outranks the plain
           .sidebar-folder-toggle rule above. */
        .notes-list-actions .sidebar-folder-toggle i,
        .notes-list-actions .sidebar-folder-toggle [class*="lucide-"] {
            font-size: ${0.75 * s}em !important;
        }
        /* The same button at the end of the active account's row, where the
           glyph box is pinned in px */
        .current-account-header .sidebar-folder-toggle .lucide {
            width: ${14 * s}px !important;
            height: ${14 * s}px !important;
        }

        /* Three-dot toggles of the folder rows, of the note rows and of the
           view options menu. The boxes only widen: a taller one would make
           the row jump when the toggle appears on hover. */
        #left_col .folder-actions-toggle [class*="lucide-"],
        #left_col .note-actions-toggle [class*="lucide-"],
        #left_col .note-actions-item [class*="lucide-"] {
            font-size: ${0.85 * s}em !important;
        }
        #left_col .folder-actions-toggle,
        #left_col .note-actions-toggle,
        #left_col .note-actions-item {
            width: ${22 * grow}px !important;
        }
        #left_col .notes-list-actions .folder-actions-toggle {
            width: ${16 * grow}px !important;
        }

        /* Entries of the menus those toggles open, and of the create menu
           that shares their look (css/folders/actions-menu.css: a 15px slot) */
        .folder-actions-menu-item i,
        .note-actions-menu-item i,
        .create-menu-item i {
            font-size: ${0.85 * s}em !important;
            width: ${15 * s}px !important;
        }

        /* Search bar: scope toggles on the left, date filter and clear on the
           right. The field makes room for them (css/searchbars.css: 34px
           tall, 64px / 48px / 88px of padding at the default size). */
        .searchbar-type-btn,
        .searchbar-date-toggle i,
        .searchbar-clear .clear-icon {
            font-size: ${16 * s}px !important;
        }
        .searchbar-date-toggle,
        .searchbar-clear {
            width: ${14 + 16 * s}px !important;
            height: ${14 + 16 * s}px !important;
        }
        .searchbar-input {
            height: ${Math.max(34, 18 + 16 * s)}px !important;
            padding-left: ${32 + 32 * s}px !important;
        }
        .searchbar-has-date-toggle .searchbar-input {
            padding-right: ${32 + 16 * s}px !important;
        }
        .searchbar-has-date-toggle .searchbar-clear {
            right: ${32 + 16 * s}px !important;
        }
        .searchbar-has-date-toggle.searchbar-has-clear .searchbar-input {
            padding-right: ${56 + 32 * s}px !important;
        }

        /* Sidebar header: notifications bell. css/sidebar.css sizes it through
           an id selector, so the override has to carry the same id specificity
           or it would stay at its base size. */
        #sidebarNotificationsBtn .lucide {
            font-size: ${0.85 * s}em !important;
        }

        /* Note header actions: change folder, manage note tags, open
           attachments. All three are pinned to 14px in css/notes/tags.css and
           css/notes/attachments-row.css. */
        .lucide-folder.icon_folder,
        .lucide-tag.icon_tag,
        .lucide-paperclip.icon_attachment {
            font-size: ${14 * s}px !important;
        }

        /* Note editor toolbar icons */
        .toolbar-btn {
            min-width: ${38 * s}px !important;
            min-height: ${38 * s}px !important;
        }
        .toolbar-btn i, .toolbar-btn [class*="lucide-"] {
            font-size: ${0.75 * s}em !important;
        }

        /* Entries of the toolbar's menus: the three-dot menu and the "…" menu
           of the buttons that do not fit (js/toolbar-overflow.js). css/menus.css
           gives each icon a 16px slot in a 14px line. */
        .mobile-toolbar-menu .dropdown-item i,
        .toolbar-overflow-menu .dropdown-item i {
            font-size: ${14 * s}px !important;
            width: ${16 * s}px !important;
        }
    `;
}

// Initialize on page load
(function() {
    // Only apply visual scaling on the index layout
    const isIndexLayout = !!(
        document.getElementById('left_col') &&
        document.querySelector('.sidebar-title-actions')
    );
    if (!isIndexLayout) {
        return;
    }

    // 1. Check data attribute (from PHP)
    // 2. Fallback to localStorage
    // 3. Fallback to default 1.0
    let scale = indexIconScaleStore.getItem('index_icon_scale') || '1.0';

    if (parseFloat(scale) !== 1.0) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => applyIndexIconScale(scale));
        } else {
            applyIndexIconScale(scale);
        }
    }
})();
