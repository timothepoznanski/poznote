// Data in and out, from the real interface: downloads, backups, restores, imports,
// local and S3 backups, Git sync, webhooks, public shares, and the routes the Chrome
// extension calls. Specs 02 and 03 prove part of this at the API level.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test, expect, covers, Api, ADMIN, BASE_URL, KITCHEN_MD, KITCHEN_HTML, PNG, newAccount, login, openNote, settled, readZip, writeZip, inInstance } = require('../lib/helpers');

const MOCK = 'http://127.0.0.1:9912';

/** Rich text is stored with its accents as HTML entities. */
const plain = (html) => html.replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&Agrave;/g, 'À').replace(/&icirc;/g, 'î');

/** Leaves the page first: its pollers must not see the session disappear. */
async function switchAccount(page, account) {
    await page.goto('about:blank');
    await page.context().clearCookies();
    await login(page, account);
}

/** Reads what the browser really saved. */
async function saved(download) {
    const file = await download.path();
    return { name: download.suggestedFilename(), body: fs.readFileSync(file) };
}

/** Runs a click and returns the file the browser downloaded. */
async function downloadOf(page, click) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), click()]);
    expect(await download.failure(), 'the download failed').toBeNull();
    return saved(download);
}

const uploaded = async (api, noteId, name = 'pixel.png', mimeType = 'image/png', buffer = PNG) => {
    const response = await api.ok(api.call('POST', `/notes/${noteId}/attachments`, { multipart: { file: { name, mimeType, buffer } } }));
    return response.json.attachment_id ?? response.json.attachment?.id;
};

/** The Download button sits in the note's "..." menu at this width. */
async function clickDownload(page) {
    await page.locator('.mobile-more-btn').first().click();
    await page.locator('.mobile-toolbar-menu [data-selector=".btn-download"]').first().click();
    await expect(page.locator('#exportModal')).toBeVisible();
}

test.describe('note export dialog', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dexp');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });

    const openExport = async (page, noteId) => {
        await login(page, account);
        await openNote(page, noteId);
        await clickDownload(page);
    };
    const visibleFormats = (page) => page.locator('#exportModal .export-option:visible').evaluateAll((all) => all.map((el) => el.dataset.type));
    const pick = (page, type) => downloadOf(page, () => page.locator(`#exportModal .export-option[data-type="${type}"]`).click());

    test('a rich text note offers HTML and embedded HTML, and each download holds the note', covers('data.export-modal', 'data.export-html', 'data.export-html-embedded'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Exporté riche', content: '<h2>Été</h2><p>Corps accentué</p><table><tr><td>Cellule é</td></tr></table>', type: 'note' });
        await openExport(page, note.id);
        expect(await visibleFormats(page)).toEqual(['html', 'html_embedded']);
        const html = await pick(page, 'html');
        await expect(page.locator('#exportModal'), 'the dialog stays open').toBeHidden();
        expect(html.name).toMatch(/\.html$/);
        expect(html.name).toContain('Export');
        const text = plain(html.body.toString('utf8'));
        expect(text).toContain('<!DOCTYPE html');
        expect(text).toContain('Corps accentué');
        expect(text).toContain('Cellule é');
        await clickDownload(page);
        const embedded = await pick(page, 'html_embedded');
        expect(embedded.name).toMatch(/\.html$/);
        expect(plain(embedded.body.toString('utf8'))).toContain('Corps accentué');
    });

    test('Cancel closes the export dialog without downloading', covers('data.export-modal'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Annulé', content: '<p>x</p>', type: 'note' });
        await openExport(page, note.id);
        let downloads = 0;
        page.on('download', () => { downloads++; });
        await page.locator('#exportModal .btn-cancel').click();
        await expect(page.locator('#exportModal')).toBeHidden();
        await settled(page);
        expect(downloads).toBe(0);
    });

    test('a note with an image downloads as a ZIP holding the page and the file, or inlined in embedded HTML', covers('data.export-html', 'data.export-html-embedded', 'data.export-attachments-in-zip'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Avec image', content: '<p>Avant</p>', type: 'note' });
        const id = await uploaded(api, note.id);
        await api.ok(api.patch(`/notes/${note.id}`, { content: `<p>Avant</p><p><img src="/api/v1/notes/${note.id}/attachments/${id}"></p>` }));
        await openExport(page, note.id);
        const zip = await pick(page, 'html');
        expect(zip.name).toMatch(/\.zip$/);
        const files = readZip(zip.body);
        const names = Object.keys(files);
        const htmlName = names.find((name) => name.endsWith('.html'));
        expect(htmlName, names.join()).toBeTruthy();
        const png = names.find((name) => name.endsWith('.png'));
        expect(png, names.join()).toBeTruthy();
        expect(files[png].equals(PNG), 'the image in the ZIP changed').toBe(true);
        expect(files[htmlName].toString('utf8'), 'the page does not point to the file of the archive').toContain(png);
        await clickDownload(page);
        const embedded = await pick(page, 'html_embedded');
        expect(embedded.name).toMatch(/\.html$/);
        expect(embedded.body.toString('utf8')).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
    });

    test('a Markdown note offers Markdown and HTML, Markdown keeps the source under its front matter', covers('data.export-modal', 'data.export-markdown', 'data.export-markdown-html'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Exporté md', content: '## Titre é\n\n- un\n- deux\n\n**gras**\n', type: 'markdown' });
        await api.ok(api.put(`/notes/${note.id}/tags`, { tags: ['étiquette'] }));
        await openExport(page, note.id);
        expect(await visibleFormats(page)).toEqual(['markdown', 'html', 'html_embedded']);
        const md = await pick(page, 'markdown');
        expect(md.name).toMatch(/\.md$/);
        const text = md.body.toString('utf8');
        expect(text.startsWith('---\n'), text.slice(0, 80)).toBe(true);
        expect(text).toContain('title: "Exporté md"');
        expect(text).toContain('étiquette');
        expect(text).toContain('## Titre é\n\n- un\n- deux\n\n**gras**');
        await clickDownload(page);
        const html = await pick(page, 'html');
        const page2 = plain(html.body.toString('utf8'));
        expect(page2, 'the Markdown was not rendered').toMatch(/<h2[^>]*>.*Titre é/);
        expect(page2).toContain('<strong>gras</strong>');
        expect(page2).not.toContain('**gras**');
    });

    test('a task list offers Markdown, HTML and JSON, each with its tasks and states', covers('data.export-modal', 'data.export-tasklist-markdown', 'data.export-tasklist-json', 'data.export-tasklist-html'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Exportée tâches', type: 'tasklist', content: '[]' });
        const first = await api.ok(api.post(`/notes/${note.id}/tasks`, { text: 'Faite é' }));
        await api.ok(api.post(`/notes/${note.id}/tasks`, { text: 'À faire' }));
        await api.ok(api.patch(`/notes/${note.id}/tasks/${(first.json.task || first.json).id}`, { completed: true }));
        await openExport(page, note.id);
        expect(await visibleFormats(page)).toEqual(['markdown', 'html', 'html_embedded', 'json']);
        const md = (await pick(page, 'markdown')).body.toString('utf8');
        expect(md).toContain('- [x] Faite é');
        expect(md).toContain('- [ ] À faire');
        await clickDownload(page);
        const json = await pick(page, 'json');
        expect(json.name).toMatch(/\.json$/);
        const tasks = JSON.parse(json.body.toString('utf8'));
        expect(tasks.map((task) => [task.text, !!task.completed])).toEqual(expect.arrayContaining([['Faite é', true], ['À faire', false]]));
        await clickDownload(page);
        const html = plain((await pick(page, 'html')).body.toString('utf8'));
        expect(html).toContain('Faite é');
        expect(html).toContain('À faire');
    });

    test('Print opens the rendered note and calls the print dialog', covers('data.export-print'), async ({ page, context }) => {
        const note = await api.createNote({ heading: 'À imprimer', content: '# Imprimé é\n', type: 'markdown' });
        await login(page, account);
        await openNote(page, note.id);
        await context.addInitScript(() => { window.print = () => { window.__printed = true; }; });
        await page.locator('.mobile-more-btn').first().click();
        const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-action="print-note"]').first().click()]);
        await popup.waitForLoadState();
        await expect(popup.locator('h1')).toContainText('Imprimé é');
        await expect.poll(() => popup.evaluate(() => window.__printed === true), { timeout: 10_000, message: 'print() was not called' }).toBe(true);
    });
});

test.describe('folder, workspace and bulk exports', () => {
    let api; let account; let folder; let sub; let rich; let md; let inner;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dbulk');
        api = await Api.open(playwright, account);
        folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier exporté' }))).json.folder;
        sub = (await api.ok(api.post('/folders', { folder_name: 'Sous-dossier', parent_id: folder.id }))).json.folder;
        rich = await api.createNote({ heading: 'Riche à la racine', content: '<p>Texte racine é</p>', type: 'note' });
        md = await api.createNote({ heading: 'Note du dossier', content: '# Titre dossier é\n', type: 'markdown', folder_id: folder.id });
        inner = await api.createNote({ heading: 'Note imbriquée', content: '<p>Texte imbriqué</p>', type: 'note', folder_id: sub.id });
        await uploaded(api, rich.id);
    });
    test.afterAll(async () => { await api.dispose(); });

    test('Download in the folder menu gives a ZIP of the folder and its subfolders, nothing else', covers('data.export-folder'), async ({ page }) => {
        await login(page, account);
        await page.goto('/index.php');
        await settled(page);
        await page.locator(`.folder-header[data-folder-id="${folder.id}"]`).click({ button: 'right' });
        const zip = await downloadOf(page, () => page.locator('[data-action="download-folder"]:visible').first().click());
        expect(zip.name).toMatch(/\.zip$/);
        const files = readZip(zip.body);
        const names = Object.keys(files).join(' | ');
        expect(names).toContain('Note du dossier');
        expect(names).toContain('Note imbriquée');
        expect(names, 'a note outside the folder was exported').not.toContain('Riche à la racine');
        const mdName = Object.keys(files).find((name) => name.includes('Note du dossier'));
        expect(files[mdName].toString('utf8')).toContain('# Titre dossier é');
    });

    test('Structured export offers each workspace and exports the chosen one with its folders', covers('data.export-structured', 'data.card-structured-export'), async ({ page }) => {
        await api.ok(api.post('/workspaces', { name: 'Autre espace' }));
        await api.createNote({ heading: 'Note autre espace', content: '<p>ailleurs</p>', type: 'note', workspace: 'Autre espace' });
        await login(page, account);
        await page.goto('/settings.php#section=settings-export-import-section-grid');
        await page.locator('#structured-export-card').click();
        await expect(page).toHaveURL(/backup_export\.php.*part=structured-export/);
        await expect(page.locator('#structured-export-section')).toBeVisible();
        await expect(page.locator('#complete-backup-section'), 'the part shows alone').toBeHidden();
        await expect.poll(() => page.locator('#structuredExportWorkspaceSelect option').allTextContents()).toEqual(expect.arrayContaining(['Poznote', 'Autre espace']));
        await page.locator('#structuredExportWorkspaceSelect').selectOption('Autre espace');
        const other = await downloadOf(page, () => page.locator('#structuredExportBtn').click());
        expect(other.name).toMatch(/\.zip$/);
        const otherNames = Object.keys(readZip(other.body)).join(' | ');
        expect(otherNames).toContain('Note autre espace');
        expect(otherNames, 'the other workspace leaked').not.toContain('Riche à la racine');
        await page.locator('#structuredExportWorkspaceSelect').selectOption('Poznote');
        const main = readZip((await downloadOf(page, () => page.locator('#structuredExportBtn').click())).body);
        const mainNames = Object.keys(main);
        expect(mainNames.join(' | ')).toContain('Dossier exporté/Sous-dossier/Note imbriquée');
        const front = main[mainNames.find((name) => name.includes('Note du dossier'))].toString('utf8');
        expect(front).toContain('title: "Note du dossier"');
        expect(front).toContain('# Titre dossier é');
    });

    test('Attachments export gives every file with its exact bytes', covers('data.export-attachments', 'data.card-attachments-export'), async ({ page }) => {
        await login(page, account);
        await page.goto('/settings.php#section=settings-export-import-section-grid');
        await page.locator('#attachments-export-card').click();
        await expect(page).toHaveURL(/backup_export\.php.*part=attachments-export/);
        const zip = await downloadOf(page, () => page.locator('#attachmentsExportBtn').click());
        const files = readZip(zip.body);
        const png = Object.keys(files).find((name) => name.endsWith('.png'));
        expect(png, Object.keys(files).join()).toBeTruthy();
        expect(files[png].equals(PNG), 'the attachment changed').toBe(true);
    });

    test('api_export_entries gives every note as a file', covers('data.export-entries'), async ({ page }) => {
        await login(page, account);
        const response = await page.request.get('/api_export_entries.php');
        expect(response.status()).toBe(200);
        const files = readZip(await response.body());
        const all = plain(Object.values(files).map((file) => file.toString('utf8')).join('\n'));
        expect(all).toContain('Texte racine é');
        expect(all).toContain('Titre dossier é');
    });

    test('api_download_note serves the note file, refuses a bad id and another account', covers('data.download-note-route'), async ({ page, playwright }) => {
        await login(page, account);
        const good = await page.request.get(`/api_download_note.php?id=${md.id}&workspace=Poznote`);
        expect(good.status()).toBe(200);
        expect(good.headers()['content-disposition']).toContain('attachment');
        expect(await good.text()).toContain('# Titre dossier é');
        const html = await page.request.get(`/api_download_note.php?id=${inner.id}&workspace=Poznote`);
        expect(plain(await html.text())).toContain('Texte imbriqué');
        expect((await page.request.get('/api_download_note.php?id=abc&workspace=Poznote')).status()).toBe(400);
        expect((await page.request.get('/api_download_note.php?id=999999&workspace=Poznote')).status()).toBe(404);
        const stranger = await newAccount(playwright, 'dstranger');
        const other = await Api.open(playwright, stranger);
        expect((await other.get(`/api_download_note.php?id=${md.id}&workspace=Poznote`, { raw: true })).text).not.toContain('Titre dossier');
        await other.dispose();
    });

    test('a trashed note is no longer exported by api_export_note, an unknown format is refused', covers('data.export-errors'), async ({ page }) => {
        await login(page, account);
        const gone = await api.createNote({ heading: 'Jetée', content: '<p>jetée</p>', type: 'note' });
        await api.ok(api.del(`/notes/${gone.id}`));
        expect((await page.request.get(`/api_export_note.php?id=${gone.id}&type=note&format=html`)).status()).toBe(404);
        expect((await page.request.get(`/api_export_note.php?id=${inner.id}&type=note&format=docx`)).status()).toBe(400);
        expect((await page.request.get(`/api_export_note.php?id=${inner.id}&type=note&format=html&disposition=weird`)).status()).toBe(400);
    });
});

/** The archive of the account as it stands, built by the API. */
async function backupZip(api) {
    const name = (await api.ok(api.post('/backups'))).json.backup_file;
    const zip = (await api.ok(api.get(`/backups/${name}`))).body;
    await api.ok(api.del(`/backups/${name}`));
    return zip;
}

test.describe('backup page', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dback');
        api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'Sauvegardée é', content: '<p>Contenu sauvegardé</p>', type: 'note' });
        await uploaded(api, note.id);
    });
    test.afterAll(async () => { await api.dispose(); });

    test('Complete backup runs in the background, offers a link, survives a reload and can be discarded', covers('data.backup-complete', 'data.backup-job', 'data.card-backup'), async ({ page }) => {
        await login(page, account);
        await page.goto('/settings.php#section=settings-backup-restore-section-grid');
        await page.locator('#backup-export-card').click();
        await expect(page).toHaveURL(/backup_export\.php.*part=backup/);
        await expect(page.locator('#structured-export-section')).toBeHidden();
        let downloads = 0;
        page.on('download', () => { downloads++; });
        await page.locator('#completeBackupBtn').click();
        await expect(page.locator('#backupJobReady'), 'the archive never became ready').toBeVisible({ timeout: 40_000 });
        expect(downloads, 'the download must not start on its own').toBe(0);
        await expect(page.locator('#completeBackupBtn')).toBeEnabled();
        await page.reload();
        await expect(page.locator('#backupJobReady'), 'a reload lost the finished job').toBeVisible({ timeout: 15_000 });
        const zip = await downloadOf(page, () => page.locator('#backupJobDownloadLink').click());
        expect(zip.name).toMatch(/\.zip$/);
        const files = readZip(zip.body);
        const names = Object.keys(files);
        expect(names.some((name) => name.endsWith('.sql')), names.join()).toBe(true);
        expect(names.some((name) => name.startsWith('attachments/')), names.join()).toBe(true);
        expect(plain(Object.values(files).map((file) => file.toString('utf8')).join())).toContain('Contenu sauvegardé');
        await page.locator('#backupJobDiscardBtn').click();
        await expect(page.locator('#backupJobReady')).toBeHidden();
        await page.reload();
        await settled(page);
        await expect(page.locator('#backupJobReady'), 'a discarded job came back').toBeHidden();
    });

    test('an administrator picks whose account to back up, a user only gets their own', covers('data.backup-per-user'), async ({ page }) => {
        await login(page, ADMIN);
        await page.goto('/backup_export.php?part=backup');
        const select = page.locator('#completeBackupUserSelect');
        await expect(select).toBeVisible();
        expect((await select.locator('option').allTextContents()).join()).toContain(account.username);
        await select.selectOption(String(account.id));
        await page.locator('#completeBackupBtn').click();
        await expect(page.locator('#backupJobReady')).toBeVisible({ timeout: 40_000 });
        const zip = await downloadOf(page, () => page.locator('#backupJobDownloadLink').click());
        expect(plain(Object.values(readZip(zip.body)).map((file) => file.toString('utf8')).join()), 'the archive is not of the chosen account').toContain('Contenu sauvegardé');
        await page.locator('#backupJobDiscardBtn').click();
        await switchAccount(page, account);
        await page.goto('/backup_export.php?part=backup');
        await expect(page.locator('#completeBackupUserSelect'), 'a user could target another account').toHaveCount(0);
    });

    test('backup API: create, list, download, delete, and refuse bad names and foreign files', covers('data.backup-api'), async ({ playwright }) => {
        const name = (await api.ok(api.post('/backups'))).json.backup_file;
        const listed = (await api.ok(api.get('/backups'))).json.backups.find((backup) => backup.filename === name);
        expect(listed, 'the new backup is not listed').toBeTruthy();
        expect(listed.size).toBeGreaterThan(0);
        expect(readZip((await api.ok(api.get(`/backups/${name}`))).body)).toBeTruthy();
        const stranger = await newAccount(playwright, 'dbackother');
        const other = await Api.open(playwright, stranger);
        expect((await other.get('/backups')).text, 'another account sees this backup').not.toContain(name);
        expect((await other.get(`/backups/${name}`)).status).toBeGreaterThanOrEqual(400);
        expect((await other.del(`/backups/${name}`)).status).toBeGreaterThanOrEqual(400);
        await other.dispose();
        expect((await api.get('/backups/..%2F..%2Fmaster.db')).status).toBeGreaterThanOrEqual(400);
        await api.ok(api.del(`/backups/${name}`));
        expect((await api.ok(api.get('/backups'))).text).not.toContain(name);
        expect((await api.get(`/backups/${name}`)).status).toBe(404);
    });

    test('a file that is not a ZIP is refused by the backup upload', covers('data.backup-api'), async () => {
        const refused = await api.call('POST', '/backups/upload', { multipart: { file: { name: 'faux.zip', mimeType: 'application/zip', buffer: Buffer.from('pas un zip') } } });
        expect(refused.status).toBeGreaterThanOrEqual(400);
        expect(refused.json.success).toBe(false);
    });
});

