<?php
/**
 * Base64 Image Converter — Admin Tool
 *
 * Scans all user databases for notes containing inline base64-encoded images
 * and optionally converts them to proper attachment files.
 */
// phpcs:disable

// === Authentication & Authorization ===
require_once __DIR__ . '/../auth.php';
requireAuth();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">Access denied. Admin privileges required.</div>';
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../version_helper.php';

// === Action ===
$action  = $_POST['action'] ?? 'scan';   // 'scan' or 'convert'
$results = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($action, ['scan', 'convert'], true)) {
    $results = processUsers($action === 'convert');
}

// === Core logic ===

/**
 * Convert (or count) base64 images in a single HTML string.
 * Returns ['content' => ..., 'found' => int, 'converted' => int, 'attachments' => [...]]
 */
function processContent(string $content, int $noteId, string $attachmentsPath, bool $doConvert): array {
    $extensionMap = [
        'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
        'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp',
    ];

    $found        = 0;
    $converted    = 0;
    $attachments  = [];

    $replace = function (string $imgType, string $b64, string $alt) use (
        $noteId, $attachmentsPath, $doConvert, $extensionMap, &$found, &$converted, &$attachments
    ): string {
        $found++;
        $imgType   = strtolower($imgType);
        $extension = $extensionMap[$imgType] ?? 'png';
        $mimeType  = 'image/' . ($imgType === 'svg+xml' ? 'svg+xml' : $imgType);

        if (!$doConvert) {
            return '<img src="data:image/' . $imgType . ';base64,' . $b64 . '" alt="' . htmlspecialchars($alt) . '">';
        }

        $imageData = base64_decode($b64);
        if ($imageData === false) {
            return '<img src="data:image/' . $imgType . ';base64,' . $b64 . '" alt="' . htmlspecialchars($alt) . '">';
        }

        $attachmentId = uniqid('', true);
        $filename     = $attachmentId . '_' . time() . '.' . $extension;
        $filePath     = $attachmentsPath . '/' . $filename;

        if (!is_dir($attachmentsPath)) {
            mkdir($attachmentsPath, 0755, true);
        }
        if (file_put_contents($filePath, $imageData) === false) {
            return '<img src="data:image/' . $imgType . ';base64,' . $b64 . '" alt="' . htmlspecialchars($alt) . '">';
        }
        chmod($filePath, 0644);

        $attachments[] = [
            'id'                => $attachmentId,
            'filename'          => $filename,
            'original_filename' => (!empty($alt) ? $alt . '.' . $extension : $filename),
            'file_size'         => strlen($imageData),
            'file_type'         => $mimeType,
            'uploaded_at'       => date('Y-m-d H:i:s'),
        ];
        $converted++;

        return '<img src="/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId
            . '" alt="' . htmlspecialchars($alt) . '" loading="lazy" decoding="async">';
    };

    // Pattern 1: src before alt
    $content = preg_replace_callback(
        '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
        fn($m) => $replace($m[1], $m[2], $m[3] ?? ''),
        $content
    );
    // Pattern 2: alt before src
    $content = preg_replace_callback(
        '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
        fn($m) => $replace($m[2], $m[3], $m[1]),
        $content
    );

    return compact('content', 'found', 'converted', 'attachments');
}

/**
 * Scan/convert all users. Returns an array of per-user result rows.
 */
