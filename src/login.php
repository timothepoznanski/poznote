<?php
/**
 * Login Page
 * 
 * - Single global password (same credentials for all profiles)
 * - User selects their profile from a dropdown
 */
require 'auth.php';
require_once 'functions.php';
require_once 'oidc.php';
require_once __DIR__ . '/users/db_master.php';

$error = '';
$oidcError = '';

// Load user profiles
$userProfiles = getAllUserProfiles();

// Load configured login display name from global settings
try {
    require_once 'config.php';
    $login_display_name = '';
    try {
        // Get settings from master database
        $currentLang = getGlobalSetting('language', 'en');
        $login_display_name = getGlobalSetting('login_display_name', '');
        $default_workspace = '';
        
        if (!is_string($currentLang) || $currentLang === '') {
            $currentLang = 'en';
        }
        $currentLang = strtolower(trim($currentLang));
        if (!preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $currentLang)) {
            $currentLang = 'en';
        }
    } catch (Exception $e) {
        $login_display_name = '';
        $currentLang = 'en';
        $default_workspace = '';
    }
    if ($login_display_name === false) $login_display_name = '';
} catch (Exception $e) {
    $login_display_name = '';
    $currentLang = 'en';
    $default_workspace = '';
}

// If already authenticated, redirect to home
if (isAuthenticated()) {
    echo '<!DOCTYPE html><html><head>';
    echo '<script type="application/json" id="workspace-redirect-data">{}</script>';
    echo '<script src="js/workspace-redirect.js"></script>';
    echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', $currentLang ?? 'en') . '</body></html>';
    exit;
}

// Login form processing
if ($_POST && isset($_POST['username']) && isset($_POST['password'])) {
    $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
    if (!$showNormalLogin) {
        header('Location: login.php');
        exit;
    }
    $username = $_POST['username'];
    $password = $_POST['password'];
    $rememberMe = isset($_POST['remember_me']) && $_POST['remember_me'] === '1';
    
    // Get selected user profile
    $selectedUserId = isset($_POST['user_profile']) ? (int)$_POST['user_profile'] : null;
    if ($selectedUserId === null && !empty($userProfiles)) {
        $selectedUserId = $userProfiles[0]['id']; // Default to first user
    }
    
    if (authenticate($username, $password, $rememberMe, $selectedUserId)) {
        echo '<!DOCTYPE html><html><head>';
        echo '<script type="application/json" id="workspace-redirect-data">{}</script>';
        echo '<script src="js/workspace-redirect.js"></script>';
        echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', $currentLang ?? 'en') . '</body></html>';
        exit;
    } else {
        $error = t('login.errors.invalid_credentials', [], 'Incorrect username or password.', $currentLang ?? 'en');
    }
}

// OIDC error feedback
if (isset($_GET['oidc_error'])) {
    if ($_GET['oidc_error'] === 'unauthorized') {
        $oidcError = t('login.errors.oidc_unauthorized', [], 'You are not authorized to access this application. Please contact your administrator.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === '1') {
        $oidcError = t('login.errors.oidc_failed', [], 'SSO login failed. Please try again.', $currentLang ?? 'en');
    }
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang ?? 'en', ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : t_h('app.name', [], 'Poznote', $currentLang ?? 'en')); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/login.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js"></script>
    <style>
        .user-profile-selector {
            margin-bottom: 15px;
        }
        .user-profile-selector select {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            background: var(--bg-color, #fff);
            color: var(--text-color, #333);
            cursor: pointer;
        }
        .user-profile-selector select:focus {
            outline: none;
            border-color: #007DB8;
            box-shadow: 0 0 0 3px rgba(0, 125, 184, 0.1);
        }
        .user-profile-selector label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--text-color, #666);
        }
        .user-profile-option {
            display: flex;
            align-items: center;
            gap: 8px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <img src="favicon.ico" alt="<?php echo t_h('app.name', [], 'Poznote', $currentLang ?? 'en'); ?>" class="logo-favicon">
            </div>
            <h1 class="login-title"><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : 'Poznote'); ?></h1>
        </div>
        
        <?php 
        $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
        if ($showNormalLogin): 
        ?>
        <form method="POST">
            <?php if (!empty($userProfiles)): ?>
            <div class="form-group user-profile-selector">
                <label for="user_profile"><?php echo t_h('login.fields.profile', [], 'Profile', $currentLang ?? 'en'); ?></label>
                <select id="user_profile" name="user_profile" required>
                    <?php foreach ($userProfiles as $profile): ?>
                        <option value="<?php echo $profile['id']; ?>" 
                                data-color="<?php echo htmlspecialchars($profile['color'] ?? '#007DB8'); ?>">
                            <?php echo htmlspecialchars($profile['display_name'] ?: $profile['username']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php else: ?>
            <p class="no-profiles-warning"><?php echo t_h('login.no_profiles', [], 'No profiles available. Please contact administrator.', $currentLang ?? 'en'); ?></p>
            <?php endif; ?>
            
            <div class="form-group">
                <input type="text" id="username" name="username" placeholder="<?php echo t_h('login.fields.username', [], 'Username', $currentLang ?? 'en'); ?>" required autofocus autocomplete="username">
            </div>
            <div class="form-group">
                <input type="password" id="password" name="password" placeholder="<?php echo t_h('login.fields.password', [], 'Password', $currentLang ?? 'en'); ?>" required autocomplete="current-password">
                <?php if ($error): ?>
                    <div class="error"><?php echo htmlspecialchars($error); ?></div>
                <?php endif; ?>
            </div>
            
            <div class="form-group remember-me-group">
                <label class="remember-me-label">
                    <input type="checkbox" name="remember_me" value="1" id="remember_me">
                    <span><?php echo t_h('login.remember_me', [], 'Remember me for 30 days', $currentLang ?? 'en'); ?></span>
                </label>
            </div>
            
            <button type="submit" class="login-button"><?php echo t_h('login.button', [], 'Login', $currentLang ?? 'en'); ?></button>
        </form>
        <?php endif; ?>

        <?php if (function_exists('oidc_is_enabled') && oidc_is_enabled()): ?>
            <a class="login-button oidc-button" href="oidc_login.php"<?php if (!$showNormalLogin): ?> autofocus<?php endif; ?>><?php echo t_h('login.oidc_button', ['provider' => (defined('OIDC_PROVIDER_NAME') ? OIDC_PROVIDER_NAME : 'SSO')], 'Continue with SSO', $currentLang ?? 'en'); ?></a>
        <?php endif; ?>

        <?php if ($oidcError): ?>
            <div class="error oidc-error"><?php echo htmlspecialchars($oidcError); ?></div>
        <?php endif; ?>
        <p class="github-link">
            <a href="https://github.com/timothepoznanski/poznote" target="_blank">
                <?php echo t_h('login.documentation', [], 'Poznote documentation', $currentLang ?? 'en'); ?>
            </a>
        </p>
    </div>
    <?php
    $loginConfig = [
        'focusOidc' => !$showNormalLogin && function_exists('oidc_is_enabled') && oidc_is_enabled()
    ];
    ?>
    <script type="application/json" id="login-config"><?php echo json_encode($loginConfig); ?></script>
    <script src="js/login-page.js"></script>
</body>
</html>
