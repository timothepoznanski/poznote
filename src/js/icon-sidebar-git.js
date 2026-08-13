/**
 * Git push / pull buttons of the notes page icon rail.
 *
 * The dashboard drives the same two endpoints from js/dashboard-page.js, but
 * that file is tied to the board rendering, so the rail gets its own handler.
 */
(function () {
    'use strict';

    function tr(key, vars, fallback) {
        return typeof window.t === 'function' ? window.t(key, vars || {}, fallback) : fallback;
    }

    function confirmAction(message) {
        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            return window.modalAlert.confirm(message);
        }

        return Promise.resolve(window.confirm(message));
    }

    function showError(message) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'error');
            return;
        }

        window.alert(message);
    }

    function runGitSync(action) {
        var provider = (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.gitProvider) || 'Git';
        var confirmMsg = action === 'pull'
            ? tr('git_sync.confirm_pull', { provider: provider }, 'Pull all notes from Git? Local data will be overwritten.')
            : tr('git_sync.confirm_push', { provider: provider }, 'Push all notes to Git?');

        confirmAction(confirmMsg).then(function (confirmed) {
            if (!confirmed) return;

            var spinner = window.modalAlert && typeof window.modalAlert.showSpinner === 'function'
                ? window.modalAlert.showSpinner(tr('git_sync.starting', {}, 'Syncing...'))
                : null;

            fetch('/api/v1/git-sync/' + action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({})
            })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    if (spinner) spinner.close();

                    if (data && data.success) {
                        window.location.reload();
                        return;
                    }

                    var detail = data && (data.error || data.message
                        || (data.errors && data.errors[0] && data.errors[0].error));
                    showError(detail || 'Sync failed.');
                })
                .catch(function (error) {
                    if (spinner) spinner.close();
                    showError(tr('git_sync.messages.connection_error', { error: error.message }, 'Connection failed: ') + error.message);
                });
        });
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-icon-sidebar-git-action]');
        if (!button) return;

        event.preventDefault();
        runGitSync(button.getAttribute('data-icon-sidebar-git-action'));
    });
})();