test.describe('restore page', () => {
    let api; let account; let keep; let zip;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'drest');
        api = await Api.open(playwright, account);
        keep = await api.createNote({ heading: 'Gardée é', content: '<p>Contenu gardé</p>', type: 'note' });
        await uploaded(api, keep.id);
        zip = await backupZip(api);
    });
    test.afterAll(async () => { await api.dispose(); });

    const wrecked = async () => {
        await api.ok(api.patch(`/notes/${keep.id}`, { content: '<p>abîmé</p>' }));
        return api.createNote({ heading: 'Après la sauvegarde', content: '<p>x</p>', type: 'note' });
    };
    const expectRestored = async (after) => {
        expect(plain((await api.getNote(keep.id)).content)).toContain('Contenu gardé');
        expect((await api.get(`/notes/${after.id}`)).status, 'a later note survived the restore').toBe(404);
    };

    test('Complete restore: confirm, upload in slices, progress, summary, workspace chooser', covers('data.restore-complete', 'data.restore-chunked', 'data.card-restore', 'data.restore-workspaces-modal'), async ({ page }) => {
        const after = await wrecked();
        await login(page, account);
        await page.goto('/settings.php#section=settings-backup-restore-section-grid');
        await page.locator('#restore-import-card').click();
        await expect(page).toHaveURL(/restore_import\.php.*part=restore-standard/);
        await page.locator('#complete_backup_file').setInputFiles({ name: 'sauvegarde.zip', mimeType: 'application/zip', buffer: zip });
        await page.locator('#completeRestoreBtn').click();
        await expect(page.locator('#completeRestoreConfirmModal')).toBeVisible();
        await page.locator('#completeRestoreConfirmModal [data-action="hide-complete-restore-confirmation"]').click();
        await expect(page.locator('#completeRestoreConfirmModal')).toBeHidden();
        expect(plain((await api.getNote(keep.id)).content), 'Cancel restored anyway').toContain('abîmé');
        await page.locator('#completeRestoreBtn').click();
        await page.locator('#completeRestoreConfirmModal [data-action="proceed-complete-restore"]').click();
        await expect(page.locator('#chunkedRestoreSuccess'), 'the restore did not end well').toBeVisible({ timeout: 45_000 });
        await expect(page.locator('#restoreWorkspacesModal')).toBeVisible();
        await expect(page.locator('#restoreWorkspacesList')).toContainText('Poznote');
        await page.locator('#restoreWorkspacesModal [data-action="hide-restore-workspaces-modal"]').click();
        await expect(page.locator('#restoreWorkspacesModal')).toBeHidden();
        await expectRestored(after);
    });

    test('a broken archive reports an error in the restore page and changes nothing', covers('data.restore-errors'), async ({ page }) => {
        const before = await api.createNote({ heading: 'Intacte', content: '<p>intacte</p>', type: 'note' });
        await login(page, account);
        await page.goto('/restore_import.php?part=restore-standard');
        await page.locator('#complete_backup_file').setInputFiles({ name: 'cassée.zip', mimeType: 'application/zip', buffer: Buffer.from('ceci nest pas une archive '.repeat(100)) });
        await page.locator('#completeRestoreBtn').click();
        await page.locator('#completeRestoreConfirmModal [data-action="proceed-complete-restore"]').click();
        await expect(page.locator('#chunkedRestoreError')).toBeVisible({ timeout: 30_000 });
        expect((await api.getNote(before.id)).heading).toBe('Intacte');
    });

    test('Direct copy restore: reads the file copied onto the server, restores, removes it', covers('data.restore-direct-copy', 'data.card-restore-direct'), async ({ page }) => {
        const after = await wrecked();
        await login(page, account);
        await page.goto('/settings.php#section=settings-backup-restore-section-grid');
        await page.locator('#restore-direct-copy-card').click();
        await expect(page).toHaveURL(/part=restore-direct-copy/);
        await expect(page.locator('#directCopyRestoreContent .alert-warning'), 'no file there yet').toBeVisible();
        const file = path.join(os.tmpdir(), `poznote-e2e-${process.pid}.zip`);
        fs.writeFileSync(file, zip);
        execFileSync('docker', ['cp', file, `${process.env.POZNOTE_E2E_CONTAINER || 'poznote-e2e-8199'}:/tmp/backup_restore.zip`]);
        fs.unlinkSync(file);
        inInstance('chown www-data:www-data /tmp/backup_restore.zip');
        await page.reload();
        await expect(page.locator('#directCopyRestoreContent .alert-info')).toBeVisible();
        await page.locator('[data-action="show-direct-copy-restore-confirmation"]').click();
        await expect(page.locator('#directCopyRestoreConfirmModal')).toBeVisible();
        await page.locator('[data-action="hide-direct-copy-restore-confirmation"]').click();
        await expect(page.locator('#directCopyRestoreConfirmModal')).toBeHidden();
        await page.locator('[data-action="show-direct-copy-restore-confirmation"]').click();
        await page.locator('[data-action="proceed-direct-copy-restore"]').click();
        await expect(page.locator('#directCopyRestoreContent .alert-success')).toBeVisible({ timeout: 45_000 });
        await expectRestored(after);
        expect(inInstance('ls /tmp/backup_restore.zip 2>/dev/null || echo gone').trim(), 'the copied file stayed on the server').toBe('gone');
    });

    test('Disaster recovery rebuilds the master database and public links keep working', covers('data.disaster-recovery'), async ({ page, playwright }) => {
        const note = await api.createNote({ heading: 'Partagée avant', content: '<p>Toujours publique</p>', type: 'note' });
        await api.ok(api.post(`/notes/${note.id}/share`, { custom_token: `reprise-${process.pid}` }));
        await login(page, ADMIN);
        await page.goto('/admin/disaster-recovery.php');
        await expect(page).toHaveURL(/settings\.php/);
        await expect(page.locator('#disasterRecoveryModal')).toBeVisible();
        await page.locator('#disasterRecoveryRunBtn').click();
        await expect(page.locator('#disasterRecoveryResult')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#disasterRecoveryResult')).not.toBeEmpty();
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const shared = await anonymous.get(`/reprise-${process.pid}`);
        expect(await shared.text(), 'the rebuilt registry lost the share').toContain('Toujours publique');
        await anonymous.dispose();
        await page.locator('#disasterRecoveryModal .btn-cancel').click();
        await expect(page.locator('#disasterRecoveryModal')).toBeHidden();
    });
});

/** All the notes of an account, with their content. */
const allNotes = async (api, workspace = 'Poznote') => {
    const list = (await api.ok(api.get('/notes', { params: { workspace } }))).json.notes;
    return Promise.all(list.map((note) => api.getNote(note.id)));
};
const noteNamed = async (api, heading, workspace) => {
    const found = (await allNotes(api, workspace)).find((note) => note.heading === heading);
    expect(found, `no note named ${heading}`).toBeTruthy();
    return found;
};
const md = (name, text) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });

test.describe('import notes page', () => {
    let api; let account; let folder;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dimp');
        api = await Api.open(playwright, account);
        folder = (await api.ok(api.post('/folders', { folder_name: 'Cible import' }))).json.folder;
        await api.ok(api.post('/workspaces', { name: 'Espace import' }));
    });
    test.afterAll(async () => { await api.dispose(); });

    const openImport = async (page) => {
        await login(page, account);
        await page.goto('/restore_import.php?part=import');
        await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toEqual(expect.arrayContaining(['Poznote']));
        await page.locator('#target_workspace_select').selectOption('Poznote');
    };
    const submit = async (page) => {
        await page.locator('#individualNotesImportBtn').click();
        await expect(page.locator('#individualNotesImportConfirmModal')).toBeVisible();
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
    };

    test('the card opens the page, a chosen file shows with its size and can be removed', covers('data.card-import', 'data.import-selection'), async ({ page }) => {
        await login(page, account);
        await page.goto('/settings.php#section=settings-export-import-section-grid');
        await page.locator('#import-notes-card').click();
        await expect(page).toHaveURL(/restore_import\.php.*part=import/);
        await expect(page.locator('#individualNotesSelection')).toBeHidden();
        await page.locator('#individual_notes_files').setInputFiles(md('Choisie.md', 'x'));
        await expect(page.locator('#individualNotesSelection')).toBeVisible();
        await expect(page.locator('#individualNotesSelectionName')).toHaveText('Choisie.md');
        await page.locator('[data-action="clear-individual-notes-files"]').click();
        await expect(page.locator('#individualNotesSelection')).toBeHidden();
        expect(await page.locator('#individual_notes_files').evaluate((input) => input.files.length)).toBe(0);
    });

    test('the confirmation names the destination, and Cancel imports nothing', covers('data.import-individual'), async ({ page }) => {
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles(md('Jamais importée.md', 'x'));
        await page.locator('#individualNotesImportBtn').click();
        await expect(page.locator('#individualNotesImportSummary')).toContainText('1 note');
        await expect(page.locator('#individualNotesImportSummary')).toContainText('Poznote');
        await page.locator('[data-action="hide-individual-notes-import-confirmation"]').click();
        await expect(page.locator('#individualNotesImportConfirmModal')).toBeHidden();
        expect((await api.ok(api.get('/notes'))).text).not.toContain('Jamais import');
    });

    test('several Markdown, HTML and text files become notes of the right type, in the chosen folder and workspace', covers('data.import-individual', 'data.import-md', 'data.import-html', 'data.import-txt', 'data.import-destination'), async ({ page }) => {
        await openImport(page);
        await page.locator('#target_workspace_select').selectOption('Poznote');
        await expect(page.locator('#target_folder_select option', { hasText: 'Cible import' })).toHaveCount(1);
        await page.locator('#target_folder_select').selectOption('Cible import');
        await page.locator('#individual_notes_files').setInputFiles([
            md('Import markdown.md', '# Titre é\n\n**gras**\n'),
            { name: 'Import riche.html', mimeType: 'text/html', buffer: Buffer.from('<h2>Riche</h2><p>Contenu</p><script>alert(1)</script><style>p{color:red}</style>') },
            { name: 'Import texte.txt', mimeType: 'text/plain', buffer: Buffer.from('ligne une é\nligne <deux>') },
            md('Import extension.markdown', 'extension longue\n'),
        ]);
        await page.locator('#individualNotesImportBtn').click();
        await expect(page.locator('#individualNotesImportSummary')).toContainText('4 notes');
        await expect(page.locator('#individualNotesImportSummary')).toContainText('Cible import');
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const markdown = await noteNamed(api, 'Import markdown');
        expect(markdown.type).toBe('markdown');
        expect(markdown.content).toContain('# Titre é');
        expect(markdown.folder_id, 'the chosen folder was ignored').toBe(folder.id);
        const rich = await noteNamed(api, 'Import riche');
        expect(rich.type).toBe('note');
        expect(rich.content).toContain('<h2>Riche</h2>');
        expect(rich.content, 'scripts must not survive').not.toContain('<script');
        expect(rich.content, 'style tags must not survive').not.toContain('<style');
        const text = await noteNamed(api, 'Import texte');
        expect(text.type).toBe('note');
        expect(plain(text.content)).toContain('ligne une é<br');
        expect(text.content, 'plain text must be escaped').toContain('&lt;deux&gt;');
        expect((await noteNamed(api, 'Import extension')).type).toBe('markdown');
        await page.goto('/restore_import.php?part=import');
        await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toContain('Espace import');
        await page.locator('#target_workspace_select').selectOption('Espace import');
        await page.locator('#individual_notes_files').setInputFiles(md('Dans autre espace.md', 'x\n'));
        await submit(page);
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        expect((await noteNamed(api, 'Dans autre espace', 'Espace import')).workspace).toBe('Espace import');
    });

    test('front matter sets title, tags, favorite, dates and folder, Obsidian tags become tags', covers('data.import-front-matter', 'data.import-obsidian-tags'), async ({ page }) => {
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles([
            md('fichier.md', '---\ntitle: "Titre du front matter é"\ntags: [un, deux]\nfavorite: true\ncreated: 2020-01-02 03:04:05\nupdated: 2021-02-03 04:05:06\nfolder: Cible import\n---\n\nCorps sous le front matter\n'),
            md('Avec étiquettes.md', '#alpha #beta\n\nCorps obsidian\n'),
        ]);
        await submit(page);
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const note = await noteNamed(api, 'Titre du front matter é');
        expect(note.content.trim()).toBe('Corps sous le front matter');
        expect(note.tags).toContain('un'); expect(note.tags).toContain('deux');
        expect(Number(note.favorite)).toBe(1);
        expect(note.created).toContain('2020-01-02');
        expect(note.updated).toContain('2021-02-03');
        expect(note.folder_id, 'the folder of the front matter was ignored').toBe(folder.id);
        const tagged = await noteNamed(api, 'Avec étiquettes');
        expect(tagged.tags).toContain('alpha'); expect(tagged.tags).toContain('beta');
        expect(tagged.content).not.toContain('#alpha');
    });

    test('a folder path in the front matter creates the folders', covers('data.import-front-matter'), async ({ page }) => {
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles(md('chemin.md', '---\nfolder: Parent cree/Enfant cree\n---\n\nCorps\n'));
        await submit(page);
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const note = await noteNamed(api, 'chemin');
        expect(note.folder).toBe('Enfant cree');
        expect((await api.ok(api.get('/folders', { params: { workspace: 'Poznote' } }))).text).toContain('Parent cree');
    });

    test('a folder name in the front matter that does not exist yet is created', covers('data.import-front-matter'), async ({ page }) => {
        test.fail(true, 'BUG: importSingleNoteFile (import_helpers.php:736) only looks a single folder name up, so a note exported from a top-level folder lands at the root, in a folder the tree does not show');
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles(md('nouveau dossier.md', '---\nfolder: Dossier neuf\n---\n\nCorps\n'));
        await submit(page);
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const note = await noteNamed(api, 'nouveau dossier');
        expect(note.folder_id, 'the note has no folder').toBeTruthy();
    });

    test('task lists are recognised from JSON, from an exported page and from a tasklist front matter', covers('data.import-tasklist'), async ({ page }) => {
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles([
            { name: 'Liste json.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 1, text: 'Tâche json', completed: true, important: false }, { id: 2, text: 'Autre', completed: false }])) },
            md('Liste md.md', '---\ntype: tasklist\n---\n\n- [x] Faite md\n- [ ] Pas faite md\n'),
            { name: 'Pas une liste.html', mimeType: 'text/html', buffer: Buffer.from('<p>[ pas une liste ]</p>') },
            { name: 'Simple json.json', mimeType: 'application/json', buffer: Buffer.from('{"cle":"valeur"}') },
        ]);
        await submit(page);
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const json = await noteNamed(api, 'Liste json');
        expect(json.type).toBe('tasklist');
        const jsonTasks = (await api.ok(api.get(`/notes/${json.id}/tasks`))).json.tasks;
        expect(jsonTasks.map((task) => [task.text, !!task.completed])).toEqual([['Tâche json', true], ['Autre', false]]);
        const list = await noteNamed(api, 'Liste md');
        expect(list.type).toBe('tasklist');
        const mdTasks = (await api.ok(api.get(`/notes/${list.id}/tasks`))).json.tasks;
        expect(mdTasks.map((task) => [task.text, !!task.completed])).toEqual([['Faite md', true], ['Pas faite md', false]]);
        expect((await noteNamed(api, 'Pas une liste')).type, 'brackets are not a task list').toBe('note');
        const other = await noteNamed(api, 'Simple json');
        expect(other.type).toBe('note');
        expect(other.content).toContain('<pre>');
    });

    test('a ZIP goes through the background import with progress, keeps its folders, images and PDFs', covers('data.import-zip', 'data.import-zip-folders', 'data.import-zip-images', 'data.import-zip-pdf'), async ({ page }) => {
        const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
        const zip = writeZip({
            'Coffre/Racine zip.md': '# Racine\n\n![image](images/pixel.png)\n\nVoir ![[rapport lié.pdf]] et [[rapport lié.pdf|mon alias]]\n',
            'Coffre/images/pixel.png': PNG,
            'Coffre/rapport lié.pdf': pdf,
            'Coffre/Projets/Sous note.md': '---\ntags: [zipé]\n---\nDans un sous-dossier\n',
            'Coffre/Projets/Sous riche.html': '<p>riche zip</p>',
            'Coffre/Projets/Isolé.pdf': pdf,
            'Coffre/.obsidian/config.json': '{}',
        });
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles({ name: 'coffre.zip', mimeType: 'application/zip', buffer: zip });
        await page.locator('#individualNotesImportBtn').click();
        await expect(page.locator('#individualNotesImportSummary')).toContainText('ZIP');
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
        await expect(page.locator('#notesImportSuccess'), 'the ZIP import did not finish well').toBeVisible({ timeout: 45_000 });
        await expect(page.locator('#notesImportProgress')).toBeVisible();
        await expect(page.locator('#notesImportBar')).toHaveAttribute('style', /100%/);
        const root = await noteNamed(api, 'Racine zip');
        expect(root.type).toBe('markdown');
        expect(root.content, 'the image reference was not rewritten').toMatch(new RegExp(`/api/v1/notes/${root.id}/attachments/[0-9a-z]+`));
        expect(root.content, 'the Obsidian link stayed').not.toContain('[[');
        expect(root.content).toContain('[mon alias](');
        const attachments = (await api.ok(api.get(`/notes/${root.id}/attachments`))).json.attachments;
        const names = attachments.map((file) => file.original_filename);
        expect(names).toEqual(expect.arrayContaining(['pixel.png', 'rapport lié.pdf']));
        const png = attachments.find((file) => file.original_filename === 'pixel.png');
        expect((await api.ok(api.get(`/notes/${root.id}/attachments/${png.id}`))).body.equals(PNG), 'the image changed').toBe(true);
        const sub = await noteNamed(api, 'Sous note');
        expect(sub.tags).toContain('zipé');
        expect(sub.folder, 'the folder of the ZIP was not created').toBe('Projets');
        expect((await noteNamed(api, 'Sous riche')).folder).toBe('Projets');
        const lonely = await noteNamed(api, 'Isolé');
        expect((await api.ok(api.get(`/notes/${lonely.id}/attachments`))).json.attachments.map((file) => file.original_filename)).toEqual(['Isolé.pdf']);
        expect((await api.ok(api.get('/notes'))).text, 'hidden Obsidian files must not become notes').not.toContain('config');
    });

    test('a file that is not an importable type, or too many files, is refused with a message', covers('data.import-errors'), async ({ page }) => {
        await openImport(page);
        await page.locator('#individual_notes_files').setInputFiles(Array.from({ length: 51 }, (_, index) => md(`trop-${index}.md`, 'x')));
        await page.locator('#individualNotesImportBtn').click();
        await expect(page.locator('#customAlert')).toBeVisible();
        await expect(page.locator('#alertMessage')).toContainText('51');
        await expect(page.locator('#individualNotesImportConfirmModal'), 'the import went on').toBeHidden();
        await page.locator('#customAlert [data-action="hide-custom-alert"]').click();
        await expect(page.locator('#customAlert')).toBeHidden();
        expect((await api.ok(api.get('/notes'))).text).not.toContain('trop-1');
    });

    test('the import limits are shown, changed by an administrator and enforced', covers('data.import-limits'), async ({ page, playwright }) => {
        const admin = await Api.open(playwright, ADMIN);
        try {
            await login(page, ADMIN);
            await page.goto('/restore_import.php?part=import');
            await page.locator('.import-limits-btn').click();
            await expect(page).toHaveURL(/settings\.php/);
            await expect(page.locator('#importLimitsModal')).toBeVisible();
            await page.locator('#importMaxIndividualFilesInput').fill('2');
            await page.locator('#importMaxZipFilesInput').fill('3');
            await page.locator('#importLimitsModal .btn-primary').click();
            await expect(page.locator('#importLimitsModal')).toBeHidden();
            await expect(page.locator('#import-limits-individual-badge')).toContainText('2');
            await expect(page.locator('#import-limits-zip-badge')).toContainText('3');
            await switchAccount(page, account);
            await page.goto('/restore_import.php?part=import');
            await expect(page.locator('.import-limits-text')).toContainText('2');
            await expect(page.locator('.import-limits-btn'), 'only an administrator can change the limits').toHaveCount(0);
            const refused = await page.request.post('/api_import_dropped_notes.php', {
                multipart: { workspace: 'Poznote', 'files[]': md('Limite une.md', 'x') },
            });
            expect((await refused.json()).success).toBe(true);
            await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toContain('Poznote');
            await page.locator('#individual_notes_files').setInputFiles([md('L1.md', 'x'), md('L2.md', 'x'), md('L3.md', 'x')]);
            await page.locator('#individualNotesImportBtn').click();
            await expect(page.locator('#alertMessage'), 'the new limit is not enforced').toContainText('3');
        } finally {
            // Instance-wide: put the defaults back whatever happened
            await admin.ok(admin.put('/settings/import_max_individual_files', { value: '50' }));
            await admin.ok(admin.put('/settings/import_max_zip_files', { value: '300' }));
            await admin.dispose();
        }
    });
});

/** Drops files from the desktop onto an element: a real drop event, with a real DataTransfer. */
async function dropFiles(page, selector, files) {
    await page.evaluate(({ selector, files }) => {
        const target = document.querySelector(selector);
        const data = new DataTransfer();
        for (const file of files) data.items.add(new File([file.text], file.name, { type: file.type }));
        const fire = (type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
        fire('dragenter');
        fire('dragover');
        window.__overlayShown = document.getElementById('sidebarFileImportOverlay')?.classList.contains('visible');
        window.__overlayText = document.querySelector('.sidebar-file-import-overlay-text')?.textContent;
        fire('drop');
    }, { selector, files });
}

test.describe('dropping files on the sidebar', () => {
    let api; let account; let folder;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'ddrop');
        api = await Api.open(playwright, account);
        folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier cible' }))).json.folder;
    });
    test.afterAll(async () => { await api.dispose(); });

    const onTree = async (page) => {
        await login(page, account);
        await page.goto('/index.php');
        await settled(page);
    };

    test('dropped on the tree they land at the root and appear at once', covers('data.drop-sidebar'), async ({ page }) => {
        await onTree(page);
        await dropFiles(page, '#left_col', [{ name: 'Déposée racine.md', type: 'text/markdown', text: '# Racine é\n' }]);
        expect(await page.evaluate(() => window.__overlayShown), 'no drop overlay').toBe(true);
        await expect(page.locator('a.links_arbo_left', { hasText: 'Déposée racine' })).toBeVisible({ timeout: 15_000 });
        const note = await noteNamed(api, 'Déposée racine');
        expect(note.content).toContain('# Racine é');
        expect(note.folder_id).toBeFalsy();
    });

    test('dropped on a folder they land in it, unsupported files are skipped and counted', covers('data.drop-sidebar-folder'), async ({ page }) => {
        await onTree(page);
        await dropFiles(page, `.folder-header[data-folder-id="${folder.id}"]`, [
            { name: 'Déposée dossier.html', type: 'text/html', text: '<p>dans le dossier</p>' },
            { name: 'ignoré.exe', type: 'application/octet-stream', text: 'x' },
        ]);
        expect(await page.evaluate(() => window.__overlayText)).toContain('Dossier cible');
        await expect(page.locator('body')).toContainText('1 unsupported', { timeout: 15_000 });
        expect((await noteNamed(api, 'Déposée dossier')).folder_id).toBe(folder.id);
        expect((await api.ok(api.get('/notes'))).text).not.toContain('ignor');
    });

    test('only unsupported files: an error and no note', covers('data.drop-sidebar'), async ({ page }) => {
        await onTree(page);
        const before = (await api.ok(api.get('/notes'))).json.notes.length;
        await dropFiles(page, '#left_col', [{ name: 'photo.exe', type: 'application/octet-stream', text: 'x' }]);
        await expect(page.locator('body')).toContainText('No supported files', { timeout: 10_000 });
        expect((await api.ok(api.get('/notes'))).json.notes.length).toBe(before);
    });

    test('a ZIP dropped on the sidebar is imported with its folders', covers('data.drop-sidebar'), async ({ page }) => {
        await onTree(page);
        const bytes = writeZip({ 'Lot/Une.md': 'une\n', 'Lot/Sous/Deux.md': 'deux\n' }).toString('base64');
        await page.evaluate(async (b64) => {
            const data = new DataTransfer();
            data.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'lot.zip', { type: 'application/zip' }));
            document.querySelector('#left_col').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
        }, bytes);
        await expect(page.locator('a.links_arbo_left', { hasText: 'Une' })).toBeVisible({ timeout: 20_000 });
        expect((await noteNamed(api, 'Deux')).folder).toBe('Sous');
    });
});

