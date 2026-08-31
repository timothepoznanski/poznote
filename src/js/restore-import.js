/**
 * Restore Import Page JavaScript
 * Handles database, notes, and attachments import functionality
 */

function tr(key, fallback, vars) {
    if (window.t) return window.t(key, vars || null, fallback);
    if (vars && typeof vars === 'object') {
        for (const k in vars) fallback = String(fallback).split('{{' + k + '}}').join(String(vars[k]));
    }
    return fallback;
}

// Custom alert helpers (used by inline onclick and this script)
if (typeof window.showCustomAlert !== 'function') {
    window.showCustomAlert = function (title, message) {
        const alertEl = document.getElementById('customAlert');
        const titleEl = document.getElementById('alertTitle');
        const messageEl = document.getElementById('alertMessage');

        if (titleEl) titleEl.textContent = title != null ? String(title) : '';
        if (messageEl) messageEl.textContent = message != null ? String(message) : '';

        if (alertEl) {
            alertEl.style.display = 'flex';
        } else {
            // Fallback if markup is missing
            alert((title ? title + '\n\n' : '') + (message || ''));
        }
    };
}

if (typeof window.hideCustomAlert !== 'function') {
    window.hideCustomAlert = function () {
        const alertEl = document.getElementById('customAlert');
        if (alertEl) alertEl.style.display = 'none';
    };
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 ' + tr('restore_import.units.bytes', 'Bytes');
    const k = 1024;
    const sizes = [
        tr('restore_import.units.bytes', 'Bytes'),
        tr('restore_import.units.kb', 'KB'),
        tr('restore_import.units.mb', 'MB'),
        tr('restore_import.units.gb', 'GB')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Toggle card collapse/expand
function toggleCard(targetId) {
    const content = document.getElementById(targetId);
    const header = document.querySelector(`[data-target="${targetId}"]`);
    const chevron = header?.querySelector('.chevron');

    if (!content) return;

    if (content.classList.contains('open')) {
        content.classList.remove('open');
        chevron?.classList.remove('open');
    } else {
        content.classList.add('open');
        chevron?.classList.add('open');
    }
}

// Toggle sub-card collapse/expand
function toggleSubCard(targetId) {
    const content = document.getElementById(targetId);
    const header = document.querySelector(`[data-target="${targetId}"]`);
    const chevron = header?.querySelector('.chevron');

    if (!content) return;

    if (content.classList.contains('open')) {
        content.classList.remove('open');
        chevron?.classList.remove('open');
    } else {
        content.classList.add('open');
        chevron?.classList.add('open');
    }
}

// Event delegation handler for all click actions
function handleRestoreImportClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const section = target.dataset.section;

    switch (action) {
        // Card toggles
        case 'toggle-card':
            const cardTarget = target.dataset.target;
            if (cardTarget) toggleCard(cardTarget);
            break;

        // Sub-card toggles
        case 'toggle-sub-card':
            const subCardTarget = target.dataset.target;
            if (subCardTarget) toggleSubCard(subCardTarget);
            break;

        // Complete restore actions
        case 'show-complete-restore-confirmation':
            showCompleteRestoreConfirmation();
            break;
        case 'hide-complete-restore-confirmation':
            hideCompleteRestoreConfirmation();
            break;
        case 'proceed-complete-restore':
            proceedWithCompleteRestore();
            break;

        // Direct copy restore actions
        case 'show-direct-copy-restore-confirmation':
            showDirectCopyRestoreConfirmation(target);
            break;
        case 'hide-direct-copy-restore-confirmation':
            hideDirectCopyRestoreConfirmation();
            break;
        case 'proceed-direct-copy-restore':
            proceedWithDirectCopyRestore();
            break;

        // Import confirmation actions
        case 'hide-import-confirmation':
            hideImportConfirmation();
            break;
        case 'proceed-import':
            proceedWithImport();
            break;

        // Notes import actions
        case 'hide-notes-import-confirmation':
            hideNotesImportConfirmation();
            break;
        case 'proceed-notes-import':
            proceedWithNotesImport();
            break;

        // Attachments import actions
        case 'hide-attachments-import-confirmation':
            hideAttachmentsImportConfirmation();
            break;
        case 'proceed-attachments-import':
            proceedWithAttachmentsImport();
            break;

        // Individual notes import actions
        case 'show-individual-notes-import-confirmation':
            showIndividualNotesImportConfirmation();
            break;
        case 'hide-individual-notes-import-confirmation':
            hideIndividualNotesImportConfirmation();
            break;
        case 'proceed-individual-notes-import':
            proceedWithIndividualNotesImport();
            break;

        // Custom alert
        case 'hide-custom-alert':
            hideCustomAlert();
            break;

        // Post-restore workspace chooser
        case 'hide-restore-workspaces-modal':
            hideRestoreWorkspacesModal();
            break;

        // Maintenance actions
        case 'run-repair':
            runRepair(target);
            break;
    }
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Load config from JSON element if present
    const configEl = document.getElementById('restore-import-config');
    if (configEl) {
        try {
            const config = JSON.parse(configEl.textContent);
            window.POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES = config.maxIndividualFiles || 50;
            window.POZNOTE_IMPORT_MAX_ZIP_FILES = config.maxZipFiles || 300;
            window.__restoreImportConfig = config;
        } catch (e) {
            console.error('Failed to parse restore-import config:', e);
        }
    }

    // A restore launched earlier (or from another tab) may still be running
    // on the server: pick its status back up instead of showing nothing.
    chunkedRestoreResume();

    // Initialize cards state (open first card by default)
    initializeCardsState();

    // Event delegation for all click actions
    document.addEventListener('click', handleRestoreImportClick);

    // Close modal when clicking outside
    document.addEventListener('click', function (e) {
        if ((e.target.classList.contains('import-confirm-modal') || e.target.classList.contains('custom-alert')) && !e.target.classList.contains('is-submitting')) {
            e.target.style.display = 'none';
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            hideImportConfirmation();
            hideNotesImportConfirmation();
            hideAttachmentsImportConfirmation();
            hideIndividualNotesImportConfirmation();
            hideCompleteRestoreConfirmation();
            hideDirectCopyRestoreConfirmation();
            hideRestoreWorkspacesModal();
            hideCustomAlert();
        }
    });

    // Load workspaces for individual notes import
    loadWorkspacesForImport();

    // Setup drag and drop visual feedback
    setupDragAndDrop();

    // Setup file input change listeners
    setupFileInputListeners();

    // Setup workspace select change listener
    const workspaceSelect = document.getElementById('target_workspace_select');
    if (workspaceSelect) {
        workspaceSelect.addEventListener('change', function () {
            loadFoldersForImport(this.value);
        });
    }

    // Update Back to Notes link with current workspace from PHP
    try {
        const workspace = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() :
            (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace :
                (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;
        if (workspace) {
            const backLink = document.getElementById('backToNotesLink');
            if (backLink) backLink.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(workspace));
        }
    } catch (e) { /* ignore */ }
});

// Setup file input change listeners for standard restore
function setupFileInputListeners() {
    const completeFileInput = document.getElementById('complete_backup_file');

    if (completeFileInput) {
        completeFileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            const button = document.getElementById('completeRestoreBtn');

            // No size warning anymore: the archive travels in slices, so
            // there is nothing slow or fragile about a large file.
            if (file && file.name.toLowerCase().endsWith('.zip')) {
                button.disabled = false;
                button.textContent = tr('restore_import.inline.standard.button', 'Start Complete Restore (Standard)');
            }
        });
    }
}

