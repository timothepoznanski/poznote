// JavaScript for markdown guide page

document.addEventListener('DOMContentLoaded', function() {
    // Attach back button listener
    var backLink = document.querySelector('.back-link');
    if (backLink) {
        backLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.close();
            setTimeout(function() {
                window.history.back();
            }, 100);
        });
    }
});
