/**
 * list_folders.js
 * Handles folder list page functionality
 */

(function() {
    'use strict';

    const workspace = document.body.getAttribute('data-workspace') || '';

    // Search/filter functionality
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const folderItems = document.querySelectorAll('.folder-item');
    const filterStats = document.getElementById('filterStats');

    if (filterInput) {
        filterInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            let visibleCount = 0;

            folderItems.forEach(item => {
                const name = item.getAttribute('data-folder-name').toLowerCase();
                if (name.includes(query)) {
                    item.style.display = 'flex';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            if (query.length > 0) {
                clearFilterBtn.classList.remove('initially-hidden');
                filterStats.classList.remove('initially-hidden');
                filterStats.textContent = visibleCount + ' ' + (visibleCount > 1 ? 'folders' : 'folder');
            } else {
                clearFilterBtn.classList.add('initially-hidden');
                filterStats.classList.add('initially-hidden');
            }
        });
    }

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input'));
            filterInput.focus();
        });
    }

    // Back buttons
    const backToNotesBtn = document.getElementById('backToNotesBtn');
    if (backToNotesBtn) {
        backToNotesBtn.addEventListener('click', function() {
            window.location.href = 'index.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
        });
    }

    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', function() {
            window.location.href = 'home.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
        });
    }
})();
