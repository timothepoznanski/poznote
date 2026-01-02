// Offline Notes Manager
// Permet de sauvegarder et gérer des notes en mode hors ligne via IndexedDB

(function() {
    'use strict';

    const DB_NAME = 'PoznoteOfflineDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'offlineNotes';
    let db = null;

    // Initialiser la base de données IndexedDB
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Erreur lors de l\'ouverture de la base de données offline');
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Créer l'object store si il n'existe pas
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('title', 'title', { unique: false });
                }
            };
        });
    }

    // Vérifier si une note est déjà offline
    function isNoteOffline(noteId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                initDB().then(() => isNoteOffline(noteId)).then(resolve).catch(reject);
                return;
            }

            // Convertir en nombre pour uniformiser
            const numericNoteId = parseInt(noteId, 10);

            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.get(numericNoteId);

            request.onsuccess = () => {
                resolve(!!request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Sauvegarder une note pour utilisation offline
    function saveNoteOffline(noteId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                initDB().then(() => saveNoteOffline(noteId)).then(resolve).catch(reject);
                return;
            }

            // Convertir en nombre pour uniformiser
            const numericNoteId = parseInt(noteId, 10);

            // Récupérer les informations de la note depuis le DOM
            const noteCard = document.getElementById('note' + numericNoteId);
            if (!noteCard) {
                reject(new Error('Note non trouvée'));
                return;
            }

            const titleElement = document.getElementById('inp' + numericNoteId);
            const entryElement = document.getElementById('entry' + numericNoteId);
            const tagsElement = document.getElementById('tags' + numericNoteId);
            const folderElement = document.getElementById('folder' + numericNoteId);
            
            const noteData = {
                id: numericNoteId,
                title: titleElement ? titleElement.value : '',
                content: entryElement ? entryElement.innerHTML : '',
                tags: tagsElement ? tagsElement.value : '',
                folder: folderElement ? folderElement.value : '',
                timestamp: Date.now(),
                // Récupérer le type de note
                noteType: entryElement?.getAttribute('data-note-type') || 'normal',
                // Sauvegarder le contenu markdown si c'est une note markdown
                markdownContent: entryElement?.getAttribute('data-markdown-content') || null,
                // Sauvegarder les données tasklist si c'est une tasklist
                tasklistData: entryElement?.getAttribute('data-tasklist-note') ? 
                    JSON.parse(entryElement.textContent || '[]') : null
            };

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.put(noteData);

            request.onsuccess = () => {
                resolve(noteData);
            };

            request.onerror = () => {
                console.error('Erreur lors de la sauvegarde offline');
                reject(request.error);
            };
        });
    }

    // Supprimer une note du stockage offline
    function removeNoteOffline(noteId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                initDB().then(() => removeNoteOffline(noteId)).then(resolve).catch(reject);
                return;
            }

            // Convertir en nombre pour uniformiser
            const numericNoteId = parseInt(noteId, 10);

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.delete(numericNoteId);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Synchroniser une note offline avec le serveur (si réseau disponible)
    async function syncOfflineNoteWithServer(noteId) {
        // Vérifier si la note est offline
        const isOffline = await isNoteOffline(noteId);
        if (!isOffline) {
            return; // La note n'est pas offline, pas besoin de sync
        }

        // Vérifier si on a du réseau
        if (!navigator.onLine) {
            console.log('Pas de réseau disponible pour synchroniser la note', noteId);
            return;
        }

        // Mettre à jour la version offline avec les données actuelles du DOM
        try {
            await saveNoteOffline(noteId);
            console.log('Note offline mise à jour:', noteId);
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la note offline:', error);
        }
    }

    // Récupérer toutes les notes offline
    function getAllOfflineNotes() {
        return new Promise((resolve, reject) => {
            if (!db) {
                initDB().then(() => getAllOfflineNotes()).then(resolve).catch(reject);
                return;
            }

            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Récupérer une note offline spécifique
    function getOfflineNote(noteId) {
        return new Promise((resolve, reject) => {
            if (!db) {
                initDB().then(() => getOfflineNote(noteId)).then(resolve).catch(reject);
                return;
            }

            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.get(noteId);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Toggle offline status d'une note
    window.toggleOfflineNote = async function(noteId) {
        try {
            const isOffline = await isNoteOffline(noteId);
            
            if (isOffline) {
                await removeNoteOffline(noteId);
            } else {
                await saveNoteOffline(noteId);
            }
            
            // Mettre à jour le statut du bouton (toolbar + liste)
            await updateOfflineButtonStatus(noteId);
            
            // Mettre à jour le compteur
            if (window.updateOfflineNotesCount) {
                updateOfflineNotesCount();
            }
        } catch (error) {
            console.error('Erreur lors du toggle offline:', error);
        }
    };

    // Afficher la liste des notes offline
    window.showOfflineNotesList = async function() {
        try {
            const notes = await getAllOfflineNotes();
            
            let content = '<div class="offline-notes-list">';
            
            if (notes.length === 0) {
                content += '<p>' + (window.t ? window.t('offline.no_notes', null, 'Aucune note disponible hors ligne') : 'Aucune note disponible hors ligne') + '</p>';
            } else {
                content += '<ul>';
                notes.forEach(note => {
                    const date = new Date(note.timestamp).toLocaleString();
                    content += `
                        <li>
                            <strong>${note.title || 'Sans titre'}</strong><br>
                            <small>${date}</small>
                            <button onclick="viewOfflineNote(${note.id})" class="btn btn-sm">Voir</button>
                            <button onclick="removeOfflineNoteFromList(${note.id})" class="btn btn-sm">Supprimer</button>
                        </li>
                    `;
                });
                content += '</ul>';
            }
            
            content += '</div>';
            
            // Utiliser le système de modal existant
            if (window.showCustomModal) {
                window.showCustomModal(
                    window.t ? window.t('offline.notes_list', null, 'Notes disponibles hors ligne') : 'Notes disponibles hors ligne',
                    content
                );
            } else {
                alert('Notes offline: ' + notes.length);
            }
        } catch (error) {
            console.error('Erreur lors de la récupération des notes offline:', error);
            showNotificationPopup('Erreur lors de la récupération des notes offline', 'error');
        }
    };

    // Mettre à jour le statut du bouton offline au chargement de la page
    window.updateOfflineButtonStatus = async function(noteId) {
        try {
            const isOffline = await isNoteOffline(noteId);
            
            // Chercher le bouton dans la toolbar de la note actuelle ou dans la liste
            let button = document.querySelector('.note-edit-toolbar .btn-offline') || 
                         document.querySelector(`#note${noteId} .btn-offline`);
            
            // Si le bouton n'est pas trouvé, attendre un peu qu'il soit rendu
            if (!button) {
                await new Promise(resolve => setTimeout(resolve, 100));
                button = document.querySelector('.note-edit-toolbar .btn-offline') || 
                         document.querySelector(`#note${noteId} .btn-offline`);
            }
            
            if (button) {
                if (isOffline) {
                    button.classList.add('active');
                    button.title = window.t ? window.t('editor.toolbar.remove_offline', null, 'Retirer du mode hors ligne') : 'Retirer du mode hors ligne';
                } else {
                    button.classList.remove('active');
                    button.title = window.t ? window.t('editor.toolbar.make_offline', null, 'Rendre disponible hors ligne') : 'Rendre disponible hors ligne';
                }
            }
        } catch (error) {
            console.error('Erreur lors de la vérification du statut offline:', error);
        }
    };

    // Mettre à jour le compteur de notes offline dans la sidebar
    window.updateOfflineNotesCount = async function() {
        try {
            const notes = await getAllOfflineNotes();
            const countElement = document.getElementById('count-offline');
            if (countElement) {
                countElement.textContent = notes.length;
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour du compteur offline:', error);
        }
    };

    // Initialiser la base de données au chargement
    document.addEventListener('DOMContentLoaded', function() {
        initDB().then(() => {
            // Mettre à jour le statut de tous les boutons offline visibles
            document.querySelectorAll('.btn-offline').forEach(button => {
                const noteCard = button.closest('.notecard');
                if (noteCard) {
                    const noteId = noteCard.id.replace('note', '');
                    updateOfflineButtonStatus(noteId);
                }
            });
            
            // Mettre à jour le compteur dans la sidebar
            if (window.updateOfflineNotesCount) {
                updateOfflineNotesCount();
            }
        }).catch(error => {
            console.error('Erreur lors de l\'initialisation de la base de données offline:', error);
        });
    });

    // Exposer les fonctions pour usage externe
    window.OfflineNotesManager = {
        isNoteOffline: isNoteOffline,
        saveNoteOffline: saveNoteOffline,
        removeNoteOffline: removeNoteOffline,
        getAllOfflineNotes: getAllOfflineNotes,
        getOfflineNote: getOfflineNote,
        syncOfflineNoteWithServer: syncOfflineNoteWithServer,
        initDB: initDB
    };

})();
