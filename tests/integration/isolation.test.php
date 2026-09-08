<?php
/**
 * Cross-account isolation: every /api/v1 route, replayed by the wrong account.
 *
 * The shape of the test is deliberately mechanical. Account A is filled with
 * one of everything the API can address - note, folder, workspace, tag, task,
 * attachment, snapshot, reminder, note share, folder share, trashed note,
 * backup. Account B, a stranger with no grant of any kind, then sends every
 * route in the router with A's identifiers substituted in, and each answer has
 * to be a refusal.
 *
 * Two assertions per route, and the second one is the one that matters:
 *
 *   1. the status is a 4xx, and
 *   2. the body contains no trace of A - not the marker, not the username.
 *
 * The status alone would not be enough, because the accounts have separate
 * databases and their id sequences overlap: "note 2" exists for both. A 200
 * can therefore be perfectly correct (B reading B's own note 2) which is why
 * the marker check runs on every response regardless of status, and why the
 * suite refuses to run at all if B's id space is not disjoint from A's.
 *
 * The status alone would also not be enough in the other direction: a route
 * that answers 400 because the request body was malformed proves nothing about
 * ownership, since the ownership check never ran. So every refusal is paired
 * with a control: the identical request, sent by A, has to succeed. A route
 * whose control fails is reported as inconclusive rather than passing.
 */

/** Route needs one of A's identifiers; the answer must be a refusal. */
const OWNED = 'owned';
/** Route addresses no particular object; the answer must hold only B's data. */
const SCOPED = 'scoped';
/** Route is for administrators; a plain account must be turned away. */
const ADMIN = 'admin';
/** Route authenticates with a share token, tested by the share group instead. */
const PUBLIC_TOKEN = 'public';
/** Route is out of the replay's scope; the value carries the reason. */
const EXCLUDED = 'excluded';

/**
 * Every route the router exposes, with what the replay should do about it.
 *
 * Keys are the templates exactly as index.php registers them: routeTable() is
 * checked against the router at run time, so adding a route without deciding
 * what isolation means for it fails the suite.
 *
 * 'body' is the payload that makes the request well-formed. It has to be a
 * request that WOULD succeed if ownership were not enforced - an empty body on
 * a route that validates its input turns the whole check into an assertion
 * about 400s.
 */
