// JavaScript pour la page trash

document.addEventListener('DOMContentLoaded', function() {
    // Gestion de la recherche dans les notes de la corbeille
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const noteCards = document.querySelectorAll('.trash-notecard');
            let visibleCount = 0;
            
            noteCards.forEach(card => {
                const title = card.querySelector('.css-title');
                const content = card.querySelector('.noteentry');
                
                let titleText = title ? title.textContent.toLowerCase() : '';
                let contentText = content ? content.textContent.toLowerCase() : '';
                
                if (titleText.includes(searchTerm) || contentText.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Afficher le nombre de résultats
            updateSearchResults(visibleCount, searchTerm);
        });
    }
    
    // Gestion des boutons de restauration et suppression définitive
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('icon_restore_trash')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid && confirm('Do you want to restore this note?')) {
                restoreNote(noteid);
            }
        }
        
        if (e.target.classList.contains('icon_trash_trash')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid && confirm('Do you want to permanently delete this note? This action cannot be undone.')) {
                permanentlyDeleteNote(noteid);
            }
        }
    });
    
    // Gestion du bouton "Vider la corbeille"
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Do you want to empty the trash completely? This action cannot be undone.')) {
                emptyTrash();
            }
        });
    }
});

function updateSearchResults(count, searchTerm) {
    let resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'searchResults';
        resultsDiv.className = 'trash-search-results';
        
        const searchContainer = document.querySelector('.trash-search-input').parentNode;
        searchContainer.appendChild(resultsDiv);
    }
    
    if (searchTerm.trim() === '') {
        resultsDiv.style.display = 'none';
    } else {
        resultsDiv.style.display = 'block';
        resultsDiv.textContent = `${count} note(s) found for "${searchTerm}"`;
    }
}

function restoreNote(noteid) {
    fetch('putback.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'id=' + encodeURIComponent(noteid)
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Supprimer visuellement la note de la liste
            const noteElement = document.getElementById('note' + noteid);
            if (noteElement) {
                noteElement.style.display = 'none';
            }
        } else {
            alert('Error restoring the note: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during restoration:', error);
        alert('Error restoring the note');
    });
}

function permanentlyDeleteNote(noteid) {
    fetch('permanentDelete.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'id=' + encodeURIComponent(noteid)
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Supprimer visuellement la note de la liste
            const noteElement = document.getElementById('note' + noteid);
            if (noteElement) {
                noteElement.style.display = 'none';
            }
        } else {
            alert('Error during permanent deletion: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during deletion:', error);
        alert('Error during permanent deletion of the note');
    });
}

function emptyTrash() {
    fetch('emptytrash.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Succès - rediriger vers trash.php pour actualiser la page
            window.location.href = 'trash.php';
        } else {
            alert('Error emptying trash: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during trash emptying:', error);
        alert('Error emptying trash');
    });
}

// Optimisation pour mobile : gestion du scroll
if (window.innerWidth <= 800) {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}