function processUsers(bool $doConvert): array {
    $dataRoot = dirname(SQLITE_DATABASE, 2);
    $usersDir = $dataRoot . '/users';

    $rows = [];

    if (!is_dir($usersDir)) {
        return $rows;
    }

    $userIds = array_values(array_filter(
        scandir($usersDir),
        fn($d) => ctype_digit($d) && is_dir("$usersDir/$d")
    ));
    sort($userIds, SORT_NUMERIC);

    foreach ($userIds as $userId) {
        $dbPath          = "$usersDir/$userId/database/poznote.db";
        $entriesPath     = "$usersDir/$userId/entries";
        $attachmentsPath = "$usersDir/$userId/attachments";

        $row = [
            'user_id'       => $userId,
            'notes_scanned' => 0,
            'notes_with_b64'=> 0,
            'images_found'  => 0,
            'images_done'   => 0,
            'errors'        => [],
            'skipped_db'    => !file_exists($dbPath),
        ];

        if ($row['skipped_db']) {
            $rows[] = $row;
            continue;
        }

        try {
            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $con->exec('PRAGMA busy_timeout = 10000');

            $stmt = $con->prepare("
                SELECT id, entry, attachments
                FROM entries
                WHERE (type = 'note' OR type IS NULL OR type = '')
                AND trash = 0
            ");
            $stmt->execute();
            $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $row['notes_scanned'] = count($notes);

            foreach ($notes as $note) {
                $noteId  = (int)$note['id'];
                $htmlFile = $entriesPath . '/' . $noteId . '.html';
                $content  = file_exists($htmlFile)
                    ? file_get_contents($htmlFile)
                    : ($note['entry'] ?? '');

                if (stripos($content, 'data:image/') === false) {
                    continue;
                }

                $res = processContent($content, $noteId, $attachmentsPath, $doConvert);
                if ($res['found'] === 0) {
                    continue;
                }

                $row['notes_with_b64']++;
                $row['images_found'] += $res['found'];

                if ($doConvert && !empty($res['attachments'])) {
                    $existing = !empty($note['attachments']) ? json_decode($note['attachments'], true) : [];
                    if (!is_array($existing)) $existing = [];
                    $merged = array_merge($existing, $res['attachments']);

                    if (file_exists($htmlFile)) {
                        if (file_put_contents($htmlFile, $res['content']) === false) {
                            $row['errors'][] = "Note $noteId: could not write HTML file";
                            continue;
                        }
                    }

                    $upd = $con->prepare("UPDATE entries SET entry = ?, attachments = ? WHERE id = ?");
                    $upd->execute([$res['content'], json_encode($merged), $noteId]);

                    $row['images_done'] += $res['converted'];
                }
            }

            $con = null;
        } catch (Exception $e) {
            $row['errors'][] = $e->getMessage();
        }

        $rows[] = $row;
    }

    return $rows;
}

// === Summary totals ===
$totalNotes  = 0;
$totalFound  = 0;
$totalDone   = 0;
$totalErrors = 0;
if ($results !== null) {
    foreach ($results as $r) {
        $totalNotes  += $r['notes_scanned'];
        $totalFound  += $r['images_found'];
        $totalDone   += $r['images_done'];
        $totalErrors += count($r['errors']);
    }
}

$v = getAppVersion();
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/admin-tools.css?v=<?php echo $v; ?>">
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">

    <!-- Nav -->
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary btn-margin-right">
                Back to notes
            </a>
            <a href="../settings.php" class="btn btn-secondary"><?php echo t_h('settings.title', [], 'Settings'); ?></a>
        </div>
    </div>

    <div class="ci-page">

        <!-- Hero -->
        <div class="ci-hero">
            <h1><?php echo t_h('admin_tools.convert_images.title', [], 'Base64 Image Converter'); ?></h1>
            <p><?php echo t_h('admin_tools.convert_images.description'); ?></p>
        </div>

        <!-- Action cards -->
        <div class="ci-actions">
            <!-- Scan -->
            <div class="ci-card">
                <span class="ci-card-step"><?php echo t_h('admin_tools.convert_images.step1', [], 'Step 1'); ?></span>
                <h2><?php echo t_h('admin_tools.convert_images.scan_title', [], 'Scan'); ?></h2>
                <p><?php echo t_h('admin_tools.convert_images.scan_desc'); ?> <strong><?php echo t_h('admin_tools.convert_images.scan_no_changes', [], 'No changes are made.'); ?></strong></p>
                <form method="POST">
                    <input type="hidden" name="action" value="scan">
                    <button type="submit" class="btn btn-secondary" style="width:100%;">
                        <i class="lucide-search"></i> <?php echo t_h('admin_tools.convert_images.scan_button', [], 'Scan all notes'); ?>
                    </button>
                </form>
            </div>

            <!-- Convert -->
            <div class="ci-card">
                <span class="ci-card-step"><?php echo t_h('admin_tools.convert_images.step2', [], 'Step 2'); ?></span>
                <h2><?php echo t_h('admin_tools.convert_images.convert_title', [], 'Convert'); ?></h2>
                <p><?php echo t_h('admin_tools.convert_images.convert_desc'); ?></p>
                <form method="POST">
                    <input type="hidden" name="action" value="convert">
                    <button type="submit" class="btn btn-primary" style="width:100%;">
                        <i class="lucide-settings"></i> <?php echo t_h('admin_tools.convert_images.convert_button', [], 'Convert all notes'); ?>
                    </button>
                </form>
            </div>
        </div>

        <?php if ($results !== null): ?>
        <!-- Results panel -->
        <div class="ci-results">

            <!-- Header -->
            <div class="ci-results-header">
                <i class="lucide-<?php echo $action === 'convert' ? 'check-circle' : 'bar-chart-2'; ?>"></i>
                <h2><?php echo $action === 'convert' ? t_h('admin_tools.convert_images.results_convert', [], 'Conversion results') : t_h('admin_tools.convert_images.results_scan', [], 'Scan results'); ?></h2>
            </div>

            <!-- Stats row -->
            <div class="ci-stats">
                <div class="ci-stat">
                    <div class="ci-stat-value"><?php echo $totalNotes; ?></div>
                    <div class="ci-stat-label"><?php echo t_h('admin_tools.convert_images.stats_notes', [], 'Notes scanned'); ?></div>
                </div>
                <div class="ci-stat">
                    <div class="ci-stat-value <?php echo $totalFound > 0 ? 'is-warn' : ''; ?>"><?php echo $totalFound; ?></div>
                    <div class="ci-stat-label"><?php echo t_h('admin_tools.convert_images.stats_images', [], 'Base64 images found'); ?></div>
                </div>
                <?php if ($action === 'convert'): ?>
                <div class="ci-stat">
                    <div class="ci-stat-value <?php echo $totalDone === $totalFound && $totalFound > 0 ? 'is-ok' : ($totalDone > 0 ? 'is-warn' : ''); ?>">
                        <?php echo $totalDone; ?>
                    </div>
                    <div class="ci-stat-label"><?php echo t_h('admin_tools.convert_images.stats_converted', [], 'Converted'); ?></div>
                </div>
                <?php endif; ?>
                <?php if ($totalErrors > 0): ?>
                <div class="ci-stat">
                    <div class="ci-stat-value is-err"><?php echo $totalErrors; ?></div>
                    <div class="ci-stat-label"><?php echo t_h('admin_tools.convert_images.stats_errors', [], 'Errors'); ?></div>
                </div>
                <?php endif; ?>
            </div>

            <!-- Outcome notice -->
                <?php if ($action === 'convert'): ?>
                <?php if ($totalFound === 0): ?>
                    <div class="ci-notice success"><i class="lucide-check-circle"></i> <?php echo t_h('admin_tools.convert_images.notice_convert_clean', [], 'No base64 images found. Nothing to convert.'); ?></div>
                <?php elseif ($totalErrors === 0 && $totalDone === $totalFound): ?>
                    <div class="ci-notice success"><i class="lucide-check-circle"></i> <?php echo t_h('admin_tools.convert_images.notice_convert_done', ['count' => $totalDone]); ?></div>
                <?php else: ?>
                    <div class="ci-notice warning"><i class="lucide-alert-triangle"></i> <?php echo t_h('admin_tools.convert_images.notice_convert_partial', ['done' => $totalDone, 'errors' => $totalErrors]); ?></div>
                <?php endif; ?>
            <?php else: ?>
                <?php if ($totalFound === 0): ?>
                    <div class="ci-notice success"><i class="lucide-check-circle"></i> <?php echo t_h('admin_tools.convert_images.notice_scan_clean', [], 'No base64 images found across all users. Nothing to do.'); ?></div>
                <?php else: ?>
                    <div class="ci-notice info"><i class="lucide-info"></i> <?php echo t_h('admin_tools.convert_images.notice_scan_found', ['count' => $totalFound, 'notes' => $totalNotes]); ?></div>
                <?php endif; ?>
            <?php endif; ?>

        </div><!-- /ci-results -->
        <?php endif; ?>

    </div><!-- /ci-page -->
</div><!-- /admin-container -->
</body>
</html>
