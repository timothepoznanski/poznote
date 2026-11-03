// Notes and navigation, as a person uses them: creating, the note toolbar, the
// lifecycle, tabs, the tree, tags, search, workspaces, shortcuts and the rail.
const fs = require('node:fs');
const { test, expect, covers, Api, BASE_URL, newAccount, login, openNote, settled } = require('../lib/helpers');

// --- Locators and small gestures ---------------------------------------------
const row = (page, title) => page.locator('#left_col a.links_arbo_left', { hasText: title }).first();
const folderRow = (page, name) => page.locator('#left_col .folder-header', { has: page.locator('.folder-name', { hasText: name }) }).first();
// (the bar hides with its last tab, which then stays in the DOM)
const appTab = (page, title) => page.locator('.app-tab:visible', { hasText: title });
const tabTitles = (page) => page.locator('.app-tab:visible .app-tab-title').allInnerTexts();
const editor = (page) => page.locator('.noteentry[contenteditable="true"]').first();
const toolbar = (page) => page.locator('.note-edit-toolbar:visible').first();
const titleInput = (page) => page.locator('input.css-title:visible').first();
const toolbarBtn = (page, action) => page.locator(`.note-edit-toolbar [data-action="${action}"]:visible`).first();
const openedNoteId = (page) => page.evaluate(() => {
    const entry = document.querySelector('#right_col .noteentry');
    return entry ? Number(entry.id.replace('entry', '')) : null;
});

async function goHome(page) {
    await page.goto('/index.php?workspace=Poznote');
    await settled(page);
}

/** The ⋮ of the note toolbar: the entries the row has no room for. */
async function toolbarMenu(page) {
    await toolbarBtn(page, 'toggle-mobile-toolbar-menu').click();
    const menu = page.locator('.note-edit-toolbar .mobile-toolbar-menu:visible').first();
    await expect(menu).toBeVisible();
    return menu;
}

/** The ⋮ of a note row of the tree, then one entry of it. */
async function noteMenu(page, title, action) {
    const item_ = page.locator('#left_col .note-list-item', { hasText: title }).first();
    await item_.hover();
    await item_.locator('.note-actions-toggle').click();
    const item = page.locator(`#left_col .note-actions-menu.show [data-action="${action}"]:visible`).first();
    await expect(item, `entry ${action} of the note menu`).toBeVisible();
    await item.click();
}

/** The ⋮ of a folder row of the tree, then one entry of it. */
async function folderMenu(page, name, action) {
    const toggle = folderRow(page, name).locator('.folder-toggle');
    await toggle.hover();
    await toggle.locator('.folder-actions-toggle').click();
    const item = page.locator(`#left_col .folder-actions-menu.show [data-action="${action}"]:visible`).first();
    await expect(item, `entry ${action} of the folder menu`).toBeVisible();
    await item.click();
}

/** A new browser starts with the folders folded, but for the one of the open note. */
async function expandAll(page) {
    const chevron = page.locator('#sidebarExpandFoldersBtn');
    if ((await chevron.getAttribute('title')).startsWith('Expand')) await chevron.click();
    await expect(chevron).toHaveAttribute('title', /Collapse/);
}

async function createFromPlus(page, type) {
    await page.click('#sidebarCreateBtn');
    await page.locator(`#create-menu .create-note-option[data-type="${type}"]`).click();
}

/** The positive button of whichever confirmation came up. */
async function confirmDialog(page) {
    await page.locator('.alert-modal .alert-modal-button:not(.secondary), #confirmModal:visible .btn-danger, #confirmModal:visible .btn-primary, #confirmModal:visible #confirmButton').first().click();
}

const notesOf = async (api, params = {}) => (await api.ok(api.get('/notes', { params: { per_page: 500, ...params } }))).json.notes;
const noteByTitle = async (api, heading) => (await notesOf(api)).find((note) => note.heading === heading);
const foldersOf = async (api, params = {}) => (await api.ok(api.get('/folders', { params: { workspace: 'Poznote', ...params } }))).json.folders;
const folderByName = async (api, name, params = {}) => {
    const all = (await foldersOf(api, params));
    const flat = (list) => list.flatMap((folder) => [folder, ...flat(folder.children || [])]);
    return flat(all).find((folder) => folder.name === name);
};
const newFolder = async (api, name, extra = {}) => (await api.ok(api.post('/folders', { folder_name: name, workspace: 'Poznote', ...extra }))).json.folder;
const setting = async (api, key) => (await api.ok(api.get(`/settings/${key}`))).json.value;
const trashHas = async (api, heading) => (await api.ok(api.get('/trash'))).text.includes(heading);

/** One describe = one new account, signed in before each test. */
function withAccount(prefix) {
    const shared = {};
    test.beforeAll(async ({ playwright }) => {
        shared.account = await newAccount(playwright, prefix);
        shared.api = await Api.open(playwright, shared.account);
        // Without a name the API takes the first workspace, which becomes Archives as soon as a test archives
        const createNote = shared.api.createNote.bind(shared.api);
        shared.api.createNote = (fields) => createNote({ workspace: 'Poznote', ...fields });
    });
    test.afterAll(async () => { await shared.api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, shared.account); });
    return shared;
}

/** Shares the workspace Poznote of an account with another, as workspaces.php does (in its own browser). */
async function shareWorkspace(browser, owner, granteeId) {
    const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'block' });
    const ownerPage = await context.newPage();
    await login(ownerPage, owner);
    await ownerPage.goto('/workspaces.php');
    const status = await ownerPage.evaluate(async (grantee) => {
        const form = new FormData();
        form.append('action', 'share_workspace');
        form.append('name', 'Poznote');
        form.append('allowed_users', JSON.stringify([grantee]));
        return (await fetch('workspaces.php', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, body: form })).status;
    }, granteeId);
    expect(status).toBeLessThan(400);
    await context.close();
}

// KNOWN: trashing an open note still releases its lock, which answers 404
const LOCK_RELEASE_404 = /lock\/release|status of 404/;

test.describe('creating notes', () => {
    const ctx = withAccount('nav-create');

    test('the + menu lists exactly its entries', covers('notes.create-menu'), async ({ page }) => {
        await goHome(page);
        await page.click('#sidebarCreateBtn');
        const types = await page.locator('#create-menu .create-note-option:visible').evaluateAll((items) => items.map((item) => item.dataset.type));
        expect(types).toEqual(['html', 'markdown', 'list', 'diary', 'folder']);
        await page.locator('#right_col').click({ position: { x: 300, y: 500 } });
        await expect(page.locator('#create-menu .create-note-option').first()).toBeHidden();
    });

    for (const [type, stored, check] of [
        ['html', 'note', '.noteentry[contenteditable="true"]'],
        ['markdown', 'markdown', '.markdown-editor:visible, .markdown-preview:visible'],
        ['list', 'tasklist', '[id^="task-input-"]'],
    ]) {
        test(`the + menu creates a ${stored} note, stored with that type`, covers('notes.create-note'), async ({ page }) => {
            await goHome(page);
            const before = (await notesOf(ctx.api)).length;
            await createFromPlus(page, type);
            await expect(page.locator(check).first()).toBeVisible();
            await expect.poll(async () => (await notesOf(ctx.api)).length).toBe(before + 1);
            const id = await openedNoteId(page);
            expect((await ctx.api.getNote(id)).type).toBe(stored);
            await expect(page.locator('.app-tab.active')).toHaveCount(1);
            await expect(page.locator(`#left_col a.links_arbo_left[data-note-id="${id}"]`).first()).toBeVisible();
        });
    }

    test('the Diary entry of the + menu leads to the diary', covers('notes.create-diary'), async ({ page }) => {
        await goHome(page);
        const before = (await notesOf(ctx.api)).length;
        await createFromPlus(page, 'diary');
        await expect.poll(async () => (await notesOf(ctx.api)).length).toBe(before + 1);
        const today = new Date().toISOString().slice(0, 10);
        await expect(titleInput(page)).toHaveValue(new RegExp(today));
        const folderId = (await ctx.api.getNote(await openedNoteId(page))).folder_id;
        expect((await ctx.api.ok(ctx.api.get(`/folders/${folderId}/path`))).text, 'lands in the folder of the year').toContain(today.slice(0, 4));
    });

    test('create.php offers each kind of note and creates what is clicked', covers('notes.create-page'), async ({ page }) => {
        await page.goto('/create.php');
        const types = await page.locator('.home-card[data-create-type]:visible').evaluateAll((cards) => cards.map((card) => card.dataset.createType));
        expect(types).toEqual(expect.arrayContaining(['html', 'markdown', 'list', 'diary', 'folder']));
        const before = (await notesOf(ctx.api)).length;
        await page.locator('.home-card[data-create-type="markdown"]').click();
        await expect(page.locator('.markdown-editor:visible, .markdown-preview:visible').first()).toBeVisible({ timeout: 20_000 });
        await expect.poll(async () => (await notesOf(ctx.api)).length).toBe(before + 1);
        expect((await ctx.api.getNote(await openedNoteId(page))).type).toBe('markdown');
    });

    test('Alt+Shift+N creates a note of the type picked in the shortcuts window', covers('notes.shortcut-new-note', 'notes.shortcuts-modal'), async ({ page }) => {
        await goHome(page);
        await expect(page.locator('#newNoteShortcutType')).toBeAttached();
        const before = (await notesOf(ctx.api)).length;
        await page.keyboard.press('Alt+Shift+N');
        await expect.poll(async () => (await notesOf(ctx.api)).length).toBe(before + 1);
        await expect(page.locator('.markdown-editor:visible, .markdown-preview:visible').first()).toBeVisible({ timeout: 20_000 });

        await ctx.api.ok(ctx.api.put('/settings/new_note_shortcut_type', { value: 'tasklist' }));
        await goHome(page);
        await expect(page.locator('#newNoteShortcutType')).toHaveValue('tasklist');
        await page.keyboard.press('Alt+Shift+N');
        await expect(page.locator('[id^="task-input-"]').first()).toBeVisible();
        await expect.poll(async () => (await notesOf(ctx.api)).length).toBe(before + 2);
        await ctx.api.ok(ctx.api.put('/settings/new_note_shortcut_type', { value: 'markdown' }));
    });

    test('Create here in a folder menu creates the note in that folder', covers('notes.create-in-folder'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Ici é');
        await goHome(page);
        await folderMenu(page, 'Ici é', 'create-note-in-folder');
        const types = await page.locator('#create-menu .create-note-option:visible').evaluateAll((items) => items.map((item) => item.dataset.type));
        expect(types, 'in a folder the menu offers the notes and a subfolder').toEqual(['html', 'markdown', 'list', 'diary', 'subfolder']);
        await page.locator('#create-menu .create-note-option[data-type="html"]').click();
        await expect(editor(page)).toBeVisible();
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/folders/${folder.id}/notes`))).json.count).toBe(1);
    });

    test('a folder and a subfolder are created from the menus, and persist', covers('notes.folder-create'), async ({ page }) => {
        await goHome(page);
        await createFromPlus(page, 'folder');
        await page.locator('input:focus').fill('Racine créée');
        await page.keyboard.press('Enter');
        await expect(page.locator('#left_col .folder-name', { hasText: 'Racine créée' })).toBeVisible();
        const parent = await folderByName(ctx.api, 'Racine créée');
        expect(parent, 'folder stored').toBeTruthy();

        await folderMenu(page, 'Racine créée', 'create-note-in-folder');
        await page.locator('#create-menu .create-note-option[data-type="subfolder"]').click();
        await page.locator('input:focus').fill('Sous-dossier');
        await page.keyboard.press('Enter');
        await expect(page.locator('#left_col .folder-name', { hasText: 'Sous-dossier' })).toBeVisible();
        await expect.poll(async () => (await folderByName(ctx.api, 'Sous-dossier'))?.parent_id ?? (await ctx.api.get(`/folders/${(await folderByName(ctx.api, 'Sous-dossier')).id}`)).json.folder.parent_id).toBe(parent.id);
    });
});

test.describe('title and subline', () => {
    const ctx = withAccount('nav-title');

    test('the title is renamed in the note, in the tree and the tab, and persists', covers('notes.rename-title'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Ancien nom', content: '<p>x</p>' });
        await openNote(page, note.id);
        await titleInput(page).fill('Nouveau nom é');
        await page.keyboard.press('Tab');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).heading).toBe('Nouveau nom é');
        await expect(row(page, 'Nouveau nom é')).toBeVisible();
        await expect(appTab(page, 'Nouveau nom é')).toBeVisible();
        await page.reload();
        await expect(titleInput(page)).toHaveValue('Nouveau nom é');
    });

    test('Rename note in the tree menu renames inline', covers('notes.rename-tree'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Renommable', content: '<p>x</p>' });
        await openNote(page, note.id);
        await noteMenu(page, 'Renommable', 'rename-note');
        const input = page.locator('#left_col input:focus');
        await expect(input).toHaveValue('Renommable');
        await input.fill('Renommée en ligne');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).heading).toBe('Renommée en ligne');
        await expect(row(page, 'Renommée en ligne')).toBeVisible();
    });

    test('the title menu sets colour and size, each saved at once, and Reset clears them', covers('notes.title-style-menu'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Titre stylé', content: '<p>x</p>' });
        await openNote(page, note.id);
        await titleInput(page).click({ button: 'right' });
        const menu = page.locator('#noteTitleMenu');
        await expect(menu).toBeVisible();
        const swatch = menu.locator('.note-title-menu-swatch:not(.is-default)').nth(2);
        const hex = await swatch.getAttribute('data-color');
        await swatch.click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).title_color?.toLowerCase()).toBe(hex.toLowerCase());
        const sizes = await menu.locator('.note-title-menu-size').evaluateAll((items) => items.map((item) => item.dataset.size));
        expect(sizes).toEqual(['20', '', '30', '36']);
        await menu.locator('.note-title-menu-size[data-size="36"]').click();
        await expect.poll(async () => Number((await ctx.api.getNote(note.id)).title_size)).toBe(36);
        await expect.poll(() => titleInput(page).evaluate((input) => getComputedStyle(input).fontSize)).toBe('36px');
        const rgb = await titleInput(page).evaluate((input) => getComputedStyle(input).color);
        await page.keyboard.press('Escape');
        await page.reload();
        await expect.poll(() => titleInput(page).evaluate((input) => getComputedStyle(input).fontSize)).toBe('36px');
        expect(await titleInput(page).evaluate((input) => getComputedStyle(input).color)).toBe(rgb);

        await titleInput(page).click({ button: 'right' });
        await menu.locator('.note-title-menu-item').last().click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).title_size ?? null).toBeNull();
        expect((await ctx.api.getNote(note.id)).title_color ?? null).toBeNull();
    });

    test('the subline shows dates and counts that follow the typing', covers('notes.subline'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Compteurs', content: '<p>un deux</p>' });
        await openNote(page, note.id);
        const stats = page.locator(`#noteStats${note.id}`);
        await expect(stats.locator('[data-stat="words"]')).toHaveText('2 words');
        await expect(stats.locator('[data-stat="characters"]')).toHaveText('7 characters');
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' trois');
        await expect(stats.locator('[data-stat="words"]')).toHaveText('3 words');
        await expect(page.locator('.note-sub-updated:visible').first()).toContainText('Modified');
    });

    test('the subline menu hides an item, keeps it hidden, and never hides the last one', covers('notes.subline-menu'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Ligne', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.note-subline:visible').click({ button: 'right' });
        const menu = page.locator('#noteSublineMenu');
        await expect(menu).toBeVisible();
        expect(await menu.getByRole('menuitemcheckbox').count()).toBe(6);
        const words = menu.getByRole('menuitemcheckbox', { name: /word count/i });
        await words.click();
        await expect(page.locator(`#noteStats${note.id} [data-stat="words"]`)).toBeHidden();
        await expect(menu, 'the menu stays open').toBeVisible();
        await expect.poll(async () => JSON.stringify(await setting(ctx.api, 'hidden_ui_elements'))).toContain('panel:note-stats-words');
        await page.reload();
        await expect(page.locator(`#noteStats${note.id} [data-stat="words"]`)).toBeHidden();
        await ctx.api.ok(ctx.api.put('/settings/hidden_ui_elements', { value: '[]' }));
    });

    test('the information icon shows the note information', covers('notes.info-modal'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Infos é', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator(`.note-sub-info-btn[data-note-id="${note.id}"]`).click();
        const modal = page.locator('#noteInfoModal');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText(String(note.id));
        await modal.locator('[data-action="close-modal"], .btn-cancel, .btn-primary').first().click();
        await expect(modal).toBeHidden();
    });
});

