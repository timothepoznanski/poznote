<?php
// // Enable error logging (but not display to avoid header issues)
// error_reporting(E_ALL);
// ini_set('log_errors', 1);
// ini_set('display_errors', 0);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/oidc.php';

if (!oidc_is_enabled()) {
    header('Location: login.php');
    exit;
}

// Provider error
if (isset($_GET['error'])) {
    header('Location: login.php?oidc_error=1');
    exit;
}

$state = $_GET['state'] ?? '';
$code = $_GET['code'] ?? '';

if (!is_string($state) || !is_string($code) || $state === '' || $code === '') {
    header('Location: login.php?oidc_error=1');
    exit;
}

$expectedState = $_SESSION['oidc_state'] ?? '';
if (!is_string($expectedState) || $expectedState === '' || !hash_equals($expectedState, $state)) {
    header('Location: login.php?oidc_error=1');
    exit;
}

try {
    $tokens = oidc_exchange_code_for_tokens($code);
    $claims = oidc_parse_and_verify_id_token($tokens['id_token']);
    oidc_finish_login($claims, $tokens);

    $redirectAfter = $_SESSION['oidc_redirect_after'] ?? null;
    unset($_SESSION['oidc_redirect_after']);

    // CSP-compliant redirect using external script with JSON config
    $redirectConfig = ['redirectAfter' => null];
    if (is_string($redirectAfter) && $redirectAfter !== '' && !preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $redirectAfter) && !str_starts_with($redirectAfter, '//')) {
        $redirectConfig['redirectAfter'] = $redirectAfter;
    }
    
    echo '<!DOCTYPE html><html><head>';
    echo '<script type="application/json" id="workspace-redirect-data">' . json_encode($redirectConfig) . '</script>';
    echo '<script src="js/workspace-redirect.js"></script>';
    echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', getUserLanguage()) . '</body></html>';
    exit;
} catch (Exception $e) {
    // Log the error for debugging
    error_log("OIDC Callback Error: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    
    // Check if the error is due to unauthorized user
    if (strpos($e->getMessage(), 'not authorized') !== false) {
        header('Location: login.php?oidc_error=unauthorized');
    } elseif (strpos($e->getMessage(), 'No user profile found') !== false) {
        preg_match('/"([^"]+)"/', $e->getMessage(), $matches);
        $identifier = $matches[1] ?? 'unknown';
        header('Location: login.php?oidc_error=no_profile&identifier=' . urlencode($identifier));
    } elseif (strpos($e->getMessage(), 'profile is disabled') !== false) {
        header('Location: login.php?oidc_error=disabled');
    } else {
        // Redirect to login with error parameter
        header('Location: login.php?oidc_error=1&msg=' . urlencode($e->getMessage()));
    }
    exit;
}
