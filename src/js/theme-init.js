// Per-user localStorage wrapper so display preferences (theme, font sizes,
// icon scale) don't leak between accounts sharing the same browser.
// The user id comes from the poznote_uid cookie set by auth.php; without it
// (login page, public pages) the legacy shared keys are used as before.
// On first read for a given user, the legacy shared value is migrated to the
// user-scoped key so existing preferences are kept.
window.__poznoteUserStorage = window.__poznoteUserStorage || (function () {
    var uid = '';
    try {
        var match = document.cookie.match(/(?:^|;\s*)poznote_uid=(\d+)/);
        if (match) uid = match[1];
    } catch (e) {}

    function scopedKey(key) {
        return uid ? key + '::u' + uid : key;
    }

    return {
        getItem: function (key) {
            try {
                var value = localStorage.getItem(scopedKey(key));
                if (value === null && uid) {
                    var legacy = localStorage.getItem(key);
                    if (legacy !== null) {
                        localStorage.setItem(scopedKey(key), legacy);
                        return legacy;
                    }
                }
                return value;
            } catch (e) {
                return null;
            }
        },
        setItem: function (key, value) {
            try { localStorage.setItem(scopedKey(key), value); } catch (e) {}
        },
        removeItem: function (key) {
            try { localStorage.removeItem(scopedKey(key)); } catch (e) {}
        }
    };
})();

// Theme initialization - runs synchronously in <head> to prevent FOUC
(function () {
    try {
        var palettes = {
            dark: {
                contentBg: '#252526',
                sidebarBg: '#252526',
                text: '#e0e0e0'
            },
            black: {
                contentBg: '#141821',
                sidebarBg: '#0b0d12',
                text: '#d8dee8'
            }
        };

        function normalizeTheme(value) {
            value = String(value || '').toLowerCase();
            return value === 'black' || value === 'dark' || value === 'light' || value === 'system'
                ? value
                : null;
        }

        function getSystemTheme() {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }

        var forcedTheme = window.__poznoteForcedTheme;
        var t = normalizeTheme(forcedTheme) || normalizeTheme(window.__poznoteUserStorage.getItem('poznote-theme')) || 'system';
        if (t === 'system') {
            t = getSystemTheme();
        }
        var isDark = t === 'dark' || t === 'black';
        var effectiveTheme = isDark ? 'dark' : 'light';
        var palette = t === 'black' ? palettes.black : palettes.dark;
        var r = document.documentElement;
        r.setAttribute('data-theme', effectiveTheme);
        r.style.colorScheme = effectiveTheme;
        r.style.backgroundColor = isDark ? palette.contentBg : '#ffffff';

        // Add theme class for pages that need it (settings, display)
        if (isDark) {
            r.classList.add('theme-dark');
            r.classList.remove('theme-light');
            r.classList.toggle('theme-black', t === 'black');

            // Inject critical CSS to prevent white flash on all key elements
            var style = document.createElement('style');
            style.id = 'theme-init-critical-css';
            style.textContent = [
                'body { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }',
                '#left_col { background-color: ' + palette.sidebarBg + ' !important; }',
                '#right_col, #right_pane { background-color: ' + palette.contentBg + ' !important; }',
                '.note-header { background-color: ' + palette.contentBg + ' !important; }',
                '.note-edit-toolbar { background-color: ' + palette.contentBg + ' !important; }',
                '.note-header-spacer { background-color: ' + palette.contentBg + ' !important; }',
                '.notecard { background-color: ' + palette.contentBg + ' !important; }',
                '.innernote { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }',
                '.css-title { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }'
            ].join(' ');
            document.head.appendChild(style);
        } else {
            r.classList.add('theme-light');
            r.classList.remove('theme-dark');
            r.classList.remove('theme-black');
        }
    } catch (e) {
        // Fallback silently if localStorage unavailable
    }
})();