test.describe('note lifecycle', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-life');

    test('typing autosaves without any button', covers('notes.autosave'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Auto', content: '<p>début</p>' });
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' ajout autosauvé');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content, { timeout: 20_000 }).toContain('ajout autosauvé');
    });

    test('Ctrl+S and the save button save at once and say so', covers('notes.save-button', 'notes.shortcut-save'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Sauve', content: '<p>début</p>' });
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' par raccourci');
        await page.keyboard.press('Control+s');
        await expect(page.locator('.save-notification[data-ctrl-s-toast]')).toBeVisible();
        expect((await ctx.api.getNote(note.id)).content).toContain('par raccourci');
        await page.keyboard.type(' par bouton');
        await toolbarBtn(page, 'save-note').click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content).toContain('par bouton');
    });

    test('the toolbar Delete sends the note to the trash and leaves it in place', covers('notes.delete-toolbar', 'notes.delete-in-place'), async ({ page }) => {
        const keep = await ctx.api.createNote({ heading: 'Reste là', content: '<p>x</p>' });
        const note = await ctx.api.createNote({ heading: 'À jeter', content: '<p>x</p>' });
        await openNote(page, note.id);
        const url = page.url();
        await toolbarBtn(page, 'delete-note').click();
        await expect.poll(() => trashHas(ctx.api, 'À jeter')).toBe(true);
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'À jeter' })).toHaveCount(0);
        await expect(appTab(page, 'À jeter')).toHaveCount(0);
        expect(page.url(), 'the page did not change to another route').toContain('index.php');
        expect(url).toContain('index.php');
        expect((await ctx.api.getNote(keep.id)).heading).toBe('Reste là');
    });

    test('Delete note in the tree menu trashes that row, not the open note', covers('notes.delete-tree'), async ({ page }) => {
        const open = await ctx.api.createNote({ heading: 'Ouverte ici', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Depuis arbre', content: '<p>x</p>' });
        await openNote(page, open.id);
        await noteMenu(page, 'Depuis arbre', 'delete-note');
        await expect.poll(() => trashHas(ctx.api, 'Depuis arbre')).toBe(true);
        expect(await trashHas(ctx.api, 'Ouverte ici')).toBe(false);
        await expect(titleInput(page)).toHaveValue('Ouverte ici');
    });

    test('the trash page lists, searches, restores and purges one note', covers('notes.trash-page', 'notes.trash-restore', 'notes.trash-purge', 'notes.trash-search'), async ({ page }) => {
        const a = await ctx.api.createNote({ heading: 'Corbeille récupérée', content: '<p>x</p>' });
        const b = await ctx.api.createNote({ heading: 'Corbeille purgée', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.del(`/notes/${a.id}`));
        await ctx.api.ok(ctx.api.del(`/notes/${b.id}`));
        await page.goto('/trash.php');
        await expect(page.locator(`#note${a.id}`)).toContainText('Corbeille récupérée');
        await expect(page.locator(`#note${b.id}`)).toContainText('Corbeille purgée');

        await page.fill('#searchInput', 'purgée');
        await expect(page.locator(`#note${a.id}`)).toBeHidden();
        await expect(page.locator(`#note${b.id}`)).toBeVisible();
        await page.fill('#searchInput', '');
        await expect(page.locator(`#note${a.id}`)).toBeVisible();

        await page.locator(`#note${a.id} .trash-restore-btn`).click();
        await page.locator('#restoreConfirmModal .btn-primary').click();
        await expect(page.locator(`#note${a.id}`)).toBeHidden();
        expect((await ctx.api.getNote(a.id)).heading).toBe('Corbeille récupérée');
        expect(await trashHas(ctx.api, 'Corbeille récupérée')).toBe(false);

        await page.locator(`#note${b.id} .trash-delete-btn`).click();
        await page.locator('#deleteConfirmModal .btn-danger').click();
        await expect(page.locator(`#note${b.id}`)).toBeHidden();
        expect(await trashHas(ctx.api, 'Corbeille purgée')).toBe(false);
        expect((await ctx.api.get(`/notes/${b.id}`)).status).toBe(404);
    });

    test('Empty trash asks first, then empties', covers('notes.trash-empty'), async ({ page }) => {
        const c = await ctx.api.createNote({ heading: 'Vidée 1', content: '<p>x</p>' });
        const d = await ctx.api.createNote({ heading: 'Vidée 2', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.del(`/notes/${c.id}`));
        await ctx.api.ok(ctx.api.del(`/notes/${d.id}`));
        await page.goto('/trash.php');
        await page.click('#emptyTrashBtn');
        await page.locator('#emptyTrashConfirmModal .btn-cancel').click();
        expect(await trashHas(ctx.api, 'Vidée 1'), 'Cancel keeps the trash').toBe(true);
        await page.click('#emptyTrashBtn');
        await page.locator('#emptyTrashConfirmModal .btn-danger').click();
        await expect(page.locator('.trash-notecard')).toHaveCount(0);
        expect(await trashHas(ctx.api, 'Vidée 1')).toBe(false);
        expect(await trashHas(ctx.api, 'Vidée 2')).toBe(false);
    });

    test('Duplicate in the toolbar menu makes a copy with the same content', covers('notes.duplicate'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Dupliquée', content: '<p>Contenu copié é</p>' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
        await expect.poll(async () => (await notesOf(ctx.api)).filter((item) => item.heading.startsWith('Dupliquée')).length).toBe(2);
        const copy = (await notesOf(ctx.api)).find((item) => item.heading.startsWith('Dupliquée') && item.id !== note.id);
        expect((await ctx.api.getNote(copy.id)).content).toContain('Contenu copié é');
        await expect(page.locator(`#left_col a.links_arbo_left[data-note-id="${copy.id}"]`).first()).toBeVisible();
        expect(await openedNoteId(page), 'stays on the original').toBe(note.id);
    });

    test('Convert from the toolbar menu changes the type both ways', covers('notes.convert'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Convertie', content: '# Titre\n\nTexte **gras**\n', type: 'markdown' });
        await openNote(page, note.id);
        let menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: /Convert to/ }).click();
        await expect(page.locator('#convertNoteModal')).toBeVisible();
        await page.click('#confirmConvertBtn');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).type).toBe('note');
        expect((await ctx.api.getNote(note.id)).content).toContain('<strong>gras</strong>');
        await expect(editor(page).locator('strong')).toContainText('gras');
        menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: /Convert to/ }).click();
        await page.click('#confirmConvertBtn');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).type).toBe('markdown');
        expect((await ctx.api.getNote(note.id)).content).toContain('**gras**');
    });

    test('the Duplicate button of the convert window keeps a copy before converting', covers('notes.convert-duplicate'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Avant conversion', content: '# A\n', type: 'markdown' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: /Convert to/ }).click();
        await page.click('#duplicateBeforeConvertBtn');
        await expect.poll(async () => (await notesOf(ctx.api)).filter((item) => item.heading.startsWith('Avant conversion')).length).toBe(2);
    });

    test('Archive note in the toolbar menu moves it to the Archive folder', covers('notes.archive-note'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'À archiver', content: '<p>x</p>' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Archive note' }).click();
        await confirmDialog(page);
        await expect.poll(async () => (await ctx.api.getNote(note.id)).workspace).toBe('Archives');
    });
});

test.describe('tabs and history', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-tabs');
    const three = async (prefix) => {
        const notes = [];
        for (const letter of ['A', 'B', 'C']) notes.push(await ctx.api.createNote({ heading: `${prefix} ${letter}`, content: `<p>Corps ${prefix} ${letter}</p>` }));
        return notes;
    };
    /** Opens the notes as tabs, through the double-click on their row. */
    async function openTabs(page, notes) {
        await openNote(page, notes[0].id);
        for (const note of notes.slice(1)) {
            await row(page, note.heading).dblclick();
            await expect(appTab(page, note.heading)).toBeVisible();
        }
        await expect.poll(() => tabTitles(page)).toEqual(notes.map((note) => note.heading));
        await expect(titleInput(page)).toHaveValue(notes[notes.length - 1].heading);
    }

    test('a plain click replaces the tab, a double-click and a middle-click open a new one', covers('notes.tab-open'), async ({ page }) => {
        const [a, b, c] = await three('Ouvrir');
        await openNote(page, a.id);
        expect(await tabTitles(page)).toEqual(['Ouvrir A']);
        await row(page, 'Ouvrir B').click();
        await expect(titleInput(page)).toHaveValue('Ouvrir B');
        await expect.poll(() => tabTitles(page), 'a plain click keeps one tab').toEqual(['Ouvrir B']);
        await row(page, 'Ouvrir A').dblclick();
        await expect.poll(() => tabTitles(page)).toEqual(['Ouvrir B', 'Ouvrir A']);
        await row(page, 'Ouvrir C').click({ button: 'middle' });
        await expect.poll(() => tabTitles(page)).toEqual(['Ouvrir B', 'Ouvrir A', 'Ouvrir C']);
        await expect(titleInput(page)).toHaveValue('Ouvrir C');
        expect(c.id).toBeGreaterThan(b.id);
    });

    test('Open in a tab from the tree menu adds a tab, Close this tab removes it', covers('notes.tab-open-menu', 'notes.tab-close-menu'), async ({ page }) => {
        const [a] = await three('Menu');
        await openNote(page, a.id);
        await noteMenu(page, 'Menu B', 'open-note-new-tab');
        await expect.poll(() => tabTitles(page)).toEqual(['Menu A', 'Menu B']);
        await noteMenu(page, 'Menu B', 'close-note-tab');
        await expect.poll(() => tabTitles(page)).toEqual(['Menu A']);
        await expect(titleInput(page)).toHaveValue('Menu A');
    });

    test('clicking a tab switches the note and marks it active', covers('notes.tab-switch'), async ({ page }) => {
        const notes = await three('Bascule');
        await openTabs(page, notes);
        await appTab(page, 'Bascule A').click();
        await expect(titleInput(page)).toHaveValue('Bascule A');
        await expect(editor(page)).toContainText('Corps Bascule A');
        await expect(page.locator('.app-tab.active .app-tab-title')).toHaveText('Bascule A');
        await expect(page).toHaveURL(new RegExp(`note=${notes[0].id}\\b`));
        await expect(page.locator('#left_col a.links_arbo_left.selected-note')).toContainText('Bascule A');
    });

    test('× closes a tab and the neighbour takes over', covers('notes.tab-close'), async ({ page }) => {
        const notes = await three('Croix');
        await openTabs(page, notes);
        await appTab(page, 'Croix C').locator('.app-tab-close').click();
        await expect.poll(() => tabTitles(page)).toEqual(['Croix A', 'Croix B']);
        await expect(titleInput(page)).toHaveValue('Croix B');
        await appTab(page, 'Croix A').locator('.app-tab-close').click();
        await expect.poll(() => tabTitles(page), 'closing an inactive tab keeps the note').toEqual(['Croix B']);
        await expect(titleInput(page)).toHaveValue('Croix B');
        expect((await ctx.api.getNote(notes[2].id)).heading, 'closing a tab does not touch the note').toBe('Croix C');
    });

    test('a double-click and a middle-click on a tab close it', covers('notes.tab-close-gestures'), async ({ page }) => {
        const notes = await three('Geste');
        await openTabs(page, notes);
        await appTab(page, 'Geste A').click({ button: 'middle' });
        await expect.poll(() => tabTitles(page)).toEqual(['Geste B', 'Geste C']);
        await appTab(page, 'Geste B').dblclick();
        await expect.poll(() => tabTitles(page)).toEqual(['Geste C']);
    });

    test('the tab context menu pins, closes others, closes all but the pinned', covers('notes.tab-context-menu', 'notes.tab-pin', 'notes.tab-close-others', 'notes.tab-close-all'), async ({ page }) => {
        const notes = await three('Contexte');
        await openTabs(page, notes);
        const menu = page.locator('#app-tab-context-menu');
        const entries = () => menu.locator('.app-tab-context-item').allInnerTexts();
        await appTab(page, 'Contexte B').click({ button: 'right' });
        expect((await entries()).map((text) => text.trim())).toEqual(['Pin tab', 'Close this one', 'Close all except this one', 'Close all']);
        await menu.getByText('Pin tab').click();
        await expect.poll(() => tabTitles(page), 'a pinned tab goes first').toEqual(['Contexte B', 'Contexte A', 'Contexte C']);
        await expect(appTab(page, 'Contexte B').locator('.app-tab-close')).toHaveCount(0);

        await page.reload();
        await settled(page);
        await expect(appTab(page, 'Contexte B')).toHaveClass(/pinned/);

        await appTab(page, 'Contexte C').click({ button: 'right' });
        await menu.getByText('Close all except this one').click();
        await expect.poll(() => tabTitles(page), 'the pinned one stays').toEqual(['Contexte B', 'Contexte C']);

        await page.locator('.app-tab-close-all').click();
        await expect.poll(() => tabTitles(page), 'Close all spares the pinned tab').toEqual(['Contexte B']);

        await appTab(page, 'Contexte B').click({ button: 'right' });
        await menu.getByText('Unpin tab').click();
        await expect(appTab(page, 'Contexte B')).not.toHaveClass(/pinned/);
        await appTab(page, 'Contexte B').click({ button: 'right' });
        await menu.getByText('Close this one').click();
        await expect.poll(() => tabTitles(page)).toEqual([]);
        await expect(page.locator('#right_col .noteentry')).toHaveCount(0);
    });

    /** Holds a tab with the mouse and drags it to a page x, as the bar reacts per frame. */
    async function dragTab(page, title, toX) {
        const from = await appTab(page, title).boundingBox();
        const y = from.y + from.height / 2;
        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(toX, y, { steps: 14 });
        // (the neighbours slide into place: the slot is settled once they did)
        await page.waitForTimeout(300);
        await page.mouse.move(toX + 1, y);
        await page.waitForTimeout(100);
        await page.mouse.up();
    }

    test('tabs are reordered by dragging, and the order survives a reload', covers('notes.tab-reorder', 'notes.tab-persist'), async ({ page }) => {
        const notes = await three('Ordre');
        await openTabs(page, notes);
        const last = await appTab(page, 'Ordre C').boundingBox();
        await dragTab(page, 'Ordre A', last.x + last.width + 30);
        await expect.poll(() => tabTitles(page)).toEqual(['Ordre B', 'Ordre C', 'Ordre A']);
        await page.reload();
        await settled(page);
        await expect.poll(() => tabTitles(page), 'tabs come back after a reload').toEqual(['Ordre B', 'Ordre C', 'Ordre A']);
        await expect(page.locator('.app-tab.active .app-tab-title')).toHaveText('Ordre C');
    });

    test('a tab can be dragged to the first place', covers('notes.tab-reorder'), async ({ page }) => {
        test.fail(true, 'BUG: tabs.js clamps the dragged tab at the left of the strip, where its centre never passes the centre of a first tab as wide');
        const notes = await three('Tête');
        await openTabs(page, notes);
        await dragTab(page, 'Tête C', 5);
        await expect.poll(() => tabTitles(page), { timeout: 3_000 }).toEqual(['Tête C', 'Tête A', 'Tête B']);
    });

    test('tabs come back with the bare home page, on the note last active', covers('notes.tab-persist'), async ({ page }) => {
        const notes = await three('Retour');
        await openTabs(page, notes);
        await appTab(page, 'Retour B').click();
        await expect(titleInput(page)).toHaveValue('Retour B');
        await page.goto('/index.php');
        await settled(page);
        await expect.poll(() => tabTitles(page)).toEqual(['Retour A', 'Retour B', 'Retour C']);
        await expect(titleInput(page)).toHaveValue('Retour B');
    });

    test('renaming a note renames its tab, deleting it closes its tab', covers('notes.tab-follows-note'), async ({ page }) => {
        const notes = await three('Suivi');
        await openTabs(page, notes);
        await titleInput(page).fill('Suivi renommé');
        await expect(appTab(page, 'Suivi renommé'), 'the tab follows while typing').toBeVisible();
        await page.keyboard.press('Tab');
        await expect.poll(async () => (await ctx.api.getNote(notes[2].id)).heading).toBe('Suivi renommé');
        await toolbarBtn(page, 'delete-note').click();
        await expect.poll(() => tabTitles(page)).toEqual(['Suivi A', 'Suivi B']);
    });

    test('a double-click on another note saves the edits once, without a conflict', covers('notes.tab-open'), async ({ page }) => {
        test.fail(true, 'BUG: leaving edits by double-click sends several identical saves at once, the extras answer 409');
        const note = await ctx.api.createNote({ heading: 'Une sauvegarde', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Destination', content: '<p>y</p>' });
        const saves = [];
        page.on('response', (response) => {
            if (response.request().method() === 'PATCH' && response.url().endsWith(`/notes/${note.id}`)) saves.push(response.status());
        });
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' modifié');
        await row(page, 'Destination').dblclick();
        await expect(titleInput(page)).toHaveValue('Destination');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content).toContain('modifié');
        await settled(page);
        expect(saves).not.toContain(409);
    });

    test('coming back to a tab restores the place in a rich note', covers('notes.tab-return-scroll'), async ({ page }) => {
        const long = Array.from({ length: 150 }, (_, line) => `<p>Ligne ${line} é</p>`).join('');
        const big = await ctx.api.createNote({ heading: 'Longue', content: long });
        const other = await ctx.api.createNote({ heading: 'Courte', content: '<p>x</p>' });
        await openNote(page, big.id);
        await editor(page).locator('p').nth(100).click();
        const scroll = await page.locator('#right_col').evaluate((col) => col.scrollTop);
        expect(scroll).toBeGreaterThan(200);
        await row(page, other.heading).dblclick();
        await expect(titleInput(page)).toHaveValue('Courte');
        await appTab(page, 'Longue').click();
        await expect(titleInput(page)).toHaveValue('Longue');
        await expect.poll(() => page.locator('#right_col').evaluate((col) => col.scrollTop), 'the scroll comes back').toBeGreaterThan(scroll - 80);
    });

    test('coming back to the tab of a Markdown note puts the caret back', covers('notes.tab-return-caret'), async ({ page }) => {
        await ctx.api.ok(ctx.api.put('/settings/markdown_default_view_mode', { value: 'edit' }));
        const md = await ctx.api.createNote({ heading: 'Curseur', content: 'Première ligne\n\nDeuxième ligne\n', type: 'markdown' });
        const other = await ctx.api.createNote({ heading: 'Ailleurs', content: '<p>x</p>' });
        await openNote(page, md.id);
        const source = page.locator('.markdown-editor .cm-content:visible').first();
        await source.locator('.cm-line', { hasText: 'Première' }).click();
        await page.keyboard.press('End');
        await page.keyboard.type(' MARQUE');
        await page.keyboard.press('Control+s');
        await expect.poll(async () => (await ctx.api.getNote(md.id)).content).toContain('MARQUE');
        await row(page, other.heading).dblclick();
        await expect(titleInput(page)).toHaveValue('Ailleurs');
        await appTab(page, 'Curseur').click();
        await expect(titleInput(page)).toHaveValue('Curseur');
        await expect(page.locator('.markdown-editor .cm-content:visible').first()).toBeFocused();
        await page.keyboard.type('SUITE');
        await expect(page.locator('.markdown-editor .cm-content:visible').first()).toContainText('Première ligne MARQUESUITE');
        await ctx.api.ok(ctx.api.put('/settings/markdown_default_view_mode', { value: 'preview' }));
    });

    test('Back and Forward walk through the notes visited', covers('notes.history'), async ({ page }) => {
        const [a] = await three('Histoire');
        await openNote(page, a.id);
        const back = page.locator('#note-history-back:visible, .btn-history-back:visible').first();
        const forward = page.locator('#note-history-forward:visible, .btn-history-forward:visible').first();
        await row(page, 'Histoire B').click();
        await expect(titleInput(page)).toHaveValue('Histoire B');
        await row(page, 'Histoire C').click();
        await expect(titleInput(page)).toHaveValue('Histoire C');
        await page.locator('#right_col').hover();
        await back.click();
        await expect(titleInput(page)).toHaveValue('Histoire B');
        await back.click();
        await expect(titleInput(page)).toHaveValue('Histoire A');
        await forward.click();
        await expect(titleInput(page)).toHaveValue('Histoire B');
    });

    test('the browser Back button returns to the previous note', covers('notes.browser-back'), async ({ page }) => {
        const [a] = await three('Navigateur');
        await openNote(page, a.id);
        await row(page, 'Navigateur B').click();
        await expect(page).toHaveURL(/note=/);
        await expect(titleInput(page)).toHaveValue('Navigateur B');
        await page.goBack();
        await expect(titleInput(page)).toHaveValue('Navigateur A');
    });
});

