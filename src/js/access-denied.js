/**
 * Access Denied page JavaScript
 * CSP-compliant event handler for return button
 */
(function() {
    'use strict';
    
    document.addEventListener('DOMContentLoaded', function() {
        var returnBtn = document.getElementById('access-denied-return-btn');
        if (returnBtn) {
            returnBtn.addEventListener('click', function() {
                window.location.href = 'index.php';
            });
        }
    });
})();
