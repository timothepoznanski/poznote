<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Ensure workspaces table exists
$con->exec("CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY)");
// No display labels table: use workspace names directly

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
    // ...existing POST handlers for create/delete/rename/move_notes...
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

                // Delete all entries for this workspace (including trashed notes)
                $selectEntries = $con->prepare('SELECT id, attachments FROM entries WHERE workspace = ?');
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

                    // Delete entry HTML export file if present (entries are stored under data/entries/<id>.html)
                    if (!empty($entry['id'])) {
                        $htmlFile = rtrim($entriesPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $entry['id'] . '.html';
                        if (file_exists($htmlFile)) {
                            @unlink($htmlFile);
                        }
                    }
                }

                // Remove entries rows from DB
                $delEntries = $con->prepare('DELETE FROM entries WHERE workspace = ?');
                $delEntries->execute([$name]);

                // Additional cleanup: remove orphan HTML files from data/entries
                // Some HTML export files can remain on disk if the DB row was missing or inconsistent.
                // Scan the entries directory and remove any <id>.html files that are no longer present in the entries table.
                try {
                    $entriesDir = getEntriesPath();
                    if ($entriesDir && is_dir($entriesDir)) {
                        $files = scandir($entriesDir);
                        $checkStmt = $con->prepare('SELECT COUNT(*) FROM entries WHERE id = ?');
                        foreach ($files as $f) {
                            if (!is_string($f)) continue;
                            if (substr($f, -5) !== '.html') continue;
                            if ($f === 'index.html') continue; // keep generic index
                            $base = basename($f, '.html');
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
                    $entry = date('c') . "\tmanage_workspaces.php\tDELETE\t$name\tby:$who\tfrom:$ip\n";
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
            $label = trim($_POST['label'] ?? '');
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

                    // no label handling - workspace display uses name only

                    $con->commit();
                    $message = 'Workspace renamed across notes and labels';
                    // Also, if a display label provided, store it for the new name below
                    $name = $new_name;
                } catch (Exception $e) {
                    $con->rollBack();
                    throw $e;
                }
            }

            // Do not store display label: only the workspace name is used

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

            // Move folders scope
            $updF = $con->prepare('UPDATE folders SET workspace = ? WHERE workspace = ?');
            $updF->execute([$target, $name]);

            // no label handling - workspace display uses name only

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

// No display labels table: use workspace names for display

// login_display_name setting removed: login page uses default title

?>
<!DOCTYPE html>
<html>
<head>
    <title>Manage Workspaces - Poznote</title>
    <!-- Emergency JS files removed: not present in repository -->
    <style id="workspaces-mobile-emergency-fix">
        @media (max-width: 800px) {
            body, html {
                overflow: auto !important;
                overflow-y: scroll !important;
                overflow-x: hidden !important;
                height: auto !important;
                min-height: 100vh !important;
                position: static !important;
                -webkit-overflow-scrolling: touch !important;
                max-height: none !important;
            }
        }
    </style>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/modal.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
    <link rel="stylesheet" href="css/ai.css">
    <!-- Use existing mobile stylesheet for manage workspaces -->
    <link rel="stylesheet" href="css/manage-workspaces-mobile.css" media="(max-width: 800px)">
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
        @media (max-width:720px) {
            .workspace-list ul li { flex-wrap: wrap; }
            .workspace-list .btn { min-width: 100px; }
            /* Allow buttons inside modals or narrow containers to shrink */
            .modal .workspace-list .btn,
            .modal .workspace-list .action-btn,
            .modal .btn { min-width: 0 !important; max-width: 100% !important; }
        }
    </style>
</head>
<body>
    <div class="settings-container">
        <h1><i class="fas fa-layer-group"></i> Workspaces</h1>
        <p>Manage your workspaces. Create, delete or select a workspace to work in.</p>

        <a href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
        </a>

        <br><br>

        <!-- Top alert area: used for both server-side and client-side messages -->
        <div id="topAlert" style="<?php echo ($message || $error) ? '' : 'display:none;'; ?> margin-top:12px;" class="<?php echo $message ? 'alert alert-success' : ($error ? 'alert alert-danger' : ''); ?>">
            <?php if ($message): ?>
                <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($message); ?>
            <?php elseif ($error): ?>
                <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($error); ?>
            <?php endif; ?>
        </div>

        <div class="settings-section">
            <h3><i class="fas fa-plus"></i> Create a new workspace</h3>
            <form id="create-workspace-form" method="POST" onsubmit="return validateCreateWorkspaceForm();">
                <input type="hidden" name="action" value="create">
                <div class="form-group">
                    <input id="workspace-name" name="name" type="text" placeholder="Enter workspace name" />
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Create</button>
            </form>
        </div>

        <div class="settings-section">
            <h3><i class="fas fa-list"></i> Existing workspaces</h3>
            <div class="workspace-list">
                <?php if (empty($workspaces)): ?>
                    <div>No workspaces defined.</div>
                <?php else: ?>
                    <ul>
                        <?php foreach ($workspaces as $ws): ?>
                                <?php
                                // display uses workspace name only
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

    <!-- Login display name feature removed -->

    <div id="ajaxAlert" style="display:none; margin-top:12px;"></div>
    <div style="padding-bottom: 50px;"></div>
    </div>

    <?php if (!empty($clearSelectedWorkspace) && !$isAjax): ?>
    <script>
        try { localStorage.setItem('poznote_selected_workspace', 'Poznote'); } catch(e) {}
        try { window.location = 'index.php?workspace=Poznote'; } catch(e) {}
    </script>
    <?php endif; ?>

    <!-- Move notes modal -->
    <div id="moveNotesModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeMoveModal()">&times;</span>
            <h3>Move notes from <span id="moveSourceName"></span></h3>
            <div class="form-group">
                <label for="moveTargetSelect">Select target workspace</label>
                <select id="moveTargetSelect">
                    <?php foreach ($workspaces as $w): if ($w !== $ws): ?>
                        <option value="<?php echo htmlspecialchars($w, ENT_QUOTES); ?>"><?php echo htmlspecialchars($w); ?></option>
                    <?php endif; endforeach; ?>
                </select>
            </div>
            <div style="margin-top:12px;">
                <button id="confirmMoveBtn" class="btn btn-primary">Move notes</button>
                <button onclick="closeMoveModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeMoveModal(){ document.getElementById('moveNotesModal').style.display = 'none'; }
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
                    try { document.getElementById('confirmMoveBtn').disabled = true; } catch(e) {}
                    var params = new URLSearchParams({ action: 'move_notes', name: source, target: target });
                    fetch('manage_workspaces.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type':'application/x-www-form-urlencoded',
                            'X-Requested-With':'XMLHttpRequest',
                            'Accept':'application/json'
                        },
                        body: params.toString()
                    })
                    .then(function(resp){ return resp.json(); })
                    .then(function(json){
                        // Re-enable button
                        try { document.getElementById('confirmMoveBtn').disabled = false; } catch(e) {}
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
                    }).catch(function(){
                        try { document.getElementById('confirmMoveBtn').disabled = false; } catch(e) {}
                        showAjaxAlert('Error moving notes', 'danger');
                    });
                };
            }
        });

            function showAjaxAlert(msg, type) {
                // Prefer topAlert if available so messages appear in the same place as server messages
                if (typeof showTopAlert === 'function') {
                    showTopAlert(msg, type === 'success' ? 'success' : 'danger');
                    return;
                }
                var el = document.getElementById('ajaxAlert');
                el.style.display = 'block';
                el.className = 'alert alert-' + (type === 'success' ? 'success' : 'danger');
                el.innerHTML = msg;
                // auto-hide after 4s
                setTimeout(function(){ el.style.display = 'none'; }, 4000);
            }

    // Build map of workspace -> label (so JS can update header immediately)
        var workspaceDisplayMap = <?php
            $display_map = [];
            foreach ($workspaces as $w) {
                if (isset($labels[$w]) && $labels[$w] !== '') {
                    $display_map[$w] = $labels[$w];
                } else {
                    $display_map[$w] = ($w === 'Poznote') ? 'Poznote' : $w;
                }
            }
            echo json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
        ?>;

        // When clicking the Select button in the list, store in localStorage, update header and navigate
        document.addEventListener('click', function(e) {
            if (e.target && e.target.classList && e.target.classList.contains('btn-select')) {
                var name = e.target.getAttribute('data-ws');
                if (!name) return;
                try { localStorage.setItem('poznote_selected_workspace', name); } catch(err) {}
                try {
                    var leftHeader = document.querySelector('.left-header-text'); if (leftHeader) leftHeader.textContent = name;
                } catch(err) {}
                // navigate to main notes page with workspace filter
                window.location = 'index.php?workspace=' + encodeURIComponent(name);
            }
        });

        // Validation: only allow letters, digits, dash and underscore
        function isValidWorkspaceName(name) {
            return /^[A-Za-z0-9_-]+$/.test(name);
        }

        function validateCreateWorkspaceForm(){
            var el = document.getElementById('workspace-name');
            if (!el) return true;
            var v = el.value.trim();
            if (v === '') { showTopAlert('Enter a workspace name', 'danger'); scrollToTopAlert(); return false; }
            if (!isValidWorkspaceName(v)) { showTopAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger'); scrollToTopAlert(); return false; }
            return true;
        }
        
        // Helper to display messages in the top alert container (same place as server-side messages)
        function showTopAlert(message, type) {
            var el = document.getElementById('topAlert');
            if (!el) return showAjaxAlert(message, type === 'danger' ? 'danger' : (type === 'error' ? 'danger' : 'success'));
            el.style.display = 'block';
            el.className = 'alert ' + (type === 'danger' || type === 'Error' ? 'alert-danger' : 'alert-success');
            var icon = (type === 'danger' || type === 'Error') ? '<i class="fas fa-exclamation-triangle"></i> ' : '<i class="fas fa-check-circle"></i> ';
            el.innerHTML = icon + message;
            // auto-hide for success messages after 3s
            if (!(type === 'danger' || type === 'Error')) {
                setTimeout(function(){ el.style.display = 'none'; }, 3000);
            }
        }

        function scrollToTopAlert(){
            try { var el = document.getElementById('topAlert'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
        }
    </script>
    <!-- Rename modal -->
    <div id="renameModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeRenameModal()">&times;</span>
            <h3>Rename workspace <span id="renameSource"></span></h3>
            <div class="form-group">
                <label for="renameNewName">New name</label>
                <input id="renameNewName" type="text" />
            </div>
            <div style="margin-top:12px;">
                <button id="confirmRenameBtn" class="btn btn-primary">Rename</button>
                <button onclick="closeRenameModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeRenameModal(){ document.getElementById('renameModal').style.display = 'none'; }
        document.addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('btn-rename')){
                var source = e.target.getAttribute('data-ws');
                document.getElementById('renameSource').textContent = source;
                document.getElementById('renameNewName').value = source;
                document.getElementById('renameModal').style.display = 'flex';
                document.getElementById('confirmRenameBtn').onclick = function(){
                    var newName = document.getElementById('renameNewName').value.trim();
                    if (!newName) return alert('Enter a new name');
                    // client-side validation: allow letters/digits/-/_ only
                    if (!/^[A-Za-z0-9_-]+$/.test(newName)) { showAjaxAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger'); return; }
                    var params = new URLSearchParams({ action: 'rename', name: source, new_name: newName });
                    fetch('manage_workspaces.php', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded', 'X-Requested-With':'XMLHttpRequest', 'Accept':'application/json'}, body: params.toString() })
                        .then(r=>r.json()).then(function(resp){
                            if (resp && resp.success) {
                                showAjaxAlert('Workspace renamed', 'success');
                                // update the displayed list and left header
                                var btns = document.querySelectorAll('[data-ws="'+source+'"]');
                                btns.forEach(function(b){ b.setAttribute('data-ws', newName); });
                                // update the workspace name text node in the list
                                var spans = document.querySelectorAll('.workspace-name-item');
                                spans.forEach(function(s){ if (s.textContent === source) s.textContent = newName; });
                                try { localStorage.setItem('poznote_selected_workspace', newName); } catch(e) {}
                                var leftHeader = document.querySelector('.left-header-text'); if (leftHeader) leftHeader.textContent = newName;
                                closeRenameModal();
                            } else {
                                showAjaxAlert('Error: ' + (resp.error || 'unknown'), 'danger');
                            }
                        }).catch(function(){ showAjaxAlert('Network error', 'danger'); });
                };
            }
        });
    </script>
    <!-- Delete confirmation modal -->
    <div id="deleteModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeDeleteModal()">&times;</span>
            <h3>Confirm delete workspace <span id="deleteWorkspaceName"></span></h3>
            <p>Enter the workspace name to confirm deletion. All notes and folders will be permanently deleted and cannot be recovered.</p>
            <div class="form-group">
                <input id="confirmDeleteInput" type="text" placeholder="Type workspace name to confirm" />
            </div>
            <div style="margin-top:12px;">
                <button id="confirmDeleteBtn" class="btn btn-danger" disabled>Delete workspace</button>
                <button onclick="closeDeleteModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeDeleteModal(){ document.getElementById('deleteModal').style.display = 'none'; document.getElementById('confirmDeleteInput').value = ''; document.getElementById('confirmDeleteBtn').disabled = true; }
        document.addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('btn-delete')){
                var source = e.target.getAttribute('data-ws');
                // store the target form reference
                window._deleteForm = e.target.closest('form.delete-form');
                document.getElementById('deleteWorkspaceName').textContent = source;
                document.getElementById('confirmDeleteInput').value = '';
                document.getElementById('confirmDeleteBtn').disabled = true;
                document.getElementById('deleteModal').style.display = 'flex';
                // focus input
                setTimeout(function(){ document.getElementById('confirmDeleteInput').focus(); }, 50);
            }
        });

        document.getElementById('confirmDeleteInput').addEventListener('input', function(e){
            var expected = document.getElementById('deleteWorkspaceName').textContent || '';
            document.getElementById('confirmDeleteBtn').disabled = (e.target.value.trim() !== expected.trim());
        });

        document.getElementById('confirmDeleteBtn').addEventListener('click', function(){
            if (!window._deleteForm) return closeDeleteModal();
            // submit the stored form
            window._deleteForm.submit();
        });
    </script>
    
