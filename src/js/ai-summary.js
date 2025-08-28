/**
 * AI Summary Page JavaScript
 * Handles AI-powered note summarization functionality
 */

// Global variable to store the note ID (will be set by PHP in the HTML page)
// Note: noteId is set directly in the HTML page before this script loads

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Automatically generate summary when the page loads
    generateSummary();
});

/**
 * Generate AI summary for the current note
 */
async function generateSummary() {
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
        const payload = { note_id: noteId };
        if (typeof noteWorkspace !== 'undefined' && noteWorkspace) payload.workspace = noteWorkspace;

        const response = await fetch('api_ai_summary.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        // Hide loading
        loadingState.style.display = 'none';
        
        if (response.ok && data.success) {
            // Show the summary with preserved line breaks
            summaryText.innerHTML = data.summary.replace(/\n/g, '<br>');
            summaryText.style.display = 'block';
            copyBtn.style.display = 'inline-flex';
            regenerateBtn.style.display = 'inline-flex';
        } else {
            // Show the error
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = data.error || 'An error occurred while generating the summary';
            errorState.style.display = 'block';
            generateBtn.style.display = 'inline-flex';
        }
        
    } catch (error) {
        
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
 * Copy the generated summary to clipboard
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
            
        }
        
        document.body.removeChild(textArea);
    }
}
