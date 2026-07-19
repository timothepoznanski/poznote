/**
 * AI Chat Panel
 *
 * Chat with the configured OpenAI-compatible AI server (see ai_settings.php)
 * about the currently opened note. The backend (api_ai_chat.php) proxies the
 * conversation and streams the answer back as Server-Sent Events.
 */
(function () {
    'use strict';

    var conversation = [];   // [{role: 'user'|'assistant', content: string}]
    var streaming = false;
    var abortController = null;

    var STORAGE_KEY = 'poznote-ai-chat-conversation';
    var MAX_STORED_MESSAGES = 40; // matches the backend's conversation window

    function t(key, vars, fallback) {
        if (typeof window.t === 'function') return window.t(key, vars, fallback);
        return fallback || key;
    }

    function panel() { return document.getElementById('ai-chat-panel'); }
    function messagesEl() { return document.getElementById('ai-chat-messages'); }

    function isOpen() {
        var p = panel();
        return !!p && p.classList.contains('ai-chat-open');
    }

    function currentNoteId() {
        // window.noteid is only set once the user interacts with a note, so
        // fall back to the URL and the rendered note card.
        var id = (typeof window.noteid !== 'undefined') ? parseInt(window.noteid, 10) : -1;
        if (id > 0) return id;
        var fromUrl = parseInt(new URLSearchParams(window.location.search).get('note'), 10);
        if (fromUrl > 0) return fromUrl;
        var card = document.querySelector('.notecard[id^="note"]');
        if (card) {
            var fromDom = parseInt(card.id.slice(4), 10);
            if (fromDom > 0) return fromDom;
        }
        return 0;
    }

    function currentNoteTitle() {
        var id = currentNoteId();
        if (!id) return '';
        var input = document.getElementById('inp' + id);
        return input ? input.value : '';
    }

    function updateContextRow() {
        var row = document.getElementById('ai-chat-context');
        if (!row) return;
        var id = currentNoteId();
        row.hidden = !id;
        var titleEl = document.getElementById('ai-chat-context-title');
        if (titleEl) titleEl.textContent = id ? currentNoteTitle() : '';
    }

    function scrollToBottom() {
        var el = messagesEl();
        if (el) el.scrollTop = el.scrollHeight;
    }

    function removeEmptyHint() {
        var hint = panel() && panel().querySelector('.ai-chat-empty');
        if (hint) hint.remove();
    }

    function appendBubble(cls, text) {
        removeEmptyHint();
        var div = document.createElement('div');
        div.className = 'ai-chat-msg ' + cls;
        div.textContent = text;
        messagesEl().appendChild(div);
        scrollToBottom();
        return div;
    }

    // Tags that must never survive in assistant output. Markdown allows raw
    // HTML through, and the model's output can be steered by note content,
    // so the rendered HTML is treated as untrusted.
    var BLOCKED_TAGS = {
        SCRIPT: 1, STYLE: 1, IFRAME: 1, FRAME: 1, FRAMESET: 1, OBJECT: 1,
        EMBED: 1, APPLET: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1,
        SELECT: 1, OPTION: 1, LINK: 1, META: 1, BASE: 1, TEMPLATE: 1,
        SLOT: 1, DIALOG: 1, VIDEO: 1, AUDIO: 1, SOURCE: 1, TRACK: 1,
        SVG: 1, MATH: 1
    };

    function sanitizeTree(root) {
        var els = root.querySelectorAll('*');
        for (var i = els.length - 1; i >= 0; i--) {
            var el = els[i];
            if (BLOCKED_TAGS[el.tagName]) {
                el.remove();
                continue;
            }
            for (var j = el.attributes.length - 1; j >= 0; j--) {
                var name = el.attributes[j].name;
                var lower = name.toLowerCase();
                if (lower.indexOf('on') === 0 || lower === 'srcdoc' || lower === 'formaction') {
                    el.removeAttribute(name);
                    continue;
                }
                if (lower === 'href' || lower === 'src' || lower === 'action' || lower === 'xlink:href') {
                    var val = String(el.attributes[j].value).replace(/[\u0000-\u0020]/g, '').toLowerCase();
                    if (val.indexOf('javascript:') === 0 || val.indexOf('vbscript:') === 0 ||
                        (val.indexOf('data:') === 0 && !(el.tagName === 'IMG' && val.indexOf('data:image/') === 0))) {
                        el.removeAttribute(name);
                    }
                }
            }
            if (el.tagName === 'A') {
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    // Render assistant markdown into a bubble, reusing the app's markdown
    // parser (markdown-handler.js) with a sanitization pass on top.
    function renderAssistantBubble(bubble, text) {
        if (typeof window.parseMarkdown !== 'function') {
            bubble.textContent = text;
            return;
        }
        var html;
        try {
            html = window.parseMarkdown(text);
        } catch (e) {
            bubble.textContent = text;
            return;
        }
        // DOMParser documents are inert: scripts don't run, images don't load
        var doc = new DOMParser().parseFromString(html, 'text/html');
        sanitizeTree(doc.body);
        bubble.classList.add('ai-chat-md');
        bubble.innerHTML = '';
        while (doc.body.firstChild) {
            bubble.appendChild(bubble.ownerDocument.importNode(doc.body.firstChild, true));
            doc.body.removeChild(doc.body.firstChild);
        }
    }

    // Show what the assistant is doing while it uses its note tools
    // (search_notes / get_note / list_recent_notes). Ephemeral: these lines
    // are not part of the stored conversation.
    function appendToolActivity(tool, pendingBubble) {
        var name = tool && tool.name;
        var args = (tool && tool.args) || {};
        var label;
        if (name === 'search_notes') {
            label = t('ai_chat.tool_search', { query: args.query || '' }, 'Searching notes: {{query}}')
                .replace('{{query}}', args.query || '');
        } else if (name === 'get_note') {
            label = t('ai_chat.tool_read', { id: args.note_id || '?' }, 'Reading note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'list_recent_notes') {
            label = t('ai_chat.tool_list', {}, 'Listing recent notes');
        } else if (name === 'rename_note') {
            label = t('ai_chat.tool_rename', {}, 'Renaming note #{{id}} to "{{title}}"')
                .replace('{{id}}', args.note_id || '?')
                .replace('{{title}}', args.new_title || '');
        } else if (name === 'update_note_content') {
            label = t('ai_chat.tool_update', {}, 'Editing note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'create_note') {
            label = t('ai_chat.tool_create', {}, 'Creating note: {{title}}')
                .replace('{{title}}', args.title || '');
        } else {
            label = String(name || '');
        }
        var ICONS = {
            get_note: 'lucide-file-text',
            rename_note: 'lucide-pencil',
            update_note_content: 'lucide-pencil',
            create_note: 'lucide-plus-circle'
        };
        var div = document.createElement('div');
        div.className = 'ai-chat-tool';
        var icon = document.createElement('i');
        icon.className = 'lucide ' + (ICONS[name] || 'lucide-search');
        div.appendChild(icon);
        div.appendChild(document.createTextNode(' ' + label));
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    // Shown once per conversation when the configured model rejects tool
    // calling: the chat still works but cannot browse the notes.
    function appendToolsUnsupportedNotice(pendingBubble) {
        if (panel() && panel().querySelector('.ai-chat-notice')) return;
        var div = document.createElement('div');
        div.className = 'ai-chat-notice';
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-alert-triangle';
        div.appendChild(icon);
        div.appendChild(document.createTextNode(' ' + t('ai_chat.no_tools_notice', {},
            'This model does not support tools — the assistant cannot browse your notes.')));
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    function saveConversation() {
        try {
            if (conversation.length) {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conversation.slice(-MAX_STORED_MESSAGES)));
            } else {
                sessionStorage.removeItem(STORAGE_KEY);
            }
        } catch (e) {
            // Storage full or unavailable — persistence is best-effort
        }
    }

    function restoreConversation() {
        var raw;
        try {
            raw = sessionStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return;
        }
        if (!raw) return;
        var stored;
        try {
            stored = JSON.parse(raw);
        } catch (e) {
            return;
        }
        if (!Array.isArray(stored)) return;
        stored.forEach(function (msg) {
            if (!msg || typeof msg.content !== 'string') return;
            if (msg.role !== 'user' && msg.role !== 'assistant') return;
            conversation.push({ role: msg.role, content: msg.content });
            var bubble = appendBubble(
                msg.role === 'user' ? 'ai-chat-msg-user' : 'ai-chat-msg-assistant', '');
            if (msg.role === 'user') {
                bubble.textContent = msg.content;
            } else {
                renderAssistantBubble(bubble, msg.content);
            }
        });
    }

    function setStreaming(on) {
        streaming = on;
        var btn = document.getElementById('ai-chat-send');
        if (!btn) return;
        var icon = btn.querySelector('i');
        // Filled square while streaming (a clear "stop"), arrow when idle.
        // The outline of lucide-square reads as a broken icon.
        if (icon) icon.className = on ? 'ai-chat-stop-icon' : 'lucide lucide-arrow-up';
        btn.title = on
            ? t('ai_chat.stop', {}, 'Stop')
            : t('ai_chat.send', {}, 'Send');
    }

    function toggle(noteId) {
        var p = panel();
        if (!p) return;
        var open = !isOpen();
        p.classList.toggle('ai-chat-open', open);
        document.querySelectorAll('.btn-ai-chat').forEach(function (b) {
            b.classList.toggle('ai-chat-active', open);
        });
        if (open) {
            updateContextRow();
            var input = document.getElementById('ai-chat-input');
            if (input && window.matchMedia('(min-width: 801px)').matches) input.focus();
        }
    }

    function clear() {
        if (streaming && abortController) abortController.abort();
        conversation = [];
        saveConversation();
        var el = messagesEl();
        if (el) {
            el.innerHTML = '';
            var hint = document.createElement('div');
            hint.className = 'ai-chat-empty';
            hint.textContent = t('ai_chat.empty', {}, 'Ask anything — the assistant can search and read all your notes.');
            el.appendChild(hint);
        }
    }

    function send() {
        if (streaming) {
            if (abortController) abortController.abort();
            return;
        }
        var input = document.getElementById('ai-chat-input');
        var text = input ? input.value.trim() : '';
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';

        conversation.push({ role: 'user', content: text });
        appendBubble('ai-chat-msg-user', text);

        var body = { messages: conversation };
        var contextToggle = document.getElementById('ai-chat-context-toggle');
        var noteId = currentNoteId();
        if (noteId && (!contextToggle || contextToggle.checked)) {
            body.note_id = noteId;
        }
        if (document.body.dataset.workspace) {
            body.workspace = document.body.dataset.workspace;
        }

        var bubble = appendBubble('ai-chat-msg-assistant ai-chat-pending', '');
        var answer = '';
        var lastRender = 0;
        setStreaming(true);
        abortController = new AbortController();

        fetch('api_ai_chat.php?action=chat', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortController.signal
        }).then(function (response) {
            var ct = response.headers.get('Content-Type') || '';
            if (ct.indexOf('text/event-stream') === -1) {
                // Configuration / validation error returned as JSON
                return response.json().then(function (data) {
                    throw new Error(data.error || ('HTTP ' + response.status));
                });
            }

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function handleLine(line) {
                if (line.indexOf('data:') !== 0) return;
                var payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') return;
                var obj;
                try { obj = JSON.parse(payload); } catch (e) { return; }
                if (obj.poznote_error) throw new Error(obj.poznote_error);
                if (obj.poznote_tool) {
                    appendToolActivity(obj.poznote_tool, bubble);
                    return;
                }
                if (obj.poznote_notice === 'tools_unsupported') {
                    appendToolsUnsupportedNotice(bubble);
                    return;
                }
                var delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
                if (delta && typeof delta.content === 'string') {
                    answer += delta.content;
                    // Re-parsing the full markdown on every token is wasteful;
                    // render at most ~6 times per second (final render in finish)
                    var now = Date.now();
                    if (now - lastRender > 150) {
                        lastRender = now;
                        renderAssistantBubble(bubble, answer);
                        scrollToBottom();
                    }
                }
            }

            function pump() {
                return reader.read().then(function (result) {
                    if (result.done) {
                        if (buffer) handleLine(buffer);
                        return;
                    }
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach(handleLine);
                    return pump();
                });
            }
            return pump();
        }).then(function () {
            finish();
        }).catch(function (err) {
            if (err && err.name === 'AbortError') {
                finish();
                return;
            }
            bubble.remove();
            appendBubble('ai-chat-msg-error',
                t('ai_chat.error', { error: (err && err.message) || 'unknown' }, 'Error: {{error}}')
                    .replace('{{error}}', (err && err.message) || 'unknown'));
            finish(true);
        });

        function finish(failed) {
            bubble.classList.remove('ai-chat-pending');
            setStreaming(false);
            abortController = null;
            if (!failed) {
                if (answer) {
                    renderAssistantBubble(bubble, answer);
                    scrollToBottom();
                    conversation.push({ role: 'assistant', content: answer });
                } else if (bubble.parentNode && !bubble.textContent) {
                    bubble.remove();
                }
            } else {
                // Drop the failed user turn so retrying doesn't duplicate it
                if (conversation.length && conversation[conversation.length - 1].role === 'user') {
                    conversation.pop();
                }
            }
            saveConversation();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('ai-chat-form');
        if (!form) return;

        restoreConversation();

        // Keep the "include current note" row in sync when the user
        // switches notes while the panel is open
        document.addEventListener('noteLoaded', function () {
            if (isOpen()) updateContextRow();
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            send();
        });

        var input = document.getElementById('ai-chat-input');
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });
            input.addEventListener('input', function () {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
        }
    });

    window.AIChat = {
        toggle: toggle,
        clear: clear,
        refreshContext: updateContextRow
    };
})();
