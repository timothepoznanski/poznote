<?php
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

    // Same redirect style as login.php, to preserve localStorage workspace behavior
    echo '<!DOCTYPE html><html><head>';
    echo '<script>';
    echo 'var workspace = null; try { workspace = localStorage.getItem("poznote_selected_workspace"); } catch(e) {}';

    if (is_string($redirectAfter) && $redirectAfter !== '' && !preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $redirectAfter) && !str_starts_with($redirectAfter, '//')) {
        // If redirectAfter already includes query params, keep it as-is.
        echo 'window.location.href = ' . json_encode($redirectAfter) . ';';
    } else {
        echo 'if (workspace) { window.location.href = "index.php?workspace=" + encodeURIComponent(workspace); } else { window.location.href = "index.php"; }';
    }

    echo '</script>';
    echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', getUserLanguage()) . '</body></html>';
    exit;
} catch (Exception $e) {
    // Check if the error is due to unauthorized user
    if (strpos($e->getMessage(), 'not authorized') !== false) {
        header('Location: login.php?oidc_error=unauthorized');
    } else {
        header('Location: login.php?oidc_error=1');
    }
    exit;
}