function routeTable(): array
{
    $future = gmdate('Y-m-d\TH:i', time() + 86400);

    return [
        // --- Notes -------------------------------------------------------
        'GET /notes' => [SCOPED],
        'POST /notes' => [SCOPED, 'body' => ['heading' => 'replay probe', 'content' => '<p>probe</p>']],
        'GET /notes/{id}' => [OWNED],
        'PATCH /notes/{id}' => [OWNED, 'body' => ['content' => '<p>rewritten by the wrong account</p>']],
        'DELETE /notes/{id}' => [OWNED],
        'POST /notes/{id}/restore' => [OWNED, 'target' => ['id' => 'trashed_note']],
        'POST /notes/{id}/duplicate' => [OWNED],
        'POST /notes/{id}/convert' => [OWNED, 'body' => ['target' => 'markdown']],
        // sendBeacon posts a form, not JSON, and the controller reads $_POST.
        'POST /notes/{id}/beacon' => [OWNED, 'form' => ['content' => '<p>beacon</p>',
            'editor_session_id' => 'stranger-session']],
        'PUT /notes/{id}/tags' => [OWNED, 'body' => ['tags' => 'hijacked']],
        'PUT /notes/{id}/icon' => [OWNED, 'body' => ['icon' => 'star']],
        'PUT /notes/{id}/color' => [OWNED, 'body' => ['color' => 'red']],
        'PUT /notes/{id}/pinned' => [OWNED, 'body' => ['pinned' => 1]],
        'PUT /notes/{id}/content-width' => [OWNED, 'body' => ['content_width' => 60]],
        'POST /notes/{id}/favorite' => [OWNED, 'body' => ['favorite' => 1]],
        'POST /notes/{id}/archive' => [OWNED, 'body' => ['archived' => 1]],
        'POST /notes/{id}/kanban-completed' => [OWNED, 'body' => ['completed' => 1]],
        'POST /notes/{id}/folder' => [OWNED, 'body' => ['folder_id' => '{folder}']],
        'POST /notes/{id}/remove-folder' => [OWNED, 'body' => []],
        'GET /notes/{id}/backlinks' => [OWNED],
        'GET /notes/{id}/lock' => [OWNED],
        'POST /notes/{id}/lock' => [OWNED, 'body' => ['editor_session_id' => 'stranger-session']],
        'POST /notes/{id}/lock/heartbeat' => [OWNED, 'body' => ['editor_session_id' => 'stranger-session']],
        'POST /notes/{id}/lock/release' => [OWNED, 'body' => ['editor_session_id' => 'stranger-session']],
        'POST /notes/reorder' => [OWNED, 'body' => ['note_id' => '{note}',
            'target_note_id' => '{other_note}', 'position' => 'before', 'workspace' => '{workspace}']],
        'GET /notes/resolve' => [OWNED, 'query' => ['reference' => '{marker}']],
        'GET /notes/search' => [SCOPED, 'query' => ['q' => '{marker}']],
        'GET /notes/with-attachments' => [SCOPED],
        'GET /changes' => [SCOPED],
        'GET /graph' => [SCOPED],
        'POST /convert-html' => [SCOPED, 'body' => ['content' => '# heading']],
        'POST /convert-markdown' => [SCOPED, 'body' => ['content' => '<p>text</p>']],

        // --- Tasks -------------------------------------------------------
        'GET /tasks' => [SCOPED],
        'GET /notes/{id}/tasks' => [OWNED, 'target' => ['id' => 'tasklist_note']],
        'POST /notes/{id}/tasks' => [OWNED, 'target' => ['id' => 'tasklist_note'], 'body' => ['text' => 'planted task']],
        'PATCH /notes/{id}/tasks/{taskId}' => [OWNED, 'target' => ['id' => 'tasklist_note'], 'body' => ['completed' => true]],
        'DELETE /notes/{id}/tasks/{taskId}' => [OWNED, 'target' => ['id' => 'tasklist_note']],

        // --- Snapshots ---------------------------------------------------
        'POST /notes/{id}/snapshot' => [OWNED, 'query' => ['manual' => 1], 'body' => []],
        'GET /notes/{id}/snapshots' => [OWNED],
        'GET /notes/{id}/snapshot' => [OWNED, 'query' => ['snapshot_key' => '{snapshot}']],
        'DELETE /notes/{id}/snapshot' => [OWNED, 'query' => ['snapshot_key' => '{snapshot}']],
        'POST /notes/{id}/snapshot/restore' => [OWNED, 'body' => ['snapshot_key' => '{snapshot}']],

        // --- Reminders ---------------------------------------------------
        'GET /reminders' => [SCOPED],
        'GET /reminders/count' => [SCOPED],
        'POST /reminders/dismiss-all' => [SCOPED, 'body' => []],
        'POST /reminders/{id}/read' => [OWNED, 'target' => ['id' => 'reminder'], 'body' => []],
        'POST /reminders/{id}/dismiss' => [OWNED, 'target' => ['id' => 'reminder'], 'body' => []],
        'GET /notes/{id}/reminder' => [OWNED],
        'POST /notes/{id}/reminder' => [OWNED, 'body' => ['reminder_at' => $future]],
        'DELETE /notes/{id}/reminder' => [OWNED],
        'POST /notes/{id}/task-reminder' => [OWNED, 'target' => ['id' => 'tasklist_note'],
            'body' => ['task_id' => '{task}', 'reminder_at' => $future]],
        'DELETE /notes/{id}/task-reminder' => [OWNED, 'target' => ['id' => 'tasklist_note'],
            'query' => ['task_id' => '{task}']],

        // --- Shares ------------------------------------------------------
        'GET /notes/{id}/share' => [OWNED],
        'POST /notes/{id}/share' => [OWNED, 'body' => []],
        'PATCH /notes/{id}/share' => [OWNED, 'body' => ['access_mode' => 'read_write']],
        'DELETE /notes/{id}/share' => [OWNED],
        'GET /folders/{id}/share' => [OWNED],
        'POST /folders/{id}/share' => [OWNED, 'body' => []],
        'PATCH /folders/{id}/share' => [OWNED, 'body' => ['access_mode' => 'read_write']],
        'DELETE /folders/{id}/share' => [OWNED],
        'GET /shared' => [SCOPED],
        'GET /shared/with-me' => [SCOPED],

        // --- Folders -----------------------------------------------------
        'GET /folders' => [SCOPED],
        'POST /folders' => [SCOPED, 'body' => ['folder_name' => 'replay probe folder']],
        'GET /folders/counts' => [SCOPED],
        'GET /folders/suggested' => [SCOPED],
        'GET /folders/{id}' => [OWNED],
        'PATCH /folders/{id}' => [OWNED, 'body' => ['name' => 'renamed by the wrong account']],
        'DELETE /folders/{id}' => [OWNED],
        'POST /folders/{id}/duplicate' => [OWNED, 'body' => []],
        'POST /folders/{id}/empty' => [OWNED, 'body' => []],
        'POST /folders/{id}/move' => [OWNED, 'body' => ['parent_id' => null]],
        'POST /folders/{id}/tags' => [OWNED, 'body' => ['tags' => ['hijacked']]],
        'PUT /folders/{id}/icon' => [OWNED, 'body' => ['icon' => 'star']],
        'PUT /folders/{id}/color' => [OWNED, 'body' => ['color' => 'red']],
        'PUT /folders/{id}/pinned' => [OWNED, 'body' => ['pinned' => 1]],
        'PUT /folders/{id}/favorite' => [OWNED, 'body' => ['favorite' => 1]],
        'GET /folders/{id}/notes' => [OWNED],
        'GET /folders/{id}/path' => [OWNED],
        'POST /folders/move-files' => [OWNED, 'body' => ['source_folder_id' => '{folder}',
            'target_folder_id' => 0, 'workspace' => '{workspace}']],
        'POST /folders/reorder' => [OWNED, 'body' => ['folder_id' => '{folder}',
            'target_folder_id' => '{other_folder}', 'position' => 'before', 'workspace' => '{workspace}']],
        'POST /folders/restore' => [OWNED, 'body' => ['workspace' => '{workspace}',
            'folders' => [['id' => '{folder}', 'name' => 'restored-by-stranger']]]],

        // --- Trash -------------------------------------------------------
        'GET /trash' => [SCOPED],
        'DELETE /trash' => [SCOPED],
        'DELETE /trash/{id}' => [OWNED, 'target' => ['id' => 'trashed_note']],

        // --- Workspaces, tags, settings ----------------------------------
        'GET /workspaces' => [SCOPED],
        'POST /workspaces' => [SCOPED, 'body' => ['name' => 'replay-probe-ws']],
        'PATCH /workspaces/{name}' => [OWNED, 'body' => ['new_name' => 'renamed-by-stranger']],
        'DELETE /workspaces/{name}' => [OWNED],
        'GET /tags' => [SCOPED],
        'PATCH /tags/{tag}' => [OWNED, 'body' => ['new_name' => 'renamed-by-stranger']],
        'DELETE /tags/{tag}' => [OWNED],
        'GET /settings' => [SCOPED],
        // The key is a name from a fixed vocabulary, not an object id: reading
        // and writing it as B touches B's own value, so this is a leak check.
        'GET /settings/{key}' => [SCOPED],
        'PUT /settings/{key}' => [SCOPED, 'body' => ['value' => 'Verdana']],

        // --- Attachments -------------------------------------------------
        'GET /notes/{noteId}/attachments' => [OWNED],
        'POST /notes/{noteId}/attachments' => [OWNED,
            'upload' => ['name' => 'planted.txt', 'type' => 'text/plain', 'content' => 'planted by the wrong account']],
        'GET /notes/{noteId}/attachments/{attachmentId}' => [OWNED],
        'DELETE /notes/{noteId}/attachments/{attachmentId}' => [OWNED],

        // --- Backups -----------------------------------------------------
        'GET /backups' => [SCOPED],
        'POST /backups' => [SCOPED, 'body' => []],
        'GET /backups/{filename}' => [OWNED],
        'DELETE /backups/{filename}' => [OWNED],
        'POST /backups/{filename}/restore' => [OWNED, 'body' => []],
        'POST /backups/upload' => [EXCLUDED,
            'reason' => 'takes an archive, not an identifier; the filename vector is covered by the traversal group'],

        // --- Account -----------------------------------------------------
        'GET /users/me' => [SCOPED],
        'PATCH /users/me' => [SCOPED, 'body' => []],
        'GET /users/me/password-status' => [SCOPED],
        'POST /users/me/password' => [EXCLUDED, 'reason' => 'would change B\'s password mid-run'],
        'DELETE /users/me' => [EXCLUDED, 'reason' => 'would delete B mid-run; carries no identifier to replay'],
        // A directory of usernames, on purpose: the share dialogs need it, and
        // an instance that cannot afford the enumeration turns it off with
        // TENANT_ISOLATION. Listing the owner's username is therefore not a
        // leak here, but anything beyond id and username would be.
        'GET /users/profiles' => [SCOPED, 'directory' => true],
        'GET /users/lookup/{username}' => [ADMIN],

        // --- System ------------------------------------------------------
        'GET /system/version' => [SCOPED],
        'GET /system/updates' => [SCOPED],
        'GET /system/i18n' => [SCOPED],

        // --- Git sync ----------------------------------------------------
        // status and progress are leak checks: they must not surface another
        // account's repository, branch or credentials. The verbs that talk to
        // a remote are left alone on purpose.
        'GET /git-sync/status' => [SCOPED],
        'GET /github-sync/status' => [SCOPED],
        'GET /git-sync/progress' => [SCOPED],
        'PUT /git-sync/config' => [EXCLUDED, 'reason' => 'writes B\'s own sync credentials; no identifier to replay'],
        'POST /git-sync/test' => [EXCLUDED, 'reason' => 'contacts an external git remote'],
        'POST /git-sync/push' => [EXCLUDED, 'reason' => 'contacts an external git remote'],
        'POST /git-sync/pull' => [EXCLUDED, 'reason' => 'contacts an external git remote'],
        'POST /github-sync/test' => [EXCLUDED, 'reason' => 'alias of /git-sync/test'],
        'POST /github-sync/push' => [EXCLUDED, 'reason' => 'alias of /git-sync/push'],
        'POST /github-sync/pull' => [EXCLUDED, 'reason' => 'alias of /git-sync/pull'],

        // --- Admin -------------------------------------------------------
        'GET /admin/stats' => [ADMIN],
        'GET /admin/users' => [ADMIN],
        'POST /admin/users' => [ADMIN, 'body' => ['username' => 'privilege-escalation-probe']],
        'GET /admin/users/{id}' => [ADMIN, 'target' => ['id' => 'user']],
        'PATCH /admin/users/{id}' => [ADMIN, 'target' => ['id' => 'user'], 'body' => ['is_admin' => 1]],
        'DELETE /admin/users/{id}' => [ADMIN, 'target' => ['id' => 'user']],
        'POST /admin/users/{id}/reset-password' => [ADMIN, 'target' => ['id' => 'user'],
            'body' => ['action' => 'set_password', 'new_password' => 'taken-over']],
        'GET /admin/users/{id}/password-status' => [ADMIN, 'target' => ['id' => 'user']],
        'POST /admin/repair' => [ADMIN, 'body' => []],

        // --- Public share tokens -----------------------------------------
        'PATCH /public/notes/content' => [PUBLIC_TOKEN],
        'POST /public/notes/lock' => [PUBLIC_TOKEN],
        'POST /public/notes/lock/heartbeat' => [PUBLIC_TOKEN],
        'POST /public/notes/lock/release' => [PUBLIC_TOKEN],
        'POST /public/tasks' => [PUBLIC_TOKEN],
        'PATCH /public/tasks/{id}' => [PUBLIC_TOKEN],
        'DELETE /public/tasks/{id}' => [PUBLIC_TOKEN],
    ];
}

