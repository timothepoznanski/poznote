/**
 * Webhook list interactions, shared by admin/webhooks.php and
 * user-webhooks.php: the per-row actions dropdown and the inline edit form.
 *
 * Both pages render the same markup, so a single delegated listener covers
 * them; rows added by a page reload are picked up on the next parse.
 */
(function () {
    'use strict';

    function closeAllMenus(exceptId) {
        document.querySelectorAll('.webhooks-actions-menu').forEach(function (menu) {
            if (exceptId && menu.id === 'webhooks-actions-menu-' + exceptId) {
                return;
            }
            menu.hidden = true;
        });
        document.querySelectorAll('.webhooks-actions-toggle').forEach(function (toggle) {
            if (exceptId && toggle.getAttribute('data-webhook-menu-toggle') === exceptId) {
                return;
            }
            toggle.setAttribute('aria-expanded', 'false');
        });
    }

    function setEditOpen(id, open) {
        var editor = document.getElementById('webhooks-edit-' + id);
        if (!editor) {
            return;
        }
        editor.hidden = !open;
        var item = editor.closest('.webhooks-item');
        if (item) {
            item.classList.toggle('is-editing', open);
        }
        if (open) {
            var firstInput = editor.querySelector('input[name="webhook_url"]');
            if (firstInput) {
                firstInput.focus();
            }
        }
    }

    document.addEventListener('click', function (event) {
        var toggle = event.target.closest('[data-webhook-menu-toggle]');
        if (toggle) {
            event.preventDefault();
            var toggleId = toggle.getAttribute('data-webhook-menu-toggle');
            var menu = document.getElementById('webhooks-actions-menu-' + toggleId);
            if (!menu) {
                return;
            }
            var willOpen = menu.hidden;
            closeAllMenus(willOpen ? toggleId : null);
            menu.hidden = !willOpen;
            toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            return;
        }

        var editBtn = event.target.closest('[data-webhook-edit]');
        if (editBtn) {
            event.preventDefault();
            closeAllMenus();
            setEditOpen(editBtn.getAttribute('data-webhook-edit'), true);
            return;
        }

        var cancelBtn = event.target.closest('[data-webhook-edit-cancel]');
        if (cancelBtn) {
            event.preventDefault();
            setEditOpen(cancelBtn.getAttribute('data-webhook-edit-cancel'), false);
            return;
        }

        var deleteBtn = event.target.closest('[data-webhook-delete-confirm]');
        if (deleteBtn) {
            // Always stop the submit: modalAlert.confirm() is asynchronous, so
            // the form is re-submitted from the promise once confirmed.
            event.preventDefault();
            var message = deleteBtn.getAttribute('data-webhook-delete-confirm');
            var title = deleteBtn.getAttribute('data-webhook-delete-title') || '';
            var confirmLabel = deleteBtn.getAttribute('data-webhook-delete-label') || '';
            var form = deleteBtn.form;
            // Dismiss the row menu first: it would otherwise stay open behind
            // the modal overlay.
            closeAllMenus();

            var answer;
            if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
                answer = window.modalAlert.confirm(message, title, {
                    alertType: 'warning',
                    confirmText: confirmLabel,
                    confirmButtonClass: 'danger'
                });
            } else {
                answer = Promise.resolve(window.confirm(message));
            }

            answer.then(function (confirmed) {
                if (!confirmed || !form) {
                    return;
                }
                // The action lives on the button, which a scripted submit()
                // would drop: send it as an explicit field instead.
                var hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'action';
                hidden.value = 'delete';
                form.appendChild(hidden);
                form.submit();
            });
            return;
        }

        // A click anywhere else, including inside the row, dismisses the menu.
        if (!event.target.closest('.webhooks-actions-menu')) {
            closeAllMenus();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeAllMenus();
        }
    });
})();
