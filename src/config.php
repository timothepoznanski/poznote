<?php
// ============================================================
// HELPER: Read environment variable safely
// ============================================================
// getenv() returns false (not null) when a variable is not set.
// The ?? operator only checks for null, so getenv('X') ?? 'default'
// would yield false instead of 'default'. This helper fixes that.
function _env(string $key, $default = '') {
    $val = $_ENV[$key] ?? null;
    if ($val !== null) return $val;
    $val = getenv($key);
    return ($val !== false) ? $val : $default;
}

/**
 * Return a cache version that changes when theme-critical assets change.
 */
function poznoteGetThemeAssetVersion() {
    static $cachedVersion = null;

    if ($cachedVersion !== null) {
        return $cachedVersion;
    }

    $paths = [
        'js/theme-init.js',
        'js/theme-manager.js',
        'js/public-note-theme-init.js',
        'js/public-note.js',
        'js/excalidraw-theme-init.js',
        'js/excalidraw.js',
        'js/excalidraw-editor.js',
        'js/excalidraw-dist/excalidraw-bundle.iife.js',
        'js/codemirror-dist/markdown-codemirror.iife.js',
        'js/slash-command.js',
        'js/emoji-autocomplete.js',
        'js/graph.js',
        'css/graph.css',
        'css/dark-mode/variables.css',
        'css/dark-mode/layout.css',
        'css/dark-mode/menus.css',
        'css/dark-mode/editor.css',
        'css/dark-mode/modals.css',
        'css/dark-mode/components.css',
        'css/dark-mode/pages.css',
        'css/dark-mode/markdown.css',
        'css/dark-mode/kanban.css',
        'css/dark-mode/icons.css',
        'css/layout.css',
        'css/outline.css',
        'css/tabs.css',
        'css/public_folder.css',
        'css/public_note.css',
        'css/excalidraw.css',
        'css/excalidraw-unified.css',
        'css/note-reference.css',
        'css/search-replace.css',
        'css/favorites.css',
        'css/trash.css',
        'css/attachments_list.css',
        'css/home/dark-mode.css',
        'css/shared/dark-mode.css',
        'css/notes/sidebar.css',
    ];

    $version = 0;
    foreach ($paths as $relativePath) {
        $absolutePath = __DIR__ . '/' . $relativePath;
        if (is_file($absolutePath)) {
            $version = max($version, (int) filemtime($absolutePath));
        }
    }

    $cachedVersion = $version > 0 ? (string) $version : '';
    return $cachedVersion;
}

function poznoteBuildAssetCacheVersion($baseVersion = '') {
    $baseVersion = trim((string) $baseVersion);
    $themeAssetVersion = poznoteGetThemeAssetVersion();

    if ($baseVersion === '') {
        return $themeAssetVersion;
    }

    if ($themeAssetVersion === '') {
        return $baseVersion;
    }

    return $baseVersion . '-' . $themeAssetVersion;
}

/**
 * Build the URL for a static asset, cache-busted by the file's own mtime.
 *
 * Static assets are served with `Cache-Control: public, immutable` and a
 * one-year TTL, so a URL that never changes is never refetched. Versioning on
 * the release number alone is not enough: an edit made within a release leaves
 * the URL identical, and browsers keep serving the year-old copy. Worse, when
 * two files that must agree (utils.js defining a function, main.js exporting
 * it) are versioned differently, a browser can pair a fresh copy of one with a
 * stale copy of the other and break at runtime.
 *
 * Keying on the file's own mtime fixes both: any edit changes that file's URL
 * and only that file's URL. The release version stays in the URL as a readable
 * prefix, so the query string still says which build the page came from.
 *
 * Falls back to the release version alone when the file cannot be stat'ed, so
 * a bad path degrades to today's behaviour instead of emitting a broken link.
 *
 * @param string $path Asset path relative to this directory, e.g. 'css/trash.css'.
 *                     A leading '/' is accepted and preserved in the output.
 * @return string The HTML-safe URL to put straight into href/src.
 */
function poznoteAsset($path) {
    static $cache = [];

    $path = trim((string) $path);
    if ($path === '') {
        return '';
    }

    if (isset($cache[$path])) {
        return $cache[$path];
    }

    // Keep the caller's leading slash (some pages are served from a nested URL
    // and rely on root-relative asset paths) but strip it to find the file.
    $relativePath = ltrim($path, '/');
    $absolutePath = __DIR__ . '/' . $relativePath;

    // Loaded on demand: config.php is included by pages that do not all pull in
    // version_helper.php themselves, and the helper must not depend on that.
    if (!function_exists('getAppVersion')) {
        require_once __DIR__ . '/version_helper.php';
    }

    $version = getAppVersion();
    $mtime = is_file($absolutePath) ? @filemtime($absolutePath) : false;
    if ($mtime !== false) {
        $version .= '-' . $mtime;
    }

    $cache[$path] = htmlspecialchars($path . '?v=' . rawurlencode($version), ENT_QUOTES, 'UTF-8');
    return $cache[$path];
}