// Complete Restore Functions
function showCompleteRestoreConfirmation() {
    const fileInput = document.getElementById('complete_backup_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_restore', 'Please select a complete backup ZIP file before proceeding with the restore.')
        );
        return;
    }

    // Size no longer matters here: the archive travels in slices and the
    // restore runs in the background, whatever the file size.
    const modal = document.getElementById('completeRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');
    warningText.innerHTML = tr(
        'restore_import.modals.complete_restore.warning_html',
        '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.',
        null
    );

    modal.style.display = 'flex';
}

function hideCompleteRestoreConfirmation() {
    document.getElementById('completeRestoreConfirmModal').style.display = 'none';
}

function proceedWithCompleteRestore() {
    const fileInput = document.getElementById('complete_backup_file');
    if (!fileInput || !fileInput.files.length) {
        alert(tr('restore_import.errors.complete_restore_form_not_found', 'Complete restore form not found. Please try again.'));
        return;
    }
    hideCompleteRestoreConfirmation();
    // The archive travels in slices and the restore runs server-side (see
    // the chunked restore section below), so neither a proxy body-size
    // limit nor an HTTP timeout can interrupt it, whatever the file size.
    startChunkedRestore(fileInput.files[0]);
}

// ========================================
// Chunked complete restore
// ========================================
// The archive is sent in slices of a few dozen MB: each slice is an
// ordinary POST that passes every body-size limit in front of the instance
// (Cloudflare Free/Pro caps requests at 100 MB, nginx and PHP have their
// own caps). A server-side worker then assembles the slices and runs the
// restore outside any HTTP request, so no proxy or browser timeout can
// interrupt it; this page polls the job status and shows the outcome.

const chunkedRestore = { pollTimer: null, uploading: false };

function chunkedRestoreConfig() {
    return window.__restoreImportConfig || {};
}

function chunkedRestoreText(key, fallback, vars) {
    const i18n = chunkedRestoreConfig().i18n || {};
    let template = i18n[key] || fallback;
    if (vars) {
        for (const k in vars) template = String(template).split('{{' + k + '}}').join(String(vars[k]));
    }
    return template;
}

function chunkedRestoreEls() {
    return {
        progress: document.getElementById('chunkedRestoreProgress'),
        bar: document.getElementById('chunkedRestoreBar'),
        statusText: document.getElementById('chunkedRestoreStatusText'),
        error: document.getElementById('chunkedRestoreError'),
        success: document.getElementById('chunkedRestoreSuccess'),
        button: document.getElementById('completeRestoreBtn')
    };
}

