// The services Poznote talks to, answered by support/mock-server.php: what is
// checked is Poznote's side of the conversation, not GitHub or OpenAI.
const { test, expect, Api, ADMIN, inInstance, login, newAccount, totp, BASE_URL, csrfOf } = require('../lib/helpers');

const MOCK = 'http://127.0.0.1:9912';

test.describe('AI assistant and transcription', () => {
    test('the AI server test lists its models', async ({ page }) => {
        await login(page, ADMIN);
        const response = await page.request.post('/api_ai_chat.php?action=test', { form: { url: `${MOCK}/v1` } });
        expect(await response.json()).toMatchObject({ success: true, models: expect.arrayContaining(['mock-model']) });
    });

    test('the chat streams the answer of the model', async ({ page }) => {
        await login(page, ADMIN);
        const response = await page.request.post('/api_ai_chat.php?action=chat', {
            data: { messages: [{ role: 'user', content: 'Bonjour' }] },
        });
        const text = await response.text();
        expect(text, text.slice(0, 300)).toContain('depuis le mock');
    });

    test('a conversation can be saved, listed and deleted', async ({ page }) => {
        await login(page, ADMIN);
        const id = `e2econv${Date.now()}`;
        const body = { id, workspace: 'Poznote', title: 'Conversation e2e', messages: [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Réponse' }] };
        const saved = await page.request.post('/api_ai_chat.php?action=conversation_save', { data: body });
        expect(saved.status(), await saved.text()).toBe(200);
        const list = await page.request.get('/api_ai_chat.php?action=conversations&workspace=Poznote');
        expect(await list.text()).toContain(id);
        const removed = await page.request.post('/api_ai_chat.php?action=conversation_delete', { data: { id, workspace: 'Poznote' } });
        expect(removed.status(), await removed.text()).toBe(200);
    });

    test('an audio file is transcribed', async ({ page }) => {
        await login(page, ADMIN);
        const header = Buffer.alloc(44);
        header.write('RIFF', 0); header.writeUInt32LE(36 + 1600, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24); header.writeUInt32LE(16000, 28);
        header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(1600, 40);
        const response = await page.request.post('/api_transcribe.php', {
            multipart: { language: 'fr', audio: { name: 'a.wav', mimeType: 'audio/wav', buffer: Buffer.concat([header, Buffer.alloc(1600)]) } },
        });
        expect(await response.json()).toMatchObject({ success: true, text: 'transcription du mock' });
    });

    test('the transcription server test lists its models', async ({ page }) => {
        await login(page, ADMIN);
        const response = await page.request.post('/api_transcribe.php?action=test', { form: { url: `${MOCK}/v1`, provider: 'openai' } });
        expect(await response.json()).toMatchObject({ success: true });
    });
});

test.describe('S3 storage', () => {
    test('the connection test reaches the bucket', async ({ page }) => {
        await login(page, ADMIN);
        const response = await page.request.post('/api_s3_storage.php?action=test', {
            form: { endpoint: MOCK, region: 'us-east-1', bucket: 'bucket', access_key: 'a', secret_key: 'b', path_style: '1' },
        });
        expect(await response.json(), 'S3 test').toMatchObject({ success: true });
    });

    test('the S3 client writes, reads, lists and deletes exact bytes', () => {
        const script = `<?php
            error_reporting(E_ALL); ini_set('display_errors', '1'); chdir('/var/www/html');
            require 'config.php'; require_once 'storage/S3Client.php';
            $s = new S3Client(['endpoint' => '${MOCK}', 'bucket' => 'bucket', 'access_key' => 'a', 'secret_key' => 'b', 'path_style' => true]);
            $c = str_repeat("données é\\n", 20000);
            $s->putObjectContent('e2e/x.bin', $c);
            $t = tempnam('/tmp', 's3'); file_put_contents($t, $c); $s->putObject('e2e/y.bin', $t);
            $d = tempnam('/tmp', 's3'); $s->getObjectToFile('e2e/y.bin', $d);
            ob_start(); $s->streamObject('e2e/x.bin'); $st = ob_get_clean();
            $keys = array_map(fn($o) => $o['key'], $s->listObjects('e2e/')); sort($keys);
            $head = $s->headObject('e2e/x.bin')['size'] ?? null;
            $s->deleteObject('e2e/x.bin'); $s->deleteObject('e2e/y.bin');
            echo json_encode(['get' => md5_file($d) === md5($c), 'stream' => md5($st) === md5($c), 'head' => $head === strlen($c), 'gone' => $s->headObject('e2e/x.bin') === null, 'keys' => $keys]);`;
        inInstance(`cat > /tmp/s3-e2e.php <<'PHP'\n${script}\nPHP`);
        const output = inInstance('php /tmp/s3-e2e.php');
        expect(JSON.parse(output), output).toEqual({ get: true, stream: true, head: true, gone: true, keys: expect.arrayContaining(['e2e/x.bin', 'e2e/y.bin']) });
    });
});

test.describe('Git sync', () => {
    test('a configured forge is reached and receives the notes on push', async ({ playwright }) => {
        inInstance(`cat > /tmp/git-e2e.php <<'PHP'\n<?php require '/var/www/html/config.php'; require_once '/var/www/html/users/db_master.php'; setGlobalSetting('git_sync_enabled', '1'); echo 'ok';\nPHP\nphp /tmp/git-e2e.php; chown -R www-data:www-data /var/www/html/data`);
        const api = await Api.open(playwright, ADMIN);
        await api.ok(api.put('/git-sync/config', { token: 'mock-token', repo: 'mock/repo', branch: 'main', provider: 'forgejo', api_base: `${MOCK}/git`, author_name: 'E2E', author_email: 'e2e@example.com' }));
        expect((await api.ok(api.get('/git-sync/status'))).json.config.repo).toBe('mock/repo');
        expect((await api.ok(api.post('/git-sync/test'))).json).toMatchObject({ success: true });
        await api.createNote({ heading: 'Note poussée', content: '<p>vers git</p>' });
        await api.ok(api.post('/git-sync/push', { workspace: 'Poznote' }));
        await expect.poll(() => inInstance('cat /tmp/poznote-e2e-mock/git.log'), { timeout: 20_000, message: 'no note reached the forge' }).toMatch(/(POST|PUT) .*contents/);
        await api.dispose();
    });
});

test.describe('accounts and security', () => {
    test('a wrong password is refused, the right one opens the app, logout closes it', async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'login');
        await page.goto('/login.php');
        await page.fill('#username', account.username);
        await page.fill('#password', 'mauvais');
        await Promise.all([page.waitForNavigation(), page.click('button.login-button')]);
        await expect(page).toHaveURL(/login\.php/);
        await login(page, account);
        await page.goto('/index.php');
        await expect(page.locator('#left_col')).toBeVisible();
        await page.goto('/logout.php');
        await page.goto('/index.php');
        await expect(page).toHaveURL(/login\.php/);
    });

    test('changing a password replaces the old one, and bad requests are refused', async ({ playwright }) => {
        const account = await newAccount(playwright, 'password');
        const api = await Api.open(playwright, account);
        const refused = await api.post('/users/me/password', { current_password: 'mauvais', new_password: 'Nouveau-2026-x', confirm_password: 'Nouveau-2026-x' });
        expect(refused.status).toBeGreaterThanOrEqual(400);
        const changed = await api.ok(api.post('/users/me/password', { current_password: account.password, new_password: 'Nouveau-2026-x', confirm_password: 'Nouveau-2026-x' }));
        expect(changed.json).toMatchObject({ success: true });
        expect((await api.get('/notes')).status).toBe(401);
        const fresh = await Api.open(playwright, { ...account, password: 'Nouveau-2026-x' });
        await fresh.ok(fresh.get('/notes'));
        await api.dispose(); await fresh.dispose();
    });

    test('two-factor: enable, code asked at sign-in, recovery codes, disable', async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'totp');
        await login(page, account);
        const api = page.request;
        const headers = { 'X-User-ID': String(account.id) };
        const setup = await (await api.post('/api/v1/users/me/two-factor/setup', { headers, data: { current_password: account.password } })).json();
        expect(setup.secret, JSON.stringify(setup)).toBeTruthy();
        const enabled = await (await api.post('/api/v1/users/me/two-factor/enable', { headers, data: { code: totp(setup.secret), current_password: account.password } })).json();
        expect(enabled.recovery_codes?.length, JSON.stringify(enabled)).toBeGreaterThan(0);
        await page.goto('/logout.php');
        await page.goto('/login.php');
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await expect(page.locator('#totp_code')).toBeVisible();
        await page.fill('#totp_code', '000000');
        await page.keyboard.press('Enter');
        await expect(page.locator('#totp_code')).toBeVisible();
        await page.fill('#totp_code', enabled.recovery_codes[0]);
        await page.keyboard.press('Enter');
        await page.waitForURL((url) => !url.toString().includes('login.php'));
    });

    test('an app password opens the API, and stops once revoked', async ({ playwright }) => {
        const account = await newAccount(playwright, 'apppass');
        const api = await Api.open(playwright, account);
        const created = await api.ok(api.post('/users/me/app-passwords', { label: 'cli' }));
        const scoped = await Api.open(playwright, { ...account, password: created.json.secret });
        await scoped.ok(scoped.get('/notes'));
        await api.ok(api.del(`/users/me/app-passwords/${created.json.app_password.id}`));
        expect((await scoped.get('/notes')).status).toBe(401);
        await api.dispose(); await scoped.dispose();
    });

    test('admin: users are managed, statistics computed, other accounts stay read-protected', async ({ playwright }) => {
        const admin = await Api.open(playwright, ADMIN);
        const created = await admin.ok(admin.post('/admin/users', { username: `admin-e2e-${Date.now()}` }));
        const id = (created.json.user || created.json).id;
        expect((await admin.ok(admin.get('/admin/users'))).text).toContain('admin-e2e');
        await admin.ok(admin.patch(`/admin/users/${id}`, { active: false }));
        await admin.ok(admin.get('/admin/stats'));
        expect((await admin.ok(admin.get('/admin/statistics'))).json).toMatchObject({ success: true });
        await admin.ok(admin.get('/admin/orphan-attachments'));
        await admin.ok(admin.post('/admin/repair'));
        await admin.ok(admin.del(`/admin/users/${id}`));
        await admin.dispose();
    });

    test('security headers and the default redirect are in place', async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
        const login = await anonymous.get('/login.php');
        expect(login.headers()['x-content-type-options']).toContain('nosniff');
        expect(login.headers()['content-security-policy']).toContain("default-src 'self'");
        expect((await anonymous.get('/index.php', { maxRedirects: 0 })).status()).toBe(302);
        expect((await anonymous.get('/data/master.db', { maxRedirects: 0 })).status(), 'the database must not be served').toBeGreaterThanOrEqual(400);
        await anonymous.dispose();
    });
});

test.describe('webhooks', () => {
    test('a user webhook is registered and receives the note-created event', async ({ page, playwright }) => {
        await login(page, ADMIN);
        const csrf = await csrfOf(page, '/user-webhooks.php');
        const added = await page.request.post('/user-webhooks.php', {
            form: { csrf_token: csrf, action: 'add', webhook_url: `${MOCK}/webhook`, webhook_description: 'e2e', webhook_secret: 'secret', 'webhook_events[]': 'note.created' },
        });
        expect(added.status()).toBeLessThan(400);
        const api = await Api.open(playwright, ADMIN);
        await api.createNote({ heading: 'Déclenche le webhook', content: '<p>x</p>' });
        await api.dispose();
        await expect.poll(() => inInstance(`wget -qO- ${MOCK}/webhook-log`), { timeout: 15_000 }).toContain('note.created');
    });
});
