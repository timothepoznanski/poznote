<?php
/**
 * Tasks Controller
 *
 * Aggregates the tasks of every tasklist note in a workspace for the
 * global tasks page (tasks.php).
 *
 * Task content is stored as a JSON array in the note body. The on-disk
 * entry file is the source of truth; the database `entry` column is only
 * used as a fallback (it can be stale, see kanban_content.php).
 */

class TasksController
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

    /**
     * GET /api/v1/tasks
     *
     * Returns every non-trash tasklist note of the workspace with its
     * decoded task array:
     *   { success: true, notes: [{ id, heading, folder, workspace, updated, tasks: [...] }] }
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

            $sql = "SELECT id, heading, folder, folder_id, workspace, updated, favorite, entry
                      FROM entries
                     WHERE trash = 0
                       AND type = 'tasklist'";
            $params = [];
            if ($workspace !== '') {
                $sql .= ' AND workspace = ?';
                $params[] = $workspace;
            }
            $this->appendPublicWorkspaceAgeFilter($sql, $params);
            $sql .= ' ORDER BY updated DESC';

            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $notes = [];
            foreach ($rows as $row) {
                $fileContent = '';
                $filename = getEntryFilename((int) $row['id'], 'tasklist');
                if (is_file($filename)) {
                    $fileContent = (string) @file_get_contents($filename);
                }

                $notes[] = [
                    'id'        => (int) $row['id'],
                    'heading'   => (string) ($row['heading'] ?? ''),
                    'folder'    => (string) ($row['folder'] ?? ''),
                    'folder_id' => $row['folder_id'] !== null ? (int) $row['folder_id'] : null,
                    'workspace' => (string) ($row['workspace'] ?? ''),
                    'updated'   => (string) ($row['updated'] ?? ''),
                    'favorite'  => (int) ($row['favorite'] ?? 0) === 1,
                    'tasks'     => $this->decodeTasks($fileContent, (string) ($row['entry'] ?? '')),
                ];
            }

            echo json_encode(['success' => true, 'notes' => $notes], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to load tasks']);
        }
    }

    /**
     * Decode normalized tasklist content into a clean task array.
     */
    private function decodeTasks(string $fileContent, string $dbContent): array
    {
        $normalized = resolveTasklistStoredContent($fileContent, $dbContent);
        $tasks = json_decode($normalized, true);

        if (json_last_error() !== JSON_ERROR_NONE || !is_array($tasks)) {
            return [];
        }

        if (isset($tasks['tasks']) && is_array($tasks['tasks'])) {
            $tasks = $tasks['tasks'];
        }

        if ($tasks !== [] && !isset($tasks[0])) {
            return [];
        }

        $clean = [];
        foreach ($tasks as $task) {
            if (!is_array($task)) {
                continue;
            }

            $text = $task['text'] ?? ($task['content'] ?? '');
            $dueAt = $task['dueAt'] ?? null;
            // 'YYYY-MM-DD' with an optional local time: 'YYYY-MM-DDTHH:MM'
            if (!is_string($dueAt) || !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/', $dueAt, $dueMatch)) {
                $dueAt = null;
            } else {
                $dueAt = substr($dueAt, 0, empty($dueMatch[1]) ? 10 : 16);
            }

            $clean[] = [
                'id'          => is_scalar($task['id'] ?? null) ? $task['id'] : null,
                'text'        => is_scalar($text) ? (string) $text : '',
                'completed'   => !empty($task['completed']),
                'important'   => !empty($task['important']),
                'dueAt'       => $dueAt,
                'dueReminder' => !empty($task['dueReminder']),
            ];
        }

        return $clean;
    }
}
