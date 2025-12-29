<?php
// Debug display disabled for production
// (Previously enabled with display_errors / error_reporting for debugging)
require 'auth.php';
require_once 'functions.php';
require_once 'oidc.php';

$error = '';
$oidcError = '';

// Load configured login display name if present
try {
    require_once 'config.php';
    // Open a local PDO connection to read the setting without depending on global db_connect which may die()
    $login_display_name = '';
    try {
        $tmpCon = new PDO('sqlite:' . SQLITE_DATABASE);
        $tmpCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $stmt = $tmpCon->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute(['login_display_name']);
        $login_display_name = $stmt->fetchColumn();

        // Also read preferred language for login page i18n
        $stmt = $tmpCon->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute(['language']);
        $currentLang = $stmt->fetchColumn();
        if (!is_string($currentLang) || $currentLang === '') {
            $currentLang = 'en';
        }
        $currentLang = strtolower(trim($currentLang));
        if (!preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $currentLang)) {
            $currentLang = 'en';
        }

        $tmpCon = null;
    } catch (Exception $e) {
        // ignore DB errors and leave display name empty
        $login_display_name = '';
        $currentLang = 'en';
    }
    if ($login_display_name === false) $login_display_name = '';
} catch (Exception $e) {
    $login_display_name = '';
    $currentLang = 'en';
}

// If already authenticated, redirect to home
if (isAuthenticated()) {
    // Redirect to index with JavaScript to include localStorage workspace
    // Include minimal HTML to ensure proper execution
    echo '<!DOCTYPE html><html><head>';
    echo '<script>
        var workspace = localStorage.getItem("poznote_selected_workspace");
        if (workspace) {
            window.location.href = "index.php?workspace=" + encodeURIComponent(workspace);
        } else {
            window.location.href = "index.php";
        }
    </script>';
    echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', $currentLang ?? 'en') . '</body></html>';
    exit;
}

// Login form processing
if ($_POST && isset($_POST['username']) && isset($_POST['password'])) {
    $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
    if (!$showNormalLogin) {
        // Normal login is disabled, redirect to login page
        header('Location: login.php');
        exit;
    }
    $username = $_POST['username'];
    $password = $_POST['password'];
    $rememberMe = isset($_POST['remember_me']) && $_POST['remember_me'] === '1';
    
    if (authenticate($username, $password, $rememberMe)) {
        // Redirect to index with JavaScript to include localStorage workspace
        // Include minimal HTML to ensure proper execution
        echo '<!DOCTYPE html><html><head>';
        echo '<script>
            var workspace = localStorage.getItem("poznote_selected_workspace");
            if (workspace) {
                window.location.href = "index.php?workspace=" + encodeURIComponent(workspace);
            } else {
                window.location.href = "index.php";
            }
        </script>';
        echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', $currentLang ?? 'en') . '</body></html>';
        exit;
    } else {
        $error = t('login.errors.invalid_credentials', [], 'Incorrect username or password.', $currentLang ?? 'en');
    }
}

// OIDC error feedback (generic)
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
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
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
        $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
        if ($showNormalLogin): 
        ?>
        <form method="POST">
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
            <div class="error" style="margin-top: 0.75rem; text-align: center;"><?php echo htmlspecialchars($oidcError); ?></div>
        <?php endif; ?>
            <p class="github-link">
                <a href="https://github.com/timothepoznanski/poznote" target="_blank">
                    <?php echo t_h('login.documentation', [], 'Poznote documentation', $currentLang ?? 'en'); ?>
                </a>
            </p>
        </div>
        <?php if (!$showNormalLogin && function_exists('oidc_is_enabled') && oidc_is_enabled()): ?>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                var oidcButton = document.querySelector('.oidc-button');
                if (oidcButton) {
                    oidcButton.focus();
                }
            });
        </script>
        <?php endif; ?>
</body>
</html>
