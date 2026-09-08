<?php
date_default_timezone_set('UTC');

// ---------------------------------------------------------------------------
// Extracted modules. functions.php is still the single entry point every page
// requires, so nothing downstream changed; it is now a facade over these files
// instead of a 6 360-line pile.
// ---------------------------------------------------------------------------
require_once __DIR__ . '/lib/html-sanitize.php';
require_once __DIR__ . '/lib/attachments.php';
require_once __DIR__ . '/lib/backup-restore.php';
require_once __DIR__ . '/lib/diary.php';
require_once __DIR__ . '/lib/datetime.php';
require_once __DIR__ . '/lib/note-colors.php';
require_once __DIR__ . '/lib/quotas.php';
require_once __DIR__ . '/lib/snapshots.php';

/**
 * Trusted domains allowed for iframe embeds.
 * Used by both unescapeIframesInHtml() and the Markdown parser.
 */
if (!defined('ALLOWED_IFRAME_DOMAINS')) {
    define('ALLOWED_IFRAME_DOMAINS', [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'player.bilibili.com',
        'www.bilibili.com',
        'bilibili.com',
    ]);
}




/**
 * Helper function to create directory with proper permissions
 * Centralizes the logic for creating directories and setting ownership
 * 
 * @param string $path The directory path to create
 * @param int $permissions The permissions to set (default: 0755)
 * @param bool $recursive Whether to create parent directories (default: true)
 * @return bool True on success, false on failure
 */
function createDirectoryWithPermissions($path, $permissions = 0755, $recursive = true) {
    // Directory already exists
    if (is_dir($path)) {
        return true;
    }
    
    // Try to create directory
    if (!mkdir($path, $permissions, $recursive)) {
        error_log("Failed to create directory: $path");
        return false;
    }
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
    
    return true;
}

/**
 * Helper function to set file permissions and ownership
 * Centralizes the logic for setting file ownership
 * 
 * @param string $path The file or directory path
 * @param int $permissions The permissions to set
 * @return void
 */
function setFilePermissions($path, $permissions = 0644) {
    if (!file_exists($path)) {
        return;
    }
    
    chmod($path, $permissions);
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
}























/**
 * Detect if the current request is using HTTPS
 * Supports reverse proxy headers (X-Forwarded-Proto, X-Forwarded-SSL)
 */
function isSecureConnection() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
    || (!empty($_SERVER['HTTP_X_FORWARDED_PORT']) && $_SERVER['HTTP_X_FORWARDED_PORT'] === '443')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
}

/**
 * Get the current Git provider name for display (GitHub, GitLab or Forgejo)
 */
function getGitProviderName($provider = null) {
    if ($provider === null) {
        $provider = defined('GIT_PROVIDER') ? GIT_PROVIDER : 'github';
    }
    $names = ['github' => 'GitHub', 'gitlab' => 'GitLab', 'forgejo' => 'Forgejo'];
    return $names[$provider] ?? 'Git';
}

/**
 * Get the current protocol (http or https), supporting reverse proxies
 */
function getProtocol() {
    return isSecureConnection() ? 'https' : 'http';
}

/**
 * Get the external request host, preserving a forwarded non-default port when provided.
 */
function getExternalHostWithPort() {
    $forwardedHost = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''));
    if ($forwardedHost !== '') {
        $forwardedHostParts = array_values(array_filter(array_map('trim', explode(',', $forwardedHost)), 'strlen'));
        $host = $forwardedHostParts ? (string)$forwardedHostParts[0] : '';
    } else {
        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost')));
    }

    if ($host === '') {
        $host = 'localhost';
    }

    // If host already contains a port, don't try to append another one
    if (strpos($host, ':') !== false && preg_match('/:\d+$/', $host)) {
        return $host;
    }

    // Only trust a port explicitly forwarded by a reverse proxy. Never fall
    // back to SERVER_PORT: inside the container it is the port nginx listens
    // on (80, or 8080 for the rootless image), which says nothing about the
    // port the visitor used since Docker port mappings and reverse proxies
    // both hide it. When the visitor did use a non-default port, the Host
    // header already carries it (handled above).
    $forwardedPort = trim((string)($_SERVER['HTTP_X_FORWARDED_PORT'] ?? ''));
    if ($forwardedPort === '') {
        return $host;
    }
    $forwardedPortParts = array_values(array_filter(array_map('trim', explode(',', $forwardedPort)), 'strlen'));
    $port = $forwardedPortParts ? (string)$forwardedPortParts[0] : '';

    if ($port === '' || !ctype_digit($port)) {
        return $host;
    }

    // A proxy reporting port 80 on an HTTPS request is describing its own
    // upstream hop to nginx, not the visitor's port: adding :80 would be wrong.
    $isSecure = getProtocol() === 'https';
    if ($port === '80' && $isSecure) {
        return $host;
    }

    $defaultPort = $isSecure ? '443' : '80';
    if ($port === $defaultPort) {
        return $host;
    }

    return $host . ':' . $port;
}

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

/* ---------------------------------------------------------------------------
 * Note colors
 *
 * A note stores a single value in entries.color:
 *   - a palette id ('blue', 'green', ...)  -> resolved through the user palette,
 *     so editing the palette instantly recolors every note using that id;
 *   - a literal '#rrggbb'                  -> a per-note custom override;
 *   - NULL / ''                            -> no color, appearance unchanged.
 * ------------------------------------------------------------------------- */

define('NOTE_COLOR_PALETTE_SETTING', 'note_color_palette');












/* ---------------------------------------------------------------------------
 * Tag colors
 *
 * The 'tag_colors' setting stores a JSON object mapping a lowercased tag name
 * to a color value with the same semantics as entries.color: a palette id
 * ('blue', ...) resolved through the user palette, or a literal '#rrggbb'.
 * Tags without an entry render with the neutral default chip style.
 * ------------------------------------------------------------------------- */

define('TAG_COLORS_SETTING', 'tag_colors');




/**
 * Global settings cache - loads all settings in one query and caches them
 * This dramatically reduces database queries when settings are accessed multiple times
 */
function getSetting($key, $default = null) {
    static $cache = null;
    
    // Load all settings on first call
    if ($cache === null) {
        $cache = [];
        global $con;
        if (isset($con)) {
            try {
                $stmt = $con->query("SELECT key, value FROM settings");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $cache[$row['key']] = $row['value'];
                }
            } catch (Exception $e) {
                // Ignore errors, cache remains empty
                error_log('functions: getSetting() failed: ' . $e->getMessage());
            }
        }
    }
    
    return isset($cache[$key]) ? $cache[$key] : $default;
}

function poznoteGetNonHideableUiKeys() {
    return [
        'card:home-support-card' => true,
        // Dropped from the UI Customization modal: hiding the whole icon rail or
        // its Settings icon left no way back into the settings page. Listed here
        // so preferences saved before the removal stop applying.
        'card:icon_sidebar' => true,
        'card:iconSidebarSettingsBtn' => true,
        'card:iconSidebarHomeBtn' => true,
        // The folder icon click now always opens the icon/color modal; the
        // old "open Kanban on icon click" toggle no longer exists.
        'panel:folder-icon-kanban' => true,
        // The mobile "back to notes" toolbar button is the way back to the
        // note list on small screens, so it is no longer offered for hiding.
        'toolbar:btn-home' => true,
    ];
}

/**
 * Map UI customization keys that were renamed to the name in use today, so
 * preferences saved under the old key keep working.
 *
 * toolbar:btn-share became toolbar:btn-publish because the AdGuard Social
 * Media list carries an unscoped "##.btn-share" cosmetic rule, which hid the
 * button in every browser running that list.
 */
function poznoteNormalizeHiddenUiKey($key) {
    static $renamed = [
        'toolbar:btn-share' => 'toolbar:btn-publish',
        // Notifications and AI chat moved from the icon rail to the sidebar header.
        'card:iconSidebarNotificationsBtn' => 'card:sidebarNotificationsBtn',
        'card:iconSidebarAiChatBtn' => 'card:sidebarAiChatBtn',
        // The workspace menu's single "Workspaces" entry became "Edit
        // workspaces" once "New workspace" got its own entry.
        'wsmenu:goto-workspaces' => 'wsmenu:edit-workspaces',
    ];

    return $renamed[$key] ?? $key;
}

/**
 * Interface languages this instance ships a dictionary for (src/i18n/*.json).
 *
 * Single source of truth: the login page, the settings API validation and the
 * login-time language sync must agree, otherwise a code accepted in one place
 * renders as raw translation keys in another.
 */
function poznoteSupportedLanguages(): array {
    return ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh-cn'];
}

/**
 * Normalize a language code to one this instance actually supports.
 *
 * Returns null when the value matches nothing, so callers can decide between
 * keeping their current value and falling back to English.
 */
function poznoteNormalizeLanguageCode($lang): ?string {
    $lang = strtolower(trim((string)$lang));
    if ($lang === '') {
        return null;
    }
    return in_array($lang, poznoteSupportedLanguages(), true) ? $lang : null;
}

/**
 * Pick the best supported language from an Accept-Language header.
 *
 * Used on pre-auth pages (the login page), where no user preference exists yet.
 * Entries are ranked by their q-value, highest first; for each one an exact
 * match wins, otherwise the primary subtag is tried so "fr-CA" still selects
 * "fr". Returns null when nothing matches, leaving the caller's default in place.
 *
 * @param string $header        Raw Accept-Language header value.
 * @param array  $allowedLangs  Supported language codes, lowercase.
 */
