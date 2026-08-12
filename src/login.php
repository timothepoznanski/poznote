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
require_once 'version_helper.php';
require_once __DIR__ . '/users/db_master.php';

// Cache-busting version for the login page assets; without it browsers keep
// stale copies of login.css / login-page.js across releases
$loginAssetV = rawurlencode(getAppVersion());

// Set security headers for login page
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self';");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: strict-origin-when-cross-origin");

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
    }
    if ($login_display_name === false) $login_display_name = '';
} catch (Exception $e) {
    $login_display_name = '';
    $currentLang = 'en';
}

$redirectAfter = oidc_sanitize_redirect($_POST['redirect'] ?? $_GET['redirect'] ?? ($_SESSION['post_login_redirect'] ?? null));
if ($redirectAfter !== null) {
    $_SESSION['post_login_redirect'] = $redirectAfter;
}

// The login page is pre-auth, so there is no user preference to read yet: pick
// the language from the browser's Accept-Language header, falling back to the
// instance language configured in the settings.
// The same detection runs again once the session is open (poznoteSyncUserLanguage
// in db_connect.php), which is what carries this language into the interface for
// users who never chose one in their settings.
$browserLang = poznoteDetectBrowserLanguage($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '', poznoteSupportedLanguages());
if ($browserLang !== null) {
    $currentLang = $browserLang;
}

// Generate CSRF token for login form
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function poznoteRenderLoginRedirectAndExit(?string $redirectAfter, string $currentLang): void {
    $redirectConfig = [];
    if ($redirectAfter !== null) {
        $redirectConfig['redirectAfter'] = $redirectAfter;
        unset($_SESSION['post_login_redirect']);
    }

    echo '<!DOCTYPE html><html><head>';
    echo '<script type="application/json" id="workspace-redirect-data">' . json_encode($redirectConfig) . '</script>';
    echo '<script src="js/workspace-redirect.js?v=' . rawurlencode(getAppVersion()) . '"></script>';
    echo '</head><body>' . t_h('login.redirecting', [], 'Redirecting...', $currentLang) . '</body></html>';
    exit;
}

$renderAccountSelection = false;
$accountSelectionProfiles = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'select_account') {
    if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'])) {
        $error = t('login.account_select.invalid', [], 'Unable to select this account.', $currentLang ?? 'en');
    } else {
        $selectedAccountId = (int)($_POST['account_user_id'] ?? 0);
        if (selectAuthenticatedAccount($selectedAccountId)) {
            poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang ?? 'en');
        }
        $error = t('login.account_select.invalid', [], 'Unable to select this account.', $currentLang ?? 'en');
    }

    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// If already authenticated, redirect to home
if (isAuthenticated()) {
    poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang ?? 'en');
}

if (isAccountSelectionRequired()) {
    $accountSelectionProfiles = getPendingAccountSelectionProfiles();
    if (count($accountSelectionProfiles) === 1 && selectAuthenticatedAccount((int)$accountSelectionProfiles[0]['id'])) {
        poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang ?? 'en');
    }
    $renderAccountSelection = true;
}

// Login form processing
if ($_POST && ($_POST['action'] ?? '') !== 'select_account' && isset($_POST['username']) && isset($_POST['password'])) {
    // POZNOTE_OIDC_DISABLE_NORMAL_LOGIN is the only switch that blocks password
    // authentication, and it is enforced server-side here as well as in the form.
    $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
    if (!$showNormalLogin) {
        header('Location: login.php');
        exit;
    }
    // Validate CSRF token
    if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'])) {
        $error = t('login.errors.invalid_credentials', [], 'Incorrect username or password.', $currentLang ?? 'en');
        goto render_page;
    }
    $username = $_POST['username'];
    $password = $_POST['password'];
    $rememberMe = isset($_POST['remember_me']) && $_POST['remember_me'] === '1';
    
    // User profile is automatically selected based on credentials (no dropdown)
    // authenticate() handles matching credentials to the appropriate profile
    if (authenticate($username, $password, $rememberMe)) {
        if (isAccountSelectionRequired()) {
            $renderAccountSelection = true;
            $accountSelectionProfiles = getPendingAccountSelectionProfiles();
            goto render_page;
        }

        poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang ?? 'en');
    } else {
        $error = t('login.errors.invalid_credentials', [], 'Incorrect username or password.', $currentLang ?? 'en');
    }
    // Regenerate CSRF token after login attempt
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
render_page:

