// The speed dial (speed_dial.php): notes tagged speed-dial as launcher tiles,
// the gestures of the view, the boards, and the menus that put a note on it.
const { test, expect, covers, Api, PNG, newAccount, login, settled } = require('../lib/helpers');

const tile = (page, label) => page.locator('#speedDialGrid .speed-dial-item', { hasText: label }).first();
const itemOrder = (page) => page.locator('#speedDialGrid > .speed-dial-item').evaluateAll((items) => items.map((item) => item.querySelector('.speed-dial-label, .speed-dial-group-name').textContent.trim()));
const tagsOf = async (api, id) => String((await api.getNote(id)).tags || '').split(/[,\s]+/).filter(Boolean);
// KNOWN: the tiles load the favicon of the sites they open, which a throwaway run cannot reach
const NO_INTERNET = [/favicon\.ico/];
const onDial = (title) => ({ heading: title, content: `[${title}](https://${title.toLowerCase().replace(/[^a-z]/g, '')}.example)\n`, type: 'markdown', tags: 'speed-dial' });

async function openDial(page, query = '') {
    await page.goto(`/speed_dial.php?workspace=Poznote${query}`);
    await settled(page);
}

/** The ⋮ of the note toolbar. */
async function toolbarMenu(page) {
    await page.locator('.note-edit-toolbar [data-action="toggle-mobile-toolbar-menu"]:visible').first().click();
    const menu = page.locator('.note-edit-toolbar .mobile-toolbar-menu:visible').first();
    await expect(menu).toBeVisible();
    return menu;
}

/** The ⋮ of a note row of the tree. */
async function noteRowMenu(page, title) {
    const row = page.locator('#left_col .note-list-item', { hasText: title }).first();
    await row.hover();
    await row.locator('.note-actions-toggle').click();
    return page.locator('#left_col .note-actions-menu.show').first();
}

/** The menu of the Favorites section, from a right click on its row. */
async function favoritesMenu(page) {
    await page.locator('#left_col .folder-header.system-folder', { hasText: 'Favorites' }).locator('.folder-toggle').click({ button: 'right' });
    await expect(page.locator('#favorites-actions-menu')).toHaveClass(/show/);
    return page.locator('#favorites-actions-menu');
}

/** Another account in the same page. */
async function switchTo(page, account) {
    await page.context().clearCookies();
    await login(page, account);
}

/** The ⋮ of a folder row of the tree. */
async function folderRowMenu(page, name) {
    const toggle = page.locator(`#left_col .folder-toggle[data-folder="${name}"]`);
    await toggle.hover();
    await toggle.locator('.folder-actions-toggle').click();
    return page.locator('#left_col .folder-actions-menu.show').first();
}

