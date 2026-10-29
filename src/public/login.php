<?php
/**
 * Login Page
 * 
 * - Single global password for authentication
 * - User profile is automatically selected based on credentials
 * - First user created (on install/migration) is always admin
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../functions.php';
require_once 'oidc.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../lib/default-credentials.php';

// Set security headers for login page
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self';");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: strict-origin-when-cross-origin");

$error = '';
$oidcError = '';
// No autofocus right after a logout: on a phone it pops the keyboard up.
$justLoggedOut = consumeJustLoggedOutCookie();

// Load configured login display name from global settings
try {
    require_once __DIR__ . '/../config.php';
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
    echo '<script src="' . poznoteAsset('js/workspace-redirect.js') . '"></script>';
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

// Second step of a password login on a profile with two-factor on. The
// password was accepted by authenticate(), which parked the login in the
// session instead of opening it; this finishes or abandons it.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($_POST['action'] ?? '', ['totp_verify', 'totp_cancel'], true)) {
    $totpAction = $_POST['action'];
    if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'])) {
        $error = t('login.two_factor.invalid_code', [], 'Incorrect code. Try again.', $currentLang);
    } elseif ($totpAction === 'totp_cancel') {
        cancelTotpLoginChallenge();
    } elseif (getPendingTotpLoginChallenge() === null) {
        $error = t('login.two_factor.expired', [], 'The verification step expired. Sign in again.', $currentLang);
    } elseif (completeTotpLoginChallenge((string)($_POST['totp_code'] ?? ''))) {
        if (!isAccountSelectionRequired()) {
            poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang);
        }
    } elseif (getPendingTotpLoginChallenge() === null) {
        // Last try used up: back to the password form.
        $error = t('login.two_factor.too_many_tries', [], 'Too many incorrect codes. Sign in again.', $currentLang);
    } else {
        $error = t('login.two_factor.invalid_code', [], 'Incorrect code. Try again.', $currentLang);
    }

    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Setting two-factor up when the administrator requires it (discussion #1478):
// the password was accepted for an account that has no second factor, and
// authenticate() parked the login with a new secret. A first code from the
// app opens the account; the recovery codes are then shown on this page, once.
$enrolledRecoveryCodes = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($_POST['action'] ?? '', ['totp_enroll', 'totp_enroll_cancel'], true)) {
    if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'])) {
        $error = t('login.two_factor.invalid_code', [], 'Incorrect code. Try again.', $currentLang);
    } elseif ($_POST['action'] === 'totp_enroll_cancel') {
        cancelTotpEnrollment();
    } elseif (getPendingTotpEnrollment() === null) {
        $error = t('login.two_factor.expired', [], 'The verification step expired. Sign in again.', $currentLang);
    } else {
        $enrolledRecoveryCodes = completeTotpEnrollment((string)($_POST['totp_code'] ?? ''));
        if ($enrolledRecoveryCodes === null && getPendingTotpLoginChallenge() === null) {
            $error = getPendingTotpEnrollment() === null
                ? t('login.two_factor.too_many_tries', [], 'Too many incorrect codes. Sign in again.', $currentLang)
                : t('login.two_factor.invalid_code', [], 'Incorrect code. Try again.', $currentLang);
        }
    }

    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// If already authenticated, redirect to home (not before the recovery codes
// of a setup that just finished are shown)
if ($enrolledRecoveryCodes === null && isAuthenticated()) {
    poznoteRenderLoginRedirectAndExit($redirectAfter, $currentLang ?? 'en');
}

if ($enrolledRecoveryCodes === null && isAccountSelectionRequired()) {
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
    } elseif (getPendingTotpLoginChallenge() !== null || getPendingTotpEnrollment() !== null) {
        // Password accepted, second factor (or its setup) still owed: not an
        // error, the page renders the code form below.
    } else {
        $error = t('login.errors.invalid_credentials', [], 'Incorrect username or password.', $currentLang ?? 'en');
    }
    // Regenerate CSRF token after login attempt
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
render_page:

$renderEnrolledCodes = $enrolledRecoveryCodes !== null;
$renderAccountSelection = !$renderEnrolledCodes && isAccountSelectionRequired();
$accountSelectionProfiles = $renderAccountSelection ? getPendingAccountSelectionProfiles() : [];
$authenticatedUser = $renderAccountSelection ? getAuthenticatedUser() : null;
$renderTotpChallenge = !$renderEnrolledCodes && !$renderAccountSelection && getPendingTotpLoginChallenge() !== null;
$pendingTotpEnrollment = (!$renderEnrolledCodes && !$renderAccountSelection && !$renderTotpChallenge) ? getPendingTotpEnrollment() : null;
$renderTotpEnrollment = $pendingTotpEnrollment !== null;
$renderLoginStep = $renderAccountSelection || $renderTotpChallenge || $renderTotpEnrollment || $renderEnrolledCodes;

// A session (or remember-me cookie) without a second factor, ended because
// the administrator now requires one: said once, above the password form.
$showTwoFactorSetupNotice = !$renderLoginStep && !empty($_SESSION['two_factor_setup_notice']);
unset($_SESSION['two_factor_setup_notice']);

$totpEnrollmentUri = '';
if ($renderTotpEnrollment) {
    require_once __DIR__ . '/../lib/totp.php';
    $enrollmentProfile = getUserProfileById((int)$pendingTotpEnrollment['user_id']);
    $totpIssuer = trim((string)$login_display_name) !== '' ? (string)$login_display_name : 'Poznote';
    $totpEnrollmentUri = totpProvisioningUri((string)$pendingTotpEnrollment['secret'], (string)($enrollmentProfile['username'] ?? ''), $totpIssuer);
}

// OIDC error feedback
if (isset($_GET['oidc_error'])) {
    if ($_GET['oidc_error'] === 'unauthorized') {
        $oidcError = t('login.errors.oidc_unauthorized', [], 'You are not authorized to access this application. Please contact your administrator.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'no_profile') {
        $identifier = $_GET['identifier'] ?? 'unknown';
        $oidcError = t('login.errors.oidc_no_profile', ['identifier' => $identifier], 'No user profile found for "' . $identifier . '". Please contact an administrator to create your profile.', $currentLang ?? 'en');
    } elseif ($_GET['oidc_error'] === 'not_linked') {
        $notLinked = $_SESSION['oidc_not_linked'] ?? null;
        unset($_SESSION['oidc_not_linked']);
        if (is_array($notLinked) && ($notLinked['username'] ?? '') !== '') {
            if (($notLinked['email'] ?? '') !== '') {
                $oidcError = t('login.errors.oidc_not_linked', ['username' => $notLinked['username'], 'email' => $notLinked['email']], 'Your SSO identity was not linked to the existing account "' . $notLinked['username'] . '": for security, an existing account is linked by its email, never by its name. If this account is yours, ask an administrator to add the email you use with your identity provider (' . $notLinked['email'] . ') to it in Settings > Admin Tools > User Management, then sign in again. If you are the administrator, sign in with your password to do it (on an SSO-only instance, set POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false for the time being).', $currentLang);
            } else {
                $oidcError = t('login.errors.oidc_not_linked_no_email', ['username' => $notLinked['username']], 'Your SSO identity was not linked to the existing account "' . $notLinked['username'] . '": for security, an existing account is linked by its email or its OIDC subject, never by its name, and your identity provider sends no email. If this account is yours, ask an administrator to paste the OIDC subject written in the server log into it in Settings > Admin Tools > User Management, then sign in again. If you are the administrator, sign in with your password to do it (on an SSO-only instance, set POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false for the time being).', $currentLang);
            }
        } else {
            $oidcError = t('login.errors.oidc_failed', [], 'SSO login failed. Please try again.', $currentLang);
        }
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
    <link rel="manifest" href="<?php echo htmlspecialchars(poznoteManifestHref(poznoteAsset('pwa/manifest.webmanifest')), ENT_QUOTES); ?>">
    <script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <script src="<?php echo poznoteAsset('pwa/pwa.js'); ?>" defer></script>
    <?php if (!$renderAccountSelection && !$renderEnrolledCodes): // choosing an account, or reading the recovery codes, is done signed in ?>
    <script src="<?php echo poznoteAsset('js/push-signout.js'); ?>" defer></script>
    <?php endif; ?>
    <?php if ($renderTotpEnrollment): ?>
    <script src="<?php echo poznoteAsset('js/qrcode-generator/qrcode.js'); ?>"></script>
    <?php endif; ?>
    <?php poznoteRenderStylesheets('login'); ?>
    <?php poznoteRenderBrandIcons(); ?>
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <?php echo poznoteLogoMark('logo-favicon', t('app.name', [], 'Poznote', $currentLang ?? 'en')); ?>
            </div>
            <h1 class="login-title"><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : 'Poznote'); ?></h1>
        </div>

        <?php if ($showTwoFactorSetupNotice): ?>
        <div class="info session-expired-notice"><?php echo t_h('login.two_factor.setup_notice', [], 'Two-factor authentication is now required on this instance. Sign in to set it up.', $currentLang); ?></div>
        <?php elseif (isset($_GET['expired']) && !$renderLoginStep): ?>
        <div class="info session-expired-notice"><?php echo t_h('login.session_expired', [], 'Your session has ended. Sign in again to get back to where you were.', $currentLang); ?></div>
        <?php endif; ?>

        <?php
        // Password login is governed solely by POZNOTE_OIDC_DISABLE_NORMAL_LOGIN.
        // The form is either rendered and usable, or not rendered at all.
        $showNormalLogin = !(function_exists('oidc_is_enabled') && oidc_is_enabled() && defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN);
        $passwordLoginVisible = $showNormalLogin;
        ?>

        <?php 
        // Sign-in hint for a fresh install, spelling out both shipped defaults.
        // It is only shown while both are still untouched: this page is public,
        // so a hint that names a live username and password has to stop being
        // shown the moment either one stops being true. Once one is changed the
        // owner knows their own credentials, and lib/default-credentials.php
        // takes over inside the app to keep asking for the other one.
        $defaultAdminProfile = poznoteFindPristineDefaultProfile();
        $defaultAdminUsername = $defaultAdminProfile['username'] ?? null;

        if ($defaultAdminUsername && !$renderTotpChallenge && !$renderTotpEnrollment && !$renderEnrolledCodes):
        ?>
        <div class="admin-warning">
            <?php echo t('login.admin_warning', ['username' => $defaultAdminUsername], 'Please log in with the username <code>' . htmlspecialchars($defaultAdminUsername) . '</code> and the password <code>admin</code>. Once logged in, change your password immediately in the settings. You can also change your username.', $currentLang ?? 'en'); ?>
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
        <?php elseif ($renderTotpChallenge): ?>
            <div class="totp-challenge-panel">
                <p class="account-select-intro" id="totp-intro"
                   data-code-text="<?php echo t_h('login.two_factor.intro', [], 'Enter the 6-digit code from your authenticator app.', $currentLang); ?>"
                   data-recovery-text="<?php echo t_h('login.two_factor.recovery_intro', [], 'Enter one of your recovery codes. Each code works once.', $currentLang); ?>">
                    <?php echo t_h('login.two_factor.intro', [], 'Enter the 6-digit code from your authenticator app.', $currentLang); ?>
                </p>

                <form method="POST" class="totp-challenge-form" autocomplete="off">
                    <input type="hidden" name="action" value="totp_verify">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                    <?php if ($redirectAfter !== null): ?>
                        <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                    <?php endif; ?>
                    <div class="form-group">
                        <input type="text" id="totp_code" name="totp_code" class="totp-code-input" required autofocus
                               inputmode="numeric" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="16"
                               placeholder="<?php echo t_h('login.two_factor.code_placeholder', [], 'Verification code', $currentLang); ?>"
                               data-code-placeholder="<?php echo t_h('login.two_factor.code_placeholder', [], 'Verification code', $currentLang); ?>"
                               data-recovery-placeholder="<?php echo t_h('login.two_factor.recovery_placeholder', [], 'Recovery code', $currentLang); ?>">
                        <?php if ($error): ?>
                            <div class="error"><?php echo htmlspecialchars($error); ?></div>
                        <?php endif; ?>
                    </div>
                    <button type="submit" class="login-button"><?php echo t_h('login.two_factor.verify', [], 'Verify', $currentLang); ?></button>
                </form>

                <!-- The field takes either kind of code; the link only swaps the
                     wording and the on-screen keyboard (js/login-page.js). -->
                <a class="account-select-logout" href="#" id="totp-recovery-toggle"
                   data-code-text="<?php echo t_h('login.two_factor.use_recovery', [], 'Use a recovery code', $currentLang); ?>"
                   data-recovery-text="<?php echo t_h('login.two_factor.use_app', [], 'Use the authenticator app', $currentLang); ?>"><?php echo t_h('login.two_factor.use_recovery', [], 'Use a recovery code', $currentLang); ?></a>

                <form method="POST" class="totp-cancel-form">
                    <input type="hidden" name="action" value="totp_cancel">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                    <?php if ($redirectAfter !== null): ?>
                        <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                    <?php endif; ?>
                    <button type="submit" class="totp-cancel-button"><?php echo t_h('login.two_factor.cancel', [], 'Back to sign in', $currentLang); ?></button>
                </form>
            </div>
        <?php elseif ($renderTotpEnrollment): ?>
            <?php $totpEnrollmentSecret = (string)$pendingTotpEnrollment['secret']; ?>
            <div class="totp-enroll-panel">
                <p class="account-select-intro"><?php echo t_h('login.two_factor.enroll_intro', [], 'Two-factor authentication is required on this instance. Set it up to continue.', $currentLang); ?></p>
                <p class="totp-enroll-help"><?php echo t_h('two_factor.modal.scan', [], 'Scan this QR code with your authenticator app, or enter the key by hand, then type the 6-digit code the app shows.', $currentLang); ?></p>

                <!-- Drawn in the browser (js/login-page.js): the URI carries the
                     secret and must not go to an online QR service. -->
                <div class="totp-enroll-qr" id="totp-enroll-qr" data-otpauth-uri="<?php echo htmlspecialchars($totpEnrollmentUri, ENT_QUOTES); ?>" hidden></div>
                <div class="totp-enroll-secret-row">
                    <code class="totp-enroll-secret" id="totp-enroll-secret"><?php echo htmlspecialchars(trim(chunk_split($totpEnrollmentSecret, 4, ' ')), ENT_QUOTES); ?></code>
                    <button type="button" class="totp-copy-button" data-copy-value="<?php echo htmlspecialchars($totpEnrollmentSecret, ENT_QUOTES); ?>" data-copy-select="totp-enroll-secret"
                            data-copied-text="<?php echo t_h('two_factor.modal.copied', [], 'Copied', $currentLang); ?>"><?php echo t_h('two_factor.modal.copy', [], 'Copy', $currentLang); ?></button>
                </div>

                <form method="POST" class="totp-enroll-form" autocomplete="off">
                    <input type="hidden" name="action" value="totp_enroll">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                    <?php if ($redirectAfter !== null): ?>
                        <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                    <?php endif; ?>
                    <div class="form-group">
                        <?php // No autofocus: on a phone the keyboard would cover the QR code and the key. ?>
                        <input type="text" id="totp_code" name="totp_code" class="totp-code-input" required
                               inputmode="numeric" autocomplete="one-time-code" spellcheck="false" maxlength="16"
                               placeholder="<?php echo t_h('two_factor.modal.code', [], '6-digit code', $currentLang); ?>">
                        <?php if ($error): ?>
                            <div class="error"><?php echo htmlspecialchars($error); ?></div>
                        <?php endif; ?>
                    </div>
                    <button type="submit" class="login-button"><?php echo t_h('login.two_factor.enroll_submit', [], 'Turn on and sign in', $currentLang); ?></button>
                </form>

                <form method="POST" class="totp-cancel-form">
                    <input type="hidden" name="action" value="totp_enroll_cancel">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                    <?php if ($redirectAfter !== null): ?>
                        <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                    <?php endif; ?>
                    <button type="submit" class="totp-cancel-button"><?php echo t_h('login.two_factor.cancel', [], 'Back to sign in', $currentLang); ?></button>
                </form>
            </div>
        <?php elseif ($renderEnrolledCodes): ?>
            <?php $enrolledCodesText = implode("\n", $enrolledRecoveryCodes); ?>
            <div class="totp-enrolled-panel">
                <p class="account-select-intro"><?php echo t_h('two_factor.modal.recovery_intro', [], 'Two-factor authentication is on. Keep these recovery codes somewhere safe, away from your phone: each one signs you in once if you lose your device. They will not be shown again.', $currentLang); ?></p>
                <ul class="totp-recovery-list" id="totp-recovery-list">
                    <?php foreach ($enrolledRecoveryCodes as $recoveryCode): ?>
                        <li><code><?php echo htmlspecialchars($recoveryCode, ENT_QUOTES); ?></code></li>
                    <?php endforeach; ?>
                </ul>
                <div class="totp-recovery-actions">
                    <button type="button" class="totp-copy-button" data-copy-value="<?php echo htmlspecialchars($enrolledCodesText, ENT_QUOTES); ?>" data-copy-select="totp-recovery-list"
                            data-copied-text="<?php echo t_h('two_factor.modal.copied', [], 'Copied', $currentLang); ?>"><?php echo t_h('two_factor.modal.copy', [], 'Copy', $currentLang); ?></button>
                    <button type="button" class="totp-copy-button" id="totp-recovery-download" data-download-value="<?php echo htmlspecialchars($enrolledCodesText, ENT_QUOTES); ?>"><?php echo t_h('two_factor.modal.download', [], 'Download', $currentLang); ?></button>
                </div>
                <a class="login-button totp-continue-button" href="login.php<?php echo $redirectAfter !== null ? '?redirect=' . rawurlencode($redirectAfter) : ''; ?>"><?php echo t_h('two_factor.modal.saved_codes', [], 'I have saved my codes', $currentLang); ?></a>
            </div>
        <?php else: ?>
            <?php if ($showNormalLogin): ?>
            <form method="POST" class="password-login-form">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'] ?? '', ENT_QUOTES); ?>">
                <?php if ($redirectAfter !== null): ?>
                    <input type="hidden" name="redirect" value="<?php echo htmlspecialchars($redirectAfter, ENT_QUOTES); ?>">
                <?php endif; ?>
                <div class="form-group">
                    <input type="text" id="username" name="username" placeholder="<?php echo t_h('login.fields.username_or_email', [], 'Username or Email', $currentLang ?? 'en'); ?>" required<?php if (!$justLoggedOut): ?> autofocus<?php endif; ?> autocomplete="username">
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

                <a class="login-button oidc-button" href="#" id="oidc-login-btn"<?php if (!$passwordLoginVisible && !$justLoggedOut): ?> autofocus<?php endif; ?>><?php echo t_h('login.oidc_button', ['provider' => (defined('OIDC_PROVIDER_NAME') ? OIDC_PROVIDER_NAME : 'SSO')], 'Continue with SSO', $currentLang ?? 'en'); ?></a>
                <a class="login-button oidc-button oidc-other-account-button" href="#" id="oidc-other-account-btn" hidden style="display:none"><?php echo t_h('login.oidc_other_account', [], 'Sign in with another account', $currentLang ?? 'en'); ?></a>
                <script>
                // Put the remembered SSO account in the button label before the first
                // paint: done in js/login-page.js at DOMContentLoaded, the generic
                // "Continue with <provider>" label showed until the scripts loaded
                (function () {
                    var hint = null;
                    try {
                        hint = localStorage.getItem('poznote_oidc_login_hint');
                    } catch (e) {
                        // localStorage unavailable - hint is best-effort only
                    }
                    if (!hint) return;
                    var template = <?php echo json_encode(t('login.oidc_button_account', [], 'Continue with {{account}}', $currentLang ?? 'en'), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
                    document.getElementById('oidc-login-btn').textContent = template.replace('{{account}}', hint);
                    // The inline display:none (not just [hidden]) keeps the button
                    // dead-proof under a stale cached login.css
                    var other = document.getElementById('oidc-other-account-btn');
                    other.hidden = false;
                    other.style.display = '';
                })();
                </script>
            <?php endif; ?>
            
            <?php if ($oidcError): ?>
                <div class="error oidc-error"><?php echo htmlspecialchars($oidcError); ?></div>
            <?php endif; ?>

            <p class="github-link">
                <?php if (poznoteHasCustomLogo() || $login_display_name !== ''): ?>
                <?php // The page carries the instance's own name or logo: the
                      // footer still says what it runs on (discussion #1336).
                echo str_replace(
                    '{{link}}',
                    '<a href="https://poznote.com" target="_blank" rel="noopener">Poznote</a>',
                    t_h('login.powered_by', [], 'Powered by {{link}}', $currentLang)
                ); ?>
                <?php else: ?>
                <a href="https://poznote.com" target="_blank">poznote.com</a>
                <?php endif; ?>
            </p>
        <?php endif; ?>
    </div>
    <?php
    $loginConfig = [
        'focusOidc' => !$justLoggedOut && !$renderLoginStep && !$passwordLoginVisible && function_exists('oidc_is_enabled') && oidc_is_enabled(),
        'showPasswordTitle' => t('login.show_password', [], 'Show password', $currentLang ?? 'en'),
        'hidePasswordTitle' => t('login.hide_password', [], 'Hide password', $currentLang ?? 'en'),
        'oidcEnabled' => !$renderLoginStep && function_exists('oidc_is_enabled') && oidc_is_enabled(),
        'redirectAfter' => $redirectAfter,
        // js/offline-login.js forgets this device's offline copies after a sign-out
        'justLoggedOut' => $justLoggedOut
    ];
    ?>
    <script type="application/json" id="login-config"><?php echo json_encode($loginConfig); ?></script>
    <script src="<?php echo poznoteAsset('js/offline-store.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/offline-login.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/login-page.js'); ?>"></script>
</body>
</html>
