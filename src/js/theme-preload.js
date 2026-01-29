(function () {
  try {
    var theme = localStorage.getItem('poznote-theme');
    if (!theme) {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }

    // Set an attribute on <html> so we can style background immediately
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // Hint browser color scheme for form controls
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';

    // Ensure initial background matches theme to avoid flash
    root.style.backgroundColor = theme === 'dark' ? '#252526' : '#ffffff';
  } catch (e) {
    // no-op
  }
})();
