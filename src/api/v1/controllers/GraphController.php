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
 */
require_once __DIR__ . '/../../../note_loader.php';

class GraphController
{
    private PDO $con;

    public function __construct(PDO $con)
    {
        $this->con = $con;
    }

    private function appendPublicWorkspaceAgeFilter(string &$sql, array &$params, string $column = 'updated'): void
    {
        if (!function_exists('isPublicWorkspaceAccessActive') || !isPublicWorkspaceAccessActive()) {
            return;
        }

        $cutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($this->con));
        if ($cutoff === null) {
            return;
        }

        $sql .= " AND $column >= ?";
        $params[] = $cutoff;
    }

    // -------------------------------------------------------------------------
    // Public actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/v1/graph
     *
     * Returns every non-trash note of the workspace as a node, plus one edge
     * per (source, target) pair of linked notes.
     */
    public function index(): void
    {
        try {
            $workspace = '';
            if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
                $workspace = (string) (function_exists('getPublicWorkspaceName') ? getPublicWorkspaceName() : '');
            } elseif (isset($_GET['workspace']) && is_string($_GET['workspace'])) {
                $workspace = trim($_GET['workspace']);
            }

            $sql = "SELECT id, heading, type, folder, favorite
                      FROM entries
                     WHERE trash = 0
                       AND type IN ('note', 'markdown', 'tasklist')";
            $params = [];
            if ($workspace !== '') {
                $sql .= ' AND workspace = ?';
                $params[] = $workspace;
            }
            $this->appendPublicWorkspaceAgeFilter($sql, $params);

            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // --- Build nodes and lookup tables
            $nodes      = [];
            $idSet      = [];
            $headingMap = []; // lowercased heading => note id (first wins)

            foreach ($rows as $row) {
                $id      = (int) $row['id'];
                $heading = (string) ($row['heading'] ?? '');

                $nodes[] = [
                    'id'       => $id,
                    'title'    => $heading !== '' ? $heading : 'Untitled',
                    'folder'   => (string) ($row['folder'] ?? ''),
                    'type'     => (string) $row['type'],
                    'favorite' => (int) ($row['favorite'] ?? 0) === 1,
                ];

                $idSet[$id] = true;
                if ($heading !== '') {
                    $key = mb_strtolower($heading);
                    if (!isset($headingMap[$key])) {
                        $headingMap[$key] = $id;
                    }
                }
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
                    // (trashed, other workspace, linked-type notes)
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
                'nodes' => $nodes,
                'edges' => $edges,
            ]);

        } catch (Exception $e) {
            $this->sendError(500, 'Failed to build note graph');
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function sendSuccess(array $data): void
    {
        echo json_encode(array_merge(['success' => true], $data));
    }

    private function sendError(int $code, string $message): void
    {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $message]);
    }
}
