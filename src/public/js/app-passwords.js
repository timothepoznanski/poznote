/**
 * App passwords card and modal on the Settings page.
 *
 * An app password is an API credential a user hands to one client (the
 * browser extension, a phone, a script) in place of the account password.
 * The server side, and the reasons for its limits, are documented in
 * src/lib/app-passwords.php. This file only lists, creates and revokes them
 * through /api/v1/users/me/app-passwords.
 *
 * The secret is shown exactly once, right after creation, in the modal.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };
    const esc = window.escapeHtml || function (text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };

    var API = '/api/v1/users/me/app-passwords';
    var activeCount = null;

    // ========== Card badge ==========

    function seedActiveCountFromPageConfig() {
        if (activeCount !== null || typeof window.getPoznotePageConfig !== 'function') {
            return;
        }
        var config = window.getPoznotePageConfig();
        if (config && config.appPasswords && typeof config.appPasswords.active_count === 'number') {
            activeCount = config.appPasswords.active_count;
        }
    }

    function renderBadge() {
        var badge = document.getElementById('app-passwords-status-badge');
        if (!badge || activeCount === null) return;
        if (activeCount === 1) {
            badge.textContent = tr('app_passwords.status.count_one', {}, '1 active');
        } else if (activeCount > 1) {
            badge.textContent = tr('app_passwords.status.count_other', { count: activeCount }, '{{count}} active');
        } else {
            badge.textContent = tr('app_passwords.status.none', {}, 'None');
        }
        badge.className = 'setting-status ' + (activeCount > 0 ? 'enabled' : 'disabled');
    }

    // ========== API ==========

    function request(method, path, body) {
        var options = {
            method: method,
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        };
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        return fetch(path, options).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                return { status: r.status, data: data || {} };
            });
        });
    }

    // ========== Modal ==========

    function buildModal() {
        var existing = document.getElementById('appPasswordsModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'appPasswordsModal';
        modal.className = 'modal';

        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + esc(tr('app_passwords.modal.title', {}, 'App passwords')) + '</h3>' +
                '<p class="text-small-muted app-passwords-description">' +
                    esc(tr('app_passwords.modal.description', {}, 'An app password lets an app or extension use the API with your username, in place of your account password, even when you sign in through SSO. It cannot open the web interface, reach administration or change your account, and you can revoke it at any time.')) +
                '</p>' +
                '<form class="app-passwords-create" id="apCreateForm" autocomplete="off">' +
                    '<input type="text" id="apLabel" maxlength="60" placeholder="' + esc(tr('app_passwords.modal.label_placeholder', {}, 'Name, e.g. Chrome extension')) + '">' +
                    '<select id="apExpiry" aria-label="' + esc(tr('app_passwords.modal.expiry_label', {}, 'Expiration')) + '">' +
                        '<option value="">' + esc(tr('app_passwords.modal.expiry_never', {}, 'Never expires')) + '</option>' +
                        '<option value="30">' + esc(tr('app_passwords.modal.expiry_30', {}, '30 days')) + '</option>' +
                        '<option value="90">' + esc(tr('app_passwords.modal.expiry_90', {}, '90 days')) + '</option>' +
                        '<option value="365">' + esc(tr('app_passwords.modal.expiry_365', {}, '1 year')) + '</option>' +
                    '</select>' +
                    '<button type="submit" class="btn btn-primary" id="apCreateBtn">' + esc(tr('app_passwords.modal.create', {}, 'Create')) + '</button>' +
                '</form>' +
                '<div id="apError" class="error app-passwords-error" hidden></div>' +
                '<div id="apSecretBox" class="app-password-secret" hidden>' +
                    '<div class="app-password-secret-title"></div>' +
                    '<div class="app-password-secret-row">' +
                        '<code id="apSecretValue" class="app-password-secret-value"></code>' +
                        '<button type="button" class="btn btn-secondary app-password-copy" id="apCopyBtn">' + esc(tr('app_passwords.modal.copy', {}, 'Copy')) + '</button>' +
                    '</div>' +
                    '<p class="app-password-secret-notice">' + esc(tr('app_passwords.modal.secret_notice', {}, 'Copy it now: it will not be shown again.')) + '</p>' +
                    '<p class="app-password-secret-usage">' + esc(tr('app_passwords.modal.usage_hint', {}, 'In the app, enter your username and this value as the password.')) + '</p>' +
                '</div>' +
                '<ul class="app-password-list" id="apList"></ul>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-secondary" id="apCloseBtn">' + esc(tr('app_passwords.modal.close', {}, 'Close')) + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        return modal;
    }

    function showError(message) {
        var el = document.getElementById('apError');
        if (!el) return;
        el.textContent = message;
        el.hidden = !message;
    }

    function renderList(rows) {
        var list = document.getElementById('apList');
        if (!list) return;

        if (!rows || rows.length === 0) {
            list.innerHTML = '<li class="app-passwords-empty">' + esc(tr('app_passwords.modal.empty', {}, 'No app password yet.')) + '</li>';
            return;
        }

        list.innerHTML = rows.map(function (row) {
            var meta = [];
            meta.push(esc(row.hint) + '…');
            if (row.created_at) {
                meta.push(esc(tr('app_passwords.modal.created', { date: row.created_at }, 'Created {{date}}')));
            }
            meta.push(esc(row.last_used_at
                ? tr('app_passwords.modal.last_used', { date: row.last_used_at }, 'Last used {{date}}')
                : tr('app_passwords.modal.never_used', {}, 'Never used')));
            if (row.expired) {
                meta.push('<span class="app-password-expired">' + esc(tr('app_passwords.modal.expired', {}, 'Expired')) + '</span>');
            } else if (row.expires_at) {
                meta.push(esc(tr('app_passwords.modal.expires', { date: row.expires_at }, 'Expires {{date}}')));
            }
            return '<li class="app-password-row' + (row.expired ? ' is-expired' : '') + '" data-id="' + esc(row.id) + '">' +
                '<div class="app-password-main">' +
                    '<span class="app-password-label" title="' + esc(row.label) + '">' + esc(row.label) + '</span>' +
                    '<span class="app-password-meta">' + meta.join(' · ') + '</span>' +
                '</div>' +
                '<button type="button" class="btn btn-danger app-password-revoke" data-id="' + esc(row.id) + '">' +
                    esc(tr('app_passwords.modal.revoke', {}, 'Revoke')) +
                '</button>' +
            '</li>';
        }).join('');
    }

    function loadList() {
        return request('GET', API).then(function (result) {
            if (result.status !== 200 || !result.data.app_passwords) {
                showError(result.data.error || tr('app_passwords.errors.load_failed', {}, 'Could not load your app passwords.'));
                renderList([]);
                return;
            }
            activeCount = typeof result.data.active_count === 'number' ? result.data.active_count : 0;
            renderBadge();
            renderList(result.data.app_passwords);
        }).catch(function () {
            showError(tr('app_passwords.errors.load_failed', {}, 'Could not load your app passwords.'));
            renderList([]);
        });
    }

    function showSecret(created, secret) {
        var box = document.getElementById('apSecretBox');
        if (!box) return;
        box.querySelector('.app-password-secret-title').textContent =
            tr('app_passwords.modal.secret_title', { label: created && created.label ? created.label : '' }, 'App password "{{label}}"');
        document.getElementById('apSecretValue').textContent = secret;
        var copyBtn = document.getElementById('apCopyBtn');
        copyBtn.textContent = tr('app_passwords.modal.copy', {}, 'Copy');
        copyBtn.disabled = false;
        box.hidden = false;
    }

    function hideSecret() {
        var box = document.getElementById('apSecretBox');
        if (!box) return;
        box.hidden = true;
        document.getElementById('apSecretValue').textContent = '';
    }

    function copySecret() {
        var value = document.getElementById('apSecretValue').textContent;
        var btn = document.getElementById('apCopyBtn');
        var done = function () {
            btn.textContent = tr('app_passwords.modal.copied', {}, 'Copied');
            setTimeout(function () { btn.textContent = tr('app_passwords.modal.copy', {}, 'Copy'); }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done, function () { selectSecret(); });
        } else {
            selectSecret();
        }
    }

    // Fallback when the clipboard API is unavailable (plain http): select the
    // value so a manual Ctrl+C works.
    function selectSecret() {
        var code = document.getElementById('apSecretValue');
        var range = document.createRange();
        range.selectNodeContents(code);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function submitCreate(event) {
        if (event) event.preventDefault();
        var labelInput = document.getElementById('apLabel');
        var expiry = document.getElementById('apExpiry').value;
        var btn = document.getElementById('apCreateBtn');
        var label = labelInput.value.trim();

        showError('');
        if (label === '') {
            showError(tr('app_passwords.errors.label_required', {}, 'Give the app password a name.'));
            labelInput.focus();
            return;
        }

        btn.disabled = true;
        var body = { label: label };
        if (expiry !== '') body.expires_in_days = parseInt(expiry, 10);

        request('POST', API, body).then(function (result) {
            btn.disabled = false;
            if (result.status === 201 && result.data.secret) {
                labelInput.value = '';
                showSecret(result.data.app_password, result.data.secret);
                return loadList();
            }
            if (result.status === 409) {
                showError(tr('app_passwords.errors.limit_reached', {}, 'Limit reached: revoke an app password before creating another.'));
                return;
            }
            showError(result.data.error || tr('app_passwords.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            btn.disabled = false;
            showError(tr('app_passwords.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    // Revoking is destructive for whichever client holds the secret, so the
    // button asks once: a first click arms it, a second within a few seconds
    // confirms. Kept inside this modal rather than opening the shared
    // confirm dialog underneath it.
    function onListClick(event) {
        var btn = event.target.closest('.app-password-revoke');
        if (!btn) return;
        var id = btn.getAttribute('data-id');

        if (!btn.classList.contains('is-armed')) {
            btn.classList.add('is-armed');
            btn.textContent = tr('app_passwords.modal.confirm_revoke', {}, 'Confirm');
            btn._disarm = setTimeout(function () {
                btn.classList.remove('is-armed');
                btn.textContent = tr('app_passwords.modal.revoke', {}, 'Revoke');
            }, 4000);
            return;
        }

        clearTimeout(btn._disarm);
        btn.disabled = true;
        showError('');
        request('DELETE', API + '/' + encodeURIComponent(id)).then(function (result) {
            if (result.status === 200) {
                hideSecret();
                return loadList();
            }
            btn.disabled = false;
            showError(result.data.error || tr('app_passwords.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            btn.disabled = false;
            showError(tr('app_passwords.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    function showModal() {
        var modal = buildModal();
        modal.style.display = 'flex';

        document.getElementById('apCreateForm').addEventListener('submit', submitCreate);
        document.getElementById('apCopyBtn').addEventListener('click', copySecret);
        document.getElementById('apList').addEventListener('click', onListClick);
        document.getElementById('apCloseBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });

        renderList(null);
        loadList().then(function () {
            var input = document.getElementById('apLabel');
            if (input) input.focus();
        });
    }

    // ========== Init ==========

    function init() {
        seedActiveCountFromPageConfig();
        renderBadge();

        var card = document.getElementById('app-passwords-card');
        if (card) {
            card.addEventListener('click', showModal);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('poznote:i18n:loaded', renderBadge);
})();
