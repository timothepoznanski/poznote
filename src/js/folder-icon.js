/**
 * Folder Icon Management
 * Handles changing custom folder icons
 */

// Available folder icons.
const FOLDER_ICONS = [
    'lucide-briefcase',
    'lucide-home',
    'lucide-star',
    'lucide-heart',
    'lucide-lightbulb',
    'lucide-image',
    'lucide-video',
    'lucide-music',
    'lucide-book',
    'lucide-graduation-cap',
    'lucide-code',
    'lucide-rocket',
    'lucide-plane',
    'lucide-map-pin',
    'lucide-calendar',
    'lucide-clock',
    'lucide-user',
    'lucide-users',
    'lucide-settings',
    'lucide-wrench',
    'lucide-brush',
    'lucide-palette',
    'lucide-camera',
    'lucide-shield',
    'lucide-lock',
    'lucide-key',
    'lucide-mail',
    'lucide-inbox',
    'lucide-archive',
    'lucide-box',
    'lucide-shopping-cart',
    'lucide-credit-card',
    'lucide-trending-up',
    'lucide-bar-chart',
    'lucide-database',
    'lucide-server',
    'lucide-cloud',
    'lucide-download',
    'lucide-upload',
    'lucide-list-todo',
    'lucide-clipboard',
    'lucide-file-text',
    'lucide-copy',
    'lucide-file',
    'lucide-file-alt',
    'lucide-file-image',
    'lucide-file-video',
    'lucide-file-plus',
    'lucide-file-minus',
    'lucide-sticky-note',
    'lucide-newspaper',
    'lucide-paperclip',
    'lucide-table',
    'lucide-grid',
    'lucide-layout-dashboard',
    'lucide-layout-list',
    'lucide-heading',
    'lucide-pilcrow',
    'lucide-quote',
    'lucide-type',
    'lucide-folder-closed',
    'lucide-folder-open',
    'lucide-folder-plus',
    'lucide-folder-minus',
    'lucide-folder-output',
    'lucide-app-window',
    'lucide-smartphone',
    'lucide-chrome',
    'lucide-github',
    'lucide-git-fork',
    'lucide-git-merge',
    'lucide-git-pull-request',
    'lucide-laptop-code',
    'lucide-code-branch',
    'lucide-message-square',
    'lucide-alert-circle',
    'lucide-alert-triangle',
    'lucide-ban',
    'lucide-info',
    'lucide-check-circle',
    'lucide-circle-dot',
    'lucide-target',
    'lucide-crosshair',
    'lucide-scan',
    'lucide-qr-code',
    'lucide-barcode',
    'lucide-ribbon',
    'lucide-diamond',
    'lucide-triangle',
    'lucide-square',
    'lucide-circle',
    'lucide-battery',
    'lucide-volume-1',
    'lucide-volume-2',
    'lucide-volume-x',
    'lucide-lock-open',
    'lucide-unlock',
    'lucide-history',
    'lucide-share-2',
    'lucide-save-all',
    'lucide-gamepad-2',
    'lucide-trophy',
    'lucide-gift',
    'lucide-cake',
    'lucide-coffee',
    'lucide-pizza',
    'lucide-utensils-crossed',
    'lucide-briefcase-medical',
    'lucide-activity',
    'lucide-dumbbell',
    'lucide-bike',
    'lucide-tree-deciduous',
    'lucide-leaf',
    'lucide-sprout',
    'lucide-paw-print',
    'lucide-bug',
    'lucide-flask-conical',
    'lucide-atom',
    'lucide-magnet',
    'lucide-flame',
    'lucide-sun',
    'lucide-moon',
    'lucide-umbrella',
    'lucide-snowflake',
    'lucide-zap',
    'lucide-flag',
    'lucide-bookmark',
    'lucide-thumbs-up',
    'lucide-smile',
    'lucide-layers',
    'lucide-terminal',
    'lucide-at-sign',
    'lucide-hash',
    'lucide-help-circle',
    'lucide-x-circle',
    'lucide-eye',
    'lucide-anchor',
    'lucide-apple',
    'lucide-award',
    'lucide-bell',
    'lucide-binoculars',
    'lucide-book-open',
    'lucide-building',
    'lucide-bus',
    'lucide-calculator',
    'lucide-candy',
    'lucide-car',
    'lucide-badge-check',
    'lucide-network',
    'lucide-pie-chart',
    'lucide-crown',
    'lucide-clipboard-list',
    'lucide-cloud-sun',
    'lucide-coins',
    'lucide-message-circle',
    'lucide-compass',
    'lucide-boxes',
    'lucide-monitor',
    'lucide-scroll',
    'lucide-dna',
    'lucide-dollar-sign',
    'lucide-drum',
    'lucide-euro',
    'lucide-feather',
    'lucide-file-code',
    'lucide-film',
    'lucide-fingerprint',
    'lucide-folder-tree',
    'lucide-gem',
    'lucide-glasses',
    'lucide-globe',
    'lucide-guitar',
    'lucide-hamburger',
    'lucide-hammer',
    'lucide-hard-hat',
    'lucide-headphones',
    'lucide-headset',
    'lucide-mountain',
    'lucide-hospital',
    'lucide-shapes',
    'lucide-id-card',
    'lucide-factory',
    'lucide-infinity',
    'lucide-swords',
    'lucide-laptop',
    'lucide-map',
    'lucide-medal',
    'lucide-mic',
    'lucide-microscope',
    'lucide-banknote',
    'lucide-passport',
    'lucide-pen',
    'lucide-pencil',
    'lucide-pepper',
    'lucide-phone',
    'lucide-piggy-bank',
    'lucide-plane-takeoff',
    'lucide-plug',
    'lucide-printer',
    'lucide-puzzle',
    'lucide-receipt',
    'lucide-bot',
    'lucide-person-standing',
    'lucide-satellite',
    'lucide-satellite-dish',
    'lucide-school',
    'lucide-shopping-bag',
    'lucide-signpost',
    'lucide-git-branch',
    'lucide-flower',
    'lucide-stamp',
    'lucide-stethoscope',
    'lucide-store',
    'lucide-waves',
    'lucide-refresh-cw',
    'lucide-syringe',
    'lucide-tablet',
    'lucide-gauge',
    'lucide-tag',
    'lucide-tags',
    'lucide-drama',
    'lucide-tools',
    'lucide-tractor',
    'lucide-trash-alt',
    'lucide-tree-alt',
    'lucide-truck',
    'lucide-tv',
    'lucide-umbrella-beach',
    'lucide-utensil-spoon',
    'lucide-vial',
    'lucide-walking',
    'lucide-wallet',
    'lucide-warehouse',
    'lucide-weight',
    'lucide-wifi',
    'lucide-wind',
    'lucide-yen-sign',
    'lucide-columns',
    // Animals
    'lucide-bird',
    'lucide-cat',
    'lucide-dog',
    'lucide-fish',
    'lucide-fish-symbol',
    'lucide-rabbit',
    'lucide-rat',
    'lucide-snail',
    'lucide-squirrel',
    'lucide-turtle',
    'lucide-worm',
    'lucide-panda',
    'lucide-shrimp',
    'lucide-shell',
    'lucide-bone',
    'lucide-egg',
    'lucide-origami',
    // Food & drink
    'lucide-banana',
    'lucide-carrot',
    'lucide-cherry',
    'lucide-citrus',
    'lucide-cookie',
    'lucide-croissant',
    'lucide-cup-soda',
    'lucide-dessert',
    'lucide-donut',
    'lucide-egg-fried',
    'lucide-grape',
    'lucide-ham',
    'lucide-beef',
    'lucide-ice-cream-bowl',
    'lucide-ice-cream-cone',
    'lucide-lollipop',
    'lucide-martini',
    'lucide-milk',
    'lucide-popcorn',
    'lucide-popsicle',
    'lucide-salad',
    'lucide-sandwich',
    'lucide-soup',
    'lucide-wheat',
    'lucide-wine',
    'lucide-beer',
    'lucide-candy-cane',
    'lucide-chef-hat',
    'lucide-cooking-pot',
    'lucide-utensils',
    // Weather & nature
    'lucide-cloud-rain',
    'lucide-cloud-snow',
    'lucide-cloud-lightning',
    'lucide-cloud-moon',
    'lucide-cloud-fog',
    'lucide-rainbow',
    'lucide-sunrise',
    'lucide-sunset',
    'lucide-thermometer',
    'lucide-tornado',
    'lucide-droplet',
    'lucide-droplets',
    'lucide-trees',
    'lucide-tree-palm',
    'lucide-tree-pine',
    'lucide-tent-tree',
    'lucide-clover',
    'lucide-flower-2',
    'lucide-mountain-snow',
    'lucide-sun-snow',
    'lucide-moon-star',
    'lucide-sparkles',
    // Transport
    'lucide-ship',
    'lucide-ship-wheel',
    'lucide-sailboat',
    'lucide-train-front',
    'lucide-tram-front',
    'lucide-ambulance',
    'lucide-fuel',
    'lucide-car-front',
    'lucide-caravan',
    'lucide-forklift',
    // Music & media
    'lucide-piano',
    'lucide-radio',
    'lucide-disc',
    'lucide-speaker',
    'lucide-boom-box',
    'lucide-mic-vocal',
    'lucide-clapperboard',
    'lucide-podcast',
    'lucide-audio-lines',
    // Games & sport
    'lucide-volleyball',
    'lucide-dices',
    'lucide-dice-5',
    'lucide-spade',
    'lucide-club',
    'lucide-joystick',
    'lucide-tent',
    'lucide-footprints',
    'lucide-telescope',
    // Home & objects
    'lucide-lamp',
    'lucide-lamp-desk',
    'lucide-bed',
    'lucide-sofa',
    'lucide-armchair',
    'lucide-bath',
    'lucide-shirt',
    'lucide-watch',
    'lucide-backpack',
    'lucide-luggage',
    'lucide-alarm-clock',
    'lucide-hourglass',
    'lucide-scissors',
    'lucide-ruler',
    'lucide-pipette',
    'lucide-wand',
    'lucide-party-popper',
    // Tech
    'lucide-keyboard',
    'lucide-mouse',
    'lucide-cpu',
    'lucide-hard-drive',
    'lucide-usb',
    'lucide-bluetooth',
    'lucide-router',
    'lucide-webcam',
    'lucide-projector',
    // Places
    'lucide-castle',
    'lucide-church',
    'lucide-landmark',
    'lucide-hotel',
    'lucide-library',
    // People & symbols
    'lucide-brain',
    'lucide-skull',
    'lucide-ghost',
    'lucide-baby',
    'lucide-accessibility',
    'lucide-percent',
    'lucide-sparkle',
    'lucide-sigma',
    'lucide-pi',
    'lucide-recycle',
    'lucide-biohazard',
    'lucide-radiation',
    'lucide-heart-pulse',
    'lucide-frown',
    'lucide-laugh',
    'lucide-angry',
    'lucide-meh',
    'lucide-sun-moon',
    'lucide-handshake'
];

