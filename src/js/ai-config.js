/**
 * AI Configuration Page JavaScript
 * Handles AI settings and configuration functionality
 */

/**
 * Toggle visibility of the OpenAI API key input field
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('openai_api_key');
    const icon = document.getElementById('eye-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}
