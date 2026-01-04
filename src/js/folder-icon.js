/**
 * Folder Icon Management
 * Handles changing custom folder icons
 */

// Available icons from Font Awesome
const FOLDER_ICONS = [
    'fa-briefcase',
    'fa-home',
    'fa-star',
    'fa-heart',
    'fa-lightbulb',
    'fa-image',
    'fa-video',
    'fa-music',
    'fa-book',
    'fa-graduation-cap',
    'fa-code',
    'fa-rocket',
    'fa-plane',
    'fa-map-marker-alt',
    'fa-calendar-alt',
    'fa-clock',
    'fa-user',
    'fa-users',
    'fa-cog',
    'fa-wrench',
    'fa-paint-brush',
    'fa-palette',
    'fa-camera',
    'fa-shield',
    'fa-lock',
    'fa-key',
    'fa-envelope',
    'fa-inbox',
    'fa-archive',
    'fa-box',
    'fa-shopping-cart',
    'fa-credit-card',
    'fa-chart-line',
    'fa-chart-bar',
    'fa-database',
    'fa-server',
    'fa-cloud',
    'fa-download',
    'fa-upload',
    'fa-tasks',
    'fa-clipboard',
    'fa-file-alt',
    'fa-copy',
    'fa-gamepad',
    'fa-trophy',
    'fa-gift',
    'fa-birthday-cake',
    'fa-coffee',
    'fa-pizza-slice',
    'fa-utensils',
    'fa-medkit',
    'fa-heartbeat',
    'fa-dumbbell',
    'fa-bicycle',
    'fa-tree',
    'fa-leaf',
    'fa-seedling',
    'fa-paw',
    'fa-bug',
    'fa-flask',
    'fa-atom',
    'fa-magnet',
    'fa-fire',
    'fa-sun',
    'fa-moon',
    'fa-umbrella',
    'fa-snowflake',
    'fa-bolt',
    'fa-flag',
    'fa-bookmark',
    'fa-thumbs-up',
    'fa-smile',
    'fa-layer-group',
    'fa-terminal',
    'fa-at',
    'fa-hashtag',
    'fa-question-circle',
    'fa-times-circle',
    'fa-eye'
];

let currentFolderIdForIcon = null;
let currentFolderNameForIcon = null;
let selectedIconClass = null;

/**
 * Show the folder icon selection modal
 */
function showChangeFolderIconModal(folderId, folderName) {
    currentFolderIdForIcon = folderId;
    currentFolderNameForIcon = folderName;
    selectedIconClass = null;
    
    // Get the modal
    const modal = document.getElementById('folderIconModal');
    if (!modal) return;
    
    // Populate icon grid
    const iconGrid = document.getElementById('folderIconGrid');
    if (!iconGrid) return;
    
    iconGrid.innerHTML = '';
    
    // Get the current folder icon (if any)
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"] .folder-icon`);
    let currentIcon = null;
    if (folderElement) {
        for (let iconClass of FOLDER_ICONS) {
            if (folderElement.classList.contains(iconClass)) {
                currentIcon = iconClass;
                break;
            }
        }
    }
    
    // Create icon items
    FOLDER_ICONS.forEach(iconClass => {
        const iconItem = document.createElement('div');
        iconItem.className = 'folder-icon-item';
        if (iconClass === currentIcon) {
            iconItem.classList.add('selected');
            selectedIconClass = iconClass;
        }
        
        const icon = document.createElement('i');
        icon.className = iconClass;
        
        iconItem.appendChild(icon);
        iconItem.addEventListener('click', function() {
            // Remove selected class from all items
            document.querySelectorAll('.folder-icon-item').forEach(item => {
                item.classList.remove('selected');
            });
            // Add selected class to clicked item
            iconItem.classList.add('selected');
            selectedIconClass = iconClass;
            
            // Apply the icon immediately
            saveFolderIcon();
        });
        
        iconGrid.appendChild(iconItem);
    });
    
    // Show modal
    modal.style.display = 'block';
}

/**
 * Close the folder icon modal
 */
function closeFolderIconModal() {
    const modal = document.getElementById('folderIconModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentFolderIdForIcon = null;
    currentFolderNameForIcon = null;
    selectedIconClass = null;
}

/**
 * Save the selected folder icon
 */
function saveFolderIcon() {
    if (!currentFolderIdForIcon || !selectedIconClass) return;
    
    // Send request to API
    fetch('/api/v1/folders/' + currentFolderIdForIcon + '/icon', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            icon: selectedIconClass
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the icon in the UI
            updateFolderIconInUI(currentFolderIdForIcon, selectedIconClass);
            
            // Close modal
            closeFolderIconModal();
            
            // Show success notification
            if (typeof window.showNotification === 'function') {
                window.showNotification(window.i18n?.t('notifications.folder_icon_updated') || 'Folder icon updated successfully', 'success');
            }
        } else {
            console.error('Failed to update folder icon:', data.message);
            if (typeof window.showNotification === 'function') {
                window.showNotification(data.message || (window.i18n?.t('notifications.error') || 'An error occurred'), 'error');
            }
        }
    })
    .catch(error => {
        console.error('Error updating folder icon:', error);
        if (typeof window.showNotification === 'function') {
            window.showNotification(window.i18n?.t('notifications.error') || 'An error occurred', 'error');
        }
    });
}

/**
 * Reset folder icon to default
 */
function resetFolderIcon() {
    if (!currentFolderIdForIcon) return;
    
    // Send request to API to clear icon
    fetch('/api/v1/folders/' + currentFolderIdForIcon + '/icon', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            icon: ''
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Reload the page
            window.location.reload();
        } else {
            console.error('Failed to reset folder icon:', data.message);
            if (typeof window.showNotification === 'function') {
                window.showNotification(data.message || (window.i18n?.t('notifications.error') || 'An error occurred'), 'error');
            }
        }
    })
    .catch(error => {
        console.error('Error resetting folder icon:', error);
        if (typeof window.showNotification === 'function') {
            window.showNotification(window.i18n?.t('notifications.error') || 'An error occurred', 'error');
        }
    });
}

/**
 * Update folder icon in the UI
 */
function updateFolderIconInUI(folderId, iconClass) {
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"] .folder-icon`);
    if (!folderElement) return;
    
    // Remove all icon classes (including default folder icons)
    const allIconsToRemove = [...FOLDER_ICONS, 'fa-folder', 'fa-folder-open'];
    allIconsToRemove.forEach(icon => {
        folderElement.classList.remove(icon);
    });
    
    // Add new icon class or default
    if (iconClass) {
        folderElement.classList.add(iconClass);
        folderElement.setAttribute('data-custom-icon', 'true');
    } else {
        // Default icons
        folderElement.classList.add('fa-folder');
        folderElement.setAttribute('data-custom-icon', 'false');
    }
}

// Export functions to window
window.showChangeFolderIconModal = showChangeFolderIconModal;
window.closeFolderIconModal = closeFolderIconModal;
window.resetFolderIcon = resetFolderIcon;

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Close modal button
    const closeButtons = document.querySelectorAll('[data-action="close-folder-icon-modal"]');
    closeButtons.forEach(button => {
        button.addEventListener('click', closeFolderIconModal);
    });
    
    // Reset icon button
    const resetButton = document.getElementById('resetFolderIconBtn');
    if (resetButton) {
        resetButton.addEventListener('click', resetFolderIcon);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('folderIconModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeFolderIconModal();
            }
        });
    }
});
