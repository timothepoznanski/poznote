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

        // Pending upload cancellation (either flow)
        case 'cancel-pending-restore-upload':
            cancelPendingRestoreUpload();
            break;
        case 'cancel-pending-notes-import-upload':
            cancelPendingNotesImportUpload();
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

    // A restore or notes import launched earlier (or from another tab) may
    // still be running on the server: pick its status back up instead of
    // showing nothing.
    chunkedRestoreResume();
    notesImportResume();

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

// pendingFile: the archive the user picked while another upload still held
// the slot, started as soon as that one is cancelled.
const chunkedRestore = {
    pollTimer: null,
    uploading: false,
    pendingFile: null,
    foreignJob: null,
    lastBeatAt: 0
};

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
        cancel: document.getElementById('chunkedRestoreCancelBtn'),
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
    // Only an upload this page is not driving offers a cancel button; every
    // other state hides it again.
    if (els.cancel) els.cancel.classList.add('initially-hidden');
    if (els.bar) els.bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (els.statusText) els.statusText.textContent = text;
}

/**
 * An upload registered for this account that this page is not sending: it
 * belongs to another tab, or to a page that has since been closed. Its
 * progress is shown like any other stage, plus a way out for the user who
 * has no idea which tab it was.
 */
function chunkedRestoreShowForeignUpload(job) {
    chunkedRestore.foreignJob = job;
    chunkedRestoreShowProgress(restoreFamilyUploadPercent(job), restoreFamilyUploadLabel(job));
    const els = chunkedRestoreEls();
    if (els.cancel) {
        els.cancel.classList.remove('initially-hidden');
        els.cancel.disabled = false;
    }
}

