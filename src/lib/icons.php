<?php
/**
 * Note icons and the Font Awesome to Lucide translation table.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Convert Font Awesome icon classes to Lucide icon classes
 * This handles the migration from Font Awesome to Lucide icons
 * 
 * @param string|null $iconClass The Font Awesome icon class (e.g., 'fas fa-home')
 * @return string|null The converted Lucide icon class (e.g., 'lucide-home') or null if empty
 */
function convertFontAwesomeToLucide($iconClass) {
    if (empty($iconClass)) {
        return null;
    }
    
    // Mapping from Font Awesome to Lucide icon names
    $faToLucideMap = [
        'fa-briefcase' => 'lucide-briefcase',
        'fa-home' => 'lucide-home',
        'fa-star' => 'lucide-star',
        'fa-heart' => 'lucide-heart',
        'fa-lightbulb' => 'lucide-lightbulb',
        'fa-image' => 'lucide-image',
        'fa-video' => 'lucide-video',
        'fa-music' => 'lucide-music',
        'fa-book' => 'lucide-book',
        'fa-graduation-cap' => 'lucide-graduation-cap',
        'fa-code' => 'lucide-code',
        'fa-rocket' => 'lucide-rocket',
        'fa-plane' => 'lucide-plane',
        'fa-map-marker-alt' => 'lucide-map-pin',
        'fa-calendar-alt' => 'lucide-calendar',
        'fa-clock' => 'lucide-clock',
        'fa-user' => 'lucide-user',
        'fa-users' => 'lucide-users',
        'fa-cog' => 'lucide-settings',
        'fa-wrench' => 'lucide-wrench',
        'fa-paint-brush' => 'lucide-brush',
        'fa-palette' => 'lucide-palette',
        'fa-camera' => 'lucide-camera',
        'fa-shield' => 'lucide-shield',
        'fa-lock' => 'lucide-lock',
        'fa-key' => 'lucide-key',
        'fa-envelope' => 'lucide-mail',
        'fa-inbox' => 'lucide-inbox',
        'fa-archive' => 'lucide-archive',
        'fa-box' => 'lucide-box',
        'fa-shopping-cart' => 'lucide-shopping-cart',
        'fa-credit-card' => 'lucide-credit-card',
        'fa-chart-line' => 'lucide-trending-up',
        'fa-chart-bar' => 'lucide-bar-chart',
        'fa-database' => 'lucide-database',
        'fa-server' => 'lucide-server',
        'fa-cloud' => 'lucide-cloud',
        'fa-download' => 'lucide-download',
        'fa-upload' => 'lucide-upload',
        'fa-tasks' => 'lucide-list-todo',
        'fa-clipboard' => 'lucide-clipboard',
        'fa-file-alt' => 'lucide-file-text',
        'fa-copy' => 'lucide-copy',
        'fa-gamepad' => 'lucide-gamepad-2',
        'fa-trophy' => 'lucide-trophy',
        'fa-gift' => 'lucide-gift',
        'fa-birthday-cake' => 'lucide-cake',
        'fa-coffee' => 'lucide-coffee',
        'fa-pizza-slice' => 'lucide-pizza',
        'fa-utensils' => 'lucide-utensils-crossed',
        'fa-medkit' => 'lucide-briefcase-medical',
        'fa-heartbeat' => 'lucide-activity',
        'fa-dumbbell' => 'lucide-dumbbell',
        'fa-bicycle' => 'lucide-bike',
        'fa-tree' => 'lucide-tree-deciduous',
        'fa-leaf' => 'lucide-leaf',
        'fa-seedling' => 'lucide-sprout',
        'fa-paw' => 'lucide-paw-print',
        'fa-bug' => 'lucide-bug',
        'fa-flask' => 'lucide-flask-conical',
        'fa-atom' => 'lucide-atom',
        'fa-magnet' => 'lucide-magnet',
        'fa-fire' => 'lucide-flame',
        'fa-sun' => 'lucide-sun',
        'fa-moon' => 'lucide-moon',
        'fa-umbrella' => 'lucide-umbrella',
        'fa-snowflake' => 'lucide-snowflake',
        'fa-bolt' => 'lucide-zap',
        'fa-flag' => 'lucide-flag',
        'fa-bookmark' => 'lucide-bookmark',
        'fa-thumbs-up' => 'lucide-thumbs-up',
        'fa-smile' => 'lucide-smile',
        'fa-layer-group' => 'lucide-layers',
        'fa-terminal' => 'lucide-terminal',
        'fa-at' => 'lucide-at-sign',
        'fa-hashtag' => 'lucide-hash',
        'fa-question-circle' => 'lucide-help-circle',
        'fa-times-circle' => 'lucide-x-circle',
        'fa-eye' => 'lucide-eye',
        'fa-anchor' => 'lucide-anchor',
        'fa-apple-alt' => 'lucide-apple',
        'fa-award' => 'lucide-award',
        'fa-bell' => 'lucide-bell',
        'fa-binoculars' => 'lucide-binoculars',
        'fa-book-open' => 'lucide-book-open',
        'fa-briefcase-medical' => 'lucide-briefcase-medical',
        'fa-brush' => 'lucide-brush',
        'fa-building' => 'lucide-building',
        'fa-bus' => 'lucide-bus',
        'fa-calculator' => 'lucide-calculator',
        'fa-candy-cane' => 'lucide-candy',
        'fa-car' => 'lucide-car',
        'fa-certificate' => 'lucide-badge-check',
        'fa-chart-network' => 'lucide-network',
        'fa-chart-pie' => 'lucide-pie-chart',
        'fa-chess' => 'lucide-crown',
        'fa-clipboard-list' => 'lucide-clipboard-list',
        'fa-cloud-sun' => 'lucide-cloud-sun',
        'fa-coins' => 'lucide-coins',
        'fa-comment' => 'lucide-message-circle',
        'fa-compass' => 'lucide-compass',
        'fa-crown' => 'lucide-crown',
        'fa-cube' => 'lucide-box',
        'fa-cubes' => 'lucide-boxes',
        'fa-desktop' => 'lucide-monitor',
        'fa-diploma' => 'lucide-scroll',
        'fa-dna' => 'lucide-dna',
        'fa-dollar-sign' => 'lucide-dollar-sign',
        'fa-dragon' => 'lucide-flame',
        'fa-drum' => 'lucide-drum',
        'fa-elephant' => 'lucide-paw-print',
        'fa-euro-sign' => 'lucide-euro',
        'fa-feather' => 'lucide-feather',
        'fa-file-code' => 'lucide-file-code',
        'fa-film' => 'lucide-film',
        'fa-fingerprint' => 'lucide-fingerprint',
        'fa-folder-tree' => 'lucide-folder-tree',
        'fa-gem' => 'lucide-gem',
        'fa-glasses' => 'lucide-glasses',
        'fa-globe-americas' => 'lucide-globe',
        'fa-globe-asia' => 'lucide-globe',
        'fa-globe-europe' => 'lucide-globe',
        'fa-guitar' => 'lucide-guitar',
        'fa-hamburger' => 'lucide-hamburger',
        'fa-hammer' => 'lucide-hammer',
        'fa-hard-hat' => 'lucide-hard-hat',
        'fa-headphones' => 'lucide-headphones',
        'fa-headset' => 'lucide-headset',
        'fa-hiking' => 'lucide-mountain',
        'fa-hospital' => 'lucide-hospital',
        'fa-icons' => 'lucide-shapes',
        'fa-id-badge' => 'lucide-id-card',
        'fa-id-card' => 'lucide-id-card',
        'fa-industry' => 'lucide-factory',
        'fa-infinity' => 'lucide-infinity',
        'fa-sword' => 'lucide-swords',
        'fa-laptop' => 'lucide-laptop',
        'fa-map' => 'lucide-map',
        'fa-medal' => 'lucide-medal',
        'fa-microphone' => 'lucide-mic',
        'fa-microscope' => 'lucide-microscope',
        'fa-money-bill' => 'lucide-banknote',
        'fa-mountain' => 'lucide-mountain',
        'fa-mug-hot' => 'lucide-coffee',
        'fa-network-wired' => 'lucide-network',
        'fa-passport' => 'lucide-passport',
        'fa-pen' => 'lucide-pen',
        'fa-pencil-alt' => 'lucide-pencil',
        'fa-pepper-hot' => 'lucide-pepper',
        'fa-phone' => 'lucide-phone',
        'fa-piggy-bank' => 'lucide-piggy-bank',
        'fa-plane-departure' => 'lucide-plane-takeoff',
        'fa-plug' => 'lucide-plug',
        'fa-print' => 'lucide-printer',
        'fa-puzzle-piece' => 'lucide-puzzle',
        'fa-receipt' => 'lucide-receipt',
        'fa-robot' => 'lucide-bot',
        'fa-running' => 'lucide-person-standing',
        'fa-satellite' => 'lucide-satellite',
        'fa-satellite-dish' => 'lucide-satellite-dish',
        'fa-school' => 'lucide-school',
        'fa-scroll' => 'lucide-scroll',
        'fa-shopping-bag' => 'lucide-shopping-bag',
        'fa-sign' => 'lucide-signpost',
        'fa-code-branch' => 'lucide-git-branch',
        'fa-spa' => 'lucide-flower',
        'fa-stamp' => 'lucide-stamp',
        'fa-stethoscope' => 'lucide-stethoscope',
        'fa-store' => 'lucide-store',
        'fa-wave' => 'lucide-waves',
        'fa-sync' => 'lucide-refresh-cw',
        'fa-syringe' => 'lucide-syringe',
        'fa-tablet' => 'lucide-tablet',
        'fa-tachometer-alt' => 'lucide-gauge',
        'fa-tag' => 'lucide-tag',
        'fa-tags' => 'lucide-tags',
        'fa-theater-masks' => 'lucide-drama',
        'fa-tools' => 'lucide-tools',
        'fa-tractor' => 'lucide-tractor',
        'fa-trash-alt' => 'lucide-trash-alt',
        'fa-tree-alt' => 'lucide-tree-alt',
        'fa-truck' => 'lucide-truck',
        'fa-tv' => 'lucide-tv',
        'fa-umbrella-beach' => 'lucide-umbrella-beach',
        'fa-university' => 'lucide-school',
        'fa-user-graduate' => 'lucide-graduation-cap',
        'fa-utensil-spoon' => 'lucide-utensil-spoon',
        'fa-vial' => 'lucide-vial',
        'fa-walking' => 'lucide-walking',
        'fa-wallet' => 'lucide-wallet',
        'fa-warehouse' => 'lucide-warehouse',
        'fa-water' => 'lucide-waves',
        'fa-weight' => 'lucide-weight',
        'fa-wifi' => 'lucide-wifi',
        'fa-wind' => 'lucide-wind',
        'fa-yen-sign' => 'lucide-yen-sign',
        'fa-columns' => 'lucide-columns',
    ];
    
    // If already using Lucide format, return as is
    if (strpos($iconClass, 'lucide-') !== false || strpos($iconClass, 'lucide lucide-') !== false) {
        return $iconClass;
    }
    
    // Remove 'fas', 'far', 'fab' prefixes and extract the icon name
    $iconClass = preg_replace('/\b(fas|far|fab)\s+/', '', $iconClass);
    $iconClass = trim($iconClass);
    
    // Check if we have a mapping for this icon
    if (isset($faToLucideMap[$iconClass])) {
        return $faToLucideMap[$iconClass];
    }
    
    // If no mapping found but it looks like a FA icon, try to convert it generically
    if (strpos($iconClass, 'fa-') === 0) {
        $iconName = str_replace('fa-', '', $iconClass);
        return 'lucide-' . $iconName;
    }
    
    // Return original if no conversion applies
    return $iconClass;
}

