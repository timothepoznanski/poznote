<?php
/**
 * TagsController - RESTful API controller for tags
 *
 * Endpoints:
 *   GET    /api/v1/tags          - List all unique tags (optionally filtered by workspace)
 *   PATCH  /api/v1/tags/{tag}    - Rename a tag across all notes
 *   DELETE /api/v1/tags/{tag}    - Remove a tag from all notes
 */

class TagsController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/tags
     * List all unique tags across all notes
     * Query params:
     *   - workspace: filter by workspace (optional)
     */
    public function index() {
        $workspace = $_GET['workspace'] ?? null;
        
        $where_conditions = ["trash = 0"];
        $params = [];
        
        // Build base query
        $select_query = "SELECT tags FROM entries WHERE " . implode(' AND ', $where_conditions);
        
        if ($workspace !== null && $workspace !== '') {
            // Scope to workspace
            $select_query .= " AND workspace = ?";
            $params[] = $workspace;
        }
        
        try {
            $stmt = $this->con->prepare($select_query);
            $stmt->execute($params);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Query failed: ' . $e->getMessage()]);
            return;
        }
        
        $tags_list = [];
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (empty($row['tags'])) continue;
            $words = preg_split('/[,\s]+/', $row['tags']);
            foreach ($words as $word) {
                $w = trim($word);
                if ($w === '') continue;
                if (!in_array($w, $tags_list, true)) $tags_list[] = $w;
            }
        }
        
        sort($tags_list, SORT_NATURAL | SORT_FLAG_CASE);

        echo json_encode(['success' => true, 'tags' => $tags_list]);
    }

    /**
     * PATCH /api/v1/tags/{tag}
     * Rename a tag across all notes (optionally scoped to a workspace)
     * Body: { "new_name": "...", "workspace": "..." (optional) }
     */
    public function rename(string $tag): void {
        $tag = urldecode($tag);
        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input || empty(trim($input['new_name'] ?? ''))) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'new_name is required']);
            return;
        }

        $newName = trim($input['new_name']);
        // Spaces → underscores to match the existing tag normalisation convention
        $newName = str_replace(' ', '_', $newName);
        $workspace = $input['workspace'] ?? null;

        if ($newName === $tag) {
            echo json_encode(['success' => true, 'updated' => 0]);
            return;
        }

        try {
            $where = "trash = 0 AND tags LIKE ?";
            $params = ['%' . $tag . '%'];
            if (!empty($workspace)) {
                $where .= " AND workspace = ?";
                $params[] = $workspace;
            }

            $stmt = $this->con->prepare("SELECT id, tags FROM entries WHERE $where");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $updated = 0;
            foreach ($rows as $row) {
                $tags = array_map('trim', explode(',', $row['tags']));
                $changed = false;
                foreach ($tags as &$t) {
                    if ($t === $tag) {
                        $t = $newName;
                        $changed = true;
                    }
                }
                unset($t);

                if ($changed) {
                    $newTagsStr = implode(', ', $tags);
                    $updateStmt = $this->con->prepare(
                        "UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ?"
                    );
                    $updateStmt->execute([$newTagsStr, $row['id']]);
                    $updated++;
                }
            }

            echo json_encode(['success' => true, 'updated' => $updated]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database error']);
        }
    }

    /**
     * DELETE /api/v1/tags/{tag}
     * Remove a tag from all notes (optionally scoped to a workspace)
     * Query params: workspace (optional)
     */
    public function delete(string $tag): void {
        $tag = urldecode($tag);
        $workspace = $_GET['workspace'] ?? null;

        try {
            $where = "trash = 0 AND tags LIKE ?";
            $params = ['%' . $tag . '%'];
            if (!empty($workspace)) {
                $where .= " AND workspace = ?";
                $params[] = $workspace;
            }

            $stmt = $this->con->prepare("SELECT id, tags FROM entries WHERE $where");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $updated = 0;
            foreach ($rows as $row) {
                $tags = array_filter(
                    array_map('trim', explode(',', $row['tags'])),
                    fn($t) => $t !== $tag
                );

                $newTagsStr = implode(', ', array_values($tags));
                $updateStmt = $this->con->prepare(
                    "UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ?"
                );
                $updateStmt->execute([$newTagsStr, $row['id']]);
                $updated++;
            }

            echo json_encode(['success' => true, 'updated' => $updated]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database error']);
        }
    }
}
