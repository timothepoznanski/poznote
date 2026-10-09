// "What's new" popup (discussion 1446).
//
// After an update, shows once the release notes of every version installed
// since the user last looked. index.php sets <body data-whats-new="1"> when
// the user's last seen version is not the installed one; the server decides
// what to show (GET /api/v1/system/whats-new) and closing the popup records
// the installed version as seen.

(function () {
    'use strict';

    var RELEASES_URL = 'https://github.com/timothepoznanski/poznote/releases';
    var shownReleases = [];
    var markSeenOnClose = false;
    // End of the scroll started by a version button, see markCurrentVersion()
    var jumpingUntil = 0;

    function tr(key, vars, fallback) {
        return typeof window.t === 'function' ? window.t(key, vars, fallback) : fallback;
    }

    function getModal() {
        return document.getElementById('whatsNewModal');
    }

    function formatDate(isoDate) {
        var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
        if (!parts) return '';
        try {
            return new Date(+parts[1], +parts[2] - 1, +parts[3]).toLocaleDateString(document.documentElement.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            return isoDate;
        }
    }

    function render(data) {
        var body = document.getElementById('whatsNewBody');
        var subtitle = document.getElementById('whatsNewSubtitle');
        if (!body) return;

        if (subtitle) {
            subtitle.textContent = tr('whats_new.subtitle', { version: data.current_version }, 'Poznote was updated to version {{version}}.');
        }

        // Several versions: one button each, to jump from one to another
        var versions = document.getElementById('whatsNewVersions');
        if (versions) {
            versions.textContent = '';
            versions.hidden = data.releases.length < 2;
        }

        body.textContent = '';
        data.releases.forEach(function (release, index) {
            var section = document.createElement('section');
            section.className = 'whats-new-release';

            if (versions && data.releases.length > 1) {
                var jump = document.createElement('button');
                jump.type = 'button';
                jump.className = 'whats-new-version' + (index === 0 ? ' is-current' : '');
                jump.textContent = release.version;
                jump.addEventListener('click', function () {
                    // The version asked for is the current one, wherever the
                    // scroll ends (the last ones cannot reach the top)
                    setCurrentVersion(index);
                    jumpingUntil = Date.now() + 800;
                    body.scrollTo({ top: body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: 'smooth' });
                });
                versions.appendChild(jump);
            }

            var title = document.createElement('div');
            title.className = 'whats-new-release-title';
            var link = document.createElement('a');
            link.href = String(release.url || '').startsWith('https://github.com/') ? release.url : RELEASES_URL;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Poznote ' + release.version;
            title.appendChild(link);
            var date = formatDate(release.date);
            if (date) {
                var dateEl = document.createElement('span');
                dateEl.className = 'whats-new-release-date';
                dateEl.textContent = date;
                title.appendChild(dateEl);
            }
            section.appendChild(title);

            // Rendered by the server's Markdown parser, which escapes raw HTML
            var notes = document.createElement('div');
            notes.className = 'whats-new-notes';
            notes.innerHTML = release.html;
            section.appendChild(notes);

            body.appendChild(section);
        });

        if (data.more > 0) {
            var more = document.createElement('p');
            more.className = 'whats-new-more';
            var moreLink = document.createElement('a');
            moreLink.href = RELEASES_URL;
            moreLink.target = '_blank';
            moreLink.rel = 'noopener noreferrer';
            moreLink.textContent = tr('whats_new.more', { count: data.more }, 'Earlier releases not shown here: {{count}}. See all release notes');
            more.appendChild(moreLink);
            body.appendChild(more);
        }
        body.scrollTop = 0;
    }

    function setCurrentVersion(current) {
        var versions = document.getElementById('whatsNewVersions');
        if (!versions) return;
        for (var j = 0; j < versions.children.length; j++) {
            var button = versions.children[j];
            var isCurrent = j === current;
            if (button.classList.contains('is-current') === isCurrent) continue;
            button.classList.toggle('is-current', isCurrent);
            if (isCurrent && versions.scrollWidth > versions.clientWidth) {
                versions.scrollLeft = button.offsetLeft - versions.offsetLeft - versions.clientWidth / 2 + button.offsetWidth / 2;
            }
        }
    }

    // While scrolling by hand, the button of the version being read: the
    // last one whose notes start at the top of the list or above
    function markCurrentVersion() {
        var body = document.getElementById('whatsNewBody');
        var versions = document.getElementById('whatsNewVersions');
        if (!body || !versions || versions.hidden || Date.now() < jumpingUntil) return;
        var sections = body.querySelectorAll('.whats-new-release');
        var limit = body.getBoundingClientRect().top + 60;
        var current = 0;
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].getBoundingClientRect().top <= limit) current = i;
        }
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2) current = sections.length - 1;
        setCurrentVersion(current);
    }

    function open(data, markSeen) {
        var modal = getModal();
        if (!modal) return;
        shownReleases = data.releases;
        markSeenOnClose = markSeen;
        render(data);

        var never = document.getElementById('whatsNewNever');
        if (never) never.checked = false;
        var saveBtn = document.getElementById('whatsNewSaveNote');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = tr('whats_new.save_note', null, 'Save as note');
        }

        modal.style.display = 'flex';
        var closeBtn = document.getElementById('whatsNewClose');
        if (closeBtn) closeBtn.focus();
    }

    function putSetting(key, value) {
        return fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: value })
        });
    }

    function close() {
        var modal = getModal();
        if (!modal || modal.style.display === 'none' || !modal.style.display) return;
        modal.style.display = 'none';

        var never = document.getElementById('whatsNewNever');
        if (never && never.checked) {
            putSetting('whats_new_popup', '0').catch(function (e) {
                console.debug('whats-new: saving the setting failed:', e);
            });
        }
        if (markSeenOnClose) {
            markSeenOnClose = false;
            document.body.removeAttribute('data-whats-new');
            fetch('/api/v1/system/whats-new/seen', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            }).catch(function (e) {
                console.debug('whats-new: marking as seen failed:', e);
            });
        }
    }

    // "Read later": the notes shown become a Markdown note of the open workspace
    function saveAsNote() {
        var saveBtn = document.getElementById('whatsNewSaveNote');
        if (!shownReleases.length || (saveBtn && saveBtn.disabled)) return;
        if (saveBtn) saveBtn.disabled = true;

        var content = shownReleases.map(function (release) {
            return '# Poznote ' + release.version + '\n\n' + release.markdown;
        }).join('\n\n---\n\n');
        var workspace = typeof window.getSelectedWorkspace === 'function' ? (window.getSelectedWorkspace() || '') : '';
        if (!workspace) workspace = document.body.getAttribute('data-workspace') || '';

        var payload = {
            heading: tr('whats_new.note_title', { version: shownReleases[0].version }, "What's new in Poznote {{version}}"),
            content: content,
            type: 'markdown'
        };
        if (workspace) payload.workspace = workspace;

        fetch('/api/v1/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    if (!response.ok || !data || data.success === false) {
                        throw new Error((data && (data.error || data.message)) || ('HTTP Error: ' + response.status));
                    }
                    return data;
                });
            })
            .then(function () {
                if (saveBtn) saveBtn.textContent = tr('whats_new.saved', null, 'Saved in your notes');
                // This tab's own writes are not picked up by the live
                // refresh: reload the tree in place so the note shows up.
                if (typeof window.refreshNotesListAfterFolderAction === 'function') {
                    window.refreshNotesListAfterFolderAction();
                }
            })
            .catch(function (error) {
                if (saveBtn) saveBtn.disabled = false;
                if (typeof window.showNotificationPopup === 'function') {
                    window.showNotificationPopup(error.message, 'error');
                }
                console.error('whats-new: saving the note failed:', error);
            });
    }

    function load(force, since) {
        return fetch('/api/v1/system/whats-new' + (force ? '?force=1' + (since ? '&since=' + encodeURIComponent(since) : '') : ''), {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) {
                if (data && data.show && data.releases && data.releases.length) {
                    open(data, !force);
                    return true;
                }
                return false;
            });
    }

    function init() {
        var modal = getModal();
        if (!modal) return;

        var closeBtn = document.getElementById('whatsNewClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        var saveBtn = document.getElementById('whatsNewSaveNote');
        if (saveBtn) saveBtn.addEventListener('click', saveAsNote);
        var body = document.getElementById('whatsNewBody');
        if (body) body.addEventListener('scroll', markCurrentVersion, { passive: true });
        modal.addEventListener('mousedown', function (e) {
            if (e.target === modal) close();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                e.stopPropagation();
                close();
            }
        }, true);

        // Computer only: on a phone the popup would take the whole screen.
        // Nothing is recorded there, so it shows at the next visit from a
        // computer.
        if (window.matchMedia('(max-width: 800px)').matches) return;

        // Preview (data/whats_new_preview, see index.php): at every load
        if (document.body.getAttribute('data-whats-new') === 'preview') {
            load(true, document.body.getAttribute('data-whats-new-since') || '').catch(function (error) {
                console.debug('whats-new: loading failed:', error);
            });
            return;
        }

        if (document.body.getAttribute('data-whats-new') !== '1') return;

        // One request per tab: when there is nothing to show (GitHub out of
        // reach, notes not published yet), the next tab or session asks again.
        var checkedKey = 'poznote_whats_new_checked';
        try {
            if (sessionStorage.getItem(checkedKey) === '1') return;
            sessionStorage.setItem(checkedKey, '1');
        } catch (e) {
            console.debug('whats-new: sessionStorage unavailable:', e);
        }

        // Let the page settle first, the popup is not what the user came for
        setTimeout(function () {
            // Never on top of another dialog
            var openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display:flex"]');
            if (openModal) {
                try { sessionStorage.removeItem(checkedKey); } catch (e) { console.debug('whats-new: sessionStorage unavailable:', e); }
                return;
            }
            load(false).catch(function (error) {
                console.debug('whats-new: loading failed:', error);
            });
        }, 1200);
    }

    // The release notes of the installed version, whatever was already seen
    window.showWhatsNew = function (since) {
        return load(true, since);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