const DEFAULT_NOTE_ICON = 'lucide-file-text';

// Every default icon a note can fall back to, so the reset path can strip
// whichever one is currently applied before adding the new class.
const DEFAULT_NOTE_ICONS = ['lucide-file-text', 'lucide-list-todo', 'lucide-file-code'];

/**
 * Default icon of a note that has no custom icon.
 *
 * The server stamps the resolved default on the icon element (it depends on the
 * note type and on the 'type_based_note_icons' setting), so read it from there
 * and only fall back to the generic file icon when the attribute is missing.
 */
function getDefaultNoteIcon(noteIconElement) {
    const stamped = noteIconElement && noteIconElement.getAttribute
        ? noteIconElement.getAttribute('data-default-icon')
        : '';
    return stamped || DEFAULT_NOTE_ICON;
}

// Recently used icons (per-user storage, most recent first)
const RECENT_ICONS_KEY = 'recent_icons';
const RECENT_ICONS_MAX = 12;

function getRecentIcons() {
    try {
        const raw = (window.__poznoteUserStorage || localStorage).getItem(RECENT_ICONS_KEY);
        const recents = JSON.parse(raw || '[]');
        return Array.isArray(recents) ? recents.filter(cls => FOLDER_ICONS.includes(cls)) : [];
    } catch (e) {
        return [];
    }
}

