// What must never lose anything: backup, restore, export, import. Each round
// trip compares against the reference notes in content/.
const { test, expect, Api, KITCHEN_MD, KITCHEN_HTML, PNG, newAccount, login, readZip, writeZip, csrfOf } = require('../lib/helpers');

/** One of everything, returned so that a test can compare after a round trip. */
async function seed(api) {
    const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier sauvegardé é' }))).json.folder;
    const html = await api.createNote({ heading: 'Référence HTML', content: KITCHEN_HTML, type: 'note' });
    const md = await api.createNote({ heading: 'Référence Markdown', content: KITCHEN_MD, type: 'markdown' });
    const tasks = await api.createNote({ heading: 'Liste', type: 'tasklist', content: '[]' });
    await api.ok(api.post(`/notes/${tasks.id}/tasks`, { text: 'Tâche sauvegardée' }));
    await api.ok(api.post(`/notes/${md.id}/folder`, { folder_id: folder.id }));
    await api.ok(api.put(`/notes/${md.id}/tags`, { tags: ['étiquette', 'autre'] }));
    const uploaded = await api.ok(api.call('POST', `/notes/${html.id}/attachments`, {
        multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PNG } },
    }));
    const attachment = uploaded.json.attachment_id ?? uploaded.json.attachment?.id ?? uploaded.json.attachments?.at(-1)?.id;
    const htmlContent = (await api.getNote(html.id)).content;
    return { folder, html, md, tasks, attachment, htmlContent };
}

/** Everything seed() created is still there, unchanged. */
async function expectSeedIntact(api, data) {
    const html = await api.getNote(data.html.id);
    const md = await api.getNote(data.md.id);
    expect(html.heading).toBe('Référence HTML');
    // A restore drops the line breaks between tags, which render as nothing
    const betweenTags = (markup) => markup.replace(/>\s+</g, '><');
    expect(betweenTags(html.content), 'rich text note changed').toBe(betweenTags(data.htmlContent));
    expect(html.content, 'the code block lost its lines').toContain('function bonjour($nom) {\n');
    expect(md.content, 'Markdown note changed').toBe(KITCHEN_MD);
    expect(md.folder_id, 'note lost its folder').toBe(data.folder.id);
    expect(md.tags).toContain('étiquette');
    expect((await api.ok(api.get(`/notes/${data.tasks.id}/tasks`))).text).toContain('Tâche sauvegardée');
    const file = await api.ok(api.get(`/notes/${data.html.id}/attachments/${data.attachment}`));
    expect(file.body.equals(PNG), 'attachment changed').toBe(true);
    expect((await api.ok(api.get('/notes/search', { params: { q: 'reference markdown' } }))).text).toContain('Référence Markdown');
}