function poznoteDetectBrowserLanguage(string $header, array $allowedLangs): ?string {
    $header = trim($header);
    if ($header === '' || empty($allowedLangs)) {
        return null;
    }

    $candidates = [];
    foreach (explode(',', $header) as $index => $part) {
        $bits = explode(';', $part);
        $tag = strtolower(trim($bits[0]));
        if ($tag === '' || $tag === '*') {
            continue;
        }

        // Quality defaults to 1 when the q= parameter is absent or malformed.
        $quality = 1.0;
        for ($i = 1; $i < count($bits); $i++) {
            $param = trim($bits[$i]);
            if (stripos($param, 'q=') === 0) {
                $value = substr($param, 2);
                if (is_numeric($value)) {
                    $quality = (float)$value;
                }
                break;
            }
        }
        if ($quality <= 0) {
            continue; // q=0 explicitly rejects that language.
        }

        // Keep the header order as tie-breaker between equal q-values.
        $candidates[] = ['tag' => $tag, 'q' => $quality, 'order' => $index];
    }

    usort($candidates, function ($a, $b) {
        return $a['q'] === $b['q'] ? ($a['order'] <=> $b['order']) : ($b['q'] <=> $a['q']);
    });

    foreach ($candidates as $candidate) {
        $tag = $candidate['tag'];
        if (in_array($tag, $allowedLangs, true)) {
            return $tag;
        }

        // "fr-CA" -> "fr". Also lets "zh" reach a "zh-cn" style code when that
        // is the only variant this instance ships.
        $primary = explode('-', $tag)[0];
        if ($primary !== $tag && in_array($primary, $allowedLangs, true)) {
            return $primary;
        }
        foreach ($allowedLangs as $allowed) {
            if (explode('-', $allowed)[0] === $primary) {
                return $allowed;
            }
        }
    }

    return null;
}

/**
 * Reconcile the active user's interface language at the start of a session.
 *
 * Two things happen here:
 *  - As long as the user has never picked a language in the settings
 *    (settings.language_source is not 'user'), the browser's Accept-Language
 *    header drives the interface, so a brand new account opens in the visitor's
 *    own language instead of English. The moment the language is changed in the
 *    settings the source flips to 'user' and the browser stops overriding it.
 *  - The resulting language is mirrored into master.users.language, so
 *    consumers that never open the per-user database (mailing tools, admin
 *    exports) can read it from the profile.
 *
 * Called from db_connect.php before anything reads getSetting(), so the value
 * written here is the one the request's static settings cache picks up.
 */
function poznoteSyncUserLanguage(PDO $con, int $userId): void {
    if ($userId <= 0) {
        return;
    }

    try {
        $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('language', 'language_source')");
        $rows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $rows[$row['key']] = $row['value'];
        }

        $language = poznoteNormalizeLanguageCode($rows['language'] ?? '');
        $source = (string)($rows['language_source'] ?? '');

        if ($source !== 'user') {
            $detected = poznoteDetectBrowserLanguage(
                $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '',
                poznoteSupportedLanguages()
            );
            if ($detected !== null && $detected !== $language) {
                $update = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $update->execute(['language', $detected]);
                // The generated welcome note follows the browser-driven
                // language too (no-op once the user edited the note, and on
                // the very first bootstrap where no note exists yet).
                poznoteRelocalizeWelcomeNote($con, $detected);
                $language = $detected;
            }
        }

        if ($language === null) {
            $language = 'en';
        }

        require_once __DIR__ . '/users/db_master.php';
        setUserProfileLanguage($userId, $language);
    } catch (Exception $e) {
        // Never let a language sync failure break page rendering.
        error_log('Poznote: user language sync failed: ' . $e->getMessage());
    }
}

function poznoteGetGlobalHiddenUiElements() {
    static $globalHiddenKeys = null;

    if ($globalHiddenKeys !== null) {
        return $globalHiddenKeys;
    }

    $globalHiddenKeys = [];

    try {
        require_once __DIR__ . '/users/db_master.php';
        if (!function_exists('getGlobalSetting')) {
            return $globalHiddenKeys;
        }
        $rawValue = getGlobalSetting('hidden_ui_elements_global', '[]');
    } catch (Exception $e) {
        return $globalHiddenKeys;
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return $globalHiddenKeys;
    }

    $nonHideable = poznoteGetNonHideableUiKeys();
    $seen = [];
    foreach ($decoded as $key) {
        if (!is_string($key)) {
            continue;
        }

        $key = poznoteNormalizeHiddenUiKey($key);
        if (isset($nonHideable[$key])) {
            continue;
        }

        $seen[$key] = true;
    }

    $globalHiddenKeys = array_keys($seen);
    return $globalHiddenKeys;
}

function poznoteGetEnforcedGlobalHiddenUiElements() {
    // Administrators are exempt from the instance-wide hidden set.
    if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
        return [];
    }

    return poznoteGetGlobalHiddenUiElements();
}

function poznoteGetHiddenUiElements() {
    static $hiddenKeys = null;

    if ($hiddenKeys !== null) {
        return $hiddenKeys;
    }

    // Effective hidden set: admin-enforced (non-admin users) keys merged with
    // the current user's personal preferences.
    $merged = [];
    foreach (poznoteGetEnforcedGlobalHiddenUiElements() as $key) {
        $merged[$key] = true;
    }

    $rawValue = getSetting('hidden_ui_elements', '[]');
    $decoded = json_decode((string)$rawValue, true);
    if (is_array($decoded)) {
        $nonHideable = poznoteGetNonHideableUiKeys();
        foreach ($decoded as $key) {
            if (!is_string($key)) {
                continue;
            }

            $key = poznoteNormalizeHiddenUiKey($key);
            if (isset($nonHideable[$key])) {
                continue;
            }

            $merged[$key] = true;
        }
    }

    $hiddenKeys = array_keys($merged);
    return $hiddenKeys;
}

/**
 * Token a saved icon rail order uses for a separator line between two entries.
 * It can appear any number of times, unlike the button ids around it. Never a
 * button id itself: those all end in "Btn".
 */
const POZNOTE_ICON_SIDEBAR_DIVIDER = 'divider';

/**
 * User-chosen order of the icon rail's navigation entries, as a list of the
 * button ids declared in icon_sidebar.php, with POZNOTE_ICON_SIDEBAR_DIVIDER
 * wherever the user placed a separator line.
 *
 * Stored under the 'icon_sidebar_order' user setting by the Icon Sidebar Order
 * card in settings.php. Only the scrolling navigation group is reorderable:
 * the account group at the bottom of the rail (Profile, Settings, About,
 * Logout) is fixed, so a user cannot bury the way back into settings.
 *
 * An empty list means "no preference": icon_sidebar.php then uses its declared
 * order and draws a separator at each change of group. A saved order carries
 * its own separators instead, so a user who arranged the entries their way is
 * not second-guessed by group lines falling between every other button.
 */