$renderAccountSelection = isAccountSelectionRequired();
$accountSelectionProfiles = $renderAccountSelection ? getPendingAccountSelectionProfiles() : [];
$authenticatedUser = $renderAccountSelection ? getAuthenticatedUser() : null;

// OIDC error feedback
if (isset($_GET['oidc_error'])) {
    if ($_GET['oidc_error'] === 'unauthorized') {
        $oidcError = t('login.errors.oidc_unauthorized', [], 'You are not authorized to access this application. Please contact your administrator.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'no_profile') {
        $identifier = $_GET['identifier'] ?? 'unknown';
        $oidcError = t('login.errors.oidc_no_profile', ['identifier' => $identifier], 'No user profile found for "' . $identifier . '". Please contact an administrator to create your profile.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'signup_limit') {
        $oidcError = t('login.errors.oidc_signup_limit', [], 'This instance is not accepting new accounts. Please contact the administrator.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'disabled') {
        $oidcError = t('login.errors.oidc_disabled', [], 'Your account has been disabled by an administrator. Please contact them for more information.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === '1') {
        $defaultMsg = t('login.errors.oidc_failed', [], 'SSO login failed. Please try again.', $currentLang ?? 'en');
        // If a detailed error message is provided in the URL, display it (for debugging)
        if (isset($_GET['msg']) && is_string($_GET['msg']) && $_GET['msg'] !== '') {
            $oidcError = $defaultMsg . ' (' . htmlspecialchars($_GET['msg']) . ')';
        } else {
            $oidcError = $defaultMsg;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang ?? 'en', ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : t_h('app.name', [], 'Poznote', $currentLang ?? 'en')); ?></title>
    <meta name="theme-color" content="#111827">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Poznote">
    <meta name="color-scheme" content="dark light">
    <link rel="manifest" href="pwa/manifest.webmanifest">
    <link rel="apple-touch-icon" href="pwa/poznote.png">
    <script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <script src="pwa/pwa.js" defer></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/login.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $loginAssetV; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $loginAssetV; ?>">
    <link rel="icon" href="favicon.ico" sizes="512x512" type="image/png">
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
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
        // Password login is governed solely by POZNOTE_OIDC_DISABLE_NORMAL_LOGIN.
        // The form is either rendered and usable, or not rendered at all.
        $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
        $passwordLoginVisible = $showNormalLogin;
        ?>

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
        <div class="admin-warning">
            <?php echo t('login.admin_warning', ['username' => $defaultAdminUsername], 'The default administrator account is active with the username <code>' . htmlspecialchars($defaultAdminUsername) . '</code>. Please log in and rename this account for better security.', $currentLang ?? 'en'); ?>
        </div>
        <?php endif; ?>
        
        <?php if ($renderAccountSelection): ?>
            <?php $authenticatedUsername = is_array($authenticatedUser) ? (string)($authenticatedUser['username'] ?? '') : ''; ?>
            <div class="account-select-panel">
                <p class="account-select-intro">
                    <?php echo t_h('login.account_select.intro', ['username' => $authenticatedUsername], 'Choose the note account to open.', $currentLang ?? 'en'); ?>
                </p>

                <?php if ($error): ?>
                    <div class="error account-select-error"><?php echo htmlspecialchars($error); ?></div>
                <?php endif; ?>

                <form method="POST" class="account-select-form">
                    <input type="hidden" name="action" value="select_account">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                    <?php if ($redirectAfter !== null): ?>
                        <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                    <?php endif; ?>
                    <div class="account-select-list">
                        <?php foreach ($accountSelectionProfiles as $profile): ?>
                            <?php $isOwnAccount = (int)$profile['id'] === (int)($authenticatedUser['id'] ?? 0); ?>
                            <button type="submit" name="account_user_id" value="<?php echo (int)$profile['id']; ?>" class="account-option">
                                <span class="account-option-name"><?php echo htmlspecialchars($profile['username'] ?? '', ENT_QUOTES, 'UTF-8'); ?></span>
                                <?php if ($isOwnAccount): ?>
                                    <span class="account-option-badge"><?php echo t_h('login.account_select.own_account', [], 'Your account', $currentLang ?? 'en'); ?></span>
                                <?php endif; ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                </form>

                <a class="account-select-logout" href="logout.php"><?php echo t_h('login.account_select.sign_out', [], 'Sign out', $currentLang ?? 'en'); ?></a>
            </div>
        <?php else: ?>
            <?php if ($showNormalLogin): ?>
            <form method="POST" class="password-login-form">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                <?php if ($redirectAfter !== null): ?>
                    <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                <?php endif; ?>
                <div class="form-group">
                    <input type="text" id="username" name="username" placeholder="<?php echo t_h('login.fields.username_or_email', [], 'Username or Email', $currentLang ?? 'en'); ?>" required autofocus autocomplete="username">
                </div>
                <div class="form-group">
                    <div class="password-wrapper">
                        <input type="password" id="password" name="password" placeholder="<?php echo t_h('login.fields.password', [], 'Password', $currentLang ?? 'en'); ?>" required autocomplete="current-password">
                        <button type="button" class="password-toggle" id="togglePassword" title="<?php echo t_h('login.show_password', [], 'Show password', $currentLang ?? 'en'); ?>">
                            <i class="lucide lucide-eye"></i>
                        </button>
                    </div>
                    <?php if ($error): ?>
                        <div class="error"><?php echo htmlspecialchars($error); ?></div>
                    <?php endif; ?>
                </div>

                <div class="form-group remember-me-group remember-me-unified">
                    <label class="remember-me-label">
                        <input type="checkbox" name="remember_me" value="1" id="remember_me">
                        <span><?php echo t_h('login.remember_me', [], 'Remember me for 30 days', $currentLang ?? 'en'); ?></span>
                    </label>
                </div>
                <button type="submit" class="login-button"><?php echo t_h('login.button', [], 'Login', $currentLang ?? 'en'); ?></button>
            </form>
            <?php endif; ?>

            <?php if (function_exists('oidc_is_enabled') && oidc_is_enabled()): ?>
                <?php if ($showNormalLogin): ?>
                    <div class="oidc-divider">
                        <span><?php echo t_h('login.or', [], 'or', $currentLang ?? 'en'); ?></span>
                    </div>
                <?php endif; ?>

                <a class="login-button oidc-button" href="#" id="oidc-login-btn"<?php if (!$passwordLoginVisible): ?> autofocus<?php endif; ?>><?php echo t_h('login.oidc_button', ['provider' => (defined('OIDC_PROVIDER_NAME') ? OIDC_PROVIDER_NAME : 'SSO')], 'Continue with SSO', $currentLang ?? 'en'); ?></a>
                <a class="login-button oidc-button oidc-other-account-button" href="#" id="oidc-other-account-btn" hidden style="display:none"><?php echo t_h('login.oidc_other_account', [], 'Sign in with another account', $currentLang ?? 'en'); ?></a>
            <?php endif; ?>
            
            <?php if ($oidcError): ?>
                <div class="error oidc-error"><?php echo htmlspecialchars($oidcError); ?></div>
            <?php endif; ?>

            <p class="github-link">
                <a href="https://poznote.com" target="_blank">poznote.com</a>
            </p>
        <?php endif; ?>
    </div>
    <?php
    $loginConfig = [
        'focusOidc' => !$renderAccountSelection && !$passwordLoginVisible && function_exists('oidc_is_enabled') && oidc_is_enabled(),
        'showPasswordTitle' => t('login.show_password', [], 'Show password', $currentLang ?? 'en'),
        'hidePasswordTitle' => t('login.hide_password', [], 'Hide password', $currentLang ?? 'en'),
        'oidcEnabled' => !$renderAccountSelection && function_exists('oidc_is_enabled') && oidc_is_enabled(),
        // Template for the OIDC button when the last SSO account is remembered on
        // this device; {{account}} is replaced client-side with the stored email
        'oidcAccountButtonTemplate' => t('login.oidc_button_account', [], 'Continue with {{account}}', $currentLang ?? 'en'),
        'redirectAfter' => $redirectAfter
    ];
    ?>
    <script type="application/json" id="login-config"><?php echo json_encode($loginConfig); ?></script>
    <script src="js/login-page.js?v=<?php echo $loginAssetV; ?>"></script>
</body>
</html>