/** Which fixture fills each placeholder, unless the route overrides it. */
function placeholderDefaults(): array
{
    return [
        '{noteId}' => 'note',
        '{taskId}' => 'task',
        '{attachmentId}' => 'attachment',
        '{filename}' => 'backup',
        '{name}' => 'workspace',
        '{tag}' => 'tag',
        '{key}' => 'setting',
        '{username}' => 'username',
    ];
}

/** {id} means a different object in each route family. */
function idFixtureFor(string $path): string
{
    return match (true) {
        str_starts_with($path, '/notes/') => 'note',
        str_starts_with($path, '/folders/') => 'folder',
        str_starts_with($path, '/reminders/') => 'reminder',
        str_starts_with($path, '/trash/') => 'trashed_note',
        str_starts_with($path, '/admin/users/') => 'user',
        str_starts_with($path, '/public/tasks/') => 'task',
        default => throw new RuntimeException("No fixture decided for {id} in $path"),
    };
}

/** Reads the live route table out of the router so the classification cannot rot. */
function routesDeclaredByRouter(): array
{
    $source = file_get_contents(dirname(__DIR__, 2) . '/src/public/api/v1/index.php');
    if ($source === false) {
        throw new RuntimeException('Cannot read the API router');
    }
    preg_match_all('/\$router->(get|post|put|patch|delete)\(\s*\'([^\']+)\'/', $source, $matches, PREG_SET_ORDER);

    $routes = [];
    foreach ($matches as [, $method, $path]) {
        $routes[strtoupper($method) . ' ' . $path] = true;
    }
    return array_keys($routes);
}

