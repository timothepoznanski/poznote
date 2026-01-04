<?php
/**
 * TagsController - RESTful API controller for tags
 * 
 * Endpoints:
 *   GET /api/v1/tags - List all unique tags (optionally filtered by workspace)
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
}
