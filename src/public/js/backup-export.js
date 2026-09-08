/**
 * Backup Export Page JavaScript
 * Handles backup and export functionality including:
 * - Complete backup as a background job (built by a server-side worker,
 *   polled here, downloaded once ready)
 * - Exporting notes, attachments, and structured data
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
    var skipS3 = document.getElementById('structuredExportSkipS3');

    var params = [];
    if (workspace) {
        params.push('workspace=' + encodeURIComponent(workspace));
    }
    if (skipS3 && skipS3.checked) {
        params.push('skip_s3_attachments=1');
    }
    window.location.href = 'api_export_structured.php' + (params.length ? '?' + params.join('&') : '');
}

/**
 * Download all attachments as a ZIP file
 */
function startAttachmentsDownload() {
    window.location.href = 'api_export_attachments.php';
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
// Complete Backup as a Background Job
// ========================================
//
// The archive is built by a detached worker process (api_backup_job.php):
// a synchronous build inside the POST cannot survive the timeout of a proxy
// sitting in front of the instance for large accounts, and would occupy a
// php-fpm worker for many minutes. Here the page starts the job, polls its
// status, and triggers the download once the file is ready; the download
// itself streams immediately so no timeout applies. A page reload while the
// build runs picks the job back up.

var backupJob = {
    config: null,
    pollTimer: null,
    // Id of the job THIS tab started. The download only auto-starts for that
    // exact job, so neither a reload showing an already-finished archive nor
    // an in-flight resume response for an older job can trigger one.
    autoDownloadJobId: null
};

function backupJobConfig() {
    if (backupJob.config) return backupJob.config;
    var el = document.getElementById('backup-export-config');
    try {
        backupJob.config = JSON.parse(el ? el.textContent : '{}') || {};
    } catch (e) {
        backupJob.config = {};
    }
    backupJob.config.i18n = backupJob.config.i18n || {};
    return backupJob.config;
}

function backupJobText(key, fallback, vars) {
    var template = backupJobConfig().i18n[key] || fallback;
    if (vars) {
        for (var k in vars) {
            template = String(template).split('{{' + k + '}}').join(String(vars[k]));
        }
    }
    return template;
}

function backupJobFormatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
}

function backupJobFormatElapsed(fromEpochSeconds) {
    var seconds = Math.max(0, Math.round(Date.now() / 1000 - fromEpochSeconds));
    var minutes = Math.floor(seconds / 60);
    if (minutes <= 0) return seconds + ' s';
    return minutes + ' min ' + (seconds % 60) + ' s';
}

function backupJobElements() {
    return {
        form: document.getElementById('completeBackupForm'),
        button: document.getElementById('completeBackupBtn'),
        spinner: document.getElementById('backupSpinner'),
        spinnerText: document.getElementById('backupSpinnerText'),
        hint: document.getElementById('backupJobHint'),
        error: document.getElementById('backupJobError'),
        ready: document.getElementById('backupJobReady'),
        readyText: document.getElementById('backupJobReadyText'),
        downloadLink: document.getElementById('backupJobDownloadLink'),
        discardBtn: document.getElementById('backupJobDiscardBtn')
    };
}