function poznoteGetIconSidebarOrder() {
    static $order = null;

    if ($order !== null) {
        return $order;
    }

    $order = [];
    $decoded = json_decode((string)getSetting('icon_sidebar_order', '[]'), true);
    if (is_array($decoded)) {
        $seen = [];
        foreach ($decoded as $id) {
            if (!is_string($id) || $id === '') {
                continue;
            }
            // Separators repeat by nature; only the button ids are deduped.
            if ($id !== POZNOTE_ICON_SIDEBAR_DIVIDER) {
                if (isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
            }
            $order[] = $id;
        }
    }

    return $order;
}

/**
 * Apply a saved order to a list of rail items keyed by their 'id'.
 *
 * Ids the preference does not mention keep their declared position relative to
 * one another and follow the ordered ones, so an entry added by a later release
 * appears at the end rather than vanishing, and a stale id is simply ignored.
 * Each POZNOTE_ICON_SIDEBAR_DIVIDER in the order becomes a ['divider' => true]
 * item at that position; divider items already in $items are dropped, so the
 * saved order is the only source of separators once one is applied (and the
 * function can safely run twice over the same list).
 */
function poznoteApplyIconSidebarOrder(array $items, array $order) {
    if (!$order) {
        return $items;
    }

    $byId = [];
    foreach ($items as $item) {
        if (isset($item['id'])) {
            $byId[$item['id']] = $item;
        }
    }

    $ordered = [];
    $placed = [];
    foreach ($order as $id) {
        if ($id === POZNOTE_ICON_SIDEBAR_DIVIDER) {
            $ordered[] = ['divider' => true];
            continue;
        }
        if (isset($byId[$id]) && !isset($placed[$id])) {
            $placed[$id] = true;
            $ordered[] = $byId[$id];
        }
    }

    foreach ($items as $item) {
        if (!empty($item['divider'])) {
            continue;
        }
        if (!isset($item['id']) || !isset($placed[$item['id']])) {
            $ordered[] = $item;
        }
    }

    return $ordered;
}

/**
 * Drop the separators that would draw nothing useful: one before the first
 * entry, one after the last, or two in a row. Entries the UI Customization
 * modal hides are still in the list here (they are hidden by CSS), so
 * js/icon-sidebar-toggle.js repeats this on the rendered rail.
 */
function poznoteTidyIconSidebarDividers(array $items) {
    $tidy = [];
    foreach ($items as $item) {
        if (empty($item['divider'])) {
            $tidy[] = $item;
            continue;
        }
        if ($tidy && empty($tidy[count($tidy) - 1]['divider'])) {
            $tidy[] = $item;
        }
    }
    if ($tidy && !empty($tidy[count($tidy) - 1]['divider'])) {
        array_pop($tidy);
    }
    return $tidy;
}

function poznoteBuildUiCustomizationRules(array $hiddenKeys) {
    $createMenuOptionSelectors = [
        'card:create-note-card' => '.create-note-option[data-type="html"]',
        'card:create-markdown-note-card' => '.create-note-option[data-type="markdown"]',
        'card:create-task-list-card' => '.create-note-option[data-type="list"]',
        'card:create-folder-card' => '.create-note-option[data-type="folder"]',
        'card:create-subfolder-card' => '.create-note-option[data-type="subfolder"]',
        'card:create-diary-entry-card' => '.create-note-option[data-type="diary"]',
        'card:create-workspace-card' => '.create-note-option[data-type="workspace"]',
    ];

    $rules = [];

    foreach ($hiddenKeys as $key) {
        $parts = explode(':', $key, 2);
        if (count($parts) !== 2) {
            continue;
        }

        [$type, $id] = $parts;

        if ($type === 'card') {
            if ($id === 'ui-customization-card') {
                continue;
            }

            $rules[] = '#' . $id . ' { display: none !important; }';
            if (isset($createMenuOptionSelectors[$key])) {
                $rules[] = '#create-menu ' . $createMenuOptionSelectors[$key] . ' { display: none !important; }';
            }
        } elseif ($type === 'toolbar') {
            $rules[] = '.note-edit-toolbar .' . $id . ', .note-edit-toolbar .' . $id . ':not(.hide-on-selection) { display: none !important; }';
            $rules[] = '.mobile-toolbar-menu [data-selector=".' . $id . '"] { display: none !important; }';
            if ($id === 'btn-snapshot') {
                $rules[] = '.mobile-toolbar-menu [data-action="show-snapshot"] { display: none !important; }';
            } elseif ($id === 'btn-split-view') {
                $rules[] = '.note-edit-toolbar .markdown-split-btn, .note-edit-toolbar .markdown-split-btn:not(.hide-on-selection) { display: none !important; }';
            } elseif ($id === 'btn-tasklist-actions') {
                $rules[] = '.tasklist-actions-dropdown { display: none !important; }';
            } elseif ($id === 'btn-audio') {
                $rules[] = '.mobile-toolbar-menu [data-action="insert-audio-file"] { display: none !important; }';
            } elseif ($id === 'btn-clear-completed') {
                $rules[] = '.mobile-toolbar-menu [data-action="clear-completed-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-uncheck-all') {
                $rules[] = '.mobile-toolbar-menu [data-action="uncheck-all-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-print') {
                $rules[] = '.mobile-toolbar-menu [data-action="print-note"] { display: none !important; }';
            }
        } elseif ($type === 'wsmenu') {
            $rules[] = '.workspace-menu-item[data-action="' . $id . '"] { display: none !important; }';
        } elseif ($type === 'folder') {
            $rules[] = '.folder-actions-menu-item[data-action="' . $id . '"] { display: none !important; }';
            if ($id === 'toggle-sort-submenu') {
                $rules[] = '.sort-submenu { display: none !important; }';
            }
        } elseif ($type === 'panel') {
            if ($id === 'mini-calendar') {
                $rules[] = '.mini-calendar-container { display: none !important; }';
            } elseif ($id === 'folder-actions-toggle') {
                // The ⋮ button on folder rows. The menu itself is shared and
                // stays in the DOM: with no toggle it can no longer be opened.
                $rules[] = '.folder-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-actions-toggle') {
                // The ⋮ button on note rows. body.note-actions-hidden gives the
                // titles back the strip reserved for it (css/tabs.css).
                $rules[] = '.note-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-created-date') {
                // Creation date under the note title. Overrides
                // body.show-note-created in css/notes/subline.css, which the
                // note_display.php markup still sets.
                $rules[] = '.note-subline { display: none !important; }';
            } elseif ($id === 'note-icons') {
                // Icon before the note title, in the sidebar list and in the
                // note header. Both are rendered by renderEditableNoteIcon(),
                // which always emits .note-icon.
                $rules[] = '.note-icon { display: none !important; }';
            } elseif ($id === 'folder-note-count') {
                // The (n) after a folder name. !important beats the
                // .hide-folder-counts hover-reveal in css/sidebar.css, which
                // otherwise brings the count back on hover.
                $rules[] = '.folder-note-count { display: none !important; }';
            } elseif ($id === 'outline-panel') {
                $rules[] = '#outline-panel { display: none !important; }';
                $rules[] = '#outlineResizeHandle { display: none !important; }';
                $rules[] = '#outlineMobileBackdrop { display: none !important; }';
            } elseif ($id === 'tasklist-progress') {
                $rules[] = '.tasklist-progress { display: none !important; }';
            }
        } elseif ($type === 'share') {
            // Share dialog blocks are built in JS. The CSS rule covers pages that
            // do not load the customization runtime (shared.php, workspaces.php);
            // the JS guards keep the hidden controls out of the saved payload.
            if ($id === 'restrict-users') {
                $rules[] = '.share-restrict-users-wrap { display: none !important; }';
            } elseif ($id === 'protocol-toggle') {
                $rules[] = '.share-protocol-wrap { display: none !important; }';
            }
        }
    }

    return implode("\n", $rules);
}

function poznoteRenderUiCustomizationBootstrap() {
    $hiddenKeys = poznoteGetHiddenUiElements();
    $encodedHiddenKeys = json_encode($hiddenKeys, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedHiddenKeys === false) {
        $encodedHiddenKeys = '[]';
    }

    $encodedGlobalHiddenKeys = json_encode(poznoteGetEnforcedGlobalHiddenUiElements(), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedGlobalHiddenKeys === false) {
        $encodedGlobalHiddenKeys = '[]';
    }

    echo '<script>window.__POZNOTE_HIDDEN_UI_ELEMENTS__ = ' . $encodedHiddenKeys . ';window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__ = ' . $encodedGlobalHiddenKeys . ';</script>' . "\n";

    $rules = poznoteBuildUiCustomizationRules($hiddenKeys);
    if ($rules !== '') {
        echo '<style id="ui-customization-styles">' . htmlspecialchars($rules, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</style>' . "\n";
    }
}

/**
 * True when the given UI customization key is hidden for the current user.
 * Used by pages that build share dialogs in JS and read the state from a
 * body data-attribute instead of the customization runtime.
 */
function poznoteIsUiElementHidden($key) {
    return in_array($key, poznoteGetHiddenUiElements(), true);
}

/**
 * True when the current request may target other accounts of the instance by id
 * (share restrictions, user directory). Tenant isolation turns an instance into
 * a SaaS: a non-admin must not be able to learn that the other accounts exist,
 * so naming them is refused server-side and not merely hidden in the UI.
 * Admins keep the capability so they can still manage the instance.
 */
function poznoteCanTargetOtherUsers() {
    if (!defined('TENANT_ISOLATION') || !TENANT_ISOLATION) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * True when the given tenant isolation feature is blocked on this instance
 * (for non-admin users; the per-request admin exemption is up to the caller).
 */
function poznoteTenantIsolationBlocks($feature) {
    return defined('TENANT_ISOLATION_FEATURES')
        && in_array($feature, TENANT_ISOLATION_FEATURES, true);
}

/**
 * True when the current user may manage personal webhooks. Blocked for
 * non-admin users when tenant isolation blocks the user_webhooks feature:
 * webhooks relay note metadata to arbitrary endpoints, which a SaaS operator
 * may not want to offer to tenants. Admins keep the capability.
 */
function poznoteCanUseUserWebhooks() {
    if (!poznoteTenantIsolationBlocks('user_webhooks')) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * Clean content for search by removing base64 images and other heavy data
 * This is used to keep the database entry column lightweight for search functionality
 */
function cleanContentForSearch($content) {
    // Remove base64 images (data:image/...)
    $content = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $content);
    
    // Remove Excalidraw containers with embedded data
    $content = preg_replace('/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s', '[Excalidraw diagram]', $content);
    
    return $content;
}

/**
 * Internationalization (i18n)
 * - Uses JSON dictionaries in src/i18n/{lang}.json
 * - Active language stored in settings table key: 'language'
 * - Fallback to English when a key is missing
 */

function getUserLanguage() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $lang = getSetting('language', 'en');
    if ($lang && is_string($lang)) {
        $lang = strtolower(trim($lang));
        // Basic allowlist: keep it simple and safe
        if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
            $cached = $lang;
            return $cached;
        }
    }
    
    $cached = 'en';
    return $cached;
}

function loadI18nDictionary($lang) {
    static $cache = [];

    $lang = strtolower(trim((string)$lang));
    if ($lang === '') $lang = 'en';
    if (isset($cache[$lang])) return $cache[$lang];

    $file = __DIR__ . '/i18n/' . $lang . '.json';
    $json = @file_get_contents($file);
    if ($json === false) {
        $cache[$lang] = [];
        return $cache[$lang];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
    $cache[$lang] = $data;
    return $data;
}

function i18nGet($dict, $key) {
    if (!is_array($dict)) return null;
    $parts = explode('.', $key);
    $cur = $dict;
    foreach ($parts as $p) {
        if (!is_array($cur) || !array_key_exists($p, $cur)) return null;
        $cur = $cur[$p];
    }
    return is_string($cur) ? $cur : null;
}

function t($key, $vars = [], $default = null, $lang = null) {
    if ($lang === null) {
        $lang = getUserLanguage();
    }

    $dict = loadI18nDictionary($lang);
    $en = ($lang === 'en') ? $dict : loadI18nDictionary('en');

    $text = i18nGet($dict, $key);
    if ($text === null) $text = i18nGet($en, $key);
    if ($text === null) $text = ($default !== null ? (string)$default : (string)$key);

    if (is_array($vars) && !empty($vars)) {
        foreach ($vars as $k => $v) {
            $text = str_replace('{{' . $k . '}}', (string)$v, $text);
        }
    }
    return $text;
}

function t_h($key, $vars = [], $default = null, $lang = null) {
    return htmlspecialchars(t($key, $vars, $default, $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Localized content of the generated welcome note, with the same fallback
 * chain as the first-run creation in db_connect.php: dictionary entry first,
 * then the static welcome_note.html template (incomplete/custom dictionary),
 * then a minimal hardcoded paragraph (template missing too).
 */
function poznoteWelcomeNoteContent(string $lang): string {
    $content = t('welcome_note.content', [], '', $lang);
    if (trim($content) === '') {
        $content = (string)@file_get_contents(__DIR__ . '/welcome_note.html');
    }
    if (trim($content) === '') {
        $content = '<p>Welcome to Poznote.</p>';
    }
    return $content;
}

/**
 * Rewrite the generated welcome note in $newLang when the user has not
 * touched it, so the note follows the interface language instead of staying
 * frozen in whatever language was active when the account was bootstrapped
 * (the first-run wizard lets the user pick a different language seconds
 * after the note is created).
 *
 * The note carries no marker of its own, so it is recognized by fingerprint:
 * heading and file content must both still match what the bootstrap would
 * generate for one of the supported languages. An edited, renamed or deleted
 * welcome note never matches and is left alone.
 */
function poznoteRelocalizeWelcomeNote(PDO $con, string $newLang): void {
    $newLang = strtolower(trim($newLang));
    if (!in_array($newLang, poznoteSupportedLanguages(), true)) {
        return;
    }

    try {
        $titles = [];
        foreach (poznoteSupportedLanguages() as $lang) {
            $titles[$lang] = t('welcome_note.title', [], 'Welcome to Poznote', $lang);
        }

        $placeholders = implode(',', array_fill(0, count($titles), '?'));
        $stmt = $con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND type = 'note' AND heading IN ($placeholders)");
        $stmt->execute(array_values($titles));
        $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$candidates) {
            return;
        }

        $template = trim((string)@file_get_contents(__DIR__ . '/welcome_note.html'));

        foreach ($candidates as $row) {
            $file = getEntryFilename($row['id'], 'note');
            $current = @file_get_contents($file);
            if ($current === false) {
                continue;
            }
            $current = trim($current);

            foreach ($titles as $lang => $title) {
                if ($row['heading'] !== $title) {
                    continue;
                }

                // Everything the bootstrap could have written for $lang.
                $pristine = [trim(poznoteWelcomeNoteContent($lang)), '<p>Welcome to Poznote.</p>'];
                if ($template !== '') {
                    $pristine[] = $template;
                }
                if (!in_array($current, $pristine, true)) {
                    continue;
                }

                if ($lang === $newLang) {
                    return;
                }

                $content = poznoteWelcomeNoteContent($newLang);
                if (file_put_contents($file, $content) === false) {
                    return;
                }
                setFilePermissions($file, 0644);

                // Same search snippet shape as repairDatabaseEntries().
                $snippet = mb_substr(strip_tags(cleanContentForSearch($content)), 0, 500);
                $update = $con->prepare('UPDATE entries SET heading = ?, entry = ?, updated = ? WHERE id = ?');
                $update->execute([
                    t('welcome_note.title', [], 'Welcome to Poznote', $newLang),
                    $snippet,
                    gmdate('Y-m-d H:i:s'),
                    $row['id'],
                ]);
                return;
            }
        }
    } catch (Exception $e) {
        // Cosmetic best-effort operation: never let it break a language change.
        error_log('Poznote: welcome note relocalization failed: ' . $e->getMessage());
    }
}



/**
 * Get the page title for the application
 * Uses custom display name from settings if available, otherwise uses app name from i18n
 * @return string The HTML-escaped page title
 */
function getPageTitle() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $login_display_name = getGlobalSetting('login_display_name', '');
    
    if ($login_display_name && trim($login_display_name) !== '') {
        $cached = htmlspecialchars($login_display_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    } else {
        $cached = t_h('app.name');
    }
    
    return $cached;
}












/**
 * Get a user data directory path by type.
 * @param string $type One of 'entries', 'attachments', 'backups'
 * @return string The directory path
 */
function getDataPath(string $type): string {
    global $activeUserId, $forcePublicTokenRouting;
    // Public share requests are routed to the share owner's data (see
    // db_connect.php): the visitor may be logged in as a different user, so
    // their session user_id must not win over the resolved owner id.
    $userId = !empty($forcePublicTokenRouting)
        ? $activeUserId
        : ($_SESSION['user_id'] ?? $activeUserId);

    $methodMap = [
        'entries' => 'getUserEntriesPath',
        'attachments' => 'getUserAttachmentsPath',
        'backups' => 'getUserBackupsPath',
    ];

    if ($userId && isset($methodMap[$type])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->{$methodMap[$type]}();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/data/' . $type;
}

function getEntriesPath() { return getDataPath('entries'); }
function getAttachmentsPath() { return getDataPath('attachments'); }
function getBackupsPath() { return getDataPath('backups'); }









/**
 * Whether the SaaS-mode storage usage notices are shown (red "note-taking
 * app, not media storage" reminders on the attachment pages, the user
 * storage statistics page and the S3 attachments settings). Hidden by
 * default; the admin enables them from the SaaS mode settings page.
 */
function poznoteSaasNoticesEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_storage_notices', '0') === '1';
}

/**
 * Whether the "contact the administrator" card is shown to every user in
 * the About section of the settings page. Hidden by default; enabled from
 * the SaaS mode settings page.
 */
function poznoteSaasAdminContactEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_admin_contact', '0') === '1';
}

/**
 * URL where users should post general questions, as configured on the SaaS
 * settings page. Empty string when not configured: the Help card then skips
 * the community block (and disappears entirely when the contact email is
 * empty too).
 */
function poznoteSaasCommunityUrl(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_community_url', ''));
}

/**
 * Email address shown on the Help card, as configured on the SaaS settings
 * page. Empty string when not configured: the card then only offers the
 * community space link.
 */
function poznoteSaasAdminContactEmail(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_admin_contact_email', ''));
}
















// Display name stored as original_filename. Uses the validated basename and drops
// characters that are meaningless in a filename but significant in HTML, as
// defense in depth: every renderer must still escape the value.






const POZNOTE_SNAPSHOTS_DEFAULT_COUNT = 3;
const POZNOTE_SNAPSHOTS_MIN_COUNT = 1;
const POZNOTE_SNAPSHOTS_MAX_COUNT = 30;
const POZNOTE_SNAPSHOTS_MAX_AGE_DAYS = 30;








/**
 * Remove everything a permanently deleted note leaves on disk: every attachment
 * file listed in its attachments JSON (visible or kept for snapshots only) and
 * its snapshots. Every code path that deletes an entries row for good must go
 * through here.
 */
function deleteNoteFilesForGood($noteId, $attachments) {
    foreach (poznoteDecodeAttachments($attachments) as $attachment) {
        if (is_array($attachment) && !empty($attachment['filename'])) {
            poznoteDeleteAttachmentFile($attachment['filename']);
        }
    }

    deleteNoteSnapshots($noteId);
}


/**
 * Get the appropriate file extension based on note type
 * @param string $type The note type (note, markdown, tasklist)
 * @return string The file extension (.md or .html)
 */
function getFileExtensionForType($type) {
    return ($type === 'markdown') ? '.md' : '.html';
}

/**
 * Get the full filename for a note entry
 * @param int $id The note ID
 * @param string $type The note type
 * @return string The complete filename with path and extension
 */
function getEntryFilename($id, $type) {
    $extension = getFileExtensionForType($type);
    return getEntriesPath() . '/' . $id . $extension;
}

/**
 * Clone one note (row, content file and attachments) into a new entry.
 *
 * Shared by the note duplicate endpoint and the recursive folder duplicate,
 * so both produce the same kind of copy: same type, tags, icon, color and
 * width, a fresh created/updated timestamp, never trashed or favorite, and
 * attachments copied under new ids with the content rewritten to point at
 * them. The heading is made unique in the target folder ("Title (1)").
 *
 * Quotas are NOT checked here; callers check them before cloning so a folder
 * duplicate can be refused as a whole instead of half-way through.
 *
 * @param PDO   $con     Database connection
 * @param int   $noteId  Source note id (must not be in the trash)
 * @param array $options Optional overrides:
 *   'folderId'      => int|null Target folder id (omit to keep the source folder)
 *   'folderName'    => string   Target folder name (used with folderId)
 *   'headingPrefix' => string   Prefix added to the copied heading
 *   'actorUserId'   => int      User recorded as creator of the copy
 * @return array|null ['id' => int, 'heading' => string], or null when the
 *                    source note does not exist
 * @throws Exception on database or file errors
 */
function poznoteCloneNoteRecord(PDO $con, int $noteId, array $options = []): ?array {
    $headingPrefix  = (string)($options['headingPrefix'] ?? '');
    $overrideFolder = array_key_exists('folderId', $options);
    $actorUserId    = (int)($options['actorUserId'] ?? 0);

    $stmt = $con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments, icon, icon_color, color, content_width FROM entries WHERE id = ? AND trash = 0");
    $stmt->execute([$noteId]);
    $originalNote = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$originalNote) {
        return null;
    }

    $workspace  = $originalNote['workspace'];
    $folderId   = $overrideFolder ? ($options['folderId'] ?? null) : $originalNote['folder_id'];
    $folderName = $overrideFolder ? ($options['folderName'] ?? null) : $originalNote['folder'];

    // Generate unique heading
    $originalHeading = $originalNote['heading'] ?: t('index.note.new_note', [], 'New note');
    $newHeading = generateUniqueTitle($headingPrefix . $originalHeading, null, $workspace, $folderId);

    // Duplicate attachments
    $newAttachments = null;
    $attachmentIdMapping = [];
    $originalAttachments = $originalNote['attachments'] ? json_decode($originalNote['attachments'], true) : [];

    if (!empty($originalAttachments)) {
        $duplicatedAttachments = [];

        foreach ($originalAttachments as $attachment) {
            if (poznoteAttachmentIsSnapshotOnly($attachment)) {
                continue;
            }

            // Readable local path (fetched from the bucket in S3 mode)
            $originalFilePath = poznoteAttachmentLocalFile($attachment['filename'] ?? '');

            if ($originalFilePath !== null) {
                $fileExtension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                $newFilename = uniqid() . '_' . time() . '.' . $fileExtension;
                $oldAttachmentId = $attachment['id'];
                $newAttachmentId = uniqid();

                if (poznoteStoreAttachmentFromPath($originalFilePath, $newFilename, $attachment['file_type'] ?? 'application/octet-stream')) {
                    $attachmentIdMapping[$oldAttachmentId] = $newAttachmentId;

                    $duplicatedAttachments[] = [
                        'id' => $newAttachmentId,
                        'filename' => $newFilename,
                        'original_filename' => $attachment['original_filename'],
                        'file_size' => $attachment['file_size'],
                        'file_type' => $attachment['file_type'],
                        'uploaded_at' => date('Y-m-d H:i:s')
                    ];
                }
            }
        }

        $newAttachments = !empty($duplicatedAttachments) ? json_encode($duplicatedAttachments) : null;
    }

    // Read original content and update attachment references
    $originalFilename = getEntryFilename($noteId, $originalNote['type']);
    $content = $originalNote['entry'] ?? '';
    if (is_readable($originalFilename)) {
        $fileContent = file_get_contents($originalFilename);
        if ($fileContent !== false) {
            $content = $fileContent;
        }
    }
    foreach ($attachmentIdMapping as $oldId => $newId) {
        $content = str_replace($oldId, $newId, $content);
    }

    // Insert new note
    $insertStmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, attachments, icon, icon_color, color, content_width, created, updated, trash, favorite, created_by_user_id, updated_by_user_id) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, ?, ?)");
    $insertStmt->execute([
        $newHeading,
        $originalNote['tags'],
        $folderName,
        $folderId,
        $workspace,
        $originalNote['type'],
        $newAttachments,
        $originalNote['icon'],
        $originalNote['icon_color'],
        $originalNote['color'],
        $originalNote['content_width'],
        $actorUserId,
        $actorUserId
    ]);

    $newId = (int)$con->lastInsertId();

    // Update note ID references in attachment URLs
    // Replace /api/v1/notes/{oldNoteId}/attachments/ with /api/v1/notes/{newNoteId}/attachments/
    if (!empty($content) && !empty($attachmentIdMapping)) {
        $content = str_replace(
            '/api/v1/notes/' . $noteId . '/attachments/',
            '/api/v1/notes/' . $newId . '/attachments/',
            $content
        );
    }

    // Write file
    $newFilename = getEntryFilename($newId, $originalNote['type']);
    if (!empty($content)) {
        file_put_contents($newFilename, $content);
        chmod($newFilename, 0644);
    }

    $updateEntryStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
    $updateEntryStmt->execute([$content, $newId]);

    return ['id' => $newId, 'heading' => $newHeading];
}

