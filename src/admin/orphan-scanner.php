<?php
/**
 * Orphan Scanner — Admin Tool
 *
 * Scans attachment folders and finds files not referenced in any note.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
requireSettingsPassword();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">Access denied. Admin privileges required.</div>';
    exit;
}

require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/../users/UserDataManager.php';

$v             = getAppVersion();
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

// Handle Scan/Delete Actions
$action = $_POST['action'] ?? 'scan';
$results = null;
$hasOrphansInResults = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($action, ['scan', 'delete'])) {
    $results = runScanner($action === 'delete');
    foreach ($results as $row) {
        if (($row['orphans_found'] ?? 0) > 0) {
            $hasOrphansInResults = true;
            break;
        }
    }
}

function runScanner(bool $doDelete): array {
    $dataRoot = dirname(SQLITE_DATABASE, 2);
    $usersDir = $dataRoot . '/users';
    
    // Fallback search for users directory
    if (!is_dir($usersDir)) {
         $dataRoot = __DIR__ . '/../data';
         $usersDir = $dataRoot . '/users';
    }

    $rows = [];
    if (!is_dir($usersDir)) return $rows;

    $userIds = array_values(array_filter(scandir($usersDir), fn($d) => ctype_digit($d) && is_dir("$usersDir/$d")));
    sort($userIds, SORT_NUMERIC);

    foreach ($userIds as $userId) {
        $userPath = "$usersDir/$userId";
        $attachmentsDir = $userPath . '/attachments';
        $dbPath = $userPath . '/database/poznote.db';

        $row = [
            'user_id' => $userId,
            'total_files' => 0,
            'orphans_found' => 0,
            'orphans_deleted' => 0,
            'files' => [],
            'error' => null
        ];

        if (!is_dir($attachmentsDir) || !file_exists($dbPath)) {
            $rows[] = $row;
            continue;
        }

        try {
            $db = new PDO("sqlite:$dbPath");
            $filesOnDisk = [];
            if (is_dir($attachmentsDir)) {
                foreach (new DirectoryIterator($attachmentsDir) as $f) {
                    if ($f->isFile() && $f->getFilename() !== '.gitignore') {
                        $filesOnDisk[] = $f->getFilename();
                    }
                }
            }
            $row['total_files'] = count($filesOnDisk);

            $referencedFiles = [];
            $stmt = $db->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != ''");
            while ($rowDb = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $atts = json_decode($rowDb['attachments'], true);
                if (is_array($atts)) {
                    foreach ($atts as $a) {
                        if (isset($a['filename'])) $referencedFiles[$a['filename']] = true;
                    }
                }
            }

            $orphans = array_filter($filesOnDisk, fn($f) => !isset($referencedFiles[$f]));
            $row['orphans_found'] = count($orphans);
            $row['files'] = array_values($orphans);

            if ($doDelete && $row['orphans_found'] > 0) {
                foreach ($orphans as $file) {
                    if (unlink($attachmentsDir . '/' . $file)) {
                        $row['orphans_deleted']++;
                    }
                }
            }
        } catch (Exception $e) {
            $row['error'] = $e->getMessage();
        }
        $rows[] = $row;
    }
    return $rows;
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('admin_tools.orphan_scanner.title', [], 'Orphan attachments scanner'); ?></title>
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
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../settings.php" class="btn btn-secondary"><?php echo t_h('settings.title', [], 'Settings'); ?></a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <h1><?php echo t_h('admin_tools.orphan_scanner.title', [], 'Orphan attachments scanner'); ?></h1>
            <p><?php echo t_h('admin_tools.orphan_scanner.description', [], 'This tool scans your attachment folders and identifies files that are no longer referenced in any of your notes.'); ?></p>
        </div>

        <div class="orphan-actions">
            <form method="POST">
                <input type="hidden" name="action" value="scan">
                <button type="submit" class="btn btn-primary">
                    <?php echo t_h('admin_tools.orphan_scanner.scan_button', [], 'Scan for orphans'); ?>
                </button>
            </form>
            <?php if ($hasOrphansInResults): ?>
                <form method="POST">
                    <input type="hidden" name="action" value="delete">
                    <button type="submit" class="btn btn-secondary" style="background: #dc3545; color: white; border: none;">
                        <?php echo t_h('admin_tools.orphan_scanner.delete_button', [], 'Delete orphans'); ?>
                    </button>
                </form>
            <?php endif; ?>
        </div>

        <?php if ($results !== null): ?>
            <div class="results-container">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>
                                <span class="header-desktop"><?php echo t_h('admin_tools.orphan_scanner.table_user_id', [], 'User ID'); ?></span>
                                <span class="header-mobile"><?php echo t_h('admin_tools.orphan_scanner.table_user_id_short', [], 'User'); ?></span>
                            </th>
                            <th class="hide-mobile"><?php echo t_h('admin_tools.orphan_scanner.table_total_files', [], 'Total Files'); ?></th>
                            <th>
                                <span class="header-desktop"><?php echo t_h('admin_tools.orphan_scanner.table_orphans_found', [], 'Orphans Found'); ?></span>
                                <span class="header-mobile"><?php echo t_h('admin_tools.orphan_scanner.table_orphans_found_short', [], 'Orphans'); ?></span>
                            </th>
                            <th class="hide-mobile"><?php echo t_h('admin_tools.orphan_scanner.table_details', [], 'Details / Action'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($results as $row): ?>
                            <tr>
                                <td><strong><?php echo $row['user_id']; ?></strong></td>
                                <td class="hide-mobile"><?php echo $row['total_files']; ?></td>
                                <td>
                                    <?php if ($row['orphans_found'] > 0): ?>
                                        <span class="status-badge status-warning"><?php echo $row['orphans_found']; ?> <?php echo t_h('admin_tools.orphan_scanner.orphans_label', [], 'orphans'); ?></span>
                                    <?php else: ?>
                                        <span class="status-badge status-clean">0 <?php echo t_h('admin_tools.orphan_scanner.orphans_label', [], 'orphans'); ?></span>
                                    <?php endif; ?>

                                    <?php if ($row['orphans_found'] > 0 && $row['orphans_deleted'] === 0): ?>
                                        <div class="mobile-only orphan-mobile-action">
                                            <button type="button" class="btn-view-files" onclick="showOrphanFiles(<?php echo $row['user_id']; ?>, <?php echo htmlspecialchars(json_encode($row['files']), ENT_QUOTES); ?>)">
                                                <?php echo t_h('admin_tools.orphan_scanner.view_files', ['count' => count($row['files'])], 'View {{count}} files'); ?>
                                            </button>
                                        </div>
                                    <?php endif; ?>
                                </td>
                                <td class="hide-mobile">
                                    <?php if ($row['error']): ?>
                                        <span style="color:red"><?php echo htmlspecialchars($row['error']); ?></span>
                                    <?php elseif ($row['orphans_found'] > 0 || $row['orphans_deleted'] > 0): ?>
                                        <?php if ($row['orphans_deleted'] > 0): ?>
                                            <div class="deletion-notice">
                                                <strong>✓</strong>
                                                <span><?php echo t_h('admin_tools.orphan_scanner.deleted_files', ['count' => $row['orphans_deleted']], 'Deleted {{count}} files'); ?></span>
                                            </div>
                                        <?php else: ?>
                                            <button type="button" class="btn-view-files" onclick="showOrphanFiles(<?php echo $row['user_id']; ?>, <?php echo htmlspecialchars(json_encode($row['files']), ENT_QUOTES); ?>)">
                                                <?php echo t_h('admin_tools.orphan_scanner.view_files', ['count' => count($row['files'])], 'View {{count}} files'); ?>
                                            </button>
                                        <?php endif; ?>
                                    <?php else: ?>
                                        <span style="color: var(--text-muted, #999);">—</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Modal for viewing orphan files -->
<div id="orphan-files-modal" class="orphan-modal" style="display: none;">
    <div class="orphan-modal-overlay" onclick="closeOrphanFiles()"></div>
    <div class="orphan-modal-content">
        <div class="orphan-modal-header">
            <h3 id="modal-title"><?php echo t_h('admin_tools.orphan_scanner.modal_title', [], 'Orphan Files'); ?></h3>
            <button type="button" class="orphan-modal-close" onclick="closeOrphanFiles()">&times;</button>
        </div>
        <div class="orphan-modal-body">
            <ul id="orphan-files-list" class="orphan-files-ul"></ul>
        </div>
    </div>
</div>

<script>
function showOrphanFiles(userId, files) {
    const modal = document.getElementById('orphan-files-modal');
    const list = document.getElementById('orphan-files-list');
    const title = document.getElementById('modal-title');
    
    title.textContent = '<?php echo t_h('admin_tools.orphan_scanner.modal_title_user', [], 'Orphan Files - User'); ?> ' + userId + ' (' + files.length + ' <?php echo t_h('admin_tools.orphan_scanner.files_label', [], 'files'); ?>)';
    
    list.innerHTML = '';
    files.forEach(file => {
        const li = document.createElement('li');
        const path = document.createElement('span');
        path.className = 'file-path';
        path.textContent = 'data/users/' + userId + '/attachments/';
        
        const filename = document.createElement('strong');
        filename.textContent = file;
        
        li.appendChild(path);
        li.appendChild(filename);
        list.appendChild(li);
    });
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeOrphanFiles() {
    const modal = document.getElementById('orphan-files-modal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeOrphanFiles();
    }
});
</script>

</body>
</html>
