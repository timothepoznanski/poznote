<?php
/**
 * OIDC Login Initiator
 * 
 * This page initiates the OpenID Connect authentication flow by:
 * - Validating that OIDC is properly configured and enabled
 * - Sanitizing and validating the redirect parameter to prevent open redirect attacks
 * - Building the OIDC authorization URL with necessary parameters (state, nonce, PKCE)
 * - Redirecting the user to the identity provider's login page
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/oidc.php';

// Ensure OIDC is enabled, otherwise fall back to standard login
if (!oidc_is_enabled()) {
    header('Location: login.php');
    exit;
}

// Retrieve and validate the optional redirect parameter
// This specifies where to redirect the user after successful authentication
$redirectAfter = $_GET['redirect'] ?? null;

// Sanitize and validate redirect parameter to prevent open redirect vulnerabilities
// Only allow relative paths within the application (no external URLs or protocol-relative URLs)
if (is_string($redirectAfter)) {
    $redirectAfter = trim($redirectAfter);
    
    // Reject if empty, absolute URL (http://, https://, etc.), or protocol-relative URL (//)
    if ($redirectAfter === '' || 
        preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $redirectAfter) || 
        str_starts_with($redirectAfter, '//')) {
        $redirectAfter = null;
    }
} else {
    $redirectAfter = null;
}

try {
    // Build the OIDC authorization URL and redirect the user to the identity provider
    $url = oidc_build_authorization_url($redirectAfter);
    header('Location: ' . $url);
    exit;
} catch (Exception $e) {
    // Log detailed error information for debugging purposes
    error_log('OIDC Login Error: ' . $e->getMessage());
    error_log('Stack trace: ' . $e->getTraceAsString());
    
    // Redirect to login page with a generic error flag (don't expose error details in URL)
    header('Location: login.php?oidc_error=1');
    exit;
}
