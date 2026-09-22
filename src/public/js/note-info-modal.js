/**
 * Note information modal (#noteInfoModal in modals.php).
 *
 * Opened from the "..." menu at the bottom-right of the notes page. It used to
 * be a page of its own (info.php), which meant leaving the note to read a
 * dozen read-only lines and then navigating back.
 *
 * Every value is fetched from api_note_info.php already formatted for display,
 * so this module only puts strings where the markup says they go. The rows
 * keep the values of the previous note while the request is in flight, which
 * is why they are cleared first.
 */
(function () {
    'use strict';

    var MODAL_ID = 'noteInfoModal';
    var pendingController = null;

    function getModal() {
        return document.getElementById(MODAL_ID);
    }

    function setError(modal, message) {
        var error = modal.querySelector('#noteInfoError');
        if (!error) return;

        error.textContent = message || '';
        error.hidden = !message;
    }

    function clearValues(modal, placeholder) {
        var values = modal.querySelectorAll('[data-note-info]');
        for (var i = 0; i < values.length; i++) {
            values[i].textContent = placeholder;
            values[i].classList.remove('note-info-favorite-yes', 'note-info-favorite-no');
        }
    }

    function fillValues(modal, info) {
        var values = modal.querySelectorAll('[data-note-info]');
        for (var i = 0; i < values.length; i++) {
            var element = values[i];
            var key = element.getAttribute('data-note-info');

            if (key === 'favorite') {
                element.textContent = info.favorite_text || '';
                // The old page marked a favorite note, and only that one, in
                // the warning colour (css/modals/specific-modals.css)
                element.classList.toggle('note-info-favorite-yes', !!info.favorite);
                element.classList.toggle('note-info-favorite-no', !info.favorite);
                continue;
            }

            element.textContent = Object.prototype.hasOwnProperty.call(info, key)
                ? String(info[key])
                : '';
        }
    }

    function showNoteInfoModal(noteId) {
        var modal = getModal();
        if (!modal || !noteId) return;

        var loading = (typeof window.t === 'function')
            ? window.t('common.loading', null, 'Loading...')
            : 'Loading...';

        setError(modal, '');
        clearValues(modal, loading);
        modal.style.display = 'flex';

        // Opening the modal again before the first answer lands: the stale
        // request would overwrite the rows of the note actually asked for
        if (pendingController) {
            pendingController.abort();
        }
        pendingController = (typeof AbortController === 'function') ? new AbortController() : null;

        var url = 'api_note_info.php?note_id=' + encodeURIComponent(noteId);
        if (window.selectedWorkspace) {
            url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
        }

        fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            signal: pendingController ? pendingController.signal : undefined
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                pendingController = null;
                if (!result.ok || !result.data || !result.data.success) {
                    throw new Error((result.data && result.data.message) || 'Request failed');
                }
                fillValues(modal, result.data.info || {});
            })
            .catch(function (error) {
                if (error && error.name === 'AbortError') return;

                pendingController = null;
                clearValues(modal, '');
                setError(modal, (typeof window.t === 'function')
                    ? window.t('info.errors.load_failed', null, 'Could not load the note information.')
                    : 'Could not load the note information.');
                console.error('note-info-modal: could not load the note information:', error);
            });
    }

    window.showNoteInfoModal = showNoteInfoModal;
})();