test.describe('speed dial view', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'speeddial');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.use({ allowedErrors: NO_INTERNET });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('tagged notes become tiles: one link opens the site, none opens the note, several make a group', covers('dial.tiles', 'dial.groups'), async ({ page }) => {
        const site = await api.createNote({ heading: 'Site é', content: '[Site](https://site.example/page)\n', type: 'markdown', tags: 'speed-dial' });
        const plain = await api.createNote({ heading: 'Sans lien', content: '<p>rien</p>', tags: 'speed-dial' });
        await api.createNote({ heading: 'Groupe', content: '[Un](https://un.example)\n[Deux](https://deux.example)\n\n----\n\n[Trois](https://trois.example)\n', type: 'markdown', tags: 'speed-dial, autre' });
        await api.createNote({ heading: 'Tag voisin', content: '[x](https://x.example)\n', type: 'markdown', tags: 'my-speed-dial-notes' });
        const trashed = await api.createNote({ heading: 'A la corbeille', content: '<p>x</p>', tags: 'speed-dial' });
        await api.ok(api.del(`/notes/${trashed.id}`));
        await openDial(page);

        const siteTile = tile(page, 'Site é');
        await expect(siteTile.locator('a.speed-dial-link')).toHaveAttribute('href', 'https://site.example/page');
        await expect(siteTile.locator('a.speed-dial-link')).toHaveAttribute('target', '_blank');
        const served = await (await page.request.get('/speed_dial.php?workspace=Poznote')).text();
        expect(served, 'the tile shows the favicon of its site').toContain('data-src="https://site.example/favicon.ico"');
        await expect(siteTile.locator('a.speed-dial-edit'), 'the pencil opens the note').toHaveAttribute('href', new RegExp(`note=${site.id}&`));
        await expect(tile(page, 'Sans lien').locator('a.speed-dial-link'), 'no link: the tile opens the note').toHaveAttribute('href', new RegExp(`note=${plain.id}&`));
        await expect(tile(page, 'Sans lien').locator('.speed-dial-letter')).toHaveText('S');

        const group = page.locator('#speedDialGrid .speed-dial-group', { hasText: 'Groupe' });
        await expect(group.locator('.speed-dial-group-name')).toHaveText('Groupe');
        await expect(group.locator('.speed-dial-group-row'), '---- starts a second row').toHaveCount(2);
        await expect(group.locator('hr.speed-dial-group-rule')).toHaveCount(1);
        expect(await group.locator('.speed-dial-label').allInnerTexts()).toEqual(['Un', 'Deux', 'Trois']);
        await expect(group.locator('a.speed-dial-link').first()).toHaveAttribute('href', 'https://un.example');

        await expect(page.locator('#speedDialGrid'), 'a tag that only contains speed-dial is not one').not.toContainText('Tag voisin');
        await expect(page.locator('#speedDialGrid'), 'trashed notes stay out').not.toContainText('A la corbeille');
        await expect(page.locator('#iconSidebarSpeedDialBtn'), 'the rail marks the view').toHaveAttribute('aria-current', 'page');
    });

    test('the filter keeps what matches by name or link, says when nothing does, and clears', covers('dial.filter'), async ({ page }) => {
        await api.createNote(onDial('Filtre Alpha'));
        await api.createNote(onDial('Filtre Beta'));
        await openDial(page);
        const input = page.locator('#speedDialFilterInput');
        await input.fill('alpha');
        await expect(tile(page, 'Filtre Alpha')).toBeVisible();
        await expect(tile(page, 'Filtre Beta')).toBeHidden();
        await input.fill('filtrebeta.example');
        await expect(tile(page, 'Filtre Beta'), 'the link is searched too').toBeVisible();
        await expect(tile(page, 'Filtre Alpha')).toBeHidden();
        await input.fill('zzz-rien');
        await expect(page.locator('#speedDialNoResults')).toBeVisible();
        await page.locator('#speedDialFilterClear').click();
        await expect(input).toHaveValue('');
        await expect(tile(page, 'Filtre Alpha')).toBeVisible();
        await expect(tile(page, 'Filtre Beta')).toBeVisible();
        await expect(page.locator('#speedDialNoResults')).toBeHidden();
    });

    test('the size slider sets the width of the tiles, and the account keeps it', covers('dial.size'), async ({ page }) => {
        await api.createNote(onDial('Taille'));
        await openDial(page);
        await page.locator('#speedDialSizeBtn').click();
        await expect(page.locator('#speedDialSizePopover')).toBeVisible();
        await page.locator('#speedDialSizeInput').fill('200');
        await expect(page.locator('#speedDialSizeValue')).toHaveText('200');
        await expect.poll(async () => (await api.get('/settings/speed_dial_tile_size')).json?.value).toBe('200');
        await page.keyboard.press('Escape');
        await expect(page.locator('#speedDialSizePopover')).toBeHidden();
        await page.reload();
        expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--speed-dial-tile-width').trim())).toBe('200px');
        const width = await tile(page, 'Taille').evaluate((element) => element.getBoundingClientRect().width);
        expect(width, 'the tile follows the setting').toBeGreaterThan(190);
        await api.ok(api.put('/settings/speed_dial_tile_size', { value: '140' }));
    });

    test('a right click on the name of a group gives it a colour, kept after a reload, Default takes it off', covers('dial.label-colors'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Couleur groupe', content: '[A](https://a.example)\n[B](https://b.example)\n', type: 'markdown', tags: 'speed-dial' });
        await openDial(page);
        const name = page.locator('.speed-dial-group', { hasText: 'Couleur groupe' }).locator('.speed-dial-group-name');
        await name.click({ button: 'right' });
        const menu = page.locator('#noteTitleMenu');
        await expect(menu).toBeVisible();
        const swatch = menu.locator('.note-title-menu-swatch:not(.is-default)').nth(2);
        const color = await swatch.getAttribute('data-color');
        await swatch.click();
        await expect.poll(async () => JSON.parse((await api.get('/settings/speed_dial_label_colors')).json?.value || '{}')[note.id]).toBe(color);
        await page.reload();
        await expect(name).toHaveAttribute('style', new RegExp(`--speed-dial-label-color: var\\(--pz-color-[a-z]+, ${color}\\)`, 'i'));
        await name.click({ button: 'right' });
        await menu.locator('.note-title-menu-swatch.is-default').click();
        await expect.poll(async () => JSON.parse((await api.get('/settings/speed_dial_label_colors')).json?.value || '{}')[note.id] ?? '').toBe('');
        await page.reload();
        await expect(name).not.toHaveAttribute('style', /--speed-dial-label-color/);
    });

    test('tiles are dragged into a new order, which stays', covers('dial.reorder'), async ({ page, playwright }) => {
        const fresh = await Api.open(playwright, await newAccount(playwright, 'dialorder'));
        for (const title of ['Ordre Un', 'Ordre Deux', 'Ordre Trois']) await fresh.createNote(onDial(title));
        await switchTo(page, fresh.account);
        await openDial(page);
        const before = await itemOrder(page);
        expect(before).toHaveLength(3);
        // The last one, dropped on the left half of the first: it goes first
        await tile(page, before[2]).dragTo(tile(page, before[0]), { targetPosition: { x: 5, y: 20 } });
        await expect.poll(() => itemOrder(page)).toEqual([before[2], before[0], before[1]]);
        await settled(page);
        await page.reload();
        expect(await itemOrder(page), 'the order is stored').toEqual([before[2], before[0], before[1]]);
        await fresh.dispose();
    });

    test('the ... menu gives the view its own background image and opacity, and removes it', covers('dial.background'), async ({ page }) => {
        await api.createNote(onDial('Fond'));
        await openDial(page);
        await expect(page.locator('.speed-dial-background')).toHaveCount(0);
        await page.locator('#pageMoreMenuBtn').click();
        await page.locator('#edgeMenuSpeedDialBackground').click();
        const modal = page.locator('#backgroundImageModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#backgroundOpacityInput'), 'the view goes up to 100%').toHaveAttribute('max', '100');
        await page.locator('#backgroundImageInput').setInputFiles({ name: 'fond é.png', mimeType: 'image/png', buffer: PNG });
        await page.locator('#backgroundOpacityInput').fill('60');
        await expect(page.locator('#backgroundOpacityValue')).toHaveText('60');
        await page.locator('#saveBackgroundBtn').click();
        await expect(page.locator('body')).toHaveClass(/has-speed-dial-background/);
        await expect(page.locator('.speed-dial-background')).toHaveAttribute('style', /opacity: 0\.6/);
        expect((await api.get('/settings/speed_dial_background_opacity_Poznote')).json?.value).toBe('60');
        await page.goto('/index.php?workspace=Poznote');
        await expect(page.locator('body'), 'the image is the view\'s own, not the workspace\'s').not.toHaveClass(/has-workspace-background/);

        await openDial(page);
        await page.locator('#pageMoreMenuBtn').click();
        await page.locator('#edgeMenuSpeedDialBackground').click();
        await expect(page.locator('#removeBackgroundBtn')).toBeVisible();
        await page.locator('#removeBackgroundBtn').click();
        await expect(page.locator('#removeBackgroundBtn'), 'only the preview is emptied').toBeHidden();
        await page.locator('#saveBackgroundBtn').click();
        await expect(page.locator('body')).not.toHaveClass(/has-speed-dial-background/);
        await expect.poll(async () => (await (await page.request.get('/speed_dial.php?workspace=Poznote')).text()).includes('class="speed-dial-background"')).toBe(false);
    });

    test('the rail opens the view, ?focus=1 hides the rail, and an empty speed dial says so', covers('dial.page', 'dial.focus-param'), async ({ page, playwright }) => {
        const empty = await Api.open(playwright, await newAccount(playwright, 'dialempty'));
        await switchTo(page, empty.account);
        await page.goto('/index.php?workspace=Poznote');
        await settled(page);
        await page.locator('#iconSidebarSpeedDialBtn').click();
        await expect(page).toHaveURL(/speed_dial\.php/);
        await expect(page.locator('.speed-dial-empty').first()).toBeVisible();
        await expect(page.locator('#speedDialGrid')).toHaveCount(0);
        await openDial(page, '&focus=1');
        await expect(page.locator('html')).toHaveClass(/focus-mode/);
        await expect(page.locator('#icon_sidebar')).toBeHidden();
        await openDial(page, '&focus=0');
        await expect(page.locator('#icon_sidebar')).toBeVisible();
        await empty.dispose();
    });
});