const treeOrder = async (page) => (await page.locator('#left_col a.links_arbo_left:visible').allInnerTexts()).map((text) => text.trim());
const isRowShown = (page, title) => page.locator('#left_col a.links_arbo_left:visible', { hasText: title });
const folderOfNote = async (api, id) => (await api.getNote(id)).folder_id ?? null;

test.describe('notes tree: folders', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-fold');
    const folderWithNote = async (name, heading) => {
        const folder = await newFolder(ctx.api, name);
        const note = await ctx.api.createNote({ heading, content: '<p>x</p>', folder_id: folder.id });
        await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        return { folder, note };
    };

    test('the folder menu lists exactly its entries', covers('notes.folder-menu'), async ({ page }) => {
        await folderWithNote('Menu complet', 'Dans le menu');
        await goHome(page);
        const toggle = folderRow(page, 'Menu complet').locator('.folder-toggle');
        await toggle.hover();
        await toggle.locator('.folder-actions-toggle').click();
        const actions = await page.locator('#left_col .folder-actions-menu.show [data-action]:visible').evaluateAll((items) => items.map((item) => item.dataset.action));
        expect(actions).toEqual(['create-note-in-folder', 'open-kanban-view', 'open-all-notes-in-tabs', 'show-only-folder', 'move-folder-files',
            'move-entire-folder', 'duplicate-folder', 'copy-folder', 'cut-folder', 'download-folder', 'tag-folder-notes', 'toggle-folder-speed-dial',
            'share-folder', 'favorite-folder', 'offline-folder', 'rename-folder', 'archive-folder', 'delete-folder']);
    });

    test('a right-click on a folder and on a note opens its menu', covers('notes.tree-context-menu'), async ({ page }) => {
        await folderWithNote('Clic droit', 'Note clic droit');
        await goHome(page);
        await folderRow(page, 'Clic droit').locator('.folder-toggle').click({ button: 'right' });
        await expect(page.locator('#left_col .folder-actions-menu.show [data-action="rename-folder"]')).toBeVisible();
        await page.locator('#right_col').click({ position: { x: 300, y: 500 } });
        await expect(page.locator('#left_col .folder-actions-menu.show')).toHaveCount(0);
        await row(page, 'Note clic droit').click({ button: 'right' });
        await expect(page.locator('#left_col .note-actions-menu.show [data-action="rename-note"]')).toBeVisible();
    });

    test('a right-click on the empty column offers to hide it', covers('notes.column-context-menu', 'notes.sidebar-collapse'), async ({ page }) => {
        await goHome(page);
        const box = await page.locator('#left_col').boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height - 80, { button: 'right' });
        await page.locator('#columnSection [data-action="hide-left-column"]').click();
        await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
        await expect(page.locator('#left_col')).toBeHidden();
        await page.reload();
        await expect(page.locator('body'), 'the column stays hidden').toHaveClass(/sidebar-collapsed/);
    });

    test('clicking a folder folds and unfolds it, and that survives a reload', covers('notes.folder-collapse'), async ({ page }) => {
        await folderWithNote('Pliable', 'Note pliée');
        await goHome(page);
        await expect(isRowShown(page, 'Note pliée')).toBeVisible();
        await folderRow(page, 'Pliable').locator('.folder-name').click();
        await expect(isRowShown(page, 'Note pliée')).toHaveCount(0);
        await page.reload();
        await settled(page);
        await expect(isRowShown(page, 'Note pliée'), 'still folded').toHaveCount(0);
        await folderRow(page, 'Pliable').locator('.folder-name').click();
        await expect(isRowShown(page, 'Note pliée')).toBeVisible();
    });

    test('the chevron collapses and expands every folder', covers('notes.folders-collapse-all'), async ({ page }) => {
        await folderWithNote('Tout A', 'Dans tout A');
        await folderWithNote('Tout B', 'Dans tout B');
        await goHome(page);
        const chevron = page.locator('#sidebarExpandFoldersBtn');
        // (a click unfolds all as long as one is folded)
        await expandAll(page);
        await expect(isRowShown(page, 'Dans tout A')).toBeVisible();
        await chevron.click();
        await expect(isRowShown(page, 'Dans tout A')).toHaveCount(0);
        await expect(isRowShown(page, 'Dans tout B')).toHaveCount(0);
        await expect(chevron).toHaveAttribute('title', /Expand/);
        await chevron.click();
        await expect(isRowShown(page, 'Dans tout A')).toBeVisible();
        await expect(isRowShown(page, 'Dans tout B')).toBeVisible();
    });

    test('Rename folder renames inline and Escape cancels', covers('notes.folder-rename'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Avant renommage');
        await goHome(page);
        await folderMenu(page, 'Avant renommage', 'rename-folder');
        await page.locator('#left_col input.tree-inline-input').fill('Annulé');
        await page.keyboard.press('Escape');
        await expect(page.locator('#left_col input.tree-inline-input')).toHaveCount(0);
        expect((await ctx.api.get(`/folders/${folder.id}`)).json.folder.name).toBe('Avant renommage');
        await folderMenu(page, 'Avant renommage', 'rename-folder');
        await page.locator('#left_col input.tree-inline-input').fill('Après renommage é');
        await page.keyboard.press('Enter');
        await expect(page.locator('#left_col .folder-name', { hasText: 'Après renommage é' })).toBeVisible();
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).json.folder.name).toBe('Après renommage é');
    });

    test('Delete folder asks, then trashes its notes', covers('notes.folder-delete'), async ({ page }) => {
        const { folder, note } = await folderWithNote('À supprimer', 'Note du supprimé');
        await goHome(page);
        await folderMenu(page, 'À supprimer', 'delete-folder');
        await expect(page.locator('#deleteFolderModal')).toBeVisible();
        await page.locator('#deleteFolderModal .btn-cancel').click();
        expect((await ctx.api.get(`/folders/${folder.id}`)).status, 'Cancel keeps it').toBe(200);
        await folderMenu(page, 'À supprimer', 'delete-folder');
        await page.locator('#deleteFolderModal [data-action="execute-delete-folder"]').click();
        await expect(page.locator('#left_col .folder-name', { hasText: 'À supprimer' })).toHaveCount(0);
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).status).toBe(404);
        await expect.poll(() => trashHas(ctx.api, 'Note du supprimé')).toBe(true);
        expect((await ctx.api.get(`/notes/${note.id}`)).json?.note?.trash ?? 1).toBeTruthy();
    });

    test('Duplicate folder copies the folder and its notes', covers('notes.folder-duplicate'), async ({ page }) => {
        await folderWithNote('Original dossier', 'Note originale');
        await goHome(page);
        await folderMenu(page, 'Original dossier', 'duplicate-folder');
        await expect(page.locator('#left_col .folder-name', { hasText: /Original dossier.+/ })).toBeVisible();
        const copy = (await foldersOf(ctx.api)).find((folder) => folder.name.startsWith('Original dossier') && folder.name !== 'Original dossier');
        expect(copy, 'copy stored').toBeTruthy();
        expect((await ctx.api.ok(ctx.api.get(`/folders/${copy.id}/notes`))).json.count, 'its notes are copied').toBe(1);
        expect((await notesOf(ctx.api)).filter((note) => note.heading === 'Note originale' || note.heading.startsWith('Note originale')).length).toBe(2);
    });

    test('Move folder puts it under another folder', covers('notes.folder-move'), async ({ page }) => {
        const target = await newFolder(ctx.api, 'Cible de dossier');
        const moved = await newFolder(ctx.api, 'Dossier déplacé');
        await goHome(page);
        await folderMenu(page, 'Dossier déplacé', 'move-entire-folder');
        await expect(page.locator('#moveFolderModal')).toBeVisible();
        await page.selectOption('#moveFolderTargetSelect', { label: 'Cible de dossier' });
        await page.locator('#moveFolderModal [data-action="execute-move-folder-to-subfolder"]').click();
        await expect.poll(async () => (await ctx.api.get(`/folders/${moved.id}`)).json.folder.parent_id).toBe(target.id);
    });

    test('Move all files empties the folder into another one', covers('notes.folder-move-files'), async ({ page }) => {
        const { note } = await folderWithNote('Source fichiers', 'Note en transit');
        const target = await newFolder(ctx.api, 'Destination fichiers');
        await goHome(page);
        await folderMenu(page, 'Source fichiers', 'move-folder-files');
        await expect(page.locator('#moveFolderFilesModal')).toBeVisible();
        await expect(page.locator('#filesCountText')).toContainText('1');
        await page.selectOption('#moveFolderFilesTargetSelect', { label: 'Destination fichiers' });
        await page.locator('#moveFolderFilesModal [data-action="execute-move-all-files"]').click();
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBe(target.id);
    });

    test('Show only this folder hides the others, and the banner brings them back', covers('notes.folder-show-only'), async ({ page }) => {
        await folderWithNote('Seul visible', 'Note visible seule');
        await folderWithNote('Autre masqué', 'Note masquée');
        await goHome(page);
        await folderMenu(page, 'Seul visible', 'show-only-folder');
        await expect(page).toHaveURL(/folder=Seul(%20|\+)visible/);
        await expect(isRowShown(page, 'Note visible seule')).toBeVisible();
        await expect(isRowShown(page, 'Note masquée')).toHaveCount(0);
        await expect(page.locator('.folder-filter-banner')).toBeVisible();
    });

    test('Open all notes opens one tab per note', covers('notes.folder-open-all'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Tous en onglets');
        for (const heading of ['Onglet un', 'Onglet deux']) {
            const note = await ctx.api.createNote({ heading, content: '<p>x</p>' });
            await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        }
        await goHome(page);
        await folderMenu(page, 'Tous en onglets', 'open-all-notes-in-tabs');
        await expect(appTab(page, 'Onglet un')).toBeVisible();
        await expect(appTab(page, 'Onglet deux')).toBeVisible();
    });

    test('Archive folder moves it under Archive', covers('notes.folder-archive'), async ({ page }) => {
        const { folder } = await folderWithNote('À ranger', 'Rangée');
        await goHome(page);
        await folderMenu(page, 'À ranger', 'archive-folder');
        await confirmDialog(page);
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).json.folder.workspace).toBe('Archives');
        await expect(page.locator('#left_col .folder-name', { hasText: 'À ranger' })).toHaveCount(0);
    });

    test('Tag all notes tags every note of the folder', covers('notes.folder-tag-notes'), async ({ page }) => {
        const { note } = await folderWithNote('À taguer', 'Taguée en masse');
        await goHome(page);
        await folderMenu(page, 'À taguer', 'tag-folder-notes');
        await page.fill('#tagFolderNotesInput', 'massif');
        await page.locator('#tagFolderNotesModal [data-action="execute-tag-folder-notes"]').click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('massif');
    });

    test('Add to favorites on a folder shows it in Favorites', covers('notes.folder-favorite'), async ({ page }) => {
        await newFolder(ctx.api, 'Dossier favori');
        await goHome(page);
        await folderMenu(page, 'Dossier favori', 'favorite-folder');
        await expect(page.locator('#left_col a.favorite-folder-link', { hasText: 'Dossier favori' })).toBeAttached();
        await page.reload();
        await expect(page.locator('#left_col a.favorite-folder-link', { hasText: 'Dossier favori' }), 'after a reload').toBeAttached();
    });

    test('the folder icon and colour are picked, applied and reset', covers('notes.folder-icon', 'notes.folder-color'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Icône dossier');
        await goHome(page);
        const icon = folderRow(page, 'Icône dossier').locator('.folder-icon');
        await icon.click();
        const modal = page.locator('#folderIconModal');
        await expect(modal).toBeVisible();
        await page.fill('#folderIconSearchInput', 'star');
        const first = modal.locator('#folderIconGrid .folder-icon-item:visible', { has: page.locator('[class*="lucide-star"]') }).first();
        await first.click();
        await modal.locator('.folder-color-section button, .folder-color-section [data-color]').nth(2).click();
        await page.click('#applyFolderIconBtn');
        await expect(modal).toBeHidden();
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).json.folder.icon).toMatch(/star/);
        expect((await ctx.api.get(`/folders/${folder.id}`)).json.folder.icon_color, 'colour stored').toBeTruthy();
        await page.reload();
        await expect(folderRow(page, 'Icône dossier').locator('.folder-icon')).toHaveClass(/star/);
        await folderRow(page, 'Icône dossier').locator('.folder-icon').click();
        await page.click('#resetFolderIconBtn');
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).json.folder.icon ?? '').toBe('');
    });

    test('the note icon picker sets the icon on the row and in the note', covers('notes.note-icon'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Icône note', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('#left_col .note-list-item', { hasText: 'Icône note' }).locator('.note-icon').click();
        const modal = page.locator('#folderIconModal');
        await page.fill('#folderIconSearchInput', 'star');
        await modal.locator('#folderIconGrid .folder-icon-item:visible', { has: page.locator('[class*="lucide-star"]') }).first().click();
        await page.click('#applyFolderIconBtn');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).icon).toMatch(/star/);
        await page.reload();
        await expect(page.locator('#left_col .note-list-item', { hasText: 'Icône note' }).locator('.note-icon')).toHaveClass(/star/);
    });

    test('list_folders.php lists the folders, with their counts', covers('notes.folders-page'), async ({ page }) => {
        await folderWithNote('Page dossiers é', 'Note de la page');
        await page.goto('/list_folders.php');
        await settled(page);
        await expect(page.locator('body')).toContainText('Page dossiers é');
    });
});

