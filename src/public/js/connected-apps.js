/**
 * Connected apps card and modal on the Settings page.
 *
 * A connected app is a chat app (ChatGPT, Claude, Gemini, ...) the user
 * allowed, on Poznote's OAuth consent page, to use this account through the
 * MCP server. The server side is documented in src/lib/oauth-server.php. This
 * file only lists and disconnects them through /api/v1/users/me/connected-apps,
 * and shows the address to add as a connector in a chat app. The card is
 * rendered by settings.php when that sign-in is configured on the instance,
 * or while the account has connections.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };
    const esc = window.escapeHtml || function (text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };

    var API = '/api/v1/users/me/connected-apps';

    function connectedAppsConfig() {
        var config = typeof window.getPoznotePageConfig === 'function' ? window.getPoznotePageConfig() : null;
        return config && config.connectedApps ? config.connectedApps : {};
    }

    function connectorUrl() {
        var url = connectedAppsConfig().connector_url;
        return typeof url === 'string' ? url : '';
    }

    // Where the apps are sent to sign in, shown to administrators only
    // (settings.php sends it to nobody else), with a warning when it cannot
    // work: chat apps connect from the internet over HTTPS.
    function signInBox() {
        var config = connectedAppsConfig();
        if (typeof config.sign_in_status !== 'string') return '';
        var status = config.sign_in_status;
        var url = typeof config.sign_in_url === 'string' ? config.sign_in_url : '';
        var warning = '';
        if (status === 'missing') {
            warning = tr('connected_apps.modal.sign_in_missing', {}, 'Not set: chat apps cannot sign in until it is.');
        } else if (status === 'unreachable') {
            warning = tr('connected_apps.modal.sign_in_unreachable', {}, 'Chat apps connect from the internet over HTTPS, and this address does not look reachable that way.');
        }
        return '<div class="connected-apps-signin' + (warning ? ' is-warning' : '') + '">' +
            '<span class="connected-apps-signin-label">' + esc(tr('connected_apps.modal.sign_in_label', {}, 'Apps are sent to sign in at')) + '</span> ' +
            (url ? '<code class="connected-apps-signin-url">' + esc(url) + '</code>' : '') +
            (warning ? '<span class="connected-apps-signin-warning">' + esc(warning) + '</span>' : '') +
            ' <a href="admin/webhooks.php#instance-url" class="connected-apps-signin-change">' + esc(tr('connected_apps.modal.sign_in_change', {}, 'Change it (Admin Webhooks, Instance URL)')) + '</a>' +
        '</div>';
    }

    function renderBadge(count) {
        var badge = document.getElementById('connected-apps-status-badge');
        if (!badge) return;
        if (count === 1) {
            badge.textContent = tr('connected_apps.status.count_one', {}, '1 app');
        } else if (count > 1) {
            badge.textContent = tr('connected_apps.status.count_other', { count: count }, '{{count}} apps');
        } else {
            badge.textContent = tr('connected_apps.status.none', {}, 'None');
        }
        badge.className = 'setting-status ' + (count > 0 ? 'enabled' : 'disabled');
    }

    function levelLabel(level) {
        if (level === 'read') return tr('connected_apps.level.read', {}, 'Read only');
        if (level === 'admin') return tr('connected_apps.level.admin', {}, 'Full access');
        return tr('connected_apps.level.write', {}, 'Read and edit');
    }

    function request(method, path) {
        return fetch(path, {
            method: method,
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                return { status: r.status, data: data || {} };
            });
        });
    }

    function buildModal() {
        var existing = document.getElementById('connectedAppsModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'connectedAppsModal';
        modal.className = 'modal';
        var url = connectorUrl();
        var connectorBox = url
            ? '<div class="app-password-secret connected-apps-connector">' +
                  '<div class="app-password-secret-title">' + esc(tr('connected_apps.modal.connector_label', {}, 'Connector address')) + '</div>' +
                  '<div class="app-password-secret-row">' +
                      '<code id="caConnectorUrl" class="app-password-secret-value">' + esc(url) + '</code>' +
                      '<button type="button" class="btn btn-secondary app-password-copy" id="caCopyBtn">' + esc(tr('connected_apps.modal.copy', {}, 'Copy')) + '</button>' +
                  '</div>' +
                  '<p class="app-password-secret-usage">' + esc(tr('connected_apps.modal.connector_hint', {}, 'To connect a chat app, add this address as a connector (custom MCP server) in ChatGPT, Claude or Gemini, then sign in to Poznote when the app asks you to. Leave any client ID and secret fields empty.')) + '</p>' +
              '</div>' + signInBox()
            : '';
        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + esc(tr('connected_apps.modal.title', {}, 'Connected apps')) + '</h3>' +
                connectorBox +
                '<p class="text-small-muted app-passwords-description">' +
                    esc(tr('connected_apps.modal.description', {}, 'Chat apps you allowed to sign in to Poznote through the MCP server can use this account at the access level you chose. Disconnecting one stops it within a minute; it can only come back by asking you again.')) +
                '</p>' +
                '<div id="caError" class="error app-passwords-error" hidden></div>' +
                '<ul class="app-password-list" id="caList"></ul>' +
                '<div class="modal-buttons">' +
                    '<button type="button" class="btn-cancel" id="caCloseBtn">' + esc(tr('connected_apps.modal.close', {}, 'Close')) + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        return modal;
    }

    function showError(message) {
        var el = document.getElementById('caError');
        if (!el) return;
        el.textContent = message;
        el.hidden = !message;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // Built with DOM calls, never as an HTML string: the app name comes from
    // whoever registered the app (open dynamic client registration), and the
    // shared escaper leaves quotes alone, so a name with a " in it would break
    // out of a title="" attribute.
    function renderList(rows) {
        var list = document.getElementById('caList');
        if (!list) return;
        list.textContent = '';

        if (!rows || rows.length === 0) {
            list.appendChild(el('li', 'app-passwords-empty', tr('connected_apps.modal.empty', {}, 'No connected app.')));
            return;
        }

        rows.forEach(function (row) {
            var meta = [levelLabel(row.access_level)];
            if (row.created_at) {
                meta.push(tr('connected_apps.modal.connected', { date: row.created_at }, 'Connected {{date}}'));
            }
            if (row.last_used_at) {
                meta.push(tr('connected_apps.modal.last_used', { date: row.last_used_at }, 'Last used {{date}}'));
            }
            var id = String(parseInt(row.id, 10));

            var item = el('li', 'app-password-row');
            item.setAttribute('data-id', id);
            var main = el('div', 'app-password-main');
            var label = el('span', 'app-password-label', String(row.client_name || ''));
            label.setAttribute('title', String(row.client_name || ''));
            main.appendChild(label);
            main.appendChild(el('span', 'app-password-meta', meta.join(' · ')));
            var button = el('button', 'btn btn-danger app-password-revoke', tr('connected_apps.modal.disconnect', {}, 'Disconnect'));
            button.type = 'button';
            button.setAttribute('data-id', id);
            item.appendChild(main);
            item.appendChild(button);
            list.appendChild(item);
        });
    }

    function loadList() {
        return request('GET', API).then(function (result) {
            if (result.status !== 200 || !result.data.connected_apps) {
                showError(result.data.error || tr('connected_apps.errors.load_failed', {}, 'Could not load your connected apps.'));
                renderList([]);
                return;
            }
            renderBadge(result.data.connected_apps.length);
            renderList(result.data.connected_apps);
        }).catch(function () {
            showError(tr('connected_apps.errors.load_failed', {}, 'Could not load your connected apps.'));
            renderList([]);
        });
    }

    // Same two-step button as the app passwords: a first click arms it, a
    // second within a few seconds confirms.
    function onListClick(event) {
        var btn = event.target.closest('.app-password-revoke');
        if (!btn) return;
        var id = btn.getAttribute('data-id');

        if (!btn.classList.contains('is-armed')) {
            btn.classList.add('is-armed');
            btn.textContent = tr('connected_apps.modal.confirm_disconnect', {}, 'Confirm');
            btn._disarm = setTimeout(function () {
                btn.classList.remove('is-armed');
                btn.textContent = tr('connected_apps.modal.disconnect', {}, 'Disconnect');
            }, 4000);
            return;
        }

        clearTimeout(btn._disarm);
        btn.disabled = true;
        showError('');
        request('DELETE', API + '/' + encodeURIComponent(id)).then(function (result) {
            if (result.status === 200) {
                return loadList();
            }
            btn.disabled = false;
            showError(result.data.error || tr('connected_apps.errors.generic', {}, 'Something went wrong. Try again.'));
        }).catch(function () {
            btn.disabled = false;
            showError(tr('connected_apps.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    function copyConnectorUrl() {
        var btn = document.getElementById('caCopyBtn');
        var code = document.getElementById('caConnectorUrl');
        var done = function () {
            btn.textContent = tr('connected_apps.modal.copied', {}, 'Copied');
            setTimeout(function () { btn.textContent = tr('connected_apps.modal.copy', {}, 'Copy'); }, 2000);
        };
        // Without the clipboard API (plain http), select it for a manual Ctrl+C
        var select = function () {
            var range = document.createRange();
            range.selectNodeContents(code);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code.textContent).then(done, select);
        } else {
            select();
        }
    }

    function showModal() {
        var modal = buildModal();
        modal.style.display = 'flex';

        var copyBtn = document.getElementById('caCopyBtn');
        if (copyBtn) copyBtn.addEventListener('click', copyConnectorUrl);

        document.getElementById('caList').addEventListener('click', onListClick);
        document.getElementById('caCloseBtn').addEventListener('click', function () {
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

        renderList(null);
        loadList();
    }

    function init() {
        var card = document.getElementById('connected-apps-card');
        if (card) {
            card.addEventListener('click', showModal);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