/**
 * Normalize tasklist storage content to a JSON array string.
 *
 * Older tasklists may be wrapped in HTML/XML markup while the database entry
 * still contains valid raw JSON. This helper extracts and normalizes the JSON
 * payload so callers can safely prefer a valid representation.
 *
 * @param mixed $content Raw stored tasklist content.
 * @return string Normalized JSON array string, or an empty string when invalid.
 */
function normalizeTasklistJsonContent($content) {
    if (!is_string($content)) {
        return '';
    }

    $candidates = [];
    $seen = [];

    $addCandidate = static function ($value) use (&$candidates, &$seen) {
        if (!is_string($value)) {
            return;
        }

        $value = preg_replace('/^\xEF\xBB\xBF/', '', $value);
        $value = trim($value);

        if ($value === '' || isset($seen[$value])) {
            return;
        }

        $seen[$value] = true;
        $candidates[] = $value;
    };

    $extractJsonSegments = static function ($value) use (&$addCandidate) {
        if (!is_string($value) || $value === '') {
            return;
        }

        $firstBracket = strpos($value, '[');
        $lastBracket = strrpos($value, ']');
        if ($firstBracket !== false && $lastBracket !== false && $lastBracket > $firstBracket) {
            $addCandidate(substr($value, $firstBracket, $lastBracket - $firstBracket + 1));
        }

        $firstBrace = strpos($value, '{');
        $lastBrace = strrpos($value, '}');
        if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
            $addCandidate(substr($value, $firstBrace, $lastBrace - $firstBrace + 1));
        }
    };

    $decodedHtml = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $withoutXml = preg_replace('/<\?xml[^>]*\?>/i', '', $decodedHtml);
    $strippedText = trim(strip_tags($withoutXml));

    $addCandidate($content);
    $addCandidate($decodedHtml);
    $addCandidate($strippedText);
    $extractJsonSegments($content);
    $extractJsonSegments($decodedHtml);
    $extractJsonSegments($strippedText);

    foreach ($candidates as $candidate) {
        $decoded = json_decode($candidate, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            continue;
        }

        if (is_array($decoded) && isset($decoded['tasks']) && is_array($decoded['tasks'])) {
            $decoded = $decoded['tasks'];
        }

        if (!is_array($decoded)) {
            continue;
        }

        if ($decoded !== [] && !isset($decoded[0])) {
            continue;
        }

        $decoded = array_values(array_map(static function ($task) {
            if (!is_array($task)) {
                return $task;
            }

            $task['completed'] = !empty($task['completed']) || !empty($task['checked']) || !empty($task['done']);

            if (!isset($task['text']) && isset($task['content'])) {
                $task['text'] = (string) $task['content'];
            }

            unset($task['checked'], $task['done']);

            return $task;
        }, $decoded));

        $normalized = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($normalized !== false) {
            return $normalized;
        }
    }

    return '';
}

