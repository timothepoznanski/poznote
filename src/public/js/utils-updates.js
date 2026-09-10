// Update checking for Poznote.
// 
// Polls for a newer release, shows the update badge on the sidebar and settings entries,
// and renders the update instructions (self-hosted vs cloud).

// Update management
function checkForUpdates() {
    // Close settings menus
    closeSettingsMenus();

    // Remove update badge since user is checking manually
    hideUpdateBadge();

    // User has manually checked, so clear the update available flag and reset the check time
    // This prevents the badge from reappearing until the next automatic check (24h later)
    localStorage.removeItem('poznote_update_available');
    localStorage.setItem('poznote_last_update_check', Date.now().toString());

    // Show checking modal
    showUpdateCheckModal();

    fetch('api/v1/system/updates')
        .then(function (response) {
            if (!response.ok) {
                // Prefer the message the server sent over a bare status code:
                // the API answers 4xx with {"error": "..."} and that text is what
                // the user needs to see.
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (data) {
                        throw new Error(data.error || data.message || ('HTTP Error: ' + response.status));
                    });
            }
            return response.json();
        })
        .then(function (data) {
            closeUpdateCheckModal();
            if (data.error) {
                // A failed check (no network, GitHub rate limit, ...) is not
                // worth an error screen: show the usual modal with the latest
                // available version left blank.
                showUpdateInstructions(false, true);
            } else if (data.has_updates) {
                // Store version information for the modal
                showUpdateInstructions(true);
            } else {
                // No updates available
                showUpdateInstructions(false);
            }
        })
        .catch(function (error) {
            console.error('Failed to check for updates:', error);
            closeUpdateCheckModal();
            showUpdateInstructions(false, true);
        });
}

// Check for updates automatically (silent, once per day)
function checkForUpdatesAutomatic() {
    // Only check for updates if user is admin
    // Check if badge exists in DOM (PHP only renders it for admins) as fallback
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }

    const now = Date.now();
    const lastCheck = localStorage.getItem('poznote_last_update_check');
    const lastCheckTime = lastCheck ? parseInt(lastCheck) : 0;

    // Check only once per day (24 hours = 24 * 60 * 60 * 1000 ms)
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastCheckTime < oneDayMs) {
        // Already checked today, restore badge if update was available
        restoreUpdateBadge();
        return;
    }

    // Store current time as last check
    localStorage.setItem('poznote_last_update_check', now.toString());

    // Perform silent check (no modals, only badge if update available)
    fetch('api/v1/system/updates')
        .then(function (response) {
            if (!response.ok) {
                // Prefer the message the server sent over a bare status code:
                // the API answers 4xx with {"error": "..."} and that text is what
                // the user needs to see.
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (data) {
                        throw new Error(data.error || data.message || ('HTTP Error: ' + response.status));
                    });
            }
            return response.json();
        })
        .then(function (data) {
            if (data.has_updates && !data.error) {
                // Store update availability and version information
                localStorage.setItem('poznote_update_available', 'true');
                showUpdateBadge();
            } else {
                // Clear update availability flag and hide badge
                localStorage.removeItem('poznote_update_available');
                hideUpdateBadge();
            }
        })
        .catch(function (error) {
            // Silent failure - no user notification for automatic checks
            console.debug('utils-updates: checkForUpdatesAutomatic() failed:', error);
        });
}

// Expose functions globally
window.showUpdateBadge = showUpdateBadge;
window.hideUpdateBadge = hideUpdateBadge;
window.restoreUpdateBadge = restoreUpdateBadge;

