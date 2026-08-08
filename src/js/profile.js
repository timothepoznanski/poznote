/**
 * Profile editing functionality for Settings page
 * Handles the "My Profile" card, modal, and API calls
 * (username, first name, last name).
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };
    var profileCache = null;

    // ========== Profile data ==========

    function seedProfileFromPageConfig() {
        if (profileCache !== null || typeof window.getPoznotePageConfig !== 'function') {
            return profileCache !== null;
        }

        var config = window.getPoznotePageConfig();
        if (config && config.profile && typeof config.profile === 'object') {
            profileCache = config.profile;
            return true;
        }

        return false;
    }

    // ========== Profile Modal ==========

    function createProfileModal() {
        var existing = document.getElementById('editProfileModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'editProfileModal';
        modal.className = 'modal';

        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + tr('profile.modal.title', {}, 'My Profile') + '</h3>' +
                '<p class="text-small-muted edit-profile-description">' +
                    '<span class="edit-profile-description-text">' + tr('profile.modal.description', {}, 'Update your personal information.') + '</span>' +
                    '<span class="edit-profile-user-id" style="margin-left:6px;white-space:nowrap;"></span>' +
                '</p>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<label for="epUsername" class="text-small-muted">' + tr('profile.modal.username', {}, 'Username') + '</label>' +
                    '<input type="text" id="epUsername" autocomplete="username" maxlength="60" placeholder="' + tr('profile.modal.username', {}, 'Username') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<label for="epFirstName" class="text-small-muted">' + tr('profile.modal.first_name', {}, 'First name') + '</label>' +
                    '<input type="text" id="epFirstName" autocomplete="given-name" maxlength="100" placeholder="' + tr('profile.modal.first_name', {}, 'First name') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 8px;">' +
                    '<label for="epLastName" class="text-small-muted">' + tr('profile.modal.last_name', {}, 'Last name') + '</label>' +
                    '<input type="text" id="epLastName" autocomplete="family-name" maxlength="100" placeholder="' + tr('profile.modal.last_name', {}, 'Last name') + '" style="width:100%;box-sizing:border-box;">' +
                '</div>' +
                '<div class="form-group" id="epEmailGroup" style="margin-bottom: 8px;">' +
                    '<label for="epEmail" class="text-small-muted">' + tr('multiuser.admin.email', {}, 'Email') + '</label>' +
                    '<input type="email" id="epEmail" disabled style="width:100%;box-sizing:border-box;margin-bottom:0;">' +
                    '<div class="text-small-muted edit-profile-email-hint" style="margin-top:4px;margin-bottom:16px;">' + tr('profile.modal.email_admin_only', {}, 'Only an administrator can change your email address.') + '</div>' +
                '</div>' +
                '<div id="epError" class="error" style="color:#dc3545;margin-bottom:10px;display:none;"></div>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-danger" id="epCancelBtn">' + tr('common.cancel', {}, 'Cancel') + '</button>' +
                    '<button type="button" class="btn-primary" id="epSaveBtn">' + tr('common.save', {}, 'Save') + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        return modal;
    }

    // Re-apply translations on an already-built modal without touching typed
    // values (the modal can be created before async i18n strings are loaded).
    function applyProfileModalTranslations() {
        var modal = document.getElementById('editProfileModal');
        if (!modal) return;

        var title = modal.querySelector('h3');
        if (title) title.textContent = tr('profile.modal.title', {}, 'My Profile');

        // Only the text span: the sibling span holds the user id.
        var description = modal.querySelector('.edit-profile-description-text');
        if (description) description.textContent = tr('profile.modal.description', {}, 'Update your personal information.');

        var userId = modal.querySelector('.edit-profile-user-id');
        if (userId && userId.textContent.trim() !== '' && profileCache && profileCache.id) {
            userId.textContent = tr('profile.modal.your_id', {}, 'Your ID') + ' : ' + profileCache.id;
        }

        var fields = [
            { id: 'epUsername', key: 'profile.modal.username', fallback: 'Username' },
            { id: 'epFirstName', key: 'profile.modal.first_name', fallback: 'First name' },
            { id: 'epLastName', key: 'profile.modal.last_name', fallback: 'Last name' },
            { id: 'epEmail', key: 'multiuser.admin.email', fallback: 'Email' }
        ];
        fields.forEach(function (entry) {
            var input = document.getElementById(entry.id);
            if (input) input.placeholder = tr(entry.key, {}, entry.fallback);
            var label = modal.querySelector('label[for="' + entry.id + '"]');
            if (label) label.textContent = tr(entry.key, {}, entry.fallback);
        });

        var emailHint = modal.querySelector('.edit-profile-email-hint');
        if (emailHint) emailHint.textContent = tr('profile.modal.email_admin_only', {}, 'Only an administrator can change your email address.');

        var cancelBtn = document.getElementById('epCancelBtn');
        if (cancelBtn) cancelBtn.textContent = tr('common.cancel', {}, 'Cancel');

        var saveBtn = document.getElementById('epSaveBtn');
        if (saveBtn) saveBtn.textContent = tr('common.save', {}, 'Save');
    }

    document.addEventListener('poznote:i18n:loaded', applyProfileModalTranslations);

    function fillProfileFields(profile) {
        document.getElementById('epUsername').value = (profile && profile.username) || '';
        document.getElementById('epFirstName').value = (profile && profile.first_name) || '';
        document.getElementById('epLastName').value = (profile && profile.last_name) || '';
        document.getElementById('epEmail').value = (profile && profile.email) || '';

        // Shown next to the description line; hidden when the id is unknown.
        var userId = document.querySelector('#editProfileModal .edit-profile-user-id');
        if (userId) {
            userId.textContent = (profile && profile.id)
                ? (tr('profile.modal.your_id', {}, 'Your ID') + ' : ' + profile.id)
                : '';
        }

        // Email is admin-managed: the field stays locked for regular users
        // (the API rejects self-service email changes too).
        var isAdmin = !!(profile && profile.is_admin);
        document.getElementById('epEmail').disabled = !isAdmin;
        var hint = document.querySelector('#epEmailGroup .edit-profile-email-hint');
        if (hint) hint.style.display = isAdmin ? 'none' : '';
    }

    function showProfileModal() {
        var modal = createProfileModal();

        document.getElementById('epError').style.display = 'none';

        if (seedProfileFromPageConfig()) {
            fillProfileFields(profileCache);
        } else {
            fetch('/api/v1/users/me', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.username) {
                        profileCache = data;
                        fillProfileFields(data);
                    }
                })
                .catch(function () {});
        }

        modal.style.display = 'flex';

        // Cancel
        document.getElementById('epCancelBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });

        // Click outside to close
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });

        // Save
        document.getElementById('epSaveBtn').addEventListener('click', submitProfileChange);

        // Enter key triggers save (disabled inputs never fire keydown)
        ['epUsername', 'epFirstName', 'epLastName', 'epEmail'].forEach(function (id) {
            document.getElementById(id).addEventListener('keydown', function (e) {
                if (e.key === 'Enter') submitProfileChange();
            });
        });
    }

    function shouldAutoOpenProfileModal() {
        var params = new URLSearchParams(window.location.search || '');
        return params.get('open') === 'profile';
    }

    function clearAutoOpenProfileModalParam() {
        if (!window.history || typeof window.history.replaceState !== 'function') {
            return;
        }

        var url = new URL(window.location.href);
        if (url.searchParams.get('open') !== 'profile') {
            return;
        }

        url.searchParams.delete('open');
        window.history.replaceState({}, '', url.toString());
    }

    function submitProfileChange() {
        var username = document.getElementById('epUsername').value.trim();
        var firstName = document.getElementById('epFirstName').value.trim();
        var lastName = document.getElementById('epLastName').value.trim();
        var errorEl = document.getElementById('epError');

        errorEl.style.display = 'none';

        if (!username) {
            errorEl.textContent = tr('profile.errors.username_required', {}, 'Username is required');
            errorEl.style.display = 'block';
            return;
        }

        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(username) || /^[0-9]+$/.test(username)) {
            errorEl.textContent = tr('profile.errors.username_invalid', {}, 'Username may only contain letters, digits, dots, underscores and dashes, and cannot be a number');
            errorEl.style.display = 'block';
            return;
        }

        var payload = {
            username: username,
            first_name: firstName,
            last_name: lastName
        };

        // Only admins have an editable email field; the API rejects the
        // field from anyone else.
        var emailInput = document.getElementById('epEmail');
        if (!emailInput.disabled) {
            var email = emailInput.value.trim();
            if (email !== '' && !/^\S+@\S+\.\S+$/.test(email)) {
                errorEl.textContent = tr('profile.errors.email_invalid', {}, 'Invalid email address');
                errorEl.style.display = 'block';
                return;
            }
            payload.email = email;
        }

        var saveBtn = document.getElementById('epSaveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = tr('common.loading', {}, 'Loading...');

        fetch('/api/v1/users/me', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
            .then(function (result) {
                saveBtn.disabled = false;
                saveBtn.textContent = tr('common.save', {}, 'Save');

                if (result.data && result.data.success) {
                    profileCache = result.data;
                    // The username appears in several server-rendered strings
                    // (section headings, badges): reload to refresh them all.
                    window.location.reload();
                } else {
                    var msg = (result.data && result.data.error) || tr('common.error', {}, 'Error');
                    if (msg === 'Username already exists') {
                        msg = tr('profile.errors.username_taken', {}, msg);
                    } else if (msg === 'Username is required') {
                        msg = tr('profile.errors.username_required', {}, msg);
                    } else if (msg.indexOf('Username may only contain') === 0 || msg === 'Username cannot be purely numeric') {
                        msg = tr('profile.errors.username_invalid', {}, msg);
                    } else if (msg === 'Email already exists') {
                        msg = tr('profile.errors.email_taken', {}, msg);
                    } else if (msg === 'Invalid email address') {
                        msg = tr('profile.errors.email_invalid', {}, msg);
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

    function initProfileCard() {
        var card = document.getElementById('my-profile-card');
        if (card) {
            card.addEventListener('click', showProfileModal);
        }

        if (card && shouldAutoOpenProfileModal()) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clearAutoOpenProfileModalParam();
            showProfileModal();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfileCard);
    } else {
        initProfileCard();
    }
})();
