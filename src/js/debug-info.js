// Test pour diagnostiquer le problème du bouton info
console.log("=== Test du système d'info des notes ===");

// Fonction de test améliorée pour showNoteInfo
function showNoteInfoDebug(noteId, created, updated) {
    console.log("showNoteInfo appelée avec:");
    console.log("- noteId:", noteId, typeof noteId);
    console.log("- created:", created, typeof created);
    console.log("- updated:", updated, typeof updated);
    
    try {
        // Vérifier que les éléments existent
        const modal = document.getElementById('noteInfoModal');
        const idElement = document.getElementById('noteInfoId');
        const createdElement = document.getElementById('noteInfoCreated');
        const updatedElement = document.getElementById('noteInfoUpdated');
        
        console.log("Éléments DOM:");
        console.log("- modal:", modal ? "trouvé" : "NON TROUVÉ");
        console.log("- noteInfoId:", idElement ? "trouvé" : "NON TROUVÉ");
        console.log("- noteInfoCreated:", createdElement ? "trouvé" : "NON TROUVÉ");
        console.log("- noteInfoUpdated:", updatedElement ? "trouvé" : "NON TROUVÉ");
        
        if (!modal || !idElement || !createdElement || !updatedElement) {
            console.error("Éléments DOM manquants!");
            return;
        }
        
        // Traitement des dates
        let createdDate, updatedDate;
        
        try {
            // Essayer différents formats de date
            if (typeof created === 'string') {
                createdDate = new Date(created);
            } else {
                createdDate = new Date(created);
            }
            
            if (typeof updated === 'string') {
                updatedDate = new Date(updated);
            } else {
                updatedDate = new Date(updated);
            }
            
            console.log("Dates parsées:");
            console.log("- createdDate:", createdDate, createdDate.toLocaleString());
            console.log("- updatedDate:", updatedDate, updatedDate.toLocaleString());
            
        } catch (dateError) {
            console.error("Erreur lors du parsing des dates:", dateError);
            createdDate = new Date(created);
            updatedDate = new Date(updated);
        }
        
        // Remplir le modal
        idElement.textContent = noteId;
        createdElement.textContent = createdDate.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        updatedElement.textContent = updatedDate.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit', 
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        console.log("Contenu du modal rempli");
        
        // Afficher le modal
        modal.style.display = 'block';
        console.log("Modal affiché");
        
        // Ajouter un gestionnaire pour fermer le modal en cliquant à l'extérieur
        modal.onclick = function(event) {
            if (event.target === modal) {
                closeNoteInfoModal();
            }
        };
        
    } catch (error) {
        console.error("Erreur dans showNoteInfo:", error);
        alert("Erreur lors de l'affichage des informations de la note: " + error.message);
    }
}

// Fonction pour fermer le modal améliorée
function closeNoteInfoModalDebug() {
    console.log("closeNoteInfoModal appelée");
    const modal = document.getElementById('noteInfoModal');
    if (modal) {
        modal.style.display = 'none';
        console.log("Modal fermé");
    } else {
        console.error("Modal non trouvé pour fermeture");
    }
}

// Remplacer les fonctions existantes
if (typeof showNoteInfo !== 'undefined') {
    console.log("Remplacement de showNoteInfo par la version debug");
    window.showNoteInfo = showNoteInfoDebug;
}

if (typeof closeNoteInfoModal !== 'undefined') {
    console.log("Remplacement de closeNoteInfoModal par la version debug");
    window.closeNoteInfoModal = closeNoteInfoModalDebug;
}

// Test des éléments DOM au chargement
document.addEventListener('DOMContentLoaded', function() {
    console.log("=== Vérification des éléments DOM ===");
    console.log("noteInfoModal:", document.getElementById('noteInfoModal') ? "✓" : "✗");
    console.log("noteInfoId:", document.getElementById('noteInfoId') ? "✓" : "✗");
    console.log("noteInfoCreated:", document.getElementById('noteInfoCreated') ? "✓" : "✗");
    console.log("noteInfoUpdated:", document.getElementById('noteInfoUpdated') ? "✓" : "✗");
});

console.log("Script de debug chargé");
