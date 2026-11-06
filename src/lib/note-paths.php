<?php
/**
 * Addressing a note by its path: the folders it sits in, then its title.
 *
 * Issue #1738. A caller that knows where a note lives had to turn that into an
 * id first, with a listing and a client-side scan, before every single read.
 * A path is also stable where a cached id is not the other way round: renaming
 * a note breaks the path, moving a note keeps the id, and a caller that builds
 * paths ("Projects/Alpha/Status") holds no state at all.
 *
 * The two halves are matched the way the rest of the API already matches them:
 *
 *   - the folder part like create_note(folder=...): a slash path walks down
 *     from the root of the workspace, a bare name reaches a folder at any
 *     depth (issue #1374), and "Default" means the workspace root;
 *   - the title in full, like a [[Note Title]] link (issue #1614): the note
 *     called exactly that, never one whose title merely contains it.
 *
 * What is deliberately different from findNoteIdByTitle() in note-titles.php:
 * nothing is ever picked in silence. That function answers a link in the
 * editor, where guessing the most recently updated note of the name is better
 * than a dead link; a path is an address, and an address that two notes answer
 * to is a question for the caller, not a coin toss. So every match is returned
 * and the caller is asked to be more specific.
 */

require_once __DIR__ . '/search-text.php';

/** Most candidates listed when a path is ambiguous; a pathological title is not a useful answer. */
const POZNOTE_NOTE_PATH_MAX_CANDIDATES = 25;

/**
 * Split "Projects/Alpha/Status" into its folder segments and its title.
 *
 * The separator is not escapable, so a note or folder whose own name holds a
 * slash cannot be addressed this way: "Projects/2026/11/06" is read as the
 * folder Projects/2026/11 and the title "06", never as a note called
 * "2026/11/06". Those notes keep being addressed by id. An escape would have
 * to be invented here, and agents get `\/` wrong often enough that it is the
 * caller's id that is the safer answer.
 *
 * @return array{folder: string[], title: string}|null null when there is no title to look for
 */
function poznoteSplitNotePath(string $path): ?array {
    $segments = array_values(array_filter(
        array_map('trim', explode('/', $path)),
        static fn($segment) => $segment !== ''
    ));
    if ($segments === []) {
        return null;
    }

    $title = array_pop($segments);

    return ['folder' => $segments, 'title' => $title];
}

/**
 * Folder id => ['name' => string, 'parent_id' => int|null, 'workspace' => string]
 *
 * Loaded in one query rather than through getFolderPathSegments(), whose
 * static cache is built once per process: a second call with another database
 * would read the first one's folders.
 */
function poznoteLoadFolderMap(PDO $con): array {
    $map = [];
    $stmt = $con->query('SELECT id, name, parent_id, workspace FROM folders');
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $map[(int)$row['id']] = [
            'name' => (string)$row['name'],
            'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
            'workspace' => (string)$row['workspace'],
        ];
    }

    return $map;
}

/**
 * The names from the root down to this folder, [] for a note at the root.
 *
 * @param array<int, array{name: string, parent_id: int|null, workspace: string}> $folders
 * @return string[]
 */
function poznoteFolderSegmentsFromMap(array $folders, ?int $folderId): array {
    $segments = [];
    $current = $folderId;
    $depth = 0;
    while ($current !== null && isset($folders[$current]) && $depth < 50) {
        array_unshift($segments, $folders[$current]['name']);
        $current = $folders[$current]['parent_id'];
        $depth++;
    }

    return $segments;
}

/** Whether two path segments name the same thing, ignoring case and accents. */
function poznoteNotePathSegmentsMatch(string $left, string $right): bool {
    return poznoteFoldAccents(trim($left)) === poznoteFoldAccents(trim($right));
}

/**
 * Whether a note sitting in $actual answers to the folder part $wanted.
 *
 * @param string[] $actual  Segments of the folder the note is in, root first
 * @param string[] $wanted  Segments the caller gave, root first
 */
