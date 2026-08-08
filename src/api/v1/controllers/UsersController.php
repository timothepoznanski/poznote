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

    private function requireActiveAccountOwner() {
        if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
            http_response_code(403);
            $message = function_exists('getActiveAccountOwnerRequiredMessage')
                ? getActiveAccountOwnerRequiredMessage()
                : 'This account\'s settings are not accessible because you are not the owner of this account.';
            return ['error' => $message];
        }
        return null;
    }
    
    /**
     * GET /api/v1/users/me - Get current authenticated user's profile
     */
    public function me() {
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $userId = getCurrentUserId();
        if (!$userId) {
            http_response_code(401);
            return ['error' => 'Not authenticated'];
        }
        
        $user = getUserProfileById((int)$userId);
        
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User profile not found'];
        }
        
        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'first_name' => $user['first_name'] ?? null,
            'last_name' => $user['last_name'] ?? null,
            'display_name' => $user['display_name'] ?? $user['username'],
            'is_admin' => (bool)$user['is_admin'],
            'active' => (bool)$user['active']
        ];
    }

    /**
     * PATCH /api/v1/users/me - Update current user's profile (username, first/last name)
     */
    public function updateMe() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

        require_once dirname(__DIR__, 3) . '/users/db_master.php';

        $userId = getCurrentUserId();
        if (!$userId) {
            http_response_code(401);
            return ['error' => 'Not authenticated'];
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            http_response_code(400);
            return ['error' => 'Invalid request body'];
        }

        $updates = [];

        if (array_key_exists('username', $data)) {
            $username = trim((string)$data['username']);
            if ($username === '') {
                http_response_code(400);
                return ['error' => 'Username is required'];
            }
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/', $username)) {
                http_response_code(400);
                return ['error' => 'Username may only contain letters, digits, dots, underscores and dashes (max 60 characters)'];
            }
            if (ctype_digit($username)) {
                http_response_code(400);
                return ['error' => 'Username cannot be purely numeric'];
            }
            $updates['username'] = $username;
        }

        foreach (['first_name', 'last_name'] as $nameField) {
            if (array_key_exists($nameField, $data)) {
                $value = trim((string)$data[$nameField]);
                // Strip control characters; names are free text otherwise.
                $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
                if (mb_strlen($value) > 100) {
                    http_response_code(400);
                    return ['error' => 'Name fields must be 100 characters or fewer'];
                }
                $updates[$nameField] = $value;
            }
        }

        // Email is admin-managed (or OIDC-provider-synced): a self-set email
        // would be unusable for OIDC account matching anyway, and for SSO
        // accounts it would be silently overwritten at the next login.
        // Admins keep editing their own email here, as they can for anyone
        // in the admin panel.
        if (array_key_exists('email', $data)) {
            $currentProfile = getUserProfileById((int)$userId);
            if (!$currentProfile || !(bool)($currentProfile['is_admin'] ?? false)) {
                http_response_code(403);
                return ['error' => 'Email can only be changed by an administrator'];
            }
            $email = trim((string)$data['email']);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                http_response_code(400);
                return ['error' => 'Invalid email address'];
            }
            $updates['email'] = $email;
            // Admin-set emails are trusted for OIDC account matching.
            $updates['email_verified'] = ($email !== '') ? 1 : 0;
        }

        if (empty($updates)) {
            http_response_code(400);
            return ['error' => 'No valid fields to update'];
        }

        $usernameChanged = isset($updates['username']);

        $profileBefore = getUserProfileById((int)$userId);

        $result = updateUserProfile((int)$userId, $updates);

        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }

        // Best-effort: notify outgoing webhooks of the change.
        try {
            require_once dirname(__DIR__, 3) . '/WebhookDispatcher.php';
            (new WebhookDispatcher())->dispatchUserProfileChanged((int)$userId, 'self', $profileBefore);
        } catch (Throwable $e) {
            error_log('Webhook dispatch failed after self profile update: ' . $e->getMessage());
        }

        $user = getUserProfileById((int)$userId);

        // The remember-me token embeds the username: re-issue it after a rename
        // so the user's other tabs/next visit stay logged in.
        if ($usernameChanged && $user) {
            $this->reissueRememberMeCookie($user);
        }

        return [
            'success' => true,
            'id' => (int)$userId,
            'username' => $user['username'] ?? $updates['username'] ?? null,
            'email' => $user['email'] ?? null,
            'first_name' => $user['first_name'] ?? null,
            'last_name' => $user['last_name'] ?? null,
            'display_name' => $user['display_name'] ?? null
        ];
    }

    /**
     * Rebuild the remember-me cookie after a username change (the token embeds
     * the username, so the old cookie would no longer validate).
     */
    private function reissueRememberMeCookie(array $user) {
        if (!defined('REMEMBER_ME_COOKIE')
            || empty($_COOKIE[REMEMBER_ME_COOKIE])
            || !function_exists('getRememberMeSecret')
            || !function_exists('buildRememberMeToken')
            || !function_exists('setRememberMeCookie')) {
            return;
        }

        $decoded = base64_decode($_COOKIE[REMEMBER_ME_COOKIE]);
        if ($decoded === false) {
            return;
        }

        $parts = explode(':', $decoded);
        if (count($parts) !== 4 || (int)$parts[1] !== (int)$user['id']) {
            return;
        }

        $timestamp = (int)$parts[2];
        $secret = getRememberMeSecret($user);
        if ($secret === null) {
            // No signing secret available for this profile: drop the stale cookie
            // rather than reissuing one the login path would reject anyway.
            setRememberMeCookie('', time() - 3600);
            return;
        }
        $token = buildRememberMeToken((string)$user['username'], (int)$user['id'], $timestamp, $secret);
        setRememberMeCookie($token, $timestamp + REMEMBER_ME_DURATION);
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
        $email = $data['email'] ?? null;
        
        if (empty($username)) {
            http_response_code(400);
            return ['error' => 'Username is required'];
        }
        
        $result = createUserProfile($username, $email);

        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }

        // Best-effort: notify outgoing webhooks of the new account.
        try {
            require_once dirname(__DIR__, 3) . '/WebhookDispatcher.php';
            (new WebhookDispatcher())->dispatchUserCreated((int)$result['user_id'], 'api');
        } catch (Throwable $e) {
            error_log('Webhook dispatch failed after API user creation: ' . $e->getMessage());
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

        // An admin-set email is trusted for OIDC account matching.
        if (isset($data['email']) && !array_key_exists('email_verified', $data)) {
            $data['email_verified'] = 1;
        }

        $result = updateUserProfile((int)$id, $data);

        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }

        // Best-effort: notify outgoing webhooks of the change ($user was
        // loaded above, before the update).
        try {
            require_once dirname(__DIR__, 3) . '/WebhookDispatcher.php';
            (new WebhookDispatcher())->dispatchUserProfileChanged((int)$id, 'api', $user);
        } catch (Throwable $e) {
            error_log('Webhook dispatch failed after API profile update: ' . $e->getMessage());
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
        
        // Captured before deletion: the profile row is gone afterwards.
        $deletedProfile = getUserProfileById((int)$id);

        // Deleting an account removes everything it owns: local data and the
        // S3 objects (attachments, backup archives). The former delete_data
        // flag is gone because keeping the local notes while the S3 purge
        // destroys the only copy of their attachments produced a "preserved"
        // data set with every attachment missing.
        $result = deleteUserProfile((int)$id, true);

        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }

        require_once dirname(__DIR__, 3) . '/ActivityLog.php';
        [, $actingAdminName] = currentActivityActor();
        // s3_error is recorded on partial failure so the audit trail never
        // claims a cleanup that did not complete.
        $deletionLogDetails = [
            'deleted_data' => true,
            's3_objects_deleted' => (int)($result['s3_deleted'] ?? 0),
            'performed_by' => $actingAdminName,
        ];
        if (!empty($result['s3_error'])) {
            $deletionLogDetails['s3_error'] = $result['s3_error'];
        }
        logActivity(
            ACTIVITY_ACCOUNT_DELETED,
            $deletionLogDetails,
            'api',
            (int)$id,
            $deletedProfile['username'] ?? null
        );

        // Best-effort: notify outgoing webhooks of the deletion.
        if ($deletedProfile) {
            try {
                require_once dirname(__DIR__, 3) . '/WebhookDispatcher.php';
                (new WebhookDispatcher())->dispatchUserDeleted($deletedProfile, 'api');
            } catch (Throwable $e) {
                error_log('Webhook dispatch failed after API user deletion: ' . $e->getMessage());
            }
        }

        $response = [
            'message' => 'User profile deleted successfully',
            's3_objects_deleted' => (int)($result['s3_deleted'] ?? 0),
        ];
        // The account is deleted either way; a bucket error only means some
        // objects are still there and need manual cleanup.
        if (!empty($result['s3_error'])) {
            $response['s3_error'] = $result['s3_error'];
        }
        return $response;
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
     * Available to any authenticated user, except on an instance running with
     * TENANT_ISOLATION on: there the directory would let a tenant enumerate the
     * other customers, so only admins may read it.
     */
    public function profiles() {
        require_once dirname(__DIR__, 3) . '/users/db_master.php';

        if (defined('TENANT_ISOLATION') && TENANT_ISOLATION) {
            if (!function_exists('isCurrentUserAdmin') || !isCurrentUserAdmin()) {
                http_response_code(403);
                return ['error' => 'User directory is not available on this instance'];
            }
        }

        $users = getAllUserProfiles();

        // Only what picking a user actually needs. The email address is personal
        // data and nothing in the share dialogs requires it to identify a user,
        // so it is never exposed here, whatever the instance mode.
        return array_map(function($user) {
            return [
                'id' => (int)$user['id'],
                'username' => $user['username']
            ];
        }, $users);
    }

    /**
     * POST /api/v1/users/me/password - Change current user's password
     */
    public function changePassword() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $userId = getCurrentUserId();
        if (!$userId) {
            http_response_code(401);
            return ['error' => 'Not authenticated'];
        }

        // A local password is meaningless on an SSO-only instance, and a profile
        // provisioned without a credential has no current password to
        // authenticate the change with. Say so instead of failing later with a
        // misleading "current password is incorrect".
        $oidcPath = dirname(__DIR__, 3) . '/oidc.php';
        if (is_file($oidcPath)) {
            require_once $oidcPath;
        }
        if (function_exists('oidc_is_enabled') && oidc_is_enabled()
            && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN) {
            http_response_code(403);
            return ['error' => 'Password login is disabled on this instance: sign-in goes through the identity provider.'];
        }
        $profile = getUserProfileById((int)$userId);
        if ($profile && !hasCustomPassword((int)$userId) && isPasswordLoginDisabled($profile)) {
            http_response_code(403);
            return ['error' => 'This profile has no password. Ask an administrator to set one if you need password login.'];
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $currentPassword = $data['current_password'] ?? '';
        $newPassword = $data['new_password'] ?? '';
        $confirmPassword = $data['confirm_password'] ?? '';
        
        if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
            http_response_code(400);
            return ['error' => 'All password fields are required'];
        }
        
        if ($newPassword !== $confirmPassword) {
            http_response_code(400);
            return ['error' => 'New passwords do not match'];
        }
        
        if (strlen($newPassword) < 4) {
            http_response_code(400);
            return ['error' => 'Password must be at least 4 characters'];
        }
        
        // Verify current password
        if (!verifyUserPassword($userId, $currentPassword)) {
            http_response_code(403);
            return ['error' => 'Current password is incorrect'];
        }
        
        // Set new password hash
        if (!setUserPasswordHash($userId, $newPassword)) {
            http_response_code(500);
            return ['error' => 'Failed to update password'];
        }
        
        return ['success' => true, 'message' => 'Password changed successfully'];
    }

    /**
     * DELETE /api/v1/users/me - Delete current user's own account and all its data
     */
    public function deleteMe() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

        require_once dirname(__DIR__, 3) . '/users/db_master.php';

        $userId = getCurrentUserId();
        if (!$userId) {
            http_response_code(401);
            return ['error' => 'Not authenticated'];
        }

        $user = getUserProfileById((int)$userId);
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User profile not found'];
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        // Trimmed on both sides so accounts created before usernames were
        // normalized (stray whitespace) can still self-delete.
        $confirmUsername = trim((string)($data['confirm_username'] ?? ''));
        if ($confirmUsername !== trim((string)$user['username'])) {
            http_response_code(400);
            return ['error' => 'Username confirmation does not match'];
        }

        // OIDC sessions have no password the user is guaranteed to know
        // (verifyUserPassword would fall back to the env default), so the
        // re-authentication step only applies to password sessions.
        $isOidcSession = ($_SESSION['auth_method'] ?? '') === 'oidc';
        if (!$isOidcSession) {
            $password = (string)($data['password'] ?? '');
            if ($password === '') {
                http_response_code(400);
                return ['error' => 'Password is required'];
            }
            if (!verifyUserPassword((int)$userId, $password)) {
                http_response_code(403);
                return ['error' => 'Password is incorrect'];
            }
        }

        // deleteUserProfile refuses user ID 1 and the last active admin, and
        // purges the account's S3 objects along with its local data.
        $result = deleteUserProfile((int)$userId, true);
        if (!$result['success']) {
            http_response_code(400);
            return ['error' => $result['error']];
        }

        // Identity comes from $user, captured before the row disappeared; the
        // session is about to be destroyed so currentActivityActor() cannot
        // resolve it here.
        require_once dirname(__DIR__, 3) . '/ActivityLog.php';
        // s3_error must land in the log: after a self-deletion there is no
        // user left to warn, so the activity log is the only place an admin
        // can learn that bucket objects were left behind.
        $deletionLogDetails = [
            'deleted_data' => true,
            's3_objects_deleted' => (int)($result['s3_deleted'] ?? 0),
        ];
        if (!empty($result['s3_error'])) {
            $deletionLogDetails['s3_error'] = $result['s3_error'];
        }
        logActivity(
            ACTIVITY_ACCOUNT_DELETED,
            $deletionLogDetails,
            'self',
            (int)$userId,
            $user['username'] ?? null
        );

        // Best-effort: notify outgoing webhooks of the deletion ($user was
        // loaded above, before the row disappeared).
        try {
            require_once dirname(__DIR__, 3) . '/WebhookDispatcher.php';
            (new WebhookDispatcher())->dispatchUserDeleted($user, 'self');
        } catch (Throwable $e) {
            error_log('Webhook dispatch failed after account self-deletion: ' . $e->getMessage());
        }

        // Close the now-orphaned session like logout() does, but return the
        // destination as JSON instead of redirecting (this is an API call).
        $redirect = 'login.php';
        if ($isOidcSession) {
            $oidcPath = dirname(__DIR__, 3) . '/oidc.php';
            if (is_file($oidcPath)) {
                require_once $oidcPath;
                if (function_exists('oidc_logout_redirect_url')) {
                    $oidcUrl = oidc_logout_redirect_url();
                    if (is_string($oidcUrl) && $oidcUrl !== '') {
                        $redirect = $oidcUrl;
                    }
                }
            }
        }

        session_destroy();
        if (defined('REMEMBER_ME_COOKIE') && isset($_COOKIE[REMEMBER_ME_COOKIE]) && function_exists('setRememberMeCookie')) {
            setRememberMeCookie('', time() - 3600);
        }
        if (function_exists('clearUserPreferenceCookie')) {
            clearUserPreferenceCookie();
        }

        return ['success' => true, 'redirect' => $redirect];
    }

    /**
     * password_changed_at is stored by SQLite CURRENT_TIMESTAMP (UTC); convert
     * it to the viewer's timezone and date format for display.
     */
    private function formatPasswordChangedAt($value) {
        if (empty($value) || !function_exists('convertUtcToUserTimezone')) {
            return $value;
        }
        $pattern = function_exists('getUserDateTimeFormatPattern') ? getUserDateTimeFormatPattern() : null;
        return convertUtcToUserTimezone($value, $pattern ?: 'Y-m-d H:i');
    }

    /**
     * GET /api/v1/users/me/password-status - Check if current user has a custom password
     */
    public function passwordStatus() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $userId = getCurrentUserId();
        if (!$userId) {
            http_response_code(401);
            return ['error' => 'Not authenticated'];
        }
        
        $user = getUserProfileById($userId);

        return [
            'has_custom_password' => hasCustomPassword($userId),
            // A profile provisioned without a credential has no password at
            // all, rather than the default one: the UI must not advertise a
            // default that would no longer be accepted.
            'password_login_available' => hasCustomPassword($userId)
                || !($user && isPasswordLoginDisabled($user)),
            'password_changed_at' => $this->formatPasswordChangedAt($user['password_changed_at'] ?? null)
        ];
    }

    /**
     * POST /api/v1/admin/users/{id}/reset-password - Admin: set or reset a user's password
     */
    public function adminResetPassword($id) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $user = getUserProfileById((int)$id);
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User not found'];
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        $action = $data['action'] ?? 'reset_to_default';
        
        if ($action === 'reset_to_default' || $action === 'reset_to_env') {
            // Clear DB hash, revert to hardcoded default password
            if (!clearUserPasswordHash((int)$id)) {
                http_response_code(500);
                return ['error' => 'Failed to reset password'];
            }
            // A profile provisioned without a credential has no default to
            // fall back on, so clearing the hash leaves it without password
            // login. Say so instead of reporting a reset that restores no access.
            if (isPasswordLoginDisabled($user)) {
                return [
                    'success' => true,
                    // Flags the outcome as needing the admin's attention: the UI
                    // keeps the dialog open on this one instead of closing as it
                    // does for an ordinary reset.
                    'needs_attention' => true,
                    'message' => 'Password cleared. This profile is linked to SSO and has no default password: sign-in goes through the identity provider, or set an explicit password.'
                ];
            }
            return ['success' => true, 'message' => 'Password reset to default'];
        } elseif ($action === 'set_password') {
            $newPassword = $data['new_password'] ?? '';
            if (strlen($newPassword) < 4) {
                http_response_code(400);
                return ['error' => 'Password must be at least 4 characters'];
            }
            if (!setUserPasswordHash((int)$id, $newPassword)) {
                http_response_code(500);
                return ['error' => 'Failed to set password'];
            }
            return ['success' => true, 'message' => 'Password updated successfully'];
        }
        
        http_response_code(400);
        return ['error' => 'Invalid action. Use "reset_to_default" or "set_password"'];
    }

    /**
     * GET /api/v1/admin/users/{id}/password-status - Admin: check user's password status
     */
    public function adminPasswordStatus($id) {
        if ($err = $this->requireAdmin()) return $err;
        
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        $user = getUserProfileById((int)$id);
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User not found'];
        }
        
        return [
            'user_id' => (int)$id,
            'has_custom_password' => hasCustomPassword((int)$id),
            // Kept in sync with /users/me/password-status: without it the admin
            // panel would report "uses the default password" for a profile where
            // the default is rejected.
            'password_login_available' => hasCustomPassword((int)$id) || !isPasswordLoginDisabled($user),
            'password_changed_at' => $this->formatPasswordChangedAt($user['password_changed_at'] ?? null)
        ];
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
                        $recoverStmt = $userCon->prepare("SELECT value FROM settings WHERE key = 'user_profile_username' LIMIT 1");
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

                    // Collect shared workspaces
                    $tableCheck = $userCon->query("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_workspaces'");
                    if ($tableCheck->fetch()) {
                        $stmt = $userCon->query("SELECT token, id FROM shared_workspaces");
                        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                            $st = $masterCon->prepare("INSERT OR REPLACE INTO shared_links (token, user_id, target_type, target_id) VALUES (?, ?, 'workspace', ?)");
                            $st->execute([$row['token'], $userId, (int)$row['id']]);
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
    
    /**
     * GET /api/v1/users/lookup/{username} - Get user ID by username
     * Returns the user ID for a given username
     * Accessible to administrators only (no X-User-ID required)
     */
    public function lookup($username) {
        require_once dirname(__DIR__, 3) . '/users/db_master.php';
        
        if (empty($username)) {
            http_response_code(400);
            return ['error' => 'Username is required'];
        }
        
        $user = getUserProfileByUsername($username);
        
        if (!$user) {
            http_response_code(404);
            return ['error' => 'User not found'];
        }
        
        return [
            'id' => (int)$user['id'],
            'username' => $user['username']
        ];
    }
}
