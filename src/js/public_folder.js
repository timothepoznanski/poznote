// Public Folder Theme Toggle
function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    var icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var html = document.documentElement;
    var icon = document.getElementById('themeIcon');
    if (icon && html.getAttribute('data-theme') === 'dark') {
        icon.className = 'fas fa-sun';
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
