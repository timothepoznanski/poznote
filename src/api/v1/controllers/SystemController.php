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
        
        if ($password === $configuredPassword) {
            // Set session flag
            $_SESSION['settings_password_verified'] = true;
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
            $query = "SELECT 
                sn.id as share_id,
                sn.note_id,
                sn.token,
                sn.theme,
                sn.indexable,
                CASE WHEN sn.password IS NOT NULL AND sn.password != '' THEN 1 ELSE 0 END as hasPassword,
                sn.created as shared_date,
                e.heading,
                e.folder,
                e.workspace,
                e.updated
            FROM shared_notes sn
            INNER JOIN entries e ON sn.note_id = e.id
            WHERE e.trash = 0";
            $params = [];
            
            if ($workspace) {
                $query .= " AND e.workspace = ?";
                $params[] = $workspace;
            }
            
            $query .= " ORDER BY sn.created DESC";
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            $shared_notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Build URLs for each shared note
            $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
            $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
            if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
                $scriptDir = '';
            }
            // Get base by going up from /api/v1
            $scriptDir = rtrim($scriptDir, '/\\');
            // Remove /api/v1 from the path
            $scriptDir = preg_replace('#/api/v1$#', '', $scriptDir);
            $base = '//' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
            
            foreach ($shared_notes as &$note) {
                $token = $note['token'];
                $note['url'] = $base . '/' . rawurlencode($token);
                $note['url_query'] = $base . '/public_note.php?token=' . rawurlencode($token);
                $note['url_workspace'] = $base . '/workspace/' . rawurlencode($token);
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