test.describe('import and export round trips', () => {
    test('a structured export reimported into a new account gives the same notes, folders, tags and images', covers('data.roundtrip-structured'), async ({ page, playwright }) => {
        const source = await newAccount(playwright, 'dsrc');
        const from = await Api.open(playwright, source);
        const folder = (await from.ok(from.post('/folders', { folder_name: 'Voyage é' }))).json.folder;
        const mdNote = await from.createNote({ heading: 'Référence md', content: KITCHEN_MD, type: 'markdown', folder_id: folder.id });
        await from.ok(from.put(`/notes/${mdNote.id}/tags`, { tags: ['étiquette'] }));
        await from.ok(from.post(`/notes/${mdNote.id}/favorite`));
        const rich = await from.createNote({ heading: 'Référence riche', content: '<h2>Titre</h2><table><tr><td>Cellule</td></tr></table>', type: 'note' });
        const id = await uploaded(from, rich.id);
        await from.ok(from.patch(`/notes/${rich.id}`, { content: `<p>Image</p><p><img src="/api/v1/notes/${rich.id}/attachments/${id}"></p>` }));
        const tasks = await from.createNote({ heading: 'Référence tâches', type: 'tasklist', content: '[]' });
        await from.ok(from.post(`/notes/${tasks.id}/tasks`, { text: 'Tâche voyageuse' }));
        await login(page, source);
        await page.goto('/backup_export.php?part=structured-export');
        await expect.poll(() => page.locator('#structuredExportWorkspaceSelect').inputValue()).toBe('Poznote');
        const zip = await downloadOf(page, () => page.locator('#structuredExportBtn').click());
        await from.dispose();

        const target = await newAccount(playwright, 'dtgt');
        const to = await Api.open(playwright, target);
        await switchAccount(page, target);
        await page.goto('/restore_import.php?part=import');
        await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toContain('Poznote');
        await page.locator('#individual_notes_files').setInputFiles({ name: zip.name, mimeType: 'application/zip', buffer: zip.body });
        await page.locator('#individualNotesImportBtn').click();
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
        await expect(page.locator('#notesImportSuccess')).toBeVisible({ timeout: 45_000 });
        const back = await noteNamed(to, 'Référence md');
        expect(back.type).toBe('markdown');
        expect(back.content.trim()).toBe(KITCHEN_MD.trim());
        expect(back.tags).toContain('étiquette');
        expect(Number(back.favorite)).toBe(1);
        expect(back.folder).toBe('Voyage é');
        const backRich = await noteNamed(to, 'Référence riche');
        expect(backRich.content).toMatch(new RegExp(`/?api/v1/notes/${backRich.id}/attachments/[0-9a-z]+`));
        const files = (await to.ok(to.get(`/notes/${backRich.id}/attachments`))).json.attachments;
        expect(files.length).toBe(1);
        expect((await to.ok(to.get(`/notes/${backRich.id}/attachments/${files[0].id}`))).body.equals(PNG), 'the image changed').toBe(true);
        const backTasks = await noteNamed(to, 'Référence tâches');
        expect(backTasks.type).toBe('tasklist');
        expect((await to.ok(to.get(`/notes/${backTasks.id}/tasks`))).text).toContain('Tâche voyageuse');
        await to.dispose();
    });

    test('a Markdown download reimported gives the note back, an exported task list comes back as a task list', covers('data.roundtrip-note'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'drt');
        const api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'Aller retour', content: KITCHEN_MD, type: 'markdown' });
        await api.ok(api.put(`/notes/${note.id}/tags`, { tags: ['retour'] }));
        const list = await api.createNote({ heading: 'Liste retour', type: 'tasklist', content: '[]' });
        await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'Retour é' }));
        await login(page, account);
        await openNote(page, note.id);
        await clickDownload(page);
        const exported = await downloadOf(page, () => page.locator('#exportModal .export-option[data-type="markdown"]').click());
        await openNote(page, list.id);
        await clickDownload(page);
        const exportedJson = await downloadOf(page, () => page.locator('#exportModal .export-option[data-type="json"]').click());
        await api.ok(api.del(`/notes/${note.id}`));
        await api.ok(api.del(`/notes/${list.id}`));
        await page.goto('/restore_import.php?part=import');
        await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toContain('Poznote');
        await page.locator('#individual_notes_files').setInputFiles([
            { name: exported.name, mimeType: 'text/markdown', buffer: exported.body },
            { name: `json-${exportedJson.name}`, mimeType: 'application/json', buffer: exportedJson.body },
        ]);
        await page.locator('#individualNotesImportBtn').click();
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const all = await allNotes(api);
        const back = all.find((one) => one.heading === 'Aller retour');
        expect(back, all.map((one) => one.heading).join()).toBeTruthy();
        expect(back.content.trim()).toBe(KITCHEN_MD.trim());
        expect(back.tags).toContain('retour');
        const lists = all.filter((one) => one.type === 'tasklist');
        expect(lists.length, all.map((one) => `${one.heading}:${one.type}`).join()).toBe(1);
        for (const one of lists) expect((await api.ok(api.get(`/notes/${one.id}/tasks`))).text).toContain('Retour é');
        await api.dispose();
    });

    test('a task list downloaded as Markdown comes back as a task list', covers('data.roundtrip-note'), async ({ page, playwright }) => {
        test.fail(true, 'BUG: api_export_note.php exportAsMarkdown writes no "type: tasklist" in the front matter (export_helpers.php does), so a task list comes back as a Markdown note');
        const account = await newAccount(playwright, 'drtl');
        const api = await Api.open(playwright, account);
        const list = await api.createNote({ heading: 'Liste md retour', type: 'tasklist', content: '[]' });
        await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'Retour md' }));
        await login(page, account);
        await openNote(page, list.id);
        await clickDownload(page);
        const exported = await downloadOf(page, () => page.locator('#exportModal .export-option[data-type="markdown"]').click());
        await api.ok(api.del(`/notes/${list.id}`));
        await page.goto('/restore_import.php?part=import');
        await expect.poll(() => page.locator('#target_workspace_select option').allTextContents()).toContain('Poznote');
        await page.locator('#individual_notes_files').setInputFiles({ name: exported.name, mimeType: 'text/markdown', buffer: exported.body });
        await page.locator('#individualNotesImportBtn').click();
        await page.locator('[data-action="proceed-individual-notes-import"]').click();
        await page.waitForLoadState();
        await expect(page.locator('.alert-success').first()).toBeVisible();
        const back = await noteNamed(api, 'Liste md retour');
        await api.dispose();
        expect(back.type).toBe('tasklist');
    });

    test('a folder download reimported rebuilds the same tree', covers('data.roundtrip-folder'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'drtf');
        const api = await Api.open(playwright, account);
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Arbre' }))).json.folder;
        const sub = (await api.ok(api.post('/folders', { folder_name: 'Branche', parent_id: folder.id }))).json.folder;
        const leaf = await api.createNote({ heading: 'Feuille', content: 'contenu feuille\n', type: 'markdown', folder_id: sub.id });
        await login(page, account);
        const response = await page.request.get(`/api_export_folder.php?folder_id=${folder.id}`);
        expect(response.status()).toBe(200);
        await api.ok(api.del(`/notes/${leaf.id}`));
        const drop = await page.request.post('/api_import_dropped_notes.php', {
            multipart: { workspace: 'Poznote', 'files[]': { name: 'arbre.zip', mimeType: 'application/zip', buffer: await response.body() } },
        });
        expect((await drop.json()).success).toBe(true);
        const back = await noteNamed(api, 'Feuille');
        expect(back.content).toContain('contenu feuille');
        expect(back.folder).toBe('Branche');
        await api.dispose();
    });
});

const tokenOf = (url) => url.replace(/\/+$/, '').split('/').pop();

test.describe('sharing a note from the interface', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dshare');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });

    const rowOf = (page, heading) => page.locator('.shared-note-item', { hasText: heading });
    const shared = async (page, heading) => {
        await login(page, account);
        await page.goto('/shared.php');
        await expect(rowOf(page, heading)).toBeVisible();
    };
    const editOf = async (page, heading) => {
        await rowOf(page, heading).locator('.lucide-pencil').click();
        await expect(page.locator('.shared-edit-token-modal')).toBeVisible();
        return page.locator('.shared-edit-token-modal');
    };
    const saveEdit = async (page) => {
        await page.locator('.shared-edit-token-modal-actions .btn-primary').click();
        await expect(page.locator('.shared-edit-token-modal')).toBeHidden();
    };
    const anonymous = async (browser) => {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        return { context, page: await context.newPage() };
    };

    test('the share button creates a link, its settings open over the note, and the note is public', covers('data.share-note', 'data.share-settings-dialog', 'data.public-note'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Partagée UI é', content: '<p>Lisible par tous</p>', type: 'note' });
        await login(page, account);
        await openNote(page, note.id);
        await page.locator('.btn-publish').first().click();
        await expect(page.locator('#shareModal')).toBeVisible();
        await page.locator('#shareModal .btn-create-share').click();
        const settings = page.locator('.share-settings-modal');
        await expect(settings, 'the settings open right after the creation').toBeVisible();
        await expect(page, 'the note stays on screen').toHaveURL(new RegExp(`index\\.php\\?.*note=${note.id}`));
        await settings.locator('.shared-edit-token-modal-actions .btn-secondary').click();
        await expect(settings).toBeHidden();
        const status = (await api.ok(api.get(`/notes/${note.id}/share`))).json;
        expect(status.public).toBe(true);
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${tokenOf(status.url)}`);
        await expect(visitor.page.locator('.public-note-title, h1').first()).toContainText('Partagée UI é');
        await expect(visitor.page.locator('.content')).toContainText('Lisible par tous');
        await expect(visitor.page.locator('[contenteditable="true"]'), 'a public page must be read-only').toHaveCount(0);
        await expect(visitor.page.locator('#publicEditToggle'), 'no edit button on a read-only share').toHaveCount(0);
        await visitor.context.close();
        await openNote(page, note.id);
        await expect(page.locator('.btn-publish').first(), 'the button does not show the note is shared').toHaveClass(/is-shared|shared/);
        await page.locator('.btn-publish').first().click();
        await expect(settings, 'a shared note opens its settings in place').toBeVisible();
        await expect(page).toHaveURL(new RegExp(`index\\.php\\?.*note=${note.id}`));
        await expect(settings.locator('.shared-edit-token-modal-title-link')).toContainText(tokenOf(status.url));
        await expect(settings.locator('.shared-edit-token-modal-actions .btn-danger'), 'Revoke sits by Save').toBeVisible();
    });

    test('Revoke in the settings dialog of a note: Disable keeps the dialog open and says so, Delete ends the share', covers('data.share-settings-dialog', 'data.share-disable', 'data.share-revoke'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'A révoquer é', content: '<p>Bientôt privée</p>', type: 'note' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        await login(page, account);
        await openNote(page, note.id);
        await page.locator('.btn-publish').first().click();
        const settings = page.locator('.share-settings-modal');
        await expect(settings).toBeVisible();
        await settings.locator('.shared-edit-token-modal-actions .btn-danger').click();
        const revoke = page.locator('.shared-revoke-modal');
        await expect(revoke).toBeVisible();
        await revoke.locator('.btn-primary').click();
        await expect(settings, 'disabling keeps the dialog').toBeVisible();
        await expect(settings.locator('.btn-share-disabled'), 'the button shows the state').toBeVisible();
        expect((await api.ok(api.get(`/notes/${note.id}/share`))).json.disabled).toBeTruthy();
        const visitor = await anonymous(browser);
        expect((await visitor.page.goto(`/${token}`)).status(), 'a disabled share is not served').toBeGreaterThanOrEqual(400);
        await settings.locator('.btn-share-disabled').click();
        await expect(revoke).toBeVisible();
        await revoke.locator('.btn-danger').click();
        await expect(settings, 'deleting closes it').toBeHidden();
        await expect.poll(async () => (await api.ok(api.get(`/notes/${note.id}/share`))).json.public).toBe(false);
        expect((await visitor.page.goto(`/${token}`)).status()).toBe(404);
        await visitor.context.close();
    });

    test('the Shares page sorts by name, last edit or share date, and the browser remembers it', covers('data.shared-page-sort'), async ({ page, playwright }) => {
        const own = await Api.open(playwright, await newAccount(playwright, 'sharesort'));
        const notes = {};
        for (const heading of ['Zèbre', 'Abeille', 'Mouton']) notes[heading] = await own.createNote({ heading, content: '<p>x</p>' });
        // Dates are kept to the second: a pause between the steps gives each its own
        for (const heading of ['Zèbre', 'Abeille', 'Mouton']) { await own.ok(own.post(`/notes/${notes[heading].id}/share`)); await page.waitForTimeout(1100); }
        for (const heading of ['Mouton', 'Zèbre']) { await own.ok(own.patch(`/notes/${notes[heading].id}`, { content: '<p>modifiée</p>' })); await page.waitForTimeout(1100); }
        await login(page, own.account);
        await page.goto('/shared.php');
        await settled(page);
        const order = () => page.locator('.shared-note-item').evaluateAll((rows) => rows.map((row) => ['Abeille', 'Mouton', 'Zèbre'].find((name) => row.textContent.includes(name))));
        const sort = page.locator('#sharedSortSelect');
        await sort.selectOption('name');
        await expect.poll(order).toEqual(['Abeille', 'Mouton', 'Zèbre']);
        await sort.selectOption('shared');
        await expect.poll(order, 'newest share first').toEqual(['Mouton', 'Abeille', 'Zèbre']);
        await sort.selectOption('updated');
        await expect.poll(order, 'latest edit first').toEqual(['Zèbre', 'Mouton', 'Abeille']);
        await page.reload();
        await expect(sort, 'remembered').toHaveValue('updated');
        await expect.poll(order).toEqual(['Zèbre', 'Mouton', 'Abeille']);
        await own.dispose();
    });

    test('Cancel in the share dialog creates nothing', covers('data.share-note'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Pas partagée', content: '<p>x</p>', type: 'note' });
        await login(page, account);
        await openNote(page, note.id);
        await page.locator('.btn-publish').first().click();
        await page.locator('#shareModal .btn-cancel').click();
        await expect(page.locator('#shareModal')).toBeHidden();
        expect((await api.ok(api.get(`/notes/${note.id}/share`))).json.public).toBe(false);
    });

    test('a custom address and a renewed one change the public URL, the old one stops', covers('data.share-custom-slug', 'data.public-slug'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Adresse perso', content: '<p>Ici</p>', type: 'note' });
        const before = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        await shared(page, 'Adresse perso');
        const modal = await editOf(page, 'Adresse perso');
        const slug = `mon-adresse-${process.pid}`;
        await modal.locator('input.modal-password-input').first().fill(slug);
        await expect(modal.locator('.shared-edit-token-modal-title-link'), 'the preview does not follow').toContainText(slug);
        await saveEdit(page);
        await expect.poll(async () => tokenOf((await api.ok(api.get(`/notes/${note.id}/share`))).json.url)).toBe(slug);
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${slug}`);
        await expect(visitor.page.locator('.content')).toContainText('Ici');
        expect((await visitor.page.request.get(`/public_note.php?token=${slug}`)).status(), 'the plain URL must work too').toBe(200);
        expect((await visitor.page.request.get(`/public_slug.php?slug=${slug}`)).status()).toBe(200);
        expect((await visitor.page.request.get(`/${before}`)).status(), 'the old address still answers').toBe(404);
        await page.reload();
        const again = await editOf(page, 'Adresse perso');
        await again.locator('.shared-edit-token-inline-renew').click();
        const renewed = await again.locator('input.modal-password-input').first().inputValue();
        expect(renewed).not.toBe(slug);
        expect(renewed.length).toBeGreaterThan(8);
        await saveEdit(page);
        await expect.poll(async () => (await visitor.page.request.get(`/${renewed}`)).status()).toBe(200);
        expect((await visitor.page.request.get(`/${slug}`)).status()).toBe(404);
        await visitor.context.close();
    });

    test.describe('refused address', () => {
    // KNOWN: the browser logs the 409 of the refused token, which is the point of the test
    test.use({ allowedErrors: [/status of 409/] });
    test('a taken address is refused with a message and the dialog stays open', covers('data.share-custom-slug'), async ({ page }) => {
        const one = await api.createNote({ heading: 'Occupante', content: '<p>x</p>', type: 'note' });
        const slug = `occupee-${process.pid}`;
        await api.ok(api.post(`/notes/${one.id}/share`, { custom_token: slug }));
        const two = await api.createNote({ heading: 'Prétendante', content: '<p>x</p>', type: 'note' });
        const own = tokenOf((await api.ok(api.post(`/notes/${two.id}/share`))).json.url);
        await shared(page, 'Prétendante');
        const modal = await editOf(page, 'Prétendante');
        await modal.locator('input.modal-password-input').first().fill(slug);
        await page.locator('.shared-edit-token-modal-actions .btn-primary').click();
        await expect(page.locator('.share-toast')).toBeVisible();
        await expect(modal).toBeVisible();
        expect(tokenOf((await api.ok(api.get(`/notes/${two.id}/share`))).json.url)).toBe(own);
    });
    });

    test('a password from the dialog protects the page: wrong refused, right opens, removed opens freely', covers('data.share-password', 'data.public-password'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Protégée', content: '<p>Secret é</p>', type: 'note' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        await shared(page, 'Protégée');
        const modal = await editOf(page, 'Protégée');
        await modal.locator('input.modal-password-input').nth(1).fill('sésame');
        await saveEdit(page);
        await expect(rowOf(page, 'Protégée').locator('.shared-password-icon'), 'the row does not show the lock').toBeVisible();
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('.password-form')).toBeVisible();
        await expect(visitor.page.locator('body'), 'the content leaked').not.toContainText('Secret');
        await visitor.page.locator('input[name="note_password"]').fill('faux');
        await visitor.page.keyboard.press('Enter');
        await expect(visitor.page.locator('.error')).toBeVisible();
        await visitor.page.locator('input[name="note_password"]').fill('sésame');
        await visitor.page.keyboard.press('Enter');
        await expect(visitor.page.locator('.content')).toContainText('Secret é');
        await visitor.page.reload();
        await expect(visitor.page.locator('.content'), 'the password is asked again in the same visit').toContainText('Secret é');
        await visitor.context.close();
        await page.reload();
        const again = await editOf(page, 'Protégée');
        await expect(again.locator('input.modal-password-input').nth(1)).toHaveValue('sésame');
        await again.locator('input.modal-password-input').nth(1).fill('');
        await saveEdit(page);
        const free = await anonymous(browser);
        await free.page.goto(`/${token}`);
        await expect(free.page.locator('.content')).toContainText('Secret é');
        await free.context.close();
    });

    test('the indexing switch controls the robots tag', covers('data.share-indexing'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Indexable', content: '<p>x</p>', type: 'note' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        await shared(page, 'Indexable');
        const modal = await editOf(page, 'Indexable');
        await modal.locator('.share-indexable-wrap .toggle-slider').click();
        await saveEdit(page);
        await expect.poll(async () => (await api.ok(api.get(`/notes/${note.id}/share`))).json.indexable).toBeTruthy();
        await visitor.page.reload();
        await expect(visitor.page.locator('meta[name="robots"]'), 'still hidden from search engines').toHaveCount(0);
        await visitor.context.close();
    });

    test('a restricted share only opens for the chosen accounts', covers('data.share-restrict-users'), async ({ page, browser, playwright }) => {
        const friend = await newAccount(playwright, 'dfriend');
        const stranger = await newAccount(playwright, 'dintrus');
        const note = await api.createNote({ heading: 'Restreinte', content: '<p>Pour un ami</p>', type: 'note' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        await shared(page, 'Restreinte');
        const modal = await editOf(page, 'Restreinte');
        await modal.locator('.share-restrict-users-wrap .toggle-slider').click();
        const row = modal.locator('.share-user-list-row', { hasText: friend.username });
        await expect(row).toBeVisible();
        await row.locator('input[type="checkbox"]').check();
        await saveEdit(page);
        await expect(rowOf(page, 'Restreinte').locator('.shared-restricted-icon')).toBeVisible();
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('body'), 'an anonymous visitor read it').not.toContainText('Pour un ami');
        await login(visitor.page, stranger);
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('body'), 'another account read it').not.toContainText('Pour un ami');
        await visitor.context.close();
        const allowed = await anonymous(browser);
        await login(allowed.page, friend);
        await allowed.page.goto(`/${token}`);
        await expect(allowed.page.locator('.content')).toContainText('Pour un ami');
        await allowed.context.close();
    });

    test('an editable share lets a visitor change the text from the public page', covers('data.share-permissions', 'data.public-edit'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Modifiable', content: 'Version un\n', type: 'markdown' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        await shared(page, 'Modifiable');
        const modal = await editOf(page, 'Modifiable');
        await modal.locator('select').selectOption('edit');
        await saveEdit(page);
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${token}`);
        await visitor.page.locator('#publicEditToggle').click();
        const editor = visitor.page.locator('textarea.public-note-editor-markdown');
        await expect(editor).toHaveValue(/Version un/);
        await editor.fill('Version deux é\n');
        await visitor.page.locator('#publicEditSave').click();
        await expect(editor).toBeHidden();
        await expect(visitor.page.locator('.content')).toContainText('Version deux é');
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('Version deux é');
        await visitor.page.locator('#publicEditToggle').click();
        await editor.fill('Jamais enregistré');
        await visitor.page.locator('#publicEditCancel').click();
        const confirm = visitor.page.locator('.alert-modal-footer .alert-modal-button').last();
        await confirm.click();
        await expect(editor).toBeHidden();
        expect((await api.getNote(note.id)).content, 'Cancel saved anyway').not.toContain('Jamais');
        await visitor.page.reload();
        await expect(visitor.page.locator('.content')).toContainText('Version deux é');
        await visitor.context.close();
    });

    test('a task list share: read only blocks, check only ticks, full adds and deletes', covers('data.share-permissions', 'data.public-tasklist'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'Tâches publiques', type: 'tasklist', content: '[]' });
        await api.ok(api.post(`/notes/${note.id}/tasks`, { text: 'Première é' }));
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`, { access_mode: 'read_only' }))).json.url);
        const tasks = async () => (await api.ok(api.get(`/notes/${note.id}/tasks`))).json.tasks;
        const visitor = await anonymous(browser);
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('.task-text')).toContainText('Première é');
        await expect(visitor.page.locator('.task-checkbox').first(), 'read only must not tick').toBeDisabled();
        await expect(visitor.page.locator('.public-task-add-input')).toHaveCount(0);
        await shared(page, 'Tâches publiques');
        let modal = await editOf(page, 'Tâches publiques');
        await modal.locator('select').selectOption('check_only');
        await saveEdit(page);
        await visitor.page.reload();
        await visitor.page.locator('.task-checkbox').first().check();
        await expect.poll(async () => !!(await tasks())[0].completed).toBe(true);
        await expect(visitor.page.locator('.public-task-add-input')).toHaveCount(0);
        await page.reload();
        modal = await editOf(page, 'Tâches publiques');
        await modal.locator('select').selectOption('full');
        await saveEdit(page);
        await visitor.page.reload();
        await visitor.page.locator('.public-task-add-input').fill('Ajoutée dehors');
        await visitor.page.keyboard.press('Enter');
        await expect(visitor.page.locator('.task-text', { hasText: 'Ajoutée dehors' })).toBeVisible();
        await expect.poll(async () => (await tasks()).map((task) => task.text)).toContain('Ajoutée dehors');
        const added = visitor.page.locator('.task-item', { hasText: 'Ajoutée dehors' });
        await expect(added.locator('.public-task-delete-btn'), 'only a finished task can be deleted').toBeHidden();
        await added.locator('.task-checkbox').check();
        await added.locator('.public-task-delete-btn').click();
        await visitor.page.locator('.alert-modal-overlay .alert-modal-button').last().click();
        await expect(added).toHaveCount(0);
        await expect.poll(async () => (await tasks()).map((task) => task.text)).not.toContain('Ajoutée dehors');
        await visitor.context.close();
    });

    test('disable hides the page, enable brings it back, delete removes the share', covers('data.share-disable', 'data.share-revoke'), async ({ page, browser }) => {
        const note = await api.createNote({ heading: 'À révoquer', content: '<p>Bientôt fini</p>', type: 'note' });
        const token = tokenOf((await api.ok(api.post(`/notes/${note.id}/share`))).json.url);
        const visitor = await anonymous(browser);
        await shared(page, 'À révoquer');
        await rowOf(page, 'À révoquer').locator('.lucide-ban').click();
        await expect(page.locator('.shared-revoke-modal')).toBeVisible();
        await page.locator('.shared-revoke-modal .btn-secondary').click();
        await expect(page.locator('.shared-revoke-modal')).toBeHidden();
        expect((await visitor.page.request.get(`/${token}`)).status(), 'Cancel changed the share').toBe(200);
        await rowOf(page, 'À révoquer').locator('.lucide-ban').click();
        await page.locator('.shared-revoke-modal .btn-primary').click();
        await expect(rowOf(page, 'À révoquer').locator('.shared-disabled-icon')).toBeVisible();
        await visitor.page.goto(`/${token}`);
        await expect(visitor.page.locator('body'), 'a disabled share is still public').not.toContainText('Bientôt fini');
        await rowOf(page, 'À révoquer').locator('.lucide-eye-off').last().click();
        await page.locator('.shared-revoke-modal .btn-primary').click();
        await expect(rowOf(page, 'À révoquer').locator('.shared-disabled-icon')).toHaveCount(0);
        await visitor.page.reload();
        await expect(visitor.page.locator('.content')).toContainText('Bientôt fini');
        await rowOf(page, 'À révoquer').locator('.lucide-ban').click();
        await page.locator('.shared-revoke-modal .btn-danger').click();
        await expect(rowOf(page, 'À révoquer')).toHaveCount(0);
        expect((await api.ok(api.get(`/notes/${note.id}/share`))).json.public).toBe(false);
        expect((await visitor.page.request.get(`/${token}`)).status()).toBe(404);
        await visitor.context.close();
    });

    test('the shares page copies the link, opens the public page, opens the note, filters by text and by type', covers('data.shared-page', 'data.shared-copy', 'data.shared-filter', 'data.share-protocol'), async ({ page, context, playwright }) => {
        const fresh = await newAccount(playwright, 'dlist');
        const own = await Api.open(playwright, fresh);
        const one = await own.createNote({ heading: 'Liste abricot', content: '<p>x</p>', type: 'note' });
        const two = await own.createNote({ heading: 'Liste banane', content: '<p>x</p>', type: 'note' });
        const folder = (await own.ok(own.post('/folders', { folder_name: 'Dossier cerise' }))).json.folder;
        const token = tokenOf((await own.ok(own.post(`/notes/${one.id}/share`))).json.url);
        await own.ok(own.post(`/notes/${two.id}/share`));
        await own.ok(own.post(`/folders/${folder.id}/share`));
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
        await login(page, fresh);
        await page.goto('/shared.php');
        const row = rowOf(page, 'Liste abricot');
        await row.locator('.lucide-copy').click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: 'the link was not copied' }).toContain(`/${token}`);
        // The links default to https: this instance is plain http, as the switch of the dialog allows
        await row.locator('.lucide-pencil').click();
        const dialog = page.locator('.shared-edit-token-modal');
        await expect(dialog.locator('.shared-edit-token-modal-title-link')).toContainText('https://');
        await dialog.locator('.share-protocol-wrap .toggle-slider').click();
        await expect(dialog.locator('.shared-edit-token-modal-title-link'), 'the preview does not follow the switch').toContainText('http://');
        await page.locator('.shared-edit-token-modal-actions .btn-primary').click();
        await expect(dialog).toBeHidden();
        const [opened] = await Promise.all([context.waitForEvent('page'), row.locator('.lucide-external-link').click()]);
        await opened.waitForLoadState();
        expect(opened.url()).toContain(`http://`);
        expect(opened.url()).toContain(token);
        await expect(opened.locator('.public-note-title, h1').first()).toContainText('Liste abricot');
        await opened.close();
        await expect(row.locator('a.note-name')).toHaveAttribute('href', new RegExp(`index\\.php\\?note=${one.id}`));
        await page.locator('#filterInput').fill('abricot');
        await expect(rowOf(page, 'Liste abricot')).toBeVisible();
        await expect(rowOf(page, 'Liste banane')).toHaveCount(0);
        await expect(page).toHaveURL(/filter=abricot/);
        await page.locator('#clearFilterBtn').click();
        await expect(rowOf(page, 'Liste banane')).toBeVisible();
        await page.locator('.filter-type-btn[data-filter="folders"]').click();
        await expect(page.locator('.shared-folder-row', { hasText: 'Dossier cerise' })).toBeVisible();
        await expect(rowOf(page, 'Liste abricot')).toHaveCount(0);
        await page.locator('.filter-type-btn[data-filter="notes"]').click();
        await expect(rowOf(page, 'Liste abricot')).toBeVisible();
        await expect(page.locator('.shared-folder-row')).toHaveCount(0);
        await page.locator('.filter-type-btn[data-filter="all"]').click();
        await expect(page.locator('.shared-folder-row', { hasText: 'Dossier cerise' })).toBeVisible();
        await own.dispose();
    });

    test('shared with me lists the notes of another account', covers('data.shared-with-me'), async ({ page, playwright }) => {
        const friend = await newAccount(playwright, 'dmefriend');
        const note = await api.createNote({ heading: 'Pour moi seul', content: '<p>x</p>', type: 'note' });
        await api.ok(api.post(`/notes/${note.id}/share`));
        await api.ok(api.patch(`/notes/${note.id}/share`, { allowed_users: [friend.id] }));
        const other = await Api.open(playwright, friend);
        const listed = (await other.ok(other.get('/shared/with-me'))).text;
        expect(listed).toContain('Pour moi seul');
        await other.dispose();
        await login(page, friend);
        await page.goto('/shared.php');
        await page.locator('.filter-type-btn[data-filter="shared_with_me"]').click();
        await expect(page.locator('#sharedItemsContainer')).toContainText('Pour moi seul');
    });
});

