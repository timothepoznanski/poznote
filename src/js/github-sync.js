/**
 * GitHub Sync Page JavaScript
 * Handles loading states for push/pull operations
 */

document.addEventListener('DOMContentLoaded', function () {
    // Show loading spinner on push/pull submit
    const forms = document.querySelectorAll('form[method="post"]');
    forms.forEach(form => {
        form.addEventListener('submit', function (e) {
            const actionInput = form.querySelector('input[name="action"]');
            if (!actionInput) return;

            const action = actionInput.value;
            if (action === 'push' || action === 'pull') {
                // If a confirmation modal is expected but not yet confirmed, skip loading state
                // This is used by the inline script in github_sync.php
                if (window.modalAlert && form.dataset.confirmed !== 'true') {
                    return;
                }

                const button = form.querySelector('button[type="submit"]');
                if (!button) return;

                const icon = button.querySelector('i');

                const text = button.textContent.trim();
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + text;
                button.disabled = true;

                // Force a repaint to ensure spinner is visible
                button.offsetHeight;
            }
        });
    });
});