/**
 * Turns a table entry into a request aimed at one account's fixtures.
 *
 * @return array{0:string,1:string,2:array} method, path, curl options
 */
function buildRequest(string $route, array $entry, array $fixtures): array
{
    [$method, $template] = explode(' ', $route, 2);

    $targets = $entry['target'] ?? [];
    $path = preg_replace_callback('/\{(\w+)\}/', function ($m) use ($template, $targets, $fixtures) {
        $placeholder = '{' . $m[1] . '}';
        $key = $targets[$m[1] ?? ''] ?? (placeholderDefaults()[$placeholder] ?? null);
        if ($key === null) {
            $key = $placeholder === '{id}' ? idFixtureFor($template) : null;
        }
        if ($key === null || !isset($fixtures[$key])) {
            throw new RuntimeException("No fixture for $placeholder in $template");
        }
        return rawurlencode((string)$fixtures[$key]);
    }, $template);

    $options = [];
    foreach (['query' => 'query', 'body' => 'json', 'form' => 'form', 'upload' => 'upload'] as $part => $option) {
        if (isset($entry[$part])) {
            $options[$option] = expandFixtures($entry[$part], $fixtures);
        }
    }

    return [$method, $path, $options];
}

/** Replaces {fixture} references inside a payload, at any depth. */
function expandFixtures(array $value, array $fixtures): array
{
    array_walk_recursive($value, function (&$leaf) use ($fixtures) {
        if (is_string($leaf) && preg_match('/^\{(\w+)\}$/', $leaf, $m)) {
            if (!isset($fixtures[$m[1]])) {
                throw new RuntimeException("No fixture named {$m[1]}");
            }
            $leaf = $fixtures[$m[1]];
        }
    });
    return $value;
}