/** Completion state: full bar, no spinner, summary below, chooser on top. */
function chunkedRestoreShowDone(summary) {
    const els = chunkedRestoreEls();
    if (els.progress) {
        els.progress.classList.remove('initially-hidden');
        const circle = els.progress.querySelector('.restore-spinner-circle');
        if (circle) circle.style.display = 'none';
    }
    if (els.cancel) els.cancel.classList.add('initially-hidden');
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
    if (els.cancel) els.cancel.classList.add('initially-hidden');
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

// Leaving for real ends the transfer, whatever the warning above got as an
// answer. Dropping the beat here is what lets the next visit say the upload
// was interrupted instead of showing a bar that will never move again.
window.addEventListener('pagehide', function () {
    if (chunkedRestore.uploading) restoreUploadBeatClear();
});

/**
 * POST FormData to the restore upload endpoint, expecting JSON back. The
 * whole response body rides on the rejection too: a refusal can carry the
 * job that caused it (409 busy), and the caller shows that job rather than
 * a dead end.
 */
function chunkedRestoreFetch(body) {
    return fetch('api_restore_upload.php', { method: 'POST', credentials: 'same-origin', body: body })
        .then(async function (r) {
            let data = null;
            try { data = await r.json(); } catch (e) { /* proxy error page */ }
            if (!data || !data.success) {
                const err = new Error((data && data.error) || ('HTTP ' + r.status));
                err.data = data;
                throw err;
            }
            return data;
        });
}

// ========================================
// Shared restore-family job helpers
// ========================================
// The complete restore and the notes import cannot run at the same time
// (both rewrite the account's data), so either one may be refused because of
// the other, and either may still be running when the page is reloaded.
// These helpers route a job to the card that owns it, whichever flow asked.

function restoreFamilyJobIsImport(job) {
    return !!job && job.type === 'notes_import';
}

// ---- Who is still sending? ----------------------------------------------
// The slices only ever travel from the tab that holds the file, so no server
// state can tell a transfer still running in another tab from one whose tab
// was closed: the server only sees that no slice arrived lately, and waits
// three minutes before calling it abandoned. The sending tab therefore leaves
// a heartbeat in this browser's storage and drops it on the way out, so a
// page coming back knows at once whether anyone is still pushing bytes.
// One key for both flows: only one restore-family upload may run at a time.

const RESTORE_UPLOAD_BEAT_KEY = 'poznote-restore-upload-beat';
// Only a crash lets a beat expire (leaving the page clears it), so the window
// can be wide enough to cover a transfer stalled on a bad connection.
const RESTORE_UPLOAD_BEAT_MAX_AGE_MS = 120000;

function restoreUploadBeatStore() {
    return window.__poznoteUserStorage || window.localStorage;
}

/** Claim, or renew, this tab's ownership of the upload for `jobId`. */
function restoreUploadBeat(jobId) {
    try {
        restoreUploadBeatStore().setItem(RESTORE_UPLOAD_BEAT_KEY, JSON.stringify({ id: jobId, ts: Date.now() }));
    } catch (e) { /* storage refused: the server's own window still applies */ }
}

/**
 * Renew at most every couple of seconds: this runs on transfer progress
 * events, which fire far too often to write storage each time.
 */
function restoreUploadBeatTick(jobId) {
    const now = Date.now();
    if (now - (chunkedRestore.lastBeatAt || 0) < 2000) return;
    chunkedRestore.lastBeatAt = now;
    restoreUploadBeat(jobId);
}

function restoreUploadBeatClear() {
    try {
        restoreUploadBeatStore().removeItem(RESTORE_UPLOAD_BEAT_KEY);
    } catch (e) { /* nothing to clear */ }
}

/**
 * True while a tab of this browser is still sending slices for this job. No
 * beat is the ordinary case after a page was closed mid-transfer; it can also
 * mean the upload runs on another device, which is why nothing is discarded
 * without the user asking for it.
 */
function restoreUploadIsBeating(jobId) {
    let beat = null;
    try {
        beat = JSON.parse(restoreUploadBeatStore().getItem(RESTORE_UPLOAD_BEAT_KEY) || 'null');
    } catch (e) { /* unreadable or absent */ }
    return !!beat && beat.id === jobId && (Date.now() - beat.ts) < RESTORE_UPLOAD_BEAT_MAX_AGE_MS;
}

/** An upload the server still holds that nobody is feeding any more. */
function restoreFamilyUploadIsAbandoned(job) {
    return !!job && job.status === 'uploading' && (job.stale || !restoreUploadIsBeating(job.id));
}

/** The job a 409 refusal named, or null when the failure was something else. */
function restoreFamilyBusyJob(err) {
    const data = err && err.data;
    return (data && data.busy && data.job) ? data.job : null;
}

/**
 * True while a job can still change on its own, so following it is worth a
 * poll. An upload nobody feeds any more and a job whose worker died are both
 * final: the server treats them as abandoned and lets the next attempt take
 * their slot.
 */
function restoreFamilyJobIsLive(job) {
    if (!job) return false;
    if (job.status === 'uploading') return !restoreFamilyUploadIsAbandoned(job);
    return (job.status === 'queued' || job.status === 'running') && !job.stale;
}

/** Show a job (and follow it) in whichever card owns its flow. */
function restoreFamilyRenderJob(job) {
    if (restoreFamilyJobIsImport(job)) {
        notesImportOpenCard();
        notesImportSetBusy(true);
        notesImportRenderJob(job);
        if (restoreFamilyJobIsLive(job)) notesImportPoll(job.id);
    } else {
        chunkedRestoreOpenCards();
        chunkedRestoreSetBusy(true);
        chunkedRestoreRenderJob(job);
        if (restoreFamilyJobIsLive(job)) chunkedRestorePoll(job.id);
    }
}

/**
 * Bar position of an upload this page is not driving: the slice count is the
 * only progress the server can report, since the bytes travel from the tab
 * that holds the file.
 */
function restoreFamilyUploadPercent(job) {
    const total = job.total_chunks || 0;
    const done = job.received_chunks || 0;
    return total > 0 ? Math.min(1, done / total) * CHUNKED_RESTORE_UPLOAD_SPAN : 0;
}

function restoreFamilyUploadLabel(job) {
    return chunkedRestoreText(
        'foreign_upload',
        'An upload is already in progress in another tab or window ({{done}}/{{total}} slices sent).',
        { done: job.received_chunks || 0, total: job.total_chunks || 0 }
    );
}

/** How far the abandoned transfer had got, for the message that reports it. */
function restoreFamilyUploadCounts(job) {
    return { done: job.received_chunks || 0, total: job.total_chunks || 0 };
}

/** Drop an unfinished upload (any flow), so a new one may start at once. */
function restoreFamilyAbortJob(job) {
    const body = new FormData();
    body.append('action', 'abort');
    body.append('csrf_token', chunkedRestoreConfig().csrfToken || '');
    if (restoreFamilyJobIsImport(job)) body.append('job_type', 'notes_import');
    body.append('upload_id', job.id);
    return chunkedRestoreFetch(body).catch(function () { /* already gone */ });
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

/**
 * Send a whole file in slices to the chunked upload endpoint; resolves with
 * the queued job state. Shared by the complete restore and the notes import:
 * opts carries the job type, extra init fields (import destination) and the
 * two progress callbacks.
 */
async function chunkedUploadFile(file, opts) {
    const cfg = chunkedRestoreConfig();
    const chunkBytes = window.POZNOTE_UPLOAD_CHUNK_BYTES || cfg.restoreChunkBytes || (32 * 1024 * 1024);
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkBytes));
    const csrf = cfg.csrfToken || '';
    const jobType = opts.jobType || '';

    const initBody = new FormData();
    initBody.append('action', 'init');
    initBody.append('csrf_token', csrf);
    if (jobType) initBody.append('job_type', jobType);
    initBody.append('filename', file.name);
    initBody.append('total_size', String(file.size));
    initBody.append('total_chunks', String(totalChunks));
    for (const key in (opts.initFields || {})) {
        initBody.append(key, String(opts.initFields[key]));
    }
    const initData = await chunkedRestoreFetch(initBody);
    const uploadId = initData.upload_id;

    chunkedRestore.uploading = true;
    restoreUploadBeat(uploadId);
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
                    if (jobType) fd.append('job_type', jobType);
                    fd.append('upload_id', uploadId);
                    fd.append('chunk_index', String(i));
                    fd.append('chunk', blob, 'chunk');
                    await chunkedRestoreSendChunk(fd, function (loaded) {
                        // Transfer progress keeps firing even in a background
                        // tab, where timers are throttled to once a minute, so
                        // this is the reliable place to renew the beat.
                        restoreUploadBeatTick(uploadId);
                        opts.renderProgress(sent + loaded, file.size);
                    });
                    break;
                } catch (e) {
                    // A transient failure (flaky connection, proxy hiccup)
                    // only costs this slice: retry it a couple of times
                    // before giving up on the whole upload.
                    attempt++;
                    if (attempt >= 3) throw e;
                    opts.renderRetry(sent, file.size);
                    await new Promise(function (r) { setTimeout(r, 2000); });
                }
            }
            sent += blob.size;
            restoreUploadBeat(uploadId);
            opts.renderProgress(sent, file.size);
        }

        const finBody = new FormData();
        finBody.append('action', 'finalize');
        finBody.append('csrf_token', csrf);
        if (jobType) finBody.append('job_type', jobType);
        finBody.append('upload_id', uploadId);
        const finData = await chunkedRestoreFetch(finBody);
        return finData.job;
    } finally {
        chunkedRestore.uploading = false;
        restoreUploadBeatClear();
    }
}

