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
    
    // Update test button text
    updateTestButtonText();
}

/**
 * Update test button text based on selected provider and model
 */
function updateTestButtonText() {
    const providerSelect = document.getElementById('ai_provider');
    const testBtnText = document.getElementById('test-btn-text');
    
    if (!providerSelect || !testBtnText) return;
    
    const selectedProvider = providerSelect.value;
    let modelText = '';
    
    if (selectedProvider === 'openai') {
        const openaiModelSelect = document.getElementById('openai_model');
        if (openaiModelSelect) {
            const selectedOption = openaiModelSelect.options[openaiModelSelect.selectedIndex];
            modelText = selectedOption.text;
        }
        testBtnText.textContent = `Test OpenAI Connection (${modelText})`;
    } else if (selectedProvider === 'mistral') {
        const mistralModelSelect = document.getElementById('mistral_model');
        if (mistralModelSelect) {
            const selectedOption = mistralModelSelect.options[mistralModelSelect.selectedIndex];
            modelText = selectedOption.text;
        }
        testBtnText.textContent = `Test Mistral AI Connection (${modelText})`;
    } else {
        testBtnText.textContent = 'Test Connection';
    }
}

/**
 * Test AI connection
 */
function testAIConnection() {
    const testBtn = document.getElementById('test-connection-btn');
    const testResult = document.getElementById('test-result');
    const testBtnText = document.getElementById('test-btn-text');
    
    // Store original button text
    const originalText = testBtnText.textContent;
    
    // Show loading state
    testBtn.disabled = true;
    testBtnText.textContent = 'Testing...';
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
        testBtnText.textContent = originalText;
    });
}

// Legacy function for backward compatibility
function toggleApiKeyVisibility() {
    toggleApiKeyVisibility('openai_api_key');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Update test button text on page load
    updateTestButtonText();
    
    // Add event listeners for model changes
    const openaiModelSelect = document.getElementById('openai_model');
    const mistralModelSelect = document.getElementById('mistral_model');
    
    if (openaiModelSelect) {
        openaiModelSelect.addEventListener('change', updateTestButtonText);
    }
    
    if (mistralModelSelect) {
        mistralModelSelect.addEventListener('change', updateTestButtonText);
    }
});
