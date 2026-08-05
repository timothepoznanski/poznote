<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/users/db_master.php';

/**
 * Delivers events to the registered outgoing webhooks: instance events to the
 * admin-registered webhooks, user-content events to the webhooks of the
 * account that produced them.
 *
 * Delivery is best-effort and synchronous with a short timeout: a slow or
 * failing endpoint must never break the action (e.g. a signup) that produced
 * the event. Payloads are signed with HMAC-SHA256 when the webhook has a
 * secret, so receivers can authenticate the sender.
 */
class WebhookDispatcher {

    // Instance-level events, managed from the admin webhooks page.
    public const INSTANCE_EVENTS = [
        'user.created',
        'user.updated',
        'user.activated',
        'user.deactivated',
        'user.deleted',
        'signup.cap_reached',
        'quota.notes_reached',
        'quota.storage_reached',
    ];

    // Events about an account's own content, managed from that account's
    // settings page (User Webhooks). They only ever reach the webhooks
    // registered by the account that produced them: one user's notes and
    // reminders must not reach another user's endpoints.
    public const USER_EVENTS = [
        'reminder.due',
        'reminder.due_title',
        'reminder.due_minimal',
        'note.created',
        'note.shared',
    ];

    // Reminder subset of USER_EVENTS; the worker skips its scan entirely when
    // no active webhook subscribes to any of them.
    public const REMINDER_EVENTS = ['reminder.due', 'reminder.due_title', 'reminder.due_minimal'];

    // Every event, INSTANCE_EVENTS + USER_EVENTS (kept literal: constant
    // expressions cannot call array_merge).
    public const EVENTS = [
        'user.created',
        'user.updated',
        'user.activated',
        'user.deactivated',
        'user.deleted',
        'signup.cap_reached',
        'quota.notes_reached',
        'quota.storage_reached',
        'reminder.due',
        'reminder.due_title',
        'reminder.due_minimal',
        'note.created',
        'note.shared',
    ];

    private const TIMEOUT_SECONDS = 5;

    /**
     * True when user-content events may be dispatched for this account.
     * Mirrors poznoteCanUseUserWebhooks() but works from a user id, so the
     * reminder worker (no session) can apply the same rule: when tenant
     * isolation blocks the user_webhooks feature, only admins' webhooks fire.
     */
    public static function userWebhooksAllowedFor(int $userId): bool {
        if ($userId <= 0) {
            return false;
        }
        if (!defined('TENANT_ISOLATION_FEATURES')
            || !in_array('user_webhooks', TENANT_ISOLATION_FEATURES, true)) {
            return true;
        }

        $user = getUserProfileById($userId);
        return $user && !empty($user['is_admin']);
    }

