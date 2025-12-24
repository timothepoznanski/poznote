/**
 * trash-page.js
 * Functionality specific to trash.php page
 */

// Go back to notes with proper workspace handling
function goBackToNotes() {
    // Build return URL with workspace from localStorage
    var url = 'index.php';
    var params = [];
    
    // Get workspace from localStorage first, fallback to PHP value
    try {
        var workspace = localStorage.getItem('poznote_selected_workspace');
        if (!workspace && typeof pageWorkspace !== 'undefined' && pageWorkspace) {
            workspace = pageWorkspace;
        }
        
        if (workspace && workspace !== 'Poznote') {
            params.push('workspace=' + encodeURIComponent(workspace));
        }
    } catch (e) {
        console.error('Error getting workspace:', e);
    }
    
    // Build final URL
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    window.location.href = url;
}

window.goBackToNotes = goBackToNotes;
