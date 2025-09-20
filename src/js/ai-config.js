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
 * Update test button text based on saved configuration (not current form values)
 */
function updateTestButtonText() {
    const testBtn = document.getElementById('test-connection-btn');
    const testBtnText = document.getElementById('test-btn-text');
    
    if (!testBtn || !testBtnText) return;
    
    const savedProvider = testBtn.getAttribute('data-saved-provider');
    const savedOpenAIModel = testBtn.getAttribute('data-saved-openai-model');
    const savedMistralModel = testBtn.getAttribute('data-saved-mistral-model');
    
    if (savedProvider === 'openai') {
        // Find the display name for the OpenAI model
        const openaiModelSelect = document.getElementById('openai_model');
        let modelDisplayName = savedOpenAIModel;
        
        if (openaiModelSelect) {
            const option = openaiModelSelect.querySelector(`option[value="${savedOpenAIModel}"]`);
            if (option) {
                modelDisplayName = option.textContent;
            }
        }
        
        testBtnText.textContent = `Test OpenAI Connection (${modelDisplayName})`;
    } else if (savedProvider === 'mistral') {
        // Find the display name for the Mistral model
        const mistralModelSelect = document.getElementById('mistral_model');
        let modelDisplayName = savedMistralModel;
        
        if (mistralModelSelect) {
            const option = mistralModelSelect.querySelector(`option[value="${savedMistralModel}"]`);
            if (option) {
                modelDisplayName = option.textContent;
            }
        }
        
        testBtnText.textContent = `Test Mistral AI Connection (${modelDisplayName})`;
    } else {
        testBtnText.textContent = 'Test Connection (Save configuration first)';
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
            testResult.innerHTML = '<img src="images/check-light-full.svg" alt="Success" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"> Connection successful! Using: ' + data.provider;
        } else {
            testResult.className = 'alert alert-danger';
            testResult.innerHTML = '<img src="images/circle-info-solid-full.svg" alt="Error" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"> ' + data.error;
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

/**
 * Update saved configuration data attributes after successful save
 */
function updateSavedConfiguration() {
    const testBtn = document.getElementById('test-connection-btn');
    const providerSelect = document.getElementById('ai_provider');
    const openaiModelSelect = document.getElementById('openai_model');
    const mistralModelSelect = document.getElementById('mistral_model');
    
    if (testBtn && providerSelect) {
        // Update data attributes with current form values
        testBtn.setAttribute('data-saved-provider', providerSelect.value);
        
        if (openaiModelSelect) {
            testBtn.setAttribute('data-saved-openai-model', openaiModelSelect.value);
        }
        
        if (mistralModelSelect) {
            testBtn.setAttribute('data-saved-mistral-model', mistralModelSelect.value);
        }
        
        // Update button text
        updateTestButtonText();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Update test button text on page load based on saved configuration
    updateTestButtonText();
    
    // Listen for form submission to update saved configuration
    const form = document.getElementById('ai-config-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            // Small delay to let the form submit, then update the saved config
            setTimeout(() => {
                // Check if the page was reloaded (success message visible) or if we're still here
                const successAlert = document.querySelector('.alert-success');
                if (successAlert) {
                    // Form was submitted successfully, update saved configuration
                    updateSavedConfiguration();
                }
            }, 100);
        });
    }
});
