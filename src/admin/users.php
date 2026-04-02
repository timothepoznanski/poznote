<?php
/**
 * User Profiles Administration Page
 * 
 * Manage user profiles.
 * Note: This is NOT about passwords - there's one global password.
 * This is about user profiles that each have their own data space.
 */

// === Authentication & Authorization ===
require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';

// Only admins can access this page
if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding: 20px; font-family: sans-serif; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; margin: 20px;">' . t_h('multiuser.admin.access_denied_admin', [], 'Access denied. Admin privileges required.') . '</div>';
    exit;
}

// === Dependencies ===
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../version_helper.php';

// === Initialize Variables ===
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());
$error = '';

// === Handle Form Actions ===
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        // Create new user profile
        case 'create':
            $username = trim($_POST['username'] ?? '');
            $email = trim($_POST['email'] ?? '');
            
            if (empty($username)) {
                $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                break;
            }
            
            $result = createUserProfile($username, $email);
            
            if ($result['success']) {
                // Redirect to refresh the page and show the new user
                header('Location: ' . $_SERVER['PHP_SELF']);
                exit;
            } else {
                $error = $result['error'];
            }
            break;
            
        // Update existing user profile (username, email, OIDC subject)
        case 'update_profile':
            $userId = (int)($_POST['user_id'] ?? 0);
            $username = trim($_POST['username'] ?? '');
            $email = trim($_POST['email'] ?? '');
            $oidcSubject = trim($_POST['oidc_subject'] ?? '');
            
            if (empty($username)) {
                $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                break;
            }
            
            $result = updateUserProfile($userId, [
                'username' => $username,
                'email' => $email,
                'oidc_subject' => $oidcSubject
            ]);
            
            if ($result['success']) {
                // Redirect to refresh the page
                header('Location: ' . $_SERVER['PHP_SELF']);
                exit;
            } else {
                $error = $result['error'];
            }
            break;
            
        // Delete user profile and all associated data
        case 'delete':
            $userId = (int)($_POST['user_id'] ?? 0);
            $deleteData = true; // Always delete data when deleting a user
            
            // Cannot delete yourself
            if ($userId === getCurrentUserId()) {
                $error = t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile');
                break;
            }
            
            $result = deleteUserProfile($userId, $deleteData);
            
            if ($result['success']) {
                // Redirect to refresh the page
                header('Location: ' . $_SERVER['PHP_SELF']);
                exit;
            } else {
                $error = $result['error'];
            }
            break;
            
        // Toggle user status or admin role
        case 'toggle_status':
            $userId = (int)($_POST['user_id'] ?? 0);
            $field = $_POST['field'] ?? '';
            $value = $_POST['value'] ?? 0;
            
            // Cannot modify yourself
            if ($userId === getCurrentUserId()) {
                $error = t('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role');
                break;
            }
            
            // Only allow toggling active/admin fields
            if ($field === 'active' || $field === 'is_admin') {
                $data = [$field => (int)$value];
                $result = updateUserProfile($userId, $data);
                
                if ($result['success']) {
                    // Redirect to refresh the page
                    header('Location: ' . $_SERVER['PHP_SELF']);
                    exit;
                } else {
                    $error = $result['error'];
                }
            }
            break;
    }
}

// === Get User List ===
$users = listAllUserProfiles();

