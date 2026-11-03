// Accounts, administration, the whole REST API, the OAuth server, the MCP server,
// the AI assistant and what an outsider sees of the security of the instance.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, covers, forgetSession, inInstance, csrfOf, Api, ADMIN, BASE_URL, PNG, newAccount, login, openNote, settled, readZip, writeZip, totp } = require('../lib/helpers');

const MOCK = 'http://127.0.0.1:9912';
const MCP_URL = process.env.POZNOTE_E2E_MCP_URL || `http://127.0.0.1:${Number(new URL(BASE_URL).port) + 1000}/mcp`;
const FUTURE = '2031-03-04 10:00:00';
const PAST = '2020-01-01 10:00:00';

// A file and a directory of the instance are written by root: PHP must keep them
const phpInInstance = (name, script) => {
    inInstance(`cat > /tmp/${name}.php <<'PHP'\n<?php\n${script}\nPHP`);
    const output = inInstance(`php /tmp/${name}.php; chown -R www-data:www-data /var/www/html/data`);
    return output;
};
const setGlobal = (key, value) => phpInInstance('set-global', `require '/var/www/html/config.php'; require_once '/var/www/html/users/db_master.php'; setGlobalSetting(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
const getGlobal = (key) => phpInInstance('get-global', `require '/var/www/html/config.php'; require_once '/var/www/html/users/db_master.php'; echo (string)getGlobalSetting(${JSON.stringify(key)}, '');`);
/** One value read directly from the database of an account, for what no route answers. */
const sqlOne = (userId, sql) => phpInInstance('sql-one', `$db = new PDO('sqlite:/var/www/html/data/users/${userId}/database/poznote.db'); echo json_encode($db->query(${JSON.stringify(sql)})->fetchColumn());`);
const multipartFile = (name, buffer, mimeType = 'application/octet-stream') => ({ file: { name, mimeType, buffer } });

/** Clicks a card of the Admin Tools section, which shows one group at a time. */
const ADMIN_GROUPS = {
    'users-access': ['users-admin', 'oidc-config', 'two-factor-required', 'login-disabled', 'tenant-isolation'],
    integrations: ['smtp-config', 'webhooks', 'ai-assistant', 'stt', 'git-sync-enabled', 'statistics-token', 'outbound-hosts'],
    'storage-limits': ['s3-storage', 's3-backup', 'local-backup', 'executable-attachments', 'import-limits', 'user-quotas'],
    maintenance: ['disaster-recovery', 'orphan-scanner', 'activity-log', 'storage-stats'],
};
async function openAdminCard(page, card) {
    const group = Object.keys(ADMIN_GROUPS).find((key) => ADMIN_GROUPS[key].includes(card.replace(/-card$/, '')));
    await page.goto('/index.php');
    await page.goto(`/settings.php#section=admin-tools-grid&group=${group}`);
    await page.click(`#${card}`);
}

/** Puts the box of a settings page in the given state (they remember being closed). */
async function openBoxes(page) {
    const closed = page.locator('.settings-box-toggle[aria-expanded="false"]:visible');
    while (await closed.count() > 0) await closed.first().click();
}

