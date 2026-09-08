<?php
/**
 * Hiding UI elements and ordering the icon rail, per user and globally.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

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
        // Notifications and AI chat moved from the icon rail to the sidebar header.
        'card:iconSidebarNotificationsBtn' => 'card:sidebarNotificationsBtn',
        'card:iconSidebarAiChatBtn' => 'card:sidebarAiChatBtn',
        // The workspace menu's single "Workspaces" entry became "Edit
        // workspaces" once "New workspace" got its own entry.
        'wsmenu:goto-workspaces' => 'wsmenu:edit-workspaces',
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
                // The (n) after a folder name. !important beats the
                // .hide-folder-counts hover-reveal in css/sidebar.css, which
                // otherwise brings the count back on hover.
                $rules[] = '.folder-note-count { display: none !important; }';
            } elseif ($id === 'outline-panel') {
                $rules[] = '#outline-panel { display: none !important; }';
                $rules[] = '#outlineResizeHandle { display: none !important; }';
                $rules[] = '#outlineMobileBackdrop { display: none !important; }';
            } elseif ($id === 'tasklist-progress') {
                $rules[] = '.tasklist-progress { display: none !important; }';
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
