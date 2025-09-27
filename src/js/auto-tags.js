/**
 * Auto Tags Page JavaScript  
 * Handles AI-powered automatic tag generation functionality
 */

// Global variables (will be set by PHP in the HTML page)
// Note: noteId is set directly in the HTML page before this script loads
let generatedTags = [];

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Automatically generate tags when the page loads
    generateTags();
});

/**
 * Generate AI tags for the current note
 */
async function generateTags() {
    const loadingState = document.getElementById('loadingState');
    const tagsDisplay = document.getElementById('tagsDisplay');
    const errorState = document.getElementById('errorState');
    const initialState = document.getElementById('initialState');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    const applyBtn = document.getElementById('applyBtn');
    const regenerateBtn = document.getElementById('regenerateBtn');
    
    // Show loading state
    loadingState.style.display = 'block';
    tagsDisplay.style.display = 'none';
    errorState.style.display = 'none';
    initialState.style.display = 'none';
    generateBtn.style.display = 'none';
    
    try {
        const response = await fetch('api_auto_tags.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                note_id: noteId,
                workspace: typeof noteWorkspace !== 'undefined' ? noteWorkspace : null
            })
        });
        
        const data = await response.json();
        
        // Hide loading
        loadingState.style.display = 'none';
        
        if (response.ok && data.success) {
            // Store and display the tags
            generatedTags = data.tags;
            displayTags(generatedTags);
            tagsDisplay.style.display = 'block';
            copyBtn.style.display = 'inline-flex';
            applyBtn.style.display = 'inline-flex';
            regenerateBtn.style.display = 'inline-flex';
        } else {
            // Show the error
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = data.error || 'An error occurred while generating tags';
            errorState.style.display = 'block';
            generateBtn.style.display = 'inline-flex';
        }
        
    } catch (error) {
        console.error('Error generating tags:', error);
        
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
 * Display the generated tags in the UI
 * @param {Array} tags - Array of tag strings
 */
function displayTags(tags) {
    const tagsContainer = document.getElementById('tagsContainer');
    tagsContainer.innerHTML = '';
    
    tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag-item';
        tagElement.textContent = tag;
        tagsContainer.appendChild(tagElement);
    });
}

/**
 * Copy the generated tags to clipboard
 */
async function copyTags() {
    const copyBtn = document.getElementById('copyBtn');
    
    if (!copyBtn || !generatedTags.length) return;
    
    const tagsText = generatedTags.join(', ');
    
    try {
        await navigator.clipboard.writeText(tagsText);
        
        // Visual feedback
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fa-check-light-full"></i> Copied!';
        copyBtn.classList.add('copy-feedback');
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('copy-feedback');
        }, 2000);
        
    } catch (err) {
        console.error('Failed to copy tags: ', err);
        
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = tagsText;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-check-light-full"></i> Copied!';
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

/**
 * Apply the generated tags to the note
 */
async function applyTags() {
    const applyBtn = document.getElementById('applyBtn');
    
    if (!applyBtn || !generatedTags.length) return;
    
    try {
        const response = await fetch('api_apply_tags.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                note_id: noteId,
                tags: generatedTags,
                workspace: typeof noteWorkspace !== 'undefined' ? noteWorkspace : null
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Close the window and return to the correct workspace
            let redirectUrl = 'index.php';
            if (typeof noteWorkspace !== 'undefined' && noteWorkspace && noteWorkspace !== 'Poznote') {
                redirectUrl += '?workspace=' + encodeURIComponent(noteWorkspace);
            }
            window.location.href = redirectUrl;
        } else {
            alert('Error applying tags: ' + (data.error || 'Unknown error'));
        }
        
    } catch (error) {
        console.error('Error applying tags:', error);
        alert('Connection error. Please try again.');
    }
}