function buildNoteIconClass($iconClass, $defaultIcon = 'lucide-file-text') {
    $converted = !empty($iconClass) ? convertFontAwesomeToLucide($iconClass) : $defaultIcon;
    $converted = trim((string)($converted ?: $defaultIcon));
    $classes = preg_split('/\s+/', $converted);
    $hasLucideBase = in_array('lucide', $classes, true);
    $hasLucideIcon = false;

    foreach ($classes as $class) {
        if (strpos($class, 'lucide-') === 0) {
            $hasLucideIcon = true;
            break;
        }
    }

    if (!$hasLucideBase) {
        array_unshift($classes, 'lucide');
    }
    if (!$hasLucideIcon) {
        $classes[] = $defaultIcon;
    }

    return implode(' ', array_unique(array_filter($classes)));
}

/**
 * Default icon for a note that has no custom icon of its own.
 *
 * Task lists and markdown notes get a type-specific icon so they can be told
 * apart from plain HTML notes at a glance in the notes list. Gated by the
 * 'type_based_note_icons' setting (enabled by default); when it is off, every
 * note falls back to the generic file icon as before.
 *
 * Mirrors getNoteTypeIcon() in js/notes-manager.js; js/folder-icon.js does not
 * duplicate the mapping, it reads the resolved default from the
 * data-default-icon attribute stamped by renderEditableNoteIcon() below.
 */
