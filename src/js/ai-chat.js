/**
 * AI Chat Panel
 *
 * Chat with the configured OpenAI-compatible AI server (see ai_settings.php)
 * about the notes of the current workspace. The id of the note open in the
 * editor travels with every message so the user can say "this note" without
 * naming it, and a line above the input shows which note that is. The
 * backend (api_ai_chat.php) proxies the conversation and streams the answer
 * back as Server-Sent Events.
 *
 * On desktop the panel is docked as the rightmost column of the page (like
 * the outline panel), resizable by its left edge, and its open state and
 * width survive reloads. On phones it overlays the page.
 *
 * The panel is included by index.php and dashboard.php; the same stored
 * state and conversation follow the user from one page to the other. On the
 * dashboard no note is open, so "this note" has no target there.
 */
(function () {
    'use strict';

    var conversation = [];   // [{role: 'user'|'assistant', content: string}]
    var streaming = false;
    var abortController = null;
    // The multi-workspace notice of the dashboard has been answered with
    // Continue on this page: not asked again until the next load
    var scopeAcknowledged = false;

    var STORAGE_KEY = 'poznote-ai-chat-conversation';
    var MAX_STORED_MESSAGES = 40; // matches the backend's conversation window

    // Docked panel state, also read by the first-paint script in index.php
    var OPEN_KEY = 'aiChatOpen';
    var WIDTH_KEY = 'aiChatWidth';
    var MIN_WIDTH = 300;
    var MAX_WIDTH = 700;

    /**
     * Workspace the chat is scoped to. The workspace menu switches without a
     * page reload (history.pushState), so the live JS variable is the source
     * of truth and body[data-workspace] only the initial value.
     */
    function currentWorkspace() {
        var ws = '';
        var isDashboard = document.body && document.body.classList.contains('dashboard-page');
        if (isDashboard) {
            ws = document.body.getAttribute('data-ai-workspace') || '';
        }
        if (!ws && typeof window.getSelectedWorkspace === 'function') ws = window.getSelectedWorkspace() || '';
        if (!ws && document.body && document.body.dataset) ws = document.body.dataset.workspace || '';
        if (!ws) {
            var workspaceName = document.getElementById('ai-chat-workspace-name');
            if (workspaceName) ws = workspaceName.getAttribute('data-fallback') || '';
        }
        return ws;
    }

    /**
     * Note open in the editor, resolved at send time so it follows the user
     * from note to note within one conversation. The note rendered in the
     * right column is the open one; window.noteid only tracks the last note
     * the user interacted with (-1 after a page load until the first click
     * in the note, and again after a focus in the search bar) and is the
     * fallback when the column holds no single note.
     */
    function currentNoteId() {
        var rightCol = document.getElementById('right_col');
        var entries = rightCol ? rightCol.querySelectorAll('.noteentry[data-note-id]') : [];
        if (entries.length === 1) {
            var shownId = parseInt(entries[0].getAttribute('data-note-id'), 10);
            if (shownId > 0) return shownId;
        }
        var id = parseInt(window.noteid, 10);
        return id > 0 ? id : 0;
    }

    /** Title of a note as shown in the editor (its heading input). */
    function noteTitle(id) {
        var input = document.getElementById('inp' + id);
        var title = input ? (input.value || '').trim() : '';
        if (!title && input) title = (input.getAttribute('placeholder') || '').trim();
        return title || ('#' + id);
    }

    /**
     * The line above the input naming the note "this note" refers to, i.e.
     * what currentNoteId() will send with the next message. Hidden when no
     * note is open. Refreshed when a note loads, when its title is edited,
     * and whenever the panel opens or a message is sent.
     */
    function updateContextIndicator() {
        var box = document.getElementById('ai-chat-context');
        if (!box) return;
        var id = currentNoteId();
        if (!id) {
            box.hidden = true;
            return;
        }
        var titleEl = document.getElementById('ai-chat-context-title');
        if (titleEl) titleEl.textContent = noteTitle(id);
        box.title = t('ai_chat.context_hint', {}, 'The note the assistant uses when you say "this note".');
        box.hidden = false;
    }

    /**
     * The line naming the workspace the assistant is scoped to (every tool
     * runs in it). The page renders the server-resolved name as a fallback:
     * an empty client value means the backend picks its first workspace,
     * which is what the fallback holds.
     */
    function updateWorkspaceIndicator() {
        var nameEl = document.getElementById('ai-chat-workspace-name');
        if (!nameEl) return;
        var ws = currentWorkspace() || nameEl.getAttribute('data-fallback') || '';
        nameEl.textContent = ws;
        var box = document.getElementById('ai-chat-workspace');
        if (box) box.hidden = ws === '';
    }

    /** One stored conversation per workspace, so switching back restores it. */
    function storageKey(workspace) {
        return STORAGE_KEY + '::' + (workspace || '');
    }

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

    /** Same breakpoint as css/ai-chat.css: docked above it, overlay below. */
    function isDesktop() {
        return window.matchMedia('(min-width: 801px)').matches;
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
        } else if (name === 'delete_note') {
            label = t('ai_chat.tool_delete', {}, 'Moving note #{{id}} to the trash')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'delete_folder') {
            label = t('ai_chat.tool_delete_folder', {}, 'Moving folder "{{folder}}" and its notes to the trash')
                .replace('{{folder}}', args.folder || '?');
        } else if (name === 'update_note_tags') {
            label = t('ai_chat.tool_tags', {}, 'Updating the tags of note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'list_tags') {
            label = t('ai_chat.tool_list_tags', {}, 'Listing tags');
        } else if (name === 'list_folders') {
            label = t('ai_chat.tool_list_folders', {}, 'Listing folders');
        } else if (name === 'create_folder') {
            label = t('ai_chat.tool_create_folder', {}, 'Creating folder: {{path}}')
                .replace('{{path}}', args.path || '');
        } else if (name === 'rename_folder') {
            label = t('ai_chat.tool_rename_folder', {}, 'Renaming folder "{{folder}}" to "{{name}}"')
                .replace('{{folder}}', args.folder || '?')
                .replace('{{name}}', args.new_name || '');
        } else if (name === 'move_note_to_folder') {
            var target = String(args.folder || '').trim();
            label = (target === '' || /^(root|none|\/)$/i.test(target))
                ? t('ai_chat.tool_move_root', {}, 'Moving note #{{id}} out of its folder').replace('{{id}}', args.note_id || '?')
                : t('ai_chat.tool_move', {}, 'Moving note #{{id}} to {{folder}}').replace('{{id}}', args.note_id || '?').replace('{{folder}}', target);
        } else if (name === 'set_note_favorite') {
            label = (args.favorite === false || args.favorite === 'false')
                ? t('ai_chat.tool_favorite_off', {}, 'Removing note #{{id}} from the favorites').replace('{{id}}', args.note_id || '?')
                : t('ai_chat.tool_favorite_on', {}, 'Adding note #{{id}} to the favorites').replace('{{id}}', args.note_id || '?');
        } else if (name === 'set_folder_favorite') {
            label = t('ai_chat.tool_folder_favorite', {}, 'Updating the favorite state of folder "{{folder}}"')
                .replace('{{folder}}', args.folder || '?');
        } else if (name === 'set_note_reminder') {
            label = t('ai_chat.tool_reminder', {}, 'Setting a reminder on note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'remove_note_reminder') {
            label = t('ai_chat.tool_reminder_remove', {}, 'Removing the reminder of note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else if (name === 'add_task') {
            label = t('ai_chat.tool_task_add', {}, 'Adding task: {{text}}')
                .replace('{{text}}', args.text || '');
        } else if (name === 'update_task') {
            label = t('ai_chat.tool_task_update', {}, 'Updating task "{{task}}"')
                .replace('{{task}}', args.task || '?');
        } else if (name === 'delete_task') {
            label = t('ai_chat.tool_task_delete', {}, 'Removing task "{{task}}"')
                .replace('{{task}}', args.task || '?');
        } else if (name === 'set_checklist_item') {
            label = t('ai_chat.tool_checklist', {}, 'Updating a checkbox of note #{{id}}')
                .replace('{{id}}', args.note_id || '?');
        } else {
            label = String(name || '');
        }
        var ICONS = {
            get_note: 'lucide-file-text',
            rename_note: 'lucide-pencil',
            update_note_content: 'lucide-pencil',
            create_note: 'lucide-plus-circle',
            delete_note: 'lucide-trash-2',
            delete_folder: 'lucide-trash-2',
            update_note_tags: 'lucide-tag',
            list_tags: 'lucide-tags',
            list_folders: 'lucide-folder-open',
            create_folder: 'lucide-folder-plus',
            rename_folder: 'lucide-pencil',
            move_note_to_folder: 'lucide-folder-output',
            set_note_favorite: 'lucide-star',
            set_folder_favorite: 'lucide-star',
            set_note_reminder: 'lucide-bell',
            remove_note_reminder: 'lucide-bell',
            add_task: 'lucide-plus-circle',
            update_task: 'lucide-check-square',
            delete_task: 'lucide-x-circle',
            set_checklist_item: 'lucide-check-square'
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
    // calling: the chat still works but cannot browse the notes. Some OpenAI
    // models only refuse tools because of the reasoning effort, which the
    // settings page can fix: say so.
    function appendToolsUnsupportedNotice(pendingBubble, reason) {
        if (panel() && panel().querySelector('.ai-chat-notice')) return;
        var div = document.createElement('div');
        div.className = 'ai-chat-notice';
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-alert-triangle';
        div.appendChild(icon);
        var text = (reason === 'tools_need_reasoning_none')
            ? t('ai_chat.no_tools_reasoning_notice', {},
                'This model refuses tools at the current reasoning effort, so the assistant cannot browse your notes. Set the reasoning effort to None in the AI Assistant settings.')
            : t('ai_chat.no_tools_notice', {},
                'This model does not support tools — the assistant cannot browse your notes.');
        div.appendChild(document.createTextNode(' ' + text));
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    function saveConversation(workspace) {
        var key = storageKey(workspace !== undefined ? workspace : currentWorkspace());
        try {
            if (conversation.length) {
                sessionStorage.setItem(key, JSON.stringify(conversation.slice(-MAX_STORED_MESSAGES)));
            } else {
                sessionStorage.removeItem(key);
            }
        } catch (e) {
            // Storage full or unavailable — persistence is best-effort
        }
    }

    function restoreConversation() {
        var raw;
        try {
            raw = sessionStorage.getItem(storageKey(currentWorkspace()));
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
        scrollToBottom();
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

    /**
     * Open or close the panel. On desktop the state is saved so index.php
     * can restore it before the first paint of the next page load (as
     * html.ai-chat-open, which the panel's own class supersedes here).
     */
    function setOpen(open) {
        var p = panel();
        if (!p) return;
        p.classList.toggle('ai-chat-open', open);
        document.documentElement.classList.remove('ai-chat-open');
        if (isDesktop()) {
            try { localStorage.setItem(OPEN_KEY, open ? 'true' : 'false'); } catch (e) { /* ignore */ }
        }
        if (open) {
            // The empty hint mentions the open note, which changed since the
            // panel was last rendered: redraw it while the chat is still empty.
            if (!conversation.length) resetMessages();
            updateWorkspaceIndicator();
            updateContextIndicator();
        }
    }

    function toggle() {
        var open = !isOpen();
        if (open && askScope()) return;
        setOpen(open);
        if (open) {
            var input = document.getElementById('ai-chat-input');
            if (input && isDesktop()) input.focus();
        }
    }

    /**
     * dashboard.php renders #aiChatScopeModal when the board shows several
     * workspaces: the assistant only ever acts on one, so the first click on
     * the rail button says which one and asks whether to go on. Continue
     * opens the panel (and stops asking for the rest of the page), Cancel,
     * the backdrop and Escape leave it closed. Returns true when the notice
     * took the click.
     */
    function scopeModal() {
        return document.getElementById('aiChatScopeModal');
    }

    function askScope() {
        var modal = scopeModal();
        if (!modal || scopeAcknowledged) return false;
        modal.style.display = 'flex';
        var btn = modal.querySelector('[data-action="ai-chat-scope-continue"]');
        if (btn) btn.focus();
        return true;
    }

    function closeScopeModal() {
        var modal = scopeModal();
        if (modal) modal.style.display = 'none';
    }

    function isScopeModalOpen() {
        var modal = scopeModal();
        return !!modal && modal.style.display === 'flex';
    }

    /**
     * Drag the panel's left edge to resize it (desktop only, the handle is
     * hidden on phones). The width lives in a CSS variable on <html>, which
     * index.php also sets from the saved value before the first paint.
     */
    function initResize() {
        var handle = document.getElementById('aiChatResizeHandle');
        var p = panel();
        if (!handle || !p) return;
        var startX = 0;
        var startWidth = 0;

        function onMove(e) {
            var width = Math.round(startWidth + (startX - e.clientX));
            width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
            document.documentElement.style.setProperty('--ai-chat-width', width + 'px');
        }

        function onUp(e) {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            p.classList.remove('ai-chat-resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try {
                localStorage.setItem(WIDTH_KEY, String(Math.round(p.getBoundingClientRect().width)));
            } catch (err) { /* ignore */ }
        }

        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || !isOpen()) return;
            e.preventDefault();
            startX = e.clientX;
            startWidth = p.getBoundingClientRect().width;
            p.classList.add('ai-chat-resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            // Keep receiving moves when the pointer leaves the 6px handle
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        });
    }

    function resetMessages() {
        var el = messagesEl();
        if (!el) return;
        el.innerHTML = '';
        var hint = document.createElement('div');
        hint.className = 'ai-chat-empty';
        var text = t('ai_chat.empty', {}, 'Ask a question.\nThe assistant can search, read, create, edit, organize and delete your notes.');
        if (currentNoteId()) {
            text += '\n' + t('ai_chat.empty_open_note', {}, 'Say "this note" for the one you have open.');
        }
        hint.textContent = text;
        el.appendChild(hint);
    }

    function clear() {
        if (streaming && abortController) abortController.abort();
        conversation = [];
        saveConversation();
        resetMessages();
    }

    /**
     * Called by workspaces.js when the user switches workspace without a page
     * reload: park the current conversation under the workspace we are
     * leaving and show the one of the workspace we arrive in (if any). The
     * backend scopes every tool to the current workspace, so carrying the old
     * conversation over would only let the model answer from stale context.
     */
    function switchWorkspace(oldWorkspace) {
        if (streaming && abortController) abortController.abort();
        saveConversation(oldWorkspace);
        conversation = [];
        resetMessages();
        restoreConversation();
        updateWorkspaceIndicator();
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
        input.style.overflowY = 'hidden';

        conversation.push({ role: 'user', content: text });
        appendBubble('ai-chat-msg-user', text);

        var body = { messages: conversation };
        var workspace = currentWorkspace();
        if (workspace) {
            body.workspace = workspace;
        }
        updateContextIndicator();
        var openNoteId = currentNoteId();
        if (openNoteId) {
            body.note_id = openNoteId;
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
                if (obj.poznote_notice === 'tools_unsupported' || obj.poznote_notice === 'tools_need_reasoning_none') {
                    appendToolsUnsupportedNotice(bubble, obj.poznote_notice);
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
            // Tool calls may have edited notes or folders: let the live
            // refresh poller (js/live-refresh.js) pick them up right away.
            try {
                document.dispatchEvent(new CustomEvent('poznoteExternalChangeHint'));
            } catch (e) { /* ignore */ }
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

        // Panel open/clear triggers, handled here so the panel works on any
        // page that includes it (notes page, dashboard, ...)
        document.addEventListener('click', function (e) {
            var toggleBtn = e.target.closest('[data-action="toggle-ai-chat"]');
            if (toggleBtn) {
                e.preventDefault();
                toggle();
                return;
            }
            var clearBtn = e.target.closest('[data-action="ai-chat-clear"]');
            if (clearBtn) {
                e.preventDefault();
                clear();
                return;
            }
            var scopeBtn = e.target.closest('[data-action="ai-chat-scope-continue"], [data-action="ai-chat-scope-cancel"]');
            if (scopeBtn) {
                e.preventDefault();
                closeScopeModal();
                if (scopeBtn.getAttribute('data-action') === 'ai-chat-scope-continue') {
                    scopeAcknowledged = true;
                    toggle();
                }
                return;
            }
            if (e.target === scopeModal()) {
                closeScopeModal();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isScopeModalOpen()) closeScopeModal();
        });

        restoreConversation();

        // Docked state applied by the page before the first paint: carry it
        // on the panel from now on (same width, so nothing animates)
        if (document.documentElement.classList.contains('ai-chat-open')) {
            setOpen(true);
        }
        initResize();

        // The translations arrive after the first render (js/globals.js
        // fetches them): the hint drawn above with the English fallbacks is
        // redrawn in the user's language once they are in.
        document.addEventListener('poznote:i18n:loaded', function () {
            if (!conversation.length) resetMessages();
        });

        updateWorkspaceIndicator();
        updateContextIndicator();
        document.addEventListener('noteLoaded', updateContextIndicator);
        // The open note's title is edited in place: keep the shown one current
        document.addEventListener('input', function (e) {
            if (e.target && e.target.classList && e.target.classList.contains('css-title')) {
                updateContextIndicator();
            }
        });

        // Arriving from the "Back to AI Assistant" link of the settings pages
        // (back_to_settings.php): open the panel and drop the parameter so a
        // plain reload doesn't reopen it
        var params = new URLSearchParams(window.location.search);
        if (params.get('ai_chat') === '1') {
            if (!isOpen()) toggle();
            params.delete('ai_chat');
            var qs = params.toString();
            history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            send();
        });

        var input = document.getElementById('ai-chat-input');
        if (input) {
            input.addEventListener('focus', updateContextIndicator);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });
            input.addEventListener('input', function () {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden';
            });
        }
    });

    window.AIChat = {
        toggle: toggle,
        clear: clear,
        switchWorkspace: switchWorkspace
    };
})();