?>
<?php 
// Cache busting: version based on app version to force reload on updates
$v = getAppVersion();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/markdown.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/kanban.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <style>
        .user-current {
            color: #2E8CFA;
            font-weight: 600;
        }
        [data-theme='dark'] .user-current {
            color: #4a9eff;
        }
    </style>
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>

    <script>
    /**
     * Helper function to submit a form via POST
     * @param {Object} formData - Key-value pairs for form fields
     */
    function submitForm(formData) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';
        
        for (const [name, value] of Object.entries(formData)) {
            const input = document.createElement('input');
            input.name = name;
            input.value = value;
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
    }

    /**
     * Toggle user status (admin, active) via AJAX-style form submission
     */
    function toggleUserStatus(userId, field, newValue, force = false, username = '') {
        // If promoting to admin and not forced, show confirmation modal
        if (field === 'is_admin' && newValue === 1 && !force) {
            openAdminConfirmModal(userId, username);
            return;
        }

        submitForm({
            action: 'toggle_status',
            user_id: userId,
            field: field,
            value: newValue
        });
    }

    /**
     * Open the admin promotion confirmation modal
     */
    function openAdminConfirmModal(userId, username) {
        document.getElementById('admin_confirm_user_id').value = userId;
        const messageTemplate = <?php echo json_encode(t('multiuser.admin.confirm_admin.message', ['username' => 'NAME_HOLDER'], 'Are you sure you want to grant administrator privileges to "NAME_HOLDER"?')); ?>;
        document.getElementById('admin_confirm_message').textContent = messageTemplate.replace('NAME_HOLDER', username);
        document.getElementById('adminConfirmModal').classList.add('active');
    }

    /**
     * Confirm admin promotion from modal
     */
    function confirmAdminPromotion() {
        const userId = document.getElementById('admin_confirm_user_id').value;
        toggleUserStatus(userId, 'is_admin', 1, true);
    }

    /**
     * Open the rename/edit user modal with current user data
     */
    function updateRenameModalTitle(username) {
        document.getElementById('rename_title_user').textContent = username || '';
    }

    function renameUser(userId, currentUsername, currentEmail, currentOidcSubject) {
        document.getElementById('rename_user_id').value = userId;
        document.getElementById('rename_username').value = currentUsername;
        document.getElementById('rename_email').value = currentEmail || '';
        document.getElementById('rename_oidc_subject').value = currentOidcSubject || '';
        updateRenameModalTitle(currentUsername);
        document.getElementById('renameModal').classList.add('active');
    }
    
    /**
     * Submit the rename form with updated user profile data
     */
    function submitRename() {
        submitForm({
            action: 'update_profile',
            user_id: document.getElementById('rename_user_id').value,
            username: document.getElementById('rename_username').value,
            email: document.getElementById('rename_email').value,
            oidc_subject: document.getElementById('rename_oidc_subject').value
        });
    }
    </script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <!-- ========================================
         ADMIN CONTAINER - User Management
         ======================================== -->
    <div class="admin-container">
        <!-- Header with navigation and actions -->
        <div class="admin-header">
            <div>
                <div class="admin-nav" style="justify-content: center;">
                    <a id="backToNotesLink" href="../index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary btn-margin-right">
                        <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                        <?php echo t_h('common.back_to_notes'); ?>
                    </a>
                    <a href="../settings.php" class="btn btn-secondary btn-margin-right">
                        <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                        <?php echo t_h('common.back_to_settings'); ?>
                    </a>
                    <button class="btn btn-primary" onclick="openCreateModal()">
                        <i class="lucide lucide-plus" style="margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.create_user', [], 'Create Profile'); ?>
                    </button>
                </div>
                <p class="email-note">
                    <?php echo t_h('multiuser.admin.email_usage_note', [], 'Email addresses are only used for OIDC authentication if configured. Poznote does not send any emails.'); ?>
                    <br>
                    <?php echo t_h('multiuser.admin.admin_note', [], 'Use the Admin checkbox to grant or revoke administrator privileges for another user.'); ?>
                </p>
            </div>
        </div>
        
        <!-- Error Messages -->
        <?php if ($error): ?>
            <div class="message message-error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>
        
        <!-- Users Table -->
        <div class="table-responsive">
            <table class="users-table">
                <thead>
                    <tr>
                        <th class="text-center col-id"><?php echo t_h('multiuser.admin.id', [], 'ID'); ?></th>
                        <th><?php echo t_h('multiuser.admin.username', [], 'User'); ?></th>
                        <th><?php echo t_h('multiuser.admin.email', [], 'Email'); ?></th>
                        <th class="text-center"><?php echo t_h('multiuser.admin.administrator', [], 'Administrator'); ?></th>
                        <th class="text-center"><?php echo t_h('multiuser.admin.status', [], 'Status'); ?></th>
                        <th class="text-center"><?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($users as $user): ?>
                        <tr class="<?php echo ($user['id'] === getCurrentUserId()) ? 'user-current' : ''; ?>">
                            <td class="text-center user-id-cell" data-label="<?php echo t_h('multiuser.admin.id', [], 'ID'); ?>">
                                <?php echo $user['id']; ?>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.username', [], 'User'); ?>">
                                <div class="user-info">
                                    <div class="user-username">
                                        <?php echo htmlspecialchars($user['username']); ?>
                                        <?php if ($user['is_admin']): ?>
                                            (<?php echo t_h('multiuser.admin.administrator', [], 'Administrator'); ?>)
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>">
                                <div class="user-email <?php echo empty($user['email']) ? 'user-email-empty' : ''; ?>">
                                    <?php echo !empty($user['email']) ? htmlspecialchars($user['email']) : '<em>' . t_h('multiuser.admin.not_defined', [], 'not defined') . '</em>'; ?>
                                </div>
                            </td>

                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.administrator', [], 'Administrator'); ?>">
                                <input
                                    type="checkbox"
                                    <?php echo $user['is_admin'] ? 'checked' : ''; ?>
                                    <?php echo ($user['id'] === 1 || $user['id'] === getCurrentUserId()) ? 'disabled' : ''; ?>
                                    title="<?php echo htmlspecialchars(
                                        $user['id'] === 1
                                            ? t('multiuser.admin.admin_id_1_locked', [], 'Administrator role cannot be removed from user ID 1')
                                            : ($user['id'] === getCurrentUserId()
                                                ? t('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role')
                                                : t('multiuser.admin.toggle_admin', [], 'Grant or revoke administrator privileges')),
                                        ENT_QUOTES,
                                        'UTF-8'
                                    ); ?>"
                                    onchange="this.checked ? toggleUserStatus(<?php echo (int)$user['id']; ?>, 'is_admin', 1, false, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>) : toggleUserStatus(<?php echo (int)$user['id']; ?>, 'is_admin', 0); if(!this.checked) { /* unchecking is direct */ } else { this.checked = false; }">
                            </td>
    
                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.status', [], 'Status'); ?>">
    
                                <?php if ($user['id'] === getCurrentUserId()): ?>
                                    <span class="badge badge-active badge-not-allowed" title="<?php echo t_h('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role'); ?>">
                                        <?php echo t_h('multiuser.admin.active', [], 'Active'); ?>
                                    </span>
                                <?php else: ?>
                                    <?php if ($user['active']): ?>
                                        <span class="badge badge-active clickable-badge" 
                                              title="<?php echo t_h('multiuser.admin.click_to_deactivate', [], 'Click to deactivate'); ?>"
                                              onclick="toggleUserStatus(<?php echo $user['id']; ?>, 'active', 0)">
                                            <?php echo t_h('multiuser.admin.active', [], 'Active'); ?>
                                        </span>
                                    <?php else: ?>
                                        <span class="badge badge-inactive clickable-badge" 
                                              title="<?php echo t_h('multiuser.admin.click_to_activate', [], 'Click to activate'); ?>"
                                              onclick="toggleUserStatus(<?php echo $user['id']; ?>, 'active', 1)">
                                            <?php echo t_h('multiuser.admin.inactive', [], 'Inactive'); ?>
                                        </span>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </td>
    
    
                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?>">
                                <div class="actions actions-center">
                                        <button class="btn btn-secondary btn-small" title="<?php echo t_h('multiuser.admin.edit_user', [], 'Edit User'); ?>" 
                                            onclick="renameUser(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['email'] ?? ''), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['oidc_subject'] ?? ''), ENT_QUOTES); ?>)">
                                        <i class="lucide-pencil"></i>
                                    </button>
                                    
                                        <button type="button" class="btn btn-secondary btn-small password-action-btn" title="<?php echo t_h('multiuser.admin.password_management.reset_password', [], 'Reset Password'); ?>"
                                            data-user-id="<?php echo (int)$user['id']; ?>"
                                            data-username="<?php echo htmlspecialchars($user['username'], ENT_QUOTES, 'UTF-8'); ?>">
                                        <i class="lucide-key"></i>
                                    </button>

                                    <?php if ($user['id'] !== 1 && $user['id'] !== getCurrentUserId()): ?>
                                        <button class="btn btn-danger btn-small" title="<?php echo t_h('common.delete', [], 'Delete'); ?>" 
                                            onclick="openDeleteModal(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>)">
                                            <i class="lucide-trash-2"></i>
                                        </button>
                                    <?php else: ?>
                                        <button class="btn btn-danger btn-small disabled" title="<?php echo htmlspecialchars($user['id'] === 1
                                            ? t('multiuser.admin.delete_id_1_locked', [], 'User ID 1 cannot be deleted')
                                            : t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile'), ENT_QUOTES, 'UTF-8'); ?>" disabled>
                                            <i class="lucide-trash-2"></i>
                                        </button>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- ========================================
         MODALS
         ======================================== -->
    
    <!-- Create User Modal -->
    <div class="modal" id="createModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.create_user', [], 'Create User Profile'); ?></h2>
            <form method="POST">
                <input type="hidden" name="action" value="create">
                
                <div class="form-group">
                    <input type="text" id="create_username" name="username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?> *" required>
                </div>
                <div class="form-group">
                    <input type="email" id="create_email" name="email" placeholder="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('createModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.create', [], 'Create'); ?></button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Rename/Edit User Modal -->
    <div class="modal" id="renameModal">
        <div class="modal-content profile-modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.edit_user', [], 'Edit User Profile'); ?>&nbsp;: <span id="rename_title_user"></span></h2>
            <div class="form-group profile-modal-fields">
                <input type="hidden" id="rename_user_id">
                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.username', [], 'Username'); ?>&nbsp;:</label>
                <input type="text" id="rename_username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?>" oninput="updateRenameModalTitle(this.value)" onkeydown="if(event.key==='Enter') submitRename()">
                
                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.email', [], 'Email'); ?>&nbsp;:</label>
                <input type="email" id="rename_email" placeholder="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>" onkeydown="if(event.key==='Enter') submitRename()">
                
                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.oidc_subject', [], 'OIDC Subject (UUID)'); ?>&nbsp;:</label>
                <small class="profile-modal-help">
                    <?php echo t_h('multiuser.admin.oidc_subject_help', [], 'Optional: UUID from your OIDC provider (LLDAP, Authelia, etc.)'); ?>
                </small>
                <input type="text" id="rename_oidc_subject" placeholder="<?php echo t_h('multiuser.admin.oidc_subject_placeholder', [], 'e.g., 510ec799-02f8-42e0-...');?>" onkeydown="if(event.key==='Enter') submitRename()">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-danger" onclick="closeModal('renameModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-primary" onclick="submitRename()"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div class="modal" id="deleteModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.delete_user', [], 'Delete User Profile'); ?></h2>
            <p id="delete_message"></p>
            <form method="POST">
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="user_id" id="delete_user_id">
                
                <p class="delete-warning">
                    <i class="lucide-alert-triangle"></i> 
                    <?php echo t_h('multiuser.admin.delete_warning_all_data', [], 'All user data (notes, attachments, etc.) will be permanently deleted.'); ?>
                </p>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('deleteModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-danger"><?php echo t_h('common.delete', [], 'Delete'); ?></button>
                </div>
            </form>
        </div>
    </div>

    <!-- Admin Promotion Confirmation Modal -->
    <div class="modal" id="adminConfirmModal">
        <div class="modal-content" style="max-width: 600px;">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.confirm_admin.title', [], 'Confirm Promotion to Administrator'); ?></h2>
            <p id="admin_confirm_message"></p>
            
            <div class="admin-privileges-box" style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid var(--border-color);">
                <p style="font-weight: bold; margin-bottom: 10px; color: var(--text-primary);">
                    <?php echo t_h('multiuser.admin.confirm_admin.privileges_title', [], 'The administrator will be able to:'); ?>
                </p>
                <ul style="margin-left: 20px; color: var(--text-secondary); line-height: 1.6;">
                    <li><i class="lucide-download" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_notes', [], 'Export notes from any user into a ZIP file'); ?></li>
                    <li><i class="lucide-key" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_passwords', [], 'Change passwords of all other users'); ?></li>
                    <li><i class="lucide-users" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_admin_panel', [], 'Access this user management panel'); ?></li>
                </ul>
            </div>

            <div class="form-actions">
                <input type="hidden" id="admin_confirm_user_id">
                <button type="button" class="btn btn-secondary btn-cancel-admin" onclick="closeModal('adminConfirmModal'); location.reload();"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-primary" onclick="confirmAdminPromotion()"><?php echo t_h('multiuser.admin.confirm_admin.confirm_button', [], 'Confirm admin promotion'); ?></button>
            </div>
        </div>
    </div>
    
    <!-- Password Management Modal -->
    <div class="modal" id="passwordModal">
        <div class="modal-content password-modal-content">
            <div class="password-modal-header">
                <div class="password-modal-heading">
                    <h2 class="modal-title"><?php echo t_h('multiuser.admin.password_management.manage_password', [], 'Password'); ?> : <span id="pw_title_user"></span></h2>
                    <p id="pw_status_summary" class="password-status-summary"><?php echo t_h('common.loading', [], 'Loading...'); ?></p>
                </div>
            </div>
            <input type="hidden" id="pw_user_id">
            <div class="password-meta-row">
                <div id="pw_status" class="password-status-text"></div>
            </div>
            
            <div class="form-group password-form-group">
                <input type="password" id="pw_new_password" placeholder="<?php echo t_h('multiuser.admin.new_password', [], 'New password'); ?>" autocomplete="new-password">
            </div>
            
            <div id="pw_error" class="password-feedback password-feedback-error" style="display: none;"></div>
            <div id="pw_success" class="password-feedback password-feedback-success" style="display: none;"></div>
            
            <div class="form-actions password-modal-actions">
                <button type="button" class="btn btn-danger" onclick="closeModal('passwordModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-secondary" id="pw_reset_btn" onclick="resetPasswordToEnv()"><?php echo t_h('multiuser.admin.password_management.reset_to_default', [], 'Reset to default'); ?></button>
                <button type="button" class="btn btn-primary" id="pw_save_btn" onclick="setNewPassword()"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </div>
    </div>

    <!-- ========================================
         JAVASCRIPT - Modal & Form Handlers
         ======================================== -->
    <script>
        // === Modal Management ===
        
        /**
         * Open the create user modal
         */
        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');

        }
        
        /**
         * Open the delete user confirmation modal
         */
        function openDeleteModal(userId, username) {
            document.getElementById('delete_user_id').value = userId;
            const messageTemplate = <?php echo json_encode(t('multiuser.admin.confirm_delete', ['username' => 'NAME_HOLDER'], 'Are you sure you want to delete user "NAME_HOLDER"?')); ?>;
            document.getElementById('delete_message').textContent = messageTemplate.replace('NAME_HOLDER', username);
            document.getElementById('deleteModal').classList.add('active');
        }
        
        /**
         * Close a modal by ID
         */
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
        }
        
        // === Password Management ===
        
        function setPasswordStatusDisplay(data) {
            var statusEl = document.getElementById('pw_status');
            var statusSummary = document.getElementById('pw_status_summary');
            var resetBtn = document.getElementById('pw_reset_btn');
            var statusRow = statusEl ? statusEl.parentElement : null;
            if (!statusEl || !statusSummary || !statusRow) return;

            if (data && data.has_custom_password) {
                statusSummary.textContent = <?php echo json_encode(t('multiuser.admin.password_management.status_custom_detail', [], 'This user uses a custom password.')); ?>;
                statusEl.textContent = data.password_changed_at
                    ? <?php echo json_encode(t('multiuser.admin.password_management.changed_at_prefix', [], 'Updated:')); ?> + ' ' + data.password_changed_at
                    : '';
                if (resetBtn) resetBtn.style.display = 'inline-block';
            } else {
                statusSummary.textContent = <?php echo json_encode(t('multiuser.admin.password_management.status_default_detail', [], 'This user uses the default password.')); ?>;
                statusEl.textContent = '';
                if (resetBtn) resetBtn.style.display = 'none';
            }

            statusRow.style.display = statusEl.textContent.trim() === '' ? 'none' : 'flex';
        }

        function loadPasswordStatus(userId) {
            var statusEl = document.getElementById('pw_status');
            var statusSummary = document.getElementById('pw_status_summary');
            var statusRow = statusEl ? statusEl.parentElement : null;
            if (statusEl) statusEl.textContent = <?php echo json_encode(t('common.loading', [], 'Loading...')); ?>;
            if (statusSummary) {
                statusSummary.textContent = <?php echo json_encode(t('common.loading', [], 'Loading...')); ?>;
            }
            if (statusRow) {
                statusRow.style.display = 'none';
            }

            return fetch('/api/v1/admin/users/' + userId + '/password-status', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            })
            .then(r => r.json())
            .then(data => {
                setPasswordStatusDisplay(data);
                return data;
            })
            .catch(() => {
                if (statusEl) statusEl.textContent = '';
                if (statusRow) statusRow.style.display = 'none';
            });
        }

        function openPasswordModal(userId, username) {
            document.getElementById('pw_user_id').value = userId;
            document.getElementById('pw_title_user').textContent = username;
            document.getElementById('pw_new_password').value = '';
            document.getElementById('pw_error').style.display = 'none';
            document.getElementById('pw_success').style.display = 'none';
            document.getElementById('passwordModal').classList.add('active');
            loadPasswordStatus(userId);
        }
        
        function setNewPassword() {
            var userId = document.getElementById('pw_user_id').value;
            var newPw = document.getElementById('pw_new_password').value;
            var errorEl = document.getElementById('pw_error');
            var successEl = document.getElementById('pw_success');
            
            errorEl.style.display = 'none';
            successEl.style.display = 'none';
            
            if (!newPw || newPw.length < 4) {
                errorEl.textContent = <?php echo json_encode(t('password.errors.too_short', [], 'Password must be at least 4 characters')); ?>;
                errorEl.style.display = 'block';
                return;
            }
            
            fetch('/api/v1/admin/users/' + userId + '/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'set_password', new_password: newPw })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    closeModal('passwordModal');
                } else {
                    errorEl.textContent = data.error || 'Error';
                    errorEl.style.display = 'block';
                }
            })
            .catch(() => {
                errorEl.textContent = 'Error';
                errorEl.style.display = 'block';
            });
        }
        
        function resetPasswordToEnv() {
            var userId = document.getElementById('pw_user_id').value;
            var errorEl = document.getElementById('pw_error');
            var successEl = document.getElementById('pw_success');
            
            errorEl.style.display = 'none';
            successEl.style.display = 'none';
            
            fetch('/api/v1/admin/users/' + userId + '/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'reset_to_env' })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    closeModal('passwordModal');
                } else {
                    errorEl.textContent = data.error || 'Error';
                    errorEl.style.display = 'block';
                }
            })
            .catch(() => {
                errorEl.textContent = 'Error';
                errorEl.style.display = 'block';
            });
        }

        // === Event Listeners ===
        
        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        });

        document.querySelectorAll('.password-action-btn').forEach(function(button) {
            button.addEventListener('click', function () {
                openPasswordModal(this.getAttribute('data-user-id'), this.getAttribute('data-username'));
            });
        });
        
        // Close modal when pressing Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    </script>
</body>
</html>



