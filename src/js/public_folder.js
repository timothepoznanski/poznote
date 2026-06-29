// Public Folder Theme Toggle

var PUBLIC_THEME_STORAGE_KEY = 'poznote-public-theme';
var PUBLIC_FOLDER_COLLAPSED_STORAGE_PREFIX = 'poznote-public-folder-collapsed:';
var publicFolderCollapsedStateLoaded = false;

function blurAfterPointerActivation(element, event) {
    if (!element || typeof element.blur !== 'function') return;
    if (event && event.detail === 0) return;

    element.blur();
    window.setTimeout(function() {
        if (document.activeElement === element) {
            element.blur();
        }
    }, 0);
}

function normalizePublicTheme(theme) {
    theme = String(theme || '').toLowerCase();
    return theme === 'dark' || theme === 'light' || theme === 'black' ? theme : null;
}

function applyPublicTheme(theme, save) {
    theme = normalizePublicTheme(theme) || 'light';

    var html = document.documentElement;
    var effectiveTheme = theme === 'black' ? 'dark' : theme;
    var isDark = effectiveTheme === 'dark';
    var background = theme === 'black' ? '#141821' : '#252526';

    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    html.style.colorScheme = isDark ? 'dark' : 'light';
    html.style.backgroundColor = isDark ? background : '#ffffff';
    html.classList.toggle('theme-black', theme === 'black');

    if (save) {
        try {
            localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, theme);
        } catch (e) {
            // localStorage not available
        }
    }

    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    var icon = document.getElementById('themeIcon');
    if (icon) {
        var effectiveTheme = theme === 'black' ? 'dark' : theme;
        icon.className = effectiveTheme === 'dark' ? 'lucide lucide-sun' : 'lucide lucide-moon';
    }
}

function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    applyPublicTheme(next, true);
}

// Public Folder View Toggle
function toggleView() {
    var list = document.getElementById('listView');
    var kanban = document.getElementById('kanbanView');
    var toggleBtn = document.getElementById('viewToggle');
    var icon = document.getElementById('viewIcon');
    var body = document.body;
    
    if (list && kanban) {
        var isKanban = list.classList.contains('is-hidden');
        if (isKanban) {
            // Switch to List
            list.classList.remove('is-hidden');
            kanban.classList.add('is-hidden');
            if (icon) icon.className = 'lucide lucide-columns-2';
            if (toggleBtn) toggleBtn.title = body.getAttribute('data-txt-view-kanban') || 'View as Kanban';
            body.classList.remove('view-kanban');
            // Show filter stats if active
            applyFilter();
        } else {
            // Switch to Kanban
            list.classList.add('is-hidden');
            kanban.classList.remove('is-hidden');
            if (icon) icon.className = 'lucide lucide-list';
            if (toggleBtn) toggleBtn.title = body.getAttribute('data-txt-view-notes') || 'View as list';
            body.classList.add('view-kanban');
            // Re-apply filter to kanban cards
            applyFilterToKanban();
        }
    }
}

function applyFilterToKanban() {
    var filterInput = document.getElementById('folderFilterInput');
    if (!filterInput) return;

    var filterText = filterInput.value.trim().toLowerCase();
    var cards = document.querySelectorAll('.kanban-public-card');

    cards.forEach(function(card) {
        var title = card.querySelector('.kanban-card-title').textContent.toLowerCase();
        var isVisible = !filterText || title.indexOf(filterText) !== -1;
        card.style.display = isVisible ? '' : 'none';
    });
}

function getPublicFolderCollapsedStorageKey() {
    var token = document.body ? document.body.getAttribute('data-share-token') : '';
    return PUBLIC_FOLDER_COLLAPSED_STORAGE_PREFIX + (token || window.location.pathname);
}

