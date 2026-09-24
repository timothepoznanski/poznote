<?php
/**
 * The orphan attachments scanner used to be a page of its own; it is a dialog
 * of the settings page now (Admin Tools, discussion #1378), backed by
 * GET / DELETE /api/v1/admin/orphan-attachments. Links to the former page open
 * that dialog.
 */
require_once __DIR__ . '/../../auth.php';
requireAuth();

header('Location: ../settings.php?open=orphan-scanner#section=admin-tools-grid', true, 302);
exit;