/** Send the whole restore archive in slices; resolves with the job state. */
function chunkedRestoreUpload(file) {
    return chunkedUploadFile(file, {
        renderProgress: function (sentBytes, totalBytes) {
            chunkedRestoreRenderUpload(sentBytes, totalBytes);
        },
        renderRetry: function (sentBytes, totalBytes) {
            // Same scale as chunkedRestoreRenderUpload: a raw percentage
            // here would jump the bar forward, then back.
            chunkedRestoreShowProgress(
                (totalBytes > 0 ? sentBytes / totalBytes : 0) * CHUNKED_RESTORE_UPLOAD_SPAN,
                chunkedRestoreText('chunkRetry', 'A slice failed to upload, retrying...')
            );
        }
    });
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
    if (job.status === 'uploading') {
        if (!restoreFamilyUploadIsAbandoned(job)) {
            // A tab of this browser is still sending: follow its slice count,
            // it may well be about to finish.
            chunkedRestoreShowForeignUpload(job);
            return;
        }
        // Nobody is pushing bytes any more: the page that held the file is
        // gone and this upload can never complete. Say where it stopped and
        // hand the card back; starting again clears the leftover.
        chunkedRestoreStopPolling();
        chunkedRestoreShowResult(false, chunkedRestoreText(
            'upload_interrupted',
            'The previous upload was interrupted after {{done}} of {{total}} slices, so nothing was restored. You can start the restore again.',
            restoreFamilyUploadCounts(job)
        ));
        return;
    }
    if (job.status === 'queued' || job.status === 'running') {
        if (!job.stale) {
            chunkedRestoreShowProgress(chunkedRestoreJobPercent(job), chunkedRestoreStageLabel(job));
            return;
        }
        // The worker has not touched the job for half an hour: it was killed
        // (container restart, out of memory). Nothing will move again, so
        // report it rather than spin on a frozen bar.
        chunkedRestoreStopPolling();
        chunkedRestoreShowResult(false, chunkedRestoreText(
            'worker_lost',
            'The restore stopped before it finished. Check the server logs, then start it again.'
        ));
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

async function startChunkedRestore(file, retried) {
    chunkedRestoreSetBusy(true);
    chunkedRestoreRenderUpload(0, file.size);
    try {
        const job = await chunkedRestoreUpload(file);
        chunkedRestoreRenderJob(job);
        chunkedRestorePoll(job.id);
    } catch (e) {
        const busy = restoreFamilyBusyJob(e);
        if (busy) {
            // An upload nobody feeds any more holds the slot on paper only.
            // Clear it and go, rather than making the user sit out the
            // server's abandon window for a tab they already closed.
            if (!retried && restoreFamilyUploadIsAbandoned(busy)) {
                await restoreFamilyAbortJob(busy);
                return startChunkedRestore(file, true);
            }
            // Something really is running: show it instead of refusing,
            // exactly like a reloaded page does. A live upload keeps the
            // chosen file aside, so cancelling it starts this restore
            // straight away. Only when that upload belongs to this card,
            // though: its cancel button is the one that would start the file.
            if (busy.status === 'uploading' && !restoreFamilyJobIsImport(busy)) {
                chunkedRestore.pendingFile = file;
            }
            restoreFamilyRenderJob(busy);
            if (restoreFamilyJobIsImport(busy)) {
                chunkedRestoreShowResult(false, e.message);
            }
            return;
        }
        chunkedRestoreShowResult(false, chunkedRestoreText('uploadError', 'The upload failed: {{error}}', { error: e.message }));
    }
}

/**
 * Drop the pending upload shown in the restore card. When the user got here
 * by trying to start a restore of their own, that restore starts as soon as
 * the slot is free.
 */
function cancelPendingRestoreUpload() {
    const job = chunkedRestore.foreignJob;
    if (!job) return;
    const els = chunkedRestoreEls();
    if (els.cancel) els.cancel.disabled = true;
    chunkedRestoreStopPolling();
    chunkedRestore.foreignJob = null;
    restoreFamilyAbortJob(job)
        .then(function () {
            const file = chunkedRestore.pendingFile;
            chunkedRestore.pendingFile = null;
            if (file) {
                startChunkedRestore(file);
                return;
            }
            chunkedRestoreShowResult(false, chunkedRestoreText(
                'upload_cancelled',
                'The pending upload was cancelled. You can start the restore again.'
            ));
        });
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
function startS3Restore(s3Key, retried) {
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
            const busy = restoreFamilyBusyJob(e);
            if (busy) {
                if (!retried && restoreFamilyUploadIsAbandoned(busy)) {
                    return restoreFamilyAbortJob(busy).then(function () {
                        return startS3Restore(s3Key, true);
                    });
                }
                restoreFamilyRenderJob(busy);
                if (restoreFamilyJobIsImport(busy)) chunkedRestoreShowResult(false, e.message);
                return;
            }
            chunkedRestoreShowResult(false, chunkedRestoreText('error', 'The restore failed: {{error}}', { error: e.message }));
        });
}

function chunkedRestoreResume() {
    fetch('api_restore_upload.php?action=status', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.job) return;
            const status = data.job.status;
            // 'uploading' included: an upload left behind by a closed tab
            // would otherwise be invisible here and refuse the next restore
            // with an error about a tab the user cannot find.
            if (status === 'queued' || status === 'running' || status === 'uploading') {
                chunkedRestoreOpenCards();
                chunkedRestoreSetBusy(true);
                chunkedRestoreRenderJob(data.job);
                if (restoreFamilyJobIsLive(data.job)) chunkedRestorePoll(data.job.id);
            }
            // A finished or failed run from an earlier visit is not
            // resurfaced: its outcome was shown when it happened.
        })
        .catch(function () { /* nothing to resume */ });
}

