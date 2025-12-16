// Toolbar Mode Handler
// Adds a class on <body> based on user preference (full/slash/both)

(function () {
    'use strict';

    function applyToolbarMode(mode) {
        const body = document.body;
        if (!body) return;

        body.classList.remove('toolbar-mode-full', 'toolbar-mode-slash', 'toolbar-mode-both');

        switch (mode) {
            case 'full':
                body.classList.add('toolbar-mode-full');
                break;
            case 'slash':
                body.classList.add('toolbar-mode-slash');
                break;
            case 'both':
            default:
                body.classList.add('toolbar-mode-both');
                break;
        }

        // If switching to toolbar-only, close any open slash menu
        try {
            if (mode === 'full' && typeof window.hideSlashMenu === 'function') {
                window.hideSlashMenu();
            }
        } catch (e) {}
    }

    function loadToolbarMode() {
        try {
            const form = new FormData();
            form.append('action', 'get');
            form.append('key', 'toolbar_mode');

            fetch('api_settings.php', { method: 'POST', body: form })
                .then(r => r.json())
                .then(j => {
                    const mode = (j && j.success && j.value) ? j.value : 'both';
                    applyToolbarMode(mode);
                })
                .catch(() => {
                    applyToolbarMode('both');
                });
        } catch (e) {
            applyToolbarMode('both');
        }
    }

    function init() {
        loadToolbarMode();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.applyToolbarMode = applyToolbarMode;
    window.loadToolbarMode = loadToolbarMode;
})();
