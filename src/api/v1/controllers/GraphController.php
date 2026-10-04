<?php
/**
 * Graph Controller
 *
 * Returns the complete note-link graph (nodes + edges) for a workspace,
 * used by the visual graph view (graph.php).
 *
 * Edge detection mirrors BacklinksController and supports the three
 * link formats written by the editor:
 *   1. HTML internal link attribute  — data-note-id="{id}"
 *   2. URL-based link                — ?note={id} or &note={id}
 *   3. Wiki-link syntax              — [[Note Title]]
 *
 * The folders holding those notes come back next to them, so the view can
 * draw each folder as a hub linked to its notes and to its parent folder.
 *
 * A note or a folder whose icon was customised in the sidebar carries that
 * icon, which the view draws in place of the dot.
 *
 * Each note carries its tags, which the search field of the view matches
 * next to the titles.
 *
 * The view opens on the most recently modified notes only (?limit=), so a
 * large workspace does not read every note file before anything shows.
 */
require_once __DIR__ . '/../../../note_loader.php';

class GraphController
{
    private PDO $con;

    public function __construct(PDO $con)
    {
        $this->con = $con;
    }


    // -------------------------------------------------------------------------
    // Public actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/v1/graph
     *
     * Returns every non-trash note of the workspace as a node, plus one edge
     * per (source, target) pair of linked notes, and the folders those notes
     * sit in. With ?limit=N the graph is cut down to the N notes modified
     * last; `total` tells how many notes the workspace holds.
     */
    public function index(): void
    {
        try {
            $workspace = '';
            if (isset($_GET['workspace']) && is_string($_GET['workspace'])) {
                $workspace = trim($_GET['workspace']);
            }

            $limit = 0; // 0 = every note
            if (isset($_GET['limit']) && is_scalar($_GET['limit'])) {
                $limit = max(0, (int) $_GET['limit']);
            }

            $sql = "SELECT id, heading, type, folder, folder_id, favorite, tags, icon, icon_color,
                           COALESCE(updated, created) AS modified
                      FROM entries
                     WHERE trash = 0
                       AND type IN ('note', 'markdown', 'tasklist')";
            $params = [];
            if ($workspace !== '') {
                $sql .= ' AND workspace = ?';
                $params[] = $workspace;
            }

            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $folderRows = $this->loadFolders($workspace);

            // --- Wiki-links resolve against every note of the workspace, so
            // a title leads to the same note whatever the limit
            $headingMap = []; // lowercased heading => note id (first wins)
            foreach ($rows as $row) {
                $heading = (string) ($row['heading'] ?? '');
                if ($heading !== '') {
                    $key = mb_strtolower($heading);
                    if (!isset($headingMap[$key])) {
                        $headingMap[$key] = (int) $row['id'];
                    }
                }
            }

            $total = count($rows);
            $rows  = $this->mostRecent($rows, $limit);

            // --- Build nodes and lookup tables
            $nodes = [];
            $idSet = [];

            foreach ($rows as $row) {
                $id      = (int) $row['id'];
                $heading = (string) ($row['heading'] ?? '');

                // The folders table is authoritative: the legacy folder text
                // column stays empty for notes filed by folder_id alone.
                $folderId = (int) ($row['folder_id'] ?? 0);
                if (!isset($folderRows[$folderId])) {
                    $folderId = 0;
                }
                $folderName = $folderId !== 0
                    ? $folderRows[$folderId]['name']
                    : (string) ($row['folder'] ?? '');

                $nodes[] = [
                    'id'        => $id,
                    'title'     => $heading !== '' ? $heading : 'Untitled',
                    'folder'    => $folderName,
                    'folder_id' => $folderId !== 0 ? $folderId : null,
                    'type'      => (string) $row['type'],
                    'favorite'  => (int) ($row['favorite'] ?? 0) === 1,
                    'tags'      => $this->tagList((string) ($row['tags'] ?? '')),
                ] + $this->customIcon($row, defaultNoteIconForType($row['type']));

                $idSet[$id] = true;
            }

            // --- Scan each note's content file for links to other notes
            $entriesPath = getEntriesPath();
            $edges       = [];
            $seen        = [];

            foreach ($rows as $row) {
                $sourceId = (int) $row['id'];
                $ext      = ($row['type'] === 'markdown') ? '.md' : '.html';
                $filePath = $entriesPath . '/' . $sourceId . $ext;

                if (!is_file($filePath)) {
                    continue;
                }
                $content = @file_get_contents($filePath);
                if ($content === false || $content === '') {
                    continue;
                }

                $targets = [];

                // 1. HTML internal-link attribute: data-note-id="123"
                if (preg_match_all('/data-note-id="(\d+)"/', $content, $m)) {
                    foreach ($m[1] as $t) {
                        $targets[(int) $t] = true;
                    }
                }

                // 2. URL-based link: ?note=123 or &note=123
                if (preg_match_all('/[?&]note=(\d+)/', $content, $m)) {
                    foreach ($m[1] as $t) {
                        $targets[(int) $t] = true;
                    }
                }

                // 3. Wiki-link syntax: [[Note Title]]
                if (preg_match_all('/\[\[([^\[\]]+)\]\]/', $content, $m)) {
                    foreach ($m[1] as $title) {
                        $key = mb_strtolower(trim($title));
                        if ($key !== '' && isset($headingMap[$key])) {
                            $targets[$headingMap[$key]] = true;
                        }
                    }
                }

                foreach (array_keys($targets) as $targetId) {
                    // Skip self-links and links to notes outside the node set
                    // (trashed, other workspace, linked-type notes, beyond the limit)
                    if ($targetId === $sourceId || !isset($idSet[$targetId])) {
                        continue;
                    }
                    $pairKey = $sourceId . '>' . $targetId;
                    if (isset($seen[$pairKey])) {
                        continue;
                    }
                    $seen[$pairKey] = true;
                    $edges[] = ['source' => $sourceId, 'target' => $targetId];
                }
            }

            $this->sendSuccess([
                'nodes'   => $nodes,
                'edges'   => $edges,
                'folders' => $this->foldersHoldingNotes($folderRows, $nodes),
                'total'   => $total,
            ]);

        } catch (Exception $e) {
            $this->sendError(500, 'Failed to build note graph');
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * The $limit rows modified last, in the order they came in; every row
     * when there is no limit or fewer rows than that.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function mostRecent(array $rows, int $limit): array
    {
        if ($limit <= 0 || count($rows) <= $limit) {
            return $rows;
        }

        $byDate = $rows;
        usort($byDate, static function (array $a, array $b): int {
            // Same second (an import, a restore): the newer note first
            return strcmp((string) ($b['modified'] ?? ''), (string) ($a['modified'] ?? ''))
                ?: ((int) $b['id'] <=> (int) $a['id']);
        });

        $kept = [];
        foreach (array_slice($byDate, 0, $limit) as $row) {
            $kept[(int) $row['id']] = true;
        }

        return array_values(array_filter($rows, static function (array $row) use ($kept): bool {
            return isset($kept[(int) $row['id']]);
        }));
    }

    /**
     * Folders of the workspace, keyed by id.
     *
     * @return array<int, array{id: int, name: string, parent_id: ?int, icon: ?string, icon_color: ?string}>
     */
    private function loadFolders(string $workspace): array
    {
        $sql = 'SELECT id, name, parent_id, icon, icon_color FROM folders';
        $params = [];
        if ($workspace !== '') {
            $sql .= ' WHERE workspace = ?';
            $params[] = $workspace;
        }
        $stmt = $this->con->prepare($sql);
        $stmt->execute($params);

        $folders = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $id = (int) $row['id'];
            $folders[$id] = [
                'id'        => $id,
                'name'      => (string) ($row['name'] ?? ''),
                'parent_id' => $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
            ] + $this->customIcon($row, 'lucide-folder');
        }
        return $folders;
    }

    /**
     * The tags of a note, as stored in one comma or space separated string.
     *
     * @return array<int, string>
     */
    private function tagList(string $tags): array
    {
        $list = preg_split('/[,\s]+/', $tags, -1, PREG_SPLIT_NO_EMPTY);
        return $list === false ? [] : array_values(array_unique($list));
    }

    /**
     * The icon of a note or folder as customised in the sidebar. Both keys
     * are null when nothing was changed; a colour chosen alone comes with
     * the default icon it tints there.
     *
     * @param array<string, mixed> $row
     * @return array{icon: ?string, icon_color: ?string}
     */
    private function customIcon(array $row, string $defaultIcon): array
    {
        // Stored as 'lucide-star', 'lucide lucide-star' or a Font Awesome name
        $icon = (string) convertFontAwesomeToLucide(trim((string) ($row['icon'] ?? '')));
        $icon = preg_match('/lucide-[a-z0-9-]+/', $icon, $m) ? $m[0] : null;

        $color = trim((string) ($row['icon_color'] ?? ''));
        if (!poznoteIsSafeCssColor($color)) {
            $color = null;
        }

        if ($icon === null && $color === null) {
            return ['icon' => null, 'icon_color' => null];
        }
        return ['icon' => $icon ?? $defaultIcon, 'icon_color' => $color];
    }

    /**
     * Keeps the folders that hold at least one graph node, directly or
     * through a subfolder: an empty folder would only add a stray dot.
     *
     * @param array<int, array{id: int, name: string, parent_id: ?int, icon: ?string, icon_color: ?string}> $folders
     * @param array<int, array<string, mixed>> $nodes
     * @return array<int, array{id: int, name: string, parent_id: ?int, icon: ?string, icon_color: ?string}>
     */
    private function foldersHoldingNotes(array $folders, array $nodes): array
    {
        $kept = [];
        foreach ($nodes as $node) {
            $folderId = $node['folder_id'];
            // Walk up to the root; stops on a folder already kept, which
            // also ends a parent_id cycle.
            while ($folderId !== null && isset($folders[$folderId]) && !isset($kept[$folderId])) {
                $kept[$folderId] = true;
                $folderId = $folders[$folderId]['parent_id'];
            }
        }

        $result = [];
        foreach ($folders as $id => $folder) {
            if (!isset($kept[$id])) {
                continue;
            }
            // A parent outside the set (other workspace, deleted) reads as root
            if ($folder['parent_id'] !== null && !isset($kept[$folder['parent_id']])) {
                $folder['parent_id'] = null;
            }
            $result[] = $folder;
        }
        return $result;
    }

    private function sendSuccess(array $data): void
    {
        apiSuccess($data);
    }

    private function sendError(int $code, string $message): void
    {
        // Delegates to lib/api-response.php. Note that FoldersController and
        // TrashController declare the arguments the other way round; the
        // signatures are typed, so a call in the wrong order fails loudly.
        apiFail($message, $code);
    }
}
