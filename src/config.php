<?php
    // ============================================================
    // DATABASE CONFIGURATION
    // ============================================================
    // SQLite configuration (default path, used as fallback before user is authenticated)
    define("SQLITE_DATABASE", $_ENV['SQLITE_DATABASE'] ?? getenv('SQLITE_DATABASE') ?: __DIR__ . '/data/database/poznote.db');
    define("SERVER_NAME", $_ENV['SERVER_NAME'] ?? getenv('SERVER_NAME') ?: 'localhost');
    
    // Default timezone (will be overridden by database setting if available)
    define("DEFAULT_TIMEZONE", 'Europe/Paris');

    // ============================================================
    // OIDC CONFIGURATION
    // ============================================================
    // Optional OpenID Connect (OIDC) configuration
    // Configured exclusively via .env file for security
    define('OIDC_ENABLED', filter_var($_ENV['POZNOTE_OIDC_ENABLED'] ?? getenv('POZNOTE_OIDC_ENABLED') ?? false, FILTER_VALIDATE_BOOL));
    define('OIDC_PROVIDER_NAME', $_ENV['POZNOTE_OIDC_PROVIDER_NAME'] ?? getenv('POZNOTE_OIDC_PROVIDER_NAME') ?: 'SSO');
    // Prefer issuer discovery (https://issuer/.well-known/openid-configuration)
    define('OIDC_ISSUER', rtrim((string)($_ENV['POZNOTE_OIDC_ISSUER'] ?? getenv('POZNOTE_OIDC_ISSUER') ?? ''), '/'));
    // Or provide the discovery URL directly
    define('OIDC_DISCOVERY_URL', (string)($_ENV['POZNOTE_OIDC_DISCOVERY_URL'] ?? getenv('POZNOTE_OIDC_DISCOVERY_URL') ?? ''));
    define('OIDC_CLIENT_ID', (string)($_ENV['POZNOTE_OIDC_CLIENT_ID'] ?? getenv('POZNOTE_OIDC_CLIENT_ID') ?? ''));
    define('OIDC_CLIENT_SECRET', (string)($_ENV['POZNOTE_OIDC_CLIENT_SECRET'] ?? getenv('POZNOTE_OIDC_CLIENT_SECRET') ?? ''));
    define('OIDC_SCOPES', (string)($_ENV['POZNOTE_OIDC_SCOPES'] ?? getenv('POZNOTE_OIDC_SCOPES') ?: 'openid profile email'));
    // If not set, redirect URI is derived from current request base URL
    define('OIDC_REDIRECT_URI', (string)($_ENV['POZNOTE_OIDC_REDIRECT_URI'] ?? getenv('POZNOTE_OIDC_REDIRECT_URI') ?? ''));
    // Optional: specify provider end-session endpoint (if your provider supports RP-initiated logout)
    define('OIDC_END_SESSION_ENDPOINT', (string)($_ENV['POZNOTE_OIDC_END_SESSION_ENDPOINT'] ?? getenv('POZNOTE_OIDC_END_SESSION_ENDPOINT') ?? ''));
    // Optional: disable normal login when OIDC is enabled (force SSO-only login)
    define('OIDC_DISABLE_NORMAL_LOGIN', filter_var($_ENV['POZNOTE_OIDC_DISABLE_NORMAL_LOGIN'] ?? getenv('POZNOTE_OIDC_DISABLE_NORMAL_LOGIN') ?? false, FILTER_VALIDATE_BOOL));
    // Optional: disable HTTP Basic Auth for API when OIDC is enabled (force OIDC-only authentication)
    define('OIDC_DISABLE_BASIC_AUTH', filter_var($_ENV['POZNOTE_OIDC_DISABLE_BASIC_AUTH'] ?? getenv('POZNOTE_OIDC_DISABLE_BASIC_AUTH') ?? false, FILTER_VALIDATE_BOOL));
    // Optional: comma-separated list of allowed users (email addresses or usernames)
    // If not set, all authenticated users from the identity provider can access the application
    // Example: 'user1@example.com,user2@example.com' or 'user1,user2'
    define('OIDC_ALLOWED_USERS', (string)($_ENV['POZNOTE_OIDC_ALLOWED_USERS'] ?? getenv('POZNOTE_OIDC_ALLOWED_USERS') ?? ''));
    
    // Optional: Settings access control
    // Option 1: Completely block access to settings
    define('DISABLE_SETTINGS_ACCESS', filter_var($_ENV['POZNOTE_DISABLE_SETTINGS_ACCESS'] ?? getenv('POZNOTE_DISABLE_SETTINGS_ACCESS') ?? false, FILTER_VALIDATE_BOOL));
    // Option 2: Protect settings with a password
    define('SETTINGS_PASSWORD', (string)($_ENV['POZNOTE_SETTINGS_PASSWORD'] ?? getenv('POZNOTE_SETTINGS_PASSWORD') ?? ''));

    // ============================================================
    // GITHUB SYNC CONFIGURATION
    // ============================================================
    // Enable or disable GitHub synchronization
    define('GITHUB_SYNC_ENABLED', filter_var($_ENV['POZNOTE_GITHUB_SYNC_ENABLED'] ?? getenv('POZNOTE_GITHUB_SYNC_ENABLED') ?? false, FILTER_VALIDATE_BOOL));
    // GitHub Personal Access Token
    define('GITHUB_TOKEN', (string)($_ENV['POZNOTE_GITHUB_TOKEN'] ?? getenv('POZNOTE_GITHUB_TOKEN') ?? ''));
    // GitHub repository (owner/repo format)
    define('GITHUB_REPO', (string)($_ENV['POZNOTE_GITHUB_REPO'] ?? getenv('POZNOTE_GITHUB_REPO') ?? ''));
    // GitHub branch to sync with
    define('GITHUB_BRANCH', (string)($_ENV['POZNOTE_GITHUB_BRANCH'] ?? getenv('POZNOTE_GITHUB_BRANCH') ?: 'main'));
    // Commit author name
    define('GITHUB_AUTHOR_NAME', (string)($_ENV['POZNOTE_GITHUB_AUTHOR_NAME'] ?? getenv('POZNOTE_GITHUB_AUTHOR_NAME') ?: 'Poznote'));
    // Commit author email
    define('GITHUB_AUTHOR_EMAIL', (string)($_ENV['POZNOTE_GITHUB_AUTHOR_EMAIL'] ?? getenv('POZNOTE_GITHUB_AUTHOR_EMAIL') ?: 'poznote@localhost'));
?>
