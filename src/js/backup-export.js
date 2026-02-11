/**
 * Backup Export Page JavaScript
 * Handles backup and export functionality including:
 * - Exporting notes, attachments, and structured data
 * - Managing download progress with spinner feedback
 * - Loading workspace selection for exports
 */

// ========================================
// Download Functions
// ========================================

/**
 * Download all notes as a ZIP file
 */
function startDownload() {
    window.location.href = 'api_export_entries.php';
}

/**
 * Download structured export (notes with folder structure) as a ZIP file
 * Exports the selected workspace or all workspaces if none selected
 */
function startStructuredExport() {
    var workspaceSelect = document.getElementById('structuredExportWorkspaceSelect');
    var workspace = workspaceSelect ? workspaceSelect.value : '';
    
    if (workspace) {
        window.location.href = 'api_export_structured.php?workspace=' + encodeURIComponent(workspace);
    } else {
        window.location.href = 'api_export_structured.php';
    }
}

/**
 * Download all attachments as a ZIP file
 */
function startAttachmentsDownload() {
    window.location.href = 'api_export_attachments.php';
}

// ========================================
// UI Helper Functions
// ========================================

/**
 * Show loading spinner and disable the backup button to prevent duplicate requests
 */
function showBackupSpinner() {
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
}

/**
 * Hide loading spinner and re-enable the backup button
 */
function hideBackupSpinner() {
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
}

// ========================================
// Workspace Management
// ========================================

/**
 * Load available workspaces into the structured export dropdown
 * Fetches workspaces from API and pre-selects the current workspace
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
            
            // Get current workspace from global variable (set by PHP)
            var currentWorkspace = (typeof window.selectedWorkspace !== 'undefined') ? window.selectedWorkspace : '';
            
            // Populate dropdown with workspace options
            data.workspaces.forEach(function(ws) {
                var option = document.createElement('option');
                option.value = ws.name;
                option.textContent = ws.name;
                if (ws.name === currentWorkspace) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            // If no workspace was pre-selected, select the first one by default
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

// ========================================
// Cookie Helper Functions
// ========================================

/**
 * Get the value of a specific cookie by name
 * @param {string} name - The name of the cookie to retrieve
 * @returns {string|null} The cookie value, or null if not found
 */
function getCookie(name) {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i].trim();
        var parts = cookie.split('=');
        var cookieName = parts[0];
        var cookieValue = parts.slice(1).join('=');
        if (cookieName === name) {
            return cookieValue;
        }
    }
    return null;
}

/**
 * Delete a cookie by name
 * @param {string} name - The name of the cookie to delete
 */
function deleteCookie(name) {
    document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

// ========================================
// Download Progress Tracking
// ========================================

/**
 * Setup download progress tracking using cookies
 * When the server starts the download, it sets a cookie with the download token.
 * This function polls for that cookie to detect when the download has started,
 * then hides the spinner to provide user feedback.
 * 
 * @param {string} token - Unique token to identify this download
 * @returns {object} Object with pollTimer and fallbackTimer for cleanup
 */
function setupDownloadTracking(token) {
    var pollInterval = 500; // Check every 500ms
    var maxPollTime = 60000; // Stop polling after 60 seconds
    var fallbackTimeout = 30000; // Re-enable UI after 30 seconds as safety
    var elapsed = 0;
    
    // Poll for the download cookie
    var pollTimer = setInterval(function() {
        elapsed += pollInterval;
        var cookieValue = getCookie('poznote_download_token');
        
        if (cookieValue === token) {
            // Download has started - cleanup and hide spinner
            hideBackupSpinner();
            deleteCookie('poznote_download_token');
            clearInterval(pollTimer);
            clearTimeout(fallbackTimer);
            return;
        }
        
        // Stop polling after max time
        if (elapsed >= maxPollTime) {
            clearInterval(pollTimer);
            hideBackupSpinner();
        }
    }, pollInterval);
    
    // Fallback timer as a safety measure
    var fallbackTimer = setTimeout(function() {
        hideBackupSpinner();
        clearInterval(pollTimer);
    }, fallbackTimeout);
    
    return { pollTimer: pollTimer, fallbackTimer: fallbackTimer };
}

/**
 * Initialize a download token for tracking
 * Adds a hidden input field with a unique token to the form
 * @param {HTMLFormElement} form - The form to add the token to
 * @returns {string} The generated token
 */
function initializeDownloadToken(form) {
    var token = 'dt_' + Math.random().toString(36).substring(2, 11);
    
    // Remove existing token input if present
    var existing = document.getElementById('downloadTokenInput');
    if (existing) {
        existing.parentNode.removeChild(existing);
    }
    
    // Add new token input
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'download_token';
    input.id = 'downloadTokenInput';
    input.value = token;
    form.appendChild(input);
    
    return token;
}

// ========================================
// Initialization
// ========================================

/**
 * Initialize all page functionality when DOM is ready
 */
function initializePage() {
    // Load workspaces for structured export dropdown
    loadWorkspacesForStructuredExport();
    
    // Setup complete backup form handler
    var form = document.getElementById('completeBackupForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            // Show spinner immediately
            showBackupSpinner();
            
            // Setup download tracking with cookie polling
            var token = initializeDownloadToken(form);
            setupDownloadTracking(token);
        });
    }
}

// Run initialization when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}