/**
 * Pick the first valid tasklist payload between file storage and database.
 *
 * @param mixed $primaryContent Preferred content, typically file storage.
 * @param mixed $fallbackContent Fallback content, typically database storage.
 * @return string Best-effort tasklist content.
 */
function resolveTasklistStoredContent($primaryContent, $fallbackContent = '') {
    $normalizedPrimary = normalizeTasklistJsonContent($primaryContent);
    if ($normalizedPrimary !== '') {
        return $normalizedPrimary;
    }

    $normalizedFallback = normalizeTasklistJsonContent($fallbackContent);
    if ($normalizedFallback !== '') {
        return $normalizedFallback;
    }

    return (string) ($fallbackContent !== '' ? $fallbackContent : $primaryContent);
}

/**
 * Workspace the "Archive note" action files notes into, created on first use.
 *
 * Deliberately not translated: the name is stored in the database, so a
 * language change must not strand already archived notes in a workspace the
 * action no longer points at.
 */
if (!defined('POZNOTE_ARCHIVE_WORKSPACE')) {
    define('POZNOTE_ARCHIVE_WORKSPACE', 'Archives');
}

/**
 * Get the first available workspace name from the database
 * Used as fallback when no specific workspace is selected
 * 
 * @return string The first workspace name, or empty string if none exists
 */
function getFirstWorkspaceName() {
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }

    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['name'])) {
                return $row['name'];
            }
        } catch (Exception $e) {
            // Continue to default
            error_log('functions: getFirstWorkspaceName() failed: ' . $e->getMessage());
        }
    }
    return '';
}

/**
 * Get the current workspace filter from GET/POST parameters
 * Priority order:
 * 1. GET/POST parameter (highest priority)
 * 2. Database setting 'default_workspace' (if set to a specific workspace name)
 *    Special value '__last_opened__' means use last_opened_workspace from database
 * 3. Database setting 'last_opened_workspace' (the last workspace the user opened)
 * 4. Fallback to first available workspace
 * 
 * @return string The workspace name
 */
function getWorkspaceFilter() {
    static $cached = null;

    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }
    
    // First check URL parameters - but ignore if empty
    // These are dynamic, so don't cache if found
    if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace']) && $_POST['workspace'] !== '') {
        return $_POST['workspace'];
    }
    
    // Return cached value if we already computed it
    if ($cached !== null) {
        return $cached;
    }
    
    // If no parameter or empty parameter, check for default workspace setting in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $defaultWorkspace = $stmt->fetchColumn();
            // Only use defaultWorkspace if it's a real workspace name (not __last_opened__ or empty)
            if ($defaultWorkspace !== false && $defaultWorkspace !== '' && $defaultWorkspace !== '__last_opened__') {
                // Verify workspace exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$defaultWorkspace]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $defaultWorkspace;
                    return $cached;
                }
            }
            
            // Check for last_opened_workspace setting (used when default_workspace is '__last_opened__' or empty)
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['last_opened_workspace']);
            $lastOpened = $stmt->fetchColumn();
            if ($lastOpened !== false && $lastOpened !== '') {
                // Verify the workspace still exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$lastOpened]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $lastOpened;
                    return $cached;
                }
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
            error_log('functions: getWorkspaceFilter() failed: ' . $e->getMessage());
        }
    }
    
    // Final fallback: get first available workspace
    $cached = getFirstWorkspaceName();
    return $cached;
}

/**
 * Render the current workspace as a small chip after a page title.
 *
 * The workspace-scoped pages (Notes, Folders, Tags, Tasks, ...) all show the
 * same heading whatever workspace is open, so the name is the only thing that
 * tells two visits apart. The chip carries the workspace colour (a layers
 * glyph when it has none), the name and a chevron: a button whose chevron opens a menu
 * listing every workspace as a link to this same page (page.php?workspace=X),
 * plus a shortcut to workspaces.php, so the page can be re-scoped in place.
 * js/page-title-workspace-menu.js (loaded by icon_sidebar.php) opens and
 * positions the menu; it is rendered here rather than fetched so it needs no
 * i18n runtime, which half of these pages never load.
 *
 * Returns an empty string when there is no workspace to name, which leaves
 * pages reached without one untouched. A public (password-protected) workspace
 * visitor gets the plain name: there is no other workspace to switch to.
 *
 * @param string|null $workspace Workspace name; defaults to getWorkspaceFilter().
 *                               A page whose scope is wider than one workspace
 *                               (dashboard.php) passes its scope label instead:
 *                               it is shown as is and, matching no workspace,
 *                               ticks no entry.
 * @param array $options 'query' extra query parameters carried by every
 *                               workspace link (dashboard.php: scope=single, so
 *                               the choice overrides a remembered multi-scope);
 *                       'items' action entries appended after the workspaces,
 *                               each ['icon', 'label', 'action'], rendered as a
 *                               button carrying data-action for the page's own
 *                               handler (dashboard.php: its scope modal).
 * @return string HTML fragment, or '' when there is nothing to show.
 */
