<?php
/**
 * User Webhooks - per-account tool
 *
 * Register HTTP endpoints notified about the current account's own content:
 * a reminder triggering, a note being created or publicly shared. Every user
 * manages their own endpoints and only their own events are ever dispatched
 * to them: these webhooks relay personal note data, so they live with the
 * account settings rather than the instance admin tools. Tenant isolation
 * can block the feature for non-admin users.
 */

require_once __DIR__ . '/auth.php';
requireAuth();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
requireSettingsPassword();

if (!poznoteCanUseUserWebhooks()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">' . htmlspecialchars(t('webhooks_user.access_denied', [], 'Access denied. User webhooks are disabled on this instance.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    exit;
}

$currentWebhookUserId = (int)(getCurrentUserId() ?? 0);

require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/WebhookDispatcher.php';
require_once __DIR__ . '/version_helper.php';

$v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$success = '';
$warning = '';
$error = '';

function user_webhooks_h($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function user_webhooks_is_valid_url(string $url): bool {
    return filter_var($url, FILTER_VALIDATE_URL) !== false
        && preg_match('#^https?://#i', $url) === 1;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['user_webhooks_csrf_token']) || !hash_equals($_SESSION['user_webhooks_csrf_token'], $token)) {
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
            $events = array_values(array_intersect(WebhookDispatcher::USER_EVENTS, array_map('strval', $events)));

            $urlAlreadyRegistered = false;
            foreach (listWebhooksForUser($currentWebhookUserId) as $existing) {
                if (trim((string)$existing['url']) === $url) {
                    $urlAlreadyRegistered = true;
                    break;
                }
            }

            if (!user_webhooks_is_valid_url($url)) {
                $error = t('webhooks_admin.error_invalid_url', [], 'The webhook URL must start with http:// or https://.');
            } elseif (empty($events)) {
                $error = t('webhooks_admin.error_no_events', [], 'Select at least one event.');
            } elseif (createWebhook($url, $secret, $events, $currentWebhookUserId)) {
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
            if ($webhook && (int)($webhook['user_id'] ?? 0) !== $currentWebhookUserId) {
                // Other users' webhooks and admin instance webhooks are out of
                // reach from this page.
                $webhook = null;
            }
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

$_SESSION['user_webhooks_csrf_token'] = bin2hex(random_bytes(32));
// Only the current account's webhooks; instance webhooks are managed from
// the admin page.
$webhooks = listWebhooksForUser($currentWebhookUserId);

// The instance URL behind data.note.url is a global setting, so it is only
// surfaced here: shown so a user whose payloads carry no link knows why, and
// editable from the admin webhooks page only.
$effectiveAppUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
if ($effectiveAppUrl === '' && function_exists('_env')) {
    $effectiveAppUrl = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
}
$canEditAppUrl = isCurrentUserAdmin();

// Hover help for each event, same bubble pattern as the settings cards.
// i18n keys replace the dots of the event name with underscores.
$eventHelpDefaults = [
    'reminder.due' => 'One of your note reminders reached its trigger time; other users\' reminders never trigger your webhooks. Full payload: the note (id, title, workspace, direct link) and the reminder message.',
    'reminder.due_title' => 'Same trigger as reminder.due but without the reminder message: identifiers plus the note title and direct link.',
    'reminder.due_minimal' => 'Same trigger as reminder.due but identifiers only (note id, reminder id, trigger time): no note content leaves the instance. Details can be fetched through the REST API.',
    'note.created' => 'A note was created in your account, from the interface or the REST API. Payload: metadata only (note id, title, type, workspace, folder, direct link), never the note content.',
    'note.shared' => 'A public share link was published for one of your notes. Payload: the note (id, title, workspace, direct link), the public token and URL, and whether the link is password protected.',
];
$eventHelp = [];
foreach ($eventHelpDefaults as $eventName => $default) {
    $eventHelp[$eventName] = t('webhooks_admin.event_help.' . str_replace('.', '_', $eventName), [], $default);
}
?>
<!DOCTYPE html>
<html lang="<?php echo user_webhooks_h($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('webhooks_user.title', [], 'User Webhooks'); ?> - Poznote</title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/workspaces.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/workspaces-inline.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/webhooks.css?v=<?php echo $v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
</head>
<body data-workspace="<?php echo user_webhooks_h($pageWorkspace); ?>">
<div class="settings-container webhooks-page">
    <div class="workspaces-nav">
        <a href="index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary">
            <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
        </a>
        <a href="settings.php" class="btn btn-secondary">
            <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_settings', [], 'Settings'); ?>
        </a>
    </div>

    <?php if ($success || $warning || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : ($warning ? 'alert-warning' : 'alert-danger'); ?>">
            <?php echo user_webhooks_h($success ?: ($warning ?: $error)); ?>
        </div>
    <?php endif; ?>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_add', [], 'Add a webhook'); ?></h2>
        <p class="webhooks-section-hint">
            <?php echo t_h('webhooks_user.description', [], 'Poznote sends an HTTP POST request with a JSON payload to each registered endpoint when one of your notes triggers a subscribed event: a reminder firing, a note being created or publicly shared. Only your own notes are concerned. If a secret is set, the payload is signed with HMAC-SHA256 in the X-Poznote-Signature-256 header.'); ?>
        </p>
        <?php if ($effectiveAppUrl === ''): ?>
            <p class="webhooks-section-hint">
                <?php if ($canEditAppUrl): ?>
                    <?php echo t_h('webhooks_user.app_url_unset_admin', [], 'No instance URL is configured, so the payloads carry no direct note link (data.note.url is null). Set it on the admin Webhooks page.'); ?>
                <?php else: ?>
                    <?php echo t_h('webhooks_user.app_url_unset', [], 'No instance URL is configured, so the payloads carry no direct note link (data.note.url is null). Ask an administrator to set it on the admin Webhooks page.'); ?>
                <?php endif; ?>
            </p>
        <?php endif; ?>
        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo user_webhooks_h($_SESSION['user_webhooks_csrf_token']); ?>">
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
                    <?php foreach (WebhookDispatcher::USER_EVENTS as $eventName): ?>
                        <span class="webhooks-event">
                            <label class="webhooks-event-label">
                                <input type="checkbox" name="webhook_events[]" value="<?php echo user_webhooks_h($eventName); ?>" <?php echo $eventName === 'reminder.due' ? 'checked' : ''; ?>>
                                <code><?php echo user_webhooks_h($eventName); ?></code>
                            </label>
                            <?php if (!empty($eventHelp[$eventName])): ?>
                                <span class="webhooks-event-help" data-tooltip="<?php echo user_webhooks_h($eventHelp[$eventName]); ?>"><i class="lucide lucide-help-circle"></i></span>
                            <?php endif; ?>
                        </span>
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
                            <span class="webhooks-item-url"><?php echo user_webhooks_h($webhook['url']); ?></span>
                            <span class="webhooks-item-meta">
                                <span class="webhooks-state <?php echo $isActive ? 'is-enabled' : 'is-disabled'; ?>">
                                    <?php echo $isActive ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                                </span>
                                <span><code><?php echo user_webhooks_h($webhook['events']); ?></code></span>
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
                                <input type="hidden" name="csrf_token" value="<?php echo user_webhooks_h($_SESSION['user_webhooks_csrf_token']); ?>">
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
