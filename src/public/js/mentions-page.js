/**
 * Mentions page (mentions.php, discussion #1621): the check button of a row
 * tells the server the person has dealt with that note, the arrow of a
 * handled row takes it back. The list itself is rendered by the page.
 */
(function () {
    'use strict';

    var body = document.body;
    var content = document.getElementById('mentionsContent');
    var emptyMessage = document.getElementById('mentionsEmpty');
    if (!content) return;

    var showHandled = body.getAttribute('data-show-handled') === '1';
    var txtError = body.getAttribute('data-txt-error') || 'Error';
    var txtMarkHandled = body.getAttribute('data-txt-mark-handled') || '';
    var txtReopen = body.getAttribute('data-txt-reopen') || '';

    // The rail entry carries the number of notes still waiting
    function updateRailCount(open) {
        var badge = document.querySelector('#iconSidebarMentionsBtn .mention-badge');
        if (!badge) return;
        badge.textContent = open > 99 ? '99+' : String(open);
        badge.hidden = open <= 0;
    }

    function setRowState(item, handled) {
        var button = item.querySelector('.mentions-handled-btn');
        var icon = button ? button.querySelector('i') : null;
        item.setAttribute('data-handled', handled ? '1' : '0');
        item.classList.toggle('handled', handled);
        if (button) {
            button.title = handled ? txtReopen : txtMarkHandled;
            button.setAttribute('aria-label', button.title);
        }
        if (icon) {
            icon.classList.toggle('lucide-check', !handled);
            icon.classList.toggle('lucide-rotate-ccw', handled);
        }
    }

    // Without "Show handled" a handled row leaves the list, and its card with
    // it once it is empty
    function removeRow(item) {
        var group = item.closest('.mentions-group');
        item.remove();
        if (group && !group.querySelector('.mentions-item')) {
            group.remove();
        }
        if (emptyMessage && !content.querySelector('.mentions-item')) {
            emptyMessage.classList.remove('initially-hidden');
        }
    }

    content.addEventListener('click', function (e) {
        var button = e.target.closest ? e.target.closest('.mentions-handled-btn') : null;
        if (!button || button.disabled) return;
        var item = button.closest('.mentions-item');
        if (!item) return;

        var handled = item.getAttribute('data-handled') !== '1';
        button.disabled = true;

        fetch('api/v1/mentions/' + encodeURIComponent(item.getAttribute('data-owner-id')) + '/' + encodeURIComponent(item.getAttribute('data-note-id')) + '/handled', {
            method: handled ? 'POST' : 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return window.readApiJson ? window.readApiJson(response) : response.json(); })
            .then(function (data) {
                if (!data || !data.success) {
                    throw new Error((data && data.error) || txtError);
                }
                if (handled && !showHandled) {
                    removeRow(item);
                } else {
                    setRowState(item, handled);
                }
                updateRailCount(Number(data.open) || 0);
            })
            .catch(function (error) {
                window.alert(window.apiErrorMessage ? window.apiErrorMessage(error, txtError) : (error && error.message) || txtError);
            })
            .then(function () {
                button.disabled = false;
            });
    });
})();
