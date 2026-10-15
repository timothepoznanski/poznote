<?php
/**
 * Gestion du chargement et de la sélection des notes
 */

function normalizeNoteAgeFilterDays($value) {
    $days = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['default' => 0]]);
    if ($days < 1) {
        return 0;
    }

    return min($days, 36500);
}

function getNoteAgeFilterDays($con) {
    static $cachedDays = null;
    if ($cachedDays !== null) {
        return $cachedDays;
    }

    $cachedDays = 0;
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['note_age_filter_days']);
        $cachedDays = normalizeNoteAgeFilterDays($stmt->fetchColumn());
    } catch (Exception $e) {
        $cachedDays = 0;
    }

    return $cachedDays;
}

function getNoteAgeFilterCutoff($days) {
    $days = normalizeNoteAgeFilterDays($days);
    if ($days === 0) {
        return null;
    }

    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('-' . $days . ' days')
        ->format('Y-m-d H:i:s');
}

function appendNoteAgeFilter(&$where_clause, &$params, $days) {
    $cutoff = getNoteAgeFilterCutoff($days);
    if ($cutoff === null) {
        return;
    }

    $where_clause .= ' AND updated >= ?';
    $params[] = $cutoff;
}

/**
 * Determine the note to display and prepare queries
 */
function loadNoteData($con, &$note, $workspace_filter) {
    $default_note_folder = null;
    $res_right = null;
    $current_note_folder = null;
    
    if($note != '') {
        // If the note is not empty, it means we have just clicked on a note (now using ID)
        $note_id = intval($note);
        $note_where_clause = 'trash = 0 AND id = ? AND workspace = ?';
        $note_params = [$note_id, $workspace_filter];

        $stmt = $con->prepare("SELECT * FROM entries WHERE $note_where_clause");
        $stmt->execute($note_params);
        $note_data = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if($note_data) {
            // Check if this is a linked note - redirect to the target note
            if ($note_data['type'] === 'linked' && !empty($note_data['linked_note_id'])) {
                $linked_note_id = intval($note_data['linked_note_id']);
                $selected_linked_note_id = isset($_GET['select_linked_note']) ? intval($_GET['select_linked_note']) : $note_id;
                $redirect_params = [
                    'note=' . $linked_note_id,
                    'workspace=' . urlencode($workspace_filter),
                ];
                $redirect_url = 'index.php?' . implode('&', $redirect_params);
                if ($selected_linked_note_id > 0) {
                    $redirect_url .= "&select_linked_note=" . $selected_linked_note_id;
                }
                header("Location: " . $redirect_url);
                exit;
            }
            
            $current_note_folder = $note_data["folder"] ?: null;
            // Prepare result for right column (ensure it's in the workspace)
            $stmt_right = $con->prepare("SELECT * FROM entries WHERE $note_where_clause");
            $stmt_right->execute($note_params);
            $res_right = $stmt_right;
        } else {
            // If the requested note doesn't exist, display the last opened (or updated) note
            $note = ''; // Reset note to trigger showing latest note
            $latest_note_data = getLatestNote($con, $workspace_filter);
            $res_right = $latest_note_data['res_right'];
            $default_note_folder = $latest_note_data['default_note_folder'];
        }
    } else {
        // No specific note requested, check if we have notes to show the latest one
        $latest_note_data = getLatestNote($con, $workspace_filter);
        $res_right = $latest_note_data['res_right'];
        $default_note_folder = $latest_note_data['default_note_folder'];
    }
    
    return [
        'default_note_folder' => $default_note_folder,
        'current_note_folder' => $current_note_folder,
        'res_right' => $res_right
    ];
}

/**
 * Notes the account opened, most recent first, so a page load that names no
 * note lands on the last one opened rather than the last one edited: moving,
 * tagging or dismissing a recurring reminder edits a note nobody looked at
 * (issue #1630). One list for every workspace, each id with the workspace it
 * was opened in: that name still tells where the note was once it is moved
 * away or deleted for good, and the note's row tells where it is now, so
 * renaming a workspace needs no bookkeeping.
 */
