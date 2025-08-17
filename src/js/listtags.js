// JavaScript for tags page

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
    
    // Handle excluded folders on page load
    handleExcludedFoldersOnLoad();
});

function handleExcludedFoldersOnLoad() {
    // Check if we need to submit the form with excluded folders to refresh tags
    const excludedFolders = getExcludedFoldersFromLocalStorage();
    
    // Instead of auto-submitting, check if we already have the right data
    // Only submit if URL doesn't contain any POST data indication
    if (excludedFolders.length > 0 && !document.body.dataset.hasExclusions) {
        // Add a small delay to ensure the page is fully loaded
        setTimeout(function() {
            // Create and submit a form to refresh the page with folder exclusions
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = 'listtags.php';
            
            const excludedInput = document.createElement('input');
            excludedInput.type = 'hidden';
            excludedInput.name = 'excluded_folders';
            excludedInput.value = JSON.stringify(excludedFolders);
            form.appendChild(excludedInput);
            
            document.body.appendChild(form);
            form.submit();
        }, 100);
    }
}

function getExcludedFoldersFromLocalStorage() {
    const excludedFolders = [];
    
    // Read excluded folders from localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('folder_search_')) {
            const state = localStorage.getItem(key);
            if (state === 'excluded') {
                const folderName = key.substring('folder_search_'.length);
                excludedFolders.push(folderName);
            }
        }
    }
    
    return excludedFolders;
}

function redirectToTagWithExclusions(tagEncoded) {
    const excludedFolders = getExcludedFoldersFromLocalStorage();
    
    if (excludedFolders.length > 0) {
        // Create a form to post the tag search with excluded folders
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'index.php';
        
        // Add tag search parameter
        const tagInput = document.createElement('input');
        tagInput.type = 'hidden';
        tagInput.name = 'tags_search';
        tagInput.value = decodeURIComponent(tagEncoded);
        form.appendChild(tagInput);
        
        // Add search type parameters
        const searchInTagsInput = document.createElement('input');
        searchInTagsInput.type = 'hidden';
        searchInTagsInput.name = 'search_in_tags';
        searchInTagsInput.value = '1';
        form.appendChild(searchInTagsInput);
        
        // Add excluded folders
        const excludedInput = document.createElement('input');
        excludedInput.type = 'hidden';
        excludedInput.name = 'excluded_folders';
        excludedInput.value = JSON.stringify(excludedFolders);
        form.appendChild(excludedInput);
        
        document.body.appendChild(form);
        form.submit();
    } else {
        // No exclusions, use simple GET redirect
        window.location.href = 'index.php?tags_search_from_list=' + tagEncoded;
    }
}

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
        resultsDiv.textContent = `${count} tag(s) found for "${searchTerm}"`;
    }
}