test.describe('putting notes on the speed dial', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'dialadd');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.use({ allowedErrors: NO_INTERNET });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the ⋮ of the note toolbar adds the note and then removes it', covers('dial.add-note'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Depuis la barre', content: '<p>x</p>', tags: 'garde' });
        await page.goto(`/index.php?note=${note.id}&workspace=Poznote`);
        await settled(page);
        let menu = await toolbarMenu(page);
        await expect(menu.locator('.speed-dial-state-on'), 'Remove shows only for a note on it').toBeHidden();
        await menu.locator('.speed-dial-state-off').click();
        await expect.poll(() => tagsOf(api, note.id)).toEqual(expect.arrayContaining(['garde', 'speed-dial']));
        // The next save of the open note must not take the tag back off
        await page.locator('.noteentry[contenteditable="true"]').first().click();
        await page.keyboard.type(' é');
        await page.evaluate(() => window.saveNoteImmediately && window.saveNoteImmediately());
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('é');
        expect(await tagsOf(api, note.id)).toContain('speed-dial');
        await openDial(page);
        await expect(tile(page, 'Depuis la barre')).toBeVisible();

        await page.goto(`/index.php?note=${note.id}&workspace=Poznote`);
        await settled(page);
        menu = await toolbarMenu(page);
        await expect(menu.locator('.speed-dial-state-off')).toBeHidden();
        await menu.locator('.speed-dial-state-on').click();
        await expect.poll(() => tagsOf(api, note.id)).toEqual(['garde']);
    });

    test('the ⋮ of a note in the tree adds it and removes it', covers('dial.add-note'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Depuis l arbre', content: '<p>x</p>' });
        await page.goto('/index.php?workspace=Poznote');
        await settled(page);
        await (await noteRowMenu(page, 'Depuis l arbre')).locator('[data-action="toggle-speed-dial"].speed-dial-state-off').click();
        await expect.poll(() => tagsOf(api, note.id)).toContain('speed-dial');
        await (await noteRowMenu(page, 'Depuis l arbre')).locator('[data-action="toggle-speed-dial"].speed-dial-state-on').click();
        await expect.poll(() => tagsOf(api, note.id)).not.toContain('speed-dial');
    });

    test('a folder: Add opens the tag dialog filled in, every note gets the tag, then Remove takes it off', covers('dial.add-folder'), async ({ page }) => {
        const parent = (await api.ok(api.post('/folders', { folder_name: 'Liens', workspace: 'Poznote' }))).json.folder;
        const child = (await api.ok(api.post('/folders', { folder_name: 'Sous liens', parent_id: parent.id, workspace: 'Poznote' }))).json.folder;
        const one = await api.createNote({ heading: 'Lien du dossier', content: '<p>x</p>', folder_id: parent.id });
        const two = await api.createNote({ heading: 'Lien du sous dossier', content: '<p>x</p>', folder_id: child.id });
        await page.goto('/index.php?workspace=Poznote');
        await settled(page);
        await (await folderRowMenu(page, 'Liens')).locator('[data-action="toggle-folder-speed-dial"].speed-dial-state-off').click();
        await expect(page.locator('#tagFolderNotesModal')).toBeVisible();
        await expect(page.locator('#tagFolderNotesInput')).toHaveValue('speed-dial');
        await page.locator('#tagFolderNotesModal [data-action="execute-tag-folder-notes"]').click();
        await expect.poll(() => tagsOf(api, one.id)).toContain('speed-dial');
        expect(await tagsOf(api, two.id), 'subfolders included').toContain('speed-dial');
        await page.reload();
        await settled(page);
        await (await folderRowMenu(page, 'Liens')).locator('[data-action="toggle-folder-speed-dial"].speed-dial-state-on').click();
        await expect.poll(() => tagsOf(api, one.id)).not.toContain('speed-dial');
        expect(await tagsOf(api, two.id)).not.toContain('speed-dial');
    });

    test('the Favorites menu puts the favorite notes on the speed dial and takes them off', covers('dial.add-favorites'), async ({ page }) => {
        const fav = await api.createNote({ heading: 'Favori rapide', content: '<p>x</p>' });
        const other = await api.createNote({ heading: 'Pas favori', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${fav.id}/favorite`));
        await page.goto('/index.php?workspace=Poznote');
        await settled(page);
        await (await favoritesMenu(page)).locator('[data-favorites-action="speed-dial"].speed-dial-state-off').click();
        await expect.poll(() => tagsOf(api, fav.id)).toContain('speed-dial');
        expect(await tagsOf(api, other.id)).not.toContain('speed-dial');
        await page.reload();
        await settled(page);
        await (await favoritesMenu(page)).locator('[data-favorites-action="speed-dial"].speed-dial-state-on').click();
        await expect.poll(() => tagsOf(api, fav.id)).not.toContain('speed-dial');
    });

    test('the favorites and folder tag routes add and remove a tag on every note', covers('dial.add-favorites', 'dial.add-folder'), async () => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Route tags', workspace: 'Poznote' }))).json.folder;
        const inFolder = await api.createNote({ heading: 'Route dossier', content: '<p>x</p>', folder_id: folder.id });
        const fav = await api.createNote({ heading: 'Route favori', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${fav.id}/favorite`));
        await api.ok(api.post(`/folders/${folder.id}/tags`, { tags: ['speed-dial'], workspace: 'Poznote' }));
        expect(await tagsOf(api, inFolder.id)).toContain('speed-dial');
        await api.ok(api.del(`/folders/${folder.id}/tags`, { json: { tags: ['speed-dial'], workspace: 'Poznote' } }));
        expect(await tagsOf(api, inFolder.id)).not.toContain('speed-dial');
        await api.ok(api.post('/notes/favorites/tags', { tags: ['speed-dial'], workspace: 'Poznote' }));
        expect(await tagsOf(api, fav.id)).toContain('speed-dial');
        await api.ok(api.del('/notes/favorites/tags', { json: { tags: ['speed-dial'], workspace: 'Poznote' } }));
        expect(await tagsOf(api, fav.id)).not.toContain('speed-dial');
        expect((await api.get('/folders/999999/tags', {})).status, 'an unknown folder').not.toBe(200);
    });
});