test.describe('notes tree: moving things', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-move');

    test('Move in the toolbar menu moves the note, and creates the folder if asked', covers('notes.move-note', 'notes.move-create-folder'), async ({ page }) => {
        const target = await newFolder(ctx.api, 'Cible note');
        const note = await ctx.api.createNote({ heading: 'À déplacer', content: '<p>x</p>' });
        await openNote(page, note.id);
        let menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Move', exact: true }).click();
        await expect(page.locator('#moveNoteFolderModal')).toBeVisible();
        await page.selectOption('#moveNoteTargetSelect', { label: 'Cible note' });
        await page.click('#moveActionButton');
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBe(target.id);

        await openNote(page, note.id);
        menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Move', exact: true }).click();
        await page.locator('#moveNoteFolderModal [data-action="toggle-move-create-folder"]').first().click();
        await page.fill('#moveCreateFolderName', 'Créé en déplaçant');
        await page.locator('#moveNoteFolderModal [data-action="create-move-modal-folder"]').click();
        await page.click('#moveActionButton');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).folder).toBe('Créé en déplaçant');
    });

    test('dragging a note onto a folder moves it, and onto the root takes it out', covers('notes.dnd-note-folder', 'notes.dnd-root'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Glisser ici');
        const note = await ctx.api.createNote({ heading: 'Glissée', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Glissée').dragTo(folderRow(page, 'Glisser ici'));
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBe(folder.id);
        await settled(page);
        await expect(page.locator(`#folder-${folder.id} a.links_arbo_left`, { hasText: 'Glissée' })).toBeVisible();

        const box = await page.locator('#left_col').boundingBox();
        await row(page, 'Glissée').dragTo(page.locator('#left_col'), { targetPosition: { x: box.width / 2, y: box.height - 100 } });
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBeNull();
    });

    test('dragging a folder onto another nests it', covers('notes.dnd-folder'), async ({ page }) => {
        const parent = await newFolder(ctx.api, 'Parent glissé');
        const child = await newFolder(ctx.api, 'Enfant glissé');
        await goHome(page);
        await folderRow(page, 'Enfant glissé').locator('.folder-toggle').dragTo(folderRow(page, 'Parent glissé'));
        await expect.poll(async () => (await ctx.api.get(`/folders/${child.id}`)).json.folder.parent_id).toBe(parent.id);
    });

    test('Copy and Paste from the menus copy a note into a folder', covers('notes.clipboard-menu'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Coller ici');
        await ctx.api.createNote({ heading: 'Copiée menu', content: '<p>x</p>' });
        await goHome(page);
        await noteMenu(page, 'Copiée menu', 'copy-note');
        await folderMenu(page, 'Coller ici', 'paste-into-folder');
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/folders/${folder.id}/notes`))).json.count).toBe(1);
        expect((await notesOf(ctx.api)).filter((note) => note.heading.startsWith('Copiée menu')).length).toBe(2);
    });

    test('Cut and Paste from the menus move a note', covers('notes.clipboard-menu'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Couper ici');
        const note = await ctx.api.createNote({ heading: 'Coupée menu', content: '<p>x</p>' });
        await goHome(page);
        await noteMenu(page, 'Coupée menu', 'cut-note');
        await folderMenu(page, 'Couper ici', 'paste-into-folder');
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBe(folder.id);
    });

    test('Ctrl+C, Ctrl+V copy a clicked row, and Ctrl+Z takes it back', covers('notes.clipboard-keys', 'notes.tree-undo'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Clavier cible');
        await ctx.api.createNote({ heading: 'Copiée clavier', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Copiée clavier').click();
        await page.keyboard.press('Control+c');
        await folderRow(page, 'Clavier cible').locator('.folder-name').click();
        await page.keyboard.press('Control+v');
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/folders/${folder.id}/notes`))).json.count).toBe(1);
        // The paste reloads the page: a key pressed meanwhile is lost, and one
        // pressed twice finds an empty history, so pressing again is harmless
        const inFolder = async () => (await ctx.api.ok(ctx.api.get(`/folders/${folder.id}/notes`))).json.count;
        await expect.poll(async () => {
            if (await inFolder() === 1) await page.keyboard.press('Control+z');
            return inFolder();
        }, { timeout: 15_000 }).toBe(0);
        await expect.poll(async () => {
            if (await inFolder() === 0) await page.keyboard.press('Control+Shift+z');
            return inFolder();
        }, { timeout: 15_000 }).toBe(1);
    });

    test('Ctrl+X, Ctrl+V move a row, Ctrl+Z puts it back', covers('notes.clipboard-keys', 'notes.tree-undo'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Couper clavier');
        const note = await ctx.api.createNote({ heading: 'Coupée clavier', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Coupée clavier').click();
        await page.keyboard.press('Control+x');
        await folderRow(page, 'Couper clavier').locator('.folder-name').click();
        await page.keyboard.press('Control+v');
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBe(folder.id);
        await settled(page);
        await page.keyboard.press('Control+z');
        await expect.poll(() => folderOfNote(ctx.api, note.id)).toBeNull();
    });

    test('Del on a clicked row trashes it after a confirmation, Ctrl+Z restores it', covers('notes.tree-delete-key', 'notes.tree-undo'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Touche Suppr', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Touche Suppr').click();
        await page.keyboard.press('Delete');
        await confirmDialog(page);
        await expect.poll(() => trashHas(ctx.api, 'Touche Suppr')).toBe(true);
        await settled(page);
        await page.keyboard.press('Control+z');
        await expect.poll(() => trashHas(ctx.api, 'Touche Suppr')).toBe(false);
        expect((await ctx.api.getNote(note.id)).heading).toBe('Touche Suppr');
    });

    test('Ctrl+Click and Shift+Click select rows, and the group menu acts on them', covers('notes.tree-multiselect'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Sélection');
        const notes = [];
        for (const heading of ['Sel 1', 'Sel 2', 'Sel 3', 'Sel 4']) notes.push(await ctx.api.createNote({ heading, content: '<p>x</p>' }));
        for (const note of notes) await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        await ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: 'heading_asc' }));
        await goHome(page);
        await expandAll(page);
        await row(page, 'Sel 1').click({ modifiers: ['Control'] });
        await row(page, 'Sel 3').click({ modifiers: ['Shift'] });
        const selected = page.locator('#left_col .note-list-item.tree-multi-selected');
        await expect(selected).toHaveCount(3);
        await row(page, 'Sel 2').click({ modifiers: ['Control'] });
        await expect(selected, 'Ctrl+Click takes one out').toHaveCount(2);
        await row(page, 'Sel 1').click({ button: 'right' });
        const menu = page.locator('.tree-selection-menu:visible');
        await expect(menu.locator('.tree-selection-menu-count')).toContainText('2');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(selected, 'Esc clears the selection').toHaveCount(0);
        await ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: 'updated_desc' }));
    });

    test('Del on a multi-selection trashes the whole set', covers('notes.tree-multiselect'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Lot supprimé 1', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Lot supprimé 2', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Lot supprimé 1').click({ modifiers: ['Control'] });
        await row(page, 'Lot supprimé 2').click({ modifiers: ['Control'] });
        await page.keyboard.press('Delete');
        await confirmDialog(page);
        await expect.poll(() => trashHas(ctx.api, 'Lot supprimé 1')).toBe(true);
        expect(await trashHas(ctx.api, 'Lot supprimé 2')).toBe(true);
    });

    test('dragging a multi-selection moves all of it', covers('notes.dnd-multiselect'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Lot glissé');
        const a = await ctx.api.createNote({ heading: 'Lot A', content: '<p>x</p>' });
        const b = await ctx.api.createNote({ heading: 'Lot B', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Lot A').click({ modifiers: ['Control'] });
        await row(page, 'Lot B').click({ modifiers: ['Control'] });
        await row(page, 'Lot A').dragTo(folderRow(page, 'Lot glissé'));
        await expect.poll(() => folderOfNote(ctx.api, a.id)).toBe(folder.id);
        await expect.poll(() => folderOfNote(ctx.api, b.id)).toBe(folder.id);
    });

    test('the arrows walk the tree, Left and Right fold, Space opens, Enter renames', covers('notes.tree-keyboard'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'AAA Clavier');
        const inside = await ctx.api.createNote({ heading: 'Clavier dedans', content: '<p>Corps dedans</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${inside.id}/folder`, { folder_id: folder.id }));
        await ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: 'heading_asc' }));
        await goHome(page);
        await expandAll(page);
        await folderRow(page, 'AAA Clavier').locator('.folder-toggle').click({ modifiers: ['Control'] });
        const selected = page.locator('#left_col .tree-multi-selected');
        await expect(selected).toContainText('AAA Clavier');
        await page.keyboard.press('ArrowLeft');
        await expect(isRowShown(page, 'Clavier dedans'), 'Left closes the folder').toHaveCount(0);
        await page.keyboard.press('ArrowRight');
        await expect(isRowShown(page, 'Clavier dedans'), 'Right opens it').toBeVisible();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#left_col .note-list-item.tree-multi-selected')).toContainText('Clavier dedans');
        await page.keyboard.press('Space');
        await expect(titleInput(page)).toHaveValue('Clavier dedans');
        await page.locator('#left_col .note-list-item', { hasText: 'Clavier dedans' }).click();
        await page.keyboard.press('ArrowUp');
        await expect(page.locator('#left_col .folder-toggle.tree-multi-selected')).toContainText('AAA Clavier');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const input = page.locator('#left_col input.tree-inline-input');
        await expect(input).toHaveValue('Clavier dedans');
        await input.fill('Clavier renommée');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await ctx.api.getNote(inside.id)).heading).toBe('Clavier renommée');
        await ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: 'updated_desc' }));
    });
});

test.describe('notes tree: sorting and options', () => {
    const ctx = withAccount('nav-sort');
    const setSort = (mode) => ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: mode }));
    const sortEntry = async (page, title) => {
        await page.click('#sidebarTreeOptionsBtn');
        await page.locator(`#tree-options-menu [data-action="set-note-sort"][title="${title}"]`).click();
    };

    test('the options menu lists exactly its entries', covers('notes.tree-options-menu'), async ({ page }) => {
        await goHome(page);
        await page.click('#sidebarTreeOptionsBtn');
        const entries = await page.locator('#tree-options-menu [data-action]:visible').evaluateAll((items) => items.map((item) => item.innerText.trim()));
        expect(entries).toEqual(['Sort by name', 'Sort by date modified', 'Sort by date created', 'Sort by type', 'Custom order', 'Hide offline dots', 'Customize sidebar']);
        await page.keyboard.press('Escape');
        await expect(page.locator('#tree-options-menu')).not.toHaveClass(/show/);
    });

    test('each sort mode orders the notes of a folder and is stored', covers('notes.sort-modes'), async ({ page }) => {
        test.slow();
        // (dates are stored to the second)
        const tick = () => new Promise((resolve) => { setTimeout(resolve, 1100); });
        const folder = await newFolder(ctx.api, 'Trié');
        const a = await ctx.api.createNote({ heading: 'Abricot', content: '# x\n', type: 'markdown', folder_id: folder.id });
        await tick();
        await ctx.api.createNote({ heading: 'Banane', content: '<p>x</p>', folder_id: folder.id });
        await tick();
        await ctx.api.createNote({ heading: 'Cerise', content: '<p>x</p>', folder_id: folder.id });
        await tick();
        await ctx.api.ok(ctx.api.patch(`/notes/${a.id}`, { content: '# modifiée en dernier\n' }));
        const order = async () => (await page.locator(`#folder-${folder.id} a.links_arbo_left`).allInnerTexts()).map((text) => text.trim());
        await goHome(page);
        for (const [title, mode, expected] of [
            ['Notes by title and folders by name, from A to Z', 'heading_asc', ['Abricot', 'Banane', 'Cerise']],
            ['Most recently modified notes first', 'updated_desc', ['Abricot', 'Cerise', 'Banane']],
            ['Most recently created notes and folders first', 'created_desc', ['Cerise', 'Banane', 'Abricot']],
            ['Notes grouped by type (note, markdown, task list, drawing, link), then by title', 'type_asc', ['Banane', 'Cerise', 'Abricot']],
        ]) {
            await sortEntry(page, title);
            await expect.poll(() => setting(ctx.api, 'note_list_sort')).toBe(mode);
            await expect.poll(order, mode).toEqual(expected);
            await page.reload();
            await settled(page);
            await expect.poll(order, `${mode} after a reload`).toEqual(expected);
        }
    });

    test('sorting by type orders the notes without a folder like the others', covers('notes.sort-modes'), async ({ page }) => {
        test.fail(true, 'BUG: notes_list.php renders the root notes after the folders in SQL order (type COLLATE NOCASE), not with poznoteCompareNotes: Markdown comes before rich text there');
        await ctx.api.createNote({ heading: 'Racine Abricot', content: '# x\n', type: 'markdown' });
        await ctx.api.createNote({ heading: 'Racine Banane', content: '<p>x</p>' });
        await setSort('type_asc');
        await goHome(page);
        const order = (await treeOrder(page)).filter((title) => title.startsWith('Racine'));
        expect(order).toEqual(['Racine Banane', 'Racine Abricot']);
    });

    test('in custom order, dragging a note reorders it and the place sticks', covers('notes.sort-manual', 'notes.dnd-reorder'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Manuel');
        for (const heading of ['Man 1', 'Man 2', 'Man 3']) {
            const note = await ctx.api.createNote({ heading, content: '<p>x</p>' });
            await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        }
        await setSort('manual');
        await goHome(page);
        const order = async () => (await page.locator(`#folder-${folder.id} a.links_arbo_left .note-title`).allInnerTexts());
        const before = await order();
        const last = before[before.length - 1];
        await row(page, last).dragTo(page.locator('#left_col .note-list-item', { hasText: before[0] }).first(), { targetPosition: { x: 40, y: 2 } });
        const expected = [last, ...before.slice(0, -1)];
        await expect.poll(order).toEqual(expected);
        await page.reload();
        await settled(page);
        await expect.poll(order, 'after a reload').toEqual(expected);
        await setSort('updated_desc');
    });

    test('Customize sidebar opens the panel of what the tree shows', covers('notes.customize-sidebar'), async ({ page }) => {
        await goHome(page);
        await page.click('#sidebarTreeOptionsBtn');
        await page.locator('#tree-options-menu [data-action="toggle-ui-customization-panel"]').click();
        await expect(page.locator('.ui-customization-panel, #uiCustomizationPanel').first()).toBeVisible();
    });

    test('Hide offline dots is remembered', covers('notes.offline-dots'), async ({ page }) => {
        await goHome(page);
        await page.click('#sidebarTreeOptionsBtn');
        await page.locator('#tree-options-menu [data-action="toggle-offline-dots"]').click();
        await page.click('#sidebarTreeOptionsBtn');
        await expect(page.locator('#tree-options-menu [data-action="toggle-offline-dots"]')).toContainText('Show offline dots');
        await page.reload();
        await settled(page);
        await page.click('#sidebarTreeOptionsBtn');
        await expect(page.locator('#tree-options-menu [data-action="toggle-offline-dots"]')).toContainText('Show offline dots');
    });
});