test.describe('sharing a folder from the interface', () => {
    let api; let account; let folder; let sub; let top; let inner;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dfold');
        api = await Api.open(playwright, account);
        folder = (await api.ok(api.post('/folders', { folder_name: 'Partagé é' }))).json.folder;
        sub = (await api.ok(api.post('/folders', { folder_name: 'Sous partagé', parent_id: folder.id }))).json.folder;
        top = await api.createNote({ heading: 'Note abricot', content: '<p>Corps abricot</p>', type: 'note', folder_id: folder.id });
        inner = await api.createNote({ heading: 'Note banane', content: '# Corps banane\n', type: 'markdown', folder_id: sub.id });
        await api.createNote({ heading: 'Hors dossier', content: '<p>privé</p>', type: 'note' });
    });
    test.afterAll(async () => { await api.dispose(); });

    const visitorPage = async (browser) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
        return { context, page: await context.newPage() };
    };
    const shareFolder = async (id) => tokenOf((await api.ok(api.post(`/folders/${id}/share`))).json.url);

    test('the folder menu creates the share, its notes and subfolders are public, nothing else', covers('data.share-folder', 'data.public-folder', 'data.share-settings-dialog'), async ({ page, browser }) => {
        await login(page, account);
        await page.goto('/index.php');
        await settled(page);
        await page.locator(`.folder-header[data-folder-id="${folder.id}"]`).click({ button: 'right' });
        await page.locator('[data-action="share-folder"]:visible').first().click();
        await expect(page.locator('#folderShareModal')).toBeVisible();
        await page.locator('#folderShareModal .btn-primary').click();
        const settings = page.locator('.share-settings-modal');
        await expect(settings, 'its settings open in place (#1721)').toBeVisible();
        await expect(page).toHaveURL(/index\.php/);
        await settings.locator('.shared-edit-token-modal-actions .btn-secondary').click();
        await expect(settings).toBeHidden();
        const status = (await api.ok(api.get(`/folders/${folder.id}/share`))).json;
        expect(status.public).toBe(true);
        const token = tokenOf(status.url);
        const visitor = await visitorPage(browser);
        await visitor.page.goto(`/folder/${token}`);
        await expect(visitor.page.locator('h1')).toContainText('Partagé é');
        await expect(visitor.page.locator('.public-note-title', { hasText: 'Note abricot' })).toBeVisible();
        await expect(visitor.page.locator('.public-note-title', { hasText: 'Note banane' })).toBeVisible();
        await expect(visitor.page.locator('.public-folder-group-title', { hasText: 'Sous partagé' })).toBeVisible();
        await expect(visitor.page.locator('body'), 'a note outside the folder is listed').not.toContainText('Hors dossier');
        const [opened] = await Promise.all([visitor.context.waitForEvent('page'), visitor.page.locator('.public-note-link', { hasText: 'Note banane' }).click()]);
        await opened.waitForLoadState();
        await expect(opened.locator('.content h1')).toContainText('Corps banane');
        expect((await visitor.page.request.get(`/public_folder.php?token=${token}`)).status()).toBe(200);
        expect((await visitor.page.request.get('/folder/inconnu-e2e')).status()).toBeGreaterThanOrEqual(400);
        await visitor.context.close();
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });

    test('Cancel in the folder dialog creates nothing', covers('data.share-folder'), async ({ page }) => {
        await login(page, account);
        await page.goto('/index.php');
        await settled(page);
        await page.locator(`.folder-header[data-folder-id="${folder.id}"]`).click({ button: 'right' });
        await page.locator('[data-action="share-folder"]:visible').first().click();
        await page.locator('#folderShareModal .btn-cancel').click();
        await expect(page.locator('#folderShareModal')).toBeHidden();
        expect((await api.ok(api.get(`/folders/${folder.id}/share`))).json.public).toBe(false);
    });

    test('the public folder page filters, switches to its board, collapses groups and changes theme', covers('data.public-folder-filter', 'data.public-folder-kanban', 'data.public-theme'), async ({ browser }) => {
        const token = await shareFolder(folder.id);
        const visitor = await visitorPage(browser);
        await visitor.page.goto(`/folder/${token}`);
        const filter = visitor.page.locator('#folderFilterInput');
        await filter.fill('abricot');
        await expect(visitor.page.locator('.public-note-item:visible')).toHaveCount(1);
        await expect(visitor.page.locator('.public-note-title:visible')).toHaveText('Note abricot');
        await expect(visitor.page.locator('#folderFilterStats')).toContainText('1');
        await visitor.page.locator('#clearFilterBtn').click();
        await expect(filter).toHaveValue('');
        await expect(visitor.page.locator('.public-note-item:visible')).toHaveCount(2);
        await filter.fill('rien du tout');
        await expect(visitor.page.locator('#folderEmptyMessage, #folderNoResults').first()).toBeVisible();
        await filter.fill('');
        await visitor.page.locator('#viewToggle').click();
        await expect(visitor.page.locator('#kanbanView')).toBeVisible();
        await expect(visitor.page.locator('#listView')).toBeHidden();
        await expect(visitor.page.locator('.kanban-card-title', { hasText: 'Note banane' })).toBeVisible();
        await visitor.page.locator('#viewToggle').click();
        await expect(visitor.page.locator('#listView')).toBeVisible();
        const group = visitor.page.locator('.public-folder-group', { hasText: 'Sous partagé' });
        await group.locator('.public-folder-toggle').click();
        await expect(group.locator('.public-folder-toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(group.locator('.public-note-title')).toBeHidden();
        await group.locator('.public-folder-toggle').click();
        await expect(group.locator('.public-note-title')).toBeVisible();
        const html = visitor.page.locator('html');
        const before = await html.getAttribute('data-theme');
        const after = before === 'dark' ? 'light' : 'dark';
        await visitor.page.locator('.theme-toggle').click();
        await expect(html).toHaveAttribute('data-theme', after);
        await visitor.page.reload();
        await expect(html, 'the theme was not kept').toHaveAttribute('data-theme', after);
        await visitor.context.close();
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });

    test('a password on the folder protects the folder page and its notes', covers('data.share-folder-password'), async ({ page, browser }) => {
        const token = await shareFolder(folder.id);
        await login(page, account);
        await page.goto('/shared.php');
        const row = page.locator('.shared-folder-row', { hasText: 'Partagé é' });
        await row.locator('.lucide-pencil').click();
        await page.locator('.shared-edit-token-modal input.modal-password-input').nth(1).fill('dossier');
        await page.locator('.shared-edit-token-modal-actions .btn-primary').click();
        await expect(page.locator('.shared-edit-token-modal')).toBeHidden();
        const visitor = await visitorPage(browser);
        await visitor.page.goto(`/folder/${token}`);
        await expect(visitor.page.locator('body'), 'the list leaked').not.toContainText('Note abricot');
        await visitor.page.locator('input[type="password"]').fill('faux');
        await visitor.page.keyboard.press('Enter');
        await expect(visitor.page.locator('.error')).toBeVisible();
        await visitor.page.locator('input[type="password"]').fill('dossier');
        await visitor.page.keyboard.press('Enter');
        await expect(visitor.page.locator('.public-note-title', { hasText: 'Note abricot' })).toBeVisible();
        await visitor.context.close();
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });

    test('an editable folder lets a visitor edit its notes, a read-only one does not', covers('data.share-folder-edit'), async ({ browser }) => {
        const token = await shareFolder(folder.id);
        const visitor = await visitorPage(browser);
        await visitor.page.goto(`/folder/${token}`);
        const [readOnly] = await Promise.all([visitor.context.waitForEvent('page'), visitor.page.locator('.public-note-link', { hasText: 'Note banane' }).click()]);
        await readOnly.waitForLoadState();
        await expect(readOnly.locator('#publicEditToggle')).toHaveCount(0);
        await readOnly.close();
        await api.ok(api.patch(`/folders/${folder.id}/share`, { access_mode: 'edit' }));
        await visitor.page.reload();
        const [editable] = await Promise.all([visitor.context.waitForEvent('page'), visitor.page.locator('.public-note-link', { hasText: 'Note banane' }).click()]);
        await editable.waitForLoadState();
        await editable.locator('#publicEditToggle').click();
        await editable.locator('textarea.public-note-editor-markdown').fill('# Corps banane\n\nAjout public é\n');
        await editable.locator('#publicEditSave').click();
        await expect(editable.locator('.content')).toContainText('Ajout public é');
        await expect.poll(async () => (await api.getNote(inner.id)).content).toContain('Ajout public é');
        await visitor.context.close();
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });

    test('a note inside a shared folder says so, opens the folder share, can be excluded alone', covers('data.share-via-folder', 'data.modal-shared-via-folder'), async ({ page, browser }) => {
        const token = await shareFolder(folder.id);
        await login(page, account);
        await openNote(page, top.id);
        await page.locator('.btn-publish').first().click();
        await expect(page.locator('#sharedViaFolderModal')).toBeVisible();
        await expect(page.locator('#sharedViaFolderModal')).toContainText('Partagé é');
        await page.locator('#sharedViaFolderModal .btn-cancel').click();
        await expect(page.locator('#sharedViaFolderModal')).toBeHidden();
        await page.goto('/shared.php');
        const row = page.locator('.shared-note-item:not(.shared-folder-row)', { hasText: 'Note abricot' });
        await expect(row).toBeVisible();
        await row.locator('.lucide-ban').click();
        await page.locator('.shared-revoke-modal .btn-primary').click();
        await expect(row.locator('.shared-disabled-icon')).toBeVisible();
        const visitor = await visitorPage(browser);
        await visitor.page.goto(`/folder/${token}`);
        await expect(visitor.page.locator('.public-note-title', { hasText: 'Note banane' })).toBeVisible();
        await visitor.context.close();
        await api.ok(api.patch(`/notes/${top.id}/share`, { disabled: false }));
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });

    test('the shares page collapses a folder and expands all', covers('data.shared-tree'), async ({ page }) => {
        await shareFolder(folder.id);
        await login(page, account);
        await page.goto('/shared.php');
        const folderRow = page.locator('.shared-folder-row', { hasText: 'Partagé é' }).first();
        await expect(page.locator('.shared-note-item', { hasText: 'Note abricot' })).toBeVisible();
        await folderRow.locator('.shared-folder-toggle').click();
        await expect(page.locator('.shared-note-item', { hasText: 'Note abricot' })).toHaveCount(0);
        await page.locator('#toggleAllFoldersBtn').click();
        await expect(page.locator('.shared-note-item', { hasText: 'Note abricot' })).toBeVisible();
        await api.ok(api.del(`/folders/${folder.id}/share`));
    });
});

