/**
 * Fonctionnalités IA pour PozNote
 */

let currentSummaryNoteId = null;

/**
 * Génère un résumé IA pour une note donnée
 */
async function generateAISummary(noteId) {
    if (!noteId) {
        console.error('Note ID is required');
        return;
    }
    
    currentSummaryNoteId = noteId;
    
    // Afficher la modal
    showAISummaryModal();
    
    try {
        // Afficher l'état de chargement
        showLoadingState();
        
        const response = await fetch('api_ai_summary.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                note_id: noteId
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Afficher le résumé
            showSummaryResult(data.summary, data.note_title);
        } else {
            // Afficher l'erreur
            showErrorState(data.error || 'An error occurred while generating the summary');
        }
        
    } catch (error) {
        console.error('Error generating AI summary:', error);
        showErrorState('Connection error. Please try again.');
    }
}

/**
 * Affiche la modal de résumé IA
 */
function showAISummaryModal() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

/**
 * Ferme la modal de résumé IA
 */
function closeAISummaryModal() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        
        // Réinitialiser l'état de la modal
        resetModalState();
    }
}

/**
 * Affiche l'état de chargement
 */
function showLoadingState() {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (contentDiv) contentDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Affiche le résumé généré
 */
function showSummaryResult(summary, noteTitle) {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    const summaryTextElement = document.getElementById('summaryText');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    
    if (summaryTextElement) {
        summaryTextElement.textContent = summary;
    }
    
    if (contentDiv) contentDiv.style.display = 'block';
    if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
    if (copyBtn) copyBtn.style.display = 'inline-flex';
}

/**
 * Affiche l'état d'erreur
 */
function showErrorState(errorMessage) {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    const errorMessageElement = document.getElementById('errorMessage');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (contentDiv) contentDiv.style.display = 'none';
    
    if (errorMessageElement) {
        errorMessageElement.textContent = errorMessage;
    }
    
    if (errorDiv) errorDiv.style.display = 'block';
    if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Régénère le résumé pour la note courante
 */
function regenerateCurrentSummary() {
    if (currentSummaryNoteId) {
        generateAISummary(currentSummaryNoteId);
    }
}

/**
 * Réinitialise l'état de la modal
 */
function resetModalState() {
    currentSummaryNoteId = null;
    
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (contentDiv) contentDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Copie le résumé dans le presse-papier
 */
async function copyToClipboard() {
    const summaryText = document.getElementById('summaryText');
    if (!summaryText) return;
    
    try {
        await navigator.clipboard.writeText(summaryText.textContent);
        
        // Feedback visuel temporaire
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy text: ', err);
        
        // Fallback pour les navigateurs plus anciens
        const textArea = document.createElement('textarea');
        textArea.value = summaryText.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const copyBtn = document.getElementById('copyBtn');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.style.background = '#28a745';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            }
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr);
        }
        document.body.removeChild(textArea);
    }
}

// Gérer la fermeture de la modal en cliquant en dehors
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAISummaryModal();
            }
        });
    }
    
    // Gérer la fermeture avec la touche Échap
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('aiSummaryModal');
            if (modal && modal.style.display === 'flex') {
                closeAISummaryModal();
            }
        }
    });
});
