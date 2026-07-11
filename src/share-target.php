<?php
// Web Share Target handler: lets the OS "Share" menu (Android/Chrome) create a
// Poznote note from a shared URL/title/text without needing a browser extension.
// Declared in pwa/manifest.webmanifest (share_target); receives a top-level
// multipart/form-data POST from the OS, then creates the note client-side via
// POST /api/v1/notes so it goes through the exact same path as the app's own
// note creation (sanitization, entry file on disk, git sync).

require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'self';");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: strict-origin-when-cross-origin");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}

$sharedTitle = trim($_POST['title'] ?? '');
$sharedText = trim($_POST['text'] ?? '');
$sharedUrl = trim($_POST['url'] ?? '');

// Some apps put the URL in the "text" field instead of "url".
if ($sharedUrl === '' && preg_match('/https?:\/\/\S+/', $sharedText, $matches)) {
    $sharedUrl = $matches[0];
    $sharedText = trim(str_replace($sharedUrl, '', $sharedText));
}

$heading = $sharedTitle !== '' ? $sharedTitle : ($sharedUrl !== '' ? $sharedUrl : t('index.note.new_note', [], 'New note'));

$bodyParts = [];
if ($sharedUrl !== '') {
    $escapedUrl = htmlspecialchars($sharedUrl, ENT_QUOTES, 'UTF-8');
    $bodyParts[] = '<p><a href="' . $escapedUrl . '" target="_blank" rel="noopener">' . $escapedUrl . '</a></p>';
}
if ($sharedText !== '') {
    $bodyParts[] = '<p>' . nl2br(htmlspecialchars($sharedText, ENT_QUOTES, 'UTF-8')) . '</p>';
}

$noteData = [
    'heading' => $heading,
    'content' => implode('', $bodyParts),
    'workspace' => getWorkspaceFilter(),
];
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars(getUserLanguage(), ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Poznote</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #111827; color: #e5e7eb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .share-status { text-align: center; }
        .share-status a { color: #93c5fd; }
    </style>
</head>
<body>
    <div class="share-status">
        <p id="shareMessage"><?php echo t_h('common.loading', [], 'Loading...'); ?></p>
        <p id="shareError" style="display:none"><a href="index.php"><?php echo t_h('common.error', [], 'Error'); ?></a></p>
    </div>
    <script>
    (function () {
        var noteData = <?php echo json_encode($noteData, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;

        function showError() {
            document.getElementById('shareMessage').style.display = 'none';
            document.getElementById('shareError').style.display = 'block';
        }

        fetch('api/v1/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(noteData)
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success && data.note) {
                    window.location.replace('index.php?workspace=' + encodeURIComponent(data.note.workspace || noteData.workspace) + '&note=' + encodeURIComponent(data.note.id) + '&scroll=1');
                } else {
                    showError();
                }
            })
            .catch(showError);
    })();
    </script>
</body>
</html>