// ========================================
// Chunked individual-notes ZIP import
// ========================================
// Same mechanics as the chunked restore above, for the "import a ZIP of
// notes" flow: a large archive (an Obsidian vault full of images, a big
// Poznote notes export) travels in slices, then a server-side worker runs
// the import outside any HTTP request. This page polls the job status and
// renders it into the individual-notes card's own progress bar.

const notesImportJob = { pollTimer: null, pendingUpload: null, foreignJob: null };

function notesImportEls() {
    return {
        progress: document.getElementById('notesImportProgress'),
        bar: document.getElementById('notesImportBar'),
        statusText: document.getElementById('notesImportStatusText'),
        cancel: document.getElementById('notesImportCancelBtn'),
        error: document.getElementById('notesImportError'),
        success: document.getElementById('notesImportSuccess'),
        button: document.getElementById('individualNotesImportBtn')
    };
}

/** The import card is closed by default; a resumed or adopted job needs it open. */
function notesImportOpenCard() {
    const content = document.getElementById('individualNotesContent');
    if (content) content.classList.add('open');
    const header = document.querySelector('[data-target="individualNotesContent"]');
    const chevron = header ? header.querySelector('.chevron') : null;
    if (chevron) chevron.classList.add('open');
}

// The upload takes the bar's first span (like the restore), then the
// worker's stages share the rest: assembling the slices, scanning the
// archive for images/attachments, then importing the notes.
const NOTES_IMPORT_STAGES = {
    assembling:  { from: 60, to: 66 },
    preparing:   { from: 66, to: 70 },
    attachments: { from: 70, to: 85 },
    notes:       { from: 85, to: 99 }
};