function showUpdateInstructions(hasUpdate = false, checkFailed = false) {
    var modal = document.getElementById('updateModal');
    if (modal) {
        var titleEl = modal.querySelector('h3');
        var messageEl = modal.querySelector('#updateMessage');
        // #updateBackupWarning (modals.php) and #updateHowToUpdate used to be
        // looked up here and then never touched, so the backup warning stays
        // hidden by its .initially-hidden class and #updateHowToUpdate does not
        // exist at all. Left unrevealed rather than changed silently.

        if (checkFailed) {
            // The remote version could not be read: say so plainly instead of
            // claiming the app is up to date.
            if (titleEl) titleEl.textContent = window.t ? window.t('update.error_getting_version', null, 'Error getting version') : 'Error getting version';
            if (messageEl) messageEl.style.display = 'none';
        } else if (hasUpdate) {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.new_available', null, 'New update available') : 'New update available';
            if (messageEl) {
                messageEl.innerHTML = window.t ? window.t('update.new_version_available', null, 'If you manage this installation yourself, follow the instructions on GitHub <a href="https://github.com/timothepoznanski/poznote#update-application" target="_blank">here</a> to update. Otherwise, your hosting provider has to perform the update.') : 'If you manage this installation yourself, follow the instructions on GitHub <a href="https://github.com/timothepoznanski/poznote#update-application" target="_blank">here</a> to update. Otherwise, your hosting provider has to perform the update.';
                messageEl.style.display = '';
            }
        } else {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.up_to_date', null, 'Poznote is up to date') : 'Poznote is up to date';
            if (messageEl) messageEl.style.display = 'none';
        }

        // Fill version information
        var currentVersionEl = document.getElementById('currentVersion');
        var availableVersionEl = document.getElementById('availableVersion');

        // Always fetch version information
        if (currentVersionEl) currentVersionEl.textContent = 'Loading...';
        if (availableVersionEl) availableVersionEl.textContent = 'Loading...';

        // Fetch update information
        fetch('api/v1/system/updates')
            .then(function (response) {
                if (!response.ok) {
                    // Prefer the message the server sent over a bare status code:
                    // the API answers 4xx with {"error": "..."} and that text is what
                    // the user needs to see.
                    return response.json()
                        .catch(function () { return {}; })
                        .then(function (data) {
                            throw new Error(data.error || data.message || ('HTTP Error: ' + response.status));
                        });
                }
                return response.json();
            })
            .then(function (data) {
                // The local version is known even when the remote lookup
                // failed; only "Latest available" is left blank in that case.
                if (currentVersionEl) {
                    currentVersionEl.textContent = data.current_version || '';
                }
                if (availableVersionEl) {
                    availableVersionEl.textContent = data.error ? '' : (data.remote_version || '');
                }
                // The "View release notes" button links to the releases
                // list statically (see modals.php), so nothing to set here.
            })
            .catch(function (error) {
                // The request itself failed, so fall back to the version the
                // page was rendered with (the Version card in Settings).
                if (currentVersionEl) {
                    var cardVersion = document.querySelector('#check-updates-card .setting-status');
                    currentVersionEl.textContent = cardVersion ? cardVersion.textContent.trim() : '';
                }
                if (availableVersionEl) availableVersionEl.textContent = '';
            });

        modal.style.display = 'flex';
    }
}

function closeUpdateModal() {
    var modal = document.getElementById('updateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function goToSelfHostedUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote#update-application', '_blank');
}

function goToCloudUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote/blob/main/docs/POZNOTE-CLOUD.md', '_blank');
}

function showUpdateCheckModal() {
    var modal = document.getElementById('updateCheckModal');
    var statusElement = document.getElementById('updateCheckStatus');
    var buttonsElement = document.getElementById('updateCheckButtons');

    if (!modal) {
        console.error('updateCheckModal modal not found');
        return;
    }

    // Reset modal state
    var titleElement = modal.querySelector('h3');
    if (titleElement) {
        titleElement.textContent = 'Checking for updates...';
        titleElement.style.color = '';
    }

    if (statusElement) {
        statusElement.textContent = 'Please wait while we check for updates...';
        statusElement.style.color = '';
    }

    if (buttonsElement) {
        buttonsElement.style.display = 'none';
    }

    modal.style.display = 'flex';
}

function closeUpdateCheckModal() {
    var modal = document.getElementById('updateCheckModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function hideUpdateBadge() {
    var badges = document.querySelectorAll('.update-badge');
    for (var i = 0; i < badges.length; i++) {
        badges[i].classList.add('update-badge-hidden');
        badges[i].style.display = '';
    }
}

function showUpdateBadge() {
    // Only show badge for admin users
    // Check if badge exists in DOM (PHP only renders it for admins) as fallback
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }
    for (var i = 0; i < badges.length; i++) {
        badges[i].classList.remove('update-badge-hidden');
        badges[i].style.display = 'inline-block';
    }
}

function restoreUpdateBadge() {
    // Only restore badge for admin users
    // Check if badge exists (PHP only renders it for admins) as fallback for window.isAdmin
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }
    const updateAvailable = localStorage.getItem('poznote_update_available');
    if (updateAvailable === 'true') {
        showUpdateBadge();
    }
}