/**
 * Normalize a custom CSS filename stored under the css directory.
 * Returns an empty string when invalid.
 */
function poznoteNormalizeCustomCssPath($path) {
    $path = trim((string) $path);
    if ($path === '') {
        return '';
    }

    if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $path) || strpos($path, '\\') !== false) {
        return '';
    }

    $parts = parse_url($path);
    if ($parts === false) {
        return '';
    }

    if (isset($parts['scheme']) || isset($parts['host']) || isset($parts['user']) || isset($parts['port'])) {
        return '';
    }

    $hrefPath = trim((string) ($parts['path'] ?? ''), '/');
    if ($hrefPath === '' || strpos($hrefPath, '..') !== false) {
        return '';
    }

    if (strpos($hrefPath, 'css/') === 0) {
        $hrefPath = substr($hrefPath, 4);
    } elseif (strpos($hrefPath, '/') !== false) {
        return '';
    }

    if (!preg_match('/^[A-Za-z0-9._-]+\.css$/', $hrefPath)) {
        return '';
    }

    return $hrefPath;
}

/**
 * Resolve the custom CSS path from global settings with env fallback.
 */
function poznoteResolveCustomCssPath() {
    $fallbackPath = poznoteNormalizeCustomCssPath(_env('POZNOTE_CUSTOM_CSS_PATH', ''));

    try {
        require_once __DIR__ . '/users/db_master.php';
        $globalPath = getGlobalSetting('custom_css_path', '');
        $normalizedGlobalPath = poznoteNormalizeCustomCssPath($globalPath);

        if ($normalizedGlobalPath !== '' || trim((string) $globalPath) === '') {
            return $normalizedGlobalPath;
        }
    } catch (Exception $e) {
        // Fall back to environment-based configuration when the master DB is unavailable.
    }

    return $fallbackPath;
}

// ============================================================
// DATABASE CONFIGURATION
// ============================================================
// SQLite configuration (default path, used as fallback before user is authenticated)
define('SQLITE_DATABASE', _env('SQLITE_DATABASE', __DIR__ . '/data/database/poznote.db'));
define('SERVER_NAME', _env('SERVER_NAME', 'localhost'));

// Default timezone (will be overridden by database setting if available)
define('DEFAULT_TIMEZONE', 'Europe/Paris');

// ============================================================
// OIDC CONFIGURATION
// ============================================================
// OpenID Connect (OIDC) settings are managed from the admin UI
// (Settings > Admin Tools > OIDC / SSO) and stored in the global_settings table.
// Client ID, Client Secret, and disable normal login remain in .env.
// Other .env OIDC variables are no longer read. Configure them from the admin UI.

/**
 * Resolve an OIDC setting from the database only.
 */
function _oidc(string $dbKey, string $default = ''): string {
    try {
        require_once __DIR__ . '/users/db_master.php';
        $val = getGlobalSetting($dbKey, null);
        if ($val !== null) {
            return $val;
        }
    } catch (Exception $e) {
        // Return default when the master DB is unavailable.
    }
    return $default;
}

function _oidcBool(string $dbKey, bool $default = false): bool {
    try {
        require_once __DIR__ . '/users/db_master.php';
        $val = getGlobalSetting($dbKey, null);
        if ($val !== null) {
            return $val === '1' || $val === 'true';
        }
    } catch (Exception $e) {
        // Return default when the master DB is unavailable.
    }
    return $default;
}

function _envBool(string $envKey, bool $default = false): bool {
    $val = _env($envKey, '');
    if ($val === '') {
        return $default;
    }
    return in_array(strtolower($val), ['1', 'true', 'yes', 'on'], true);
}

