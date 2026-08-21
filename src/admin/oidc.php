<?php
/**
 * OIDC Configuration — Admin Tool
 *
 * Configure OpenID Connect (OIDC) authentication settings.
 * Client ID and Client Secret remain in .env for security.
 * All other settings are stored in the global_settings database table.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
requireSettingsPassword();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">' . htmlspecialchars(t('multiuser.admin.access_denied_admin', [], 'Access denied. Admin privileges required.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    exit;
}

require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../version_helper.php';

$v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$success = '';
$error = '';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['oidc_csrf_token']) || !hash_equals($_SESSION['oidc_csrf_token'], $token)) {
        $error = t('oidc_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        // Save each setting
        $booleanKeys = ['oidc_enabled', 'oidc_disable_basic_auth', 'oidc_auto_create_users'];
        $textKeys = ['oidc_provider_name', 'oidc_issuer', 'oidc_scopes', 'oidc_api_audience', 'oidc_discovery_url', 'oidc_redirect_uri', 'oidc_end_session_endpoint', 'oidc_post_logout_redirect_uri', 'oidc_groups_claim', 'oidc_allowed_groups', 'oidc_allowed_users', 'oidc_max_users'];

        $allOk = true;
        foreach ($booleanKeys as $key) {
            $val = isset($_POST[$key]) ? '1' : '0';
            if (!setGlobalSetting($key, $val)) {
                $allOk = false;
            }
        }
        foreach ($textKeys as $key) {
            $val = trim($_POST[$key] ?? '');
            // Normalize issuer: remove trailing slash
            if ($key === 'oidc_issuer') {
                $val = rtrim($val, '/');
            }
            // Normalize the signup cap: anything not a positive integer means
            // "no limit", stored as 0.
            if ($key === 'oidc_max_users') {
                $val = ($val === '' || !ctype_digit($val)) ? '0' : (string)(int)$val;
            }
            if (!setGlobalSetting($key, $val)) {
                $allOk = false;
            }
        }

        if ($allOk) {
            $success = t('oidc_admin.saved', [], 'OIDC configuration saved successfully.');
        } else {
            $error = t('oidc_admin.error_saving', [], 'Error saving some settings. Please try again.');
        }
    }
}

// Generate CSRF token
$_SESSION['oidc_csrf_token'] = bin2hex(random_bytes(32));

// Load current values from DB only
function getOidcSetting(string $key, string $default = ''): string {
    $dbVal = getGlobalSetting($key, null);
    if ($dbVal !== null) {
        return $dbVal;
    }
    return $default;
}

function getOidcSettingBool(string $key, bool $default = false): bool {
    $dbVal = getGlobalSetting($key, null);
    if ($dbVal !== null) {
        return $dbVal === '1' || $dbVal === 'true';
    }
    return $default;
}

$settings = [
    'oidc_enabled' => getOidcSettingBool('oidc_enabled', false),
    'oidc_provider_name' => getOidcSetting('oidc_provider_name', 'SSO'),
    'oidc_issuer' => getOidcSetting('oidc_issuer', ''),
    'oidc_scopes' => getOidcSetting('oidc_scopes', 'openid profile email'),
    'oidc_api_audience' => getOidcSetting('oidc_api_audience', ''),
    'oidc_discovery_url' => getOidcSetting('oidc_discovery_url', ''),
    'oidc_redirect_uri' => getOidcSetting('oidc_redirect_uri', ''),
    'oidc_end_session_endpoint' => getOidcSetting('oidc_end_session_endpoint', ''),
    'oidc_post_logout_redirect_uri' => getOidcSetting('oidc_post_logout_redirect_uri', ''),
    'oidc_disable_basic_auth' => getOidcSettingBool('oidc_disable_basic_auth', false),
    'oidc_groups_claim' => getOidcSetting('oidc_groups_claim', 'groups'),
    'oidc_allowed_groups' => getOidcSetting('oidc_allowed_groups', ''),
    'oidc_auto_create_users' => getOidcSettingBool('oidc_auto_create_users', false),
    'oidc_allowed_users' => getOidcSetting('oidc_allowed_users', ''),
    'oidc_max_users' => getOidcSetting('oidc_max_users', '0'),
];

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
?>
<!DOCTYPE html>
<html lang="<?php echo h($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('oidc_admin.title', [], 'OIDC Configuration'); ?> - Poznote</title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/workspaces.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/modals/alerts-utilities.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/workspaces-inline.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar-page.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar-mobile.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <style>
        .oidc-page form {
            margin: 0;
        }
        .oidc-section h2 {
            margin: 0 0 16px;
            color: var(--text-color, #333);
            border-bottom: 2px solid #007cba;
            padding-bottom: 10px;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .oidc-field {
            margin-bottom: 16px;
        }
        .oidc-field:last-child {
            margin-bottom: 0;
        }
        .oidc-field label {
            display: block;
            font-weight: 600;
            font-size: 0.92rem;
            margin-bottom: 4px;
        }
        .oidc-field .oidc-hint {
            display: block;
            font-size: 0.82rem;
            color: var(--text-secondary, #888);
            margin-bottom: 6px;
            line-height: 1.4;
        }
        html[data-theme='dark'] .oidc-field .oidc-hint,
        body.dark-mode .oidc-field .oidc-hint {
            color: rgba(255, 255, 255, 0.6);
        }
        /* Hint kept in the normal text color rather than the muted grey. */
        .oidc-field .oidc-hint.oidc-hint-plain,
        html[data-theme='dark'] .oidc-field .oidc-hint.oidc-hint-plain,
        body.dark-mode .oidc-field .oidc-hint.oidc-hint-plain {
            color: inherit;
        }
        .oidc-field .oidc-hint .oidc-hint-danger {
            color: #c4392f;
            font-weight: 600;
        }
        html[data-theme='dark'] .oidc-field .oidc-hint .oidc-hint-danger,
        body.dark-mode .oidc-field .oidc-hint .oidc-hint-danger {
            color: #ff7b72;
        }
        .oidc-field input[type="text"],
        .oidc-field input[type="url"] {
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            color: var(--text-primary, #333);
            box-sizing: border-box;
        }
        html[data-theme='dark'] .oidc-field input[type="text"],
        html[data-theme='dark'] .oidc-field input[type="url"],
        body.dark-mode .oidc-field input[type="text"],
        body.dark-mode .oidc-field input[type="url"] {
            background: var(--input-bg, #2a2a2a);
            border-color: var(--border-color, #444);
            color: var(--text-primary, #e0e0e0);
        }
        .oidc-field input[type="text"]:focus,
        .oidc-field input[type="url"]:focus {
            outline: none;
            border-color: #2E8CFA;
            box-shadow: 0 0 0 2px rgba(46, 140, 250, 0.2);
        }
        .oidc-chip-box {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            cursor: text;
            box-sizing: border-box;
        }
        .oidc-chip-box:focus-within {
            border-color: #2E8CFA;
            box-shadow: 0 0 0 2px rgba(46, 140, 250, 0.2);
        }
        html[data-theme='dark'] .oidc-chip-box,
        body.dark-mode .oidc-chip-box {
            background: var(--input-bg, #2a2a2a);
            border-color: var(--border-color, #444);
        }
        .oidc-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            max-width: 100%;
            padding: 3px 4px 3px 10px;
            border-radius: 12px;
            background: var(--tag-bg, #e8f0fe);
            color: var(--tag-color, #1967d2);
            font-size: 0.85rem;
            font-weight: 500;
        }
        html[data-theme='dark'] .oidc-chip,
        body.dark-mode .oidc-chip {
            background: rgba(46, 140, 250, 0.15);
            color: #6eb5ff;
        }
        .oidc-chip-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .oidc-chip-remove {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: none;
            background: none;
            color: inherit;
            cursor: pointer;
            font-size: 15px;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 50%;
        }
        .oidc-chip-remove:hover {
            background: rgba(0, 0, 0, 0.12);
        }
        html[data-theme='dark'] .oidc-chip-remove:hover,
        body.dark-mode .oidc-chip-remove:hover {
            background: rgba(255, 255, 255, 0.18);
        }
        .oidc-chip-label-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
        }
        .oidc-chip-copy {
            border: none;
            background: none;
            padding: 0;
            font-size: 0.82rem;
            font-weight: 500;
            color: #2E8CFA;
            cursor: pointer;
        }
        .oidc-chip-copy:hover {
            text-decoration: underline;
        }
        .oidc-chip-copy.is-copied {
            color: #2e9e5b;
            text-decoration: none;
            cursor: default;
        }
        .oidc-field .oidc-chip-box input[type="text"].oidc-chip-entry {
            flex: 1 1 140px;
            width: auto;
            min-width: 140px;
            border: none;
            box-shadow: none;
            outline: none;
            padding: 4px 2px;
            background: transparent;
        }
        html[data-theme='dark'] .oidc-field .oidc-chip-box input[type="text"].oidc-chip-entry,
        body.dark-mode .oidc-field .oidc-chip-box input[type="text"].oidc-chip-entry {
            background: transparent;
        }
        .oidc-switch-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }
        .oidc-switch-copy {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1 1 auto;
        }
        .oidc-switch-title {
            display: block;
            font-weight: 600;
            font-size: 0.95rem;
            margin: 0;
        }
        .oidc-switch-state {
            display: inline-block;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--text-muted, #666);
        }
        .oidc-switch-state.is-enabled {
            color: #1f8f4e;
        }
        .oidc-switch-state.is-disabled {
            color: #b54747;
        }
        .oidc-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 0;
        }
        .oidc-toggle input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #2E8CFA;
            cursor: pointer;
        }
        .oidc-toggle label {
            font-weight: 600;
            font-size: 0.92rem;
            margin-bottom: 0;
            cursor: pointer;
        }
        .oidc-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 24px;
            flex-wrap: wrap;
        }
        .oidc-env-notice {
            display: inline-block;
            background: var(--tag-bg, #e8f0fe);
            color: var(--tag-color, #1967d2);
            font-size: 0.78rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;
            margin-left: 6px;
        }
        html[data-theme='dark'] .oidc-env-notice,
        body.dark-mode .oidc-env-notice {
            background: rgba(46, 140, 250, 0.15);
            color: #6eb5ff;
        }
        html[data-theme='dark'] .oidc-section h2,
        body.dark-mode .oidc-section h2 {
            color: var(--dm-text);
            border-bottom-color: var(--dm-accent);
        }

        html[data-theme='dark'] .oidc-switch-state,
        body.dark-mode .oidc-switch-state {
            color: var(--dm-text-muted);
        }
        @media (max-width: 800px) {
            .oidc-switch-row {
                flex-direction: column;
            }

            .settings-container.oidc-page .oidc-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                justify-content: stretch;
            }

            .settings-container.oidc-page .oidc-actions .btn,
            .settings-container.oidc-page .oidc-actions .btn-secondary,
            .settings-container.oidc-page .oidc-actions .btn-primary {
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                margin-bottom: 0 !important;
                padding: 10px 12px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
            }

            .settings-container.oidc-page .workspaces-nav {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                align-items: stretch;
            }

            .settings-container.oidc-page .workspaces-nav .btn,
            .settings-container.oidc-page .workspaces-nav .btn-secondary {
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                margin-bottom: 0 !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                padding: 10px 12px !important;
                text-align: center !important;
                min-height: 36px !important;
                line-height: 1.2 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
            }
        }
    </style>
</head>
<body class="has-icon-sidebar" data-workspace="<?php echo h($pageWorkspace); ?>">
    <?php $iconSidebarBasePath = '../'; include '../icon_sidebar.php'; ?>
<div class="settings-container oidc-page">
<?php $backToSettingsBasePath = '../'; include '../back_to_settings.php'; ?>
<h1 class="poznote-page-title"><i class="lucide lucide-shield"></i> <?php echo t_h('settings.cards.oidc_config', [], 'OIDC / SSO'); ?></h1>


    <?php if ($success || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : 'alert-danger'; ?>">
            <?php echo h($success ?: $error); ?>
        </div>
    <?php endif; ?>

        <form method="POST" action="" autocomplete="off">
            <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['oidc_csrf_token']); ?>">

            <!-- General -->
            <div class="settings-section oidc-section">
                <h2><?php echo t_h('oidc_admin.section_general', [], 'General'); ?></h2>

                <div class="oidc-field">
                    <div class="oidc-switch-row">
                        <div class="oidc-switch-copy">
                            <label for="oidc_enabled" class="oidc-switch-title"><?php echo t_h('oidc_admin.fields.enabled', [], 'Enable OIDC authentication'); ?></label>
                            <span
                                class="oidc-switch-state <?php echo $settings['oidc_enabled'] ? 'is-enabled' : 'is-disabled'; ?>"
                                id="oidc-enabled-state"
                                data-enabled-label="<?php echo h(t('common.enabled', [], 'Enabled')); ?>"
                                data-disabled-label="<?php echo h(t('common.disabled', [], 'Disabled')); ?>"
                            >
                                <?php echo $settings['oidc_enabled'] ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                            </span>
                        </div>
                        <label class="toggle-switch" for="oidc_enabled">
                            <input type="checkbox" id="oidc_enabled" name="oidc_enabled" value="1" <?php echo $settings['oidc_enabled'] ? 'checked' : ''; ?>>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="oidc-field">
                    <span class="oidc-hint oidc-hint-plain">
                        <?php echo t_h('oidc_admin.hints.sso_only_admin_password', [], 'You can make this instance SSO-only by setting POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true in the .env file.'); ?>
                        <span class="oidc-hint-danger"><?php echo t_h('oidc_admin.hints.sso_only_admin_password_warning', [], 'Before enabling it, make sure at least one admin account has an explicit password set (Settings > Users).'); ?></span>
                        <?php echo t_h('oidc_admin.hints.sso_only_admin_password_recovery', [], 'If the identity provider becomes unavailable, recovery means switching the flag back to false and signing in with that password.'); ?>
                    </span>
                </div>

                <div id="oidc-general-fields" <?php echo !$settings['oidc_enabled'] ? 'hidden' : ''; ?>>
                    <div class="oidc-field">
                        <label for="oidc_provider_name"><?php echo t_h('oidc_admin.fields.provider_name', [], 'Provider name'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.provider_name', [], 'Display name shown on the login button (e.g. Google, Azure AD, Keycloak)'); ?></span>
                        <input type="text" id="oidc_provider_name" name="oidc_provider_name" value="<?php echo h($settings['oidc_provider_name']); ?>" placeholder="SSO">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_issuer"><?php echo t_h('oidc_admin.fields.issuer', [], 'Issuer URL'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.issuer', [], 'The issuer URL of your OIDC provider (e.g. https://accounts.google.com)'); ?></span>
                        <input type="url" id="oidc_issuer" name="oidc_issuer" value="<?php echo h($settings['oidc_issuer']); ?>" placeholder="https://your-identity-provider.com">
                    </div>
                </div>
            </div>

            <div id="oidc-other-sections" <?php echo !$settings['oidc_enabled'] ? 'hidden' : ''; ?>>
                <!-- Credentials (read-only from .env) -->
                <div class="settings-section oidc-section">
                    <h2><?php echo t_h('oidc_admin.section_credentials', [], 'Credentials'); ?> <span class="oidc-env-notice">.env</span></h2>

                    <div class="oidc-field">
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.credentials', [], 'Client ID and Client Secret are managed in the .env file.'); ?></span>
                    </div>
                </div>

                <!-- Advanced -->
                <div class="settings-section oidc-section">
                    <h2><?php echo t_h('oidc_admin.section_advanced', [], 'Advanced'); ?></h2>

                    <div class="oidc-field">
                        <label for="oidc_scopes"><?php echo t_h('oidc_admin.fields.scopes', [], 'Scopes'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.scopes', [], 'Space-separated scopes (default: openid profile email)'); ?></span>
                        <input type="text" id="oidc_scopes" name="oidc_scopes" value="<?php echo h($settings['oidc_scopes']); ?>" placeholder="openid profile email">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_discovery_url"><?php echo t_h('oidc_admin.fields.discovery_url', [], 'Discovery URL'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.discovery_url', [], 'Override the auto-discovery URL (leave empty to derive from issuer)'); ?></span>
                        <input type="url" id="oidc_discovery_url" name="oidc_discovery_url" value="<?php echo h($settings['oidc_discovery_url']); ?>" placeholder="">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_redirect_uri"><?php echo t_h('oidc_admin.fields.redirect_uri', [], 'Redirect URI'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.redirect_uri', [], 'Custom redirect URI (leave empty to auto-generate)'); ?></span>
                        <input type="url" id="oidc_redirect_uri" name="oidc_redirect_uri" value="<?php echo h($settings['oidc_redirect_uri']); ?>" placeholder="">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_end_session_endpoint"><?php echo t_h('oidc_admin.fields.end_session_endpoint', [], 'End session endpoint'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.end_session_endpoint', [], 'IdP logout endpoint for RP-initiated logout (optional)'); ?></span>
                        <input type="url" id="oidc_end_session_endpoint" name="oidc_end_session_endpoint" value="<?php echo h($settings['oidc_end_session_endpoint']); ?>" placeholder="">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_post_logout_redirect_uri"><?php echo t_h('oidc_admin.fields.post_logout_redirect_uri', [], 'Post-logout redirect URI'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.post_logout_redirect_uri', [], 'Where to redirect after logout (default: login page)'); ?></span>
                        <input type="url" id="oidc_post_logout_redirect_uri" name="oidc_post_logout_redirect_uri" value="<?php echo h($settings['oidc_post_logout_redirect_uri']); ?>" placeholder="">
                    </div>
                </div>

                <!-- Access Control -->
                <div class="settings-section oidc-section">
                    <h2><?php echo t_h('oidc_admin.section_access_control', [], 'Access Control'); ?></h2>

                    <div class="oidc-field">
                        <label for="oidc_groups_claim"><?php echo t_h('oidc_admin.fields.groups_claim', [], 'Groups claim'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.groups_claim', [], 'Token claim name containing user groups (default: groups)'); ?></span>
                        <input type="text" id="oidc_groups_claim" name="oidc_groups_claim" value="<?php echo h($settings['oidc_groups_claim']); ?>" placeholder="groups">
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_allowed_groups"><?php echo t_h('oidc_admin.fields.allowed_groups', [], 'Allowed groups'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.allowed_groups', [], 'Comma-separated list of allowed groups. Leave empty to allow all authenticated users.'); ?></span>
                        <input type="text" id="oidc_allowed_groups" name="oidc_allowed_groups" value="<?php echo h($settings['oidc_allowed_groups']); ?>" placeholder="poznote,admins">
                    </div>

                    <div class="oidc-field">
                        <div class="oidc-toggle">
                            <input type="checkbox" id="oidc_auto_create_users" name="oidc_auto_create_users" value="1" <?php echo $settings['oidc_auto_create_users'] ? 'checked' : ''; ?>>
                            <label for="oidc_auto_create_users"><?php echo t_h('oidc_admin.fields.auto_create_users', [], 'Auto-create user profiles on first OIDC login'); ?></label>
                        </div>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.auto_create_users', [], 'Recommended when using group-based access control'); ?></span>
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_max_users"><?php echo t_h('oidc_admin.fields.max_users', [], 'Maximum number of accounts'); ?></label>
                        <span class="oidc-hint">
                            <?php echo t_h('oidc_admin.hints.max_users', [], 'Once this many user profiles exist, auto-creation stops and new people can no longer sign up. Existing users keep signing in normally. Use 0 for no limit.'); ?>
                            <?php
                                require_once __DIR__ . '/../users/db_master.php';
                                $currentUserCount = countUserProfiles();
                                if ($currentUserCount !== null) {
                                    echo ' <strong>' . h(t('oidc_admin.hints.max_users_current', ['count' => $currentUserCount], 'Currently: {{count}} profile(s).')) . '</strong>';
                                }
                            ?>
                        </span>
                        <input type="number" min="0" step="1" id="oidc_max_users" name="oidc_max_users" value="<?php echo h($settings['oidc_max_users']); ?>" placeholder="0">
                    </div>

                    <div class="oidc-field">
                        <div class="oidc-chip-label-row">
                            <label for="oidc_allowed_users_entry"><?php echo t_h('oidc_admin.fields.allowed_users', [], 'Allowed users'); ?></label>
                            <button type="button" id="oidc_allowed_users_copy" class="oidc-chip-copy" hidden
                                data-copied-label="<?php echo h(t('oidc_admin.actions.copied', [], 'Copied!')); ?>"><?php echo t_h('oidc_admin.actions.copy_all', [], 'Copy all'); ?></button>
                        </div>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.allowed_users', [], 'Type an email or username and press Enter to add it. Leave empty to allow all authenticated users.'); ?></span>
                        <div class="oidc-chip-box" id="oidc_allowed_users_box" data-remove-label="<?php echo h(t('common.delete', [], 'Delete')); ?>">
                            <input type="hidden" id="oidc_allowed_users" name="oidc_allowed_users" value="<?php echo h($settings['oidc_allowed_users']); ?>">
                            <input type="text" id="oidc_allowed_users_entry" class="oidc-chip-entry" placeholder="user@example.com" autocomplete="off">
                        </div>
                    </div>
                </div>

                <!-- Login Behavior -->
                <div class="settings-section oidc-section">
                    <h2><?php echo t_h('oidc_admin.section_login_behavior', [], 'Login Behavior'); ?></h2>

                    <div class="oidc-field">
                        <span class="oidc-hint">
                            <?php echo t_h('oidc_admin.hints.disable_normal_login_env', [], 'To disable password login (SSO only), set POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true in your .env file.'); ?>
                            <?php if (defined('OIDC_DISABLE_NORMAL_LOGIN') && OIDC_DISABLE_NORMAL_LOGIN): ?>
                                <strong><?php echo t_h('oidc_admin.hints.disable_normal_login_active', [], '(Currently active)'); ?></strong>
                            <?php endif; ?>
                        </span>
                    </div>

                    <div class="oidc-field">
                        <label for="oidc_api_audience"><?php echo t_h('oidc_admin.fields.api_audience', [], 'API JWT audience'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.api_audience', [], 'Accepted aud claim for OIDC Bearer JWT API requests. Leave empty to use the Client ID. Use commas for multiple audiences.'); ?></span>
                        <input type="text" id="oidc_api_audience" name="oidc_api_audience" value="<?php echo h($settings['oidc_api_audience']); ?>" placeholder="api://poznote">
                    </div>

                    <div class="oidc-field">
                        <div class="oidc-toggle">
                            <input type="checkbox" id="oidc_disable_basic_auth" name="oidc_disable_basic_auth" value="1" <?php echo $settings['oidc_disable_basic_auth'] ? 'checked' : ''; ?>>
                            <label for="oidc_disable_basic_auth"><?php echo t_h('oidc_admin.fields.disable_basic_auth', [], 'Disable HTTP Basic Auth for API'); ?></label>
                        </div>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.disable_basic_auth', [], 'When enabled, API requests with HTTP Basic Auth will be rejected (403)'); ?></span>
                    </div>
                </div>
            </div>

            <div class="oidc-actions">
                <a href="../settings.php" class="btn btn-secondary"><?php echo t_h('common.cancel', [], 'Cancel'); ?></a>
                <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </form>
</div>
<script>
document.addEventListener('DOMContentLoaded', function () {
    var enabledCheckbox = document.getElementById('oidc_enabled');
    var enabledState = document.getElementById('oidc-enabled-state');
    var generalFields = document.getElementById('oidc-general-fields');
    var otherSections = document.getElementById('oidc-other-sections');

    if (!enabledCheckbox || !enabledState || !generalFields || !otherSections) {
        return;
    }

    var enabledLabel = enabledState.getAttribute('data-enabled-label') || 'Enabled';
    var disabledLabel = enabledState.getAttribute('data-disabled-label') || 'Disabled';

    function syncOidcVisibility() {
        var isEnabled = enabledCheckbox.checked;

        generalFields.hidden = !isEnabled;
        otherSections.hidden = !isEnabled;
        enabledState.textContent = isEnabled ? enabledLabel : disabledLabel;
        enabledState.classList.toggle('is-enabled', isEnabled);
        enabledState.classList.toggle('is-disabled', !isEnabled);
    }

    enabledCheckbox.addEventListener('change', syncOidcVisibility);
    syncOidcVisibility();
});

document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('oidc_allowed_users_box');
    var hidden = document.getElementById('oidc_allowed_users');
    var entry = document.getElementById('oidc_allowed_users_entry');
    var copyBtn = document.getElementById('oidc_allowed_users_copy');

    if (!box || !hidden || !entry) {
        return;
    }

    var removeLabel = box.getAttribute('data-remove-label') || 'Delete';
    var values = hidden.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    values = values.filter(function (v, i) {
        return values.findIndex(function (o) { return o.toLowerCase() === v.toLowerCase(); }) === i;
    });

    function render() {
        box.querySelectorAll('.oidc-chip').forEach(function (chip) { chip.remove(); });
        values.forEach(function (value, index) {
            var chip = document.createElement('span');
            chip.className = 'oidc-chip';

            var label = document.createElement('span');
            label.className = 'oidc-chip-label';
            label.textContent = value;

            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'oidc-chip-remove';
            removeBtn.title = removeLabel;
            removeBtn.setAttribute('aria-label', removeLabel + ' ' + value);
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function () {
                values.splice(index, 1);
                render();
                entry.focus();
            });

            chip.appendChild(label);
            chip.appendChild(removeBtn);
            box.insertBefore(chip, entry);
        });
        hidden.value = values.join(',');
        if (copyBtn) copyBtn.hidden = values.length === 0;
    }

    function commitEntry() {
        entry.value.split(',').forEach(function (part) {
            var v = part.trim();
            if (!v) return;
            var exists = values.some(function (o) { return o.toLowerCase() === v.toLowerCase(); });
            if (!exists) values.push(v);
        });
        entry.value = '';
        render();
    }

    entry.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (entry.value.trim()) commitEntry();
        } else if (e.key === 'Backspace' && entry.value === '' && values.length) {
            values.pop();
            render();
        }
    });

    // Splits pasted comma-separated lists into chips immediately
    entry.addEventListener('input', function () {
        if (entry.value.indexOf(',') !== -1) commitEntry();
    });

    entry.addEventListener('blur', function () {
        if (entry.value.trim()) commitEntry();
    });

    box.addEventListener('click', function (e) {
        if (e.target === box) entry.focus();
    });

    if (copyBtn) {
        var copyDefaultLabel = copyBtn.textContent;
        var copyResetTimer = null;

        function writeToClipboard(text) {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text);
            }
            var tmp = document.createElement('textarea');
            tmp.value = text;
            tmp.setAttribute('readonly', '');
            tmp.style.position = 'fixed';
            tmp.style.opacity = '0';
            document.body.appendChild(tmp);
            tmp.select();
            try {
                document.execCommand('copy');
                return Promise.resolve();
            } catch (err) {
                return Promise.reject(err);
            } finally {
                document.body.removeChild(tmp);
            }
        }

        copyBtn.addEventListener('click', function () {
            if (!values.length) return;
            writeToClipboard(values.join(', ')).then(function () {
                copyBtn.textContent = copyBtn.getAttribute('data-copied-label') || 'Copied!';
                copyBtn.classList.add('is-copied');
                clearTimeout(copyResetTimer);
                copyResetTimer = setTimeout(function () {
                    copyBtn.textContent = copyDefaultLabel;
                    copyBtn.classList.remove('is-copied');
                }, 1500);
            }).catch(function () {});
        });
    }

    var form = box.closest('form');
    if (form) {
        form.addEventListener('submit', function () {
            if (entry.value.trim()) commitEntry();
        });
    }

    render();
});
</script>
    <script src="../js/icon-sidebar-toggle.js?v=<?php echo $v; ?>"></script>
</body>
</html>