test.describe('public pages', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dpub');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.use({ viewport: { width: 1200, height: 800 } });

    const publish = async (fields, share = {}) => {
        const note = await api.createNote(fields);
        return { note, token: tokenOf((await api.ok(api.post(`/notes/${note.id}/share`, share))).json.url) };
    };

    test('each kind of Markdown content is drawn, not shown as source', covers('data.public-render-markdown'), async ({ page }) => {
        const { token } = await publish({ heading: 'Tout le markdown', content: KITCHEN_MD, type: 'markdown' });
        await page.goto(`/${token}`);
        const content = page.locator('.content');
        await expect(content.locator('h1').first()).toContainText('Titre de niveau 1');
        await expect(content.locator('table').first()).toBeVisible();
        await expect(content.locator('pre code').first()).toBeVisible();
        await expect(content.locator('.mermaid svg, svg[id^="mermaid"]').first(), 'the diagram was not drawn').toBeVisible({ timeout: 15_000 });
        await expect(content).not.toContainText('```');
        await expect(content.locator('[contenteditable="true"], textarea')).toHaveCount(0);
    });

    test('rich text keeps its content and its images are served to visitors', covers('data.public-render-rich', 'data.public-attachments'), async ({ page, browser }) => {
        const { note, token } = await publish({ heading: 'Tout le riche', content: KITCHEN_HTML, type: 'note' });
        const id = await uploaded(api, note.id);
        await api.ok(api.patch(`/notes/${note.id}`, { content: `${KITCHEN_HTML}<p><img id="e2e-img" src="/api/v1/notes/${note.id}/attachments/${id}"></p>` }));
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const visitor = await context.newPage();
        await visitor.goto(`/${token}`);
        await expect(visitor.locator('.content table').first()).toBeVisible();
        await expect(visitor.locator('.content')).toContainText('Cellule 2');
        await expect.poll(() => visitor.locator('.content img[src*="attachments"]').first().evaluate((img) => img.naturalWidth), { message: 'the image does not load for a visitor' }).toBe(1);
        await context.close();
        await page.close();
    });

    test('a task list renders its states, and scripts in a note never run', covers('data.public-render-tasklist', 'data.public-sanitize'), async ({ page }) => {
        const list = await publish({ heading: 'Liste publique', type: 'tasklist', content: '[]' }, { access_mode: 'read_only' });
        const made = await api.ok(api.post(`/notes/${list.note.id}/tasks`, { text: 'Cochée é' }));
        await api.ok(api.patch(`/notes/${list.note.id}/tasks/${(made.json.task || made.json).id}`, { completed: true }));
        await page.goto(`/${list.token}`);
        await expect(page.locator('.task-item.completed, .task-item:has(input:checked)').first()).toContainText('Cochée é');
        await expect(page.locator('.task-checkbox').first()).toBeChecked();
        const hostile = await publish({ heading: 'Hostile', content: '# Hostile\n\n<img src=x onerror="window.__hacked=1">\n\n<script>window.__hacked=2</script>\n', type: 'markdown' });
        await page.goto(`/${hostile.token}`);
        await expect(page.locator('.content h1')).toContainText('Hostile');
        await page.waitForLoadState('load');
        expect(await page.evaluate(() => window.__hacked), 'a script ran on a public page').toBeUndefined();
    });

    test('the theme comes from the share, a URL parameter or the toggle, which is remembered', covers('data.public-theme'), async ({ page, browser }) => {
        const dark = await publish({ heading: 'Sombre', content: '<p>x</p>', type: 'note' }, { theme: 'dark' });
        await page.goto(`/${dark.token}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('#themeToggle i')).toHaveClass(/lucide-sun/);
        const bare = await publish({ heading: 'Sans thème', content: '<p>x</p>', type: 'note' }, { theme: '' });
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const visitor = await context.newPage();
        const html = visitor.locator('html');
        await visitor.goto(`/${bare.token}`);
        const initial = await html.getAttribute('data-theme');
        const other = initial === 'dark' ? 'light' : 'dark';
        await visitor.locator('#themeToggle').click();
        await expect(html).toHaveAttribute('data-theme', other);
        await visitor.reload();
        await expect(html, 'the toggle is not remembered').toHaveAttribute('data-theme', other);
        await context.close();
        const param = await browser.newContext({ serviceWorkers: 'block' });
        const withParam = await param.newPage();
        await withParam.goto(`/public_note.php?token=${bare.token}&theme=dark`);
        await expect(withParam.locator('html')).toHaveAttribute('data-theme', 'dark');
        await param.close();
    });

    test('an unknown link says not found, a trashed note stops being public', covers('data.public-not-found'), async ({ page, playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const missing = await anonymous.get('/public_note.php?token=inconnu-e2e');
        expect(missing.status()).toBe(404);
        const { note, token } = await publish({ heading: 'Bientôt jetée', content: '<p>Encore là</p>', type: 'note' });
        expect(await (await anonymous.get(`/${token}`)).text()).toContain('Encore là');
        await api.ok(api.del(`/notes/${note.id}`));
        expect(await (await anonymous.get(`/${token}`)).text(), 'a trashed note is still public').not.toContain('Encore là');
        await anonymous.dispose();
        await page.close();
    });

    test('a heading on a public page gives a link to its section', covers('data.public-section-link'), async ({ browser }) => {
        const { token } = await publish({ heading: 'Sections', content: '# Partie une\n\ntexte\n\n## Partie deux\n\nfin\n', type: 'markdown' });
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
        const visitor = await context.newPage();
        await visitor.goto(`/${token}`);
        const heading = visitor.locator('.content h2', { hasText: 'Partie deux' });
        await heading.hover();
        await heading.locator('a, button').first().click();
        await expect.poll(() => visitor.evaluate(() => navigator.clipboard.readText())).toContain(`${token}#`);
        const url = await visitor.evaluate(() => navigator.clipboard.readText());
        await visitor.goto(url);
        await expect(visitor.locator('.content h2', { hasText: 'Partie deux' })).toBeInViewport();
        await context.close();
    });

    test('public edit is locked while another visitor edits', covers('data.public-edit-lock'), async ({ browser }) => {
        const { token, note } = await publish({ heading: 'Verrouillée', content: 'Texte\n', type: 'markdown' }, { access_mode: 'edit' });
        const one = await browser.newContext({ serviceWorkers: 'block' });
        const two = await browser.newContext({ serviceWorkers: 'block' });
        const first = await one.newPage();
        const second = await two.newPage();
        await first.goto(`/${token}`);
        await second.goto(`/${token}`);
        await first.locator('#publicEditToggle').click();
        await expect(first.locator('textarea.public-note-editor-markdown')).toBeVisible();
        await second.locator('#publicEditToggle').click();
        await expect(second.locator('textarea.public-note-editor-markdown'), 'two visitors edit at once').toBeHidden();
        await expect(second.locator('.alert-modal').first()).toBeVisible();
        expect((await api.getNote(note.id)).content).toContain('Texte');
        await one.close();
        await two.close();
    });
});

// --- Instance-wide settings: everything below restores them in a finally ------
function setGlobals(values) {
    const lines = Object.entries(values).map(([key, value]) => `setGlobalSetting(${JSON.stringify(key)}, ${JSON.stringify(String(value))});`).join(' ');
    inInstance(`cat > /tmp/e2e-globals.php <<'PHP'\n<?php require '/var/www/html/config.php'; require_once '/var/www/html/users/db_master.php'; ${lines}\nPHP\nphp /tmp/e2e-globals.php; chown -R www-data:www-data /var/www/html/data`);
}
const mockGet = (route) => JSON.parse(inInstance(`wget -qO- '${MOCK}${route}'`));
const asWorker = (script) => inInstance(`su -s /bin/sh www-data -c 'php /var/www/html/workers/${script} --once'`);
/** The Confirm button of a modalAlert.confirm(). */
const confirmDialog = (page) => page.locator('.alert-modal-overlay .alert-modal-button').last().click();
const savedOk = (page) => expect(page.locator('.alert-success').first()).toBeVisible();
/** The real checkbox of a switch sits under its slider. */
async function setSwitch(page, selector, wanted) {
    const box = page.locator(selector);
    if (await box.isChecked() !== wanted) await page.locator(`label.switch:has(${selector}) .slider`).click();
    await expect(box).toBeChecked({ checked: wanted });
}

/** The boxes of a settings page start folded. */
async function openSettingsPage(page, url) {
    await page.goto(url);
    for (const toggle of await page.locator('.settings-box-toggle').all()) {
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    }
}
const SAVE = 'form:has(input[name="action"][value="save_config"]) button[type="submit"]:not([value="test"])';

test.describe('local backups', () => {
    const dir = `/tmp/e2e-local-${process.pid}`;
    let owner; let api;
    test.beforeAll(async ({ playwright }) => {
        owner = await newAccount(playwright, 'dlocal');
        api = await Api.open(playwright, owner);
        await api.createNote({ heading: 'Locale é', content: '<p>Sauvegarde locale</p>', type: 'note' });
    });
    test.afterAll(async () => {
        await api.dispose();
        setGlobals({ local_backup_auto_enabled: '0', local_backup_directory: '', local_backup_user_ids: '', local_backup_retention: '7', local_backup_frequency: 'daily', local_backup_last_auto_run: '0' });
        inInstance(`rm -rf ${dir}`);
    });

    const onlyOwner = async (page) => {
        await page.locator('#local-backup-users-select-none').click();
        await page.locator('#local-backup-user-filter').fill(owner.username);
        await page.locator(`input[name="local_backup_users[]"][value="${owner.id}"]`).check();
    };
    const configure = async (page, retention = '5') => {
        await login(page, ADMIN);
        await openSettingsPage(page, '/local_backup_settings.php');
        await page.locator('#local_backup_directory').fill(dir);
        await page.locator('#local_backup_retention').fill(retention);
        await onlyOwner(page);
        await page.locator(SAVE).click();
        await savedOk(page);
    };
    const runNow = async (page, expected = 1) => {
        await page.locator('#local-backup-run-btn').click();
        await confirmDialog(page);
        await expect(page.locator('#local-backup-run-log'), 'the run did not report the account').toContainText(owner.username, { timeout: 30_000 });
        await expect(page.locator('#local-backup-last-run'), 'the last run is not shown').toContainText(`${expected}`, { timeout: 15_000 });
    };

    test('refuses a relative folder, one inside the app and an empty selection, and keeps what was typed', covers('data.local-backup-config'), async ({ page }) => {
        await login(page, ADMIN);
        await openSettingsPage(page, '/local_backup_settings.php');
        await page.locator('#local_backup_directory').fill('relatif/dossier');
        await page.locator(SAVE).click();
        await expect(page.locator('.alert-error, .alert-danger').first()).toContainText('absolute');
        await expect(page.locator('#local_backup_directory')).toHaveValue('relatif/dossier');
        await page.locator('#local_backup_directory').fill('/var/www/html/public/sauvegardes');
        await page.locator(SAVE).click();
        await expect(page.locator('.alert-error, .alert-danger').first()).toContainText('inside the application');
        await page.locator('#local_backup_directory').fill(dir);
        await page.locator('#local-backup-users-select-none').click();
        await page.locator(SAVE).click();
        await expect(page.locator('.alert-error, .alert-danger').first()).toContainText('at least one user');
    });

    test('configure, save and read back: folder, retention, frequency, schedule, users', covers('data.local-backup-config', 'data.local-backup-page'), async ({ page }) => {
        await login(page, ADMIN);
        await openSettingsPage(page, '/local_backup_settings.php');
        await page.locator('#local_backup_directory').fill(dir);
        await page.locator('#local_backup_retention').fill('4');
        await page.locator('#local_backup_frequency').selectOption('weekly');
        await setSwitch(page, '#local_backup_auto_enabled', true);
        await onlyOwner(page);
        await expect(page.locator('#local-backup-users-count')).toContainText('1');
        await page.locator(SAVE).click();
        await savedOk(page);
        await openSettingsPage(page, '/local_backup_settings.php'); // a reload would post the form again
        await expect(page.locator('#local_backup_directory')).toHaveValue(dir);
        await expect(page.locator('#local_backup_retention')).toHaveValue('4');
        await expect(page.locator('#local_backup_frequency')).toHaveValue('weekly');
        await expect(page.locator('#local_backup_auto_enabled')).toBeChecked();
        await expect(page.locator(`input[name="local_backup_users[]"][value="${owner.id}"]`)).toBeChecked();
        await expect(page.locator(`input[name="local_backup_users[]"][value="1"]`)).not.toBeChecked();
        await setSwitch(page, '#local_backup_auto_enabled', false);
        await page.locator(SAVE).click();
        await savedOk(page);
    });

    test('Back up now writes the archive, the list downloads, filters and deletes it', covers('data.local-backup-run', 'data.local-backup-list', 'data.local-backup-download', 'data.local-backup-delete'), async ({ page }) => {
        await configure(page);
        await runNow(page);
        const row = page.locator('#local-backup-table tbody tr', { hasText: owner.username });
        await expect(row).toHaveCount(1);
        const zip = await downloadOf(page, () => row.locator('a.btn-primary').click());
        expect(zip.name).toMatch(/\.zip$/);
        expect(plain(Object.values(readZip(zip.body)).map((file) => file.toString('utf8')).join()), 'the archive is not of this account').toContain('Sauvegarde locale');
        expect(inInstance(`ls ${dir}/${owner.id}/`), 'no file in the folder').toContain(zip.name);
        await page.locator('#local-backup-list-filter').fill('personne-de-ce-nom');
        await expect(page.locator('#local-backup-list-no-match')).toBeVisible();
        await page.locator('#local-backup-list-filter-clear').click();
        await expect(row).toHaveCount(1);
        await row.locator('.btn-danger').click();
        await confirmDialog(page);
        await expect(row).toHaveCount(0);
        expect(inInstance(`ls ${dir}/${owner.id}/ | wc -l`).trim(), 'the file stayed').toBe('0');
    });

    test('retention keeps only the newest archives', covers('data.local-backup-retention'), async ({ page }) => {
        await configure(page, '1');
        await runNow(page);
        await expect.poll(() => inInstance(`ls ${dir}/${owner.id}/`).trim().split('\n').length).toBe(1);
        const first = inInstance(`ls ${dir}/${owner.id}/`).trim();
        await page.waitForTimeout(1100); // the archive name holds the second
        await page.locator('#local-backup-run-log').evaluate((el) => { el.textContent = ''; });
        await runNow(page);
        await expect.poll(() => inInstance(`ls ${dir}/${owner.id}/`).trim()).not.toBe(first);
        expect(inInstance(`ls ${dir}/${owner.id}/`).trim().split('\n').length, 'retention did not prune').toBe(1);
    });

    test('the schedule runs when due, is reported as automatic and not run again too soon', covers('data.local-backup-scheduled'), async ({ page }) => {
        await configure(page);
        setGlobals({ local_backup_auto_enabled: '1', local_backup_last_auto_run: '0', local_backup_frequency: 'daily' });
        inInstance(`rm -f ${dir}/${owner.id}/*`);
        asWorker('s3-backup-worker.php');
        expect(inInstance(`ls ${dir}/${owner.id}/`).trim(), 'the worker wrote nothing').toMatch(/\.zip/);
        await openSettingsPage(page, '/local_backup_settings.php'); // a reload would post the form again
        await expect(page.locator('#local-backup-last-run')).toContainText(/auto/i);
        await expect(page.locator('#local-backup-last-run'), 'the next run is not announced').toContainText(/next/i);
        inInstance(`rm -f ${dir}/${owner.id}/*`);
        asWorker('s3-backup-worker.php');
        expect(inInstance(`ls ${dir}/${owner.id}/ | wc -l`).trim(), 'a second run was not due').toBe('0');
        setGlobals({ local_backup_auto_enabled: '0' });
    });

    test('a non-administrator gets no local backup page or API', covers('data.local-backup-page'), async ({ page }) => {
        await login(page, owner);
        const denied = await page.request.get('/api_local_backup.php?action=list');
        expect(denied.status()).toBe(403);
        expect((await denied.json()).success).toBe(false);
        const blocked = await page.request.get('/local_backup_settings.php', { maxRedirects: 0 });
        expect(await blocked.text()).not.toContain('local-backup-run-btn');
    });
});

test.describe('S3 backups page before any configuration', () => {
    // KNOWN: reported, see the test.fail below
    test.use({ allowedErrors: [/status of 500|HTTP 500/] });
    test('opening the page on a new instance does not answer a server error', covers('data.s3-backup-page'), async ({ page }) => {
        test.fail(true, 'BUG: s3_backup_settings.php lists the bucket on load, api_s3_backup.php?action=list answers 500 "Invalid S3 endpoint URL" while nothing is configured');
        setGlobals({ s3_backup_endpoint: '', s3_backup_bucket: '', s3_backup_access_key: '', s3_backup_secret_key: '' });
        await login(page, ADMIN);
        const list = page.waitForResponse(/api_s3_backup\.php\?action=list/);
        await page.goto('/s3_backup_settings.php');
        expect((await list).status()).toBeLessThan(500);
    });
});

test.describe('S3 backups', () => {
    let owner; let api;
    const prefix = () => `backups/${owner.id}/`;
    const bucket = () => inInstance(`wget -qO- '${MOCK}/bucket?prefix=${prefix()}'`);
    const purge = () => inInstance('rm -f /tmp/poznote-e2e-mock/*.key');
    test.beforeAll(async ({ playwright }) => {
        owner = await newAccount(playwright, 'ds3bak');
        api = await Api.open(playwright, owner);
        await api.createNote({ heading: 'Dans le seau', content: '<p>Sauvegarde S3</p>', type: 'note' });
        // So that the page does not hit the bug above before the form is filled
        setGlobals({ s3_backup_endpoint: MOCK, s3_backup_bucket: 'bucket', s3_backup_access_key: 'cle', s3_backup_secret_key: 'secret', s3_backup_path_style: '1' });
    });
    test.afterAll(async () => {
        await api.dispose();
        setGlobals({ s3_backup_enabled: '0', s3_backup_auto_enabled: '0', s3_backup_endpoint: '', s3_backup_bucket: '', s3_backup_access_key: '', s3_backup_secret_key: '', s3_backup_user_ids: '', s3_backup_retention: '7', s3_backup_last_auto_run: '0', user_max_backups_s3_mb: '0' });
    });

    const configure = async (page, retention = '5') => {
        await login(page, ADMIN);
        await openSettingsPage(page, '/s3_backup_settings.php');
        if (!(await page.locator('#s3_backup_enabled').isChecked())) {
            await page.locator('#s3-backup-master-form .slider').click();
            await page.waitForLoadState();
            await expect(page.locator('#s3_backup_enabled')).toBeChecked();
        }
        await page.locator('#s3_backup_endpoint').fill(MOCK);
        await page.locator('#s3_backup_region').fill('us-east-1');
        await page.locator('#s3_backup_bucket').fill('bucket');
        await page.locator('#s3_backup_access_key').fill('cle');
        await page.locator('#s3_backup_secret_key').fill('secret');
        await setSwitch(page, '#s3_backup_path_style', true);
        await page.locator('#s3_backup_retention').fill(retention);
        await page.locator('#s3-backup-users-select-none').click();
        await page.locator('#s3-backup-user-filter').fill(owner.username);
        await page.locator(`input[name="s3_backup_users[]"][value="${owner.id}"]`).check();
        await page.locator(SAVE).click();
        await savedOk(page);
    };
    const runNow = async (page) => {
        await page.locator('#s3-backup-run-btn').click();
        await confirmDialog(page);
        await expect(page.locator('#s3-backup-run-log')).toContainText(owner.username, { timeout: 30_000 });
    };

    test('the master switch, the configuration and the connection test', covers('data.s3-backup-config', 'data.s3-backup-page', 'data.s3-backup-test'), async ({ page }) => {
        await configure(page);
        await openSettingsPage(page, '/s3_backup_settings.php'); // a reload would post the form again
        await expect(page.locator('#s3_backup_endpoint')).toHaveValue(MOCK);
        await expect(page.locator('#s3_backup_bucket')).toHaveValue('bucket');
        await page.locator('#s3-backup-test-btn').click();
        await expect(page.locator('#s3-backup-test-result')).toContainText(/success|ok/i, { timeout: 15_000 });
        await page.locator('#s3_backup_endpoint').fill('http://127.0.0.1:1');
        await page.locator('#s3-backup-test-btn').click();
        await expect(page.locator('#s3-backup-test-result')).not.toContainText(/success/i, { timeout: 15_000 });
    });

    test('Back up now sends the archive to the bucket, the list downloads and deletes it', covers('data.s3-backup-run', 'data.s3-backup-list', 'data.s3-backup-download', 'data.s3-backup-delete'), async ({ page }) => {
        purge();
        await configure(page);
        await runNow(page);
        expect(bucket(), 'nothing reached the bucket').toContain(prefix());
        const row = page.locator('#s3-backup-table tbody tr', { hasText: owner.username });
        await expect(row).toHaveCount(1);
        const zip = await downloadOf(page, () => row.locator('a.btn-primary').click());
        expect(plain(Object.values(readZip(zip.body)).map((file) => file.toString('utf8')).join())).toContain('Sauvegarde S3');
        await row.locator('.btn-danger').click();
        await confirmDialog(page);
        await expect(row).toHaveCount(0);
        expect(bucket(), 'the object stayed').not.toContain('.zip');
    });

    test('retention prunes the bucket, the schedule runs from the worker', covers('data.s3-backup-retention', 'data.s3-backup-scheduled'), async ({ page }) => {
        purge();
        await configure(page, '1');
        setGlobals({ s3_backup_auto_enabled: '1', s3_backup_last_auto_run: '0', s3_backup_frequency: 'daily' });
        asWorker('s3-backup-worker.php');
        await expect.poll(() => (bucket().match(/<Key>/g) || []).length, { message: 'the worker uploaded nothing' }).toBe(1);
        const first = bucket();
        await page.waitForTimeout(1100); // the archive name holds the second
        await openSettingsPage(page, '/s3_backup_settings.php'); // a reload would post the form again
        await expect(page.locator('#s3-backup-last-run')).toContainText(/auto/i);
        await runNow(page);
        await expect.poll(bucket).not.toBe(first);
        expect((bucket().match(/<Key>/g) || []).length, 'retention did not prune').toBe(1);
        setGlobals({ s3_backup_auto_enabled: '0' });
    });

    test('a user backs up their own account to S3, lists, downloads, deletes, and restores it', covers('data.s3-self-backup', 'data.s3-restore', 'data.card-s3-self', 'data.card-restore-s3'), async ({ page }) => {
        purge();
        await configure(page);
        await switchAccount(page, owner);
        await page.goto('/settings.php#section=settings-backup-restore-section-grid');
        await page.locator('#s3-backup-card').click();
        await expect(page).toHaveURL(/part=s3/);
        await expect(page.locator('#s3SelfBackupPolicy')).toBeVisible();
        await page.locator('#s3SelfBackupBtn').click();
        await confirmDialog(page);
        await expect(page.locator('#s3SelfBackupStatus.is-success')).toBeVisible({ timeout: 30_000 });
        const row = page.locator('#s3SelfBackupTable tbody tr');
        await expect(row).toHaveCount(1);
        const zip = await downloadOf(page, () => row.locator('a.btn-primary').click());
        expect(plain(Object.values(readZip(zip.body)).map((file) => file.toString('utf8')).join())).toContain('Sauvegarde S3');

        const later = await api.createNote({ heading: 'Après le seau', content: '<p>x</p>', type: 'note' });
        await page.goto('/settings.php#section=settings-backup-restore-section-grid');
        await page.locator('#restore-s3-card').click();
        await expect(page).toHaveURL(/part=restore-s3/);
        await expect(page.locator('#s3RestoreBtn')).toBeEnabled();
        expect(await page.locator('#s3RestoreSelect').inputValue()).toContain(prefix());
        await page.locator('#s3RestoreBtn').click();
        await confirmDialog(page);
        await expect(page.locator('#chunkedRestoreSuccess')).toBeVisible({ timeout: 45_000 });
        expect((await api.get(`/notes/${later.id}`)).status, 'the restore kept a later note').toBe(404);

        await page.goto('/backup_export.php?part=s3');
        await expect(row).toHaveCount(1);
        await row.locator('.btn-danger').click();
        await confirmDialog(page);
        await expect(row).toHaveCount(0);
        expect(bucket()).not.toContain('.zip');
    });

    test('a user cannot download or delete an archive of another account', covers('data.s3-self-backup'), async ({ page, playwright }) => {
        purge();
        await configure(page);
        await runNow(page);
        const key = bucket().match(/<Key>([^<]+)<\/Key>/)[1];
        await page.context().clearCookies();
        const stranger = await newAccount(playwright, 'ds3other');
        await login(page, stranger);
        expect((await page.request.get(`/api_s3_backup.php?action=self_download&key=${encodeURIComponent(key)}`)).status()).toBeGreaterThanOrEqual(400);
        const removal = await page.request.post('/api_s3_backup.php?action=self_delete', { form: { key } });
        expect((await removal.json()).success).toBe(false);
        expect(bucket(), 'the archive of another account was deleted').toContain(key);
        expect((await page.request.get('/api_s3_backup.php?action=list')).status(), 'the admin list must be refused').toBe(403);
    });

    test('the S3 backups quota refuses an archive over the limit', covers('data.s3-backup-quota'), async ({ page }) => {
        purge();
        await configure(page);
        const noise = require('node:crypto').randomBytes(1_500_000);
        const note = await api.createNote({ heading: 'Lourde', content: '<p>x</p>', type: 'note' });
        await uploaded(api, note.id, 'bruit.bin.png', 'image/png', Buffer.concat([PNG, noise]));
        setGlobals({ user_max_backups_s3_mb: '1' });
        await switchAccount(page, owner);
        await page.goto('/backup_export.php?part=s3');
        await page.locator('#s3SelfBackupBtn').click();
        await confirmDialog(page);
        await expect(page.locator('#s3SelfBackupStatus')).toContainText(/quota|limit/i, { timeout: 30_000 });
        expect(bucket(), 'an archive over the quota was uploaded').not.toContain('.zip');
        await api.ok(api.del(`/notes/${note.id}`));
        setGlobals({ user_max_backups_s3_mb: '0' });
    });
});

