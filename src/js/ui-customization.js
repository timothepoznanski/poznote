/**
 * UI Customization runtime
 * Loads hidden UI settings, applies CSS-based hiding, and exposes state for JS-driven UI.
 */
(function () {
    'use strict';

    var NON_HIDEABLE_UI_KEYS = {
        'card:check-updates-card': true,
        'card:github-card': true,
        'card:home-support-card': true,
        'card:version-card': true,
        'card:website-card': true
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
        'btn-text-height': 'format',
        'btn-code': 'format',
        'btn-inline-code': 'format',
        'btn-eraser': 'format',
        'btn-search-replace': 'action',
        'btn-checklist': 'action',
        'btn-favorite': 'action',
        'btn-share': 'action',
        'btn-attachment': 'action',
        'btn-reminder': 'action',
        'btn-open-new-tab': 'action',
        'btn-duplicate': 'action',
        'btn-move': 'action',
        'btn-create-linked-note': 'action',
        'btn-download': 'action',
        'btn-convert': 'action',
        'btn-trash': 'action',
        'btn-info': 'action'
    };

    var CREATE_MODAL_OPTION_SELECTORS = {
        'card:create-note-card': '.create-note-option[data-type="html"]',
        'card:create-markdown-note-card': '.create-note-option[data-type="markdown"]',
        'card:create-task-list-card': '.create-note-option[data-type="list"]',
        'card:create-linked-note-card': '.create-note-option[data-type="linked"]',
        'card:create-template-card': '.create-note-option[data-type="template"]',
        'card:create-folder-card': '.create-note-option[data-type="folder"]',
        'card:create-subfolder-card': '.create-note-option[data-type="subfolder"]',
        'card:create-kanban-card': '.create-note-option[data-type="kanban"]',
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

    function sanitizeHiddenKeys(hidden) {
        if (!Array.isArray(hidden)) {
            return [];
        }

        return hidden.filter(function (key) {
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
            },
            usesFolderIconKanban: function () {
                return !hiddenKeyMap['panel:folder-icon-kanban'];
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

    function syncFolderIconClickBehavior() {
        var config = window.PoznoteUiCustomization;
        var usesFolderIconKanban = !config || typeof config.usesFolderIconKanban !== 'function'
            ? true
            : config.usesFolderIconKanban();

        var folderIcons = document.querySelectorAll('.folder-list-click-action[data-folder-id]');
        folderIcons.forEach(function (icon) {
            icon.setAttribute('data-action', usesFolderIconKanban ? 'open-kanban-view' : 'open-folder-icon-picker');

            var title = usesFolderIconKanban
                ? icon.getAttribute('data-kanban-title')
                : icon.getAttribute('data-change-icon-title');

            if (title) {
                icon.setAttribute('title', title);
            }
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
                isVisibleElement
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

    function syncFolderActionToggles() {
        var menus = document.querySelectorAll('.folder-actions-menu');

        menus.forEach(function (menu) {
            var toggle = menu.previousElementSibling;
            if (!toggle || !toggle.classList.contains('folder-actions-toggle')) return;

            var actionsContainer = toggle.parentElement;

            var visibleItems = Array.prototype.some.call(
                Array.prototype.filter.call(menu.children, function (child) {
                    return child.classList && child.classList.contains('folder-actions-menu-item');
                }),
                isVisibleElement
            );

            if (!visibleItems) {
                toggle.style.display = 'none';
                menu.classList.remove('show');
                if (actionsContainer && actionsContainer.classList.contains('folder-actions')) {
                    actionsContainer.style.display = 'none';
                }
            } else {
                toggle.style.display = '';
                if (actionsContainer && actionsContainer.classList.contains('folder-actions')) {
                    actionsContainer.style.display = '';
                }
            }
        });
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

    function syncSettingsAdminToolsSection() {
        syncSectionVisibility('admin-tools', 'admin-tools-grid');
    }

    function scheduleVisibilitySync() {
        if (syncScheduled) return;

        syncScheduled = true;
        window.requestAnimationFrame(function () {
            syncScheduled = false;
            syncToolbarFormattingVisibility();
            syncFolderIconClickBehavior();
            syncToolbarOverflowButtons();
            syncFolderActionToggles();
            syncHomeDashboardSection();
            syncHomeActionsSection();
            syncSettingsActionsSection();
            syncSettingsDisplaySection();
            syncSettingsAdminToolsSection();
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

                    if (CREATE_MODAL_OPTION_SELECTORS[key]) {
                        rules.push('#createModal ' + CREATE_MODAL_OPTION_SELECTORS[key] + ' { display: none !important; }');
                    }
                } else if (type === 'toolbar') {
                    rules.push('.note-edit-toolbar .' + id + ' { display: none !important; }');
                    rules.push('.mobile-toolbar-menu [data-selector=".' + id + '"] { display: none !important; }');
                } else if (type === 'folder') {
                    rules.push('.folder-actions-menu-item[data-action="' + id + '"] { display: none !important; }');
                    if (id === 'toggle-sort-submenu') {
                        rules.push('.sort-submenu { display: none !important; }');
                    }
                } else if (type === 'panel') {
                    if (id === 'mini-calendar') {
                        rules.push('.mini-calendar-container { display: none !important; }');
                    } else if (id === 'outline-panel') {
                        rules.push('#outline-panel { display: none !important; }');
                        rules.push('#outlineResizeHandle { display: none !important; }');
                        rules.push('#outlineMobileBackdrop { display: none !important; }');
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
