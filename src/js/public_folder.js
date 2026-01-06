// Public Folder Theme Toggle
function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.getElementById('themeIcon').className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Set initial icon on page load
document.addEventListener('DOMContentLoaded', function() {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        document.getElementById('themeIcon').className = 'fas fa-sun';
    }
});