function chunkedRestoreSetBusy(busy) {
    const els = chunkedRestoreEls();
    if (els.button) els.button.disabled = busy;
}

function chunkedRestoreShowProgress(percent, text) {
    const els = chunkedRestoreEls();
    if (els.error) els.error.classList.add('initially-hidden');
    if (els.success) els.success.classList.add('initially-hidden');
    if (els.progress) {
        els.progress.classList.remove('initially-hidden');
        const circle = els.progress.querySelector('.restore-spinner-circle');
        if (circle) circle.style.display = '';
    }
    if (els.bar) els.bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (els.statusText) els.statusText.textContent = text;
}

/** Completion state: full bar, no spinner, summary below, chooser on top. */
function chunkedRestoreShowDone(summary) {
    const els = chunkedRestoreEls();
    if (els.progress) {
        els.progress.classList.remove('initially-hidden');
        const circle = els.progress.querySelector('.restore-spinner-circle');
        if (circle) circle.style.display = 'none';
    }
    if (els.bar) els.bar.style.width = '100%';
    if (els.statusText) els.statusText.textContent = chunkedRestoreText('done', 'Restore completed successfully.');
    if (els.error) els.error.classList.add('initially-hidden');
    if (els.success) {
        els.success.textContent = summary;
        els.success.classList.remove('initially-hidden');
    }
    chunkedRestoreSetBusy(false);
}

function chunkedRestoreShowResult(ok, text) {
    const els = chunkedRestoreEls();
    if (els.progress) els.progress.classList.add('initially-hidden');
    const box = ok ? els.success : els.error;
    const other = ok ? els.error : els.success;
    if (other) other.classList.add('initially-hidden');
    if (box) {
        box.textContent = text;
        box.classList.remove('initially-hidden');
    }
    chunkedRestoreSetBusy(false);
}

// Warn before leaving the page while slices are still being sent: the
// upload only lives as long as this page. Once the job is queued on the
// server, leaving is harmless and the warning goes away.
window.addEventListener('beforeunload', function (e) {
    if (chunkedRestore.uploading) {
        e.preventDefault();
        e.returnValue = '';
    }
});

/** POST FormData to the restore upload endpoint, expecting JSON back. */
function chunkedRestoreFetch(body) {
    return fetch('api_restore_upload.php', { method: 'POST', credentials: 'same-origin', body: body })
        .then(async function (r) {
            let data = null;
            try { data = await r.json(); } catch (e) { /* proxy error page */ }
            if (!data || !data.success) {
                throw new Error((data && data.error) || ('HTTP ' + r.status));
            }
            return data;
        });
}

/** Upload one slice with fine-grained progress events. */
function chunkedRestoreSendChunk(formData, onProgress) {
    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'api_restore_upload.php');
        xhr.responseType = 'json';
        if (xhr.upload && onProgress) {
            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable) onProgress(e.loaded);
            });
        }
        xhr.addEventListener('load', function () {
            const data = xhr.response;
            if (data && data.success) {
                resolve(data);
            } else {
                reject(new Error((data && data.error) || ('HTTP ' + xhr.status)));
            }
        });
        xhr.addEventListener('error', function () { reject(new Error('network error')); });
        xhr.addEventListener('abort', function () { reject(new Error('upload aborted')); });
        xhr.send(formData);
    });
}

// The single progress bar covers the whole operation: upload takes the
// first span, then the server-side stages (assembly, extraction, database,
// notes, attachments) share the rest, scaled by the per-stage counts the
// worker reports. The bar only reaches 100% when the restore is truly done.
const CHUNKED_RESTORE_UPLOAD_SPAN = 60;
const CHUNKED_RESTORE_STAGES = {
    // Restoring from the bucket skips the upload entirely, so its download
    // stage covers the span an upload would have used.
    downloading: { from: 5, to: 60 },
    assembling:  { from: 60, to: 68 },
    extracting:  { from: 68, to: 76 },
    preparing:   { from: 76, to: 81 },
    database:    { from: 81, to: 86 },
    notes:       { from: 86, to: 92 },
    attachments: { from: 92, to: 99 }
};

function chunkedRestoreJobPercent(job) {
    if (job.status === 'done') return 100;
    const span = CHUNKED_RESTORE_STAGES[job.stage];
    if (!span) {
        // No stage yet (just queued): an uploaded archive has already
        // travelled its span, an S3 restore has not started at all.
        return job.total_chunks > 0 ? CHUNKED_RESTORE_UPLOAD_SPAN : 2;
    }
    let fraction = 0;
    if (job.stage_total > 0 && job.stage_done !== null && job.stage_done !== undefined) {
        fraction = Math.max(0, Math.min(1, job.stage_done / job.stage_total));
    }
    return span.from + (span.to - span.from) * fraction;
}

