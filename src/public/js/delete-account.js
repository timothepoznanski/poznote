/**
 * Delete Account functionality for Settings page
 * Handles the delete account card, confirmation modal, and API call.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };

    function getPageConfig() {
        return (typeof window.getPoznotePageConfig === 'function') ? window.getPoznotePageConfig() : null;
    }

    function getUsername() {
        var config = getPageConfig();
        if (config && config.profile && config.profile.username) {
            return String(config.profile.username);
        }
        var badge = document.getElementById('profile-username-badge');
        return badge ? badge.textContent.trim() : '';
    }

    function isOidcSession() {
        var config = getPageConfig();
        return !!(config && config.isOidcSession);
    }

    // ========== Confirmation Modal ==========

    function createDeleteAccountModal(username) {
        var existing = document.getElementById('deleteAccountModal');
        if (existing) existing.remove();

        var passwordField = isOidcSession() ? '' :
            '<div class="form-group" style="margin-bottom: 8px;">' +
                '<input type="password" id="daPassword" autocomplete="current-password" placeholder="' + tr('delete_account.modal.password_placeholder', {}, 'Current password') + '" style="width:100%;box-sizing:border-box;">' +
            '</div>';

        var modal = document.createElement('div');
        modal.id = 'deleteAccountModal';
        modal.className = 'modal';

        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + tr('delete_account.modal.title', {}, 'Delete Account') + '</h3>' +
                '<p class="delete-account-description">' + tr('delete_account.modal.description', { username: escapeHtml(username) }, 'You are about to delete your account "{{username}}".') + '</p>' +
                // Same breakdown as the admin delete modal: what goes, and the
                // fact that nothing is kept anywhere afterwards.
                '<div class="delete-warning-box">' +
                    '<p class="delete-warning">' +
                        '<i class="lucide-alert-triangle"></i> ' +
                        tr('delete_account.modal.warning_everything', {}, 'Everything belonging to your account will be deleted immediately and permanently.') +
                    '</p>' +
                    '<ul class="delete-warning-list">' +
                        '<li>' + tr('delete_account.modal.warning_item_data', {}, 'Your notes, folders, tags and attachments') + '</li>' +
                        '<li>' + tr('delete_account.modal.warning_item_s3', {}, 'Your attachments and backup archives stored in the S3 buckets') + '</li>' +
                    '</ul>' +
                    '<p class="delete-warning-recovery">' +
                        tr('delete_account.modal.warning_no_recovery', {}, 'There is no recovery: nothing is kept, and no backup is created beforehand. If this data still matters, download a complete backup ZIP before deleting.') +
                    '</p>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<input type="text" id="daConfirmUsername" autocomplete="off" placeholder="' + tr('delete_account.modal.confirm_placeholder', {}, 'Type your username to confirm') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                passwordField +
                '<div id="daError" class="error" style="color:#dc3545;margin-bottom:10px;display:none;"></div>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-secondary" id="daCancelBtn">' + tr('common.cancel', {}, 'Cancel') + '</button>' +
                    '<button type="button" class="btn-danger" id="daDeleteBtn" disabled>' + tr('delete_account.modal.button', {}, 'Delete my account') + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        return modal;
    }

    function showDeleteAccountModal() {
        var username = getUsername();
        var modal = createDeleteAccountModal(username);

        var confirmInput = document.getElementById('daConfirmUsername');
        var deleteBtn = document.getElementById('daDeleteBtn');

        function usernameMatches() {
            return confirmInput.value.trim() === username;
        }

        confirmInput.addEventListener('input', function () {
            deleteBtn.disabled = !usernameMatches();
        });

        modal.style.display = 'flex';
        confirmInput.focus();

        document.getElementById('daCancelBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });

        deleteBtn.addEventListener('click', function () {
            if (usernameMatches()) submitDeleteAccount();
        });

        var passwordInput = document.getElementById('daPassword');
        var lastInput = passwordInput || confirmInput;
        lastInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && usernameMatches()) submitDeleteAccount();
        });
    }

    function translateDeleteError(msg) {
        var known = {
            'Username confirmation does not match': ['delete_account.errors.confirm_mismatch', 'Username confirmation does not match'],
            'Password is required': ['delete_account.errors.password_required', 'Password is required'],
            'Password is incorrect': ['delete_account.errors.password_incorrect', 'Password is incorrect'],
            'Cannot delete user ID 1': ['delete_account.errors.cannot_delete', 'This account cannot be deleted'],
            'Cannot delete the last admin user': ['delete_account.errors.last_admin', 'The last administrator account cannot be deleted'],
            'Could not delete the user data files': ['delete_account.errors.data_not_deleted', 'Your files could not be deleted, so the account was kept. Please contact the administrator.']
        };
        if (known[msg]) {
            return tr(known[msg][0], {}, known[msg][1]);
        }
        return msg || tr('common.error', {}, 'Error');
    }

    function submitDeleteAccount() {
        var confirmInput = document.getElementById('daConfirmUsername');
        var passwordInput = document.getElementById('daPassword');
        var errorEl = document.getElementById('daError');
        var deleteBtn = document.getElementById('daDeleteBtn');

        errorEl.style.display = 'none';

        if (passwordInput && !passwordInput.value) {
            errorEl.textContent = tr('delete_account.errors.password_required', {}, 'Password is required');
            errorEl.style.display = 'block';
            return;
        }

        deleteBtn.disabled = true;
        deleteBtn.textContent = tr('common.loading', {}, 'Loading...');

        fetch('/api/v1/users/me', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                confirm_username: confirmInput.value.trim(),
                password: passwordInput ? passwordInput.value : ''
            })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.success) {
                    // The account is gone, so its open tabs and display
                    // preferences must not outlive it in this browser.
                    if (typeof window.__poznoteClearUserStorage === 'function') {
                        window.__poznoteClearUserStorage();
                    }
                    window.location.href = data.redirect || 'login.php';
                } else {
                    deleteBtn.disabled = false;
                    deleteBtn.textContent = tr('delete_account.modal.button', {}, 'Delete my account');
                    errorEl.textContent = translateDeleteError(data && data.error);
                    errorEl.style.display = 'block';
                }
            })
            .catch(function () {
                deleteBtn.disabled = false;
                deleteBtn.textContent = tr('delete_account.modal.button', {}, 'Delete my account');
                errorEl.textContent = tr('common.error', {}, 'Error');
                errorEl.style.display = 'block';
            });
    }

    // ========== Init ==========

    function initDeleteAccount() {
        var card = document.getElementById('delete-account-card');
        if (card) {
            card.addEventListener('click', showDeleteAccountModal);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDeleteAccount);
    } else {
        initDeleteAccount();
    }
})();