define('OIDC_ENABLED', _oidcBool('oidc_enabled', false));
define('OIDC_PROVIDER_NAME', _oidc('oidc_provider_name', 'SSO'));
define('OIDC_ISSUER', rtrim(trim(_oidc('oidc_issuer', '')), '/'));
define('OIDC_DISCOVERY_URL', trim(_oidc('oidc_discovery_url', '')));
// Client ID and Client Secret: .env only (not stored in database)
define('OIDC_CLIENT_ID', trim(_env('POZNOTE_OIDC_CLIENT_ID', '')));
define('OIDC_CLIENT_SECRET', trim(_env('POZNOTE_OIDC_CLIENT_SECRET', '')));
define('OIDC_SCOPES', _oidc('oidc_scopes', 'openid profile email'));
define('OIDC_API_AUDIENCE', trim(_oidc('oidc_api_audience', '')));
define('OIDC_REDIRECT_URI', _oidc('oidc_redirect_uri', ''));
define('OIDC_END_SESSION_ENDPOINT', _oidc('oidc_end_session_endpoint', ''));
define('OIDC_POST_LOGOUT_REDIRECT_URI', _oidc('oidc_post_logout_redirect_uri', ''));
// Disable password login (SSO only) — .env only, not in admin UI
define('OIDC_DISABLE_NORMAL_LOGIN', _envBool('POZNOTE_OIDC_DISABLE_NORMAL_LOGIN', false));
define('OIDC_DISABLE_BASIC_AUTH', _oidcBool('oidc_disable_basic_auth', false));
define('OIDC_GROUPS_CLAIM', trim(_oidc('oidc_groups_claim', 'groups')));
define('OIDC_ALLOWED_GROUPS', _oidc('oidc_allowed_groups', ''));
define('OIDC_AUTO_CREATE_USERS', _oidcBool('oidc_auto_create_users', false));
define('OIDC_ALLOWED_USERS', _oidc('oidc_allowed_users', ''));
// Cap on how many user profiles auto-creation may bring the instance to.
// 0 (the default) means unlimited. Existing profiles, however they were
// created, count toward the cap.
define('OIDC_MAX_USERS', max(0, (int)_oidc('oidc_max_users', '0')));

// Optional: load an extra stylesheet from src/css/ on every HTML page.
// The preferred source is the Advanced section in settings.php.
define('CUSTOM_CSS_PATH', poznoteResolveCustomCssPath());

// Optional password to protect access to the Settings page.
define('SETTINGS_PASSWORD', _env('POZNOTE_SETTINGS_PASSWORD', ''));

/**
 * Resolve a global setting from the database with environment variable fallback.
 */
function poznoteResolveGlobalSetting(string $dbKey, string $envKey, $default = '') {
    try {
        require_once __DIR__ . '/users/db_master.php';
        $value = getGlobalSetting($dbKey, null);
        if ($value !== null) {
            return $value;
        }
    } catch (Exception $e) {
        // Fall back to environment-based configuration when the master DB is unavailable.
    }
    return _env($envKey, $default);
}

// Tenant isolation ("SaaS mode"). The admin picks which capabilities are
// blocked for non-admin users, stored as a JSON array of feature keys:
//   - user_sharing: non-admin users cannot discover the other accounts of the
//     instance (admin-only user directory, no sharing with specific users).
//   - user_webhooks: non-admin users cannot register personal webhooks.
//   - user_s3_backups: non-admin users do not see the S3 Backups section of
//     the Backup/Export page and cannot upload or download bucket archives.
//   - user_s3_restore: non-admin users do not see the Restore from S3 section
//     of the Restore/Import page and cannot restore bucket archives.
// Legacy fallback: instances configured before the feature list existed only
// had the on/off tenant_isolation flag, which meant user_sharing.
function poznoteResolveTenantIsolationFeatures(): array {
    $validFeatures = ['user_sharing', 'user_webhooks', 'user_s3_backups', 'user_s3_restore'];

    $raw = null;
    try {
        require_once __DIR__ . '/users/db_master.php';
        $raw = getGlobalSetting('tenant_isolation_features', null);
    } catch (Exception $e) {
        // Master DB unavailable: fall through to the environment.
    }
    if ($raw === null) {
        $envRaw = _env('POZNOTE_TENANT_ISOLATION_FEATURES', null);
        if (is_string($envRaw) && trim($envRaw) !== '') {
            // Environment uses a comma-separated list, e.g. "user_sharing,user_webhooks".
            $raw = json_encode(array_map('trim', explode(',', $envRaw)));
        }
    }

    if ($raw !== null) {
        $decoded = json_decode((string)$raw, true);
        $features = is_array($decoded) ? $decoded : [];
        return array_values(array_intersect($validFeatures, $features));
    }

    // Feature list never saved: honour the legacy on/off flag.
    $legacy = filter_var(poznoteResolveGlobalSetting('tenant_isolation', 'POZNOTE_TENANT_ISOLATION', 'false'), FILTER_VALIDATE_BOOL);
    return $legacy ? ['user_sharing'] : [];
}
define('TENANT_ISOLATION_FEATURES', poznoteResolveTenantIsolationFeatures());
// Kept for the pre-existing call sites, which all guard account discovery.
define('TENANT_ISOLATION', in_array('user_sharing', TENANT_ISOLATION_FEATURES, true));