function poznoteRenderPageTitleWorkspace($workspace = null, array $options = []) {
    if ($workspace === null) {
        $workspace = getWorkspaceFilter();
    }
    $workspace = trim((string)$workspace);
    if ($workspace === '' || $workspace === '__last_opened__') {
        return '';
    }

    $esc = static function ($value): string {
        return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    $escaped = $esc($workspace);

    global $con;
    $colors = isset($con) ? poznoteGetWorkspaceColorsMap($con) : [];
    $colorOf = static function ($name) use ($colors): string {
        $hex = isset($colors[$name]) ? (string)$colors[$name]['hex'] : '';
        return preg_match('/^#[0-9a-f]{3,8}$/i', $hex) ? $hex : '';
    };

    // The chip leads with the workspace colour (workspaces.php) when it has
    // one, else with a layers glyph; the dashboard's multi-workspace labels
    // ("All workspaces") match no workspace and get the glyph too.
    $chipHex = $colorOf($workspace);
    $chipLead = $chipHex !== ''
        ? '<span class="poznote-page-title-workspace-dot" style="background-color: ' . $esc($chipHex) . '"></span>'
        : '<i class="lucide lucide-layers poznote-page-title-workspace-icon" aria-hidden="true"></i>';
    $chipName = '<span class="poznote-page-title-workspace-name">' . $escaped . '</span>';

    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return '<span class="poznote-page-title-workspace poznote-page-title-workspace-static" title="' . $escaped . '">' . $chipLead . $chipName . '</span>';
    }

    // A page can take the whole switch over ('button_action'): the chip then
    // fires that action straight away instead of opening the menu below. The
    // dashboard uses it so one click lands on its scope modal, which already
    // offers a single workspace, several, all of them, or a tag.
    if (!empty($options['button_action'])) {
        return '<button type="button" class="poznote-page-title-workspace" id="poznotePageTitleWorkspaceBtn"'
            . ' data-action="' . $esc($options['button_action']) . '"'
            . ' title="' . $esc($options['button_title'] ?? t('page_title.switch_workspace', [], 'Switch workspace')) . '"'
            . ' aria-haspopup="dialog">'
            . $chipLead . $chipName
            . '<i class="lucide lucide-chevron-down poznote-page-title-workspace-chevron" aria-hidden="true"></i>'
            . '</button>';
    }

    $names = [];
    if (isset($con)) {
        try {
            $stmt = $con->query('SELECT name FROM workspaces ORDER BY name COLLATE NOCASE');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $name = (string)$row['name'];
                if ($name !== '') {
                    $names[] = $name;
                }
            }
        } catch (Exception $e) {
            $names = [];
        }
    }
    // Dots only when there is a colour to show: an empty slot on every row
    // would just indent the names.
    $showDots = !empty($colors);

    // Same page, only the workspace changes. The other parameters (a search, a
    // folder, a date) belong to the workspace being left; the rail's links drop
    // them the same way.
    $page = basename((string)parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));
    if ($page === '') {
        $page = 'index.php';
    }

    $html = '<button type="button" class="poznote-page-title-workspace" id="poznotePageTitleWorkspaceBtn"'
        . ' title="' . $esc(t('page_title.switch_workspace', [], 'Switch workspace')) . '"'
        . ' aria-haspopup="menu" aria-expanded="false" aria-controls="poznotePageTitleWorkspaceMenu">'
        . $chipLead . $chipName
        . '<i class="lucide lucide-chevron-down poznote-page-title-workspace-chevron" aria-hidden="true"></i>'
        . '</button>';

    // <span>s throughout: the fragment sits inside an <h1>, which only takes
    // phrasing content. The script moves the menu under <body> anyway.
    $html .= '<span class="poznote-page-title-workspace-menu" id="poznotePageTitleWorkspaceMenu" role="menu"'
        . ' aria-label="' . $esc(t('page_title.workspaces', [], 'Workspaces')) . '">';
    foreach ($names as $name) {
        $isCurrent = $name === $workspace;
        $hex = $colorOf($name);
        $html .= '<a class="poznote-page-title-workspace-item' . ($isCurrent ? ' poznote-page-title-workspace-item-current' : '') . '"'
            . ' role="menuitemradio" aria-checked="' . ($isCurrent ? 'true' : 'false') . '"'
            . ' href="' . $esc($page . '?' . http_build_query(array_merge($options['query'] ?? [], ['workspace' => $name]))) . '"'
            . ' data-workspace="' . $esc($name) . '">';
        if ($showDots) {
            $html .= $hex !== ''
                ? '<span class="poznote-page-title-workspace-dot" style="background-color: ' . $esc($hex) . '"></span>'
                : '<span class="poznote-page-title-workspace-dot poznote-page-title-workspace-dot-none"></span>';
        }
        $html .= '<span class="poznote-page-title-workspace-item-name">' . $esc($name) . '</span>'
            . ($isCurrent ? '<i class="lucide lucide-check" aria-hidden="true"></i>' : '')
            . '</a>';
    }
    $html .= '<span class="poznote-page-title-workspace-menu-sep" role="separator"></span>';
    foreach (($options['items'] ?? []) as $item) {
        $html .= '<button type="button" class="poznote-page-title-workspace-item poznote-page-title-workspace-item-action" role="menuitem"'
            . (!empty($item['action']) ? ' data-action="' . $esc($item['action']) . '"' : '') . '>'
            . (!empty($item['icon']) ? '<i class="lucide ' . $esc($item['icon']) . '" aria-hidden="true"></i>' : '')
            . '<span class="poznote-page-title-workspace-item-name">' . $esc($item['label'] ?? '') . '</span>'
            . '</button>';
    }
    $html .= '<a class="poznote-page-title-workspace-item poznote-page-title-workspace-item-manage" role="menuitem" href="workspaces.php">'
        . '<i class="lucide lucide-layers" aria-hidden="true"></i>'
        . '<span class="poznote-page-title-workspace-item-name">' . $esc(t('page_title.manage_workspaces', [], 'Manage workspaces')) . '</span>'
        . '</a>'
        . '</span>';

    return $html;
}

/**
 * Return a filesystem-safe, deterministic segment for workspace background files.
 */
function getWorkspaceBackgroundSegment($workspace) {
    $workspace = trim((string)$workspace);
    if ($workspace === '') {
        return 'default';
    }

    $segment = preg_replace('/[^A-Za-z0-9_-]/', '_', $workspace);
    $segment = trim((string)$segment, '_');

    if ($segment === '') {
        $segment = 'workspace';
    }

    if ($segment !== $workspace) {
        $segment .= '_' . substr(hash('sha256', $workspace), 0, 8);
    }

    return $segment;
}

/**
 * Save the last opened workspace to the database
 * This is called when a workspace is opened/selected
 * 
 * @param string $workspace The workspace name to save
 * @return bool Whether the save was successful
 */
function saveLastOpenedWorkspace($workspace) {
    global $con;
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return false;
    }

    if (!isset($con) || empty($workspace)) {
        return false;
    }
    
    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return $stmt->execute(['last_opened_workspace', $workspace]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Default note titles as they may already be stored in existing databases,
 * derived from src/i18n/* index.note.new_note values.
 */
function getDefaultNoteTitles(): array {
    static $titles = null;

    if ($titles === null) {
        $titles = [];
        foreach (glob(__DIR__ . '/i18n/*.json') ?: [] as $file) {
            $lang = basename($file, '.json');
            $dict = loadI18nDictionary($lang);
            $title = i18nGet($dict, 'index.note.new_note');
            if ($title !== null && trim($title) !== '') {
                $titles[] = $title;
            }
        }

        $titles = array_values(array_unique($titles));
        if (empty($titles)) {
            $titles = ['New note'];
        }
    }

    return $titles;
}

/**
 * Safe JSON payload for exposing default note titles to client scripts.
 */
function getDefaultNoteTitlesJson(): string {
    return json_encode(
        getDefaultNoteTitles(),
        JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
    ) ?: '["New note"]';
}

/**
 * Return metadata when a title is one of the localized default note titles,
 * optionally with a numeric suffix like " (2)".
 */
function matchDefaultNoteTitle($title): ?array {
    $normalizedTitle = trim((string)$title);
    if ($normalizedTitle === '') {
        return null;
    }

    foreach (getDefaultNoteTitles() as $defaultTitle) {
        $pattern = '/^' . preg_quote($defaultTitle, '/') . '(?: \((\d+)\))?$/u';
        if (preg_match($pattern, $normalizedTitle, $matches)) {
            return [
                'title' => $defaultTitle,
                'number' => $matches[1] ?? null,
            ];
        }
    }

    return null;
}

/**
 * Translate stored default note titles to the current UI language.
 */
function translateDefaultNoteTitle($title): string {
    $match = matchDefaultNoteTitle($title);
    if ($match === null) {
        return (string)$title;
    }

    if ($match['number'] !== null && $match['number'] !== '') {
        return t('index.note.new_note_numbered', ['number' => $match['number']], 'New note (' . $match['number'] . ')');
    }

    return t('index.note.new_note', [], 'New note');
}

/**
 * Generate a unique note title to prevent duplicates
 * Default to "New note" when empty.
 * If a title already exists, add a numeric suffix like " (1)", " (2)", ...
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null, $folder_id = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = t('index.note.new_note', [], 'New note');
    }
    
    // Check if title already exists (excluding the current note if updating)
    // Uniqueness is scoped to folder + workspace
    $query = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0";
    $params = [$title];

    // Check uniqueness within the same folder
    if ($folder_id !== null) {
        $query .= " AND folder_id = ?";
        $params[] = $folder_id;
    } else {
        $query .= " AND folder_id IS NULL";
    }

    // If workspace specified, restrict uniqueness to that workspace
    if ($workspace !== null) {
        $query .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    if ($excludeId !== null) {
        $query .= " AND id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $count = $stmt->fetchColumn();
    
    // If no duplicate, return the title as is
    if ($count == 0) {
        return $title;
    }
    
    // If duplicate exists, add a number suffix
    $counter = 1;
    $baseTitle = $title;
    
    do {
        $title = $baseTitle . ' (' . $counter . ')';
        
    $stmt = $con->prepare($query);
    $params[0] = $title; // Update the title in params
    $stmt->execute($params);
        $count = $stmt->fetchColumn();
        
        $counter++;
    } while ($count > 0);
    
    return $title;
}




// Note: schema migrations are handled at runtime by db_connect.php



/**
 * Delete directory recursively
 */
function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    
    foreach ($files as $fileinfo) {
        $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
        $todo($fileinfo->getRealPath());
    }
    
    rmdir($dir);
}

// Helper function to ensure proper permissions on data directory
function ensureDataPermissions() {
    if (isset($_SESSION['user_id'])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($_SESSION['user_id']);
        $userDir = $dataManager->getUserBasePath();
        $dbPath = $dataManager->getUserDatabasePath();
        
        if (is_dir($userDir)) {
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                // Use shell command for recursive chown
                exec('chown -R www-data:www-data ' . escapeshellarg($userDir) . ' 2>/dev/null');
            }
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    } else {
        $dataDir = __DIR__ . '/data';
        if (is_dir($dataDir)) {
            // Recursively set ownership to match the data directory owner
            $dataOwner = fileowner($dataDir);
            $dataGroup = filegroup($dataDir);
            
            // Use shell command for recursive chown
            exec('chown -R ' . (int)$dataOwner . ':' . (int)$dataGroup . ' ' . escapeshellarg($dataDir) . ' 2>/dev/null');
            
            // Ensure database file has write permissions
            $dbPath = $dataDir . '/database/poznote.db';
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    }
}

/**
 * Get the complete folder path including parent folders
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return string The complete folder path (e.g., "Parent/Child")
 */
function getFolderPath($folder_id, $con) {
    static $cache = [];
    static $folderData = null;
    
    if ($folder_id === null || $folder_id === 0) {
        return 'Default';
    }
    
    // Return cached path if available
    if (isset($cache[$folder_id])) {
        return $cache[$folder_id];
    }
    
    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }
    
    $path = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        
        // Add folder name to the beginning of the path
        array_unshift($path, $folder['name']);
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    $result = !empty($path) ? implode('/', $path) : 'Default';
    $cache[$folder_id] = $result;
    return $result;
}

