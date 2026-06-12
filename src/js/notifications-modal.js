(function () {
    var POLL_INTERVAL = 45000;
    var labels = window.NOTIFICATIONS_TXT || {};

    function parseReminderDate(value) {
        if (!value) return null;

        var trimmedValue = String(value).trim();
        if (!trimmedValue) return null;

        var normalizedValue = trimmedValue;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmedValue)) {
            normalizedValue = trimmedValue.replace(' ', 'T') + 'Z';
        } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmedValue)) {
            normalizedValue = trimmedValue.replace(' ', 'T') + ':00Z';
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?$/.test(trimmedValue)) {
            normalizedValue = trimmedValue + 'Z';
        }

        var parsedDate = new Date(normalizedValue);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    function loadNotifications() {
        fetch('/api/v1/reminders', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                renderNotifications(data.notifications || []);
                updateCount(data.total_count || 0, data.unread_count || 0);
            }
        })
        .catch(function (error) {
            console.error('Load notifications error:', error);
        });
    }

    function renderNotifications(notifications) {
        var list = document.getElementById('notificationsList');
        var empty = document.getElementById('notificationsEmpty');
        var dismissAllBtn = document.getElementById('dismissAllBtn');
        if (!list) return;

        if (!notifications.length) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            if (dismissAllBtn) dismissAllBtn.classList.add('initially-hidden');
            return;
        }

        if (empty) empty.style.display = 'none';
        if (dismissAllBtn) dismissAllBtn.classList.remove('initially-hidden');

        list.innerHTML = notifications.map(function (notification) {
            var triggerDate = parseReminderDate(notification.trigger_at);
            var timeAgo = triggerDate ? getTimeAgo(triggerDate) : escapeHtml(notification.trigger_at || '');
            var isUnread = Number(notification.is_read) !== 1;
            var heading = escapeHtml(notification.note_heading || notification.message || 'Note');
            var notificationId = escapeHtml(notification.id || '');
            var noteId = escapeHtml(notification.note_id || '');

            return '<div class="notification-item' + (isUnread ? ' unread' : '') + '" data-notification-id="' + notificationId + '" data-note-id="' + noteId + '">'
                + '<div class="notification-content">'
                + '<div class="notification-icon"><i class="lucide lucide-bell"></i></div>'
                + '<div class="notification-text">'
                + '<div class="notification-heading">' + heading + '</div>'
                + '<div class="notification-time">' + timeAgo + '</div>'
                + '</div>'
                + '</div>'
                + '<div class="notification-actions">'
                + '<button type="button" class="notification-action-btn" data-action="dismiss-notification" data-notification-id="' + notificationId + '" title="' + escapeHtml(labels.dismiss || 'Dismiss') + '">'
                + '<i class="lucide lucide-x"></i>'
                + '</button>'
                + '</div>'
                + '</div>';
        }).join('');
    }

    function getTimeAgo(date) {
        var now = new Date();
        var diffMs = now - date;
        var diffMin = Math.floor(diffMs / 60000);
        var diffHour = Math.floor(diffMs / 3600000);
        var diffDay = Math.floor(diffMs / 86400000);
        if (diffMin < 1) return labels.justNow || 'Just now';
        if (diffMin < 60) return diffMin + ' min';
        if (diffHour < 24) return diffHour + 'h';
        if (diffDay < 7) return diffDay + 'd';
        return date.toLocaleDateString();
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function updateCount(totalCount, unreadCount) {
        var countEl = document.getElementById('homeNotificationsCount');
        if (countEl) countEl.textContent = totalCount;

        var dashboardCountEl = document.getElementById('dashboardNotificationsCount');
        if (dashboardCountEl) dashboardCountEl.textContent = totalCount;

        var triggers = document.querySelectorAll('[data-action="open-notifications-modal"]');
        triggers.forEach(function (trigger) {
            var shouldHighlight = trigger.id === 'dashboardNotificationsBtn' ? totalCount > 0 : unreadCount > 0;
            trigger.classList.toggle('has-notifications', shouldHighlight);
        });
    }

    function pollCount() {
        fetch('/api/v1/reminders/count', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) updateCount(data.total_count || 0, data.unread_count || 0);
        })
        .catch(function () {});
    }

    function openNotificationsModal() {
        var modal = document.getElementById('notificationsModal');
        if (!modal) return;
        modal.style.display = 'flex';
        loadNotifications();
    }

    function closeNotificationsModal() {
        var modal = document.getElementById('notificationsModal');
        if (modal) modal.style.display = 'none';
    }

    function dismissNotification(id) {
        fetch('/api/v1/reminders/' + encodeURIComponent(id) + '/dismiss', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) loadNotifications();
        })
        .catch(function (error) {
            console.error('Dismiss error:', error);
        });
    }

    function dismissAllNotifications() {
        fetch('/api/v1/reminders/dismiss-all', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (!data.success) return;
            closeNotificationsModal();
            if (typeof window.goBackToNotes === 'function') {
                window.goBackToNotes();
                return;
            }
            window.location.href = buildIndexUrl();
        })
        .catch(function (error) {
            console.error('Dismiss all error:', error);
        });
    }

    function openNotificationNote(noteId, notificationId) {
        if (!noteId) return;

        if (notificationId) {
            fetch('/api/v1/reminders/' + encodeURIComponent(notificationId) + '/read', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            }).catch(function () {});
        }

        var workspace = document.body ? document.body.getAttribute('data-workspace') || '' : '';
        if (typeof window.buildUrl === 'function') {
            window.location.href = window.buildUrl('index.php', { note: noteId, workspace: workspace });
            return;
        }

        window.location.href = buildIndexUrl(noteId, workspace);
    }

    function buildIndexUrl(noteId, workspace) {
        var params = [];
        if (noteId) params.push('note=' + encodeURIComponent(noteId));
        if (workspace) params.push('workspace=' + encodeURIComponent(workspace));
        return 'index.php' + (params.length ? '?' + params.join('&') : '');
    }

    document.addEventListener('click', function (event) {
        var modal = document.getElementById('notificationsModal');
        if (event.target === modal) {
            closeNotificationsModal();
            return;
        }

        var actionElement = event.target.closest('[data-action]');
        var action = actionElement ? actionElement.getAttribute('data-action') : '';
        switch (action) {
            case 'open-notifications-modal':
                event.preventDefault();
                openNotificationsModal();
                break;
            case 'close-notifications-modal':
                closeNotificationsModal();
                break;
            case 'dismiss-notification':
                if (actionElement.dataset.notificationId) {
                    event.stopPropagation();
                    dismissNotification(actionElement.dataset.notificationId);
                }
                break;
            case 'dismiss-all-notifications':
                dismissAllNotifications();
                break;
        }

        var notificationItem = event.target.closest('.notification-item');
        if (notificationItem && !event.target.closest('.notification-action-btn')) {
            openNotificationNote(notificationItem.dataset.noteId, notificationItem.dataset.notificationId);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeNotificationsModal();
    });

    if (document.getElementById('notificationsModal')) {
        pollCount();
        setInterval(pollCount, POLL_INTERVAL);
    }
})();