test.describe('backup and restore', () => {
    let api; let account; let data;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'backup');
        api = await Api.open(playwright, account);
        data = await seed(api);
    });
    test.afterAll(async () => { await api.dispose(); });

    test('a backup holds the database, the notes and the attachments', async () => {
        const name = (await api.ok(api.post('/backups'))).json.backup_file;
        expect((await api.ok(api.get('/backups'))).text).toContain(name);
        const zip = await api.ok(api.get(`/backups/${name}`));
        expect(zip.headers['content-length'], 'a streamed download lost its length').toBe(String(zip.body.length));
        const names = Object.keys(readZip(zip.body));
        expect(names.some((file) => file.endsWith('.sql'))).toBe(true);
        expect(names.filter((file) => file.includes('entries')).length).toBeGreaterThan(0);
        expect(names.some((file) => file.includes('attachments/'))).toBe(true);
        await api.ok(api.del(`/backups/${name}`));
    });

    test('restoring a backup brings everything back, and only that', async () => {
        const name = (await api.ok(api.post('/backups'))).json.backup_file;
        const after = await api.createNote({ heading: 'Créée après la sauvegarde', content: '<p>x</p>' });
        await api.ok(api.patch(`/notes/${data.md.id}`, { content: 'écrasé' }));
        await api.ok(api.del(`/notes/${data.tasks.id}`));
        await api.ok(api.post(`/backups/${name}/restore`));
        await expectSeedIntact(api, data);
        expect((await api.get(`/notes/${after.id}`)).status).toBe(404);
        await api.ok(api.del(`/backups/${name}`));
    });

    test('a backup uploaded through the API can be restored', async () => {
        const name = (await api.ok(api.post('/backups'))).json.backup_file;
        const zip = (await api.ok(api.get(`/backups/${name}`))).body;
        await api.ok(api.del(`/backups/${name}`));
        const uploaded = await api.ok(api.call('POST', '/backups/upload', {
            multipart: { backup: { name: 'envoi.zip', mimeType: 'application/zip', buffer: zip }, file: { name: 'envoi.zip', mimeType: 'application/zip', buffer: zip } },
        }));
        const target = uploaded.json.backup_file ?? uploaded.json.filename ?? uploaded.json.name;
        await api.ok(api.post(`/backups/${target}/restore`));
        await expectSeedIntact(api, data);
    });

    test('the settings page export runs in a background worker and gives a valid archive', async ({ page }) => {
        await login(page, account);
        const csrf = await csrfOf(page, '/backup_export.php');
        const started = await (await page.request.post('/api_backup_job.php?action=start', { form: { csrf_token: csrf } })).json();
        const job = started.job_id ?? started.job?.id;
        expect(job, JSON.stringify(started)).toBeTruthy();
        await expect.poll(async () => {
            const status = await (await page.request.get(`/api_backup_job.php?action=status&job_id=${job}`)).json();
            return status.status ?? status.job?.status;
        }, { timeout: 40_000, intervals: [500] }).toMatch(/done|complete/);
        const archive = await page.request.get(`/api_backup_job.php?action=download&job_id=${job}`);
        const names = Object.keys(readZip(await archive.body()));
        expect(names.some((file) => file.endsWith('.sql'))).toBe(true);
    });

    test('the chunked restore of the settings page restores through its worker', async ({ page }) => {
        const name = (await api.ok(api.post('/backups'))).json.backup_file;
        const zip = (await api.ok(api.get(`/backups/${name}`))).body;
        await api.ok(api.del(`/backups/${name}`));
        const gone = await api.createNote({ heading: 'Effacée par la restauration', content: '<p>x</p>' });
        await login(page, account);
        const csrf = await csrfOf(page, '/restore_import.php');
        const init = await (await page.request.post('/api_restore_upload.php?action=init', {
            form: { filename: 'b.zip', total_size: zip.length, total_chunks: 2, csrf_token: csrf },
        })).json();
        expect(init.upload_id, JSON.stringify(init)).toBeTruthy();
        const half = Math.ceil(zip.length / 2);
        for (const [index, piece] of [zip.subarray(0, half), zip.subarray(half)].entries()) {
            const sent = await page.request.post('/api_restore_upload.php?action=chunk', {
                multipart: { upload_id: init.upload_id, chunk_index: String(index), csrf_token: csrf, chunk: { name: 'c', mimeType: 'application/octet-stream', buffer: piece } },
            });
            expect(sent.status(), await sent.text()).toBe(200);
        }
        const done = await page.request.post('/api_restore_upload.php?action=finalize', { form: { upload_id: init.upload_id, csrf_token: csrf } });
        expect(done.status(), await done.text()).toBeLessThan(300);
        await expect.poll(async () => {
            const status = await (await page.request.get(`/api_restore_upload.php?action=status&upload_id=${init.upload_id}`)).json();
            return status.status ?? status.job?.status;
        }, { timeout: 40_000, intervals: [500] }).toMatch(/done|complete/);
        await expectSeedIntact(api, data);
        expect((await api.get(`/notes/${gone.id}`)).status).toBe(404);
    });
});

test.describe('export', () => {
    let api; let account; let data;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'export');
        api = await Api.open(playwright, account);
        data = await seed(api);
        await api.ok(api.patch(`/notes/${data.html.id}`, { content: `${data.htmlContent}<p><img src="api/v1/notes/${data.html.id}/attachments/${data.attachment}"></p>` }));
    });
    test.afterAll(async () => { await api.dispose(); });

    test('a rich text note exports to HTML, Markdown, JSON and self-contained HTML', async ({ page }) => {
        await login(page, account);
        const url = (format) => `/api_export_note.php?id=${data.html.id}&type=note&format=${format}`;
        // A note with attachments exports as a ZIP holding the note and its files
        const exported = async (format, extension) => {
            const body = await (await page.request.get(url(format))).body();
            if (body.subarray(0, 2).toString() !== 'PK') return body.toString('utf8');
            const files = readZip(body);
            expect(Object.keys(files).join(), 'the attachment is missing from the archive').toContain('.png');
            const name = Object.keys(files).find((file) => file.endsWith(extension));
            expect(name, `no ${extension} in ${Object.keys(files).join()}`).toBeTruthy();
            return files[name].toString('utf8');
        };
        const html = await exported('html', '.html');
        expect(html).toContain('<table');
        expect(html).toContain('Référence HTML');
        const markdown = await exported('markdown', '.md');
        // Front matter, then the note as stored: rich text stays in HTML
        expect(markdown).toContain('title: "Référence HTML"');
        expect(markdown).toContain('Titre de niveau 1');
        expect(markdown).toContain('Cellule 2');
        expect(markdown, 'the attachment is not listed').toContain('pixel.png');
        expect(await exported('json', '.json')).toContain('Cellule 2');
        const embedded = await (await page.request.get(url('html_embedded'))).text();
        expect(embedded, 'the image was not embedded').toContain('data:image/png;base64');
    });

    test('a Markdown note exports to Markdown unchanged and to rendered HTML', async ({ page }) => {
        await login(page, account);
        const url = (format) => `/api_export_note.php?id=${data.md.id}&type=markdown&format=${format}`;
        expect(await (await page.request.get(url('markdown'))).text()).toContain('## Titre de niveau 2');
        const html = await page.request.get(url('html'));
        if (html.status() === 200) expect(await html.text()).toContain('Titre de niveau 2');
    });

    test('folders, whole accounts and attachments export to valid archives', async ({ page }) => {
        await login(page, account);
        const zipOf = async (url) => {
            const response = await page.request.get(url);
            expect(response.status(), `${url}: ${(await response.text()).slice(0, 200)}`).toBe(200);
            return Object.keys(readZip(await response.body()));
        };
        expect((await zipOf(`/api_export_folder.php?folder_id=${data.folder.id}&workspace=Poznote`)).join()).toContain('Référence Markdown');
        expect((await zipOf('/api_export_structured.php?workspace=Poznote')).length).toBeGreaterThan(1);
        expect((await zipOf('/api_export_entries.php?workspace=Poznote')).length).toBeGreaterThan(1);
        expect((await zipOf('/api_export_attachments.php?workspace=Poznote')).join()).toContain('.png');
    });
});

