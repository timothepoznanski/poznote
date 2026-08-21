/**
 * AI Assistant settings form, shared by ai_settings.php (instance
 * configuration) and ai_settings_user.php (personal configuration).
 *
 * The host page provides window.poznoteAiSettingsI18n and
 * window.poznoteAiLocalHost before loading this file.
 */
document.addEventListener('DOMContentLoaded', function() {
    setupUserFilter();

    var testBtn = document.getElementById('ai-test-btn');
    var resultEl = document.getElementById('ai-test-result');
    var providerSel = document.getElementById('ai_provider');
    if (!testBtn || !resultEl || !providerSel) return;

    var i18n = window.poznoteAiSettingsI18n || {};
    var localHost = window.poznoteAiLocalHost || 'host.docker.internal';

    // Provider-driven field visibility: local servers need a URL but no
    // key; Anthropic/OpenAI have a fixed URL and need a key; custom shows
    // everything.
    var PROVIDERS = {
        ollama:    { url: 'http://' + localHost + ':11434', fixedUrl: false, key: 'none' },
        lmstudio:  { url: 'http://' + localHost + ':1234',  fixedUrl: false, key: 'none' },
        anthropic: { url: 'https://api.anthropic.com', fixedUrl: true, key: 'required' },
        openai:    { url: 'https://api.openai.com', fixedUrl: true, key: 'required' },
        custom:    { url: '', fixedUrl: false, key: 'optional' }
    };
    var urlGroup = document.getElementById('ai-url-group');
    var urlInput = document.getElementById('ai_url');
    var keyGroup = document.getElementById('ai-key-group');
    var keyLabel = document.getElementById('ai-key-label');
    var keyDesc = document.getElementById('ai-key-desc');

    function applyProvider(initial) {
        var p = PROVIDERS[providerSel.value] || PROVIDERS.custom;
        urlGroup.style.display = p.fixedUrl ? 'none' : '';
        if (p.fixedUrl || !initial) {
            // Switching provider always resets the URL to that provider's
            // default, predictable, and never keeps a stale URL around
            urlInput.value = p.url;
        }
        keyGroup.style.display = (p.key === 'none') ? 'none' : '';
        keyLabel.textContent = (p.key === 'required') ? i18n.apiKeyRequired : i18n.apiKeyOptional;
        keyDesc.style.display = (p.key === 'optional') ? '' : 'none';
        if (!initial) {
            // The model and any listed models belong to the previous server
            document.getElementById('ai_model').value = '';
            document.getElementById('ai-model-list').innerHTML = '';
            resultEl.hidden = true;
            resultEl.textContent = '';
        }
    }

    providerSel.addEventListener('change', function() { applyProvider(false); });
    applyProvider(true);

    // Which configuration this page edits: the server falls back to that
    // configuration's stored key when the field still shows the mask, so a
    // saved key keeps working on the next visit without being typed again.
    var scope = window.poznoteAiSettingsScope || 'instance';

    testBtn.addEventListener('click', function() {
        var url = document.getElementById('ai_url').value.trim();
        var apiKey = document.getElementById('ai_api_key').value;
        if (apiKey === '••••••••') apiKey = '';

        // The model is picked from the results of this test
        document.getElementById('ai_model').value = '';

        resultEl.hidden = false;
        resultEl.textContent = i18n.testing;

        var body = new URLSearchParams();
        body.append('url', url);
        body.append('scope', scope);
        if (apiKey) body.append('api_key', apiKey);

        fetch('api_ai_chat.php?action=test', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                resultEl.textContent = i18n.success.replace('{{count}}', (data.models || []).length);
                var datalist = document.getElementById('ai-model-list');
                datalist.innerHTML = '';
                var suggestions = document.createElement('div');
                suggestions.className = 'ai-model-suggestions';
                (data.models || []).forEach(function(m) {
                    var opt = document.createElement('option');
                    opt.value = m;
                    datalist.appendChild(opt);
                    var chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'ai-model-suggestion';
                    chip.textContent = m;
                    chip.addEventListener('click', function() {
                        document.getElementById('ai_model').value = m;
                    });
                    suggestions.appendChild(chip);
                });
                resultEl.appendChild(suggestions);
            } else {
                resultEl.textContent = i18n.failure.replace('{{error}}', data.error || 'unknown');
            }
        })
        .catch(function(e) {
            resultEl.textContent = i18n.failure.replace('{{error}}', e.message);
        });
    });
});

/**
 * Filter the allowed-users list (admin page only). Matching is
 * accent-insensitive so "Herve" finds "Hervé".
 */
function setupUserFilter() {
    var input = document.getElementById('ai-user-filter');
    var list = document.querySelector('.ai-user-list');
    if (!input || !list) return;

    var emptyEl = document.getElementById('ai-user-filter-empty');
    var rows = Array.prototype.slice.call(list.querySelectorAll('.ai-user'));

    function fold(text) {
        text = (text || '').toLowerCase();
        return text.normalize ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text;
    }

    var haystacks = rows.map(function(row) { return fold(row.textContent); });

    function apply() {
        var needle = fold(input.value.trim());
        var shown = 0;
        rows.forEach(function(row, i) {
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
