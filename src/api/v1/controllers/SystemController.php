<?php
/**
 * SystemController - RESTful API for system utilities
 * 
 * Endpoints:
 *   GET  /api/v1/system/version       - Get current version info
 *   GET  /api/v1/system/updates       - Check for updates
 *   GET  /api/v1/system/i18n          - Get translations
 *   POST /api/v1/system/verify-password - Verify settings password
 *   GET  /api/v1/shared               - List shared notes
 */

class SystemController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/system/version
     */
    public function version() {
        $result = [
            'success' => true,
            'current_version' => '',
            'latest_version' => '',
            'is_up_to_date' => false,
            'has_update' => false
        ];
        
        // Get current version
        $versionFile = __DIR__ . '/../../../version.txt';
        if (file_exists($versionFile)) {
            $result['current_version'] = trim(file_get_contents($versionFile));
        }
        
        // Try to get latest from GitHub
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => ['User-Agent: Poznote-App/1.0', 'Accept: application/vnd.github.v3+json'],
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents('https://api.github.com/repos/timothepoznanski/poznote/releases', false, $context);
        
        if ($response !== false) {
            $releases = json_decode($response, true);
            $stableReleases = array_filter($releases, fn($r) => !$r['prerelease']);
            
            if (!empty($stableReleases)) {
                $latest = reset($stableReleases);
                $result['latest_version'] = ltrim($latest['tag_name'], 'v');
                $result['is_up_to_date'] = version_compare($result['current_version'], $result['latest_version'], '>=');
                $result['has_update'] = !$result['is_up_to_date'];
            }
        }
        
        return $result;
    }
    
    /**
     * GET /api/v1/system/updates
     */
    public function checkUpdates() {
        $result = [
            'success' => true,
            'has_updates' => false,
            'current_version' => '',
            'remote_version' => ''
        ];
        
        // Get current version
        $versionFile = __DIR__ . '/../../../version.txt';
        if (file_exists($versionFile)) {
            $result['current_version'] = trim(file_get_contents($versionFile));
        }
        
        // Check GitHub for updates
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => ['User-Agent: Poznote-App/1.0', 'Accept: application/vnd.github.v3+json'],
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents('https://api.github.com/repos/timothepoznanski/poznote/releases/latest', false, $context);
        
        if ($response !== false) {
            $release = json_decode($response, true);
            $remoteVersion = ltrim($release['tag_name'], 'v');
            
            // Skip pre-releases
            if (strpos($remoteVersion, '-test') === false && strpos($remoteVersion, '-beta') === false) {
                $result['remote_version'] = $remoteVersion;
                $result['has_updates'] = version_compare($result['current_version'], $remoteVersion, '<');
            }
        }
        
        return $result;
    }
    
    /**
     * GET /api/v1/system/i18n
     */
    public function i18n() {
        $lang = getUserLanguage();
        
        if (isset($_GET['lang'])) {
            $req = strtolower(trim((string)$_GET['lang']));
            if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $req)) {
                $lang = $req;
            }
        }
        
        $en = loadI18nDictionary('en');
        $active = ($lang === 'en') ? $en : loadI18nDictionary($lang);
        
        // Deep merge
        $merge = function($base, $over) use (&$merge) {
            if (!is_array($base)) $base = [];
            if (!is_array($over)) return $base;
            foreach ($over as $k => $v) {
                if (is_array($v) && isset($base[$k]) && is_array($base[$k])) {
                    $base[$k] = $merge($base[$k], $v);
                } else {
                    $base[$k] = $v;
                }
            }
            return $base;
        };
        
        return [
            'success' => true,
            'lang' => $lang,
            'strings' => $merge($en, $active)
        ];
    }
    
    /**
     * POST /api/v1/system/verify-password
     */
    public function verifyPassword() {
        $input = json_decode(file_get_contents('php://input'), true);
        $password = $input['password'] ?? '';
        
        $configuredPassword = getenv('POZNOTE_SETTINGS_PASSWORD') ?: '';
        
        if (empty($configuredPassword)) {
            return ['success' => true, 'valid' => true, 'message' => 'No password configured'];
        }
        
        if (hash_equals($configuredPassword, $password)) {
            // Set session flag
            $_SESSION['settings_authenticated'] = true;
            return ['success' => true, 'valid' => true];
        } else {
            http_response_code(401);
            return ['success' => false, 'valid' => false, 'error' => 'Invalid password'];
        }
    }
    
    /**
     * GET /api/v1/shared
     */
    public function listShared() {
        $workspace = $_GET['workspace'] ?? null;
        
        try {
            // 1. Get all shared folders to check if notes are shared via folder
            $sharedFoldersQuery = "SELECT sf.folder_id, sf.token, f.name as folder_name, f.workspace 
                FROM shared_folders sf 
                INNER JOIN folders f ON sf.folder_id = f.id";
            $sfStmt = $this->con->prepare($sharedFoldersQuery);
            $sfStmt->execute();
            $sharedFolders = $sfStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Create a map of folder_id => folder info
            $sharedFolderMap = [];
            foreach ($sharedFolders as $sf) {
                // filter by workspace if requested
                if ($workspace && $sf['workspace'] !== $workspace) continue;
                $sharedFolderMap[$sf['folder_id']] = [
                    'token' => $sf['token'],
                    'name' => $sf['folder_name']
                ];
            }

            // 2. Get all folders to build hierarchy and identifies descendant shares
            $folderQuery = "SELECT id, name, parent_id, workspace FROM folders";
            $fParams = [];
            if ($workspace) {
                $folderQuery .= " WHERE workspace = ?";
                $fParams[] = $workspace;
            }
            $stmtF = $this->con->prepare($folderQuery);
            $stmtF->execute($fParams);
            $allFoldersPool = [];
            while ($f = $stmtF->fetch(PDO::FETCH_ASSOC)) {
                $allFoldersPool[$f['id']] = $f;
            }

            // Identify all shared folder IDs (direct or descendants)
            $allSharedFolderIds = [];
            foreach ($sharedFolderMap as $fid => $info) {
                $allSharedFolderIds[] = (int)$fid;
                
                // Recursive helper to get descendants
                $getDescendants = function($parentId, $pool) use (&$getDescendants) {
                    $ids = [];
                    foreach ($pool as $id => $f) {
                        if ($f['parent_id'] !== null && (int)$f['parent_id'] === (int)$parentId) {
                            $ids[] = (int)$id;
                            $ids = array_merge($ids, $getDescendants($id, $pool));
                        }
                    }
                    return $ids;
                };
                
                $allSharedFolderIds = array_merge($allSharedFolderIds, $getDescendants($fid, $allFoldersPool));
            }
            $allSharedFolderIds = array_unique($allSharedFolderIds);

            // 3. Get notes that are explicitly shared
            $explicitQuery = "SELECT 
                sn.id as share_id,
                sn.note_id,
                sn.token,
                sn.theme,
                sn.indexable,
                CASE WHEN sn.password IS NOT NULL AND sn.password != '' THEN 1 ELSE 0 END as hasPassword,
                sn.created as shared_date,
                e.heading,
                e.folder,
                e.folder_id,
                e.workspace,
                e.updated
            FROM shared_notes sn
            INNER JOIN entries e ON sn.note_id = e.id
            WHERE e.trash = 0";
            
            $explicitParams = [];
            if ($workspace) {
                $explicitQuery .= " AND e.workspace = ?";
                $explicitParams[] = $workspace;
            }
            
            $stmt = $this->con->prepare($explicitQuery);
            $stmt->execute($explicitParams);
            $explicitNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // 4. Get notes that are shared via folder
            $folderNotes = [];
            if (!empty($allSharedFolderIds)) {
                $placeholders = implode(',', array_fill(0, count($allSharedFolderIds), '?'));
                $folderNoteQuery = "SELECT 
                    NULL as share_id,
                    e.id as note_id,
                    sn.token as token,
                    NULL as theme,
                    NULL as indexable,
                    0 as hasPassword,
                    e.created as shared_date,
                    e.heading,
                    e.folder,
                    e.folder_id,
                    e.workspace,
                    e.updated
                FROM entries e
                LEFT JOIN shared_notes sn ON e.id = sn.note_id
                WHERE e.folder_id IN ($placeholders) AND e.trash = 0";
                
                $stmt = $this->con->prepare($folderNoteQuery);
                $stmt->execute(array_values($allSharedFolderIds));
                $folderNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // Merge and deduplicate by note_id
            $shared_notes = [];
            $seenNoteIds = [];
            
            // Prioritize explicit shares (they have tokens and settings)
            foreach ($explicitNotes as $note) {
                $shared_notes[] = $note;
                $seenNoteIds[$note['note_id']] = true;
            }
            
            foreach ($folderNotes as $note) {
                if (!isset($seenNoteIds[$note['note_id']])) {
                    $shared_notes[] = $note;
                    $seenNoteIds[$note['note_id']] = true;
                }
            }
            
            // Sort by date desc
            usort($shared_notes, function($a, $b) {
                return strcmp($b['shared_date'], $a['shared_date']);
            });

            // Build URLs and path for each shared note
            $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
            $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
            if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
                $scriptDir = '';
            }
            // Get base by going up from /api/v1
            $scriptDir = rtrim($scriptDir, '/\\');
            // Remove /api/v1 from the path
            $scriptDir = preg_replace('#/api/v1$#', '', $scriptDir);
            $base = ($_SERVER['HTTPS'] ?? '') === 'on' ? 'https://' : 'http://';
            $base .= $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
            
            foreach ($shared_notes as &$note) {
                $token = $note['token'];
                if ($token) {
                    $note['url'] = $base . '/' . rawurlencode($token);
                    $note['url_query'] = $base . '/public_note.php?token=' . rawurlencode($token);
                    $note['url_workspace'] = $base . '/workspace/' . rawurlencode($token);
                }
                
                // Add full folder path
                $note['folder_path'] = getFolderPath($note['folder_id'], $this->con);
                
                // Check if this note is in a shared folder (direct or ancestor)
                $note['shared_via_folder'] = false;
                $currId = $note['folder_id'] ?? null;
                $maxDepth = 20;
                $depth = 0;
                while ($currId !== null && isset($allFoldersPool[$currId]) && $depth < $maxDepth) {
                    if (isset($sharedFolderMap[$currId])) {
                        $note['shared_via_folder'] = true;
                        $note['shared_folder_name'] = $sharedFolderMap[$currId]['name'];
                        $note['shared_folder_token'] = $sharedFolderMap[$currId]['token'];
                        $note['shared_folder_url'] = $base . '/folder/' . rawurlencode($sharedFolderMap[$currId]['token']);
                        
                        // If no explicit token, build URL via folder token
                        if (!$note['token']) {
                            $note['url'] = $base . '/public_note.php?id=' . $note['note_id'] . '&folder_token=' . rawurlencode($note['shared_folder_token']);
                        }
                        break;
                    }
                    $currId = $allFoldersPool[$currId]['parent_id'];
                    $depth++;
                }
            }
            
            return [
                'success' => true,
                'shared_notes' => $shared_notes
            ];
        } catch (Exception $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
