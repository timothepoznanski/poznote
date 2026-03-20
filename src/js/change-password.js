/**
 * Password Change functionality for Settings page
 * Handles the password change card, modal, and API calls.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };

    // ========== Password Status Badge ==========

    function refreshPasswordStatusBadge() {
        var badge = document.getElementById('password-status-badge');
        if (!badge) return;

        fetch('/api/v1/users/me/password-status', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.has_custom_password) {
                    badge.textContent = tr('password.status.custom', {}, 'Custom password');
                    badge.className = 'setting-status enabled';
                } else {
                    badge.textContent = tr('password.status.default', {}, 'Default (env)');
                    badge.className = 'setting-status disabled';
                }
            })
            .catch(function () {
                badge.textContent = '';
                badge.className = 'setting-status';
            });
    }

    // ========== Password Change Modal ==========

    function createPasswordModal() {
        var existing = document.getElementById('changePasswordModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'changePasswordModal';
        modal.className = 'modal';

        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + tr('password.modal.title', {}, 'Change Password') + '</h3>' +
                '<p class="text-small-muted change-password-description">' + tr('password.modal.description', {}, 'Enter your current password and choose a new one.') + '</p>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<input type="password" id="cpCurrentPassword" autocomplete="current-password" placeholder="' + tr('password.modal.current', {}, 'Current password') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<input type="password" id="cpNewPassword" autocomplete="new-password" placeholder="' + tr('password.modal.new', {}, 'New password') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<input type="password" id="cpConfirmPassword" autocomplete="new-password" placeholder="' + tr('password.modal.confirm', {}, 'Confirm new password') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div id="cpError" class="error" style="color:#dc3545;margin-bottom:10px;display:none;"></div>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-danger" id="cpCancelBtn">' + tr('common.cancel', {}, 'Cancel') + '</button>' +
                    '<button type="button" class="btn-primary" id="cpSaveBtn">' + tr('common.save', {}, 'Save') + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        return modal;
    }

    function showPasswordModal() {
        var modal = createPasswordModal();

        // Clear fields
        document.getElementById('cpCurrentPassword').value = '';
        document.getElementById('cpNewPassword').value = '';
        document.getElementById('cpConfirmPassword').value = '';
        document.getElementById('cpError').style.display = 'none';

        modal.style.display = 'flex';

        // Cancel
        document.getElementById('cpCancelBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });

        // Click outside to close
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });

        // Save
        document.getElementById('cpSaveBtn').addEventListener('click', submitPasswordChange);

        // Enter key on last field triggers save
        document.getElementById('cpConfirmPassword').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitPasswordChange();
        });
    }

    function shouldAutoOpenPasswordModal() {
        var params = new URLSearchParams(window.location.search || '');
        return params.get('open') === 'change-password';
    }

    function clearAutoOpenPasswordModalParam() {
        if (!window.history || typeof window.history.replaceState !== 'function') {
            return;
        }

        var url = new URL(window.location.href);
        if (url.searchParams.get('open') !== 'change-password') {
            return;
        }

        url.searchParams.delete('open');
        window.history.replaceState({}, '', url.toString());
    }

    function submitPasswordChange() {
        var currentPw = document.getElementById('cpCurrentPassword').value;
        var newPw = document.getElementById('cpNewPassword').value;
        var confirmPw = document.getElementById('cpConfirmPassword').value;
        var errorEl = document.getElementById('cpError');

        errorEl.style.display = 'none';

        if (!currentPw || !newPw || !confirmPw) {
            errorEl.textContent = tr('password.errors.all_required', {}, 'All fields are required');
            errorEl.style.display = 'block';
            return;
        }

        if (newPw !== confirmPw) {
            errorEl.textContent = tr('password.errors.mismatch', {}, 'New passwords do not match');
            errorEl.style.display = 'block';
            return;
        }

        if (newPw.length < 4) {
            errorEl.textContent = tr('password.errors.too_short', {}, 'Password must be at least 4 characters');
            errorEl.style.display = 'block';
            return;
        }

        var saveBtn = document.getElementById('cpSaveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = tr('common.loading', {}, 'Loading...');

        fetch('/api/v1/users/me/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                current_password: currentPw,
                new_password: newPw,
                confirm_password: confirmPw
            })
        })
            .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
            .then(function (result) {
                saveBtn.disabled = false;
                saveBtn.textContent = tr('common.save', {}, 'Save');

                if (result.data.success) {
                    var modal = document.getElementById('changePasswordModal');
                    if (modal) modal.style.display = 'none';
                    refreshPasswordStatusBadge();
                } else {
                    var msg = result.data.error || tr('common.error', {}, 'Error');
                    // Translate known error messages
                    if (msg === 'Current password is incorrect') {
                        msg = tr('password.errors.incorrect_current', {}, msg);
                    } else if (msg === 'New passwords do not match') {
                        msg = tr('password.errors.mismatch', {}, msg);
                    } else if (msg === 'Password must be at least 4 characters') {
                        msg = tr('password.errors.too_short', {}, msg);
                    }
                    errorEl.textContent = msg;
                    errorEl.style.display = 'block';
                }
            })
            .catch(function () {
                saveBtn.disabled = false;
                saveBtn.textContent = tr('common.save', {}, 'Save');
                errorEl.textContent = tr('common.error', {}, 'Error');
                errorEl.style.display = 'block';
            });
    }

    // ========== Init ==========

    function initPasswordChange() {
        refreshPasswordStatusBadge();

        var card = document.getElementById('change-password-card');
        if (card) {
            card.addEventListener('click', showPasswordModal);
        }

        if (card && shouldAutoOpenPasswordModal()) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clearAutoOpenPasswordModalParam();
            showPasswordModal();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordChange);
    } else {
        initPasswordChange();
    }

    // Also run after translations load
    if (window.loadPoznoteI18n) {
        window.loadPoznoteI18n().then(function () {
            refreshPasswordStatusBadge();
        }).catch(function () {
            // Ignore translation load failures for this optional refresh.
        });
    }
})();