test.describe('S3 attachment storage', () => {
    let owner; let api;
    const keysOf = () => inInstance(`wget -qO- '${MOCK}/bucket?prefix=attachments/'`);
    const restore = async (page) => {
        // Instance-wide: every attachment goes back on disk before the other specs run
        for (let round = 0; round < 20; round++) {
            const moved = await (await page.request.post('/api_s3_storage.php?action=migrate_to_local')).json();
            if (!moved.remaining) break;
        }
        setGlobals({ s3_storage_enabled: '0', s3_storage_endpoint: '', s3_storage_bucket: '', s3_storage_access_key: '', s3_storage_secret_key: '' });
    };
    test.beforeAll(async ({ playwright }) => {
        owner = await newAccount(playwright, 'ds3att');
        api = await Api.open(playwright, owner);
    });
    test.afterAll(async () => { await api.dispose(); });

    test('configure, test, enable: new attachments go to the bucket, are served back, migrate both ways', covers('data.s3-storage-config', 'data.s3-storage-test', 'data.s3-storage-attachments', 'data.s3-storage-migrate'), async ({ page, context }) => {
        test.setTimeout(150_000);
        const note = await api.createNote({ heading: 'Avec fichier', content: '<p>x</p>', type: 'note' });
        const local = await uploaded(api, note.id, 'avant.png');
        inInstance('rm -f /tmp/poznote-e2e-mock/*.key');
        try {
            await login(page, ADMIN);
            await openSettingsPage(page, '/s3_settings.php');
            await page.locator('#s3_endpoint').fill(MOCK);
            await page.locator('#s3_region').fill('us-east-1');
            await page.locator('#s3_bucket').fill('bucket');
            await page.locator('#s3_access_key').fill('cle');
            await page.locator('#s3_secret_key').fill('secret');
            await setSwitch(page, '#s3_path_style', true);
            await page.locator('#s3-test-btn').click();
            await expect(page.locator('#s3-test-result')).toContainText(/success|ok/i, { timeout: 15_000 });
            await page.locator(SAVE).click();
            await savedOk(page);
            await openSettingsPage(page, '/s3_settings.php'); // a reload would post the form again
            await expect(page.locator('#s3_endpoint')).toHaveValue(MOCK);
            await expect(page.locator('#s3-local-status')).not.toHaveText('…');
            await page.locator('#s3-migrate-to-s3-btn').click();
            await confirmDialog(page);
            await expect(page.locator('#s3-migration-status'), 'the migration did not finish').toContainText(/finished/i, { timeout: 30_000 });
            await expect.poll(keysOf, { message: 'nothing was migrated', timeout: 30_000 }).toContain(`attachments/${owner.id}/`);
            await expect(page.locator('#s3-migrate-to-s3-btn')).toBeEnabled({ timeout: 30_000 });

            await setSwitch(page, '#s3_enabled', true);
            await page.locator(SAVE).click();
            await savedOk(page);
            await expect(page.locator('#s3_enabled')).toBeChecked();
            expect((await api.ok(api.get(`/notes/${note.id}/attachments/${local}`))).body.equals(PNG), 'a migrated file is not served from the bucket').toBe(true);

            const added = await uploaded(api, note.id, 'apres.png');
            const count = (keysOf().match(/<Key>/g) || []).length;
            expect(count).toBeGreaterThan(0);
            expect(keysOf(), 'the new attachment is not in the bucket').toContain(`attachments/${owner.id}/`);
            expect((await api.ok(api.get(`/notes/${note.id}/attachments/${added}`))).body.equals(PNG), 'the new file changed').toBe(true);
            await openSettingsPage(page, '/s3_settings.php');
            await page.locator('#s3-migrate-to-local-btn').click();
            await confirmDialog(page);
            await expect.poll(() => (keysOf().match(new RegExp(`attachments/${owner.id}/`, 'g')) || []).length, { message: 'the bucket was not emptied', timeout: 30_000 }).toBe(0);
        } finally {
            await restore(page);
        }
        expect((await api.ok(api.get(`/notes/${note.id}/attachments/${local}`))).body.equals(PNG), 'the file is lost after the return trip').toBe(true);
    });

    test('a user gets no S3 storage page or API', covers('data.s3-storage-config'), async ({ page }) => {
        await login(page, owner);
        expect((await page.request.get('/api_s3_storage.php?action=status')).status()).toBe(403);
        expect((await page.request.get('/api_s3_backup.php?action=status')).status()).toBe(403);
        const blocked = await page.request.get('/s3_settings.php', { maxRedirects: 0 });
        expect(await blocked.text()).not.toContain('s3_endpoint');
    });
});

test.describe('Git sync', () => {
    // Each test goes through several full syncs
    test.describe.configure({ timeout: 150_000 });
    let account; let api;
    const scope = (name) => `${name}-${process.pid}`;
    const base = (name) => `${MOCK}/forge/${scope(name)}`;
    const remote = (name) => mockGet(`/forge/${scope(name)}/_files`);
    const log = (name) => mockGet(`/forge/${scope(name)}/_log`);
    const b64url = (text) => encodeURIComponent(Buffer.from(text).toString('base64'));
    const writeRemote = (name, file, text) => mockGet(`/forge/${scope(name)}/_write?path=${encodeURIComponent(file)}&b64=${b64url(text)}`);

    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dgit');
        api = await Api.open(playwright, account);
        // A user may only reach public hosts, unless the administrator lists the mock
        setGlobals({ outbound_allowed_hosts: '127.0.0.1', git_sync_enabled: '1' });
    });
    test.afterAll(async () => {
        await api.dispose();
        setGlobals({ outbound_allowed_hosts: '', git_sync_enabled: '0' });
    });

    const fillForm = async (page, provider, scopeName, token = 'jeton-valide') => {
        await login(page, account);
        await openSettingsPage(page, '/git_sync.php');
        await page.locator('#git_provider').selectOption(provider);
        await page.locator('#git_api_base').fill(base(scopeName));
        await page.locator('#git_token').fill(token);
        await page.locator('#git_repo').fill('mock/repo');
        await page.locator('#git_branch').fill('main');
        await page.locator('#git_author_name').fill('Auteur é');
        await page.locator('#git_author_email').fill('auteur@example.com');
        await page.locator('form.git-config-form button[type="submit"]:not([value="test"])').click();
        await savedOk(page);
    };
    const rail = async (page, action) => {
        await page.goto('/index.php?workspace=Poznote');
        await settled(page);
        const button = page.locator(`[data-icon-sidebar-git-action="${action}"]`);
        await expect(button, `no ${action} button in the rail`).toBeVisible();
        await button.click();
        // The page reloads once the sync is over
        const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
        await confirmDialog(page);
        await reloaded;
        await page.waitForLoadState();
    };

    test('the administrator card switches Git sync on and off for the whole instance', covers('data.git-enable', 'data.card-git-enabled'), async ({ page }) => {
        try {
            setGlobals({ git_sync_enabled: '0' });
            await login(page, account);
            await openSettingsPage(page, '/git_sync.php');
            await expect(page.locator('.badge-disabled')).toBeVisible();
            await expect(page.locator('#git_token'), 'the form shows while disabled').toHaveCount(0);
            await switchAccount(page, ADMIN);
            await page.goto('/settings.php#section=admin-tools-grid&group=integrations');
            const card = page.locator('#git-sync-enabled-card');
            await expect(card).toHaveAttribute('aria-checked', 'false');
            await card.click();
            await expect(page.locator('#git-sync-enabled-status')).toHaveClass(/enabled/);
            await page.reload();
            await expect(page.locator('#git-sync-enabled-card')).toHaveAttribute('aria-checked', 'true');
            await switchAccount(page, account);
            await page.goto('/settings.php#section=settings-sync-history-section-grid');
            await page.locator('#git-sync-card').click();
            await expect(page).toHaveURL(/git_sync\.php/);
            await expect(page.locator('.badge-success')).toBeVisible();
            await expect(page.locator('#git_token')).toBeVisible();
        } finally {
            setGlobals({ git_sync_enabled: '1' });
        }
    });

    test('changing the provider adapts the form, GitHub pins its address', covers('data.git-config'), async ({ page }) => {
        await login(page, account);
        await openSettingsPage(page, '/git_sync.php');
        const providers = await page.locator('#git_provider option').evaluateAll((all) => all.map((option) => option.value));
        expect(providers.sort()).toEqual(['forgejo', 'github', 'gitlab']);
        const address = page.locator('#git_api_base');
        await page.locator('#git_provider').selectOption('github');
        await expect(address).toHaveValue('https://api.github.com');
        await expect(address).toHaveAttribute('readonly', '');
        await page.locator('#git_provider').selectOption('gitlab');
        await expect(address).toHaveValue('https://gitlab.com/api/v4');
        await expect(address).not.toHaveAttribute('readonly', '');
        await page.locator('#git_provider').selectOption('forgejo');
        await expect(address).toHaveValue('');
    });

    for (const provider of ['forgejo', 'gitlab']) {
        test(`${provider}: save, test, push from the rail, pull a change, the note is updated`, covers('data.git-config', 'data.git-test', 'data.git-push', 'data.git-pull', `data.git-${provider}`), async ({ page }) => {
            const note = await api.createNote({ heading: `Vers ${provider}`, content: '<p>Version locale é</p>', type: 'note' });
            await uploaded(api, note.id, 'fichier.png');
            await fillForm(page, provider, provider);
            await page.reload();
            await expect(page.locator('#git_provider')).toHaveValue(provider);
            await expect(page.locator('#git_token'), 'the token is sent back in clear').toHaveValue('••••••••');
            await page.locator('button[name="action"][value="test"]').first().click();
            await expect(page.locator('.alert-success').first()).toContainText('mock/repo');
            const auth = log(provider).join('\n');
            expect(auth, 'the token did not reach the forge').toContain('jeton-valide');

            await rail(page, 'push');
            const pushed = remote(provider);
            const noteFile = Object.keys(pushed).find((file) => file === `entries/${note.id}.html`);
            expect(noteFile, Object.keys(pushed).join()).toBeTruthy();
            expect(plain(pushed[noteFile])).toContain('Version locale é');
            expect(JSON.parse(pushed['metadata.json']).notes[note.id].heading).toBe(`Vers ${provider}`);
            expect(Object.keys(pushed).some((file) => file.startsWith('attachments/') && file.endsWith('.png')), 'the attachment was not pushed').toBe(true);

            writeRemote(provider, noteFile, '<p>Version distante</p>');
            await rail(page, 'pull');
            await expect.poll(async () => (await api.getNote(note.id)).content, { message: 'the pull did not update the note' }).toContain('Version distante');

            await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Version trois</p>' }));
            await rail(page, 'push');
            await expect.poll(() => remote(provider)[noteFile], { message: 'an update was not pushed' }).toContain('Version trois');

            const gone = await api.createNote({ heading: `Effacée ${provider}`, content: '<p>x</p>', type: 'note' });
            await rail(page, 'push');
            expect(Object.keys(remote(provider))).toContain(`entries/${gone.id}.html`);
            await api.ok(api.del(`/notes/${gone.id}`));
            await rail(page, 'push');
            expect(Object.keys(remote(provider)), 'a deleted note stayed in the repository').not.toContain(`entries/${gone.id}.html`);
        });
    }

    test('github: the provider uses its own headers and PUT, through the API settings', covers('data.git-github', 'data.git-api'), async ({ playwright }) => {
        await api.ok(api.put('/git-sync/config', { provider: 'github', api_base: base('github'), token: 'jeton-github', repo: 'mock/repo', branch: 'main', author_name: 'E2E', author_email: 'e2e@example.com' }));
        const status = (await api.ok(api.get('/git-sync/status'))).json;
        expect(status.config.provider).toBe('github');
        expect(status.config.repo).toBe('mock/repo');
        expect((await api.ok(api.post('/git-sync/test'))).json).toMatchObject({ success: true, repo: 'mock/repo' });
        const note = await api.createNote({ heading: 'Vers github', content: '<p>Pour github</p>', type: 'note' });
        const pushed = (await api.ok(api.post('/git-sync/push', {}))).json;
        expect(pushed.success, JSON.stringify(pushed).slice(0, 300)).toBe(true);
        expect(pushed.pushed).toBeGreaterThan(0);
        expect(Object.keys(remote('github'))).toContain(`entries/${note.id}.html`);
        expect(log('github').join('\n')).toContain('auth=Bearer jeton-github');
        expect(log('github').join('\n')).toContain('PUT repos/mock/repo/contents/');
        writeRemote('github', `entries/${note.id}.html`, '<p>Revenue</p>');
        const pulled = (await api.ok(api.post('/git-sync/pull', {}))).json;
        expect(pulled.success).toBe(true);
        expect(pulled.updated).toBeGreaterThan(0);
        expect((await api.getNote(note.id)).content).toContain('Revenue');
        const progress = (await api.ok(api.get('/git-sync/progress'))).json;
        expect(progress.success).toBe(true);
        expect((await api.ok(api.get('/github-sync/status'))).json.config.repo, 'the old route name').toBe('mock/repo');
        expect((await api.ok(api.post('/github-sync/test'))).json.success).toBe(true);
        expect((await api.ok(api.post('/github-sync/push', {}))).json.success).toBe(true);
        expect((await api.ok(api.post('/github-sync/pull', {}))).json.success).toBe(true);
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        expect((await anonymous.get('/api/v1/git-sync/status')).status()).toBe(401);
        await anonymous.dispose();
    });

    test('a pull brings back a deleted note and creates the ones only the repository has, and trashes the ones it lost', covers('data.git-pull', 'data.git-pull-delete'), async ({ page }) => {
        const kept = await api.createNote({ heading: 'Restera', content: '<p>a</p>', type: 'note' });
        const lost = await api.createNote({ heading: 'Disparaîtra', content: '<p>b</p>', type: 'note' });
        await fillForm(page, 'forgejo', 'pull');
        await rail(page, 'push');
        const files = remote('pull');
        const metadata = JSON.parse(files['metadata.json']);
        const newId = 900000 + (process.pid % 1000);
        metadata.notes[newId] = { heading: 'Née dans le dépôt', workspace: 'Poznote', type: 'markdown', folder_id: null };
        delete metadata.notes[lost.id];
        writeRemote('pull', 'metadata.json', JSON.stringify(metadata));
        writeRemote('pull', `entries/${newId}.md`, '# Née\n');
        mockGet(`/forge/${scope('pull')}/_remove?path=${encodeURIComponent(`entries/${lost.id}.html`)}`);
        await rail(page, 'pull');
        await expect.poll(async () => (await api.ok(api.get('/notes'))).text, { message: 'the note of the repository did not arrive' }).toContain('Née dans le dépôt');
        expect((await api.getNote(kept.id)).heading).toBe('Restera');
        expect((await api.ok(api.get('/notes'))).text, 'the note missing from the repository stayed').not.toContain('Disparaîtra');
        expect((await api.ok(api.get('/trash'))).text, 'the note missing from the repository is not in the trash').toContain('Disparaîtra');
    });

    test('a refused token shows the error of the forge', covers('data.git-test-error'), async ({ page }) => {
        await fillForm(page, 'forgejo', 'refus', 'jeton-mauvais');
        await page.locator('button[name="action"][value="test"]').first().click();
        await expect(page.locator('.alert-error, .alert-danger').first()).toContainText(/Bad credentials/);
        await page.goto('/index.php');
        await settled(page);
        await page.locator('[data-icon-sidebar-git-action="push"]').click();
        await confirmDialog(page);
        await expect(page.locator('.alert-modal-body').last(), 'a failed push says nothing').toContainText(/Bad credentials|credentials/, { timeout: 15_000 });
        await fillForm(page, 'forgejo', 'refus');
    });

    test('auto push sends a note on save, when switched on, and stops when switched off', covers('data.git-auto-push'), async ({ page }) => {
        await fillForm(page, 'forgejo', 'auto');
        await setSwitch(page, 'input[name="auto_push"]', true);
        await page.waitForLoadState();
        await expect(page.locator('input[name="auto_push"]')).toBeChecked();
        const on = await api.createNote({ heading: 'Auto envoyée', content: '<p>a</p>', type: 'note' });
        await api.ok(api.patch(`/notes/${on.id}`, { content: '<p>modifiée</p>' }));
        await expect.poll(() => Object.keys(remote('auto')), { timeout: 20_000, message: 'auto push did nothing' }).toContain(`entries/${on.id}.html`);
        await setSwitch(page, 'input[name="auto_push"]', false);
        await page.waitForLoadState();
        await expect(page.locator('input[name="auto_push"]')).not.toBeChecked();
        const off = await api.createNote({ heading: 'Pas envoyée', content: '<p>b</p>', type: 'note' });
        await api.ok(api.patch(`/notes/${off.id}`, { content: '<p>modifiée</p>' }));
        await settled(page);
        expect(Object.keys(remote('auto'))).not.toContain(`entries/${off.id}.html`);
    });

    test('auto pull asks at the start of a session, and pulls when accepted', covers('data.git-auto-pull'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Tirage auto', content: '<p>local</p>', type: 'note' });
        await fillForm(page, 'forgejo', 'autopull');
        await rail(page, 'push');
        writeRemote('autopull', `entries/${note.id}.html`, '<p>distant automatique</p>');
        await openSettingsPage(page, '/git_sync.php');
        await setSwitch(page, 'input[name="auto_pull"]', true);
        await page.waitForLoadState();
        await expect(page.locator('input[name="auto_pull"]')).toBeChecked();
        try {
            await page.evaluate(() => sessionStorage.clear());
            await page.goto('/index.php?workspace=Poznote');
            await expect(page.locator('.alert-modal-overlay .alert-modal-button').last()).toBeVisible({ timeout: 10_000 });
            await page.locator('.alert-modal-overlay .alert-modal-button').first().click();
            await expect(page.locator('.alert-modal-overlay')).toHaveCount(0);
            expect((await api.getNote(note.id)).content, 'declining pulled anyway').not.toContain('distant');
            await page.goto('/index.php?workspace=Poznote');
            await settled(page);
            await expect(page.locator('.alert-modal-overlay'), 'asked twice in one session').toHaveCount(0);
            await page.evaluate(() => sessionStorage.clear());
            await page.goto('/index.php?workspace=Poznote');
            test.fail(true, 'BUG: accepting sends to dashboard.php?auto_pull=1 (index.php:1224) and nothing reads that parameter, so no pull ever happens');
            await confirmDialog(page);
            await page.waitForURL(/dashboard\.php/);
            await expect.poll(async () => (await api.getNote(note.id)).content, { timeout: 8_000, message: 'accepting did not pull' }).toContain('distant automatique');
        } finally {
            await openSettingsPage(page, '/git_sync.php');
            await setSwitch(page, 'input[name="auto_pull"]', false);
            await page.waitForLoadState();
        }
    });

    test('only the chosen workspaces are synced, and the rail hides elsewhere', covers('data.git-workspaces'), async ({ page }) => {
        await api.ok(api.post('/workspaces', { name: 'Hors git' }));
        const inside = await api.createNote({ heading: 'Dans git', content: '<p>a</p>', type: 'note', workspace: 'Poznote' });
        const outside = await api.createNote({ heading: 'Hors git', content: '<p>b</p>', type: 'note', workspace: 'Hors git' });
        await fillForm(page, 'forgejo', 'espaces');
        const form = page.locator('#workspace-sync-form');
        await form.locator('input[value="selected"]').check({ force: true });
        await expect(page.locator('#workspace-checkbox-list')).toBeVisible();
        await form.locator('input[name="synced_workspaces[]"]').evaluateAll((all) => all.forEach((box) => { box.checked = false; }));
        await form.locator('button[type="submit"]').click();
        await page.waitForLoadState();
        await expect(page.locator('.alert-error, .alert-danger').first(), 'an empty selection was accepted').toContainText('at least one');
        await page.locator('#workspace-sync-form input[name="synced_workspaces[]"]').evaluateAll((all) => all.forEach((box) => { box.checked = box.value === 'Poznote'; }));
        await page.locator('#workspace-sync-form input[value="selected"]').check({ force: true });
        await page.locator('#workspace-sync-form button[type="submit"]').click();
        await savedOk(page);
        await rail(page, 'push');
        const files = Object.keys(remote('espaces'));
        expect(files).toContain(`entries/${inside.id}.html`);
        expect(files, 'a workspace out of the scope was pushed').not.toContain(`entries/${outside.id}.html`);
        await page.goto('/index.php?workspace=Hors%20git');
        await settled(page);
        await expect(page.locator('[data-icon-sidebar-git-action="push"]'), 'the button shows on a workspace out of the scope').toBeHidden();
        await openSettingsPage(page, '/git_sync.php');
        await page.locator('#workspace-sync-form input[value="all"]').check({ force: true });
        await page.locator('#workspace-sync-form button[type="submit"]').click();
        await savedOk(page);
        await expect(page.locator('#workspace-sync-form input[value="all"]')).toBeChecked();
    });

    test('a background sync reports its progress and ends with the notes pushed', covers('data.git-progress'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Depuis le fond', content: '<p>a</p>', type: 'note' });
        await fillForm(page, 'forgejo', 'tableau');
        const started = (await api.ok(api.post('/git-sync/push', { async: true }), [200, 201, 202])).json;
        expect(started.success, JSON.stringify(started)).toBe(true);
        await expect.poll(async () => {
            const state = (await api.ok(api.get('/git-sync/progress'))).json;
            return state.running === false || state.progress?.percentage === 100 || state.progress === null;
        }, { timeout: 30_000, message: 'the background sync never ended' }).toBe(true);
        await expect.poll(() => Object.keys(remote('tableau')), { message: 'the background sync pushed nothing' }).toContain(`entries/${note.id}.html`);
    });

    test('the page shows the result of the last sync, with a debug log to filter and copy', covers('data.git-debug'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
        await api.createNote({ heading: 'Journal', content: '<p>x</p>', type: 'note' });
        await fillForm(page, 'forgejo', 'debug');
        await rail(page, 'push');
        await openSettingsPage(page, '/git_sync.php');
        await expect(page.locator('.alert-success, .alert-warning').first()).toBeVisible();
        await expect(page.locator('#debug-info')).toBeHidden();
        await page.locator('#debug-toggle-btn').click();
        await expect(page.locator('#debug-info')).toBeVisible();
        const full = await page.locator('#debug-output').textContent();
        expect(full.length).toBeGreaterThan(0);
        await page.locator('#debug-changes-btn').click();
        await expect(page.locator('#debug-changes-btn')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#debug-changes-btn').click();
        await expect(page.locator('#debug-output')).toHaveText(full);
        await page.locator('#debug-copy-btn').click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(full);
        await page.locator('#debug-toggle-btn').click();
        await expect(page.locator('#debug-info')).toBeHidden();
    });
});

