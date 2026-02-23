// Public Folder Theme Toggle
function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    var icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = next === 'dark' ? 'lucide lucide-sun' : 'lucide lucide-moon';
    }
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

document.addEventListener('DOMContentLoaded', function() {
    var html = document.documentElement;
    var icon = document.getElementById('themeIcon');
    if (icon && html.getAttribute('data-theme') === 'dark') {
        icon.className = 'lucide lucide-sun';
    }

    var filterInput = document.getElementById('folderFilterInput');
    var clearFilterBtn = document.getElementById('clearFilterBtn');
    var stats = document.getElementById('folderFilterStats');
    var listItems = Array.prototype.slice.call(document.querySelectorAll('.public-note-item'));
    var emptyMessage = document.getElementById('folderEmptyMessage');
    var noResultsMessage = document.getElementById('folderNoResults');

    if (!filterInput || listItems.length === 0) {
        return;
    }

    function applyFilter() {
        var filterText = filterInput.value.trim().toLowerCase();
        var visibleCount = 0;

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
});