function addRecentIcon(iconClass) {
    if (!iconClass) return;
    const recents = getRecentIcons().filter(cls => cls !== iconClass);
    recents.unshift(iconClass);
    try {
        (window.__poznoteUserStorage || localStorage).setItem(RECENT_ICONS_KEY, JSON.stringify(recents.slice(0, RECENT_ICONS_MAX)));
    } catch (e) {
        // Storage unavailable: recents are a convenience only
    }
}

let currentIconTargetType = 'folder';
let currentFolderIdForIcon = null;
let currentFolderNameForIcon = null;
let selectedIconClass = null;
let selectedIconColor = '';

/**
 * Mapping from Lucide icon names to Font Awesome icon names (used in translations)
 */
const LUCIDE_TO_FA_MAPPING = {
    'map-pin': 'map-marker-alt',
    'calendar': 'calendar-alt',
    'cake': 'birthday-cake',
    'mail': 'envelope',
    'video': 'film',
    'trending-up': 'chart-line',
    'bar-chart': 'chart-bar',
    'list-todo': 'tasks',
    'file-text': 'file-alt',
    'gamepad-2': 'gamepad',
    'pizza': 'pizza-slice',
    'utensils-crossed': 'utensils',
    'briefcase-medical': 'medkit',
    'activity': 'heartbeat',
    'bike': 'bicycle',
    'tree-deciduous': 'tree',
    'sprout': 'seedling',
    'paw-print': 'paw',
    'flask-conical': 'flask',
    'flame': 'fire',
    'zap': 'bolt',
    'layers': 'layer-group',
    'at-sign': 'at',
    'hash': 'hashtag',
    'help-circle': 'question-circle',
    'x-circle': 'times-circle',
    'apple': 'apple-alt',
    'candy': 'candy-cane',
    'badge-check': 'certificate',
    'network': 'chart-network',
    'pie-chart': 'chart-pie',
    'crown': 'chess',
    'clipboard-list': 'clipboard-list',
    'boxes': 'cubes',
    'monitor': 'desktop',
    'scroll': 'diploma',
    'message-circle': 'comment',
    'globe': 'globe-americas',
    'mountain': 'hiking',
    'shapes': 'icons',
    'id-card': 'id-badge',
    'factory': 'industry',
    'swords': 'sword',
    'banknote': 'money',
    'passport': 'passport',
    'pepper': 'pepper-hot',
    'piggy-bank': 'piggy-bank',
    'plane-takeoff': 'plane-departure',
    'receipt': 'receipt',
    'bot': 'robot',
    'person-standing': 'user',
    'satellite-dish': 'satellite-dish',
    'school': 'school',
    'shopping-bag': 'shopping-bag',
    'signpost': 'directions',
    'git-branch': 'code-branch',
    'flower': 'spa',
    'stamp': 'stamp',
    'stethoscope': 'stethoscope',
    'store': 'store',
    'waves': 'wave',
    'refresh-cw': 'sync',
    'gauge': 'tachometer',
    'drama': 'theater-masks',
    'tools': 'tools',
    'tractor': 'tractor',
    'trash-alt': 'trash',
    'tree-alt': 'tree',
    'umbrella-beach': 'umbrella-beach',
    'utensil-spoon': 'utensil-spoon',
    'vial': 'vial',
    'walking': 'walking',
    'wallet': 'wallet',
    'warehouse': 'warehouse',
    'weight': 'weight',
    'wifi': 'wifi',
    'wind': 'wind',
    'yen-sign': 'yen-sign',
    'columns': 'columns'
};

