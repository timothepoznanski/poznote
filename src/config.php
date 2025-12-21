<?php
    // SQLite configuration
    define("SQLITE_DATABASE", $_ENV['SQLITE_DATABASE'] ?? dirname(__DIR__) . '/data/database/poznote.db');
    define("SERVER_NAME", $_ENV['SERVER_NAME'] ?? 'localhost');
    
    // Default timezone (will be overridden by database setting if available)
    define("DEFAULT_TIMEZONE", 'Europe/Paris');

    // Optional OpenID Connect (OIDC) configuration
    // Configured exclusively via .env file for security
    define('OIDC_ENABLED', filter_var($_ENV['POZNOTE_OIDC_ENABLED'] ?? false, FILTER_VALIDATE_BOOL));
    define('OIDC_PROVIDER_NAME', $_ENV['POZNOTE_OIDC_PROVIDER_NAME'] ?? 'SSO');
    // Prefer issuer discovery (https://issuer/.well-known/openid-configuration)
    define('OIDC_ISSUER', rtrim((string)($_ENV['POZNOTE_OIDC_ISSUER'] ?? ''), '/'));
    // Or provide the discovery URL directly
    define('OIDC_DISCOVERY_URL', (string)($_ENV['POZNOTE_OIDC_DISCOVERY_URL'] ?? ''));
    define('OIDC_CLIENT_ID', (string)($_ENV['POZNOTE_OIDC_CLIENT_ID'] ?? ''));
    define('OIDC_CLIENT_SECRET', (string)($_ENV['POZNOTE_OIDC_CLIENT_SECRET'] ?? ''));
    define('OIDC_SCOPES', (string)($_ENV['POZNOTE_OIDC_SCOPES'] ?? 'openid profile email'));
    // If not set, redirect URI is derived from current request base URL
    define('OIDC_REDIRECT_URI', (string)($_ENV['POZNOTE_OIDC_REDIRECT_URI'] ?? ''));
    // Optional: specify provider end-session endpoint (if your provider supports RP-initiated logout)
    define('OIDC_END_SESSION_ENDPOINT', (string)($_ENV['POZNOTE_OIDC_END_SESSION_ENDPOINT'] ?? ''));
    // If not set, post-logout redirect is derived from current request base URL
    define('OIDC_POST_LOGOUT_REDIRECT_URI', (string)($_ENV['POZNOTE_OIDC_POST_LOGOUT_REDIRECT_URI'] ?? ''));
?>