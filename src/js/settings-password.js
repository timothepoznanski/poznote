document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('settings-password-input');
    const submitBtn = document.getElementById('settings-password-submit');
    const cancelBtn = document.getElementById('settings-password-cancel');
    const errorDiv = document.getElementById('settings-password-error');
    
    // Focus on input
    passwordInput.focus();
    
    // Handle submit
    async function handleSubmit() {
        const password = passwordInput.value.trim();
        
        if (!password) {
            showError('Please enter a password');
            return;
        }
        
        // Disable button during verification
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        
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
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Submit';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('Error:', error);
            showError('An error occurred. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Submit';
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
    submitBtn.addEventListener('click', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    });
});