function loadPublicFolderCollapsedState() {
    if (publicFolderCollapsedStateLoaded) {
        return;
    }
    publicFolderCollapsedStateLoaded = true;

    try {
        var stored = localStorage.getItem(getPublicFolderCollapsedStorageKey());
        var collapsedFolderIds = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(collapsedFolderIds)) {
            return;
        }

        var collapsedLookup = {};
        collapsedFolderIds.forEach(function(folderId) {
            collapsedLookup[String(folderId)] = true;
        });

        getPublicFolderGroups().forEach(function(group) {
            var folderId = group.getAttribute('data-folder-id');
            group.classList.toggle('is-collapsed', !!collapsedLookup[String(folderId)]);
        });
    } catch (e) {
        // localStorage not available
    }
}

function savePublicFolderCollapsedState() {
    try {
        var collapsedFolderIds = getPublicFolderGroups()
            .filter(function(group) {
                return group.classList.contains('is-collapsed');
            })
            .map(function(group) {
                return group.getAttribute('data-folder-id');
            })
            .filter(Boolean);

        localStorage.setItem(getPublicFolderCollapsedStorageKey(), JSON.stringify(collapsedFolderIds));
    } catch (e) {
        // localStorage not available
    }
}

function updatePublicFolderToggle(group) {
    var button = group.querySelector('.public-folder-group-title .public-folder-toggle');
    if (!button) return;

    var body = document.body;
    var isCollapsed = group.classList.contains('is-collapsed');
    var isFilterActive = body.classList.contains('public-folder-filter-active');
    var label = isCollapsed
        ? (body.getAttribute('data-txt-expand-folder') || 'Expand folder')
        : (body.getAttribute('data-txt-collapse-folder') || 'Collapse folder');

    button.setAttribute('aria-expanded', isCollapsed && !isFilterActive ? 'false' : 'true');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = isFilterActive;
    button.classList.toggle('is-disabled', isFilterActive);

    var icon = button.querySelector('.lucide');
    if (icon) {
        icon.className = isCollapsed && !isFilterActive
            ? 'lucide lucide-chevron-right'
            : 'lucide lucide-chevron-down';
    }
}

function updatePublicFolderToggles() {
    document.querySelectorAll('.public-folder-group').forEach(updatePublicFolderToggle);
    updatePublicFolderToggleAll();
}

function getPublicFolderGroups() {
    return Array.prototype.slice.call(document.querySelectorAll('.public-folder-group'));
}

function updatePublicFolderToggleAll() {
    var button = document.getElementById('publicFolderToggleAll');
    if (!button) return;

    var groups = getPublicFolderGroups();
    var body = document.body;
    var isFilterActive = body.classList.contains('public-folder-filter-active');

    if (groups.length === 0) {
        button.style.display = 'none';
        return;
    }

    var hasExpandedFolder = groups.some(function(group) {
        return !group.classList.contains('is-collapsed');
    });
    var shouldCollapse = hasExpandedFolder;
    var label = shouldCollapse
        ? (body.getAttribute('data-txt-collapse-all') || 'Collapse all')
        : (body.getAttribute('data-txt-expand-all') || 'Expand all');

    button.style.display = '';
    button.disabled = isFilterActive;
    button.dataset.action = shouldCollapse ? 'collapse' : 'expand';
    button.classList.toggle('is-disabled', isFilterActive);
    button.setAttribute('aria-label', label);
    button.title = label;

    var icon = button.querySelector('.lucide');
    if (icon) {
        icon.className = shouldCollapse
            ? 'lucide lucide-folder-minus'
            : 'lucide lucide-folder-open';
    }

    var labelEl = button.querySelector('span');
    if (labelEl) {
        labelEl.textContent = label;
    }
}

