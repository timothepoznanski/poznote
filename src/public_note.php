<?php
require_once 'db_connect.php';
require_once 'functions.php';

$token = $_GET['token'] ?? '';
if (!$token) {
    http_response_code(400);
    echo 'Token missing';
    exit;
}

try {
    $stmt = $con->prepare('SELECT note_id, created FROM shared_notes WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo 'Shared note not found';
        exit;
    }

    $note_id = $row['note_id'];

    $stmt = $con->prepare('SELECT heading, entry, created, updated FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        http_response_code(404);
        echo 'Note not found';
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo 'Server error';
    exit;
}

// Render read-only page
?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shared note - <?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></title>
    <?php include 'templates/head_includes.php'; ?>
    <style>
    /* Small adjustments for public view */
    body { background: #f7f7f7; }
    .public-note { max-width: 900px; margin: 40px auto; background: #fff; padding: 24px; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); }
    .public-note h1 { margin-top: 0; }
    .public-note .meta { color: #666; font-size: 0.9em; margin-bottom: 12px; }
    .public-note .content { white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="public-note">
        <h1><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></h1>
        <div class="meta">Shared on <?php echo htmlspecialchars($row['created']); ?></div>
        <div class="content"><?php echo nl2br(htmlspecialchars($note['entry'] ?: '')); ?></div>
    </div>
</body>
</html>