// ================================================================================
// REST API: every route, with an assertion on what it did
// ================================================================================
test.describe('REST API', () => {
    let account;
    let api;
    let admin;
    let anonymous;

    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'rest');
        api = await Api.open(playwright, account);
        admin = await Api.open(playwright, ADMIN);
        anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
    });
    test.afterAll(async () => { await api.dispose(); await admin.dispose(); await anonymous.dispose(); });

    const newNote = (fields = {}) => api.createNote({ heading: `Note é ${Date.now()}-${Math.random()}`, content: '<p>corps de la note</p>', ...fields });
    const newFolder = async (name = `Dossier ${Date.now()}-${Math.random()}`, extra = {}) => (await api.ok(api.post('/folders', { folder_name: name, workspace: 'Poznote', ...extra }))).json.folder;

    test('notes: create, read, update and the optimistic version check', covers('plat.api.notes-crud'), async () => {
        const created = await api.ok(api.post('/notes', { heading: 'Fiche créée', content: '<p>été</p>', tags: 'un,deux' }));
        expect(created.status).toBe(201);
        const id = created.json.note.id;
        expect(created.json.note).toMatchObject({ heading: 'Fiche créée', workspace: 'Poznote', type: 'note' });
        const read = await api.getNote(id);
        expect(read).toMatchObject({ heading: 'Fiche créée', tags: 'un, deux', type: 'note' });
        expect(read.content).toContain('été');
        const updated = await api.ok(api.patch(`/notes/${id}`, { heading: 'Fiche changée', content: '<p>hiver</p>' }));
        expect(updated.json.note.version, 'a save answers the new version').toMatch(/^[0-9a-f]{32}$/);
        const after = await api.getNote(id);
        expect(after.heading).toBe('Fiche changée');
        expect(after.content).toContain('hiver');
        const stale = await api.patch(`/notes/${id}`, { content: '<p>perdu</p>', if_version: 'ffffffffffffffffffffffffffffffff' });
        expect(stale.status, 'a stale if_version must be refused').toBe(409);
        expect((await api.getNote(id)).content).toContain('hiver');
        expect((await api.get('/notes/999999')).status).toBe(404);
    });

    test('notes: list with filters, search, search ids, resolve', covers('plat.api.notes-list'), async () => {
        const word = `mot${Date.now()}`;
        const folder = await newFolder();
        const note = await newNote({ heading: `Listée ${word}`, content: `<p>${word}</p>`, folder_id: folder.id, tags: `tag${word}` });
        const other = await newNote();
        const all = (await api.ok(api.get('/notes', { params: { workspace: 'Poznote', limit: 1000 } }))).json.notes;
        expect(all.map((n) => n.id)).toEqual(expect.arrayContaining([note.id, other.id]));
        const inFolder = (await api.ok(api.get('/notes', { params: { folder_id: folder.id } }))).json.notes;
        expect(inFolder.map((n) => n.id)).toEqual([note.id]);
        const search = (await api.ok(api.get('/notes/search', { params: { q: word } }))).json;
        expect(search).toMatchObject({ query: word, count: 1 });
        expect(search.results[0]).toMatchObject({ id: note.id, excerpt: expect.stringContaining(word) });
        expect((await api.ok(api.get('/notes/search/ids', { params: { q: word } }))).json.ids).toEqual([note.id]);
        const resolved = (await api.ok(api.get('/notes/resolve', { params: { reference: note.heading, workspace: 'Poznote' } }))).json;
        expect(resolved).toMatchObject({ id: note.id, heading: note.heading });
        expect((await api.get('/notes/resolve', { params: { reference: 'absente', workspace: 'Poznote' } })).status).toBe(404);
    });

    test('notes: reorder, favorites and clearing them, last opened', covers('plat.api.notes-order'), async () => {
        const first = await newNote();
        const second = await newNote();
        const reordered = (await api.ok(api.post('/notes/reorder', { note_id: second.id, target_note_id: first.id, position: 'before' }))).json;
        expect(reordered.note).toMatchObject({ id: second.id, position: 'before', target_note_id: first.id });
        expect((await api.ok(api.post(`/notes/${first.id}/favorite`))).json.is_favorite).toBe(1);
        expect((await api.getNote(first.id)).favorite).toBe(1);
        expect((await api.ok(api.post('/notes/favorites/clear', { workspace: 'Poznote' }))).json.notes).toBeGreaterThanOrEqual(1);
        expect((await api.getNote(first.id)).favorite).toBe(0);
        expect((await api.ok(api.post(`/notes/${second.id}/opened`))).json.note_id).toBe(second.id);
    });

    test('notes: icon, colour, tags, width, title style, pin, offline, kanban state are stored', covers('plat.api.notes-attributes'), async () => {
        const { id } = await newNote();
        expect((await api.ok(api.put(`/notes/${id}/tags`, { tags: ['z1', 'z2'] }))).json.note.tags).toBe('z1, z2');
        expect((await api.ok(api.put(`/notes/${id}/icon`, { icon: 'lucide-star', icon_color: '#ff0000' }))).json).toMatchObject({ icon: 'lucide-star', icon_color: '#ff0000' });
        expect((await api.ok(api.put(`/notes/${id}/color`, { color: 'red' }))).json).toMatchObject({ color: 'red', color_hex: '#ef4444' });
        expect((await api.ok(api.put(`/notes/${id}/pinned`, { pinned: true }))).json.pinned).toBe(true);
        expect((await api.ok(api.put(`/notes/${id}/content-width`, { content_width: 80 }))).json.content_width).toBe(80);
        expect((await api.put(`/notes/${id}/content-width`, { content_width: 'large' })).status, 'not a percentage').toBe(400);
        expect((await api.ok(api.put(`/notes/${id}/title-style`, { title_color: '#2563eb', title_size: 30 }))).json).toMatchObject({ title_color: '#2563eb', title_size: 30 });
        expect((await api.put(`/notes/${id}/title-style`, { title_color: 'rouge' })).status, 'not a colour').toBe(400);
        expect((await api.ok(api.put(`/notes/${id}/offline`, { offline: true }))).json.offline).toBe(true);
        expect((await api.ok(api.post(`/notes/${id}/kanban-completed`, { completed: true }))).json.completed).toBe(true);
        const stored = await api.getNote(id);
        expect(stored).toMatchObject({ tags: 'z1, z2', icon: 'lucide-star', icon_color: '#ff0000', color: 'red', content_width: 80, title_color: '#2563eb', title_size: 30 });
        expect(sqlOne(account.id, `SELECT pinned FROM entries WHERE id = ${id}`), 'no route shows pinned, the database does').toBe('1');
        const listed = (await api.ok(api.get('/offline/list'))).json.notes;
        expect(listed.find((n) => n.note_id === id)?.reasons).toContain('note');
    });

    test('notes: the sendBeacon save writes the note', covers('plat.api.notes-beacon'), async () => {
        const { id } = await newNote();
        const saved = await api.ok(api.call('POST', `/notes/${id}/beacon`, { form: { content: '<p>sauvé par beacon</p>' } }));
        expect(saved.json).toMatchObject({ success: true, id });
        expect((await api.getNote(id)).content).toContain('sauvé par beacon');
    });

    test('notes: edit lock taken, seen, kept alive, refused to another editor, released', covers('plat.api.notes-lock'), async ({ playwright }) => {
        const { id } = await newNote();
        const taken = await api.ok(api.post(`/notes/${id}/lock`, { editor_session_id: 'onglet-1' }));
        expect(taken.json.lock).toMatchObject({ note_id: id, holder_is_current_editor_session: true, holder_username: account.username });
        expect((await api.ok(api.get(`/notes/${id}/lock`))).json.lock.holder_username).toBe(account.username);
        expect((await api.ok(api.post(`/notes/${id}/lock/heartbeat`, { editor_session_id: 'onglet-1' }))).json.lock.note_id).toBe(id);
        const someoneElse = await Api.open(playwright, { ...ADMIN, id: account.id });
        const refused = await someoneElse.post(`/notes/${id}/lock`, { editor_session_id: 'autre-personne' });
        expect(refused.status, 'another person must wait').toBe(423);
        expect(refused.json.lock.holder_username).toBe(account.username);
        expect((await api.ok(api.post(`/notes/${id}/lock`, { editor_session_id: 'onglet-2' }))).json.lock.holder_is_current_editor_session, 'the same person takes over from another tab').toBe(true);
        await someoneElse.dispose();
        expect((await api.ok(api.post(`/notes/${id}/lock/release`, { editor_session_id: 'onglet-2' }))).json.released).toBe(true);
        expect((await api.ok(api.get(`/notes/${id}/lock`))).json.lock).toBeFalsy();
    });

    test('notes: duplicate, convert both ways, and the two converters', covers('plat.api.notes-convert'), async () => {
        const note = await newNote({ heading: 'Originale', content: '<p><strong>gras</strong></p>' });
        const copy = (await api.ok(api.post(`/notes/${note.id}/duplicate`))).json;
        expect(copy).toMatchObject({ success: true, heading: 'Originale (1)' });
        expect((await api.getNote(copy.id)).content).toContain('gras');
        const toMarkdown = (await api.ok(api.post(`/notes/${note.id}/convert`, { target: 'markdown' }))).json;
        expect(toMarkdown).toMatchObject({ success: true, type: 'markdown' });
        const asMarkdown = await api.getNote(note.id);
        expect(asMarkdown.type).toBe('markdown');
        expect(asMarkdown.content).toContain('**gras**');
        await api.ok(api.post(`/notes/${note.id}/convert`, { target: 'html' }));
        expect((await api.getNote(note.id)).type).toBe('note');
        expect((await api.ok(api.post('/convert-html', { html: '<b>x</b> é' }))).json.markdown).toBe('**x** é');
        expect((await api.ok(api.post('/convert-markdown', { markdown: '**x**' }))).json.html).toContain('<strong>x</strong>');
    });

    test('notes: trash, restore, delete for good, empty, trash search', covers('plat.api.trash'), async () => {
        const word = `poubelle${Date.now()}`;
        const kept = await newNote({ heading: `${word} gardée` });
        const lost = await newNote({ heading: `${word} perdue` });
        const third = await newNote({ heading: `${word} vidée` });
        for (const { id } of [kept, lost, third]) expect((await api.ok(api.del(`/notes/${id}`))).json.note.action).toBe('moved_to_trash');
        const listed = (await api.ok(api.get('/trash', { params: { search: word } }))).json;
        expect(listed.count).toBe(3);
        await api.ok(api.post(`/notes/${kept.id}/restore`));
        expect((await api.getNote(kept.id)).heading).toContain('gardée');
        expect((await api.ok(api.del(`/trash/${lost.id}`))).json.success).toBe(true);
        const after = (await api.ok(api.get('/trash', { params: { search: word } }))).json.notes.map((n) => n.id);
        expect(after).toEqual([third.id]);
        expect((await api.ok(api.del('/trash'))).json.deleted_count).toBeGreaterThanOrEqual(1);
        expect((await api.ok(api.get('/trash'))).json.count).toBe(0);
    });

    test('notes: backlinks, link graph, change probe', covers('plat.api.graph'), async () => {
        const target = await newNote({ heading: `Cible ${Date.now()}` });
        const source = await newNote({ heading: 'Source', type: 'markdown', content: `[[${target.heading}]]` });
        await expect.poll(async () => (await api.ok(api.get(`/notes/${target.id}/backlinks`))).json.backlinks.map((b) => b.id)).toContain(source.id);
        const graph = (await api.ok(api.get('/graph'))).json;
        expect(graph.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([target.id, source.id]));
        expect(graph.edges.some((e) => e.source === source.id && e.target === target.id), JSON.stringify(graph.edges)).toBe(true);
        const before = (await api.ok(api.get('/changes'))).json.tree_version;
        expect(before).toMatch(/^[0-9a-f]{32}$/);
        await newNote();
        expect((await api.ok(api.get('/changes'))).json.tree_version, 'a new note must change the probe').not.toBe(before);
    });

    test('notes: templates and notes with attachments are listed', covers('plat.api.notes-templates'), async () => {
        const folder = await newFolder('Templates');
        const template = await newNote({ heading: 'Modèle', folder_id: folder.id });
        const templates = (await api.ok(api.get('/notes/templates'))).json;
        expect(templates.notes.map((n) => n.id), JSON.stringify(templates)).toContain(template.id);
        const { id } = await newNote();
        await api.ok(api.call('POST', `/notes/${id}/attachments`, { multipart: multipartFile('t.txt', Buffer.from('x'), 'text/plain') }));
        const listed = (await api.ok(api.get('/notes/with-attachments'))).json;
        expect(listed.notes.find((n) => n.id === id)?.attachments[0].original_filename).toBe('t.txt');
    });

    test('offline: manifest, list and content of the notes', covers('plat.api.offline'), async () => {
        const note = await newNote({ heading: 'Hors ligne' });
        const manifest = (await api.ok(api.get('/offline/manifest'))).json;
        expect(manifest.user.id).toBe(account.id);
        expect(manifest.workspaces).toContain('Poznote');
        expect(manifest.limits.notes).toBeGreaterThan(0);
        const list = (await api.ok(api.get('/offline/list'))).json;
        expect(list.notes.find((n) => n.note_id === note.id)?.heading).toBe('Hors ligne');
        const notes = (await api.ok(api.get('/offline/notes', { params: { ids: String(note.id) } }))).json.notes;
        expect(notes[0]).toMatchObject({ id: note.id, heading: 'Hors ligne', content: expect.stringContaining('corps') });
    });

    test('snapshots: create, list, read, restore, delete', covers('plat.api.snapshots'), async () => {
        const { id } = await newNote({ content: '<p>version une</p>' });
        const created = (await api.ok(api.post(`/notes/${id}/snapshot?manual=1`))).json;
        expect(created).toMatchObject({ created: true, manual: true });
        const key = created.snapshot_key;
        expect((await api.ok(api.get(`/notes/${id}/snapshots`))).json.snapshots.map((s) => s.snapshot_key)).toContain(key);
        expect((await api.ok(api.get(`/notes/${id}/snapshot`, { params: { snapshot_key: key } }))).json.snapshot.content).toContain('version une');
        await api.ok(api.patch(`/notes/${id}`, { content: '<p>version deux</p>' }));
        await api.ok(api.post(`/notes/${id}/snapshot/restore?snapshot_key=${encodeURIComponent(key)}`));
        expect((await api.getNote(id)).content).toContain('version une');
        await api.ok(api.del(`/notes/${id}/snapshot?snapshot_key=${encodeURIComponent(key)}`));
        expect((await api.ok(api.get(`/notes/${id}/snapshots`))).json.snapshots.map((s) => s.snapshot_key)).not.toContain(key);
    });

    test('tasks: add, list, update, subtasks, delete, overview', covers('plat.api.tasks'), async () => {
        const { id } = await newNote({ heading: 'Liste de tâches', type: 'tasklist', content: '[]' });
        const task = (await api.ok(api.post(`/notes/${id}/tasks`, { text: 'tâche é', important: true }))).json.task;
        expect(task).toMatchObject({ text: 'tâche é', important: true, completed: false });
        expect((await api.ok(api.get(`/notes/${id}/tasks`))).json.tasks.map((t) => t.text)).toEqual(['tâche é']);
        const url = `/notes/${id}/tasks/${task.id}`;
        expect((await api.ok(api.patch(url, { text: 'modifiée', completed: true }))).json.task).toMatchObject({ text: 'modifiée', completed: true });
        const sub = (await api.ok(api.post(`${url}/subtasks`, { text: 'sous-tâche' }))).json.subtask;
        expect(sub).toMatchObject({ text: 'sous-tâche', completed: false });
        expect((await api.ok(api.patch(`${url}/subtasks/${sub.id}`, { completed: true }))).json.subtask.completed).toBe(true);
        const overview = (await api.ok(api.get('/tasks'))).json.notes.find((n) => n.id === id);
        expect(overview.tasks[0]).toMatchObject({ text: 'modifiée' });
        expect(overview.tasks[0].subtasks[0]).toMatchObject({ text: 'sous-tâche', completed: true });
        expect((await api.ok(api.del(`${url}/subtasks/${sub.id}`))).json.subtasks).toEqual([]);
        await api.ok(api.del(url));
        expect((await api.ok(api.get(`/notes/${id}/tasks`))).json.tasks).toEqual([]);
    });

    test('reminders: set, read, fire, mark read, dismiss, dismiss all, remove, task reminders', covers('plat.api.reminders'), async ({ playwright }) => {
        const own = await newAccount(playwright, 'remind');
        const remind = await Api.open(playwright, own);
        const first = await remind.createNote({ heading: 'Rappel un' });
        const second = await remind.createNote({ heading: 'Rappel deux' });
        await remind.ok(remind.post(`/notes/${first.id}/reminder`, { reminder_at: FUTURE, message: 'plus tard' }));
        expect((await remind.ok(remind.get(`/notes/${first.id}/reminder`))).json.reminder_at).toBe(FUTURE);
        expect((await remind.ok(remind.get('/reminders/count'))).json.unread_count, 'a future reminder has not fired').toBe(0);
        await remind.ok(remind.del(`/notes/${first.id}/reminder`));
        expect((await remind.ok(remind.get(`/notes/${first.id}/reminder`))).json.reminder_at).toBeNull();
        await remind.ok(remind.post(`/notes/${first.id}/reminder`, { reminder_at: PAST, message: 'échu' }));
        await remind.ok(remind.post(`/notes/${second.id}/reminder`, { reminder_at: PAST, message: 'échu aussi' }));
        const fired = (await remind.ok(remind.get('/reminders'))).json;
        expect(fired.notifications.map((n) => n.message).sort()).toEqual(['échu', 'échu aussi']);
        expect((await remind.ok(remind.get('/reminders/count'))).json.unread_count).toBe(2);
        const notification = fired.notifications.find((n) => n.note_id === first.id);
        await remind.ok(remind.post(`/reminders/${notification.id}/read`));
        expect((await remind.ok(remind.get('/reminders/count'))).json).toMatchObject({ unread_count: 1, total_count: 2 });
        await remind.ok(remind.post(`/reminders/${notification.id}/dismiss`));
        expect((await remind.ok(remind.get('/reminders/count'))).json.total_count).toBe(1);
        await remind.ok(remind.post('/reminders/dismiss-all'));
        expect((await remind.ok(remind.get('/reminders/count'))).json.total_count).toBe(0);
        const list = await remind.createNote({ heading: 'Tâches datées', type: 'tasklist', content: '[]' });
        const task = (await remind.ok(remind.post(`/notes/${list.id}/tasks`, { text: 'à rappeler' }))).json.task;
        await remind.ok(remind.post(`/notes/${list.id}/task-reminder`, { task_id: String(task.id), reminder_at: PAST, message: 'tâche échue' }));
        expect((await remind.ok(remind.get('/reminders'))).json.notifications.map((n) => n.message)).toContain('tâche échue');
        await remind.ok(remind.del(`/notes/${list.id}/task-reminder?task_id=${task.id}`));
        expect((await remind.ok(remind.get('/reminders'))).json.notifications.map((n) => n.message)).not.toContain('tâche échue');
        await remind.dispose();
    });

    test('note share: create, read, update, list, revoke, and the public page follows', covers('plat.api.note-share'), async () => {
        const { id } = await newNote({ heading: 'Partagée é', content: '<p>texte public</p>' });
        expect((await api.ok(api.get(`/notes/${id}/share`))).json.public).toBe(false);
        const created = await api.ok(api.post(`/notes/${id}/share`, {}));
        expect(created.status).toBe(201);
        const token = created.json.url.split('/').pop();
        expect(token).toMatch(/^[0-9a-f]{32}$/);
        expect(await (await anonymous.get(`/public_note.php?token=${token}`)).text()).toContain('texte public');
        expect((await api.ok(api.patch(`/notes/${id}/share`, { indexable: 1, access_mode: 'edit' }))).json).toMatchObject({ indexable: 1, accessMode: 'edit' });
        expect((await api.ok(api.get(`/notes/${id}/share`))).json).toMatchObject({ public: true, indexable: 1, accessMode: 'edit' });
        expect((await api.ok(api.get('/shared'))).json.shared_notes.map((n) => n.note_id)).toContain(id);
        expect((await api.ok(api.del(`/notes/${id}/share`))).json.revoked).toBe(true);
        expect((await anonymous.get(`/public_note.php?token=${token}`)).status(), 'a revoked link stops answering').toBe(404);
        expect((await api.ok(api.get('/shared'))).json.shared_notes.map((n) => n.note_id)).not.toContain(id);
    });

    test('public links: tasks and text edited through the token, with the lock', covers('plat.api.public'), async () => {
        const list = await newNote({ heading: 'Tâches publiques', type: 'tasklist', content: '[]' });
        const token = (await api.ok(api.post(`/notes/${list.id}/share`, { access_mode: 'full' }))).json.url.split('/').pop();
        const added = await anonymous.post(`/api/v1/public/tasks?token=${token}`, { data: { text: 'ajoutée au public' } });
        expect(added.status(), await added.text()).toBeLessThan(300);
        const tasks = () => api.get(`/notes/${list.id}/tasks`).then((r) => r.json.tasks);
        expect((await tasks()).map((t) => t.text)).toEqual(['ajoutée au public']);
        const patched = await anonymous.patch(`/api/v1/public/tasks/0?token=${token}`, { data: { completed: true, text: 'cochée' } });
        expect(patched.status(), await patched.text()).toBeLessThan(300);
        expect((await tasks())[0]).toMatchObject({ text: 'cochée', completed: true });
        const removed = await anonymous.delete(`/api/v1/public/tasks/0?token=${token}`);
        expect(removed.status(), await removed.text()).toBeLessThan(300);
        expect(await tasks()).toEqual([]);
        expect((await anonymous.post('/api/v1/public/tasks?token=faux', { data: { text: 'x' } })).status(), 'a wrong token').toBeGreaterThanOrEqual(400);

        const note = await newNote({ heading: 'Texte public', content: '<p>avant</p>' });
        const editable = (await api.ok(api.post(`/notes/${note.id}/share`, { access_mode: 'edit' }))).json.url.split('/').pop();
        const q = `?token=${editable}`;
        const lock = await anonymous.post(`/api/v1/public/notes/lock${q}`, { data: { editor_session_id: 'visiteur' } });
        expect(lock.status(), await lock.text()).toBe(200);
        expect((await api.ok(api.get(`/notes/${note.id}/lock`))).json.lock?.holder_is_public, 'the app sees the public visitor holding it').toBe(true);
        expect((await anonymous.post(`/api/v1/public/notes/lock/heartbeat${q}`, { data: { editor_session_id: 'visiteur' } })).status()).toBe(200);
        const blocked = await anonymous.patch(`/api/v1/public/notes/content${q}`, { data: { content: '<p>intrus</p>', editor_session_id: 'autre' } });
        expect(blocked.status(), 'another visitor must wait').toBe(423);
        const saved = await anonymous.patch(`/api/v1/public/notes/content${q}`, { data: { content: '<p>après</p>', editor_session_id: 'visiteur' } });
        expect(saved.status(), await saved.text()).toBe(200);
        expect((await api.getNote(note.id)).content).toContain('après');
        expect((await anonymous.post(`/api/v1/public/notes/lock/release${q}`, { data: { editor_session_id: 'visiteur' } })).status()).toBe(200);
        expect((await api.ok(api.get(`/notes/${note.id}/lock`))).json.lock).toBeFalsy();
    });

    test('folders: create, list, read, path, rename, counts, suggested', covers('plat.api.folders-crud'), async () => {
        const parent = await newFolder(`Parent é ${Date.now()}`);
        const child = (await api.ok(api.post('/folders', { folder_name: 'Enfant', parent_folder_id: parent.id, workspace: 'Poznote' }))).json.folder;
        expect(child.parent_id).toBe(parent.id);
        await newNote({ folder_id: child.id });
        const listed = (await api.ok(api.get('/folders', { params: { workspace: 'Poznote' } }))).json.folders;
        expect(listed.find((f) => f.id === child.id)?.path).toBe(`${parent.name}/Enfant`);
        expect((await api.ok(api.get(`/folders/${child.id}`))).json.folder).toMatchObject({ name: 'Enfant', parent_id: parent.id });
        expect((await api.ok(api.get(`/folders/${child.id}/path`))).json).toMatchObject({ path: `${parent.name}/Enfant`, depth: 2 });
        expect((await api.ok(api.get(`/folders/${parent.id}/notes`))).json).toMatchObject({ direct_count: 0, subfolder_count: 1 });
        expect((await api.ok(api.get('/folders/counts'))).json.counts[child.id]).toBe(1);
        expect((await api.ok(api.get('/folders/suggested'))).json.folders.map((f) => f.id)).toContain(child.id);
        expect((await api.ok(api.patch(`/folders/${child.id}`, { name: 'Renommé' }))).json.folder.name).toBe('Renommé');
        expect((await api.ok(api.get(`/folders/${child.id}`))).json.folder.name).toBe('Renommé');
    });

    test('folders: move notes in and out, move files, move, reorder, duplicate, empty, tags', covers('plat.api.folders-move'), async () => {
        const a = await newFolder();
        const b = await newFolder();
        const note = await newNote();
        expect((await api.ok(api.post(`/notes/${note.id}/folder`, { folder_id: a.id }))).json.new_folder_id).toBe(a.id);
        expect((await api.getNote(note.id)).folder_id).toBe(a.id);
        expect((await api.ok(api.post(`/folders/${a.id}/tags`, { tags: ['étiquette'] }))).json.updated_count).toBe(1);
        expect((await api.getNote(note.id)).tags).toContain('étiquette');
        const copy = (await api.ok(api.post(`/folders/${a.id}/duplicate`))).json;
        expect(copy).toMatchObject({ source_folder_id: a.id, notes_count: 1 });
        expect((await api.ok(api.post('/folders/move-files', { source_folder_id: a.id, target_folder_id: b.id }))).json.moved_count).toBe(1);
        expect((await api.getNote(note.id)).folder_id).toBe(b.id);
        await api.ok(api.post(`/notes/${note.id}/remove-folder`));
        expect((await api.getNote(note.id)).folder_id).toBeNull();
        expect((await api.ok(api.post('/folders/reorder', { folder_id: b.id, target_folder_id: a.id, position: 'before' }))).json.folder).toMatchObject({ id: b.id, position: 'before' });
        const moved = (await api.ok(api.post(`/folders/${b.id}/move`, { parent_id: a.id }))).json.folder;
        expect(moved).toMatchObject({ parent_id: a.id, path: `${a.name}/${b.name}` });
        await api.ok(api.post(`/notes/${note.id}/folder`, { folder_id: b.id }));
        await api.ok(api.post(`/folders/${b.id}/empty`));
        expect((await api.get(`/notes/${note.id}`)).json.note?.trash ?? 1, 'emptied into the trash').toBeTruthy();
        expect((await api.ok(api.get('/trash'))).json.notes.map((n) => n.id)).toContain(note.id);
    });

    test('folders: icon, colour, pin, offline, favorite are stored', covers('plat.api.folders-attributes'), async () => {
        const folder = await newFolder();
        const url = `/folders/${folder.id}`;
        expect((await api.ok(api.put(`${url}/icon`, { icon: 'lucide-star' }))).json.icon).toBe('lucide-star');
        expect((await api.ok(api.put(`${url}/color`, { color: 'red' }))).json).toMatchObject({ color: 'red', color_hex: '#ef4444' });
        expect((await api.ok(api.put(`${url}/pinned`, { pinned: true }))).json.pinned).toBe(true);
        expect((await api.ok(api.put(`${url}/favorite`, { favorite: true }))).json.favorite).toBe(true);
        expect((await api.ok(api.put(`${url}/offline`, { offline: true }))).json.kept_folders).toContain(folder.id);
        expect((await api.ok(api.get(url))).json.folder).toMatchObject({ icon: 'lucide-star', color: 'red' });
        expect(sqlOne(account.id, `SELECT pinned FROM folders WHERE id = ${folder.id}`)).toBe('1');
    });

    test('folders: delete, restore from the snapshot, archive', covers('plat.api.folders-delete'), async () => {
        const folder = await newFolder();
        const note = await newNote({ folder_id: folder.id });
        const deleted = (await api.ok(api.del(`/folders/${folder.id}`))).json;
        expect(deleted.restore_snapshot.folder_id).toBe(folder.id);
        expect((await api.get(`/folders/${folder.id}`)).status).toBe(404);
        const restored = (await api.ok(api.post('/folders/restore', deleted.restore_snapshot))).json;
        expect(restored.success, JSON.stringify(restored)).toBe(true);
        const names = (await api.ok(api.get('/folders'))).json.folders.map((f) => f.name);
        expect(names).toContain(folder.name);
        expect((await api.getNote(note.id)).folder).toBe(folder.name);

        const archived = await newFolder();
        const inside = await newNote({ folder_id: archived.id });
        const result = (await api.ok(api.post(`/folders/${archived.id}/archive`))).json;
        expect(result).toMatchObject({ workspace: 'Archives', folder_path: archived.name });
        expect((await api.getNote(inside.id)).workspace).toBe('Archives');
        const single = await newNote();
        expect((await api.ok(api.post(`/notes/${single.id}/archive`))).json.workspace).toBe('Archives');
        expect((await api.getNote(single.id)).workspace).toBe('Archives');
    });

    test('folder share: create, read, update, public page, revoke', covers('plat.api.folder-share'), async () => {
        const folder = await newFolder(`Publié ${Date.now()}`);
        const note = await newNote({ heading: 'Dans le dossier publié', folder_id: folder.id });
        const url = `/folders/${folder.id}/share`;
        expect((await api.ok(api.get(url))).json.public).toBe(false);
        const created = await api.ok(api.post(url, {}));
        expect(created.status).toBe(201);
        const token = created.json.url.split('/').pop();
        expect(await (await anonymous.get(`/public_folder.php?token=${token}`)).text()).toContain(note.heading);
        expect((await api.ok(api.patch(url, { indexable: 1 }))).json.indexable).toBe(1);
        expect((await api.ok(api.get(url))).json).toMatchObject({ public: true, indexable: 1 });
        expect((await api.ok(api.get('/shared'))).json.shared_folders.map((f) => f.folder_id)).toContain(folder.id);
        expect((await api.ok(api.del(url))).json.revoked).toBe(true);
        expect((await anonymous.get(`/public_folder.php?token=${token}`)).status()).toBe(404);
    });

    test('workspaces: create, list, rename, delete', covers('plat.api.workspaces'), async () => {
        const name = `Espace é ${Date.now()}`;
        expect((await api.ok(api.post('/workspaces', { name }))).json.name).toBe(name);
        expect((await api.post('/workspaces', { name })).status, 'a duplicate name').toBeGreaterThanOrEqual(400);
        const names = async () => (await api.ok(api.get('/workspaces'))).json.workspaces.map((w) => w.name);
        expect(await names()).toContain(name);
        const renamed = `${name} bis`;
        expect((await api.ok(api.patch(`/workspaces/${encodeURIComponent(name)}`, { new_name: renamed }))).json).toMatchObject({ old_name: name, new_name: renamed });
        expect(await names()).toContain(renamed);
        await api.ok(api.del(`/workspaces/${encodeURIComponent(renamed)}`));
        expect(await names()).not.toContain(renamed);
    });

    test('tags: list, rename across notes, delete', covers('plat.api.tags'), async () => {
        const tag = `balise${Date.now()}`;
        const note = await newNote({ tags: `${tag},autre${tag}` });
        expect((await api.ok(api.get('/tags'))).json.tags).toEqual(expect.arrayContaining([tag, `autre${tag}`]));
        expect((await api.ok(api.patch(`/tags/${tag}`, { new_name: `${tag}neuf` }))).json.updated).toBe(1);
        expect((await api.getNote(note.id)).tags).toContain(`${tag}neuf`);
        expect((await api.ok(api.del(`/tags/${tag}neuf`))).json.updated).toBe(1);
        expect((await api.getNote(note.id)).tags).toBe(`autre${tag}`);
        expect((await api.ok(api.get('/tags'))).json.tags).not.toContain(`${tag}neuf`);
    });

    test('attachments: upload, list, download exact bytes, move, delete', covers('plat.api.attachments'), async () => {
        const source = await newNote();
        const target = await newNote();
        const up = await api.ok(api.call('POST', `/notes/${source.id}/attachments`, { multipart: multipartFile('image é.png', PNG, 'image/png') }));
        expect(up.json.filename).toBe('image é.png');
        const attachment = (await api.ok(api.get(`/notes/${source.id}/attachments`))).json.attachments[0];
        expect(attachment).toMatchObject({ id: up.json.attachment_id, original_filename: 'image é.png', file_size: PNG.length });
        const download = await api.ok(api.get(`/notes/${source.id}/attachments/${attachment.id}`));
        expect(download.body.equals(PNG), 'the same bytes come back').toBe(true);
        const moved = (await api.ok(api.post(`/notes/${source.id}/attachments/${attachment.id}/move`, { target_note_id: target.id }))).json;
        expect(moved).toMatchObject({ source_note_id: source.id, target_note_id: target.id });
        expect((await api.ok(api.get(`/notes/${source.id}/attachments`))).json.attachments).toEqual([]);
        expect((await api.ok(api.del(`/notes/${target.id}/attachments/${moved.attachment_id}`))).json.success).toBe(true);
        expect((await api.ok(api.get(`/notes/${target.id}/attachments`))).json.attachments).toEqual([]);
    });

    test('settings: read one, read several, write and read back', covers('plat.api.settings'), async () => {
        expect((await api.ok(api.put('/settings/language', { value: 'fr' }))).json).toMatchObject({ key: 'language', value: 'fr' });
        expect((await api.ok(api.get('/settings/language'))).json.value).toBe('fr');
        const many = (await api.ok(api.get('/settings', { params: { keys: 'language,timezone' } }))).json.settings;
        expect(many.language).toBe('fr');
        expect(Object.keys(many).sort()).toEqual(['language', 'timezone']);
        await api.ok(api.put('/settings/language', { value: 'en' }));
    });

    test('backups: create, list, download, upload, restore, delete', covers('plat.api.backups'), async ({ playwright }) => {
        const own = await newAccount(playwright, 'backup');
        const backups = await Api.open(playwright, own);
        const note = await backups.createNote({ heading: 'Sauvegardée', content: '<p>à retrouver</p>' });
        const created = (await backups.ok(backups.post('/backups'))).json;
        expect(created.backup_file).toMatch(/^poznote_backup_.*\.zip$/);
        expect((await backups.ok(backups.get('/backups'))).json.backups.map((b) => b.filename)).toContain(created.backup_file);
        const file = await backups.ok(backups.get(`/backups/${created.backup_file}`));
        const entries = readZip(file.body);
        expect(Object.keys(entries).some((name) => name.endsWith('.db') || name.includes('database')), Object.keys(entries).join()).toBe(true);
        await backups.ok(backups.del(`/notes/${note.id}?permanent=true`));
        expect((await backups.get(`/notes/${note.id}`)).status).toBe(404);
        const restored = (await backups.ok(backups.post(`/backups/${created.backup_file}/restore`))).json;
        expect(restored.success).toBe(true);
        expect((await backups.getNote(note.id)).content).toContain('à retrouver');
        await backups.ok(backups.del(`/backups/${created.backup_file}`));
        expect((await backups.ok(backups.get('/backups'))).json.backups).toEqual([]);
        const uploaded = (await backups.ok(backups.call('POST', '/backups/upload', { multipart: multipartFile(created.backup_file, file.body, 'application/zip') }))).json;
        expect(uploaded.success, JSON.stringify(uploaded)).toBe(true);
        expect((await backups.ok(backups.get('/backups'))).json.backups.length).toBe(1);
        await backups.dispose();
    });

    test('system: version, updates, what is new and seen, translations', covers('plat.api.system'), async () => {
        const version = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'version.txt'), 'utf8').trim();
        expect((await api.ok(api.get('/system/version'))).json.current_version).toBe(version);
        expect((await api.ok(api.get('/system/updates'))).json.current_version).toBe(version);
        const news = (await api.ok(api.get('/system/whats-new'))).json;
        expect(news).toMatchObject({ success: true, current_version: version });
        expect(Array.isArray(news.releases)).toBe(true);
        expect((await api.ok(api.post('/system/whats-new/seen', {}))).json.seen_version).toBe(version);
        const french = (await api.ok(api.get('/system/i18n', { params: { lang: 'fr' } }))).json;
        expect(french.lang).toBe('fr');
        expect(french.strings.welcome_note.title).toContain('Bienvenue');
    });

    test('git sync routes, the /github-sync aliases and the progress report', covers('plat.api.git-sync'), async ({ playwright }) => {
        const before = getGlobal('git_sync_enabled');
        const own = await newAccount(playwright, 'gitsync');
        const normal = await Api.open(playwright, own);
        const config = { token: 'mock-token', repo: 'mock/repo', branch: 'main', provider: 'forgejo', api_base: `${MOCK}/git`, author_name: 'E2E', author_email: 'e2e@example.com' };
        setGlobal('git_sync_enabled', '');
        try {
            expect((await admin.post('/git-sync/test')).status, 'disabled instance').toBe(403);
            setGlobal('git_sync_enabled', '1');
            // An account other than the admin may not point the server at a local address
            await normal.ok(normal.put('/git-sync/config', config));
            const refused = await normal.ok(normal.post('/git-sync/test'));
            expect(refused.json, refused.text).toMatchObject({ success: false, error: expect.stringContaining('public internet host') });
            await admin.ok(admin.put('/git-sync/config', config));
            for (const prefix of ['/git-sync', '/github-sync']) {
                expect((await admin.ok(admin.get(`${prefix}/status`))).json.config.repo).toBe('mock/repo');
                const probe = await admin.ok(admin.post(`${prefix}/test`));
                expect(probe.json.success, probe.text).toBe(true);
                await admin.createNote({ heading: `Vers ${prefix}`, content: '<p>poussée</p>' });
                const pushed = await admin.ok(admin.post(`${prefix}/push`, { workspace: 'Poznote' }));
                expect(pushed.json.success, pushed.text).toBe(true);
                const pulled = await admin.ok(admin.post(`${prefix}/pull`, { workspace: 'Poznote' }));
                expect(pulled.json.success, pulled.text).toBe(true);
            }
            expect(inInstance('cat /tmp/poznote-e2e-mock/git.log'), 'the forge received the push').toMatch(/(POST|PUT) .*contents/);
            expect((await admin.ok(admin.get('/git-sync/progress'))).json.success).toBe(true);
        } finally {
            setGlobal('git_sync_enabled', before);
            await normal.dispose();
        }
    });

    test('me: profile read, profile update, the email stays with the admin, password status', covers('plat.api.me'), async () => {
        expect((await api.ok(api.get('/users/me'))).json).toMatchObject({ id: account.id, username: account.username, is_admin: false, active: true });
        await api.ok(api.patch('/users/me', { first_name: 'Éloïse', last_name: 'Martin' }));
        expect((await api.ok(api.get('/users/me'))).json).toMatchObject({ first_name: 'Éloïse', last_name: 'Martin', display_name: 'Éloïse Martin' });
        expect((await api.patch('/users/me', { email: 'a@b.fr' })).status).toBe(403);
        expect((await api.ok(api.get('/users/me/password-status'))).json).toMatchObject({ has_custom_password: true, password_login_available: true });
        expect((await api.ok(api.get('/users/profiles'))).json.map((p) => p.username)).toContain(account.username);
    });

    test('web push: subscribe, count, refuse an unknown service, unsubscribe', covers('plat.api.push'), async () => {
        expect((await api.ok(api.get('/users/me/push'))).json).toMatchObject({ available: true, public_key: expect.any(String), subscriptions: 0 });
        // A real point of the P-256 curve, the server refuses any other
        const p256dh = crypto.createECDH('prime256v1').generateKeys().toString('base64url');
        const auth = Buffer.alloc(16, 9).toString('base64url');
        expect((await api.post('/users/me/push/subscriptions', { endpoint: 'https://push.example.com/x', keys: { p256dh, auth } })).status).toBe(400);
        const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e';
        await api.ok(api.post('/users/me/push/subscriptions', { endpoint, keys: { p256dh, auth } }));
        expect((await api.ok(api.get('/users/me/push'))).json.subscriptions).toBe(1);
        expect((await api.ok(api.del('/users/me/push/subscriptions', { json: { endpoint } }))).json.deleted).toBe(true);
        expect((await api.ok(api.get('/users/me/push'))).json.subscriptions).toBe(0);
    });

    test('two-factor routes: status, setup, enable, new codes, disable, admin reset', covers('plat.api.two-factor'), async ({ page, playwright }) => {
        // The setup in progress lives in the session, so this runs from a signed-in browser
        const own = await newAccount(playwright, 'tworoutes');
        await login(page, own);
        const call = async (method, url, data) => {
            const response = await page.request.fetch(`/api/v1/users/me/two-factor${url}`, { method, data });
            return { status: response.status(), json: await response.json() };
        };
        expect((await call('GET', '')).json.enabled).toBe(false);
        expect((await call('POST', '/setup', { current_password: 'mauvais' })).status).toBe(403);
        const setup = (await call('POST', '/setup', { current_password: own.password })).json;
        expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
        expect(setup.otpauth_uri).toContain(setup.secret);
        expect((await call('POST', '/enable', { code: '000000' })).status, 'a wrong code').toBe(400);
        expect((await call('GET', '')).json.enabled).toBe(false);
        const enabled = (await call('POST', '/enable', { code: totp(setup.secret) })).json;
        expect(enabled.recovery_codes.length, JSON.stringify(enabled)).toBeGreaterThan(0);
        expect((await call('GET', '')).json).toMatchObject({ enabled: true, recovery_codes_remaining: enabled.recovery_codes.length });
        expect((await call('POST', '/recovery-codes', { code: '000000' })).status).toBe(400);
        const renewed = await call('POST', '/recovery-codes', { code: totp(setup.secret, 1) });
        expect(renewed.json.recovery_codes?.length, JSON.stringify(renewed)).toBe(enabled.recovery_codes.length);
        expect(renewed.json.recovery_codes).not.toContain(enabled.recovery_codes[1]);
        expect((await call('POST', '/disable', { current_password: 'mauvais', code: renewed.json.recovery_codes[0] })).status).toBe(403);
        expect((await call('POST', '/disable', { current_password: own.password, code: renewed.json.recovery_codes[0] })).status).toBe(200);
        expect((await call('GET', '')).json.enabled).toBe(false);

        const again = (await call('POST', '/setup', { current_password: own.password })).json;
        expect((await call('POST', '/enable', { code: totp(again.secret) })).status).toBe(200);
        expect((await admin.ok(admin.get(`/admin/users/${own.id}/password-status`))).json.two_factor_enabled).toBe(true);
        await admin.ok(admin.post(`/admin/users/${own.id}/two-factor/reset`));
        expect((await admin.ok(admin.get(`/admin/users/${own.id}/password-status`))).json.two_factor_enabled).toBe(false);
        expect((await admin.post(`/admin/users/${own.id}/two-factor/reset`)).status, 'nothing left to reset').toBe(409);
    });

    test('app passwords routes: create, list, use, read-only limits, revoke', covers('plat.api.app-passwords'), async ({ playwright }) => {
        const own = await newAccount(playwright, 'approutes');
        const me = await Api.open(playwright, own);
        const created = (await me.ok(me.post('/users/me/app-passwords', { label: 'Client é' }))).json;
        expect(created.secret).toBeTruthy();
        const list = (await me.ok(me.get('/users/me/app-passwords'))).json;
        expect(list).toMatchObject({ count: 1, active_count: 1 });
        expect(list.app_passwords[0]).toMatchObject({ label: 'Client é' });
        expect(JSON.stringify(list), 'the secret is shown once').not.toContain(created.secret);
        const scoped = await Api.open(playwright, { ...own, password: created.secret });
        await scoped.ok(scoped.get('/notes'));
        expect((await scoped.get('/users/me/app-passwords')).status, 'an app password cannot manage app passwords').toBe(403);
        await me.ok(me.del(`/users/me/app-passwords/${created.app_password.id}`));
        expect((await scoped.get('/notes')).status).toBe(401);
        await scoped.dispose(); await me.dispose();
    });

    test('admin: users listed, read, looked up, updated, refused to a normal account', covers('plat.api.admin-users'), async ({ playwright }) => {
        const name = `adminrest-${process.pid}-${Date.now()}`;
        const created = await admin.ok(admin.post('/admin/users', { username: name }));
        expect(created.status).toBe(201);
        const id = created.json.id;
        const listed = (await admin.ok(admin.get('/admin/users', { params: { q: name } }))).json;
        expect(JSON.stringify(listed)).toContain(name);
        expect((await admin.ok(admin.get(`/admin/users/${id}`))).json).toMatchObject({ id, username: name, active: 1 });
        expect((await admin.ok(admin.get(`/users/lookup/${name}`))).json).toMatchObject({ id, username: name });
        expect((await admin.get('/users/lookup/personne-du-tout')).status).toBe(404);
        await admin.ok(admin.patch(`/admin/users/${id}`, { first_name: 'Zoé', active: false }));
        expect((await admin.ok(admin.get(`/admin/users/${id}`))).json).toMatchObject({ first_name: 'Zoé', active: 0 });
        expect((await admin.ok(admin.get(`/admin/users/${id}/password-status`))).json.user_id).toBe(id);
        await admin.ok(admin.post(`/admin/users/${id}/reset-password`, { action: 'set_password', new_password: 'Mot-de-passe-2026-z' }));
        expect((await admin.ok(admin.get(`/admin/users/${id}/password-status`))).json.has_custom_password).toBe(true);
        await admin.ok(admin.del(`/admin/users/${id}`));
        expect((await admin.get(`/admin/users/${id}`)).status).toBe(404);
        for (const [method, url] of [['GET', '/admin/users'], ['GET', `/admin/users/${account.id}`], ['POST', '/admin/users'], ['GET', '/admin/stats'], ['POST', '/admin/repair'], ['GET', '/admin/statistics'], ['GET', '/users/lookup/admin_change_me']]) {
            const refused = await api.call(method, url);
            expect([401, 403], `${method} ${url} answered ${refused.status} to a normal account`).toContain(refused.status);
        }
    });

    test('admin: statistics, token, public switch, stats, repair, orphans', covers('plat.api.admin-tools'), async () => {
        const stats = (await admin.ok(admin.get('/admin/stats'))).json;
        expect(JSON.stringify(stats)).toMatch(/total|users/);
        const statistics = (await admin.ok(admin.get('/admin/statistics'))).json;
        expect(statistics.users.total).toBeGreaterThan(0);
        expect(statistics.notes).toEqual(expect.objectContaining({ total: expect.any(Number), trash: expect.any(Number) }));
        expect(statistics.storage.total_bytes).toBeGreaterThan(0);
        const publicStats = (token) => anonymous.get('/api/v1/public/statistics', token ? { headers: { Authorization: `Bearer ${token}` } } : {});
        try {
            const token = (await admin.ok(admin.post('/admin/statistics/token'))).json;
            expect(token.token).toMatch(/^pzs_/);
            expect((await admin.ok(admin.get('/admin/statistics/token'))).json).toMatchObject({ enabled: true, hint: token.hint });
            expect((await publicStats(token.token)).status(), 'the token opens the statistics').toBe(200);
            expect((await publicStats()).status(), 'not without the token').toBe(401);
            expect((await admin.ok(admin.put('/admin/statistics/public', { enabled: true }))).json.public).toBe(true);
            expect((await publicStats()).status(), 'public switch on').toBe(200);
            expect((await admin.put('/admin/statistics/public', { enabled: 'oui' })).status).toBe(400);
            expect((await admin.ok(admin.put('/admin/statistics/public', { enabled: false }))).json.public).toBe(false);
        } finally {
            await admin.ok(admin.put('/admin/statistics/public', { enabled: false }));
            expect((await admin.ok(admin.del('/admin/statistics/token'))).json.enabled).toBe(false);
        }
        expect((await publicStats()).status(), 'revoked').toBeGreaterThanOrEqual(401);
        expect((await admin.ok(admin.post('/admin/repair'))).json.stats.users_scanned).toBeGreaterThan(0);
    });

    test('admin: orphan attachments are found, then deleted', covers('plat.api.admin-orphans'), async () => {
        await newNote();
        const dir = `/var/www/html/data/users/${account.id}/attachments`;
        inInstance(`mkdir -p ${dir} && echo orphelin > ${dir}/orphelin-e2e.txt && chown -R www-data:www-data ${dir}`);
        const found = (await admin.ok(admin.get('/admin/orphan-attachments'))).json.users.find((u) => u.user_id === account.id);
        expect(JSON.stringify(found.files), JSON.stringify(found)).toContain('orphelin-e2e.txt');
        expect(found.orphans_deleted).toBe(0);
        expect(inInstance(`ls ${dir}`), 'a scan deletes nothing').toContain('orphelin-e2e.txt');
        const removed = (await admin.ok(admin.del('/admin/orphan-attachments'))).json.users.find((u) => u.user_id === account.id);
        expect(removed.orphans_deleted).toBe(1);
        expect(inInstance(`ls ${dir}`)).not.toContain('orphelin-e2e.txt');
    });

    test('mentions: a note naming a member of a shared workspace, handled and asked again', covers('plat.api.mentions'), async ({ playwright, browser }) => {
        const owner = await newAccount(playwright, 'mentionowner');
        const member = await newAccount(playwright, 'mentionmember');
        const ownerApi = await Api.open(playwright, owner);
        const memberApi = await Api.open(playwright, member);
        const context = await browser.newContext({ baseURL: BASE_URL });
        const page = await context.newPage();
        await login(page, owner);
        const shared = await page.request.post('/workspaces.php', { form: { action: 'share_workspace', name: 'Poznote', allowed_users: JSON.stringify([member.id]) } });
        expect(shared.status(), await shared.text()).toBeLessThan(400);
        await context.close();
        const members = (await ownerApi.ok(ownerApi.get('/mentions/members', { params: { workspace: 'Poznote' } }))).json.members;
        expect(JSON.stringify(members)).toContain(member.username);
        const note = await ownerApi.createNote({ heading: 'Note avec mention', content: `<p>Regarde @${member.username} ici</p>` });
        const mentions = (await memberApi.ok(memberApi.get('/mentions'))).json;
        expect(mentions.open).toBe(1);
        expect(mentions.mentions[0]).toMatchObject({ note_id: note.id, handled: false });
        await memberApi.ok(memberApi.post(`/mentions/${owner.id}/${note.id}/handled`));
        expect((await memberApi.ok(memberApi.get('/mentions'))).json.open).toBe(0);
        expect((await memberApi.ok(memberApi.get('/mentions', { params: { include_handled: '1' } }))).json.mentions[0].handled).toBe(true);
        await memberApi.ok(memberApi.del(`/mentions/${owner.id}/${note.id}/handled`));
        expect((await memberApi.ok(memberApi.get('/mentions'))).json.open).toBe(1);
        const sharedWithMe = (await memberApi.ok(memberApi.get('/shared/with-me'))).json;
        expect(sharedWithMe.shared_workspaces).toEqual([expect.objectContaining({ workspace: 'Poznote', owner_id: owner.id })]);
        await ownerApi.dispose(); await memberApi.dispose();
    });

    test('the API refuses bad credentials, a missing profile and unknown routes', covers('plat.api.auth'), async ({ playwright }) => {
        expect((await anonymous.get('/api/v1/notes')).status()).toBe(401);
        const wrong = await Api.open(playwright, { ...account, password: 'mauvais' });
        expect((await wrong.get('/notes')).status).toBe(401);
        await wrong.dispose();
        const basic = `Basic ${Buffer.from(`${account.username}:${account.password}`).toString('base64')}`;
        expect((await anonymous.get('/api/v1/notes', { headers: { Authorization: basic } })).status(), 'X-User-ID is required').toBe(400);
        expect((await anonymous.get('/api/v1/users/me', { headers: { Authorization: basic } })).status(), 'not for own-account routes').toBe(200);
        expect((await api.get('/route/inconnue')).status).toBe(404);
    });

    test('the API docs page and its OpenAPI file document the routes', covers('plat.api.docs'), async ({ page }) => {
        await login(page, ADMIN);
        await page.goto('/api-docs/index.php');
        await expect(page.locator('.swagger-ui h2.title')).toContainText('Poznote REST API');
        await expect(page.locator('.opblock-summary-path', { hasText: /^\/notes\/resolve$/ }).first()).toBeVisible();
        await page.locator('.opblock-summary-control', { hasText: '/system/version' }).first().click();
        await expect(page.locator('.opblock.is-open .opblock-description-wrapper, .opblock.is-open .responses-wrapper').first()).toBeVisible();
    });

    test('the API card of the settings opens its dialog, which leads to the docs', covers('plat.api.docs'), async ({ page }) => {
        await login(page, ADMIN);
        await page.goto('/settings.php#section=settings-documentation-section-grid');
        await page.click('#api-rest-card');
        await expect(page.locator('#apiRestModal')).toBeVisible();
        await page.click('#closeApiRestModalBtn');
        await expect(page.locator('#apiRestModal')).toBeHidden();
        await page.click('#api-rest-card');
        await page.click('#openSwaggerApiBtn');
        await expect(page).toHaveURL(/api-docs/);
        await expect(page.locator('.swagger-ui h2.title')).toContainText('Poznote REST API');
    });

    test('the OpenAPI file documents no route that does not exist', covers('plat.api.docs'), () => {
        test.fail(true, 'BUG: openapi.yaml documents POST /folders/kanban-structure, which has no route (404)');
        const { inventory } = require('../lib/inventory');
        const yaml = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'public', 'api-docs', 'openapi.yaml'), 'utf8');
        const documented = [];
        let current = '';
        for (const line of yaml.split('\n')) {
            const pathLine = /^ {2}(\/[^:]*):\s*$/.exec(line);
            if (pathLine) current = pathLine[1];
            const method = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
            if (method && current) documented.push(`${method[1].toUpperCase()} ${current}`);
        }
        expect(documented.length).toBeGreaterThan(100);
        const routes = new Set(inventory().route);
        // Scripts next to the API, and a route answered before the router
        const missing = documented.filter((route) => !routes.has(route) && !route.includes('.php') && route !== 'GET /public/statistics');
        expect(missing).toEqual([]);
    });
});

