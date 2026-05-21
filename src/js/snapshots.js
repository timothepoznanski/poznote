/**
 * Snapshot system for Poznote
 * Creates daily snapshots of note content and allows viewing/restoring them.
 */

(function () {
    'use strict';

    var pendingSnapshotCreates = Object.create(null);

    function tr(key, fallback, vars) {
        if (typeof window.t === 'function') {
            return window.t(key, vars || null, fallback);
        }
        return fallback;
    }

    function getSnapshotUrl(noteId, query) {
        var url = '/api/v1/notes/' + noteId + '/snapshot';
        if (query) {
            url += '?' + query;
        }
        return url;
    }

    function getSnapshotsListUrl(noteId) {
        return '/api/v1/notes/' + noteId + '/snapshots';
    }

    function isSnapshotAccessBlocked() {
        if (document.body && document.body.classList.contains('public-workspace-readonly')) {
            return true;
        }

        if (typeof window.isPublicWorkspaceNavigationActive === 'function') {
            return window.isPublicWorkspaceNavigationActive();
        }

        return typeof window.isPublicWorkspaceAccess !== 'undefined' && window.isPublicWorkspaceAccess;
    }

    function isDarkThemeActive() {
        if (typeof window.getCurrentTheme === 'function') {
            return window.getCurrentTheme() === 'dark';
        }

        return document.documentElement.getAttribute('data-theme') === 'dark' ||
            document.body.classList.contains('dark-mode') ||
            document.documentElement.classList.contains('theme-dark');
    }

    function syncSnapshotModalTheme(modal) {
        if (!modal) return;

        modal.classList.toggle('snapshot-modal-dark', isDarkThemeActive());
    }

    function normalizeSnapshotPreviewTheme(contentEl) {
        if (!contentEl) return;

        var isDark = isDarkThemeActive();
        contentEl.classList.toggle('snapshot-content-preview-dark', isDark);

        if (!isDark) {
            contentEl.style.removeProperty('background');
            contentEl.style.removeProperty('background-color');
            contentEl.style.removeProperty('border-color');
            contentEl.style.removeProperty('color');
            return;
        }

        contentEl.style.setProperty('background', '#11161d', 'important');
        contentEl.style.setProperty('border-color', 'rgba(255, 255, 255, 0.14)', 'important');
        contentEl.style.setProperty('color', '#e6edf3', 'important');

        contentEl.querySelectorAll('[style]').forEach(function (element) {
            var tagName = element.tagName ? element.tagName.toLowerCase() : '';
            if (tagName === 'img' || tagName === 'svg' || tagName === 'canvas' || tagName === 'video') return;

            element.style.setProperty('background', 'transparent', 'important');
            element.style.setProperty('background-color', 'transparent', 'important');
            element.style.setProperty('color', 'inherit', 'important');
        });
    }

    function getSnapshotMarkdownPreviewButton() {
        return document.getElementById('snapshotMarkdownPreviewToggle');
    }

    function setSnapshotMarkdownPreviewButtonVisible(visible) {
        var button = getSnapshotMarkdownPreviewButton();
        if (!button) return;

        button.hidden = !visible;
    }

    function updateSnapshotMarkdownPreviewButton(isPreview) {
        var button = getSnapshotMarkdownPreviewButton();
        if (!button) return;

        var previewLabel = button.getAttribute('data-preview-label') || tr('snapshot.modal.markdown_preview', 'Preview');
        var sourceLabel = button.getAttribute('data-source-label') || tr('snapshot.modal.markdown_source', 'Source');
        var label = isPreview ? sourceLabel : previewLabel;
        var icon = isPreview ? 'lucide-file-code' : 'lucide-eye';

        button.setAttribute('aria-pressed', isPreview ? 'true' : 'false');
        button.innerHTML = '<i class="lucide ' + icon + '"></i><span>' + escapeHtml(label) + '</span>';
    }

    function renderMarkdownSnapshot(contentEl, content, noteId, mode) {
        var isPreview = mode === 'preview';

        contentEl.classList.toggle('markdown-preview', isPreview);
        contentEl.classList.toggle('snapshot-markdown-source', !isPreview);
        updateSnapshotMarkdownPreviewButton(isPreview);

        if (isPreview) {
            contentEl.style.whiteSpace = '';
            contentEl.style.fontFamily = '';

            if (typeof window.renderMarkdownPreview === 'function') {
                window.renderMarkdownPreview(contentEl, content || '', noteId, {
                    placeholder: contentEl.getAttribute('data-empty-text') || '',
                    delay: 0
                });
                return;
            }

            if (typeof window.parseMarkdown === 'function') {
                contentEl.innerHTML = content && content.trim() !== ''
                    ? window.parseMarkdown(content)
                    : '<div class="markdown-preview-placeholder">' + escapeHtml(contentEl.getAttribute('data-empty-text') || '') + '</div>';
                return;
            }
        }

        contentEl.textContent = content || '';
        contentEl.style.whiteSpace = 'pre-wrap';
        contentEl.style.fontFamily = 'monospace';
    }

    function renderSnapshotContent(contentEl, snapshot, noteId) {
        var modal = document.getElementById('snapshotModal');
        var content = snapshot.content || '';

        contentEl.classList.remove('markdown-preview', 'snapshot-markdown-source');

        if (snapshot.type === 'markdown') {
            setSnapshotMarkdownPreviewButtonVisible(true);
            var mode = modal && modal.dataset.snapshotMarkdownMode === 'source' ? 'source' : 'preview';
            renderMarkdownSnapshot(contentEl, content, noteId, mode);
        } else if (snapshot.type === 'tasklist') {
            setSnapshotMarkdownPreviewButtonVisible(false);
            if (modal) modal.dataset.snapshotMarkdownMode = 'source';

            try {
                var tasks = JSON.parse(content);
                var html = '';
                if (Array.isArray(tasks)) {
                    tasks.forEach(function (task) {
                        var checked = task.completed || task.checked || task.done ? '☑' : '☐';
                        var text = task.text || task.content || '';
                        html += '<div style="margin: 4px 0;">' + checked + ' ' + escapeHtml(text) + '</div>';
                    });
                }
                contentEl.innerHTML = html || escapeHtml(content);
            } catch (e) {
                contentEl.textContent = content;
            }
            contentEl.style.whiteSpace = '';
            contentEl.style.fontFamily = '';
        } else {
            setSnapshotMarkdownPreviewButtonVisible(false);
            if (modal) modal.dataset.snapshotMarkdownMode = 'source';

            contentEl.innerHTML = content;
            contentEl.style.whiteSpace = '';
            contentEl.style.fontFamily = '';
        }

        normalizeSnapshotPreviewTheme(contentEl);
    }

    function getAvailableSnapshots(snapshots) {
        if (!Array.isArray(snapshots)) return [];

        return snapshots.filter(function (snap) {
            return snap && (snap.snapshot_key || snap.date) && snap.exists !== false && snap.available !== false && snap.has_snapshot !== false;
        });
    }

    function rememberPendingSnapshotCreate(noteId, promise) {
        var key = String(noteId);
        pendingSnapshotCreates[key] = promise;

        promise.finally(function () {
            if (pendingSnapshotCreates[key] === promise) {
                delete pendingSnapshotCreates[key];
            }
        });

        return promise;
    }

    function waitForPendingSnapshotCreate(noteId) {
        var pending = pendingSnapshotCreates[String(noteId)];
        return pending ? pending.catch(function () { return null; }) : Promise.resolve();
    }

    function requestSnapshotCreate(noteId, manual) {
        return fetch(getSnapshotUrl(noteId, manual ? 'manual=1' : ''), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return {
                    success: response.ok,
                    error: response.ok ? null : tr('snapshot.errors.create_failed', 'Failed to take snapshot')
                };
            });
        });
    }

    /**
     * Create a snapshot for the given note ID (called on note load).
     * Only creates one snapshot per note per day.
     */
    window.createNoteSnapshot = function (noteId) {
        if (isSnapshotAccessBlocked() || !noteId || noteId === -1 || noteId === 'search') return;

        rememberPendingSnapshotCreate(noteId, requestSnapshotCreate(noteId, false)).catch(function () {
            // Silently ignore - snapshots are best-effort
        });
    };

    /**
     * Show the snapshot modal for the current note.
     * Loads the list of available snapshots and selects the most recent one.
     */
    window.showSnapshotModal = function (noteId) {
        if (isSnapshotAccessBlocked()) return;

        if (!noteId) {
            noteId = window.noteid;
        }
        if (!noteId || noteId === -1 || noteId === 'search') return;

        var modal = document.getElementById('snapshotModal');
        var loadingEl = document.getElementById('snapshotLoading');
        var noSnapshotEl = document.getElementById('snapshotNoData');
        var snapshotBodyEl = document.getElementById('snapshotBody');
        var dateListEl = document.getElementById('snapshotDateList');

        if (!modal) return;

        syncSnapshotModalTheme(modal);

        // Store current note id for restore
        modal.dataset.noteId = noteId;
        modal.dataset.selectedDate = '';
        modal.dataset.selectedSnapshotKey = '';
        modal.dataset.snapshotMarkdownMode = 'preview';
        setSnapshotMarkdownPreviewButtonVisible(false);

        // Show modal with loading state
        modal.style.display = 'flex';
        if (loadingEl) loadingEl.style.display = 'flex';
        if (noSnapshotEl) noSnapshotEl.style.display = 'none';
        if (snapshotBodyEl) snapshotBodyEl.style.display = 'none';
        if (dateListEl) dateListEl.style.display = 'none';

        waitForPendingSnapshotCreate(noteId)
        .then(function () {
            return fetch(getSnapshotsListUrl(noteId), {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (loadingEl) loadingEl.style.display = 'none';

            var snapshots = getAvailableSnapshots(data.snapshots);

            if (!data.success || snapshots.length === 0) {
                if (noSnapshotEl) noSnapshotEl.style.display = 'flex';
                if (dateListEl) dateListEl.style.display = 'none';
                return;
            }

            // Render date list
            if (dateListEl) dateListEl.style.display = 'flex';
            renderSnapshotDates(snapshots, noteId);

            // Load the most recent snapshot
            loadSnapshot(noteId, snapshots[0].snapshot_key || snapshots[0].date, snapshots[0].date);
        })
        .catch(function () {
            if (loadingEl) loadingEl.style.display = 'none';
            if (noSnapshotEl) noSnapshotEl.style.display = 'flex';
        });
    };

    /**
     * Render the list of available snapshot dates in the sidebar.
     */
    function renderSnapshotDates(snapshots, noteId) {
        var container = document.getElementById('snapshotDates');
        if (!container) return;

        container.innerHTML = '';
        var today = new Date().toISOString().slice(0, 10);

        snapshots.forEach(function (snap) {
            var snapshotKey = snap.snapshot_key || snap.key || snap.date;
            var btn = document.createElement('button');
            btn.className = 'snapshot-date-btn';
            btn.dataset.snapshotKey = snapshotKey;
            btn.dataset.date = snap.date;
            btn.type = 'button';

            var primaryLabel = snap.date;
            if (snap.date === today) {
                primaryLabel = tr('snapshot.modal.today', 'Today');
            } else {
                // Format as readable date (e.g. "Apr 17")
                try {
                    var d = new Date(snap.date + 'T00:00:00');
                    primaryLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                } catch (e) {
                    primaryLabel = snap.date;
                }
            }

            var secondaryLabel = '';
            if (snap.created_at) {
                var createdParts = String(snap.created_at).trim().split(' ');
                secondaryLabel = createdParts[createdParts.length - 1] || '';
            }

            btn.innerHTML = '<i class="lucide lucide-calendar"></i>' +
                '<span class="snapshot-date-labels">' +
                    '<span class="snapshot-date-primary">' + escapeHtml(primaryLabel) + '</span>' +
                    (secondaryLabel ? '<span class="snapshot-date-secondary">' + escapeHtml(secondaryLabel) + '</span>' : '') +
                '</span>';

            btn.addEventListener('click', function () {
                loadSnapshot(noteId, snapshotKey, snap.date);
            });

            container.appendChild(btn);
        });
    }

    /**
     * Load and display the snapshot for a specific date.
     */
    function loadSnapshot(noteId, snapshotKey, date) {
        var modal = document.getElementById('snapshotModal');
        var contentEl = document.getElementById('snapshotContent');
        var loadingEl = document.getElementById('snapshotLoading');
        var noSnapshotEl = document.getElementById('snapshotNoData');
        var snapshotBodyEl = document.getElementById('snapshotBody');
        var snapshotDateEl = document.getElementById('snapshotDate');
        var snapshotHeadingEl = document.getElementById('snapshotHeading');

        if (!modal || !contentEl) return;

        syncSnapshotModalTheme(modal);

        snapshotKey = snapshotKey || date || '';
        modal.dataset.selectedDate = date;
        modal.dataset.selectedSnapshotKey = snapshotKey;

        // Highlight selected date in the list
        var allBtns = document.querySelectorAll('#snapshotDates .snapshot-date-btn');
        allBtns.forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.snapshotKey === snapshotKey);
        });

        // Show loading
        if (loadingEl) loadingEl.style.display = 'flex';
        if (snapshotBodyEl) snapshotBodyEl.style.display = 'none';

        var query = snapshotKey
            ? 'snapshot_key=' + encodeURIComponent(snapshotKey)
            : 'date=' + encodeURIComponent(date);

        fetch(getSnapshotUrl(noteId, query), {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (loadingEl) loadingEl.style.display = 'none';

            if (!data.success || !data.snapshot) {
                if (noSnapshotEl) noSnapshotEl.style.display = 'flex';
                return;
            }

            if (noSnapshotEl) noSnapshotEl.style.display = 'none';
            if (snapshotBodyEl) snapshotBodyEl.style.display = 'flex';

            var snapshot = data.snapshot;

            if (snapshot.snapshot_key) {
                modal.dataset.selectedSnapshotKey = snapshot.snapshot_key;
            }
            if (snapshot.date) {
                modal.dataset.selectedDate = snapshot.date;
            }

            if (snapshotDateEl) {
                snapshotDateEl.textContent = snapshot.date + (snapshot.created_at ? ' (' + snapshot.created_at + ')' : '');
            }
            if (snapshotHeadingEl) {
                snapshotHeadingEl.textContent = snapshot.heading || '';
            }

            renderSnapshotContent(contentEl, snapshot, noteId);

            // Store raw content for copy
            modal.dataset.snapshotContent = snapshot.content || '';
            modal.dataset.snapshotType = snapshot.type || 'note';
        })
        .catch(function () {
            if (loadingEl) loadingEl.style.display = 'none';
            if (noSnapshotEl) noSnapshotEl.style.display = 'flex';
        });
    }

    window.toggleSnapshotMarkdownPreview = function () {
        var modal = document.getElementById('snapshotModal');
        var contentEl = document.getElementById('snapshotContent');
        if (!modal || !contentEl || modal.dataset.snapshotType !== 'markdown') return;

        modal.dataset.snapshotMarkdownMode = modal.dataset.snapshotMarkdownMode === 'preview' ? 'source' : 'preview';
        renderSnapshotContent(contentEl, {
            type: 'markdown',
            content: modal.dataset.snapshotContent || ''
        }, modal.dataset.noteId || window.noteid);
    };

    /**
     * Copy snapshot content to clipboard
     */
    window.copySnapshotContent = function () {
        var modal = document.getElementById('snapshotModal');
        if (!modal) return;

        var content = modal.dataset.snapshotContent || '';
        var type = modal.dataset.snapshotType || 'note';

        // For HTML notes, try to get text content
        var textContent = content;
        if (type === 'note' || type === 'tasklist') {
            var temp = document.createElement('div');
            temp.innerHTML = content;
            textContent = temp.textContent || temp.innerText || content;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textContent).then(function () {
                showSnapshotToast(tr('snapshot.messages.content_copied', 'Content copied'));
            }).catch(function () {
                fallbackCopy(textContent);
            });
        } else {
            fallbackCopy(textContent);
        }
    };

    /**
     * Create an additional snapshot immediately.
     */
    window.takeSnapshotNow = function () {
        if (isSnapshotAccessBlocked()) return;

        var modal = document.getElementById('snapshotModal');
        var noteId = modal && modal.dataset.noteId ? modal.dataset.noteId : window.noteid;
        var buttons = document.querySelectorAll('#snapshotModal .snapshot-take-btn');

        if (!noteId || noteId === -1 || noteId === 'search') return;

        var executeTakeSnapshot = function () {
            buttons.forEach(function (button) {
                button.disabled = true;
            });

            rememberPendingSnapshotCreate(noteId, requestSnapshotCreate(noteId, true))
            .then(function (data) {
                if (!data.success) {
                    showSnapshotError(data.error || tr('snapshot.errors.create_failed', 'Failed to take snapshot'));
                    return;
                }

                showSnapshotToast(tr('snapshot.messages.created_now', 'Snapshot added'));
                showSnapshotModal(noteId);
            })
            .catch(function () {
                showSnapshotError(tr('snapshot.errors.create_failed', 'Failed to take snapshot'));
            })
            .finally(function () {
                buttons.forEach(function (button) {
                    button.disabled = false;
                });
            });
        };

        if (typeof window.modalAlert !== 'undefined' && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(
                tr('snapshot.confirm.take_now_message', 'Create an additional snapshot with the current note content? Existing snapshots for today will be kept.'),
                tr('snapshot.confirm.title', 'Confirmation'),
                {
                    modalClass: 'snapshot-restore-confirm',
                    confirmButtonClass: 'snapshot-restore-confirm-button',
                    confirmText: tr('snapshot.confirm.take_now_button', 'Take snapshot now')
                }
            ).then(function (confirmed) {
                if (confirmed) {
                    executeTakeSnapshot();
                }
            });
        } else if (confirm(tr('snapshot.confirm.take_now_message', 'Create an additional snapshot with the current note content? Existing snapshots for today will be kept.'))) {
            executeTakeSnapshot();
        }
    };

    /**
     * Restore note to snapshot state
     */
    window.restoreSnapshot = function () {
        if (isSnapshotAccessBlocked()) return;

        var modal = document.getElementById('snapshotModal');
        if (!modal) return;

        var noteId = modal.dataset.noteId;
        if (!noteId) return;

        var selectedSnapshotKey = modal.dataset.selectedSnapshotKey || '';
        var selectedDate = modal.dataset.selectedDate || '';
        var restoreQuery = selectedSnapshotKey
            ? '?snapshot_key=' + encodeURIComponent(selectedSnapshotKey)
            : selectedDate
                ? '?date=' + encodeURIComponent(selectedDate)
                : '';

        var confirmRestore = function () {
            fetch('/api/v1/notes/' + noteId + '/snapshot/restore' + restoreQuery, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success) {
                    closeSnapshotModal();
                    // Reload the page to show restored content
                    window.location.reload();
                } else {
                    showSnapshotError(data.error || tr('snapshot.errors.restore_failed', 'Failed to restore snapshot'));
                }
            })
            .catch(function () {
                showSnapshotError(tr('snapshot.errors.restore_failed', 'Failed to restore snapshot'));
            });
        };

        // Use modal alert if available, otherwise use confirm
        if (typeof window.modalAlert !== 'undefined' && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(
                tr('snapshot.confirm.restore_message', 'Restore the note to the snapshot state? Current changes will be lost.'),
                tr('snapshot.confirm.title', 'Confirmation'),
                {
                    modalClass: 'snapshot-restore-confirm',
                    confirmButtonClass: 'snapshot-restore-confirm-button',
                    confirmText: tr('snapshot.confirm.restore_button', 'Restore this state')
                }
            ).then(function (confirmed) {
                if (confirmed) {
                    confirmRestore();
                }
            });
        } else if (confirm(tr('snapshot.confirm.restore_message', 'Restore the note to the snapshot state? Current changes will be lost.'))) {
            confirmRestore();
        }
    };

    /**
     * Close the snapshot modal
     */
    window.closeSnapshotModal = function () {
        var modal = document.getElementById('snapshotModal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    function fallbackCopy(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showSnapshotToast(tr('snapshot.messages.content_copied', 'Content copied'));
        } catch (e) {
            showSnapshotError(tr('snapshot.errors.copy_failed', 'Copy failed'));
        }
        document.body.removeChild(textarea);
    }

    function ensureSnapshotToastContainer() {
        var id = 'snapshot-toast-container';
        var container = document.getElementById(id);
        if (container) return container;

        container = document.createElement('div');
        container.id = id;
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        container.style.position = 'fixed';
        container.style.top = '16px';
        container.style.right = '16px';
        container.style.zIndex = '2147483647';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
        return container;
    }

    function showSnapshotToast(message, duration) {
        try {
            duration = duration || 1800;

            var container = ensureSnapshotToastContainer();
            var toast = document.createElement('div');
            toast.className = 'snapshot-toast-message';
            toast.style.pointerEvents = 'auto';
            toast.style.background = '#007DB8';
            toast.style.color = '#ffffff';
            toast.style.padding = '10px 16px';
            toast.style.marginTop = '8px';
            toast.style.borderRadius = '10px';
            toast.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.18)';
            toast.style.fontSize = '14px';
            toast.style.fontWeight = '600';
            toast.style.maxWidth = '280px';
            toast.style.wordBreak = 'break-word';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-6px)';
            toast.style.transition = 'opacity 160ms ease-in-out, transform 160ms ease-in-out';
            toast.textContent = message;
            container.appendChild(toast);

            toast.offsetHeight;
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';

            setTimeout(function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(function () {
                    try {
                        container.removeChild(toast);
                    } catch (e) {}
                }, 220);
            }, duration);
        } catch (e) {}
    }

    function showSnapshotError(message) {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(message, 'error');
            return;
        }

        try {
            window.alert(message);
        } catch (e) {}
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Close modal on backdrop click
    document.addEventListener('click', function (e) {
        var modal = document.getElementById('snapshotModal');
        if (modal && e.target === modal) {
            closeSnapshotModal();
        }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var modal = document.getElementById('snapshotModal');
            if (modal && modal.style.display !== 'none') {
                closeSnapshotModal();
            }
        }
    });

})();
