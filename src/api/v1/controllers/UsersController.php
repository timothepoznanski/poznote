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
        
        require_once __DIR__ . '/../../users/db_master.php';
        require_once __DIR__ . '/../../users/UserDataManager.php';
        
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
        
        require_once __DIR__ . '/../../users/db_master.php';
        require_once __DIR__ . '/../../users/UserDataManager.php';
        
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
        
        require_once __DIR__ . '/../../users/db_master.php';
        
        $username = $data['username'] ?? '';
        $displayName = $data['display_name'] ?? null;
        $color = $data['color'] ?? '#007DB8';
        $icon = $data['icon'] ?? 'user';
        
        if (empty($username)) {
            http_response_code(400);
            return ['error' => 'Username is required'];
        }
        
        $result = createUserProfile($username, $displayName, $color, $icon);
        
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
        
        require_once __DIR__ . '/../../users/db_master.php';
        
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
        
        require_once __DIR__ . '/../../users/db_master.php';
        
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
        
        require_once __DIR__ . '/../../users/db_master.php';
        require_once __DIR__ . '/../../users/UserDataManager.php';
        
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
        require_once __DIR__ . '/../../users/db_master.php';
        
        $users = getAllUserProfiles();
        
        // Return only public info (no admin status, no last_login, etc.)
        return array_map(function($user) {
            return [
                'id' => $user['id'],
                'username' => $user['username'],
                'display_name' => $user['display_name'],
                'color' => $user['color'],
                'icon' => $user['icon']
            ];
        }, $users);
    }
}
