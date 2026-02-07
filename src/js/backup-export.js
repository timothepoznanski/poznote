/**
 * Backup Export Page JavaScript
 * Handles backup and export functionality
 */

/**
 * Download notes as ZIP file
 */
function startDownload() {
    // Create a direct link to the export script
    window.location.href = 'api_export_entries.php';
}

/**
 * Download structured export as ZIP file
 */
function startStructuredExport() {
    var workspaceSelect = document.getElementById('structuredExportWorkspaceSelect');
    var workspace = workspaceSelect ? workspaceSelect.value : '';
    
    if (workspace) {
        // Create a direct link to the structured export script with workspace parameter
        window.location.href = 'api_export_structured.php?workspace=' + encodeURIComponent(workspace);
    } else {
        // No workspace selected, export all
        window.location.href = 'api_export_structured.php';
    }
}

/**
 * Download attachments as ZIP file
 */
function startAttachmentsDownload() {
    // Create a direct link to the attachments export script
    window.location.href = 'api_export_attachments.php';
}

// Show spinner and disable submit to avoid duplicate requests
function showBackupSpinner() {
    try {
        var spinner = document.getElementById('backupSpinner');
        var btn = document.getElementById('completeBackupBtn');
        if (spinner) {
            spinner.style.display = 'inline-flex';
            spinner.setAttribute('aria-hidden', 'false');
        }
        if (btn) {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
        }
    } catch (e) { /* ignore */ }
}
/**
 * Load workspaces for structured export select
 */
function loadWorkspacesForStructuredExport() {
    var select = document.getElementById('structuredExportWorkspaceSelect');
    if (!select) return;
    
    fetch('/api/v1/workspaces', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success && data.workspaces) {
            select.innerHTML = '';
            
            // Get current workspace from PHP global (no more localStorage)
            var currentWorkspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace : 
                                   (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : '';
            
            // Add each workspace as an option
            data.workspaces.forEach(function(ws) {
                var option = document.createElement('option');
                option.value = ws.name;
                option.textContent = ws.name;
                if (ws.name === currentWorkspace) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            // If no workspace was selected and we have workspaces, select the first one
            if (!currentWorkspace && data.workspaces.length > 0) {
                select.value = data.workspaces[0].name;
            }
        }
    })
    .catch(function(error) {
        console.error('Error loading workspaces:', error);
        select.innerHTML = '<option value="">Error loading workspaces</option>';
    });
}

// Load workspaces when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadWorkspacesForStructuredExport);
} else {
    loadWorkspacesForStructuredExport();
}
// Hide spinner and re-enable submit
function hideBackupSpinner() {
    try {
        var spinner = document.getElementById('backupSpinner');
        var btn = document.getElementById('completeBackupBtn');
        if (spinner) {
            spinner.style.display = 'none';
            spinner.setAttribute('aria-hidden', 'true');
        }
        if (btn) {
            btn.disabled = false;
            btn.setAttribute('aria-disabled', 'false');
        }
    } catch (e) { /* ignore */ }
}

// Attach form listener to show spinner during backup creation
document.addEventListener('DOMContentLoaded', function() {
    try {
        var form = document.getElementById('completeBackupForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                            // Show spinner immediately.
                            showBackupSpinner();

                            // Generate a random token and attach it to the form so server will set a cookie
                            // when the download starts. The JS will poll for that cookie and hide spinner.
                            try {
                                var token = 'dt_' + Math.random().toString(36).substring(2, 11);
                                var existing = document.getElementById('downloadTokenInput');
                                if (existing) existing.parentNode.removeChild(existing);
                                var input = document.createElement('input');
                                input.type = 'hidden';
                                input.name = 'download_token';
                                input.id = 'downloadTokenInput';
                                input.value = token;
                                form.appendChild(input);

                                // Poll for cookie named 'poznote_download_token' and hide spinner when found
                                var pollInterval = 500; // ms
                                var maxPoll = 60000; // 60s
                                var elapsed = 0;
                                var pollTimer = setInterval(function() {
                                    elapsed += pollInterval;
                                    var cookies = document.cookie.split(';').map(function(c){ return c.trim(); });
                                    for (var i = 0; i < cookies.length; i++) {
                                        var parts = cookies[i].split('=');
                                        var name = parts[0];
                                        var value = parts.slice(1).join('=');
                                        if (name === 'poznote_download_token' && value === token) {
                                            // Found matching cookie - hide spinner and cleanup
                                            hideBackupSpinner();
                                            // Remove the cookie by expiring it
                                            document.cookie = 'poznote_download_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                                            clearInterval(pollTimer);
                                            if (fallbackTimer) clearTimeout(fallbackTimer);
                                            return;
                                        }
                                    }
                                    if (elapsed >= maxPoll) {
                                        clearInterval(pollTimer);
                                        hideBackupSpinner();
                                    }
                                }, pollInterval);

                                // As a fallback, re-enable the UI after 30 seconds in case something goes wrong
                                var fallbackTimer = setTimeout(function() {
                                    hideBackupSpinner();
                                }, 30000);
                            } catch (ex) { /* ignore */ }
            });
        }
    } catch (e) { /* ignore */ }
});
