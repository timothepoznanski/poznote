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
 * When external tools are connected in the settings (MCP servers, discussion
 * #1611), a globe button next to the input turns them on and off; the choice
 * is remembered and travels with every message.
 *
 * A lightning button opens the prompts the user saved in the settings
 * (discussion #1678): picking one sends it as a message, and whatever is
 * typed in the input stays there.
 *
 * On desktop the panel is docked as the rightmost column of the page (like
 * the outline panel), resizable by its left edge, and its open state and
 * width survive reloads. On phones it overlays the page.
 *
 * The panel is included by index.php and dashboard.php; the same stored
 * state and conversation follow the user from one page to the other. The
 * header starts a new conversation and lists the last ten of the workspace,
 * kept on the server, to carry one of them on. On the
 * dashboard no note is open, so "this note" has no target there.
 */
(function () {
    'use strict';

    var conversation = [];   // [{role: 'user'|'assistant', content: string}]
    var conversationId = ''; // names the conversation on the server
    var streaming = false;
    var abortController = null;

    var STORAGE_KEY = 'poznote-ai-chat-conversation'; // legacy, see restoreConversation()
    var CURRENT_KEY = 'poznote-ai-chat-current';      // sessionStorage: id of the tab's conversation
    var MAX_STORED_MESSAGES = 40; // matches the backend's conversation window

    // Docked panel state, also read by the first-paint script in index.php
    var OPEN_KEY = 'aiChatOpen';
    var WIDTH_KEY = 'aiChatWidth';
    var MIN_WIDTH = 300;
    var MAX_WIDTH = 700;

    // 'false' once the globe button has been switched off; on otherwise
    var EXTERNAL_KEY = 'aiChatExternalTools';

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
     * The workspaces of a dashboard showing several (body[data-ai-workspaces],
     * discussion #1652): the assistant searches and reads all of them and
     * changes nothing. Empty everywhere else.
     */
    function readOnlyWorkspaces() {
        var raw = document.body ? document.body.getAttribute('data-ai-workspaces') : '';
        if (!raw) return [];
        try {
            var list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
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
        if (!nameEl || readOnlyWorkspaces().length) return;
        var ws = currentWorkspace() || nameEl.getAttribute('data-fallback') || '';
        nameEl.textContent = ws;
        var box = document.getElementById('ai-chat-workspace');
        if (box) box.hidden = ws === '';
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

    function copyLabel() { return t('ai_chat.copy', {}, 'Copy'); }

    /** Put text on the clipboard; resolves to false when the browser refuses. */
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
        }
        // No Clipboard API on a page served over plain HTTP: copy the
        // selection of an off-screen field instead
        var field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
        field.remove();
        return Promise.resolve(ok);
    }

    /**
     * The small button under a question or an answer that copies it: the
     * question as typed, the answer as the Markdown the model wrote, which
     * is what pastes well into a note. It sits after the bubble rather than
     * in it, since an answer bubble is redrawn while it streams.
     */
    function appendCopyButton(bubble, text) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-copy' + (bubble.classList.contains('ai-chat-msg-user') ? ' ai-chat-copy-user' : '');
        btn.title = copyLabel();
        btn.setAttribute('aria-label', copyLabel());
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-copy';
        btn.appendChild(icon);
        btn.addEventListener('click', function () {
            copyText(text).then(function (ok) {
                if (!ok) return;
                icon.className = 'lucide lucide-check';
                btn.title = t('ai_chat.copied', {}, 'Copied');
                setTimeout(function () {
                    icon.className = 'lucide lucide-copy';
                    btn.title = copyLabel();
                }, 1500);
            });
        });
        bubble.insertAdjacentElement('afterend', btn);
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
    // parser (markdown-parser.js) with a sanitization pass on top.
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

    /** The globe button, absent when no external tools are connected. */
    function externalButton() { return document.getElementById('ai-chat-external'); }

    function externalToolsOn() {
        if (!externalButton()) return false;
        try {
            return localStorage.getItem(EXTERNAL_KEY) !== 'false';
        } catch (e) {
            return true;
        }
    }

    function updateExternalButton() {
        var btn = externalButton();
        if (!btn) return;
        var on = externalToolsOn();
        var servers = btn.getAttribute('data-servers') || '';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = (on
            ? t('ai_chat.external_tools_on', {}, 'External tools are on: the assistant may call {{servers}}. Click to turn them off.')
            : t('ai_chat.external_tools_off', {}, 'External tools are off. Click to let the assistant call {{servers}}.'))
            .replace('{{servers}}', servers);
    }

    function toggleExternalTools() {
        try {
            localStorage.setItem(EXTERNAL_KEY, externalToolsOn() ? 'false' : 'true');
        } catch (e) { /* ignore */ }
        updateExternalButton();
    }

    // What an external tool is called with leaves the instance: the activity
    // line shows it, the query alone when there is one
    function externalCallSummary(args) {
        if (!Object.keys(args).length) return '';
        var text = typeof args.query === 'string' ? args.query : JSON.stringify(args);
        return text.length > 160 ? text.slice(0, 160) + '…' : text;
    }

    // Show what the assistant is doing while it uses its tools, the note
    // ones (search_notes / get_note / list_recent_notes...) and the external
    // ones. Ephemeral: these lines are not part of the stored conversation.
    function appendToolActivity(tool, pendingBubble) {
        var name = tool && tool.name;
        var args = (tool && tool.args) || {};
        var external = tool && tool.external;
        var label;
        if (external) {
            var summary = externalCallSummary(args);
            label = external.server + ': ' + external.tool + (summary ? ' (' + summary + ')' : '');
        } else if (name === 'search_notes') {
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
        } else if (name === 'add_subtask') {
            label = t('ai_chat.tool_subtask_add', {}, 'Adding subtask: {{text}}')
                .replace('{{text}}', args.text || '');
        } else if (name === 'update_subtask') {
            label = t('ai_chat.tool_subtask_update', {}, 'Updating subtask "{{subtask}}"')
                .replace('{{subtask}}', args.subtask || '?');
        } else if (name === 'delete_subtask') {
            label = t('ai_chat.tool_subtask_delete', {}, 'Removing subtask "{{subtask}}"')
                .replace('{{subtask}}', args.subtask || '?');
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
            add_subtask: 'lucide-plus-circle',
            update_subtask: 'lucide-check-square',
            delete_subtask: 'lucide-x-circle',
            set_checklist_item: 'lucide-check-square'
        };
        var div = document.createElement('div');
        div.className = 'ai-chat-tool';
        var icon = document.createElement('i');
        icon.className = 'lucide ' + (external ? 'lucide-globe' : (ICONS[name] || 'lucide-search'));
        div.appendChild(icon);
        div.appendChild(document.createTextNode(' ' + label));
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    // Shown once per conversation when the configured model rejects tool
    // calling: the chat still works but cannot browse the notes. Some OpenAI
    // models only refuse tools because of the reasoning effort, which the
    // settings page can fix: say so. The server first tries again without
    // the external tools: when that is what happened, the notice gives the
    // refusal of the AI server (detail), which names the tool at fault.
    function appendToolsUnsupportedNotice(pendingBubble, reason, detail) {
        if (panel() && panel().querySelector('.ai-chat-notice')) return;
        var div = document.createElement('div');
        div.className = 'ai-chat-notice';
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-alert-triangle';
        div.appendChild(icon);
        var text;
        if (reason === 'external_tools_refused') {
            text = t('ai_chat.external_tools_refused', {},
                'The AI server refused the external tools, so this answer is given without them: {{error}}')
                .replace('{{error}}', String(detail || ''));
        } else if (reason === 'tools_need_reasoning_none') {
            text = t('ai_chat.no_tools_reasoning_notice', {},
                'This model refuses tools at the current reasoning effort, so the assistant cannot browse your notes. Set the reasoning effort to None in the AI Assistant settings.');
        } else {
            text = t('ai_chat.no_tools_notice', {},
                'This model does not support tools — the assistant cannot browse your notes.');
        }
        div.appendChild(document.createTextNode(' ' + text));
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    // Issue #1388: the server is sending the request again after a network
    // failure (DNS timeout, refused connection). Shown as an activity line,
    // like a tool call, so the pause reads as progress rather than a hang.
    function appendRetryNotice(retry, pendingBubble) {
        var div = document.createElement('div');
        div.className = 'ai-chat-tool';
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-refresh-cw';
        div.appendChild(icon);
        var label = t('ai_chat.retrying', {}, 'Connection to the AI server failed, retrying ({{attempt}}/{{max}})')
            .replace('{{attempt}}', String(retry.attempt || '?'))
            .replace('{{max}}', String(retry.max || '?'));
        div.appendChild(document.createTextNode(' ' + label));
        div.title = String(retry.error || '');
        messagesEl().insertBefore(div, pendingBubble);
        scrollToBottom();
    }

    // A failed turn keeps its text on a Retry button, so that the user does
    // not have to paste the message again when the failure was a one-off
    function appendRetryButton(errorBubble, text) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-retry';
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-refresh-cw';
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(' ' + t('ai_chat.retry', {}, 'Retry')));
        btn.addEventListener('click', function () {
            errorBubble.remove();
            send(text);
        });
        errorBubble.appendChild(document.createElement('br'));
        errorBubble.appendChild(btn);
    }

    /** A fresh id for a conversation: only ever compared with stored ones. */
    function newConversationId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    /** Messages read back from the server or from storage, reduced to what a conversation holds. */
    function cleanMessages(stored) {
        var messages = [];
        (Array.isArray(stored) ? stored : []).forEach(function (msg) {
            if (!msg || typeof msg.content !== 'string') return;
            if (msg.role !== 'user' && msg.role !== 'assistant') return;
            messages.push({ role: msg.role, content: msg.content });
        });
        return messages;
    }

    /**
     * Conversations are kept on the server, for the signed-in user and per
     * workspace (api_ai_chat.php, the conversation* actions). Requests run
     * one after the other, so that a list asked for right after an answer
     * holds that answer. Resolves to the JSON reply, or to null when the
     * request failed: the chat itself never depends on the history.
     */
    var historyRequests = Promise.resolve();

    function historyRequest(action, params, post) {
        var run = function () {
            var url = 'api_ai_chat.php?action=' + action;
            var options = { credentials: 'same-origin' };
            if (post) {
                options.method = 'POST';
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(params);
            } else {
                url += '&' + new URLSearchParams(params).toString();
            }
            return fetch(url, options).then(function (response) {
                return response.ok ? response.json() : null;
            }).catch(function (e) {
                console.debug('ai-chat: ' + action + ' failed:', e);
                return null;
            });
        };
        historyRequests = historyRequests.then(run);
        return historyRequests;
    }

    /**
     * Which conversation this tab has open in a workspace: only its id
     * stays in the browser (sessionStorage), for a reload to find it again.
     */
    function rememberConversation(workspace, id) {
        try {
            if (id) {
                sessionStorage.setItem(CURRENT_KEY + '::' + (workspace || ''), id);
            } else {
                sessionStorage.removeItem(CURRENT_KEY + '::' + (workspace || ''));
            }
        } catch (e) {
            console.debug('ai-chat: rememberConversation() failed:', e);
        }
    }

    /** Send the conversation on screen to the server, after each answer. */
    function saveConversation() {
        if (!conversation.length) return;
        var workspace = currentWorkspace();
        rememberConversation(workspace, conversationId);
        historyRequest('conversation_save', {
            id: conversationId,
            workspace: workspace,
            messages: conversation.slice(-MAX_STORED_MESSAGES)
        }, true);
    }

    /** Draw the bubbles of the conversation in memory. */
    function renderConversation() {
        resetMessages();
        conversation.forEach(function (msg) {
            var bubble = appendBubble(
                msg.role === 'user' ? 'ai-chat-msg-user' : 'ai-chat-msg-assistant', '');
            if (msg.role === 'user') {
                bubble.textContent = msg.content;
            } else {
                renderAssistantBubble(bubble, msg.content);
            }
            appendCopyButton(bubble, msg.content);
        });
        scrollToBottom();
    }

    /**
     * Start from an empty conversation, then take up the one this tab had
     * open in the current workspace, if any, once the server has sent it.
     */
    function restoreConversation() {
        var workspace = currentWorkspace();
        var blank = startConversation();
        var id = '';
        try {
            id = sessionStorage.getItem(CURRENT_KEY + '::' + (workspace || '')) || '';
            // Before conversations moved to the server, the messages
            // themselves were kept in the tab: hand them over once
            var legacyKey = STORAGE_KEY + '::' + (workspace || '');
            var legacy = cleanMessages(JSON.parse(sessionStorage.getItem(legacyKey) || 'null'));
            sessionStorage.removeItem(legacyKey);
            if (legacy.length && !id) {
                conversation = legacy;
                renderConversation();
                saveConversation();
                return;
            }
        } catch (e) {
            // Nothing usable stored: the conversation stays empty
        }
        if (!id) return;
        historyRequest('conversation', { id: id, workspace: workspace }).then(function (data) {
            // The user did not wait: what they started is the conversation now
            if (conversation !== blank || conversation.length) return;
            if (!data || !data.conversation) {
                rememberConversation(workspace, '');
                return;
            }
            conversation = cleanMessages(data.conversation.messages);
            conversationId = id;
            renderConversation();
        });
    }

    /** An empty conversation under a new id; returns its (empty) message list. */
    function startConversation() {
        if (streaming && abortController) abortController.abort();
        conversation = [];
        conversationId = newConversationId();
        resetMessages();
        return conversation;
    }

    /** Leave the conversation as it is in the history and start an empty one. */
    function newConversation() {
        startConversation();
        rememberConversation(currentWorkspace(), '');
        closeHistory();
        var input = document.getElementById('ai-chat-input');
        if (input && isDesktop()) input.focus();
    }

    function historyEl() { return document.getElementById('ai-chat-history'); }

    function isHistoryOpen() {
        var el = historyEl();
        return !!el && !el.hidden;
    }

    /** The history takes the place of the messages while it is open. */
    function setHistoryOpen(open) {
        var el = historyEl();
        if (!el) return;
        if (open) renderHistory();
        el.hidden = !open;
        messagesEl().hidden = open;
        var btn = document.querySelector('[data-action="ai-chat-history"]');
        if (btn) btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    }

    function closeHistory() { setHistoryOpen(false); }

    function historyNotice(text) {
        var el = historyEl();
        el.innerHTML = '';
        var notice = document.createElement('div');
        notice.className = 'ai-chat-empty';
        notice.textContent = text;
        el.appendChild(notice);
    }

    function renderHistory() {
        var el = historyEl();
        var workspace = currentWorkspace();
        historyRequest('conversations', { workspace: workspace }).then(function (data) {
            if (!isHistoryOpen() || workspace !== currentWorkspace()) return;
            if (!data || !Array.isArray(data.conversations)) {
                historyNotice(t('ai_chat.history_error', {}, 'The conversations could not be loaded.'));
                return;
            }
            if (!data.conversations.length) {
                historyNotice(t('ai_chat.history_empty', {}, 'No conversation yet.'));
                return;
            }
            el.innerHTML = '';
            data.conversations.forEach(function (entry) {
                el.appendChild(historyRow(entry));
            });
        });
    }

    /** One line of the history: {id, title, updated: Unix time}. */
    function historyRow(entry) {
        var row = document.createElement('div');
        row.className = 'ai-chat-history-row' + (entry.id === conversationId ? ' ai-chat-history-current' : '');

        var open = document.createElement('button');
        open.type = 'button';
        open.className = 'ai-chat-history-open';
        var title = document.createElement('span');
        title.className = 'ai-chat-history-title';
        title.textContent = String(entry.title || '');
        var date = document.createElement('span');
        date.className = 'ai-chat-history-date';
        date.textContent = entry.updated
            ? new Date(entry.updated * 1000).toLocaleString(document.documentElement.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '';
        open.appendChild(title);
        open.appendChild(date);
        open.addEventListener('click', function () { openConversation(entry.id); });

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ai-chat-history-delete';
        remove.title = t('ai_chat.delete_chat', {}, 'Delete this conversation');
        remove.setAttribute('aria-label', remove.title);
        var icon = document.createElement('i');
        icon.className = 'lucide lucide-x';
        remove.appendChild(icon);
        remove.addEventListener('click', function () { deleteConversation(entry.id); });

        row.appendChild(open);
        row.appendChild(remove);
        return row;
    }

    /** Carry on with a conversation of the history. */
    function openConversation(id) {
        var workspace = currentWorkspace();
        historyRequest('conversation', { id: id, workspace: workspace }).then(function (data) {
            if (!data || !data.conversation || workspace !== currentWorkspace()) {
                if (isHistoryOpen()) renderHistory();
                return;
            }
            startConversation();
            conversation = cleanMessages(data.conversation.messages);
            conversationId = id;
            rememberConversation(workspace, id);
            closeHistory();
            renderConversation();
        });
    }

    function deleteConversation(id) {
        if (id === conversationId) {
            startConversation();
            rememberConversation(currentWorkspace(), '');
        }
        historyRequest('conversation_delete', { id: id }, true);
        if (isHistoryOpen()) renderHistory();
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
        if (!open) setPromptsMenuOpen(false);
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
        // On phones the panel is a full screen overlay: let the Back button
        // close it (js/panel-back.js).
        if (window.PoznotePanelBack) {
            if (open) window.PoznotePanelBack.opened();
            else window.PoznotePanelBack.closed();
        }
    }

    /**
     * The icons of the workspace line open #aiChatWorkspaceInfoModal
     * (ai_chat_panel.php), which says how to search several workspaces at
     * once: from a dashboard showing them. Close, the backdrop and Escape
     * close it.
     */
    function workspaceInfoModal() {
        return document.getElementById('aiChatWorkspaceInfoModal');
    }

    function setWorkspaceInfoOpen(open) {
        var modal = workspaceInfoModal();
        if (!modal) return;
        modal.style.display = open ? 'flex' : 'none';
        if (open) {
            var btn = modal.querySelector('.modal-buttons .btn-primary') || modal.querySelector('.modal-buttons button');
            if (btn) btn.focus();
        }
    }

    function isWorkspaceInfoOpen() {
        var modal = workspaceInfoModal();
        return !!modal && modal.style.display === 'flex';
    }

    function toggle() {
        var open = !isOpen();
        setOpen(open);
        if (open) {
            var input = document.getElementById('ai-chat-input');
            if (input && isDesktop()) input.focus();
        }
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
        var text;
        if (readOnlyWorkspaces().length) {
            text = t('ai_chat.empty_read_only', {}, 'Ask a question.\nThe assistant searches and reads the notes of every workspace shown on this dashboard, but changes nothing here.');
        } else {
            text = t('ai_chat.empty', {}, 'Ask a question.\nThe assistant can search, read, create, edit, organize and delete your notes.');
        }
        if (currentNoteId() && !readOnlyWorkspaces().length) {
            text += '\n' + t('ai_chat.empty_open_note', {}, 'Say "this note" for the one you have open.');
        }
        hint.textContent = text;
        el.appendChild(hint);
    }

    /** Delete the conversation on screen, from the history as well. */
    function clear() {
        deleteConversation(conversationId);
    }

    /**
     * Called by workspaces-create.js when the user switches workspace without
     * a page reload: leave the current conversation, which the server holds,
     * and show the one this tab had open in the workspace we arrive in (if
     * any). The backend scopes every tool to the current workspace, so
     * carrying the old conversation over would only let the model answer
     * from stale context.
     */
    function switchWorkspace() {
        closeHistory();
        restoreConversation();
        updateWorkspaceIndicator();
    }

    function promptsMenu() { return document.getElementById('ai-chat-prompts'); }

    function isPromptsMenuOpen() {
        var menu = promptsMenu();
        return !!menu && !menu.hidden;
    }

    function setPromptsMenuOpen(open) {
        var menu = promptsMenu();
        if (!menu) return;
        menu.hidden = !open;
        var btn = document.getElementById('ai-chat-prompts-btn');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            var first = menu.querySelector('.ai-chat-prompt, .ai-chat-prompts-manage');
            if (first) first.focus();
        }
    }

    /** Send a saved prompt picked in the menu, as a message of its own. */
    function sendSavedPrompt(text) {
        setPromptsMenuOpen(false);
        if (streaming || !text) return;
        send(text, true);
    }

    /**
     * Send the input field, or, when retryText is given, send that text
     * again after a failed turn: its bubble is still on screen, only the
     * conversation entry (dropped by finish()) is put back. With fresh,
     * the given text is a new message (a saved prompt) and the input field
     * is left as it is.
     */
    function send(retryText, fresh) {
        if (streaming) {
            if (abortController) abortController.abort();
            return;
        }
        var isRetry = typeof retryText === 'string' && !fresh;
        var text;
        if (typeof retryText === 'string') {
            text = retryText;
        } else {
            var input = document.getElementById('ai-chat-input');
            text = input ? input.value.trim() : '';
            if (!text) return;
            input.value = '';
            input.style.height = 'auto';
            input.style.overflowY = 'hidden';
        }

        closeHistory();
        // finish() runs after the answer, or after an abort: by then the
        // user may have moved to another conversation, which this turn must
        // not write into
        var turnConversation = conversation;
        conversation.push({ role: 'user', content: text });
        if (!isRetry) {
            appendCopyButton(appendBubble('ai-chat-msg-user', text), text);
        }

        var body = { messages: conversation };
        var workspace = currentWorkspace();
        if (workspace) {
            body.workspace = workspace;
        }
        var workspaces = readOnlyWorkspaces();
        if (workspaces.length) {
            body.workspaces = workspaces;
        }
        updateContextIndicator();
        var openNoteId = currentNoteId();
        if (openNoteId) {
            body.note_id = openNoteId;
        }
        if (externalToolsOn()) {
            body.external_tools = true;
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
                if (obj.poznote_retry) {
                    appendRetryNotice(obj.poznote_retry, bubble);
                    return;
                }
                if (obj.poznote_notice === 'tools_unsupported' || obj.poznote_notice === 'tools_need_reasoning_none'
                    || obj.poznote_notice === 'external_tools_refused') {
                    appendToolsUnsupportedNotice(bubble, obj.poznote_notice, obj.detail);
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
            var errorBubble = appendBubble('ai-chat-msg-error',
                t('ai_chat.error', { error: (err && err.message) || 'unknown' }, 'Error: {{error}}')
                    .replace('{{error}}', (err && err.message) || 'unknown'));
            appendRetryButton(errorBubble, text);
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
            if (conversation !== turnConversation) return;
            if (!failed) {
                if (answer) {
                    renderAssistantBubble(bubble, answer);
                    appendCopyButton(bubble, answer);
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
            if (e.target.closest('[data-action="ai-chat-new"]')) {
                e.preventDefault();
                newConversation();
                return;
            }
            if (e.target.closest('[data-action="ai-chat-history"]')) {
                e.preventDefault();
                setHistoryOpen(!isHistoryOpen());
                return;
            }
            if (e.target.closest('[data-action="ai-chat-prompts"]')) {
                e.preventDefault();
                setPromptsMenuOpen(!isPromptsMenuOpen());
                return;
            }
            var promptBtn = e.target.closest('[data-action="ai-chat-prompt"]');
            if (promptBtn) {
                e.preventDefault();
                sendSavedPrompt(promptBtn.getAttribute('data-prompt') || '');
                return;
            }
            // A click anywhere else closes the menu
            if (isPromptsMenuOpen() && !e.target.closest('#ai-chat-prompts')) {
                setPromptsMenuOpen(false);
            }
            if (e.target.closest('[data-action="ai-chat-external"]')) {
                e.preventDefault();
                toggleExternalTools();
                return;
            }
            if (e.target.closest('[data-action="ai-chat-workspace-info"]')) {
                e.preventDefault();
                setWorkspaceInfoOpen(true);
                return;
            }
            if (e.target.closest('[data-action="ai-chat-workspace-info-close"]') || e.target === workspaceInfoModal()) {
                setWorkspaceInfoOpen(false);
                return;
            }
            if (e.target.closest('[data-action="ai-chat-open-dashboard"]')) {
                e.preventDefault();
                window.location.href = 'dashboard.php';
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isWorkspaceInfoOpen()) setWorkspaceInfoOpen(false);
            if (e.key === 'Escape' && isPromptsMenuOpen()) {
                setPromptsMenuOpen(false);
                var promptsBtn = document.getElementById('ai-chat-prompts-btn');
                if (promptsBtn) promptsBtn.focus();
            }
        });

        if (window.PoznotePanelBack) {
            window.PoznotePanelBack.register({
                isOpen: isOpen,
                close: function () { setOpen(false); }
            });
        }

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
            if (isHistoryOpen()) renderHistory();
            updateExternalButton();
            // Buttons of a restored conversation were labelled before the
            // translations arrived
            Array.prototype.forEach.call(document.querySelectorAll('.ai-chat-copy'), function (btn) {
                btn.title = copyLabel();
                btn.setAttribute('aria-label', copyLabel());
            });
        });
        updateExternalButton();

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
