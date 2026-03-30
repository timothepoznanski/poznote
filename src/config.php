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
// Optional OpenID Connect (OIDC) configuration
// Configured exclusively via .env file for security
define('OIDC_ENABLED', filter_var(_env('POZNOTE_OIDC_ENABLED', false), FILTER_VALIDATE_BOOL));
define('OIDC_PROVIDER_NAME', _env('POZNOTE_OIDC_PROVIDER_NAME', 'SSO'));
// Prefer issuer discovery (https://issuer/.well-known/openid-configuration)
// Note: rtrim removes trailing slash to normalize the URL
define('OIDC_ISSUER', rtrim(trim(_env('POZNOTE_OIDC_ISSUER', '')), '/'));
// Or provide the discovery URL directly
define('OIDC_DISCOVERY_URL', trim(_env('POZNOTE_OIDC_DISCOVERY_URL', '')));
define('OIDC_CLIENT_ID', trim(_env('POZNOTE_OIDC_CLIENT_ID', '')));
define('OIDC_CLIENT_SECRET', trim(_env('POZNOTE_OIDC_CLIENT_SECRET', '')));
define('OIDC_SCOPES', _env('POZNOTE_OIDC_SCOPES', 'openid profile email'));
// If not set, redirect URI is derived from current request base URL
define('OIDC_REDIRECT_URI', _env('POZNOTE_OIDC_REDIRECT_URI', ''));
// Optional: specify provider end-session endpoint (if your provider supports RP-initiated logout)
define('OIDC_END_SESSION_ENDPOINT', _env('POZNOTE_OIDC_END_SESSION_ENDPOINT', ''));
// Optional: where to redirect after OIDC logout (default: login page)
define('OIDC_POST_LOGOUT_REDIRECT_URI', _env('POZNOTE_OIDC_POST_LOGOUT_REDIRECT_URI', ''));
// Optional: disable normal login when OIDC is enabled (force SSO-only login)
define('OIDC_DISABLE_NORMAL_LOGIN', filter_var(_env('POZNOTE_OIDC_DISABLE_NORMAL_LOGIN', false), FILTER_VALIDATE_BOOL));
// Optional: disable HTTP Basic Auth for API when OIDC is enabled (force OIDC-only authentication)
define('OIDC_DISABLE_BASIC_AUTH', filter_var(_env('POZNOTE_OIDC_DISABLE_BASIC_AUTH', false), FILTER_VALIDATE_BOOL));
// Optional: claim name containing user groups (default: 'groups')
define('OIDC_GROUPS_CLAIM', trim(_env('POZNOTE_OIDC_GROUPS_CLAIM', 'groups')));
// Optional: comma-separated list of allowed groups from the configured claim
// If empty, group-based access control is disabled
define('OIDC_ALLOWED_GROUPS', _env('POZNOTE_OIDC_ALLOWED_GROUPS', ''));
// Optional: auto-create user profiles on first successful OIDC login
// Recommended when using OIDC group restrictions for access control
define('OIDC_AUTO_CREATE_USERS', filter_var(_env('POZNOTE_OIDC_AUTO_CREATE_USERS', false), FILTER_VALIDATE_BOOL));
// Optional: comma-separated list of allowed users (email addresses or usernames)
// If not set, all authenticated users from the identity provider can access the application
// Example: 'user1@example.com,user2@example.com' or 'user1,user2'
// Deprecated: prefer POZNOTE_OIDC_ALLOWED_GROUPS + POZNOTE_OIDC_AUTO_CREATE_USERS
define('OIDC_ALLOWED_USERS', _env('POZNOTE_OIDC_ALLOWED_USERS', ''));

// Optional: load an extra stylesheet from src/css/ on every HTML page.
// The preferred source is the Advanced section in settings.php.
define('CUSTOM_CSS_PATH', poznoteResolveCustomCssPath());

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
function poznoteGetCustomCssHref() {
    if (!defined('CUSTOM_CSS_PATH') || CUSTOM_CSS_PATH === '') {
        return '';
    }

    $filename = poznoteNormalizeCustomCssPath(CUSTOM_CSS_PATH);
    if ($filename === '') {
        return '';
    }

    $hrefPath = 'css/' . $filename;
    $absoluteFilePath = __DIR__ . '/css/' . $filename;
    if (!is_file($absoluteFilePath)) {
        return '';
    }

    $version = (string) filemtime($absoluteFilePath);
    if ($version === '') {
        return '';
    }

    return $hrefPath . '?v=' . rawurlencode($version);
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
