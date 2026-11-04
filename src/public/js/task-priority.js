// Task priority (#1730): high, medium or low on a task of a task list note,
// none by default.
//
// Stored as task.priority. task.important mirrors "high", so what only knows
// the old star (exports, API clients, a page still cached in a tab) keeps
// working, and a task starred before priorities existed reads as high.
// Mirrored server side by getTasklistTaskPriority() in lib/tasklists.php.
//
// Open tasks are kept in priority order: high, medium, low, none, then the
// completed ones; sort() is stable, so a drag-and-drop arrangement inside a
// level survives.
(function () {
    'use strict';

    var LEVELS = ['high', 'medium', 'low'];

    function normalize(value) {
        if (typeof value !== 'string') return null;
        var p = value.trim().toLowerCase();
        return LEVELS.indexOf(p) !== -1 ? p : null;
    }

    function get(task) {
        if (!task || typeof task !== 'object') return null;
        var p = normalize(task.priority);
        if (p) return p;
        return task.important ? 'high' : null;
    }

    // Sets the priority in place (null or 'none' clears it) and returns the task
    function set(task, priority) {
        if (!task || typeof task !== 'object') return task;
        var p = normalize(priority);
        if (p) task.priority = p;
        else delete task.priority;
        task.important = p === 'high';
        return task;
    }

    // 0 high, 1 medium, 2 low, 3 none
    function rank(task) {
        var p = get(task);
        return p ? LEVELS.indexOf(p) : LEVELS.length;
    }

    function sortKey(task) {
        return task && task.completed ? LEVELS.length + 1 : rank(task);
    }

    function sort(tasks) {
        if (!Array.isArray(tasks)) return [];
        return tasks
            .map(function (task, index) { return { task: task, index: index }; })
            .sort(function (a, b) { return (sortKey(a.task) - sortKey(b.task)) || (a.index - b.index); })
            .map(function (entry) { return entry.task; });
    }

    // Row classes: ' important' stays on high so older stylesheets and the
    // HTML recovery path (extractTasksFromHTML) still see it.
    function classNames(task, prefix) {
        var p = get(task);
        if (!p) return '';
        return (p === 'high' ? ' important' : '') + ' ' + (prefix || 'priority-') + p;
    }

    function tr(key, fallback) {
        return window.t ? window.t(key, null, fallback) : fallback;
    }

    function label(priority) {
        switch (normalize(priority)) {
            case 'high': return tr('tasklist.priority_high', 'High priority');
            case 'medium': return tr('tasklist.priority_medium', 'Medium priority');
            case 'low': return tr('tasklist.priority_low', 'Low priority');
            default: return tr('tasklist.priority_none', 'No priority');
        }
    }

    // Tooltip of the flag button
    function buttonTitle(task) {
        var p = get(task);
        return p ? label(p) : tr('tasklist.priority', 'Priority');
    }

    var closeOpenMenu = null;

    function closeMenu() {
        if (closeOpenMenu) closeOpenMenu();
    }

    // Small menu under the flag: High, Medium, Low, No priority. anchor is the
    // trigger element or a DOMRect; onPick receives 'high'|'medium'|'low'|null.
    function openMenu(anchor, current, onPick) {
        closeMenu();

        var rect = null;
        if (anchor && typeof anchor.getBoundingClientRect === 'function') rect = anchor.getBoundingClientRect();
        else if (anchor && typeof anchor.left === 'number') rect = anchor;

        var currentLevel = normalize(current);
        var menu = document.createElement('div');
        menu.className = 'task-priority-menu';
        menu.setAttribute('role', 'menu');

        LEVELS.concat([null]).forEach(function (level) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'task-priority-menu-item' + (level ? ' priority-' + level : ' priority-none')
                + (level === currentLevel ? ' is-current' : '');
            btn.setAttribute('role', 'menuitemradio');
            btn.setAttribute('aria-checked', level === currentLevel ? 'true' : 'false');
            var icon = document.createElement('i');
            icon.className = 'lucide lucide-flag';
            btn.appendChild(icon);
            var text = document.createElement('span');
            text.textContent = label(level);
            btn.appendChild(text);
            if (level === currentLevel) {
                var check = document.createElement('i');
                check.className = 'lucide lucide-check task-priority-menu-check';
                btn.appendChild(check);
            }
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                if (level !== currentLevel && typeof onPick === 'function') onPick(level);
            });
            menu.appendChild(btn);
        });

        function cleanup() {
            document.removeEventListener('mousedown', onOutside, true);
            document.removeEventListener('touchstart', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', cleanup);
            window.removeEventListener('scroll', onScroll, true);
            if (menu.parentNode) menu.parentNode.removeChild(menu);
            if (closeOpenMenu === cleanup) closeOpenMenu = null;
        }

        function onOutside(e) {
            if (!menu.contains(e.target)) cleanup();
        }

        function onScroll(e) {
            if (!menu.contains(e.target)) cleanup();
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var items = Array.prototype.slice.call(menu.querySelectorAll('.task-priority-menu-item'));
                var i = items.indexOf(document.activeElement);
                i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
                items[i].focus();
            }
        }

        document.body.appendChild(menu);

        var padding = 8;
        var menuRect = menu.getBoundingClientRect();
        var r = rect || { left: (window.innerWidth - menuRect.width) / 2, right: (window.innerWidth + menuRect.width) / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
        // Right-aligned on the trigger: the flag sits at the right end of a row
        var x = (typeof r.right === 'number' ? r.right : r.left) - menuRect.width;
        x = Math.max(padding, Math.min(x, window.innerWidth - menuRect.width - padding));
        var y = r.bottom + 6;
        if (y + menuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, r.top - menuRect.height - 6);
        }
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('touchstart', onOutside, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', cleanup);
        window.addEventListener('scroll', onScroll, true);
        closeOpenMenu = cleanup;

        var focusTarget = menu.querySelector('.is-current') || menu.querySelector('.task-priority-menu-item');
        if (focusTarget) {
            try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
        }
        return cleanup;
    }

    window.poznoteTaskPriority = {
        LEVELS: LEVELS.slice(),
        normalize: normalize,
        get: get,
        set: set,
        rank: rank,
        sort: sort,
        classNames: classNames,
        label: label,
        buttonTitle: buttonTitle,
        openMenu: openMenu,
        closeMenu: closeMenu
    };
})();
