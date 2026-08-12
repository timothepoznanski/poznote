// First-run welcome setup wizard (index.php).
// The modal markup is rendered by modals.php only while the 'welcome_setup'
// setting is 'pending' (seeded when the account database is created). This
// module pre-fills the selects from the current state, previews the theme
// live, persists the choices through the settings API and flips the flag to
// 'done' so the wizard never shows again.
(function () {
    'use strict';

    function putSetting(key, value, keepalive) {
        return fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            keepalive: !!keepalive,
            body: JSON.stringify({ value: value })
        });
    }

    function hasOption(select, value) {
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) return true;
        }
        return false;
    }

    function init() {
        var modal = document.getElementById('welcomeSetupModal');
        if (!modal) return;

        var languageSelect = document.getElementById('welcomeLanguageSelect');
        var themeSelect = document.getElementById('welcomeThemeSelect');
        var dateFormatSelect = document.getElementById('welcomeDateFormatSelect');
        var timezoneSelect = document.getElementById('welcomeTimezoneSelect');
        var saveBtn = document.getElementById('welcomeSetupSaveBtn');
        var skipBtn = document.getElementById('welcomeSetupSkipBtn');
        if (!languageSelect || !themeSelect || !dateFormatSelect || !timezoneSelect || !saveBtn || !skipBtn) return;

        // Borrow the full timezone list from the settings timezone modal
        // (also present in modals.php) instead of duplicating it.
        var settingsTimezoneSelect = document.getElementById('timezoneSelect');
        if (settingsTimezoneSelect) {
            timezoneSelect.innerHTML = settingsTimezoneSelect.innerHTML;
        }

        // Pre-fill from the current state. The language was already adopted
        // from the browser at login, so <html lang> is the best default.
        var currentLang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
        if (hasOption(languageSelect, currentLang)) {
            languageSelect.value = currentLang;
        }

        var initialTheme = (typeof window.getCurrentThemeMode === 'function') ? window.getCurrentThemeMode() : 'system';
        if (hasOption(themeSelect, initialTheme)) {
            themeSelect.value = initialTheme;
        }

        var config = {};
        try {
            config = JSON.parse(document.getElementById('poznote-config').textContent) || {};
        } catch (e) { }
        var currentFormat = String(config.dateTimeFormat || 'default');
        if (hasOption(dateFormatSelect, currentFormat)) {
            dateFormatSelect.value = currentFormat;
        }

        // Default the timezone to the browser's one; the API accepts any
        // valid IANA identifier, so add it to the list when missing.
        try {
            var browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (browserTz) {
                if (!hasOption(timezoneSelect, browserTz)) {
                    var opt = document.createElement('option');
                    opt.value = browserTz;
                    opt.textContent = browserTz;
                    timezoneSelect.insertBefore(opt, timezoneSelect.firstChild);
                }
                timezoneSelect.value = browserTz;
            }
        } catch (e) { }

        // Live theme preview while the wizard is open; only persisted on save.
        themeSelect.addEventListener('change', function () {
            if (typeof window.applyTheme === 'function') {
                window.applyTheme(themeSelect.value, false);
            }
        });

        function markDone(keepalive) {
            return putSetting('welcome_setup', 'done', keepalive);
        }

        saveBtn.addEventListener('click', function () {
            saveBtn.disabled = true;
            skipBtn.disabled = true;
            if (typeof window.applyTheme === 'function') {
                window.applyTheme(themeSelect.value, true);
            }
            var updates = [
                putSetting('language', languageSelect.value),
                putSetting('timezone', timezoneSelect.value),
                putSetting('date_time_format', dateFormatSelect.value)
            ].map(function (p) { return p.catch(function () { }); });
            Promise.all(updates).then(function () {
                return markDone(false).catch(function () { });
            }).then(function () {
                // Reload so the chosen language and formats apply server-side.
                window.location.reload();
            });
        });

        skipBtn.addEventListener('click', function () {
            saveBtn.disabled = true;
            skipBtn.disabled = true;
            if (typeof window.applyTheme === 'function' && themeSelect.value !== initialTheme) {
                window.applyTheme(initialTheme, false);
            }
            var close = function () { modal.style.display = 'none'; };
            markDone(false).then(close, close);
        });

        // Leaving through a tip link (settings, dashboard) also counts as
        // having seen the wizard; keepalive lets the request outlive the page.
        var tipLinks = modal.querySelectorAll('.welcome-setup-tip');
        for (var i = 0; i < tipLinks.length; i++) {
            tipLinks[i].addEventListener('click', function () {
                try { markDone(true); } catch (e) { }
            });
        }

        modal.style.display = 'flex';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