</body>
</html>
<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Ensure workspaces table exists
$con->exec("CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY)");
// No display labels table: use workspace names directly

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

                // Delete all entries for this workspace (including trashed notes)
                $selectEntries = $con->prepare('SELECT id, attachments FROM entries WHERE workspace = ?');
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

                    // Delete entry HTML export file if present (entries are stored under data/entries/<id>.html)
                    if (!empty($entry['id'])) {
                        $htmlFile = rtrim($entriesPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $entry['id'] . '.html';
                        if (file_exists($htmlFile)) {
                            @unlink($htmlFile);
                        }
                    }
                }

                // Remove entries rows from DB
                $delEntries = $con->prepare('DELETE FROM entries WHERE workspace = ?');
                $delEntries->execute([$name]);

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

                // Finally remove workspace record
                $stmt = $con->prepare('DELETE FROM workspaces WHERE name = ?');
                $stmt->execute([$name]);

                $message = 'Workspace deleted and all associated notes, folders and attachments removed';
                // If this was a non-AJAX delete, instruct client to clear selected workspace (so UI doesn't keep showing deleted workspace)
                $clearSelectedWorkspace = true;
        } elseif (isset($_POST['action']) && $_POST['action'] === 'rename') {
            $name = trim($_POST['name'] ?? '');
            $new_name = trim($_POST['new_name'] ?? '');
            $label = trim($_POST['label'] ?? '');
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

                    // no label handling - workspace display uses name only

                    $con->commit();
                    $message = 'Workspace renamed across notes and labels';
                    // Also, if a display label provided, store it for the new name below
                    $name = $new_name;
                } catch (Exception $e) {
                    $con->rollBack();
                    throw $e;
                }
            }

            // Do not store display label: only the workspace name is used

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

            // Move folders scope
            $updF = $con->prepare('UPDATE folders SET workspace = ? WHERE workspace = ?');
            $updF->execute([$target, $name]);

            // no label handling - workspace display uses name only

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

