<?php
/**
 * Landing page of the links a shared workspace email carries
 * (WorkspaceActivityEmailService): opens the account that owns the note,
 * confined to the shared workspace when that is all its reader may open,
 * then hands over to index.php.
 *
 * A note id means nothing without its account, and the account a browser has
 * open is whichever one was used last, so the link names both. Changing the
 * active account is otherwise a POST behind a CSRF token (switch_account.php);
 * a link in an email can only be a GET, so it is signed instead: the
 * signature covers the owner, the workspace, the note and the reader, and
 * only the reader's own session accepts it. Access is still checked by
 * switchActiveAccount() and openSharedWorkspace(), as for any switch: a link
 * kept from before the workspace was unshared opens nothing.
 *
 * Any failure lands on index.php with the account that was already open.
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../WorkspaceActivityEmailService.php';

requireAuth();

$location = 'index.php';

$authUserId = (int)(getAuthenticatedUserId() ?? 0);
$ownerUserId = (int)($_GET['owner'] ?? 0);
$workspace = $_GET['workspace'] ?? '';
$noteId = (int)($_GET['note'] ?? 0);

if ($authUserId > 0
    && is_string($workspace) && $workspace !== '' && strlen($workspace) <= 255
    && (int)($_GET['u'] ?? 0) === $authUserId
    && poznoteWorkspaceActivityLinkIsValid(WorkspaceActivityEmailService::linkKey(), $_GET)
    && (switchActiveAccount($ownerUserId) || openSharedWorkspace($ownerUserId, $workspace))) {
    $location .= $noteId > 0
        ? '?note=' . $noteId
        : '?workspace=' . rawurlencode($workspace);
}

header('Location: ' . $location, true, 303);
exit;
