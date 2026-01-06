document.addEventListener('DOMContentLoaded', function() {
    const passwordForm = document.getElementById('settings-password-form');
    const passwordInput = document.getElementById('settings-password-input');
    const submitBtn = document.getElementById('settings-password-submit');
    const cancelBtn = document.getElementById('settings-password-cancel');
    const errorDiv = document.getElementById('settings-password-error');
    
    // Focus on input
    passwordInput.focus();
    
    // Handle submit
    async function handleSubmit(e) {
        e.preventDefault();
        
        const password = passwordInput.value.trim();
        
        if (!password) {
            showError('Please enter a password');
            return;
        }
        
        // Disable button during verification
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Verifying...';
        
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
                // Password correct, reload the page to access settings
                window.location.reload();
            } else {
                showError(data.error || 'Invalid password');
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Access Settings';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('Error:', error);
            showError('An error occurred. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Access Settings';
        }
    }
    
    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        setTimeout(() => {
            errorDiv.classList.remove('show');
        }, 3000);
    }
    
    // Handle cancel
    function handleCancel() {
        window.location.href = 'index.php';
    }
    
    // Event listeners
    passwordForm.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
});