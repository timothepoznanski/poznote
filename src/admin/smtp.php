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

function smtp_setting_bool(string $key, bool $default = false): bool {
    $value = getGlobalSetting($key, null);
    if ($value === null) {
        return $default;
    }
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['smtp_csrf_token']) || !hash_equals($_SESSION['smtp_csrf_token'], $token)) {
        $error = t('smtp_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        $previousEnabled = smtp_setting_bool('smtp_enabled', false);
        $enabled = isset($_POST['smtp_enabled']);
        $security = strtolower(trim((string)($_POST['smtp_security'] ?? 'tls')));
        if (!in_array($security, ['none', 'tls', 'ssl'], true)) {
            $security = 'tls';
        }
        $postedPort = trim((string)($_POST['smtp_port'] ?? ''));
        $port = $postedPort === '' ? ($security === 'ssl' ? 465 : ($security === 'none' ? 25 : 587)) : (int)$postedPort;
        $port = max(1, min(65535, $port));

        $existingPassword = smtp_setting('smtp_password', '');
        $clearPassword = isset($_POST['smtp_clear_password']);
        $postedPassword = (string)($_POST['smtp_password'] ?? '');
        $password = $clearPassword ? '' : ($postedPassword !== '' ? $postedPassword : $existingPassword);

        $existingAppUrl = smtp_setting('smtp_app_url', '');
        $appUrl = array_key_exists('smtp_app_url', $_POST)
            ? rtrim(trim((string)$_POST['smtp_app_url']), '/')
            : $existingAppUrl;
        $settingsToSave = [
            'smtp_enabled' => $enabled ? '1' : '0',
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
            'enabled' => $enabled,
            'host' => $settingsToSave['smtp_host'],
            'port' => (int)$settingsToSave['smtp_port'],
            'security' => $security,
            'username' => $settingsToSave['smtp_username'],
            'password' => $password,
            'from_email' => $settingsToSave['smtp_from_email'],
            'from_name' => $settingsToSave['smtp_from_name'],
            'app_url' => $appUrl,
        ];

        $validationErrors = $enabled ? $service->validateSmtpConfig($configForValidation, true) : [];
        if (($_POST['action'] ?? 'save') === 'test') {
            $validationErrors = array_merge($validationErrors, $service->validateSmtpConfig($configForValidation, false));
        }

        if (!empty($validationErrors)) {
            $error = implode(' ', $validationErrors);
        } else {
            $allOk = true;
            foreach ($settingsToSave as $key => $value) {
                if (!setGlobalSetting($key, $value)) {
                    $allOk = false;
                }
            }

            if ($enabled && (!$previousEnabled || smtp_setting('smtp_reminder_cutoff_at', '') === '')) {
                setGlobalSetting('smtp_reminder_cutoff_at', gmdate('Y-m-d H:i:s'));
            }

            if (!$allOk) {
                $error = t('smtp_admin.error_saving', [], 'Error saving SMTP configuration.');
            } elseif (($_POST['action'] ?? 'save') === 'test') {
                $recipient = trim((string)($_POST['smtp_test_recipient'] ?? ''));
                $test = $service->sendTestEmail($recipient, '');
                if ($test['success']) {
                    $success = t('smtp_admin.test.success', [], 'SMTP configuration saved and test email sent.');
                } else {
                    $error = t('smtp_admin.test.error', ['error' => $test['error'] ?? 'Unknown error'], 'SMTP configuration saved, but the test email failed: {{error}}');
                }
            } else {
                $success = t('smtp_admin.saved', [], 'SMTP configuration saved successfully.');
            }
        }
    }
}

$_SESSION['smtp_csrf_token'] = bin2hex(random_bytes(32));

$settings = [
    'smtp_enabled' => smtp_setting_bool('smtp_enabled', false),
    'smtp_host' => smtp_setting('smtp_host', ''),
    'smtp_port' => smtp_setting('smtp_port', '587'),
    'smtp_security' => smtp_setting('smtp_security', 'tls'),
    'smtp_username' => smtp_setting('smtp_username', ''),
    'smtp_password_configured' => smtp_setting('smtp_password', '') !== '',
    'smtp_from_email' => smtp_setting('smtp_from_email', ''),
    'smtp_from_name' => smtp_setting('smtp_from_name', 'Poznote'),
    'smtp_app_url' => smtp_setting('smtp_app_url', ''),
];

