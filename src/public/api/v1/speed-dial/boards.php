<?php
/**
 * Speed dials of a workspace (public/speed_dial.php): POST creates one, PATCH
 * renames it, DELETE removes it. A speed dial is a tag, so its notes are the
 * notes carrying it: deleting one takes the tag away and leaves the notes. The
 * default one, the tag speed-dial, can be neither renamed nor deleted.
 */

require_once __DIR__ . '/../../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../../db_connect.php';
require_once __DIR__ . '/../../../../functions.php';
require_once __DIR__ . '/../../../../lib/speed-dial.php';

header('Content-Type: application/json');

function speedDialBoardsFail(string $message, int $status, ?string $code = null): void {
    http_response_code($status);
    echo json_encode(array_filter(['success' => false, 'error' => $message, 'code' => $code], static fn($v) => $v !== null));
    exit;
}

/** The registered list, written back with $tag out of it and $add in it. */
function speedDialBoardsRegister(PDO $con, string $workspace, ?string $remove, ?string $add): void {
    $key = 'speed_dial_boards_' . $workspace;
    $stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
    $stmt->execute([$key]);
    $list = json_decode((string)$stmt->fetchColumn(), true);
    $list = is_array($list) ? $list : [];
    if ($remove !== null) {
        $list = array_values(array_filter($list, static fn($tag) => mb_strtolower((string)$tag, 'UTF-8') !== mb_strtolower($remove, 'UTF-8')));
    }
    if ($add !== null) $list[] = $add;
    $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")->execute([$key, json_encode($list, JSON_UNESCAPED_UNICODE)]);
}

/** Replaces a tag on the notes of the workspace, trashed ones included: they can come back. */
function speedDialBoardsRetag(PDO $con, string $workspace, string $tag, ?string $newTag): int {
    $stmt = $con->prepare("SELECT id, tags FROM entries WHERE workspace = ? AND tags LIKE ?");
    $stmt->execute([$workspace, '%' . $tag . '%']);
    $update = $con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ?");
    $actor = (int)(getAuthenticatedUserId() ?? getCurrentUserId() ?? 0);
    $changed = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $note) {
        $tags = array_map('trim', explode(',', (string)$note['tags']));
        $next = [];
        foreach ($tags as $current) {
            if (mb_strtolower($current, 'UTF-8') !== mb_strtolower($tag, 'UTF-8')) {
                $next[] = $current;
            } elseif ($newTag !== null) {
                $next[] = $newTag;
            }
        }
        if ($next !== $tags) {
            $update->execute([implode(', ', array_values(array_unique($next))), $actor, (int)$note['id']]);
            $changed++;
        }
    }
    return $changed;
}

/** The image and the opacity of a speed dial follow its new tag, or go with it. */
function speedDialBoardsMoveBackground(PDO $con, string $workspace, string $tag, ?string $newTag): void {
    $key = poznoteSpeedDialBackgroundKey($tag);
    $dir = __DIR__ . '/../../../../data/users/' . (int)(getCurrentUser()['id'] ?? 0) . '/backgrounds/' . getWorkspaceBackgroundSegment($workspace);
    foreach (glob($dir . '/speed-dial-' . $key . '.*') ?: [] as $file) {
        if ($newTag === null) {
            @unlink($file);
        } else {
            @rename($file, $dir . '/speed-dial-' . poznoteSpeedDialBackgroundKey($newTag) . '.' . pathinfo($file, PATHINFO_EXTENSION));
        }
    }
    $old = 'speed_dial_background_opacity_' . $workspace . '_' . $key;
    if ($newTag !== null) {
        $con->prepare("UPDATE settings SET key = ? WHERE key = ?")->execute(['speed_dial_background_opacity_' . $workspace . '_' . poznoteSpeedDialBackgroundKey($newTag), $old]);
    } else {
        $con->prepare("DELETE FROM settings WHERE key = ?")->execute([$old]);
    }
}

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['POST', 'PATCH', 'DELETE'], true)) {
    speedDialBoardsFail('Method not allowed', 405);
}
if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
    speedDialBoardsFail('Only the owner of the account can change its speed dials', 403);
}

$input = json_decode(file_get_contents('php://input'), true);
$input = is_array($input) ? $input : [];

try {
    $workspace = trim((string)($input['workspace'] ?? ''));
    $stmt = $con->prepare("SELECT 1 FROM workspaces WHERE name = ?");
    $stmt->execute([$workspace]);
    if ($workspace === '' || $stmt->fetchColumn() === false) {
        speedDialBoardsFail('Workspace not found', 404);
    }

    $boards = poznoteSpeedDialBoards($con, $workspace);
    $find = static function (string $tag) use ($boards): ?string {
        foreach ($boards as $board) {
            if (mb_strtolower($board, 'UTF-8') === mb_strtolower($tag, 'UTF-8')) return $board;
        }
        return null;
    };

    $newTag = null;
    if ($method !== 'DELETE') {
        $newTag = poznoteSpeedDialTagFromName((string)($input['name'] ?? ''));
        if ($newTag === null) {
            speedDialBoardsFail('Invalid speed dial name', 400, 'invalid_name');
        }
    }

    if ($method === 'POST') {
        if ($find($newTag) !== null) {
            speedDialBoardsFail('A speed dial with this name already exists', 409, 'exists');
        }
        speedDialBoardsRegister($con, $workspace, null, $newTag);
        echo json_encode(['success' => true, 'tag' => $newTag]);
        exit;
    }

    $tag = $find((string)($input['tag'] ?? ''));
    if ($tag === null) {
        speedDialBoardsFail('Speed dial not found', 404);
    }
    if (mb_strtolower($tag, 'UTF-8') === POZNOTE_SPEED_DIAL_TAG) {
        speedDialBoardsFail('The default speed dial cannot be changed', 400);
    }

    if ($method === 'PATCH') {
        $sameBoard = mb_strtolower($newTag, 'UTF-8') === mb_strtolower($tag, 'UTF-8');
        if (!$sameBoard && $find($newTag) !== null) {
            speedDialBoardsFail('A speed dial with this name already exists', 409, 'exists');
        }
    }

    $con->beginTransaction();
    $updated = speedDialBoardsRetag($con, $workspace, $tag, $newTag);
    speedDialBoardsRegister($con, $workspace, $tag, $newTag);
    $con->commit();
    if ($newTag === null || mb_strtolower($newTag, 'UTF-8') !== mb_strtolower($tag, 'UTF-8')) {
        speedDialBoardsMoveBackground($con, $workspace, $tag, $newTag);
    }
    echo json_encode(['success' => true, 'tag' => $newTag, 'updated' => $updated]);
} catch (Exception $e) {
    if ($con->inTransaction()) $con->rollBack();
    error_log('speed dial boards: ' . $e->getMessage());
    speedDialBoardsFail('Could not save the speed dial', 500);
}