function chunkedRestoreStageLabel(job) {
    const counts = (job.stage_total > 0)
        ? { done: job.stage_done || 0, total: job.stage_total }
        : null;
    switch (job.stage) {
        case 'downloading':
            return chunkedRestoreText('stage_downloading', 'Fetching the archive from the bucket...');
        case 'assembling':
            return chunkedRestoreText('stage_assembling', 'Assembling the archive on the server...');
        case 'extracting':
            return chunkedRestoreText('stage_extracting', 'Extracting the archive...');
        case 'preparing':
            return chunkedRestoreText('stage_preparing', 'Preparing the data...');
        case 'database':
            return chunkedRestoreText('stage_database', 'Restoring the database...');
        case 'notes':
            return counts
                ? chunkedRestoreText('stage_notes', 'Restoring the notes... ({{done}}/{{total}})', counts)
                : chunkedRestoreText('stage_notes_simple', 'Restoring the notes...');
        case 'attachments':
            return counts
                ? chunkedRestoreText('stage_attachments', 'Restoring the attachments... ({{done}}/{{total}})', counts)
                : chunkedRestoreText('stage_attachments_simple', 'Restoring the attachments...');
        default:
            // No stage yet. Only the upload path can report an upload as done.
            return job.total_chunks > 0
                ? chunkedRestoreText('queued_uploaded', 'Upload complete, restore starting...')
                : chunkedRestoreText('queued', 'Restore starting...');
    }
}

function chunkedRestoreRenderUpload(sentBytes, totalBytes) {
    const fraction = totalBytes > 0 ? Math.min(1, sentBytes / totalBytes) : 0;
    // The bar shows the whole pipeline (upload is its first span), but the
    // label states the upload's own progress: "60%" while the upload is
    // actually finished would read as a stall.
    chunkedRestoreShowProgress(fraction * CHUNKED_RESTORE_UPLOAD_SPAN, chunkedRestoreText(
        'uploading',
        'Uploading the archive... {{percent}}% ({{done}} of {{total}})',
        {
            percent: (fraction * 100).toFixed(0),
            done: formatFileSize(Math.min(sentBytes, totalBytes)),
            total: formatFileSize(totalBytes)
        }
    ));
}

/** Send the whole file in slices; resolves with the queued job state. */
async function chunkedRestoreUpload(file) {
    const cfg = chunkedRestoreConfig();
    const chunkBytes = window.POZNOTE_UPLOAD_CHUNK_BYTES || cfg.restoreChunkBytes || (32 * 1024 * 1024);
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkBytes));
    const csrf = cfg.csrfToken || '';

    const initBody = new FormData();
    initBody.append('action', 'init');
    initBody.append('csrf_token', csrf);
    initBody.append('filename', file.name);
    initBody.append('total_size', String(file.size));
    initBody.append('total_chunks', String(totalChunks));
    const initData = await chunkedRestoreFetch(initBody);
    const uploadId = initData.upload_id;

    chunkedRestore.uploading = true;
    try {
        let sent = 0;
        for (let i = 0; i < totalChunks; i++) {
            const blob = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
            let attempt = 0;
            for (;;) {
                try {
                    const fd = new FormData();
                    fd.append('action', 'chunk');
                    fd.append('csrf_token', csrf);
                    fd.append('upload_id', uploadId);
                    fd.append('chunk_index', String(i));
                    fd.append('chunk', blob, 'chunk');
                    await chunkedRestoreSendChunk(fd, function (loaded) {
                        chunkedRestoreRenderUpload(sent + loaded, file.size);
                    });
                    break;
                } catch (e) {
                    // A transient failure (flaky connection, proxy hiccup)
                    // only costs this slice: retry it a couple of times
                    // before giving up on the whole upload.
                    attempt++;
                    if (attempt >= 3) throw e;
                    // Same scale as chunkedRestoreRenderUpload: a raw
                    // percentage here would jump the bar forward, then back.
                    chunkedRestoreShowProgress(
                        (file.size > 0 ? sent / file.size : 0) * CHUNKED_RESTORE_UPLOAD_SPAN,
                        chunkedRestoreText('chunkRetry', 'A slice failed to upload, retrying...')
                    );
                    await new Promise(function (r) { setTimeout(r, 2000); });
                }
            }
            sent += blob.size;
            chunkedRestoreRenderUpload(sent, file.size);
        }

        const finBody = new FormData();
        finBody.append('action', 'finalize');
        finBody.append('csrf_token', csrf);
        finBody.append('upload_id', uploadId);
        const finData = await chunkedRestoreFetch(finBody);
        return finData.job;
    } finally {
        chunkedRestore.uploading = false;
    }
}

function chunkedRestoreStopPolling() {
    if (chunkedRestore.pollTimer) {
        clearInterval(chunkedRestore.pollTimer);
        chunkedRestore.pollTimer = null;
    }
}

function chunkedRestoreRenderJob(job) {
    if (!job) {
        chunkedRestoreStopPolling();
        return;
    }
    if (job.status === 'queued' || job.status === 'running') {
        chunkedRestoreShowProgress(chunkedRestoreJobPercent(job), chunkedRestoreStageLabel(job));
        return;
    }
    chunkedRestoreStopPolling();
    if (job.status === 'done') {
        chunkedRestoreShowDone(job.message || chunkedRestoreText('done', 'Restore completed successfully.'));
        chunkedRestoreShowWorkspacesModal(job.message || '');
    } else if (job.status === 'error') {
        chunkedRestoreShowResult(false, chunkedRestoreText('error', 'The restore failed: {{error}}', { error: job.error || 'unknown' }));
    }
}