test.describe('favorites', () => {
    const ctx = withAccount('nav-fav');
    const favoritesRows = (page) => page.locator('#left_col .folder-content[id*="avorite"] a.links_arbo_left .note-title, #left_col [data-folder="Favorites"] ~ .folder-content a.links_arbo_left .note-title');

    test('the star of the toolbar adds and removes a favorite, and the tree follows', covers('notes.favorite-toggle', 'notes.favorites-section'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Étoilée', content: '<p>x</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'toggle-favorite').click();
        await expect.poll(async () => Boolean((await ctx.api.getNote(note.id)).favorite)).toBe(true);
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'Étoilée' }), 'second row in Favorites').toHaveCount(2);
        await expect(toolbarBtn(page, 'toggle-favorite').locator('i')).toHaveClass(/favorite|star/);
        await toolbarBtn(page, 'toggle-favorite').click();
        await expect.poll(async () => Boolean((await ctx.api.getNote(note.id)).favorite)).toBe(false);
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'Étoilée' })).toHaveCount(1);
    });

    test('Add to favorites works from the tree menu', covers('notes.favorite-toggle'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Favori par menu', content: '<p>x</p>' });
        await goHome(page);
        await noteMenu(page, 'Favori par menu', 'toggle-favorite');
        await expect.poll(async () => Boolean((await ctx.api.getNote(note.id)).favorite)).toBe(true);
    });

    test('dragging a note onto Favorites makes it a favorite', covers('notes.dnd-favorites'), async ({ page }) => {
        const seed = await ctx.api.createNote({ heading: 'Graine favorite', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${seed.id}/favorite`));
        const note = await ctx.api.createNote({ heading: 'Glissée en favori', content: '<p>x</p>' });
        await goHome(page);
        await row(page, 'Glissée en favori').dragTo(page.locator('#left_col .folder-header.system-folder', { hasText: 'Favorites' }));
        await expect.poll(async () => Boolean((await ctx.api.getNote(note.id)).favorite)).toBe(true);
    });

    test('the favorites page lists, filters, opens and removes', covers('notes.favorites-page'), async ({ page }) => {
        const a = await ctx.api.createNote({ heading: 'Page favori abricot', content: '<p>x</p>' });
        const b = await ctx.api.createNote({ heading: 'Page favori banane', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${a.id}/favorite`));
        await ctx.api.ok(ctx.api.post(`/notes/${b.id}/favorite`));
        await page.goto('/favorites.php');
        const item = (title) => page.locator('.favorite-note-item', { hasText: title });
        await expect(item('Page favori abricot')).toBeVisible();
        await page.fill('#filterInput', 'banane');
        await expect(item('Page favori abricot')).toHaveCount(0);
        await expect(item('Page favori banane')).toBeVisible();
        await item('Page favori banane').locator('.btn-unfavorite').click();
        await expect(item('Page favori banane')).toHaveCount(0);
        await expect.poll(async () => Boolean((await ctx.api.getNote(b.id)).favorite)).toBe(false);
        await page.fill('#filterInput', '');
        await item('Page favori abricot').locator('.note-name').click();
        await expect(titleInput(page)).toHaveValue('Page favori abricot');
    });

    test('the Favorites menu sets the order and the star colour, then removes them all', covers('notes.favorites-menu'), async ({ page }) => {
        for (const heading of ['Menu fav Z', 'Menu fav A']) {
            const note = await ctx.api.createNote({ heading, content: '<p>x</p>' });
            await ctx.api.ok(ctx.api.post(`/notes/${note.id}/favorite`));
        }
        const open = async () => {
            await page.locator('#left_col .folder-header.system-folder', { hasText: 'Favorites' }).locator('.folder-toggle').click({ button: 'right' });
            await expect(page.locator('#favorites-actions-menu')).toHaveClass(/show/);
        };
        await goHome(page);
        await open();
        const modes = await page.locator('#favorites-actions-menu [data-favorites-action="sort"]:not(.favorites-sort-active)').evaluateAll((items) => items.map((item) => item.dataset.sortMode));
        expect(modes.length).toBeGreaterThan(0);
        const other = modes[0];
        await page.locator(`#favorites-actions-menu [data-sort-mode="${other}"]`).click();
        await expect.poll(() => setting(ctx.api, 'favorites_sort')).toBe(other);

        await open();
        await page.locator('#favorites-actions-menu [data-favorites-action="clear"]').click();
        await confirmDialog(page);
        await expect.poll(async () => (await notesOf(ctx.api)).filter((note) => note.favorite).length).toBe(0);
        await expect(page.locator('#left_col .folder-header.system-folder', { hasText: 'Favorites' })).toHaveCount(0);
    });
});

test.describe('tags', () => {
    const ctx = withAccount('nav-tags');
    const tagItem = (page, tag) => page.locator('.tag-item', { has: page.locator('.tag-name', { hasText: tag }) }).first();

    test('tags typed under the title are saved, and removed with their ×', covers('notes.tag-note'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Avec tags', content: '<p>x</p>' });
        await openNote(page, note.id);
        const input = page.locator('.note-tags-row .tag-input:visible').first();
        await input.click();
        await input.type('première');
        await page.keyboard.press('Enter');
        await page.locator('.note-tags-row .tag-input:visible').first().type('seconde');
        await page.keyboard.press('Enter');
        await expect(page.locator('.note-tags-row .clickable-tag')).toHaveCount(2);
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('première');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('seconde');
        await page.reload();
        await expect(page.locator('.note-tags-row .clickable-tag')).toHaveCount(2);
    });

    test('a click on a tag of the note lists the notes with that tag', covers('notes.tag-click'), async ({ page }) => {
        const a = await ctx.api.createNote({ heading: 'Tag cliqué 1', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${a.id}/tags`, { tags: ['cliqué'] }));
        await ctx.api.createNote({ heading: 'Sans le tag', content: '<p>x</p>' });
        await openNote(page, a.id);
        await page.locator('.note-tags-row .clickable-tag', { hasText: 'cliqué' }).click();
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'Sans le tag' })).toHaveCount(0);
        await expect(row(page, 'Tag cliqué 1')).toBeVisible();
    });

    test('a tag typed elsewhere is suggested', covers('notes.tag-autocomplete'), async ({ page }) => {
        const source = await ctx.api.createNote({ heading: 'Source tag', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${source.id}/tags`, { tags: ['suggérée'] }));
        const note = await ctx.api.createNote({ heading: 'Reçoit la suggestion', content: '<p>x</p>' });
        await openNote(page, note.id);
        const input = page.locator('.note-tags-row .tag-input:visible').first();
        await input.click();
        await input.type('sugg');
        const suggestion = page.locator('.tag-suggestion-item', { hasText: 'suggérée' });
        await expect(suggestion).toBeVisible();
        await suggestion.click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('suggérée');
    });

    test('the tags page lists with counts, filters by name, opens a tag', covers('notes.tags-page'), async ({ page }) => {
        for (const [heading, tags] of [['Tag un', ['fruit', 'rouge']], ['Tag deux', ['fruit']]]) {
            const note = await ctx.api.createNote({ heading, content: '<p>x</p>' });
            await ctx.api.ok(ctx.api.put(`/notes/${note.id}/tags`, { tags }));
        }
        await page.goto('/list_tags.php');
        await expect(tagItem(page, 'fruit')).toHaveAttribute('data-count', '2');
        await expect(tagItem(page, 'rouge')).toHaveAttribute('data-count', '1');
        await page.fill('#tagsSearchInput', 'rou');
        await expect(tagItem(page, 'rouge')).toBeVisible();
        await expect(tagItem(page, 'fruit')).toBeHidden();
        await page.fill('#tagsSearchInput', '');
        await tagItem(page, 'rouge').click();
        await expect(page).toHaveURL(/index\.php.*(tags_search|tag)/);
        await expect(row(page, 'Tag un')).toBeVisible();
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'Tag deux' })).toHaveCount(0);
    });

    test('the right-click menu of a tag renames it on every note', covers('notes.tag-rename'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Renommer tag', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${note.id}/tags`, { tags: ['ancien'] }));
        await page.goto('/list_tags.php');
        await tagItem(page, 'ancien').click({ button: 'right' });
        await page.locator('.tag-context-menu-item', { hasText: 'Rename' }).click();
        await page.locator('.alert-modal input:visible').first().fill('nouveau');
        await page.keyboard.press('Enter');
        await expect(tagItem(page, 'nouveau')).toBeVisible();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('nouveau');
    });

    test('the right-click menu of a tag deletes it from every note', covers('notes.tag-delete'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Supprimer tag', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${note.id}/tags`, { tags: ['àjeter', 'garde'] }));
        await page.goto('/list_tags.php');
        await tagItem(page, 'àjeter').click({ button: 'right' });
        await page.locator('.tag-context-menu-item.danger').click();
        await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
        await expect(page.locator('.tag-item[data-tag="àjeter"]')).toHaveCount(0);
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).not.toContain('àjeter');
        expect((await ctx.api.getNote(note.id)).tags).toContain('garde');
    });

    test('a tag colour is chosen, stored, shown, and the colour filter uses it', covers('notes.tag-color', 'notes.tag-color-filter'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Tag coloré', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${note.id}/tags`, { tags: ['coloré', 'neutre'] }));
        await page.goto('/list_tags.php');
        await tagItem(page, 'coloré').click({ button: 'right' });
        await page.locator('.tag-context-menu-item', { hasText: 'Color' }).click();
        await page.locator('.tag-color-swatch:not(.tag-color-custom)').nth(2).click();
        await page.locator('.alert-modal .alert-modal-button.primary').click();
        await expect(tagItem(page, 'coloré').locator('.tag-color-dot')).toBeVisible();
        await expect.poll(async () => JSON.stringify(await setting(ctx.api, 'tag_colors'))).toContain('color');
        await page.reload();
        await expect(tagItem(page, 'coloré').locator('.tag-color-dot')).toBeVisible();
        const filter = page.locator('#tagsColorFilter .tag-color-filter-swatch:not(.tag-color-filter-none)').first();
        await filter.click();
        await expect(tagItem(page, 'coloré')).toBeVisible();
        await expect(tagItem(page, 'neutre')).toBeHidden();
        await page.locator('#tagsColorFilterClear').click();
        await expect(tagItem(page, 'neutre')).toBeVisible();
        await page.locator('#tagsColorFilter .tag-color-filter-none').click();
        await expect(tagItem(page, 'coloré')).toBeHidden();
        await expect(tagItem(page, 'neutre')).toBeVisible();
    });
});

test.describe('search', () => {
    const ctx = withAccount('nav-search');
    const shown = (page, title) => page.locator('#left_col a.links_arbo_left', { hasText: title });
    const search = async (page, text) => {
        await page.fill('#unified-search', text);
        await page.keyboard.press('Enter');
    };
    test.beforeAll(async () => {
        const a = await ctx.api.createNote({ heading: 'Résultat gâteau', content: '<p>crème chantilly</p>' });
        await ctx.api.ok(ctx.api.put(`/notes/${a.id}/tags`, { tags: ['dessert'] }));
        await ctx.api.createNote({ heading: 'Autre plat', content: '<p>purée de carottes</p>' });
    });

    test('the info icon opens the search guide, and a running search puts a clear button in its place', covers('notes.search-help'), async ({ page }) => {
        await goHome(page);
        const help = page.locator('#search-help');
        await expect(help).toBeHidden();
        await page.locator('#search-help-toggle').click();
        await expect(help).toBeVisible();
        expect(await help.locator('dt').count(), 'Enter, Shift+Enter, words, phrase, partial, tags...').toBeGreaterThanOrEqual(6);
        await expect(help).toContainText('"weekly meeting"');
        await page.locator('#search-help-toggle').click();
        await expect(help).toBeHidden();
        await search(page, 'gateau');
        await expect(shown(page, 'Autre plat')).toHaveCount(0);
        await expect(page.locator('#search-help-toggle'), 'no guide while a search runs').toHaveCount(0);
        await page.locator('.searchbar-side-clear[data-action="clear-search"]').click();
        await expect(shown(page, 'Autre plat')).toBeVisible();
        await expect(page.locator('#unified-search')).toHaveValue('');
        await expect(page.locator('#search-help-toggle')).toBeVisible();
    });

    test('search filters by title and by content, ignoring accents, and Clear brings all back', covers('notes.search-unified', 'notes.search-clear'), async ({ page }) => {
        await goHome(page);
        await search(page, 'creme');
        await expect(shown(page, 'Résultat gâteau')).toBeVisible();
        await expect(shown(page, 'Autre plat')).toHaveCount(0);
        await search(page, 'autre');
        await expect(shown(page, 'Autre plat')).toBeVisible();
        await expect(shown(page, 'Résultat gâteau')).toHaveCount(0);
        await page.locator('.searchbar-side-clear[data-action="clear-search"]').click();
        await expect(page.locator('#unified-search')).toHaveValue('');
        await expect(shown(page, 'Résultat gâteau')).toBeVisible();
        await expect(shown(page, 'Autre plat')).toBeVisible();
    });

    test('several words must all match, and quotes keep a phrase together', covers('notes.search-operators'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Phrase exacte', content: '<p>tarte aux pommes du jardin</p>' });
        await ctx.api.createNote({ heading: 'Mots épars', content: '<p>pommes et tarte séparées</p>' });
        await goHome(page);
        await search(page, 'tarte pommes');
        await expect(shown(page, 'Phrase exacte')).toBeVisible();
        await expect(shown(page, 'Mots épars')).toBeVisible();
        await expect(shown(page, 'Autre plat')).toHaveCount(0);
        await search(page, 'tarte chantilly');
        await expect(shown(page, 'Phrase exacte'), 'every word is required').toHaveCount(0);
        await search(page, '"tarte aux pommes"');
        await expect(shown(page, 'Phrase exacte')).toBeVisible();
        await expect(shown(page, 'Mots épars'), 'the phrase is not in this one').toHaveCount(0);
    });

    test('the matching words are highlighted in the note found', covers('notes.search-highlight'), async ({ page }) => {
        await goHome(page);
        await search(page, 'chantilly');
        await shown(page, 'Résultat gâteau').click();
        await expect(page.locator('.noteentry .search-highlight, .noteentry mark.search-highlight').first()).toContainText('chantilly');
    });

    test('the scope buttons choose notes, tags or both, and never neither', covers('notes.search-scope'), async ({ page }) => {
        await goHome(page);
        const notesBtn = page.locator('#search-notes-btn');
        const tagsBtn = page.locator('#search-tags-btn');
        await expect(notesBtn).toHaveClass(/active/);
        await expect(tagsBtn).toHaveClass(/active/);
        await notesBtn.click();
        await expect(notesBtn).not.toHaveClass(/active/);
        await search(page, 'dessert');
        await expect(shown(page, 'Résultat gâteau'), 'found through its tag').toBeVisible();
        await expect(shown(page, 'Autre plat')).toHaveCount(0);
        await page.fill('#unified-search', '');
        await page.keyboard.press('Enter');
        await tagsBtn.click();
        await expect(notesBtn, 'without any scope, notes come back').toHaveClass(/active/);
        await expect(tagsBtn).not.toHaveClass(/active/);
        await search(page, 'dessert');
        await expect(shown(page, 'Résultat gâteau'), 'not in the notes text').toHaveCount(0);
    });

    test('the date filter keeps the notes created in the range', covers('notes.search-date'), async ({ page }) => {
        await goHome(page);
        await page.click('#search-date-toggle');
        await expect(page.locator('#created-from')).toBeVisible();
        await page.fill('#created-to', '2001-01-01');
        await page.locator('#unified-search').press('Enter');
        await expect(shown(page, 'Résultat gâteau')).toHaveCount(0);
        const today = new Date().toISOString().slice(0, 10);
        await page.fill('#created-from', today);
        await page.fill('#created-to', today);
        await page.locator('#unified-search').press('Enter');
        await expect(shown(page, 'Résultat gâteau')).toBeVisible();
    });

    test('Ctrl+K goes to the search box', covers('notes.shortcut-search'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Depuis la note', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.keyboard.press('Control+k');
        await expect(page.locator('#unified-search')).toBeFocused();
    });

    test('find and replace in a rich note: count, next, replace, replace all', covers('notes.search-replace', 'notes.shortcut-find'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Remplacer', content: '<p>chat chat chat chien</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'open-search-replace-modal').click();
        const bar = page.locator(`#searchReplaceBar${note.id}`);
        await expect(bar).toBeVisible();
        await page.fill(`#searchInput${note.id}`, 'chat');
        await expect(page.locator(`#searchCount${note.id}`)).toHaveText('3 results');
        await expect(editor(page).locator('.search-replace-highlight')).toHaveCount(3);
        const currentIndex = () => editor(page).locator('.search-replace-highlight').evaluateAll((items) => items.findIndex((item) => item.classList.contains('active') || item.classList.contains('current') || item.classList.contains('search-replace-current')));
        await page.click(`#searchNextBtn${note.id}`);
        const first = await currentIndex();
        expect(first).toBeGreaterThanOrEqual(0);
        await page.click(`#searchNextBtn${note.id}`);
        await expect.poll(currentIndex, 'Next moves on').toBe((first + 1) % 3);
        await page.click(`#searchPrevBtn${note.id}`);
        await expect.poll(currentIndex, 'Previous moves back').toBe(first);
        await page.click(`#searchToggleReplaceBtn${note.id}`);
        await page.fill(`#replaceInput${note.id}`, 'loup');
        await page.click(`#replaceBtn${note.id}`);
        await expect(editor(page)).toContainText('loup');
        await expect(page.locator(`#searchCount${note.id}`)).toHaveText('2 results');
        await page.click(`#replaceAllBtn${note.id}`);
        await expect(editor(page)).toContainText('loup loup loup chien');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content, { timeout: 15_000 }).toContain('loup loup loup chien');
        await page.click(`#searchCloseBtn${note.id}`);
        await expect(bar).toBeHidden();
        await editor(page).click();
        await page.keyboard.press('Control+Shift+f');
        await expect(bar, 'Ctrl+Shift+F opens it too').toBeVisible();
    });

    test('find and replace in a Markdown note, and Ctrl+F from its editor', covers('notes.search-replace-markdown'), async ({ page }) => {
        await ctx.api.ok(ctx.api.put('/settings/markdown_default_view_mode', { value: 'edit' }));
        const note = await ctx.api.createNote({ heading: 'Remplacer MD', content: 'pomme pomme poire\n', type: 'markdown' });
        await openNote(page, note.id);
        await page.locator('.markdown-editor .cm-content:visible').first().click();
        await page.keyboard.press('Control+f');
        await expect(page.locator(`#searchReplaceBar${note.id}`)).toBeVisible();
        await page.fill(`#searchInput${note.id}`, 'pomme');
        await expect(page.locator(`#searchCount${note.id}`)).toHaveText('2 results');
        await page.click(`#searchToggleReplaceBtn${note.id}`);
        await page.fill(`#replaceInput${note.id}`, 'prune');
        await page.click(`#replaceAllBtn${note.id}`);
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content, { timeout: 15_000 }).toContain('prune prune poire');
        await ctx.api.ok(ctx.api.put('/settings/markdown_default_view_mode', { value: 'preview' }));
    });
});

