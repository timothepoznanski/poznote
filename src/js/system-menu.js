/**
 * Gestion du menu système avec trois points verticaux
 */

// Toggle du menu déroulant
function toggleSystemMenu() {
    const dropdown = document.getElementById('system-menu-dropdown');
    const menuContainer = document.querySelector('.system-menu-container');
    
    if (dropdown && menuContainer) {
        const isVisible = dropdown.style.display === 'block';
        
        if (isVisible) {
            dropdown.style.display = 'none';
        } else {
            // Mettre à jour le compteur offline avant d'afficher le menu
            if (window.updateOfflineNotesCount) {
                window.updateOfflineNotesCount();
            }
            
            // Calculer la position du menu
            const rect = menuContainer.getBoundingClientRect();
            const dropdownHeight = 300; // Hauteur estimée du menu
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // Position verticale
            let top = rect.bottom + 8;
            
            // Si le menu dépasse en bas, le positionner au-dessus
            if (top + dropdownHeight > viewportHeight) {
                top = rect.top - dropdownHeight - 8;
            }
            
            // Position horizontale - centrer sous l'icône
            let left = rect.left + (rect.width / 2);
            const dropdownWidth = 200; // Largeur min du dropdown
            
            // Transformer pour centrer
            left = left - (dropdownWidth / 2);
            
            // S'assurer que le menu ne dépasse pas à gauche
            if (left < 10) {
                left = 10;
            }
            
            // S'assurer que le menu ne dépasse pas à droite
            if (left + dropdownWidth > viewportWidth - 10) {
                left = viewportWidth - dropdownWidth - 10;
            }
            
            dropdown.style.top = top + 'px';
            dropdown.style.left = left + 'px';
            dropdown.style.display = 'block';
        }
    }
}

// Fermer le menu si on clique en dehors
document.addEventListener('click', function(event) {
    const menuContainer = document.querySelector('.system-menu-container');
    const dropdown = document.getElementById('system-menu-dropdown');
    
    if (menuContainer && dropdown && !menuContainer.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

// Exposer la fonction globalement
window.toggleSystemMenu = toggleSystemMenu;
