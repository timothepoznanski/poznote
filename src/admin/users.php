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
require_once __DIR__ . '/../users/UserDataManager.php';
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
            $displayName = trim($_POST['display_name'] ?? '');
            $color = trim($_POST['color'] ?? '#007DB8');
            $icon = trim($_POST['icon'] ?? 'user');
            
            if (empty($username)) {
                $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                break;
            }
            
            $result = createUserProfile($username, $displayName ?: null, $color, $icon);
            
            if ($result['success']) {
                $message = t('multiuser.admin.user_created', [], 'User profile created successfully');
            } else {
                $error = $result['error'];
            }
            break;
            
        case 'update':
            $userId = (int)($_POST['user_id'] ?? 0);
            $data = [];
            
            if (isset($_POST['display_name'])) {
                $data['display_name'] = trim($_POST['display_name']);
            }
            if (isset($_POST['color'])) {
                $data['color'] = trim($_POST['color']);
            }
            if (isset($_POST['icon'])) {
                $data['icon'] = trim($_POST['icon']);
            }
            if (isset($_POST['is_admin'])) {
                $data['is_admin'] = $_POST['is_admin'] === '1' ? 1 : 0;
            }
            if (isset($_POST['active'])) {
                $data['active'] = $_POST['active'] === '1' ? 1 : 0;
            }
            
            $result = updateUserProfile($userId, $data);
            
            if ($result['success']) {
                $message = t('multiuser.admin.user_updated', [], 'User profile updated successfully');
            } else {
                $error = $result['error'];
            }
            break;
            
        case 'delete':
            $userId = (int)($_POST['user_id'] ?? 0);
            $deleteData = isset($_POST['delete_data']) && $_POST['delete_data'] === '1';
            
            // Cannot delete yourself
            if ($userId === getCurrentUserId()) {
                $error = t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile');
                break;
            }
            
            $result = deleteUserProfile($userId, $deleteData);
            
            if ($result['success']) {
                $message = t('multiuser.admin.user_deleted', [], 'User profile deleted successfully');
            } else {
                $error = $result['error'];
            }
            break;
    }
}

// Get list of user profiles
$users = listAllUserProfiles();

// Add storage info for each user
foreach ($users as &$user) {
    $dataManager = new UserDataManager($user['id']);
    $stats = $dataManager->getStorageStats();
    $user['storage'] = $stats;
    $user['notes_count'] = $dataManager->getNotesCount();
}
unset($user);

