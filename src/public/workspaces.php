<?php
/**
 * Actions of the workspace list: delete, rename, tags, color, order, move
 * notes, share and unshare, posted by js/workspaces-*.js and answered in
 * JSON. Creating a workspace is POST /api/v1/workspaces.
 *
 * The list itself is the Workspaces section of settings.php
 * (workspaces_section.php): this file used to be the page that displayed
 * it, and a link to it still lands on that section.
 */
require_once __DIR__ . '/../auth.php';
requireAuth();
requireActiveAccountOwner();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../settings_shell.php';
requireSettingsPassword();

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

// Ensure workspaces table exists
$con->exec("CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY)");

$message = '';

// Detect AJAX/JSON request (used throughout the file)
$isAjax = false;
if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') {
    $isAjax = true;
} elseif (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
    $isAjax = true;
}

// Handle the actions of the list
if ($_POST) {
    try {
        if (!function_exists('sanitizeWorkspaceShareAllowedUsers')) {
            // The accounts a workspace is shared with, posted as a JSON list
            // or a comma-separated string of user ids.
            function sanitizeWorkspaceShareAllowedUsers($rawValue): array {
                if (is_string($rawValue)) {
                    $rawValue = trim($rawValue);
                    if ($rawValue === '') {
                        return [];
                    }
                    $decoded = json_decode($rawValue, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $rawValue = $decoded;
                    } else {
                        $rawValue = array_filter(array_map('trim', explode(',', $rawValue)));
                    }
                }

                if (!is_array($rawValue)) {
                    return [];
                }

                return array_values(array_unique(array_filter(array_map('intval', $rawValue), function ($id) {
                    return $id > 0;
                })));
            }
        }

        if (isset($_POST['action']) && $_POST['action'] === 'delete') {
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

            // Get current workspace settings
            $currentDefaultWorkspace = null;
            $currentLastOpened = null;
            try {
                $settingsStmt = $con->prepare('SELECT key, value FROM settings WHERE key IN (?, ?)');
                $settingsStmt->execute(['default_workspace', 'last_opened_workspace']);
                while ($row = $settingsStmt->fetch(PDO::FETCH_ASSOC)) {
                    if ($row['key'] === 'default_workspace') {
                        $currentDefaultWorkspace = $row['value'];
                    } elseif ($row['key'] === 'last_opened_workspace') {
                        $currentLastOpened = $row['value'];
                    }
                }
            } catch (Exception $e) {
                // Settings table may not exist - ignore
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
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

            // Delete attachment files and snapshots of every note
        foreach ($entries as $entry) {
                deleteNoteFilesForGood((int) ($entry['id'] ?? 0), $entry['attachments'] ?? '');

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

            // Free note/folder share tokens in the master registry before the
            // rows are deleted (the ON DELETE CASCADE only removes the
            // shared_notes / shared_folders rows)
            try {
                require_once __DIR__ . '/../users/db_master.php';
                $tokStmt = $con->prepare('SELECT sn.note_id FROM shared_notes sn JOIN entries e ON e.id = sn.note_id WHERE e.workspace = ?');
                $tokStmt->execute([$name]);
                unregisterSharedLinksForNotes($con, $tokStmt->fetchAll(PDO::FETCH_COLUMN));

                $tokStmt = $con->prepare('SELECT sf.folder_id FROM shared_folders sf JOIN folders f ON f.id = sf.folder_id WHERE f.workspace = ?');
                $tokStmt->execute([$name]);
                unregisterSharedLinksForFolders($con, $tokStmt->fetchAll(PDO::FETCH_COLUMN));
            } catch (Exception $e) {
                // Non-fatal: don't block workspace deletion if share cleanup fails
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // Remove entries rows from DB
            $delEntries = $con->prepare('DELETE FROM entries WHERE workspace = ?');
        $delEntries->execute([$name]);

            // Additional cleanup: remove orphan files from the user's entries directory
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
                            error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
                        }
                    }
                }
            } catch (Exception $e) {
                // Non-fatal: don't block workspace deletion if cleanup fails
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // Remove folders scoped to this workspace
            try {
                $delFolders = $con->prepare('DELETE FROM folders WHERE workspace = ?');
                $delFolders->execute([$name]);
            } catch (Exception $e) {
                // Table may not exist - ignore
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // Remove any settings namespaced for this workspace (key format: something::workspace)
            try {
                $delSettings = $con->prepare("DELETE FROM settings WHERE key LIKE ?");
                $delSettings->execute(['%::' . $name]);
            } catch (Exception $e) {
                // non-fatal
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // The accounts it was shared with lose it (master.db workspace_shares)
            require_once __DIR__ . '/../users/db_master.php';
            deleteWorkspaceShares((int)$_SESSION['user_id'], $name);

            // Delete workspace backgrounds folder
            try {
                $currentUser = getCurrentUser();
                $user_id = $currentUser['id'];
                $sanitized_name = getWorkspaceBackgroundSegment($name);
                $workspace_backgrounds_dir = __DIR__ . '/../data/users/' . $user_id . '/backgrounds/' . $sanitized_name;
                
                if (is_dir($workspace_backgrounds_dir)) {
                    // Delete all files in the workspace backgrounds directory
                    $files = glob($workspace_backgrounds_dir . '/*');
                    foreach ($files as $file) {
                        if (is_file($file)) {
                            @unlink($file);
                        }
                    }
                    // Remove the directory itself
                    @rmdir($workspace_backgrounds_dir);
                }
            } catch (Exception $e) {
                // Non-fatal: don't block workspace deletion if background cleanup fails
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // Update workspace settings if necessary
        try {
                $resetStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                if ($currentDefaultWorkspace === $name) {
                    $resetStmt->execute(['default_workspace', '__last_opened__']);
                }
                if ($currentLastOpened === $name && $targetWorkspace) {
                    $resetStmt->execute(['last_opened_workspace', $targetWorkspace]);
                }
            } catch (Exception $e) {
                // If settings update fails, continue - it's not critical for workspace deletion
                error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
            }

            // Finally remove workspace record
            $stmt = $con->prepare('DELETE FROM workspaces WHERE name = ?');
            $stmt->execute([$name]);

            // notes_deleted, not notes_moved: this path destroys the notes,
            // unlike the REST endpoint which reassigns them.
            require_once __DIR__ . '/../ActivityLog.php';
            logActivity(ACTIVITY_WORKSPACE_DELETED, [
                'workspace' => $name,
                'notes_deleted' => count($entries),
            ]);

            $message = t('workspaces.messages.deleted_all', [], 'Workspace deleted and all associated notes, folders and attachments removed', $currentLang);
            // If this was an AJAX delete, return JSON response immediately
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'set_tags') {
            // Replace the tag list of a workspace (tags group workspaces on
            // the dashboard scope selector)
            $name = trim($_POST['name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));

            $workspaceCheck = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
            $workspaceCheck->execute([$name]);
            if ((int)$workspaceCheck->fetchColumn() === 0) {
                throw new Exception(t('api.errors.workspace_not_found', [], 'Workspace not found', $currentLang));
            }

            $tags = poznoteParseWorkspaceTags($_POST['tags'] ?? '');
            $upd = $con->prepare('UPDATE workspaces SET tags = ? WHERE name = ?');
            $upd->execute([poznoteSerializeWorkspaceTags($tags), $name]);

            $message = t('workspaces.tags.saved', [], 'Tags updated', $currentLang);
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message, 'name' => $name, 'tags' => $tags]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'set_color') {
            // Set or clear the color of a workspace (the dot marking its cards
            // on multi-workspace dashboard views). Same values as note
            // colors: a palette id or '#rrggbb'; empty clears.
            $name = trim($_POST['name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));

            $workspaceCheck = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
            $workspaceCheck->execute([$name]);
            if ((int)$workspaceCheck->fetchColumn() === 0) {
                throw new Exception(t('api.errors.workspace_not_found', [], 'Workspace not found', $currentLang));
            }

            $rawColor = trim((string)($_POST['color'] ?? ''));
            $color = $rawColor === '' ? null : normalizeStoredNoteColor($rawColor);
            if ($rawColor !== '' && $color === null) {
                throw new Exception(t('workspaces.color.invalid', [], 'Invalid color', $currentLang));
            }
            $upd = $con->prepare('UPDATE workspaces SET color = ? WHERE name = ?');
            $upd->execute([$color, $name]);

            $message = t('workspaces.color.saved', [], 'Color updated', $currentLang);
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message, 'name' => $name, 'color' => $color]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'reorder') {
            // Save the order the rows were arranged in with the up/down arrows.
            // The whole list is rewritten on every move, so the positions stay
            // 1..n whichever arrow was clicked. A workspace missing from the
            // list (created in another tab meanwhile) keeps its own value: at
            // 0 it sorts alphabetically after the arranged ones.
            $names = $_POST['names'] ?? [];
            if (!is_array($names)) {
                $names = [$names];
            }
            $names = array_values(array_filter(array_map(function ($value) {
                return trim((string)$value);
            }, $names), function ($value) {
                return $value !== '';
            }));

            if (empty($names)) {
                throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));
            }

            $upd = $con->prepare('UPDATE workspaces SET display_order = ? WHERE name = ?');
            $con->beginTransaction();
            try {
                $position = 0;
                foreach ($names as $orderedName) {
                    $position++;
                    $upd->execute([$position, $orderedName]);
                }
                $con->commit();
            } catch (Exception $e) {
                $con->rollBack();
                throw $e;
            }

            $message = t('workspaces.order.saved', [], 'Workspace order updated', $currentLang);
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'message' => $message, 'names' => $names]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'rename') {
            $name = trim($_POST['name'] ?? '');
            $new_name = trim($_POST['new_name'] ?? '');
            if ($name === '') throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));

            // validate new name characters
            if ($new_name !== '' && !preg_match('/^[\p{L}0-9 _-]+$/u', $new_name)) throw new Exception(t('workspaces.errors.invalid_new_name', [], 'Invalid new workspace name. Letters, numbers, spaces, dash and underscore are allowed.', $currentLang));

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

                    // The accounts it is shared with follow the new name
                    require_once __DIR__ . '/../users/db_master.php';
                    renameWorkspaceShares((int)$_SESSION['user_id'], $name, $new_name);

                    // Move entries to new workspace name
                    $upd = $con->prepare('UPDATE entries SET workspace = ? WHERE workspace = ?');
                    $upd->execute([$new_name, $name]);

                    // Move folders to new workspace name
                    $upd = $con->prepare('UPDATE folders SET workspace = ? WHERE workspace = ?');
                    $upd->execute([$new_name, $name]);

                    // Update workspace references in settings
                    try {
                        $updateSettingsStmt = $con->prepare('UPDATE settings SET value = ? WHERE key IN (?, ?) AND value = ?');
                        $updateSettingsStmt->execute([$new_name, 'default_workspace', 'last_opened_workspace', $name]);
                    } catch (Exception $e) {
                        // Non-fatal
                        error_log('workspaces: sanitizeWorkspaceShareAllowedUsers() failed: ' . $e->getMessage());
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
        } elseif (isset($_POST['action']) && $_POST['action'] === 'move_notes') {
            $name = trim($_POST['name'] ?? '');
            $target = trim($_POST['target'] ?? '');
            if ($name === '' || $target === '') throw new Exception(t('workspaces.errors.name_and_target_required', [], 'Workspace name and target required', $currentLang));
            if ($name === $target) throw new Exception(t('workspaces.errors.source_target_must_differ', [], 'Source and target workspaces must differ', $currentLang));

            // Ensure target exists; one created here starts unshared
            $ins = $con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
            $ins->execute([$target]);
            if ($ins->rowCount() > 0) {
                require_once __DIR__ . '/../users/db_master.php';
                forgetStaleWorkspaceShares((int)$_SESSION['user_id'], $target);
            }

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

            // Remap folder_id for moved notes to match folders in destination workspace,
            // preserving the full parent-child hierarchy.
            try {
                // Fetch all source folders with their hierarchy
                $sourceFolders = []; // id => [name, parent_id, icon, icon_color, display_order]
                $srcStmt = $con->prepare('SELECT id, name, parent_id, icon, icon_color, display_order FROM folders WHERE workspace = ? ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE');
                $srcStmt->execute([$name]);
                while ($row = $srcStmt->fetch(PDO::FETCH_ASSOC)) {
                    $sourceFolders[(int)$row['id']] = [
                        'name'       => $row['name'],
                        'parent_id'  => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
                        'icon'       => $row['icon'],
                        'icon_color' => $row['icon_color'],
                        'display_order' => (int)($row['display_order'] ?? 0),
                    ];
                }

                // Build a tree so we can insert parents before children
                $children = []; // parent_id => [child_ids...]
                $roots    = [];
                foreach ($sourceFolders as $srcId => $data) {
                    $pid = $data['parent_id'];
                    if ($pid === null || !isset($sourceFolders[$pid])) {
                        $roots[] = $srcId;
                    } else {
                        $children[$pid][] = $srcId;
                    }
                }

                // BFS order: roots first, then their children, etc.
                $ordered = [];
                $queue   = $roots;
                while (!empty($queue)) {
                    $cur = array_shift($queue);
                    $ordered[] = $cur;
                    if (!empty($children[$cur])) {
                        foreach ($children[$cur] as $childId) {
                            $queue[] = $childId;
                        }
                    }
                }

                $folderIdMap     = []; // source_id => target_id
                $insertFolder    = $con->prepare('INSERT OR IGNORE INTO folders (name, workspace, parent_id, icon, icon_color, display_order) VALUES (?, ?, ?, ?, ?, ?)');
                $getExistingId   = $con->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND (parent_id IS ? OR parent_id = ?)');
                $lastInsertStmt  = null;

                foreach ($ordered as $srcId) {
                    $data = $sourceFolders[$srcId];

                    // Map parent_id to the already-resolved target parent, or null for roots
                    $srcParentId   = $data['parent_id'];
                    $tgtParentId   = ($srcParentId !== null && isset($folderIdMap[$srcParentId]))
                                     ? $folderIdMap[$srcParentId]
                                     : null;

                    // Try to find an existing folder with same name + parent in target
                    $getExistingId->execute([$data['name'], $target, $tgtParentId, $tgtParentId]);
                    $existingId = $getExistingId->fetchColumn();

                    if ($existingId !== false) {
                        $folderIdMap[$srcId] = (int)$existingId;
                    } else {
                        $insertFolder->execute([$data['name'], $target, $tgtParentId, $data['icon'], $data['icon_color'], $data['display_order']]);
                        $newId = (int)$con->lastInsertId();
                        if ($newId > 0) {
                            $folderIdMap[$srcId] = $newId;
                        }
                    }
                }

                // Update folder_id for all moved entries
                $updFolderId = $con->prepare('UPDATE entries SET folder_id = ? WHERE folder_id = ? AND workspace = ?');
                foreach ($folderIdMap as $oldId => $newId) {
                    $updFolderId->execute([$newId, $oldId, $target]);
                }

                // Delete folders from source workspace
                $delFolders = $con->prepare('DELETE FROM folders WHERE workspace = ?');
                $delFolders->execute([$name]);
            } catch (Exception $e) {
                // Non-fatal: folder remapping failed but notes were moved
                error_log('Folder remapping failed during workspace move: ' . $e->getMessage());
            }

            $message = t('workspaces.messages.notes_moved_to', ['target' => htmlspecialchars($target)], 'Notes moved to {{target}}', $currentLang);

            // If an AJAX client requested JSON, return structured response and exit
            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode(['success' => true, 'moved' => $moved ?? 0, 'target' => $target]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'share_workspace') {
            // Share the workspace with named accounts of the instance, or
            // change who it is shared with. They open it from their own
            // workspace menu and edit it (auth.php, shared workspace scope).
            $name = trim($_POST['name'] ?? '');

            if ($name === '') {
                throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));
            }

            $workspaceCheck = $con->prepare('SELECT name FROM workspaces WHERE name = ? LIMIT 1');
            $workspaceCheck->execute([$name]);
            if (!$workspaceCheck->fetch(PDO::FETCH_ASSOC)) {
                throw new Exception(t('workspaces.errors.not_found', [], 'Workspace not found', $currentLang));
            }

            // Under tenant isolation a non-admin must not be able to name
            // another account, even by posting raw ids past the hidden UI.
            if (!poznoteCanTargetOtherUsers()) {
                throw new Exception(t('workspaces.share.errors.not_allowed', [], 'Sharing with other users is not available on this instance', $currentLang));
            }

            require_once __DIR__ . '/../users/db_master.php';
            $ownerId = (int)$_SESSION['user_id'];
            $previousUserIds = getWorkspaceShareGranteesByWorkspace($ownerId)[$name] ?? [];
            $wantedUserIds = sanitizeWorkspaceShareAllowedUsers($_POST['allowed_users'] ?? []);
            $sharedUserIds = setWorkspaceShareGrantees($ownerId, $name, $wantedUserIds);

            $usernamesById = [];
            foreach (getMasterConnection()->query('SELECT id, username FROM users')->fetchAll(PDO::FETCH_ASSOC) as $masterUser) {
                $usernamesById[(int)$masterUser['id']] = (string)$masterUser['username'];
            }
            $sharedUsernames = array_map(static fn(int $id): string => $usernamesById[$id] ?? ('User #' . $id), $sharedUserIds);

            require_once __DIR__ . '/../ActivityLog.php';
            if (!empty($sharedUserIds)) {
                logActivity(ACTIVITY_WORKSPACE_SHARED, [
                    'workspace' => $name,
                    'updated' => !empty($previousUserIds),
                    'users' => $sharedUsernames,
                ]);
                $message = t('workspaces.share.messages.saved', [], 'Workspace sharing updated', $currentLang);
            } else {
                if (!empty($previousUserIds)) {
                    logActivity(ACTIVITY_WORKSPACE_UNSHARED, ['workspace' => $name]);
                }
                $message = t('workspaces.share.messages.disabled', [], 'Workspace is no longer shared', $currentLang);
            }

            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode([
                    'success' => true,
                    'shared' => !empty($sharedUserIds),
                    'allowed_users' => $sharedUserIds,
                    'shared_with' => $sharedUsernames,
                    'message' => $message,
                ]);
                exit;
            }
        } elseif (isset($_POST['action']) && $_POST['action'] === 'unshare_workspace') {
            $name = trim($_POST['name'] ?? '');
            if ($name === '') {
                throw new Exception(t('workspaces.errors.name_required', [], 'Workspace name required', $currentLang));
            }

            require_once __DIR__ . '/../users/db_master.php';
            $removed = deleteWorkspaceShares((int)$_SESSION['user_id'], $name);

            // Only log when a share actually existed: the UI can post this for
            // an already-unshared workspace.
            if ($removed > 0) {
                require_once __DIR__ . '/../ActivityLog.php';
                logActivity(ACTIVITY_WORKSPACE_UNSHARED, ['workspace' => $name]);
            }

            $message = t('workspaces.share.messages.disabled', [], 'Workspace is no longer shared', $currentLang);

            if (!empty($isAjax)) {
                header('Content-Type: application/json');
                echo json_encode([
                    'success' => true,
                    'shared' => false,
                    'allowed_users' => [],
                    'shared_with' => [],
                    'message' => $message,
                ]);
                exit;
            }
        }
    } catch (Exception $e) {
        if (!empty($isAjax)) {
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
    }
}

// Anything else is a page request (an old link, a bookmark, a form posted
// without the scripts): the list is in Settings. ?new=1 was the way to the
// creation field, the section opens the creation dialog instead.
$location = 'settings.php';
$query = [];
if ($pageWorkspace !== '' && $pageWorkspace !== '__last_opened__') {
    $query['workspace'] = $pageWorkspace;
}
if (($_GET['new'] ?? '') === '1') {
    $query['open'] = 'new-workspace';
}
if ($query !== []) {
    $location .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}
header('Location: ' . $location . '#section=' . POZNOTE_SETTINGS_WORKSPACES_SECTION, true, 303);
exit;
