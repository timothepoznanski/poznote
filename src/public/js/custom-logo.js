/**
 * Logo card and dialogs on the Settings page (admins only, discussion #1336).
 *
 * While Poznote's logo is in place, every click on the card shows
 * #customLogoNoticeModal first: the logo is about the only thing that still
 * says Poznote on someone else's screen, and a donation is welcome. Change
 * and "Buy me a coffee and change" both lead on to #customLogoModal, Cancel just
 * closes it. Once a custom logo is set, the card opens #customLogoModal
 * straight away: Poznote's is already gone.
 *
 * The chosen image is drawn here at 512 and 192 px, fitted into a square,
 * since the server cannot resize images (lib/branding.php), and both PNG files
 * go to api_branding.php. The page then swaps the logo in place: the rail,
 * the preview, the tab icon and the manifest.
 */
(function () {
    'use strict';

    const tr = window.t || function (key, vars, fallback) { return fallback || key; };

    var API = 'api_branding.php';
    var SIZES = [512, 192];
    // Decoded in the page, so a very large file could stall it
    var MAX_SOURCE_BYTES = 20 * 1024 * 1024;
    var busy = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function openModal(id) {
        var modal = byId(id);
        if (modal) modal.style.display = 'flex';
    }

    function hideModal(id) {
        if (typeof window.closeModal === 'function') {
            window.closeModal(id);
            return;
        }
        var modal = byId(id);
        if (modal) modal.style.display = 'none';
    }

    function showError(message) {
        if (typeof window.showError === 'function') {
            window.showError(message);
        } else {
            window.alert(message);
        }
    }

    function setBusy(value) {
        busy = value;
        ['customLogoUploadBtn', 'customLogoResetBtn'].forEach(function (id) {
            var button = byId(id);
            if (button) button.disabled = value;
        });
    }

    // ========== Notice ==========

    function onCardClick() {
        var card = byId('custom-logo-card');
        openModal(card && card.getAttribute('data-custom-logo') === '1' ? 'customLogoModal' : 'customLogoNoticeModal');
    }

    function continueFromNotice() {
        hideModal('customLogoNoticeModal');
        openModal('customLogoModal');
    }

    // ========== Drawing ==========

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var image = new Image();
            image.onload = function () {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('unreadable image'));
            };
            image.src = url;
        });
    }

    // The image fitted into a size x size square, transparent around it. A
    // large image is halved step by step first: drawn down in one go, it comes
    // out jagged in browsers that ignore imageSmoothingQuality.
    function drawSquare(image, size) {
        var width = image.naturalWidth || size;
        var height = image.naturalHeight || size;
        var source = image;
        while (width > size * 2 && height > size * 2) {
            var step = document.createElement('canvas');
            step.width = Math.round(width / 2);
            step.height = Math.round(height / 2);
            step.getContext('2d').drawImage(source, 0, 0, step.width, step.height);
            source = step;
            width = step.width;
            height = step.height;
        }

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        var scale = Math.min(size / width, size / height);
        var drawWidth = width * scale;
        var drawHeight = height * scale;
        context.drawImage(source, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);

        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error('could not encode the logo'));
            }, 'image/png');
        });
    }

    // ========== Applying ==========

    function setIconLinks(state) {
        var head = document.head;
        head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(function (link) {
            link.remove();
        });
        var links = state.custom
            ? [
                { rel: 'icon', href: state.url, sizes: '512x512', type: 'image/png' },
                { rel: 'icon', href: state.icon_url, sizes: '192x192', type: 'image/png' },
                { rel: 'apple-touch-icon', href: state.url }
            ]
            : [
                { rel: 'icon', href: 'favicon.ico', sizes: '512x512', type: 'image/png' },
                { rel: 'icon', href: 'favicon.svg', type: 'image/svg+xml' },
                { rel: 'apple-touch-icon', href: 'pwa/poznote.png' }
            ];
        links.forEach(function (attributes) {
            var link = document.createElement('link');
            Object.keys(attributes).forEach(function (name) {
                link.setAttribute(name, attributes[name]);
            });
            head.appendChild(link);
        });

        var manifest = head.querySelector('link[rel="manifest"]');
        if (manifest && state.manifest_url) manifest.setAttribute('href', state.manifest_url);
    }

    // Same markup as poznoteLogoMark() in lib/branding.php
    function applyLogo(state) {
        document.querySelectorAll('.poznote-logo').forEach(function (mark) {
            mark.classList.toggle('poznote-logo-custom', !!state.custom);
            mark.style.backgroundImage = state.custom ? 'url("' + state.url + '")' : '';
        });
        setIconLinks(state);

        var card = byId('custom-logo-card');
        if (card) card.setAttribute('data-custom-logo', state.custom ? '1' : '0');

        var badge = byId('custom-logo-badge');
        if (badge) {
            badge.textContent = state.custom
                ? badge.getAttribute('data-label-custom')
                : badge.getAttribute('data-label-default');
            // Poznote's logo is the default, not something off: neutral, not red
            badge.className = 'setting-status ' + (state.custom ? 'enabled' : 'neutral');
        }
        var reset = byId('customLogoResetBtn');
        if (reset) reset.hidden = !state.custom;
    }

    function request(method, body) {
        var options = {
            method: method,
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        };
        if (body !== undefined) options.body = body;
        return fetch(API, options).then(function (response) {
            return response.json().catch(function () { return {}; });
        }).then(function (data) {
            if (!data || !data.success) {
                throw new Error((data && data.error) || '');
            }
            return data;
        });
    }

    function uploadFile(file) {
        if (busy) return;
        if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type) || file.size > MAX_SOURCE_BYTES) {
            showError(tr('modals.custom_logo.invalid', {}, 'This image cannot be used. Choose a PNG, JPEG, WebP, GIF or SVG file of 20 MB at most.'));
            return;
        }
        setBusy(true);
        loadImage(file)
            .then(function (image) {
                return Promise.all(SIZES.map(function (size) { return drawSquare(image, size); }));
            })
            .then(function (blobs) {
                var body = new FormData();
                SIZES.forEach(function (size, index) {
                    body.append('logo_' + size, blobs[index], 'logo-' + size + '.png');
                });
                return request('POST', body).then(applyLogo).catch(function () {
                    showError(tr('modals.custom_logo.failed', {}, 'The logo could not be saved.'));
                });
            }, function () {
                showError(tr('modals.custom_logo.invalid', {}, 'This image cannot be used. Choose a PNG, JPEG, WebP, GIF or SVG file of 20 MB at most.'));
            })
            .then(function () { setBusy(false); });
    }

    function resetLogo() {
        if (busy) return;
        var run = function () {
            setBusy(true);
            request('DELETE')
                .then(applyLogo)
                .catch(function () {
                    showError(tr('modals.custom_logo.failed', {}, 'The logo could not be saved.'));
                })
                .then(function () { setBusy(false); });
        };
        var message = tr('modals.custom_logo.reset_confirm', {}, 'Go back to the Poznote logo for every user?');
        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(message, tr('modals.custom_logo.title', {}, 'Logo'))
                .then(function (confirmed) { if (confirmed) run(); });
        } else if (window.confirm(message)) {
            run();
        }
    }

    function init() {
        var card = byId('custom-logo-card');
        if (!card) return;
        card.addEventListener('click', onCardClick);

        var continueButton = byId('customLogoNoticeContinueBtn');
        if (continueButton) continueButton.addEventListener('click', continueFromNotice);

        var donateButton = byId('customLogoNoticeDonateBtn');
        if (donateButton) {
            // Ko-fi in a new tab, and on to the logo here
            donateButton.addEventListener('click', function () {
                window.open(donateButton.getAttribute('data-url'), '_blank', 'noopener');
                continueFromNotice();
            });
        }

        var input = byId('customLogoFileInput');
        var uploadButton = byId('customLogoUploadBtn');
        if (input && uploadButton) {
            uploadButton.addEventListener('click', function () { input.click(); });
            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                input.value = '';
                if (file) uploadFile(file);
            });
        }

        var resetButton = byId('customLogoResetBtn');
        if (resetButton) resetButton.addEventListener('click', resetLogo);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