// Common icons for user avatars
$availableIcons = [
    'user', 'user-circle', 'user-astronaut', 'user-ninja', 'user-tie',
    'smile', 'star', 'heart', 'sun', 'moon',
    'coffee', 'book', 'laptop', 'code', 'paint-brush',
    'music', 'camera', 'gamepad', 'rocket', 'leaf'
];

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
            background: var(--bg-color, #fff);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .users-table th,
        .users-table td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid var(--border-color, #eee);
        }
        .users-table th {
            background: var(--bg-secondary, #f8f9fa);
            font-weight: 600;
            color: var(--text-color, #333);
        }
        .users-table tr:hover {
            background: var(--bg-hover, #f5f5f5);
        }
        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.2rem;
        }
        .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .user-name {
            font-weight: 500;
        }
        .user-username {
            color: var(--text-muted, #666);
            font-size: 0.9em;
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
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 8px;
            font-size: 14px;
            background: var(--bg-color, #fff);
            color: var(--text-color, #333);
        }
        .form-group input:focus,
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
        .color-picker {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .color-option {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid transparent;
            transition: transform 0.2s;
        }
        .color-option:hover {
            transform: scale(1.1);
        }
        .color-option.selected {
            border-color: #333;
        }
        .icon-picker {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .icon-option {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .icon-option:hover {
            background: var(--bg-hover, #f5f5f5);
        }
        .icon-option.selected {
            border-color: #007DB8;
            background: rgba(0, 125, 184, 0.1);
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
        .storage-info {
            font-size: 0.85em;
            color: var(--text-muted, #666);
        }
    </style>
</head>
<body>
    <div class="admin-container">
        <a href="../settings.php" class="back-link">
            <i class="fas fa-arrow-left"></i>
            <?php echo t_h('common.back_to_settings', [], 'Back to Settings'); ?>
        </a>
        
        <div class="admin-header">
            <div>
                <h1 class="admin-title"><?php echo t_h('multiuser.admin.title', [], 'User Management'); ?></h1>
                <p class="admin-subtitle"><?php echo t_h('multiuser.admin.subtitle', [], 'Manage user profiles and their data spaces'); ?></p>
            </div>
            <button class="btn btn-primary" onclick="openCreateModal()">
                <i class="fas fa-plus"></i> <?php echo t_h('multiuser.admin.create_user', [], 'Create Profile'); ?>
            </button>
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
                    <th><?php echo t_h('multiuser.admin.username', [], 'User'); ?></th>
                    <th><?php echo t_h('multiuser.admin.role', [], 'Role'); ?></th>
                    <th><?php echo t_h('multiuser.admin.status', [], 'Status'); ?></th>
                    <th><?php echo t_h('multiuser.admin.notes_count', [], 'Notes'); ?></th>
                    <th><?php echo t_h('multiuser.admin.storage', [], 'Storage'); ?></th>
                    <th><?php echo t_h('multiuser.admin.last_login', [], 'Last Login'); ?></th>
                    <th><?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($users as $user): ?>
                    <tr>
                        <td>
                            <div class="user-info">
                                <div class="user-avatar" style="background: <?php echo htmlspecialchars($user['color'] ?? '#007DB8'); ?>">
                                    <i class="fas fa-<?php echo htmlspecialchars($user['icon'] ?? 'user'); ?>"></i>
                                </div>
                                <div>
                                    <div class="user-name"><?php echo htmlspecialchars($user['display_name'] ?: $user['username']); ?></div>
                                    <div class="user-username">@<?php echo htmlspecialchars($user['username']); ?></div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <?php if ($user['is_admin']): ?>
                                <span class="badge badge-admin"><?php echo t_h('multiuser.admin.role_admin', [], 'Admin'); ?></span>
                            <?php else: ?>
                                <span class="badge"><?php echo t_h('multiuser.admin.role_user', [], 'User'); ?></span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ($user['active']): ?>
                                <span class="badge badge-active"><?php echo t_h('multiuser.admin.active', [], 'Active'); ?></span>
                            <?php else: ?>
                                <span class="badge badge-inactive"><?php echo t_h('multiuser.admin.inactive', [], 'Inactive'); ?></span>
                            <?php endif; ?>
                        </td>
                        <td><?php echo $user['notes_count']; ?></td>
                        <td class="storage-info">
                            <?php echo formatBytes($user['storage']['total'] ?? 0); ?>
                        </td>
                        <td>
                            <?php if ($user['last_login']): ?>
                                <?php echo date('Y-m-d H:i', strtotime($user['last_login'])); ?>
                            <?php else: ?>
                                <span style="color: var(--text-muted);">-</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div class="actions">
                                <button class="btn btn-secondary btn-small" onclick="openEditModal(<?php echo htmlspecialchars(json_encode($user)); ?>)">
                                    <i class="fas fa-edit"></i>
                                </button>
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
                    <label for="create_username"><?php echo t_h('multiuser.admin.username', [], 'Username'); ?> *</label>
                    <input type="text" id="create_username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="create_display_name"><?php echo t_h('multiuser.admin.display_name', [], 'Display Name'); ?></label>
                    <input type="text" id="create_display_name" name="display_name">
                </div>
                
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-picker">
                        <?php
                        $colors = ['#007DB8', '#28a745', '#dc3545', '#ffc107', '#6f42c1', '#20c997', '#fd7e14', '#6c757d', '#17a2b8', '#e83e8c'];
                        foreach ($colors as $color): ?>
                            <div class="color-option" style="background: <?php echo $color; ?>" data-color="<?php echo $color; ?>" onclick="selectColor(this, 'create')"></div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="create_color" name="color" value="#007DB8">
                </div>
                
                <div class="form-group">
                    <label>Icon</label>
                    <div class="icon-picker">
                        <?php foreach ($availableIcons as $icon): ?>
                            <div class="icon-option <?php echo $icon === 'user' ? 'selected' : ''; ?>" data-icon="<?php echo $icon; ?>" onclick="selectIcon(this, 'create')">
                                <i class="fas fa-<?php echo $icon; ?>"></i>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="create_icon" name="icon" value="user">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('createModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.create', [], 'Create'); ?></button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Edit User Modal -->
    <div class="modal" id="editModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.edit_user', [], 'Edit User Profile'); ?></h2>
            <form method="POST">
                <input type="hidden" name="action" value="update">
                <input type="hidden" name="user_id" id="edit_user_id">
                
                <div class="form-group">
                    <label for="edit_display_name"><?php echo t_h('multiuser.admin.display_name', [], 'Display Name'); ?></label>
                    <input type="text" id="edit_display_name" name="display_name">
                </div>
                
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-picker" id="edit_color_picker">
                        <?php foreach ($colors as $color): ?>
                            <div class="color-option" style="background: <?php echo $color; ?>" data-color="<?php echo $color; ?>" onclick="selectColor(this, 'edit')"></div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="edit_color" name="color">
                </div>
                
                <div class="form-group">
                    <label>Icon</label>
                    <div class="icon-picker" id="edit_icon_picker">
                        <?php foreach ($availableIcons as $icon): ?>
                            <div class="icon-option" data-icon="<?php echo $icon; ?>" onclick="selectIcon(this, 'edit')">
                                <i class="fas fa-<?php echo $icon; ?>"></i>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="edit_icon" name="icon">
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit_is_admin" name="is_admin" value="1">
                        <?php echo t_h('multiuser.admin.role_admin', [], 'Administrator'); ?>
                    </label>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit_active" name="active" value="1">
                        <?php echo t_h('multiuser.admin.active', [], 'Active'); ?>
                    </label>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('editModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
                </div>
            </form>
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
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="delete_data" value="1">
                        <?php echo t_h('multiuser.admin.confirm_delete_data', [], 'Also delete all user data (notes, attachments, etc.)'); ?>
                    </label>
                </div>
                
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
        
        function openEditModal(user) {
            document.getElementById('edit_user_id').value = user.id;
            document.getElementById('edit_display_name').value = user.display_name || '';
            document.getElementById('edit_color').value = user.color || '#007DB8';
            document.getElementById('edit_icon').value = user.icon || 'user';
            document.getElementById('edit_is_admin').checked = user.is_admin == 1;
            document.getElementById('edit_active').checked = user.active == 1;
            
            // Select color
            document.querySelectorAll('#edit_color_picker .color-option').forEach(el => {
                el.classList.toggle('selected', el.dataset.color === user.color);
            });
            
            // Select icon
            document.querySelectorAll('#edit_icon_picker .icon-option').forEach(el => {
                el.classList.toggle('selected', el.dataset.icon === user.icon);
            });
            
            document.getElementById('editModal').classList.add('active');
        }
        
        function openDeleteModal(userId, username) {
            document.getElementById('delete_user_id').value = userId;
            document.getElementById('delete_message').textContent = 
                '<?php echo t_h('multiuser.admin.confirm_delete', ['username' => ''], 'Are you sure you want to delete user'); ?>' + 
                ' "' + username + '"?';
            document.getElementById('deleteModal').classList.add('active');
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
        }
        
        function selectColor(element, prefix) {
            element.parentElement.querySelectorAll('.color-option').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
            document.getElementById(prefix + '_color').value = element.dataset.color;
        }
        
        function selectIcon(element, prefix) {
            element.parentElement.querySelectorAll('.icon-option').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
            document.getElementById(prefix + '_icon').value = element.dataset.icon;
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

<?php
function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}
?>
