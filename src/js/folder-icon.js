/**
 * Folder Icon Management
 * Handles changing custom folder icons
 */

// Available icons from Font Awesome with their translation keys
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
    'fa-eye',
    'fa-anchor',
    'fa-apple-alt',
    'fa-award',
    'fa-bell',
    'fa-binoculars',
    'fa-book-open',
    'fa-briefcase-medical',
    'fa-brush',
    'fa-building',
    'fa-bus',
    'fa-calculator',
    'fa-candy-cane',
    'fa-car',
    'fa-certificate',
    'fa-chart-network',
    'fa-chart-pie',
    'fa-chess',
    'fa-clipboard-list',
    'fa-cloud-sun',
    'fa-coins',
    'fa-comment',
    'fa-compass',
    'fa-crown',
    'fa-cube',
    'fa-cubes',
    'fa-desktop',
    'fa-diploma',
    'fa-dna',
    'fa-dollar-sign',
    'fa-dragon',
    'fa-drum',
    'fa-elephant',
    'fa-euro-sign',
    'fa-feather',
    'fa-file-code',
    'fa-file-contract',
    'fa-file-invoice',
    'fa-film',
    'fa-fingerprint',
    'fa-folder-tree',
    'fa-gem',
    'fa-glasses',
    'fa-globe-americas',
    'fa-globe-asia',
    'fa-globe-europe',
    'fa-guitar',
    'fa-hamburger',
    'fa-hammer',
    'fa-hard-hat',
    'fa-headphones',
    'fa-headset',
    'fa-hiking',
    'fa-hospital',
    'fa-icons',
    'fa-id-badge',
    'fa-id-card',
    'fa-industry',
    'fa-infinity',
    'fa-jedi',
    'fa-laptop',
    'fa-laptop-code',
    'fa-lightbulb-dollar',
    'fa-map',
    'fa-medal',
    'fa-microphone',
    'fa-microscope',
    'fa-money-bill',
    'fa-mountain',
    'fa-mug-hot',
    'fa-network-wired',
    'fa-passport',
    'fa-pen',
    'fa-pencil-alt',
    'fa-pepper-hot',
    'fa-phone',
    'fa-piggy-bank',
    'fa-plane-alt',
    'fa-plane-departure',
    'fa-plug',
    'fa-print',
    'fa-project-diagram',
    'fa-puzzle-piece',
    'fa-receipt',
    'fa-robot',
    'fa-running',
    'fa-satellite',
    'fa-satellite-dish',
    'fa-school',
    'fa-screwdriver',
    'fa-scroll',
    'fa-shield-alt',
    'fa-shopping-bag',
    'fa-sign',
    'fa-sitemap',
    'fa-snowman',
    'fa-solar-panel',
    'fa-spa',
    'fa-space-shuttle',
    'fa-stamp',
    'fa-stethoscope',
    'fa-store',
    'fa-store-alt',
    'fa-suitcase',
    'fa-sun-cloud',
    'fa-swimmer',
    'fa-sync',
    'fa-syringe',
    'fa-tablet',
    'fa-tachometer-alt',
    'fa-tag',
    'fa-tags',
    'fa-theater-masks',
    'fa-toilet-paper',
    'fa-toolbox',
    'fa-tooth',
    'fa-tools',
    'fa-tractor',
    'fa-trash-alt',
    'fa-tree-alt',
    'fa-truck',
    'fa-tv',
    'fa-umbrella-beach',
    'fa-university',
    'fa-user-graduate',
    'fa-utensil-spoon',
    'fa-vial',
    'fa-video',
    'fa-walking',
    'fa-wallet',
    'fa-warehouse',
    'fa-water',
    'fa-weight',
    'fa-wifi',
    'fa-wind',
    'fa-yen-sign',
    'fa-columns'
];

let currentFolderIdForIcon = null;
let currentFolderNameForIcon = null;
let selectedIconClass = null;
let selectedIconColor = '';

/**
 * Get translated name for an icon
 */
function getIconTranslation(iconClass) {
    const iconKey = iconClass.replace('fa-', '');
    const translationKey = `icon_names.${iconKey}`;
    return window.t ? window.t(translationKey, null, iconKey.replace(/-/g, ' ')) : iconKey.replace(/-/g, ' ');
}

/**
 * Show the folder icon selection modal
 */