test.describe('note toolbar', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-bar');

    test('the toolbar of a rich note shows exactly its buttons, and its ⋮ menu its entries', covers('notes.toolbar'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Boutons', content: '<p>x</p>' });
        await openNote(page, note.id);
        const actions = await toolbar(page).locator('> button:visible, > * > button.toolbar-btn:visible').evaluateAll((items) => items.map((item) => item.dataset.action));
        expect(actions).toEqual(['save-note', 'toggle-favorite', 'open-share-modal', 'show-attachment-dialog', 'open-reminder-modal', 'open-search-replace-modal', 'show-snapshot', 'delete-note', 'toggle-mobile-toolbar-menu']);
        const menu = await toolbarMenu(page);
        const entries = (await menu.locator('.mobile-toolbar-item:visible').allInnerTexts()).map((text) => text.trim());
        expect(entries).toEqual(['Create shortcut', 'Duplicate', 'Move', 'Add to speed dial', 'Archive note', 'Download', 'Print', 'Convert to Markdown']);
    });

    test('the toolbar of a Markdown note and of a task list offer what fits them', covers('notes.toolbar'), async ({ page }) => {
        const md = await ctx.api.createNote({ heading: 'Boutons MD', content: '# x\n', type: 'markdown' });
        await openNote(page, md.id);
        let menu = await toolbarMenu(page);
        await expect(menu.getByRole('menuitem', { name: 'Convert to Rich text' }).or(menu.getByRole('menuitem', { name: /Convert to/ }))).toBeVisible();
        const list = await ctx.api.createNote({ heading: 'Boutons liste', type: 'tasklist', content: '[]' });
        await openNote(page, list.id);
        await expect(toolbarBtn(page, 'toggle-favorite')).toBeVisible();
        menu = await toolbarMenu(page);
        await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
    });

    test('a narrow window moves the buttons that no longer fit into the ⋮ menu, which still work', covers('notes.toolbar-overflow'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Étroit', content: '<p>x</p>' });
        await openNote(page, note.id);
        const overflowed = () => page.locator('.note-edit-toolbar .is-toolbar-overflowed').evaluateAll((items) => items.map((item) => item.dataset.action));
        expect(await overflowed(), 'all fit at full width').toEqual([]);
        await page.setViewportSize({ width: 810, height: 800 });
        await expect.poll(overflowed).toContain('delete-note');
        const menu = await toolbarMenu(page);
        await menu.locator('.toolbar-overflow-item', { hasText: 'Delete' }).click();
        await expect.poll(() => trashHas(ctx.api, 'Étroit')).toBe(true);
        await page.setViewportSize({ width: 1400, height: 900 });
        await expect.poll(overflowed, 'back in the row').toEqual([]);
    });

    test('Revisions opens the revisions page of the note', covers('notes.toolbar-revisions'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Versions', content: '<p>x</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'show-snapshot').click();
        await expect(page).toHaveURL(new RegExp(`revisions\\.php.*note(_id)?=${note.id}`));
    });

    test('Attachments opens the attachments page of the note', covers('notes.toolbar-attachments'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Pièces', content: '<p>x</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'show-attachment-dialog').click();
        await expect(page).toHaveURL(new RegExp(`attachments\\.php\\?note_id=${note.id}`));
    });

    test('Share opens the share window of this note', covers('notes.toolbar-share'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Partagée', content: '<p>x</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'open-share-modal').click();
        await expect(page.locator('.modal:visible, .public-modal:visible, .share-modal:visible').first()).toBeVisible();
    });

    test('the bell opens the reminder window of this note, Cancel closes it', covers('notes.toolbar-reminder'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Rappel', content: '<p>x</p>' });
        await openNote(page, note.id);
        await toolbarBtn(page, 'open-reminder-modal').click();
        await expect(page.locator('#reminderModal')).toBeVisible();
        await page.locator('#reminderModal .btn-cancel').click();
        await expect(page.locator('#reminderModal')).toBeHidden();
    });

    test('Download in the menu offers the formats and gives the file', covers('notes.toolbar-download'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Téléchargée', content: '<p>Corps exporté é</p>' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Download' }).click();
        await expect(page.locator('#exportModal')).toBeVisible();
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportModal .export-option-html').click()]);
        expect(fs.readFileSync(await download.path(), 'utf8')).toMatch(/Corps export(é|&eacute;) (é|&eacute;)/);
    });

    test('Print opens the note ready to print', covers('notes.toolbar-print'), async ({ context, page }) => {
        await context.addInitScript(() => { window.print = () => { window.__printed = true; }; });
        const note = await ctx.api.createNote({ heading: 'Imprimée', content: '<p>Corps imprimé</p>' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        const [popup] = await Promise.all([page.waitForEvent('popup'), menu.getByRole('menuitem', { name: 'Print' }).click()]);
        await expect(popup.locator('body')).toContainText('Corps imprimé');
        await expect.poll(() => popup.evaluate(() => window.__printed === true), 'print was called').toBe(true);
        await popup.close();
    });

    test('the "..." of the floating stack lists its entries and shows the shortcuts window', covers('notes.page-more-menu', 'notes.shortcuts-modal'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Plus', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.click('#pageMoreMenuBtn');
        const entries = (await page.locator('#pageMoreMenu .page-more-menu-item:visible').allInnerTexts()).map((text) => text.trim());
        expect(await page.locator('#pageMoreMenu .page-more-menu-item:visible').evaluateAll((items) => items.map((item) => item.id)), entries.join()).toEqual(['edgeMenuNoteWidth', 'edgeMenuShortcuts', 'edgeMenuNoteInfo']);
        await page.locator('#edgeMenuShortcuts').click();
        await expect(page.locator('#keyboardShortcutsModal')).toBeVisible();
        await expect(page.locator('#keyboardShortcutsModal')).toContainText('Ctrl');
    });

    test('the note width entry cycles, and stays on the note', covers('notes.note-width'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Largeur', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.click('#pageMoreMenuBtn');
        await page.locator('#edgeMenuNoteWidth').click();
        await expect.poll(async () => Number((await ctx.api.getNote(note.id)).content_width)).toBe(50);
    });

    test('the scroll buttons reach the top and the bottom of a long note', covers('notes.scroll-buttons'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Défilement', content: Array.from({ length: 120 }, (_, line) => `<p>L${line}</p>`).join('') });
        await openNote(page, note.id);
        const scroll = () => page.locator('#right_col').evaluate((col) => col.scrollTop);
        await page.locator('.note-scroll-bottom-btn:visible').click();
        await expect.poll(scroll).toBeGreaterThan(500);
        await page.locator('.note-scroll-top-btn:visible').click();
        await expect.poll(scroll).toBe(0);
    });

    test('the breadcrumb shows the folder and reveals it in the tree', covers('notes.breadcrumb'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Fil d\'Ariane');
        const note = await ctx.api.createNote({ heading: 'Dans le fil', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        await openNote(page, note.id);
        await folderRow(page, 'Fil d\'Ariane').locator('.folder-name').click();
        await expect(page.locator(`#folder-${folder.id}`)).toBeHidden();
        await page.locator(`[data-action="reveal-folder-in-tree"][data-folder-id="${folder.id}"]`).click();
        await expect(page.locator(`#folder-${folder.id}`)).toBeVisible();
    });
});

test.describe('shortcuts to notes and links between notes', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-link');
    const linkToNote = async (page) => {
        await page.keyboard.type('/');
        await page.keyboard.type('link', { delay: 20 });
        await page.locator('.slash-command-menu .slash-command-item', { hasText: 'Link to note' }).click();
    };

    test('Create shortcut puts a linked note in the chosen folder, which opens its target', covers('notes.linked-create', 'notes.linked-open'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Raccourcis');
        const target = await ctx.api.createNote({ heading: 'Cible raccourci', content: '<p>Corps de la cible</p>' });
        await openNote(page, target.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Create shortcut' }).click();
        await expect(page.locator('#linkedNoteFolderSelectorModal')).toBeVisible();
        await page.locator('#linkedFolderList .note-reference-item, #linkedFolderList > *', { hasText: 'Raccourcis' }).first().click();
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/folders/${folder.id}/notes`))).json.count).toBe(1);
        await goHome(page);
        const link = page.locator(`#folder-${folder.id} a.links_arbo_left`).first();
        await expect(link).toHaveAttribute('data-note-type', 'linked');
        await link.click();
        await expect(editor(page)).toContainText('Corps de la cible');
    });

    test('deleting a shortcut asks: only the shortcut, or the target too', covers('notes.linked-delete'), async ({ page }) => {
        const target = await ctx.api.createNote({ heading: 'Cible supprimée', content: '<p>x</p>' });
        const linked = await ctx.api.createNote({ heading: 'Raccourci à jeter', type: 'linked', linked_note_id: target.id, content: '' });
        await goHome(page);
        await page.locator(`#left_col a.links_arbo_left[data-note-db-id="${linked.id}"]`).click();
        await toolbarBtn(page, 'delete-note').click();
        await expect(page.locator('#deleteLinkedNoteModal')).toBeVisible();
        await page.click('#deleteLinkedNoteOnlyBtn');
        await expect(page.locator(`#left_col a.links_arbo_left[data-note-db-id="${linked.id}"]`)).toHaveCount(0);
        expect((await ctx.api.getNote(target.id)).heading, 'the target stays').toBe('Cible supprimée');
        expect(await trashHas(ctx.api, 'Cible supprimée')).toBe(false);
    });

    test('Link to note inserts a link that opens the note, and the target shows the backlink', covers('notes.note-reference', 'notes.note-link-open', 'notes.backlinks'), async ({ page }) => {
        const target = await ctx.api.createNote({ heading: 'Cible du lien', content: '<p>Corps cible</p>' });
        const source = await ctx.api.createNote({ heading: 'Source du lien', content: '<p>Début</p>' });
        await openNote(page, source.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await linkToNote(page);
        await expect(page.locator('#noteReferenceModal')).toBeVisible();
        await page.fill('#noteReferenceSearch', 'Cible du');
        await page.locator('#noteReferenceList .note-reference-item', { hasText: 'Cible du lien' }).click();
        const link = editor(page).locator('a', { hasText: 'Cible du lien' });
        await expect(link).toBeVisible();
        await page.keyboard.press('Control+s');
        await expect.poll(async () => (await ctx.api.getNote(source.id)).content).toContain('Cible du lien');
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/notes/${target.id}/backlinks`))).text).toContain('Source du lien');
        await link.click();
        await expect(titleInput(page)).toHaveValue('Cible du lien');
        await expect(page.locator('.backlinks-links-list a.backlink-link', { hasText: 'Source du lien' })).toBeVisible();
        await page.locator('.backlinks-links-list a.backlink-link', { hasText: 'Source du lien' }).click();
        await expect(titleInput(page)).toHaveValue('Source du lien');
    });

    test('a [[wiki link]] in a Markdown note opens its note, and counts as a backlink', covers('notes.wiki-link', 'notes.backlinks'), async ({ page }) => {
        const target = await ctx.api.createNote({ heading: 'Page wiki', content: '<p>Corps wiki</p>' });
        const source = await ctx.api.createNote({ heading: 'Source wiki', content: 'Voir [[Page wiki]] ici\n', type: 'markdown' });
        expect((await ctx.api.ok(ctx.api.get(`/notes/${target.id}/backlinks`))).text).toContain('Source wiki');
        await openNote(page, source.id);
        await page.locator('.markdown-preview:visible').getByText('Page wiki').click();
        await expect(titleInput(page)).toHaveValue('Page wiki');
    });

    test('a link to a note of another workspace is offered and opens it there', covers('notes.cross-workspace-link'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Zone lointaine' }));
        const target = await ctx.api.createNote({ heading: 'Note lointaine', content: '<p>loin</p>', workspace: 'Zone lointaine' });
        const source = await ctx.api.createNote({ heading: 'Source proche', content: '<p>Début</p>', workspace: 'Poznote' });
        await openNote(page, source.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await linkToNote(page);
        await page.locator('#noteReferenceAllWorkspaces').check();
        await page.fill('#noteReferenceSearch', 'lointaine');
        await page.locator('#noteReferenceList .note-reference-item', { hasText: 'Note lointaine' }).click();
        const link = editor(page).locator('a', { hasText: 'Note lointaine' });
        await expect(link).toBeVisible();
        await page.keyboard.press('Control+s');
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/notes/${target.id}/backlinks`))).text).toContain('Source proche');
        await link.click();
        await expect(titleInput(page)).toHaveValue('Note lointaine');
        await expect(page.locator('#left_col .sidebar-title')).toContainText('Zone lointaine');
    });
});