// No display labels table: use workspace names for display

?>
<!DOCTYPE html>
<html>
<head>
    <title>Manage Workspaces - Poznote</title>
    <!-- Emergency JS files removed: not present in repository -->
    <style id="workspaces-mobile-emergency-fix">
        @media (max-width: 800px) {
            body, html {
                overflow: auto !important;
                overflow-y: scroll !important;
                overflow-x: hidden !important;
                height: auto !important;
                min-height: 100vh !important;
                position: static !important;
                -webkit-overflow-scrolling: touch !important;
                max-height: none !important;
            }
        }
    </style>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/modal.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
    <link rel="stylesheet" href="css/ai.css">
    <!-- Use existing mobile stylesheet for manage workspaces -->
    <link rel="stylesheet" href="css/manage-workspaces-mobile.css" media="(max-width: 800px)">
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
        @media (max-width:720px) {
            .workspace-list ul li { flex-wrap: wrap; }
            .workspace-list .btn { min-width: 100px; }
            /* Allow buttons inside modals or narrow containers to shrink */
            .modal .workspace-list .btn,
            .modal .workspace-list .action-btn,
            .modal .btn { min-width: 0 !important; max-width: 100% !important; }
        }
    </style>
</head>
<body>
    <div class="settings-container">
        <h1><i class="fas fa-layer-group"></i> Workspaces</h1>
        <p>Manage your workspaces. Create, delete or select a workspace to work in.</p>

        <a href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
        </a>

        <br><br>

        <!-- Top alert area: used for both server-side and client-side messages -->
        <div id="topAlert" style="<?php echo ($message || $error) ? '' : 'display:none;'; ?> margin-top:12px;" class="<?php echo $message ? 'alert alert-success' : ($error ? 'alert alert-danger' : ''); ?>">
            <?php if ($message): ?>
                <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($message); ?>
            <?php elseif ($error): ?>
                <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($error); ?>
            <?php endif; ?>
        </div>

        <div class="settings-section">
            <h3><i class="fas fa-plus"></i> Create a new workspace</h3>
            <form id="create-workspace-form" method="POST" onsubmit="return validateCreateWorkspaceForm();">
                <input type="hidden" name="action" value="create">
                <div class="form-group">
                    <input id="workspace-name" name="name" type="text" placeholder="Enter workspace name" />
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Create</button>
            </form>
        </div>

        <div class="settings-section">
            <h3><i class="fas fa-list"></i> Existing workspaces</h3>
            <div class="workspace-list">
                <?php if (empty($workspaces)): ?>
                    <div>No workspaces defined.</div>
                <?php else: ?>
                    <ul>
                        <?php foreach ($workspaces as $ws): ?>
                                <?php
                                // display uses workspace name only
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

    <div id="ajaxAlert" style="display:none; margin-top:12px;"></div>
    <div style="padding-bottom: 50px;"></div>
    </div>

    <?php if (!empty($clearSelectedWorkspace) && !$isAjax): ?>
    <script>
        try { localStorage.setItem('poznote_selected_workspace', 'Poznote'); } catch(e) {}
        try { window.location = 'index.php?workspace=Poznote'; } catch(e) {}
    </script>
    <?php endif; ?>

    <!-- Move notes modal -->
    <div id="moveNotesModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeMoveModal()">&times;</span>
            <h3>Move notes from <span id="moveSourceName"></span></h3>
            <div class="form-group">
                <label for="moveTargetSelect">Select target workspace</label>
                <select id="moveTargetSelect">
                    <?php foreach ($workspaces as $w): if ($w !== $ws): ?>
                        <option value="<?php echo htmlspecialchars($w, ENT_QUOTES); ?>"><?php echo htmlspecialchars($w); ?></option>
                    <?php endif; endforeach; ?>
                </select>
            </div>
            <div style="margin-top:12px;">
                <button id="confirmMoveBtn" class="btn btn-primary">Move notes</button>
                <button onclick="closeMoveModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeMoveModal(){ document.getElementById('moveNotesModal').style.display = 'none'; }
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
                    try { document.getElementById('confirmMoveBtn').disabled = true; } catch(e) {}
                    var params = new URLSearchParams({ action: 'move_notes', name: source, target: target });
                    fetch('manage_workspaces.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type':'application/x-www-form-urlencoded',
                            'X-Requested-With':'XMLHttpRequest',
                            'Accept':'application/json'
                        },
                        body: params.toString()
                    })
                    .then(function(resp){ return resp.json(); })
                    .then(function(json){
                        // Re-enable button
                        try { document.getElementById('confirmMoveBtn').disabled = false; } catch(e) {}
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
                            // Close the modal on success
                            try { closeMoveModal(); } catch(e) {}
                        } else {
                            showAjaxAlert('Error: ' + (json.error || 'Unknown'), 'danger');
                        }
                    }).catch(function(){
                        try { document.getElementById('confirmMoveBtn').disabled = false; } catch(e) {}
                        showAjaxAlert('Error moving notes', 'danger');
                    });
                };
            }
        });

            function showAjaxAlert(msg, type) {
                // Prefer topAlert if available so messages appear in the same place as server messages
                if (typeof showTopAlert === 'function') {
                    showTopAlert(msg, type === 'success' ? 'success' : 'danger');
                    return;
                }
                var el = document.getElementById('ajaxAlert');
                el.style.display = 'block';
                el.className = 'alert alert-' + (type === 'success' ? 'success' : 'danger');
                el.innerHTML = msg;
                // auto-hide after 4s
                setTimeout(function(){ el.style.display = 'none'; }, 4000);
            }

    // Build map of workspace -> label (so JS can update header immediately)
        var workspaceDisplayMap = <?php
            $display_map = [];
            foreach ($workspaces as $w) {
                if (isset($labels[$w]) && $labels[$w] !== '') {
                    $display_map[$w] = $labels[$w];
                } else {
                    $display_map[$w] = ($w === 'Poznote') ? 'Poznote' : $w;
                }
            }
            echo json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
        ?>;

        // When clicking the Select button in the list, store in localStorage, update header and navigate
        document.addEventListener('click', function(e) {
            if (e.target && e.target.classList && e.target.classList.contains('btn-select')) {
                var name = e.target.getAttribute('data-ws');
                if (!name) return;
                try { localStorage.setItem('poznote_selected_workspace', name); } catch(err) {}
                try {
                    var leftHeader = document.querySelector('.left-header-text'); if (leftHeader) leftHeader.textContent = name;
                } catch(err) {}
                // navigate to main notes page with workspace filter
                window.location = 'index.php?workspace=' + encodeURIComponent(name);
            }
        });

        // Validation: only allow letters, digits, dash and underscore
        function isValidWorkspaceName(name) {
            return /^[A-Za-z0-9_-]+$/.test(name);
        }

        function validateCreateWorkspaceForm(){
            var el = document.getElementById('workspace-name');
            if (!el) return true;
            var v = el.value.trim();
            if (v === '') { showTopAlert('Enter a workspace name', 'danger'); scrollToTopAlert(); return false; }
            if (!isValidWorkspaceName(v)) { showTopAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger'); scrollToTopAlert(); return false; }
            return true;
        }
        
        // Helper to display messages in the top alert container (same place as server-side messages)
        function showTopAlert(message, type) {
            var el = document.getElementById('topAlert');
            if (!el) return showAjaxAlert(message, type === 'danger' ? 'danger' : (type === 'error' ? 'danger' : 'success'));
            el.style.display = 'block';
            el.className = 'alert ' + (type === 'danger' || type === 'error' ? 'alert-danger' : 'alert-success');
            var icon = (type === 'danger' || type === 'error') ? '<i class="fas fa-exclamation-triangle"></i> ' : '<i class="fas fa-check-circle"></i> ';
            el.innerHTML = icon + message;
            // auto-hide for success messages after 3s
            if (!(type === 'danger' || type === 'error')) {
                setTimeout(function(){ el.style.display = 'none'; }, 3000);
            }
        }

        function scrollToTopAlert(){
            try { var el = document.getElementById('topAlert'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
        }
    </script>
    <!-- Rename modal -->
    <div id="renameModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeRenameModal()">&times;</span>
            <h3>Rename workspace <span id="renameSource"></span></h3>
            <div class="form-group">
                <label for="renameNewName">New name</label>
                <input id="renameNewName" type="text" />
            </div>
            <div style="margin-top:12px;">
                <button id="confirmRenameBtn" class="btn btn-primary">Rename</button>
                <button onclick="closeRenameModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeRenameModal(){ document.getElementById('renameModal').style.display = 'none'; }
        document.addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('btn-rename')){
                var source = e.target.getAttribute('data-ws');
                document.getElementById('renameSource').textContent = source;
                document.getElementById('renameNewName').value = source;
                document.getElementById('renameModal').style.display = 'flex';
                document.getElementById('confirmRenameBtn').onclick = function(){
                    var newName = document.getElementById('renameNewName').value.trim();
                    if (!newName) return alert('Enter a new name');
                    // client-side validation: allow letters/digits/-/_ only
                    if (!/^[A-Za-z0-9_-]+$/.test(newName)) { showAjaxAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger'); return; }
                    var params = new URLSearchParams({ action: 'rename', name: source, new_name: newName });
                    fetch('manage_workspaces.php', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded', 'X-Requested-With':'XMLHttpRequest', 'Accept':'application/json'}, body: params.toString() })
                        .then(r=>r.json()).then(function(resp){
                            if (resp && resp.success) {
                                showAjaxAlert('Workspace renamed', 'success');
                                // update the displayed list and left header
                                var btns = document.querySelectorAll('[data-ws="'+source+'"]');
                                btns.forEach(function(b){ b.setAttribute('data-ws', newName); });
                                // update the workspace name text node in the list
                                var spans = document.querySelectorAll('.workspace-name-item');
                                spans.forEach(function(s){ if (s.textContent === source) s.textContent = newName; });
                                try { localStorage.setItem('poznote_selected_workspace', newName); } catch(e) {}
                                var leftHeader = document.querySelector('.left-header-text'); if (leftHeader) leftHeader.textContent = newName;
                                closeRenameModal();
                            } else {
                                showAjaxAlert('Error: ' + (resp.error || 'unknown'), 'danger');
                            }
                        }).catch(function(){ showAjaxAlert('Network error', 'danger'); });
                };
            }
        });
    </script>
    <!-- Delete confirmation modal -->
    <div id="deleteModal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close" onclick="closeDeleteModal()">&times;</span>
            <h3>Confirm delete workspace <span id="deleteWorkspaceName"></span></h3>
            <p>Enter the workspace name to confirm deletion. All notes and folders will be permanently deleted and cannot be recovered.</p>
            <div class="form-group">
                <input id="confirmDeleteInput" type="text" placeholder="Type workspace name to confirm" />
            </div>
            <div style="margin-top:12px;">
                <button id="confirmDeleteBtn" class="btn btn-danger" disabled>Delete workspace</button>
                <button onclick="closeDeleteModal()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function closeDeleteModal(){ document.getElementById('deleteModal').style.display = 'none'; document.getElementById('confirmDeleteInput').value = ''; document.getElementById('confirmDeleteBtn').disabled = true; }
        document.addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('btn-delete')){
                var source = e.target.getAttribute('data-ws');
                // store the target form reference
                window._deleteForm = e.target.closest('form.delete-form');
                document.getElementById('deleteWorkspaceName').textContent = source;
                document.getElementById('confirmDeleteInput').value = '';
                document.getElementById('confirmDeleteBtn').disabled = true;
                document.getElementById('deleteModal').style.display = 'flex';
                // focus input
                setTimeout(function(){ document.getElementById('confirmDeleteInput').focus(); }, 50);
            }
        });

        document.getElementById('confirmDeleteInput').addEventListener('input', function(e){
            var expected = document.getElementById('deleteWorkspaceName').textContent || '';
            document.getElementById('confirmDeleteBtn').disabled = (e.target.value.trim() !== expected.trim());
        });

        document.getElementById('confirmDeleteBtn').addEventListener('click', function(){
            if (!window._deleteForm) return closeDeleteModal();
            // submit the stored form
            window._deleteForm.submit();
        });
    </script>
    
</body>
</html>
