<?php
/**
 * User Profiles Controller
 * 
 * API endpoints for managing user profiles (admin only)
 * Note: This is for the simplified architecture where
 * there's one global password but multiple user profiles.
 */

class UsersController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * Check if current user is admin
     */
    private function requireAdmin() {
        if (!function_exists('isCurrentUserAdmin') || !isCurrentUserAdmin()) {
            http_response_code(403);
            return ['error' => 'Admin access required'];
        }
        return null;
    }
    
    /**
     * GET /api/v1/admin/users - List all user profiles
     */
    public function list($params = []) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        require_once dirname(__DIR__, 3) . '/users/UserDataManager.php';
        
        $users = listAllUserProfiles();
        
        // Add storage info for each user
        foreach ($users as &$user) {
            $dataManager = new UserDataManager($user['id']);
            $stats = $dataManager->getStorageStats();
            $user['storage_bytes'] = $stats['total'];
            $user['notes_count'] = $dataManager->getNotesCount();
            $user['attachments_count'] = $dataManager->getAttachmentsCount();
        }
        unset($user);
        
        return [
            'users' => $users,
            'total' => count($users)
        ];
    }
    
    /**
     * GET /api/v1/admin/users/{id} - Get a specific user profile
     */
    public function get($id) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        require_once dirname(__DIR__, 3) . '/users/UserDataManager.php';
        
        $user = getUserProfileById((int)$id);
        
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User profile not found'];
        }
        
        $dataManager = new UserDataManager($user['id']);
        $user['storage'] = $dataManager->getStorageStats();
        $user['notes_count'] = $dataManager->getNotesCount();
        $user['attachments_count'] = $dataManager->getAttachmentsCount();
        
        return $user;
    }
    
    /**
     * POST /api/v1/admin/users - Create a new user profile
     */
    public function create($data) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $username = $data['username'] ?? '';
        
        if (empty($username)) {
            http_response_code(400);
            return ['error' => 'Username is required'];
        }
        
        $result = createUserProfile($username);
        
        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }
        
        http_response_code(201);
        return [
            'id' => $result['user_id'],
            'message' => 'User profile created successfully'
        ];
    }
    
    /**
     * PATCH /api/v1/admin/users/{id} - Update a user profile
     */
    public function update($id, $data) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        // Check if user exists
        $user = getUserProfileById((int)$id);
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User profile not found'];
        }
        
        $result = updateUserProfile((int)$id, $data);
        
        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }
        
        return ['message' => 'User profile updated successfully'];
    }
    
    /**
     * DELETE /api/v1/admin/users/{id} - Delete a user profile
     */
    public function delete($id, $params = []) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        // Cannot delete yourself
        if ((int)$id === getCurrentUserId()) {
            http_response_code(400);
            return ['error' => 'Cannot delete your own profile'];
        }
        
        $deleteData = isset($params['delete_data']) && filter_var($params['delete_data'], FILTER_VALIDATE_BOOL);
        
        $result = deleteUserProfile((int)$id, $deleteData);
        
        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }
        
        return ['message' => 'User profile deleted successfully'];
    }
    
    /**
     * GET /api/v1/admin/stats - Get system statistics
     */
    public function stats() {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        require_once dirname(__DIR__, 3) . '/users/UserDataManager.php';
        
        $users = listAllUserProfiles();
        
        $totalStorage = 0;
        $totalNotes = 0;
        $totalAttachments = 0;
        $activeUsers = 0;
        $adminUsers = 0;
        
        foreach ($users as $user) {
            $dataManager = new UserDataManager($user['id']);
            $stats = $dataManager->getStorageStats();
            $totalStorage += $stats['total'];
            $totalNotes += $dataManager->getNotesCount();
            $totalAttachments += $dataManager->getAttachmentsCount();
            
            if ($user['active']) $activeUsers++;
            if ($user['is_admin']) $adminUsers++;
        }
        
        return [
            'total_users' => count($users),
            'active_users' => $activeUsers,
            'admin_users' => $adminUsers,
            'total_storage_bytes' => $totalStorage,
            'total_storage_mb' => round($totalStorage / 1024 / 1024, 2),
            'total_notes' => $totalNotes,
            'total_attachments' => $totalAttachments
        ];
    }
    
    /**
     * GET /api/v1/users/profiles - Get available user profiles (for login selector)
     * This endpoint is public (no admin required)
     */
    public function profiles() {
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $users = getAllUserProfiles();
        
        // Return only public info
        return array_map(function($user) {
            return [
                'id' => $user['id'],
                'username' => $user['username']
            ];
        }, $users);
    }
    /**
     * POST /api/v1/admin/repair - Repair master database (Scan & Rebuild)
     */
    public function repair() {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        try {
            $masterCon = getMasterConnection();
        } catch (Exception $e) {
            return ['success' => false, 'error' => 'Could not connect to master database: ' . $e->getMessage()];
        }
        
        $stats = [
            'users_scanned' => 0,
            'users_added' => 0,
            'links_rebuilt' => 0,
            'errors' => []
        ];
        
        // Define users data directory path
        // Use SQLITE_DATABASE constant to find data directory reliably
        // SQLITE_DATABASE = /path/to/data/database/poznote.db
        // So dirname(SQLITE_DATABASE, 2) = /path/to/data
        $dataDir = dirname(SQLITE_DATABASE, 2);
        $usersBaseDir = $dataDir . '/users';
        
        if (!is_dir($usersBaseDir)) {
            return ['success' => false, 'error' => 'Users data directory not found at ' . $usersBaseDir . ' (derived from SQLITE_DATABASE: ' . SQLITE_DATABASE . ')'];
        }
        
        try {
            // 1. Rebuild shared_links registry - clear existing to avoid conflicts
            $masterCon->exec("DELETE FROM shared_links");
            
            $dirs = array_filter(glob($usersBaseDir . '/*'), 'is_dir');
            foreach ($dirs as $userDir) {
                $userIdStr = basename($userDir);
                if (!is_numeric($userIdStr)) continue;
                $userId = (int)$userIdStr;
                if ($userId <= 0) continue;
                
                $stats['users_scanned']++;
                
                // Open user's database to scan for shared items
                $userDbFile = $userDir . '/database/poznote.db';
                if (!file_exists($userDbFile)) continue;
                
                try {
                    $userCon = new PDO('sqlite:' . $userDbFile);
                    $userCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    $userCon->exec('PRAGMA busy_timeout = 5000');

                    // Add user to master if missing from 'users' table
                    $stmt = $masterCon->prepare("SELECT id FROM users WHERE id = ?");
                    $stmt->execute([$userId]);
                    if (!$stmt->fetch()) {
                        $username = 'user_' . $userId;
                        
                        // Try to recover original username from local DB settings
                        $recoverStmt = $userCon->prepare("SELECT value FROM settings WHERE key = 'login_display_name' LIMIT 1");
                        $recoverStmt->execute();
                        $savedName = $recoverStmt->fetchColumn();
                        if ($savedName) {
                            $username = $savedName;
                        }

                        $stmtAdd = $masterCon->prepare("INSERT INTO users (id, username, is_admin, active) VALUES (?, ?, 0, 1)");
                        $stmtAdd->execute([$userId, $username]);
                        $stats['users_added']++;
                    }
                    
                    // Collect shared notes
                    // Check if table exists first
                    $tableCheck = $userCon->query("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_notes'");
                    if ($tableCheck->fetch()) {
                        $stmt = $userCon->query("SELECT token, note_id FROM shared_notes");
                        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                            $st = $masterCon->prepare("INSERT OR REPLACE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, ?, 'note', ?)");
                            $st->execute([$row['token'], $userId, (int)$row['note_id']]);
                            $stats['links_rebuilt']++;
                        }
                    }
                    
                    // Collect shared folders
                    $tableCheck = $userCon->query("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_folders'");
                    if ($tableCheck->fetch()) {
                        $stmt = $userCon->query("SELECT token, folder_id FROM shared_folders");
                        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                            $st = $masterCon->prepare("INSERT OR REPLACE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, ?, 'folder', ?)");
                            $st->execute([$row['token'], $userId, (int)$row['folder_id']]);
                            $stats['links_rebuilt']++;
                        }
                    }
                    
                    $userCon = null; // Close connection
                    
                } catch (Exception $e) {
                    $stats['errors'][] = "User $userId: " . $e->getMessage();
                }
            }
            
            return [
                'success' => true,
                'message' => 'System registry repaired successfully',
                'stats' => $stats
            ];
            
        } catch (Exception $e) {
            return ['success' => false, 'error' => 'Repair failed: ' . $e->getMessage()];
        }
    }
}
