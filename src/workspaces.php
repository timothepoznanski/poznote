<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

$currentLang = getUserLanguage();

// Ensure workspaces table exists
$con->exec("CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY)");

$message = '';
$error = '';
$clearSelectedWorkspace = false;

// Handle create/delete actions
if ($_POST) {
    // detect AJAX/JSON request
    $isAjax = false;
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') {
        $isAjax = true;
    } elseif (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
        $isAjax = true;
    }
    try {
        if (isset($_POST['action']) && $_POST['action'] === 'create') {
            $name = trim($_POST['name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_empty', [], 'Workspace name cannot be empty', $currentLang));
            // validate allowed characters: letters, digits, hyphen, underscore
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) throw new Exception(t('workspaces.errors.invalid_name', [], 'Invalid workspace name. Use only letters, numbers, dash and underscore (no spaces).', $currentLang));
            $stmt = $con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
            $stmt->execute([$name]);
            
            $message = t('workspaces.messages.created', [], 'Workspace created', $currentLang);
            
            // If this was an AJAX create, return JSON response immediately
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message, 'name' => $name]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'delete') {
            $name = trim($_POST['name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));

            // Cannot delete the last workspace
            $countAll = $con->query('SELECT COUNT(*) FROM workspaces')->fetchColumn();
            if ((int)$countAll <= 1) {
                throw new Exception(t('workspaces.errors.cannot_delete_last', [], 'Cannot delete the last workspace', $currentLang));
            }

            // Ensure workspace exists before deletion
            $check = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
            $check->execute([$name]);
            if ((int)$check->fetchColumn() === 0) {
                throw new Exception(t('workspaces.errors.not_found', [], 'Workspace not found', $currentLang));
            }

                // Check if this workspace is set as the default workspace
                $currentDefaultWorkspace = null;
                try {
                    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                    $stmt->execute(['default_workspace']);
                    $currentDefaultWorkspace = $stmt->fetchColumn();
                } catch (Exception $e) {
                    // Settings table may not exist - ignore
                }

                // Check if this workspace is set as the last opened workspace
                $currentLastOpened = null;
                try {
                    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                    $stmt->execute(['last_opened_workspace']);
                    $currentLastOpened = $stmt->fetchColumn();
                } catch (Exception $e) {
                    // Settings table may not exist - ignore
                }

                // Find another workspace to redirect to after deletion
                $otherWs = $con->prepare("SELECT name FROM workspaces WHERE name != ? ORDER BY name LIMIT 1");
                $otherWs->execute([$name]);
                $targetWorkspace = $otherWs->fetchColumn();

                // Delete all entries for this workspace (including trashed notes)
                $selectEntries = $con->prepare('SELECT id, attachments, type FROM entries WHERE workspace = ?');
                $selectEntries->execute([$name]);
                $entries = $selectEntries->fetchAll(PDO::FETCH_ASSOC);

                // Paths for files
                $attachmentsPath = getAttachmentsPath();
                $entriesPath = getEntriesPath();

                // Delete physical attachment files referenced in entries
                foreach ($entries as $entry) {
                    // attachments stored as JSON array in `attachments` column
                    if (!empty($entry['attachments'])) {
                        $attList = json_decode($entry['attachments'], true);
                        if (is_array($attList)) {
                            foreach ($attList as $att) {
                                if (is_array($att) && !empty($att['filename'])) {
                                    $file = $attachmentsPath . DIRECTORY_SEPARATOR . $att['filename'];
                                    if (file_exists($file)) {
                                        @unlink($file);
                                    }
                                }
                            }
                        }
                    }

                    // Delete entry files if present (entries can be .html or .md based on type)
                    if (!empty($entry['id'])) {
                        $entryType = $entry['type'] ?? 'note';
                        $fileExtension = ($entryType === 'markdown') ? '.md' : '.html';
                        $entryFile = rtrim($entriesPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $entry['id'] . $fileExtension;
                        if (file_exists($entryFile)) {
                            @unlink($entryFile);
                        }
                        
                        // Also check for the other extension in case of type changes
                        $otherExtension = ($entryType === 'markdown') ? '.html' : '.md';
                        $otherFile = rtrim($entriesPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $entry['id'] . $otherExtension;
                        if (file_exists($otherFile)) {
                            @unlink($otherFile);
                        }
                    }
                }

                // Remove entries rows from DB
                $delEntries = $con->prepare('DELETE FROM entries WHERE workspace = ?');
                $delEntries->execute([$name]);

                // Additional cleanup: remove orphan files from data/entries
                // Some files can remain on disk if the DB row was missing or inconsistent.
                // Scan the entries directory and remove any <id>.html or <id>.md files that are no longer present in the entries table.
                try {
                    $entriesDir = getEntriesPath();
                    if ($entriesDir && is_dir($entriesDir)) {
                        $files = scandir($entriesDir);
                        $checkStmt = $con->prepare('SELECT COUNT(*) FROM entries WHERE id = ?');
                        foreach ($files as $f) {
                            if (!is_string($f)) continue;
                            
                            // Check for both .html and .md files
                            $isHtml = substr($f, -5) === '.html';
                            $isMd = substr($f, -3) === '.md';
                            
                            if (!$isHtml && !$isMd) continue;
                            if ($f === 'index.html') continue; // keep generic index
                            
                            $base = $isHtml ? basename($f, '.html') : basename($f, '.md');
                            // Only consider numeric IDs (legacy behavior uses numeric ids for exported files)
                            if (!preg_match('/^\d+$/', $base)) continue;
                            // If no DB row exists for this id, delete the file
                            try {
                                $checkStmt->execute([$base]);
                                $count = (int)$checkStmt->fetchColumn();
                                if ($count === 0) {
                                    @unlink(rtrim($entriesDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $f);
                                }
                            } catch (Exception $e) {
                                // ignore DB check errors and continue
                            }
                        }
                    }
                } catch (Exception $e) {
                    // Non-fatal: don't block workspace deletion if cleanup fails
                }

                // Remove folders scoped to this workspace
                try {
                    $delFolders = $con->prepare('DELETE FROM folders WHERE workspace = ?');
                    $delFolders->execute([$name]);
                } catch (Exception $e) {
                    // Table may not exist - ignore
                }

                // Remove any settings namespaced for this workspace (key format: something::workspace)
                try {
                    $delSettings = $con->prepare("DELETE FROM settings WHERE key LIKE ?");
                    $delSettings->execute(['%::' . $name]);
                } catch (Exception $e) {
                    // non-fatal
                }

                // If the deleted workspace was the default workspace, reset to "last opened"
                if ($currentDefaultWorkspace === $name) {
                    try {
                        $resetStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                        $resetStmt->execute(['default_workspace', '__last_opened__']);
                    } catch (Exception $e) {
                        // If settings update fails, continue - it's not critical for workspace deletion
                    }
                }

                // If the deleted workspace was the last opened workspace, update to target workspace
                if ($currentLastOpened === $name && $targetWorkspace) {
                    try {
                        $resetStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                        $resetStmt->execute(['last_opened_workspace', $targetWorkspace]);
                    } catch (Exception $e) {
                        // If settings update fails, continue - it's not critical for workspace deletion
                    }
                }

                // Finally remove workspace record
                $stmt = $con->prepare('DELETE FROM workspaces WHERE name = ?');
                $stmt->execute([$name]);

                // Audit log for manual deletion from manage_workspaces
                try {
                    $logDir = __DIR__ . '/../data';
                    if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
                    $logFile = $logDir . '/workspace_actions.log';
                    $who = (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['authenticated'])) ? 'session_user' : ($_SERVER['PHP_AUTH_USER'] ?? 'unknown');
                    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
                    $entry = date('c') . "\tworkspaces.php\tDELETE\t$name\tby:$who\tfrom:$ip\n";
                    @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
                } catch (Exception $e) {
                    // ignore logging errors
                }

                $message = t('workspaces.messages.deleted_all', [], 'Workspace deleted and all associated notes, folders and attachments removed', $currentLang);
                // If this was an AJAX delete, return JSON response immediately
                if (!empty($isAjax)) {
                    header('Content-Type: application/json');
                    echo json_encode(['success' => true, 'message' => $message]);
                    exit;
                }
                // If this was a non-AJAX delete, instruct client to clear selected workspace (so UI doesn't keep showing deleted workspace)
                $clearSelectedWorkspace = true;
        } elseif (isset($_POST['action']) && $_POST['action'] === 'rename') {
            $name = trim($_POST['name'] ?? '');
            $new_name = trim($_POST['new_name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));

            // validate new name characters
            if ($new_name !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $new_name)) throw new Exception(t('workspaces.errors.invalid_new_name', [], 'Invalid new workspace name. Use only letters, numbers, dash and underscore (no spaces).', $currentLang));

            // If new_name provided and different, rename the workspace across DB and labels
            if ($new_name !== '' && $new_name !== $name) {
                $con->beginTransaction();
                try {
                    // Check if new name already exists
                    $checkNew = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                    $checkNew->execute([$new_name]);
                    if ((int)$checkNew->fetchColumn() > 0) {
                        throw new Exception(t('workspaces.errors.name_exists', [], 'A workspace with this name already exists', $currentLang));
                    }

                    // Update the workspace name directly
                    $upd = $con->prepare('UPDATE workspaces SET name = ? WHERE name = ?');
                    $upd->execute([$new_name, $name]);

                    // Move entries to new workspace name
                    $upd = $con->prepare('UPDATE entries SET workspace = ? WHERE workspace = ?');
                    $upd->execute([$new_name, $name]);

                    // Move folders to new workspace name
                    $upd = $con->prepare('UPDATE folders SET workspace = ? WHERE workspace = ?');
                    $upd->execute([$new_name, $name]);

                    // Update default_workspace setting if it references the old name
                    try {
                        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                        $stmt->execute(['default_workspace']);
                        $currentDefault = $stmt->fetchColumn();
                        if ($currentDefault === $name) {
                            $stmt = $con->prepare('UPDATE settings SET value = ? WHERE key = ?');
                            $stmt->execute([$new_name, 'default_workspace']);
                        }
                    } catch (Exception $e) {
                        // Non-fatal
                    }

                    // Update last_opened_workspace setting if it references the old name
                    try {
                        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                        $stmt->execute(['last_opened_workspace']);
                        $currentLastOpened = $stmt->fetchColumn();
                        if ($currentLastOpened === $name) {
                            $stmt = $con->prepare('UPDATE settings SET value = ? WHERE key = ?');
                            $stmt->execute([$new_name, 'last_opened_workspace']);
                        }
                    } catch (Exception $e) {
                        // Non-fatal
                    }

                    $con->commit();
                    $message = t('workspaces.messages.renamed', [], 'Workspace renamed across notes and labels', $currentLang);
                    // Also, if a display label provided, store it for the new name below
                    $name = $new_name;
                } catch (Exception $e) {
                    $con->rollBack();
                    throw $e;
                }
            }

            // If AJAX client expects JSON, return structured response
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message, 'name' => $name]);
                exit;
            }
        }
    elseif (isset($_POST['action']) && $_POST['action'] === 'move_notes') {
            $name = trim($_POST['name'] ?? '');
            $target = trim($_POST['target'] ?? '');
            if ($name === '' || $target === '') throw new Exception(t('workspaces.errors.name_and_target_required', [], 'Workspace name and target required', $currentLang));
            if ($name === $target) throw new Exception(t('workspaces.errors.source_target_must_differ', [], 'Source and target workspaces must differ', $currentLang));

            // Ensure target exists
            $ins = $con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
            $ins->execute([$target]);

            // Move non-trashed entries individually to preserve uniqueness of headings
            $moved = 0;
            // Select entries to move
            $sel = $con->prepare('SELECT id, heading FROM entries WHERE workspace = ? AND trash = 0');
            $sel->execute([$name]);
            $entriesToMove = $sel->fetchAll(PDO::FETCH_ASSOC);

            // Prepare statements used in loop
            $checkStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND workspace = ?");
            $updHeading = $con->prepare("UPDATE entries SET heading = ? WHERE id = ? AND workspace = ?");
            $updWorkspace = $con->prepare("UPDATE entries SET workspace = ? WHERE id = ? AND workspace = ?");

            $con->beginTransaction();
            try {
                foreach ($entriesToMove as $entry) {
                    $id = $entry['id'];
                    $heading = $entry['heading'] ?? '';

                    // If a heading conflict exists in destination, find a unique candidate and update heading
                    $checkStmt->execute([$heading, $target]);
                    if ($checkStmt->fetchColumn() > 0) {
                        $base = $heading;
                        $i = 1;
                        do {
                            $candidate = $base . ' (' . $i . ')';
                            $checkStmt->execute([$candidate, $target]);
                            $exists = $checkStmt->fetchColumn() > 0;
                            $i++;
                        } while ($exists);

                        // Update heading in the source workspace for this note
                        $updHeading->execute([$candidate, $id, $name]);
                    }

                    // Now update the workspace for this entry
                    $updWorkspace->execute([$target, $id, $name]);
                    if ($updWorkspace->rowCount() > 0) {
                        $moved++;
                    }
                }
                $con->commit();
            } catch (Exception $e) {
                $con->rollBack();
                throw $e;
            }

            // Then move trashed entries as well, but don't include them in the moved count shown to users
            $updTrashed = $con->prepare('UPDATE entries SET workspace = ? WHERE workspace = ? AND trash != 0');
            $updTrashed->execute([$target, $name]);

            // Remap folder_id for moved notes to match folders in destination workspace
            // Instead of moving folders (which causes UNIQUE constraint violation),
            // we update folder_id to point to existing folders in target workspace
            try {
                // Get mapping of folder names to IDs in source workspace
                $sourceFolders = [];
                $srcStmt = $con->prepare('SELECT id, name FROM folders WHERE workspace = ?');
                $srcStmt->execute([$name]);
                while ($row = $srcStmt->fetch(PDO::FETCH_ASSOC)) {
                    $sourceFolders[(int)$row['id']] = $row['name'];
                }

                // Get mapping of folder names to IDs in target workspace
                $targetFolders = [];
                $tgtStmt = $con->prepare('SELECT id, name FROM folders WHERE workspace = ?');
                $tgtStmt->execute([$target]);
                while ($row = $tgtStmt->fetch(PDO::FETCH_ASSOC)) {
                    $targetFolders[$row['name']] = (int)$row['id'];
                }

                // For each source folder, find or create corresponding folder in target
                $folderIdMap = []; // source_id => target_id
                $insertFolder = $con->prepare('INSERT OR IGNORE INTO folders (name, workspace) VALUES (?, ?)');
                $getNewId = $con->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ?');
                
                foreach ($sourceFolders as $srcId => $folderName) {
                    if (isset($targetFolders[$folderName])) {
                        // Folder already exists in target
                        $folderIdMap[$srcId] = $targetFolders[$folderName];
                    } else {
                        // Create folder in target workspace
                        $insertFolder->execute([$folderName, $target]);
                        $getNewId->execute([$folderName, $target]);
                        $newId = $getNewId->fetchColumn();
                        if ($newId) {
                            $folderIdMap[$srcId] = (int)$newId;
                        }
                    }
                }

                // Update folder_id for all moved entries
                $updFolderId = $con->prepare('UPDATE entries SET folder_id = ? WHERE folder_id = ? AND workspace = ?');
                foreach ($folderIdMap as $oldId => $newId) {
                    $updFolderId->execute([$newId, $oldId, $target]);
                }

                // Delete empty folders from source workspace
                $delFolders = $con->prepare('DELETE FROM folders WHERE workspace = ?');
                $delFolders->execute([$name]);
            } catch (Exception $e) {
                // Non-fatal: folder remapping failed but notes were moved
                // Log error but don't fail the whole operation
                error_log('Folder remapping failed during workspace move: ' . $e->getMessage());
            }

            $message = t('workspaces.messages.notes_moved_to', ['target' => htmlspecialchars($target)], 'Notes moved to {{target}}', $currentLang);

            // If an AJAX client requested JSON, return structured response and exit
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'moved' => $moved ?? 0, 'target' => $target]);
                exit;
            }
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
        if (!empty($isAjax)) {
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
    }
}