/**
 * Get translated name for an icon
 */
function getIconTranslation(iconClass) {
    // Extract icon name from class (e.g., "lucide-briefcase" -> "briefcase")
    let iconKey = iconClass;
    
    // Remove "lucide-" prefix or "lucide " prefix
    iconKey = iconKey.replace(/^lucide-/, '').replace(/^lucide\s+/, '');
    
    // If it's a space-separated class list, get the first icon name
    const parts = iconKey.trim().split(/\s+/);
    iconKey = parts[0] || iconClass;
    
    // Try to map Lucide name to Font Awesome name for translations
    const faIconKey = LUCIDE_TO_FA_MAPPING[iconKey] || iconKey;
    const translationKey = `icon_names.${faIconKey}`;
    
    // Call window.t with the translation key
    return window.t ? window.t(translationKey, null, iconKey.replace(/-/g, ' ')) : iconKey.replace(/-/g, ' ');
}

/**
 * Show the folder icon selection modal
 */
function showChangeFolderIconModal(folderId, folderName) {
    showChangeIconModal('folder', folderId, folderName);
}

/**
 * Show the note icon selection modal using the same modal as folders.
 */
function showChangeNoteIconModal(noteId, noteTitle) {
    showChangeIconModal('note', noteId, noteTitle);
}

