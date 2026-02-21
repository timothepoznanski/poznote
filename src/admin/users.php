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
            
            // Only allow toggling is_admin and active fields
            if ($field === 'is_admin' || $field === 'active') {
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
    <link rel="stylesheet" href="../css/fontawesome.min.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/light.min.css?v=<?php echo $v; ?>">
    <link type="text/css" rel="stylesheet" href="../css/brands.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="../css/solid.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="../css/regular.min.css?v=<?php echo $v; ?>"/>
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
    function toggleUserStatus(userId, field, newValue) {
        submitForm({
            action: 'toggle_status',
            user_id: userId,
            field: field,
            value: newValue
        });
    }

    /**
     * Open the rename/edit user modal with current user data
     */
    function renameUser(userId, currentUsername, currentEmail, currentOidcSubject) {
        document.getElementById('rename_user_id').value = userId;
        document.getElementById('rename_username').value = currentUsername;
        document.getElementById('rename_email').value = currentEmail || '';
        document.getElementById('rename_oidc_subject').value = currentOidcSubject || '';
        document.getElementById('renameModal').classList.add('active');
        setTimeout(() => document.getElementById('rename_username').focus(), 100);
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
                    <a id="backToNotesLink" href="../index.php" class="btn btn-secondary btn-margin-right">
                        <?php echo t_h('common.back_to_notes'); ?>
                    </a>
                    <a href="../settings.php" class="btn btn-secondary btn-margin-right">
                        <?php echo t_h('common.back_to_settings'); ?>
                    </a>
                    <button class="btn btn-primary" onclick="openCreateModal()">
                        <i class="fas fa-plus"></i> <?php echo t_h('multiuser.admin.create_user', [], 'Create Profile'); ?>
                    </button>
                </div>
                <p class="email-note">
                    <?php echo t_h('multiuser.admin.email_usage_note', [], 'Email addresses are only used for OIDC authentication if configured. Poznote does not send any emails.'); ?>
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
                    <tr>
                            <td class="text-center user-id-cell" data-label="<?php echo t_h('multiuser.admin.id', [], 'ID'); ?>">
                                <?php echo $user['id']; ?>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.username', [], 'User'); ?>">
                                <div class="user-info">
                                    <div class="user-username">
                                        <?php echo htmlspecialchars($user['username']); ?>
                                    </div>
                                </div>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>">
                                <div class="user-email <?php echo empty($user['email']) ? 'user-email-empty' : ''; ?>">
                                    <?php echo !empty($user['email']) ? htmlspecialchars($user['email']) : '<em>' . t_h('multiuser.admin.not_defined', [], 'not defined') . '</em>'; ?>
                                </div>
                            </td>
    
                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.administrator', [], 'Administrator'); ?>">
                                <?php if ($user['id'] === getCurrentUserId()): ?>
                                    <label class="toggle-switch disabled" title="<?php echo t_h('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role'); ?>">
                                        <input type="checkbox" class="admin-toggle" 
                                               <?php echo $user['is_admin'] ? 'checked' : ''; ?> disabled>
                                        <span class="slider"></span>
                                    </label>
                                <?php else: ?>
                                    <label class="toggle-switch" title="<?php echo t_h('multiuser.admin.toggle_admin', [], 'Toggle Admin Role'); ?>">
                                        <input type="checkbox" class="admin-toggle" 
                                               <?php echo $user['is_admin'] ? 'checked' : ''; ?>
                                               onchange="toggleUserStatus(<?php echo $user['id']; ?>, 'is_admin', this.checked ? 1 : 0)">
                                        <span class="slider"></span>
                                    </label>
                                <?php endif; ?>
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
    
    
                            <td class="text-center <?php echo ($user['id'] === getCurrentUserId()) ? 'hide-on-mobile' : ''; ?>" data-label="<?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?>">
                                <div class="actions actions-center">
                                        <button class="btn btn-secondary btn-small" title="<?php echo t_h('multiuser.admin.edit_user', [], 'Edit User'); ?>" 
                                            onclick="renameUser(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['email'] ?? ''), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['oidc_subject'] ?? ''), ENT_QUOTES); ?>)">
                                        <i class="fas fa-edit"></i>
                                    </button>

                                    <?php if ($user['id'] !== getCurrentUserId()): ?>
                                        <button class="btn btn-danger btn-small" title="<?php echo t_h('common.delete', [], 'Delete'); ?>" 
                                            onclick="openDeleteModal(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    <?php else: ?>
                                        <button class="btn btn-danger btn-small disabled" title="<?php echo t_h('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile'); ?>" disabled>
                                            <i class="fas fa-trash"></i>
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
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.edit_user', [], 'Edit User Profile'); ?></h2>
            <div class="form-group">
                <input type="hidden" id="rename_user_id">
                <label style="display: block; margin-bottom: 5px; font-size: 0.85rem; color: var(--text-muted);"><?php echo t_h('multiuser.admin.username', [], 'Username'); ?></label>
                <input type="text" id="rename_username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?>" onkeydown="if(event.key==='Enter') submitRename()" style="margin-bottom: 15px;">
                
                <label style="display: block; margin-bottom: 5px; font-size: 0.85rem; color: var(--text-muted);"><?php echo t_h('multiuser.admin.email', [], 'Email'); ?></label>
                <input type="email" id="rename_email" placeholder="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>" onkeydown="if(event.key==='Enter') submitRename()" style="margin-bottom: 15px;">
                
                <label style="display: block; margin-bottom: 5px; font-size: 0.85rem; color: var(--text-muted);"><?php echo t_h('multiuser.admin.oidc_subject', [], 'OIDC Subject (UUID)'); ?></label>
                <input type="text" id="rename_oidc_subject" placeholder="<?php echo t_h('multiuser.admin.oidc_subject_placeholder', [], 'e.g., 510ec799-02f8-42e0-...');?>" onkeydown="if(event.key==='Enter') submitRename()">
                <small style="display: block; margin-top: 5px; font-size: 0.75rem; color: var(--text-muted);">
                    <?php echo t_h('multiuser.admin.oidc_subject_help', [], 'Optional: UUID from your OIDC provider (LLDAP, Authelia, etc.)'); ?>
                </small>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal('renameModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
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
                    <i class="fas fa-exclamation-triangle"></i> 
                    <?php echo t_h('multiuser.admin.delete_warning_all_data', [], 'All user data (notes, attachments, etc.) will be permanently deleted.'); ?>
                </p>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('deleteModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-danger"><?php echo t_h('common.delete', [], 'Delete'); ?></button>
                </div>
            </form>
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
            setTimeout(() => document.getElementById('create_username').focus(), 100);
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
        
        // === Event Listeners ===
        
        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
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