// ================================================================================
// MCP server: real streamable HTTP, every tool, its effect checked through the API
// ================================================================================
test.describe('MCP server', () => {
    let account;
    let api;
    let admin;
    let mcpContext;
    let rpcId = 0;

    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mcp');
        api = await Api.open(playwright, account);
        admin = await Api.open(playwright, ADMIN);
        mcpContext = await playwright.request.newContext({ extraHTTPHeaders: { Accept: 'application/json, text/event-stream' } });
    });
    test.afterAll(async () => { await api.dispose(); await admin.dispose(); await mcpContext.dispose(); });

    /** One JSON-RPC exchange: the answer comes as an event stream. */
    async function rpc(method, params = {}) {
        const response = await mcpContext.post(MCP_URL, { data: { jsonrpc: '2.0', id: ++rpcId, method, params }, timeout: 60_000 });
        expect(response.status(), await response.text()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/event-stream');
        const data = (await response.text()).split('\n').find((line) => line.startsWith('data: '));
        const answer = JSON.parse(data.slice(6));
        expect(answer.error, JSON.stringify(answer.error)).toBeUndefined();
        return answer.result;
    }
    /** Calls a tool as the account of this describe, unless user_id is given as null. */
    async function tool(name, args = {}) {
        const merged = args.user_id === null ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'user_id')) : { user_id: account.id, ...args };
        const result = await rpc('tools/call', { name, arguments: merged });
        expect(result.isError, JSON.stringify(result)).toBeFalsy();
        const text = result.content[0].text;
        const json = JSON.parse(text);
        return json;
    }
    const newNote = async (fields = {}) => api.createNote({ heading: `Note MCP ${Date.now()}-${Math.random()}`, content: '<p>corps</p>', ...fields });
    const newList = async () => {
        const list = await api.createNote({ heading: `Liste MCP ${Date.now()}`, type: 'tasklist', content: '[]' });
        const task = (await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'tâche de départ' }))).json.task;
        return { noteId: list.id, taskId: String(task.id) };
    };
    const newFolder = async (name = `Dossier MCP ${Date.now()}-${Math.random()}`, workspace = 'Poznote') => (await api.ok(api.post('/folders', { folder_name: name, workspace }))).json.folder;
    const fired = async () => (await api.ok(api.get('/reminders'))).json;

    test('the protocol: initialize answers the server info', covers('plat.mcp.protocol'), async () => {
        const result = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
        expect(result.serverInfo.name).toMatch(/poznote/i);
        expect(result.capabilities.tools).toBeTruthy();
    });

    test('tools/list is the expected list, with a schema and a description for each', covers('plat.mcp.list'), async () => {
        const { inventory } = require('../lib/inventory');
        const { tools } = await rpc('tools/list');
        expect(tools.map((entry) => entry.name).sort()).toEqual(inventory().mcp);
        for (const entry of tools) {
            expect(entry.description, entry.name).toBeTruthy();
            expect(entry.inputSchema.type, entry.name).toBe('object');
        }
    });

    test('an unknown tool and a bad argument are errors, not crashes', covers('plat.mcp.errors'), async () => {
        const unknown = await rpc('tools/call', { name: 'outil_inconnu', arguments: {} });
        expect(unknown.isError).toBe(true);
        const bad = await rpc('tools/call', { name: 'get_note', arguments: { id: 'pas-un-nombre' } });
        expect(bad.isError).toBe(true);
        const missing = await tool('get_note', { id: 99999999 });
        expect(JSON.stringify(missing)).toMatch(/404|not found/i);
    });

    const TOOLS = {
        async get_note() {
            const note = await newNote({ heading: 'Lue par MCP é', tags: 'a,b' });
            expect(await tool('get_note', { id: note.id })).toMatchObject({ id: note.id, title: 'Lue par MCP é', content: '<p>corps</p>', tags: ['a', 'b'], version: expect.any(String) });
        },
        async list_notes() {
            const folder = await newFolder();
            const note = await newNote({ heading: 'Listée par MCP', folder_id: folder.id });
            const listed = await tool('list_notes', { folder_id: folder.id });
            expect(listed).toMatchObject({ count: 1, has_more: false });
            expect(listed.notes[0]).toMatchObject({ id: note.id, title: 'Listée par MCP' });
            const paged = await tool('list_notes', { limit: 1 });
            expect(paged.limit).toBe(1);
            expect(paged.notes.length).toBe(1);
        },
        async search_notes() {
            const word = `cherche${Date.now()}`;
            const note = await newNote({ content: `<p>${word}</p>` });
            const found = await tool('search_notes', { query: word });
            expect(found.count).toBe(1);
            expect(found.results[0].id).toBe(note.id);
            expect((await tool('search_notes', { query: `absent${word}` })).count).toBe(0);
        },
        async list_templates() {
            const folder = await newFolder('Templates');
            const template = await newNote({ heading: 'Modèle MCP', folder_id: folder.id });
            expect((await tool('list_templates')).templates.map((t) => t.id)).toContain(template.id);
        },
        async create_note() {
            const created = await tool('create_note', { title: 'Créée par MCP é', content: '<p>texte</p>', tags: 'x,y', workspace: 'Poznote' });
            expect(created.success).toBe(true);
            const stored = await api.getNote(created.note.id);
            expect(stored).toMatchObject({ heading: 'Créée par MCP é', tags: 'x, y', workspace: 'Poznote' });
            expect(stored.content).toContain('texte');
        },
        async update_note() {
            const note = await newNote();
            const updated = await tool('update_note', { id: note.id, title: 'Modifiée par MCP', content: '<p>neuf</p>', tags: 'mcp' });
            expect(updated.success).toBe(true);
            const stored = await api.getNote(note.id);
            expect(stored).toMatchObject({ heading: 'Modifiée par MCP', tags: 'mcp' });
            expect(stored.content).toContain('neuf');
            const stale = await tool('update_note', { id: note.id, content: '<p>perdu</p>', if_version: 'ffffffffffffffffffffffffffffffff' });
            expect(JSON.stringify(stale), 'a stale if_version').toMatch(/409|version|changed/i);
            expect((await api.getNote(note.id)).content).toContain('neuf');
        },
        async delete_note() {
            const note = await newNote();
            expect((await tool('delete_note', { id: note.id })).success).toBe(true);
            expect((await api.ok(api.get('/trash'))).json.notes.map((n) => n.id)).toContain(note.id);
        },
        async list_reminders() {
            const note = await newNote({ heading: 'Rappel échu MCP' });
            await api.ok(api.post(`/notes/${note.id}/reminder`, { reminder_at: PAST, message: 'échu mcp' }));
            const listed = await tool('list_reminders');
            expect(listed.notifications.map((n) => n.message)).toContain('échu mcp');
            expect(listed.unread_count).toBeGreaterThanOrEqual(1);
        },
        async get_reminder() {
            const note = await newNote();
            await api.ok(api.post(`/notes/${note.id}/reminder`, { reminder_at: FUTURE }));
            expect(await tool('get_reminder', { note_id: note.id })).toMatchObject({ note_id: note.id, reminder_at: FUTURE });
        },
        async set_reminder() {
            const note = await newNote();
            expect((await tool('set_reminder', { note_id: note.id, reminder_at: '2031-03-04T10:00:00Z', message: 'de mcp' })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at).toBe(FUTURE);
        },
        async remove_reminder() {
            const note = await newNote();
            await api.ok(api.post(`/notes/${note.id}/reminder`, { reminder_at: FUTURE }));
            expect((await tool('remove_reminder', { note_id: note.id })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at).toBeNull();
        },
        async list_tasks() {
            const { noteId } = await newList();
            expect((await tool('list_tasks', { note_id: noteId })).tasks.map((t) => t.text)).toEqual(['tâche de départ']);
        },
        async list_all_tasks() {
            const { noteId } = await newList();
            const all = await tool('list_all_tasks');
            expect(all.tasks.find((t) => t.note_id === noteId)?.text).toBe('tâche de départ');
        },
        async add_task() {
            const { noteId } = await newList();
            expect((await tool('add_task', { note_id: noteId, text: 'ajoutée mcp', important: true })).task).toMatchObject({ text: 'ajoutée mcp', important: true });
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks.map((t) => t.text)).toContain('ajoutée mcp');
        },
        async update_task() {
            const { noteId, taskId } = await newList();
            expect((await tool('update_task', { note_id: noteId, task_id: taskId, text: 'renommée', important: true })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks[0]).toMatchObject({ text: 'renommée', important: true });
        },
        async complete_task() {
            const { noteId, taskId } = await newList();
            expect((await tool('complete_task', { note_id: noteId, task_id: taskId })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks[0].completed).toBe(true);
        },
        async delete_task() {
            const { noteId, taskId } = await newList();
            expect((await tool('delete_task', { note_id: noteId, task_id: taskId })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks).toEqual([]);
        },
        async add_subtask() {
            const { noteId, taskId } = await newList();
            expect((await tool('add_subtask', { note_id: noteId, task_id: taskId, text: 'sous mcp' })).subtask.text).toBe('sous mcp');
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks[0].subtasks[0].text).toBe('sous mcp');
        },
        async update_subtask() {
            const { noteId, taskId } = await newList();
            const sub = (await api.ok(api.post(`/notes/${noteId}/tasks/${taskId}/subtasks`, { text: 'avant' }))).json.subtask;
            expect((await tool('update_subtask', { note_id: noteId, task_id: taskId, subtask_id: String(sub.id), text: 'après', completed: true })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks[0].subtasks[0]).toMatchObject({ text: 'après', completed: true });
        },
        async delete_subtask() {
            const { noteId, taskId } = await newList();
            const sub = (await api.ok(api.post(`/notes/${noteId}/tasks/${taskId}/subtasks`, { text: 'à retirer' }))).json.subtask;
            expect((await tool('delete_subtask', { note_id: noteId, task_id: taskId, subtask_id: String(sub.id) })).subtasks).toEqual([]);
            expect((await api.ok(api.get(`/notes/${noteId}/tasks`))).json.tasks[0].subtasks ?? []).toEqual([]);
        },
        async create_folder() {
            const made = await tool('create_folder', { folder_name: 'Créé MCP é', workspace: 'Poznote' });
            expect((await api.ok(api.get(`/folders/${made.folder.id}`))).json.folder.name).toBe('Créé MCP é');
            const deep = await tool('create_folder', { folder_path: `A${Date.now()}/B/C`, workspace: 'Poznote' });
            expect(deep.folder.name).toBe('C');
            expect(deep.folder.created_parents.length).toBe(2);
            expect((await api.ok(api.get(`/folders/${deep.folder.id}/path`))).json.depth).toBe(3);
        },
        async list_folders() {
            const folder = await newFolder();
            const listed = await tool('list_folders', { workspace: 'Poznote' });
            expect(listed.folders.find((f) => f.id === folder.id)?.name).toBe(folder.name);
        },
        async list_workspaces() {
            const name = `Espace MCP ${Date.now()}`;
            await api.ok(api.post('/workspaces', { name }));
            expect((await tool('list_workspaces')).workspaces.map((w) => w.name)).toEqual(expect.arrayContaining(['Poznote', name]));
        },
        async list_tags() {
            const tag = `tagmcp${Date.now()}`;
            await newNote({ tags: tag });
            expect((await tool('list_tags')).tags).toContain(tag);
        },
        async get_trash() {
            const note = await newNote({ heading: 'Pour la corbeille MCP' });
            await api.ok(api.del(`/notes/${note.id}`));
            expect((await tool('get_trash')).notes.map((n) => n.id)).toContain(note.id);
        },
        async empty_trash() {
            const note = await newNote();
            await api.ok(api.del(`/notes/${note.id}`));
            expect((await tool('empty_trash')).success).toBe(true);
            expect((await api.ok(api.get('/trash'))).json.count).toBe(0);
        },
        async delete_trash_note() {
            const note = await newNote();
            await api.ok(api.del(`/notes/${note.id}`));
            expect((await tool('delete_trash_note', { id: note.id })).success).toBe(true);
            expect((await api.ok(api.get('/trash'))).json.notes.map((n) => n.id)).not.toContain(note.id);
            expect((await api.get(`/notes/${note.id}`)).status).toBe(404);
        },
        async restore_note() {
            const note = await newNote();
            await api.ok(api.del(`/notes/${note.id}`));
            expect((await tool('restore_note', { id: note.id })).success).toBe(true);
            expect((await api.ok(api.get('/trash'))).json.notes.map((n) => n.id)).not.toContain(note.id);
        },
        async duplicate_note() {
            test.fail(true, 'BUG: duplicate_note answers success:false although the copy is made, client.py reads data.note but the route answers id and heading');
            const note = await newNote({ heading: 'À dupliquer MCP' });
            const copy = await tool('duplicate_note', { id: note.id });
            expect(copy.success).toBe(true);
            expect((await api.ok(api.get('/notes/search', { params: { q: 'À dupliquer MCP' } }))).json.count).toBe(2);
        },
        async toggle_favorite() {
            const note = await newNote();
            expect((await tool('toggle_favorite', { id: note.id })).success).toBe(true);
            expect((await api.getNote(note.id)).favorite).toBe(1);
            await tool('toggle_favorite', { id: note.id });
            expect((await api.getNote(note.id)).favorite).toBe(0);
        },
        async list_attachments() {
            const note = await newNote();
            const up = await api.ok(api.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('liste.txt', Buffer.from('x'), 'text/plain') }));
            const listed = await tool('list_attachments', { note_id: note.id });
            expect(listed.count).toBe(1);
            expect(listed.attachments[0].id ?? listed.attachments[0].attachment_id).toBe(up.json.attachment_id);
        },
        async add_attachment() {
            const note = await newNote();
            const added = await tool('add_attachment', { note_id: note.id, filename: 'é.png', content_base64: PNG.toString('base64'), mime_type: 'image/png' });
            expect(added).toMatchObject({ success: true, filename: 'é.png', size: PNG.length });
            const download = await api.ok(api.get(`/notes/${note.id}/attachments/${added.attachment_id}`));
            expect(download.body.equals(PNG), 'the same bytes').toBe(true);
        },
        async move_note_to_folder() {
            const note = await newNote();
            const folder = await newFolder();
            expect((await tool('move_note_to_folder', { note_id: note.id, folder_id: folder.id })).success).toBe(true);
            expect((await api.getNote(note.id)).folder_id).toBe(folder.id);
        },
        async remove_note_from_folder() {
            const folder = await newFolder();
            const note = await newNote({ folder_id: folder.id });
            expect((await tool('remove_note_from_folder', { note_id: note.id })).success).toBe(true);
            expect((await api.getNote(note.id)).folder_id).toBeNull();
        },
        async move_note() {
            const workspace = `Cible MCP ${Date.now()}`;
            await api.ok(api.post('/workspaces', { name: workspace }));
            const note = await newNote();
            expect((await tool('move_note', { note_id: note.id, target_workspace: workspace })).success).toBe(true);
            expect((await api.getNote(note.id)).workspace).toBe(workspace);
        },
        async move_folder() {
            const parent = await newFolder();
            const folder = await newFolder();
            expect((await tool('move_folder', { folder_id: folder.id, new_parent_folder_id: parent.id })).folder.parent_id).toBe(parent.id);
            expect((await api.ok(api.get(`/folders/${folder.id}`))).json.folder.parent_id).toBe(parent.id);
        },
        async share_note() {
            const note = await newNote();
            const shared = await tool('share_note', { note_id: note.id });
            expect(shared.share.public).toBe(true);
            expect((await api.ok(api.get(`/notes/${note.id}/share`))).json.public).toBe(true);
        },
        async unshare_note() {
            const note = await newNote();
            await api.ok(api.post(`/notes/${note.id}/share`, {}));
            expect((await tool('unshare_note', { note_id: note.id })).success).toBe(true);
            expect((await api.ok(api.get(`/notes/${note.id}/share`))).json.public).toBe(false);
        },
        async get_note_share_status() {
            const note = await newNote();
            await api.ok(api.post(`/notes/${note.id}/share`, {}));
            expect((await tool('get_note_share_status', { note_id: note.id })).share.public).toBe(true);
        },
        async get_folder_share_status() {
            const folder = await newFolder();
            expect((await tool('get_folder_share_status', { folder_id: folder.id })).public).toBe(false);
            await api.ok(api.post(`/folders/${folder.id}/share`, {}));
            expect(JSON.stringify(await tool('get_folder_share_status', { folder_id: folder.id }))).toContain('"public":true');
        },
        async list_shared() {
            const note = await newNote();
            await api.ok(api.post(`/notes/${note.id}/share`, {}));
            expect((await tool('list_shared')).shared_notes.map((n) => n.note_id ?? n.id)).toContain(note.id);
        },
        async list_shared_with_me() {
            expect(await tool('list_shared_with_me')).toMatchObject({ shared_notes_count: 0, shared_folders_count: 0, shared_workspaces_count: 0 });
        },
        async list_snapshots() {
            const note = await newNote();
            const made = (await api.ok(api.post(`/notes/${note.id}/snapshot?manual=1`))).json;
            expect((await tool('list_snapshots', { note_id: note.id })).snapshots.map((s) => s.snapshot_key)).toContain(made.snapshot_key);
        },
        async get_snapshot() {
            const note = await newNote({ content: '<p>instantané</p>' });
            const made = (await api.ok(api.post(`/notes/${note.id}/snapshot?manual=1`))).json;
            expect((await tool('get_snapshot', { note_id: note.id, snapshot_key: made.snapshot_key })).snapshot.content).toContain('instantané');
        },
        async restore_snapshot() {
            const note = await newNote({ content: '<p>ancienne</p>' });
            const made = (await api.ok(api.post(`/notes/${note.id}/snapshot?manual=1`))).json;
            await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>récente</p>' }));
            expect((await tool('restore_snapshot', { note_id: note.id, snapshot_key: made.snapshot_key })).success).toBe(true);
            expect((await api.getNote(note.id)).content).toContain('ancienne');
        },
        async get_git_sync_status() {
            const status = await tool('get_git_sync_status');
            expect(status.success).toBe(true);
            expect(typeof status.enabled).toBe('boolean');
        },
        async get_system_info() {
            const version = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'version.txt'), 'utf8').trim();
            expect((await tool('get_system_info', { user_id: null })).current_version).toBe(version);
        },
        async list_backups() {
            test.fail(true, 'BUG: list_backups counts the keys of the answer (always 3) instead of the backups, server.py:3039');
            const listed = await tool('list_backups', { user_id: null });
            expect(listed.count).toBe(listed.backups.backups.length);
        },
        async create_backup() {
            const made = await tool('create_backup', { user_id: null });
            expect(made.backup_file).toMatch(/^poznote_backup_.*\.zip$/);
            const listed = await tool('list_backups', { user_id: null });
            expect(listed.backups.backups.map((b) => b.filename)).toContain(made.backup_file);
            await tool('delete_backup', { filename: made.backup_file, user_id: null });
        },
        async delete_backup() {
            const made = await tool('create_backup', { user_id: null });
            expect((await tool('delete_backup', { filename: made.backup_file, user_id: null })).success).toBe(true);
            expect((await tool('list_backups', { user_id: null })).backups.backups.map((b) => b.filename)).not.toContain(made.backup_file);
        },
        async restore_backup() {
            const note = await newNote({ heading: 'Avant restauration MCP' });
            const backup = (await api.ok(api.post('/backups'))).json.backup_file;
            await api.ok(api.del(`/notes/${note.id}?permanent=true`));
            const restored = await tool('restore_backup', { filename: backup });
            expect(restored.success, JSON.stringify(restored)).toBe(true);
            expect((await api.getNote(note.id)).heading).toBe('Avant restauration MCP');
            await api.ok(api.del(`/backups/${backup}`));
        },
        async get_app_setting() {
            await api.ok(api.put('/settings/language', { value: 'de' }));
            expect((await tool('get_app_setting', { key: 'language' })).value).toBe('de');
            await api.ok(api.put('/settings/language', { value: 'en' }));
        },
        async update_app_setting() {
            expect((await tool('update_app_setting', { key: 'language', value: 'es' })).success).toBe(true);
            expect((await api.ok(api.get('/settings/language'))).json.value).toBe('es');
            await api.ok(api.put('/settings/language', { value: 'en' }));
        },
        async get_backlinks() {
            const target = await newNote({ heading: `Cible MCP ${Date.now()}` });
            const source = await newNote({ type: 'markdown', content: `[[${target.heading}]]` });
            expect((await tool('get_backlinks', { note_id: target.id })).backlinks.map((b) => b.id)).toContain(source.id);
        },
        async convert_note() {
            const note = await newNote({ content: '<p><strong>gras</strong></p>' });
            expect((await tool('convert_note', { id: note.id, target: 'markdown' })).success).toBe(true);
            const stored = await api.getNote(note.id);
            expect(stored.type).toBe('markdown');
            expect(stored.content).toContain('**gras**');
        },
        async rename_folder() {
            const folder = await newFolder();
            expect((await tool('rename_folder', { folder_id: folder.id, new_name: `${folder.name} bis` })).success).toBe(true);
            expect((await api.ok(api.get(`/folders/${folder.id}`))).json.folder.name).toBe(`${folder.name} bis`);
        },
        async delete_folder() {
            const folder = await newFolder();
            expect((await tool('delete_folder', { folder_id: folder.id })).success).toBe(true);
            expect((await api.get(`/folders/${folder.id}`)).status).toBe(404);
        },
        async create_workspace() {
            const name = `Créé MCP ${Date.now()}`;
            expect((await tool('create_workspace', { name })).success).toBe(true);
            expect((await api.ok(api.get('/workspaces'))).json.workspaces.map((w) => w.name)).toContain(name);
        },
        async rename_workspace() {
            const name = `Avant MCP ${Date.now()}`;
            await api.ok(api.post('/workspaces', { name }));
            expect((await tool('rename_workspace', { current_name: name, new_name: `${name} bis` })).success).toBe(true);
            const names = (await api.ok(api.get('/workspaces'))).json.workspaces.map((w) => w.name);
            expect(names).toContain(`${name} bis`);
            expect(names).not.toContain(name);
        },
        async delete_workspace() {
            const name = `Supprimé MCP ${Date.now()}`;
            await api.ok(api.post('/workspaces', { name }));
            expect((await tool('delete_workspace', { name })).success).toBe(true);
            expect((await api.ok(api.get('/workspaces'))).json.workspaces.map((w) => w.name)).not.toContain(name);
        },
        async git_push() {
            await withGitSync(async () => {
                await tool('create_note', { title: 'Poussée par MCP', content: '<p>git</p>', user_id: 1, workspace: 'Poznote' });
                const pushed = await tool('git_push', { user_id: 1 });
                expect(pushed.success, JSON.stringify(pushed)).toBe(true);
            });
            expect(inInstance('cat /tmp/poznote-e2e-mock/git.log')).toMatch(/(POST|PUT) .*contents/);
        },
        async git_pull() {
            await withGitSync(async () => {
                const pulled = await tool('git_pull', { user_id: 1 });
                expect(pulled.success, JSON.stringify(pulled)).toBe(true);
            });
        },
    };

    async function withGitSync(body) {
        const before = getGlobal('git_sync_enabled');
        setGlobal('git_sync_enabled', '1');
        try {
            await admin.ok(admin.put('/git-sync/config', { token: 'mock-token', repo: 'mock/repo', branch: 'main', provider: 'forgejo', api_base: `${MOCK}/git`, author_name: 'E2E', author_email: 'e2e@example.com' }));
            await body();
        } finally {
            setGlobal('git_sync_enabled', before);
        }
    }

    test('the list of tools tested here is the list of tools of the server', covers('plat.mcp.list'), () => {
        const { inventory } = require('../lib/inventory');
        expect(Object.keys(TOOLS).sort()).toEqual(inventory().mcp);
    });

    for (const [name, body] of Object.entries(TOOLS)) {
        test(`tool ${name}`, covers(`plat.mcp.${name}`), body);
    }

    test('a tool can act for another profile, and stays out of the first one', covers('plat.mcp.profiles'), async ({ playwright }) => {
        const other = await newAccount(playwright, 'mcpautre');
        const otherApi = await Api.open(playwright, other);
        const created = await tool('create_note', { title: 'Pour l autre profil', content: '<p>x</p>', workspace: 'Poznote', user_id: other.id });
        expect((await otherApi.getNote(created.note.id)).heading).toBe('Pour l autre profil');
        const mine = await tool('search_notes', { query: 'Pour l autre profil' });
        expect(mine.count, 'not in the first profile').toBe(0);
        await otherApi.dispose();
    });
});

