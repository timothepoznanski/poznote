/**
 * Statistics API card and modal on the Settings page (admins only).
 *
 * The statistics token lets a dashboard (Homepage, Homarr...) read
 * GET /api/v1/public/statistics, a summary of the instance, without an
 * account. An admin can also make that summary public, with no token at all
 * (off by default). The server side and the reasons for its limits are
 * documented in src/lib/statistics.php. This file only shows, generates and revokes the
 * token through /api/v1/admin/statistics/token, and switches the public mode
 * through /api/v1/admin/statistics/public.
 *
 * The token is shown exactly once, right after it is generated.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };
    const esc = window.escapeHtml || function (text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };

    var API = '/api/v1/admin/statistics/token';
    var status = null;

    function endpointUrl() {
        return window.location.origin + '/api/v1/public/statistics';
    }

    function formatDate(iso) {
        var date = new Date(iso);
        return isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    // ========== Card badge ==========

    function renderBadge() {
        var badge = document.getElementById('statistics-token-status');
        if (!badge || status === null) return;
        if (status.public) {
            badge.textContent = tr('statistics_api.status.public', {}, 'Public');
        } else {
            badge.textContent = status.enabled
                ? tr('common.enabled', {}, 'Enabled')
                : tr('common.disabled', {}, 'Disabled');
        }
        badge.className = 'setting-status ' + (status.enabled || status.public ? 'enabled' : 'disabled');
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
        return fetch(path || API, options).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                return { status: r.status, data: data || {} };
            });
        });
    }

    // ========== Modal ==========

    function buildModal() {
        var existing = document.getElementById('statisticsTokenModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'statisticsTokenModal';
        modal.className = 'modal';

        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + esc(tr('statistics_api.modal.title', {}, 'Statistics API')) + '</h3>' +
                '<p class="statistics-token-description">' +
                    esc(tr('statistics_api.modal.description', {}, 'A dashboard such as Homepage can read a summary of this instance with a token: number of users, notes and workspaces, storage used, last backups and Git sync, available update. Only counts, sizes and dates, never a name or a note. The token unlocks nothing else.')) +
                '</p>' +
                '<div class="statistics-token-field">' +
                    '<span class="statistics-token-label">' + esc(tr('statistics_api.modal.endpoint', {}, 'Address')) + '</span>' +
                    '<div class="statistics-token-row">' +
                        '<code class="statistics-token-value" id="stEndpoint"></code>' +
                        '<button type="button" class="btn btn-secondary statistics-token-copy" data-copy="stEndpoint">' + esc(tr('statistics_api.modal.copy', {}, 'Copy')) + '</button>' +
                    '</div>' +
                '</div>' +
                '<p class="statistics-token-status" id="stStatus"></p>' +
                '<label class="statistics-token-public">' +
                    '<input type="checkbox" id="stPublic" disabled>' +
                    '<span>' +
                        '<span class="statistics-token-public-title">' + esc(tr('statistics_api.modal.public', {}, 'Public statistics, without a token')) + '</span>' +
                        '<span class="statistics-token-public-help">' + esc(tr('statistics_api.modal.public_help', {}, 'Anyone who can reach this instance can then read these numbers. Leave it off when the instance is reachable from the internet.')) + '</span>' +
                    '</span>' +
                '</label>' +
                '<div id="stError" class="statistics-token-error" hidden></div>' +
                '<div id="stSecretBox" class="statistics-token-secret" hidden>' +
                    '<div class="statistics-token-row">' +
                        '<code class="statistics-token-value" id="stSecret"></code>' +
                        '<button type="button" class="btn btn-secondary statistics-token-copy" data-copy="stSecret">' + esc(tr('statistics_api.modal.copy', {}, 'Copy')) + '</button>' +
                    '</div>' +
                    '<p class="statistics-token-hint">' + esc(tr('statistics_api.modal.secret_notice', {}, 'Copy it now: it will not be shown again.')) + '</p>' +
                    '<p class="statistics-token-hint">' + esc(tr('statistics_api.modal.usage_hint', {}, 'Send it in an "Authorization: Bearer <token>" header.')) + '</p>' +
                '</div>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-primary" id="stGenerateBtn" disabled>' + esc(tr('statistics_api.modal.generate', {}, 'Generate a token')) + '</button>' +
                    '<button type="button" class="btn-danger" id="stRevokeBtn" hidden>' + esc(tr('statistics_api.modal.revoke', {}, 'Revoke')) + '</button>' +
                    '<button type="button" class="btn-cancel" id="stCloseBtn">' + esc(tr('statistics_api.modal.close', {}, 'Close')) + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        modal.querySelector('#stEndpoint').textContent = endpointUrl();
        return modal;
    }

    function showError(message) {
        var el = document.getElementById('stError');
        if (!el) return;
        el.textContent = message || '';
        el.hidden = !message;
    }

    function renderStatus() {
        var line = document.getElementById('stStatus');
        var generate = document.getElementById('stGenerateBtn');
        var revoke = document.getElementById('stRevokeBtn');
        if (!line || !status) return;

        if (status.enabled) {
            var parts = [tr('statistics_api.modal.token', { hint: status.hint || '' }, 'Token {{hint}}…')];
            if (status.created_at) {
                parts.push(tr('statistics_api.modal.created', { date: formatDate(status.created_at) }, 'created {{date}}'));
            }
            parts.push(status.last_used_at
                ? tr('statistics_api.modal.last_used', { date: formatDate(status.last_used_at) }, 'last used {{date}}')
                : tr('statistics_api.modal.never_used', {}, 'never used'));
            line.textContent = parts.join(' · ');
        } else if (status.public) {
            line.textContent = tr('statistics_api.modal.none_public', {}, 'No token.');
        } else {
            line.textContent = tr('statistics_api.modal.none', {}, 'No token: the statistics are disabled.');
        }

        var publicBox = document.getElementById('stPublic');
        publicBox.checked = status.public;
        publicBox.disabled = false;

        disarm(generate);
        disarm(revoke);
        generate.textContent = status.enabled
            ? tr('statistics_api.modal.regenerate', {}, 'New token')
            : tr('statistics_api.modal.generate', {}, 'Generate a token');
        revoke.hidden = !status.enabled;
        // Off until the current state is known, so a token that exists is
        // never replaced without the confirming second click
        generate.disabled = false;
    }

    function setStatus(data) {
        status = {
            enabled: !!data.enabled,
            public: !!data.public,
            hint: data.hint || null,
            created_at: data.created_at || null,
            last_used_at: data.last_used_at || null
        };
        renderBadge();
        renderStatus();
    }

    // Replacing or revoking the token cuts off the dashboard that holds it,
    // so those buttons ask once: a first click arms them, a second within a
    // few seconds confirms (same as the app passwords modal).
    function armOrConfirm(btn) {
        if (btn.classList.contains('is-armed')) {
            disarm(btn);
            return true;
        }
        btn.classList.add('is-armed');
        btn._label = btn.textContent;
        btn.textContent = tr('statistics_api.modal.confirm', {}, 'Confirm');
        btn._disarm = setTimeout(function () { disarm(btn); }, 4000);
        return false;
    }

    function disarm(btn) {
        if (!btn || !btn.classList.contains('is-armed')) return;
        clearTimeout(btn._disarm);
        btn.classList.remove('is-armed');
        if (btn._label) btn.textContent = btn._label;
    }

    function hideSecret() {
        var box = document.getElementById('stSecretBox');
        if (!box) return;
        box.hidden = true;
        document.getElementById('stSecret').textContent = '';
    }

    function onGenerate() {
        var btn = document.getElementById('stGenerateBtn');
        if (status && status.enabled && !armOrConfirm(btn)) return;

        btn.disabled = true;
        showError('');
        request('POST').then(function (result) {
            btn.disabled = false;
            if (result.status === 201 && result.data.token) {
                setStatus(result.data);
                document.getElementById('stSecret').textContent = result.data.token;
                document.getElementById('stSecretBox').hidden = false;
                return;
            }
            showError(result.data.error || tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            btn.disabled = false;
            showError(tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    function onRevoke() {
        var btn = document.getElementById('stRevokeBtn');
        if (!armOrConfirm(btn)) return;

        btn.disabled = true;
        showError('');
        request('DELETE').then(function (result) {
            btn.disabled = false;
            if (result.status === 200) {
                hideSecret();
                setStatus(result.data);
                return;
            }
            showError(result.data.error || tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            btn.disabled = false;
            showError(tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    function onPublicChange() {
        var box = document.getElementById('stPublic');
        var wanted = box.checked;
        box.disabled = true;
        showError('');
        request('PUT', '/api/v1/admin/statistics/public', { enabled: wanted }).then(function (result) {
            if (result.status === 200) {
                setStatus(result.data);
                return;
            }
            box.checked = !wanted;
            box.disabled = false;
            showError(result.data.error || tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            box.checked = !wanted;
            box.disabled = false;
            showError(tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    function onCopy(event) {
        var btn = event.target.closest('.statistics-token-copy');
        if (!btn) return;
        var code = document.getElementById(btn.getAttribute('data-copy'));
        var value = code.textContent;
        var done = function () {
            btn.textContent = tr('statistics_api.modal.copied', {}, 'Copied');
            setTimeout(function () { btn.textContent = tr('statistics_api.modal.copy', {}, 'Copy'); }, 2000);
        };
        // Without the clipboard API (plain http), select the value so a
        // manual Ctrl+C works
        var select = function () {
            var range = document.createRange();
            range.selectNodeContents(code);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done, select);
        } else {
            select();
        }
    }

    function showModal() {
        var modal = buildModal();
        modal.style.display = 'flex';

        document.getElementById('stGenerateBtn').addEventListener('click', onGenerate);
        document.getElementById('stRevokeBtn').addEventListener('click', onRevoke);
        document.getElementById('stPublic').addEventListener('change', onPublicChange);
        modal.querySelector('.modal-content').addEventListener('click', onCopy);
        document.getElementById('stCloseBtn').addEventListener('click', function () {
            modal.style.display = 'none';
        });
        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (e) {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal && pressedOnBackdrop) modal.style.display = 'none';
            pressedOnBackdrop = false;
        });

        request('GET').then(function (result) {
            if (result.status === 200) {
                setStatus(result.data);
            } else {
                showError(result.data.error || tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
            }
        }).catch(function () {
            showError(tr('statistics_api.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    // ========== Init ==========

    function init() {
        var card = document.getElementById('statistics-token-card');
        if (card) {
            card.addEventListener('click', showModal);
            card.addEventListener('keydown', function (e) {
                if (e.target === card && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    showModal();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('poznote:i18n:loaded', renderBadge);
})();
