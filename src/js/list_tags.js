// JavaScript for tags page
// Requires: navigation.js (for getPageWorkspace, goBackToNotes)

document.addEventListener('DOMContentLoaded', function() {
    // Tag search/filtering management
    const searchInput = document.getElementById('tagsSearchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterTags();
        });
        
        // Also add keyup event for better mobile compatibility
        searchInput.addEventListener('keyup', function() {
            filterTags();
        });
    }
    
    // Attach back button event listener
    const backBtn = document.getElementById('backToNotesBtn');
    if (backBtn) {
        backBtn.addEventListener('click', goBackToNotes);
    }

    // Back to home button
    const backHomeBtn = document.getElementById('backToHomeBtn');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', goBackToHome);
    }
    
    // Attach click listeners to tag items (using event delegation)
    const tagsList = document.getElementById('tagsList');
    if (tagsList) {
        tagsList.addEventListener('click', function(e) {
            const tagItem = e.target.closest('.tag-item');
            if (tagItem && tagItem.dataset.tag) {
                if (typeof window.redirectToTag === 'function') {
                    window.redirectToTag(tagItem.dataset.tag);
                }
            }
        });
    }
    
    // Expose workspace for other scripts (like clickable-tags.js)
    window.pageWorkspace = getPageWorkspace();
});

// folder-exclusion logic removed from tags page

function filterTags() {
    const input = document.getElementById('tagsSearchInput');
    const filter = input.value.toUpperCase();
    const tagsList = document.getElementById('tagsList');
    const tagItems = tagsList.getElementsByClassName('tag-item');
    
    let visibleCount = 0;
    
    for (let i = 0; i < tagItems.length; i++) {
        const tagName = tagItems[i].querySelector('.tag-name');
        if (tagName) {
            const txtValue = tagName.textContent || tagName.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tagItems[i].classList.remove('hidden');
                visibleCount++;
            } else {
                tagItems[i].classList.add('hidden');
            }
        }
    }
    
    // Update results counter
    updateSearchResults(visibleCount, filter);
}

function updateSearchResults(count, searchTerm) {
    let resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'searchResults';
        resultsDiv.className = 'search-results';
        
        const searchContainer = document.querySelector('.tags-search-form');
        searchContainer.appendChild(resultsDiv);
    }
    
    if (searchTerm.trim() === '') {
        resultsDiv.style.display = 'none';
    } else {
        resultsDiv.style.display = 'block';
        const term = String(searchTerm).trim();
        if (count === 1) {
            resultsDiv.textContent = (window.t ? window.t('tags.search.results_one', { count, term }, '1 tag found for "{{term}}"') : `1 tag found for "${term}"`);
        } else {
            resultsDiv.textContent = (window.t ? window.t('tags.search.results_other', { count, term }, '{{count}} tags found for "{{term}}"') : `${count} tags found for "${term}"`);
        }
    }
}