// ================================================================================
// Sign-in, sign-out, the login page
// ================================================================================
/** Fills the real form, without the shortcut of login(). */
async function signInForm(page, account, { remember = false, url = '/login.php' } = {}) {
    await page.goto(url);
    await page.fill('#username', account.username);
    await page.fill('#password', account.password);
    if (remember) await page.check('#remember_me');
    await page.click('button.login-button');
}
const signedIn = (page) => page.waitForURL((url) => !url.toString().includes('login.php'));
const finishWelcome = (page) => page.evaluate(() => fetch('api/v1/settings/welcome_setup', {
    method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'done' }),
}));

test.describe('sign-in', () => {
    test('a wrong password shows the error and stays on the form, the right one opens the app', covers('plat.login.form'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'signin');
        await signInForm(page, { ...account, password: 'mauvais' });
        await expect(page.locator('.error')).toContainText('Incorrect username or password');
        await expect(page.locator('#username')).toBeVisible();
        expect(page.url()).toContain('login.php');
        expect((await page.request.get('/settings.php', { maxRedirects: 0 })).status(), 'still signed out').toBe(302);
        await signInForm(page, account);
        await signedIn(page);
        expect((await page.request.get('/api/v1/users/me').then((r) => r.json())).username).toBe(account.username);
    });

    test('the password eye shows and hides what is typed', covers('plat.login.eye'), async ({ page }) => {
        await page.goto('/login.php');
        await page.fill('#password', 'secret');
        await expect(page.locator('#password')).toHaveAttribute('type', 'password');
        await page.click('#togglePassword');
        await expect(page.locator('#password')).toHaveAttribute('type', 'text');
        await page.click('#togglePassword');
        await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    });

    test('remember me keeps the session after the session cookie is gone', covers('plat.login.remember'), async ({ page, playwright, context }) => {
        const account = await newAccount(playwright, 'remember');
        await signInForm(page, account);
        await signedIn(page);
        expect((await context.cookies()).map((c) => c.name), 'not asked for').not.toContain('poznote_remember');
        await page.goto('/logout.php');
        await signInForm(page, account, { remember: true });
        await signedIn(page);
        const cookies = await context.cookies();
        const remember = cookies.find((c) => /remember/.test(c.name));
        expect(remember, cookies.map((c) => c.name).join()).toBeTruthy();
        expect(remember.httpOnly).toBe(true);
        expect(remember.expires - Date.now() / 1000, 'lasts for days').toBeGreaterThan(86400);
        await context.clearCookies();
        await context.addCookies([remember]);
        await page.goto('/settings.php');
        await expect(page, 'the cookie alone opens the app').not.toHaveURL(/login\.php/);
        expect((await page.request.get('/api/v1/users/me').then((r) => r.json())).username).toBe(account.username);
    });

    test('a redirect target inside the app is followed, another site or a script is refused', covers('plat.login.redirect'), async ({ page, playwright, context }) => {
        const account = await newAccount(playwright, 'redirect');
        await signInForm(page, account, { url: '/login.php?redirect=settings.php' });
        await page.waitForURL(/settings\.php|welcome\.php/);
        for (const target of ['https://evil.example.com/', '//evil.example.com/', 'javascript:alert(1)', '/\\evil.example.com']) {
            await context.clearCookies();
            await signInForm(page, account, { url: `/login.php?redirect=${encodeURIComponent(target)}` });
            await signedIn(page);
            await settled(page);
            expect(new URL(page.url()).host, `after ${target}`).toBe(new URL(BASE_URL).host);
        }
    });

    test('an anonymous visit to a page goes to the form, and comes back after it', covers('plat.login.return'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'return');
        await login(page, account);
        await page.context().clearCookies();
        forgetSession(account);
        await page.goto('/trash.php');
        await expect(page).toHaveURL(/login\.php/);
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await page.waitForURL(/trash\.php/);
    });

    test('the session-expired notice shows when the app sends someone back', covers('plat.login.expired'), async ({ page }) => {
        await page.goto('/login.php');
        await expect(page.locator('.session-expired-notice')).toHaveCount(0);
        await page.goto('/login.php?expired=1');
        await expect(page.locator('.session-expired-notice')).toContainText('session has ended');
    });

    test('logout asks first: cancel keeps the session, confirm ends it', covers('plat.login.logout'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'logout');
        await login(page, account);
        forgetSession(account);
        await page.goto('/index.php');
        await page.click('#iconSidebarLogoutBtn');
        const dialog = page.locator('#confirmLogoutModal');
        await expect(dialog).toBeVisible();
        await dialog.locator('button', { hasText: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        expect(page.url()).not.toContain('login');
        expect((await page.request.get('/api/v1/users/me')).status()).toBe(200);
        await page.click('#iconSidebarLogoutBtn');
        await page.click('#clConfirmBtn');
        await expect(page).toHaveURL(/login\.php/);
        expect((await page.request.get('/index.php', { maxRedirects: 0 })).status(), 'no session left').toBe(302);
    });

    test('the default credentials warning shows for the untouched admin and not for others', covers('plat.login.default-credentials'), async ({ page, playwright, browser }) => {
        // The admin of this throwaway instance keeps its default password on purpose
        const anonymous = await browser.newContext({ baseURL: BASE_URL });
        const loginPage = await anonymous.newPage();
        await loginPage.goto('/login.php');
        await expect(loginPage.locator('body')).toContainText('admin_change_me');
        await anonymous.close();
        await login(page, ADMIN);
        await page.goto('/settings.php');
        await expect(page.locator('#default-credentials-alert')).toBeVisible();
        await expect(page.locator('#default-credentials-password-btn')).toHaveAttribute('href', /open=change-password/);
        await expect(page.locator('#default-credentials-username-btn')).toBeVisible();
        await page.click('#default-credentials-username-btn');
        await expect(page.locator('#epUsername')).toBeVisible();
        await page.locator('#epCancelBtn').click();
        await expect(page.locator('#iconSidebarSettingsBtn .attention-badge')).toBeVisible();
        await page.context().clearCookies();
        const account = await newAccount(playwright, 'nodefault');
        await login(page, account);
        await page.goto('/settings.php');
        await expect(page.locator('#default-credentials-alert')).toHaveCount(0);
        await expect(page.locator('#iconSidebarSettingsBtn .attention-badge')).toHaveCount(0);
    });

    test('the display name set in the settings shows on the login page', covers('plat.login.display-name'), async ({ page, browser }) => {
        const before = getGlobal('login_display_name');
        try {
            await login(page, ADMIN);
            await page.goto('/settings.php#section=settings-display-section-grid');
            const name = 'Portail Été';
            await page.fill('#login-display-input', name);
            await page.press('#login-display-input', 'Tab');
            await expect.poll(() => getGlobal('login_display_name')).toBe(name);
            const anonymous = await browser.newContext({ baseURL: BASE_URL });
            const loginPage = await anonymous.newPage();
            await loginPage.goto('/login.php');
            await expect(loginPage.locator('.login-container')).toContainText(name);
            await anonymous.close();
        } finally {
            setGlobal('login_display_name', before);
        }
    });

    test('open without login: the card asks first, the instance then opens on its own, and off again', covers('plat.login.disabled'), async ({ page, browser, playwright }) => {
        const before = getGlobal('login_disabled');
        try {
            await login(page, ADMIN);
            await page.goto('/settings.php#section=admin-tools-grid&group=users-access');
            await page.click('#login-disabled-card');
            await page.locator('.alert-modal-button', { hasText: 'Cancel' }).click();
            expect(getGlobal('login_disabled'), 'cancelled').not.toBe('1');
            await page.click('#login-disabled-card');
            await page.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' }).click();
            await expect.poll(() => getGlobal('login_disabled')).toBe('1');
            const anonymous = await browser.newContext({ baseURL: BASE_URL });
            const visitor = await anonymous.newPage();
            await visitor.goto('/index.php');
            await expect(visitor, 'no form any more').not.toHaveURL(/login\.php/);
            await anonymous.close();
            await page.reload();
            await page.click('#login-disabled-card');
            await expect.poll(() => getGlobal('login_disabled')).toBe('0');
        } finally {
            setGlobal('login_disabled', before);
        }
    });

    test('switch_account: refused without a grant or a token, works with both, the stale tab is reloaded', covers('plat.login.switch', 'plat.login.stale-tab'), async ({ page, context, playwright }) => {
        const owner = await newAccount(playwright, 'switchowner');
        const person = await newAccount(playwright, 'switchperson');
        const ownerApi = await Api.open(playwright, owner);
        const ownerNote = await ownerApi.createNote({ heading: 'Note du propriétaire' });
        await ownerApi.dispose();
        await login(page, person);
        const account = () => page.request.get('/api/v1/workspaces').then((r) => r.json()).then((j) => j.username);
        await page.goto('/index.php');
        const token = await page.evaluate(() => window.PoznoteAccountSwitch?.csrfToken);
        let answer = await page.request.post('/switch_account.php', { form: { account_user_id: String(owner.id), csrf_token: 'faux' }, maxRedirects: 0 });
        expect(answer.status()).toBe(303);
        expect(await account(), 'a wrong token changes nothing').toBe(person.username);
        expect((await page.request.get('/switch_account.php', { maxRedirects: 0 })).status(), 'GET is refused').toBe(405);
        // An admin grants the access from the users page
        const adminContext = await page.context().browser().newContext({ baseURL: BASE_URL, locale: 'en-US' });
        const adminPage = await adminContext.newPage();
        await login(adminPage, ADMIN);
        await adminPage.goto('/admin/users.php');
        const csrf = await adminPage.locator('#accessModal input[name="csrf_token"]').inputValue();
        const granted = await adminPage.request.post('/admin/users.php', { form: { action: 'update_account_access', csrf_token: csrf, user_id: String(person.id), 'allowed_user_ids[]': String(owner.id) } });
        expect(granted.status()).toBeLessThan(400);
        await adminContext.close();

        const tree = await page.request.get(`/account_tree.php?account=${owner.id}&workspaces_only=1`);
        expect(tree.status(), 'the tree of the account granted').toBe(200);
        expect(await tree.text()).toContain('Poznote');
        const refused = await page.request.get('/account_tree.php?account=1&workspaces_only=1');
        expect(refused.status(), 'not the tree of another one').toBeGreaterThanOrEqual(400);
        await page.goto('/index.php');
        const realToken = await page.evaluate(() => window.PoznoteAccountSwitch?.csrfToken);
        expect(realToken, JSON.stringify(token)).toBeTruthy();
        const stale = await context.newPage();
        await stale.goto('/index.php');
        await page.evaluate((target) => window.poznoteSwitchAccount(target), owner.id);
        await page.waitForLoadState('load');
        await expect.poll(account).toBe(owner.username);
        await expect(page.locator('body')).toContainText('Note du propriétaire');
        // The other tab was rendered for the first account: its next call is refused and
        // reloads it. Its own polling may get there first, hence no wait on one precise call
        await stale.evaluate(() => { fetch('api/v1/changes'); }).catch(() => {});
        await expect(stale.locator('body')).toContainText(ownerNote.heading, { timeout: 30_000 });
        await stale.close();
    });
});

// ================================================================================
// My account: profile, password, two-factor, app passwords, deleting it
// ================================================================================
test.describe('my account', () => {
    // The browser logs the refusals these tests provoke on purpose
    test.use({ allowedErrors: [/Failed to load resource: the server responded with a status of 40\d/] });
    const ACCOUNT_SECTION = '/settings.php#section=settings-account-section-grid';

    test('my profile: the dialog shows and saves names, username, and the email stays locked', covers('plat.account.profile'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'profile');
        const api = await Api.open(playwright, account);
        await login(page, account);
        await page.goto(ACCOUNT_SECTION);
        await page.click('#my-profile-card');
        await expect(page.locator('#epUsername')).toHaveValue(account.username);
        await expect(page.locator('#epEmail')).toBeDisabled();
        await page.fill('#epFirstName', 'Zoé');
        await page.fill('#epLastName', 'Lefèvre');
        await page.click('#epCancelBtn');
        expect((await api.ok(api.get('/users/me'))).json.first_name, 'cancelled').toBeNull();
        await page.click('#my-profile-card');
        await page.fill('#epFirstName', 'Zoé');
        await page.fill('#epLastName', 'Lefèvre');
        await page.click('#epSaveBtn');
        await expect.poll(async () => (await api.ok(api.get('/users/me'))).json).toMatchObject({ first_name: 'Zoé', last_name: 'Lefèvre', display_name: 'Zoé Lefèvre' });
        await page.goto(ACCOUNT_SECTION);
        await page.click('#my-profile-card');
        await expect(page.locator('#epFirstName')).toHaveValue('Zoé');
        await api.dispose();
    });

    test('changing my password: wrong current, mismatch, weak ones refused, then it works at sign-in', covers('plat.account.password'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'chpass');
        await login(page, account);
        forgetSession(account);
        await page.goto(ACCOUNT_SECTION);
        await page.click('#change-password-card');
        const newPassword = 'Nouveau-Mot-2026-é';
        await page.fill('#cpCurrentPassword', account.password);
        await page.fill('#cpNewPassword', newPassword);
        await page.fill('#cpConfirmPassword', 'autre-chose');
        await page.click('#cpSaveBtn');
        await expect(page.locator('#cpError')).toBeVisible();
        await page.fill('#cpCurrentPassword', 'mauvais');
        await page.fill('#cpConfirmPassword', newPassword);
        await page.click('#cpSaveBtn');
        await expect(page.locator('#cpError')).toContainText(/incorrect/i);
        await page.fill('#cpCurrentPassword', account.password);
        await page.fill('#cpNewPassword', 'x');
        await page.fill('#cpConfirmPassword', 'x');
        await page.click('#cpSaveBtn');
        await expect(page.locator('#cpError')).toBeVisible();
        const old = await Api.open(playwright, account);
        await old.ok(old.get('/notes'));
        await page.fill('#cpCurrentPassword', account.password);
        await page.fill('#cpNewPassword', newPassword);
        await page.fill('#cpConfirmPassword', newPassword);
        await page.click('#cpSaveBtn');
        await expect.poll(async () => (await old.get('/notes')).status, 'the old password stops working').toBe(401);
        await old.dispose();
        await page.context().clearCookies();
        await signInForm(page, account);
        await expect(page.locator('.error')).toBeVisible();
        await signInForm(page, { ...account, password: newPassword });
        await signedIn(page);
    });

    test('two-factor from the settings: set up, code at sign-in, new recovery codes, turn off', covers('plat.account.two-factor', 'plat.account.two-factor-recovery'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'tfui');
        await login(page, account);
        forgetSession(account);
        await page.goto(ACCOUNT_SECTION);
        await expect(page.locator('#two-factor-status-badge')).toHaveText(/off|disabled/i);
        await page.click('#two-factor-card');
        await page.fill('#tfSetupPassword', 'mauvais');
        await page.click('#tfSetupBtn');
        await expect(page.locator('#tfError')).toBeVisible();
        await page.fill('#tfSetupPassword', account.password);
        await page.click('#tfSetupBtn');
        await expect(page.locator('#tfQr canvas, #tfQr svg, #tfQr img').first(), 'the QR code is drawn').toBeVisible();
        const secret = (await page.locator('#tfSecret').innerText()).replace(/\s+/g, '');
        await page.fill('#tfEnableCode', '000000');
        await page.click('#tfEnableBtn');
        await expect(page.locator('#tfError')).toBeVisible();
        await page.fill('#tfEnableCode', totp(secret));
        await page.click('#tfEnableBtn');
        const codes = (await page.locator('#tfRecoveryList code').allInnerTexts()).map((code) => code.trim());
        expect(codes.length).toBeGreaterThan(5);
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#tfDownloadCodes')]);
        const saved = fs.readFileSync(await download.path(), 'utf8');
        expect(saved, 'the file holds the codes').toContain(codes[0]);
        await page.click('#tfCloseBtn');
        await expect(page.locator('#two-factor-status-badge')).toHaveText(/on|enabled/i);

        // Sign-in now asks for the code: wrong code, then a recovery code from the toggle
        await page.goto('/logout.php');
        await signInForm(page, account);
        await expect(page.locator('#totp_code')).toBeVisible();
        await page.fill('#totp_code', '000000');
        await page.keyboard.press('Enter');
        await expect(page.locator('.error')).toContainText(/incorrect/i);
        await page.click('#totp-recovery-toggle');
        await page.fill('#totp_code', codes[0]);
        await page.keyboard.press('Enter');
        await signedIn(page);
        expect((await page.request.get('/api/v1/users/me/two-factor').then((r) => r.json())).recovery_codes_remaining, 'the code is spent').toBe(codes.length - 1);

        // New codes from the settings, the old ones stop
        await page.goto(ACCOUNT_SECTION);
        await page.click('#two-factor-card');
        await page.fill('#tfRegenerateCode', totp(secret, 1));
        await page.click('#tfRegenerateBtn');
        await expect(page.locator('#tfRecoveryList code').first()).toBeVisible();
        const renewed = (await page.locator('#tfRecoveryList code').allInnerTexts()).map((code) => code.trim());
        expect(renewed).not.toContain(codes[1]);
        await page.click('#tfCloseBtn');
        await page.goto(ACCOUNT_SECTION);
        await page.click('#two-factor-card');
        await page.fill('#tfDisablePassword', account.password);
        await page.fill('#tfDisableCode', renewed[0]);
        await page.click('#tfDisableBtn');
        await expect(page.locator('#two-factor-status-badge')).toHaveText(/off|disabled/i);
        expect((await page.request.get('/api/v1/users/me/two-factor').then((r) => r.json())).enabled).toBe(false);
    });

    test('a cancelled sign-in code goes back to the form', covers('plat.login.totp-cancel'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'tfcancel');
        await login(page, account);
        forgetSession(account);
        const setup = await page.request.post('/api/v1/users/me/two-factor/setup', { data: { current_password: account.password } }).then((r) => r.json());
        expect((await page.request.post('/api/v1/users/me/two-factor/enable', { data: { code: totp(setup.secret) } })).status()).toBe(200);
        await page.goto('/logout.php');
        await signInForm(page, account);
        await expect(page.locator('#totp_code')).toBeVisible();
        await page.locator('form:has(input[value="totp_cancel"]) button').click();
        await expect(page.locator('#username')).toBeVisible();
        expect((await page.request.get('/index.php', { maxRedirects: 0 })).status(), 'not signed in').toBe(302);
    });

    test('two-factor required by the admin: refused without an own factor, enrolment at the next sign-in', covers('plat.account.two-factor-required'), async ({ page, playwright, browser }) => {
        const before = getGlobal('two_factor_required');
        const adminContext = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
        const adminPage = await adminContext.newPage();
        const account = await newAccount(playwright, 'tfreq');
        try {
            await login(adminPage, ADMIN);
            // The server refuses while the admin has no factor of its own
            await adminPage.goto('/settings.php#section=admin-tools-grid&group=users-access');
            await adminPage.click('#two-factor-required-card');
            await adminPage.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' }).click();
            await expect(adminPage.locator('.alert-modal-body')).toContainText(/own|your/i);
            expect(getGlobal('two_factor_required')).not.toBe('1');
            await adminPage.locator('.alert-modal-button').first().click();
            setGlobal('two_factor_required', '1');
            await signInForm(page, account);
            await expect(page.locator('#totp-enroll-secret'), 'the account must enrol').toBeVisible();
            const secret = (await page.locator('#totp-enroll-secret').innerText()).replace(/\s+/g, '');
            await page.fill('#totp_code', totp(secret));
            await page.keyboard.press('Enter');
            await expect(page.locator('#totp-recovery-list li').first()).toBeVisible();
            expect((await page.locator('#totp-recovery-list li').count())).toBeGreaterThan(5);
            await page.locator('a.login-button, button.login-button').last().click();
            await page.waitForURL((url) => !url.toString().includes('login.php'));
            const status = await page.request.get('/api/v1/users/me/two-factor').then((r) => r.json());
            expect(status).toMatchObject({ enabled: true, required_by_admin: true });
        } finally {
            setGlobal('two_factor_required', before);
            await adminContext.close();
        }
    });

    test('app passwords from the settings: create with an expiry, one-time secret, works, revoke in two clicks', covers('plat.account.app-passwords'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'apui');
        await login(page, account);
        await page.goto(ACCOUNT_SECTION);
        await page.click('#app-passwords-card');
        await expect(page.locator('#apList .app-passwords-empty')).toBeVisible();
        await page.fill('#apLabel', 'Téléphone');
        await page.selectOption('#apExpiry', '30');
        await page.click('#apCreateBtn');
        await expect(page.locator('#apSecretValue')).not.toBeEmpty();
        const secret = await page.locator('#apSecretValue').innerText();
        const row = page.locator('#apList .app-password-row', { hasText: 'Téléphone' });
        await expect(row.locator('.app-password-meta')).toContainText(/Expires/);
        const scoped = await Api.open(playwright, { ...account, password: secret });
        await scoped.ok(scoped.get('/notes'));
        await row.locator('.app-password-revoke').click();
        await expect(row.locator('.app-password-revoke')).toHaveClass(/is-armed/);
        expect((await scoped.get('/notes')).status, 'the first click only arms it').toBe(200);
        await row.locator('.app-password-revoke').click();
        await expect(page.locator('#apList .app-passwords-empty')).toBeVisible();
        expect((await scoped.get('/notes')).status).toBe(401);
        await scoped.dispose();
        await page.click('#apCloseBtn');
        await expect(page.locator('#app-passwords-status-badge')).toHaveText(/None/);
    });

    test('deleting my account: needs the username and password, then everything is gone', covers('plat.account.delete'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'bye');
        const api = await Api.open(playwright, account);
        await api.createNote({ heading: 'Disparaîtra' });
        await login(page, account);
        forgetSession(account);
        await page.goto(ACCOUNT_SECTION);
        await page.click('#delete-account-card');
        await expect(page.locator('#daDeleteBtn')).toBeDisabled();
        await page.fill('#daConfirmUsername', 'pas-le-bon');
        await expect(page.locator('#daDeleteBtn')).toBeDisabled();
        await page.fill('#daConfirmUsername', account.username);
        await page.fill('#daPassword', 'mauvais');
        await expect(page.locator('#daDeleteBtn')).toBeEnabled();
        await page.click('#daDeleteBtn');
        await expect(page.locator('#daError')).toBeVisible();
        expect((await api.get('/users/me')).status, 'still there').toBe(200);
        await page.fill('#daPassword', account.password);
        await page.click('#daDeleteBtn');
        await page.waitForURL(/login\.php/);
        expect((await api.get('/users/me')).status).toBe(401);
        await page.goto('/login.php');
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await expect(page.locator('.error')).toBeVisible();
        expect(inInstance(`ls /var/www/html/data/users/ | grep -c '^${account.id}$' || true`).trim(), 'its data is removed').toBe('0');
        await api.dispose();
    });

    test('the permanent admin has no delete card, and the route refuses', covers('plat.account.delete-admin'), async ({ page, playwright }) => {
        await login(page, ADMIN);
        await page.goto(ACCOUNT_SECTION);
        await expect(page.locator('#my-profile-card')).toBeVisible();
        await expect(page.locator('#delete-account-card')).toHaveCount(0);
        const admin = await Api.open(playwright, ADMIN);
        const refused = await admin.del('/users/me', { json: { confirm_username: ADMIN.username, password: ADMIN.password } });
        expect(refused.status).toBeGreaterThanOrEqual(400);
        expect((await admin.ok(admin.get('/users/me'))).json.id).toBe(1);
        await admin.dispose();
    });

    test('my storage summary counts my notes and links to the page', covers('plat.account.storage'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'mystats');
        const api = await Api.open(playwright, account);
        for (let index = 0; index < 3; index++) await api.createNote({ heading: `Compte ${index}` });
        const trashed = await api.createNote({ heading: 'Compte jeté' });
        await api.ok(api.del(`/notes/${trashed.id}`));
        await api.dispose();
        await login(page, account);
        await page.goto(ACCOUNT_SECTION);
        const summary = page.locator('#storage-stats-user-card');
        // The notes of the welcome workspace count too
        await expect(summary).toContainText(/\d+ in your notes, 1 in the trash/);
        const fragment = await page.request.get('/storage-stats-user.php?fragment=1');
        expect(fragment.status()).toBe(200);
        expect(await fragment.text()).toMatch(/in the trash/);
        expect(new URL((await page.request.get('/storage-stats-user.php')).url()).pathname, 'the page redirects to the settings').toBe('/settings.php');
    });

    test('settings cards of the account section are all there', covers('plat.account.cards'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'cards');
        await login(page, account);
        await page.goto(ACCOUNT_SECTION);
        const ids = await page.locator('#settings-account-section-grid [id$="-card"]').evaluateAll((cards) => cards.map((card) => card.id));
        expect(ids.sort()).toEqual(['app-passwords-card', 'change-password-card', 'date-time-format-card', 'delete-account-card', 'language-card', 'my-profile-card', 'storage-stats-user-card', 'timezone-card', 'two-factor-card']);
    });
});