function bindPublicFolderToggles() {
    document.querySelectorAll('.public-folder-toggle').forEach(function(button) {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();

            if (button.disabled) {
                return;
            }

            var group = button.closest('.public-folder-group');
            if (!group) return;

            group.classList.toggle('is-collapsed');
            savePublicFolderCollapsedState();
            updatePublicFolderToggles();
        });
    });

    var toggleAllButton = document.getElementById('publicFolderToggleAll');
    if (toggleAllButton) {
        toggleAllButton.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();

            if (toggleAllButton.disabled) {
                return;
            }

            var shouldCollapse = toggleAllButton.dataset.action !== 'expand';
            getPublicFolderGroups().forEach(function(group) {
                group.classList.toggle('is-collapsed', shouldCollapse);
            });
            savePublicFolderCollapsedState();
            updatePublicFolderToggles();
            blurAfterPointerActivation(toggleAllButton, event);
        });
    }

    loadPublicFolderCollapsedState();
    updatePublicFolderToggles();
}

function applyFilter() {
    var filterInput = document.getElementById('folderFilterInput');
    var clearFilterBtn = document.getElementById('clearFilterBtn');
    var stats = document.getElementById('folderFilterStats');
    var listItems = Array.prototype.slice.call(document.querySelectorAll('.public-note-item'));
    var emptyMessage = document.getElementById('folderEmptyMessage');
    var noResultsMessage = document.getElementById('folderNoResults');

    if (!filterInput) return;

    var filterText = filterInput.value.trim().toLowerCase();
    var visibleCount = 0;
    document.body.classList.toggle('public-folder-filter-active', !!filterText);

    listItems.forEach(function(item) {
        var title = item.getAttribute('data-title') || '';
        var isVisible = !filterText || title.indexOf(filterText) !== -1;
        item.style.display = isVisible ? '' : 'none';
        if (isVisible) {
            visibleCount += 1;
        }
    });

    // Hide empty folder groups
    var groups = document.querySelectorAll('.public-folder-group');
    groups.forEach(function(group) {
        var groupItems = group.querySelectorAll('.public-note-item');
        var groupHasVisible = false;
        for (var i = 0; i < groupItems.length; i++) {
            if (groupItems[i].style.display !== 'none') {
                groupHasVisible = true;
                break;
            }
        }
        group.style.display = groupHasVisible ? '' : 'none';
    });

    // Also filter Kanban if it exists
    applyFilterToKanban();

    if (filterText) {
        if (clearFilterBtn) {
            clearFilterBtn.style.display = 'flex';
        }
        if (stats) {
            stats.textContent = visibleCount + ' / ' + listItems.length;
            stats.style.display = visibleCount < listItems.length ? 'inline-flex' : 'none';
        }
        if (noResultsMessage) {
            noResultsMessage.classList.toggle('is-hidden', visibleCount !== 0);
        }
        if (emptyMessage) {
            emptyMessage.classList.add('is-hidden');
        }
    } else {
        if (clearFilterBtn) {
            clearFilterBtn.style.display = 'none';
        }
        if (stats) {
            stats.style.display = 'none';
        }
        if (noResultsMessage) {
            noResultsMessage.classList.add('is-hidden');
        }
        if (emptyMessage && listItems.length === 0) {
            emptyMessage.classList.remove('is-hidden');
        }
    }

    updatePublicFolderToggles();
}

document.addEventListener('DOMContentLoaded', function() {
    var html = document.documentElement;
    var savedTheme = null;

    try {
        savedTheme = normalizePublicTheme(localStorage.getItem(PUBLIC_THEME_STORAGE_KEY));
    } catch (e) {
        savedTheme = null;
    }

    if (savedTheme) {
        applyPublicTheme(savedTheme, false);
    } else {
        updateThemeIcon(html.classList.contains('theme-black') ? 'black' : html.getAttribute('data-theme'));
    }

    bindPublicFolderToggles();

    var filterInput = document.getElementById('folderFilterInput');
    var clearFilterBtn = document.getElementById('clearFilterBtn');

    if (!filterInput) {
        return;
    }

    filterInput.addEventListener('input', applyFilter);
    filterInput.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            filterInput.value = '';
            applyFilter();
        }
    });

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.focus();
            applyFilter();
        });
    }

    document.querySelectorAll('.public-note-link, .kanban-public-card').forEach(function(link) {
        bindPwaAwarePublicLink(link);
    });
});