function backupJobShow(el, visible) {
    if (!el) return;
    el.classList.toggle('initially-hidden', !visible);
    if (el.id === 'backupSpinner') {
        el.style.display = visible ? 'inline-flex' : 'none';
        el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
}

function backupJobResetUi() {
    var els = backupJobElements();
    backupJobShow(els.spinner, false);
    backupJobShow(els.hint, false);
    backupJobShow(els.error, false);
    backupJobShow(els.ready, false);
    if (els.button) {
        els.button.disabled = false;
        els.button.setAttribute('aria-disabled', 'false');
    }
}

function backupJobRenderRunning(job) {
    var els = backupJobElements();
    backupJobShow(els.error, false);
    backupJobShow(els.ready, false);
    backupJobShow(els.spinner, true);
    backupJobShow(els.hint, true);
    if (els.button) {
        els.button.disabled = true;
        els.button.setAttribute('aria-disabled', 'true');
    }
    if (els.spinnerText) {
        var since = job.started_at || job.created_at;
        els.spinnerText.textContent = job.status === 'queued'
            ? backupJobText('queued', 'Export queued...')
            : backupJobText('preparing', 'Preparing the archive... ({{elapsed}})', { elapsed: backupJobFormatElapsed(since) });
    }
}

function backupJobRenderReady(job) {
    var els = backupJobElements();
    backupJobResetUi();
    backupJobShow(els.ready, true);
    if (els.readyText) {
        els.readyText.textContent = backupJobText(
            'ready',
            'Your archive is ready ({{size}}). The download starts automatically; it stays available here for 24 hours.',
            { size: backupJobFormatBytes(job.size) }
        );
    }
    var url = 'api_backup_job.php?action=download&job_id=' + encodeURIComponent(job.id);
    if (els.downloadLink) els.downloadLink.setAttribute('href', url);
    if (els.discardBtn) els.discardBtn.dataset.jobId = job.id;
    if (backupJob.autoDownloadJobId === job.id) {
        backupJob.autoDownloadJobId = null;
        window.location.href = url;
    }
}

function backupJobRenderError(message) {
    var els = backupJobElements();
    backupJobResetUi();
    backupJobShow(els.error, true);
    if (els.error) els.error.textContent = message;
}

function backupJobStopPolling() {
    if (backupJob.pollTimer) {
        clearInterval(backupJob.pollTimer);
        backupJob.pollTimer = null;
    }
}

function backupJobHandleState(job) {
    if (!job) {
        backupJobStopPolling();
        return;
    }
    if (job.status === 'queued' || job.status === 'running') {
        backupJobRenderRunning(job);
        return;
    }
    backupJobStopPolling();
    if (job.status === 'done') {
        backupJobRenderReady(job);
    } else if (job.status === 'error') {
        backupJobRenderError(backupJobText('error', 'The export failed: {{error}}', { error: job.error || 'unknown' }));
    }
}

function backupJobStartPolling(jobId) {
    backupJobStopPolling();
    var poll = function() {
        fetch('api_backup_job.php?action=status&job_id=' + encodeURIComponent(jobId), { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) backupJobHandleState(data.job);
            })
            .catch(function() { /* transient network error: keep polling */ });
    };
    backupJob.pollTimer = setInterval(poll, 2500);
    poll();
}

function backupJobStart(form) {
    var body = new FormData();
    body.append('action', 'start');
    body.append('csrf_token', backupJobConfig().csrfToken || '');
    var userSelect = form.querySelector('[name="selected_user_id"]');
    if (userSelect && userSelect.value) body.append('selected_user_id', userSelect.value);
    var skipS3 = form.querySelector('[name="skip_s3_attachments"]');
    if (skipS3 && skipS3.checked) body.append('skip_s3_attachments', '1');

    fetch('api_backup_job.php', { method: 'POST', credentials: 'same-origin', body: body })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success || !data.job) {
                backupJobRenderError(backupJobText('startError', 'Cannot start the export: {{error}}', { error: data.error || 'unknown' }));
                return;
            }
            backupJob.autoDownloadJobId = data.job.id;
            backupJobRenderRunning(data.job);
            backupJobStartPolling(data.job.id);
        })
        .catch(function(e) {
            backupJobRenderError(backupJobText('startError', 'Cannot start the export: {{error}}', { error: e.message }));
        });
}

function backupJobResume() {
    // An export started earlier (or on another tab) may be running or ready:
    // pick it up instead of showing a blank section.
    fetch('api_backup_job.php?action=status', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success || !data.job) return;
            if (data.job.status === 'queued' || data.job.status === 'running') {
                // Deliberately NOT arming autoDownload here: only the tab
                // that started the export downloads on completion. Otherwise
                // every open tab watching the same job would fire its own
                // download of the same multi-hundred-MB archive.
                backupJobRenderRunning(data.job);
                backupJobStartPolling(data.job.id);
            } else if (data.job.status === 'done') {
                backupJobRenderReady(data.job);
            }
            // A failed job from an earlier visit is not resurfaced: the user
            // already saw the error when it happened, or will simply retry.
        })
        .catch(function() { /* no job to resume */ });
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

    // Complete backup runs as a background job
    var form = document.getElementById('completeBackupForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            backupJobStart(form);
        });
    }

    var discardBtn = document.getElementById('backupJobDiscardBtn');
    if (discardBtn) {
        discardBtn.addEventListener('click', function() {
            var body = new FormData();
            body.append('action', 'discard');
            body.append('csrf_token', backupJobConfig().csrfToken || '');
            body.append('job_id', discardBtn.dataset.jobId || '');
            fetch('api_backup_job.php', { method: 'POST', credentials: 'same-origin', body: body })
                .then(function() { backupJobResetUi(); })
                .catch(function() { backupJobResetUi(); });
        });
    }

    backupJobResume();
}

// Run initialization when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}