/**
 * Once the restore is done, show its summary and list the restored
 * workspaces so the user can jump straight into one of them.
 */
function chunkedRestoreShowWorkspacesModal(summary) {
    const modal = document.getElementById('restoreWorkspacesModal');
    const list = document.getElementById('restoreWorkspacesList');
    if (!modal || !list) return;
    const summaryEl = document.getElementById('restoreWorkspacesSummary');
    if (summaryEl) {
        summaryEl.textContent = summary || '';
        summaryEl.classList.toggle('initially-hidden', !summary);
    }
    fetch('/api/v1/workspaces', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.workspaces) || !data.workspaces.length) return;
            list.innerHTML = '';
            data.workspaces.forEach(function (ws) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'restore-workspace-open-btn';
                btn.textContent = ws.name;
                btn.addEventListener('click', function () {
                    window.location.href = 'index.php?workspace=' + encodeURIComponent(ws.name);
                });
                list.appendChild(btn);
            });
            modal.style.display = 'flex';
        })
        .catch(function () { /* the success alert already tells the story */ });
}

function hideRestoreWorkspacesModal() {
    const modal = document.getElementById('restoreWorkspacesModal');
    if (modal) modal.style.display = 'none';
}

function chunkedRestorePoll(uploadId) {
    chunkedRestoreStopPolling();
    const poll = function () {
        fetch('api_restore_upload.php?action=status&upload_id=' + encodeURIComponent(uploadId), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) chunkedRestoreRenderJob(data.job);
            })
            .catch(function () { /* transient network error: keep polling */ });
    };
    chunkedRestore.pollTimer = setInterval(poll, window.POZNOTE_RESTORE_POLL_MS || 3000);
    poll();
}

async function startChunkedRestore(file) {
    chunkedRestoreSetBusy(true);
    chunkedRestoreRenderUpload(0, file.size);
    try {
        const job = await chunkedRestoreUpload(file);
        chunkedRestoreRenderJob(job);
        chunkedRestorePoll(job.id);
    } catch (e) {
        chunkedRestoreShowResult(false, chunkedRestoreText('uploadError', 'The upload failed: {{error}}', { error: e.message }));
    }
}

// The restore controls live inside two collapsible cards that are closed by
// default; a resumed job renders into them, so open them or the progress
// bar (and any eventual error) would be invisible on a reloaded page.
function chunkedRestoreOpenCards(extraIds) {
    ['restoreBackupContent'].concat(extraIds || ['standardRestoreContent']).forEach(function (id) {
        const content = document.getElementById(id);
        if (content) content.classList.add('open');
        const header = document.querySelector('[data-target="' + id + '"]');
        const chevron = header ? header.querySelector('.chevron') : null;
        if (chevron) chevron.classList.add('open');
    });
}

/**
 * Restore from an archive already in the S3 bucket. Same background job and
 * same progress UI as an uploaded archive: fetching a large archive from the
 * bucket and restoring it is exactly as slow, so it cannot live inside an
 * HTTP request either.
 */
function startS3Restore(s3Key) {
    chunkedRestoreOpenCards(['s3RestoreContent']);
    chunkedRestoreSetBusy(true);
    chunkedRestoreShowProgress(2, chunkedRestoreText('queued', 'Restore starting...'));

    const body = new FormData();
    body.append('action', 'start_s3');
    body.append('csrf_token', chunkedRestoreConfig().csrfToken || '');
    body.append('s3_backup_key', s3Key);

    return chunkedRestoreFetch(body)
        .then(function (data) {
            chunkedRestoreRenderJob(data.job);
            chunkedRestorePoll(data.job.id);
        })
        .catch(function (e) {
            chunkedRestoreShowResult(false, chunkedRestoreText('error', 'The restore failed: {{error}}', { error: e.message }));
        });
}

function chunkedRestoreResume() {
    fetch('api_restore_upload.php?action=status', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.job) return;
            if (data.job.status === 'queued' || data.job.status === 'running') {
                chunkedRestoreOpenCards();
                chunkedRestoreSetBusy(true);
                chunkedRestoreRenderJob(data.job);
                chunkedRestorePoll(data.job.id);
            }
            // A finished or failed run from an earlier visit is not
            // resurfaced: its outcome was shown when it happened.
        })
        .catch(function () { /* nothing to resume */ });
}

// Advanced Import Toggle Function
function toggleAdvancedImport() {
    const advancedOptions = document.getElementById('advancedImportOptions');
    const toggleButton = document.querySelector('button[onclick="toggleAdvancedImport()"]');

    if (advancedOptions.style.display === 'none') {
        advancedOptions.style.display = 'block';
        toggleButton.innerHTML = '<i class="lucide lucide-chevron-up"></i> ' + tr('restore_import.advanced.hide', 'Hide Advanced Import Options');
    } else {
        advancedOptions.style.display = 'none';
        toggleButton.innerHTML = '<i class="lucide lucide-chevron-down"></i> ' + tr('restore_import.advanced.show', 'Show Advanced Import Options');
    }
}

