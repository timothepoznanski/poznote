// Notes, folders, tags, tasks, shares and everything addressed through the API.
const { test, expect, Api, ADMIN, BASE_URL, KITCHEN_MD, KITCHEN_HTML, PNG, newAccount } = require('../lib/helpers');

test.describe('notes and content', () => {
    let api;
    test.beforeAll(async ({ playwright }) => {
        api = await Api.open(playwright, await newAccount(playwright, 'notes'));
    });
    test.afterAll(async () => { await api.dispose(); });

    test('every note type keeps its content, byte for byte', async () => {
        const html = await api.createNote({ heading: 'Référence HTML', content: KITCHEN_HTML, type: 'note' });
        const md = await api.createNote({ heading: 'Référence Markdown', content: KITCHEN_MD, type: 'markdown' });
        expect((await api.getNote(md.id)).content).toBe(KITCHEN_MD);
        const stored = (await api.getNote(html.id)).content;
        for (const fragment of ['<h6>', '<table>', '<strong>Cellule 2</strong>', 'language-php', 'text-align: center', '日本語', '<mark>', 'type="a"']) {
            expect(stored, `the sanitizer dropped ${fragment}`).toContain(fragment);
        }
    });

    test('a note can be edited, renamed, trashed, restored and purged', async () => {
        const note = await api.createNote({ heading: 'Cycle de vie', content: '<p>v1</p>' });
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>v2 é</p>', heading: 'Renommée' }));
        const updated = await api.getNote(note.id);
        expect(updated.heading).toBe('Renommée');
        expect(updated.content).toContain('v2 é');
        await api.ok(api.del(`/notes/${note.id}`));
        expect((await api.ok(api.get('/trash'))).text).toContain('Renommée');
        expect((await api.ok(api.get('/notes'))).text).not.toContain('Renommée');
        await api.ok(api.post(`/notes/${note.id}/restore`));
        expect((await api.ok(api.get('/notes'))).text).toContain('Renommée');
        await api.ok(api.del(`/notes/${note.id}`));
        await api.ok(api.del(`/trash/${note.id}`));
        expect((await api.ok(api.get('/trash'))).text).not.toContain('Renommée');
    });

    test('duplicate copies the content and leaves the original alone', async () => {
        const note = await api.createNote({ heading: 'Original', content: KITCHEN_MD, type: 'markdown' });
        const { json } = await api.ok(api.post(`/notes/${note.id}/duplicate`));
        const copyId = json.id || json.note_id || json.note?.id;
        expect(copyId).not.toBe(note.id);
        expect((await api.getNote(copyId)).content).toBe(KITCHEN_MD);
        expect((await api.getNote(note.id)).heading).toBe('Original');
    });

    test('a note converts between Markdown and rich text', async () => {
        const note = await api.createNote({ heading: 'Conversion', content: '# Titre\n\nTexte **gras**\n', type: 'markdown' });
        await api.ok(api.post(`/notes/${note.id}/convert`, { target: 'html' }));
        const asHtml = await api.getNote(note.id);
        expect(asHtml.type).toBe('note');
        expect(asHtml.content).toContain('<strong>gras</strong>');
        await api.ok(api.post(`/notes/${note.id}/convert`, { target: 'markdown' }));
        const back = await api.getNote(note.id);
        expect(back.type).toBe('markdown');
        expect(back.content).toContain('**gras**');
    });

    test('search ignores accents and case, in titles and in content', async () => {
        await api.createNote({ heading: 'Été au bord de la mer', content: '<p>Crème brûlée</p>' });
        await api.createNote({ heading: 'Noël', content: 'Œuvre `zébra`\n', type: 'markdown' });
        for (const [query, expected] of [['creme', 'Été au bord'], ['ETE AU', 'Été au bord'], ['brulee', 'Été au bord'], ['zebra', 'Noël'], ['noel', 'Noël']]) {
            const { text } = await api.ok(api.get('/notes/search', { params: { q: query } }));
            expect(JSON.parse(text).results ?? JSON.parse(text).notes, `search for ${query}`).toEqual(
                expect.arrayContaining([expect.objectContaining({ heading: expect.stringContaining(expected) })]));
        }
        expect((await api.ok(api.get('/notes/search', { params: { q: 'xyzzy-rien' } }))).text).not.toContain('Été');
    });

    test('note properties can be set: favorite, icon, color, pin, width, title style', async () => {
        const note = await api.createNote({ heading: 'Propriétés', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${note.id}/favorite`));
        expect((await api.getNote(note.id)).favorite).toBeTruthy();
        await api.ok(api.put(`/notes/${note.id}/icon`, { icon: 'lucide-star' }));
        await api.ok(api.put(`/notes/${note.id}/color`, { color: 'blue' }));
        await api.ok(api.put(`/notes/${note.id}/pinned`, { pinned: true }));
        await api.ok(api.put(`/notes/${note.id}/content-width`, { content_width: 80 }));
        await api.ok(api.put(`/notes/${note.id}/title-style`, { title_size: 24 }));
        await api.ok(api.post(`/notes/${note.id}/opened`));
    });

    test('tags can be set, listed, renamed and removed', async () => {
        const note = await api.createNote({ heading: 'Taguée', content: '<p>x</p>' });
        await api.ok(api.put(`/notes/${note.id}/tags`, { tags: ['alpha', 'béta'] }));
        expect((await api.ok(api.get('/tags'))).text).toContain('alpha');
        await api.ok(api.patch('/tags/alpha', { new_name: 'gamma', name: 'gamma', new_tag: 'gamma' }));
        expect((await api.getNote(note.id)).tags).toContain('gamma');
        await api.ok(api.del('/tags/gamma'));
        expect((await api.getNote(note.id)).tags).not.toContain('gamma');
    });

    test('folders: create, nest, rename, move notes, duplicate, empty, delete', async () => {
        const parent = (await api.ok(api.post('/folders', { folder_name: 'Parent é' }))).json.folder;
        const child = (await api.ok(api.post('/folders', { folder_name: 'Enfant', parent_id: parent.id }))).json.folder;
        const note = await api.createNote({ heading: 'Dans un dossier', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${note.id}/folder`, { folder_id: child.id }));
        expect((await api.getNote(note.id)).folder_id).toBe(child.id);
        expect((await api.ok(api.get(`/folders/${child.id}/notes`))).json.count).toBe(1);
        expect((await api.ok(api.get(`/folders/${child.id}/path`))).text).toContain('Parent é');
        await api.ok(api.patch(`/folders/${child.id}`, { name: 'Renommé', folder_name: 'Renommé' }));
        expect((await api.ok(api.get('/folders'))).text).toContain('Renommé');
        const copy = await api.ok(api.post(`/folders/${parent.id}/duplicate`));
        expect(copy.text).not.toContain('error');
        await api.ok(api.post(`/notes/${note.id}/remove-folder`));
        expect((await api.getNote(note.id)).folder_id ?? null).toBeNull();
        await api.ok(api.post(`/folders/${child.id}/move`, { new_parent_id: null, parent_id: null }));
        await api.ok(api.post(`/notes/${note.id}/folder`, { folder_id: child.id }));
        await api.ok(api.post(`/folders/${child.id}/empty`));
        await api.ok(api.del(`/folders/${child.id}`));
        expect((await api.ok(api.get('/folders'))).json.folders.map((folder) => folder.id)).not.toContain(child.id);
    });

    test('task lists: tasks, subtasks, completion, deletion', async () => {
        const list = await api.createNote({ heading: 'Courses', type: 'tasklist', content: '[]' });
        const task = (await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'Pain é' }))).json.task;
        const sub = (await api.ok(api.post(`/notes/${list.id}/tasks/${task.id}/subtasks`, { text: 'Complet' }))).json;
        expect((await api.ok(api.get(`/notes/${list.id}/tasks`))).text).toContain('Complet');
        await api.ok(api.patch(`/notes/${list.id}/tasks/${task.id}`, { completed: true }));
        expect(JSON.stringify((await api.ok(api.get(`/notes/${list.id}/tasks`))).json)).toContain('"completed":true');
        expect((await api.ok(api.get('/tasks'))).text).toContain('Pain');
        const subId = sub.subtask?.id ?? sub.id;
        await api.ok(api.del(`/notes/${list.id}/tasks/${task.id}/subtasks/${subId}`));
        await api.ok(api.del(`/notes/${list.id}/tasks/${task.id}`));
        expect((await api.ok(api.get(`/notes/${list.id}/tasks`))).text).not.toContain('Pain');
    });

    test('attachments: upload, exact download, move, delete', async () => {
        const note = await api.createNote({ heading: 'Avec pièce jointe', content: '<p>x</p>' });
        const other = await api.createNote({ heading: 'Autre', content: '<p>x</p>' });
        const uploaded = await api.ok(api.call('POST', `/notes/${note.id}/attachments`, {
            multipart: { file: { name: 'image é.png', mimeType: 'image/png', buffer: PNG } },
        }));
        const id = uploaded.json.attachment_id ?? uploaded.json.attachment?.id ?? uploaded.json.attachments?.at(-1)?.id;
        const down = await api.ok(api.get(`/notes/${note.id}/attachments/${id}`));
        expect(down.body.equals(PNG), 'the downloaded file differs from the upload').toBe(true);
        expect(down.headers['content-type']).toContain('image/png');
        expect((await api.ok(api.get('/notes/with-attachments'))).text).toContain('Avec pièce jointe');
        await api.ok(api.post(`/notes/${note.id}/attachments/${id}/move`, { target_note_id: other.id }));
        const moved = (await api.ok(api.get(`/notes/${other.id}/attachments`))).json.attachments[0].id;
        expect((await api.get(`/notes/${other.id}/attachments/${moved}`)).body.equals(PNG), 'the moved file differs').toBe(true);
        expect((await api.get(`/notes/${note.id}/attachments/${id}`)).status).toBe(404);
        await api.ok(api.del(`/notes/${other.id}/attachments/${moved}`));
        expect((await api.get(`/notes/${other.id}/attachments/${moved}`)).status).toBe(404);
    });

    test('an executable upload is refused by default', async () => {
        const note = await api.createNote({ heading: 'Upload refusé', content: '<p>x</p>' });
        const response = await api.call('POST', `/notes/${note.id}/attachments`, {
            multipart: { file: { name: 'virus.php', mimeType: 'text/plain', buffer: Buffer.from('<?php echo 1;') } },
        });
        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('snapshots: a manual one can be listed, read and restored', async () => {
        const note = await api.createNote({ heading: 'Versionnée', content: '<p>première version</p>' });
        const key = (await api.ok(api.call('POST', `/notes/${note.id}/snapshot`, { params: { manual: 1 }, json: {} }))).json.snapshot_key;
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>seconde version</p>' }));
        expect((await api.ok(api.get(`/notes/${note.id}/snapshots`))).text).toContain(key);
        await api.ok(api.post(`/notes/${note.id}/snapshot/restore`, { snapshot_key: key }));
        expect((await api.getNote(note.id)).content).toContain('première version');
    });

    test('reminders: set, listed, removed', async () => {
        const note = await api.createNote({ heading: 'Rappel', content: '<p>x</p>' });
        const at = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
        await api.ok(api.post(`/notes/${note.id}/reminder`, { remind_at: at, reminder_at: at, datetime: at }));
        expect((await api.ok(api.get(`/notes/${note.id}/reminder`))).status).toBe(200);
        await api.ok(api.del(`/notes/${note.id}/reminder`));
    });

    test('links between notes: backlinks, graph and references by title', async () => {
        const target = await api.createNote({ heading: 'Cible du lien', content: '<p>cible</p>' });
        await api.createNote({ heading: 'Source du lien', content: `[[Cible du lien]] et [lien](index.php?note=${target.id})\n`, type: 'markdown' });
        const resolved = await api.ok(api.get('/notes/resolve', { params: { reference: 'Cible du lien' } }));
        expect(resolved.text).toContain(String(target.id));
        expect((await api.ok(api.get(`/notes/${target.id}/backlinks`))).text).toContain('Source du lien');
        await api.ok(api.get('/graph'));
    });

    test('the edit lock can be taken, read and released', async () => {
        const note = await api.createNote({ heading: 'Verrou', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${note.id}/lock`, { editor_session_id: 'e2e-session' }));
        await api.ok(api.get(`/notes/${note.id}/lock`));
        await api.ok(api.post(`/notes/${note.id}/lock/heartbeat`, { editor_session_id: 'e2e-session' }));
        await api.ok(api.post(`/notes/${note.id}/lock/release`, { editor_session_id: 'e2e-session' }));
    });

    test('workspaces: create, fill, rename, delete', async () => {
        const name = `Espace ${Date.now()}`;
        await api.ok(api.post('/workspaces', { name }));
        const note = await api.createNote({ heading: 'Dans un espace', content: '<p>x</p>', workspace: name });
        expect((await api.getNote(note.id)).workspace).toBe(name);
        const renamed = `${name} bis`;
        await api.ok(api.patch(`/workspaces/${encodeURIComponent(name)}`, { new_name: renamed, name: renamed }));
        expect((await api.getNote(note.id)).workspace).toBe(renamed);
        await api.ok(api.del(`/workspaces/${encodeURIComponent(renamed)}`));
        expect((await api.ok(api.get('/workspaces'))).text).not.toContain(renamed);
    });

    test('read-only endpoints answer valid JSON', async () => {
        for (const url of ['/notes', '/notes/templates', '/changes', '/folders/counts', '/folders/suggested', '/offline/manifest', '/offline/list',
            '/shared', '/shared/with-me', '/mentions', '/mentions/members?workspace=Poznote', '/settings', '/reminders', '/reminders/count', '/system/version',
            '/system/whats-new', '/system/i18n', '/users/me', '/users/profiles', '/users/me/password-status', '/users/me/app-passwords',
            '/users/me/connected-apps', '/users/me/push', '/users/me/two-factor', '/git-sync/status', '/git-sync/progress']) {
            const response = await api.get(url);
            expect(response.status, `${url}: ${response.text.slice(0, 200)}`).toBeLessThan(400);
            expect(response.json, `${url} is not JSON: ${response.text.slice(0, 200)}`).not.toBeNull();
        }
    });

    test('settings are stored and read back', async () => {
        await api.ok(api.put('/settings/note_font_family', { value: 'Inter' }));
        expect((await api.ok(api.get('/settings/note_font_family'))).text).toContain('Inter');
    });
});

test.describe('public sharing', () => {
    let api;
    test.beforeAll(async ({ playwright }) => {
        api = await Api.open(playwright, await newAccount(playwright, 'share'));
    });
    test.afterAll(async () => { await api.dispose(); });

    test('a shared note renders for anonymous visitors, and stops when unshared', async ({ page, playwright }) => {
        const note = await api.createNote({ heading: 'Note partagée', content: KITCHEN_HTML });
        const { json } = await api.ok(api.post(`/notes/${note.id}/share`));
        const token = json.url.replace(/\/+$/, '').split('/').pop();
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const opened = await anonymous.get(`/${token}`);
        expect(opened.status()).toBe(200);
        expect(await opened.text()).toContain('Cellule 2');
        await page.goto(`/${token}`);
        await expect(page.locator('table').first()).toBeVisible();
        await api.ok(api.del(`/notes/${note.id}/share`));
        expect((await anonymous.get(`/${token}`)).status()).toBe(404);
        await anonymous.dispose();
    });

    test('a shared Markdown note is rendered, not shown as source', async ({ page }) => {
        const note = await api.createNote({ heading: 'Markdown partagé', content: KITCHEN_MD, type: 'markdown' });
        const { json } = await api.ok(api.post(`/notes/${note.id}/share`));
        await page.goto(`/${json.url.replace(/\/+$/, '').split('/').pop()}`);
        await expect(page.locator('h1', { hasText: 'Titre de niveau 1' }).first()).toBeVisible();
        await expect(page.locator('table').first()).toBeVisible();
        await expect(page.locator('body')).not.toContainText('## Titre de niveau 2');
    });

    test('a password protects a share', async ({ playwright }) => {
        const note = await api.createNote({ heading: 'Secret partagé', content: '<p>contenu secret</p>' });
        const { json } = await api.ok(api.post(`/notes/${note.id}/share`, { password: 'motdepasse' }));
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const opened = await anonymous.get(`/${json.url.replace(/\/+$/, '').split('/').pop()}`);
        expect(await opened.text()).not.toContain('contenu secret');
        await anonymous.dispose();
    });

    test('a shared folder lists its notes', async ({ playwright }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier partagé' }))).json.folder;
        const note = await api.createNote({ heading: 'Note du dossier', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        const { json } = await api.ok(api.post(`/folders/${folder.id}/share`));
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const opened = await anonymous.get(`/folder/${json.url.replace(/\/+$/, '').split('/').pop()}`);
        expect(opened.status()).toBe(200);
        expect(await opened.text()).toContain('Note du dossier');
        await anonymous.dispose();
    });
});

test('the API refuses another account and missing credentials', async ({ playwright }) => {
    const owner = await Api.open(playwright, await newAccount(playwright, 'owner'));
    const stranger = await Api.open(playwright, await newAccount(playwright, 'stranger'));
    const note = await owner.createNote({ heading: 'Note privée unique', content: '<p>secret</p>' });
    expect((await stranger.ok(stranger.get('/notes'))).text).not.toContain('Note privée unique');
    const impostor = await Api.open(playwright, { ...stranger.account, id: owner.account.id });
    expect((await impostor.get(`/notes/${note.id}`)).status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain((await stranger.get('/admin/users')).status);
    const nobody = await playwright.request.newContext({ baseURL: BASE_URL });
    expect((await nobody.get('/api/v1/notes')).status()).toBe(401);
    await nobody.dispose();
    await owner.dispose(); await stranger.dispose(); await impostor.dispose();
    void ADMIN;
});