const POZNOTE_RECENTLY_OPENED_NOTES_SETTING = 'recently_opened_notes';
const POZNOTE_RECENTLY_OPENED_NOTES_LIMIT = 50;

/**
 * The list belongs to the account owner: a session confined to a workspace
 * shared with it, or an administrator borrowing the account, neither writes
 * it nor lands on it.
 */
function poznoteUsesRecentlyOpenedNotes() {
    if (function_exists('isSharedWorkspaceScopeActive') && isSharedWorkspaceScopeActive()) {
        return false;
    }
    if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
        return false;
    }
    return true;
}

/**
 * @return array<int, array{id: int, workspace: string}>
 */
function poznoteRecentlyOpenedNotes($con) {
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute([POZNOTE_RECENTLY_OPENED_NOTES_SETTING]);
        $items = json_decode((string)$stmt->fetchColumn(), true);
    } catch (Exception $e) {
        return [];
    }
    if (!is_array($items)) {
        return [];
    }

    $notes = [];
    foreach ($items as $item) {
        $id = (int)(is_array($item) ? ($item[0] ?? 0) : 0);
        if ($id > 0) {
            $notes[] = ['id' => $id, 'workspace' => (string)($item[1] ?? '')];
        }
    }
    return $notes;
}

/**
 * Put a note at the head of the list. Opening the note already there writes
 * nothing, which is the common case of a note reloaded or reopened.
 */
function poznoteRememberOpenedNote($con, $noteId, $workspace) {
    $noteId = (int)$noteId;
    if ($noteId <= 0 || !poznoteUsesRecentlyOpenedNotes()) {
        return;
    }

    $notes = poznoteRecentlyOpenedNotes($con);
    if (($notes[0]['id'] ?? 0) === $noteId && $notes[0]['workspace'] === (string)$workspace) {
        return;
    }

    $items = [[$noteId, (string)$workspace]];
    foreach ($notes as $note) {
        if ($note['id'] !== $noteId && count($items) < POZNOTE_RECENTLY_OPENED_NOTES_LIMIT) {
            $items[] = [$note['id'], $note['workspace']];
        }
    }

    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $stmt->execute([POZNOTE_RECENTLY_OPENED_NOTES_SETTING, json_encode($items, JSON_UNESCAPED_UNICODE)]);
        if (function_exists('poznoteResetSettingsCache')) {
            poznoteResetSettingsCache();
        }
    } catch (Exception $e) {
        error_log('note_loader: poznoteRememberOpenedNote() failed: ' . $e->getMessage());
    }
}

/**
 * The last note opened in the workspace: its id when the notes list still
 * shows it, 0 when it is gone (trashed, deleted, moved to another workspace,
 * older than the note age filter), which leaves the pane empty rather than
 * bringing up an older note, and null when nothing was opened there yet.
 */
function getLastOpenedNoteId($con, $workspace_filter) {
    if (!poznoteUsesRecentlyOpenedNotes()) {
        return null;
    }

    $notes = poznoteRecentlyOpenedNotes($con);
    if (empty($notes)) {
        return null;
    }

    $ids = array_column($notes, 'id');
    try {
        $stmt = $con->prepare('SELECT id, workspace, trash, updated FROM entries WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $stmt->execute($ids);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rows[(int)$row['id']] = $row;
        }
    } catch (Exception $e) {
        return null;
    }

    $cutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($con));
    foreach ($notes as $note) {
        // Opened here (a note since moved away or deleted) or living here
        // now (opened before the workspace was renamed).
        $row = $rows[$note['id']] ?? null;
        $isHere = $row !== null && (string)$row['workspace'] === (string)$workspace_filter;
        if (!$isHere && $note['workspace'] !== (string)$workspace_filter) {
            continue;
        }
        if (!$isHere || (int)$row['trash'] !== 0 || ($cutoff !== null && (string)$row['updated'] < $cutoff)) {
            return 0;
        }
        return $note['id'];
    }
    return null;
}

/**
 * The note a page load lands on when it names none: the last one opened in
 * the workspace, none when that note is gone, and the last one updated when
 * nothing was opened there yet.
 */