// Database Import Functions
function showImportConfirmation() {
    const fileInput = document.getElementById('backup_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_sql_selected_title', 'No SQL File Selected'),
            tr('restore_import.alerts.no_sql_selected_body', 'Please select a SQL file before proceeding with the database import.')
        );
        return;
    }
    document.getElementById('importConfirmModal').style.display = 'flex';
}

function hideImportConfirmation() {
    document.getElementById('importConfirmModal').style.display = 'none';
}

function proceedWithImport() {
    const form = document.querySelector('form[method="post"]');
    if (form) {
        const actionInput = form.querySelector('input[name="action"]');
        if (actionInput) {
            actionInput.value = 'restore';
        }
        form.submit();
    } else {
        alert(tr('restore_import.errors.form_not_found', 'Form not found. Please try again.'));
    }
}

// Notes Import Functions
function showNotesImportConfirmation() {
    const fileInput = document.getElementById('notes_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_notes', 'Please select a ZIP file containing HTML notes before proceeding with the import.')
        );
        return;
    }
    document.getElementById('notesImportConfirmModal').style.display = 'flex';
}

function hideNotesImportConfirmation() {
    document.getElementById('notesImportConfirmModal').style.display = 'none';
}

function proceedWithNotesImport() {
    const forms = document.querySelectorAll('form[method="post"]');
    const notesForm = Array.from(forms).find(form =>
        form.querySelector('input[name="action"][value="import_notes"]')
    );
    if (notesForm) {
        notesForm.submit();
    }
}

// Attachments Import Functions
function showAttachmentsImportConfirmation() {
    const fileInput = document.getElementById('attachments_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_attachments', 'Please select a ZIP file containing attachments before proceeding with the import.')
        );
        return;
    }
    document.getElementById('attachmentsImportConfirmModal').style.display = 'flex';
}

function hideAttachmentsImportConfirmation() {
    document.getElementById('attachmentsImportConfirmModal').style.display = 'none';
}

function proceedWithAttachmentsImport() {
    const forms = document.querySelectorAll('form[method="post"]');
    const attachmentsForm = Array.from(forms).find(form =>
        form.querySelector('input[name="action"][value="import_attachments"]')
    );
    if (attachmentsForm) {
        attachmentsForm.submit();
    }
}

// Individual Notes Import Functions
function showIndividualNotesImportConfirmation() {
    const fileInput = document.getElementById('individual_notes_files');
    const workspaceSelect = document.getElementById('target_workspace_select');
    const folderSelect = document.getElementById('target_folder_select');

    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_files_selected_title', 'No Files Selected'),
            tr('restore_import.alerts.no_files_selected_body', 'Please select one or more HTML, Markdown files, or a ZIP archive before proceeding with the import.')
        );
        return;
    }

    // Validate workspace selection
    if (!workspaceSelect.value) {
        showCustomAlert(
            tr('restore_import.alerts.no_workspace_title', 'No Workspace Selected'),
            tr('restore_import.alerts.no_workspace_body', 'Please select a workspace for the imported notes.')
        );
        return;
    }

    const fileCount = fileInput.files.length;
    const workspace = workspaceSelect.options[workspaceSelect.selectedIndex].text;
    const folder = folderSelect.value ? folderSelect.options[folderSelect.selectedIndex].text : tr('restore_import.sections.individual_notes.no_folder', 'No folder (root level)');

    // Check if it's a single ZIP file
    const isSingleZip = fileCount === 1 && fileInput.files[0].name.toLowerCase().endsWith('.zip');

    let summary = '';

    if (isSingleZip) {
        // For ZIP files, show different confirmation message
        summary = tr(
            'restore_import.individual_notes.summary_zip_with_location',
            'This will extract and import all HTML and Markdown files from the ZIP archive into workspace "{{workspace}}", folder "{{folder}}".',
            { workspace: workspace, folder: folder }
        );
    } else {
        // Check file count limit for non-ZIP uploads
        const maxFiles = window.POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES || 50;

        if (fileCount > maxFiles) {
            showCustomAlert(
                tr('restore_import.alerts.too_many_files_title', 'Too Many Files Selected'),
                tr(
                    'restore_import.alerts.too_many_files_body',
                    'You can import a maximum of {{max}} files at once. You have selected {{count}} files. Please select fewer files and try again.',
                    { max: maxFiles, count: fileCount }
                )
            );
            return;
        }

        // Update summary text for individual files
        const fileText = fileCount === 1
            ? tr('restore_import.individual_notes.file_count_one', '1 note')
            : tr('restore_import.individual_notes.file_count_many', '{{count}} notes', { count: fileCount });

        summary = tr(
            'restore_import.individual_notes.summary_with_location',
            'This will import {{fileText}} into workspace "{{workspace}}", folder "{{folder}}".',
            { fileText: fileText, workspace: workspace, folder: folder }
        );
    }

    document.getElementById('individualNotesImportSummary').textContent = summary;
    document.getElementById('individualNotesImportConfirmModal').style.display = 'flex';
}