function showChangeFolderIconModal(folderId, folderName) {
    currentFolderIdForIcon = folderId;
    currentFolderNameForIcon = folderName;
    // '' means: use default folder icon (toggle open/closed). null means: not initialized.
    selectedIconClass = null;
    selectedIconColor = '';

    // Get the modal
    const modal = document.getElementById('folderIconModal');
    if (!modal) return;

    // Populate icon grid
    const iconGrid = document.getElementById('folderIconGrid');
    if (!iconGrid) return;

    iconGrid.innerHTML = '';

    // Get the current folder icon and color (if any)
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"] .folder-icon`);
    let currentIcon = null;
    let currentColor = '';
    if (folderElement) {
        for (let iconClass of FOLDER_ICONS) {
            if (folderElement.classList.contains(iconClass)) {
                currentIcon = iconClass;
                break;
            }
        }
        // Get current color from data attribute or inline style
        currentColor = folderElement.getAttribute('data-icon-color') || '';
    }

    // If no custom icon is set, we consider this folder to be using the default toggle icon.
    selectedIconClass = currentIcon || '';

    // Create a "Default" icon item (keeps the open/closed toggle behaviour)
    const defaultIconItem = document.createElement('div');
    defaultIconItem.className = 'folder-icon-item';
    defaultIconItem.dataset.iconClass = '';
    defaultIconItem.dataset.iconName = (window.t ? window.t('folder_icon.default', null, 'Default') : 'Default');
    defaultIconItem.title = defaultIconItem.dataset.iconName;

    if (selectedIconClass === '') {
        defaultIconItem.classList.add('selected');
        setTimeout(() => {
            defaultIconItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    const defaultIcon = document.createElement('i');
    // Use the same base class style as existing UI (no need to add "fas")
    defaultIcon.className = 'fa-folder';
    defaultIconItem.appendChild(defaultIcon);

    defaultIconItem.addEventListener('click', function () {
        document.querySelectorAll('.folder-icon-item').forEach(item => {
            item.classList.remove('selected');
        });
        defaultIconItem.classList.add('selected');
        selectedIconClass = '';
    });

    iconGrid.appendChild(defaultIconItem);

    // Create icon items
    FOLDER_ICONS.forEach(iconClass => {
        const iconItem = document.createElement('div');
        iconItem.className = 'folder-icon-item';
        iconItem.dataset.iconClass = iconClass;
        iconItem.dataset.iconName = getIconTranslation(iconClass);
        iconItem.title = getIconTranslation(iconClass);

        if (iconClass === currentIcon) {
            iconItem.classList.add('selected');
            selectedIconClass = iconClass;
            // Scroll selected icon into view
            setTimeout(() => {
                iconItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }

        const icon = document.createElement('i');
        icon.className = iconClass;

        iconItem.appendChild(icon);
        iconItem.addEventListener('click', function () {
            // Remove selected class from all items
            document.querySelectorAll('.folder-icon-item').forEach(item => {
                item.classList.remove('selected');
            });
            // Add selected class to clicked item
            iconItem.classList.add('selected');
            selectedIconClass = iconClass;

            // Don't save immediately - let user choose color first
        });

        iconGrid.appendChild(iconItem);
    });

    // Setup color picker
    setupColorPicker(currentColor);
    if (currentColor) {
        selectedIconColor = currentColor;
    }

    // Setup search functionality
    const searchInput = document.getElementById('folderIconSearchInput');
    if (searchInput) {
        // Clear previous value
        searchInput.value = '';

        // Remove previous event listeners by cloning the element
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        // Add new event listener
        newSearchInput.addEventListener('input', function (e) {
            filterIcons(e.target.value);
        });

        // Focus on search input
        setTimeout(() => newSearchInput.focus(), 100);
    }

    // Setup Apply button
    const applyBtn = document.getElementById('applyFolderIconBtn');
    if (applyBtn) {
        // Remove previous event listeners by cloning the element
        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);

        // Add click event to save icon and color
        newApplyBtn.addEventListener('click', function () {
            // Allow applying a color even when keeping the default folder icon (selectedIconClass === '')
            if (selectedIconClass !== null) saveFolderIcon();
        });
    }

    // Show modal
    modal.style.display = 'block';
}

/**
 * Setup color picker
 */
function setupColorPicker(currentColor) {
    const colorOptions = document.querySelectorAll('.folder-color-option');

    colorOptions.forEach(option => {
        const color = option.getAttribute('data-color');

        // Mark current color as selected (case-insensitive)
        if (color && currentColor && color.toLowerCase() === currentColor.toLowerCase()) {
            option.classList.add('selected');
        } else if (!color && !currentColor) {
            // Both are empty/falsy, so it's the default color
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }

        // Add click event
        option.addEventListener('click', function () {
            // Remove selected class from all color options
            document.querySelectorAll('.folder-color-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            // Add selected class to clicked option
            option.classList.add('selected');
            selectedIconColor = color;

            // Don't save immediately - let user confirm with Apply button
        });
    });
}

/**
 * Filter icons based on search query
 */
function filterIcons(searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    const iconItems = document.querySelectorAll('.folder-icon-item');

    iconItems.forEach(item => {
        const iconName = item.dataset.iconName.toLowerCase();
        const iconClass = item.dataset.iconClass.toLowerCase();

        // Show if query matches icon name or icon class
        if (iconName.includes(query) || iconClass.includes(query)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
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
    selectedIconColor = '';
}

/**
 * Save the selected folder icon
 */
function saveFolderIcon() {
    // selectedIconClass can be '' to keep the default toggle icon
    if (!currentFolderIdForIcon || selectedIconClass === null) return;

    // Send request to API
    fetch('/api/v1/folders/' + currentFolderIdForIcon + '/icon', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            icon: selectedIconClass,
            icon_color: selectedIconColor
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update the icon in the UI
                updateFolderIconInUI(currentFolderIdForIcon, selectedIconClass, selectedIconColor);

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
            icon: '',
            icon_color: ''
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update the icon in the UI (default toggle + default color)
                updateFolderIconInUI(currentFolderIdForIcon, '', '');
                closeFolderIconModal();
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
function updateFolderIconInUI(folderId, iconClass, iconColor) {
    const elementsToUpdate = [];

    // 1. Update in the notes list (sidebar) - find only direct child icon
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
    if (folderElement) {
        // Find only the direct child .folder-icon (not descendants from subfolders)
        // Use > child combinator to target only immediate children within .folder-toggle
        const iconElement = folderElement.querySelector(':scope > .folder-toggle > .folder-icon');
        if (iconElement) {
            elementsToUpdate.push(iconElement);
        }
    }

    // 2. Update in Kanban view
    // In kanban view, the icon has data-folder-id directly on it
    const kanbanIcons = document.querySelectorAll(`.kanban-title .folder-icon[data-folder-id="${folderId}"], .kanban-column-header .folder-icon[data-folder-id="${folderId}"]`);
    kanbanIcons.forEach(icon => {
        if (!elementsToUpdate.includes(icon)) {
            elementsToUpdate.push(icon);
        }
    });

    if (elementsToUpdate.length === 0) {
        return;
    }

    elementsToUpdate.forEach(folderIconElement => {
        // Remove all icon classes (including default folder icons)
        const allIconsToRemove = [...FOLDER_ICONS, 'fa-folder', 'fa-folder-open'];
        allIconsToRemove.forEach(icon => {
            folderIconElement.classList.remove(icon);
        });

        // Add new icon class or default
        if (iconClass) {
            folderIconElement.classList.add(iconClass);
            folderIconElement.setAttribute('data-custom-icon', 'true');
        } else {
            // Default icons (can toggle open/closed in the sidebar)
            const isSidebarFolderIcon = !!folderIconElement.closest('.folder-toggle');
            if (isSidebarFolderIcon) {
                const folderContent = document.getElementById('folder-' + folderId);
                const isOpen = folderContent && window.getComputedStyle(folderContent).display !== 'none';
                folderIconElement.classList.add(isOpen ? 'fa-folder-open' : 'fa-folder');
            } else {
                folderIconElement.classList.add('fa-folder');
            }
            folderIconElement.setAttribute('data-custom-icon', 'false');
        }

        // Apply color with !important to override CSS rules
        if (iconColor) {
            folderIconElement.style.setProperty('color', iconColor, 'important');
            folderIconElement.setAttribute('data-icon-color', iconColor);
        } else {
            folderIconElement.style.removeProperty('color');
            folderIconElement.removeAttribute('data-icon-color');
        }
    });
}

// Export functions to window
window.showChangeFolderIconModal = showChangeFolderIconModal;
window.closeFolderIconModal = closeFolderIconModal;
window.resetFolderIcon = resetFolderIcon;

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
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
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeFolderIconModal();
            }
        });
    }
});