test.describe('webhooks', () => {
    const hook = (name) => `${name}-${process.pid}`;
    const delivered = (name) => mockGet(`/hook-log/${hook(name)}`);
    const event = (name, wanted) => delivered(name).filter((line) => line.event === wanted);
    const hmac = (secret, body) => `sha256=${require('node:crypto').createHmac('sha256', secret).update(body).digest('hex')}`;

    const addHook = async (page, name, events, secret = '', url = `${MOCK}/hook/${hook(name)}`) => {
        await page.locator('#webhook_url').fill(url);
        await page.locator('#webhook_description').fill(`Crochet ${name} é`);
        await page.locator('#webhook_secret').fill(secret);
        const boxes = page.locator('form:has(input[name="action"][value="add"]) input[name="webhook_events[]"]');
        for (const box of await boxes.all()) {
            const value = await box.getAttribute('value');
            await box.setChecked(events.includes(value));
        }
        await page.locator('form:has(input[name="action"][value="add"]) button[type="submit"]').click();
        await savedOk(page);
        return page.locator('.webhooks-item', { hasText: url });
    };
    const openMenu = async (row) => { await row.locator('.webhooks-actions-toggle').click(); };

    for (const [title, pagePath, feature, expectedEvents] of [
        ['user webhooks', '/user-webhooks.php', 'user', ['reminder.due', 'reminder.due_title', 'reminder.due_minimal', 'note.created', 'note.shared']],
        ['instance webhooks', '/admin/webhooks.php', 'admin', ['user.created', 'user.updated', 'user.activated', 'user.deactivated', 'user.deleted', 'signup.cap_reached', 'quota.notes_reached', 'quota.storage_reached', 'settings.language_changed', 'backup.completed', 'backup.failed']],
    ]) {
        test(`${title}: add, edit, send a signed test, disable, enable, delete`, covers(`data.webhooks-${feature}`, 'data.webhook-test', 'data.webhook-signature', 'data.webhook-edit', 'data.webhook-toggle', 'data.webhook-delete'), async ({ page }) => {
            const name = `crud-${feature}`;
            await login(page, ADMIN);
            await openSettingsPage(page, pagePath);
            const offered = await page.locator('form:has(input[name="action"][value="add"]) input[name="webhook_events[]"]').evaluateAll((all) => all.map((box) => box.value));
            expect(offered, 'the list of events changed: add a check for the new one').toEqual(expectedEvents);
            const row = await addHook(page, name, [expectedEvents[0]], 'mon-secret');
            await expect(row).toContainText(`Crochet ${name} é`);
            await expect(row.locator('.webhooks-item-event')).toHaveText([expectedEvents[0]]);
            await expect(row.locator('.webhooks-state')).toHaveClass(/is-enabled/);

            await openMenu(row);
            await expect(row.locator('.webhooks-actions-menu')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(row.locator('.webhooks-actions-menu')).toBeHidden();
            await openMenu(row);
            await row.locator('button[value="test"]').click();
            await savedOk(page);
            await expect.poll(() => delivered(name).length, { message: 'the test never arrived' }).toBeGreaterThan(0);
            const sent = delivered(name)[0];
            expect(sent.signature, 'the signature does not match the body').toBe(hmac('mon-secret', sent.body));
            expect(sent.delivery).toMatch(/^[0-9a-f]{32}$/);
            expect(JSON.parse(sent.body).event).toBe(sent.event);

            const again = page.locator('.webhooks-item', { hasText: hook(name) });
            await openMenu(again);
            await again.locator('[data-webhook-edit]').click();
            const editor = again.locator('.webhooks-edit');
            await expect(editor).toBeVisible();
            await editor.locator('[data-webhook-edit-cancel]').click();
            await expect(editor).toBeHidden();
            await openMenu(again);
            await again.locator('[data-webhook-edit]').click();
            await editor.locator('input[name="webhook_description"]').fill('Nouveau nom é');
            await editor.locator('input[name="webhook_secret"]').fill('');
            await editor.locator(`input[name="webhook_events[]"][value="${expectedEvents[1]}"]`).check();
            await editor.locator('button[type="submit"]').click();
            await savedOk(page);
            const edited = page.locator('.webhooks-item', { hasText: hook(name) });
            await expect(edited).toContainText('Nouveau nom é');
            await expect(edited.locator('.webhooks-item-event')).toHaveText([expectedEvents[0], expectedEvents[1]]);

            const before = delivered(name).length;
            await openMenu(edited);
            await edited.locator('button[value="test"]').click();
            await savedOk(page);
            await expect.poll(() => delivered(name).length).toBe(before + 1);
            expect(delivered(name).at(-1).signature, 'no secret, so no signature').toBe('');

            const row2 = page.locator('.webhooks-item', { hasText: hook(name) });
            await openMenu(row2);
            await row2.locator('button[value="disable"]').click();
            await savedOk(page);
            await expect(page.locator('.webhooks-item', { hasText: hook(name) }).locator('.webhooks-state')).toHaveClass(/is-disabled/);
            const row3 = page.locator('.webhooks-item', { hasText: hook(name) });
            await openMenu(row3);
            await row3.locator('button[value="enable"]').click();
            await savedOk(page);
            await expect(page.locator('.webhooks-item', { hasText: hook(name) }).locator('.webhooks-state')).toHaveClass(/is-enabled/);

            const row4 = page.locator('.webhooks-item', { hasText: hook(name) });
            await openMenu(row4);
            await row4.locator('button[value="delete"]').click();
            await page.locator('.alert-modal-overlay .alert-modal-button').first().click();
            await expect(page.locator('.webhooks-item', { hasText: hook(name) }), 'Cancel deleted it').toHaveCount(1);
            await openMenu(row4);
            await row4.locator('button[value="delete"]').click();
            await confirmDialog(page);
            await savedOk(page);
            await expect(page.locator('.webhooks-item', { hasText: hook(name) })).toHaveCount(0);
        });

        test(`${title}: a bad address and no event are refused`, covers(`data.webhooks-${feature}`), async ({ page }) => {
            await login(page, ADMIN);
            await openSettingsPage(page, pagePath);
            const count = await page.locator('.webhooks-item').count();
            await page.locator('#webhook_url').fill('ftp://example.com/x');
            await page.locator('form:has(input[name="action"][value="add"]) button[type="submit"]').click();
            await expect(page.locator('.alert-danger').first()).toBeVisible();
            await page.locator('#webhook_url').fill(`${MOCK}/hook/refuse`);
            await page.locator('form:has(input[name="action"][value="add"]) input[name="webhook_events[]"]').evaluateAll((all) => all.forEach((box) => { box.checked = false; }));
            await page.locator('form:has(input[name="action"][value="add"]) button[type="submit"]').click();
            await expect(page.locator('.alert-danger').first()).toBeVisible();
            await expect(page.locator('.webhooks-item')).toHaveCount(count);
        });
    }

    test('user events: note.created and note.shared reach their owner only, reminders when due', covers('data.webhook-note-created', 'data.webhook-note-shared', 'data.webhook-reminder'), async ({ page, playwright }) => {
        await login(page, ADMIN);
        await openSettingsPage(page, '/user-webhooks.php');
        const name = 'user-events';
        const row = await addHook(page, name, ['note.created', 'note.shared', 'reminder.due', 'reminder.due_title', 'reminder.due_minimal'], 'secret-evenements');
        const admin = await Api.open(playwright, ADMIN);
        const other = await newAccount(playwright, 'dhookother');
        const otherApi = await Api.open(playwright, other);
        try {
            const note = await admin.createNote({ heading: 'Crochet créée é', content: '<p>x</p>', type: 'note' });
            await expect.poll(() => event(name, 'note.created').length, { message: 'note.created never arrived' }).toBe(1);
            const created = event(name, 'note.created')[0];
            expect(created.signature).toBe(hmac('secret-evenements', created.body));
            expect(JSON.parse(created.body).data.note.heading).toBe('Crochet créée é');
            await otherApi.createNote({ heading: 'Note étrangère', content: '<p>x</p>', type: 'note' });
            await admin.ok(admin.post(`/notes/${note.id}/share`));
            await expect.poll(() => event(name, 'note.shared').length, { message: 'note.shared never arrived' }).toBe(1);
            expect(JSON.parse(event(name, 'note.shared')[0].body).data.note.id).toBe(note.id);
            expect(JSON.stringify(delivered(name)), 'the event of another account arrived here').not.toContain('Note étrangère');

            setGlobals({ webhook_reminder_cutoff_at: '2020-01-01 00:00:00' });
            const remind = await admin.createNote({ heading: 'Rappel crochet', content: '<p>x</p>', type: 'note' });
            await admin.ok(admin.post(`/notes/${remind.id}/reminder`, { reminder_at: '2026-01-01 00:00:00' }));
            asWorker('reminder-email-worker.php');
            await expect.poll(() => event(name, 'reminder.due').length, { message: 'reminder.due never arrived' }).toBeGreaterThan(0);
            expect(JSON.stringify(event(name, 'reminder.due').map((line) => JSON.parse(line.body)))).toContain('Rappel crochet');
            expect(event(name, 'reminder.due_title').length).toBeGreaterThan(0);
            expect(event(name, 'reminder.due_minimal').length).toBeGreaterThan(0);
        } finally {
            await otherApi.dispose();
            await admin.dispose();
            const item = page.locator('.webhooks-item', { hasText: hook(name) });
            await openSettingsPage(page, '/user-webhooks.php');
            await item.locator('.webhooks-actions-toggle').click();
            await item.locator('button[value="delete"]').click();
            await confirmDialog(page);
            await expect(item).toHaveCount(0);
            await row.count();
        }
    });

    test('instance events: users, language, quotas and backups each send their event', covers('data.webhook-user-events', 'data.webhook-language', 'data.webhook-quota', 'data.webhook-backup', 'data.webhook-instance-url'), async ({ page, playwright }) => {
        const name = 'instance-events';
        const dir = `/tmp/e2e-hook-${process.pid}`;
        await login(page, ADMIN);
        await openSettingsPage(page, '/admin/webhooks.php');
        await page.locator('#app_url').fill('https://notes.example.com/');
        await page.locator('form:has(input[name="action"][value="save_app_url"]) button[type="submit"]').click();
        await savedOk(page);
        await expect(page.locator('#app_url')).toHaveValue('https://notes.example.com');
        await addHook(page, name, ['user.created', 'user.updated', 'user.activated', 'user.deactivated', 'user.deleted', 'quota.notes_reached', 'quota.storage_reached', 'settings.language_changed', 'backup.completed', 'backup.failed'], 'secret-instance');
        const admin = await Api.open(playwright, ADMIN);
        try {
            const account = await newAccount(playwright, 'dhookuser');
            await expect.poll(() => event(name, 'user.created').length, { message: 'user.created never arrived' }).toBeGreaterThan(0);
            expect(event(name, 'user.created').at(-1).body).toContain(account.username);
            await admin.ok(admin.patch(`/admin/users/${account.id}`, { email: `${account.username}@example.com` }));
            await expect.poll(() => event(name, 'user.updated').length, { message: 'user.updated never arrived' }).toBeGreaterThan(0);
            await admin.ok(admin.patch(`/admin/users/${account.id}`, { active: false }));
            await expect.poll(() => event(name, 'user.deactivated').length, { message: 'user.deactivated never arrived' }).toBe(1);
            await admin.ok(admin.patch(`/admin/users/${account.id}`, { active: true }));
            await expect.poll(() => event(name, 'user.activated').length, { message: 'user.activated never arrived' }).toBe(1);

            const user = await Api.open(playwright, account);
            await user.ok(user.put('/settings/language', { value: 'fr' }));
            await expect.poll(() => event(name, 'settings.language_changed').length, { message: 'language_changed never arrived' }).toBe(1);
            expect(JSON.parse(event(name, 'settings.language_changed')[0].body).data.language).toBe('fr');
            await user.ok(user.put('/settings/language', { value: 'en' }));

            setGlobals({ user_max_notes: '1' });
            await user.post('/notes', { heading: 'Au-delà', content: '<p>x</p>' });
            await user.post('/notes', { heading: 'Encore', content: '<p>x</p>' });
            await expect.poll(() => event(name, 'quota.notes_reached').length, { message: 'quota.notes_reached never arrived' }).toBe(1);
            setGlobals({ user_max_notes: '0', user_max_storage_mb: '1' });
            await user.call('POST', '/notes', { json: { heading: 'Trop gros', content: `<p>${'x'.repeat(2_000_000)}</p>` } });
            await expect.poll(() => event(name, 'quota.storage_reached').length, { message: 'quota.storage_reached never arrived' }).toBe(1);
            setGlobals({ user_max_storage_mb: '0' });
            await user.dispose();

            setGlobals({ local_backup_directory: dir, local_backup_user_ids: String(account.id), local_backup_auto_enabled: '1', local_backup_last_auto_run: '0' });
            asWorker('s3-backup-worker.php');
            await expect.poll(() => event(name, 'backup.completed').length, { message: 'backup.completed never arrived' }).toBeGreaterThan(0);
            expect(JSON.parse(event(name, 'backup.completed').at(-1).body).data.backup).toMatchObject({ target: 'local', trigger: 'auto', backed_up: 1 });
            setGlobals({ local_backup_directory: '/proc/e2e-impossible', local_backup_last_auto_run: '0' });
            asWorker('s3-backup-worker.php');
            await expect.poll(() => event(name, 'backup.failed').length, { message: 'backup.failed never arrived' }).toBeGreaterThan(0);

            await admin.ok(admin.del(`/admin/users/${account.id}`));
            await expect.poll(() => event(name, 'user.deleted').length, { message: 'user.deleted never arrived' }).toBe(1);
            expect(event(name, 'user.deleted')[0].body).toContain(account.username);
        } finally {
            await admin.dispose();
            setGlobals({ user_max_notes: '0', user_max_storage_mb: '0', local_backup_directory: '', local_backup_user_ids: '', local_backup_auto_enabled: '0', local_backup_last_auto_run: '0', smtp_app_url: '' });
            inInstance(`rm -rf ${dir}`);
            await openSettingsPage(page, '/admin/webhooks.php');
            const item = page.locator('.webhooks-item', { hasText: hook(name) });
            await item.locator('.webhooks-actions-toggle').click();
            await item.locator('button[value="delete"]').click();
            await confirmDialog(page);
            await expect(item).toHaveCount(0);
        }
    });

    test('a user may not reach a private address, an administrator may', covers('data.webhook-ssrf'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'dhookssrf');
        await login(page, account);
        await openSettingsPage(page, '/user-webhooks.php');
        const name = 'ssrf';
        await page.locator('#webhook_url').fill(`${MOCK}/hook/${hook(name)}`);
        await page.locator('form:has(input[name="action"][value="add"]) button[type="submit"]').click();
        await expect(page.locator('.alert-danger').first()).toContainText('not allowed');
        await expect(page.locator('.webhooks-item'), 'a private address was registered').toHaveCount(0);
    });

    test('the settings cards open each page and count the active webhooks', covers('data.card-user-webhooks', 'data.card-admin-webhooks'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'dhookcard');
        await login(page, account);
        await page.goto('/settings.php#section=settings-integrations-section-grid');
        await page.locator('#user-webhooks-card').click();
        await expect(page).toHaveURL(/user-webhooks\.php/);
        await openSettingsPage(page, '/user-webhooks.php');
        await addHook(page, 'carte', ['note.created'], '', 'https://example.com/crochet');
        await page.goto('/settings.php#section=settings-integrations-section-grid');
        await expect(page.locator('#user-webhooks-card .setting-status')).toHaveText('1');
        await switchAccount(page, ADMIN);
        await page.goto('/settings.php#section=admin-tools-grid&group=integrations');
        await page.locator('#webhooks-card').click();
        await expect(page).toHaveURL(/admin\/webhooks\.php/);
        const user = await Api.open(playwright, account);
        expect((await user.get('/admin/webhooks.php', { raw: true })).status).toBeGreaterThanOrEqual(300);
        await user.dispose();
    });
});

