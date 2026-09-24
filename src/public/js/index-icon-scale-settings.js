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
        .innernote .note-title-heading .note-title-icon {
            font-size: ${20 * s}px !important;
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
