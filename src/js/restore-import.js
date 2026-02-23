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
            showDirectCopyRestoreConfirmation();
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
        } catch (e) {
            console.error('Failed to parse restore-import config:', e);
        }
    }

    // Initialize cards state (open first card by default)
    initializeCardsState();

    // Event delegation for all click actions
    document.addEventListener('click', handleRestoreImportClick);

    // Close modal when clicking outside
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('import-confirm-modal') || e.target.classList.contains('custom-alert')) {
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
            const sizeText = button ? button.parentElement.querySelector('small') : null;

            if (file && file.name.toLowerCase().endsWith('.zip')) {
                const sizeMB = file.size / (1024 * 1024);

                button.disabled = false;
                button.textContent = tr('restore_import.inline.standard.button', 'Start Complete Restore (Standard)');

                if (sizeText) {
                    if (sizeMB > 500) {
                        sizeText.textContent = tr(
                            'restore_import.inline.standard.too_large',
                            '⚠️ File is ' + sizeMB.toFixed(1) + 'MB. Standard upload may be slow or fail for large files.',
                            { size: sizeMB.toFixed(1) }
                        );
                        sizeText.style.color = '#dc3545';
                    } else {
                        sizeText.textContent = tr(
                            'restore_import.sections.standard_restore.helper',
                            'Maximum recommended size: 500MB.'
                        );
                        sizeText.style.color = '#6c757d';
                    }
                }
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

    const file = fileInput.files[0];
    const sizeMB = file.size / (1024 * 1024);

    // Update modal content based on file size
    const modal = document.getElementById('completeRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');

    if (sizeMB > 500) {
        warningText.innerHTML = tr(
            'restore_import.modals.complete_restore.warning_large_html',
            '<strong>Warning:</strong> This file is {{size}}MB. Standard upload may be slow or fail for large files.<br><br><strong>This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</strong>',
            { size: sizeMB.toFixed(1) }
        );
    } else {
        warningText.innerHTML = tr(
            'restore_import.modals.complete_restore.warning_html',
            '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.',
            null
        );
    }

    modal.style.display = 'flex';
}

function hideCompleteRestoreConfirmation() {
    document.getElementById('completeRestoreConfirmModal').style.display = 'none';
}

function proceedWithCompleteRestore() {
    const forms = document.querySelectorAll('form[method="post"]');
    const completeForm = Array.from(forms).find(form =>
        form.querySelector('input[name="action"][value="complete_restore"]')
    );
    if (completeForm) {
        // Hide confirmation modal first
        hideCompleteRestoreConfirmation();
        // Show spinner immediately
        showRestoreSpinner();
        // Submit the form
        completeForm.submit();
    } else {
        alert(tr('restore_import.errors.complete_restore_form_not_found', 'Complete restore form not found. Please try again.'));
    }
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
function showDirectCopyRestoreConfirmation() {
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'flex';
}

function hideDirectCopyRestoreConfirmation() {
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'none';
}

function proceedWithDirectCopyRestore() {
    hideDirectCopyRestoreConfirmation();
    // Submit the direct copy restore form
    let form = document.getElementById('directCopyRestoreForm');
    if (!form) {
        // Create the form if it doesn't exist
        form = document.createElement('form');
        form.method = 'post';
        form.id = 'directCopyRestoreForm';
        form.style.display = 'none';

        const actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        actionInput.value = 'restore_cli_upload';

        form.appendChild(actionInput);
        document.body.appendChild(form);
    }
    form.submit();
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

    confirmBtn.style.display = 'none';
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

    confirmBtn.style.display = 'inline-flex';
    confirmBtn.textContent = 'OK';
    cancelBtn.style.display = 'inline-flex';
    cancelBtn.textContent = tr('common.cancel', 'Annuler');

    cancelBtn.onclick = () => modal.style.display = 'none';
    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        onConfirm();
    };

    modal.style.display = 'flex';
}

/**
 * Maintenance / Disaster Recovery
 */
async function runRepair(btn) {
    const confirmTitle = tr('multiuser.admin.maintenance.repair_registry', 'Reconstruct System Index');
    const confirmMsg = tr('multiuser.admin.maintenance.repair_registry_confirm', 'This will scan all user folders and rebuild the shared links registry.');

    showStatusConfirm(confirmTitle, confirmMsg, async () => {
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="lucide lucide-loader-2 lucide-spin"></i> ' + tr('multiuser.admin.processing', 'Processing...');

        try {
            const response = await fetch('/api/v1/admin/repair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin'
            });
            const result = await response.json();

            if (result.success) {
                let successMsg = tr('multiuser.admin.maintenance.repair_registry_success', "System registry repaired successfully:\n- {{scanned}} folders scanned\n- {{added}} users restored\n- {{links}} shared links rebuilt");
                successMsg = successMsg
                    .replace('{{scanned}}', result.stats.users_scanned)
                    .replace('{{added}}', result.stats.users_added)
                    .replace('{{links}}', result.stats.links_rebuilt);

                if (result.stats.errors && result.stats.errors.length > 0) {
                    successMsg += '\n\n' + tr('multiuser.admin.errors_label', 'Errors:') + '\n' + result.stats.errors.join('\n');
                }

                showStatusAlert(confirmTitle, successMsg, () => window.location.reload());
            } else {
                const errorMsg = tr('multiuser.admin.maintenance.repair_registry_error', 'Repair error: {{error}}');
                showStatusAlert(confirmTitle, errorMsg.replace('{{error}}', result.error));
            }
        } catch (e) {
            const networkErrorPrefix = tr('multiuser.admin.network_error', 'Network error: ');
            showStatusAlert(confirmTitle, networkErrorPrefix + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    });
}