    /**
     * Send an event to every active webhook subscribed to it.
     *
     * $forUserId scopes delivery to one account's webhooks; user events must
     * always pass it, instance events never.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatch(string $event, array $data, ?int $forUserId = null): array {
        $result = ['delivered' => 0, 'failed' => 0];

        try {
            foreach (listActiveWebhooksForEvent($event, $forUserId) as $webhook) {
                if ($this->deliver($webhook, $event, $data)['success']) {
                    $result['delivered']++;
                } else {
                    $result['failed']++;
                }
            }
        } catch (Throwable $e) {
            error_log('Webhook dispatch aborted for event ' . $event . ': ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * Convenience wrapper for the user.created event: loads the profile and
     * builds the standard payload. $source tells receivers how the account was
     * created: 'oidc', 'admin' or 'api'.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatchUserCreated(int $userId, string $source): array {
        $user = getUserProfileById($userId);
        if (!$user) {
            return ['delivered' => 0, 'failed' => 0];
        }

        return $this->dispatch('user.created', ['user' => $this->userPayload($user, $source)]);
    }

    /**
     * user.deleted counterpart. Takes the profile array instead of an id
     * because the row no longer exists once the deletion has succeeded, so
     * callers must capture it beforehand. $source tells receivers who removed
     * the account: 'admin', 'api' or 'self'.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatchUserDeleted(array $user, string $source): array {
        return $this->dispatch('user.deleted', ['user' => $this->userPayload($user, $source)]);
    }

    /**
     * Diffs a profile against its pre-update state and emits the matching
     * events: user.activated / user.deactivated when the active flag flipped,
     * user.updated (with the list of changed fields) for everything else.
     * Nothing is sent when no watched field actually changed, so call sites
     * can invoke this unconditionally after a successful update.
     *
     * @param array|null $before profile row captured before the update
     * @return array{delivered:int,failed:int}
     */
    public function dispatchUserProfileChanged(int $userId, string $source, ?array $before): array {
        $result = ['delivered' => 0, 'failed' => 0];

        $after = getUserProfileById($userId);
        if (!$before || !$after) {
            return $result;
        }

        $changed = [];
        foreach (['username', 'email', 'first_name', 'last_name', 'is_admin', 'active'] as $field) {
            if ((string)($before[$field] ?? '') !== (string)($after[$field] ?? '')) {
                $changed[] = $field;
            }
        }

        if (in_array('active', $changed, true)) {
            $event = !empty($after['active']) ? 'user.activated' : 'user.deactivated';
            $sent = $this->dispatch($event, ['user' => $this->userPayload($after, $source)]);
            $result['delivered'] += $sent['delivered'];
            $result['failed'] += $sent['failed'];
            $changed = array_values(array_diff($changed, ['active']));
        }

        if (!empty($changed)) {
            $sent = $this->dispatch('user.updated', [
                'user' => $this->userPayload($after, $source),
                'changed_fields' => $changed,
            ]);
            $result['delivered'] += $sent['delivered'];
            $result['failed'] += $sent['failed'];
        }

        return $result;
    }

    /**
     * Emitted when an SSO signup is refused because the instance reached its
     * user cap, so the operator learns about lost signups in real time.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatchSignupCapReached(?int $maxUsers, ?string $username, ?string $email): array {
        return $this->dispatch('signup.cap_reached', [
            'max_users' => $maxUsers,
            'attempted' => [
                'username' => ($username !== null && trim($username) !== '') ? trim($username) : null,
                'email' => ($email !== null && trim($email) !== '') ? trim($email) : null,
            ],
        ]);
    }

    /**
     * Emitted when an action is refused because the user reached a quota
     * (quota.notes_reached / quota.storage_reached). Call sites throttle
     * repeated blocked attempts; see poznoteNotifyQuotaReached().
     *
     * @param array $quota limit and current usage, event-specific keys
     * @return array{delivered:int,failed:int}
     */
    public function dispatchQuotaReached(string $event, int $userId, array $quota): array {
        $user = getUserProfileById($userId);
        if (!$user) {
            return ['delivered' => 0, 'failed' => 0];
        }

        return $this->dispatch($event, [
            'user' => $this->userPayload($user, null),
            'quota' => $quota,
        ]);
    }