function hideIndividualNotesImportConfirmation() {
    document.getElementById('individualNotesImportConfirmModal').style.display = 'none';
}

function proceedWithIndividualNotesImport() {
    const form = document.getElementById('individualNotesForm');
    if (form) {
        hideIndividualNotesImportConfirmation();
        showIndividualNotesImportSpinner();
        form.submit();
    }
}

// Show/hide spinner for individual notes import
function showIndividualNotesImportSpinner() {
    try {
        const spinner = document.getElementById('individualNotesImportSpinner');
        const btn = document.getElementById('individualNotesImportBtn');
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

function hideIndividualNotesImportSpinner() {
    try {
        const spinner = document.getElementById('individualNotesImportSpinner');
        const btn = document.getElementById('individualNotesImportBtn');
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

// Direct Copy Restore Functions
let directCopyRestorePendingForm = null;
let directCopyRestoreSubmitting = false;

function showDirectCopyRestoreConfirmation(trigger) {
    resetDirectCopyRestoreProcessing();
    directCopyRestorePendingForm = trigger ? trigger.closest('form') : null;
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'flex';
}

function hideDirectCopyRestoreConfirmation() {
    if (directCopyRestoreSubmitting) return;
    directCopyRestorePendingForm = null;
    resetDirectCopyRestoreProcessing();
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'none';
}

function showDirectCopyRestoreProcessing() {
    const modal = document.getElementById('directCopyRestoreConfirmModal');
    const processing = document.getElementById('directCopyRestoreProcessing');
    if (modal) {
        modal.classList.add('is-submitting');
        modal.querySelectorAll('button').forEach(function (button) {
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
        });
    }
    if (processing) {
        processing.style.display = 'inline-flex';
        processing.setAttribute('aria-hidden', 'false');
    }
}

function resetDirectCopyRestoreProcessing() {
    directCopyRestoreSubmitting = false;
    const modal = document.getElementById('directCopyRestoreConfirmModal');
    const processing = document.getElementById('directCopyRestoreProcessing');
    if (modal) {
        modal.classList.remove('is-submitting');
        modal.querySelectorAll('button').forEach(function (button) {
            button.disabled = false;
            button.setAttribute('aria-disabled', 'false');
        });
    }
    if (processing) {
        processing.style.display = 'none';
        processing.setAttribute('aria-hidden', 'true');
    }
}

function proceedWithDirectCopyRestore() {
    const form = directCopyRestorePendingForm || document.getElementById('directCopyRestoreForm');
    directCopyRestorePendingForm = null;
    if (!form) {
        hideDirectCopyRestoreConfirmation();
        return;
    }

    directCopyRestoreSubmitting = true;
    showDirectCopyRestoreProcessing();

    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                form.submit();
            });
        });
    } else {
        setTimeout(function () {
            form.submit();
        }, 0);
    }
}

