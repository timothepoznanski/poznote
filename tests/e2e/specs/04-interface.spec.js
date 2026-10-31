// The app as a person uses it, in a real browser. Any JavaScript error, console
// error or 5xx during a test fails it, see the `page` fixture in lib/helpers.js.
const { test, expect, Api, ADMIN, KITCHEN_MD, KITCHEN_HTML, newAccount, login, openNote, settled } = require('../lib/helpers');

const editor = (page) => page.locator('.noteentry[contenteditable="true"]').first();
const placeCaretAtEnd = async (page) => { await editor(page).click(); await page.keyboard.press('Control+End'); };
const waitForSave = async (page) => {
    await page.evaluate(() => window.saveNoteImmediately && window.saveNoteImmediately());
    await page.waitForTimeout(800);
    await settled(page);
};
const pickSlash = async (page, filter) => {
    await page.keyboard.type('/');
    await expect(page.locator('.slash-command-menu')).toBeVisible();
    await page.keyboard.type(filter, { delay: 20 });
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
};

test.describe('editors', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'ui');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the + menu creates each kind of note', async ({ page }) => {
        for (const [label, check] of [
            ['Rich text note', '.noteentry[contenteditable="true"]'],
            ['Markdown note', '.markdown-editor, .markdown-preview'],
            ['Task List', '[id^="task-input-"]'],
        ]) {
            await page.goto('/index.php');
            await settled(page);
            await page.click('#sidebarCreateBtn');
            await page.locator('.create-menu-item', { hasText: label }).click();
            await expect(page.locator(check).first(), label).toBeVisible();
        }
    });

    test('typed rich text and its formatting survive a reload', async ({ page }) => {
        const note = await api.createNote({ heading: 'Saisie riche', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await placeCaretAtEnd(page);
        await page.keyboard.press('Enter');
        await page.keyboard.type('Texte tapé é ');
        await page.keyboard.press('Control+b');
        await page.keyboard.type('en gras');
        await page.keyboard.press('Control+b');
        await waitForSave(page);
        await page.reload();
        await expect(editor(page)).toContainText('Texte tapé é');
        await expect(editor(page).locator('b, strong')).toContainText('en gras');
    });

    test('a title can be renamed from the note', async ({ page }) => {
        const note = await api.createNote({ heading: 'Ancien titre', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('input.css-title').first().fill('Nouveau titre é');
        await page.keyboard.press('Tab');
        await waitForSave(page);
        await expect.poll(async () => (await api.getNote(note.id)).heading).toBe('Nouveau titre é');
    });

    test('the slash menu inserts a heading, a table and a code block', async ({ page }) => {
        const note = await api.createNote({ heading: 'Slash', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await placeCaretAtEnd(page);
        await page.keyboard.press('Enter');
        await pickSlash(page, 'heading');
        await page.keyboard.type('Mon titre');
        await expect(editor(page).locator('h1')).toContainText('Mon titre');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await pickSlash(page, 'plain');
        await expect(editor(page).locator('pre').first()).toBeVisible();
        await page.keyboard.press('Control+End');
        await pickSlash(page, 'table');
        await page.getByRole('button', { name: 'Insert', exact: true }).click();
        await expect(editor(page).locator('table').first()).toBeVisible();
        await expect(editor(page).locator('table tr')).toHaveCount(3);
    });

    test('the text typed in a table cell is saved (#1671)', async ({ page }) => {
        const note = await api.createNote({ heading: 'Tableau', content: '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table><p>fin</p>' });
        await openNote(page, note.id);
        await editor(page).locator('td').first().click();
        await page.keyboard.press('End');
        await page.keyboard.type(' ajouté');
        await waitForSave(page);
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('A ajouté');
    });

    test('code blocks keep their lines and are highlighted', async ({ page }) => {
        const note = await api.createNote({ heading: 'Code', content: KITCHEN_HTML });
        await openNote(page, note.id);
        await expect(editor(page).locator('pre').first()).toContainText('function bonjour');
        expect(await editor(page).locator('pre').first().innerText()).toContain('\n');
    });

    test('a Markdown note renders everything it contains', async ({ page }) => {
        const note = await api.createNote({ heading: 'Rendu Markdown', content: KITCHEN_MD, type: 'markdown' });
        await openNote(page, note.id);
        const preview = page.locator('.markdown-preview').first();
        await expect(preview).toBeVisible();
        for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
            await expect(preview.locator(level).first(), level).toBeVisible();
        }
        await expect(preview.locator('table')).toBeVisible();
        await expect(preview.locator('td', { hasText: 'centre' })).toBeVisible();
        await expect(preview.locator('input[type="checkbox"]').first()).toBeAttached();
        await expect(preview.locator('blockquote').first()).toBeVisible();
        await expect(preview.locator('[class*="callout"]').first(), 'callouts are not rendered').toBeVisible();
        await expect(preview.locator('pre code, pre').first()).toContainText('bonjour');
        await expect(preview.locator('.mermaid svg, svg[id*="mermaid"]').first(), 'Mermaid did not render').toBeVisible({ timeout: 15_000 });
        await expect(preview.locator('ol[type="a"], ol[style*="alpha"], ol.lettered, ol').first()).toBeVisible();
    });

    test('Markdown is edited in source and saved', async ({ page }) => {
        const note = await api.createNote({ heading: 'Edition Markdown', content: '# Titre\n\nTexte\n', type: 'markdown' });
        await openNote(page, note.id);
        await page.evaluate((id) => window.switchToEditMode(id), note.id);
        const source = page.locator('.markdown-editor .cm-content').first();
        await expect(source).toBeVisible();
        await source.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('Ligne **ajoutée** é');
        await waitForSave(page);
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('Ligne **ajoutée** é');
    });

    test('a task list: add, tick, and the count follows', async ({ page }) => {
        const list = await api.createNote({ heading: 'Liste UI', type: 'tasklist', content: '[]' });
        await openNote(page, list.id);
        const input = page.locator(`#task-input-${list.id}`);
        await input.fill('Acheter du pain');
        await input.press('Enter');
        await expect(page.locator('body')).toContainText('Acheter du pain');
        await page.locator('.task-checkbox').first().check();
        await expect.poll(async () => (await api.get(`/notes/${list.id}/tasks`)).text).toContain('"completed":true');
    });

    test('Excalidraw opens its editor', async ({ page }) => {
        await page.goto('/excalidraw_editor.php?workspace=Poznote');
        await expect(page.locator('.excalidraw, canvas').first()).toBeVisible({ timeout: 20_000 });
    });
});

test.describe('notes tree and note actions', () => {
    // KNOWN: trashing a note still releases its lock, which answers 404
    test.use({ allowedErrors: [/lock\/release/] });
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'tree');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('a folder is created from the + menu, and a note opens from the tree', async ({ page }) => {
        await api.createNote({ heading: 'Note de l\'arbre', content: '<p>Corps visible</p>' });
        await page.goto('/index.php');
        await settled(page);
        await page.click('#sidebarCreateBtn');
        await page.locator('.create-menu-item[data-type="folder"]').click();
        await page.locator('input:focus').fill('Dossier UI');
        await page.keyboard.press('Enter');
        await expect(page.locator('.folder-name', { hasText: 'Dossier UI' })).toBeVisible();
        await page.locator('a.links_arbo_left', { hasText: 'Note de l\'arbre' }).click();
        await expect(editor(page)).toContainText('Corps visible');
    });

    test('opening two notes gives two tabs', async ({ page }) => {
        await api.createNote({ heading: 'Onglet A', content: '<p>a</p>' });
        await api.createNote({ heading: 'Onglet B', content: '<p>b</p>' });
        await page.goto('/index.php');
        await settled(page);
        await page.locator('a.links_arbo_left', { hasText: 'Onglet A' }).click();
        await expect(editor(page)).toContainText('a');
        await page.locator('a.links_arbo_left', { hasText: 'Onglet B' }).click();
        await expect(editor(page)).toContainText('b');
        await expect(page.getByText('Onglet A').first()).toBeVisible();
        await expect(page.getByText('Onglet B').first()).toBeVisible();
    });

    test('search filters the tree, ignoring accents', async ({ page }) => {
        await api.createNote({ heading: 'Résultat cherché', content: '<p>crème</p>' });
        await api.createNote({ heading: 'Sans rapport', content: '<p>rien</p>' });
        await page.goto('/index.php');
        await settled(page);
        await page.fill('#unified-search', 'creme');
        await page.keyboard.press('Enter');
        await expect(page.locator('a.links_arbo_left', { hasText: 'Résultat cherché' })).toBeVisible();
        await expect(page.locator('a.links_arbo_left', { hasText: 'Sans rapport' })).toHaveCount(0);
    });

    test('favorite, move and trash work from the note toolbar', async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Cible' }))).json.folder;
        const note = await api.createNote({ heading: 'Note à déplacer', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.btn-favorite:visible').first().click();
        await expect.poll(async () => (await api.getNote(note.id)).favorite).toBeTruthy();

        await page.evaluate((id) => window.showMoveFolderDialog && window.showMoveFolderDialog(id), note.id);
        await expect(page.locator('#moveNoteFolderModal')).toBeVisible();
        await page.selectOption('#moveNoteTargetSelect', { label: 'Cible' });
        await page.click('#moveActionButton');
        await expect.poll(async () => (await api.getNote(note.id)).folder_id).toBe(folder.id);

        await page.locator('.note-edit-toolbar [data-action="delete-note"]:visible').first().click();
        const confirm = page.locator('#confirmButton:visible');
        if (await confirm.count()) await confirm.click();
        await expect.poll(async () => (await api.get('/trash')).text).toContain('Note à déplacer');
        await page.goto('/trash.php');
        await expect(page.locator('body')).toContainText('Note à déplacer');
    });

    test('the share and reminder dialogs and the attachments page open', async ({ page }) => {
        const note = await api.createNote({ heading: 'Dialogues', content: '<p>x</p>' });
        await openNote(page, note.id);
        for (const [button, name] of [['.btn-publish', 'share'], ['.btn-reminder', 'reminder']]) {
            await page.locator(`${button}:visible`).first().click();
            await expect(page.locator('.modal:visible').first(), `${name} dialog`).toBeVisible();
            await page.reload();
            await settled(page);
        }
        await page.locator('.btn-attachment:visible').first().click();
        await expect(page).toHaveURL(/attachments\.php\?note_id=/);
    });
});

test.describe('whole app', () => {
    const PAGES = {
        dashboard: '#left_col, body', tasks: 'body', favorites: 'body', trash: 'body', attachments_list: 'body', shared: 'body',
        diary: 'body', graph: 'canvas, svg', workspaces: 'body', settings: '#home-search-input', backup_export: 'body',
        restore_import: 'body', ai_settings: 'body', ai_settings_user: 'body', stt_settings: 'body', stt_settings_user: 'body',
        git_sync: 'body', s3_settings: 'body', s3_backup_settings: 'body', local_backup_settings: 'body', 'user-webhooks': 'body',
        mentions: 'body', revisions: 'body', 'storage-stats-user': 'body', notes_manager: 'body', list_tags: 'body', list_folders: 'body',
    };
    // KNOWN: without an S3 configuration the page still lists the bucket, which answers 500
    test.use({ allowedErrors: [/api_s3_backup\.php\?action=list/] });
    for (const [name, selector] of Object.entries(PAGES)) {
        test(`the ${name} page opens without errors`, async ({ page }) => {
            await login(page, ADMIN);
            const response = await page.goto(`/${name}.php`);
            expect(response.status()).toBeLessThan(400);
            await settled(page);
            await expect(page.locator(selector).first()).toBeVisible();
            await expect(page.locator('body')).not.toContainText(/Fatal error|Parse error|Stack trace|Deprecated:| on line \d+/);
        });
    }

    test('the AI panel opens and shows the streamed answer', async ({ page }) => {
        await login(page, ADMIN);
        await page.goto('/index.php');
        await settled(page);
        await page.click('#edgeAiChatBtn');
        await expect(page.locator('#ai-chat-input')).toBeVisible();
        await page.fill('#ai-chat-input', 'Bonjour');
        await page.click('#ai-chat-send');
        await expect(page.locator('#ai-chat-messages')).toContainText('depuis le mock', { timeout: 15_000 });
    });

    test('dark theme applies, and comes back', async ({ page }) => {
        await login(page, ADMIN);
        await page.addInitScript(() => { window.__poznoteForcedTheme = 'dark'; });
        await page.goto('/index.php');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(background, 'the dark background is missing').not.toBe('rgb(255, 255, 255)');
    });

    test('the interface follows the language setting', async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'lang');
        await login(page, account);
        const api = await Api.open(playwright, account);
        await api.ok(api.put('/settings/language', { value: 'fr' }));
        await page.goto('/settings.php');
        await expect(page.locator('body')).toContainText(/Paramètres|Compte|Espaces de travail/);
        await api.dispose();
    });

    test('on a phone, the list and a note both work', async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'phone');
        const api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'Note mobile', content: '<p>Corps mobile</p>' });
        await page.setViewportSize({ width: 390, height: 844 });
        await login(page, account);
        await openNote(page, note.id);
        await expect(editor(page)).toContainText('Corps mobile');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
        await api.dispose();
    });
});
