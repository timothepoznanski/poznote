<?php
/**
 * User Profiles Administration Page
 * 
 * Manage user profiles.
 * Note: This is NOT about passwords - there's one global password.
 * This is about user profiles that each have their own data space.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();

// Only admins can access this page
if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo 'Access denied. Admin privileges required.';
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';


require_once __DIR__ . '/../version_helper.php';

$currentLang = getUserLanguage();
$message = '';
$error = '';

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'create':
            $username = trim($_POST['username'] ?? '');
            
            if (empty($username)) {
                $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                break;
            }
            
            $result = createUserProfile($username);
            
            if ($result['success']) {
                // Succès, on ne met pas de message
            } else {
                $error = $result['error'];
            }
            break;
            

            
        case 'delete':
            $userId = (int)($_POST['user_id'] ?? 0);
            $deleteData = true; // Always delete data when deleting a user now
            
            // Cannot delete yourself
            if ($userId === getCurrentUserId()) {
                $error = t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile');
                break;
            }
            
            $result = deleteUserProfile($userId, $deleteData);
            
            if ($result['success']) {
                // Success, no message
            } else {
                $error = $result['error'];
            }
            break;
        case 'toggle_status':
            $userId = (int)($_POST['user_id'] ?? 0);
            $field = $_POST['field'] ?? '';
            $value = $_POST['value'] ?? 0;
            
            // Cannot modify yourself for some fields
            if ($userId === getCurrentUserId() && ($field === 'is_admin' || $field === 'active')) {
                $error = t('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role');
                break;
            }
            
            $data = [];
            if ($field === 'is_admin' || $field === 'active') {
                $data[$field] = (int)$value;
            } elseif ($field === 'username') {
                $data[$field] = trim((string)$value);
                if (empty($data[$field])) {
                    $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                    break;
                }
            }

            if (!empty($data)) {
                $result = updateUserProfile($userId, $data);
                if (!$result['success']) {
                    $error = $result['error'];
                }
            }
            break;
    }
}

// Get list of user profiles
$users = listAllUserProfiles();

?>
<?php 
// Cache version based on app version to force reload on updates
$v = getAppVersion();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('multiuser.admin.title', [], 'User Management'); ?> - Poznote</title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/fontawesome.min.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/light.min.css?v=<?php echo $v; ?>">
    <link type="text/css" rel="stylesheet" href="../css/brands.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="../css/solid.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="../css/regular.min.css?v=<?php echo $v; ?>"/>
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <style>
        html[data-theme='dark'], body.dark-mode {
            --bg-color: #1a1a1a;
            --bg-secondary: #242424;
            --bg-hover: #2d2d2d;
            --text-color: #e0e0e0;
            --text-muted: #a0a0a0;
            --border-color: #333;
        }

        .admin-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .admin-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        .admin-title {
            font-size: 1.8rem;
            color: var(--text-color, #333);
        }
        .admin-subtitle {
            color: var(--text-muted, #666);
            margin-top: 5px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .btn-primary {
            background: #007DB8;
            color: white;
        }
        .btn-primary:hover {
            background: #006699;
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn-danger:hover {
            background: #c82333;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .btn-small {
            padding: 6px 12px;
            font-size: 12px;
        }
        .users-table {
            width: 100%;
            border-collapse: collapse;
            background: transparent;
            border-radius: 0;
            overflow: visible;
            box-shadow: none;
        }
        
        .users-table th,
        .users-table td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid var(--border-color, #eee);
            color: var(--text-color, #333);
        }

        .users-table th {
            background: transparent;
            font-weight: 600;
            border-top: 2px solid var(--border-color, #eee);
        }

        .users-table tbody tr {
            background: transparent;
        }

        .users-table tr:hover {
            background: var(--bg-hover, rgba(0,0,0,0.02));
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
            color: inherit;
        }
        
        html[data-theme='dark'] .users-table td {
            color: #e0e0e0;
        }
        .user-name {
            font-weight: 500;
        }
        .user-username {
            color: var(--text-color, #333);
            font-size: 0.95em;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s;
            display: inline-block;
        }
        .user-username:hover {
            background: rgba(0, 125, 184, 0.1);
            color: #007DB8;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
        }
        .badge-admin {
            background: #ffc107;
            color: #333;
        }
        .badge-active {
            background: #28a745;
            color: white;
        }
        .badge-inactive {
            background: #dc3545;
            color: white;
        }
        .actions {
            display: flex;
            gap: 8px;
        }
        .message {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .message-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .message-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.active {
            display: flex;
        }
        .modal-content {
            background: var(--bg-color, #fff);
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
        }
        .modal-title {
            font-size: 1.4rem;
            margin-bottom: 20px;
            color: var(--text-color, #333);
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--text-color, #333);
        }
        .form-group input:not([type="checkbox"]),
        .form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 8px;
            font-size: 14px;
            background: var(--bg-color, #fff);
            color: var(--text-color, #333);
        }
        .form-group input:not([type="checkbox"]):focus,
        .form-group select:focus {
            outline: none;
            border-color: #007DB8;
            box-shadow: 0 0 0 3px rgba(0, 125, 184, 0.1);
        }
        .form-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }

        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #007DB8;
            text-decoration: none;
            margin-bottom: 20px;
        }
        .back-link:hover {
            text-decoration: underline;
        }


        .clickable-badge {
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .clickable-badge:hover {
            opacity: 0.8;
            transform: scale(1.05);
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
        }
        .toggle-switch input { 
            opacity: 0;
            width: 0;
            height: 0;
        }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 20px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider {
            background-color: #007DB8;
        }
        input:checked + .slider:before {
            transform: translateX(16px);
        }
        /* Admin specific color */
        input.admin-toggle:checked + .slider {
            background-color: #ffc107;
        }
        
        /* Disabled toggle styling */
        .toggle-switch.disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .toggle-switch.disabled .slider {
            cursor: not-allowed;
        }
        input:disabled + .slider {
            background-color: #ccc;
        }
        input.admin-toggle:disabled:checked + .slider {
            background-color: #ffc107;
        }
    </style>
    <script>
    function toggleUserStatus(userId, field, newValue) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';
        
        const actionInput = document.createElement('input');
        actionInput.name = 'action';
        actionInput.value = 'toggle_status';
        form.appendChild(actionInput);
        
        const idInput = document.createElement('input');
        idInput.name = 'user_id';
        idInput.value = userId;
        form.appendChild(idInput);
        
        const fieldInput = document.createElement('input');
        fieldInput.name = 'field';
        fieldInput.value = field;
        form.appendChild(fieldInput);
        
        const valueInput = document.createElement('input');
        valueInput.name = 'value';
        valueInput.value = newValue;
        form.appendChild(valueInput);
        
        document.body.appendChild(form);
        form.submit();
    }

    function renameUser(userId, currentUsername) {
        document.getElementById('rename_user_id').value = userId;
        document.getElementById('rename_username').value = currentUsername;
        document.getElementById('renameModal').classList.add('active');
        setTimeout(() => document.getElementById('rename_username').focus(), 100);
    }
    
    function submitRename() {
        const userId = document.getElementById('rename_user_id').value;
        const newUsername = document.getElementById('rename_username').value;
        if (newUsername.trim() !== "") {
            toggleUserStatus(userId, 'username', newUsername.trim());
        }
    }
    </script>