    /**
     * Emitted by the reminder worker when a note reminder reaches its trigger
     * time. Three variants let the operator choose how much leaves the
     * instance: reminder.due carries the note heading and the reminder
     * message, reminder.due_title the heading and link but no message,
     * reminder.due_minimal only identifiers and the trigger time (a receiver
     * can then fetch details through the REST API if needed).
     *
     * These events only reach the webhooks of the account owning the
     * reminder, so the payload carries no user block: the note id identifies
     * the target.
     *
     * @param array $notification due row joined with the note (id, note_id,
     *        message, trigger_at, note_heading, workspace)
     * @param string $noteUrl direct link to the note, '' when no app URL is
     *        configured
     * @param int $userId account owning the reminder
     * @return array{delivered:int,failed:int}
     */
    public function dispatchReminderDue(array $notification, string $noteUrl, int $userId): array {
        if (!self::userWebhooksAllowedFor($userId)) {
            return ['delivered' => 0, 'failed' => 0];
        }

        $reminderId = (int)($notification['id'] ?? 0);
        $noteId = (int)($notification['note_id'] ?? 0);
        $triggerAt = (string)($notification['trigger_at'] ?? '');

        $full = $this->dispatch('reminder.due', [
            'note' => [
                'id' => $noteId,
                'heading' => (string)($notification['note_heading'] ?? ''),
                'workspace' => (string)($notification['workspace'] ?? ''),
                'url' => $noteUrl !== '' ? $noteUrl : null,
            ],
            'reminder' => [
                'id' => $reminderId,
                'message' => (string)($notification['message'] ?? ''),
                'trigger_at' => $triggerAt,
            ],
        ], $userId);

        $title = $this->dispatch('reminder.due_title', [
            'note' => [
                'id' => $noteId,
                'heading' => (string)($notification['note_heading'] ?? ''),
                'url' => $noteUrl !== '' ? $noteUrl : null,
            ],
            'reminder' => [
                'id' => $reminderId,
                'trigger_at' => $triggerAt,
            ],
        ], $userId);

        $minimal = $this->dispatch('reminder.due_minimal', [
            'note' => ['id' => $noteId],
            'reminder' => [
                'id' => $reminderId,
                'trigger_at' => $triggerAt,
            ],
        ], $userId);

        return [
            'delivered' => $full['delivered'] + $title['delivered'] + $minimal['delivered'],
            'failed' => $full['failed'] + $title['failed'] + $minimal['failed'],
        ];
    }

    /**
     * Emitted when an account creates a note, through the UI or the REST API
     * (both go through NotesController::create).
     *
     * Delivery is scoped to the webhooks registered by that account, so a
     * note created by user 2 never reaches another user's endpoints. The
     * payload carries no user block: the endpoints belong to the note's
     * owner. Only metadata is sent, never the note body.
     *
     * @param string $source how the note was created: 'ui' or 'api'
     * @return array{delivered:int,failed:int}
     */
    public function dispatchNoteCreated(int $userId, array $note, string $source): array {
        if (!self::userWebhooksAllowedFor($userId)) {
            return ['delivered' => 0, 'failed' => 0];
        }

        return $this->dispatch('note.created', [
            'note' => [
                'id' => (int)($note['id'] ?? 0),
                'heading' => (string)($note['heading'] ?? ''),
                'type' => (string)($note['type'] ?? ''),
                'workspace' => (string)($note['workspace'] ?? ''),
                'folder' => (string)($note['folder'] ?? ''),
                'created' => (string)($note['created'] ?? ''),
                'url' => $this->noteUrl((int)($note['id'] ?? 0), (string)($note['workspace'] ?? '')),
            ],
            'source' => $source,
        ], $userId);
    }

