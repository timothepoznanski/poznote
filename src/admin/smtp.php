<?php
/**
 * SMTP Configuration - Admin Tool
 *
 * Configure SMTP delivery for reminder emails.
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
require_once __DIR__ . '/../ReminderEmailService.php';
require_once __DIR__ . '/../version_helper.php';

$v = getAppVersion();
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());
$service = new ReminderEmailService();

$success = '';
$error = '';

function smtp_h($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function smtp_setting(string $key, string $default = ''): string {
    $value = getGlobalSetting($key, null);
    return $value === null ? $default : (string)$value;
}

function smtp_bool_setting(string $key, ?bool $default = null): ?bool {
    $value = getGlobalSetting($key, null);
    if ($value === null || $value === '') {
        return $default;
    }

    return filter_var($value, FILTER_VALIDATE_BOOLEAN);
}

function smtp_is_configured(array $settings): bool {
    return trim((string)($settings['smtp_host'] ?? '')) !== ''
        && filter_var((string)($settings['smtp_from_email'] ?? ''), FILTER_VALIDATE_EMAIL);
}

function smtp_is_enabled(bool $configured): bool {
    $enabledSetting = smtp_bool_setting('smtp_enabled', null);
    return $configured && ($enabledSetting ?? true);
}

function smtp_detect_app_url(): string {
    if (PHP_SAPI === 'cli') {
        return '';
    }

    $host = function_exists('getExternalHostWithPort')
        ? getExternalHostWithPort()
        : trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? '')));
    if ($host === '') {
        return '';
    }

    $protocol = function_exists('getProtocol') ? getProtocol() : 'http';
    $scriptDir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
    if ($scriptDir === '.' || $scriptDir === '/') {
        $scriptDir = '';
    }
    if (basename($scriptDir) === 'admin') {
        $scriptDir = rtrim(dirname($scriptDir), '/');
        if ($scriptDir === '.' || $scriptDir === '/') {
            $scriptDir = '';
        }
    }

    return $protocol . '://' . $host . $scriptDir;
}

function smtp_current_account_profile(): array {
    $currentUser = getCurrentUser();
    $userId = (int)($currentUser['id'] ?? getCurrentUserId() ?? 0);

    if ($userId > 0 && function_exists('getUserProfileById')) {
        $profile = getUserProfileById($userId);
        if (is_array($profile)) {
            return $profile;
        }
    }

    return is_array($currentUser) ? $currentUser : [];
}

$currentUser = smtp_current_account_profile();
$currentAccountEmail = trim((string)($currentUser['email'] ?? ''));
$currentAccountName = trim((string)($currentUser['username'] ?? ''));
$detectedAppUrl = smtp_detect_app_url();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['smtp_csrf_token']) || !hash_equals($_SESSION['smtp_csrf_token'], $token)) {
        $error = t('smtp_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        $action = $_POST['action'] ?? 'save';
        if (!in_array($action, ['save', 'test', 'enable', 'disable'], true)) {
            $action = 'save';
        }

        if ($action === 'disable') {
            if (setGlobalSetting('smtp_enabled', '0')) {
                $success = t('smtp_admin.disabled', [], 'SMTP delivery disabled.');
            } else {
                $error = t('smtp_admin.error_saving', [], 'Error saving SMTP configuration.');
            }
        } elseif ($action === 'test' && !filter_var($currentAccountEmail, FILTER_VALIDATE_EMAIL)) {
            $error = t('smtp_admin.test.no_account_email', [], 'Your account does not have an email address configured. Contact an administrator to add one to your profile.');
        } else {
            $requestedEnabled = !empty($_POST['smtp_enabled']);
            $security = strtolower(trim((string)($_POST['smtp_security'] ?? 'tls')));
            if (!in_array($security, ['none', 'tls', 'ssl'], true)) {
                $security = 'tls';
            }
            $postedPort = trim((string)($_POST['smtp_port'] ?? ''));
            $port = $postedPort === '' ? ($security === 'ssl' ? 465 : ($security === 'none' ? 25 : 587)) : (int)$postedPort;
            $port = max(1, min(65535, $port));

            $password = array_key_exists('smtp_password', $_POST)
                ? (string)$_POST['smtp_password']
                : smtp_setting('smtp_password', '');

            $existingAppUrl = smtp_setting('smtp_app_url', '');
            $appUrl = $detectedAppUrl !== '' ? $detectedAppUrl : $existingAppUrl;
            $settingsToSave = [
                'smtp_host' => trim((string)($_POST['smtp_host'] ?? '')),
                'smtp_port' => (string)$port,
                'smtp_security' => $security,
                'smtp_username' => trim((string)($_POST['smtp_username'] ?? '')),
                'smtp_password' => $password,
                'smtp_from_email' => trim((string)($_POST['smtp_from_email'] ?? '')),
                'smtp_from_name' => trim((string)($_POST['smtp_from_name'] ?? 'Poznote')),
                'smtp_app_url' => $appUrl,
            ];

            $configForValidation = [
                'enabled' => true,
                'host' => $settingsToSave['smtp_host'],
                'port' => (int)$settingsToSave['smtp_port'],
                'security' => $security,
                'username' => $settingsToSave['smtp_username'],
                'password' => $password,
                'from_email' => $settingsToSave['smtp_from_email'],
                'from_name' => $settingsToSave['smtp_from_name'],
                'app_url' => $appUrl,
            ];

            $hasProviderConfig = $settingsToSave['smtp_host'] !== ''
                || $settingsToSave['smtp_from_email'] !== '';
            $validationErrors = ($hasProviderConfig || $requestedEnabled || $action === 'test' || $action === 'enable')
                ? $service->validateSmtpConfig($configForValidation, false)
                : [];
            if (!empty($validationErrors)) {
                $error = implode(' ', $validationErrors);
            } else {
                $configured = $settingsToSave['smtp_host'] !== ''
                    && filter_var($settingsToSave['smtp_from_email'], FILTER_VALIDATE_EMAIL);
                $enabled = $action === 'enable'
                    ? $configured
                    : ($configured && $requestedEnabled);
                $settingsToSave = ['smtp_enabled' => $enabled ? '1' : '0'] + $settingsToSave;
                $allOk = true;
                foreach ($settingsToSave as $key => $value) {
                    if (!setGlobalSetting($key, $value)) {
                        $allOk = false;
                    }
                }

                if ($enabled && smtp_setting('smtp_reminder_cutoff_at', '') === '') {
                    setGlobalSetting('smtp_reminder_cutoff_at', gmdate('Y-m-d H:i:s'));
                }

                if (!$allOk) {
                    $error = t('smtp_admin.error_saving', [], 'Error saving SMTP configuration.');
                } elseif ($action === 'test') {
                    $recipient = $currentAccountEmail;
                    $test = $service->sendTestEmail($recipient, $currentAccountName);
                    if ($test['success']) {
                        $success = t('smtp_admin.test.success', ['email' => $recipient], 'SMTP configuration saved and test email sent to {{email}}.');
                    } else {
                        $error = t('smtp_admin.test.error', ['error' => $test['error'] ?? 'Unknown error'], 'SMTP configuration saved, but the test email failed: {{error}}');
                    }
                } elseif ($action === 'enable') {
                    $success = t('smtp_admin.enabled', [], 'SMTP delivery enabled.');
                } else {
                    $success = t('smtp_admin.saved', [], 'SMTP configuration saved successfully.');
                }
            }
        }
    }
}

$_SESSION['smtp_csrf_token'] = bin2hex(random_bytes(32));

$settings = [
    'smtp_host' => smtp_setting('smtp_host', ''),
    'smtp_port' => smtp_setting('smtp_port', '587'),
    'smtp_security' => smtp_setting('smtp_security', 'tls'),
    'smtp_username' => smtp_setting('smtp_username', ''),
    'smtp_password' => smtp_setting('smtp_password', ''),
    'smtp_from_email' => smtp_setting('smtp_from_email', ''),
    'smtp_from_name' => smtp_setting('smtp_from_name', 'Poznote'),
];
$smtp_configured = smtp_is_configured($settings);
$smtp_enabled = smtp_is_enabled($smtp_configured);
?>
<!DOCTYPE html>
<html lang="<?php echo smtp_h($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('smtp_admin.title', [], 'SMTP Configuration'); ?> - Poznote</title>
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
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/workspaces-inline.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <style>
        .smtp-page form { margin: 0; }
        .smtp-section h2 {
            margin: 0 0 16px;
            color: var(--text-color, #333);
            border-bottom: 2px solid #007cba;
            padding-bottom: 10px;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .smtp-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }
        .smtp-field { margin-bottom: 16px; }
        .smtp-field:last-child { margin-bottom: 0; }
        .smtp-field label {
            display: block;
            font-weight: 600;
            font-size: 0.92rem;
            margin-bottom: 4px;
        }
        .smtp-label-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .smtp-label-row label {
            margin-bottom: 0;
        }
        .smtp-help {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            color: var(--text-secondary, #777);
            cursor: help;
            flex: 0 0 auto;
        }
        .smtp-help .lucide {
            width: 15px;
            height: 15px;
            opacity: 0.7;
            transition: opacity 0.15s ease, color 0.15s ease;
        }
        .smtp-help:hover .lucide,
        .smtp-help:focus .lucide,
        .smtp-help:focus-visible .lucide {
            opacity: 1;
            color: var(--accent-color, #007cba);
        }
        .smtp-help:focus-visible {
            outline: 2px solid var(--accent-color, #007cba);
            outline-offset: 2px;
            border-radius: 50%;
        }
        .smtp-help-tooltip {
            position: absolute;
            top: calc(100% + 8px);
            left: 0;
            width: max-content;
            min-width: 250px;
            max-width: min(340px, calc(100vw - 32px));
            padding: 10px 12px;
            border-radius: 6px;
            background: rgba(20, 20, 20, 0.94);
            color: #fff;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.45;
            text-align: left;
            white-space: normal;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.15s ease, visibility 0.15s ease;
            z-index: 1000;
        }
        .smtp-help-line {
            display: block;
        }
        .smtp-help-line + .smtp-help-line {
            margin-top: 5px;
        }
        .smtp-help:hover .smtp-help-tooltip,
        .smtp-help:focus .smtp-help-tooltip,
        .smtp-help:focus-visible .smtp-help-tooltip {
            opacity: 1;
            visibility: visible;
        }
        .smtp-hint {
            display: block;
            font-size: 0.82rem;
            color: var(--text-secondary, #888);
            margin-bottom: 6px;
            line-height: 1.4;
        }
        .smtp-field input[type="text"],
        .smtp-field input[type="email"],
        .smtp-field input[type="number"],
        .smtp-field input[type="password"],
        .smtp-field input[type="url"],
        .smtp-field select {
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            color: var(--text-primary, #333);
            box-sizing: border-box;
        }
        .smtp-password-wrapper {
            position: relative;
        }
        .smtp-password-wrapper input[type="password"],
        .smtp-password-wrapper input[type="text"] {
            padding-right: 44px;
        }
        .smtp-password-toggle {
            position: absolute;
            top: 50%;
            right: 8px;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: var(--text-secondary, #666);
            cursor: pointer;
        }
        .smtp-password-toggle:hover,
        .smtp-password-toggle:focus-visible {
            color: var(--accent-color, #007cba);
            background: rgba(0, 124, 186, 0.08);
        }
        .smtp-password-toggle:focus-visible {
            outline: 2px solid var(--accent-color, #007cba);
            outline-offset: 1px;
        }
        .smtp-password-toggle .lucide {
            width: 18px;
            height: 18px;
        }
        .smtp-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 24px;
            flex-wrap: wrap;
        }
        .smtp-switch-field {
            margin-bottom: 18px;
        }
        .smtp-switch-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }
        .smtp-switch-copy {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1 1 auto;
        }
        .smtp-switch-title {
            display: block;
            font-weight: 600;
            font-size: 0.95rem;
            margin: 0;
        }
        .smtp-switch-state {
            display: inline-block;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--text-muted, #666);
        }
        .smtp-switch-state.is-enabled {
            color: #1f8f4e;
        }
        .smtp-switch-state.is-disabled {
            color: #b54747;
        }
        .settings-container.smtp-page .workspaces-nav .smtp-test-button {
            background: #007cba !important;
            border-color: #007cba !important;
            color: #fff !important;
        }
        .settings-container.smtp-page .workspaces-nav .smtp-test-button:hover,
        .settings-container.smtp-page .workspaces-nav .smtp-test-button:focus-visible {
            background: #005a8a !important;
            border-color: #005a8a !important;
            color: #fff !important;
            opacity: 1;
        }
        html[data-theme='dark'] .smtp-section h2,
        body.dark-mode .smtp-section h2 {
            color: var(--dm-text);
            border-bottom-color: var(--dm-accent);
        }
        html[data-theme='dark'] .smtp-hint,
        body.dark-mode .smtp-hint {
            color: rgba(255, 255, 255, 0.62);
        }
        html[data-theme='dark'] .smtp-help,
        body.dark-mode .smtp-help {
            color: rgba(255, 255, 255, 0.72);
        }
        html[data-theme='dark'] .smtp-password-toggle,
        body.dark-mode .smtp-password-toggle {
            color: rgba(255, 255, 255, 0.72);
        }
        html[data-theme='dark'] .smtp-switch-state,
        body.dark-mode .smtp-switch-state {
            color: var(--dm-text-muted);
        }
        html[data-theme='dark'] .smtp-password-toggle:hover,
        html[data-theme='dark'] .smtp-password-toggle:focus-visible,
        body.dark-mode .smtp-password-toggle:hover,
        body.dark-mode .smtp-password-toggle:focus-visible {
            color: var(--dm-accent, #4da3ff);
            background: rgba(77, 163, 255, 0.14);
        }
        html[data-theme='dark'] .smtp-field input,
        html[data-theme='dark'] .smtp-field select,
        body.dark-mode .smtp-field input,
        body.dark-mode .smtp-field select {
            background: var(--input-bg, #2a2a2a);
            border-color: var(--border-color, #444);
            color: var(--text-primary, #e0e0e0);
        }
        @media (max-width: 800px) {
            .smtp-grid { grid-template-columns: 1fr; }
            .smtp-switch-row {
                flex-direction: column;
            }
            .settings-container.smtp-page .smtp-actions,
            .settings-container.smtp-page .workspaces-nav {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                align-items: stretch;
            }
            .settings-container.smtp-page .smtp-actions .btn,
            .settings-container.smtp-page .smtp-actions .btn-secondary,
            .settings-container.smtp-page .smtp-actions .btn-primary,
            .settings-container.smtp-page .workspaces-nav .btn,
            .settings-container.smtp-page .workspaces-nav .btn-secondary {
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
        }
    </style>
</head>
<body data-workspace="<?php echo smtp_h($pageWorkspace); ?>">
<div class="settings-container smtp-page">
    <div class="workspaces-nav">
        <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary">
            <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
        </a>
        <a href="../settings.php" class="btn btn-secondary">
            <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_settings', [], 'Settings'); ?>
        </a>
        <button type="submit" form="smtp-config-form" name="action" value="test" class="btn btn-primary smtp-test-button">
            <i class="lucide lucide-mail" style="margin-right: 5px;"></i>
            <?php echo t_h('smtp_admin.test.button', [], 'Send test email'); ?>
        </button>
    </div>

    <?php if ($success || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : 'alert-danger'; ?>">
            <?php echo smtp_h($success ?: $error); ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="" autocomplete="off" id="smtp-config-form">
        <input type="hidden" name="csrf_token" value="<?php echo smtp_h($_SESSION['smtp_csrf_token']); ?>">

        <div class="settings-section smtp-section">
            <h2><?php echo t_h('smtp_admin.section_provider', [], 'SMTP provider'); ?></h2>
            <div class="smtp-field smtp-switch-field">
                <input type="hidden" name="smtp_enabled" value="0">
                <div class="smtp-switch-row">
                    <div class="smtp-switch-copy">
                        <label for="smtp_enabled" class="smtp-switch-title"><?php echo t_h('smtp_admin.fields.enabled', [], 'Enable reminder emails'); ?></label>
                        <span
                            class="smtp-switch-state <?php echo $smtp_enabled ? 'is-enabled' : 'is-disabled'; ?>"
                            id="smtp-enabled-state"
                            data-enabled-label="<?php echo smtp_h(t('common.enabled', [], 'Enabled')); ?>"
                            data-disabled-label="<?php echo smtp_h(t('common.disabled', [], 'Disabled')); ?>"
                        >
                            <?php echo $smtp_enabled ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                        </span>
                    </div>
                    <label class="toggle-switch" for="smtp_enabled">
                        <input type="checkbox" id="smtp_enabled" name="smtp_enabled" value="1" <?php echo $smtp_enabled ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="smtp-grid">
                <div class="smtp-field">
                    <label for="smtp_host"><?php echo t_h('smtp_admin.fields.host', [], 'SMTP host'); ?></label>
                    <input type="text" id="smtp_host" name="smtp_host" value="<?php echo smtp_h($settings['smtp_host']); ?>" placeholder="smtp.example.com">
                </div>
                <div class="smtp-field">
                    <label for="smtp_port"><?php echo t_h('smtp_admin.fields.port', [], 'Port'); ?></label>
                    <input type="number" id="smtp_port" name="smtp_port" min="1" max="65535" value="<?php echo smtp_h($settings['smtp_port']); ?>">
                </div>
                <div class="smtp-field">
                    <div class="smtp-label-row">
                        <label for="smtp_security"><?php echo t_h('smtp_admin.fields.security', [], 'Encryption'); ?></label>
                        <span class="smtp-help" tabindex="0" role="img" aria-label="<?php echo t_h('smtp_admin.hints.security_summary', [], 'STARTTLS usually uses port 587 and upgrades to TLS after connecting. SSL/TLS is encrypted from the connection, usually on port 465. None uses no encryption.'); ?>">
                            <i class="lucide lucide-help-circle"></i>
                            <span class="smtp-help-tooltip" role="tooltip">
                                <span class="smtp-help-line"><?php echo t_h('smtp_admin.hints.security_tls', [], 'STARTTLS: standard connection, then upgrade to TLS, usually port 587.'); ?></span>
                                <span class="smtp-help-line"><?php echo t_h('smtp_admin.hints.security_ssl', [], 'SSL/TLS: encrypted from the connection, usually port 465.'); ?></span>
                                <span class="smtp-help-line"><?php echo t_h('smtp_admin.hints.security_none', [], 'None: no encryption, only for a local relay or trusted network.'); ?></span>
                            </span>
                        </span>
                    </div>
                    <select id="smtp_security" name="smtp_security">
                        <option value="tls" <?php echo $settings['smtp_security'] === 'tls' ? 'selected' : ''; ?>>STARTTLS</option>
                        <option value="ssl" <?php echo $settings['smtp_security'] === 'ssl' ? 'selected' : ''; ?>>SSL/TLS</option>
                        <option value="none" <?php echo $settings['smtp_security'] === 'none' ? 'selected' : ''; ?>><?php echo t_h('smtp_admin.security_none', [], 'None'); ?></option>
                    </select>
                </div>
                <div class="smtp-field">
                    <label for="smtp_username"><?php echo t_h('smtp_admin.fields.username', [], 'Username'); ?></label>
                    <input type="text" id="smtp_username" name="smtp_username" value="<?php echo smtp_h($settings['smtp_username']); ?>" autocomplete="off">
                </div>
                <div class="smtp-field">
                    <label for="smtp_password"><?php echo t_h('smtp_admin.fields.password', [], 'Password'); ?></label>
                    <div class="smtp-password-wrapper">
                        <input type="password" id="smtp_password" name="smtp_password" value="<?php echo smtp_h($settings['smtp_password']); ?>" autocomplete="new-password">
                        <button
                            type="button"
                            class="smtp-password-toggle"
                            id="smtp-password-toggle"
                            title="<?php echo t_h('login.show_password', [], 'Show password'); ?>"
                            aria-label="<?php echo t_h('login.show_password', [], 'Show password'); ?>"
                            data-show-label="<?php echo t_h('login.show_password', [], 'Show password'); ?>"
                            data-hide-label="<?php echo t_h('login.hide_password', [], 'Hide password'); ?>"
                        >
                            <i class="lucide lucide-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="smtp-field">
                    <label for="smtp_from_email"><?php echo t_h('smtp_admin.fields.from_email', [], 'Sender email'); ?></label>
                    <input type="email" id="smtp_from_email" name="smtp_from_email" value="<?php echo smtp_h($settings['smtp_from_email']); ?>" placeholder="poznote@example.com">
                </div>
                <div class="smtp-field">
                    <label for="smtp_from_name"><?php echo t_h('smtp_admin.fields.from_name', [], 'Sender name'); ?></label>
                    <input type="text" id="smtp_from_name" name="smtp_from_name" value="<?php echo smtp_h($settings['smtp_from_name']); ?>" placeholder="Poznote">
                </div>
            </div>
        </div>

        <div class="smtp-actions">
            <a href="../settings.php" class="btn btn-danger"><?php echo t_h('common.cancel', [], 'Cancel'); ?></a>
            <button type="submit" name="action" value="save" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
        </div>
    </form>
</div>
<script>
document.addEventListener('DOMContentLoaded', function () {
    var securitySelect = document.getElementById('smtp_security');
    var portInput = document.getElementById('smtp_port');
    var passwordInput = document.getElementById('smtp_password');
    var passwordToggle = document.getElementById('smtp-password-toggle');
    var enabledInput = document.getElementById('smtp_enabled');
    var enabledState = document.getElementById('smtp-enabled-state');

    if (enabledInput && enabledState) {
        enabledInput.addEventListener('change', function () {
            var isEnabled = enabledInput.checked;
            enabledState.textContent = enabledState.getAttribute(isEnabled ? 'data-enabled-label' : 'data-disabled-label') || '';
            enabledState.classList.toggle('is-enabled', isEnabled);
            enabledState.classList.toggle('is-disabled', !isEnabled);
        });
    }

    if (securitySelect && portInput) {
        securitySelect.addEventListener('change', function () {
            if (!portInput.value || portInput.value === '465' || portInput.value === '587' || portInput.value === '25') {
                portInput.value = securitySelect.value === 'ssl' ? '465' : (securitySelect.value === 'none' ? '25' : '587');
            }
        });
    }

    if (passwordInput && passwordToggle) {
        passwordToggle.addEventListener('click', function () {
            var isHidden = passwordInput.getAttribute('type') === 'password';
            var nextType = isHidden ? 'text' : 'password';
            var nextLabel = passwordToggle.getAttribute(isHidden ? 'data-hide-label' : 'data-show-label') || '';
            var icon = passwordToggle.querySelector('i');

            passwordInput.setAttribute('type', nextType);
            passwordToggle.setAttribute('title', nextLabel);
            passwordToggle.setAttribute('aria-label', nextLabel);

            if (icon) {
                icon.classList.toggle('lucide-eye', !isHidden);
                icon.classList.toggle('lucide-eye-off', isHidden);
            }
        });
    }
});
</script>
</body>
</html>