</head>
<body>
    <div class="admin-container">
        <a id="backToNotesLink" href="../index.php" class="btn btn-secondary" style="margin-right: 10px;">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>
        <a href="../settings.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_settings'); ?>
        </a>
        <br><br>
        
        <div class="admin-header">
            <div>
                <h1 class="admin-title"><?php echo t_h('multiuser.admin.title', [], 'User Management'); ?></h1>
                <button class="btn btn-primary" onclick="openCreateModal()" style="margin-top: 10px;">
                    <i class="fas fa-plus"></i> <?php echo t_h('multiuser.admin.create_user', [], 'Create Profile'); ?>
                </button>
            </div>
        </div>
        
        <?php if ($message): ?>
            <div class="message message-success"><?php echo htmlspecialchars($message); ?></div>
        <?php endif; ?>
        
        <?php if ($error): ?>
            <div class="message message-error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>
        
        <table class="users-table">
            <thead>
                <tr>
                    <th style="text-align: center; width: 60px;">ID</th>
                    <th><?php echo t_h('multiuser.admin.username', [], 'User'); ?></th>
                    <th style="text-align: center;"><?php echo t_h('multiuser.admin.administrator', [], 'Administrator'); ?></th>
                    <th style="text-align: center;"><?php echo t_h('multiuser.admin.status', [], 'Status'); ?></th>


                    <th style="text-align: center;"><?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($users as $user): ?>
                <tr>
                        <td style="text-align: center; font-family: monospace; color: var(--text-color, #333); font-size: 1.1rem; font-weight: 600;">
                            <?php echo $user['id']; ?>
                        </td>
                        <td>
                            <div class="user-info">
                                <div class="user-username" 
                                     title="<?php echo t_h('multiuser.admin.click_to_rename', [], 'Click to rename'); ?>"
                                     onclick="renameUser(<?php echo $user['id']; ?>, '<?php echo htmlspecialchars($user['username'], ENT_QUOTES); ?>')">
                                    <?php echo htmlspecialchars($user['username']); ?>
                                </div>
                            </div>
                        </td>

                        <td style="text-align: center;">
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
                        <td style="text-align: center;">

                            <?php if ($user['id'] === getCurrentUserId()): ?>
                                <span class="badge badge-active"><?php echo t_h('multiuser.admin.active', [], 'Active'); ?></span>
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


                        <td style="text-align: center;">
                            <div class="actions" style="justify-content: center;">

                                <?php if ($user['id'] !== getCurrentUserId()): ?>
                                    <button class="btn btn-danger btn-small" onclick="openDeleteModal(<?php echo $user['id']; ?>, '<?php echo htmlspecialchars($user['username'], ENT_QUOTES); ?>')">
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
    
    <!-- Create User Modal -->
    <div class="modal" id="createModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.create_user', [], 'Create User Profile'); ?></h2>
            <form method="POST">
                <input type="hidden" name="action" value="create">
                
                <div class="form-group">
                    <input type="text" id="create_username" name="username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?> *" required>
                </div>
                

                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('createModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.create', [], 'Create'); ?></button>
                </div>
            </form>
        </div>
    </div>
    

    
    <!-- Rename User Modal -->
    <div class="modal" id="renameModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.rename_user', [], 'Rename User'); ?></h2>
            <div class="form-group">
                <input type="hidden" id="rename_user_id">
                <input type="text" id="rename_username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?>" onkeydown="if(event.key==='Enter') submitRename()">
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
                
                <p style="color: #dc3545; font-weight: 500; margin-top: 15px;">
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
    
    <script>
        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');
        }
        

        
        function openDeleteModal(userId, username) {
            document.getElementById('delete_user_id').value = userId;
            const messageTemplate = <?php echo json_encode(t('multiuser.admin.confirm_delete', ['username' => 'NAME_HOLDER'], 'Are you sure you want to delete user "NAME_HOLDER"?')); ?>;
            document.getElementById('delete_message').textContent = messageTemplate.replace('NAME_HOLDER', username);
            document.getElementById('deleteModal').classList.add('active');
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
        }
        

        
        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        });
        
        // Close modal on Escape key
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