function notesImportSetBusy(busy) {
    const els = notesImportEls();
    if (els.button) els.button.disabled = busy;
}

function notesImportShowProgress(percent, text) {
    const els = notesImportEls();
    if (els.error) els.error.classList.add('initially-hidden');
    if (els.success) els.success.classList.add('initially-hidden');
    if (els.progress) {
        els.progress.classList.remove('initially-hidden');
        const circle = els.progress.querySelector('.restore-spinner-circle');
        if (circle) circle.style.display = '';
    }
    if (els.cancel) els.cancel.classList.add('initially-hidden');
    if (els.bar) els.bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (els.statusText) els.statusText.textContent = text;
}

/** An upload this page is not sending (another tab, or a closed one). */
function notesImportShowForeignUpload(job) {
    notesImportJob.foreignJob = job;
    notesImportShowProgress(restoreFamilyUploadPercent(job), restoreFamilyUploadLabel(job));
    const els = notesImportEls();
    if (els.cancel) {
        els.cancel.classList.remove('initially-hidden');
        els.cancel.disabled = false;
    }
}

/** Completion state: full bar, no spinner, import summary below. */
function notesImportShowDone(summary) {
    const els = notesImportEls();
    if (els.progress) {
        els.progress.classList.remove('initially-hidden');
        const circle = els.progress.querySelector('.restore-spinner-circle');
        if (circle) circle.style.display = 'none';
    }
    if (els.cancel) els.cancel.classList.add('initially-hidden');
    if (els.bar) els.bar.style.width = '100%';
    if (els.statusText) els.statusText.textContent = chunkedRestoreText('import_done', 'Import completed successfully.');
    if (els.error) els.error.classList.add('initially-hidden');
    if (els.success) {
        els.success.textContent = summary;
        els.success.classList.remove('initially-hidden');
    }
    notesImportSetBusy(false);
}

