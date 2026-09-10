<?php
/**
 * Throwaway accounts and the data the isolation replay needs to aim at.
 *
 * Every object here is created through the public API as its owner, never by
 * writing to the database directly: a fixture built behind the API's back
 * could satisfy a WHERE clause the API itself would never have produced, and
 * the replay would then be probing a state that cannot occur in production.
 */

/** One throwaway account: credentials plus a client already bound to its id. */
final class TestAccount
{
    public function __construct(
        public readonly int $id,
        public readonly string $username,
        public readonly string $password,
        public readonly ApiClient $api,
    ) {}
}

/** Creates, seeds and disposes of the accounts the suite runs against. */
final class Fixtures
{
    /** @var int[] ids to clean up even if the run dies half way through */
    private array $created = [];

    public function __construct(
        private string $baseUrl,
        private ApiClient $admin,
    ) {}

    public function createAccount(string $prefix): TestAccount
    {
        $username = $prefix . '-' . bin2hex(random_bytes(4));
        $password = 'pz-' . bin2hex(random_bytes(8));

        $created = $this->admin->post('/admin/users', ['json' => ['username' => $username]]);
        if ($created->status !== 201 || !isset($created->json['id'])) {
            throw new RuntimeException("Could not create account $username: " . $created->summary());
        }
        $id = (int)$created->json['id'];
        $this->created[] = $id;

        $password_set = $this->admin->post("/admin/users/$id/reset-password", [
            'json' => ['action' => 'set_password', 'new_password' => $password],
        ]);
        if ($password_set->status !== 200) {
            throw new RuntimeException("Could not set password for $username: " . $password_set->summary());
        }

        $api = new ApiClient($this->baseUrl, $username, $password, $id);
        return new TestAccount($id, $username, $password, $api);
    }