$currentUser = getCurrentUser();
$defaultTestRecipient = trim((string)($currentUser['email'] ?? ''));
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
        .smtp-switch-state.is-enabled { color: #1f8f4e; }
        .smtp-switch-state.is-disabled { color: #b54747; }
        .smtp-field label.smtp-inline-check {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
            color: var(--text-secondary, #666);
            font-weight: 500;
            margin-top: 8px;
            margin-bottom: 0;
        }
        .smtp-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 24px;
            flex-wrap: wrap;
        }
        html[data-theme='dark'] .smtp-section h2,
        body.dark-mode .smtp-section h2 {
            color: var(--dm-text);
            border-bottom-color: var(--dm-accent);
        }
        html[data-theme='dark'] .smtp-hint,
        body.dark-mode .smtp-hint,
        html[data-theme='dark'] .smtp-inline-check,
        body.dark-mode .smtp-inline-check {
            color: rgba(255, 255, 255, 0.62);
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
            .smtp-switch-row { flex-direction: column; }
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
    </div>

    <?php if ($success || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : 'alert-danger'; ?>">
            <?php echo smtp_h($success ?: $error); ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="" autocomplete="off">
        <input type="hidden" name="csrf_token" value="<?php echo smtp_h($_SESSION['smtp_csrf_token']); ?>">

        <div class="settings-section smtp-section">
            <h2><?php echo t_h('smtp_admin.section_delivery', [], 'Reminder email delivery'); ?></h2>
            <div class="smtp-field">
                <div class="smtp-switch-row">
                    <div class="smtp-switch-copy">
                        <label for="smtp_enabled" class="smtp-switch-title"><?php echo t_h('smtp_admin.fields.enabled', [], 'Enable reminder emails'); ?></label>
                        <span class="smtp-hint"><?php echo t_h('smtp_admin.hints.enabled', [], 'When enabled, the internal worker sends emails for due reminders to each user email address.'); ?></span>
                        <span
                            class="smtp-switch-state <?php echo $settings['smtp_enabled'] ? 'is-enabled' : 'is-disabled'; ?>"
                            id="smtp-enabled-state"
                            data-enabled-label="<?php echo smtp_h(t('common.enabled', [], 'Enabled')); ?>"
                            data-disabled-label="<?php echo smtp_h(t('common.disabled', [], 'Disabled')); ?>"
                        >
                            <?php echo $settings['smtp_enabled'] ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                        </span>
                    </div>
                    <label class="toggle-switch" for="smtp_enabled">
                        <input type="checkbox" id="smtp_enabled" name="smtp_enabled" value="1" <?php echo $settings['smtp_enabled'] ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="settings-section smtp-section">
            <h2><?php echo t_h('smtp_admin.section_provider', [], 'SMTP provider'); ?></h2>
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
                    <label for="smtp_security"><?php echo t_h('smtp_admin.fields.security', [], 'Encryption'); ?></label>
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
                    <span class="smtp-hint">
                        <?php echo $settings['smtp_password_configured']
                            ? t_h('smtp_admin.hints.password_configured', [], 'A password is configured. Leave blank to keep it.')
                            : t_h('smtp_admin.hints.password_empty', [], 'No password configured.'); ?>
                    </span>
                    <input type="password" id="smtp_password" name="smtp_password" value="" autocomplete="new-password">
                    <?php if ($settings['smtp_password_configured']): ?>
                        <label class="smtp-inline-check" for="smtp_clear_password">
                            <input type="checkbox" id="smtp_clear_password" name="smtp_clear_password" value="1">
                            <?php echo t_h('smtp_admin.fields.clear_password', [], 'Clear stored password'); ?>
                        </label>
                    <?php endif; ?>
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

        <div class="settings-section smtp-section">
            <h2><?php echo t_h('smtp_admin.section_test', [], 'Test'); ?></h2>
            <div class="smtp-field">
                <label for="smtp_test_recipient"><?php echo t_h('smtp_admin.fields.test_recipient', [], 'Test recipient'); ?></label>
                <span class="smtp-hint"><?php echo t_h('smtp_admin.hints.test_recipient', [], 'Use this to verify the provider before enabling reminder emails.'); ?></span>
                <input type="email" id="smtp_test_recipient" name="smtp_test_recipient" value="<?php echo smtp_h($defaultTestRecipient); ?>" placeholder="you@example.com">
            </div>
        </div>

        <div class="smtp-actions">
            <a href="../settings.php" class="btn btn-danger"><?php echo t_h('common.cancel', [], 'Cancel'); ?></a>
            <button type="submit" name="action" value="test" class="btn btn-secondary"><?php echo t_h('smtp_admin.test.button', [], 'Send test email'); ?></button>
            <button type="submit" name="action" value="save" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
        </div>
    </form>
</div>
<script>
document.addEventListener('DOMContentLoaded', function () {
    var enabledCheckbox = document.getElementById('smtp_enabled');
    var enabledState = document.getElementById('smtp-enabled-state');
    var securitySelect = document.getElementById('smtp_security');
    var portInput = document.getElementById('smtp_port');

    if (enabledCheckbox && enabledState) {
        var enabledLabel = enabledState.getAttribute('data-enabled-label') || 'Enabled';
        var disabledLabel = enabledState.getAttribute('data-disabled-label') || 'Disabled';
        function syncEnabledState() {
            var isEnabled = enabledCheckbox.checked;
            enabledState.textContent = isEnabled ? enabledLabel : disabledLabel;
            enabledState.classList.toggle('is-enabled', isEnabled);
            enabledState.classList.toggle('is-disabled', !isEnabled);
        }
        enabledCheckbox.addEventListener('change', syncEnabledState);
        syncEnabledState();
    }

    if (securitySelect && portInput) {
        securitySelect.addEventListener('change', function () {
            if (!portInput.value || portInput.value === '465' || portInput.value === '587' || portInput.value === '25') {
                portInput.value = securitySelect.value === 'ssl' ? '465' : (securitySelect.value === 'none' ? '25' : '587');
            }
        });
    }
});
</script>
</body>
</html>
