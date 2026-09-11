/**
 * The first-run startup guide (welcome.php).
 *
 * Four jobs:
 *  - close the language popup the page opens on, and carry the choice into the
 *    language select, which stays the one the form reads on submit;
 *  - seed the selects from what the account already has, and from the browser
 *    for the timezone, which nothing server-side can know;
 *  - preview the theme and the language as they are picked, so the guide shows
 *    what the choice does before it is committed. The language swap is done in
 *    place rather than by reloading: a reload would throw away whatever was
 *    typed in the account section below;
 *  - on submit, write the choices through the same endpoints the settings page
 *    uses, then flip 'welcome_setup' to 'done' and leave for the notes. There
 *    is no skip: every control opens on the value the account already has, so
 *    submitting without touching anything IS the way through.
 *
 * Order matters on submit. The language is written before the flag: the API
 * dispatches the language webhook for a confirmation made while the guide is
 * still pending, even when the value did not change, and flipping the flag
 * first would silently drop that.
 */
(function () {
    'use strict';

    var config = {};
    try {
        config = JSON.parse(document.getElementById('welcome-config').textContent) || {};
    } catch (e) {
        console.debug('welcome-page: configuration could not be read:', e);
    }

    var form = document.getElementById('welcomeForm');
    var languageSelect = document.getElementById('welcomeLanguage');
    var themeSelect = document.getElementById('welcomeTheme');
    var dateFormatSelect = document.getElementById('welcomeDateFormat');
    var timezoneSelect = document.getElementById('welcomeTimezone');
    var usernameInput = document.getElementById('welcomeUsername');
    var currentPasswordInput = document.getElementById('welcomeCurrentPassword');
    var newPasswordInput = document.getElementById('welcomeNewPassword');
    var confirmPasswordInput = document.getElementById('welcomeConfirmPassword');
    var startBtn = document.getElementById('welcomeStartBtn');
    var errorBox = document.getElementById('welcomeError');
    var errorText = document.getElementById('welcomeErrorText');

    if (!form || !languageSelect || !themeSelect || !dateFormatSelect || !timezoneSelect
        || !usernameInput || !startBtn || !errorBox || !errorText) {
        return;
    }

    // What translate() reads. The page seeds it with the handful of strings the
    // script writes itself, already in the page's language; previewing another
    // language replaces it with that language's whole dictionary.
    var strings = (config.strings && typeof config.strings === 'object') ? config.strings : null;
    var startLabel = startBtn.textContent;

    function translate(key, fallback, vars) {
        if (!strings) return fallback;
        var parts = String(key).split('.');
        var cursor = strings;
        for (var i = 0; i < parts.length; i++) {
            if (!cursor || typeof cursor !== 'object' || !(parts[i] in cursor)) return fallback;
            cursor = cursor[parts[i]];
        }
        if (typeof cursor !== 'string') return fallback;
        if (vars) {
            for (var name in vars) {
                if (!Object.prototype.hasOwnProperty.call(vars, name)) continue;
                cursor = cursor.split('{{' + name + '}}').join(String(vars[name]));
            }
        }
        return cursor;
    }

    function hasOption(select, value) {
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) return true;
        }
        return false;
    }

    function showError(message) {
        errorText.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearError() {
        errorBox.hidden = true;
    }

    function setBusy(busy) {
        startBtn.disabled = busy;
        startBtn.textContent = busy
            ? translate('welcome_page.saving', 'Saving...')
            : startLabel;
    }

    // ---- Seeding ----

    if (hasOption(languageSelect, String(config.language || ''))) {
        languageSelect.value = String(config.language);
    }

    var currentTheme = (typeof window.getCurrentThemeMode === 'function') ? window.getCurrentThemeMode() : 'system';
    if (hasOption(themeSelect, currentTheme)) {
        themeSelect.value = currentTheme;
    }

    if (hasOption(dateFormatSelect, String(config.dateTimeFormat || ''))) {
        dateFormatSelect.value = String(config.dateTimeFormat);
    }

    // The browser knows the timezone and the account does not, so it wins over
    // the stored value on a first run. Any valid IANA name is accepted by the
    // API, so one the list does not carry is added rather than dropped.
    var seededTimezone = String(config.timezone || 'UTC');
    try {
        var browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserTimezone) {
            seededTimezone = browserTimezone;
            if (!hasOption(timezoneSelect, browserTimezone)) {
                var option = document.createElement('option');
                option.value = browserTimezone;
                option.textContent = browserTimezone;
                timezoneSelect.insertBefore(option, timezoneSelect.firstChild);
            }
        }
    } catch (e) {
        console.debug('welcome-page: the browser timezone could not be read:', e);
    }
    if (hasOption(timezoneSelect, seededTimezone)) {
        timezoneSelect.value = seededTimezone;
    }

    // ---- Language popup ----

    // The markup paints it, so the guide is never readable in a language
    // nobody chose. Any of the buttons closes it; picking the one already
    // active costs no round trip, the page is already in it.
    var languageOverlay = document.getElementById('welcomeLanguageOverlay');
    if (languageOverlay) {
        var choices = languageOverlay.querySelectorAll('[data-welcome-lang]');
        for (var c = 0; c < choices.length; c++) {
            choices[c].addEventListener('click', function () {
                var chosen = this.getAttribute('data-welcome-lang');
                if (chosen && hasOption(languageSelect, chosen) && languageSelect.value !== chosen) {
                    languageSelect.value = chosen;
                    languageSelect.dispatchEvent(new Event('change'));
                }
                languageOverlay.remove();
                document.body.classList.remove('welcome-page-locked');
            });
        }

        var current = languageOverlay.querySelector('.welcome-lang-choice-current')
            || languageOverlay.querySelector('[data-welcome-lang]');
        if (current) current.focus();
    } else {
        document.body.classList.remove('welcome-page-locked');
    }

    // ---- Live preview ----

    themeSelect.addEventListener('change', function () {
        if (typeof window.applyTheme === 'function') {
            // Not saved: the choice is only committed with the rest of the form.
            window.applyTheme(themeSelect.value, false);
        }
    });

    // Retranslate the page in place. Covers what the guide actually uses:
    // element text, input placeholders and the <optgroup> labels of the
    // timezone list, which carry data-i18n-label (src/timezone_options.php).
    function applyStrings(lang) {
        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute('data-i18n');
            var vars = null;
            try {
                var raw = nodes[i].getAttribute('data-i18n-vars');
                if (raw) vars = JSON.parse(raw);
            } catch (e) {
                console.debug('welcome-page: a translation placeholder could not be read:', e);
            }
            var translated = translate(key, null, vars);
            if (translated !== null) nodes[i].textContent = translated;
        }
        var labelled = document.querySelectorAll('[data-i18n-label]');
        for (var j = 0; j < labelled.length; j++) {
            var labelKey = labelled[j].getAttribute('data-i18n-label');
            var label = translate(labelKey, null);
            if (label !== null) labelled[j].setAttribute('label', label);
        }
        startLabel = startBtn.textContent;
        document.documentElement.setAttribute('lang', lang);
    }

    languageSelect.addEventListener('change', function () {
        var lang = languageSelect.value;
        fetch('api/v1/system/i18n?lang=' + encodeURIComponent(lang), { credentials: 'same-origin' })
            .then(function (response) { return response.json(); })
            .then(function (payload) {
                if (!payload || !payload.success || !payload.strings) return;
                strings = payload.strings;
                applyStrings(payload.lang || lang);
            })
            .catch(function (e) {
                // The language is still saved on submit; only the preview is lost.
                console.debug('welcome-page: the translations could not be loaded:', e);
            });
    });

    // ---- Saving ----

    function putSetting(key, value) {
        return fetch('api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: value })
        });
    }

    function markDone() {
        return putSetting('welcome_setup', 'done');
    }

    function leave() {
        window.location.href = 'index.php';
    }

    // Reads the error an API route reports, whatever shape it came back in.
    function readError(response) {
        return response.json().then(function (body) {
            if (response.ok && body && body.error === undefined) return null;
            return (body && body.error) || translate('welcome_page.errors.generic', 'Something went wrong. Please try again.');
        }, function () {
            return translate('welcome_page.errors.generic', 'Something went wrong. Please try again.');
        });
    }

    // The username, then the password: both can be refused, and both have to
    // settle before anything marks the guide as done.
    function saveAccount() {
        var chain = Promise.resolve(null);
        var username = usernameInput.value.trim();

        if (username !== '' && username !== String(config.username || '')) {
            chain = chain.then(function (error) {
                if (error) return error;
                return fetch('api/v1/users/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username: username })
                }).then(readError);
            });
        }

        if (!config.passwordAvailable || !newPasswordInput) {
            return chain;
        }

        // The current-password box is absent on an account still using the one
        // it was installed with: welcome.php knows that value and hands it over
        // instead of asking. The API verifies it either way.
        var typed = currentPasswordInput ? currentPasswordInput.value : '';
        var next = newPasswordInput.value;
        var confirm = confirmPasswordInput.value;
        if (typed === '' && next === '' && confirm === '') {
            return chain;
        }
        var current = currentPasswordInput ? typed : String(config.currentPassword || '');

        return chain.then(function (error) {
            if (error) return error;
            if (current === '' || next === '' || confirm === '') {
                return translate('welcome_page.errors.password_incomplete',
                    'Fill in every password box, or leave them all empty.');
            }
            if (next !== confirm) {
                return translate('welcome_page.errors.password_mismatch', 'The two new passwords do not match.');
            }
            if (next.length < 4) {
                return translate('welcome_page.errors.password_too_short', 'The password must be at least 4 characters.');
            }
            return fetch('api/v1/users/me/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    current_password: current,
                    new_password: next,
                    confirm_password: confirm
                })
            }).then(readError);
        });
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        clearError();

        if (usernameInput.value.trim() === '') {
            showError(translate('welcome_page.errors.username_required', 'A username is required.'));
            return;
        }

        setBusy(true);

        saveAccount().then(function (error) {
            if (error) {
                setBusy(false);
                showError(error);
                return;
            }

            if (typeof window.applyTheme === 'function') {
                window.applyTheme(themeSelect.value, true);
            }

            // A preference that fails to save is not worth stopping the guide
            // for: the setting stays at its current value and is one click away
            // in Settings.
            var preferences = [
                putSetting('language', languageSelect.value),
                putSetting('timezone', timezoneSelect.value),
                putSetting('date_time_format', dateFormatSelect.value)
            ].map(function (request) {
                return request.catch(function (e) {
                    console.debug('welcome-page: a preference could not be saved:', e);
                });
            });

            return Promise.all(preferences)
                .then(markDone)
                .catch(function (e) {
                    console.debug('welcome-page: the guide could not be closed:', e);
                })
                .then(leave);
        });
    });
})();
