/**
 * AI Configuration Page JavaScript
 * Handles AI settings and configuration functionality
 */

/**
 * Toggle visibility of the API key input field
 */
function toggleApiKeyVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    const button = input.parentNode.querySelector('.toggle-visibility i');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        button.className = 'fas fa-eye';
    }
}

/**
 * Toggle provider settings visibility
 */
function toggleProviderSettings() {
    const providerSelect = document.getElementById('ai_provider');
    const selectedProvider = providerSelect.value;
    
    // Hide all provider configs
    const providerConfigs = document.querySelectorAll('.provider-config');
    providerConfigs.forEach(config => {
        config.style.display = 'none';
    });
    
    // Show the selected provider config
    const selectedConfig = document.getElementById(selectedProvider + '-config');
    if (selectedConfig) {
        selectedConfig.style.display = 'block';
    }
}

/**
 * Test AI connection
 */
function testAIConnection() {
    const testBtn = document.getElementById('test-connection-btn');
    const testResult = document.getElementById('test-result');
    
    // Show loading state
    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    testResult.style.display = 'none';
    
    fetch('api_test_ai_connection.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            testResult.className = 'alert alert-success';
            testResult.innerHTML = '<i class="fas fa-check-circle"></i> Connection successful! Using: ' + data.provider;
        } else {
            testResult.className = 'alert alert-danger';
            testResult.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + data.error;
        }
        testResult.style.display = 'block';
    })
    .catch(error => {
        testResult.className = 'alert alert-danger';
        testResult.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Test failed: ' + error.message;
        testResult.style.display = 'block';
    })
    .finally(() => {
        // Restore button state
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
    });
}

// Legacy function for backward compatibility
function toggleApiKeyVisibility() {
    toggleApiKeyVisibility('openai_api_key');
}