// ================================================================================
// OAuth server: what a chat app does to connect, and the person who says yes
// ================================================================================
test.describe('OAuth server', () => {
    // A loopback address, which needs no certificate, on a page that answers anyone
    const REDIRECT = `${BASE_URL}/api_health.php`;
    const verifier = 'verificateur-pkce-assez-long-pour-etre-valide-0123456789';
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    let anonymous;

    test.beforeAll(async ({ playwright }) => {
        anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
    });
    test.afterAll(async () => { await anonymous.dispose(); });

    const register = async (name = 'Chat é') => {
        const response = await anonymous.post('/oauth/register.php', { data: { client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' } });
        expect(response.status(), await response.text()).toBe(201);
        return response.json();
    };
    const authorizeUrl = (client, extra = {}) => `/oauth/authorize.php?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, state: 'etat-42', code_challenge: challenge, code_challenge_method: 'S256', ...extra })}`;
    const introspect = async (token) => {
        const service = inInstance('cat /var/www/html/data/.mcp_token').trim();
        const response = await anonymous.post('/oauth/introspect.php', { form: { token }, headers: { Authorization: `Bearer ${service}` } });
        expect(response.status()).toBe(200);
        return response.json();
    };
    /** Goes through consent in the browser and returns the query the app receives. */
    async function consent(page, client, decision = 'allow', level = null) {
        await page.goto(authorizeUrl(client));
        await expect(page.locator('.oauth-container')).toContainText(client.client_name);
        if (level) await page.check(`input[name="access_level"][value="${level}"]`);
        await page.click(`button[name="decision"][value="${decision}"]`);
        await page.waitForURL(/api_health\.php/);
        return new URL(page.url()).searchParams;
    }
    const exchange = (client, code) => anonymous.post('/oauth/token.php', { form: { grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT } });

    test('registration refuses bad metadata and answers a client', covers('plat.oauth.register'), async () => {
        const client = await register();
        expect(client.client_id).toMatch(/^pzclient_/);
        expect(client).toMatchObject({ client_name: 'Chat é', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
        expect((await anonymous.post('/oauth/register.php', { data: { client_name: 'x', redirect_uris: ['http://evil.example.com/cb'] } })).status(), 'plain http elsewhere than loopback').toBe(400);
        const https = await anonymous.post('/oauth/register.php', { data: { client_name: 'x', redirect_uris: ['https://chat.example.com/cb'] } });
        expect(https.status(), 'https is fine').toBe(201);
        expect((await anonymous.post('/oauth/register.php', { data: { client_name: 'x' } })).status()).toBe(400);
        expect((await anonymous.get('/oauth/register.php')).status()).toBe(405);
    });

    test('authorize refuses an unknown app, a foreign redirect and a missing PKCE', covers('plat.oauth.authorize-errors'), async () => {
        const client = await register();
        expect((await anonymous.get('/oauth/authorize.php?client_id=inconnu')).status()).toBe(400);
        expect((await anonymous.get(authorizeUrl(client, { redirect_uri: 'https://evil.example.com/' }))).status()).toBe(400);
        expect((await anonymous.get(authorizeUrl(client, { code_challenge: '' }))).status()).toBe(400);
    });

    test('the whole flow: sign-in, consent, code, token, introspection, refresh, revoke', covers('plat.oauth.flow'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'oauth');
        const client = await register();
        // Not signed in yet: the sign-in comes first and returns to the consent page
        await page.goto(authorizeUrl(client));
        await expect(page).toHaveURL(/login\.php/);
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await page.waitForURL(/oauth\/authorize\.php/);
        await page.waitForLoadState();
        const received = await consent(page, client, 'allow', 'read');
        expect(received.get('state'), 'the state comes back').toBe('etat-42');
        const code = received.get('code');
        expect(code).toMatch(/^pzc_/);

        const badVerifier = await anonymous.post('/oauth/token.php', { form: { grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: 'faux'.repeat(15), redirect_uri: REDIRECT } });
        expect(badVerifier.status(), 'PKCE').toBe(400);
        // The code was spent by the failed attempt, a second consent gives a new one
        const again = await consent(page, client, 'allow', 'read');
        const response = await exchange(client, again.get('code'));
        expect(response.status(), await response.text()).toBe(200);
        const tokens = await response.json();
        expect(tokens).toMatchObject({ token_type: 'Bearer', access_token: expect.stringMatching(/^pzo_/), refresh_token: expect.stringMatching(/^pzr_/), expires_in: 3600 });
        expect((await exchange(client, again.get('code'))).status(), 'a code works once').toBe(400);

        const claims = await introspect(tokens.access_token);
        expect(claims).toMatchObject({ active: true, username: account.username });
        expect(JSON.stringify(claims), 'the level chosen on the consent page').toContain('read');
        expect((await introspect('pzo_faux')).active).toBe(false);
        expect((await anonymous.post('/oauth/introspect.php', { form: { token: tokens.access_token } })).status(), 'reserved to the MCP server').toBe(401);

        const refreshed = await anonymous.post('/oauth/token.php', { form: { grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tokens.refresh_token } });
        expect(refreshed.status(), await refreshed.text()).toBe(200);
        const next = await refreshed.json();
        expect(next.access_token).not.toBe(tokens.access_token);
        expect((await introspect(next.access_token)).active).toBe(true);
        expect((await anonymous.post('/oauth/token.php', { form: { grant_type: 'password', client_id: client.client_id } })).status()).toBe(400);
        expect((await anonymous.post('/oauth/token.php', { form: { grant_type: 'refresh_token', client_id: 'inconnu', refresh_token: 'x' } })).status()).toBe(401);

        const revoked = await anonymous.post('/oauth/revoke.php', { form: { client_id: client.client_id, token: next.access_token } });
        expect(revoked.status(), await revoked.text()).toBe(200);
        expect((await introspect(next.access_token)).active, 'revoked').toBe(false);
    });

    test('refusing on the consent page tells the app and gives nothing', covers('plat.oauth.deny'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'oauthno');
        const client = await register();
        await login(page, account);
        const received = await consent(page, client, 'deny');
        expect(received.get('error')).toBe('access_denied');
        expect(received.get('code')).toBeNull();
        expect((await page.request.get('/api/v1/users/me/connected-apps').then((r) => r.json())).count).toBe(0);
    });

    test('connected apps: listed in the settings, disconnected in two clicks, the token dies', covers('plat.oauth.connected-apps'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'oauthapps');
        const client = await register('Application connectée');
        await login(page, account);
        const received = await consent(page, client);
        const tokens = await (await exchange(client, received.get('code'))).json();
        const api = await Api.open(playwright, account);
        const listed = (await api.ok(api.get('/users/me/connected-apps'))).json;
        expect(listed.count).toBe(1);
        expect(listed.connected_apps[0]).toMatchObject({ client_name: 'Application connectée', access_level: 'write' });
        await page.goto('/settings.php#section=settings-account-section-grid');
        await expect(page.locator('#connected-apps-status-badge')).toHaveText('1 app');
        await page.click('#connected-apps-card');
        const row = page.locator('#caList .app-password-row', { hasText: 'Application connectée' });
        await row.locator('.app-password-revoke').click();
        await expect(row.locator('.app-password-revoke')).toHaveClass(/is-armed/);
        expect((await introspect(tokens.access_token)).active, 'only armed').toBe(true);
        await row.locator('.app-password-revoke').click();
        await expect(page.locator('#caList .app-passwords-empty')).toBeVisible();
        expect((await introspect(tokens.access_token)).active).toBe(false);
        expect((await api.ok(api.get('/users/me/connected-apps'))).json.count).toBe(0);
        await api.dispose();
    });
});

// ================================================================================
// OIDC, against the small provider of the mock server
// ================================================================================
test.describe('OIDC', () => {
    const SETTINGS = ['oidc_enabled', 'oidc_issuer', 'oidc_provider_name', 'oidc_redirect_uri', 'oidc_auto_create_users', 'oidc_allowed_groups', 'oidc_groups_claim', 'oidc_end_session_endpoint'];
    const ISSUER = `${MOCK}/oidc`;

    /**
     * The browser cannot reach the mock, and a redirect cannot be routed: the
     * answer of oidc_login.php is read here and replaced by the provider's own,
     * back to the callback with a code holding the claims.
     */
    async function identityProvider(page, claims) {
        await page.unroute('**/oidc_login.php*');
        await page.route('**/oidc_login.php*', async (route) => {
            const response = await route.fetch({ maxRedirects: 0 });
            const location = new URL(response.headers().location, BASE_URL);
            if (!location.href.startsWith(`${ISSUER}/authorize`)) {
                await route.fulfill({ response });
                return;
            }
            const query = location.searchParams;
            const code = Buffer.from(JSON.stringify({ nonce: query.get('nonce'), ...claims })).toString('base64');
            const back = new URL(query.get('redirect_uri'));
            back.searchParams.set('code', code);
            back.searchParams.set('state', query.get('state'));
            await route.fulfill({ status: 302, headers: { location: back.toString() } });
        });
    }
    async function withOidc(body) {
        const saved = Object.fromEntries(SETTINGS.map((key) => [key, getGlobal(key)]));
        try {
            await body();
        } finally {
            for (const [key, value] of Object.entries(saved)) setGlobal(key, value);
        }
    }

    test('the admin page saves the settings and enables SSO on the login page', covers('plat.oidc.admin'), async ({ page, browser }) => {
        await withOidc(async () => {
            await login(page, ADMIN);
            await page.goto('/admin/oidc.php');
            await openBoxes(page);
            if (!(await page.locator('#oidc_enabled').isChecked())) await page.locator('#oidc_enabled').evaluate((box) => box.click());
            await openBoxes(page);
            await page.fill('#oidc_provider_name', 'Fournisseur E2E');
            await page.fill('#oidc_issuer', `${ISSUER}/`);
            await page.fill('#oidc_redirect_uri', `${BASE_URL}/oidc_callback.php`);
            await page.locator('form button[type="submit"]').last().click();
            await expect.poll(() => getGlobal('oidc_enabled')).toBe('1');
            expect(getGlobal('oidc_issuer'), 'the trailing slash is dropped').toBe(ISSUER);
            await page.goto('/admin/oidc.php');
            await openBoxes(page);
            await expect(page.locator('#oidc_provider_name')).toHaveValue('Fournisseur E2E');
            await expect(page.locator('#oidc-general-fields')).toBeVisible();
            const anonymous = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
            const visitor = await anonymous.newPage();
            await visitor.goto('/login.php');
            await expect(visitor.locator('#oidc-login-btn')).toContainText('Fournisseur E2E');
            await expect(visitor.locator('#username'), 'the password form stays').toBeVisible();
            await anonymous.close();
        });
    });

    test('signing in with the provider opens the account linked to the email, an unknown one is refused', covers('plat.oidc.login'), async ({ page, playwright }) => {
        await withOidc(async () => {
            setGlobal('oidc_enabled', '1'); setGlobal('oidc_issuer', ISSUER); setGlobal('oidc_provider_name', 'SSO E2E'); setGlobal('oidc_redirect_uri', `${BASE_URL}/oidc_callback.php`); setGlobal('oidc_auto_create_users', '0');
            const account = await newAccount(playwright, 'oidcuser');
            const admin = await Api.open(playwright, ADMIN);
            const email = `${account.username}@example.com`;
            await admin.ok(admin.patch(`/admin/users/${account.id}`, { email }));
            await admin.dispose();

            await identityProvider(page, { sub: `sub-${account.id}`, email, email_verified: true, preferred_username: account.username });
            await page.goto('/login.php');
            await page.click('#oidc-login-btn');
            await page.waitForURL((url) => !/login|oidc/.test(url.toString()));
            const me = await page.request.get('/api/v1/users/me').then((r) => r.json());
            expect(me).toMatchObject({ id: account.id, username: account.username });
            const hint = await page.evaluate(() => localStorage.getItem('poznote_oidc_login_hint'));
            expect(hint, 'the email is remembered for the next time').toBe(email);

            await page.context().clearCookies();
            await identityProvider(page, { sub: 'inconnu', email: 'inconnu@example.com', preferred_username: 'inconnu-oidc' });
            await page.goto('/oidc_login.php');
            await expect(page).toHaveURL(/login\.php\?oidc_error=no_profile/);
            await expect(page.locator('.oidc-error')).toContainText('inconnu');
        });
    });

    test('auto-creation makes the account at the first sign-in, a group filter refuses the others', covers('plat.oidc.provision'), async ({ page, playwright }) => {
        await withOidc(async () => {
            setGlobal('oidc_enabled', '1'); setGlobal('oidc_issuer', ISSUER); setGlobal('oidc_redirect_uri', `${BASE_URL}/oidc_callback.php`); setGlobal('oidc_auto_create_users', '1');
            const name = `oidcnew${Date.now()}`;
            await identityProvider(page, { sub: `sub-${name}`, email: `${name}@example.com`, email_verified: true, preferred_username: name });
            await page.goto('/oidc_login.php');
            await page.waitForURL((url) => !/login|oidc/.test(url.toString()));
            expect((await page.request.get('/api/v1/users/me').then((r) => r.json())).username).toBe(name);

            setGlobal('oidc_allowed_groups', 'equipe');
            setGlobal('oidc_groups_claim', 'groups');
            await page.context().clearCookies();
            await identityProvider(page, { sub: `sub-${name}x`, email: `${name}x@example.com`, preferred_username: `${name}x`, groups: ['autre'] });
            await page.goto('/oidc_login.php');
            await expect(page).toHaveURL(/oidc_error=unauthorized/);
            await expect(page.locator('.oidc-error')).toBeVisible();
        });
    });

    test('a bad signature or a wrong audience from the provider is refused', covers('plat.oidc.verify'), async ({ page }) => {
        await withOidc(async () => {
            setGlobal('oidc_enabled', '1'); setGlobal('oidc_issuer', ISSUER); setGlobal('oidc_redirect_uri', `${BASE_URL}/oidc_callback.php`); setGlobal('oidc_auto_create_users', '1');
            await identityProvider(page, { sub: 'autre-audience', email: 'aud@example.com', preferred_username: 'aud', aud: 'une-autre-application' });
            await page.goto('/oidc_login.php');
            await expect(page).toHaveURL(/oidc_error=1/);
            expect((await page.request.get('/index.php', { maxRedirects: 0 })).status()).toBe(302);
            // A forged state never reaches the provider
            await page.goto('/oidc_callback.php?state=faux&code=x');
            await expect(page).toHaveURL(/oidc_error=1/);
        });
    });
});

// ================================================================================
// Administration pages
// ================================================================================
test.describe('administration', () => {
    // The browser logs the refusals these tests provoke on purpose
    test.use({ allowedErrors: [/Failed to load resource: the server responded with a status of 40\d/] });
    const openRowMenu = async (page, username) => {
        const row = page.locator('.users-table tbody tr', { hasText: username });
        await row.locator('.user-actions-toggle').click();
        return row;
    };
    const menuItem = (row, name) => row.locator('.user-actions-item', { hasText: name });
    const adminOf = async (playwright) => Api.open(playwright, ADMIN);

    test('a normal account cannot open any admin page', covers('plat.admin.access'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'notadmin');
        await login(page, account);
        for (const url of ['admin/users', 'admin/activity-log', 'admin/oidc', 'admin/smtp', 'admin/storage-stats', 'admin/webhooks', 'ai_settings', 'stt_settings']) {
            const response = await page.goto(`/${url}.php`);
            expect(response.status(), `${url}.php`).toBe(403);
            await expect(page.locator('body'), `${url}.php`).toContainText(/Admin (privileges|access) required/);
        }
        // These two lead to the settings, where no admin tool is shown
        for (const url of ['admin/disaster-recovery', 'admin/orphan-scanner']) {
            await page.goto(`/${url}.php`);
            await expect(page).toHaveURL(/settings\.php/);
            await expect(page.locator('#disaster-recovery-card, #orphan-scanner-card')).toHaveCount(0);
        }
        await page.goto('/settings.php');
        await expect(page.locator('#admin-tools-grid')).toHaveCount(0);
    });

    test('the admin section lists its cards', covers('plat.admin.cards'), async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, ADMIN);
        await page.goto('/settings.php#section=admin-tools-grid');
        const ids = await page.locator('#admin-tools-grid [id$="-card"]').evaluateAll((cards) => cards.map((card) => card.id).sort());
        expect(ids).toEqual(['activity-log-card', 'ai-assistant-card', 'custom-css-card', 'custom-fonts-card', 'custom-logo-card', 'disaster-recovery-card', 'executable-attachments-card', 'git-sync-enabled-card', 'import-limits-card', 'local-backup-card', 'login-disabled-card', 'oidc-config-card', 'orphan-scanner-card', 'outbound-hosts-card', 's3-backup-card', 's3-storage-card', 'smtp-config-card', 'statistics-token-card', 'storage-stats-card', 'stt-card', 'tenant-isolation-card', 'theme-list-card', 'two-factor-required-card', 'user-quotas-card', 'users-admin-card', 'webhooks-card'].sort());
        // Each card that leads to a page really goes there
        for (const [card, url] of [['users-admin-card', /admin\/users\.php/], ['oidc-config-card', /admin\/oidc\.php/], ['smtp-config-card', /admin\/smtp\.php/], ['webhooks-card', /admin\/webhooks\.php/], ['ai-assistant-card', /ai_settings\.php/], ['stt-card', /stt_settings\.php/], ['activity-log-card', /admin\/activity-log\.php/], ['storage-stats-card', /admin\/storage-stats\.php/]]) {
            await openAdminCard(page, card);
            await expect(page, card).toHaveURL(url);
        }
    });

    test('users: create a profile from the dialog', covers('plat.admin.users-create'), async ({ page, playwright }) => {
        const admin = await adminOf(playwright);
        const name = `créé-${Date.now()}`;
        await login(page, ADMIN);
        await page.goto('/admin/users.php');
        await page.getByRole('button', { name: 'Create Profile' }).click();
        await expect(page.locator('#createModal')).toBeVisible();
        await page.fill('#create_username', name);
        await page.fill('#create_email', `u${Date.now()}@example.com`);
        await page.locator('#createModal button[type="submit"]').click();
        await expect.poll(async () => (await admin.ok(admin.get('/admin/users', { params: { q: name } }))).text).toContain(name.replace('é', '\\u00e9').replace('é', '\\u00e9'));
        await page.goto(`/admin/users.php?q=${encodeURIComponent(name)}`);
        await expect(page.locator('.users-table')).toContainText(name);
        // The same name twice is refused
        await page.getByRole('button', { name: 'Create Profile' }).click();
        await page.fill('#create_username', name);
        await page.locator('#createModal button[type="submit"]').click();
        await expect(page.locator('.message-error')).toBeVisible();
        await admin.dispose();
    });

    test('users: edit names and email from the row menu', covers('plat.admin.users-edit'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'useredit');
        const admin = await adminOf(playwright);
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${account.username}`);
        const row = await openRowMenu(page, account.username);
        await menuItem(row, 'Edit').click();
        await expect(page.locator('#rename_username')).toHaveValue(account.username);
        await page.fill('#rename_first_name', 'Noé');
        await page.fill('#rename_last_name', 'Dupré');
        await page.fill('#rename_email', `${account.username}@example.com`);
        await page.locator('#renameModal .btn-primary').click();
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}`))).json).toMatchObject({ first_name: 'Noé', last_name: 'Dupré', email: `${account.username}@example.com` });
        await expect(page.locator('.users-table')).toContainText('Dupré');
        await admin.dispose();
    });

    test('users: disable asks, then blocks sign-in, enable gives it back', covers('plat.admin.users-disable'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'userdis');
        const admin = await adminOf(playwright);
        const own = await Api.open(playwright, account);
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${account.username}`);
        const row = page.locator('.users-table tbody tr', { hasText: account.username });
        await row.locator('.badge-active.clickable-badge').click();
        await expect(page.locator('#statusConfirmModal')).toBeVisible();
        await page.click('#status_confirm_button');
        await expect(row.locator('.badge-inactive')).toBeVisible();
        expect((await admin.ok(admin.get(`/admin/users/${account.id}`))).json.active).toBe(0);
        expect((await own.get('/notes')).status, 'a disabled account').toBeGreaterThanOrEqual(401);
        await row.locator('.badge-inactive.clickable-badge').click();
        await page.click('#status_confirm_button');
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}`))).json.active).toBe(1);
        await own.ok(own.get('/notes'));
        await admin.dispose(); await own.dispose();
    });

    test('users: promote to admin asks first, and the account really gets admin rights', covers('plat.admin.users-promote'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'userprom');
        const admin = await adminOf(playwright);
        const own = await Api.open(playwright, account);
        expect((await own.get('/admin/stats')).status).toBeGreaterThanOrEqual(401);
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${account.username}`);
        const row = page.locator('.users-table tbody tr', { hasText: account.username });
        await row.locator('input[type="checkbox"]').first().click();
        await expect(page.locator('#adminConfirmModal')).toBeVisible();
        await page.locator('#adminConfirmModal .btn-primary').click();
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}`))).json.is_admin).toBe(1);
        await own.ok(own.get('/admin/stats'));
        await page.goto(`/admin/users.php?q=${account.username}`);
        await row.locator('input[type="checkbox"]').first().click();
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}`))).json.is_admin).toBe(0);
        expect((await own.get('/admin/stats')).status).toBeGreaterThanOrEqual(401);
        await admin.dispose(); await own.dispose();
    });

    test('users: set a password from the dialog, then reset it to the default', covers('plat.admin.users-password'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'userpw');
        const admin = await adminOf(playwright);
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${account.username}`);
        const row = await openRowMenu(page, account.username);
        await row.locator('.password-action-btn').click();
        await expect(page.locator('#pw_status_summary')).not.toContainText('Loading');
        await page.fill('#pw_new_password', 'Autre-Mot-2026-z');
        await page.fill('#pw_confirm_password', 'pas-pareil');
        await page.click('#pw_save_btn');
        await expect(page.locator('#pw_error')).toBeVisible();
        await page.fill('#pw_confirm_password', 'Autre-Mot-2026-z');
        await page.click('#pw_save_btn');
        await expect(page.locator('#passwordModal')).toBeHidden();
        const fresh = await Api.open(playwright, { ...account, password: 'Autre-Mot-2026-z' });
        await fresh.ok(fresh.get('/notes'));
        await fresh.dispose();
        const again = await openRowMenu(page, account.username);
        await again.locator('.password-action-btn').click();
        await expect(page.locator('#pw_status_summary')).not.toContainText('Loading');
        await page.click('#pw_reset_btn');
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}/password-status`))).json.has_custom_password).toBe(false);
        await admin.dispose();
    });

    test('users: note access granted from the dialog, the other person chooses the account at sign-in', covers('plat.admin.users-access', 'plat.login.select-account'), async ({ page, playwright, browser }) => {
        const owner = await newAccount(playwright, 'accessowner');
        const person = await newAccount(playwright, 'accessperson');
        const ownerApi = await Api.open(playwright, owner);
        await ownerApi.createNote({ heading: 'Note du compte choisi' });
        await ownerApi.dispose();
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${person.username}`);
        const row = await openRowMenu(page, person.username);
        await menuItem(row, 'Note access').click();
        await expect(page.locator('#accessModal')).toBeVisible();
        await page.locator('#accessModal label', { hasText: owner.username }).locator('input').check();
        await page.locator('#accessModal button[type="submit"]').click();
        await expect(page.locator('.users-table tbody tr', { hasText: person.username })).toContainText(owner.username);
        const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
        const other = await context.newPage();
        await signInForm(other, person);
        const choices = other.locator('button[name="account_user_id"]');
        await expect(choices).toHaveCount(2);
        await choices.filter({ hasText: owner.username }).click();
        await signedIn(other);
        await finishWelcome(other);
        expect((await other.request.get('/api/v1/notes/search', { params: { q: 'Note du compte choisi' } }).then((r) => r.json())).count, 'the account chosen').toBe(1);
        await context.close();
    });

    test('users: delete needs the exact username, ID 1 and oneself cannot be deleted', covers('plat.admin.users-delete'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'userdel');
        const admin = await adminOf(playwright);
        await admin.createNote({ heading: 'Note de l admin' });
        await login(page, ADMIN);
        await page.goto(`/admin/users.php?q=${account.username}`);
        const row = await openRowMenu(page, account.username);
        await menuItem(row, 'Delete').click();
        await expect(page.locator('#delete_submit_btn')).toBeDisabled();
        await page.fill('#delete_confirm_username', 'autre');
        await expect(page.locator('#delete_submit_btn')).toBeDisabled();
        await page.fill('#delete_confirm_username', account.username);
        await page.click('#delete_submit_btn');
        await expect(page.locator('.users-table')).not.toContainText(account.username);
        expect((await admin.get(`/admin/users/${account.id}`)).status).toBe(404);
        await page.goto('/admin/users.php?q=admin_change_me');
        const self = await openRowMenu(page, 'admin_change_me');
        await expect(menuItem(self, 'Delete')).toBeDisabled();
        expect((await admin.del('/admin/users/1')).status, 'the API refuses too').toBeGreaterThanOrEqual(400);
        await admin.dispose();
    });

    test('users: live filter, status badges, sort, page size, CSV export', covers('plat.admin.users-list'), async ({ page, playwright }) => {
        const stamp = Date.now();
        const zed = await newAccount(playwright, `zzliste${stamp}`, true);
        const off = await newAccount(playwright, `aaliste${stamp}`, true);
        const admin = await adminOf(playwright);
        await admin.ok(admin.patch(`/admin/users/${off.id}`, { active: false }));
        await login(page, ADMIN);
        await page.goto('/admin/users.php?per_page=250');
        const rows = page.locator('.users-table tbody tr:not(.filter-hidden)');
        await page.fill('#users-filter-input', `zzliste${stamp}`);
        await expect(rows).toHaveCount(1);
        await page.press('#users-filter-input', 'Escape');
        await expect(page.locator('#users-filter-input')).toHaveValue('');
        await page.getByRole('link', { name: /\d+ inactive/ }).click();
        await expect(page).toHaveURL(/status=inactive/);
        await expect(page.locator('.users-table')).toContainText(off.username);
        await expect(page.locator('.users-table')).not.toContainText(zed.username);
        await page.getByRole('link', { name: /\d+ inactive/ }).click();
        await expect(page).toHaveURL(/status=all/);
        await expect(page.locator('.users-table')).toContainText(zed.username);
        await page.getByRole('link', { name: 'User', exact: true }).click();
        const names = async () => page.locator('.users-table .user-username').allInnerTexts();
        const first = await names();
        await page.getByRole('link', { name: 'User', exact: true }).click();
        await expect.poll(async () => (await names())[0], 'the direction flips').not.toBe(first[0]);
        const flipped = await names();
        expect([...flipped].reverse()).toEqual(first);
        await page.reload();
        expect(await names(), 'the sort is remembered').toEqual(flipped);
        await page.selectOption('#users-per-page', '25');
        await expect(page.locator('#users-per-page')).toHaveValue('25');
        expect(await page.locator('.users-table tbody tr').count()).toBeLessThanOrEqual(25);
        const csv = await page.request.get('/admin/users.php?export=csv&status=all');
        expect(csv.headers()['content-type']).toContain('csv');
        expect(await csv.text()).toContain(zed.username);
        await page.request.post('/api/v1/settings/admin_users_sort', { failOnStatusCode: false });
        await admin.dispose();
    });

    test('storage statistics: rows, quota edited in place, filters, sort, CSV', covers('plat.admin.storage'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'storage');
        const own = await Api.open(playwright, account);
        await own.createNote({ heading: 'Pour les statistiques' });
        const admin = await adminOf(playwright);
        await login(page, ADMIN);
        await page.goto(`/admin/storage-stats.php?per_page=250&q=${account.username}`);
        const row = page.locator('tr', { hasText: account.username }).first();
        await expect(row).toBeVisible();
        await expect(row.locator('.quota-inline').first()).toBeVisible();
        await row.locator('.quota-inline').first().click();
        await expect(page.locator('#quotaModal')).toBeVisible();
        await expect(page.locator('#quota_title_user')).toHaveText(account.username);
        await page.fill('#quota_max_notes', '7');
        await page.fill('#quota_max_storage', '12');
        await page.locator('#quotaModal .btn-primary').click();
        await expect.poll(async () => (await admin.ok(admin.get(`/admin/users/${account.id}`))).json).toMatchObject({ quota_max_notes: 7, quota_max_storage_mb: 12 });
        // The dialog reloads the page by itself
        await expect(page.locator('tr', { hasText: account.username }).first().locator('.quota-inline').first()).toContainText('7');
        const csv = await page.request.get(`/admin/storage-stats.php?export=csv&q=${account.username}`);
        expect(csv.headers()['content-type']).toContain('csv');
        expect(await csv.text()).toContain(account.username);
        await page.goto('/admin/storage-stats.php?per_page=250');
        await page.locator('.quota-admin-exempt').first().click();
        await expect(page.locator('#quotaAdminModal')).toBeVisible();
        await page.locator('#quotaAdminModal .btn-primary').click();
        await page.fill('#storage-filter-input', account.username);
        await expect(page.locator('tbody tr:not(.filter-hidden)')).toHaveCount(1);
        await page.fill('#storage-filter-input', '');
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { active: false }));
        await page.goto('/admin/storage-stats.php?per_page=250&hide_inactive=1');
        await expect(page.locator('table')).not.toContainText(account.username);
        await page.goto('/admin/storage-stats.php?per_page=250&hide_inactive=0');
        await expect(page.locator('table')).toContainText(account.username);
        await page.locator('.users-sort-link', { hasText: /^\s*notes\s*$/i }).click();
        await expect(page).toHaveURL(/sort=/);
        await admin.dispose(); await own.dispose();
    });

    test('activity log: events listed, search, action filter, retention, CSV, clearing asks', covers('plat.admin.activity'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'activity');
        // Its first sign-in is an event of the log
        await login(page, account);
        await page.context().clearCookies();
        forgetSession(account);
        await login(page, ADMIN);
        await page.goto('/admin/activity-log.php?per_page=250');
        await expect(page.locator('table')).toContainText(account.username);
        await page.fill('input[name="q"]', account.username);
        await page.getByRole('button', { name: 'Filter' }).click();
        await expect(page).toHaveURL(/q=activity/);
        const rows = page.locator('table tbody tr');
        expect(await rows.count()).toBeGreaterThan(0);
        for (const text of await rows.allInnerTexts()) expect(text).toContain(account.username);
        await page.goto('/admin/activity-log.php');
        const options = await page.locator('select[name="action_filter"] option').evaluateAll((list) => list.map((o) => o.value));
        expect(options.length, 'one entry per kind of event').toBeGreaterThan(20);
        await page.selectOption('select[name="action_filter"]', { label: 'Login' });
        await expect(page).toHaveURL(/action_filter=/);
        const logins = await page.locator('table tbody tr').allInnerTexts();
        expect(logins.length).toBeGreaterThan(0);
        for (const text of logins) expect(text).toMatch(/login/i);
        await page.goto('/admin/activity-log.php');
        const before = await page.locator('#retention_days').inputValue();
        await page.selectOption('#retention_days', '30');
        await page.locator('form:has(#retention_days) button[type="submit"]').click();
        await page.waitForLoadState();
        await expect(page.locator('#retention_days')).toHaveValue('30');
        await page.selectOption('#retention_days', before);
        await page.locator('form:has(#retention_days) button[type="submit"]').click();
        await page.waitForLoadState();
        const csv = await page.request.get('/admin/activity-log.php?export=csv');
        expect(csv.headers()['content-type']).toContain('csv');
        expect(await csv.text()).toContain(account.username);
        await page.selectOption('#activity-per-page', '100');
        await expect(page).toHaveURL(/per_page=100/);
        await page.click('#clearLogBtn');
        await expect(page.locator('#clearLogModal')).toBeVisible();
        await page.click('#clearLogCancel');
        await expect(page.locator('#clearLogModal')).toBeHidden();
        await expect(page.locator('table')).toContainText(account.username);
        await page.click('#clearLogBtn');
        await page.locator('#clearLogModal button[type="submit"]').click();
        await expect(page.locator('table tbody tr', { hasText: account.username })).toHaveCount(0);
        await page.goto('/admin/activity-log.php?per_page=250');
        await expect(page.locator('table tbody tr', { hasText: account.username }), 'gone after a reload too').toHaveCount(0);
    });

    test('rebuild of the master database from its dialog, and the old page leads there', covers('plat.admin.disaster-recovery'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'rebuild');
        const own = await Api.open(playwright, account);
        const note = await own.createNote({ heading: 'Survit à la réparation' });
        await login(page, ADMIN);
        await page.goto('/admin/disaster-recovery.php');
        await expect(page).toHaveURL(/settings\.php/);
        await expect(page.locator('#disasterRecoveryModal')).toBeVisible();
        await page.click('#disasterRecoveryRunBtn');
        await expect(page.locator('#disasterRecoveryResult')).toContainText(/repaired|rebuilt|scanned/i);
        expect((await own.getNote(note.id)).heading).toBe('Survit à la réparation');
        await openAdminCard(page, 'disaster-recovery-card');
        await expect(page.locator('#disasterRecoveryModal')).toBeVisible();
        await own.dispose();
    });

    test('orphan scanner from its dialog: finds a stray file, deletes it after a scan', covers('plat.admin.orphans'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'orphan');
        const own = await Api.open(playwright, account);
        const note = await own.createNote({ heading: 'Avec une pièce' });
        await own.ok(own.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('garde.txt', Buffer.from('garder'), 'text/plain') }));
        const dir = `/var/www/html/data/users/${account.id}/attachments`;
        inInstance(`echo orphelin > ${dir}/egaree-e2e.txt && chown www-data:www-data ${dir}/egaree-e2e.txt`);
        await login(page, ADMIN);
        await page.goto('/admin/orphan-scanner.php');
        await expect(page).toHaveURL(/settings\.php/);
        await expect(page.locator('#orphanScannerModal')).toBeVisible();
        await page.click('#orphanScannerScanBtn');
        await expect(page.locator('#orphanScannerResults')).toContainText('egaree-e2e.txt');
        await expect(page.locator('#orphanScannerResults')).not.toContainText('garde');
        expect(inInstance(`ls ${dir}`), 'scanning deletes nothing').toContain('egaree-e2e.txt');
        await page.click('#orphanScannerDeleteBtn');
        await page.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' }).click();
        await expect.poll(() => inInstance(`ls ${dir}`)).not.toContain('egaree-e2e.txt');
        expect((await own.ok(own.get(`/notes/${note.id}/attachments`))).json.attachments.length, 'the real attachment stays').toBe(1);
        await own.dispose();
    });

    test('SMTP: settings saved, test email really delivered, disabled again', covers('plat.admin.smtp'), async ({ page, playwright }) => {
        // A small SMTP server in the instance: the mailer speaks real SMTP to it
        inInstance(`cat > /tmp/smtp-sink.php <<'PHP'
<?php
$server = @stream_socket_server('tcp://127.0.0.1:9925');
if (!$server) exit;
@mkdir('/tmp/poznote-e2e-mock', 0777, true);
while ($c = @stream_socket_accept($server, 600)) {
    fwrite($c, "220 mock\\r\\n");
    $data = false;
    while (($line = fgets($c)) !== false) {
        file_put_contents('/tmp/poznote-e2e-mock/smtp.log', $line, FILE_APPEND);
        if ($data) { if (rtrim($line) === '.') { $data = false; fwrite($c, "250 ok\\r\\n"); } continue; }
        $verb = strtoupper(substr($line, 0, 4));
        if ($verb === 'DATA') { $data = true; fwrite($c, "354 go\\r\\n"); }
        elseif ($verb === 'QUIT') { fwrite($c, "221 bye\\r\\n"); break; }
        else fwrite($c, "250 ok\\r\\n");
    }
    fclose($c);
}
PHP
rm -f /tmp/poznote-e2e-mock/smtp.log; nohup php /tmp/smtp-sink.php >/dev/null 2>&1 &`);
        const keys = ['smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_security', 'smtp_from_email', 'smtp_from_name'];
        const saved = Object.fromEntries(keys.map((key) => [key, getGlobal(key)]));
        const admin = await adminOf(playwright);
        const previousEmail = (await admin.ok(admin.get('/admin/users/1'))).json.email;
        try {
            await admin.ok(admin.patch('/admin/users/1', { email: 'admin-e2e@example.com' }));
            await login(page, ADMIN);
            await page.goto('/admin/smtp.php');
            await openBoxes(page);
            if (!(await page.locator('#smtp_enabled').isChecked())) await page.locator('#smtp_enabled').evaluate((box) => box.click());
            await page.fill('#smtp_host', '127.0.0.1');
            await page.fill('#smtp_port', '9925');
            await page.selectOption('#smtp_security', 'none');
            await page.fill('#smtp_from_email', 'poznote@example.com');
            await page.fill('#smtp_from_name', 'Poznote Été');
            await page.locator('button[name="action"][value="save"]').click();
            await expect.poll(() => getGlobal('smtp_host')).toBe('127.0.0.1');
            expect(getGlobal('smtp_port')).toBe('9925');
            expect(getGlobal('smtp_enabled')).toBe('1');
            await page.goto('/admin/smtp.php');
            await expect(page.locator('#smtp_from_name')).toHaveValue('Poznote Été');
            await page.locator('button[name="action"][value="test"]').click();
            await expect(page.locator('.alert-success, .success').first()).toContainText('admin-e2e@example.com');
            const received = inInstance('cat /tmp/poznote-e2e-mock/smtp.log');
            expect(received).toContain('RCPT TO:<admin-e2e@example.com>');
            expect(received).toContain('poznote@example.com');
        } finally {
            for (const [key, value] of Object.entries(saved)) setGlobal(key, value);
            await admin.ok(admin.patch('/admin/users/1', { email: previousEmail ?? '' }));
            await admin.dispose();
        }
    });

    test('webhooks of the instance: URL, add, test delivery, real event, edit, disable, delete', covers('plat.admin.webhooks'), async ({ page, playwright }) => {
        await login(page, ADMIN);
        await page.goto('/admin/webhooks.php');
        await openBoxes(page);
        const urlBefore = await page.locator('#app_url').inputValue();
        await page.fill('#app_url', 'https://poznote.example.com/');
        await page.locator('form:has(#app_url) button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        await expect(page.locator('#app_url'), 'the trailing slash is dropped').toHaveValue('https://poznote.example.com');
        await page.fill('#app_url', urlBefore);
        await page.locator('form:has(#app_url) button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        const label = `Crochet ${Date.now()}`;
        const hookUrl = `${MOCK}/webhook?${label.replace(/\D/g, '')}`;
        await page.fill('#webhook_url', hookUrl);
        await page.fill('#webhook_description', label);
        await page.fill('#webhook_secret', 'secret-e2e');
        const boxes = page.locator('input[name="webhook_events[]"]');
        expect(await boxes.count(), 'the events offered').toBeGreaterThan(3);
        for (const box of await boxes.all()) await box.uncheck();
        await page.locator('input[name="webhook_events[]"][value*="user"]').first().check();
        const event = await page.locator('input[name="webhook_events[]"]:checked').first().inputValue();
        await page.locator('form:has(#webhook_url) button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        const row = page.locator('.webhooks-item', { hasText: label }).first();
        await expect(row).toBeVisible();
        const logged = () => inInstance(`wget -qO- ${MOCK}/webhook-log`);
        await row.locator('.webhooks-actions-toggle').click();
        await row.locator('button[value="test"]').click();
        await page.waitForLoadState();
        await expect.poll(logged, { message: 'the test delivery' }).toMatch(/test|ping/i);
        const beforeEvent = logged().length;
        await newAccount(playwright, 'hookevent');
        await expect.poll(() => logged().length, { message: `the ${event} event`, timeout: 15_000 }).toBeGreaterThan(beforeEvent);
        expect(logged()).toContain(event);
        await openBoxes(page);
        const again = page.locator('.webhooks-item', { hasText: label }).first();
        await again.locator('.webhooks-actions-toggle').click();
        await again.locator('button[value="disable"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        const third = page.locator('.webhooks-item', { hasText: label }).first();
        await third.locator('.webhooks-actions-toggle').click();
        await expect(third.locator('button[value="enable"]')).toBeAttached();
        await third.locator('button[value="delete"]').click();
        const confirm = page.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' });
        if (await confirm.count()) await confirm.click();
        await page.waitForLoadState();
        await expect(page.locator('body')).not.toContainText(label);
    });

    test('instance statistics card: token shown once, public switch, revoke', covers('plat.admin.statistics'), async ({ page, playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        await login(page, ADMIN);
        await openAdminCard(page, 'statistics-token-card');
        await expect(page.locator('#stEndpoint')).toContainText('/api/v1/public/statistics');
        await page.locator('#statisticsTokenModal button', { hasText: /Generate/ }).click();
        await expect(page.locator('#stSecret')).not.toBeEmpty();
        const token = await page.locator('#stSecret').innerText();
        expect(token).toMatch(/^pzs_/);
        const open = await anonymous.get('/api/v1/public/statistics', { headers: { Authorization: `Bearer ${token}` } });
        expect(open.status()).toBe(200);
        expect((await open.json()).users.total).toBeGreaterThan(0);
        await page.check('#stPublic');
        await expect.poll(async () => (await anonymous.get('/api/v1/public/statistics')).status()).toBe(200);
        await page.uncheck('#stPublic');
        await expect.poll(async () => (await anonymous.get('/api/v1/public/statistics')).status()).toBe(401);
        await page.locator('#statisticsTokenModal button', { hasText: /Revoke/ }).click();
        const armed = page.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' });
        await expect(armed.or(page.locator('#statisticsTokenModal button', { hasText: /Confirm/ })).first()).toBeVisible();
        await armed.or(page.locator('#statisticsTokenModal button', { hasText: /Confirm/ })).first().click();
        await expect.poll(async () => (await anonymous.get('/api/v1/public/statistics', { headers: { Authorization: `Bearer ${token}` } })).status()).toBeGreaterThanOrEqual(401);
        await anonymous.dispose();
    });

    test('local network access: the list is validated, saved, and lets a normal account reach that host', covers('plat.admin.outbound'), async ({ page, playwright }) => {
        const before = { hosts: getGlobal('outbound_allowed_hosts'), git: getGlobal('git_sync_enabled') };
        const account = await newAccount(playwright, 'outbound');
        const api = await Api.open(playwright, account);
        try {
            setGlobal('outbound_allowed_hosts', '');
            setGlobal('git_sync_enabled', '1');
            await api.ok(api.put('/git-sync/config', { token: 'mock-token', repo: 'mock/repo', branch: 'main', provider: 'forgejo', api_base: `${MOCK}/git`, author_name: 'E2E', author_email: 'e2e@example.com' }));
            expect((await api.ok(api.post('/git-sync/test'))).json.success, 'refused while not listed').toBe(false);
            await login(page, ADMIN);
            await openAdminCard(page, 'outbound-hosts-card');
            await page.fill('#outboundHostsInput', 'pas une entree valide !!');
            await page.click('#saveOutboundHostsBtn');
            await expect(page.locator('#outboundHostsError')).toBeVisible();
            await page.fill('#outboundHostsInput', '127.0.0.1');
            await page.click('#saveOutboundHostsBtn');
            await expect.poll(() => getGlobal('outbound_allowed_hosts')).toBe('127.0.0.1');
            const allowed = await api.ok(api.post('/git-sync/test'));
            expect(allowed.json.success, allowed.text).toBe(true);
        } finally {
            setGlobal('outbound_allowed_hosts', before.hosts);
            setGlobal('git_sync_enabled', before.git);
            await api.dispose();
        }
    });

    test('tenant isolation: blocks chosen abilities for normal accounts', covers('plat.admin.tenant'), async ({ page, playwright }) => {
        const before = getGlobal('tenant_isolation_features');
        const account = await newAccount(playwright, 'tenant');
        const other = await newAccount(playwright, 'tenantother');
        const api = await Api.open(playwright, account);
        const others = () => api.get('/users/profiles');
        expect((await others()).text).toContain(other.username);
        try {
            await login(page, ADMIN);
            await openAdminCard(page, 'tenant-isolation-card');
            const boxes = page.locator('#tenantIsolationModal input[data-tenant-feature]');
            expect(await boxes.evaluateAll((list) => list.map((box) => box.dataset.tenantFeature)), 'the abilities listed').toEqual(['user_sharing', 'user_webhooks', 'user_s3_backups', 'user_s3_restore']);
            await page.locator('#tenantIsolationModal input[data-tenant-feature="user_sharing"]').check();
            await page.click('#saveTenantIsolationBtn');
            await expect.poll(() => getGlobal('tenant_isolation_features')).toContain('user_sharing');
            expect((await others()).status, 'other accounts are out of reach').toBe(403);
        } finally {
            setGlobal('tenant_isolation_features', before);
            await api.dispose();
        }
    });
});

// ================================================================================
// Quotas and the wall between accounts
// ================================================================================
test.describe('quotas and isolation', () => {
    test('max notes per user: the note after the limit is refused, the admin is exempt', covers('plat.quota.notes'), async ({ playwright }) => {
        const account = await newAccount(playwright, 'quotan');
        const api = await Api.open(playwright, account);
        const admin = await Api.open(playwright, ADMIN);
        const count = (await api.ok(api.get('/notes', { params: { limit: 1000 } }))).json.notes.length;
        await api.createNote({ heading: 'Première' });
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { quota_max_notes: count + 2 }));
        await api.createNote({ heading: 'Deuxième, la dernière' });
        const refused = await api.post('/notes', { heading: 'De trop' });
        expect(refused.status, refused.text).toBeGreaterThanOrEqual(400);
        expect(refused.status).toBeLessThan(500);
        expect(refused.text).toMatch(/quota|limit/i);
        expect((await api.ok(api.get('/notes/search', { params: { q: 'De trop' } }))).json.count).toBe(0);
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { quota_max_notes: null }));
        await api.ok(api.post('/notes', { heading: 'Plus de limite' }));
        await api.dispose(); await admin.dispose();
    });

    test('max storage per user: an upload over the limit is refused and not stored', covers('plat.quota.storage'), async ({ playwright }) => {
        const account = await newAccount(playwright, 'quotas');
        const api = await Api.open(playwright, account);
        const admin = await Api.open(playwright, ADMIN);
        const note = await api.createNote({ heading: 'Trop lourde' });
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { quota_max_storage_mb: 1 }));
        const refused = await api.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('gros.bin', Buffer.alloc(2 * 1024 * 1024, 1)) });
        expect(refused.status, refused.text).toBeGreaterThanOrEqual(400);
        expect(refused.text).toMatch(/quota|storage|limit/i);
        expect((await api.ok(api.get(`/notes/${note.id}/attachments`))).json.attachments).toEqual([]);
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { quota_max_storage_mb: 50 }));
        await api.ok(api.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('gros.bin', Buffer.alloc(2 * 1024 * 1024, 1)) }));
        await api.dispose(); await admin.dispose();
    });

    test('the global quotas are set from their dialog and apply to accounts without their own', covers('plat.quota.global'), async ({ page, playwright }) => {
        const before = { notes: getGlobal('user_max_notes'), storage: getGlobal('user_max_storage_mb') };
        const account = await newAccount(playwright, 'quotag');
        const api = await Api.open(playwright, account);
        await api.createNote({ heading: 'Base' });
        const count = (await api.ok(api.get('/notes', { params: { limit: 1000 } }))).json.notes.length;
        try {
            await login(page, ADMIN);
            await openAdminCard(page, 'user-quotas-card');
            await page.fill('#userMaxNotesInput', String(count));
            await page.fill('#userMaxStorageInput', '500');
            await page.click('#saveUserQuotasBtn');
            await expect.poll(() => getGlobal('user_max_notes')).toBe(String(count));
            expect(getGlobal('user_max_storage_mb')).toBe('500');
            await expect(page.locator('#user-quotas-card')).toContainText(String(count));
            const refused = await api.post('/notes', { heading: 'Au-delà de la limite globale' });
            expect(refused.status, refused.text).toBeGreaterThanOrEqual(400);
        } finally {
            setGlobal('user_max_notes', before.notes);
            setGlobal('user_max_storage_mb', before.storage);
            await api.dispose();
        }
    });

    test('the walls between two accounts hold, on every kind of object', covers('plat.isolation.accounts'), async ({ playwright }) => {
        const alice = await newAccount(playwright, 'alice');
        const bob = await newAccount(playwright, 'bob');
        const a = await Api.open(playwright, alice);
        const b = await Api.open(playwright, bob);
        const secret = `secret${Date.now()}`;
        const note = await a.createNote({ heading: `Note de ${secret}`, content: `<p>${secret}</p>`, tags: secret });
        const folder = (await a.ok(a.post('/folders', { folder_name: `Dossier ${secret}`, workspace: 'Poznote' }))).json.folder;
        await a.ok(a.post('/workspaces', { name: `Espace ${secret}` }));
        const up = await a.ok(a.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('s.txt', Buffer.from(secret), 'text/plain') }));
        await b.createNote({ heading: 'Note de Bob' });
        // Same id space in each database: what Bob reads is never Alice's
        const read = await b.get(`/notes/${note.id}`);
        expect(read.text).not.toContain(secret);
        expect((await b.ok(b.get('/notes/search', { params: { q: secret } }))).json.count).toBe(0);
        expect((await b.ok(b.get('/tags'))).text).not.toContain(secret);
        expect((await b.ok(b.get('/folders'))).text).not.toContain(secret);
        expect((await b.ok(b.get('/workspaces'))).text).not.toContain(secret);
        expect((await b.get(`/notes/${note.id}/attachments/${up.json.attachment_id}`)).text).not.toContain(secret);
        // Alice's credentials naming Bob's profile, without any grant
        const forged = await Api.open(playwright, { ...alice, id: bob.id });
        expect((await forged.get('/notes')).status, 'X-User-ID of another account').toBe(403);
        await forged.dispose();
        expect((await a.getNote(note.id)).heading).toContain(secret);
        const folderRead = await b.get(`/folders/${folder.id}`);
        expect(folderRead.text).not.toContain(secret);
        await a.dispose(); await b.dispose();
    });

    test('a public link shows that note only, and a password protects it', covers('plat.isolation.public'), async ({ playwright, browser }) => {
        const account = await newAccount(playwright, 'publink');
        const api = await Api.open(playwright, account);
        const shown = await api.createNote({ heading: 'Montrée', content: '<p>visible</p>' });
        await api.createNote({ heading: 'Cachée', content: '<p>invisible</p>' });
        const created = (await api.ok(api.post(`/notes/${shown.id}/share`, { password: 'motdepasse' }))).json;
        const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
        const page = await context.newPage();
        await page.goto(`/public_note.php?token=${created.url.split('/').pop()}`);
        await expect(page.locator('body')).not.toContainText('visible');
        await page.locator('input[type="password"]').fill('mauvais');
        await page.keyboard.press('Enter');
        await expect(page.locator('body')).not.toContainText('visible');
        await page.locator('input[type="password"]').fill('motdepasse');
        await page.keyboard.press('Enter');
        await expect(page.locator('body')).toContainText('visible');
        await expect(page.locator('body')).not.toContainText('invisible');
        await context.close();
        await api.dispose();
    });
});

