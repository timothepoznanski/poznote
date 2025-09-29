/**
 * Backup Export Page JavaScript
 * Handles backup and export functionality
 */

/**
 * Download notes as ZIP file
 */
function startDownload() {
    // Create a direct link to the export script
    window.location.href = 'export_entries.php';
}

/**
 * Download attachments as ZIP file
 */
function startAttachmentsDownload() {
    // Create a direct link to the attachments export script
    window.location.href = 'export_attachments.php';
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
                                var token = 'dt_' + Math.random().toString(36).substr(2, 9);
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