/**
 * Get the complete folder path as individual segments (root first)
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return array Array of ['id' => int, 'name' => string] from root folder down to the folder itself
 */
function getFolderPathSegments($folder_id, $con) {
    static $folderData = null;

    if ($folder_id === null || $folder_id === 0) {
        return [];
    }

    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }

    $segments = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;

    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        array_unshift($segments, ['id' => $currentId, 'name' => $folder['name']]);
        $currentId = $folder['parent_id'];
        $depth++;
    }

    return $segments;
}

/**
 * Fix database inconsistencies in notes:
 * 1. Populates folder_id from legacy folder (TEXT) column.
 * 2. Re-generates search snippets (entry column) from physical files if empty.
 * 
 * @param PDO $con The database connection
 * @return array Results of the repair operation
 */
function repairDatabaseEntries($con) {
    if (!$con) return ['success' => false, 'error' => 'No database connection'];
    
    $fixedFolders = 0;
    $createdFolders = 0;
    $fixedEntries = 0;
    
    try {
        // --- PART 1: FOLDERS MIGRATION ---
        // Only repair notes that are NOT in trash to avoid re-creating deleted folders
        $stmt = $con->query("SELECT id, folder, workspace FROM entries WHERE folder IS NOT NULL AND folder != '' AND folder_id IS NULL AND trash = 0");
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($notes as $note) {
            $noteId = $note['id'];
            $folderName = $note['folder'];
            $workspace = $note['workspace'] ?: 'Poznote';
            
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? LIMIT 1");
            $checkStmt->execute([$folderName, $workspace]);
            $folder = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                $folderId = $folder['id'];
            } else {
                $insertStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                $insertStmt->execute([$folderName, $workspace]);
                $folderId = $con->lastInsertId();
                $createdFolders++;
            }
            
            $updateStmt = $con->prepare("UPDATE entries SET folder_id = ? WHERE id = ?");
            $updateStmt->execute([$folderId, $noteId]);
            $fixedFolders++;
        }

        // --- PART 2: EMPTY ENTRY SNIPPETS (FOR SEARCH) ---
        $stmt = $con->query("SELECT id, type FROM entries WHERE (entry IS NULL OR entry = '') AND trash = 0");
        $emptyNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($emptyNotes as $note) {
            $noteId = $note['id'];
            $type = $note['type'] ?: 'note';
            $filePath = getEntryFilename($noteId, $type);
            
            if (file_exists($filePath)) {
                $content = file_get_contents($filePath);
                if ($content !== false) {
                    // Extract a clean snippet for search
                    $snippet = cleanContentForSearch($content);
                    $snippet = strip_tags($snippet);
                    $snippet = mb_substr($snippet, 0, 500); // Limit to 500 chars for DB performance
                    
                    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$snippet, $noteId]);
                    $fixedEntries++;
                }
            }
        }
        return [
            'success' => true, 
            'folders_fixed' => $fixedFolders, 
            'folders_created' => $createdFolders,
            'entries_fixed' => $fixedEntries
        ];
    } catch (Exception $e) {
        error_log("Error in repairDatabaseEntries: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
}



/**
 * Resolve folder path to ID, optionally creating missing segments
 * 
 * @param string $workspace The workspace name
 * @param string $folderPath The full folder path (e.g., "A/B/C")
 * @param bool $createIfMissing Whether to create folders if they don't exist
 * @param PDO $con Database connection
 * @return int|null The resolved folder ID or null if not found/created
 */
function resolveFolderPathToId($workspace, $folderPath, $createIfMissing = false, $con = null) {
    if ($con === null) {
        global $con;
    }
    if (!$con) return null;

    $folderPath = trim($folderPath);
    if ($folderPath === '' || strtolower($folderPath) === 'default') return null;
    
    $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
    if (empty($segments)) return null;
    
    $parentId = null;
    foreach ($segments as $seg) {
        $sql = "SELECT id FROM folders WHERE name = ? AND workspace = ?";
        $params = [$seg, $workspace];
        if ($parentId === null) {
            $sql .= " AND parent_id IS NULL";
        } else {
            $sql .= " AND parent_id = ?";
            $params[] = $parentId;
        }
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) {
            $parentId = (int)$row['id'];
        } elseif ($createIfMissing) {
            // Create the folder segment
            $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
            $stmt->execute([$seg, $workspace, $parentId]);
            $parentId = (int)$con->lastInsertId();
        } else {
            return null;
        }
    }
    
    return $parentId;
}





/**
 * Gate access behind the SETTINGS_PASSWORD when configured.
 * Redirects to settings.php if the session has not been unlocked.
 */
function requireSettingsPassword() {
    if (!defined('SETTINGS_PASSWORD') || SETTINGS_PASSWORD === '') {
        return;
    }
    if (!empty($_SESSION['settings_password_authenticated'])) {
        return;
    }
    header('Location: ' . (strpos($_SERVER['SCRIPT_NAME'] ?? '', '/admin/') !== false ? '../' : '') . 'settings.php');
    exit;
}

/**
 * Build a short plain-text excerpt (or task preview) for a note card.
 * Shared by the dashboard and diary board views.
 * @return array{text: string, tasks: ?array, search: string, image: ?string}
 */
function buildNoteCardPreview($noteId, $type) {
    $file = getEntryFilename($noteId, $type);
    if (!is_readable($file)) {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    if ($type === 'tasklist') {
        $json = normalizeTasklistJsonContent($raw);
        $items = json_decode($json !== '' ? $json : $raw, true);
        $tasks = [];
        $taskSearch = [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $label = trim((string)($item['text'] ?? ''));
                if ($label === '') continue;
                $taskSearch[] = $label;
                if (count($tasks) < 4) {
                    $tasks[] = ['text' => $label, 'done' => !empty($item['completed'])];
                }
            }
        }
        return ['text' => '', 'tasks' => $tasks, 'search' => implode(' ', $taskSearch), 'image' => null];
    }

    // First image of the note, shown as a card thumbnail. Only attachment
    // URLs, http(s) sources and small data URIs are kept (a multi-MB base64
    // image would bloat the page's embedded JSON).
    $image = null;
    if ($type === 'markdown') {
        if (preg_match('/!\[[^\]]*\]\(\s*([^)\s]+)/', $raw, $im)) {
            $image = $im[1];
        }
    } else {
        if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $raw, $im)) {
            $image = html_entity_decode($im[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    if ($image !== null) {
        $isSmallDataUri = stripos($image, 'data:image/') === 0 && strlen($image) < 65536;
        if (!$isSmallDataUri && !preg_match('#^(/?api/v1/notes/\d+/attachments/|https?://|attachments/)#i', $image)) {
            $image = null;
        }
    }

    if ($type === 'markdown') {
        $text = preg_replace('/```[^\n]*\n([\s\S]*?)```/', ' $1 ', $raw);
        $text = preg_replace('/^#{1,6}\s+/m', '', $text);
        $text = preg_replace('/!\[[^\]]*\]\([^)]*\)/', ' ', $text);
        $text = preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $text);
        $text = str_replace(['**', '__', '*', '`', '> '], ' ', $text);
    } else {
        // HTML notes: turn line-breaking tags into newlines before stripping
        // so the excerpt keeps the note's line structure.
        $text = preg_replace('/<br\s*\/?>/i', "\n", $raw);
        $text = preg_replace('/<\/?(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table)(\s[^>]*)?>/i', "\n", $text);
    }

    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = str_replace("\r", '', $text);
    // Collapse spaces but keep single line breaks: views that want them render
    // the excerpt with white-space: pre-line (diary), others show spaces.
    $text = preg_replace('/[^\S\n]+/u', ' ', $text);
    $text = preg_replace('/ ?\n ?/u', "\n", $text);
    $text = preg_replace('/\n{2,}/u', "\n", $text);
    $text = trim((string)$text);
    $previewText = $text;
    if ($previewText !== '' && mb_strlen($previewText, 'UTF-8') > 220) {
        $previewText = rtrim(mb_substr($previewText, 0, 220, 'UTF-8')) . '…';
    }

    $search = preg_replace('/\s+/u', ' ', $text);
    return ['text' => $previewText, 'tasks' => null, 'search' => $search, 'image' => $image];
}

/**
 * Checklist items of a regular (HTML or markdown) note, in document order,
 * as the global tasks page lists them next to the tasklist notes.
 *
 * Each item is ['index' => int, 'text' => string, 'completed' => bool]. The
 * index is what the client uses to toggle the item back in the note source,
 * so it must be computed the same way on both sides:
 *   - HTML notes: the ordinal of the item's <input class="checklist-checkbox">
 *     among all such inputs of the note (js: input.checklist-checkbox);
 *   - markdown notes: the 0-based line number of the "- [ ] text" line.
 * Items with an empty label are skipped but still consume an index.
 *
 * @return array<int, array{index:int, text:string, completed:bool}>
 */
function extractNoteChecklistItems(string $content, string $type): array {
    if ($type === 'markdown') {
        return extractMarkdownChecklistItems($content);
    }
    if ($type === 'note') {
        return extractHtmlChecklistItems($content);
    }
    return [];
}

/**
 * Checklist items of an HTML note (see extractNoteChecklistItems). The
 * checkbox markup is the one js/checklist.js writes: the checked state lives
 * in data-checked when present (the editor keeps it in sync), otherwise in
 * the checked attribute (the sanitizer only persists the latter). The item
 * label is the text following the checkbox up to the end of its <li>, the
 * start of a nested list, or the next checkbox.
 */
function extractHtmlChecklistItems(string $html): array {
    if ($html === '' || stripos($html, 'checklist-checkbox') === false) {
        return [];
    }
    if (!preg_match_all('/<input\b[^>]*>/i', $html, $matches, PREG_OFFSET_CAPTURE)) {
        return [];
    }

    $items = [];
    $index = 0;
    foreach ($matches[0] as $match) {
        $tag = $match[0];
        if (!preg_match('/\bclass\s*=\s*["\']([^"\']*)["\']/i', $tag, $classMatch)
            || !preg_match('/(?:^|\s)checklist-checkbox(?:\s|$)/', $classMatch[1])) {
            continue;
        }

        $rest = substr($html, $match[1] + strlen($tag));
        $end = preg_match('/<(?:ul|ol)\b|<\/li\s*>|<input\b/i', $rest, $endMatch, PREG_OFFSET_CAPTURE)
            ? $endMatch[0][1]
            : strlen($rest);
        $text = html_entity_decode(strip_tags(substr($rest, 0, $end)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string)preg_replace('/\s+/u', ' ', str_replace(["\u{200B}", "\u{00A0}"], ' ', $text)));

        if (preg_match('/\sdata-checked=["\']?([01])/i', $tag, $dataChecked)) {
            $completed = $dataChecked[1] === '1';
        } else {
            $completed = (bool)preg_match('/\schecked(?=[\s>=\/])/i', $tag);
        }

        if ($text !== '') {
            $items[] = ['index' => $index, 'text' => $text, 'completed' => $completed];
        }
        $index++;
    }

    return $items;
}

/**
 * Task list items of a markdown note (see extractNoteChecklistItems): every
 * "- [ ] text" / "- [x] text" line outside fenced code blocks, matched with
 * the same pattern as markdown_parser.php. The index is the line number in
 * the "\n"-split source, which is how the client addresses the line again.
 */
function extractMarkdownChecklistItems(string $markdown): array {
    if ($markdown === '' || (strpos($markdown, '[ ]') === false && stripos($markdown, '[x]') === false)) {
        return [];
    }

    $items = [];
    $inFence = false;
    $lines = explode("\n", $markdown);
    foreach ($lines as $lineNumber => $rawLine) {
        $line = rtrim($rawLine, "\r");
        if (preg_match('/^\s*(```|~~~)/', $line)) {
            $inFence = !$inFence;
            continue;
        }
        if ($inFence) {
            continue;
        }
        if (!preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $line, $m)) {
            continue;
        }
        // Plain-text label: links keep their text, emphasis/code markers go
        $text = preg_replace('/!?\[([^\]]*)\]\([^)]*\)/', '$1', $m[3]);
        $text = str_replace(['**', '__', '~~', '`'], '', (string)$text);
        $text = trim((string)preg_replace('/\s+/u', ' ', $text));
        if ($text === '') {
            continue;
        }
        $items[] = [
            'index'     => (int)$lineNumber,
            'text'      => $text,
            'completed' => strtolower($m[2]) === 'x',
        ];
    }

    return $items;
}

