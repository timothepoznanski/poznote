/**
 * note-creation.js
 * Handles creation of different types of notes (markdown, tasklist, etc.)
 */

// Markdown note creation function
function createMarkdownNote() {
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder: window.selectedFolder || window.getPageConfig('selectedFolder'),
        workspace: window.selectedWorkspace || window.getPageConfig('selectedWorkspace') || 'Poznote',
        type: 'markdown'
    });
    
    fetch("api_insert_new.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        try {
            var res = JSON.parse(data);
            if(res.status === 1) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(window.selectedWorkspace || window.getPageConfig('selectedWorkspace') || 'Poznote');
                window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
            } else {
                showNotificationPopup(res.error || (window.t ? window.t('index.errors.create_markdown', null, 'Error creating markdown note') : 'Error creating markdown note'), 'error');
            }
        } catch(e) {
            console.error('Error creating markdown note:', e);
            showNotificationPopup((window.t ? window.t('index.errors.create_markdown_prefix', null, 'Error creating markdown note: ') : 'Error creating markdown note: ') + data, 'error');
        }
    })
    .catch(function(error) {
        console.error('Markdown note creation failed:', error);
        showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
    });
}

window.createMarkdownNote = createMarkdownNote;
