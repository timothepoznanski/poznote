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

// ============================================================
// GIT SYNC CONFIGURATION (GitHub, Forgejo)
// ============================================================
// Enable or disable Git synchronization (global setting with env fallback)
define('GIT_SYNC_ENABLED', filter_var(poznoteResolveGlobalSetting('git_sync_enabled', 'POZNOTE_GIT_SYNC_ENABLED', 'false'), FILTER_VALIDATE_BOOL));
// Git provider: 'github', 'forgejo'
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
