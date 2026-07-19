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
        var id = (typeof window.noteid !== 'undefined') ? parseInt(window.noteid, 10) : -1;
        return (id > 0) ? id : 0;
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

    function setStreaming(on) {
        streaming = on;
        var btn = document.getElementById('ai-chat-send');
        if (!btn) return;
        var icon = btn.querySelector('i');
        if (icon) icon.className = on ? 'lucide lucide-square' : 'lucide lucide-arrow-up';
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
        var el = messagesEl();
        if (el) {
            el.innerHTML = '';
            var hint = document.createElement('div');
            hint.className = 'ai-chat-empty';
            hint.textContent = t('ai_chat.empty', {}, 'Ask anything about your notes. The currently opened note can be shared with the assistant as context.');
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

        var bubble = appendBubble('ai-chat-msg-assistant ai-chat-pending', '');
        var answer = '';
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
                var delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
                if (delta && typeof delta.content === 'string') {
                    answer += delta.content;
                    bubble.textContent = answer;
                    scrollToBottom();
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
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('ai-chat-form');
        if (!form) return;

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