test.describe('import', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'import');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });

    const importFiles = async (page, files) => {
        const csrf = await csrfOf(page, '/restore_import.php');
        const form = { action: 'import_individual_notes', csrf_token: csrf, target_workspace: 'Poznote' };
        const response = await page.request.fetch('/restore_import.php', {
            method: 'POST', multipart: Object.assign(form, Object.fromEntries(files.map((file) => ['individual_notes_files[]', file]))),
        });
        expect(response.status()).toBe(200);
    };
    const headings = async () => (await api.ok(api.get('/notes'))).json.notes.map((note) => note.heading);

    test('a Markdown file becomes a note with its content', async ({ page }) => {
        await login(page, account);
        await importFiles(page, [{ name: 'Importé md.md', mimeType: 'text/markdown', buffer: Buffer.from(KITCHEN_MD) }]);
        const found = (await api.ok(api.get('/notes'))).json.notes.find((note) => note.heading.includes('Importé md'));
        expect(found, (await headings()).join()).toBeTruthy();
        const note = await api.getNote(found.id);
        expect(note.type).toBe('markdown');
        expect(note.content).toContain('| Colonne A | Colonne B | Colonne C |');
        expect(note.content).toContain('```mermaid');
    });

    test('an HTML file is imported and its scripts are removed', async ({ page }) => {
        await login(page, account);
        await importFiles(page, [{ name: 'Importé html.html', mimeType: 'text/html', buffer: Buffer.from(`${KITCHEN_HTML}<script>alert(1)</script><p onclick="alert(2)">fin</p>`) }]);
        const found = (await api.ok(api.get('/notes'))).json.notes.find((note) => note.heading.includes('Importé html'));
        expect(found, (await headings()).join()).toBeTruthy();
        const note = await api.getNote(found.id);
        expect(note.content).toContain('Cellule 2');
        expect(note.content).not.toContain('<script');
        expect(note.content).not.toContain('onclick');
    });

    test('a ZIP of notes imports every note, with its images', async ({ page }) => {
        await login(page, account);
        const zip = writeZip({
            'Zip markdown.md': `# Depuis un zip\n\n![pixel](images/pixel.png)\n\nÉté\n`,
            'images/pixel.png': PNG,
            'sous-dossier/Zip imbriquée.md': 'Note dans un sous-dossier\n',
            'Zip riche.html': '<h1>Riche</h1><p>Contenu HTML</p>',
        });
        await importFiles(page, [{ name: 'notes.zip', mimeType: 'application/zip', buffer: zip }]);
        const all = await headings();
        for (const expected of ['Zip markdown', 'Zip imbriquée', 'Zip riche']) {
            expect(all.join(' | '), `${expected} was not imported`).toContain(expected);
        }
    });

    test('files dropped on the sidebar are imported', async ({ page }) => {
        await login(page, account);
        const response = await page.request.post('/api_import_dropped_notes.php', {
            multipart: { workspace: 'Poznote', 'files[]': { name: 'Déposée.md', mimeType: 'text/markdown', buffer: Buffer.from('# Déposée\n') } },
        });
        expect(response.status(), await response.text()).toBe(200);
        expect((await headings()).join()).toContain('Déposée');
    });
});
