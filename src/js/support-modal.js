/**
 * "Support Poznote" modal, opened from the icon rail's heart button (above
 * Logout in icon_sidebar.php).
 *
 * A small joke. A plain modal, styled like the profile and logout ones,
 * asks whether you would buy Poznote a coffee: "No" runs away the moment the
 * pointer touches it, and "Yes" sticks to the pointer once touched, so a
 * click anywhere lands on it. Yes opens the Ko-fi page (the rail button's
 * href, which stays the no-JS fallback) in a new tab and the modal turns
 * into a thank-you with a burst of confetti.
 *
 * Only the pointer gets teased. Escape closes the modal at any time, the
 * keyboard still reaches No (Tab, then Enter), and on touch screens, which
 * have no hover, No simply hops away from each tap while Yes behaves.
 *
 * Self-contained like js/profile.js: the rail is on nearly every page while
 * the shared modal sheets are not, so css/profile-modal.css styles this modal
 * too. Loaded by icon_sidebar.php.
 */
(function () {
    'use strict';

    if (window.__poznoteSupportModalLoaded) return;
    window.__poznoteSupportModalLoaded = true;

    var DEFAULT_URL = 'https://ko-fi.com/timothepoznanski';

    // How far from the pointer the spot No picks should be, and the gap kept
    // from the viewport edges.
    var SAFE_DISTANCE = 220;
    var EDGE_MARGIN = 12;

    var CONFETTI_COUNT = 60;
    var CONFETTI_COLORS = ['#e63946', '#ff6b81', '#ffb703', '#8ecae6', '#219ebc', '#90be6d', '#f4a261', '#c77dff'];

    // window.PoznoteSupportI18n comes from icon_sidebar.php, already resolved
    // in the user's language, and is checked first because window.t is absent
    // on the pages that do not load js/globals.js.
    function tr(key, fallback) {
        var preset = window.PoznoteSupportI18n && window.PoznoteSupportI18n[key];
        if (typeof preset === 'string') return preset;
        if (typeof window.t === 'function') return window.t(key, {}, fallback);
        return fallback;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function showSupportModal(url) {
        var existing = document.getElementById('supportPoznoteModal');
        if (existing) existing.remove();

        var modal = el('div', 'modal');
        modal.id = 'supportPoznoteModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'spQuestion');

        var content = el('div', 'modal-content');

        var title = el('h3');
        title.id = 'spQuestion';
        var titleHeart = el('i', 'lucide lucide-heart support-title-heart');
        titleHeart.setAttribute('aria-hidden', 'true');
        title.appendChild(titleHeart);
        title.appendChild(document.createTextNode(tr('home.support_poznote', 'Support Poznote')));
        var question = el('p', 'text-small-muted', tr('support_modal.question', 'If you enjoy Poznote, would you like to buy it a little coffee to support it?'));

        var buttons = el('div', 'modal-buttons');
        var noBtn = el('button', 'btn-danger', tr('support_modal.no', 'No...'));
        noBtn.type = 'button';
        noBtn.id = 'spNoBtn';
        var yesBtn = el('button', 'btn-primary', tr('support_modal.yes', 'Yes!'));
        yesBtn.type = 'button';
        yesBtn.id = 'spYesBtn';
        buttons.appendChild(noBtn);
        buttons.appendChild(yesBtn);

        content.appendChild(title);
        content.appendChild(question);
        content.appendChild(buttons);
        modal.appendChild(content);
        document.body.appendChild(modal);
        modal.style.display = 'flex';

        var yesStuck = false;
        var closed = false;

        function close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('visibilitychange', onVisible);
            modal.remove();
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        }
        document.addEventListener('keydown', onKey);

        // Click on the backdrop closes. Once Yes is stuck to the pointer the
        // backdrop can no longer be hit, which is rather the point.
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });

        // Lifts a button out of the row: a same-sized placeholder keeps its
        // slot, and the button becomes a fixed-position child of the overlay
        // (nothing above it carries a transform, so fixed means the viewport),
        // starting from exactly the spot it occupied.
        function detach(btn) {
            if (btn.classList.contains('support-floating')) return;
            var rect = btn.getBoundingClientRect();
            var placeholder = el('span', 'support-placeholder');
            placeholder.style.width = rect.width + 'px';
            placeholder.style.height = rect.height + 'px';
            btn.parentNode.insertBefore(placeholder, btn);
            btn.style.width = rect.width + 'px';
            btn.style.height = rect.height + 'px';
            btn.style.left = rect.left + 'px';
            btn.style.top = rect.top + 'px';
            btn.classList.add('support-floating');
            modal.appendChild(btn);
        }

        function placeAt(btn, x, y) {
            btn.style.left = x + 'px';
            btn.style.top = y + 'px';
        }

        // A spot in the viewport away from the pointer. Random picks are
        // tried until one is far enough; the farthest seen wins otherwise (a
        // tiny window may have no spot at SAFE_DISTANCE at all).
        function pickSpot(px, py, w, h) {
            var maxX = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
            var maxY = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
            var best = { x: EDGE_MARGIN, y: EDGE_MARGIN };
            var bestDist = -1;
            for (var i = 0; i < 30; i++) {
                var x = EDGE_MARGIN + Math.random() * (maxX - EDGE_MARGIN);
                var y = EDGE_MARGIN + Math.random() * (maxY - EDGE_MARGIN);
                var dist = Math.hypot(x + w / 2 - px, y + h / 2 - py);
                if (dist > bestDist) {
                    best = { x: x, y: y };
                    bestDist = dist;
                }
                if (dist >= SAFE_DISTANCE) break;
            }
            return best;
        }

        // Taps get an instant hop: with the glide, the finger's click could
        // still land on the button while it is on its way out.
        function flee(px, py, instant) {
            detach(noBtn);
            var rect = noBtn.getBoundingClientRect();
            var spot = pickSpot(px, py, rect.width, rect.height);
            if (instant) noBtn.classList.add('support-no-transition');
            placeAt(noBtn, spot.x, spot.y);
            if (instant) {
                // Flush the style so the class removal does not undo the
                // instant move.
                void noBtn.offsetWidth;
                noBtn.classList.remove('support-no-transition');
            }
        }

        function followYes(px, py) {
            placeAt(yesBtn, px - yesBtn.offsetWidth / 2, py - yesBtn.offsetHeight / 2);
        }

        function stickYes(px, py) {
            if (yesStuck) return;
            detach(yesBtn);
            yesStuck = true;
            followYes(px, py);
        }

        // Distance from a point to the element's box, 0 when inside it.
        function distanceTo(node, px, py) {
            var r = node.getBoundingClientRect();
            var dx = Math.max(r.left - px, 0, px - r.right);
            var dy = Math.max(r.top - py, 0, py - r.bottom);
            return Math.hypot(dx, dy);
        }

        function onPointerMove(e) {
            if (closed || e.pointerType === 'touch') return;
            if (yesStuck) {
                followYes(e.clientX, e.clientY);
                // Yes covers the pointer, so No never sees it enter; count
                // the pointer landing on No as touching it all the same.
                if (distanceTo(noBtn, e.clientX, e.clientY) === 0) {
                    flee(e.clientX, e.clientY, false);
                }
            } else if (distanceTo(yesBtn, e.clientX, e.clientY) === 0) {
                stickYes(e.clientX, e.clientY);
            }
        }
        document.addEventListener('pointermove', onPointerMove);

        // No runs on contact only: nothing happens while the pointer merely
        // roams the card or rests on Yes right next to it.
        noBtn.addEventListener('pointerenter', function (e) {
            if (e.pointerType !== 'touch') flee(e.clientX, e.clientY, false);
        });
        // Backstop for a pointer that lands on Yes between two move events.
        yesBtn.addEventListener('pointerenter', function (e) {
            if (e.pointerType !== 'touch') stickYes(e.clientX, e.clientY);
        });

        // Touch: no hover to run from, so No hops away from the finger, and
        // preventDefault() cancels the click the tap would otherwise fire.
        noBtn.addEventListener('touchstart', function (e) {
            e.preventDefault();
            var t = e.touches[0];
            flee(t ? t.clientX : 0, t ? t.clientY : 0, true);
        }, { passive: false });

        // Reached all the same (keyboard, or a lucky click): fair enough.
        noBtn.addEventListener('click', close);

        yesBtn.addEventListener('click', function () {
            window.open(url, '_blank', 'noopener,noreferrer');
            thank();
        });

        // The modal becomes a thank-you note. The Ko-fi tab usually takes the
        // focus at once, so the confetti fires again when the user comes back.
        function thank() {
            document.removeEventListener('pointermove', onPointerMove);
            noBtn.remove();
            yesBtn.remove();
            content.textContent = '';

            content.appendChild(el('h3', '', tr('support_modal.thanks', 'Thank you!')));
            content.appendChild(el('p', 'text-small-muted', tr('support_modal.thanks_sub', 'You are wonderful.')));

            var actions = el('div', 'modal-buttons');
            var closeBtn = el('button', 'btn-cancel', tr('common.close', 'Close'));
            closeBtn.type = 'button';
            closeBtn.addEventListener('click', close);
            actions.appendChild(closeBtn);
            content.appendChild(actions);
            closeBtn.focus();

            confetti();
            document.addEventListener('visibilitychange', onVisible);
        }

        function onVisible() {
            if (document.visibilityState !== 'visible') return;
            document.removeEventListener('visibilitychange', onVisible);
            confetti();
        }

        // Pieces burst from the middle of the dialog, drift sideways, fly up,
        // then fall and spin (css/profile-modal.css reads the custom
        // properties). Each piece is dropped once its animation is over, so
        // a replay does not pile up.
        function confetti() {
            if (reducedMotion()) return;
            var r = content.getBoundingClientRect();
            var cx = r.left + r.width / 2;
            var cy = r.top + r.height / 2;
            var pieces = [];
            for (var i = 0; i < CONFETTI_COUNT; i++) {
                var piece = el('span', 'support-confetti');
                var side = Math.random() < 0.5 ? -1 : 1;
                piece.style.left = cx + 'px';
                piece.style.top = cy + 'px';
                piece.style.setProperty('--dx', side * (40 + Math.random() * 260) + 'px');
                piece.style.animationDelay = Math.random() * 150 + 'ms';
                var bit = el('i');
                bit.style.width = 6 + Math.random() * 6 + 'px';
                bit.style.height = 8 + Math.random() * 8 + 'px';
                bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
                bit.style.setProperty('--up', -(60 + Math.random() * 180) + 'px');
                bit.style.setProperty('--dy', 240 + Math.random() * 260 + 'px');
                bit.style.setProperty('--rot', side * (360 + Math.random() * 540) + 'deg');
                bit.style.animationDelay = piece.style.animationDelay;
                piece.appendChild(bit);
                modal.appendChild(piece);
                pieces.push(piece);
            }
            setTimeout(function () {
                pieces.forEach(function (p) { p.remove(); });
            }, 2000);
        }
    }

    function init() {
        var railBtn = document.getElementById('iconSidebarSupportBtn');
        if (!railBtn) return;
        railBtn.addEventListener('click', function (e) {
            e.preventDefault();
            showSupportModal(railBtn.getAttribute('href') || DEFAULT_URL);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
