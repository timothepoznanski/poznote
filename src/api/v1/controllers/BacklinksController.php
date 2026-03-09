<?php
/**
 * Backlinks Controller
 *
 * Returns all notes that reference a given note (backlinks).
 *
 * Detection supports three formats written by the editor:
 *   1. HTML internal link attribute  — data-note-id="{id}"
 *   2. URL-based link                — ?note={id} or &note={id}
 *   3. Wiki-link syntax              — [[Note Title]]
 */
class BacklinksController
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
     * GET /api/v1/notes/{id}/backlinks
     *
     * Returns every non-trash note that links to the note with the given ID.
     */
    public function index(string $noteId): void
    {
        if (!ctype_digit($noteId)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        $noteId = (int) $noteId;

        try {
            // --- Fetch the target note (we need its heading for wiki-link matching)
            $stmt = $this->con->prepare(
                'SELECT id, heading FROM entries WHERE id = ? AND trash = 0'
            );
            $stmt->execute([$noteId]);
            $targetNote = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$targetNote) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $targetHeading = (string) ($targetNote['heading'] ?? '');

            // --- Fetch all non-trash candidate notes (exclude the target itself)
            $stmt = $this->con->prepare(
                "SELECT id, heading, type
                   FROM entries
                  WHERE trash = 0
                    AND id != ?
                    AND type IN ('note', 'markdown', 'tasklist')"
            );
            $stmt->execute([$noteId]);
            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $entriesPath = getEntriesPath();
            $backlinks   = [];

            foreach ($candidates as $note) {
                $ext      = ($note['type'] === 'markdown') ? '.md' : '.html';
                $filePath = $entriesPath . '/' . $note['id'] . $ext;

                if (!is_file($filePath)) {
                    continue;
                }
                $content = @file_get_contents($filePath);
                if ($content === false || $content === '') {
                    continue;
                }

                $found = false;

                // 1. HTML internal-link attribute: data-note-id="123"
                if (strpos($content, 'data-note-id="' . $noteId . '"') !== false) {
                    $found = true;
                }

                // 2. URL-based link: ?note=123 or &note=123
                //    The (?:[^0-9]|$) guard prevents matching note=1234 when looking for note=123.
                if (!$found && preg_match('/[?&]note=' . $noteId . '(?:[^0-9]|$)/', $content)) {
                    $found = true;
                }

                // 3. Wiki-link syntax: [[Note Title]]
                if (!$found && $targetHeading !== '' &&
                    strpos($content, '[[' . $targetHeading . ']]') !== false
                ) {
                    $found = true;
                }

                if ($found) {
                    $backlinks[] = [
                        'id'      => (int) $note['id'],
                        'heading' => $note['heading'] !== '' ? $note['heading'] : 'Untitled',
                    ];
                }
            }

            // Sort alphabetically for a consistent display order
            usort($backlinks, static function (array $a, array $b): int {
                return strcasecmp($a['heading'], $b['heading']);
            });

            $this->sendSuccess([
                'backlinks' => $backlinks,
                'count'     => count($backlinks),
            ]);

        } catch (Exception $e) {
            $this->sendError(500, 'Failed to retrieve backlinks');
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
