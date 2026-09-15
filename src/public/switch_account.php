<?php
/**
 * Switch the active note account without signing out.
 *
 * Posted by the logout dialog (js/profile.js) when the signed-in person can
 * open several accounts: the current account is left and the chosen one is
 * opened straight away, on the same login identity. Access is checked again
 * by switchActiveAccount(), the list shown in the dialog is only a hint.
 */
require_once __DIR__ . '/../auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

requireAuth();

$token = $_POST['csrf_token'] ?? '';
$expected = $_SESSION['account_switch_csrf_token'] ?? '';
if (is_string($token) && is_string($expected) && $expected !== '' && hash_equals($expected, $token)) {
    switchActiveAccount((int)($_POST['account_user_id'] ?? 0));
}

// On success index.php opens the new account's last opened or default
// workspace, as after a login; on failure the previous account is still open.
header('Location: index.php', true, 303);
exit;