    /**
     * Fills an account with one of everything the API can address by id, and
     * returns the identifiers the replay will hand to the other account.
     *
     * Marker strings are unique per build so a leak is unambiguous: finding
     * the marker in another account's response cannot be a coincidence.
     *
     * @return array<string,string> placeholder name => value
     */
    public function seed(TestAccount $account): array
    {
        $api = $account->api;
        $marker = 'ISOLATION-' . bin2hex(random_bytes(6));

        $workspace = 'ws-' . strtolower(bin2hex(random_bytes(3)));
        $this->expect($api->post('/workspaces', ['json' => ['name' => $workspace]]),
            [200, 201], 'create workspace');

        $folder = $this->expect(
            $api->post('/folders', ['json' => ['folder_name' => 'folder-' . $marker, 'workspace' => $workspace]]),
            [200, 201], 'create folder');
        $folderId = (string)($folder->json['folder']['id'] ?? $folder->json['folder_id'] ?? '');
        if ($folderId === '') {
            throw new RuntimeException('create folder returned no id: ' . $folder->summary());
        }

        $secondFolder = $this->expect(
            $api->post('/folders', ['json' => ['folder_name' => 'sibling-' . $marker, 'workspace' => $workspace]]),
            [200, 201], 'create second folder');

        $note = $this->expect($api->post('/notes', ['json' => [
            'heading' => 'note-' . $marker,
            'content' => "<p>secret body $marker</p>",
            'tags' => 'tag' . strtolower($marker),
            'workspace' => $workspace,
            'folder_id' => (int)$folderId,
        ]]), [200, 201], 'create note');
        $noteId = (string)($note->json['note']['id'] ?? '');
        if ($noteId === '') {
            throw new RuntimeException('create note returned no id: ' . $note->summary());
        }

        // A second note, so routes that move or merge things have somewhere to
        // aim that is not the note under test.
        $other = $this->expect($api->post('/notes', ['json' => [
            'heading' => 'other-' . $marker,
            'content' => "<p>second $marker</p>",
            'workspace' => $workspace,
        ]]), [200, 201], 'create second note');

        // Tasks only exist on tasklist notes, so the task fixture needs its own.
        $tasklist = $this->expect($api->post('/notes', ['json' => [
            'heading' => 'tasks-' . $marker,
            'type' => 'tasklist',
            'workspace' => $workspace,
        ]]), [200, 201], 'create tasklist note');
        $tasklistId = (string)($tasklist->json['note']['id'] ?? '');
        $task = $this->expect($api->post("/notes/$tasklistId/tasks", [
            'json' => ['text' => 'task-' . $marker],
        ]), [200, 201], 'create task');
        // Task ids are floats. Casting one to string goes through the
        // `precision` ini setting and loses digits, while the API compares
        // against json_encode's shortest round-trip form, so re-encode it.
        $rawTaskId = $task->json['task']['id'] ?? '';
        $taskId = is_float($rawTaskId) ? json_encode($rawTaskId) : (string)$rawTaskId;

        $attachment = $this->expect($api->request('POST', "/notes/$noteId/attachments", [
            'upload' => ['name' => "att-$marker.txt", 'type' => 'text/plain', 'content' => "attached $marker"],
        ]), [200, 201], 'upload attachment');
        $attachmentId = (string)($attachment->json['attachment_id'] ?? '');

        $snapshot = $this->expect($api->post("/notes/$noteId/snapshot", ['query' => ['manual' => 1]]),
            [200, 201], 'create snapshot');

        $this->expect($api->post("/notes/$noteId/reminder", [
            // Already due, so it also produces the notification row that the
            // /reminders/{id} routes address.
            'json' => ['reminder_at' => gmdate('Y-m-d\TH:i', time() - 3600)],
        ]), [200, 201], 'create reminder');

        $noteShare = $this->expect($api->post("/notes/$noteId/share", ['json' => []]),
            [200, 201], 'share note');
        $folderShare = $this->expect($api->post("/folders/$folderId/share", ['json' => []]),
            [200, 201], 'share folder');

        $this->expect($api->request('PUT', '/settings/note_font_family', [
            'json' => ['value' => 'Georgia'],
        ]), [200], 'write setting');

        // An app password, so DELETE /users/me/app-passwords/{id} has a real
        // target. The marker in its label is what the leak check looks for
        // when the stranger lists their own.
        $appPassword = $this->expect($api->post('/users/me/app-passwords', [
            'json' => ['label' => 'app-' . $marker],
        ]), [201], 'create app password');
        $appPasswordId = (string)($appPassword->json['app_password']['id'] ?? '');

        // A trashed note, so DELETE /trash/{id} has a real target.
        $trashed = $this->expect($api->post('/notes', ['json' => [
            'heading' => 'trash-' . $marker,
            'content' => "<p>trashed $marker</p>",
            'workspace' => $workspace,
        ]]), [200, 201], 'create note to trash');
        $trashedId = (string)($trashed->json['note']['id'] ?? '');
        $this->expect($api->request('DELETE', "/notes/$trashedId"), [200], 'trash note');

        $backup = $api->post('/backups', ['json' => []]);
        $backupName = (string)($backup->json['backup_file'] ?? '');

        $reminderId = '';
        $reminders = $api->get('/reminders');
        foreach ($reminders->json['notifications'] ?? [] as $row) {
            if (isset($row['id'])) {
                $reminderId = (string)$row['id'];
                break;
            }
        }

        return [
            'marker' => $marker,
            'user' => (string)$account->id,
            'username' => $account->username,
            'note' => $noteId,
            'other_note' => (string)($other->json['note']['id'] ?? ''),
            'folder' => $folderId,
            'other_folder' => (string)($secondFolder->json['folder']['id'] ?? ''),
            'workspace' => $workspace,
            'tag' => 'tag' . strtolower($marker),
            'task' => $taskId,
            'attachment' => $attachmentId,
            'reminder' => $reminderId,
            'trashed_note' => $trashedId,
            'backup' => $backupName,
            'tasklist_note' => $tasklistId,
            'note_share_token' => self::tokenFromUrl((string)($noteShare->json['url'] ?? '')),
            'folder_share_token' => self::tokenFromUrl((string)($folderShare->json['url'] ?? '')),
            'snapshot' => (string)($snapshot->json['snapshot_key'] ?? ''),
            'setting' => 'note_font_family',
            'app_password' => $appPasswordId,
        ];
    }

    /** Deletes every account this run created, data and all. */
    public function cleanup(): void
    {
        foreach (array_reverse($this->created) as $id) {
            $response = $this->admin->request('DELETE', "/admin/users/$id");
            // Say so rather than leave a throwaway account behind unnoticed.
            // The usual cause is the login rate limiter: the suite fires
            // deliberately wrong credentials, and the per-IP backstop can
            // reach its hard block before the cleanup runs.
            if ($response->status !== 200) {
                fwrite(STDERR, "cleanup: could not delete account #$id -> " . $response->summary()
                    . "\n  remove it by hand: docker exec <webserver> php -r 'require \"/var/www/html/users/db_master.php\"; deleteUserProfile($id, true);'\n");
            }
        }
        $this->created = [];
    }

    /** The share endpoints return ready-made links, not the bare token. */
    private static function tokenFromUrl(string $url): string
    {
        $segments = array_values(array_filter(explode('/', parse_url($url, PHP_URL_PATH) ?: '')));
        return $segments === [] ? '' : (string)end($segments);
    }

    /** Fixture setup has no business failing quietly: a bad fixture is a bad test. */
    private function expect(Response $response, array $allowed, string $what): Response
    {
        if (!in_array($response->status, $allowed, true)) {
            throw new RuntimeException("fixture: $what -> " . $response->summary());
        }
        return $response;
    }
}
