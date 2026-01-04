/**
 * Theme Manager for Poznote
 * Handles dark mode / light mode switching
 */

(function() {
    'use strict';

    // Initialize theme on page load
    function initTheme() {
        var savedTheme = localStorage.getItem('poznote-theme');
        if (!savedTheme) {
            // Fallback to system preference if nothing saved
            try {
                savedTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
            } catch (e) {
                savedTheme = 'light';
            }
        }
        
        // Check if theme was already applied by inline script to avoid duplication
        var currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme && currentTheme === savedTheme) {
            // Theme already applied, just update UI elements
            updateToggleButton(savedTheme);
        } else {
            // Apply theme if not already set or different
            applyTheme(savedTheme);
        }
    }

    // Apply theme to document
    function applyTheme(theme) {
        var root = document.documentElement;
        var normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        
        // Set data-theme on <html> for early CSS and keep legacy body class for compatibility
        root.setAttribute('data-theme', normalizedTheme);
        root.style.colorScheme = normalizedTheme;
        root.style.backgroundColor = normalizedTheme === 'dark' ? '#1a1a1a' : '#ffffff';
        
        // Manage body class for compatibility
        if (normalizedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        // Save preference
        localStorage.setItem('poznote-theme', normalizedTheme);
        
        // Update toggle button if it exists
        updateToggleButton(normalizedTheme);
    }

    // Toggle between light and dark mode
    function toggleTheme() {
        var currentTheme = localStorage.getItem('poznote-theme') || 'light';
        var newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        // Force apply the new theme to ensure all elements are updated
        applyTheme(newTheme);
        
        // Force a small delay and re-apply to ensure proper styling
        setTimeout(function() {
            applyTheme(newTheme);
        }, 10);
    }

    // Update toggle button appearance
    function updateToggleButton(theme) {
        var badge = document.getElementById('theme-mode-badge');
        var icon = document.querySelector('#theme-mode-card .settings-card-icon i');
        
        if (badge) {
            if (theme === 'dark') {
                badge.textContent = (window.t ? window.t('theme.badge.dark', null, 'dark mode') : 'dark mode');
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = (window.t ? window.t('theme.badge.light', null, 'light mode') : 'light mode');
                badge.className = 'setting-status enabled';
            }
        }
        
        // Change icon: moon for dark mode, sun for light mode
        if (icon) {
            if (theme === 'dark') {
                icon.className = 'fa fa-moon';
            } else {
                icon.className = 'fa fa-sun';
            }
        }
    }

    // When client-side i18n finishes loading, re-render the badge label
    // (initial render may have used fallback English strings).
    document.addEventListener('poznote:i18n:loaded', function() {
        try {
            updateToggleButton(getCurrentTheme());
        } catch (e) {
            // ignore
        }
    });

    // Get current theme
    function getCurrentTheme() {
        return localStorage.getItem('poznote-theme') || 'light';
    }

    // Make functions globally available
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = getCurrentTheme;
    window.applyTheme = applyTheme;

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
