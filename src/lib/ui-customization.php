<?php
/**
 * Hiding UI elements and ordering the icon rail, per user and globally.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

require_once __DIR__ . '/color-palette.php';

function poznoteGetNonHideableUiKeys() {
    return [
        'card:home-support-card' => true,
        // Dropped from the UI Customization modal: hiding the whole icon rail or
        // its Settings icon left no way back into the settings page. Listed here
        // so preferences saved before the removal stop applying.
        'card:icon_sidebar' => true,
        'card:iconSidebarSettingsBtn' => true,
        'card:iconSidebarHomeBtn' => true,
        // The folder icon click now always opens the icon/color modal; the
        // old "open Kanban on icon click" toggle no longer exists.
        'panel:folder-icon-kanban' => true,
        // The mobile "back to notes" toolbar button is the way back to the
        // note list on small screens, so it is no longer offered for hiding.
        'toolbar:btn-home' => true,
    ];
}

/**
 * UI Customization keys that start out unchecked, instead of the usual
 * "everything visible until the user hides it".
 *
 * The preference itself only ever stores the hidden keys, so a default cannot
 * live in it: an empty list means "nothing hidden". A key listed here is
 * instead written into the user's own hidden_ui_elements once, by the schema
 * bootstrap in db_connect.php, which records what it has already seeded under
 * 'default_hidden_ui_keys_applied' so a user who ticks the box back on is
 * never overridden by a later migration.
 *
 * panel:preview-code-block-delete is the bin button of a code block inside the
 * markdown preview (issue #1406). The preview edits nothing else, and a
 * misclick next to the copy button costs the whole block, so it is off until
 * asked for.
 */
function poznoteGetDefaultHiddenUiKeys() {
    return [
        'panel:preview-code-block-delete',
    ];
}

/**
 * Map UI customization keys that were renamed to the name in use today, so
 * preferences saved under the old key keep working.
 *
 * toolbar:btn-share became toolbar:btn-publish because the AdGuard Social
 * Media list carries an unscoped "##.btn-share" cosmetic rule, which hid the
 * button in every browser running that list.
 */
function poznoteNormalizeHiddenUiKey($key) {
    static $renamed = [
        'toolbar:btn-share' => 'toolbar:btn-publish',
        // Notifications moved from the icon rail to the sidebar header.
        'card:iconSidebarNotificationsBtn' => 'card:sidebarNotificationsBtn',
        // The AI assistant button left the icon rail for the floating stack
        // at the bottom-right of the page (ui_customization_panel.php).
        'card:iconSidebarAiChatBtn' => 'card:edgeAiChatBtn',
        'card:sidebarAiChatBtn' => 'card:edgeAiChatBtn',
        // The workspace menu's single "Workspaces" entry became "Edit
        // workspaces" once "New workspace" got its own entry.
        'wsmenu:goto-workspaces' => 'wsmenu:edit-workspaces',
        // Markdown syntax left the note's ⋮ menu for the "..." menu of the
        // floating stack (ui_customization_panel.php).
        'toolbar:btn-markdown-syntax' => 'card:edgeMenuMarkdownSyntax',
    ];

    return $renamed[$key] ?? $key;
}

function poznoteGetGlobalHiddenUiElements() {
    static $globalHiddenKeys = null;

    if ($globalHiddenKeys !== null) {
        return $globalHiddenKeys;
    }

    $globalHiddenKeys = [];

    try {
        require_once __DIR__ . '/../users/db_master.php';
        if (!function_exists('getGlobalSetting')) {
            return $globalHiddenKeys;
        }
        $rawValue = getGlobalSetting('hidden_ui_elements_global', '[]');
    } catch (Exception $e) {
        return $globalHiddenKeys;
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return $globalHiddenKeys;
    }

    $nonHideable = poznoteGetNonHideableUiKeys();
    $seen = [];
    foreach ($decoded as $key) {
        if (!is_string($key)) {
            continue;
        }

        $key = poznoteNormalizeHiddenUiKey($key);
        if (isset($nonHideable[$key])) {
            continue;
        }

        $seen[$key] = true;
    }

    $globalHiddenKeys = array_keys($seen);
    return $globalHiddenKeys;
}

function poznoteGetEnforcedGlobalHiddenUiElements() {
    // Administrators are exempt from the instance-wide hidden set.
    if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
        return [];
    }

    return poznoteGetGlobalHiddenUiElements();
}

