/**
 * Dictation and audio transcription.
 *
 * Poznote embeds no speech model. The browser records, the recording is posted
 * to api_transcribe.php, and the server forwards it to whatever speech-to-text
 * server the instance or the user configured (see src/stt_config.php). Nothing
 * here talks to that server directly: it usually sits on a private network the
 * page cannot reach, and its key is none of the page's business.
 *
 * Two entry points, both gated on window.POZNOTE_CONFIG.speechToText:
 *   window.openDictationModal()                 the slash menu's "Dictate"
 *   window.transcribeAttachment(noteId, id, fn) an audio attachment
 *
 * And one that needs no transcription server at all, sharing the same dialog
 * and microphone handling:
 *   window.openAudioRecorder()                  the slash menu's "Record audio"
 *
 * The recording never touches disk unless the user ticks "attach the
 * recording", which goes through the ordinary attachment endpoint and so obeys
 * the same quotas as any upload.
 */
(function () {
    'use strict';

    function t(key, vars, fallback) {
        return (typeof window.t === 'function') ? window.t(key, vars, fallback) : fallback;
    }

    function isAvailable() {
        return !!(window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.speechToText);
    }

    function maxSeconds() {
        var configured = window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.speechToTextMaxSeconds;
        return (typeof configured === 'number' && configured > 0) ? configured : 600;
    }

    /**
     * MediaRecorder is not the constraint people expect it to be: it exists
     * everywhere current, but getUserMedia is only exposed on a secure origin,
     * so plain http on anything but localhost has no microphone at all. Saying
     * so beats a silent no-op.
     */
    function recordingSupport() {
        if (typeof MediaRecorder === 'undefined') {
            return { ok: false, reason: 'unsupported' };
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return { ok: false, reason: window.isSecureContext === false ? 'insecure' : 'unsupported' };
        }
        return { ok: true, reason: '' };
    }

    // Let the browser pick its own container: Chrome and Firefox produce WebM,
    // Safari produces MP4, and the server sniffs what it actually received
    // rather than believing a label.
    function pickMimeType() {
        var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (var i = 0; i < candidates.length; i++) {
            if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(candidates[i])) {
                return candidates[i];
            }
        }
        return '';
    }

    function extensionForType(type) {
        var bare = String(type || '').split(';')[0].toLowerCase();
        if (bare.indexOf('ogg') !== -1) return 'ogg';
        if (bare.indexOf('mp4') !== -1) return 'm4a';
        if (bare.indexOf('mpeg') !== -1) return 'mp3';
        if (bare.indexOf('wav') !== -1) return 'wav';
        return 'webm';
    }

    // ------------------------------------------------------------------
    // Inserting the transcript into the open note
    // ------------------------------------------------------------------

    function markdownApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    function isMarkdownEditor(el) {
        var api = markdownApi();
        return !!(api && el && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(el));
    }

    /**
     * Everything needed to put text back where the caret was, captured before
     * the modal opens. The modal takes focus and the selection with it, and on
     * mobile the keyboard closing wipes it a second time, so nothing may be
     * read from the live selection once the dialog is up.
     */
    function captureInsertionContext() {
        var context = { noteEntry: null, editable: null, range: null, markdownEditor: null, markdownSelection: null };

        var api = markdownApi();
        var activeMarkdown = null;
        if (api && typeof api.getLastActiveEditor === 'function') {
            activeMarkdown = api.getLastActiveEditor();
        }
        if (!activeMarkdown && isMarkdownEditor(document.activeElement)) {
            activeMarkdown = document.activeElement;
        }
        if (activeMarkdown && document.body.contains(activeMarkdown)) {
            context.markdownEditor = activeMarkdown;
            context.noteEntry = activeMarkdown.closest ? activeMarkdown.closest('.noteentry') : null;
            if (typeof api.getSelectionOffsets === 'function') {
                context.markdownSelection = api.getSelectionOffsets(activeMarkdown);
            }
            return context;
        }

        try {
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                var range = sel.getRangeAt(0);
                var container = range.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentNode;
                var editable = container.closest ? container.closest('[contenteditable="true"]') : null;
                var noteEntry = container.closest ? container.closest('.noteentry') : null;
                if (editable && noteEntry) {
                    context.editable = editable;
                    context.noteEntry = noteEntry;
                    context.range = range.cloneRange();
                    return context;
                }
            }
        } catch (e) {
            console.debug('speech-to-text: captureInsertionContext() failed:', e);
        }

        // No caret: the attachment flow reaches here, and so does a dictation
        // started right after the note was opened. The note itself is enough
        // to append to.
        var openNote = document.querySelector('.noteentry');
        if (openNote) {
            context.noteEntry = openNote;
            if (isMarkdownEditor(openNote)) {
                context.markdownEditor = openNote;
            } else {
                var inner = openNote.querySelector('.markdown-editor');
                if (inner && isMarkdownEditor(inner)) {
                    context.markdownEditor = inner;
                } else if (openNote.getAttribute('contenteditable') === 'true') {
                    context.editable = openNote;
                }
            }
        }
        return context;
    }

    /**
     * Where the transcript of an attachment picked in the note itself goes
     * (js/note-attachment-menu.js): right after that attachment, whatever the
     * caret was doing. Null when the note cannot say, and the caller then
     * falls back to captureInsertionContext().
     */
    function captureContextAfter(anchor, attachmentId) {
        var noteEntry = anchor && anchor.closest ? anchor.closest('.noteentry') : null;
        if (!noteEntry) return null;
        var context = { noteEntry: noteEntry, editable: null, range: null, markdownEditor: null, markdownSelection: null, ownParagraph: false };

        var api = markdownApi();
        var editor = isMarkdownEditor(noteEntry) ? noteEntry : noteEntry.querySelector('.markdown-editor');
        if (editor && isMarkdownEditor(editor)) {
            // The anchor is in the rendered preview: find the source line that
            // references the attachment and start a paragraph below it
            var source = (typeof api.getValue === 'function') ? api.getValue(editor) : '';
            var id = String(attachmentId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var at = source.search(new RegExp('attachments/' + id + '|attachment=' + id));
            if (at === -1) return null;
            var lineEnd = source.indexOf('\n', at);
            if (lineEnd === -1) lineEnd = source.length;
            context.markdownEditor = editor;
            context.markdownSelection = { start: lineEnd, end: lineEnd };
            context.ownParagraph = true;
            return context;
        }

        if (noteEntry.getAttribute('contenteditable') !== 'true') return null;
        // After the top-level block holding the attachment, so a link inside a
        // paragraph does not get the transcript spliced into its sentence
        var block = anchor;
        while (block.parentNode && block.parentNode !== noteEntry) {
            block = block.parentNode;
        }
        if (block.parentNode !== noteEntry) return null;
        var range = document.createRange();
        range.setStartAfter(block);
        range.collapse(true);
        context.editable = noteEntry;
        context.range = range;
        return context;
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /** Plain text as rich-text markup: blank lines separate paragraphs. */
    function textToHtml(text) {
        var blocks = String(text).split(/\n{2,}/);
        return blocks.map(function (block) {
            return '<div>' + escapeHtml(block).replace(/\n/g, '<br>') + '</div>';
        }).join('');
    }

    function insertIntoMarkdown(context, text) {
        var api = markdownApi();
        var editor = context.markdownEditor;
        if (!api || !editor || typeof api.replaceRange !== 'function') return false;

        var docLength = (typeof api.getValue === 'function') ? api.getValue(editor).length : 0;
        var selection = context.markdownSelection;
        var from = selection ? Math.min(selection.start, selection.end) : docLength;
        var to = selection ? Math.max(selection.start, selection.end) : docLength;
        var payload = text;

        // Appending to a note that already has content: start a new paragraph
        // rather than gluing the transcript onto the last word.
        if (context.ownParagraph) {
            payload = '\n\n' + payload;
        } else if (!selection && docLength > 0) {
            var tail = api.getValue(editor).slice(-2);
            payload = (tail.slice(-1) === '\n' ? (tail === '\n\n' ? '' : '\n') : '\n\n') + payload;
        }

        api.replaceRange(editor, from, to, payload);
        return true;
    }

    function insertIntoRichText(context, text) {
        var editable = context.editable;
        if (!editable || !document.body.contains(editable)) return false;

        try { editable.focus({ preventScroll: true }); } catch (e) { editable.focus(); }

        var restored = false;
        if (context.range && editable.contains(context.range.commonAncestorContainer)) {
            try {
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(context.range);
                restored = true;
            } catch (e) {
                console.debug('speech-to-text: insertIntoRichText() failed:', e);
            }
        }

        var html = textToHtml(text);
        if (restored && typeof window.insertHTMLAtSelection === 'function') {
            if (window.insertHTMLAtSelection(html)) return true;
        }

        // No usable caret: append at the end of the note
        var holder = document.createElement('div');
        holder.innerHTML = html;
        while (holder.firstChild) {
            editable.appendChild(holder.firstChild);
        }
        return true;
    }

    /**
     * Put the transcript in the note and let autosave see it. Returns false
     * when there is nothing to insert into, which the caller reports rather
     * than losing the text silently.
     */
    function insertTranscript(context, text) {
        text = String(text || '').trim();
        if (text === '' || !context) return false;

        var done = context.markdownEditor ? insertIntoMarkdown(context, text) : insertIntoRichText(context, text);
        if (!done) return false;

        var target = context.markdownEditor || context.editable;
        if (target) {
            try {
                target.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {
                console.debug('speech-to-text: insertTranscript() failed:', e);
            }
        }
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
        return true;
    }

    // ------------------------------------------------------------------
    // The modal
    // ------------------------------------------------------------------

    var state = {
        stream: null,
        recorder: null,
        chunks: [],
        blob: null,
        mimeType: '',
        startedAt: 0,
        timerId: 0,
        limitId: 0,
        levelRaf: 0,
        audioContext: null,
        analyser: null,
        context: null,
        noteId: null,
        canKeepAudio: false,
        // 'dictate' transcribes the recording, 'record' inserts it as audio
        mode: 'dictate',
        // Object URL offered when a recording could not be uploaded
        downloadUrl: '',
        // Every dictation gets a number, and the recorder's callbacks carry the
        // one they were started for. Stopping a recording fires its events
        // asynchronously, so a flag set and cleared inside closeModal() is
        // already gone by the time they run: cancelling mid-recording would
        // upload the audio anyway. A run that is no longer the current one
        // simply does nothing.
        runId: 0
    };

    function el(id) { return document.getElementById(id); }

    function showPanel(name) {
        var panels = { record: el('dictateRecordPanel'), work: el('dictateWorkPanel'), review: el('dictateReviewPanel') };
        Object.keys(panels).forEach(function (key) {
            if (panels[key]) panels[key].hidden = (key !== name);
        });
        var stopBtn = el('dictateStopBtn');
        var insertBtn = el('dictateInsertBtn');
        if (stopBtn) stopBtn.hidden = (name !== 'record');
        if (insertBtn) insertBtn.hidden = (name !== 'review');
    }

    function showError(message) {
        var box = el('dictateError');
        if (!box) return;
        box.textContent = message || '';
        box.hidden = !message;
    }

    function formatElapsed(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function tickTimer() {
        var timer = el('dictateTimer');
        if (!timer) return;
        var elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        timer.textContent = formatElapsed(elapsed);
    }

    /**
     * A live level bar, so a dead microphone is visible before three minutes
     * of silence come back as an empty transcript.
     */
    function startLevelMeter(stream) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        try {
            state.audioContext = new Ctx();
            var source = state.audioContext.createMediaStreamSource(stream);
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 512;
            source.connect(state.analyser);
            var data = new Uint8Array(state.analyser.frequencyBinCount);
            var bar = el('dictateLevelBar');
            var draw = function () {
                if (!state.analyser || !bar) return;
                state.analyser.getByteTimeDomainData(data);
                var peak = 0;
                for (var i = 0; i < data.length; i++) {
                    peak = Math.max(peak, Math.abs(data[i] - 128));
                }
                bar.style.width = Math.min(100, Math.round((peak / 128) * 180)) + '%';
                state.levelRaf = requestAnimationFrame(draw);
            };
            draw();
        } catch (e) {
            console.debug('speech-to-text: startLevelMeter() failed:', e);
        }
    }

    function stopLevelMeter() {
        if (state.levelRaf) cancelAnimationFrame(state.levelRaf);
        state.levelRaf = 0;
        state.analyser = null;
        if (state.audioContext) {
            try { state.audioContext.close(); } catch (e) { /* already closed */ }
            state.audioContext = null;
        }
    }

    function releaseMicrophone() {
        stopLevelMeter();
        if (state.timerId) clearInterval(state.timerId);
        if (state.limitId) clearTimeout(state.limitId);
        state.timerId = 0;
        state.limitId = 0;
        if (state.stream) {
            state.stream.getTracks().forEach(function (track) {
                try { track.stop(); } catch (e) { /* already stopped */ }
            });
            state.stream = null;
        }
        state.recorder = null;
    }

    function closeModal() {
        // Abandons whatever the current run was still going to do
        state.runId++;
        releaseMicrophone();
        state.chunks = [];
        state.blob = null;
        state.context = null;
        state.noteId = null;
        if (state.downloadUrl) {
            URL.revokeObjectURL(state.downloadUrl);
            state.downloadUrl = '';
        }
        var modal = el('dictateModal');
        if (modal) modal.style.display = 'none';
    }

    function openModal(mode, captureMode) {
        var modal = el('dictateModal');
        if (!modal) return false;
        // Dictation unless told otherwise, so transcribeAttachment() and the
        // slash menu's Dictate keep their wording without passing anything
        state.mode = captureMode || 'dictate';
        var recording = state.mode === 'record';
        var title = el('dictateTitle');
        if (title) {
            title.textContent = recording
                ? t('audio_recorder.title', null, 'Record audio')
                : t('stt.modal.title', null, 'Dictate');
        }
        var stopBtn = el('dictateStopBtn');
        if (stopBtn) {
            stopBtn.textContent = recording
                ? t('audio_recorder.stop', null, 'Stop and insert')
                : t('stt.modal.stop', null, 'Stop and transcribe');
        }
        showError('');
        var keepRow = el('dictateKeepRow');
        if (keepRow) keepRow.hidden = !state.canKeepAudio;
        var keepBox = el('dictateKeepAudio');
        if (keepBox) keepBox.checked = false;
        var timer = el('dictateTimer');
        if (timer) timer.textContent = '0:00';
        // The limit comes from the administrator's setting (index.php hands it
        // over in POZNOTE_CONFIG); shown next to the elapsed time so the
        // automatic stop never comes as a surprise.
        var limit = el('dictateTimerLimit');
        if (limit) limit.textContent = formatElapsed(maxSeconds());
        var hint = el('dictateHint');
        if (hint) {
            var minutes = { minutes: Math.round(maxSeconds() / 60) };
            hint.textContent = recording
                ? t('audio_recorder.hint', minutes, 'Recording. Stop to insert the audio into the note. It stops on its own after {{minutes}} min.')
                : t('stt.modal.recording_hint', minutes, 'Speak, then stop the recording to have it transcribed. It stops on its own after {{minutes}} min.');
        }
        var bar = el('dictateLevelBar');
        if (bar) bar.style.width = '0%';
        showPanel(mode);
        modal.style.display = 'flex';
        return true;
    }

    // ------------------------------------------------------------------
    // Recording
    // ------------------------------------------------------------------

    function startRecording(runId) {
        var support = recordingSupport();
        if (!support.ok) {
            showError(support.reason === 'insecure'
                ? t('stt.errors.insecure_context', null, 'The microphone needs HTTPS. Open Poznote over https, or through localhost.')
                : t('stt.errors.unsupported', null, 'This browser cannot record audio.'));
            showPanel('record');
            var stopBtn = el('dictateStopBtn');
            if (stopBtn) stopBtn.hidden = true;
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                // The permission prompt can outlive the dialog: someone who
                // grants it after cancelling must not end up with a live
                // microphone and no window to stop it from.
                if (runId !== state.runId) {
                    stream.getTracks().forEach(function (track) { track.stop(); });
                    return;
                }
                state.stream = stream;
                state.chunks = [];
                state.mimeType = pickMimeType();

                var options = state.mimeType ? { mimeType: state.mimeType } : undefined;
                state.recorder = new MediaRecorder(stream, options);
                // Whatever the recorder actually settled on wins over our guess
                state.mimeType = state.recorder.mimeType || state.mimeType || 'audio/webm';

                state.recorder.addEventListener('dataavailable', function (event) {
                    if (event.data && event.data.size > 0) state.chunks.push(event.data);
                });
                state.recorder.addEventListener('stop', function () {
                    releaseMicrophone();
                    // Cancelled while recording: the audio is dropped here and
                    // never leaves the browser.
                    if (runId !== state.runId) {
                        state.chunks = [];
                        return;
                    }
                    state.blob = new Blob(state.chunks, { type: state.mimeType });
                    state.chunks = [];
                    if (state.blob.size === 0) {
                        showPanel('record');
                        showError(t('stt.errors.empty_recording', null, 'Nothing was recorded.'));
                        return;
                    }
                    if (state.mode === 'record') {
                        insertRecording(runId, state.blob, state.mimeType);
                    } else {
                        sendRecording(runId, state.blob, state.mimeType);
                    }
                });

                state.recorder.start();
                state.startedAt = Date.now();
                state.timerId = setInterval(tickTimer, 1000);
                // A tab left recording all afternoon helps nobody, and the
                // server would then be handed a file it chews on for minutes.
                state.limitId = setTimeout(function () {
                    showError(state.mode === 'record'
                        ? t('audio_recorder.max_duration', null, 'Maximum recording length reached, inserting what was recorded.')
                        : t('stt.errors.max_duration', null, 'Maximum recording length reached, transcribing what was recorded.'));
                    stopRecording();
                }, maxSeconds() * 1000);
                startLevelMeter(stream);
            })
            .catch(function (error) {
                if (runId !== state.runId) return;
                var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
                var missing = error && (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError');
                showError(denied
                    ? t('stt.errors.permission_denied', null, 'Poznote was not allowed to use the microphone.')
                    : (missing
                        ? t('stt.errors.no_microphone', null, 'No microphone was found.')
                        : t('stt.errors.microphone_failed', null, 'The microphone could not be opened.')));
                var stopBtn = el('dictateStopBtn');
                if (stopBtn) stopBtn.hidden = true;
            });
    }

    function stopRecording() {
        if (state.recorder && state.recorder.state !== 'inactive') {
            try {
                state.recorder.stop();
                showPanel('work');
                var label = el('dictateWorkLabel');
                if (label) {
                    label.textContent = state.mode === 'record'
                        ? t('audio_recorder.saving', null, 'Saving the recording...')
                        : t('stt.modal.transcribing', null, 'Transcribing...');
                }
            } catch (e) {
                showError(t('stt.errors.microphone_failed', null, 'The microphone could not be opened.'));
            }
        }
    }

    function sendRecording(runId, blob, mimeType) {
        showPanel('work');
        showError('');

        var form = new FormData();
        form.append('audio', blob, 'recording.' + extensionForType(mimeType));

        fetch('api_transcribe.php?action=transcribe', {
            method: 'POST',
            credentials: 'same-origin',
            body: form
        })
            .then(readTranscription)
            .then(function (text) {
                if (runId !== state.runId) return;
                showReview(text);
            })
            .catch(function (error) {
                if (runId !== state.runId) return;
                showPanel('record');
                var stopBtn = el('dictateStopBtn');
                if (stopBtn) stopBtn.hidden = true;
                showError(t('stt.errors.failed', { error: error.message }, 'Transcription failed: {{error}}'));
            });
    }

    /** Unwrap the endpoint's answer, preferring its error text to a status code. */
    function readTranscription(response) {
        return response.json()
            .catch(function () { return {}; })
            .then(function (data) {
                if (!response.ok || !data.success) {
                    throw new Error(data.error || ('HTTP ' + response.status));
                }
                return String(data.text || '');
            });
    }

    function showReview(text) {
        showPanel('review');
        var area = el('dictateText');
        if (area) {
            area.value = text;
            // An empty transcript is a real answer from Whisper on silence, and
            // saying so is more useful than an empty box
            if (text.trim() === '') {
                showError(t('stt.errors.nothing_heard', null, 'The server heard nothing in this recording.'));
            }
            try { area.focus(); } catch (e) { /* not focusable yet */ }
        }
    }

    /**
     * Keep the recording. It goes through the ordinary attachment endpoint, so
     * quotas, storage backend and Git sync all behave as they do for any file.
     */
    function attachRecording(noteId, blob, mimeType) {
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var form = new FormData();
        form.append('note_id', noteId);
        form.append('file', blob, 'dictation-' + stamp + '.' + extensionForType(mimeType));

        return fetch('/api/v1/notes/' + noteId + '/attachments', {
            method: 'POST',
            credentials: 'same-origin',
            body: form
        })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (data) {
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || data.message || ('HTTP ' + response.status));
                    }
                    return data;
                });
            });
    }

    function confirmInsert() {
        var area = el('dictateText');
        var text = area ? area.value : '';
        var keep = state.canKeepAudio && el('dictateKeepAudio') && el('dictateKeepAudio').checked;
        var blob = state.blob;
        var mimeType = state.mimeType;
        var noteId = state.noteId;
        var context = state.context;

        if (String(text).trim() === '') {
            closeModal();
            return;
        }

        // A note open elsewhere is locked for this tab: the editor would take the
        // text and the save would then be refused, losing it without a word.
        // Refuse up front instead, and leave the text in the box to copy.
        var targetNoteId = context && context.noteEntry ? context.noteEntry.getAttribute('data-note-id') : null;
        if (targetNoteId && typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(targetNoteId)) {
            showError(t('stt.errors.note_locked', null, 'This note cannot be edited from here right now, so the text was not inserted. Copy it from the box above.'));
            return;
        }

        if (!insertTranscript(context, text)) {
            showError(t('stt.errors.no_note', null, 'Open a note first: there is nowhere to put the text.'));
            return;
        }

        // The text is in the note; keeping the audio is a bonus that must not
        // be able to undo that, so its failure is only reported.
        if (keep && blob && noteId) {
            attachRecording(noteId, blob, mimeType)
                .then(function () {
                    if (typeof window.loadAttachments === 'function') window.loadAttachments(noteId);
                    if (typeof window.updateAttachmentCountInMenu === 'function') window.updateAttachmentCountInMenu(noteId);
                })
                .catch(function (error) {
                    if (typeof window.showNotificationPopup === 'function') {
                        window.showNotificationPopup(
                            t('stt.errors.attach_failed', { error: error.message }, 'The text was inserted, but the recording could not be attached: {{error}}'),
                            'error'
                        );
                    }
                });
        }

        closeModal();
    }

    // ------------------------------------------------------------------
    // Public entry points
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Plain audio recording (no transcription)
    // ------------------------------------------------------------------

    /**
     * Name the file after its real container. A WebM from Chrome or Firefox is
     * named .weba, WebM's audio-only extension: under .webm the server could
     * not tell it from a film and would store it as video (see
     * poznoteResolveAttachmentMimeType() in src/lib/attachments.php).
     */
    function recordingFileName(mimeType) {
        var ext = extensionForType(mimeType);
        if (ext === 'webm') ext = 'weba';
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return 'recording-' + stamp + '.' + ext;
    }

    /**
     * Hand the recording to the slash menu's audio upload, so it gets exactly
     * the player, upload spinner, errors and insertion that /Media > Audio
     * gives a chosen file (insertAudioFileWithContext in js/slash-command.js).
     */
    function insertRecording(runId, blob, mimeType) {
        if (runId !== state.runId) return;
        var context = state.context || {};
        var fileName = recordingFileName(mimeType);
        var file;
        try {
            file = new File([blob], fileName, { type: String(mimeType || 'audio/webm').split(';')[0] });
        } catch (e) {
            // Very old browsers have no File constructor; a named Blob uploads the same
            file = blob;
            file.name = fileName;
        }

        if (typeof window.insertAudioFileWithContext !== 'function' || !context.noteEntry) {
            showUploadFailure(t('stt.errors.no_note', null, 'Open a note first: there is nowhere to put the text.'), blob, fileName);
            return;
        }

        var isMarkdown = !!context.markdownEditor;
        var options = {
            file: file,
            noteEntry: context.noteEntry,
            editableElement: isMarkdown ? context.markdownEditor : context.editable,
            isMarkdown: isMarkdown,
            savedRange: isMarkdown ? null : context.range,
            codeMirrorSelection: (isMarkdown && context.markdownSelection)
                ? { editor: context.markdownEditor, start: context.markdownSelection.start, end: context.markdownSelection.end }
                : null,
            // A failed upload must not lose what was just recorded
            onUploadError: function (error) {
                reopenWithDownload(blob, fileName, error);
            }
        };

        // The upload shows its own spinner; this dialog would sit on top of it
        closeModal();
        window.insertAudioFileWithContext(options);
    }

    function reopenWithDownload(blob, fileName, error) {
        state.runId++;
        if (!openModal('record', 'record')) return;
        var stopBtn = el('dictateStopBtn');
        if (stopBtn) stopBtn.hidden = true;
        var message = t('audio_recorder.upload_failed', { error: (error && error.message) || String(error || '') },
            'The recording could not be saved: {{error}}');
        showUploadFailure(message, blob, fileName);
    }

    /** Error line plus a link that saves the recording on this device. */
    function showUploadFailure(message, blob, fileName) {
        var box = el('dictateError');
        if (!box) return;
        box.textContent = message + ' ';
        if (blob) {
            if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
            state.downloadUrl = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = state.downloadUrl;
            link.download = fileName;
            link.textContent = t('audio_recorder.download', null, 'Download the recording');
            box.appendChild(link);
        }
        box.hidden = false;
        var stopBtn = el('dictateStopBtn');
        if (stopBtn) stopBtn.hidden = true;
    }

    /**
     * Record audio straight into the note, without transcription. Offered to
     * everyone: it needs a microphone, not a transcription server. The limit
     * is the same Maximum recording length as dictation.
     */
    window.openAudioRecorder = function () {
        var runId = ++state.runId;
        state.context = captureInsertionContext();
        state.noteId = state.context.noteEntry ? state.context.noteEntry.getAttribute('data-note-id') : null;
        state.canKeepAudio = false;
        state.blob = null;

        if (!state.noteId) {
            if (typeof window.showNotificationPopup === 'function') {
                window.showNotificationPopup(t('audio_recorder.no_note', null, 'Open a note first: the recording is saved as an attachment of that note.'), 'error');
            }
            return;
        }

        if (!openModal('record', 'record')) return;
        startRecording(runId);
    };

    window.openDictationModal = function () {
        if (!isAvailable()) return;

        // Claim a run first: everything below is allowed to outlive the dialog,
        // and this is what tells it that it has.
        var runId = ++state.runId;
        state.context = captureInsertionContext();
        state.noteId = state.context.noteEntry ? state.context.noteEntry.getAttribute('data-note-id') : null;
        // Only offer to keep the recording when there is a note to keep it on
        state.canKeepAudio = !!state.noteId;
        state.blob = null;

        if (!openModal('record')) return;
        startRecording(runId);
    };

    /**
     * Transcribe an audio file already attached to a note. The audio is read
     * server-side from storage, so nothing is uploaded again. anchor, when
     * given, is the attachment's element in the note: the transcript lands
     * right after it.
     */
    window.transcribeAttachment = function (noteId, attachmentId, filename, anchor) {
        if (!isAvailable() || !noteId || !attachmentId) return;

        var runId = ++state.runId;
        state.context = (anchor && captureContextAfter(anchor, attachmentId)) || captureInsertionContext();
        state.noteId = noteId;
        // It is already an attachment; offering to attach it again is nonsense
        state.canKeepAudio = false;
        state.blob = null;

        if (!openModal('work')) return;
        var label = el('dictateWorkLabel');
        if (label) {
            label.textContent = filename
                ? t('stt.modal.transcribing_file', { file: filename }, 'Transcribing {{file}}...')
                : t('stt.modal.transcribing', null, 'Transcribing...');
        }

        var body = new URLSearchParams();
        body.append('note_id', noteId);
        body.append('attachment_id', attachmentId);

        fetch('api_transcribe.php?action=transcribe_attachment', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        })
            .then(readTranscription)
            .then(function (text) {
                if (runId !== state.runId) return;
                showReview(text);
            })
            .catch(function (error) {
                if (runId !== state.runId) return;
                showPanel('review');
                var area = el('dictateText');
                if (area) area.value = '';
                showError(t('stt.errors.failed', { error: error.message }, 'Transcription failed: {{error}}'));
            });
    };

    document.addEventListener('DOMContentLoaded', function () {
        var modal = el('dictateModal');
        if (!modal) return;

        var stopBtn = el('dictateStopBtn');
        if (stopBtn) stopBtn.addEventListener('click', stopRecording);

        var insertBtn = el('dictateInsertBtn');
        if (insertBtn) insertBtn.addEventListener('click', confirmInsert);

        var cancelBtn = el('dictateCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Clicking the backdrop closes it, like the other dialogs. Stopping the
        // microphone matters more here than elsewhere: a dialog dismissed with
        // the recorder still running would keep the tab's mic indicator lit.
        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function (event) {
            if (event.target === modal && pressedOnBackdrop) closeModal();
            pressedOnBackdrop = false;
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal.style.display === 'flex') closeModal();
        });

        resumePendingTranscription();
    });

    /**
     * The attachments page has no editor, so its Transcribe button stores the
     * job and comes back to the note (js/attachments-page.js). Pick it up here
     * and run the ordinary attachment flow, which puts the text right after the
     * attachment when the note references it and at the end otherwise.
     *
     * One shot: the entry is removed as soon as it is read, so a reload never
     * transcribes twice, and a job older than ten minutes is ignored.
     */
    function resumePendingTranscription() {
        var job = null;
        try {
            var raw = sessionStorage.getItem('poznote.pendingTranscription');
            if (!raw) return;
            sessionStorage.removeItem('poznote.pendingTranscription');
            job = JSON.parse(raw);
        } catch (e) {
            console.debug('speech-to-text: resumePendingTranscription() failed:', e);
            return;
        }
        if (!job || !job.noteId || !job.attachmentId || !isAvailable()) return;
        if (!job.createdAt || Date.now() - job.createdAt > 10 * 60 * 1000) return;

        var noteId = String(job.noteId);
        var attachmentId = String(job.attachmentId);
        var quote = function (value) {
            return (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
        };

        // A Markdown note builds its editor after the page has loaded; wait for
        // it (bounded) so the transcript has somewhere to go.
        var started = Date.now();
        (function whenReady() {
            var noteEntry = document.getElementById('entry' + noteId)
                || document.querySelector('.noteentry[data-note-id="' + quote(noteId) + '"]');
            var isMarkdown = !!(noteEntry && noteEntry.getAttribute('data-note-type') === 'markdown');
            var editorReady = !isMarkdown || !!(noteEntry && (isMarkdownEditor(noteEntry) || isMarkdownEditor(noteEntry.querySelector('.markdown-editor'))));
            if (!noteEntry || !editorReady) {
                if (Date.now() - started < 8000) setTimeout(whenReady, 150);
                return;
            }

            // Where the note references the attachment, so the text lands right
            // after it. A Markdown note is searched in its source, which only
            // needs an element inside the note.
            var anchor = isMarkdown ? noteEntry : noteEntry.querySelector(
                '[data-attachment-id="' + quote(attachmentId) + '"], ' +
                'a[href*="attachments/' + quote(attachmentId) + '"], ' +
                'iframe[src*="attachment=' + quote(attachmentId) + '"], ' +
                'iframe[data-audio-src*="attachments/' + quote(attachmentId) + '"], ' +
                'audio[src*="attachments/' + quote(attachmentId) + '"], ' +
                'video[src*="attachments/' + quote(attachmentId) + '"]'
            );
            window.transcribeAttachment(noteId, attachmentId, job.filename || '', anchor || undefined);
        })();
    }
})();
