<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/users/db_master.php';

/**
 * Delivers instance events to the admin-registered outgoing webhooks.
 *
 * Delivery is best-effort and synchronous with a short timeout: a slow or
 * failing endpoint must never break the action (e.g. a signup) that produced
 * the event. Payloads are signed with HMAC-SHA256 when the webhook has a
 * secret, so receivers can authenticate the sender.
 */
class WebhookDispatcher {

    public const EVENTS = [
        'user.created',
        'user.updated',
        'user.activated',
        'user.deactivated',
        'user.deleted',
        'signup.cap_reached',
    ];

    private const TIMEOUT_SECONDS = 5;

    /**
     * Send an event to every active webhook subscribed to it.
     *
     * @return array{delivered:int,failed:int}
     */
    public function dispatch(string $event, array $data): array {
        $result = ['delivered' => 0, 'failed' => 0];

        try {
            foreach (listActiveWebhooksForEvent($event) as $webhook) {
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

    private function userPayload(array $user, string $source): array {
        $email = trim((string)($user['email'] ?? ''));

        return [
            'id' => (int)($user['id'] ?? 0),
            'username' => (string)($user['username'] ?? ''),
            'email' => $email !== '' ? $email : null,
            'first_name' => (string)($user['first_name'] ?? ''),
            'last_name' => (string)($user['last_name'] ?? ''),
            'source' => $source,
        ];
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