test.describe('workspaces', () => {
    const ctx = withAccount('nav-ws');
    const wsRow = (page, name) => page.locator('.ws-row', { has: page.locator('.workspace-name-item', { hasText: new RegExp(`^${name}$`) }) });
    const wsNames = async (api) => (await api.ok(api.get('/workspaces'))).json.workspaces.map((workspace) => workspace.name);
    const wsAction = async (page, name, selector) => {
        await wsRow(page, name).locator('.ws-actions-toggle').click();
        await wsRow(page, name).locator(selector).click();
    };

    test('New workspace in the menu creates it and switches to it', covers('notes.workspace-create', 'notes.workspace-menu'), async ({ page }) => {
        await goHome(page);
        await page.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await page.locator('.workspace-menu-item[data-action="new-workspace"]').click();
        await page.fill('#createWorkspaceInput', 'Nouvel espace é');
        await page.click('#confirmCreateWorkspaceBtn');
        await expect.poll(() => wsNames(ctx.api)).toContain('Nouvel espace é');
        await expect(page.locator('.sidebar-title').first()).toContainText('Nouvel espace é');
    });

    test('the menu switches workspace: another tree, kept as the last opened', covers('notes.workspace-switch', 'notes.workspace-tabs'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Espace A' }));
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Espace B' }));
        const a = await ctx.api.createNote({ heading: 'Note espace A', content: '<p>a</p>', workspace: 'Espace A' });
        await ctx.api.createNote({ heading: 'Note espace B', content: '<p>b</p>', workspace: 'Espace B' });
        await page.goto('/index.php?workspace=Espace%20A');
        await settled(page);
        await expect(row(page, 'Note espace A')).toBeVisible();
        await row(page, 'Note espace A').click();
        await expect(appTab(page, 'Note espace A')).toBeVisible();
        await page.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await page.locator('.workspace-menu-item[data-workspace-name="Espace B"]').click();
        await expect(row(page, 'Note espace B')).toBeVisible();
        await expect(page.locator('#left_col a.links_arbo_left', { hasText: 'Note espace A' })).toHaveCount(0);
        await expect(appTab(page, 'Note espace A'), 'each workspace has its own tabs').toHaveCount(0);
        await expect.poll(() => setting(ctx.api, 'last_opened_workspace')).toBe('Espace B');
        await page.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await page.locator('.workspace-menu-item[data-workspace-name="Espace A"]').click();
        await expect(appTab(page, 'Note espace A'), 'its tabs come back').toBeVisible();
        expect(a.id).toBeTruthy();
    });

    test('the workspace page renames, keeping the notes', covers('notes.workspace-rename', 'notes.workspaces-page'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'À renommer' }));
        const note = await ctx.api.createNote({ heading: 'Suit le nom', content: '<p>x</p>', workspace: 'À renommer' });
        await page.goto('/workspaces.php');
        await wsAction(page, 'À renommer', '.workspace-rename-action');
        await page.fill('#renameNewName', 'Renommé bien');
        await page.click('#confirmRenameBtn');
        await expect.poll(() => wsNames(ctx.api)).toContain('Renommé bien');
        expect(await wsNames(ctx.api)).not.toContain('À renommer');
        expect((await ctx.api.getNote(note.id)).workspace).toBe('Renommé bien');
    });

    test('the workspace page deletes only after the name is typed', covers('notes.workspace-delete'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'À détruire' }));
        const note = await ctx.api.createNote({ heading: 'Part avec', content: '<p>x</p>', workspace: 'À détruire' });
        await page.goto('/workspaces.php');
        await wsAction(page, 'À détruire', '.btn-delete');
        await expect(page.locator('#confirmDeleteBtn')).toBeDisabled();
        await page.fill('#confirmDeleteInput', 'À détruire');
        await expect(page.locator('#confirmDeleteBtn')).toBeEnabled();
        await page.click('#confirmDeleteBtn');
        await expect.poll(() => wsNames(ctx.api)).not.toContain('À détruire');
        expect((await ctx.api.get(`/notes/${note.id}`)).status).toBe(404);
    });

    test('the workspace page filters, and the order follows the handles', covers('notes.workspace-order', 'notes.workspace-filter'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Ordre 1' }));
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Ordre 2' }));
        await page.goto('/workspaces.php');
        await page.fill('#workspace-filter-input', 'Ordre');
        await expect(page.locator('.ws-row:visible')).toHaveCount(2);
        await page.fill('#workspace-filter-input', '');
        const before = await wsNames(ctx.api);
        const first = before[0];
        await wsRow(page, first).locator('.ws-drag-handle').focus();
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => (await wsNames(ctx.api)).indexOf(first), 'stored').toBe(1);
        await page.reload();
        await expect(page.locator('.ws-row .workspace-name-item').nth(1)).toHaveText(first);
    });

    test('a workspace colour and its tags are stored', covers('notes.workspace-color', 'notes.workspace-tags'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Décoré' }));
        const workspace = async () => (await ctx.api.ok(ctx.api.get('/workspaces'))).json.workspaces.find((item) => item.name === 'Décoré');
        await page.goto('/workspaces.php');
        await wsAction(page, 'Décoré', '.workspace-color-action');
        await expect(page.locator('#workspaceColorModal')).toBeVisible();
        await page.locator('#workspaceColorGrid .ws-color-option[data-color]:not([data-color=""])').nth(1).click();
        await page.click('#confirmWorkspaceColorBtn');
        await expect.poll(async () => (await workspace()).color ?? '').not.toBe('');
        await page.reload();
        await expect(wsRow(page, 'Décoré').locator('.ws-color-dot')).toBeVisible();
        await wsAction(page, 'Décoré', '.workspace-tags-action');
        await page.fill('#workspaceTagsInput', 'étiquette');
        await page.keyboard.press('Enter');
        await expect(page.locator('#workspaceTagsList')).toContainText('étiquette');
        await page.locator('#workspaceTagsModal .btn-primary').click();
        await expect.poll(async () => JSON.stringify((await workspace()).tags ?? '')).toContain('étiquette');
    });

    test('a note moves to another workspace from the move window', covers('notes.move-workspace'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Destination espace' }));
        const note = await ctx.api.createNote({ heading: 'Change d\'espace', content: '<p>x</p>', workspace: 'Poznote' });
        await openNote(page, note.id);
        const menu = await toolbarMenu(page);
        await menu.getByRole('menuitem', { name: 'Move', exact: true }).click();
        await page.selectOption('#workspaceSelect', 'Destination espace');
        await page.click('#moveActionButton');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).workspace).toBe('Destination espace');
    });

    test('the title of a secondary page switches workspace', covers('notes.page-title-menu'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Titre B' }));
        await ctx.api.createNote({ heading: 'Vue via titre', content: '<p>x</p>', workspace: 'Titre B' });
        await page.goto('/notes_manager.php?workspace=Poznote');
        await settled(page);
        await page.click('#poznotePageTitleWorkspaceBtn');
        await page.locator('#poznotePageTitleWorkspaceMenu .poznote-page-title-workspace-item', { hasText: 'Titre B' }).click();
        await expect(page).toHaveURL(/workspace=Titre/);
        await expect(page.locator('.nm-note-row', { hasText: 'Vue via titre' })).toBeVisible();
    });

    test('the home page opens the note last opened, not the last changed', covers('notes.landing-note'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Accueil' }));
        const opened = await ctx.api.createNote({ heading: 'Dernière ouverte', content: '<p>x</p>', workspace: 'Accueil' });
        const changed = await ctx.api.createNote({ heading: 'Dernière modifiée', content: '<p>x</p>', workspace: 'Accueil' });
        await page.goto(`/index.php?workspace=Accueil&note=${opened.id}`);
        await settled(page);
        await ctx.api.ok(ctx.api.patch(`/notes/${changed.id}`, { content: '<p>changée</p>' }));
        // Without stored tabs, as a new browser or a phone
        await page.evaluate(() => localStorage.clear());
        await page.goto('/index.php?workspace=Accueil');
        await settled(page);
        await expect(titleInput(page)).toHaveValue('Dernière ouverte');
    });
});

test.describe('concurrent editing', () => {
    // Saves refused on purpose below, and what a 409 or a 423 logs in the browser
    test.use({ allowedErrors: [/ERR_FAILED|status of 409|status of 423|lock\/release|status of 404/] });
    const ctx = withAccount('nav-sync');

    test('a change made elsewhere appears in the open note and in the tree', covers('notes.live-refresh'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'En direct', content: '<p>avant</p>' });
        await openNote(page, note.id);
        await ctx.api.ok(ctx.api.patch(`/notes/${note.id}`, { content: '<p>après dehors</p>' }));
        await ctx.api.createNote({ heading: 'Apparue dehors', content: '<p>x</p>' });
        await expect(editor(page)).toContainText('après dehors', { timeout: 20_000 });
        await expect(row(page, 'Apparue dehors')).toBeVisible({ timeout: 20_000 });
    });

    test('with unsaved edits, a banner offers to reload or to keep this version', covers('notes.live-refresh-conflict'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Conflit', content: '<p>commun</p>' });
        await page.route(`**/api/v1/notes/${note.id}`, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' mon texte');
        await ctx.api.ok(ctx.api.patch(`/notes/${note.id}`, { content: '<p>autre version</p>' }));
        await page.unroute(`**/api/v1/notes/${note.id}`);
        const banner = page.locator('.note-external-change-banner:visible');
        await expect(banner).toBeVisible({ timeout: 25_000 });
        await banner.getByRole('button', { name: 'Reload' }).click();
        await confirmDialog(page);
        await expect(editor(page)).toContainText('autre version');
    });

    test('text that could not be saved comes back as a draft to recover', covers('notes.draft-recovery'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Brouillon', content: '<p>base</p>' });
        // The saves fail, the edit lock still works
        await page.route(`**/api/v1/notes/${note.id}**`, (route) => (route.request().method() === 'PATCH' || route.request().url().includes('/beacon') ? route.abort() : route.continue()));
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' jamais parti');
        await expect.poll(() => page.evaluate((id) => Object.keys(localStorage).some((key) => key.startsWith('poznote_draft_') && key.endsWith(String(id)) && localStorage.getItem(key).includes('jamais parti')), note.id)).toBe(true);
        await ctx.api.ok(ctx.api.patch(`/notes/${note.id}`, { content: '<p>changée ailleurs</p>' }));
        await page.unrouteAll();
        await page.reload();
        const banner = page.locator('.note-external-change-banner.is-draft-recovery');
        await expect(banner).toBeVisible();
        await banner.getByRole('button', { name: 'Keep my unsaved changes' }).click();
        await expect.poll(async () => (await ctx.api.getNote(note.id)).content).toContain('jamais parti');
    });

    test('another person editing the note makes it read-only here', covers('notes.edit-lock'), async ({ page, browser, playwright }) => {
        const guest = await newAccount(playwright, 'nav-guest');
        const note = await ctx.api.createNote({ heading: 'Verrouillée', content: '<p>x</p>', workspace: 'Poznote' });
        await shareWorkspace(browser, ctx.account, guest.id);
        await login(page, ctx.account);
        await openNote(page, note.id);
        await editor(page).click();

        const guestContext = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'block' });
        const guestPage = await guestContext.newPage();
        await login(guestPage, guest);
        await guestPage.goto('/index.php');
        await guestPage.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await guestPage.locator('.workspace-menu-shared', { hasText: ctx.account.username }).click();
        await expect(guestPage.locator('#left_col a.links_arbo_left', { hasText: 'Verrouillée' }).first()).toBeVisible();
        await guestPage.goto(`/index.php?note=${note.id}`);
        const banner = guestPage.locator('.note-edit-lock-banner');
        await expect(banner).toBeVisible({ timeout: 20_000 });
        await expect(banner).toContainText(ctx.account.username);
        await expect(guestPage.locator(`#entry${note.id}`)).toHaveAttribute('contenteditable', 'false');
        await guestContext.close();
    });
});

test.describe('layout', () => {
    const ctx = withAccount('nav-layout');

    test('the column is resized by its handle, and keeps its width after a reload', covers('notes.sidebar-resize'), async ({ page }) => {
        await goHome(page);
        const handle = await page.locator('#resizeHandle').boundingBox();
        const before = (await page.locator('#left_col').boundingBox()).width;
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 300);
        await page.mouse.down();
        await page.mouse.move(handle.x + 120, handle.y + 300, { steps: 6 });
        await page.mouse.up();
        const after = (await page.locator('#left_col').boundingBox()).width;
        expect(after).toBeGreaterThan(before + 80);
        await page.reload();
        await expect.poll(async () => (await page.locator('#left_col').boundingBox()).width).toBeCloseTo(after, -1);
    });

    test('the chevron hides the column and brings it back', covers('notes.sidebar-collapse'), async ({ page }) => {
        await goHome(page);
        await page.click('#toggleSidebarBtn');
        await expect(page.locator('#left_col')).toBeHidden();
        await page.reload();
        await expect(page.locator('#left_col')).toBeHidden();
        await page.click('#toggleSidebarBtn');
        await expect(page.locator('#left_col')).toBeVisible();
    });

    test('F11 and the floating button toggle focus mode, which follows from page to page', covers('notes.focus-mode'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Concentrée', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.keyboard.press('F11');
        await expect(page.locator('html')).toHaveClass(/focus-mode/);
        await expect(page.locator('#icon_sidebar')).toBeHidden();
        await expect(page.locator('#left_col')).toBeHidden();
        await page.goto('/tasks.php');
        await expect(page.locator('html'), 'it follows').toHaveClass(/focus-mode/);
        await openNote(page, note.id);
        await page.locator('#edgeFocusModeBtn').click();
        await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
        await expect(page.locator('#icon_sidebar')).toBeVisible();
        await expect(page.locator('#left_col')).toBeVisible();
    });

    test('in focus mode the left edge slides the column back', covers('notes.focus-peek'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Survol', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.keyboard.press('F11');
        await expect(page.locator('html')).toHaveClass(/focus-mode/);
        await page.mouse.move(600, 400);
        await page.mouse.move(0, 400);
        await expect(page.locator('html')).toHaveClass(/focus-mode-peek/);
        await page.keyboard.press('F11');
    });

    test('the icon rail lists exactly its entries, each going to its page', covers('notes.icon-rail'), async ({ page }) => {
        test.slow();
        await goHome(page);
        const ids = await page.locator('#icon_sidebar a:visible, #icon_sidebar button:visible').evaluateAll((items) => items.map((item) => item.id));
        expect(ids).toEqual(['iconSidebarHomeBtn', 'iconSidebarDashboardBtn', 'iconSidebarGraphBtn', 'iconSidebarSpeedDialBtn', 'iconSidebarNotesBtn', 'iconSidebarTasksBtn', 'iconSidebarFoldersBtn', 'iconSidebarDiaryBtn', 'iconSidebarTagsBtn', 'iconSidebarSharesBtn', 'iconSidebarOfflineBtn', 'iconSidebarAttachmentsBtn', 'iconSidebarTrashBtn', 'iconSidebarThemeToggleBtn', 'iconSidebarSettingsBtn', 'iconSidebarAboutBtn', 'iconSidebarLogoutBtn']);
        for (const [id, url] of [
            ['iconSidebarDashboardBtn', /dashboard\.php/], ['iconSidebarGraphBtn', /graph\.php/], ['iconSidebarSpeedDialBtn', /speed_dial\.php/], ['iconSidebarNotesBtn', /notes_manager\.php/],
            ['iconSidebarTasksBtn', /tasks\.php/], ['iconSidebarFoldersBtn', /list_folders\.php/], ['iconSidebarDiaryBtn', /diary\.php/],
            ['iconSidebarTagsBtn', /list_tags\.php/], ['iconSidebarSharesBtn', /shared\.php/], ['iconSidebarOfflineBtn', /offline/],
            ['iconSidebarAttachmentsBtn', /attachments_list\.php/], ['iconSidebarTrashBtn', /trash\.php/], ['iconSidebarSettingsBtn', /settings\.php/],
            ['iconSidebarHomeBtn', /index\.php/],
        ]) {
            await page.goto('/favorites.php');
            await page.locator(`#${id}`).click();
            await expect(page, id).toHaveURL(url);
        }
    });

    test('the rail is hidden by its toggle, and stays so', covers('notes.icon-rail-collapse'), async ({ page }) => {
        await goHome(page);
        await page.click('#iconSidebarToggle');
        await expect(page.locator('body')).toHaveClass(/icon-sidebar-collapsed/);
        await page.reload();
        await expect(page.locator('body')).toHaveClass(/icon-sidebar-collapsed/);
        await page.click('#iconSidebarToggle');
        await expect(page.locator('#icon_sidebar')).toBeVisible();
    });

    test('on a short window the rail gathers what no longer fits behind one button', covers('notes.icon-rail-overflow'), async ({ page }) => {
        await goHome(page);
        await page.setViewportSize({ width: 1400, height: 380 });
        const button = page.locator('#iconSidebarOverflowBtn');
        await expect(button).toBeVisible();
        await button.click();
        const menu = page.locator('#iconSidebarOverflowMenu');
        await expect(menu.locator('a, button').first()).toBeVisible();
        expect(await menu.locator('a, button').count()).toBeGreaterThan(1);
    });
});