// ================================================================================
// Security, seen from outside
// ================================================================================
test.describe('security', () => {
    // The browser logs the refusals these tests provoke on purpose
    test.use({ allowedErrors: [/Failed to load resource: (the server responded with a status of 40\d|net::ERR_BLOCKED_BY_RESPONSE)/] });
    const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';

    test('security headers on pages and on the API', covers('plat.security.headers'), async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
        const page = (await anonymous.get('/login.php')).headers();
        expect(page['x-content-type-options']).toContain('nosniff');
        expect(page['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);
        expect(page['content-security-policy']).toContain("default-src 'self'");
        expect(page['referrer-policy']).toBeTruthy();
        const api = (await anonymous.get('/api/v1/notes')).headers();
        expect(api['x-content-type-options']).toContain('nosniff');
        expect(api['content-type']).toContain('application/json');
        await anonymous.dispose();
    });

    test('the session cookie is HttpOnly and SameSite', covers('plat.security.cookie'), async ({ page, context, playwright }) => {
        const account = await newAccount(playwright, 'cookie');
        await page.goto('/login.php');
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await signedIn(page);
        const session = (await context.cookies()).find((cookie) => /sess/i.test(cookie.name));
        expect(session, (await context.cookies()).map((c) => c.name).join()).toBeTruthy();
        expect(session.httpOnly).toBe(true);
        expect(['Lax', 'Strict']).toContain(session.sameSite);
    });

    test('state-changing forms refuse a missing or wrong CSRF token', covers('plat.security.csrf'), async ({ page, playwright }) => {
        const admin = await Api.open(playwright, ADMIN);
        await login(page, ADMIN);
        const name = `csrf-${Date.now()}`;
        const created = await page.request.post('/admin/users.php', { form: { action: 'create', username: name, csrf_token: 'faux' } });
        expect(created.status()).toBeLessThan(500);
        expect((await admin.ok(admin.get('/admin/users', { params: { q: name } }))).text, 'admin/users.php').not.toContain(name);
        const before = getGlobal('smtp_host');
        await page.request.post('/admin/smtp.php', { form: { action: 'save', smtp_host: 'evil.example.com' } });
        expect(getGlobal('smtp_host'), 'admin/smtp.php').toBe(before);
        const beforeIssuer = getGlobal('oidc_issuer');
        await page.request.post('/admin/oidc.php', { form: { oidc_issuer: 'https://evil.example.com', csrf_token: 'faux' } });
        expect(getGlobal('oidc_issuer'), 'admin/oidc.php').toBe(beforeIssuer);
        const label = `csrf-hook-${Date.now()}`;
        await page.request.post('/admin/webhooks.php', { form: { action: 'add', webhook_url: 'https://evil.example.com/', webhook_description: label, csrf_token: 'faux' } });
        expect(await (await page.request.get('/admin/webhooks.php')).text(), 'admin/webhooks.php').not.toContain(label);
        await page.request.post('/user-webhooks.php', { form: { action: 'add', webhook_url: 'https://evil.example.com/', webhook_description: label, csrf_token: 'faux' } });
        expect(await (await page.request.get('/user-webhooks.php')).text(), 'user-webhooks.php').not.toContain(label);
        await admin.dispose();
    });

    test('the login form refuses a wrong CSRF token even with the right password', covers('plat.security.login-csrf'), async ({ page, playwright, context }) => {
        const account = await newAccount(playwright, 'logincsrf');
        await page.goto('/login.php');
        await page.locator('input[name="csrf_token"]').first().evaluate((input) => { input.value = 'faux'; });
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await expect(page.locator('.error')).toBeVisible();
        expect((await context.request.get('/index.php', { maxRedirects: 0 })).status()).toBe(302);
    });

    test('a page of another site cannot act with the session of the visitor', covers('plat.security.api-csrf'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'apicsrf');
        const api = await Api.open(playwright, account);
        await login(page, account);
        // localhost is another site than 127.0.0.1 for the browser, and stays on the loopback it may reach
        await page.goto(`http://localhost:${new URL(BASE_URL).port}/api_health.php`);
        await page.evaluate(async (url) => {
            await fetch(`${url}/api/v1/notes`, { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ heading: 'Forgée ailleurs' }) }).catch(() => {});
        }, BASE_URL);
        expect((await api.ok(api.get('/notes/search', { params: { q: 'Forgée ailleurs' } }))).json.count).toBe(0);
        await api.dispose();
    });

    test('stored XSS attempts in a title, tag, folder and content do not run', covers('plat.security.xss'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'xss');
        const api = await Api.open(playwright, account);
        expect((await api.post('/folders', { folder_name: `Dossier ${XSS}`, workspace: 'Poznote' })).status, 'markup in a folder name is refused').toBe(400);
        const folder = (await api.ok(api.post('/folders', { folder_name: `Dossier onmouseover=window.__xss=1 ${Date.now()}`, workspace: 'Poznote' }))).json.folder;
        const note = await api.createNote({ heading: `Titre ${XSS}`, content: `<p>corps</p>${XSS}<a href="javascript:window.__xss=1">lien</a>`, tags: `etiq${XSS}`, folder_id: folder.id });
        const markdown = await api.createNote({ heading: 'Markdown piégé', type: 'markdown', content: `# t\n\n${XSS}\n\n[lien](javascript:window.__xss=1)` });
        await login(page, account);
        for (const url of [`/index.php?note=${note.id}`, `/index.php?note=${markdown.id}`, '/notes_manager.php', '/list_tags.php', '/list_folders.php', '/dashboard.php', '/favorites.php', '/trash.php']) {
            await page.goto(url);
            await settled(page);
            expect(await page.evaluate(() => window.__xss), `script ran on ${url}`).toBeUndefined();
        }
        await page.goto(`/index.php?note=${note.id}`);
        await settled(page);
        await expect(page.locator(`#entry${note.id} script`)).toHaveCount(0);
        await expect(page.locator(`#entry${note.id} img[onerror]`)).toHaveCount(0);
        const link = page.locator(`#entry${note.id} a`, { hasText: 'lien' });
        if (await link.count()) expect(await link.first().getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
        // On the public page too, for an anonymous visitor
        const token = (await api.ok(api.post(`/notes/${note.id}/share`, {}))).json.url.split('/').pop();
        await page.goto(`/public_note.php?token=${token}`);
        await settled(page);
        expect(await page.evaluate(() => window.__xss), 'public page').toBeUndefined();
        await api.dispose();
    });

    test('an XSS in the URL of a page or in an account name is escaped', covers('plat.security.reflected'), async ({ page, playwright }) => {
        const name = `x${Date.now()}<img src=x onerror=window.__xss=1>`;
        const admin = await Api.open(playwright, ADMIN);
        const created = await admin.post('/admin/users', { username: name });
        await login(page, ADMIN);
        if (created.status < 300) {
            await page.goto('/admin/users.php?per_page=250');
            expect(await page.evaluate(() => window.__xss), 'username in the users table').toBeUndefined();
            await admin.ok(admin.del(`/admin/users/${created.json.id}`));
        }
        const attempt = encodeURIComponent('"><img src=x onerror=window.__xss=1>');
        for (const url of ['/admin/users.php?q=', '/admin/activity-log.php?q=', '/admin/storage-stats.php?q=']) {
            await page.goto(`${url}${attempt}`);
            expect(await page.evaluate(() => window.__xss), url).toBeUndefined();
        }
        await page.context().clearCookies();
        for (const url of ['/login.php?oidc_error=1&msg=', '/login.php?oidc_error=no_profile&identifier=', '/login.php?redirect=']) {
            await page.goto(`${url}${attempt}`);
            expect(await page.evaluate(() => window.__xss), url).toBeUndefined();
        }
        await admin.dispose();
    });

    test('the databases, the backups, the secrets and the sources are not served', covers('plat.security.files'), async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
        const account = await newAccount(playwright, 'files');
        const api = await Api.open(playwright, account);
        await api.createNote({ heading: 'Crée la base' });
        const backup = (await api.ok(api.post('/backups'))).json.backup_file;
        for (const url of ['/data/master.db', '/master.db', '/data/database/poznote.db', `/data/users/${account.id}/database/poznote.db`, `/data/users/${account.id}/backups/${backup}`, '/data/.mcp_token', '/.mcp_token', '/.env', '/config.php.bak', '/.git/config', '/auth.php', '/data/sessions/']) {
            const response = await anonymous.get(url);
            expect(response.status(), `${url} answered ${response.status()}`).toBeGreaterThanOrEqual(400);
        }
        await api.dispose(); await anonymous.dispose();
    });

    test('path traversal is refused on attachments and backups', covers('plat.security.traversal'), async ({ playwright }) => {
        const account = await newAccount(playwright, 'traverse');
        const api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'Traversée' });
        for (const name of ['..%2F..%2Fdatabase%2Fpoznote.db', '..%2F..%2F..%2Fmaster.db', '%2Fetc%2Fpasswd', 'poznote_backup_..%2F..%2Fmaster.zip', '....%2F....%2Fetc%2Fpasswd']) {
            const download = await api.get(`/backups/${name}`);
            expect(download.status, `GET /backups/${name}`).toBeGreaterThanOrEqual(400);
            expect(download.text).not.toContain('root:');
            expect((await api.del(`/backups/${name}`)).status, `DELETE /backups/${name}`).toBeGreaterThanOrEqual(400);
            expect((await api.post(`/backups/${name}/restore`)).status, `restore ${name}`).toBeGreaterThanOrEqual(400);
            const attachment = await api.get(`/notes/${note.id}/attachments/${name}`);
            expect(attachment.status, `attachment ${name}`).toBeGreaterThanOrEqual(400);
            expect(attachment.text).not.toContain('root:');
        }
        const evil = await api.call('POST', `/notes/${note.id}/attachments`, { multipart: multipartFile('../../../../../../tmp/echappee.txt', Buffer.from('x'), 'text/plain') });
        expect(inInstance('ls /tmp'), 'the file name cannot leave the folder').not.toContain('echappee.txt');
        if (evil.status < 300) {
            const stored = (await api.ok(api.get(`/notes/${note.id}/attachments`))).json.attachments[0];
            expect(stored.filename).not.toContain('/');
        }
        await api.dispose();
    });

    test('a library next to the pages answers nothing when called directly', covers('plat.security.pages'), async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
        const response = await anonymous.get('/oidc.php');
        expect(response.status()).toBe(200);
        expect((await response.text()).trim()).toBe('');
        await anonymous.dispose();
    });

    test('a request without session is sent to the login page by every page', covers('plat.security.pages'), async ({ playwright }) => {
        const { inventory } = require('../lib/inventory');
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL, maxRedirects: 0 });
        const open = new Set(['login.php', 'logout.php', 'public_note.php', 'public_folder.php', 'public_slug.php', 'oidc_login.php', 'oidc_callback.php', 'oauth/authorize.php', 'oauth/introspect.php', 'oauth/register.php', 'oauth/revoke.php', 'oauth/token.php', 'api_health.php', 'api_branding.php', 'dark_mode_css.php', 'index_css.php', 'index_js.php', 'offline.php', 'pwa/manifest.php', 'open_shared.php', 'oidc.php']);
        for (const url of inventory().page.filter((name) => !open.has(name))) {
            const response = await anonymous.get(`/${url}`);
            const status = response.status();
            const redirected = status >= 300 && status < 400 && /login\.php/.test(response.headers().location ?? '');
            expect(redirected || status === 401 || status === 403 || status === 405, `/${url} answered ${status} to an anonymous visitor: ${(await response.text()).slice(0, 80)}`).toBe(true);
        }
        await anonymous.dispose();
    });
});