/** Every string that would betray account A if it turned up in a response. */
function leakMarkers(array $fixtures): array
{
    return array_values(array_filter([
        $fixtures['marker'] ?? '',
        $fixtures['username'] ?? '',
        $fixtures['workspace'] ?? '',
        $fixtures['note_share_token'] ?? '',
        $fixtures['folder_share_token'] ?? '',
        $fixtures['backup'] ?? '',
    ], fn($v) => is_string($v) && strlen($v) >= 8));
}

/**
 * Fails if a response carries anything that belongs to the other account.
 *
 * $echoed is whatever the caller itself put in the request. Several endpoints
 * repeat their input back - the search query, the workspace filter - and a
 * value the caller already knew is not something the server disclosed.
 *
 * $allowed names markers the route is documented to expose anyway.
 */
function assertNoLeak(Response $response, array $fixtures, string $what, array $echoed = [], array $allowed = []): void
{
    $echoedText = $echoed === [] ? '' : (string)json_encode($echoed);

    foreach (leakMarkers($fixtures) as $marker) {
        if (in_array($marker, $allowed, true)) {
            continue;
        }
        if ($echoedText !== '' && stripos($echoedText, $marker) !== false) {
            continue;
        }
        if ($response->mentions($marker)) {
            fail("$what: response leaks '$marker' -> " . $response->summary(240));
        }
    }
}

/** Everything one run needs: the two accounts, the admin, and A's fixtures. */
final class IsolationContext
{
    public array $fixtures;

    public function __construct(
        public readonly string $baseUrl,
        public readonly Fixtures $factory,
        public readonly TestAccount $owner,
        public readonly TestAccount $stranger,
        public readonly ApiClient $admin,
    ) {
        $this->fixtures = $factory->seed($owner);
    }

    /** Rebuilds the owner's data after a control request consumed some of it. */
    public function reseed(): void
    {
        $this->fixtures = $this->factory->seed($this->owner);
    }
}

/**
 * The routes the stranger is allowed to reach as itself still have to answer
 * without a word about the other account.
 */