test.describe('global keyboard shortcuts', () => {
    const ctx = withAccount('nav-keys');

    test('Alt+Up and Alt+Down go through the notes of the folder', covers('notes.shortcut-sibling'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Voisines');
        for (const heading of ['Voisine 1', 'Voisine 2', 'Voisine 3']) {
            const note = await ctx.api.createNote({ heading, content: '<p>x</p>' });
            await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        }
        await ctx.api.ok(ctx.api.put('/settings/note_list_sort', { value: 'heading_asc' }));
        await goHome(page);
        await row(page, 'Voisine 1').click();
        await expect(titleInput(page)).toHaveValue('Voisine 1');
        await page.keyboard.press('Alt+ArrowDown');
        await expect(titleInput(page)).toHaveValue('Voisine 2');
        await page.keyboard.press('Alt+ArrowUp');
        await expect(titleInput(page)).toHaveValue('Voisine 1');
        await page.keyboard.press('Alt+ArrowUp');
        await expect(titleInput(page), 'it wraps around').toHaveValue('Voisine 3');
    });

    test('Ctrl+Down and Ctrl+Up scroll the note, not the caret', covers('notes.shortcut-scroll'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Roule', content: Array.from({ length: 120 }, (_, line) => `<p>L${line}</p>`).join('') });
        await openNote(page, note.id);
        await editor(page).locator('p').first().click();
        const scroll = () => page.locator('#right_col').evaluate((col) => col.scrollTop);
        const start = await scroll();
        await page.keyboard.press('Control+ArrowDown');
        await expect.poll(scroll).toBe(start + 40);
        await page.keyboard.press('Control+ArrowUp');
        await expect.poll(scroll).toBe(start);
    });

    test('Ctrl+E switches a Markdown note between source and preview', covers('notes.shortcut-markdown-view'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Vue clavier', content: '# Titre\n', type: 'markdown' });
        await openNote(page, note.id);
        const preview = page.locator('.markdown-preview').first();
        const source = page.locator('.markdown-editor').first();
        await expect(preview).toBeVisible();
        await page.keyboard.press('Control+e');
        await expect(source).toBeVisible();
        await expect(preview).toBeHidden();
        await page.keyboard.press('Control+e');
        await expect(preview).toBeVisible();
    });

    test('Ctrl+Alt+S takes a snapshot of the note', covers('notes.shortcut-snapshot'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Instantané', content: '<p>x</p>' });
        await openNote(page, note.id);
        await editor(page).click();
        await page.keyboard.press('Control+Alt+s');
        await expect.poll(async () => (await ctx.api.ok(ctx.api.get(`/notes/${note.id}/snapshots`))).json.snapshots?.length ?? 0).toBeGreaterThan(0);
    });
});

test.describe('notes manager, folders page, dashboard', () => {
    test.use({ allowedErrors: [LOCK_RELEASE_404] });
    const ctx = withAccount('nav-pages');
    const nmRow = (page, title) => page.locator('.nm-note-row', { hasText: title });
    const check = (page, title) => nmRow(page, title).locator('.nm-note-checkbox').check();
    const bulk = async (page, value) => { await page.selectOption('#nmBulkActionSelect', value); };

    test('the notes manager filters by text and by type', covers('notes.manager-filter'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Gestion riche', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Gestion markdown', content: '# x\n', type: 'markdown' });
        await page.goto('/notes_manager.php');
        await expect(nmRow(page, 'Gestion riche')).toBeVisible();
        await page.fill('#nmFilterInput', 'riche');
        await expect(nmRow(page, 'Gestion markdown')).toHaveCount(0);
        await expect(nmRow(page, 'Gestion riche')).toBeVisible();
        await page.click('#nmClearFilter');
        await expect(nmRow(page, 'Gestion markdown')).toBeVisible();
        await page.selectOption('#nmTypeFilter', 'markdown');
        await expect(nmRow(page, 'Gestion riche')).toHaveCount(0);
        await expect(nmRow(page, 'Gestion markdown')).toBeVisible();
    });

    test('the notes manager folds its groups, selects, and moves in bulk', covers('notes.manager-bulk-move', 'notes.manager-collapse'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Cible gestion');
        const a = await ctx.api.createNote({ heading: 'Lot gestion A', content: '<p>x</p>' });
        const b = await ctx.api.createNote({ heading: 'Lot gestion B', content: '<p>x</p>' });
        await page.goto('/notes_manager.php');
        await check(page, 'Lot gestion A');
        await check(page, 'Lot gestion B');
        await expect(page.locator('#nmSelectedCount')).toContainText('2');
        await bulk(page, 'move');
        await expect(page.locator('#nmMoveModal')).toBeVisible();
        await page.locator('#nmFolderList .nm-folder-option', { hasText: 'Cible gestion' }).click();
        await page.click('#nmConfirmMove');
        await expect.poll(() => folderOfNote(ctx.api, a.id)).toBe(folder.id);
        expect(await folderOfNote(ctx.api, b.id)).toBe(folder.id);
        await page.click('#nmToggleAllBtn');
        await expect(nmRow(page, 'Lot gestion A')).toBeHidden();
        await page.click('#nmToggleAllBtn');
        await expect(nmRow(page, 'Lot gestion A')).toBeVisible();
    });

    test('the notes manager tags, favorites and trashes in bulk', covers('notes.manager-bulk-tags', 'notes.manager-bulk-favorite', 'notes.manager-bulk-trash'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Action gestion', content: '<p>x</p>' });
        await page.goto('/notes_manager.php');
        await check(page, 'Action gestion');
        await bulk(page, 'add-tag');
        await page.fill('#nmTagInput', 'gestionné');
        await page.click('#nmConfirmTag');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).tags).toContain('gestionné');
        await page.reload();
        await check(page, 'Action gestion');
        await bulk(page, 'add-favorite');
        await expect.poll(async () => Boolean((await ctx.api.getNote(note.id)).favorite)).toBe(true);
        await page.reload();
        await check(page, 'Action gestion');
        await bulk(page, 'trash');
        await expect.poll(() => trashHas(ctx.api, 'Action gestion')).toBe(true);
    });

    test('the dashboard shows folders and notes, and goes into a folder', covers('notes.dashboard'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Tableau dossier');
        const note = await ctx.api.createNote({ heading: 'Tableau note', content: '<p>Corps tableau</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${note.id}/folder`, { folder_id: folder.id }));
        await ctx.api.createNote({ heading: 'Tableau racine', content: '<p>x</p>' });
        await page.goto('/dashboard.php');
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau racine' })).toBeVisible();
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau note' }), 'inside its folder').toHaveCount(0);
        await page.locator('.dash-folder-card', { hasText: 'Tableau dossier' }).click();
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau note' })).toBeVisible();
    });

    test('a task list card opens in a window, another note in the editor', covers('notes.dashboard-note-modal'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Fenêtre tableau', type: 'tasklist', content: '[]' });
        await ctx.api.createNote({ heading: 'Éditeur tableau', content: '<p>Corps en éditeur</p>' });
        await page.goto('/dashboard.php');
        await page.locator('.dash-note-card', { hasText: 'Fenêtre tableau' }).locator('.dash-card-link').click();
        const modal = page.locator('#dashboardNoteModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#dashboardNoteModalTitle')).toContainText('Fenêtre tableau');
        await page.goto('/dashboard.php');
        await page.locator('.dash-note-card', { hasText: 'Éditeur tableau' }).locator('.dash-card-link').click();
        await expect(titleInput(page)).toHaveValue('Éditeur tableau');
    });

    test('pinning a card keeps it first after a reload', covers('notes.note-pin'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Épinglée tableau', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Plus récente tableau', content: '<p>x</p>' });
        await page.goto('/dashboard.php');
        const card = page.locator('.dash-note-card', { hasText: 'Épinglée tableau' });
        await card.hover();
        await card.locator('.dash-card-pin').click();
        await expect.poll(async () => { await page.reload(); await settled(page); return page.locator('.dash-note-card').first().innerText(); }).toContain('Épinglée tableau');
    });

    test('a right-click on a card sets its colour, stored and removable', covers('notes.note-color'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Colorée tableau', content: '<p>x</p>' });
        await page.goto('/dashboard.php');
        const card = page.locator('.dash-note-card', { hasText: 'Colorée tableau' });
        await card.click({ button: 'right' });
        await expect(page.locator('#noteColorModal')).toBeVisible();
        await expect(page.locator('#noteColorModalNoteTitle')).toContainText('Colorée tableau');
        await page.locator('#noteColorGrid > *').nth(1).click();
        await page.click('#noteColorApplyBtn');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).color ?? '').not.toBe('');
        await expect(card).toHaveClass(/has-note-color/);
        await card.click({ button: 'right' });
        await page.click('#noteColorClearBtn');
        await expect.poll(async () => (await ctx.api.getNote(note.id)).color ?? '').toBe('');
    });

    test('the dashboard layout and the full height are remembered, its filters filter', covers('notes.dashboard-view', 'notes.dashboard-filter'), async ({ page }) => {
        await ctx.api.createNote({ heading: 'Filtrée tableau', content: '<p>x</p>' });
        await page.goto('/dashboard.php');
        const layout = page.locator('#dashboardViewLayoutBtn');
        const before = await layout.getAttribute('title');
        await layout.click();
        await expect(layout).not.toHaveAttribute('title', before);
        const next = await layout.getAttribute('title');
        await page.reload();
        await expect(page.locator('#dashboardViewLayoutBtn'), 'after a reload').toHaveAttribute('title', next);
        await page.click('#dashboardViewFullHeightBtn');
        await expect(page.locator('#dashboardViewFullHeightBtn')).toHaveClass(/active/);

        await expect(page.locator('.dash-note-card', { hasText: 'Filtrée tableau' })).toBeVisible();
        await page.click('#dashboardFilterBtn');
        await page.locator('#dashboardFilterModifiedSection .dashboard-filter-chip', { hasText: 'Today' }).click();
        await expect(page.locator('.dash-note-card', { hasText: 'Filtrée tableau' }), 'made today').toBeVisible();
    });

    test('the filter panel shows only the favorites, the badge counts it, other filters stay, Reset brings all back', covers('notes.dashboard-favorites-filter'), async ({ page }) => {
        const fav = await ctx.api.createNote({ heading: 'Tableau favori é', content: '<p>x</p>' });
        await ctx.api.createNote({ heading: 'Tableau pas favori', content: '<p>x</p>' });
        await ctx.api.ok(ctx.api.post(`/notes/${fav.id}/favorite`));
        await page.goto('/dashboard.php');
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau pas favori' })).toBeVisible();
        await page.click('#dashboardFilterBtn');
        const chips = page.locator('#dashboardFilterFavoritesSection .dashboard-filter-chip');
        expect(await chips.allInnerTexts()).toEqual(['All notes', 'Favorites only']);
        await expect(chips.first()).toHaveClass(/active/);
        await chips.filter({ hasText: 'Favorites only' }).click();
        await expect(page).toHaveURL(/favorites=1/);
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau favori é' })).toBeVisible();
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau pas favori' })).toHaveCount(0);
        await expect(page.locator('#dashboardFilterBtn .dashboard-filter-badge')).toHaveText('1');
        // A second filter is kept when favorites is turned off
        await page.click('#dashboardFilterBtn');
        await page.locator('#dashboardFilterModifiedSection .dashboard-filter-chip', { hasText: 'Today' }).click();
        await expect(page.locator('#dashboardFilterBtn .dashboard-filter-badge')).toHaveText('2');
        await page.locator('#dashboardFilterFavoritesSection .dashboard-filter-chip', { hasText: 'All notes' }).click();
        await expect(page).not.toHaveURL(/favorites=1/);
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau pas favori' })).toBeVisible();
        await expect(page.locator('#dashboardFilterBtn .dashboard-filter-badge'), 'the date filter carried over').toHaveText('1');
        await page.goto('/dashboard.php?favorites=1');
        await page.click('#dashboardFilterBtn');
        await page.click('#dashboardFilterResetBtn');
        await expect(page).not.toHaveURL(/favorites=1/);
        await expect(page.locator('.dash-note-card', { hasText: 'Tableau pas favori' })).toBeVisible();
    });

    test('the dashboard scope window opens one or several workspaces', covers('notes.dashboard-scope'), async ({ page }) => {
        await ctx.api.ok(ctx.api.post('/workspaces', { name: 'Tableau B' }));
        await ctx.api.createNote({ heading: 'Vue dans B', content: '<p>x</p>', workspace: 'Tableau B' });
        await page.goto('/dashboard.php?workspace=Poznote');
        await expect(page.locator('.dash-note-card', { hasText: 'Vue dans B' })).toHaveCount(0);
        await page.click('#poznotePageTitleWorkspaceBtn');
        const modal = page.locator('#workspaceSwitcherModal');
        await expect(modal).toBeVisible();
        await modal.locator('label.dashboard-scope-row-all').click();
        await page.click('#dashboardScopeApplyBtn');
        await expect(page.locator('.dash-note-card', { hasText: 'Vue dans B' })).toBeVisible();
    });

    test('the folders page: filter, collapse, rename, favorite, its menu', covers('notes.folders-page-actions'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Liste à renommer');
        await page.goto('/list_folders.php');
        const item = page.locator('.folder-item', { hasText: 'Liste à renommer' });
        await expect(item).toBeVisible();
        await page.fill('#filterInput', 'zzzz');
        await expect(item).toBeHidden();
        await page.fill('#filterInput', '');
        await expect(item).toBeVisible();
        await item.hover();
        await item.locator('[data-action="favorite-folder"]').click();
        await page.goto('/list_folders.php');
        await expect(page.locator('.folder-item', { hasText: 'Liste à renommer' }).locator('.folder-inline-action-btn[data-action="favorite-folder"]')).toHaveAttribute('title', /Remove/);
        await page.locator('.folder-item', { hasText: 'Liste à renommer' }).hover();
        await page.locator('.folder-item', { hasText: 'Liste à renommer' }).locator('[data-action="rename-folder"]').click();
        await page.fill('#editFolderName', 'Liste renommée');
        await page.locator('#editFolderModal [data-action="save-folder-name"]').click();
        await expect.poll(async () => (await ctx.api.get(`/folders/${folder.id}`)).json.folder.name).toBe('Liste renommée');
    });

    test('a click on a row of the folders page opens the board of that folder', covers('notes.folders-page-actions'), async ({ page }) => {
        const folder = await newFolder(ctx.api, 'Liste tableau');
        await page.goto('/list_folders.php');
        await page.locator('.folder-item', { hasText: 'Liste tableau' }).locator('.folder-name-text').click();
        await expect(page).toHaveURL(new RegExp(`kanban=${folder.id}`));
    });

    test('account_tree.php refuses a stranger and lists a workspace once it is shared', covers('notes.account-tree'), async ({ page, browser, playwright }) => {
        const owner = await newAccount(playwright, 'nav-owner');
        const ownerApi = await Api.open(playwright, owner);
        await ownerApi.createNote({ heading: 'Note du propriétaire', content: '<p>x</p>', workspace: 'Poznote' });
        await page.goto('/favorites.php');
        const url = `/account_tree.php?account=${owner.id}`;
        const refused = await page.request.get(url);
        expect(refused.status(), 'no access without a grant').toBe(404);
        await shareWorkspace(browser, owner, ctx.account.id);
        const answer = await page.request.get(url);
        expect(answer.status()).toBe(200);
        expect(await answer.text()).toContain('Note du propriétaire');
        const names = await (await page.request.get(`${url}&workspaces_only=1`)).text();
        expect(names).toContain('Poznote');
        expect(names, 'the notes stay out with workspaces_only').not.toContain('Note du propriétaire');
        await ownerApi.dispose();
    });
});