function poznoteGetHiddenUiElements() {
    static $hiddenKeys = null;

    if ($hiddenKeys !== null) {
        return $hiddenKeys;
    }

    // Effective hidden set: admin-enforced (non-admin users) keys merged with
    // the current user's personal preferences.
    $merged = [];
    foreach (poznoteGetEnforcedGlobalHiddenUiElements() as $key) {
        $merged[$key] = true;
    }

    $rawValue = getSetting('hidden_ui_elements', '[]');
    $decoded = json_decode((string)$rawValue, true);
    if (is_array($decoded)) {
        $nonHideable = poznoteGetNonHideableUiKeys();
        foreach ($decoded as $key) {
            if (!is_string($key)) {
                continue;
            }

            $key = poznoteNormalizeHiddenUiKey($key);
            if (isset($nonHideable[$key])) {
                continue;
            }

            $merged[$key] = true;
        }
    }

    $hiddenKeys = array_keys($merged);
    return $hiddenKeys;
}

/**
 * User-chosen order of the icon rail's navigation entries, as a list of the
 * button ids declared in icon_sidebar.php, with POZNOTE_ICON_SIDEBAR_DIVIDER
 * wherever the user placed a separator line.
 *
 * Stored under the 'icon_sidebar_order' user setting by the Icon Sidebar Order
 * card in settings.php. Only the scrolling navigation group is reorderable:
 * the account group at the bottom of the rail (Profile, Settings, About,
 * Logout) is fixed, so a user cannot bury the way back into settings.
 *
 * An empty list means "no preference": icon_sidebar.php then uses its declared
 * order and draws a separator at each change of group. A saved order carries
 * its own separators instead, so a user who arranged the entries their way is
 * not second-guessed by group lines falling between every other button.
 */
