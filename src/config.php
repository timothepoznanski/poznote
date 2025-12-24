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
    // Optional: disable normal login when OIDC is enabled (force SSO-only login)
    define('OIDC_DISABLE_NORMAL_LOGIN', filter_var($_ENV['POZNOTE_OIDC_DISABLE_NORMAL_LOGIN'] ?? false, FILTER_VALIDATE_BOOL));
    // Optional: disable HTTP Basic Auth for API when OIDC is enabled (force OIDC-only authentication)
    define('OIDC_DISABLE_BASIC_AUTH', filter_var($_ENV['POZNOTE_OIDC_DISABLE_BASIC_AUTH'] ?? false, FILTER_VALIDATE_BOOL));
    // Optional: comma-separated list of allowed users (email addresses or usernames)
    // If not set, all authenticated users from the identity provider can access the application
    // Example: 'user1@example.com,user2@example.com' or 'user1,user2'
    define('OIDC_ALLOWED_USERS', (string)($_ENV['POZNOTE_OIDC_ALLOWED_USERS'] ?? ''));
?>