function defaultNoteIconForType($noteType) {
    $setting = getSetting('type_based_note_icons', '1');
    if ($setting === '0' || $setting === 'false') {
        return 'lucide-file-text';
    }

    switch (strtolower((string)($noteType ?: 'note'))) {
        case 'tasklist':
            return 'lucide-list-todo';
        case 'markdown':
            return 'lucide-file-code';
        default:
            return 'lucide-file-text';
    }
}

function renderEditableNoteIcon($noteId, $noteTitle, $iconClass = '', $iconColor = '', $extraClasses = '', $noteType = 'note') {
    $hasCustomNoteIcon = !empty($iconClass);
    $defaultIcon = defaultNoteIconForType($noteType);
    $noteIconClass = buildNoteIconClass($hasCustomNoteIcon ? $iconClass : $defaultIcon, $defaultIcon);
    $noteIconColor = !empty($iconColor) ? (string)$iconColor : '';
    $classes = trim($noteIconClass . ' note-icon ' . (string)$extraClasses);
    $iconStyle = $noteIconColor ? " style='color: " . htmlspecialchars($noteIconColor, ENT_QUOTES) . " !important;'" : "";
    $iconColorAttr = $noteIconColor ? " data-icon-color='" . htmlspecialchars($noteIconColor, ENT_QUOTES) . "'" : "";
    $changeIconTitle = t_h('notes_list.folder_actions.change_note_icon', [], 'Change note icon');
    // Exposed so the icon picker can restore the right default when the user resets the icon.
    $defaultIconAttr = " data-default-icon='" . htmlspecialchars($defaultIcon, ENT_QUOTES) . "'";

    return "<i class='" . htmlspecialchars($classes, ENT_QUOTES) . "' data-custom-icon='" . ($hasCustomNoteIcon ? 'true' : 'false') . "' data-action='open-note-icon-picker' data-note-id='" . htmlspecialchars((string)$noteId, ENT_QUOTES) . "' data-note-title='" . htmlspecialchars((string)$noteTitle, ENT_QUOTES) . "'$iconColorAttr$defaultIconAttr title='" . $changeIconTitle . "' aria-label='" . $changeIconTitle . "'$iconStyle></i>";
}