function poznoteGetIconSidebarOrder() {
    static $order = null;

    if ($order !== null) {
        return $order;
    }

    $order = [];
    $decoded = json_decode((string)getSetting('icon_sidebar_order', '[]'), true);
    if (is_array($decoded)) {
        $seen = [];
        foreach ($decoded as $id) {
            if (!is_string($id) || $id === '') {
                continue;
            }
            // Separators repeat by nature; only the button ids are deduped.
            if ($id !== POZNOTE_ICON_SIDEBAR_DIVIDER) {
                if (isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
            }
            $order[] = $id;
        }
    }

    return $order;
}

/**
 * Apply a saved order to a list of rail items keyed by their 'id'.
 *
 * Ids the preference does not mention keep their declared position relative to
 * one another and follow the ordered ones, so an entry added by a later release
 * appears at the end rather than vanishing, and a stale id is simply ignored.
 * Each POZNOTE_ICON_SIDEBAR_DIVIDER in the order becomes a ['divider' => true]
 * item at that position; divider items already in $items are dropped, so the
 * saved order is the only source of separators once one is applied (and the
 * function can safely run twice over the same list).
 */
function poznoteApplyIconSidebarOrder(array $items, array $order) {
    if (!$order) {
        return $items;
    }

    $byId = [];
    foreach ($items as $item) {
        if (isset($item['id'])) {
            $byId[$item['id']] = $item;
        }
    }

    $ordered = [];
    $placed = [];
    foreach ($order as $id) {
        if ($id === POZNOTE_ICON_SIDEBAR_DIVIDER) {
            $ordered[] = ['divider' => true];
            continue;
        }
        if (isset($byId[$id]) && !isset($placed[$id])) {
            $placed[$id] = true;
            $ordered[] = $byId[$id];
        }
    }

    foreach ($items as $item) {
        if (!empty($item['divider'])) {
            continue;
        }
        if (!isset($item['id']) || !isset($placed[$item['id']])) {
            $ordered[] = $item;
        }
    }

    return $ordered;
}

/**
 * Keep only well-formed entries of an icon colour map: a key matching
 * $keyPattern mapped to a #rrggbb colour. Anything else is dropped rather than
 * rejected, so a stale or hand-edited value never breaks the page. Colours are
 * lowercased so the colour modal can match its swatches.
 */
function poznoteNormalizeIconColorMap($decoded, $keyPattern) {
    $colors = [];
    if (!is_array($decoded)) {
        return $colors;
    }
    foreach ($decoded as $key => $color) {
        if (!is_string($key) || !preg_match($keyPattern, $key)) {
            continue;
        }
        if (!is_string($color) || !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            continue;
        }
        $colors[$key] = strtolower($color);
        if (count($colors) >= 100) {
            break;
        }
    }
    return $colors;
}

/**
 * Icon rail colours: button ids declared in icon_sidebar.php.
 */
function poznoteNormalizeIconSidebarColors($decoded) {
    return poznoteNormalizeIconColorMap($decoded, '/^[A-Za-z][A-Za-z0-9_-]{0,99}$/');
}

/**
 * Note toolbar colours. The keys end up in CSS selectors, hence the narrow
 * alphabet: a toolbar button class (btn-bold, mobile-more-btn...) or
 * menu-<data-action> for a menu entry that mirrors no toolbar button.
 */
function poznoteNormalizeToolbarIconColors($decoded) {
    return poznoteNormalizeIconColorMap($decoded, '/^[a-z][a-z0-9-]{0,79}$/');
}

/**
 * User-chosen colours of the icon rail's buttons, keyed by button id. Stored
 * under the 'icon_sidebar_colors' user setting by the colour modal of the rail
 * (right-click on a button, or the palette button of the Icon Sidebar Order
 * modal). A button with no entry keeps the rail's own colours.
 */
function poznoteGetIconSidebarColors() {
    static $colors = null;

    if ($colors === null) {
        $colors = poznoteNormalizeIconSidebarColors(json_decode((string)getSetting('icon_sidebar_colors', '{}'), true));
    }

    return $colors;
}

/**
 * The <i> of one rail button (or of its row in the Icon Sidebar Order modal),
 * painted in the button's saved colour when it has one. The colour rides on the
 * icon itself, not the button, because the rail's overflow menu clones the icon
 * element (js/icon-sidebar-toggle.js). css/icon-sidebar.css styles
 * .icon-sidebar-icon-colored; js/icon-sidebar-colors.js keeps it in sync.
 */
function poznoteRenderIconSidebarIcon($iconClass, $id, $extraClass = '') {
    $colors = poznoteGetIconSidebarColors();
    $class = 'lucide ' . $iconClass . ($extraClass !== '' ? ' ' . $extraClass : '');
    $style = '';
    if (isset($colors[$id])) {
        $class .= ' icon-sidebar-icon-colored';
        $style = ' style="--icon-sidebar-icon-color: ' . poznoteIconColorCss($colors[$id]) . ';"';
    }
    return '<i class="' . htmlspecialchars($class, ENT_QUOTES, 'UTF-8') . '"' . $style . '></i>';
}

/**
 * User-chosen colours of the note toolbar's icons (right-click on one, see
 * js/toolbar-icon-colors.js), under the 'toolbar_icon_colors' user setting.
 */
function poznoteGetToolbarIconColors() {
    static $colors = null;

    if ($colors === null) {
        $colors = poznoteNormalizeToolbarIconColors(json_decode((string)getSetting('toolbar_icon_colors', '{}'), true));
    }

    return $colors;
}

/**
 * CSS painting the toolbar colours. Rules rather than inline styles because
 * the toolbar is re-rendered each time a note opens. Mirrors buildRules() in
 * js/toolbar-icon-colors.js, which rewrites the same <style> after a change.
 *
 * A button key paints the toolbar button and the ⋮ menu entry that triggers it
 * (data-selector); a menu-<action> key paints the menu entries with that
 * action. The state colours (favorite, shared, attachments, reminder, pending
 * save, active format) still win: they carry information.
 */
function poznoteBuildToolbarIconColorRules(array $colors) {
    $states = ':not(.is-favorite):not(.is-shared):not(.has-attachments):not(.has-reminder):not(.is-saving):not(.is-format-active):not(.is-edit-mode)';
    $rules = [];
    foreach ($colors as $key => $color) {
        $css = poznoteIconColorCss($color);
        $paint = ' { color: ' . $css . '; background-color: ' . $css . '; }';
        if (strpos($key, 'menu-') === 0) {
            $rules[] = '.note-edit-toolbar .dropdown-item[data-action="' . substr($key, 5) . '"]:not([data-selector]):not(.has-attachments) i' . $paint;
        } else {
            $rules[] = '.note-edit-toolbar .toolbar-btn.' . $key . $states . ' i, .note-edit-toolbar .dropdown-item[data-selector=".' . $key . '"]:not(.has-attachments) i' . $paint;
        }
    }
    return implode("\n", $rules);
}

/**
 * Emitted in index.php's <head>, so the toolbar paints in its colours from the
 * first frame instead of when the deferred bundle runs.
 */
function poznoteRenderToolbarIconColorsBootstrap() {
    $colors = poznoteGetToolbarIconColors();
    echo '<script>window.__POZNOTE_TOOLBAR_ICON_COLORS__ = ' . json_encode((object)$colors, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) . ';</script>' . "\n";
    echo '<style id="toolbar-icon-colors-styles">' . htmlspecialchars(poznoteBuildToolbarIconColorRules($colors), ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</style>' . "\n";
}

/**
 * Drop the separators that would draw nothing useful: one before the first
 * entry, one after the last, or two in a row. Entries the UI Customization
 * modal hides are still in the list here (they are hidden by CSS), so
 * js/icon-sidebar-toggle.js repeats this on the rendered rail.
 */
function poznoteTidyIconSidebarDividers(array $items) {
    $tidy = [];
    foreach ($items as $item) {
        if (empty($item['divider'])) {
            $tidy[] = $item;
            continue;
        }
        if ($tidy && empty($tidy[count($tidy) - 1]['divider'])) {
            $tidy[] = $item;
        }
    }
    if ($tidy && !empty($tidy[count($tidy) - 1]['divider'])) {
        array_pop($tidy);
    }
    return $tidy;
}

function poznoteBuildUiCustomizationRules(array $hiddenKeys) {
    $createMenuOptionSelectors = [
        'card:create-note-card' => '.create-note-option[data-type="html"]',
        'card:create-markdown-note-card' => '.create-note-option[data-type="markdown"]',
        'card:create-task-list-card' => '.create-note-option[data-type="list"]',
        'card:create-folder-card' => '.create-note-option[data-type="folder"]',
        'card:create-subfolder-card' => '.create-note-option[data-type="subfolder"]',
        'card:create-diary-entry-card' => '.create-note-option[data-type="diary"]',
        'card:create-workspace-card' => '.create-note-option[data-type="workspace"]',
    ];

    $rules = [];

    foreach ($hiddenKeys as $key) {
        $parts = explode(':', $key, 2);
        if (count($parts) !== 2) {
            continue;
        }

        [$type, $id] = $parts;

        if ($type === 'card') {
            if ($id === 'ui-customization-card') {
                continue;
            }

            $rules[] = '#' . $id . ' { display: none !important; }';
            if (isset($createMenuOptionSelectors[$key])) {
                $rules[] = '#create-menu ' . $createMenuOptionSelectors[$key] . ' { display: none !important; }';
            }
        } elseif ($type === 'toolbar') {
            $rules[] = '.note-edit-toolbar .' . $id . ', .note-edit-toolbar .' . $id . ':not(.hide-on-selection) { display: none !important; }';
            $rules[] = '.mobile-toolbar-menu [data-selector=".' . $id . '"] { display: none !important; }';
            if ($id === 'btn-snapshot') {
                $rules[] = '.mobile-toolbar-menu [data-action="show-snapshot"] { display: none !important; }';
            } elseif ($id === 'btn-split-view') {
                $rules[] = '.note-edit-toolbar .markdown-split-btn, .note-edit-toolbar .markdown-split-btn:not(.hide-on-selection) { display: none !important; }';
            } elseif ($id === 'btn-tasklist-actions') {
                $rules[] = '.tasklist-actions-dropdown { display: none !important; }';
            } elseif ($id === 'btn-audio') {
                $rules[] = '.mobile-toolbar-menu [data-action="insert-audio-file"] { display: none !important; }';
            } elseif ($id === 'btn-clear-completed') {
                $rules[] = '.mobile-toolbar-menu [data-action="clear-completed-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-uncheck-all') {
                $rules[] = '.mobile-toolbar-menu [data-action="uncheck-all-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-print') {
                $rules[] = '.mobile-toolbar-menu [data-action="print-note"] { display: none !important; }';
            }
        } elseif ($type === 'wsmenu') {
            $rules[] = '.workspace-menu-item[data-action="' . $id . '"] { display: none !important; }';
        } elseif ($type === 'folder') {
            $rules[] = '.folder-actions-menu-item[data-action="' . $id . '"] { display: none !important; }';
            if ($id === 'toggle-sort-submenu') {
                $rules[] = '.sort-submenu { display: none !important; }';
            }
        } elseif ($type === 'panel') {
            if ($id === 'mini-calendar') {
                $rules[] = '.mini-calendar-container { display: none !important; }';
            } elseif ($id === 'folder-actions-toggle') {
                // The ⋮ button on folder rows. The menu itself is shared and
                // stays in the DOM: with no toggle it can no longer be opened.
                $rules[] = '.folder-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-actions-toggle') {
                // The ⋮ button on note rows. body.note-actions-hidden gives the
                // titles back the strip reserved for it (css/tabs.css).
                $rules[] = '.note-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-created-date') {
                // Creation date under the note title. Overrides
                // body.show-note-created in css/notes/subline.css, which the
                // note_display.php markup still sets.
                $rules[] = '.note-subline { display: none !important; }';
            } elseif ($id === 'note-icons') {
                // Icon before the note title, in the sidebar list and in the
                // note header. Both are rendered by renderEditableNoteIcon(),
                // which always emits .note-icon.
                $rules[] = '.note-icon { display: none !important; }';
            } elseif ($id === 'folder-note-count') {
                // The (n) after a folder name, always shown unless hidden here
                // (the legacy hide_folder_counts hover-reveal is gone).
                $rules[] = '.folder-note-count { display: none !important; }';
            } elseif ($id === 'outline-panel') {
                $rules[] = '#outline-panel { display: none !important; }';
                $rules[] = '#outlineResizeHandle { display: none !important; }';
                $rules[] = '#outlineMobileBackdrop { display: none !important; }';
            } elseif ($id === 'tasklist-progress') {
                $rules[] = '.tasklist-progress { display: none !important; }';
            } elseif ($id === 'preview-code-block-delete') {
                // The bin button of a code block in the markdown preview, which
                // the preview has no other use for and which a misclick next to
                // the copy button turns into a lost block (issue #1406). Hidden
                // by default, see poznoteGetDefaultHiddenUiKeys() above. The
                // three buttons are absolutely positioned at fixed right offsets
                // 32px apart (css/code-blocks.css), so the ones that stay slide
                // into the gap rather than leaving it empty.
                $rules[] = '.markdown-preview .code-block-delete-btn { display: none !important; }';
                $rules[] = '.markdown-preview .code-block-copy-btn { right: 8px !important; }';
                $rules[] = '.markdown-preview .code-block-line-numbers-btn { right: 40px !important; }';
            }
        } elseif ($type === 'share') {
            // Share dialog blocks are built in JS. The CSS rule covers pages that
            // do not load the customization runtime (shared.php, workspaces.php);
            // the JS guards keep the hidden controls out of the saved payload.
            if ($id === 'restrict-users') {
                $rules[] = '.share-restrict-users-wrap { display: none !important; }';
            } elseif ($id === 'protocol-toggle') {
                $rules[] = '.share-protocol-wrap { display: none !important; }';
            }
        }
    }

    return implode("\n", $rules);
}

function poznoteRenderUiCustomizationBootstrap() {
    $hiddenKeys = poznoteGetHiddenUiElements();
    $encodedHiddenKeys = json_encode($hiddenKeys, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedHiddenKeys === false) {
        $encodedHiddenKeys = '[]';
    }

    $encodedGlobalHiddenKeys = json_encode(poznoteGetEnforcedGlobalHiddenUiElements(), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedGlobalHiddenKeys === false) {
        $encodedGlobalHiddenKeys = '[]';
    }

    echo '<script>window.__POZNOTE_HIDDEN_UI_ELEMENTS__ = ' . $encodedHiddenKeys . ';window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__ = ' . $encodedGlobalHiddenKeys . ';</script>' . "\n";

    $rules = poznoteBuildUiCustomizationRules($hiddenKeys);
    if ($rules !== '') {
        echo '<style id="ui-customization-styles">' . htmlspecialchars($rules, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</style>' . "\n";
    }
}

/**
 * True when the given UI customization key is hidden for the current user.
 * Used by pages that build share dialogs in JS and read the state from a
 * body data-attribute instead of the customization runtime.
 */
function poznoteIsUiElementHidden($key) {
    return in_array($key, poznoteGetHiddenUiElements(), true);
}
