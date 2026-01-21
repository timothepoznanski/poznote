<?php
/**
 * Login Page
 * 
 * - Single global password for authentication
 * - User profile is automatically selected based on credentials
 * - First user created (on install/migration) is always admin
 */
require 'auth.php';
require_once 'functions.php';
require_once 'oidc.php';
require_once __DIR__ . '/users/db_master.php';

$error = '';
$oidcError = '';

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
// Detect language change from selector
if (isset($_GET['lang'])) {
    $requestedLang = strtolower(trim((string)$_GET['lang']));
    if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $requestedLang)) {
        setcookie('login_lang', $requestedLang, [
            'expires' => time() + (86400 * 30),
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        $currentLang = $requestedLang;
    }
} elseif (isset($_COOKIE['login_lang'])) {
    $cookieLang = strtolower(trim((string)$_COOKIE['login_lang']));
    if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $cookieLang)) {
        $currentLang = $cookieLang;
    }
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
    
    // User profile is automatically selected based on credentials (no dropdown)
    // authenticate() handles matching credentials to the appropriate profile
    if (authenticate($username, $password, $rememberMe)) {
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
    } elseif ($_GET['oidc_error'] === 'no_profile') {
        $identifier = $_GET['identifier'] ?? 'unknown';
        $oidcError = t('login.errors.oidc_no_profile', ['identifier' => $identifier], 'No user profile found for "' . $identifier . '". Please contact an administrator to create your profile.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'disabled') {
        $oidcError = t('login.errors.oidc_disabled', [], 'Your account has been disabled by an administrator. Please contact them for more information.', $currentLang ?? 'en');
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
    <link rel="stylesheet" href="css/all.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/login.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js"></script>
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
        // Display warning if default 'admin_change_me' user exists
        $defaultAdminUsername = null;
        try {
            $profiles = getAllUserProfiles();
            foreach ($profiles as $profile) {
                if ($profile['username'] === 'admin_change_me') {
                    $defaultAdminUsername = $profile['username'];
                    break;
                }
            }
        } catch (Exception $e) {}

        if ($defaultAdminUsername): 
        ?>
        <div class="admin-warning" style="background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.875rem; text-align: left; line-height: 1.5;">
            <?php echo t('login.admin_warning', ['username' => $defaultAdminUsername], 'The default administrator account is active with the username <code>' . htmlspecialchars($defaultAdminUsername) . '</code>. Please log in and rename this account for better security.', $currentLang ?? 'en'); ?>
        </div>
        <?php endif; ?>
        
        <?php 
        $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
        if ($showNormalLogin): 
        ?>
        <div class="language-selector" style="margin-bottom: 2rem; text-align: center;">
            <form method="GET" id="lang-form">
                <select name="lang" onchange="this.form.submit()" style="background: none; border: none; font-size: 0.85rem; color: var(--text-muted); cursor: pointer; opacity: 0.8; outline: none; transition: opacity 0.2s;">
                    <?php 
                    $langs = [
                        'en' => 'English',
                        'fr' => 'Français',
                        'es' => 'Español',
                        'de' => 'Deutsch',
                        'pt' => 'Português',
                        'zh-cn' => '简体中文'
                    ];
                    foreach ($langs as $code => $label): ?>
                        <option value="<?php echo $code; ?>" <?php echo ($currentLang === $code) ? 'selected' : ''; ?>>
                            <?php echo $label; ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>

        <form method="POST">
            <div class="form-group">
                <input type="text" id="username" name="username" placeholder="<?php echo t_h('login.fields.username_or_email', [], 'Username or Email', $currentLang ?? 'en'); ?>" required autofocus autocomplete="username">
            </div>
            <div class="form-group">
                <div class="password-wrapper">
                    <input type="password" id="password" name="password" placeholder="<?php echo t_h('login.fields.password', [], 'Password', $currentLang ?? 'en'); ?>" required autocomplete="current-password">
                    <button type="button" class="password-toggle" id="togglePassword" title="<?php echo t_h('login.show_password', [], 'Show password', $currentLang ?? 'en'); ?>">
                        <i class="fa fa-eye"></i>
                    </button>
                </div>
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
        'focusOidc' => !$showNormalLogin && function_exists('oidc_is_enabled') && oidc_is_enabled(),
        'showPasswordTitle' => t('login.show_password', [], 'Show password', $currentLang ?? 'en'),
        'hidePasswordTitle' => t('login.hide_password', [], 'Hide password', $currentLang ?? 'en')
    ];
    ?>
    <script type="application/json" id="login-config"><?php echo json_encode($loginConfig); ?></script>
    <script src="js/login-page.js"></script>
</body>
</html>
