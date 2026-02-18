// Theme initialization - runs synchronously in <head> to prevent FOUC
(function () {
    try {
        var t = localStorage.getItem('poznote-theme');
        if (!t) {
            t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        var r = document.documentElement;
        r.setAttribute('data-theme', t);
        r.style.colorScheme = t === 'dark' ? 'dark' : 'light';
        r.style.backgroundColor = t === 'dark' ? '#252526' : '#ffffff';

        // Add theme class for pages that need it (settings, display)
        if (t === 'dark') {
            r.classList.add('theme-dark');

            // Inject critical CSS to prevent white flash on all key elements
            var style = document.createElement('style');
            style.id = 'theme-init-critical-css';
            style.textContent = [
                'body { background-color: #252526 !important; color: #e0e0e0 !important; }',
                '#right_pane { background-color: #252526 !important; }',
                '.note-header { background-color: #252526 !important; }',
                '.note-edit-toolbar { background-color: #252526 !important; }',
                '.note-header-spacer { background-color: #252526 !important; }',
                '.notecard { background-color: #252526 !important; }',
                '.innernote { background-color: #252526 !important; color: #e0e0e0 !important; }',
                '.css-title { background-color: #252526 !important; color: #e0e0e0 !important; }'
            ].join(' ');
            document.head.appendChild(style);
        } else {
            r.classList.add('theme-light');
        }
    } catch (e) {
        // Fallback silently if localStorage unavailable
    }
})();