function getLatestNote($con, $workspace_filter) {
    $last_opened_id = getLastOpenedNoteId($con, $workspace_filter);
    if ($last_opened_id === 0) {
        return [
            'res_right' => null,
            'default_note_folder' => null
        ];
    }
    if ($last_opened_id !== null) {
        $stmt = $con->prepare('SELECT folder FROM entries WHERE id = ?');
        $stmt->execute([$last_opened_id]);
        $folder = $stmt->fetchColumn();

        $stmt_right = $con->prepare('SELECT * FROM entries WHERE id = ?');
        $stmt_right->execute([$last_opened_id]);
        return [
            'res_right' => $stmt_right,
            'default_note_folder' => $folder ?: null
        ];
    }

    $where_clause = 'trash = 0 AND workspace = ?';
    $params = [$workspace_filter];
    appendNoteAgeFilter($where_clause, $params, getNoteAgeFilterDays($con));

    $check_stmt = $con->prepare("SELECT COUNT(*) as note_count FROM entries WHERE $where_clause");
    $check_stmt->execute($params);
    $note_count = $check_stmt->fetch(PDO::FETCH_ASSOC)['note_count'];
    
    $res_right = null;
    $default_note_folder = null;
    
    if ($note_count > 0) {
        // Show the most recently updated note in the selected workspace
        $stmt_right = $con->prepare("SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1");
        $stmt_right->execute($params);
        $latest_note = $stmt_right->fetch(PDO::FETCH_ASSOC);
        
        if ($latest_note) {
            $default_note_folder = $latest_note["folder"] ?: null;
            // Re-execute query so $res_right is a fresh PDOStatement for the display loop
            // (PDO cursors cannot be reset after fetch)
            $stmt_right = $con->prepare("SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1");
            $stmt_right->execute($params);
            $res_right = $stmt_right;
        }
    }
    
    return [
        'res_right' => $res_right,
        'default_note_folder' => $default_note_folder
    ];
}

/**
 * Prépare les requêtes pour les résultats de recherche
 */
function prepareSearchResults($con, $is_search_mode, &$note, $where_clause, $search_params, $workspace_filter) {
    $res_right = null;
    
    if ($is_search_mode) {
        // If a specific note is selected, show that note instead of the most recent one
        if (!empty($note)) {
            // Build query to show the selected note if it matches search criteria
            $where_clause_with_note = $where_clause . " AND id = ?";
            $search_params_with_note = array_merge($search_params, [intval($note)]);
            
            $query_right_with_note = "SELECT * FROM entries WHERE $where_clause_with_note LIMIT 1";
            
            $stmt_right = $con->prepare($query_right_with_note);
            $stmt_right->execute($search_params_with_note);
            $selected_note_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
            
            if ($selected_note_result) {
                $note = $selected_note_result['id'];
                // Re-execute: PDO cursors cannot be reset after fetch
                $stmt_right = $con->prepare($query_right_with_note);
                $stmt_right->execute($search_params_with_note);
                $res_right = $stmt_right;
            } else {
                // Selected note doesn't match search criteria, show most recent matching note
                $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
                $stmt_right = $con->prepare($query_right_secure);
                $stmt_right->execute($search_params);
                $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
                if ($search_result) {
                    $note = $search_result['id'];
                    // Re-execute: PDO cursors cannot be reset after fetch
                    $stmt_right = $con->prepare($query_right_secure);
                    $stmt_right->execute($search_params);
                    $res_right = $stmt_right;
                } else {
                    $res_right = null; // No results found
                }
            }
        } else {
            // No specific note selected, show most recent matching note
            $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
            $stmt_right = $con->prepare($query_right_secure);
            $stmt_right->execute($search_params);
            $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
            if ($search_result) {
                $note = $search_result['id'];
                // Re-execute: PDO cursors cannot be reset after fetch
                $stmt_right = $con->prepare($query_right_secure);
                $stmt_right->execute($search_params);
                $res_right = $stmt_right;
            } else {
                $res_right = null; // No results found
            }
        }
    }
    
    return $res_right;
}