function notesImportShowError(text) {
    const els = notesImportEls();
    if (els.progress) els.progress.classList.add('initially-hidden');
    if (els.cancel) els.cancel.classList.add('initially-hidden');
    if (els.success) els.success.classList.add('initially-hidden');
    if (els.error) {
        els.error.textContent = text;
        els.error.classList.remove('initially-hidden');
    }
    notesImportSetBusy(false);
}

function notesImportJobPercent(job) {
    if (job.status === 'done') return 100;
    const span = NOTES_IMPORT_STAGES[job.stage];
    if (!span) {
        // No stage yet (just queued): the upload span is already travelled.
        return CHUNKED_RESTORE_UPLOAD_SPAN;
    }
    let fraction = 0;
    if (job.stage_total > 0 && job.stage_done !== null && job.stage_done !== undefined) {
        fraction = Math.max(0, Math.min(1, job.stage_done / job.stage_total));
    }
    return span.from + (span.to - span.from) * fraction;
}

function notesImportStageLabel(job) {
    const counts = (job.stage_total > 0)
        ? { done: job.stage_done || 0, total: job.stage_total }
        : null;
    switch (job.stage) {
        case 'assembling':
            return chunkedRestoreText('stage_assembling', 'Assembling the archive on the server...');
        case 'preparing':
            return chunkedRestoreText('import_stage_preparing', 'Reading the archive...');
        case 'attachments':
            return counts
                ? chunkedRestoreText('import_stage_attachments', 'Importing the images and attachments... ({{done}}/{{total}} files scanned)', counts)
                : chunkedRestoreText('import_stage_attachments_simple', 'Importing the images and attachments...');
        case 'notes':
            return counts
                ? chunkedRestoreText('import_stage_notes', 'Importing the notes... ({{done}}/{{total}})', counts)
                : chunkedRestoreText('import_stage_notes_simple', 'Importing the notes...');
        default:
            return chunkedRestoreText('import_queued_uploaded', 'Upload complete, import starting...');
    }
}

function notesImportRenderUpload(sentBytes, totalBytes) {
    const fraction = totalBytes > 0 ? Math.min(1, sentBytes / totalBytes) : 0;
    notesImportShowProgress(fraction * CHUNKED_RESTORE_UPLOAD_SPAN, chunkedRestoreText(
        'uploading',
        'Uploading the archive... {{percent}}% ({{done}} of {{total}})',
        {
            percent: (fraction * 100).toFixed(0),
            done: formatFileSize(Math.min(sentBytes, totalBytes)),
            total: formatFileSize(totalBytes)
        }
    ));
}

function notesImportStopPolling() {
    if (notesImportJob.pollTimer) {
        clearInterval(notesImportJob.pollTimer);
        notesImportJob.pollTimer = null;
    }
}

function notesImportRenderJob(job) {
    if (!job) {
        notesImportStopPolling();
        return;
    }
    if (job.status === 'uploading') {
        if (!restoreFamilyUploadIsAbandoned(job)) {
            notesImportShowForeignUpload(job);
            return;
        }
        notesImportStopPolling();
        notesImportShowError(chunkedRestoreText(
            'import_upload_interrupted',
            'The previous upload was interrupted after {{done}} of {{total}} slices, so nothing was imported. You can start the import again.',
            restoreFamilyUploadCounts(job)
        ));
        return;
    }
    if (job.status === 'queued' || job.status === 'running') {
        if (!job.stale) {
            notesImportShowProgress(notesImportJobPercent(job), notesImportStageLabel(job));
            return;
        }
        notesImportStopPolling();
        notesImportShowError(chunkedRestoreText(
            'import_worker_lost',
            'The import stopped before it finished. Check the server logs, then start it again.'
        ));
        return;
    }
    notesImportStopPolling();
    if (job.status === 'done') {
        notesImportShowDone(job.message || chunkedRestoreText('import_done', 'Import completed successfully.'));
    } else if (job.status === 'error') {
        notesImportShowError(chunkedRestoreText('import_error', 'The import failed: {{error}}', { error: job.error || 'unknown' }));
    }
}

