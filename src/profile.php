<?php
/**
 * User Profile Page
 * 
 * Allows users to view and edit their profile settings.
 * Note: No password management here - there's a single global password.
 */

require_once __DIR__ . '/auth.php';
requireAuth();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$userId = getCurrentUserId();

// Ensure user is properly logged in with profile
if (!$currentUser || !$userId) {
    header('Location: login.php');
    exit;
}

$message = '';
$error = '';

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'update_profile') {
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
        
        $result = updateUserProfile($userId, $data);
        
        if ($result['success']) {
            // Refresh user data in session
            $updatedUser = getUserProfileById($userId);
            $_SESSION['user'] = $updatedUser;
            $currentUser = $updatedUser;
            $message = t('multiuser.profile.profile_updated', [], 'Profile updated successfully');
        } else {
            $error = $result['error'] ?? 'Unknown error occurred';
        }
    }
}

// Get storage stats
$dataManager = new UserDataManager($userId);
$storageStats = $dataManager->getStorageStats();
$notesCount = $dataManager->getNotesCount();
$attachmentsCount = $dataManager->getAttachmentsCount();

// Available icons
$availableIcons = [
    'user', 'user-circle', 'user-astronaut', 'user-ninja', 'user-tie',
    'smile', 'star', 'heart', 'sun', 'moon',
    'coffee', 'book', 'laptop', 'code', 'paint-brush',
    'music', 'camera', 'gamepad', 'rocket', 'leaf'
];

$colors = ['#007DB8', '#28a745', '#dc3545', '#ffc107', '#6f42c1', '#20c997', '#fd7e14', '#6c757d', '#17a2b8', '#e83e8c'];

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('multiuser.profile.title', [], 'My Profile'); ?> - Poznote</title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/settings.css">
    <link rel="stylesheet" href="css/profile.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js"></script>
</head>
<body>
    <div class="profile-container">
        <a href="settings.php" class="back-link">
            <i class="fa-arrow-left"></i>
            <?php echo t_h('common.back_to_settings', [], 'Back to Settings'); ?>
        </a>
        
        <div class="profile-header">
            <div class="profile-avatar" style="background: <?php echo htmlspecialchars($currentUser['color'] ?? '#007DB8'); ?>">
                <i class="fa-<?php echo htmlspecialchars($currentUser['icon'] ?? 'user'); ?>"></i>
            </div>
            <div class="profile-info">
                <h1><?php echo htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']); ?></h1>
                <p>@<?php echo htmlspecialchars($currentUser['username']); ?>
                    <?php if ($currentUser['is_admin']): ?>
                        <span class="badge badge-admin"><?php echo t_h('multiuser.admin.role_admin', [], 'Admin'); ?></span>
                    <?php endif; ?>
                </p>
            </div>
        </div>
        
        <?php if ($message): ?>
            <div class="message message-success"><?php echo htmlspecialchars($message); ?></div>
        <?php endif; ?>
        
        <?php if ($error): ?>
            <div class="message message-error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>
        
        <!-- Edit Profile Card -->
        <div class="card">
            <h2 class="card-title"><?php echo t_h('multiuser.profile.update_profile', [], 'Edit Profile'); ?></h2>
            <form method="POST">
                <input type="hidden" name="action" value="update_profile">
                
                <div class="form-group">
                    <label for="display_name"><?php echo t_h('multiuser.admin.display_name', [], 'Display Name'); ?></label>
                    <input type="text" id="display_name" name="display_name" 
                           value="<?php echo htmlspecialchars($currentUser['display_name'] ?? ''); ?>">
                </div>
                
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-picker">
                        <?php foreach ($colors as $color): ?>
                            <div class="color-option <?php echo ($currentUser['color'] ?? '#007DB8') === $color ? 'selected' : ''; ?>" 
                                 style="background: <?php echo $color; ?>" 
                                 data-color="<?php echo $color; ?>" 
                                 onclick="selectColor(this)"></div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="color" name="color" value="<?php echo htmlspecialchars($currentUser['color'] ?? '#007DB8'); ?>">
                </div>
                
                <div class="form-group">
                    <label>Icon</label>
                    <div class="icon-picker">
                        <?php foreach ($availableIcons as $icon): ?>
                            <div class="icon-option <?php echo ($currentUser['icon'] ?? 'user') === $icon ? 'selected' : ''; ?>" 
                                 data-icon="<?php echo $icon; ?>" 
                                 onclick="selectIcon(this)">
                                <i class="fa-<?php echo $icon; ?>"></i>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <input type="hidden" id="icon" name="icon" value="<?php echo htmlspecialchars($currentUser['icon'] ?? 'user'); ?>">
                </div>
                
                <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save Changes'); ?></button>
            </form>
        </div>
        
        <!-- Storage Stats Card -->
        <div class="card">
            <h2 class="card-title"><?php echo t_h('multiuser.profile.storage_usage', [], 'Storage Usage'); ?></h2>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value"><?php echo $notesCount; ?></div>
                    <div class="stat-label"><?php echo t_h('multiuser.profile.notes_count', [], 'Notes'); ?></div>
                </div>
                <div class="stat-item">
                    <div class="stat-value"><?php echo $attachmentsCount; ?></div>
                    <div class="stat-label"><?php echo t_h('multiuser.profile.attachments_count', [], 'Attachments'); ?></div>
                </div>
                <div class="stat-item">
                    <div class="stat-value"><?php echo formatBytes($storageStats['total'] ?? 0); ?></div>
                    <div class="stat-label"><?php echo t_h('multiuser.admin.storage', [], 'Total Storage'); ?></div>
                </div>
            </div>
        </div>
        
        <!-- Account Info Card -->
        <div class="card">
            <h2 class="card-title"><?php echo t_h('multiuser.profile.account_info', [], 'Account Information'); ?></h2>
            <div class="info-row">
                <span class="info-label"><?php echo t_h('multiuser.admin.username', [], 'Username'); ?></span>
                <span class="info-value">@<?php echo htmlspecialchars($currentUser['username']); ?></span>
            </div>
            <div class="info-row">
                <span class="info-label"><?php echo t_h('multiuser.profile.created_at', [], 'Account Created'); ?></span>
                <span class="info-value"><?php echo date('Y-m-d', strtotime($currentUser['created_at'])); ?></span>
            </div>
            <?php if ($currentUser['last_login']): ?>
            <div class="info-row">
                <span class="info-label"><?php echo t_h('multiuser.profile.last_login', [], 'Last Login'); ?></span>
                <span class="info-value"><?php echo date('Y-m-d H:i', strtotime($currentUser['last_login'])); ?></span>
            </div>
            <?php endif; ?>
        </div>
    </div>
    
    <script>
        function selectColor(element) {
            document.querySelectorAll('.color-picker .color-option').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
            document.getElementById('color').value = element.dataset.color;
            
            // Update avatar preview
            document.querySelector('.profile-avatar').style.background = element.dataset.color;
        }
        
        function selectIcon(element) {
            document.querySelectorAll('.icon-picker .icon-option').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
            document.getElementById('icon').value = element.dataset.icon;
            
            // Update avatar preview
            var avatar = document.querySelector('.profile-avatar i');
            avatar.className = 'fa-' + element.dataset.icon;
        }
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