// Read existing workspaces
$workspaces = [];
$stmt = $con->query("SELECT name FROM workspaces ORDER BY name");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $workspaces[] = $row['name'];
}

// Count notes per workspace, excluding trashed notes.
$workspace_counts = [];
try {
    $countSql = "SELECT workspace, COUNT(*) as cnt FROM entries WHERE trash = 0 AND workspace IS NOT NULL GROUP BY workspace";
    $countStmt = $con->query($countSql);
    while ($r = $countStmt->fetch(PDO::FETCH_ASSOC)) {
        $workspace_counts[$r['workspace']] = (int)$r['cnt'];
    }
} catch (Exception $e) {
    // If entries table does not exist or query fails, default to empty counts
    $workspace_counts = [];
}

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang); ?>">
<head>
    <title><?php echo t_h('workspaces.page.title', [], 'Manage Workspaces - Poznote', $currentLang); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <script src="js/globals.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/workspaces.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <style>
        /* Ensure workspace list displays name + buttons on a single line */
        .workspace-list ul { list-style: none; padding: 0; margin: 0; }
    .workspace-list ul li { display: flex; align-items: flex-start !important; gap: 14px; padding: 10px 0; border-bottom: 0; }
        .workspace-list .ws-col { margin: 0; }
        .workspace-list .ws-col-name { flex: 1 1 auto; min-width: 140px; }
    .ws-name-block { display: flex; flex-direction: column; justify-content: flex-start; padding-top: 0 !important; }
    .ws-name-row { display: flex; align-items: center; gap: 8px; }
    .locked-icon { font-size: 0.95em; color: #6e6e6e; margin-left: 4px; }
    .workspace-count { color: #8a8f92; display: block; margin-top:4px; font-size: 0.92em; }

    /* Override grid centering from css/index.css to ensure name and count stack */
    .workspace-list .ws-col-name { align-items: flex-start; }
    .workspace-list .ws-col-name .ws-name-row { flex-direction: column; align-items: flex-start; gap: 4px; }
    .workspace-list .ws-col-name .workspace-count { margin-left: 0; }
    .workspace-name-item { justify-self: start; text-align: left; }
        .workspace-list .ws-col-action,
        .workspace-list .ws-col-select,
        .workspace-list .ws-col-move,
        .workspace-list .ws-col-delete { flex: 0 0 auto; }
        .workspace-list .btn { min-width: 110px; }
        /* Make disabled buttons visually consistent */
        .workspace-list .btn[disabled] { opacity: 0.65; }
    </style>
    
</head>
<body data-workspaces="<?php echo htmlspecialchars(json_encode($workspaces, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP), ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-last-opened="<?php echo htmlspecialchars(t('workspaces.default.last_opened', [], 'Last workspace opened', $currentLang), ENT_QUOTES, 'UTF-8'); ?>"
      <?php if (!empty($clearSelectedWorkspace) && !$isAjax): ?>
      data-clear-workspace="<?php echo htmlspecialchars(json_encode($workspaces[0] ?? ''), ENT_QUOTES, 'UTF-8'); ?>"
      <?php endif; ?>>
    <div class="settings-container">
        <h1><?php echo t_h('settings.cards.workspaces', [], 'Workspaces', $currentLang); ?></h1>
        <p><?php echo t_h('workspaces.description', [], 'Workspaces allow you to organize your notes into separate environments within a single Poznote instance - like having different notebooks for work, personal life, or projects.', $currentLang); ?></p>
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes', [], 'Back to Notes', $currentLang); ?>
        </a>

        <a id="backToHomeLink" href="home.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_home', [], 'Back to Home', $currentLang); ?>
        </a>

        <br><br>

        <!-- Top alert area: used for both server-side and client-side messages -->
        <div id="topAlert" class="<?php echo ($message || $error) ? '' : 'initially-hidden'; ?> alert-with-margin <?php echo $message ? 'alert alert-success' : ($error ? 'alert alert-danger' : ''); ?>">
            <?php if ($message): ?>
                <?php echo htmlspecialchars($message); ?>
            <?php elseif ($error): ?>
                <?php echo htmlspecialchars($error); ?>
            <?php endif; ?>
        </div>

        <div class="settings-section">
            <h3><?php echo t_h('workspaces.sections.create.title', [], 'Create a new workspace', $currentLang); ?></h3>
            <form id="create-workspace-form">
                <div class="form-group">
                    <input id="workspace-name" name="name" type="text" placeholder="<?php echo t_h('workspaces.sections.create.placeholder', [], 'Enter workspace name', $currentLang); ?>" />
                </div>
                <button type="submit" class="btn btn-primary" id="createWorkspaceBtn"> <?php echo t_h('common.create', [], 'Create', $currentLang); ?></button>
            </form>
        </div>

        <div class="settings-section">
            <h3><?php echo t_h('workspaces.sections.existing.title', [], 'Existing workspaces', $currentLang); ?></h3>
            <div class="workspace-list">
                <?php if (empty($workspaces)): ?>
                    <div><?php echo t_h('workspaces.sections.existing.empty', [], 'No workspaces defined.', $currentLang); ?></div>
                <?php else: ?>
                    <ul>
                        <?php foreach ($workspaces as $ws): ?>
                                <?php
                                $ws_display = htmlspecialchars($ws);
                            ?>
                            <li>
                                <div class="ws-col ws-col-name">
                                    <div class="ws-name-block">
                                        <div class="ws-name-row">
                                            <span class="workspace-name-item"><?php echo $ws_display; ?></span>
                                            <?php
                                                $cnt = isset($workspace_counts[$ws]) ? (int)$workspace_counts[$ws] : 0;
                                                if ($cnt === 0) {
                                                    $cnt_text = t('workspaces.count.notes_0', [], '0 notes', $currentLang);
                                                } elseif ($cnt === 1) {
                                                    $cnt_text = t('workspaces.count.notes_1', [], '1 note', $currentLang);
                                                } else {
                                                    $cnt_text = t('workspaces.count.notes_n', ['count' => $cnt], '{{count}} notes', $currentLang);
                                                }
                                            ?>
                                            <span class="workspace-count"><?php echo htmlspecialchars($cnt_text); ?></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="ws-col ws-col-action">
                                    <button class="btn btn-rename action-btn" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>"><?php echo t_h('common.rename', [], 'Rename', $currentLang); ?></button>
                                </div>
                                <div class="ws-col ws-col-select">
                                    <?php if ($ws !== ''): ?>
                                        <button type="button" class="btn btn-primary action-btn btn-select" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>"><?php echo t_h('workspaces.actions.select', [], 'Select', $currentLang); ?></button>
                                    <?php endif; ?>
                                </div>
                                <div class="ws-col ws-col-move">
                                    <?php 
                                        $cnt = isset($workspace_counts[$ws]) ? (int)$workspace_counts[$ws] : 0;
                                        $isDisabled = ($cnt === 0);
                                    ?>
                                    <button class="btn btn-warning action-btn btn-move" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>" <?php echo $isDisabled ? 'disabled' : ''; ?>><?php echo t_h('workspaces.actions.move_notes', [], 'Move notes', $currentLang); ?></button>
                                </div>
                                <?php if (count($workspaces) > 1): ?>
                                <div class="ws-col ws-col-delete">
                                    <form method="POST" class="delete-form" data-ws-name="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="name" value="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">
                                        <button type="button" class="btn btn-danger action-btn btn-delete" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>"><?php echo t_h('common.delete', [], 'Delete', $currentLang); ?></button>
                                    </form>
                                </div>
                                <?php endif; ?>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        </div>

        <!-- Default Workspace Setting -->
        <div class="settings-section">
            <h3><?php echo t_h('workspaces.default.title', [], 'Default Workspace', $currentLang); ?></h3>
            <p>
                <?php echo t_h('workspaces.default.description_1', [], 'Choose which workspace opens when you start Poznote.', $currentLang); ?>
            </p>
            <div class="form-group">
                <select id="defaultWorkspaceSelect" class="default-workspace-select">
                    <option value=""><?php echo t_h('common.loading', [], 'Loading...', $currentLang); ?></option>
                </select>
                <button type="button" class="btn btn-primary" id="saveDefaultWorkspaceBtn"> <?php echo t_h('workspaces.default.save_button', [], 'Save Default', $currentLang); ?></button>
            </div>
            <div id="defaultWorkspaceStatus" class="default-workspace-status"></div>
        </div>

    <div id="ajaxAlert" class="initially-hidden alert-with-margin"></div>
    <div class="section-bottom-spacer"></div>
    </div>

    <script src="js/theme-manager.js"></script>
    <script src="js/navigation.js"></script>
    <script src="js/workspaces.js"></script>
    <script src="js/modals-events.js"></script>
    
    <?php include 'modals.php'; ?>
    
</body>
</html>