// ================================================================================
// AI assistant, driven from its panel against the scripted model of the mock
// ================================================================================
test.describe('AI assistant', () => {
    /** A new account with the assistant allowed, as the admin page does. */
    async function aiAccount(playwright, prefix = 'ai') {
        const account = await newAccount(playwright, prefix);
        const admin = await Api.open(playwright, ADMIN);
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { ai_chat_enabled: 1 }));
        await admin.dispose();
        return { account, api: await Api.open(playwright, account) };
    }
    /** The panel stays open from one page to the next. */
    async function openPanel(page) {
        const open = await page.locator('#ai-chat-panel').evaluate((panel) => panel.classList.contains('ai-chat-open'));
        if (!open) await page.click('#edgeAiChatBtn');
        await expect(page.locator('#ai-chat-panel')).toHaveClass(/ai-chat-open/);
        await expect(page.locator('#ai-chat-input')).toBeVisible();
    }
    const assistant = (page) => page.locator('.ai-chat-msg-assistant').last();
    async function send(page, text) {
        await page.fill('#ai-chat-input', text);
        await page.press('#ai-chat-input', 'Enter');
    }
    const finished = (page) => expect(page.locator('.ai-chat-pending')).toHaveCount(0, { timeout: 20_000 });
    const lastRequest = () => JSON.parse(inInstance('tail -n 1 /tmp/poznote-e2e-mock/ai.log'));

    test('the panel opens, answers with what the model streams, and closes', covers('plat.ai.panel'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await expect(page.locator('.ai-chat-empty')).toBeVisible();
        await expect(page.locator('.ai-chat-model-link')).toContainText('mock-model');
        await expect(page.locator('#ai-chat-workspace-name')).toHaveText('Poznote');
        await send(page, 'Bonjour é');
        await expect(page.locator('.ai-chat-msg-user').last()).toContainText('Bonjour é');
        await expect(assistant(page)).toContainText('Bonjour depuis le mock');
        await finished(page);
        await expect(page.locator('#ai-chat-input')).toHaveValue('');
        const sent = lastRequest();
        expect(sent.messages.at(-1)).toMatchObject({ role: 'user', content: 'Bonjour é' });
        expect(sent.model).toBe('mock-model');
        expect(sent.tools.map((tool) => tool.function.name), 'the tools offered to the model').toEqual(expect.arrayContaining(['search_notes', 'get_note', 'update_note_content', 'create_note']));
        await expect(page.locator('#ai-chat-panel')).toHaveClass(/ai-chat-open/);
        await page.locator('#ai-chat-panel [data-action="toggle-ai-chat"]').click();
        await expect(page.locator('#ai-chat-panel')).not.toHaveClass(/ai-chat-open/);
        await api.dispose();
    });

    test('Shift+Enter makes a new line, an empty message is not sent, the workspace dialog explains', covers('plat.ai.input'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await page.locator('#ai-chat-input').pressSequentially('un');
        await page.press('#ai-chat-input', 'Shift+Enter');
        await page.locator('#ai-chat-input').pressSequentially('deux');
        await expect(page.locator('#ai-chat-input')).toHaveValue('un\ndeux');
        await expect(page.locator('.ai-chat-msg-user')).toHaveCount(0);
        await page.fill('#ai-chat-input', '   ');
        await page.press('#ai-chat-input', 'Enter');
        await expect(page.locator('.ai-chat-msg-user')).toHaveCount(0);
        await page.locator('#ai-chat-workspace button[data-action="ai-chat-workspace-info"][title]').click();
        await expect(page.locator('#aiChatWorkspaceInfoModal')).toBeVisible();
        await page.locator('#aiChatWorkspaceInfoModal [data-action="ai-chat-workspace-info-close"]').click();
        await expect(page.locator('#aiChatWorkspaceInfoModal')).toBeHidden();
        await page.locator('#ai-chat-workspace button[data-action="ai-chat-workspace-info"][title]').click();
        await page.locator('#aiChatWorkspaceInfoModal [data-action="ai-chat-open-dashboard"]').click();
        await expect(page).toHaveURL(/dashboard\.php/);
        await api.dispose();
    });

    test('stop cuts the answer while it streams, and the panel is usable again', covers('plat.ai.stop'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await send(page, 'SLOW');
        await expect(assistant(page), 'the answer arrives bit by bit').toContainText('morceau1');
        const seen = await assistant(page).innerText();
        expect(seen).not.toContain('morceau39');
        await expect(page.locator('#ai-chat-send .ai-chat-stop-icon')).toBeVisible();
        await page.click('#ai-chat-send');
        await expect(page.locator('#ai-chat-send .lucide-arrow-up')).toBeVisible();
        const stopped = await assistant(page).innerText();
        await page.waitForTimeout(800);
        expect(await assistant(page).innerText(), 'nothing more arrives').toBe(stopped);
        expect(stopped).not.toContain('morceau39');
        await send(page, 'Encore');
        await expect(assistant(page)).toContainText('Bonjour depuis le mock');
        await api.dispose();
    });

    test('conversations: kept across a reload, listed, reopened, new one, deleted', covers('plat.ai.conversations'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await send(page, 'Première question');
        await expect(assistant(page)).toContainText('depuis le mock');
        await finished(page);
        const stored = async () => (await (await page.request.get('/api_ai_chat.php?action=conversations&workspace=Poznote')).json()).conversations;
        await expect.poll(async () => (await stored()).length).toBe(1);
        await page.reload();
        await expect(page.locator('#ai-chat-panel'), 'it stays open after a reload').toHaveClass(/ai-chat-open/);
        await expect(page.locator('.ai-chat-msg-user').last(), 'restored after a reload').toContainText('Première question');

        await page.locator('[data-action="ai-chat-new"]').click();
        await expect(page.locator('.ai-chat-msg-user')).toHaveCount(0);
        await send(page, 'Deuxième question');
        await expect(assistant(page)).toContainText('depuis le mock');
        await finished(page);
        await expect.poll(async () => (await stored()).length).toBe(2);

        await page.locator('[data-action="ai-chat-history"]').click();
        const rows = page.locator('.ai-chat-history-row');
        await expect(rows).toHaveCount(2);
        await expect(page.locator('.ai-chat-history-current')).toContainText('Deuxième');
        await rows.filter({ hasText: 'Première' }).locator('.ai-chat-history-open').click();
        await expect(page.locator('.ai-chat-msg-user').last()).toContainText('Première question');
        await expect(page.locator('#ai-chat-history')).toBeHidden();

        await page.locator('[data-action="ai-chat-history"]').click();
        await rows.filter({ hasText: 'Deuxième' }).locator('.ai-chat-history-delete').click();
        await expect(rows).toHaveCount(1);
        await expect.poll(async () => (await stored()).length).toBe(1);
        await page.locator('[data-action="ai-chat-history"]').click();

        await page.locator('[data-action="ai-chat-clear"]').click();
        const confirm = page.locator('.alert-modal-button').filter({ hasNotText: 'Cancel' });
        await expect(confirm.or(page.locator('.ai-chat-empty')).first()).toBeVisible();
        if (await confirm.count()) await confirm.click();
        await expect(page.locator('.ai-chat-msg-user')).toHaveCount(0);
        await expect.poll(async () => (await stored()).length).toBe(0);
        await api.dispose();
    });

    test('the copy button of an answer copies it', covers('plat.ai.copy'), async ({ page, playwright, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await send(page, 'Copie');
        await expect(assistant(page)).toContainText('depuis le mock');
        await finished(page);
        await assistant(page).hover();
        await page.locator('.ai-chat-msg-assistant + .ai-chat-copy').last().click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Bonjour depuis le mock');
        await api.dispose();
    });

    test('the open note is the context: named in the panel and sent to the model', covers('plat.ai.note-context'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        const note = await api.createNote({ heading: 'Note en contexte', content: '<p>contenu du contexte</p>' });
        await login(page, account);
        await openNote(page, note.id);
        await openPanel(page);
        await expect(page.locator('#ai-chat-context')).toBeVisible();
        await expect(page.locator('#ai-chat-context-title')).toHaveText('Note en contexte');
        await send(page, 'Résume cette note');
        await expect(assistant(page)).toContainText('depuis le mock');
        expect(JSON.stringify(lastRequest().messages[0]), 'the system prompt names the open note').toContain(String(note.id));
        await send(page, `TOOL:get_note:${JSON.stringify({ note_id: note.id })}`);
        await expect(assistant(page), 'the model read the note through the tool').toContainText('contenu du contexte');
        await expect(page.locator('.ai-chat-tool').last()).toBeVisible();
        await api.dispose();
    });

    test('the assistant applies a change to the open note, which refreshes, with a snapshot to go back', covers('plat.ai.apply'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        const note = await api.createNote({ heading: 'À réécrire', content: '<p>ancien texte</p>' });
        await login(page, account);
        await openNote(page, note.id);
        await openPanel(page);
        await send(page, `TOOL:update_note_content:${JSON.stringify({ note_id: note.id, content: 'Nouveau texte écrit par le modèle' })}`);
        await expect(assistant(page)).toContainText('Outil terminé');
        await finished(page);
        expect((await api.getNote(note.id)).content).toContain('Nouveau texte écrit par le modèle');
        await expect(page.locator(`#entry${note.id}`), 'the open note shows it').toContainText('Nouveau texte écrit par le modèle');
        const snapshots = (await api.ok(api.get(`/notes/${note.id}/snapshots`))).json.snapshots;
        expect(snapshots.length, 'a safety snapshot before the rewrite').toBeGreaterThan(0);
        const before = (await api.ok(api.get(`/notes/${note.id}/snapshot`, { params: { snapshot_key: snapshots[0].snapshot_key } }))).json.snapshot;
        expect(before.content).toContain('ancien texte');
        expect(before.origin).toMatch(/ai/);
        await api.dispose();
    });

    test.describe('when the server cannot be reached', () => {
        // The browser logs the request this test cuts on purpose
        test.use({ allowedErrors: [/net::ERR_FAILED/] });

        test('a failing model shows an error with a retry button', covers('plat.ai.error'), async ({ page, playwright }) => {
            const { account, api } = await aiAccount(playwright);
            await login(page, account);
            await page.goto('/index.php');
            await openPanel(page);
            await page.route('**/api_ai_chat.php?action=chat*', (route) => route.abort());
            await send(page, 'Échec');
            await expect(page.locator('.ai-chat-msg-error')).toBeVisible();
            await page.unroute('**/api_ai_chat.php?action=chat*');
            await page.locator('.ai-chat-retry').click();
            await expect(assistant(page)).toContainText('depuis le mock');
            await api.dispose();
        });
    });

    test('every built-in tool does what it says', covers('plat.ai.tools'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        const run = async (name, args) => {
            const response = await page.request.post('/api_ai_chat.php?action=chat', { data: { workspace: 'Poznote', messages: [{ role: 'user', content: `TOOL:${name}:${JSON.stringify(args)}` }] } });
            const text = await response.text();
            expect(text, `${name}: ${text.slice(0, 300)}`).toContain('Outil termin');
            return text;
        };
        const note = await api.createNote({ heading: 'Outils IA', content: '<p>texte cherché ici</p>', tags: 'avant' });
        const list = await api.createNote({ heading: 'Tâches IA', type: 'tasklist', content: '[]' });
        const folderName = `Classeur ${Date.now()}`;
        const tasks = () => api.get(`/notes/${list.id}/tasks`).then((r) => r.json.tasks);
        await api.ok(api.put('/settings/timezone', { value: 'UTC' }));
        const CHECKS = {
            search_notes: async () => expect(await run('search_notes', { query: 'cherché' })).toContain('Outils IA'),
            get_note: async () => expect(await run('get_note', { note_id: note.id })).toContain('cherch'),
            list_recent_notes: async () => expect(await run('list_recent_notes', { limit: 5 })).toContain('Outils IA'),
            rename_note: async () => { await run('rename_note', { note_id: note.id, new_title: 'Outils renommés' }); expect((await api.getNote(note.id)).heading).toBe('Outils renommés'); },
            update_note_content: async () => { await run('update_note_content', { note_id: note.id, content: 'réécrite' }); expect((await api.getNote(note.id)).content).toContain('réécrite'); },
            replace_in_note: async () => {
                await run('replace_in_note', { note_id: note.id, replacements: [{ find: 'réécrite', replace: 'corrigée é' }] });
                const content = (await api.getNote(note.id)).content;
                expect(content).toContain('corrigée é');
                expect(content).not.toContain('réécrite');
            },
            create_note: async () => { await run('create_note', { title: 'Créée par IA', content: 'corps', tags: ['ia'] }); expect((await api.ok(api.get('/notes/search', { params: { q: 'Créée par IA' } }))).json.count).toBe(1); },
            update_note_tags: async () => { await run('update_note_tags', { note_id: note.id, add: ['ajoutée'], remove: ['avant'] }); expect((await api.getNote(note.id)).tags).toBe('ajoutée'); },
            list_tags: async () => expect(await run('list_tags', {})).toContain('ajout'),
            create_folder: async () => { await run('create_folder', { path: folderName }); expect((await api.ok(api.get('/folders'))).json.folders.map((f) => f.name)).toContain(folderName); },
            list_folders: async () => expect(await run('list_folders', {})).toContain(folderName),
            move_note_to_folder: async () => { await run('move_note_to_folder', { note_id: note.id, folder: folderName }); expect((await api.getNote(note.id)).folder).toBe(folderName); },
            set_note_favorite: async () => { await run('set_note_favorite', { note_id: note.id, favorite: true }); expect((await api.getNote(note.id)).favorite).toBe(1); },
            set_folder_favorite: async () => { await run('set_folder_favorite', { folder: folderName, favorite: true }); expect(sqlOne(account.id, `SELECT favorite FROM folders WHERE name = '${folderName}'`)).toBe('1'); },
            rename_folder: async () => { await run('rename_folder', { folder: folderName, new_name: `${folderName} bis` }); expect((await api.ok(api.get('/folders'))).json.folders.map((f) => f.name)).toContain(`${folderName} bis`); },
            set_note_reminder: async () => { await run('set_note_reminder', { note_id: note.id, reminder_at: FUTURE, message: 'par ia' }); expect((await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at).toBe(FUTURE); },
            remove_note_reminder: async () => { await run('remove_note_reminder', { note_id: note.id }); expect((await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at).toBeNull(); },
            add_task: async () => { await run('add_task', { note_id: list.id, text: 'tâche ia', important: true }); expect((await tasks())[0]).toMatchObject({ text: 'tâche ia', important: true }); },
            update_task: async () => { await run('update_task', { note_id: list.id, task: String((await tasks())[0].id), text: 'tâche changée', completed: true }); expect((await tasks())[0]).toMatchObject({ text: 'tâche changée', completed: true }); },
            add_subtask: async () => { await run('add_subtask', { note_id: list.id, task: String((await tasks())[0].id), text: 'sous ia' }); expect((await tasks())[0].subtasks[0].text).toBe('sous ia'); },
            update_subtask: async () => { const [task] = await tasks(); await run('update_subtask', { note_id: list.id, task: String(task.id), subtask: String(task.subtasks[0].id), completed: true }); expect((await tasks())[0].subtasks[0].completed).toBe(true); },
            delete_subtask: async () => { const [task] = await tasks(); await run('delete_subtask', { note_id: list.id, task: String(task.id), subtask: String(task.subtasks[0].id) }); expect((await tasks())[0].subtasks ?? []).toEqual([]); },
            delete_task: async () => { await run('delete_task', { note_id: list.id, task: String((await tasks())[0].id) }); expect(await tasks()).toEqual([]); },
            set_checklist_item: async () => {
                const checklist = await api.createNote({ heading: 'Cases', type: 'markdown', content: '- [ ] première\n- [ ] seconde' });
                await run('set_checklist_item', { note_id: checklist.id, item: 'seconde', completed: true });
                expect((await api.getNote(checklist.id)).content).toContain('- [x] seconde');
            },
            delete_note: async () => { await run('delete_note', { note_id: note.id }); expect((await api.ok(api.get('/trash'))).json.notes.map((n) => n.id)).toContain(note.id); },
            delete_folder: async () => { await run('delete_folder', { folder: `${folderName} bis` }); expect((await api.ok(api.get('/folders'))).json.folders.map((f) => f.name)).not.toContain(`${folderName} bis`); },
        };
        for (const [name, check] of Object.entries(CHECKS)) await check(name);
        const { tools } = lastRequest();
        expect(tools.map((tool) => tool.function.name).sort(), 'the tools offered to the model, each with its check above').toEqual(Object.keys(CHECKS).sort());
        await api.dispose();
    });

    test('per-note diagrams: the model sees a placeholder, and a rewrite keeps the diagram intact', covers('plat.ai.diagrams'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        const scene = JSON.stringify({ elements: [{ type: 'rectangle', id: 'e2e-rect' }] }).replace(/"/g, '&quot;');
        const container = `<div class="excalidraw-container" id="diagram-e2e" data-excalidraw="${scene}"><img src="data:image/png;base64,${PNG.toString('base64')}" alt="d"></div>`;
        const note = await api.createNote({ heading: 'Avec un schéma', content: `<p>avant</p>${container}<p>après</p>` });
        await login(page, account);
        const chat = (args, name) => page.request.post('/api_ai_chat.php?action=chat', { data: { workspace: 'Poznote', note_id: note.id, messages: [{ role: 'user', content: `TOOL:${name}:${JSON.stringify(args)}` }] } }).then((r) => r.text());
        const stream = await chat({ note_id: note.id }, 'get_note');
        // The text of the answer, out of the event stream and of the JSON of the tool
        const read = stream.split('\n').filter((line) => line.startsWith('data: {"choices"')).map((line) => JSON.parse(line.slice(6)).choices[0].delta.content).join('').replace(/\\\//g, '/');
        expect(read, read.slice(0, 500)).toContain('/poznote-diagram/');
        expect(read).not.toContain('e2e-rect');
        const placeholder = /\/poznote-diagram\/[A-Za-z0-9_-]+/.exec(read)[0];
        await chat({ note_id: note.id, content: `Texte neuf\n\n![schéma](${placeholder})` }, 'update_note_content');
        const stored = (await api.getNote(note.id)).content;
        expect(stored).toContain('Texte neuf');
        expect(stored, 'the scene is back').toContain('e2e-rect');
        expect(stored).toContain('excalidraw-container');
        await api.dispose();
    });

    test('a dashboard on several workspaces reads them all and writes nothing', covers('plat.ai.multi-workspace'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        const other = `Second ${Date.now()}`;
        await api.ok(api.post('/workspaces', { name: other }));
        const note = await api.createNote({ heading: 'Dans le second espace', content: '<p>trouvable partout</p>', workspace: other });
        await login(page, account);
        await page.goto('/dashboard.php?scope=all');
        await settled(page);
        await page.click('#edgeAiChatBtn');
        await expect(page.locator('#ai-chat-workspace')).toContainText('(read only)');
        await expect(page.locator('#ai-chat-workspace-name')).toContainText(other);
        await send(page, `TOOL:search_notes:${JSON.stringify({ query: 'trouvable' })}`);
        await expect(assistant(page)).toContainText('Dans le second espace');
        await finished(page);
        const sent = lastRequest();
        const names = sent.tools.map((tool) => tool.function.name);
        expect(names).toContain('search_notes');
        expect(names, 'no writing tool is offered').not.toContain('update_note_content');
        expect(names).not.toContain('delete_note');
        await send(page, `TOOL:delete_note:${JSON.stringify({ note_id: note.id })}`);
        await expect(assistant(page)).toContainText('Outil terminé');
        await finished(page);
        expect((await api.getNote(note.id)).heading, 'even when asked by name').toBe('Dans le second espace');
        await api.dispose();
    });

    test('saved prompts: added in the settings, listed in the lightning menu, sent in one click, removed', covers('plat.ai.saved-prompts'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/index.php');
        await openPanel(page);
        await page.click('#ai-chat-prompts-btn');
        await expect(page.locator('.ai-chat-prompts-empty')).toBeVisible();
        await page.locator('.ai-chat-prompts-manage').click();
        await expect(page).toHaveURL(/ai_settings_user\.php/);
        await openBoxes(page);
        await page.click('#ai-prompt-add');
        const fold = page.locator('#ai-prompts-list .ai-prompt').last();
        await fold.locator('input[name="prompt_title[]"]').fill('Résumer');
        await expect(fold.locator('summary'), 'the fold follows the name').toContainText('Résumer');
        await fold.locator('textarea[name="prompt_text[]"]').fill('Résume cette note en trois points');
        await page.click('#ai-prompt-add');
        const second = page.locator('#ai-prompts-list .ai-prompt').last();
        await second.locator('input[name="prompt_title[]"]').fill('À retirer');
        await second.locator('textarea[name="prompt_text[]"]').fill('sera retirée');
        await page.locator('#ai-prompts-form button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        await expect(page.locator('#ai-prompts-list .ai-prompt')).toHaveCount(2);

        await page.goto('/index.php');
        await openPanel(page);
        await page.click('#ai-chat-prompts-btn');
        const prompts = page.locator('.ai-chat-prompt');
        await expect(prompts).toHaveText(['Résumer', 'À retirer']);
        await prompts.first().click();
        await expect(page.locator('.ai-chat-msg-user').last()).toContainText('Résume cette note en trois points');
        await expect(assistant(page)).toContainText('depuis le mock');
        expect(lastRequest().messages.at(-1).content).toBe('Résume cette note en trois points');

        await page.goto('/ai_settings_user.php');
        await openBoxes(page);
        await page.locator('#ai-prompts-list .ai-prompt').last().locator('[data-action="remove-prompt"]').click();
        await page.locator('#ai-prompts-form button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        await expect(page.locator('#ai-prompts-list .ai-prompt')).toHaveCount(1);
        await api.dispose();
    });

    test('custom instructions reach the model and tools can be turned off per person', covers('plat.ai.user-settings'), async ({ page, playwright }) => {
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        await page.goto('/ai_settings_user.php');
        await openBoxes(page);
        await page.fill('#ai_custom_instructions', 'Réponds toujours en alexandrins');
        await page.locator('form:has(#ai_custom_instructions) button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        await expect(page.locator('#ai_custom_instructions')).toHaveValue('Réponds toujours en alexandrins');
        await page.uncheck('#ai_tool_delete_note');
        await page.locator('form:has(#ai_tool_delete_note) button[type="submit"]').click();
        await page.waitForLoadState();
        await openBoxes(page);
        await expect(page.locator('#ai_tool_delete_note')).not.toBeChecked();
        await page.goto('/index.php');
        await openPanel(page);
        await send(page, 'Bonjour');
        await expect(assistant(page)).toContainText('depuis le mock');
        const sent = lastRequest();
        expect(JSON.stringify(sent.messages[0])).toContain('alexandrins');
        expect(sent.tools.map((tool) => tool.function.name), 'the tool turned off').not.toContain('delete_note');
        await api.dispose();
    });

    test('external MCP tools: server added and checked, tool used by the model, switch in the panel, removed', covers('plat.ai.external-tools'), async ({ page }) => {
        const before = { enabled: getGlobal('ai_chat_mcp_enabled') };
        try {
            await login(page, ADMIN);
            await page.goto('/ai_settings.php');
            await openBoxes(page);
            if (!(await page.locator('#mcp_enabled').isChecked())) {
                await page.locator('#mcp_enabled').evaluate((box) => box.click());
                await expect.poll(() => getGlobal('ai_chat_mcp_enabled')).toBe('1');
            }
            await page.reload();
            await openBoxes(page);
            const server = `Serveur ${Date.now()}`;
            await page.fill('#mcp_new_name', server);
            await page.fill('#mcp_new_url', `${MOCK}/mcp`);
            await page.locator('form:has(#mcp_new_name) button[type="submit"]').click();
            await page.waitForLoadState();
            await openBoxes(page);
            const form = page.locator('form:has(input[name="action"][value="mcp_server"])', { hasText: 'mock_tool' }).filter({ has: page.locator(`input[value="${server}"]`) });
            await expect(form, 'the tools of the server are listed').toBeVisible();
            await form.locator('input[name="mcp_tools[]"]').check();
            const enabled = form.locator('input[name="mcp_enabled"]');
            if (!(await enabled.isChecked())) await enabled.check();
            await form.locator('button[value="save"]').click();
            await page.waitForLoadState();
            await openBoxes(page);
            const saved = page.locator('form:has(input[name="action"][value="mcp_server"])').filter({ has: page.locator(`input[value="${server}"]`) });
            await saved.locator('button[value="check"]').click();
            await page.waitForLoadState();
            await openBoxes(page);

            await page.goto('/index.php');
            await openPanel(page);
            await expect(page.locator('#ai-chat-external')).toHaveAttribute('aria-pressed', 'true');
            await send(page, 'Bonjour');
            await expect(assistant(page)).toContainText('depuis le mock');
            await finished(page);
            const exposed = lastRequest().tools.map((tool) => tool.function.name).find((name) => name.endsWith('mock_tool'));
            expect(exposed, 'offered to the model').toBeTruthy();
            await send(page, `TOOL:${exposed}:${JSON.stringify({ question: 'é' })}`);
            await expect(assistant(page), 'the answer of the server reaches the model').toContainText('réponse du mock_tool');
            await finished(page);
            expect(inInstance('cat /tmp/poznote-e2e-mock/mcp-calls.log')).toContain('mock_tool');
            await expect(page.locator('.ai-chat-tool .lucide-globe').last()).toBeVisible();

            await page.click('#ai-chat-external');
            await expect(page.locator('#ai-chat-external')).toHaveAttribute('aria-pressed', 'false');
            await send(page, 'Sans outil externe');
            await expect(assistant(page)).toContainText('depuis le mock');
            await finished(page);
            expect(lastRequest().tools.map((tool) => tool.function.name).filter((name) => name.endsWith('mock_tool')), 'turned off').toEqual([]);
            await page.click('#ai-chat-external');

            await page.goto('/ai_settings.php');
            await openBoxes(page);
            await page.locator('form:has(input[name="action"][value="mcp_server"])').filter({ has: page.locator(`input[value="${server}"]`) }).locator('button[value="delete"]').click();
            await page.waitForLoadState();
            await openBoxes(page);
            await expect(page.locator(`input[value="${server}"]`)).toHaveCount(0);
        } finally {
            setGlobal('ai_chat_mcp_enabled', before.enabled);
        }
    });

    test('a normal account may not point its own server at a local address, unless it is listed', covers('plat.ai.ssrf'), async ({ page, playwright }) => {
        const before = { keys: getGlobal('ai_chat_user_keys_enabled'), hosts: getGlobal('outbound_allowed_hosts') };
        const { account, api } = await aiAccount(playwright);
        await login(page, account);
        const test1 = () => page.request.post('/api_ai_chat.php?action=test', { form: { url: `${MOCK}/v1` } }).then((r) => r.json());
        setGlobal('ai_chat_user_keys_enabled', '');
        expect((await test1()).error, 'personal servers not allowed').toBe('Admin access required');
        setGlobal('ai_chat_user_keys_enabled', '1');
        setGlobal('outbound_allowed_hosts', '');
        try {
            const refused = await test1();
            expect(refused.success, JSON.stringify(refused)).toBe(false);
            expect(JSON.stringify(refused)).toContain('public internet host');
            setGlobal('outbound_allowed_hosts', '127.0.0.1');
            expect((await test1()).success, 'listed by the admin').toBe(true);
        } finally {
            setGlobal('ai_chat_user_keys_enabled', before.keys);
            setGlobal('outbound_allowed_hosts', before.hosts);
            await api.dispose();
        }
    });

    test('the AI settings page: test button lists the models, saved values stay, the account list decides who has it', covers('plat.ai.admin-settings'), async ({ page, playwright, browser }) => {
        const keys = ['ai_chat_enabled', 'ai_chat_provider', 'ai_chat_url', 'ai_chat_model', 'ai_chat_api_key', 'ai_chat_user_keys_enabled', 'ai_chat_reasoning_effort', 'ai_chat_headers'];
        const saved = Object.fromEntries(keys.map((key) => [key, getGlobal(key)]));
        const person = await newAccount(playwright, 'aialoud');
        try {
            await login(page, ADMIN);
            await page.goto('/ai_settings.php');
            await openBoxes(page);
            await expect(page.locator('#ai_enabled')).toBeChecked();
            const providers = await page.locator('#ai_provider option').evaluateAll((list) => list.map((o) => o.value));
            expect(providers.length).toBeGreaterThan(1);
            expect(providers).toContain('custom');
            await page.selectOption('#ai_provider', 'custom');
            await expect(page.locator('#ai_url')).toBeVisible();
            await page.fill('#ai_url', `${MOCK}/v1`);
            await page.click('#ai-test-btn');
            await expect(page.locator('#ai-test-result')).toBeVisible();
            await expect(page.locator('#ai-test-result')).toContainText(/2|mock-model|success/i);
            const models = await page.locator('#ai_model option').evaluateAll((list) => list.map((o) => o.value));
            expect(models, 'the select is filled from the server').toEqual(expect.arrayContaining(['mock-model', 'whisper-1']));
            await page.selectOption('#ai_model', 'whisper-1');
            await page.selectOption('#ai_reasoning_effort', 'low');
            await page.fill('#ai_headers', 'X-Essai: e2e');
            // The account gets the assistant from the list of this page
            await page.fill('#ai-user-filter', person.username);
            await expect(page.locator('.ai-user:visible', { hasText: 'admin_change_me' }), 'the filter').toHaveCount(0);
            await page.locator(`input[name="ai_user_ids[]"][value="${person.id}"]`).check();
            await page.locator('form:has(#ai_enabled) button[type="submit"]').click();
            await page.waitForLoadState();
            await expect.poll(() => getGlobal('ai_chat_model')).toBe('whisper-1');
            expect(getGlobal('ai_chat_reasoning_effort')).toBe('low');
            expect(getGlobal('ai_chat_headers'), 'kept encrypted').toMatch(/^enc1:/);
            await openBoxes(page);
            await expect(page.locator('#ai_reasoning_effort')).toHaveValue('low');
            const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
            const other = await context.newPage();
            await login(other, person);
            await other.goto('/index.php');
            await expect(other.locator('#edgeAiChatBtn'), 'the person has the assistant now').toBeAttached();
            const chat = await other.request.post('/api_ai_chat.php?action=chat', { data: { messages: [{ role: 'user', content: 'ECHO' }] } }).then((r) => r.text());
            expect(chat).toContain('whisper-1');
            await context.close();
        } finally {
            for (const [key, value] of Object.entries(saved)) setGlobal(key, value);
        }
    });

    test('an account without the assistant has no panel and the endpoint refuses', covers('plat.ai.not-allowed'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'noai');
        await login(page, account);
        await page.goto('/index.php');
        await expect(page.locator('#edgeAiChatBtn')).toHaveCount(0);
        const refused = await page.request.post('/api_ai_chat.php?action=chat', { data: { messages: [{ role: 'user', content: 'x' }] } });
        expect(refused.status()).toBe(400);
        expect((await refused.json()).success).toBe(false);
    });

    test('personal keys: when the admin allows them, an account uses its own server', covers('plat.ai.user-keys'), async ({ page, playwright }) => {
        const before = { keys: getGlobal('ai_chat_user_keys_enabled'), hosts: getGlobal('outbound_allowed_hosts') };
        const account = await newAccount(playwright, 'aikey');
        setGlobal('ai_chat_user_keys_enabled', '1');
        setGlobal('outbound_allowed_hosts', '127.0.0.1');
        try {
            await login(page, account);
            await page.goto('/ai_settings_user.php');
            await openBoxes(page);
            await page.locator('#ai_enabled').evaluate((box) => { if (!box.checked) box.click(); });
            await page.selectOption('#ai_provider', 'custom');
            await page.fill('#ai_url', `${MOCK}/v1`);
            await page.click('#ai-test-btn');
            await expect(page.locator('#ai-test-result')).toBeVisible();
            await page.selectOption('#ai_model', 'mock-model');
            await page.locator('form:has(#ai_enabled) button[type="submit"]').click();
            await page.waitForLoadState();
            await page.goto('/index.php');
            await openPanel(page);
            await send(page, 'Mon serveur');
            await expect(assistant(page)).toContainText('depuis le mock');
        } finally {
            setGlobal('ai_chat_user_keys_enabled', before.keys);
            setGlobal('outbound_allowed_hosts', before.hosts);
        }
    });
});

// ================================================================================
// Transcription
// ================================================================================
test.describe('transcription', () => {
    const WAV = (() => {
        const header = Buffer.alloc(44);
        header.write('RIFF', 0); header.writeUInt32LE(36 + 1600, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24); header.writeUInt32LE(16000, 28);
        header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(1600, 40);
        return Buffer.concat([header, Buffer.alloc(1600)]);
    })();
    const audio = { language: 'fr', audio: { name: 'a.wav', mimeType: 'audio/wav', buffer: WAV } };

    test('the admin page: test button, saved values, who may use it', covers('plat.stt.admin'), async ({ page, playwright, browser }) => {
        const keys = ['stt_enabled', 'stt_provider', 'stt_url', 'stt_model', 'stt_api_key', 'stt_language', 'stt_max_recording_minutes', 'stt_user_keys_enabled'];
        const saved = Object.fromEntries(keys.map((key) => [key, getGlobal(key)]));
        const person = await newAccount(playwright, 'sttallow');
        try {
            await login(page, ADMIN);
            await page.goto('/stt_settings.php');
            await openBoxes(page);
            await expect(page.locator('#stt_enabled')).toBeChecked();
            await page.selectOption('#stt_provider', 'custom');
            await page.fill('#stt_url', `${MOCK}/v1`);
            await page.click('#stt-test-btn');
            await expect(page.locator('#stt-test-result')).toBeVisible();
            await expect(page.locator('#stt-test-result')).not.toHaveClass(/error/);
            await page.fill('#stt_model', 'whisper-1');
            await page.fill('#stt_max_recording_minutes', '7');
            await page.fill('#stt-user-filter', person.username);
            await page.locator(`input[name="stt_user_ids[]"][value="${person.id}"]`).check();
            await page.locator('form:has(#stt_enabled) button[type="submit"]').click();
            await page.waitForLoadState();
            await expect.poll(() => getGlobal('stt_max_recording_minutes')).toBe('7');
            await openBoxes(page);
            await expect(page.locator('#stt_max_recording_minutes')).toHaveValue('7');
            const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
            const other = await context.newPage();
            await login(other, person);
            const answer = await other.request.post('/api_transcribe.php', { multipart: audio }).then((r) => r.json());
            expect(answer).toMatchObject({ success: true, text: 'transcription du mock' });
            await context.close();
        } finally {
            for (const [key, value] of Object.entries(saved)) setGlobal(key, value);
        }
    });

    test('api_transcribe: refuses without access, without audio, and answers the text', covers('plat.stt.api'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'sttno');
        await login(page, account);
        const refused = await page.request.post('/api_transcribe.php', { multipart: audio });
        expect(refused.status(), await refused.text()).toBe(403);
        await page.context().clearCookies();
        await login(page, ADMIN);
        const empty = await page.request.post('/api_transcribe.php', { form: { language: 'fr' } });
        expect(empty.status()).toBe(400);
        const fake = await page.request.post('/api_transcribe.php', { multipart: { language: 'fr', audio: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('pas du son') } } });
        expect(fake.status(), 'not audio').toBeGreaterThanOrEqual(400);
        expect(await page.request.post('/api_transcribe.php', { multipart: audio }).then((r) => r.json())).toMatchObject({ success: true, text: 'transcription du mock' });
    });

    test('the personal transcription server page saves when the admin allows it', covers('plat.stt.user'), async ({ page, playwright }) => {
        const before = { keys: getGlobal('stt_user_keys_enabled'), hosts: getGlobal('outbound_allowed_hosts') };
        const account = await newAccount(playwright, 'sttkey');
        await login(page, account);
        setGlobal('stt_user_keys_enabled', '');
        await page.goto('/stt_settings_user.php');
        await expect(page.locator('#stt_url'), 'not allowed: no form').toHaveCount(0);
        setGlobal('stt_user_keys_enabled', '1');
        setGlobal('outbound_allowed_hosts', '127.0.0.1');
        try {
            await page.goto('/stt_settings_user.php');
            await openBoxes(page);
            await page.locator('#stt_enabled').evaluate((box) => { if (!box.checked) box.click(); });
            await page.selectOption('#stt_provider', 'custom');
            await page.fill('#stt_url', `${MOCK}/v1`);
            await page.click('#stt-test-btn');
            await expect(page.locator('#stt-test-result')).toBeVisible();
            await page.fill('#stt_model', 'whisper-1');
            await page.locator('form:has(#stt_enabled) button[type="submit"]').click();
            await page.waitForLoadState();
            await openBoxes(page);
            await expect(page.locator('#stt_model')).toHaveValue('whisper-1');
            expect(await page.request.post('/api_transcribe.php', { multipart: audio }).then((r) => r.json())).toMatchObject({ success: true, text: 'transcription du mock' });
        } finally {
            setGlobal('stt_user_keys_enabled', before.keys);
            setGlobal('outbound_allowed_hosts', before.hosts);
        }
    });
});
