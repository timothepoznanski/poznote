<?php
/**
 * Outgoing Webhooks - Admin Tool
 *
 * Register HTTP endpoints notified of instance events (e.g. user.created).
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

require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../WebhookDispatcher.php';
require_once __DIR__ . '/../version_helper.php';

$v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$success = '';
$warning = '';
$error = '';

function webhooks_h($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function webhooks_is_valid_url(string $url): bool {
    return filter_var($url, FILTER_VALIDATE_URL) !== false
        && preg_match('#^https?://#i', $url) === 1;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['webhooks_csrf_token']) || !hash_equals($_SESSION['webhooks_csrf_token'], $token)) {
        $error = t('webhooks_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'add') {
            $url = trim((string)($_POST['webhook_url'] ?? ''));
            $secret = trim((string)($_POST['webhook_secret'] ?? ''));
            $events = $_POST['webhook_events'] ?? [];
            if (!is_array($events)) {
                $events = [];
            }
            $events = array_values(array_intersect(WebhookDispatcher::EVENTS, array_map('strval', $events)));

            $urlAlreadyRegistered = false;
            foreach (listWebhooks() as $existing) {
                if (trim((string)$existing['url']) === $url) {
                    $urlAlreadyRegistered = true;
                    break;
                }
            }

            if (!webhooks_is_valid_url($url)) {
                $error = t('webhooks_admin.error_invalid_url', [], 'The webhook URL must start with http:// or https://.');
            } elseif (empty($events)) {
                $error = t('webhooks_admin.error_no_events', [], 'Select at least one event.');
            } elseif (createWebhook($url, $secret, $events)) {
                if ($urlAlreadyRegistered) {
                    $warning = t('webhooks_admin.added_duplicate', [], 'Webhook added, but this URL was already registered: each entry will receive its own delivery for every event.');
                } else {
                    $success = t('webhooks_admin.added', [], 'Webhook added.');
                }
            } else {
                $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
            }
        } elseif (in_array($action, ['delete', 'enable', 'disable', 'test'], true)) {
            $id = (int)($_POST['webhook_id'] ?? 0);
            $webhook = $id > 0 ? getWebhookById($id) : null;
            if (!$webhook) {
                $error = t('webhooks_admin.error_not_found', [], 'Webhook not found.');
            } elseif ($action === 'delete') {
                if (deleteWebhook($id)) {
                    $success = t('webhooks_admin.deleted', [], 'Webhook deleted.');
                } else {
                    $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
                }
            } elseif ($action === 'enable' || $action === 'disable') {
                if (setWebhookActive($id, $action === 'enable')) {
                    $success = $action === 'enable'
                        ? t('webhooks_admin.enabled', [], 'Webhook enabled.')
                        : t('webhooks_admin.disabled', [], 'Webhook disabled.');
                } else {
                    $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
                }
            } else {
                $delivery = (new WebhookDispatcher())->deliver($webhook, 'ping', [
                    'message' => 'Poznote webhook test',
                ]);
                if ($delivery['success']) {
                    $success = t('webhooks_admin.test_success', ['status' => $delivery['status']], 'Test delivered (HTTP {{status}}).');
                } else {
                    $error = t('webhooks_admin.test_failure', ['status' => $delivery['status']], 'Test delivery failed ({{status}}).');
                }
            }
        }
    }
}

$_SESSION['webhooks_csrf_token'] = bin2hex(random_bytes(32));
$webhooks = listWebhooks();
?>
<!DOCTYPE html>
<html lang="<?php echo webhooks_h($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('webhooks_admin.title', [], 'Webhooks'); ?> - Poznote</title>
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
        .webhooks-page form { margin: 0; }
        .webhooks-page .alert-warning {
            background: #fff3cd;
            border: 1px solid #ffe69c;
            color: #664d03;
        }
        html[data-theme='dark'] .webhooks-page .alert-warning,
        body.dark-mode .webhooks-page .alert-warning {
            background: rgba(255, 193, 7, 0.12);
            border-color: rgba(255, 193, 7, 0.35);
            color: #ffd964;
        }
        .webhooks-section h2 {
            margin: 0 0 16px;
            color: var(--text-color, #333);
            border-bottom: 2px solid #007cba;
            padding-bottom: 10px;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .webhooks-section-hint {
            margin: 0 0 16px;
            font-size: 0.92rem;
            line-height: 1.45;
            color: var(--text-secondary, #666);
        }
        .webhooks-field { margin-bottom: 16px; }
        .webhooks-field label {
            display: block;
            font-weight: 600;
            font-size: 0.92rem;
            margin-bottom: 4px;
        }
        .webhooks-hint {
            display: block;
            font-size: 0.82rem;
            color: var(--text-secondary, #888);
            margin-top: 4px;
            line-height: 1.4;
        }
        .webhooks-field input[type="url"],
        .webhooks-field input[type="text"] {
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            color: var(--text-primary, #333);
            box-sizing: border-box;
        }
        .webhooks-events {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        /* Beats the .webhooks-field label rule above, which would otherwise
           force display:block and bold on these checkbox pills. */
        .webhooks-field label.webhooks-event {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            margin-bottom: 0;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 400;
        }
        .webhooks-event input[type="checkbox"] {
            margin: 0;
            flex: 0 0 auto;
        }
        .webhooks-event code {
            font-size: 0.85rem;
            line-height: 1;
        }
        .webhooks-add-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 8px;
        }
        .webhooks-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .webhooks-item {
            border: 1px solid var(--border-color, #ddd);
            border-radius: 8px;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .webhooks-item-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            flex: 1 1 320px;
        }
        .webhooks-item-url {
            font-weight: 600;
            font-size: 0.95rem;
            word-break: break-all;
        }
        .webhooks-item-meta {
            font-size: 0.82rem;
            color: var(--text-secondary, #888);
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        .webhooks-item-meta code { font-size: 0.8rem; }
        .webhooks-state {
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        .webhooks-state.is-enabled { color: #1f8f4e; }
        .webhooks-state.is-disabled { color: #b54747; }
        .webhooks-item-actions,
        .webhooks-item-actions form {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .webhooks-item-actions .btn {
            padding: 7px 12px;
            font-size: 0.85rem;
        }
        html[data-theme='dark'] .webhooks-section h2,
        body.dark-mode .webhooks-section h2 {
            color: var(--dm-text);
            border-bottom-color: var(--dm-accent);
        }
        html[data-theme='dark'] .webhooks-hint,
        html[data-theme='dark'] .webhooks-section-hint,
        body.dark-mode .webhooks-hint,
        body.dark-mode .webhooks-section-hint {
            color: rgba(255, 255, 255, 0.62);
        }
        html[data-theme='dark'] .webhooks-field input,
        body.dark-mode .webhooks-field input {
            background: var(--input-bg, #2a2a2a);
            border-color: var(--border-color, #444);
            color: var(--text-primary, #e0e0e0);
        }
        @media (max-width: 768px) {
            /* users.css forces .btn to width:100% on mobile; stack them cleanly */
            .webhooks-item-actions,
            .webhooks-item-actions form {
                width: 100%;
                flex-direction: column;
            }
        }
        @media (max-width: 800px) {
            .settings-container.webhooks-page .workspaces-nav {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                align-items: stretch;
            }
            .settings-container.webhooks-page .workspaces-nav .btn {
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
<body data-workspace="<?php echo webhooks_h($pageWorkspace); ?>">
<div class="settings-container webhooks-page">
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

    <?php if ($success || $warning || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : ($warning ? 'alert-warning' : 'alert-danger'); ?>">
            <?php echo webhooks_h($success ?: ($warning ?: $error)); ?>
        </div>
    <?php endif; ?>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_add', [], 'Add a webhook'); ?></h2>
        <p class="webhooks-section-hint">
            <?php echo t_h('webhooks_admin.description', [], 'Poznote sends an HTTP POST request with a JSON payload to each registered endpoint when a subscribed event occurs. If a secret is set, the payload is signed with HMAC-SHA256 in the X-Poznote-Signature-256 header.'); ?>
        </p>
        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
            <input type="hidden" name="action" value="add">
            <div class="webhooks-field">
                <label for="webhook_url"><?php echo t_h('webhooks_admin.fields.url', [], 'Endpoint URL'); ?></label>
                <input type="url" id="webhook_url" name="webhook_url" placeholder="https://example.com/webhook" required>
            </div>
            <div class="webhooks-field">
                <label for="webhook_secret"><?php echo t_h('webhooks_admin.fields.secret', [], 'Secret (optional)'); ?></label>
                <input type="text" id="webhook_secret" name="webhook_secret" autocomplete="off">
                <span class="webhooks-hint"><?php echo t_h('webhooks_admin.hints.secret', [], 'Used to sign the payload so the receiver can verify it comes from this instance.'); ?></span>
            </div>
            <div class="webhooks-field">
                <label><?php echo t_h('webhooks_admin.fields.events', [], 'Events'); ?></label>
                <div class="webhooks-events">
                    <?php foreach (WebhookDispatcher::EVENTS as $eventName): ?>
                        <label class="webhooks-event">
                            <input type="checkbox" name="webhook_events[]" value="<?php echo webhooks_h($eventName); ?>" checked>
                            <code><?php echo webhooks_h($eventName); ?></code>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="webhooks-add-actions">
                <button type="submit" class="btn btn-primary"><?php echo t_h('webhooks_admin.add_button', [], 'Add webhook'); ?></button>
            </div>
        </form>
    </div>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_list', [], 'Registered webhooks'); ?></h2>
        <?php if (empty($webhooks)): ?>
            <p class="webhooks-section-hint"><?php echo t_h('webhooks_admin.empty', [], 'No webhook registered yet.'); ?></p>
        <?php else: ?>
            <div class="webhooks-list">
                <?php foreach ($webhooks as $webhook): ?>
                    <?php
                        $webhookId = (int)$webhook['id'];
                        $isActive = !empty($webhook['active']);
                        $lastStatus = trim((string)($webhook['last_status'] ?? ''));
                        $lastAt = trim((string)($webhook['last_delivery_at'] ?? ''));
                    ?>
                    <div class="webhooks-item">
                        <div class="webhooks-item-info">
                            <span class="webhooks-item-url"><?php echo webhooks_h($webhook['url']); ?></span>
                            <span class="webhooks-item-meta">
                                <span class="webhooks-state <?php echo $isActive ? 'is-enabled' : 'is-disabled'; ?>">
                                    <?php echo $isActive ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                                </span>
                                <span><code><?php echo webhooks_h($webhook['events']); ?></code></span>
                                <?php if (!empty($webhook['secret'])): ?>
                                    <span><?php echo t_h('webhooks_admin.signed', [], 'Signed'); ?></span>
                                <?php endif; ?>
                                <?php if ($lastStatus !== ''): ?>
                                    <span><?php echo t_h('webhooks_admin.last_delivery', ['status' => $lastStatus, 'date' => $lastAt], 'Last delivery: {{status}} ({{date}} UTC)'); ?></span>
                                <?php endif; ?>
                            </span>
                        </div>
                        <div class="webhooks-item-actions">
                            <form method="POST" action="">
                                <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
                                <input type="hidden" name="webhook_id" value="<?php echo $webhookId; ?>">
                                <button type="submit" name="action" value="test" class="btn btn-secondary"><?php echo t_h('webhooks_admin.test_button', [], 'Send test'); ?></button>
                                <button type="submit" name="action" value="<?php echo $isActive ? 'disable' : 'enable'; ?>" class="btn btn-secondary">
                                    <?php echo $isActive ? t_h('webhooks_admin.disable_button', [], 'Disable') : t_h('webhooks_admin.enable_button', [], 'Enable'); ?>
                                </button>
                                <button type="submit" name="action" value="delete" class="btn btn-danger"><?php echo t_h('common.delete', [], 'Delete'); ?></button>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</div>
</body>
</html>