test.describe('several speed dials', () => {
    test.use({ allowedErrors: NO_INTERNET });
    test('a new speed dial is created, filled from the note menu, renamed and deleted', covers('dial.boards', 'dial.add-note'), async ({ page, playwright }) => {
        const api = await Api.open(playwright, await newAccount(playwright, 'dialboards'));
        const note = await api.createNote({ heading: 'Pour Travail', content: '<p>x</p>' });
        await api.createNote(onDial('Sur le principal'));
        await login(page, api.account);
        await openDial(page);
        await page.locator('#speedDialNewBtn').click();
        const modal = page.locator('.speed-dial-name-modal');
        await modal.locator('input').fill('Travail é');
        await modal.locator('input').press('Enter');
        await expect(page).toHaveURL(/board=speed-dial-Travail/);
        await expect(page.locator('.speed-dial-board.is-active')).toContainText('Travail é');
        await expect(page.locator('.speed-dial-empty').first(), 'a new speed dial starts empty').toBeVisible();

        // With two of them, the menu asks which one
        await page.goto(`/index.php?note=${note.id}&workspace=Poznote`);
        await settled(page);
        await (await toolbarMenu(page)).locator('.speed-dial-state-choose').click();
        const submenu = page.locator('#speedDialSubmenu');
        await expect(submenu).toBeVisible();
        expect(await submenu.locator('.speed-dial-submenu-name').allInnerTexts()).toEqual(['Default', 'Travail é']);
        await submenu.locator('.speed-dial-submenu-item', { hasText: 'Travail é' }).click();
        await expect.poll(async () => (await tagsOf(api, note.id)).some((tag) => /^speed-dial-travail/i.test(tag))).toBe(true);
        expect(await tagsOf(api, note.id)).not.toContain('speed-dial');

        await openDial(page);
        await expect(tile(page, 'Pour Travail'), 'not on the default one').toHaveCount(0);
        await page.locator('.speed-dial-board', { hasText: 'Travail é' }).click();
        await expect(tile(page, 'Pour Travail')).toBeVisible();

        await page.locator('.speed-dial-board', { hasText: 'Travail é' }).click({ button: 'right' });
        await page.locator('.speed-dial-board-menu [role="menuitem"], .speed-dial-board-menu button').filter({ hasText: 'Rename' }).click();
        await modal.locator('input').fill('Bureau');
        await modal.locator('.alert-modal-button.primary').click();
        await expect(page.locator('.speed-dial-board', { hasText: 'Bureau' })).toBeVisible();
        await expect.poll(async () => (await tagsOf(api, note.id)).some((tag) => /^speed-dial-bureau$/i.test(tag)), 'the notes follow the new name').toBe(true);

        await page.locator('.speed-dial-board', { hasText: 'Bureau' }).click({ button: 'right' });
        await page.locator('.speed-dial-board-menu [role="menuitem"], .speed-dial-board-menu button').filter({ hasText: 'Delete' }).click();
        await page.locator('.alert-modal .alert-modal-button:not(.secondary)').last().click();
        await expect(page.locator('.speed-dial-board', { hasText: 'Bureau' })).toHaveCount(0);
        await expect.poll(() => api.getNote(note.id).then((n) => n.trash ?? 0), 'deleting a speed dial keeps its notes').toBeFalsy();
        await api.dispose();
    });
});

