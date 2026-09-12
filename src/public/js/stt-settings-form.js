/**
 * Transcription settings form, shared by stt_settings.php (instance
 * configuration) and stt_settings_user.php (personal configuration).
 *
 * The host page provides window.poznoteSttSettingsI18n,
 * window.poznoteSttSettingsScope and window.poznoteSttLocalHost before
 * loading this file (see src/stt_settings_script.php).
 */
document.addEventListener('DOMContentLoaded', function () {
    setupSttUserFilter();

    var testBtn = document.getElementById('stt-test-btn');
    var resultEl = document.getElementById('stt-test-result');
    var providerSel = document.getElementById('stt_provider');
    if (!testBtn || !resultEl || !providerSel) return;

    var i18n = window.poznoteSttSettingsI18n || {};
    var localHost = window.poznoteSttLocalHost || 'host.docker.internal';

    // Provider-driven field visibility, same shape as the AI settings form:
    // local servers need a URL but usually no key, OpenAI has a fixed URL and
    // needs one, custom shows everything.
    var PROVIDERS = {
        speaches:   { url: 'http://' + localHost + ':8000', fixedUrl: false, key: 'optional' },
        whispercpp: { url: 'http://' + localHost + ':8080', fixedUrl: false, key: 'none' },
        localai:    { url: 'http://' + localHost + ':8080', fixedUrl: false, key: 'none' },
        openai:     { url: 'https://api.openai.com', fixedUrl: true, key: 'required' },
        custom:     { url: '', fixedUrl: false, key: 'optional' }
    };
    var urlGroup = document.getElementById('stt-url-group');
    var urlInput = document.getElementById('stt_url');
    var keyGroup = document.getElementById('stt-key-group');
    var keyLabel = document.getElementById('stt-key-label');
    var keyDesc = document.getElementById('stt-key-desc');
    var modelInput = document.getElementById('stt_model');
    var modelOptions = document.getElementById('stt-model-options');

    function applyProvider(initial) {
        var p = PROVIDERS[providerSel.value] || PROVIDERS.custom;
        urlGroup.style.display = p.fixedUrl ? 'none' : '';
        if (p.fixedUrl || !initial) {
            // Switching provider always resets the URL to that provider's
            // default: predictable, and never keeps a stale URL around
            urlInput.value = p.url;
        }
        keyGroup.style.display = (p.key === 'none') ? 'none' : '';
        keyLabel.textContent = (p.key === 'required') ? i18n.apiKeyRequired : i18n.apiKeyOptional;
        keyDesc.style.display = (p.key === 'optional') ? '' : 'none';
        if (!initial) {
            // The suggestions belong to the previous server. The typed model is
            // left alone: unlike the AI page this is a free text field, and
            // wiping what someone entered by hand would be rude.
            modelOptions.innerHTML = '';
            resultEl.hidden = true;
            resultEl.textContent = '';
        }
    }

    providerSel.addEventListener('change', function () { applyProvider(false); });
    applyProvider(true);

    // Which configuration this page edits: the server falls back to that
    // configuration's stored key when the field still shows the mask.
    var scope = window.poznoteSttSettingsScope || 'instance';

    testBtn.addEventListener('click', function () {
        var url = urlInput.value.trim();
        var apiKey = document.getElementById('stt_api_key').value;
        if (apiKey === '••••••••') apiKey = '';

        resultEl.hidden = false;
        resultEl.textContent = i18n.testing;

        var body = new URLSearchParams();
        body.append('url', url);
        body.append('scope', scope);
        if (apiKey) body.append('api_key', apiKey);

        fetch('api_transcribe.php?action=test', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) {
                    resultEl.textContent = i18n.failure.replace('{{error}}', data.error || 'unknown');
                    return;
                }
                var models = data.models || [];
                modelOptions.innerHTML = '';
                models.forEach(function (m) {
                    var opt = document.createElement('option');
                    opt.value = m;
                    modelOptions.appendChild(opt);
                });
                if (models.length) {
                    resultEl.textContent = i18n.success.replace('{{count}}', models.length);
                    // A server offering exactly one model has no ambiguity to
                    // resolve, so save the user a copy and paste
                    if (models.length === 1 && modelInput.value.trim() === '') {
                        modelInput.value = models[0];
                    }
                } else {
                    // whisper.cpp reaches here: the server answered, it just
                    // lists nothing. That is a working connection, not a failure.
                    resultEl.textContent = i18n.modelNoneFound;
                }
            })
            .catch(function (e) {
                resultEl.textContent = i18n.failure.replace('{{error}}', e.message);
            });
    });
});

/**
 * Filter the allowed-users list (admin page only). Matching is
 * accent-insensitive so "Herve" finds "Hervé".
 */
function setupSttUserFilter() {
    var input = document.getElementById('stt-user-filter');
    var list = document.querySelector('.ai-user-list');
    if (!input || !list) return;

    var emptyEl = document.getElementById('stt-user-filter-empty');
    var rows = Array.prototype.slice.call(list.querySelectorAll('.ai-user'));

    function fold(text) {
        text = (text || '').toLowerCase();
        return text.normalize ? text.normalize('NFD').replace(/[̀-ͯ]/g, '') : text;
    }

    var haystacks = rows.map(function (row) { return fold(row.textContent); });

    function apply() {
        var needle = fold(input.value.trim());
        var shown = 0;
        rows.forEach(function (row, i) {
            var match = needle === '' || haystacks[i].indexOf(needle) !== -1;
            row.hidden = !match;
            if (match) shown++;
        });
        if (emptyEl) emptyEl.hidden = shown > 0;
    }

    input.addEventListener('input', apply);
    // A search input clears itself with Escape or its native cross
    input.addEventListener('search', apply);
    apply();
}
