/**
 * Settings Password Verification Module
 * Handles password verification before accessing settings page
 */
document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const passwordForm = document.getElementById('settings-password-form');
    const passwordInput = document.getElementById('settings-password-input');
    const submitBtn = document.getElementById('settings-password-submit');
    const cancelBtn = document.getElementById('settings-password-cancel');
    const errorDiv = document.getElementById('settings-password-error');
    
    // Constants
    const ERROR_TIMEOUT = 3000;
    const BUTTON_TEXT = {
        default: 'Access Settings',
        loading: 'Verifying...'
    };
    
    // State
    let errorTimeout = null;
    
    // Auto-focus on password input for better UX
    passwordInput.focus();
    
    /**
     * Handles form submission and password verification
     * @param {Event} e - Submit event
     */
    async function handleSubmit(e) {
        e.preventDefault();
        
        const password = passwordInput.value.trim();
        
        if (!password) {
            showError('Please enter a password');
            return;
        }
        
        // Disable button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = BUTTON_TEXT.loading;
        
        try {
            const response = await fetch('api/v1/system/verify-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Password verified - reload page to access settings
                window.location.reload();
            } else {
                // Invalid password - show error and reset form
                showError(data.error || 'Invalid password');
                resetButton();
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('Password verification error:', error);
            showError('An error occurred. Please try again.');
            resetButton();
        }
    }
    
    /**
     * Displays error message with auto-hide
     * @param {string} message - Error message to display
     */
    function showError(message) {
        // Clear any existing timeout to prevent overlapping
        if (errorTimeout) {
            clearTimeout(errorTimeout);
        }
        
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        
        errorTimeout = setTimeout(() => {
            errorDiv.classList.remove('show');
            errorTimeout = null;
        }, ERROR_TIMEOUT);
    }
    
    /**
     * Resets submit button to default state
     */
    function resetButton() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = BUTTON_TEXT.default;
    }
    
    /**
     * Handles cancel action - redirects to home
     */
    function handleCancel() {
        window.location.href = 'index.php';
    }
    
    // Event listeners
    passwordForm.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
});