// Restore spinner functions
function showRestoreSpinner() {
    try {
        var spinner = document.getElementById('restoreSpinner');
        var btn = document.getElementById('completeRestoreBtn');
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

function hideRestoreSpinner() {
    try {
        var spinner = document.getElementById('restoreSpinner');
        var btn = document.getElementById('completeRestoreBtn');
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

// Load workspaces for individual notes import
function loadWorkspacesForImport() {
    const workspaceSelect = document.getElementById('target_workspace_select');
    if (!workspaceSelect) return;

    fetch('/api/v1/workspaces', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.workspaces) {
                workspaceSelect.innerHTML = '';

                // Get the workspace from PHP global (no more localStorage)
                const currentWorkspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace :
                    (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;

                // Add workspaces to select
                data.workspaces.forEach(workspace => {
                    const option = document.createElement('option');
                    option.value = workspace.name;
                    option.textContent = workspace.name;

                    // Select current workspace if it exists, otherwise select first one
                    if (currentWorkspace && workspace.name === currentWorkspace) {
                        option.selected = true;
                    } else if (!currentWorkspace && workspaceSelect.options.length === 0) {
                        option.selected = true;
                    }

                    workspaceSelect.appendChild(option);
                });

                // Load folders for the selected workspace
                const selectedWs = workspaceSelect.value;
                if (selectedWs) {
                    loadFoldersForImport(selectedWs);
                }
            } else {
                console.error('Failed to load workspaces:', data);
                workspaceSelect.innerHTML = '<option value="">No workspace</option>';
            }
        })
        .catch(error => {
            console.error('Error loading workspaces:', error);
            workspaceSelect.innerHTML = '<option value="">No workspace</option>';
        });
}

// Load folders for selected workspace
function loadFoldersForImport(workspace) {

    const folderSelect = document.getElementById('target_folder_select');
    if (!folderSelect) {
        console.error('folderSelect element not found!');
        return;
    }

    // Reset to "No folder" option
    folderSelect.innerHTML = '<option value="">' +
        tr('restore_import.sections.individual_notes.no_folder', 'No folder (root level)') +
        '</option>';

    if (!workspace) {
        console.log('No workspace selected, skipping folder load');
        return;
    }

    // Fetch folders for the selected workspace
    fetch('/api/v1/folders?workspace=' + encodeURIComponent(workspace) + '&hierarchical=true', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
        credentials: 'same-origin'
    })
        .then(response => response.json())
        .then(data => {

            if (data.success && data.folders) {
                // Flatten the hierarchical structure for simple display
                const flattenFolders = (folders, prefix = '') => {
                    let result = [];
                    folders.forEach(folder => {
                        const displayName = prefix + folder.name;
                        result.push({ name: folder.name, displayName: displayName });

                        if (folder.children && folder.children.length > 0) {
                            result = result.concat(flattenFolders(folder.children, displayName + ' / '));
                        }
                    });
                    return result;
                };

                const flatFolders = flattenFolders(data.folders);

                flatFolders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder.name;
                    option.textContent = folder.displayName;
                    folderSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading folders:', error);
        });
}

// Setup drag and drop visual feedback for file inputs
function setupDragAndDrop() {
    const fileInputs = [
        { id: 'individual_notes_files', key: 'restore_import.drag_drop.individual_notes', fallback: 'Drop files here' },
        { id: 'complete_backup_file', key: 'restore_import.drag_drop.complete_backup', fallback: 'Drop backup ZIP here' },
        { id: 'backup_file', key: 'restore_import.drag_drop.database', fallback: 'Drop SQL file here' },
        { id: 'notes_file', key: 'restore_import.drag_drop.notes', fallback: 'Drop notes ZIP here' },
        { id: 'attachments_file', key: 'restore_import.drag_drop.attachments', fallback: 'Drop attachments ZIP here' }
    ];

    fileInputs.forEach(config => {
        const input = document.getElementById(config.id);
        if (!input) return;

        const container = input.closest('.form-group') || input.parentElement;
        if (!container) return;

        // Create drop overlay element
        const dropOverlay = document.createElement('div');
        dropOverlay.className = 'drop-overlay';
        dropOverlay.style.display = 'none';

        const dropText = document.createElement('div');
        dropText.className = 'drop-overlay-text';
        dropText.innerHTML = '📁 <span class="drop-message"></span>';
        dropOverlay.appendChild(dropText);
        container.appendChild(dropOverlay);

        // Function to update text with translation
        const updateDropText = () => {
            const message = dropText.querySelector('.drop-message');
            if (message) {
                message.textContent = tr(config.key, config.fallback);
            }
        };

        // Update text initially and when translations load
        updateDropText();
        if (window.loadPoznoteI18n) {
            setTimeout(updateDropText, 100);
        }

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, preventDefaults, false);
        });

        // Show overlay when item is dragged over
        ['dragenter', 'dragover'].forEach(eventName => {
            container.addEventListener(eventName, () => {
                container.classList.add('drag-over');
                dropOverlay.style.display = 'flex';
                updateDropText(); // Update text on drag in case translations loaded
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, () => {
                container.classList.remove('drag-over');
                dropOverlay.style.display = 'none';
            }, false);
        });

        // Handle dropped files
        container.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0) {
                input.files = files;
                // Trigger change event to update file input display
                const event = new Event('change', { bubbles: true });
                input.dispatchEvent(event);
            }
        }, false);
    });

    // Prevent default drag behaviors on body
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Initialize cards state on page load
function initializeCardsState() {
    // All sections are closed by default (standard cards)
}

/**
 * Status Modal Helpers
 */
function showStatusAlert(title, message, onOk = null) {
    const modal = document.getElementById('statusModal');
    if (!modal) return;

    document.getElementById('statusModalTitle').textContent = title;
    document.getElementById('statusModalMessage').textContent = message;

    const confirmBtn = document.getElementById('statusModalConfirmBtn');
    const cancelBtn = document.getElementById('statusModalCancelBtn');

    if (confirmBtn) confirmBtn.style.setProperty('display', 'none', 'important');
    cancelBtn.style.setProperty('display', 'inline-flex', 'important');
    cancelBtn.textContent = 'OK';
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
        if (onOk) onOk();
    };

    modal.style.display = 'flex';
}

function showStatusConfirm(title, message, onConfirm) {
    const modal = document.getElementById('statusModal');
    if (!modal) return;

    document.getElementById('statusModalTitle').textContent = title;
    document.getElementById('statusModalMessage').textContent = message;

    const confirmBtn = document.getElementById('statusModalConfirmBtn');
    const cancelBtn = document.getElementById('statusModalCancelBtn');

    confirmBtn.style.setProperty('display', 'inline-flex', 'important');
    confirmBtn.textContent = 'OK';
    cancelBtn.style.setProperty('display', 'inline-flex', 'important');
    cancelBtn.textContent = tr('common.cancel', 'Annuler');

    cancelBtn.onclick = () => modal.style.display = 'none';
    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        onConfirm();
    };

    modal.style.display = 'flex';
}

/**
 * Maintenance / Backup
 */
