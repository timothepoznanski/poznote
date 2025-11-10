<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

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
            if ($name === '') throw new Exception('Workspace name cannot be empty');
            // validate allowed characters: letters, digits, hyphen, underscore
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) throw new Exception('Invalid workspace name. Use only letters, numbers, dash and underscore (no spaces).');
            $stmt = $con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
            $stmt->execute([$name]);
            
            $message = 'Workspace created';
        } elseif (isset($_POST['action']) && $_POST['action'] === 'delete') {
            $name = trim($_POST['name'] ?? '');
            if ($name === '') throw new Exception('Workspace name required');
            if ($name === 'Poznote') throw new Exception('Cannot delete the default workspace');

            // Ensure workspace exists before deletion
            $check = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
            $check->execute([$name]);
            if ((int)$check->fetchColumn() === 0) {
                throw new Exception('Workspace not found');
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

                $message = 'Workspace deleted and all associated notes, folders and attachments removed';
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
            if ($name === '') throw new Exception('Workspace name required');
            // Do not allow renaming the reserved default workspace
            if ($name === 'Poznote') throw new Exception('Cannot rename the default workspace');

            // validate new name characters
            if ($new_name !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $new_name)) throw new Exception('Invalid new workspace name. Use only letters, numbers, dash and underscore (no spaces).');

            // If new_name provided and different, rename the workspace across DB and labels
            if ($new_name !== '' && $new_name !== $name) {
                $con->beginTransaction();
                try {
                    // Insert new workspace entry (ignore if exists)
                    $ins = $con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
                    $ins->execute([$new_name]);

                    // Move entries to new workspace name
                    $upd = $con->prepare('UPDATE entries SET workspace = ? WHERE workspace = ?');
                    $upd->execute([$new_name, $name]);

                    // Remove old workspace record
                    $del = $con->prepare('DELETE FROM workspaces WHERE name = ?');
                    $del->execute([$name]);

                    $con->commit();
                    $message = 'Workspace renamed across notes and labels';
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
            if ($name === '' || $target === '') throw new Exception('Workspace name and target required');
            if ($name === $target) throw new Exception('Source and target workspaces must differ');

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
            $checkStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $updHeading = $con->prepare("UPDATE entries SET heading = ? WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $updWorkspace = $con->prepare("UPDATE entries SET workspace = ? WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");

            $con->beginTransaction();
            try {
                foreach ($entriesToMove as $entry) {
                    $id = $entry['id'];
                    $heading = $entry['heading'] ?? '';

                    // If a heading conflict exists in destination, find a unique candidate and update heading
                    $checkStmt->execute([$heading, $target, $target]);
                    if ($checkStmt->fetchColumn() > 0) {
                        $base = $heading;
                        $i = 1;
                        do {
                            $candidate = $base . ' (' . $i . ')';
                            $checkStmt->execute([$candidate, $target, $target]);
                            $exists = $checkStmt->fetchColumn() > 0;
                            $i++;
                        } while ($exists);

                        // Update heading in the source workspace for this note
                        $updHeading->execute([$candidate, $id, $name, $name]);
                    }

                    // Now update the workspace for this entry
                    $updWorkspace->execute([$target, $id, $name, $name]);
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

            $message = 'Notes moved to ' . htmlspecialchars($target);

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
$stmt = $con->query("SELECT name FROM workspaces ORDER BY CASE WHEN name = 'Poznote' THEN 0 ELSE 1 END, name");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $workspaces[] = $row['name'];
}

// Count notes per workspace, excluding trashed notes. Map NULL workspace to 'Poznote'.
$workspace_counts = [];
try {
    $countSql = "SELECT COALESCE(workspace, 'Poznote') as workspace, COUNT(*) as cnt FROM entries WHERE trash = 0 GROUP BY COALESCE(workspace, 'Poznote')";
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
<html>
<head>
    <title>Manage Workspaces - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
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
<body>
    <div class="settings-container">
        <h1> Workspaces</h1>
        <p>Workspaces allow you to organize your notes into separate environments within a single Poznote instance - like having different notebooks for work, personal life, or projects.</p>

        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            Back to Notes
        </a>
        <a href="settings.php" class="btn btn-secondary">
            Back to Settings
        </a>

        <br><br>

        <!-- Top alert area: used for both server-side and client-side messages -->
        <div id="topAlert" style="<?php echo ($message || $error) ? '' : 'display:none;'; ?> margin-top:12px;" class="<?php echo $message ? 'alert alert-success' : ($error ? 'alert alert-danger' : ''); ?>">
            <?php if ($message): ?>
                <?php echo htmlspecialchars($message); ?>
            <?php elseif ($error): ?>
                <?php echo htmlspecialchars($error); ?>
            <?php endif; ?>
        </div>

        <div class="settings-section">
            <h3> Create a new workspace</h3>
            <form id="create-workspace-form" method="POST" onsubmit="return validateCreateWorkspaceForm();">
                <input type="hidden" name="action" value="create">
                <div class="form-group">
                    <input id="workspace-name" name="name" type="text" placeholder="Enter workspace name" />
                </div>
                <button type="submit" class="btn btn-primary"> Create</button>
            </form>
        </div>

        <div class="settings-section">
            <h3> Existing workspaces</h3>
            <div class="workspace-list">
                <?php if (empty($workspaces)): ?>
                    <div>No workspaces defined.</div>
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
                                                    $cnt_text = '0 notes';
                                                } elseif ($cnt === 1) {
                                                    $cnt_text = '1 note';
                                                } else {
                                                    $cnt_text = $cnt . ' notes';
                                                }
                                            ?>
                                            <span class="workspace-count"><?php echo htmlspecialchars($cnt_text); ?></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="ws-col ws-col-action">
                                    <?php if ($ws !== 'Poznote'): ?>
                                        <button class="btn btn-rename action-btn" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">Rename</button>
                                    <?php else: ?>
                                        <button class="btn btn-rename action-btn" disabled>Rename</button>
                                    <?php endif; ?>
                                </div>
                                <div class="ws-col ws-col-select">
                                    <?php if ($ws !== ''): ?>
                                        <button type="button" class="btn btn-primary action-btn btn-select" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">Select</button>
                                    <?php endif; ?>
                                </div>
                                <div class="ws-col ws-col-move"><button class="btn btn-warning action-btn btn-move" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">Move notes</button></div>
                                <div class="ws-col ws-col-delete">
                                    <?php if ($ws !== 'Poznote'): ?>
                                        <form method="POST" class="delete-form" data-ws-name="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">
                                            <input type="hidden" name="action" value="delete">
                                            <input type="hidden" name="name" value="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">
                                            <button type="button" class="btn btn-danger action-btn btn-delete" data-ws="<?php echo htmlspecialchars($ws, ENT_QUOTES); ?>">Delete</button>
                                        </form>
                                    <?php else: ?>
                                        <button class="btn btn-danger action-btn" disabled>Delete</button>
                                    <?php endif; ?>
                                </div>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        </div>

        <!-- Default Workspace Setting -->
        <div class="settings-section">
            <h3> Default Workspace</h3>
            <p>Choose which workspace opens when you start Poznote.<br>Select "Last workspace opened" to always open the workspace you were using previously.</p>
            <div class="form-group">
                <select id="defaultWorkspaceSelect" style="width: 300px; padding: 8px; font-size: 14px; margin-right: 10px;">
                    <option value="">Loading...</option>
                </select>
                <button type="button" class="btn btn-primary" id="saveDefaultWorkspaceBtn"> Save Default</button>
            </div>
            <div id="defaultWorkspaceStatus" style="margin-top: 8px; color: #10b981; display: none;"></div>
        </div>

    <div id="ajaxAlert" style="display:none; margin-top:12px;"></div>
    <div style="padding-bottom: 50px;"></div>
    </div>

    <?php if (!empty($clearSelectedWorkspace) && !$isAjax): ?>
    <script>
        try { localStorage.setItem('poznote_selected_workspace', 'Poznote'); } catch(e) {}
        try { window.location = 'index.php?workspace=Poznote'; } catch(e) {}
    </script>
    <?php endif; ?>

    <script src="js/theme-manager.js"></script>
    <script src="js/workspaces.js"></script>
    <script>
        // Initialize workspace page when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            // Add event listeners for rename and select buttons
            document.addEventListener('click', handleRenameButtonClick);
            document.addEventListener('click', handleSelectButtonClick);
            document.addEventListener('click', handleDeleteButtonClick);

            // Update back link with stored workspace, but only if that workspace is present in the displayed list.
            try {
                var stored = localStorage.getItem('poznote_selected_workspace');
                var a = document.getElementById('backToNotesLink');
                if (a && stored) {
                    // Check displayed workspaces on the page to ensure the stored value still exists
                    var exists = false;
                    try {
                        var items = document.querySelectorAll('.workspace-name-item');
                        for (var i = 0; i < items.length; i++) {
                            if (items[i].textContent.trim() === stored) { exists = true; break; }
                        }
                    } catch (e) {
                        // if DOM query fails, be conservative and assume exists = false
                        exists = false;
                    }

                    if (exists) {
                        a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
                    } else {
                        // Clean up stale selection and default to Poznote
                        try { localStorage.setItem('poznote_selected_workspace', 'Poznote'); } catch(e) {}
                        a.setAttribute('href', 'index.php?workspace=Poznote');
                    }
                }
            } catch(e) {}
        });

        // Event listeners for workspace modals that depend on PHP variables
        document.addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('btn-move')){
                var source = e.target.getAttribute('data-ws');
                document.getElementById('moveSourceName').textContent = source;
                // populate targets
                var sel = document.getElementById('moveTargetSelect');
                sel.innerHTML = '';
                <?php foreach ($workspaces as $w): ?>
                    if ('<?php echo addslashes($w); ?>' !== source) {
                        var opt = document.createElement('option'); opt.value = '<?php echo addslashes($w); ?>'; opt.text = '<?php echo addslashes($w); ?>'; sel.appendChild(opt);
                    }
                <?php endforeach; ?>
                document.getElementById('moveNotesModal').style.display = 'flex';
                // confirm handler
                document.getElementById('confirmMoveBtn').onclick = function(){
                    var target = sel.value;
                    if (!target) { alert('Choose a target'); return; }
                    
                    // disable to prevent double clicks
                    var confirmBtn = document.getElementById('confirmMoveBtn');
                    try { confirmBtn.disabled = true; } catch(e) {}
                    
                    var params = new URLSearchParams({ action: 'move_notes', name: source, target: target });
                    fetch('workspaces.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type':'application/x-www-form-urlencoded',
                            'X-Requested-With':'XMLHttpRequest',
                            'Accept':'application/json'
                        },
                        body: params.toString()
                    })
                    .then(function(resp){ 
                        if (!resp.ok) {
                            throw new Error('HTTP error ' + resp.status);
                        }
                        return resp.json(); 
                    })
                    .then(function(json){
                        // Re-enable button
                        try { confirmBtn.disabled = false; } catch(e) {}
                        if (json && json.success) {
                            showAjaxAlert('Moved ' + (json.moved||0) + ' notes to ' + json.target, 'success');
                            // Update counts in the displayed workspace list
                            try {
                                (function(){
                                    var moved = parseInt(json.moved || 0, 10);
                                    if (!moved) return;
                                    var src = (source || '').trim();
                                    var tgt = (json.target || '').trim();
                                    function adjustCountFor(name, delta) {
                                        var rows = document.querySelectorAll('.ws-name-row');
                                        for (var i = 0; i < rows.length; i++) {
                                            var nEl = rows[i].querySelector('.workspace-name-item');
                                            var cEl = rows[i].querySelector('.workspace-count');
                                            if (!nEl || !cEl) continue;
                                            if (nEl.textContent.trim() === name) {
                                                var text = cEl.textContent.trim();
                                                var num = parseInt(text, 10);
                                                if (isNaN(num)) {
                                                    var m = text.match(/(\d+)/);
                                                    num = m ? parseInt(m[1], 10) : 0;
                                                }
                                                num = Math.max(0, num + delta);
                                                cEl.textContent = num + (num === 1 ? ' note' : ' notes');
                                                break;
                                            }
                                        }
                                    }
                                    if (src) adjustCountFor(src, -moved);
                                    if (tgt) adjustCountFor(tgt, moved);
                                })();
                            } catch (e) {
                                // non-fatal UI update error
                            }
                            // Persist the selected workspace so returning to notes shows destination
                            try { localStorage.setItem('poznote_selected_workspace', json.target); } catch(e) {}
                            // Update any Back to Notes links on this page to include the workspace param
                            try {
                                var backLinks = document.querySelectorAll('a.btn.btn-secondary');
                                for (var i = 0; i < backLinks.length; i++) {
                                    var href = backLinks[i].getAttribute('href') || '';
                                    if (href.indexOf('index.php') !== -1) {
                                        backLinks[i].setAttribute('href', 'index.php?workspace=' + encodeURIComponent(json.target));
                                    }
                                }
                            } catch(e) {}
                            // Close the modal on success
                            try { closeMoveModal(); } catch(e) {}
                        } else {
                            showAjaxAlert('Error: ' + (json.error || 'Unknown'), 'danger');
                        }
                    }).catch(function(err){
                        try { confirmBtn.disabled = false; } catch(e) {}
                        showAjaxAlert('Error moving notes: ' + (err.message || 'Unknown error'), 'danger');
                    });
                };
            }
        });

        // Build map of workspace -> name
        var workspaceDisplayMap = <?php
            $display_map = [];
            foreach ($workspaces as $w) {
                $display_map[$w] = $w;
            }
            echo json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
        ?>;

        // Default Workspace Management
        (function(){
            window.loadDefaultWorkspaceSetting = function loadDefaultWorkspaceSetting() {
                var select = document.getElementById('defaultWorkspaceSelect');
                if (!select) return;
                
                // Populate select with workspaces from PHP
                select.innerHTML = '';
                
                // Add special option for last workspace opened
                var optLast = document.createElement('option');
                optLast.value = '__last_opened__';
                optLast.textContent = 'Last workspace opened';
                select.appendChild(optLast);
                
                <?php foreach ($workspaces as $w): ?>
                    var opt = document.createElement('option');
                    opt.value = <?php echo json_encode($w); ?>;
                    opt.textContent = <?php echo json_encode($w); ?>;
                    select.appendChild(opt);
                <?php endforeach; ?>
                
                // Load current default workspace setting
                var form = new FormData();
                form.append('action', 'get');
                form.append('key', 'default_workspace');
                
                fetch('api_settings.php', {method: 'POST', body: form})
                    .then(function(r) { return r.json(); })
                    .then(function(j) {
                        if (j && j.success && j.value) {
                            select.value = j.value;
                        } else {
                            // Default to "Last workspace opened" if not set
                            select.value = '__last_opened__';
                        }
                    })
                    .catch(function() {
                        select.value = '__last_opened__';
                    });
            }
            
            function saveDefaultWorkspaceSetting() {
                var select = document.getElementById('defaultWorkspaceSelect');
                var status = document.getElementById('defaultWorkspaceStatus');
                if (!select) return;
                
                var selectedWorkspace = select.value;
                var setForm = new FormData();
                setForm.append('action', 'set');
                setForm.append('key', 'default_workspace');
                setForm.append('value', selectedWorkspace);
                
                fetch('api_settings.php', {method: 'POST', body: setForm})
                    .then(function(r) { return r.json(); })
                    .then(function(result) {
                        if (result && result.success) {
                            if (status) {
                                var displayText = selectedWorkspace === '__last_opened__' 
                                    ? 'Last workspace opened' 
                                    : selectedWorkspace;
                                status.textContent = '✓ Default workspace set to: ' + displayText;
                                status.style.display = 'block';
                                setTimeout(function() {
                                    status.style.display = 'none';
                                }, 3000);
                            }
                        } else {
                            alert('Error saving default workspace');
                        }
                    })
                    .catch(function() {
                        alert('Error saving default workspace');
                    });
            }
            
            // Initialize on page load
            loadDefaultWorkspaceSetting();
            
            // Attach save button handler
            var saveBtn = document.getElementById('saveDefaultWorkspaceBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', saveDefaultWorkspaceSetting);
            }
        })();
    </script>
    
    <?php include 'modals.php'; ?>
    
</body>
</html>