/**
 * Render the view controls used by the dashboard and diary boards, next to
 * the filter bar. $prefix namespaces the localStorage keys so each page
 * remembers its own settings. A single toggle cycles through the views
 * (grid small/medium/large, then list); the columns button caps the grid
 * width and is hidden in list layout (board-view-menu.js drives both).
 */
// ============================================================================
// Workspace tags and multi-workspace scope
// ============================================================================
//
// workspaces.tags holds a comma-separated list of labels ("school,psycho").
// Tags group workspaces on pages that can show several of them at once: the
// dashboard scope selector lists them and "scope=tag&tag=school" opens every
// workspace carrying that tag.

/**
 * Normalize a raw tags value (array or comma-separated string) into a clean
 * list: trimmed, non-empty, deduplicated case-insensitively, capped in size.
 */
function poznoteParseWorkspaceTags($raw): array {
    $parts = is_array($raw) ? $raw : explode(',', (string)$raw);
    $tags = [];
    $seen = [];
    foreach ($parts as $part) {
        $tag = trim((string)preg_replace('/\s+/u', ' ', (string)$part));
        if ($tag === '') continue;
        $tag = mb_substr($tag, 0, 50);
        $key = mb_strtolower($tag);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $tags[] = $tag;
        if (count($tags) >= 20) break;
    }
    return $tags;
}

function poznoteSerializeWorkspaceTags(array $tags): string {
    return implode(',', poznoteParseWorkspaceTags($tags));
}

/**
 * Tags of every workspace, keyed by workspace name (workspace list order).
 */
function poznoteGetWorkspaceTagsMap(PDO $con): array {
    $map = [];
    try {
        $stmt = $con->query('SELECT name, tags FROM workspaces ORDER BY name COLLATE NOCASE');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $map[(string)$row['name']] = poznoteParseWorkspaceTags($row['tags'] ?? '');
        }
    } catch (Exception $e) {
        // Column missing on a not-yet-migrated database: no tags
        try {
            $stmt = $con->query('SELECT name FROM workspaces ORDER BY name COLLATE NOCASE');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $map[(string)$row['name']] = [];
            }
        } catch (Exception $e2) {
            error_log('functions: poznoteGetWorkspaceTagsMap() failed: ' . $e2->getMessage());
        }
    }
    return $map;
}

/**
 * Color of every colored workspace, keyed by name: the stored value (palette
 * id or '#rrggbb', same semantics as entries.color) and the hex it resolves
 * to. Workspaces without a color, or whose palette entry was deleted, are
 * absent.
 */
function poznoteGetWorkspaceColorsMap(PDO $con): array {
    $map = [];
    try {
        $stmt = $con->query("SELECT name, color FROM workspaces WHERE color IS NOT NULL AND color != ''");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $hex = resolveNoteColorHex((string)$row['color']);
            if ($hex !== '') {
                $map[(string)$row['name']] = ['color' => (string)$row['color'], 'hex' => $hex];
            }
        }
    } catch (Exception $e) {
        // Column missing on a not-yet-migrated database: no colors
        error_log('functions: poznoteGetWorkspaceColorsMap() failed: ' . $e->getMessage());
    }
    return $map;
}

/**
 * Resolve which workspaces a multi-workspace page shows, from its request
 * parameters:
 *   workspace=X                 one workspace (the default)
 *   scope=all                   every workspace
 *   scope=tag&tag=T             every workspace carrying tag T
 *   scope=list&ws[]=A&ws[]=B    an explicit list (one name falls back to single)
 *
 * Returns:
 *   mode        'single' | 'all' | 'tag' | 'list'
 *   workspaces  matching workspace names, in workspace list order
 *   tag         the requested tag (tag mode)
 *   query       the URL parameters reproducing this scope
 *   key         a short stable identifier for per-scope client preferences
 *   tags_map    name => tags for every workspace (for selectors)
 *   colors_map  name => ['color' => stored value, 'hex' => resolved] for colored workspaces
 */
function poznoteResolveWorkspaceScope(PDO $con, array $params, string $fallbackWorkspace): array {
    $mode = isset($params['scope']) ? strtolower(trim((string)$params['scope'])) : '';
    $tagsMap = poznoteGetWorkspaceTagsMap($con);
    $allNames = array_keys($tagsMap);

    $scope = ['mode' => 'single', 'workspaces' => [], 'tag' => '', 'query' => [], 'key' => '', 'tags_map' => $tagsMap, 'colors_map' => poznoteGetWorkspaceColorsMap($con)];

    if ($mode === 'all' && !empty($allNames)) {
        $scope['mode'] = 'all';
        $scope['workspaces'] = $allNames;
        $scope['query'] = ['scope' => 'all'];
        $scope['key'] = 'all';
    } elseif ($mode === 'tag') {
        $tag = trim((string)($params['tag'] ?? ''));
        if ($tag !== '') {
            $needle = mb_strtolower($tag);
            $matches = [];
            foreach ($tagsMap as $name => $tags) {
                foreach ($tags as $candidate) {
                    if (mb_strtolower($candidate) === $needle) {
                        $matches[] = $name;
                        break;
                    }
                }
            }
            // Kept even without a match so the page can say so
            $scope['mode'] = 'tag';
            $scope['tag'] = $tag;
            $scope['workspaces'] = $matches;
            $scope['query'] = ['scope' => 'tag', 'tag' => $tag];
            $scope['key'] = 'tag:' . $needle;
        }
    } elseif ($mode === 'list') {
        $wanted = $params['ws'] ?? [];
        if (!is_array($wanted)) $wanted = [$wanted];
        $wanted = array_map('strval', $wanted);
        $matches = array_values(array_filter($allNames, fn($n) => in_array($n, $wanted, true)));
        if (count($matches) === 1) {
            $scope['workspaces'] = $matches;
        } elseif (count($matches) > 1) {
            $scope['mode'] = 'list';
            $scope['workspaces'] = $matches;
            $scope['query'] = ['scope' => 'list', 'ws' => $matches];
            $scope['key'] = 'list:' . implode('|', $matches);
        }
    }

    if ($scope['mode'] === 'single') {
        if (empty($scope['workspaces']) && $fallbackWorkspace !== '') {
            $scope['workspaces'] = [$fallbackWorkspace];
        }
        $scope['query'] = !empty($scope['workspaces']) ? ['workspace' => $scope['workspaces'][0]] : [];
    }

    return $scope;
}

function renderBoardViewMenu(string $prefix) {
    $idPrefix = htmlspecialchars($prefix, ENT_QUOTES, 'UTF-8');
    echo '<div class="board-view-controls" data-view-prefix="' . $idPrefix . '">' .
        '<button type="button" id="' . $idPrefix . 'ViewLayoutBtn" class="board-view-btn board-view-layout-toggle"' .
            ' data-label-grid="' . t_h('dashboard.view.layout_grid', [], 'Grid') . '"' .
            ' data-label-list="' . t_h('dashboard.view.layout_list', [], 'List') . '"' .
            ' data-label-small="' . t_h('dashboard.view.size_small', [], 'Small') . '"' .
            ' data-label-medium="' . t_h('dashboard.view.size_medium', [], 'Medium') . '"' .
            ' data-label-large="' . t_h('dashboard.view.size_large', [], 'Large') . '"' .
            ' data-label-wide="' . t_h('dashboard.view.size_wide', [], 'Wide') . '">' .
            '<i class="lucide lucide-grid"></i>' .
            '<i class="lucide lucide-layout-list"></i>' .
            '<span class="board-view-size-letter"></span>' .
        '</button>' .
        '<button type="button" id="' . $idPrefix . 'ViewColumnsBtn" class="board-view-btn board-view-columns-btn"' .
            ' data-label-columns="' . t_h('dashboard.view.columns', [], 'Maximum columns') . '">' .
            '<span class="board-view-columns-value"></span>' .
        '</button>' .
    '</div>';
}




