function notesImportPoll(uploadId) {
    notesImportStopPolling();
    const poll = function () {
        fetch('api_restore_upload.php?action=status&job_type=notes_import&upload_id=' + encodeURIComponent(uploadId), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) notesImportRenderJob(data.job);
            })
            .catch(function () { /* transient network error: keep polling */ });
    };
    notesImportJob.pollTimer = setInterval(poll, window.POZNOTE_RESTORE_POLL_MS || 3000);
    poll();
}

async function startChunkedNotesImport(file, workspace, folder, retried) {
    notesImportSetBusy(true);
    notesImportRenderUpload(0, file.size);
    try {
        const job = await chunkedUploadFile(file, {
            jobType: 'notes_import',
            initFields: {
                target_workspace: workspace || '',
                target_folder: folder || ''
            },
            renderProgress: notesImportRenderUpload,
            renderRetry: function (sentBytes, totalBytes) {
                notesImportShowProgress(
                    (totalBytes > 0 ? sentBytes / totalBytes : 0) * CHUNKED_RESTORE_UPLOAD_SPAN,
                    chunkedRestoreText('chunkRetry', 'A slice failed to upload, retrying...')
                );
            }
        });
        notesImportRenderJob(job);
        notesImportPoll(job.id);
    } catch (e) {
        const busy = restoreFamilyBusyJob(e);
        if (busy) {
            if (!retried && restoreFamilyUploadIsAbandoned(busy)) {
                await restoreFamilyAbortJob(busy);
                return startChunkedNotesImport(file, workspace, folder, true);
            }
            if (busy.status === 'uploading' && restoreFamilyJobIsImport(busy)) {
                notesImportJob.pendingUpload = { file: file, workspace: workspace, folder: folder };
            }
            restoreFamilyRenderJob(busy);
            if (!restoreFamilyJobIsImport(busy)) {
                notesImportShowError(e.message);
            }
            return;
        }
        notesImportShowError(chunkedRestoreText('uploadError', 'The upload failed: {{error}}', { error: e.message }));
    }
}

/** Drop the pending upload shown in the import card, then start the user's own. */
function cancelPendingNotesImportUpload() {
    const job = notesImportJob.foreignJob;
    if (!job) return;
    const els = notesImportEls();
    if (els.cancel) els.cancel.disabled = true;
    notesImportStopPolling();
    notesImportJob.foreignJob = null;
    restoreFamilyAbortJob(job)
        .then(function () {
            const pending = notesImportJob.pendingUpload;
            notesImportJob.pendingUpload = null;
            if (pending) {
                startChunkedNotesImport(pending.file, pending.workspace, pending.folder);
                return;
            }
            notesImportShowError(chunkedRestoreText(
                'upload_cancelled',
                'The pending upload was cancelled. You can start the restore again.'
            ));
        });
}

// An import launched earlier (or from another tab) may still be running on
// the server: pick its status back up. Its card is closed by default, so
// open it or the progress bar would be invisible on a reloaded page.
function notesImportResume() {
    fetch('api_restore_upload.php?action=status&job_type=notes_import', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.job) return;
            const status = data.job.status;
            if (status === 'queued' || status === 'running' || status === 'uploading') {
                notesImportOpenCard();
                notesImportSetBusy(true);
                notesImportRenderJob(data.job);
                if (restoreFamilyJobIsLive(data.job)) notesImportPoll(data.job.id);
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
    if (!form) return;
    hideIndividualNotesImportConfirmation();

    const fileInput = document.getElementById('individual_notes_files');
    const files = fileInput ? fileInput.files : [];
    const isSingleZip = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');

    if (isSingleZip) {
        // A ZIP can be arbitrarily large (an Obsidian vault full of images,
        // a big notes export): send it in slices and run the import as a
        // background job, like the complete restore, so neither a proxy
        // body-size limit nor an HTTP timeout can interrupt it.
        const workspaceSelect = document.getElementById('target_workspace_select');
        const folderSelect = document.getElementById('target_folder_select');
        startChunkedNotesImport(
            files[0],
            workspaceSelect ? workspaceSelect.value : '',
            folderSelect ? folderSelect.value : ''
        );
        return;
    }

    // A handful of individual note files stays a plain synchronous POST.
    showIndividualNotesImportSpinner();
    form.submit();
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