function poznoteNotePathFolderMatches(array $actual, array $wanted): bool {
    if ($wanted === []) {
        // A bare title addresses the note wherever it sits.
        return true;
    }

    if (count($wanted) === 1) {
        // "Default" is what the UI calls the root of a workspace, and
        // resolveFolderPathToId() already reads it as "no folder".
        if (poznoteFoldAccents($wanted[0]) === 'default') {
            return $actual === [];
        }

        // A bare name reaches a folder at any depth (issue #1374).
        return $actual !== [] && poznoteNotePathSegmentsMatch(end($actual), $wanted[0]);
    }

    if (count($actual) !== count($wanted)) {
        return false;
    }
    foreach ($wanted as $index => $segment) {
        if (!poznoteNotePathSegmentsMatch($actual[$index], $segment)) {
            return false;
        }
    }

    return true;
}

/**
 * Resolve a note path to the note it addresses.
 *
 * Needs the remove_accents() SQL function of db_connect.php.
 *
 * @param string      $path      "folder/sub/Title", or just "Title"
 * @param string|null $workspace The workspace to look in, null for every one of them
 * @return array{status: string, note?: array, candidates?: array, folder?: string, title?: string}
 *         status is 'ok', 'empty_path', 'not_found' or 'ambiguous'
 */
function poznoteResolveNotePath(PDO $con, string $path, ?string $workspace = null): array {
    $parts = poznoteSplitNotePath($path);
    if ($parts === null) {
        return ['status' => 'empty_path'];
    }

    $title = $parts['title'];
    $wantedFolder = $parts['folder'];

    $sql = 'SELECT id, heading, folder_id, workspace, updated FROM entries'
        . ' WHERE trash = 0 AND trim(remove_accents(heading)) = ?';
    $params = [poznoteFoldAccents($title)];
    if ($workspace !== null && $workspace !== '') {
        $sql .= ' AND workspace = ?';
        $params[] = $workspace;
    }
    $sql .= ' ORDER BY updated DESC, id DESC';

    $stmt = $con->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $folders = $rows ? poznoteLoadFolderMap($con) : [];

    $matches = [];
    foreach ($rows as $row) {
        $folderId = $row['folder_id'] !== null ? (int)$row['folder_id'] : null;
        $segments = poznoteFolderSegmentsFromMap($folders, $folderId);
        if (!poznoteNotePathFolderMatches($segments, $wantedFolder)) {
            continue;
        }

        $matches[] = [
            'id' => (int)$row['id'],
            'title' => (string)$row['heading'],
            'segments' => $segments,
            'folder' => $segments === [] ? null : implode('/', $segments),
            'workspace' => (string)$row['workspace'],
            'updated' => $row['updated'],
        ];
    }

    // Several matches means the path is not an address on its own: a bare
    // title carried in more than one folder, a bare folder name several
    // folders answer to, or the same path in two workspaces. One case is
    // settled rather than refused: a folder at the root of its workspace wins
    // over the same name deeper down, as resolveFolderPathToId() has always
    // done.
    if (count($matches) > 1 && count($wantedFolder) === 1) {
        $atRoot = array_values(array_filter(
            $matches,
            static fn(array $match) => count($match['segments']) === 1
        ));
        if (count($atRoot) === 1) {
            $matches = $atRoot;
        }
    }

    if ($matches === []) {
        return [
            'status' => 'not_found',
            'folder' => $wantedFolder === [] ? null : implode('/', $wantedFolder),
            'title' => $title,
        ];
    }

    if (count($matches) > 1) {
        $candidates = array_slice($matches, 0, POZNOTE_NOTE_PATH_MAX_CANDIDATES);
        return [
            'status' => 'ambiguous',
            'title' => $title,
            'total' => count($matches),
            'candidates' => array_map(
                static fn(array $match) => [
                    'id' => $match['id'],
                    'title' => $match['title'],
                    'folder' => $match['folder'],
                    'workspace' => $match['workspace'],
                    'path' => ($match['folder'] !== null ? $match['folder'] . '/' : '') . $match['title'],
                ],
                $candidates
            ),
        ];
    }

    $note = $matches[0];

    return [
        'status' => 'ok',
        'note' => [
            'id' => $note['id'],
            'heading' => $note['title'],
            'workspace' => $note['workspace'],
            'folder' => $note['folder'],
            'path' => ($note['folder'] !== null ? $note['folder'] . '/' : '') . $note['title'],
        ],
    ];
}
