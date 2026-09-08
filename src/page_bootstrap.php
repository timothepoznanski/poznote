<?php
/**
 * The one way an authenticated HTML page starts.
 *
 * These seven lines were copied verbatim into every full-page entry point. The
 * order matters and is preserved exactly: auth.php configures the session
 * cookie before starting the session, requireAuth() redirects before anything
 * is emitted, and output buffering opens before the first library is loaded.
 *
 * Not for the API endpoints: they authenticate with requireApiAuth() and must
 * not buffer their output. Not for pages with a stricter gate either, those
 * call requireAdmin() or requireSettingsPassword() themselves.
 */

require_once __DIR__ . '/auth.php';
requireAuth();
ob_start();
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/version_helper.php';