function showChangeIconModal(targetType, targetId, targetName) {
    currentIconTargetType = targetType === 'note' ? 'note' : 'folder';
    currentFolderIdForIcon = targetId;
    currentFolderNameForIcon = targetName;
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
    const folderElement = currentIconTargetType === 'note'
        ? document.querySelector(`.note-icon[data-note-id="${targetId}"]`)
        : document.querySelector(`[data-folder-id="${targetId}"] .folder-icon`);
    let currentIcon = null;
    let currentColor = '';
    if (folderElement) {
        const usesDefaultIcon = folderElement.getAttribute('data-custom-icon') === 'false';
        if (!usesDefaultIcon) {
            for (let iconClass of FOLDER_ICONS) {
                if (folderElement.classList.contains(iconClass)) {
                    currentIcon = iconClass;
                    break;
                }
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
    defaultIcon.className = currentIconTargetType === 'note' ? getDefaultNoteIcon(folderElement) : 'lucide-folder';
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
        const iconItem = buildIconGridItem(iconClass);

        if (iconClass === currentIcon) {
            iconItem.classList.add('selected');
            selectedIconClass = iconClass;
            // Scroll selected icon into view
            setTimeout(() => {
                iconItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }

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

        // Focus on search input only on non-touch devices to avoid opening keyboard on mobile
        if (!('ontouchstart' in window)) {
            setTimeout(() => newSearchInput.focus(), 100);
        }
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
    modal.style.display = 'flex';
    modal.style.alignItems = 'flex-start';

    // Populate the recently used row (after showing the modal, so the
    // single-row trimming below can measure the layout)
    populateRecentIcons();
}

/**
 * Fill the recently used row, keeping only the icons that fit on one line
 */
function populateRecentIcons() {
    const recentSection = document.getElementById('folderIconRecentSection');
    const recentGrid = document.getElementById('folderIconRecentGrid');
    if (!recentSection || !recentGrid) return;

    recentGrid.innerHTML = '';
    const recents = getRecentIcons();
    if (!recents.length) {
        recentSection.style.display = 'none';
        return;
    }

    recentSection.style.display = '';
    recents.forEach(iconClass => {
        recentGrid.appendChild(buildIconGridItem(iconClass));
    });

    // Remove items that wrapped to a second line
    const items = recentGrid.children;
    if (items.length) {
        const firstTop = items[0].offsetTop;
        for (let i = items.length - 1; i > 0; i--) {
            if (items[i].offsetTop > firstTop) {
                recentGrid.removeChild(items[i]);
            }
        }
    }
}

/**
 * Build a selectable icon item for the picker grids (main grid and recent row)
 */
function buildIconGridItem(iconClass) {
    const iconItem = document.createElement('div');
    iconItem.className = 'folder-icon-item';
    iconItem.dataset.iconClass = iconClass;
    iconItem.dataset.iconName = getIconTranslation(iconClass);
    iconItem.title = iconItem.dataset.iconName;

    const icon = document.createElement('i');
    icon.className = iconClass;
    iconItem.appendChild(icon);

    iconItem.addEventListener('click', function () {
        // Remove selected class from all items (both grids)
        document.querySelectorAll('.folder-icon-item').forEach(item => {
            item.classList.remove('selected');
        });
        // Add selected class to clicked item
        iconItem.classList.add('selected');
        selectedIconClass = iconClass;

        // Don't save immediately - let user choose color first
    });

    return iconItem;
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

        // Clone to remove stale click listeners from previous modal opens
        const newOption = option.cloneNode(true);
        option.parentNode.replaceChild(newOption, option);

        newOption.addEventListener('click', function () {
            document.querySelectorAll('.folder-color-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            newOption.classList.add('selected');
            selectedIconColor = color;
        });
    });
}

/**
 * Filter icons based on search query
 */
function filterIcons(searchQuery) {
    const query = searchQuery.toLowerCase().trim();

    // Hide the recently used row while searching (results show in the main grid)
    const recentSection = document.getElementById('folderIconRecentSection');
    if (recentSection) {
        const hasRecents = !!document.querySelector('#folderIconRecentGrid .folder-icon-item');
        recentSection.style.display = (query || !hasRecents) ? 'none' : '';
    }

    const iconItems = document.querySelectorAll('#folderIconGrid .folder-icon-item');

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
    currentIconTargetType = 'folder';
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

    const isNoteIcon = currentIconTargetType === 'note';
    const endpoint = isNoteIcon
        ? '/api/v1/notes/' + currentFolderIdForIcon + '/icon'
        : '/api/v1/folders/' + currentFolderIdForIcon + '/icon';

    // Send request to API
    fetch(endpoint, {
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
                // Remember custom icons for the "Recently used" row
                addRecentIcon(selectedIconClass);

                // Update the icon in the UI
                if (isNoteIcon) {
                    updateNoteIconInUI(currentFolderIdForIcon, selectedIconClass, selectedIconColor);
                } else {
                    updateFolderIconInUI(currentFolderIdForIcon, selectedIconClass, selectedIconColor);
                }

                // Close modal
                closeFolderIconModal();

                // Show success notification
                if (typeof window.showNotification === 'function') {
                    const fallbackMessage = isNoteIcon ? 'Note icon updated successfully' : 'Folder icon updated successfully';
                    const message = window.t
                        ? window.t(isNoteIcon ? 'notifications.note_icon_updated' : 'notifications.folder_icon_updated', null, fallbackMessage)
                        : fallbackMessage;
                    window.showNotification(message, 'success');
                }
            } else {
                console.error('Failed to update icon:', data.message);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(data.message || (window.i18n?.t('notifications.error') || 'An error occurred'), 'error');
                }
            }
        })
        .catch(error => {
            console.error('Error updating icon:', error);
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

    const isNoteIcon = currentIconTargetType === 'note';
    const endpoint = isNoteIcon
        ? '/api/v1/notes/' + currentFolderIdForIcon + '/icon'
        : '/api/v1/folders/' + currentFolderIdForIcon + '/icon';

    // Send request to API to clear icon
    fetch(endpoint, {
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
                if (isNoteIcon) {
                    updateNoteIconInUI(currentFolderIdForIcon, '', '');
                } else {
                    updateFolderIconInUI(currentFolderIdForIcon, '', '');
                }
                closeFolderIconModal();
            } else {
                console.error('Failed to reset icon:', data.message);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(data.message || (window.i18n?.t('notifications.error') || 'An error occurred'), 'error');
                }
            }
        })
        .catch(error => {
            console.error('Error resetting icon:', error);
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
        const allIconsToRemove = [...FOLDER_ICONS, 'lucide-folder', 'lucide-folder-open'];
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
                folderIconElement.classList.add(isOpen ? 'lucide-folder-open' : 'lucide-folder');
            } else {
                folderIconElement.classList.add('lucide-folder');
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

/**
 * Update note icon in the sidebar UI.
 */
function updateNoteIconInUI(noteId, iconClass, iconColor) {
    const noteIcons = document.querySelectorAll(`.note-icon[data-note-id="${noteId}"]`);
    if (noteIcons.length === 0) {
        return;
    }

    noteIcons.forEach(noteIconElement => {
        const allIconsToRemove = [...FOLDER_ICONS, ...DEFAULT_NOTE_ICONS];
        allIconsToRemove.forEach(icon => {
            noteIconElement.classList.remove(icon);
        });

        noteIconElement.classList.add(iconClass || getDefaultNoteIcon(noteIconElement));
        noteIconElement.setAttribute('data-custom-icon', iconClass ? 'true' : 'false');

        if (iconColor) {
            noteIconElement.style.setProperty('color', iconColor, 'important');
            noteIconElement.setAttribute('data-icon-color', iconColor);
        } else {
            noteIconElement.style.removeProperty('color');
            noteIconElement.removeAttribute('data-icon-color');
        }
    });
}

// Export functions to window
window.showChangeFolderIconModal = showChangeFolderIconModal;
window.showChangeNoteIconModal = showChangeNoteIconModal;
window.closeFolderIconModal = closeFolderIconModal;
window.resetFolderIcon = resetFolderIcon;

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
    // Close modal button
    const closeButtons = document.querySelectorAll('[data-action="close-folder-icon-modal"]');
    closeButtons.forEach(button => {
        button.addEventListener('click', closeFolderIconModal);
    });

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
