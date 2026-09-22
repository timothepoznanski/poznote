<?php
/**
 * Switch the active note account without signing out.
 *
 * Posted by the logout dialog (js/profile.js), the workspace menu
 * (js/workspaces-core.js) and the "Other accounts" block of the notes list
 * (js/other-accounts.js) when the signed-in person can open several
 * accounts: the current account is left and the chosen one is opened
 * straight away, on the same login identity. Access is checked again by
 * switchActiveAccount(), the list shown in the UI is only a hint.
 *
 * Optional landing spot inside the account being opened: 'note' (a note id,
 * index.php then opens it in its own workspace) or 'workspace' (a workspace
 * name). Without either, index.php opens the account's last opened or default
 * workspace, as after a login.
 *
 * With 'workspace' and no access to the whole account, the switch is tried
 * as a shared workspace (auth.php, openSharedWorkspace): the account opens
 * confined to that workspace when its owner shares it with the signed-in
 * person.
 */
require_once __DIR__ . '/../auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

requireAuth();

$location = 'index.php';

$token = $_POST['csrf_token'] ?? '';
$expected = $_SESSION['account_switch_csrf_token'] ?? '';
$targetUserId = (int)($_POST['account_user_id'] ?? 0);
$note = $_POST['note'] ?? '';
$workspace = $_POST['workspace'] ?? '';
$validWorkspace = is_string($workspace) && $workspace !== '' && strlen($workspace) <= 255;

if (is_string($token) && is_string($expected) && $expected !== '' && hash_equals($expected, $token)
    && (switchActiveAccount($targetUserId) || ($validWorkspace && openSharedWorkspace($targetUserId, $workspace)))) {
    if (is_string($note) && ctype_digit($note) && (int)$note > 0) {
        $location .= '?note=' . (int)$note;
    } elseif ($validWorkspace) {
        $location .= '?workspace=' . rawurlencode($workspace);
    }
}

// On failure the previous account is still open and index.php shows it.
header('Location: ' . $location, true, 303);
exit;
