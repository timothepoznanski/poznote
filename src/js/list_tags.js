// JavaScript for tags page

// Get workspace from data-attribute (set by PHP)
function getPageWorkspace() {
    var body = document.body;
    return body ? body.getAttribute('data-workspace') || '' : '';
}

// Navigate back to notes list
function goBackToNotes() {
    // Build return URL with workspace from localStorage
    var url = 'index.php';
    var params = [];
    var pageWorkspace = getPageWorkspace();
    
    // Get workspace from localStorage first, fallback to PHP value
    try {
        var workspace = localStorage.getItem('poznote_selected_workspace');
        if (!workspace || workspace === '') {
            workspace = pageWorkspace;
        }
        if (workspace && workspace !== '') {
            params.push('workspace=' + encodeURIComponent(workspace));
        }
    } catch(e) {
        // Fallback to PHP workspace if localStorage fails
        if (pageWorkspace && pageWorkspace !== '') {
            params.push('workspace=' + encodeURIComponent(pageWorkspace));
        }
    }
    
    // Build final URL
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    window.location.href = url;
}

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
