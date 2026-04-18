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

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">' . htmlspecialchars(t('multiuser.admin.access_denied_admin', [], 'Access denied. Admin privileges required.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../version_helper.php';

$v = getAppVersion();
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
        $booleanKeys = ['oidc_enabled', 'oidc_disable_normal_login', 'oidc_disable_basic_auth', 'oidc_auto_create_users'];
        $textKeys = ['oidc_provider_name', 'oidc_issuer', 'oidc_scopes', 'oidc_discovery_url', 'oidc_redirect_uri', 'oidc_end_session_endpoint', 'oidc_post_logout_redirect_uri', 'oidc_groups_claim', 'oidc_allowed_groups', 'oidc_allowed_users'];

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
    'oidc_discovery_url' => getOidcSetting('oidc_discovery_url', ''),
    'oidc_redirect_uri' => getOidcSetting('oidc_redirect_uri', ''),
    'oidc_end_session_endpoint' => getOidcSetting('oidc_end_session_endpoint', ''),
    'oidc_post_logout_redirect_uri' => getOidcSetting('oidc_post_logout_redirect_uri', ''),
    'oidc_disable_normal_login' => getOidcSettingBool('oidc_disable_normal_login', false),
    'oidc_disable_basic_auth' => getOidcSettingBool('oidc_disable_basic_auth', false),
    'oidc_groups_claim' => getOidcSetting('oidc_groups_claim', 'groups'),
    'oidc_allowed_groups' => getOidcSetting('oidc_allowed_groups', ''),
    'oidc_auto_create_users' => getOidcSettingBool('oidc_auto_create_users', false),
    'oidc_allowed_users' => getOidcSetting('oidc_allowed_users', ''),
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

            .oidc-actions .btn {
                width: 100%;
            }
        }
    </style>
</head>
<body data-workspace="<?php echo h($pageWorkspace); ?>">
<div class="settings-container oidc-page">
    <div class="workspaces-nav">
            <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes', [], 'Back to Notes'); ?>
            </a>
            <a href="../settings.php" class="btn btn-secondary">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings', [], 'Back to Settings'); ?>
            </a>
    </div>

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
                        <label for="oidc_allowed_users"><?php echo t_h('oidc_admin.fields.allowed_users', [], 'Allowed users'); ?></label>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.allowed_users', [], 'Comma-separated emails/usernames. Prefer group-based access control instead.'); ?></span>
                        <input type="text" id="oidc_allowed_users" name="oidc_allowed_users" value="<?php echo h($settings['oidc_allowed_users']); ?>" placeholder="">
                    </div>
                </div>

                <!-- Login Behavior -->
                <div class="settings-section oidc-section">
                    <h2><?php echo t_h('oidc_admin.section_login_behavior', [], 'Login Behavior'); ?></h2>

                    <div class="oidc-field">
                        <div class="oidc-toggle">
                            <input type="checkbox" id="oidc_disable_normal_login" name="oidc_disable_normal_login" value="1" <?php echo $settings['oidc_disable_normal_login'] ? 'checked' : ''; ?>>
                            <label for="oidc_disable_normal_login"><?php echo t_h('oidc_admin.fields.disable_normal_login', [], 'Disable username/password login (SSO only)'); ?></label>
                        </div>
                        <span class="oidc-hint"><?php echo t_h('oidc_admin.hints.disable_normal_login', [], 'When enabled, only OIDC login is available on the login page'); ?></span>
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
</script>
</body>
</html>
