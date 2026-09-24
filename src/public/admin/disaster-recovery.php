<?php
/**
 * Rebuilding the master database used to be a page of its own; it is a dialog
 * of the settings page now (Admin Tools > Disaster Recovery, discussion #1378).
 * Links to the former page open that dialog.
 */
require_once __DIR__ . '/../../auth.php';
requireAuth();

header('Location: ../settings.php?open=disaster-recovery#section=admin-tools-grid', true, 302);
exit;
