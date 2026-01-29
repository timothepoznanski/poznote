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
        } else {
            r.classList.add('theme-light');
        }
    } catch (e) {
        // Fallback silently if localStorage unavailable
    }
})();
