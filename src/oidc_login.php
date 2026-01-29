<?php
// // Enable error logging (but not display to avoid header issues)
// error_reporting(E_ALL);
// ini_set('log_errors', 1);
// ini_set('display_errors', 0);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/oidc.php';

if (!oidc_is_enabled()) {
    header('Location: login.php');
    exit;
}

$redirectAfter = $_GET['redirect'] ?? null;
if (!is_string($redirectAfter)) {
    $redirectAfter = null;
}

// Prevent open redirects: allow only relative paths within this app
if ($redirectAfter !== null) {
    $redirectAfter = trim($redirectAfter);
    if ($redirectAfter === '' || preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $redirectAfter) || str_starts_with($redirectAfter, '//')) {
        $redirectAfter = null;
    }
}

try {
    $url = oidc_build_authorization_url($redirectAfter);
    header('Location: ' . $url);
    exit;
} catch (Exception $e) {
    // Log the error for debugging
    error_log('OIDC Login Error: ' . $e->getMessage());
    error_log('Stack trace: ' . $e->getTraceAsString());
    
    // Redirect to login with error parameter
    header('Location: login.php?oidc_error=1&msg=' . urlencode($e->getMessage()));
    exit;
}