    /**
     * Emitted when an account publishes a public share link for one of its
     * notes. Like dispatchNoteCreated, delivery is scoped to that account's
     * webhooks and the payload carries no user block.
     *
     * $share carries the public token and url; $updated tells receivers the
     * note was already shared and the link was regenerated.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatchNoteShared(int $userId, array $note, array $share, bool $updated = false): array {
        if (!self::userWebhooksAllowedFor($userId)) {
            return ['delivered' => 0, 'failed' => 0];
        }

        return $this->dispatch('note.shared', [
            'note' => [
                'id' => (int)($note['id'] ?? 0),
                'heading' => (string)($note['heading'] ?? ''),
                'workspace' => (string)($note['workspace'] ?? ''),
                'url' => $this->noteUrl((int)($note['id'] ?? 0), (string)($note['workspace'] ?? '')),
            ],
            'share' => [
                'token' => (string)($share['token'] ?? ''),
                'url' => (string)($share['url'] ?? ''),
                'has_password' => !empty($share['has_password']),
                'updated' => $updated,
            ],
        ], $userId);
    }

    /**
     * Direct link to a note, '' when no app URL is configured. Same source
     * order as the reminder email channel.
     */
    private function noteUrl(int $noteId, string $workspace): string {
        $baseUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
        if ($baseUrl === '' && function_exists('_env')) {
            $baseUrl = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
        }
        if ($noteId <= 0 || $baseUrl === '' || !filter_var($baseUrl, FILTER_VALIDATE_URL)) {
            return '';
        }
        if (!in_array(strtolower((string)parse_url($baseUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
            return '';
        }

        $params = ['note' => $noteId];
        $workspace = trim($workspace);
        if ($workspace !== '') {
            $params['workspace'] = $workspace;
        }

        return $baseUrl . '/index.php?' . http_build_query($params);
    }

    private function userPayload(array $user, ?string $source): array {
        $email = trim((string)($user['email'] ?? ''));

        $payload = [
            'id' => (int)($user['id'] ?? 0),
            'username' => (string)($user['username'] ?? ''),
            'email' => $email !== '' ? $email : null,
            'first_name' => (string)($user['first_name'] ?? ''),
            'last_name' => (string)($user['last_name'] ?? ''),
        ];
        if ($source !== null) {
            $payload['source'] = $source;
        }

        return $payload;
    }

    /**
     * Deliver one event to one webhook and record the outcome.
     * Also used by the admin page to send a test ping to a single endpoint.
     *
     * @return array{success:bool,status:string}
     */
    public function deliver(array $webhook, string $event, array $data): array {
        $payload = [
            'event' => $event,
            'delivery_id' => bin2hex(random_bytes(16)),
            'created_at' => gmdate('c'),
            'data' => $data,
        ];
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $headers = [
            'Content-Type: application/json',
            'User-Agent: Poznote-Webhook',
            'X-Poznote-Event: ' . $event,
            'X-Poznote-Delivery: ' . $payload['delivery_id'],
        ];
        $secret = trim((string)($webhook['secret'] ?? ''));
        if ($secret !== '') {
            $headers[] = 'X-Poznote-Signature-256: sha256=' . hash_hmac('sha256', $body, $secret);
        }

        $status = '';
        $success = false;
        try {
            $response = $this->post((string)$webhook['url'], $body, $headers);
            $success = $response['status'] >= 200 && $response['status'] < 300;
            $status = $response['status'] > 0 ? (string)$response['status'] : 'error: ' . ($response['error'] ?: 'no response');
            if (!$success) {
                error_log('Webhook delivery to ' . $webhook['url'] . ' failed (' . $status . ') for event ' . $event);
            }
        } catch (Throwable $e) {
            $status = 'error: ' . $e->getMessage();
            error_log('Webhook delivery to ' . ($webhook['url'] ?? '?') . ' threw: ' . $e->getMessage());
        }

        if (!empty($webhook['id'])) {
            recordWebhookDelivery((int)$webhook['id'], $status);
        }

        return ['success' => $success, 'status' => $status];
    }

    /**
     * @param string[] $headers
     * @return array{status:int,error:?string}
     */
    private function post(string $url, string $body, array $headers): array {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_TIMEOUT, self::TIMEOUT_SECONDS);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::TIMEOUT_SECONDS);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);

            $ok = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = $ok === false ? (curl_error($ch) ?: 'curl error') : null;
            curl_close($ch);

            return ['status' => $status, 'error' => $error];
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $body,
                'timeout' => self::TIMEOUT_SECONDS,
                'ignore_errors' => true,
                'follow_location' => 0,
            ],
        ]);
        $ok = @file_get_contents($url, false, $ctx);
        $status = 0;
        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $line) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                    $status = (int)$m[1];
                }
            }
        }
        $error = null;
        if ($ok === false && $status === 0) {
            $lastErr = error_get_last();
            $error = $lastErr ? $lastErr['message'] : 'http request failed';
        }

        return ['status' => $status, 'error' => $error];
    }
}
