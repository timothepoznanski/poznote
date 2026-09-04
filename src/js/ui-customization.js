/**
 * UI Customization runtime
 * Loads hidden UI settings, applies CSS-based hiding, and exposes state for JS-driven UI.
 */
(function () {
    'use strict';

    var NON_HIDEABLE_UI_KEYS = {
        'card:home-support-card': true,
        // Dropped from the UI Customization modal: hiding the whole icon rail or
        // its Settings icon left no way back into the settings page. Listed here
        // so preferences saved before the removal stop applying.
        'card:icon_sidebar': true,
        'card:iconSidebarSettingsBtn': true,
        'card:iconSidebarHomeBtn': true,
        // The folder icon click now always opens the icon/color modal; the
        // old "open Kanban on icon click" toggle no longer exists.
        'panel:folder-icon-kanban': true,
        // The mobile "back to notes" toolbar button is the way back to the
        // note list on small screens, so it is no longer offered for hiding.
        'toolbar:btn-home': true
    };

    var CUSTOMIZABLE_TOOLBAR_BUTTONS = {
        'btn-bold': 'format',
        'btn-italic': 'format',
        'btn-underline': 'format',
        'btn-strikethrough': 'format',
        'btn-link': 'format',
        'btn-color': 'format',
        'btn-highlight': 'format',
        'btn-list-ul': 'format',
        'btn-list-ol': 'format',
        'btn-task-list': 'format',
        'btn-task-remove': 'format',
        'btn-text-height': 'format',
        'btn-code': 'format',
        'btn-inline-code': 'format',
        'btn-eraser': 'format',
        'btn-search-replace': 'action',
        'btn-checklist': 'action',
        'btn-tasklist-actions': 'action',
        'btn-favorite': 'action',
        'btn-publish': 'action',
        'btn-attachment': 'action',
        'btn-reminder': 'action',
        'btn-open-new-tab': 'action',
        'btn-duplicate': 'action',
        'btn-move': 'action',
        'btn-create-linked-note': 'action',
        'btn-download': 'action',
        'btn-convert': 'action',
        'btn-trash': 'action',
        'btn-info': 'action',
        'btn-note-width': 'action',
        'btn-split-view': 'action',
        'btn-audio': 'action'
    };

    var CREATE_MENU_OPTION_SELECTORS = {
        'card:create-note-card': '.create-note-option[data-type="html"]',
        'card:create-markdown-note-card': '.create-note-option[data-type="markdown"]',
        'card:create-task-list-card': '.create-note-option[data-type="list"]',
        'card:create-folder-card': '.create-note-option[data-type="folder"]',
        'card:create-subfolder-card': '.create-note-option[data-type="subfolder"]',
        'card:create-diary-entry-card': '.create-note-option[data-type="diary"]',
        'card:create-workspace-card': '.create-note-option[data-type="workspace"]'
    };

    var syncScheduled = false;
    var observerStarted = false;

    function getInitialHiddenKeys() {
        if (!window.__POZNOTE_HIDDEN_UI_ELEMENTS__ || !Array.isArray(window.__POZNOTE_HIDDEN_UI_ELEMENTS__)) {
            return null;
        }

        return window.__POZNOTE_HIDDEN_UI_ELEMENTS__.slice();
    }

    // Keys renamed after release, so preferences saved under the old name keep
    // working. See poznoteNormalizeHiddenUiKey() in functions.php.
    var RENAMED_UI_KEYS = {
        'toolbar:btn-share': 'toolbar:btn-publish',
        // Notifications and AI chat moved from the icon rail to the sidebar header.
        'card:iconSidebarNotificationsBtn': 'card:sidebarNotificationsBtn',
        'card:iconSidebarAiChatBtn': 'card:sidebarAiChatBtn',
        // The workspace menu's single "Workspaces" entry became "Edit
        // workspaces" once "New workspace" got its own entry.
        'wsmenu:goto-workspaces': 'wsmenu:edit-workspaces'
    };

    function sanitizeHiddenKeys(hidden) {
        if (!Array.isArray(hidden)) {
            return [];
        }

        return hidden
            .map(function (key) {
                return RENAMED_UI_KEYS[key] || key;
            })
            .filter(function (key) {
                return typeof key === 'string' && !NON_HIDEABLE_UI_KEYS[key];
            });
    }

    function publishHiddenKeys(hidden) {
        var hiddenKeyMap = Object.create(null);

        hidden.forEach(function (key) {
            hiddenKeyMap[key] = true;
        });

        window.PoznoteUiCustomization = {
            hiddenKeys: hidden.slice(),
            hiddenKeyMap: hiddenKeyMap,
            isHidden: function (key) {
                return !!hiddenKeyMap[key];
            }
        };

        try {
            document.dispatchEvent(new CustomEvent('poznote-ui-customization-updated', {
                detail: { hiddenKeys: hidden.slice() }
            }));
        } catch (e) {
            // Ignore browsers without CustomEvent support.
        }
    }

    function isVisibleElement(element) {
        if (!element) return false;

        var style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function isToolbarMenuItemVisible(item) {
        if (!item) return false;

        var config = window.PoznoteUiCustomization;
        var hiddenKeyMap = config && config.hiddenKeyMap ? config.hiddenKeyMap : null;

        if (hiddenKeyMap) {
            var selector = item.getAttribute('data-selector');
            if (selector && selector.charAt(0) === '.' && hiddenKeyMap['toolbar:' + selector.slice(1)]) {
                return false;
            }

            var action = item.getAttribute('data-action');
            if (action === 'open-markdown-syntax' && hiddenKeyMap['toolbar:btn-markdown-syntax']) {
                return false;
            }

            if (action === 'show-snapshot' && hiddenKeyMap['toolbar:btn-snapshot']) {
                return false;
            }

            if (action === 'insert-audio-file' && hiddenKeyMap['toolbar:btn-audio']) {
                return false;
            }

            if (action === 'clear-completed-tasks' && hiddenKeyMap['toolbar:btn-clear-completed']) {
                return false;
            }

            if (action === 'uncheck-all-tasks' && hiddenKeyMap['toolbar:btn-uncheck-all']) {
                return false;
            }

            if (action === 'print-note' && hiddenKeyMap['toolbar:btn-print']) {
                return false;
            }
        }

        return isVisibleElement(item);
    }

    function getCustomizableToolbarClass(button) {
        if (!button || !button.classList) return null;

        for (var i = 0; i < button.classList.length; i++) {
            var className = button.classList[i];
            if (CUSTOMIZABLE_TOOLBAR_BUTTONS[className]) {
                return className;
            }
        }

        return null;
    }

    function syncToolbarFormattingVisibility() {
        var toolbars = document.querySelectorAll('.note-edit-toolbar');

        toolbars.forEach(function (toolbar) {
            toolbar.classList.remove('ui-customization-force-formatting-toolbar');
        });
    }

    function syncToolbarOverflowButtons() {
        var toolbars = document.querySelectorAll('.note-edit-toolbar');

        toolbars.forEach(function (toolbar) {
            var anchor = toolbar.querySelector('.toolbar-menu-anchor');
            var moreButton = toolbar.querySelector('.mobile-more-btn');
            var menu = toolbar.querySelector('.mobile-toolbar-menu');
            if (!anchor || !moreButton || !menu) return;

            var visibleButtons = Array.prototype.some.call(
                toolbar.querySelectorAll('.toolbar-btn:not(.mobile-more-btn)'),
                isVisibleElement
            );

            var visibleMenuItems = Array.prototype.some.call(
                menu.querySelectorAll('.dropdown-item'),
                isToolbarMenuItemVisible
            );

            if (!visibleButtons || !visibleMenuItems) {
                anchor.style.display = 'none';
                menu.hidden = true;
                moreButton.setAttribute('aria-expanded', 'false');
            } else {
                anchor.style.display = '';
            }
        });
    }

    function isKeyHidden(key) {
        var config = window.PoznoteUiCustomization;
        return !!(config && config.hiddenKeyMap && config.hiddenKeyMap[key]);
    }

    function syncFolderActionToggles() {
        // Single shared dropdown serves every folder's toggle: when UI
        // customization hides all of its items, hide every toggle.
        var menu = document.getElementById('folder-actions-menu');
        if (!menu) return;

        // The toggle can also be hidden on its own, without touching the menu
        // items. Checked here because this function rewrites the inline
        // display below, which would otherwise undo the generated CSS rule.
        var visibleItems = !isKeyHidden('panel:folder-actions-toggle') &&
            Array.prototype.some.call(
            Array.prototype.filter.call(menu.children, function (child) {
                return child.classList && child.classList.contains('folder-actions-menu-item');
            }),
            isVisibleElement
        );

        if (!visibleItems) {
            menu.classList.remove('show');
        }

        document.querySelectorAll('.folder-actions-toggle').forEach(function (toggle) {
            toggle.style.display = visibleItems ? '' : 'none';
        });
    }

    function syncNoteActionToggles() {
        // Same arrangement as syncFolderActionToggles: one shared dropdown for
        // every note's toggle, so when UI customization hides all of its items
        // the three-dot button has nothing left to open.
        var menu = document.getElementById('note-actions-menu');
        if (!menu) return;

        // Same as folders: the toggle has its own key, and the inline display
        // written below would otherwise beat the generated CSS rule.
        var visibleItems = !isKeyHidden('panel:note-actions-toggle') &&
            Array.prototype.some.call(
            Array.prototype.filter.call(menu.children, function (child) {
                return child.classList && child.classList.contains('note-actions-menu-item');
            }),
            isVisibleElement
        );

        if (!visibleItems) {
            menu.classList.remove('show');
        }

        document.querySelectorAll('.note-actions-toggle').forEach(function (toggle) {
            toggle.style.display = visibleItems ? '' : 'none';
        });

        // Give the note titles back the strip reserved for the toggle.
        if (document.body) {
            document.body.classList.toggle('note-actions-hidden', !visibleItems);
        }
    }

    function syncSectionVisibility(titleId, gridId) {
        var title = document.getElementById(titleId);
        var grid = document.getElementById(gridId);
        if (!title || !grid) return;

        var hasVisibleCards = Array.prototype.some.call(
            grid.querySelectorAll('.home-card'),
            isVisibleElement
        );

        if (!hasVisibleCards) {
            title.style.display = 'none';
            grid.style.display = 'none';
        } else {
            title.style.display = '';
            grid.style.display = '';
        }
    }

    function syncHomeDashboardSection() {
        syncSectionVisibility('home-dashboard-section-title', 'home-dashboard-section-grid');
    }

    function syncHomeActionsSection() {
        syncSectionVisibility('home-actions-section-title', 'home-actions-section-grid');
    }

    function syncSettingsActionsSection() {
        syncSectionVisibility('settings-actions-section-title', 'settings-actions-section-grid');
    }

    function syncSettingsDisplaySection() {
        syncSectionVisibility('display', 'settings-display-section-grid');
    }

    function syncSettingsBehaviorSection() {
        syncSectionVisibility('behavior', 'settings-behavior-section-grid');
    }

    function syncSettingsAdminToolsSection() {
        syncSectionVisibility('admin-tools', 'admin-tools-grid');
    }

    function syncSettingsDocumentationSection() {
        syncSectionVisibility('settings-documentation-section-title', 'settings-documentation-section-grid');
    }

    function scheduleVisibilitySync() {
        if (syncScheduled) return;

        syncScheduled = true;
        window.requestAnimationFrame(function () {
            syncScheduled = false;
            syncToolbarFormattingVisibility();
            syncToolbarOverflowButtons();
            syncFolderActionToggles();
            syncNoteActionToggles();
            syncHomeDashboardSection();
            syncHomeActionsSection();
            syncSettingsActionsSection();
            syncSettingsDisplaySection();
            syncSettingsBehaviorSection();
            syncSettingsAdminToolsSection();
            syncSettingsDocumentationSection();
        });
    }

    function startObserver() {
        if (observerStarted || !document.body || typeof MutationObserver === 'undefined') {
            return;
        }

        observerStarted = true;
        new MutationObserver(scheduleVisibilitySync).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function applyHiddenElements() {
        function applyHiddenKeys(hidden) {
            hidden = sanitizeHiddenKeys(hidden);
            publishHiddenKeys(hidden);

            var rules = [];

            hidden.forEach(function (key) {
                var parts = key.split(':');
                if (parts.length !== 2) return;

                var type = parts[0];
                var id = parts[1];

                if (type === 'card') {
                    if (id === 'ui-customization-card') return;
                    rules.push('#' + id + ' { display: none !important; }');

                    if (CREATE_MENU_OPTION_SELECTORS[key]) {
                        rules.push('#create-menu ' + CREATE_MENU_OPTION_SELECTORS[key] + ' { display: none !important; }');
                    }
                } else if (type === 'toolbar') {
                    rules.push('.note-edit-toolbar .' + id + ', .note-edit-toolbar .' + id + ':not(.hide-on-selection) { display: none !important; }');
                    rules.push('.mobile-toolbar-menu [data-selector=".' + id + '"] { display: none !important; }');
                    if (id === 'btn-markdown-syntax') {
                        rules.push('.mobile-toolbar-menu [data-action="open-markdown-syntax"] { display: none !important; }');
                    } else if (id === 'btn-snapshot') {
                        rules.push('.mobile-toolbar-menu [data-action="show-snapshot"] { display: none !important; }');
                    } else if (id === 'btn-split-view') {
                        rules.push('.note-edit-toolbar .markdown-split-btn, .note-edit-toolbar .markdown-split-btn:not(.hide-on-selection) { display: none !important; }');
                    } else if (id === 'btn-search-replace') {
                        // The selection formatting toolbar has its own copy of the button
                        rules.push('.note-edit-toolbar .btn-search-replace-format, .note-edit-toolbar .btn-search-replace-format.show-on-selection { display: none !important; }');
                    } else if (id === 'btn-tasklist-actions') {
                        rules.push('.tasklist-actions-dropdown { display: none !important; }');
                    } else if (id === 'btn-audio') {
                        rules.push('.mobile-toolbar-menu [data-action="insert-audio-file"] { display: none !important; }');
                    } else if (id === 'btn-clear-completed') {
                        rules.push('.mobile-toolbar-menu [data-action="clear-completed-tasks"] { display: none !important; }');
                    } else if (id === 'btn-uncheck-all') {
                        rules.push('.mobile-toolbar-menu [data-action="uncheck-all-tasks"] { display: none !important; }');
                    } else if (id === 'btn-print') {
                        rules.push('.mobile-toolbar-menu [data-action="print-note"] { display: none !important; }');
                    }
                } else if (type === 'wsmenu') {
                    rules.push('.workspace-menu-item[data-action="' + id + '"] { display: none !important; }');
                } else if (type === 'folder') {
                    rules.push('.folder-actions-menu-item[data-action="' + id + '"] { display: none !important; }');
                    if (id === 'toggle-sort-submenu') {
                        rules.push('.sort-submenu { display: none !important; }');
                    }
                } else if (type === 'note') {
                    // Scoped to the menu: the same data-action values are used by
                    // the note toolbar and by the note icons in the tree, which
                    // this setting must not touch. !important also beats the
                    // inline display populateNoteActionsMenu() sets on the
                    // share/favorite state variants.
                    rules.push('.note-actions-menu-item[data-action="' + id + '"] { display: none !important; }');
                } else if (type === 'panel') {
                    if (id === 'mini-calendar') {
                        rules.push('.mini-calendar-container { display: none !important; }');
                    } else if (id === 'folder-actions-toggle') {
                        rules.push('.folder-actions-toggle { display: none !important; }');
                    } else if (id === 'note-actions-toggle') {
                        rules.push('.note-actions-toggle { display: none !important; }');
                    } else if (id === 'note-created-date') {
                        rules.push('.note-subline { display: none !important; }');
                    } else if (id === 'note-icons') {
                        rules.push('.note-icon { display: none !important; }');
                    } else if (id === 'folder-note-count') {
                        rules.push('.folder-note-count { display: none !important; }');
                    } else if (id === 'outline-panel') {
                        rules.push('#outline-panel { display: none !important; }');
                        rules.push('#outlineResizeHandle { display: none !important; }');
                        rules.push('#outlineMobileBackdrop { display: none !important; }');
                    } else if (id === 'tasklist-progress') {
                        rules.push('.tasklist-progress { display: none !important; }');
                    } else if (id === 'settings-recent-section') {
                        rules.push('#settings-recent-section-title, #settings-recent-section-grid { display: none !important; }');
                    }
                }
            });

            var existingStyle = document.getElementById('ui-customization-styles');
            if (rules.length > 0) {
                if (!existingStyle) {
                    existingStyle = document.createElement('style');
                    existingStyle.setAttribute('id', 'ui-customization-styles');
                    document.head.appendChild(existingStyle);
                }
                existingStyle.textContent = rules.join('\n');
            } else if (existingStyle && existingStyle.parentNode) {
                existingStyle.parentNode.removeChild(existingStyle);
            }

            scheduleVisibilitySync();
            startObserver();
        }

        var initialHiddenKeys = getInitialHiddenKeys();
        if (initialHiddenKeys !== null) {
            applyHiddenKeys(initialHiddenKeys);
            return;
        }

        fetch('/api/v1/settings/hidden_ui_elements', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var hidden = [];
                if (j && j.success && j.value) {
                    try {
                        hidden = JSON.parse(j.value);
                    } catch (e) {
                        hidden = [];
                    }
                }

                applyHiddenKeys(hidden);
            })
            .catch(function () {
                applyHiddenKeys([]);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyHiddenElements);
    } else {
        applyHiddenElements();
    }
})();