test.describe('small routes', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dmisc');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });

    test('the health check answers without an account, at both addresses', covers('data.health'), async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const version = inInstance('cat /var/www/html/version.txt').trim();
        for (const url of ['/api_health.php', '/api/health']) {
            const response = await anonymous.get(url);
            expect(response.status(), url).toBe(200);
            const body = await response.json();
            expect(body).toMatchObject({ status: 'ok', service: 'poznote', version });
            expect(Date.parse(body.timestamp)).toBeGreaterThan(0);
            expect(response.headers()['access-control-allow-origin']).toBe('*');
        }
        expect((await anonymous.post('/api_health.php')).status()).toBe(405);
        expect((await anonymous.fetch('/api_health.php', { method: 'OPTIONS' })).status()).toBe(204);
        await anonymous.dispose();
    });

    test('Note information shows the real values of the note', covers('data.note-info'), async ({ page, playwright }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier info' }))).json.folder;
        const note = await api.createNote({ heading: 'Infos é', content: '<p>x</p>', type: 'note', folder_id: folder.id });
        await api.ok(api.put(`/notes/${note.id}/tags`, { tags: ['un', 'deux'] }));
        await api.ok(api.post(`/notes/${note.id}/favorite`));
        await uploaded(api, note.id, 'doc.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%%EOF\n'));
        await login(page, account);
        await openNote(page, note.id);
        await page.locator('.note-sub-info-btn[data-action="show-note-info"]').first().click();
        const modal = page.locator('#noteInfoModal');
        await expect(modal).toBeVisible();
        const value = (key) => modal.locator(`[data-note-info="${key}"]`);
        await expect(value('title')).toHaveText('Infos é');
        await expect(value('note_id')).toHaveText(String(note.id));
        await expect(value('workspace')).toHaveText('Poznote');
        await expect(value('folder')).toContainText('Dossier info');
        await expect(value('tags')).toHaveText('un, deux');
        await expect(value('attachments')).toContainText('1');
        await expect(value('created_by')).toContainText(account.username);
        await modal.locator('.btn-cancel').click();
        await expect(modal).toBeHidden();
        const json = await (await page.request.get(`/api_note_info.php?note_id=${note.id}`)).json();
        expect(json).toMatchObject({ success: true, info: { title: 'Infos é', favorite: true, note_id: note.id } });
        expect(json.info.full_path).toContain(`entries/${note.id}.html`);
        const other = await newAccount(playwright, 'dmiscother');
        const stranger = await Api.open(playwright, other);
        const refused = await stranger.get(`/api_note_info.php?note_id=${note.id}`, { raw: true });
        expect(refused.text, 'another account reads this note').not.toContain('Infos');
        await stranger.dispose();
        expect((await page.request.get('/api_note_info.php?note_id=999999')).status()).toBe(404);
    });

    test('api_attachments uploads, lists, downloads and deletes exact bytes', covers('data.attachments-route'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Pièces', content: '<p>x</p>', type: 'note' });
        await login(page, account);
        const sent = await page.request.post('/api_attachments.php', {
            multipart: { action: 'upload', note_id: String(note.id), workspace: 'Poznote', file: { name: 'pièce.png', mimeType: 'image/png', buffer: PNG } },
        });
        const json = await sent.json();
        expect(json.success, JSON.stringify(json)).toBe(true);
        const list = await (await page.request.get(`/api_attachments.php?action=list&note_id=${note.id}&workspace=Poznote`)).json();
        expect(list.success).toBe(true);
        expect(list.attachments.map((file) => file.original_filename)).toEqual(['pièce.png']);
        const id = list.attachments[0].id;
        const file = await page.request.get(`/api_attachments.php?action=download&note_id=${note.id}&attachment_id=${id}&workspace=Poznote`);
        expect((await file.body()).equals(PNG), 'the bytes changed').toBe(true);
        const removed = await page.request.post('/api_attachments.php', { form: { action: 'delete', note_id: String(note.id), attachment_id: id, workspace: 'Poznote' } });
        expect((await removed.json()).success).toBe(true);
        expect((await api.ok(api.get(`/notes/${note.id}/attachments`))).json.attachments).toEqual([]);
        const bad = await (await page.request.get('/api_attachments.php?action=nope')).json();
        expect(bad.success).toBe(false);
    });

    test.describe('cards', () => {
    // KNOWN: the S3 backups page answers a 500 while nothing is configured, see its own test
    test.use({ allowedErrors: [/status of 500|HTTP 500/] });
    test('the cards of the administrator open their pages', covers('data.card-local-backup', 'data.card-s3-backup-admin', 'data.card-s3-storage'), async ({ page }) => {
        await login(page, ADMIN);
        for (const [card, url] of [['local-backup-card', /local_backup_settings\.php/], ['s3-backup-card', /s3_backup_settings\.php/], ['s3-storage-card', /s3_settings\.php/]]) {
            await page.goto('/settings.php#section=admin-tools-grid&group=storage-limits');
            await page.locator(`#admin-tools-grid #${card}`).click();
            await expect(page, `${card} opens the wrong page`).toHaveURL(url);
        }
    });
    });

    test('the system share target creates a note from a shared link', covers('data.share-target'), async ({ page }) => {
        await login(page, account);
        await page.goto('/index.php');
        await page.evaluate(() => {
            const form = document.createElement('form');
            form.method = 'POST'; form.action = 'share-target.php'; form.enctype = 'multipart/form-data';
            for (const [name, value] of Object.entries({ title: 'Lien partagé é', text: 'Regarde ceci', url: 'https://example.com/page' })) {
                const input = document.createElement('input'); input.name = name; input.value = value; form.appendChild(input);
            }
            document.body.appendChild(form);
            form.submit();
        });
        await page.waitForURL(/index\.php\?.*note=/);
        const note = await noteNamed(api, 'Lien partagé é');
        expect(page.url()).toContain(`note=${note.id}`);
        expect(note.content).toContain('https://example.com/page');
        expect(note.content).toContain('Regarde ceci');
    });

    test('a link from a shared workspace email only opens with its signature', covers('data.open-shared'), async ({ page, playwright }) => {
        const owner = await newAccount(playwright, 'dmailowner');
        const reader = await newAccount(playwright, 'dmailreader');
        const ownerApi = await Api.open(playwright, owner);
        const note = await ownerApi.createNote({ heading: 'Note du courriel', content: '<p>x</p>', type: 'note' });
        await login(page, owner);
        const granted = await page.request.post('/workspaces.php', {
            form: { action: 'share_workspace', name: 'Poznote', allowed_users: JSON.stringify([reader.id]) },
            headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        });
        expect((await granted.json()).success, 'the workspace was not shared').toBe(true);
        await page.context().clearCookies();
        const query = inInstance(`cat > /tmp/e2e-link.php <<'PHP'\n<?php require '/var/www/html/config.php'; require_once '/var/www/html/WorkspaceActivityEmailService.php'; echo poznoteWorkspaceActivityLinkQuery(WorkspaceActivityEmailService::linkKey(), ${reader.id}, ${owner.id}, 'Poznote', ${note.id});\nPHP\nphp /tmp/e2e-link.php`).trim();
        await login(page, reader);
        await page.goto(`/open_shared.php?${query.replace(/sig=[^&]+/, 'sig=faux')}`);
        await expect(page).toHaveURL(/index\.php/);
        expect(page.url(), 'a false signature opened the note').not.toContain(`note=${note.id}`);
        await page.goto(`/open_shared.php?${query}`);
        await expect(page).toHaveURL(new RegExp(`note=${note.id}`));
        await expect(page.locator('input.css-title').first()).toHaveValue('Note du courriel');
        await ownerApi.dispose();
    });
});

test.describe('Chrome extension', () => {
    // poznote-chrome-extension/background.js, replayed: same URLs, headers and bodies
    const headers = (account, userId) => ({ Authorization: `Basic ${Buffer.from(`${account.username}:${account.password}`).toString('base64')}`, ...(userId ? { 'X-User-ID': String(userId) } : {}) });
    let account; let context; let folder; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dext');
        api = await Api.open(playwright, account);
        // Omits cookies as the extension does (credentials: 'omit')
        context = await playwright.request.newContext({ baseURL: BASE_URL });
        folder = (await api.ok(api.post('/folders', { folder_name: 'Depuis le web' }))).json.folder;
        await api.ok(api.post('/workspaces', { name: 'Espace web' }));
    });
    test.afterAll(async () => { await context.dispose(); await api.dispose(); });

    const appendHtml = (url, title) => `<p><a href="${url}">${title}</a></p>`;

    test('connecting lists the profiles, then the workspaces and folders', covers('data.extension-connect'), async () => {
        const profiles = await context.get('/api/v1/users/profiles', { headers: headers(account) });
        expect(profiles.status()).toBe(200);
        const list = await profiles.json();
        const own = (Array.isArray(list) ? list : list.profiles).find((profile) => profile.username === account.username);
        expect(own.id).toBe(account.id);
        const workspaces = await (await context.get('/api/v1/workspaces', { headers: headers(account, own.id) })).json();
        expect(workspaces.workspaces.map((space) => space.name)).toEqual(expect.arrayContaining(['Poznote', 'Espace web']));
        const folders = await (await context.get('/api/v1/folders?workspace=Poznote', { headers: headers(account, own.id) })).json();
        expect((folders.folders || folders).map((one) => one.name)).toContain('Depuis le web');
        expect((await context.get('/api/v1/workspaces', { headers: headers({ ...account, password: 'faux' }, own.id) })).status()).toBe(401);
    });

    test('saving a page creates a rich note in the chosen folder with its tags', covers('data.extension-save'), async () => {
        const response = await context.post('/api/v1/notes', {
            headers: { ...headers(account, account.id), 'Content-Type': 'application/json' },
            data: { heading: 'Page sauvée é', content: appendHtml('https://example.com/a', 'Article'), tags: 'web,lecture', workspace: 'Poznote', folder_id: folder.id },
        });
        expect(response.status(), await response.text()).toBeLessThan(300);
        const created = (await response.json()).note;
        const note = await api.getNote(created.id);
        expect(note.heading).toBe('Page sauvée é');
        expect(note.type).toBe('note');
        expect(note.folder_id).toBe(folder.id);
        expect(note.tags).toContain('web'); expect(note.tags).toContain('lecture');
        expect(note.content).toContain('https://example.com/a');
    });

    test('the search for a note to append to finds it, sorted, without other types', covers('data.extension-search'), async () => {
        const target = await api.createNote({ heading: 'Carnet de liens', content: '<p>Début</p>', type: 'note', workspace: 'Poznote' });
        await api.createNote({ heading: 'Carnet de tâches', type: 'tasklist', content: '[]', workspace: 'Poznote' });
        const params = new URLSearchParams({ sort: 'updated_desc', limit: '40', search: 'Carnet', workspace: 'Poznote' });
        const data = await (await context.get(`/api/v1/notes?${params}`, { headers: headers(account, account.id) })).json();
        const found = data.notes.filter((note) => note.heading.includes('Carnet'));
        expect(found.map((note) => note.heading).sort()).toEqual(['Carnet de liens', 'Carnet de tâches']);
        expect(found.find((note) => note.id === target.id)).toMatchObject({ type: 'note', workspace: 'Poznote' });
        expect(found.find((note) => note.type === 'tasklist'), 'the extension filters on this field').toBeTruthy();
    });

    test('append adds to a rich note, keeps what was there, and survives a conflict', covers('data.extension-append'), async () => {
        const note = await api.createNote({ heading: 'Ajouts', content: '<p>Début</p>', type: 'note' });
        const read = await (await context.get(`/api/v1/notes/${note.id}`, { headers: headers(account, account.id) })).json();
        expect(read.note.version, 'the extension needs the version').toBeTruthy();
        const patch = (content, version) => context.patch(`/api/v1/notes/${note.id}`, { headers: { ...headers(account, account.id), 'Content-Type': 'application/json' }, data: { content, if_version: version } });
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Début</p><p>Écrit entre-temps</p>' }));
        const stale = await patch(`${read.note.content}${appendHtml('https://example.com/b', 'Sans effet')}`, read.note.version);
        expect(stale.status(), 'the stale version was not refused').toBe(409);
        const conflict = await stale.json();
        expect(conflict.current.content).toContain('Écrit entre-temps');
        expect(conflict.current.version).toBeTruthy();
        const merged = await patch(`${conflict.current.content}${appendHtml('https://example.com/b', 'Ajouté')}`, conflict.current.version);
        expect(merged.status(), await merged.text()).toBe(200);
        const final = await api.getNote(note.id);
        expect(final.content).toContain('Écrit entre-temps');
        expect(final.content).toContain('https://example.com/b');
        expect(final.content).not.toContain('Sans effet');
    });

    test('append to a Markdown note uploads the screenshot and links it', covers('data.extension-append-markdown', 'data.extension-screenshot'), async () => {
        const note = await api.createNote({ heading: 'Ajouts md', content: '# Début\n', type: 'markdown' });
        const form = await context.post(`/api/v1/notes/${note.id}/attachments`, {
            headers: headers(account, account.id),
            multipart: { file: { name: 'screenshot.png', mimeType: 'image/png', buffer: PNG } },
        });
        expect(form.status(), await form.text()).toBeLessThan(300);
        const { attachment_id: attachment } = await form.json();
        expect(attachment, 'the extension reads attachment_id').toBeTruthy();
        const source = `/api/v1/notes/${note.id}/attachments/${attachment}`;
        const current = (await (await context.get(`/api/v1/notes/${note.id}`, { headers: headers(account, account.id) })).json()).note;
        const merged = `${current.content.replace(/\s+$/, '')}\n\n[Lien](https://example.com/c)\n\n![Capture](${source})\n`;
        const patched = await context.patch(`/api/v1/notes/${note.id}`, { headers: { ...headers(account, account.id), 'Content-Type': 'application/json' }, data: { content: merged, if_version: current.version } });
        expect(patched.status(), await patched.text()).toBe(200);
        const final = await api.getNote(note.id);
        expect(final.content).toContain('# Début');
        expect(final.content).toContain(source);
        expect((await api.ok(api.get(source, { raw: true }))).body.equals(PNG)).toBe(true);
    });

    test('the settings page of the extension sends to the app passwords, which log it in', covers('data.extension-app-password', 'data.card-extension'), async ({ page }) => {
        await login(page, account);
        await page.goto('/settings.php?open=app-passwords');
        await expect(page.locator('body')).toContainText(/app password/i);
        const created = await api.ok(api.post('/users/me/app-passwords', { label: 'extension' }));
        const viaApp = await context.get('/api/v1/workspaces', { headers: headers({ username: account.username, password: created.json.secret }, account.id) });
        expect(viaApp.status()).toBe(200);
        await page.goto('/settings.php');
        await expect(page.locator('#extension-card')).toHaveAttribute('href', /chromewebstore/);
    });
});

test.describe('restore and backup page details', () => {
    let api; let account;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dpart');
        api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'Base', content: '<p>Contenu de base</p>', type: 'note' });
        await uploaded(api, note.id);
    });
    test.afterAll(async () => { await api.dispose(); });

    const csrfRestore = async (page) => {
        await page.goto('/restore_import.php');
        return page.locator('#individualNotesForm input[name="csrf_token"]').inputValue();
    };

    test('the cards fold and unfold, the whole page shows every part without a part in the URL', covers('data.restore-page'), async ({ page }) => {
        await login(page, account);
        await page.goto('/restore_import.php');
        const content = page.locator('#restoreBackupContent');
        const header = page.locator('[data-action="toggle-card"][data-target="restoreBackupContent"]');
        const opened = await content.evaluate((el) => el.classList.contains('open'));
        await header.click();
        await expect.poll(() => content.evaluate((el) => el.classList.contains('open'))).toBe(!opened);
        await header.click();
        await expect.poll(() => content.evaluate((el) => el.classList.contains('open'))).toBe(opened);
        if (!opened) await header.click();
        const sub = page.locator('#standardRestoreContent');
        const subOpen = await sub.evaluate((el) => el.classList.contains('open'));
        await page.locator('[data-action="toggle-sub-card"][data-target="standardRestoreContent"]').click();
        await expect.poll(() => sub.evaluate((el) => el.classList.contains('open'))).toBe(!subOpen);
        await page.goto('/backup_export.php');
        for (const id of ['complete-backup-section', 'structured-export-section', 'attachments-export-section']) {
            await expect(page.locator(`#${id}`), `${id} is missing from the full page`).toBeVisible();
        }
    });

    test('a file dropped on the import zone fills the selection', covers('data.import-dropzone'), async ({ page }) => {
        await login(page, account);
        await page.goto('/restore_import.php?part=import');
        await dropFiles(page, '.import-dropzone', [{ name: 'Glissée.md', type: 'text/markdown', text: 'x' }]);
        await expect(page.locator('#individualNotesSelection')).toBeVisible();
        await expect(page.locator('#individualNotesSelectionName')).toHaveText('Glissée.md');
        await expect(page.locator('.import-dropzone')).not.toHaveClass(/drag-over/);
    });

    test('Start restore without a file warns instead of running', covers('data.restore-errors'), async ({ page }) => {
        await login(page, account);
        await page.goto('/restore_import.php?part=restore-standard');
        await page.locator('#completeRestoreBtn').click();
        await expect(page.locator('#customAlert')).toBeVisible();
        await expect(page.locator('#alertTitle')).toContainText('No ZIP');
        await expect(page.locator('#completeRestoreConfirmModal')).toBeHidden();
    });

    test('an upload left behind by another tab shows and can be cancelled', covers('data.restore-cancel-upload', 'data.import-cancel-upload'), async ({ page }) => {
        await login(page, account);
        const csrf = await csrfRestore(page);
        for (const [part, button, progress, extra] of [
            ['restore-standard', '#chunkedRestoreCancelBtn', '#chunkedRestoreError', {}],
            ['import', '#notesImportCancelBtn', '#notesImportError', { job_type: 'notes_import', workspace: 'Poznote' }],
        ]) {
            const init = await (await page.request.post('/api_restore_upload.php?action=init', {
                form: { filename: 'pendante.zip', total_size: 2000, total_chunks: 2, csrf_token: csrf, ...extra },
            })).json();
            expect(init.upload_id, JSON.stringify(init)).toBeTruthy();
            // Another tab of this browser is sending: it keeps this mark fresh
            await page.evaluate((id) => (window.__poznoteUserStorage || localStorage).setItem('poznote-restore-upload-beat', JSON.stringify({ id, ts: Date.now() })), init.upload_id);
            await page.goto(`/restore_import.php?part=${part}`);
            const cancel = page.locator(button);
            await expect(cancel, `${part}: the pending upload is not shown`).toBeVisible();
            await cancel.click();
            await expect(page.locator(progress), `${part}: no message after cancelling`).toBeVisible();
            const status = await (await page.request.get(`/api_restore_upload.php?action=status${extra.job_type ? '&job_type=notes_import' : ''}`)).json();
            expect(['uploading', 'queued', 'running'], 'the upload still holds the slot').not.toContain(status.job?.status);
        }
    });

    test('the direct POST of a complete backup and of a complete restore still work', covers('data.backup-post', 'data.restore-post'), async ({ page }) => {
        await login(page, account);
        await page.goto('/backup_export.php?part=backup');
        const zip = await page.request.post('/backup_export.php', { form: { action: 'complete_backup', download_token: 'jeton-e2e' } });
        expect(zip.headers()['content-type']).toContain('zip');
        expect((zip.headers()['set-cookie'] || ''), 'the page waits for this cookie').toContain('poznote_download_token=jeton-e2e');
        const archive = await zip.body();
        expect(Object.keys(readZip(archive)).some((name) => name.endsWith('.sql'))).toBe(true);
        const later = await api.createNote({ heading: 'Tardive', content: '<p>x</p>', type: 'note' });
        const csrf = await csrfRestore(page);
        const restored = await page.request.post('/restore_import.php', {
            multipart: { action: 'complete_restore', csrf_token: csrf, complete_backup_file: { name: 'b.zip', mimeType: 'application/zip', buffer: archive } },
        });
        expect(restored.status()).toBe(200);
        expect((await api.get(`/notes/${later.id}`)).status, 'the POST restore did not restore').toBe(404);
        const refused = await page.request.post('/restore_import.php', {
            multipart: { action: 'complete_restore', csrf_token: 'faux', complete_backup_file: { name: 'b.zip', mimeType: 'application/zip', buffer: archive } },
        });
        expect(await refused.text(), 'a false CSRF token was accepted').toContain('Invalid form submission');
    });

    test('the import_notes and import_attachments forms bring a notes archive and an attachments archive back', covers('data.import-notes-archive', 'data.import-attachments-archive'), async ({ page, playwright }) => {
        await login(page, account);
        const notes = await (await page.request.get('/api_export_entries.php')).body();
        const attachments = await (await page.request.get('/api_export_attachments.php')).body();
        const target = await newAccount(playwright, 'dpartb');
        const other = await Api.open(playwright, target);
        await switchAccount(page, target);
        const csrf = await csrfRestore(page);
        const imported = await page.request.post('/restore_import.php', {
            multipart: { action: 'import_notes', csrf_token: csrf, notes_file: { name: 'n.zip', mimeType: 'application/zip', buffer: notes } },
        });
        expect(imported.status()).toBe(200);
        expect(await imported.text()).toContain('alert-success');
        const sent = await page.request.post('/restore_import.php', {
            multipart: { action: 'import_attachments', csrf_token: csrf, attachments_file: { name: 'a.zip', mimeType: 'application/zip', buffer: attachments } },
        });
        expect(await sent.text()).toContain('alert-success');
        expect(inInstance(`ls /var/www/html/data/users/${target.id}/attachments/ | wc -l`).trim(), 'no attachment arrived').not.toBe('0');
        await other.dispose();
    });
});
