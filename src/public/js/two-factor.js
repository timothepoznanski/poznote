/**
 * Two-factor authentication card and modal on the Settings page.
 *
 * The second factor is a TOTP code asked for after the password on the login
 * form. The server side, and the reasons for its rules, are documented in
 * src/lib/totp.php. This file drives /api/v1/users/me/two-factor: setting the
 * factor up (QR code, first code), showing the recovery codes exactly once,
 * replacing them, and switching the factor off.
 *
 * The QR code is drawn here, in the browser, with the vendored
 * qrcode-generator: the otpauth:// URI carries the shared secret and must not
 * be handed to an online QR service.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };
    const esc = window.escapeHtml || function (text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    };

    var API = '/api/v1/users/me/two-factor';
    var status = null;

    // ========== Card badge ==========

    function seedStatusFromPageConfig() {
        if (status !== null || typeof window.getPoznotePageConfig !== 'function') {
            return;
        }
        var config = window.getPoznotePageConfig();
        if (config && config.twoFactor && typeof config.twoFactor.enabled === 'boolean') {
            status = config.twoFactor;
        }
    }

    function renderBadge() {
        var badge = document.getElementById('two-factor-status-badge');
        if (!badge || status === null) return;
        badge.textContent = status.enabled
            ? tr('two_factor.status.enabled', {}, 'Enabled')
            : tr('two_factor.status.disabled', {}, 'Disabled');
        badge.className = 'setting-status ' + (status.enabled ? 'enabled' : 'disabled');
    }

    function adoptStatus(data) {
        if (data && typeof data.enabled === 'boolean') {
            status = {
                enabled: data.enabled,
                enabled_at: data.enabled_at || null,
                recovery_codes_remaining: data.recovery_codes_remaining || 0,
                unavailable_reason: data.unavailable_reason || null,
                sso_login_available: !!data.sso_login_available
            };
            renderBadge();
        }
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

    // The server answers in English; the cases a user can act on are mapped to
    // translated text through the "code" it sends along.
    function errorText(result) {
        var code = result && result.data ? result.data.code : '';
        if (code === 'invalid_code') {
            return tr('two_factor.errors.invalid_code', {}, 'Incorrect code. Check the time on your device and try again.');
        }
        if (code === 'invalid_password') {
            return tr('two_factor.errors.invalid_password', {}, 'Current password is incorrect.');
        }
        if (result && result.status === 429) {
            return tr('two_factor.errors.too_many', {}, 'Too many failed attempts. Try again later.');
        }
        return (result && result.data && result.data.error) || tr('two_factor.errors.generic', {}, 'Something went wrong. Try again.');
    }

    // ========== QR code ==========

    var qrLibraryPromise = null;

    function loadQrLibrary() {
        if (typeof window.qrcode === 'function') {
            return Promise.resolve();
        }
        if (!qrLibraryPromise) {
            qrLibraryPromise = new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                var path = 'js/qrcode-generator/qrcode.js';
                script.src = window.poznoteAssetUrl ? window.poznoteAssetUrl(path) : path;
                script.onload = resolve;
                script.onerror = function () {
                    qrLibraryPromise = null;
                    reject(new Error('qrcode library failed to load'));
                };
                document.head.appendChild(script);
            });
        }
        return qrLibraryPromise;
    }

    // The secret typed by hand stays available under the QR code, so a failed
    // draw only costs the convenience.
    function drawQrCode(container, uri) {
        loadQrLibrary().then(function () {
            var qr = window.qrcode(0, 'M');
            qr.addData(uri);
            qr.make();
            container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
            container.hidden = false;
        }).catch(function () {
            container.hidden = true;
        });
    }

    // ========== Modal ==========

    function buildModal() {
        var existing = document.getElementById('twoFactorModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'twoFactorModal';
        modal.className = 'modal';
        modal.innerHTML =
            '<div class="modal-content">' +
                '<h3>' + esc(tr('two_factor.modal.title', {}, 'Two-factor authentication')) + '</h3>' +
                '<div id="tfBody"></div>' +
                '<div id="tfError" class="error two-factor-error" hidden></div>' +
                '<div class="modal-buttons" id="tfButtons"></div>' +
            '</div>';
        document.body.appendChild(modal);

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (e) {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', function (e) {
            // The recovery codes are shown once: a stray click outside must not
            // be what makes them disappear.
            if (e.target === modal && pressedOnBackdrop && !modal.classList.contains('is-showing-codes')) {
                closeModal();
            }
            pressedOnBackdrop = false;
        });
        return modal;
    }

    function closeModal() {
        var modal = document.getElementById('twoFactorModal');
        if (modal) modal.remove();
    }

    function showError(message) {
        var el = document.getElementById('tfError');
        if (!el) return;
        el.textContent = message || '';
        el.hidden = !message;
    }

    function setView(bodyHtml, buttonsHtml, showingCodes) {
        var modal = document.getElementById('twoFactorModal');
        if (!modal) return;
        modal.classList.toggle('is-showing-codes', !!showingCodes);
        document.getElementById('tfBody').innerHTML = bodyHtml;
        document.getElementById('tfButtons').innerHTML = buttonsHtml;
        showError('');
    }

    function closeButtonHtml(labelKey, fallback) {
        return '<button type="button" class="btn-cancel" id="tfCloseBtn">' + esc(tr(labelKey, {}, fallback)) + '</button>';
    }

    function bindClose() {
        var btn = document.getElementById('tfCloseBtn');
        if (btn) btn.addEventListener('click', closeModal);
    }

    function codeInputHtml(id, placeholderKey, fallback) {
        return '<input type="text" id="' + id + '" class="two-factor-code" inputmode="numeric" autocomplete="one-time-code" ' +
            'spellcheck="false" maxlength="16" placeholder="' + esc(tr(placeholderKey, {}, fallback)) + '">';
    }

    function onEnter(id, handler) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handler();
                }
            });
        }
    }

    // Disables the button while a request runs and restores it afterwards.
    function run(buttonId, promiseFactory) {
        var btn = document.getElementById(buttonId);
        if (btn && btn.disabled) return;
        if (btn) btn.disabled = true;
        showError('');
        promiseFactory().catch(function () {
            showError(tr('two_factor.errors.generic', {}, 'Something went wrong. Try again.'));
        }).then(function () {
            var current = document.getElementById(buttonId);
            if (current) current.disabled = false;
        });
    }

    // ---------- View: off ----------

    function renderDisabledView() {
        setView(
            '<p class="text-small-muted two-factor-description">' +
                esc(tr('two_factor.modal.description', {}, 'After your password, sign-in asks for a 6-digit code from an authenticator app on your phone (Aegis, Google Authenticator, 1Password, Bitwarden...). Someone who learns your password still cannot open your account.')) +
            '</p>' +
            '<p class="text-small-muted two-factor-description">' +
                esc(tr('two_factor.modal.api_notice', {}, 'Apps that connect through the API with your account password (browser extension, MCP server, scripts) will stop working: give each of them an app password instead.')) +
            '</p>' +
            (status && status.sso_login_available
                ? '<p class="text-small-muted two-factor-description">' +
                    esc(tr('two_factor.modal.sso_notice', {}, 'Signing in with SSO does not ask for this code: that login is protected by your identity provider, so turn on its own second factor there.')) +
                  '</p>'
                : '') +
            '<input type="password" id="tfSetupPassword" autocomplete="current-password" placeholder="' +
                esc(tr('two_factor.modal.current_password', {}, 'Current password')) + '">',
            closeButtonHtml('two_factor.modal.cancel', 'Cancel') +
            '<button type="button" class="btn-primary" id="tfSetupBtn">' + esc(tr('two_factor.modal.setup', {}, 'Set up')) + '</button>'
        );
        bindClose();

        var submit = function () {
            var password = document.getElementById('tfSetupPassword').value;
            if (!password) {
                showError(tr('two_factor.errors.password_required', {}, 'Enter your current password.'));
                return;
            }
            run('tfSetupBtn', function () {
                return request('POST', API + '/setup', { current_password: password }).then(function (result) {
                    if (result.status === 200 && result.data.secret) {
                        renderSetupView(result.data);
                        return;
                    }
                    showError(errorText(result));
                });
            });
        };
        document.getElementById('tfSetupBtn').addEventListener('click', submit);
        onEnter('tfSetupPassword', submit);
        document.getElementById('tfSetupPassword').focus();
    }

    // ---------- View: scanning the secret ----------

    function groupSecret(secret) {
        return String(secret).replace(/(.{4})/g, '$1 ').trim();
    }

    function renderSetupView(setup) {
        setView(
            '<p class="text-small-muted two-factor-description">' +
                esc(tr('two_factor.modal.scan', {}, 'Scan this QR code with your authenticator app, or enter the key by hand, then type the 6-digit code the app shows.')) +
            '</p>' +
            '<div class="two-factor-qr" id="tfQr" hidden></div>' +
            '<div class="two-factor-secret-row">' +
                '<code id="tfSecret" class="two-factor-secret">' + esc(groupSecret(setup.secret)) + '</code>' +
                '<button type="button" class="btn btn-secondary two-factor-copy" id="tfCopySecret">' + esc(tr('two_factor.modal.copy', {}, 'Copy')) + '</button>' +
            '</div>' +
            codeInputHtml('tfEnableCode', 'two_factor.modal.code', '6-digit code'),
            closeButtonHtml('two_factor.modal.cancel', 'Cancel') +
            '<button type="button" class="btn-primary" id="tfEnableBtn">' + esc(tr('two_factor.modal.enable', {}, 'Enable')) + '</button>'
        );
        bindClose();
        drawQrCode(document.getElementById('tfQr'), setup.otpauth_uri);

        document.getElementById('tfCopySecret').addEventListener('click', function () {
            copyText(setup.secret, 'tfCopySecret', 'tfSecret');
        });

        var submit = function () {
            var code = document.getElementById('tfEnableCode').value.trim();
            if (!code) {
                showError(tr('two_factor.errors.code_required', {}, 'Enter the code shown by your authenticator app.'));
                return;
            }
            run('tfEnableBtn', function () {
                return request('POST', API + '/enable', { code: code }).then(function (result) {
                    if (result.status === 200 && result.data.recovery_codes) {
                        adoptStatus(result.data);
                        renderRecoveryCodesView(result.data.recovery_codes);
                        return;
                    }
                    showError(errorText(result));
                });
            });
        };
        document.getElementById('tfEnableBtn').addEventListener('click', submit);
        onEnter('tfEnableCode', submit);
        document.getElementById('tfEnableCode').focus();
    }

    // ---------- View: recovery codes, shown once ----------

    function renderRecoveryCodesView(codes) {
        setView(
            '<p class="two-factor-description">' +
                esc(tr('two_factor.modal.recovery_intro', {}, 'Two-factor authentication is on. Keep these recovery codes somewhere safe, away from your phone: each one signs you in once if you lose your device. They will not be shown again.')) +
            '</p>' +
            '<ul class="two-factor-recovery-list" id="tfRecoveryList">' +
                codes.map(function (code) { return '<li><code>' + esc(code) + '</code></li>'; }).join('') +
            '</ul>' +
            '<div class="two-factor-recovery-actions">' +
                '<button type="button" class="btn btn-secondary" id="tfCopyCodes">' + esc(tr('two_factor.modal.copy', {}, 'Copy')) + '</button>' +
                '<button type="button" class="btn btn-secondary" id="tfDownloadCodes">' + esc(tr('two_factor.modal.download', {}, 'Download')) + '</button>' +
            '</div>',
            '<button type="button" class="btn-primary" id="tfCloseBtn">' + esc(tr('two_factor.modal.saved_codes', {}, 'I have saved my codes')) + '</button>',
            true
        );
        bindClose();

        var text = codes.join('\n');
        document.getElementById('tfCopyCodes').addEventListener('click', function () {
            copyText(text, 'tfCopyCodes', 'tfRecoveryList');
        });
        document.getElementById('tfDownloadCodes').addEventListener('click', function () {
            var blob = new Blob([text + '\n'], { type: 'text/plain' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'poznote-recovery-codes.txt';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
    }

    // ---------- View: on ----------

    function renderEnabledView() {
        var remaining = status ? status.recovery_codes_remaining : 0;
        var remainingText = remaining === 1
            ? tr('two_factor.modal.recovery_remaining_one', {}, '1 recovery code left.')
            : tr('two_factor.modal.recovery_remaining_other', { count: remaining }, '{{count}} recovery codes left.');
        var since = status && status.enabled_at
            ? tr('two_factor.modal.enabled_since', { date: status.enabled_at }, 'Enabled since {{date}}.')
            : tr('two_factor.modal.enabled', {}, 'Two-factor authentication is on.');

        setView(
            '<p class="text-small-muted two-factor-description">' + esc(since) + ' ' + esc(remainingText) + '</p>' +
            '<div class="two-factor-section">' +
                '<div class="two-factor-section-title">' + esc(tr('two_factor.modal.recovery_title', {}, 'Recovery codes')) + '</div>' +
                '<p class="text-small-muted">' + esc(tr('two_factor.modal.recovery_help', {}, 'Generating new codes cancels the old ones. Confirm with a code from your authenticator app.')) + '</p>' +
                '<div class="two-factor-row">' +
                    codeInputHtml('tfRegenerateCode', 'two_factor.modal.code', '6-digit code') +
                    '<button type="button" class="btn btn-secondary" id="tfRegenerateBtn">' + esc(tr('two_factor.modal.regenerate', {}, 'New codes')) + '</button>' +
                '</div>' +
            '</div>' +
            '<div class="two-factor-section">' +
                '<div class="two-factor-section-title">' + esc(tr('two_factor.modal.disable_title', {}, 'Turn off')) + '</div>' +
                '<p class="text-small-muted">' + esc(tr('two_factor.modal.disable_help', {}, 'Your password alone will sign you in again. Confirm with your password and a code from your app, or a recovery code.')) + '</p>' +
                // Only the fields here: their button is the dialog's own action,
                // next to Close, the way Delete Account places its red button.
                '<div class="two-factor-row two-factor-fields">' +
                    '<input type="password" id="tfDisablePassword" autocomplete="current-password" placeholder="' + esc(tr('two_factor.modal.current_password', {}, 'Current password')) + '">' +
                    '<input type="text" id="tfDisableCode" class="two-factor-code" autocomplete="one-time-code" spellcheck="false" maxlength="16" placeholder="' + esc(tr('two_factor.modal.code_or_recovery', {}, 'Code or recovery code')) + '">' +
                '</div>' +
            '</div>',
            closeButtonHtml('two_factor.modal.close', 'Close') +
            '<button type="button" class="btn-danger" id="tfDisableBtn">' + esc(tr('two_factor.modal.disable', {}, 'Turn off')) + '</button>'
        );
        bindClose();

        var regenerate = function () {
            var code = document.getElementById('tfRegenerateCode').value.trim();
            if (!code) {
                showError(tr('two_factor.errors.code_required', {}, 'Enter the code shown by your authenticator app.'));
                return;
            }
            run('tfRegenerateBtn', function () {
                return request('POST', API + '/recovery-codes', { code: code }).then(function (result) {
                    if (result.status === 200 && result.data.recovery_codes) {
                        adoptStatus(result.data);
                        renderRecoveryCodesView(result.data.recovery_codes);
                        return;
                    }
                    showError(errorText(result));
                });
            });
        };
        document.getElementById('tfRegenerateBtn').addEventListener('click', regenerate);
        onEnter('tfRegenerateCode', regenerate);

        var disable = function () {
            var password = document.getElementById('tfDisablePassword').value;
            var code = document.getElementById('tfDisableCode').value.trim();
            if (!password || !code) {
                showError(tr('two_factor.errors.disable_required', {}, 'Enter your current password and a code.'));
                return;
            }
            run('tfDisableBtn', function () {
                return request('POST', API + '/disable', { current_password: password, code: code }).then(function (result) {
                    if (result.status === 200 && result.data.success) {
                        adoptStatus(result.data);
                        closeModal();
                        return;
                    }
                    showError(errorText(result));
                });
            });
        };
        document.getElementById('tfDisableBtn').addEventListener('click', disable);
        onEnter('tfDisableCode', disable);
    }

    // ---------- Clipboard ----------

    function copyText(value, buttonId, fallbackElementId) {
        var btn = document.getElementById(buttonId);
        var done = function () {
            if (!btn) return;
            btn.textContent = tr('two_factor.modal.copied', {}, 'Copied');
            setTimeout(function () {
                if (btn.isConnected) btn.textContent = tr('two_factor.modal.copy', {}, 'Copy');
            }, 2000);
        };
        // Fallback when the clipboard API is unavailable (plain http): select
        // the value so a manual Ctrl+C works.
        var select = function () {
            var el = document.getElementById(fallbackElementId);
            if (!el) return;
            var range = document.createRange();
            range.selectNodeContents(el);
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

    // ========== Open ==========

    function showModal() {
        var modal = buildModal();
        modal.style.display = 'flex';
        setView('<p class="text-small-muted">' + esc(tr('common.loading', {}, 'Loading...')) + '</p>', closeButtonHtml('two_factor.modal.close', 'Close'));
        bindClose();

        // Always re-read the state: the seed is from page load, and the count
        // of recovery codes moves with every sign-in that uses one.
        request('GET', API).then(function (result) {
            if (!document.getElementById('twoFactorModal')) return;
            if (result.status !== 200) {
                showError(errorText(result));
                return;
            }
            adoptStatus(result.data);
            if (status.enabled) {
                renderEnabledView();
            } else {
                renderDisabledView();
            }
        }).catch(function () {
            showError(tr('two_factor.errors.generic', {}, 'Something went wrong. Try again.'));
        });
    }

    // ========== Init ==========

    function init() {
        seedStatusFromPageConfig();
        renderBadge();

        var card = document.getElementById('two-factor-card');
        // Like the password card: when the factor could never be asked for
        // (SSO-only sign-in) the card stays visible, greyed out, and explains
        // itself in its tooltip instead of opening.
        if (card && !card.classList.contains('home-card-disabled')) {
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