// ============================================================
// GIT SYNC CONFIGURATION (GitHub, GitLab, Forgejo)
// ============================================================
// Enable or disable Git synchronization (global setting with env fallback)
define('GIT_SYNC_ENABLED', filter_var(poznoteResolveGlobalSetting('git_sync_enabled', 'POZNOTE_GIT_SYNC_ENABLED', 'false'), FILTER_VALIDATE_BOOL));
// Git provider: 'github', 'gitlab', 'forgejo'
define('GIT_PROVIDER', _env('POZNOTE_GIT_PROVIDER', 'github'));
// Git API base URL (optional, defaults to provider default)
define('GIT_API_BASE', _env('POZNOTE_GIT_API_BASE', ''));
// Personal Access Token
define('GIT_TOKEN', _env('POZNOTE_GIT_TOKEN', ''));
// Repository (owner/repo format)
define('GIT_REPO', _env('POZNOTE_GIT_REPO', ''));
// Branch to sync with
define('GIT_BRANCH', _env('POZNOTE_GIT_BRANCH', 'main'));
// Commit author name
define('GIT_AUTHOR_NAME', _env('POZNOTE_GIT_AUTHOR_NAME', 'Poznote'));
// Commit author email
define('GIT_AUTHOR_EMAIL', _env('POZNOTE_GIT_AUTHOR_EMAIL', 'poznote@localhost'));

/**
 * Build the final stylesheet URL, adding cache-busting for local files when possible.
 */
function poznoteGetAppPathPrefix() {
    $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    $scriptDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');

    if ($scriptDir === '' || $scriptDir === '.') {
        return '';
    }

    return $scriptDir;
}

function poznoteGetCustomCssHref() {
    if (!defined('CUSTOM_CSS_PATH') || CUSTOM_CSS_PATH === '') {
        return '';
    }

    $filename = poznoteNormalizeCustomCssPath(CUSTOM_CSS_PATH);
    if ($filename === '') {
        return '';
    }

    $prefix = poznoteGetAppPathPrefix();

    // Prefer the user-writable data/css/ directory (accessible via Docker volume).
    $dataAbsolutePath = __DIR__ . '/data/css/' . $filename;
    if (is_file($dataAbsolutePath)) {
        $version = (string) filemtime($dataAbsolutePath);
        return $prefix . '/data/css/' . $filename . ($version !== '' ? '?v=' . rawurlencode($version) : '');
    }

    // Fall back to the css/ directory bundled in the image (development / legacy).
    $absoluteFilePath = __DIR__ . '/css/' . $filename;
    if (!is_file($absoluteFilePath)) {
        return '';
    }

    $version = (string) filemtime($absoluteFilePath);
    if ($version === '') {
        return '';
    }

    return $prefix . '/css/' . $filename . '?v=' . rawurlencode($version);
}

/**
 * Render the extra stylesheet link tag.
 */
function poznoteRenderCustomCssLinkTag() {
    $href = poznoteGetCustomCssHref();
    if ($href === '') {
        return '';
    }

    return '<link rel="stylesheet" href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '" data-poznote-custom-css="1">';
}

/**
 * Limit automatic stylesheet injection to HTML responses.
 */
function poznoteIsHtmlResponseBuffer($buffer) {
    foreach (headers_list() as $header) {
        if (stripos($header, 'Content-Type:') !== 0) {
            continue;
        }

        $contentType = trim(substr($header, strlen('Content-Type:')));
        if ($contentType === '') {
            break;
        }

        return stripos($contentType, 'text/html') !== false
            || stripos($contentType, 'application/xhtml+xml') !== false;
    }

    return stripos($buffer, '<head') !== false
        || stripos($buffer, '<html') !== false
        || stripos($buffer, '<!DOCTYPE html') !== false;
}

/**
 * Inject the extra stylesheet before </head> on HTML pages.
 */
function poznoteInjectCustomCssIntoHtml($buffer) {
    if (!defined('CUSTOM_CSS_PATH') || CUSTOM_CSS_PATH === '') {
        return $buffer;
    }

    if (!poznoteIsHtmlResponseBuffer($buffer) || stripos($buffer, '</head>') === false) {
        return $buffer;
    }

    if (strpos($buffer, 'data-poznote-custom-css="1"') !== false) {
        return $buffer;
    }

    $linkTag = poznoteRenderCustomCssLinkTag();
    if ($linkTag === '') {
        return $buffer;
    }

    return preg_replace('/<\/head>/i', $linkTag . "\n</head>", $buffer, 1);
}

if (
    PHP_SAPI !== 'cli'
    && defined('CUSTOM_CSS_PATH')
    && CUSTOM_CSS_PATH !== ''
    && !defined('POZNOTE_CUSTOM_CSS_BUFFER_STARTED')
) {
    define('POZNOTE_CUSTOM_CSS_BUFFER_STARTED', true);
    ob_start('poznoteInjectCustomCssIntoHtml');
}
