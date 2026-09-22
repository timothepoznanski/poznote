/**
 * Profile editing: the "My Profile" modal, its API calls (username, first
 * name, last name) and the two entry points that open it - the Settings page
 * card and the icon rail's user button, which icon_sidebar.php puts on nearly
 * every page.
 *
 * icon_sidebar.php loads this file (plus css/profile-modal.css), so on the
 * Settings page it is pulled in twice; the flag below makes the second copy a
 * no-op instead of binding every handler again.
 */
(function () {
    'use strict';

    if (window.__poznoteProfileModalLoaded) return;
    window.__poznoteProfileModalLoaded = true;

    // window.PoznoteProfileI18n comes from icon_sidebar.php, already resolved
    // in the user's language, and is checked first because window.t is absent
    // on the pages that do not load js/globals.js.
    const tr = function (key, vars, fallback) {
        var preset = window.PoznoteProfileI18n && window.PoznoteProfileI18n[key];
        if (typeof preset === 'string') return interpolate(preset, vars);
        if (typeof window.t === 'function') return window.t(key, vars, fallback);
        return interpolate(fallback || key, vars);
    };

    // Same {{var}} substitution js/globals.js does, applied to the server-side
    // preset strings and to the English fallbacks, which window.t never sees.
    function interpolate(str, vars) {
        if (!vars) return str;
        Object.keys(vars).forEach(function (k) {
            str = str.split('{{' + k + '}}').join(String(vars[k]));
        });
        return str;
    }
    var profileCache = null;

    // The identity card under the title: who this profile is, before the
    // fields that change it. The name and id used to be crammed into the
    // heading as "Profile of <username> - ID 12".
    function profileFullName(profile) {
        return [
            ((profile && profile.first_name) || '').trim(),
            ((profile && profile.last_name) || '').trim()
        ].filter(Boolean).join(' ');
    }

    // Initials of the first and last names, or the first letter of the
    // username for the accounts that carry neither.
    function profileInitials(profile) {
        var full = profileFullName(profile);
        if (full) {
            var parts = full.split(/\s+/);
            return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
        }

        return (((profile && profile.username) || '').trim().charAt(0) || '?').toUpperCase();
    }

    function renderProfileIdentity(profile) {
        var card = document.getElementById('epIdentity');
        if (!card) return;

        var username = ((profile && profile.username) || '').trim();
        if (!username) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';

        document.getElementById('epAvatar').textContent = profileInitials(profile);
        document.getElementById('epIdentityName').textContent = username;

        var sub = document.getElementById('epIdentitySub');
        var full = profileFullName(profile);
        sub.textContent = full;
        sub.style.display = full ? '' : 'none';

        var idBadge = document.getElementById('epIdentityId');
        idBadge.textContent = profile.id ? tr('profile.modal.id', {}, 'ID') + ' ' + profile.id : '';
        idBadge.style.display = profile.id ? '' : 'none';

        var adminBadge = document.getElementById('epIdentityAdmin');
        adminBadge.textContent = tr('multiuser.admin.administrator', {}, 'Administrator');
        adminBadge.style.display = (profile && profile.is_admin) ? '' : 'none';
    }

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
                /* Hidden until renderProfileIdentity() has a username to show. */
                '<div class="ep-identity" id="epIdentity" style="display:none;">' +
                    '<span class="ep-avatar" id="epAvatar" aria-hidden="true"></span>' +
                    '<span class="ep-identity-text">' +
                        '<span class="ep-identity-name" id="epIdentityName"></span>' +
                        '<span class="ep-identity-sub" id="epIdentitySub" style="display:none;"></span>' +
                        '<span class="ep-identity-badges">' +
                            '<span class="ep-badge" id="epIdentityId"></span>' +
                            '<span class="ep-badge ep-badge-admin" id="epIdentityAdmin" style="display:none;"></span>' +
                        '</span>' +
                    '</span>' +
                '</div>' +
                '<div class="ep-fields">' +
                    '<div class="form-group">' +
                        '<label for="epUsername">' + tr('profile.modal.username', {}, 'Username') + '</label>' +
                        '<input type="text" id="epUsername" autocomplete="username" maxlength="60" placeholder="' + tr('profile.modal.username', {}, 'Username') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="epFirstName">' + tr('profile.modal.first_name', {}, 'First name') + '</label>' +
                        '<input type="text" id="epFirstName" autocomplete="given-name" maxlength="100" placeholder="' + tr('profile.modal.first_name', {}, 'First name') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="epLastName">' + tr('profile.modal.last_name', {}, 'Last name') + '</label>' +
                        '<input type="text" id="epLastName" autocomplete="family-name" maxlength="100" placeholder="' + tr('profile.modal.last_name', {}, 'Last name') + '">' +
                    '</div>' +
                    '<div class="form-group" id="epEmailGroup">' +
                        '<label for="epEmail">' + tr('multiuser.admin.email', {}, 'Email') + '</label>' +
                        '<input type="email" id="epEmail" disabled>' +
                        '<div class="text-small-muted edit-profile-email-hint">' + tr('profile.modal.email_admin_only', {}, 'Only an administrator can change your email address.') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="epError" class="ep-error" style="display:none;"></div>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-cancel" id="epCancelBtn">' + tr('common.cancel', {}, 'Cancel') + '</button>' +
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
        renderProfileIdentity(profileCache);

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

        renderProfileIdentity(profile);

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
                .catch(function (e) {
                    console.debug('profile: showProfileModal() failed:', e);
                });
        }

        modal.style.display = 'flex';

        // Cancel
        document.getElementById('epCancelBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });

        // Click outside to close
        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (e) {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal && pressedOnBackdrop) modal.style.display = 'none';
            pressedOnBackdrop = false;
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

    // ========== Logout confirmation ==========

    // Self-contained like the profile modal above: the rail's Logout button is
    // on nearly every page, while the shared #confirmModal from modals.php only
    // exists on four of them, so showConfirmModal() is not an option here.
    function showLogoutConfirmModal(logoutUrl) {
        var existing = document.getElementById('confirmLogoutModal');
        if (existing) existing.remove();

        // Set by icon_sidebar.php only when the signed-in person can open
        // several accounts: the other ones are offered before a full logout.
        var accountSwitch = window.PoznoteAccountSwitch || null;
        var otherAccounts = accountSwitch && Array.isArray(accountSwitch.accounts)
            ? accountSwitch.accounts.filter(function (account) { return !account.current; })
            : [];
        var canSwitch = otherAccounts.length > 0;

        var modal = document.createElement('div');
        modal.id = 'confirmLogoutModal';
        modal.className = 'modal';
        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + tr('workspace_menu.logout', {}, 'Logout') + '</h3>' +
                '<p class="text-small-muted">' + (canSwitch
                    ? tr('profile.logout.switch_intro', {}, 'Switch to another account, or log out completely.')
                    : tr('profile.logout.confirm', {}, 'Are you sure you want to log out?')) + '</p>' +
                // Who is signed in comes before the choice it explains
                '<p class="text-small-muted" id="clSignedInAs" style="display:none;"></p>' +
                (canSwitch ? '<div class="logout-account-list" id="clAccountList"></div>' : '') +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-cancel" id="clCancelBtn">' + tr('common.cancel', {}, 'Cancel') + '</button>' +
                    '<button type="button" class="btn-danger" id="clConfirmBtn">' + tr('workspace_menu.logout', {}, 'Logout') + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        modal.style.display = 'flex';

        function onKey(e) {
            if (e.key === 'Escape') close();
        }
        function close() {
            document.removeEventListener('keydown', onKey);
            modal.remove();
        }
        document.getElementById('clCancelBtn').addEventListener('click', close);
        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (e) {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal && pressedOnBackdrop) close();
            pressedOnBackdrop = false;
        });
        document.addEventListener('keydown', onKey);

        // Remind which account is about to be signed out; purely informative,
        // so a failed lookup simply leaves the line hidden.
        fetch('/api/v1/users/me', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.username) return;
                var el = document.getElementById('clSignedInAs');
                if (!el) return;   // modal already closed
                var template = tr('profile.logout.signed_in_as', {}, 'You are signed in as {{username}}');
                var parts = template.split('{{username}}');
                el.textContent = '';
                el.appendChild(document.createTextNode(parts[0]));
                var strong = document.createElement('strong');
                strong.style.color = 'var(--primary-color, #007DB8)';
                strong.textContent = data.username;
                el.appendChild(strong);
                if (parts[1]) el.appendChild(document.createTextNode(parts[1]));
                el.style.display = '';
            })
            .catch(function (e) {
                console.debug('profile: close() failed:', e);
            });

        var confirmBtn = document.getElementById('clConfirmBtn');

        function freezeButtons() {
            var buttons = modal.querySelectorAll('button');
            for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
        }

        // Account names are user data: built with textContent, never innerHTML.
        var accountList = document.getElementById('clAccountList');
        if (accountList) {
            otherAccounts.forEach(function (account) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'logout-account-option';

                var name = document.createElement('span');
                name.className = 'logout-account-name';
                name.textContent = account.username;
                btn.appendChild(name);

                if (account.own) {
                    var badge = document.createElement('span');
                    badge.className = 'logout-account-badge';
                    badge.textContent = tr('login.account_select.own_account', {}, 'Your account');
                    btn.appendChild(badge);
                }

                // Tells the row apart from the input fields of the sibling
                // modals, which share this look.
                var arrow = document.createElement('span');
                arrow.className = 'logout-account-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '→';
                btn.appendChild(arrow);

                btn.addEventListener('click', function () {
                    freezeButtons();
                    name.textContent = tr('profile.logout.switch_in_progress', {}, 'Switching account...');
                    submitAccountSwitch(account.id);
                });

                accountList.appendChild(btn);
            });
        }

        confirmBtn.addEventListener('click', function () {
            // One-way action: freeze the buttons and show progress while the
            // browser navigates to logout.php
            freezeButtons();
            confirmBtn.textContent = tr('profile.logout.in_progress', {}, 'Logging out...');
            window.location.href = logoutUrl;
        });
        confirmBtn.focus();
    }

    // ========== Account switching ==========

    // Leaves the active account for another one the signed-in person can
    // open, by posting to switch_account.php (a form, not fetch: the answer is
    // a redirect into the other account). `landing` may carry a note id or a
    // workspace name to open there, see switch_account.php. Shared by the
    // logout dialog above, the workspace menu (js/workspaces-core.js) and the
    // notes list's "Other accounts" block (js/other-accounts.js).
    var accountSwitchPending = false;
    var ACCOUNT_SWITCH_WAIT_MS = 2500;

    function submitAccountSwitch(accountId, landing) {
        var accountSwitch = window.PoznoteAccountSwitch || null;
        if (!accountSwitch || !accountId) return false;

        if (accountSwitchPending) return true;
        accountSwitchPending = true;

        // From here on a 409 "account_switched" on this page is expected.
        if (typeof window.poznoteAccountSwitchStarted === 'function') {
            window.poznoteAccountSwitchStarted();
        }

        leaveOpenNote(function () {
            postAccountSwitch(accountSwitch, accountId, landing);
        });
        return true;
    }
    window.poznoteSwitchAccount = submitAccountSwitch;

    // The open note is saved and its edit lock released BEFORE the switch is
    // posted. Sent alongside it, those calls could reach the server once the
    // session already names the other account: refused there (409), so the
    // last keystrokes were lost, and never applied to the other account's
    // note of the same id. Bounded: a slow or failing server does not hold
    // the switch, the local draft keeps the text.
    function leaveOpenNote(done) {
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            done();
        }
        var timer = setTimeout(finish, ACCOUNT_SWITCH_WAIT_MS);

        function release() {
            var released = null;
            if (typeof window.releaseCurrentNoteEditLock === 'function') {
                try { released = window.releaseCurrentNoteEditLock(); } catch (e) { /* lock expires anyway */ }
            }
            Promise.resolve(released).then(finish, finish);
        }

        var openNote = typeof window.noteid !== 'undefined' ? window.noteid : null;
        var unsaved = false;
        try {
            unsaved = typeof window.hasUnsavedChangesOnScreen === 'function' && window.hasUnsavedChangesOnScreen(openNote);
        } catch (e) { unsaved = false; }

        if (unsaved && typeof window.saveNoteToServer === 'function') {
            try {
                window.saveNoteToServer({ onSaved: release });
            } catch (e) {
                release();
            }
            return;
        }
        release();
    }

    function postAccountSwitch(accountSwitch, accountId, landing) {
        var fields = [['csrf_token', accountSwitch.csrfToken || ''], ['account_user_id', String(accountId)]];
        if (landing && landing.note) fields.push(['note', String(landing.note)]);
        if (landing && landing.workspace) fields.push(['workspace', String(landing.workspace)]);
        // A page of the account opened, instead of its notes (switch_account.php
        // knows which ones)
        if (landing && landing.next) fields.push(['next', String(landing.next)]);

        var form = document.createElement('form');
        form.method = 'POST';
        form.action = accountSwitch.action || 'switch_account.php';
        form.style.display = 'none';
        fields.forEach(function (pair) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = pair[0];
            input.value = pair[1];
            form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();

        // Still here a moment later: the person chose to stay (the browser's
        // "unsaved changes" prompt), so another try must be possible.
        setTimeout(function () { accountSwitchPending = false; }, 3000);
    }

    // Back from the other account through the back/forward cache.
    window.addEventListener('pageshow', function (e) {
        if (e && e.persisted) accountSwitchPending = false;
    });

    // ========== Init ==========

    function initProfileCard() {
        var card = document.getElementById('my-profile-card');
        if (card) {
            card.addEventListener('click', showProfileModal);
        }

        // The icon rail entry (icon_sidebar.php) is a plain link to
        // settings.php?open=account: it opens the My Account section rather
        // than this modal, which the card above opens once there.

        // Default-credentials alert (settings.php): the username half of it
        // is fixed in this same modal, so open it straight away rather than
        // sending the reader off to find the card.
        var defaultCredentialsBtn = document.getElementById('default-credentials-username-btn');
        if (defaultCredentialsBtn) {
            defaultCredentialsBtn.addEventListener('click', showProfileModal);
        }

        // Icon rail Logout: confirm first. The href stays the no-JS fallback.
        var logoutBtn = document.getElementById('iconSidebarLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function (e) {
                e.preventDefault();
                showLogoutConfirmModal(logoutBtn.getAttribute('href') || 'logout.php');
            });
        }

        // No card guard: ?open=profile comes from the user-settings modal
        // (modals.php), and the card can be hidden through UI Customization,
        // but the modal must open either way.
        if (shouldAutoOpenProfileModal()) {
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
