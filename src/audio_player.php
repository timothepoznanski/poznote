<?php
/**
 * Minimal audio player page for embedding in contenteditable iframes.
 * Chrome does not render <audio> controls inside contenteditable="true" zones,
 * so we embed audio in an iframe whose src points to this page.
 */

// Use the same session/auth infrastructure as the main app
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

// Verify the user is authenticated
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    exit('Unauthorized');
}

// Sanitize parameters
$noteId = intval($_GET['note'] ?? 0);
$attachmentId = htmlspecialchars($_GET['attachment'] ?? '', ENT_QUOTES);
$workspace = htmlspecialchars($_GET['workspace'] ?? '', ENT_QUOTES);

if (!$noteId || !$attachmentId) {
    http_response_code(400);
    exit('Missing parameters');
}

// Build the attachment URL
$src = '/api/v1/notes/' . $noteId . '/attachments/' . urlencode($attachmentId);
if ($workspace) {
    $src .= '?workspace=' . urlencode($workspace);
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  audio {
    width: 100%;
    display: block;
    border-radius: 8px;
  }
</style>
</head>
<body>
<audio controls preload="metadata" src="<?php echo $src; ?>"></audio>
</body>
</html>
