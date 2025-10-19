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
        applyTheme(savedTheme);
    }

    // Apply theme to document
    function applyTheme(theme) {
        var root = document.documentElement;
        // Set data-theme on <html> for early CSS and keep legacy body class for compatibility
        root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
        root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
        if (theme === 'dark') document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode');
        
        // Save preference
        localStorage.setItem('poznote-theme', theme);
        
        // Update toggle button if it exists
        updateToggleButton(theme);
    }

    // Toggle between light and dark mode
    function toggleTheme() {
        var currentTheme = localStorage.getItem('poznote-theme') || 'light';
        var newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        applyTheme(newTheme);
    }

    // Update toggle button appearance
    function updateToggleButton(theme) {
        var badge = document.getElementById('theme-mode-badge');
        var icon = document.querySelector('#theme-mode-card .settings-card-icon i');
        
        if (badge) {
            if (theme === 'dark') {
                badge.textContent = 'dark mode';
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = 'light mode';
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