test.describe('what the speed dial shows', () => {
    test.use({ allowedErrors: NO_INTERNET });
    test('each element of its Element visibility section can be hidden from the page itself, and stays hidden', covers('dial.visibility'), async ({ page, playwright }) => {
        const api = await Api.open(playwright, await newAccount(playwright, 'dialvisible'));
        await api.createNote(onDial('Visible seule'));
        await api.createNote({ heading: 'Visible groupe', content: '[A](https://a.example)\n\n----\n\n[B](https://b.example)\n', type: 'markdown', tags: 'speed-dial' });
        // A second speed dial, so that the switcher shows
        await api.createNote({ heading: 'Ailleurs', content: '<p>x</p>', tags: 'speed-dial-Autre' });
        await login(page, api.account);
        await openDial(page);
        const shown = (selector) => page.locator(selector).first().evaluate((element) => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.borderTopColor !== 'rgba(0, 0, 0, 0)';
        });
        const TARGETS = {
            'card:speedDialTitle': '#speedDialTitle', 'panel:speed-dial-workspace': '.speed-dial-container .poznote-page-title-workspace',
            'card:speedDialFilter': '#speedDialFilter', 'panel:speed-dial-group-titles': '.speed-dial-group-title',
            'panel:speed-dial-group-rules': '.speed-dial-group-rule', 'panel:speed-dial-frame': '#speedDialGrid > .speed-dial-tile',
            'panel:speed-dial-icons': '.speed-dial-icon', 'panel:speed-dial-labels': '.speed-dial-label',
            'card:speedDialSwitcher': '#speedDialSwitcher', 'card:speedDialNewBtn': '#speedDialNewBtn',
            'card:speedDialSize': '#speedDialSize', 'panel:speed-dial-edit': '.speed-dial-edit',
        };
        for (const [key, selector] of Object.entries(TARGETS)) expect(await shown(selector), `${key} shows at first`).toBe(true);
        await page.click('#edgeCustomizeBtn');
        const panel = page.locator('#uiCustomizationPanel');
        await expect(panel).toHaveClass(/ui-custom-panel-open/);
        const section = panel.locator('.ui-custom-section', { has: page.locator('.ui-custom-section-title', { hasText: 'Speed dial' }) });
        expect((await section.locator('input[data-ui-key]').evaluateAll((boxes) => boxes.map((box) => box.dataset.uiKey))).sort(), 'the section lists every element').toEqual(Object.keys(TARGETS).sort());
        for (const [key, selector] of Object.entries(TARGETS)) {
            await section.locator(`input[data-ui-key="${key}"]`).evaluate((box) => box.click());
            await expect.poll(() => shown(selector), `${key} hidden at once`).toBe(false);
        }
        await expect.poll(async () => JSON.parse((await api.get('/settings/hidden_ui_elements')).json?.value || '[]')).toEqual(expect.arrayContaining(Object.keys(TARGETS)));
        await page.reload();
        await settled(page);
        for (const [key, selector] of Object.entries(TARGETS)) expect(await shown(selector), `${key} after a reload`).toBe(false);
        await api.dispose();
    });
});