function checkScoped(IsolationContext $ctx, string $route, array $entry): void
{
    test("scoped $route", function () use ($ctx, $route, $entry) {
        [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
        $response = $ctx->stranger->api->request($method, $path, $options);
        if ($response->status >= 500) {
            fail("$route: server error -> " . $response->summary());
        }
        $allowed = !empty($entry['directory']) ? [$ctx->fixtures['username']] : [];
        assertNoLeak($response, $ctx->fixtures, $route, $options + ['path' => $path], $allowed);

        if (!empty($entry['directory'])) {
            foreach ($response->json ?? [] as $row) {
                $extra = array_diff(array_keys((array)$row), ['id', 'username']);
                if ($extra !== []) {
                    fail("$route: the user directory exposes " . implode(', ', $extra)
                        . ' on top of id and username');
                }
            }
        }
    });
}

/** An account with no admin flag must not reach an admin route at all. */
function checkAdmin(IsolationContext $ctx, string $route, array $entry): void
{
    test("admin $route", function () use ($ctx, $route, $entry) {
        [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
        $response = $ctx->stranger->api->request($method, $path, $options);
        assertStatusIn([401, 403], $response, $route);
        assertNoLeak($response, $ctx->fixtures, $route, $options + ['path' => $path]);
    });
}

/**
 * The heart of it: A's identifier, B's credentials, and nothing to show for it.
 *
 * $control is the status the owner's own copy of the request got, collected in
 * a separate pass. It decides whether a refusal proves anything: if the owner
 * cannot make the request work either, the route is reported as inconclusive
 * rather than quietly counting as a pass.
 */
function checkOwned(string $route, array $replayed, Response $control, array $fixtures): void
{
    ['response' => $replay, 'request' => $request] = $replayed;

    test("isolation $route", function () use ($route, $replay, $request, $control, $fixtures) {
        // Checked first and unconditionally: a body carrying the owner's data
        // is a leak whatever the status line says. The request itself is
        // excluded, because an error message that quotes the identifier the
        // caller just sent has disclosed nothing.
        assertNoLeak($replay, $fixtures, $route, $request);

        if ($control->status >= 400) {
            fail("$route: inconclusive, the owner's own request answered "
                . $control->summary(120) . ' so the refusal (' . $replay->status
                . ') may be about the request rather than about ownership');
        }

        assertStatusIn([403, 404], $replay, $route);
    });
}

/**
 * Credentials of one account, X-User-ID of another: the header must never win.
 *
 * This is the other half of isolation. The replay above asks whether B can
 * reach A's objects through B's own profile; this asks whether B can simply
 * announce itself as A.
 */
function checkImpersonation(IsolationContext $ctx, string $route, array $entry): void
{
    test("impersonation $route", function () use ($ctx, $route, $entry) {
        [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
        $impersonating = $ctx->stranger->api->withUserId($ctx->owner->id);
        $response = $impersonating->request($method, $path, $options);
        assertNoLeak($response, $ctx->fixtures, $route, $options + ['path' => $path]);
        assertStatusIn([401, 403], $response, $route);
    });
}

/** A share link hands out one note, read-only, and nothing else. */
function checkShareTokens(IsolationContext $ctx): void
{
    $anonymous = new ApiClient($ctx->baseUrl, '', '', null);
    $token = $ctx->fixtures['note_share_token'];
    $folderToken = $ctx->fixtures['folder_share_token'];

    test('share token: a read-only link cannot rewrite the note', function () use ($anonymous, $token) {
        $response = $anonymous->request('PATCH', '/public/notes/content', [
            'query' => ['token' => $token],
            'json' => ['content' => '<p>rewritten through the share link</p>'],
        ]);
        assertStatusIn([401, 403, 404], $response, 'PATCH /public/notes/content on a read-only share');
    });

    test('share token: a read-only link cannot take the edit lock', function () use ($anonymous, $token) {
        $response = $anonymous->request('POST', '/public/notes/lock', [
            'query' => ['token' => $token],
            'json' => ['editor_session_id' => 'stranger-session'],
        ]);
        assertStatusIn([401, 403, 404], $response, 'POST /public/notes/lock on a read-only share');
    });

    test('share token: a folder link is not a note link', function () use ($anonymous, $folderToken) {
        $response = $anonymous->request('PATCH', '/public/notes/content', [
            'query' => ['token' => $folderToken],
            'json' => ['content' => '<p>wrong kind of token</p>'],
        ]);
        assertStatusIn([400, 401, 403, 404], $response, 'a folder token used as a note token');
    });

    test('share token: a made-up token opens nothing', function () use ($anonymous) {
        $response = $anonymous->request('PATCH', '/public/notes/content', [
            'query' => ['token' => str_repeat('a', 32)],
            'json' => ['content' => '<p>no token at all</p>'],
        ]);
        assertStatusIn([400, 401, 403, 404], $response, 'an invented share token');
    });

    test('share token: no token at all opens nothing', function () use ($anonymous) {
        $response = $anonymous->request('PATCH', '/public/notes/content', [
            'json' => ['content' => '<p>no token at all</p>'],
        ]);
        assertStatusIn([400, 401, 403, 404], $response, 'no share token');
    });

    test('share token: public task routes refuse an unrelated token', function () use ($anonymous, $ctx, $folderToken) {
        $response = $anonymous->request('POST', '/public/tasks', [
            'query' => ['token' => $folderToken],
            'json' => ['text' => 'planted through a folder token'],
        ]);
        assertStatusIn([400, 401, 403, 404], $response, 'POST /public/tasks with a folder token');
        assertNoLeak($response, $ctx->fixtures, 'POST /public/tasks');
    });

    test('share token: a public task id from another note is not writable', function () use ($anonymous, $ctx, $token) {
        $taskId = $ctx->fixtures['task'];
        $response = $anonymous->request('PATCH', '/public/tasks/' . rawurlencode($taskId), [
            'query' => ['token' => $token],
            'json' => ['completed' => true],
        ]);
        assertStatusIn([400, 401, 403, 404], $response, 'a task from a different note than the token');
    });
}

/**
 * The two routes that take a caller-supplied filename.
 *
 * Both resolve to a path under the account's own directory, which is the one
 * place where a per-account database offers no protection at all: the accounts
 * live side by side on the same disk.
 */
function checkPathTraversal(IsolationContext $ctx): void
{
    $ownerId = $ctx->owner->id;
    $probes = [
        '../../../users/' . $ownerId . '/database/poznote.db',
        '..%2F..%2F..%2Fusers%2F' . $ownerId . '%2Fdatabase%2Fpoznote.db',
        '....//....//users/' . $ownerId . '/database/poznote.db',
        '/var/www/html/data/users/' . $ownerId . '/database/poznote.db',
        '../' . $ctx->fixtures['backup'],
    ];

    foreach ($probes as $index => $probe) {
        test("traversal: GET /backups/<probe $index>", function () use ($ctx, $probe) {
            $response = $ctx->stranger->api->request('GET', '/backups/' . rawurlencode($probe));
            assertStatusIn([400, 403, 404, 405], $response, "GET /backups/$probe");
            assertNoLeak($response, $ctx->fixtures, "GET /backups/$probe");
        });

        test("traversal: DELETE /backups/<probe $index>", function () use ($ctx, $probe) {
            $response = $ctx->stranger->api->request('DELETE', '/backups/' . rawurlencode($probe));
            // 405 is the web server refusing the shape outright, before PHP
            // ever sees it, which is a refusal like any other.
            assertStatusIn([400, 403, 404, 405], $response, "DELETE /backups/$probe");
        });
    }

    test('traversal: an attachment id cannot walk out of the account', function () use ($ctx, $ownerId) {
        $probe = '../../../' . $ownerId . '/database/poznote.db';
        $response = $ctx->stranger->api->request(
            'GET', '/notes/1/attachments/' . rawurlencode($probe));
        assertStatusIn([400, 403, 404, 405], $response, 'attachment traversal');
        assertNoLeak($response, $ctx->fixtures, 'attachment traversal');
    });
}

/**
 * Workspace names travel in query strings rather than paths, so they get their
 * own pass: naming the owner's workspace must not widen what the stranger sees.
 */
function checkWorkspaceScoping(IsolationContext $ctx): void
{
    $workspace = $ctx->fixtures['workspace'];
    $routes = ['/notes', '/folders', '/folders/counts', '/tags', '/trash', '/graph', '/tasks', '/reminders', '/notes/search'];

    foreach ($routes as $path) {
        test("workspace scoping: GET $path?workspace=<owner's>", function () use ($ctx, $path, $workspace) {
            $query = ['workspace' => $workspace];
            if ($path === '/notes/search') {
                $query['q'] = $ctx->fixtures['marker'];
            }
            $response = $ctx->stranger->api->get($path, ['query' => $query]);
            if ($response->status >= 500) {
                fail("$path: server error -> " . $response->summary());
            }
            assertNoLeak($response, $ctx->fixtures, "GET $path", $query);
        });
    }
}

/**
 * Pass one: the stranger fires every owned route at the owner's identifiers.
 *
 * The owner's data is left alone here, because every request is supposed to be
 * refused. When one is not, the fixtures are rebuilt before continuing: a
 * request that got through has probably just destroyed the object the next
 * routes were going to aim at, and the 404s that would follow would look like
 * passes.
 *
 * The fixtures in force are recorded alongside each response, so the leak
 * check compares every answer against the markers that were live when it was
 * produced rather than against whatever survived the pass.
 *
 * @return array<string,array{response:Response,request:array,fixtures:array}>
 */
function replayPass(IsolationContext $ctx, array $owned): array
{
    $results = [];
    foreach ($owned as $route => $entry) {
        [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
        $results[$route] = [
            'response' => $ctx->stranger->api->request($method, $path, $options),
            'request' => $options + ['path' => $path],
            'fixtures' => $ctx->fixtures,
        ];

        if ($results[$route]['response']->status < 400) {
            $ctx->reseed();
        }
    }
    return $results;
}

/**
 * Pass two: the owner sends the same requests, to prove they were well-formed.
 *
 * These are destructive by design - deleting the note, emptying the folder,
 * renaming the workspace - so a fixture consumed by an earlier control is
 * rebuilt on demand when a later one cannot find its target.
 *
 * @return array<string,Response>
 */
function controlPass(IsolationContext $ctx, array $owned): array
{
    $responses = [];
    foreach ($owned as $route => $entry) {
        [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
        $response = $ctx->owner->api->request($method, $path, $options);

        // 400 is retried too, not just the not-found family: an earlier
        // control may have archived the note or emptied the folder this one
        // needed, and the endpoint reports that as a bad request rather than
        // as a missing target. A payload that is genuinely malformed fails the
        // retry the same way and still gets reported.
        if (in_array($response->status, [400, 404, 409, 410, 423], true)) {
            $ctx->reseed();
            [$method, $path, $options] = buildRequest($route, $entry, $ctx->fixtures);
            $response = $ctx->owner->api->request($method, $path, $options);
        }

        $responses[$route] = $response;
    }
    return $responses;
}

/**
 * The detectors, checked against fabricated answers.
 *
 * Everything above is an assertion that something did NOT happen, and an
 * assertion like that passes just as happily when it has stopped working. So
 * the leak check is shown a response that leaks and the status check one that
 * succeeds, and both have to object.
 */
function checkDetectors(IsolationContext $ctx): void
{
    $fixtures = $ctx->fixtures;

    test('the leak detector reacts to a leaked marker', function () use ($fixtures) {
        $leaking = new Response(200, json_encode(['heading' => 'note-' . $fixtures['marker']]), null);
        try {
            assertNoLeak($leaking, $fixtures, 'fabricated');
        } catch (RuntimeException $e) {
            return;
        }
        fail('a response containing the owner\'s marker was not reported');
    });

    test('the leak detector still ignores an identifier the caller sent', function () use ($fixtures) {
        $echoing = new Response(404, json_encode(['error' => 'no such tag: ' . $fixtures['tag']]), null);
        assertNoLeak($echoing, $fixtures, 'fabricated', ['path' => '/tags/' . $fixtures['tag']]);
    });

    test('the status detector reacts to a request that succeeded', function () {
        try {
            assertStatusIn([403, 404], new Response(200, '{"success":true}', null), 'fabricated');
        } catch (RuntimeException $e) {
            return;
        }
        fail('a 200 was accepted where only a refusal is allowed');
    });

    test('the fixtures the replay aims at are real', function () use ($ctx) {
        foreach (['note', 'other_note', 'tasklist_note', 'trashed_note', 'folder', 'other_folder',
                  'workspace', 'tag', 'task', 'attachment', 'reminder', 'backup', 'snapshot',
                  'note_share_token', 'folder_share_token'] as $key) {
            if (($ctx->fixtures[$key] ?? '') === '') {
                fail("the owner has no $key, so every route that takes one proved nothing");
            }
        }

        // And the owner can actually reach its own note, which is what makes
        // the stranger's 404 on the same id mean something.
        $own = $ctx->owner->api->get('/notes/' . $ctx->fixtures['note']);
        assertStatusIn([200], $own, "the owner reading its own note");
        if (!$own->mentions($ctx->fixtures['marker'])) {
            fail('the owner cannot see its own marker, so the leak check has nothing to find');
        }
    });
}

/** Runs the whole matrix. Called by run.php once the accounts exist. */
function runIsolationTests(IsolationContext $ctx): void
{
    $table = routeTable();

    test('every route in the router is classified', function () use ($table) {
        $unclassified = array_values(array_diff(routesDeclaredByRouter(), array_keys($table)));
        if ($unclassified !== []) {
            fail("the router exposes routes this suite says nothing about:\n        "
                . implode("\n        ", $unclassified)
                . "\n      Add each one to routeTable() in " . basename(__FILE__) . '.');
        }
    });

    test('the classification describes no route that does not exist', function () use ($table) {
        $stale = array_values(array_diff(array_keys($table), routesDeclaredByRouter()));
        if ($stale !== []) {
            fail('routeTable() still lists removed routes: ' . implode(', ', $stale));
        }
    });

    // Without this the whole run would be meaningless: the accounts hold
    // separate databases whose id sequences both start at 1, so a refusal for
    // an id the stranger happens not to own proves nothing unless we know the
    // stranger owns none of the ids under test.
    test('the stranger owns none of the identifiers under test', function () use ($ctx) {
        $collisions = [];
        $notes = $ctx->stranger->api->get('/notes')->json['notes'] ?? [];
        $strangerNoteIds = array_map('strval', array_column($notes, 'id'));
        foreach (['note', 'other_note', 'tasklist_note', 'trashed_note'] as $key) {
            if (in_array((string)$ctx->fixtures[$key], $strangerNoteIds, true)) {
                $collisions[] = "note {$ctx->fixtures[$key]}";
            }
        }
        $folders = $ctx->stranger->api->get('/folders')->json['folders'] ?? [];
        if (in_array((string)$ctx->fixtures['folder'], array_map('strval', array_column($folders, 'id')), true)) {
            $collisions[] = "folder {$ctx->fixtures['folder']}";
        }
        if ($collisions !== []) {
            fail('the stranger account already owns ' . implode(', ', $collisions)
                . ', so a refusal could not be told apart from a coincidence; '
                . 'run against freshly created accounts');
        }
    });

    $owned = array_filter($table, fn($entry) => $entry[0] === OWNED);

    // Order matters: the replay runs against live fixtures, and the control
    // pass is what destroys them.
    $replays = replayPass($ctx, $owned);
    $controls = controlPass($ctx, $owned);

    foreach ($owned as $route => $entry) {
        checkOwned($route, $replays[$route], $controls[$route], $replays[$route]['fixtures']);
    }

    $ctx->reseed();

    foreach ($table as $route => $entry) {
        switch ($entry[0]) {
            case ADMIN:
                checkAdmin($ctx, $route, $entry);
                break;
            case SCOPED:
                checkScoped($ctx, $route, $entry);
                checkImpersonation($ctx, $route, $entry);
                break;
            case OWNED:
                checkImpersonation($ctx, $route, $entry);
                break;
        }
    }

    checkShareTokens($ctx);
    checkWorkspaceScoping($ctx);
    checkPathTraversal($ctx);
    checkDetectors($ctx);
}
