/**
 * Check Errors Page JavaScript
 * Handles AI-powered content verification functionality
 */

// Global variable to store the note ID (will be set by PHP in the HTML page)
// Note: noteId is set directly in the HTML page before this script loads

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Automatically check content when the page loads
    checkErrors();
});

/**
 * Check errors in the current note using AI
 */
async function checkErrors() {
    const loadingState = document.getElementById('loadingState');
    const summaryText = document.getElementById('summaryText');
    const errorState = document.getElementById('errorState');
    const initialState = document.getElementById('initialState');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    const regenerateBtn = document.getElementById('regenerateBtn');
    
    // Show loading state
    loadingState.style.display = 'block';
    summaryText.style.display = 'none';
    errorState.style.display = 'none';
    initialState.style.display = 'none';
    generateBtn.style.display = 'none';
    
    try {
        const response = await fetch('api_check_errors.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                note_id: noteId
            })
        });
        
        const data = await response.json();
        
        // Hide loading
        loadingState.style.display = 'none';
        
        if (response.ok && data.success) {
            // Show the error check result with preserved line breaks
            const errorCheckText = data.error_check || '';
            summaryText.innerHTML = errorCheckText.replace(/\n/g, '<br>');
            summaryText.style.display = 'block';
            copyBtn.style.display = 'inline-flex';
            regenerateBtn.style.display = 'inline-flex';
        } else {
            // Show the error
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = data.error || 'An error occurred while checking for errors';
            errorState.style.display = 'block';
            generateBtn.style.display = 'inline-flex';
        }
        
    } catch (error) {
        console.error('Error checking for errors:', error);
        
        // Hide loading
        loadingState.style.display = 'none';
        
        // Show error
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = 'Connection error. Please try again.';
        errorState.style.display = 'block';
        generateBtn.style.display = 'inline-flex';
    }
}

/**
 * Copy the error check results to clipboard
 */
async function copyToClipboard() {
    const summaryText = document.getElementById('summaryText');
    const copyBtn = document.getElementById('copyBtn');
    
    if (!summaryText || !copyBtn) return;
    
    try {
        // Get the text content without HTML tags for copying
        const textToCopy = summaryText.innerText || summaryText.textContent;
        await navigator.clipboard.writeText(textToCopy);
        
        // Visual feedback
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        copyBtn.classList.add('copy-feedback');
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('copy-feedback');
        }, 2000);
        
    } catch (err) {
        console.error('Failed to copy text: ', err);
        
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summaryText.innerText || summaryText.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyBtn.classList.add('copy-feedback');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('copy-feedback');
            }, 2000);
            
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr);
        }
        
        document.body.removeChild(textArea);
    }
}
