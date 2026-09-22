<?php
/**
 * Pretty public URL router: /<slug> is a public note token (nginx rewrites
 * it here, see docker/nginx/default.conf). The slug used to be tried as a
 * public read-only workspace first; workspaces are now shared with named
 * accounts instead (workspaces.php > Share) and have no public URL.
 */

$slug = isset($_GET['slug']) && is_string($_GET['slug']) ? trim($_GET['slug']) : '';

if ($slug !== '' && strpos($slug, '/') === false) {
    $_GET['token'] = $slug;
    $_REQUEST['token'] = $slug;
}

require_once __DIR__ . '/public_note.php';
