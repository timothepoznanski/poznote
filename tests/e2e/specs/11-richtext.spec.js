// The rich text editor, gesture by gesture and from each way of triggering it.
const { test, expect, covers, Api, BASE_URL, PNG, newAccount, login } = require('../lib/helpers');

// The loops walk long menus one entry at a time
test.describe.configure({ timeout: 180_000 });

const editor = (page) => page.locator('.noteentry[contenteditable="true"]').first();
const stored = async (api, id) => (await api.getNote(id)).content;

/** A note opened in the editor, the caret at the very end of it. */
async function open(page, api, content = '<p>Bonjour été</p>', heading = 'Riche é') {
    const note = await api.createNote({ heading, content });
    await page.goto(`/index.php?note=${note.id}`);
    await expect(editor(page)).toBeVisible();
    return note.id;
}
// Clicks only when the note does not have the keyboard, and on its top left corner:
// the middle may hold an iframe, which would take the keyboard
const caretAtEnd = async (page) => {
    const focused = await editor(page).evaluate((note) => note.contains(document.activeElement) && document.activeElement.tagName !== 'IFRAME');
    if (!focused) await editor(page).click({ position: { x: 3, y: 3 } });
    await page.keyboard.press('Control+End');
};
const newLine = async (page) => { await caretAtEnd(page); await page.keyboard.press('Enter'); };

/** Selects a whole paragraph with the keyboard, as a person would: click it, Home, Shift+End. */
async function selectLine(page, text) {
    await editor(page).getByText(text, { exact: false }).first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
}
const toolbar = (page, action) => page.locator(`.note-edit-toolbar [data-action="${action}"]:visible`).first();

/** Ctrl+S, then waits for the server to hold what is asked. */
async function saved(page, api, id, pattern) {
    await page.keyboard.press('Control+s');
    await expect.poll(() => stored(api, id), { message: `stored note matches ${pattern}` }).toMatch(pattern);
}
async function reopen(page) { await page.reload(); await expect(editor(page)).toBeVisible(); }

// --- Slash menu -------------------------------------------------------------------
const MAIN = '.slash-command-menu:not(.slash-command-submenu)';
const SUB = '.slash-command-submenu';
async function openSlash(page) {
    await page.keyboard.type('/');
    await expect(page.locator(MAIN)).toBeVisible();
}
/** Walks the open menu with the mouse, each id one level deeper, and clicks the last. */
async function pick(page, ...path) {
    const first = page.locator(`${MAIN} [data-command-id="${path[0]}"]`);
    if (path.length === 1) { await first.click(); return; }
    await first.hover();
    const second = page.locator(`${SUB} [data-submenu-id="${path[1]}"]`);
    if (path.length === 2) { await second.click(); return; }
    await second.hover();
    await page.locator(`${SUB} [data-sub-submenu-id="${path[2]}"]`).click();
}
const slash = async (page, ...path) => { await openSlash(page); await pick(page, ...path); };
const liveMain = (page) => page.locator(`${MAIN} .slash-command-item`).evaluateAll((items) => items.map((item) => item.dataset.commandId));
async function liveSub(page, id) {
    await page.locator(`${MAIN} [data-command-id="${id}"]`).hover();
    await expect(page.locator(SUB).first()).toBeVisible();
    return page.locator(`${SUB} [data-submenu-id]`).evaluateAll((items) => items.map((item) => item.dataset.submenuId));
}

const PALETTE = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'magenta', 'pink', 'brown', 'gray'];
const INLINE = [
    { name: 'bold', action: 'exec-bold', tag: 'b, strong', stored: /<(b|strong)>/, keys: 'Control+b', slash: 'bold' },
    { name: 'italic', action: 'exec-italic', tag: 'i, em', stored: /<(i|em)>/, keys: 'Control+i', slash: 'italic' },
    { name: 'underline', action: 'exec-underline', tag: 'u', stored: /<u>/, keys: 'Control+u', slash: 'underline' },
    { name: 'strikethrough', action: 'exec-strikethrough', tag: 's, strike, del', stored: /<(s|strike|del)>/, keys: 'Control+Shift+s', slash: 'strikethrough' },
];

test.describe('rich text: inline formats', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'rich');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    for (const format of INLINE) {
        test(`${format.name}: toolbar button on, then off, and it survives a reload`, covers(`rich.${format.name}`), async ({ page }) => {
            const id = await open(page, api);
            await selectLine(page, 'Bonjour');
            await toolbar(page, format.action).click();
            await expect(editor(page).locator(format.tag), 'format applied').toHaveText('Bonjour été');
            await saved(page, api, id, format.stored);
            await reopen(page);
            await expect(editor(page).locator(format.tag), 'after reload').toHaveText('Bonjour été');
            await selectLine(page, 'Bonjour');
            await toolbar(page, format.action).click();
            await expect(editor(page).locator(format.tag), 'second click removes it').toHaveCount(0);
        });

        test(`${format.name}: ${format.keys} on a selection and while typing`, covers(`rich.${format.name}`, 'rich.shortcuts'), async ({ page }) => {
            const id = await open(page, api);
            await selectLine(page, 'Bonjour');
            await page.keyboard.press(format.keys);
            await expect(editor(page).locator(format.tag), 'on the selection').toHaveText('Bonjour été');
            await page.keyboard.press(format.keys);
            await expect(editor(page).locator(format.tag), 'the shortcut toggles').toHaveCount(0);
            await page.keyboard.press('End');
            await page.keyboard.press('Enter');
            await page.keyboard.press(format.keys);
            await page.keyboard.type('tapé');
            await expect(editor(page).locator(format.tag), 'while typing').toHaveText('tapé');
            await saved(page, api, id, format.stored);
        });

        test(`${format.name}: slash menu and right-click menu on a selection`, covers(`rich.${format.name}`, 'rich.slash-selection', 'rich.right-click'), async ({ page }) => {
            const id = await open(page, api, '<p>Premier</p><p>Second</p>');
            await selectLine(page, 'Premier');
            await slash(page, 'format', format.slash);
            await expect(editor(page).locator(format.tag), 'from "/"').toHaveText('Premier');
            await selectLine(page, 'Second');
            await editor(page).getByText('Second').click({ button: 'right' });
            await pick(page, 'format', format.slash);
            await expect(editor(page).locator(format.tag), 'from the right click').toHaveCount(2);
            await saved(page, api, id, format.stored);
        });
    }

    for (const format of INLINE.filter((item) => item.name !== 'underline')) {
        test(`${format.name}: slash menu at the caret formats what is typed next`, covers(`rich.${format.name}`, 'rich.slash-caret'), async ({ page }) => {
            const id = await open(page, api);
            await newLine(page);
            await slash(page, 'format', format.slash);
            await page.keyboard.type('à suivre');
            await expect(editor(page).locator(format.tag), 'typed text').toContainText('à suivre');
            await saved(page, api, id, /à suivre/);
            expect(await stored(api, id)).toMatch(format.stored);
        });
    }
});

/** Every describe gets its own account, and a logged in page. */
function withAccount(run) {
    let account;
    const shared = { api: null };
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'rich');
        shared.api = await Api.open(playwright, account);
        shared.account = account;
    });
    test.afterAll(async () => { await shared.api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    run(shared);
}
/** Uploads a picture to the note and shows it there, as a slash insert would leave it. */
async function imageIn(page, api, id, html = '') {
    const upload = await api.ok(api.call('POST', `/notes/${id}/attachments`, { multipart: { file: { name: 'photo é.png', mimeType: 'image/png', buffer: PNG } } }));
    const attachment = upload.json.attachment_id;
    await api.ok(api.patch(`/notes/${id}`, { content: `<p>avant</p><p>${html || `<img src="/api/v1/notes/${id}/attachments/${attachment}" alt="photo">`}</p><p>après</p>` }));
    await page.goto(`/index.php?note=${id}`);
    await expect.poll(() => editor(page).locator('img').first().evaluate((img) => img.naturalWidth), 'the picture loads').toBe(1);
    return attachment;
}
/** What the browser does for a file dropped from the desktop. */
async function drop(page, name, type, base64) {
    const box = await editor(page).boundingBox();
    const data = await page.evaluateHandle(([fileName, fileType, content]) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(content), (char) => char.charCodeAt(0))], fileName, { type: fileType }));
        return transfer;
    }, [name, type, base64]);
    const position = { clientX: box.x + 40, clientY: box.y + 10 };
    await editor(page).dispatchEvent('dragenter', { dataTransfer: data, ...position });
    await editor(page).dispatchEvent('dragover', { dataTransfer: data, ...position });
    await editor(page).dispatchEvent('drop', { dataTransfer: data, ...position });
}
const confirmAlert = async (page) => { await page.locator('.alert-modal-footer .alert-modal-button').last().click(); };
const lines = (names) => names.map((name) => `<p>ligne ${name} fin</p>`).join('');

test.describe('rich text: colours', () => withAccount((ctx) => {
    test('the text colour palette lists every colour and None, and each applies and persists', covers('rich.color', 'rich.color-none'), async ({ page }) => {
        const id = await open(page, ctx.api, lines(PALETTE));
        for (const name of PALETTE) {
            await selectLine(page, `ligne ${name} fin`);
            await toolbar(page, 'toggle-red-color').click();
            const titles = await page.locator('.color-palette-popup .color-item').evaluateAll((items) => items.map((item) => item.title));
            expect(titles, 'palette').toEqual([...PALETTE.map((color) => color[0].toUpperCase() + color.slice(1)), 'None']);
            await page.locator(`.color-palette-popup .color-item[title="${name[0].toUpperCase() + name.slice(1)}"]`).click();
            await expect(editor(page).locator(`[style*="--pz-color-${name},"]`), name).toHaveText(`ligne ${name} fin`);
            await expect(page.locator('.color-palette-popup')).toHaveCount(0);
        }
        await saved(page, ctx.api, id, /--pz-color-gray,/);
        const content = await stored(ctx.api, id);
        for (const name of PALETTE) expect(content, `${name} stored`).toContain(`--pz-color-${name},`);
        await reopen(page);
        await expect(editor(page).locator('[style*="--pz-color-"]')).toHaveCount(PALETTE.length);
        await selectLine(page, 'ligne red fin');
        await toolbar(page, 'toggle-red-color').click();
        await page.locator('.color-palette-popup .color-item[data-color="none"]').click();
        await expect(editor(page).locator('[style*="--pz-color-red,"]'), 'None removes it').toHaveCount(0);
        await expect(editor(page)).toContainText('ligne red fin');
    });

    test('the highlight palette: every colour applies and persists, None removes it', covers('rich.highlight', 'rich.highlight-none'), async ({ page }) => {
        const id = await open(page, ctx.api, lines(PALETTE));
        for (const name of PALETTE) {
            await selectLine(page, `ligne ${name} fin`);
            await toolbar(page, 'toggle-yellow-highlight').click();
            await expect(page.locator('.color-palette-popup .color-item'), 'palette size').toHaveCount(PALETTE.length + 1);
            await page.locator(`.color-palette-popup .color-item[title="${name[0].toUpperCase() + name.slice(1)}"]`).click();
            await expect(editor(page).locator(`[style*="--pz-color-${name}-soft"]`), name).toHaveText(`ligne ${name} fin`);
            await expect(page.locator('.color-palette-popup')).toHaveCount(0);
        }
        await saved(page, ctx.api, id, /--pz-color-gray-soft/);
        const content = await stored(ctx.api, id);
        for (const name of PALETTE) expect(content, `${name} stored`).toContain(`--pz-color-${name}-soft`);
        await reopen(page);
        await selectLine(page, 'ligne green fin');
        await toolbar(page, 'toggle-yellow-highlight').click();
        await page.locator('.color-palette-popup .color-item[data-color="none"]').click();
        await expect(editor(page).locator('[style*="--pz-color-green-soft"]'), 'None removes it').toHaveCount(0);
    });

    test('colour: slash menu at the caret, each colour and Default', covers('rich.color', 'rich.slash-caret'), async ({ page }) => {
        const id = await open(page, ctx.api);
        for (const name of PALETTE) {
            await newLine(page);
            await slash(page, 'color', name);
            await page.keyboard.type(`mot ${name}`);
            await expect(editor(page).locator(`[style*="--pz-color-${name},"]`), name).toContainText(`mot ${name}`);
        }
        await newLine(page);
        await slash(page, 'color', 'default');
        await page.keyboard.type('mot défaut');
        await expect(editor(page).locator('span[style*="color: inherit"]')).toContainText('mot défaut');
        await saved(page, ctx.api, id, /mot défaut/);
    });

    test('highlight: slash menu at the caret, each colour', covers('rich.highlight', 'rich.slash-caret'), async ({ page }) => {
        const id = await open(page, ctx.api);
        for (const name of PALETTE) {
            await newLine(page);
            await slash(page, 'highlight', `highlight-${name}`);
            await page.keyboard.type(`mot ${name}`);
            await expect(editor(page).locator(`[style*="--pz-color-${name}-soft"]`), name).toContainText(`mot ${name}`);
        }
        await saved(page, ctx.api, id, /mot gray/);
    });

    test('colour and highlight: slash menu on a selection, each colour, Default and None', covers('rich.color', 'rich.highlight', 'rich.slash-selection', 'rich.highlight-none', 'rich.color-none'), async ({ page }) => {
        const id = await open(page, ctx.api, lines(PALETTE));
        for (const name of PALETTE) {
            await selectLine(page, `ligne ${name} fin`);
            await slash(page, 'color', name);
            await expect(editor(page).locator(`[style*="--pz-color-${name},"]`), `colour ${name}`).toHaveText(`ligne ${name} fin`);
            await selectLine(page, `ligne ${name} fin`);
            await slash(page, 'highlight', `highlight-${name}`);
            await expect(editor(page).locator(`[style*="--pz-color-${name}-soft"]`), `highlight ${name}`).toHaveText(`ligne ${name} fin`);
        }
        await saved(page, ctx.api, id, /--pz-color-gray-soft/);
        await selectLine(page, 'ligne red fin');
        await slash(page, 'color', 'default');
        await expect(editor(page).locator('[style*="--pz-color-red,"]'), 'Default').toHaveCount(0);
        await selectLine(page, 'ligne red fin');
        await slash(page, 'highlight', 'highlight-none');
        await expect(editor(page).locator('[style*="--pz-color-red-soft"]'), 'None').toHaveCount(0);
    });

    test('the eraser clears the formats of the selection, from the toolbar and the slash menu', covers('rich.eraser'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p><b>gras</b> <i>penché</i> <span style="color: var(--pz-color-red, #dc2626)">rouge</span> simple</p><h2>Titre à nettoyer</h2>');
        await selectLine(page, 'gras');
        await toolbar(page, 'exec-remove-format').click();
        await expect(editor(page).locator('b, i, [style*="--pz-color-red"]'), 'toolbar').toHaveCount(0);
        await expect(editor(page)).toContainText('gras penché rouge simple');
        await saved(page, ctx.api, id, /gras penché rouge simple/);
        await selectLine(page, 'Titre à nettoyer');
        await slash(page, 'format', 'remove-format');
        await expect(editor(page).locator('h2'), 'slash clears the heading').toHaveCount(0);
        await expect(editor(page)).toContainText('Titre à nettoyer');
    });
}));

test.describe('rich text: blocks', () => withAccount((ctx) => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
        test(`H${level}: Title toolbar popup, slash at the caret, slash on a selection`, covers('rich.headings'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>ligne bouton</p><p>ligne sélection</p>');
            await selectLine(page, 'ligne bouton');
            await toolbar(page, 'change-font-size').click();
            await page.locator(`.font-size-popup .font-size-item[data-style="${level}"]`).click();
            await expect(editor(page).locator(`h${level}`), 'toolbar popup').toHaveText('ligne bouton');
            await selectLine(page, 'ligne sélection');
            await slash(page, 'title', `h${level}`);
            await expect(editor(page).locator(`h${level}`), 'slash on selection').toHaveCount(2);
            await newLine(page);
            await slash(page, 'title', `h${level}`);
            await page.keyboard.type('ligne tapée');
            await expect(editor(page).locator(`h${level}`), 'slash at caret').toHaveCount(3);
            await saved(page, ctx.api, id, new RegExp(`<h${level}[^>]*>ligne tapée</h${level}>`));
            await reopen(page);
            await expect(editor(page).locator(`h${level}`), 'after reload').toHaveCount(3);
        });
    }

    test('Back to normal text: from the Title popup, the selection menu and the caret menu', covers('rich.headings', 'rich.back-to-normal'), async ({ page }) => {
        const id = await open(page, ctx.api, '<h2>Titre un</h2><h3>Titre deux</h3><p><b>gras tapé</b></p>');
        await selectLine(page, 'Titre un');
        await toolbar(page, 'change-font-size').click();
        const styles = await page.locator('.font-size-popup .font-size-item').evaluateAll((items) => items.map((item) => item.dataset.style));
        expect(styles).toEqual(['normal', '1', '2', '3', '4', '5', '6']);
        await page.locator('.font-size-popup .font-size-item[data-style="normal"]').click();
        await expect(editor(page).locator('h2'), 'from the popup').toHaveCount(0);
        await selectLine(page, 'Titre deux');
        await slash(page, 'title', 'normal');
        await expect(editor(page).locator('h3'), 'from the selection menu').toHaveCount(0);
        await editor(page).getByText('gras tapé').click();
        await page.keyboard.press('End');
        await slash(page, 'normal');
        await page.keyboard.type(' après');
        await expect(editor(page).locator('b'), 'typed text leaves the bold').toHaveText('gras tapé');
        await expect(editor(page)).toContainText('gras tapé après');
        await saved(page, ctx.api, id, /après/);
    });

    for (const align of ['left', 'center', 'right', 'justify']) {
        test(`align ${align}: toolbar popup, slash at the caret, slash on a selection`, covers('rich.align'), async ({ page }) => {
            // Starts from another alignment, so that even "left" has something to change
            const from = align === 'right' ? 'center' : 'right';
            const style = `style="text-align: ${from}"`;
            const id = await open(page, ctx.api, `<p ${style}>ligne bouton</p><p ${style}>ligne sélection</p><p ${style}>ligne caret</p>`);
            const line = (text) => editor(page).getByText(text);
            await selectLine(page, 'ligne bouton');
            await toolbar(page, 'change-alignment').click();
            await expect(page.locator('.align-popup .font-size-item')).toHaveCount(4);
            await page.locator(`.align-popup .font-size-item[data-align="${align}"]`).click();
            await expect(line('ligne bouton'), 'toolbar').toHaveCSS('text-align', align);
            await selectLine(page, 'ligne sélection');
            await slash(page, 'align', `align-${align}`);
            await expect(line('ligne sélection'), 'selection').toHaveCSS('text-align', align);
            await line('ligne caret').click();
            await slash(page, 'align', `align-${align}`);
            await expect(line('ligne caret'), 'caret').toHaveCSS('text-align', align);
            await saved(page, ctx.api, id, new RegExp(`text-align: ${align}`));
            await reopen(page);
            for (const text of ['ligne bouton', 'ligne sélection', 'ligne caret']) await expect(line(text), `${text} after reload`).toHaveCSS('text-align', align);
        });
    }

    const LISTS = [
        { id: 'bullets', name: 'bullets', selector: 'ul:not(.dash-list):not(.checklist) li', stored: /<ul>/ },
        { id: 'dashes', name: 'dashes', selector: 'ul.dash-list li', stored: /<ul class="dash-list"/ },
        { id: 'numbers', name: 'numbered', selector: 'ol:not([type]) li', stored: /<ol>/ },
        { id: 'letters', name: 'lettered', selector: 'ol[type="a"] li', stored: /<ol type="a"/ },
        { id: 'roman', name: 'roman', selector: 'ol[type="i"] li', stored: /<ol type="i"/ },
    ];
    for (const list of LISTS) {
        test(`${list.name} list: slash at the caret and on a selection, Enter adds an item, Enter twice leaves`, covers(`rich.list-${list.id}`), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>ligne sélection</p>');
            await selectLine(page, 'ligne sélection');
            await slash(page, 'list', list.id);
            await expect(editor(page).locator(list.selector), 'selection').toHaveText('ligne sélection');
            await caretAtEnd(page);
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await slash(page, 'list', list.id);
            await page.keyboard.type('un');
            await page.keyboard.press('Enter');
            await page.keyboard.type('deux');
            await expect(editor(page).locator(list.selector).last(), 'second item').toHaveText('deux');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.type('hors liste');
            await expect(editor(page).locator('li', { hasText: 'hors liste' }), 'left the list').toHaveCount(0);
            await saved(page, ctx.api, id, list.stored);
            await reopen(page);
            await expect(editor(page).locator(list.selector).filter({ hasText: 'deux' }), 'after reload').toHaveCount(1);
        });
    }

    test('bullet and numbered lists from the toolbar buttons, and off again', covers('rich.list-bullets', 'rich.list-numbers'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>puce</p><p>chiffre</p>');
        await selectLine(page, 'puce');
        await toolbar(page, 'exec-unordered-list').click();
        await expect(editor(page).locator('ul li'), 'bullet').toHaveText('puce');
        await selectLine(page, 'chiffre');
        await toolbar(page, 'exec-ordered-list').click();
        await expect(editor(page).locator('ol li'), 'numbered').toHaveText('chiffre');
        await saved(page, ctx.api, id, /<ul>[\s\S]*puce[\s\S]*<ol>[\s\S]*chiffre/);
        await selectLine(page, 'puce');
        await toolbar(page, 'exec-unordered-list').click();
        await expect(editor(page).locator('ul li'), 'second click turns it off').toHaveCount(0);
        await expect(editor(page)).toContainText('puce');
    });

    test('Tab and Shift+Tab indent and outdent a list item, in both kinds of lists', covers('rich.indent'), async ({ page }) => {
        const id = await open(page, ctx.api, '<ul><li>parent</li><li>enfant</li></ul><ol><li>un</li><li>deux</li></ol>');
        await editor(page).getByText('enfant').click();
        await page.keyboard.press('Tab');
        await expect(editor(page).locator('ul ul li'), 'nested').toHaveText('enfant');
        await saved(page, ctx.api, id, /<li>parent\s*<ul[^>]*>\s*<li>enfant/);
        await page.keyboard.press('Shift+Tab');
        await expect(editor(page).locator('ul ul li'), 'outdented').toHaveCount(0);
        await editor(page).getByText('deux').click();
        await page.keyboard.press('Tab');
        await expect(editor(page).locator('ol ol li'), 'numbered nested').toHaveText('deux');
    });

    test('Tab outside a list inserts spaces, in a paragraph and in a code block', covers('rich.indent'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>texte</p><pre><code>code</code></pre>');
        await editor(page).getByText('texte').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Tab');
        expect(await editor(page).locator('p').first().textContent()).toMatch(/^[  ]{4}texte$/);
        await editor(page).locator('pre code').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Tab');
        await expect(editor(page).locator('pre code')).toHaveText('    code');
        await saved(page, ctx.api, id, / {4}code/);
    });

    test('checklist: toolbar button, slash Checklist and Done, ticking persists', covers('rich.checklist'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>sur une ligne</p>');
        await selectLine(page, 'sur une ligne');
        await toolbar(page, 'exec-task-list').click();
        await expect(editor(page).locator('li.checklist-item .checklist-text'), 'toolbar').toHaveText('sur une ligne');
        await newLine(page);
        await page.keyboard.press('Enter');
        await slash(page, 'list', 'checklist');
        await page.keyboard.type('à faire');
        await page.keyboard.press('Enter');
        await page.keyboard.type('et encore');
        await expect(editor(page).locator('li.checklist-item:not(.checklist-item-checked)'), 'Enter adds an item').toHaveCount(3);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await slash(page, 'list', 'done');
        await page.keyboard.type('fini');
        await expect(editor(page).locator('li.checklist-item-checked'), 'Done').toHaveText('fini');
        await expect(editor(page).locator('li.checklist-item-checked input')).toBeChecked();
        await editor(page).locator('li.checklist-item', { hasText: 'à faire' }).locator('input').check();
        await saved(page, ctx.api, id, /à faire/);
        await reopen(page);
        await expect(editor(page).locator('li.checklist-item', { hasText: 'à faire' }).locator('input'), 'ticked after reload').toBeChecked();
        await expect(editor(page).locator('li.checklist-item', { hasText: 'et encore' }).locator('input')).not.toBeChecked();
        await expect(editor(page).locator('li.checklist-item', { hasText: 'fini' }).locator('input')).toBeChecked();
    });

    test('checklist: the selection menu turns lines into items, and the toolbar turns them back', covers('rich.checklist', 'rich.slash-selection'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>élément</p>');
        await selectLine(page, 'élément');
        await slash(page, 'list', 'checklist');
        await expect(editor(page).locator('li.checklist-item .checklist-text')).toHaveText('élément');
        await saved(page, ctx.api, id, /checklist/);
        await editor(page).locator('.checklist-text').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await toolbar(page, 'exec-task-list').click();
        await expect(editor(page).locator('li.checklist-item'), 'toggled off').toHaveCount(0);
        await expect(editor(page)).toContainText('élément');
    });

    for (const [type, title] of [['note', 'Note'], ['tip', 'Tip'], ['important', 'Important'], ['warning', 'Warning'], ['caution', 'Caution']]) {
        test(`callout ${type}: slash at the caret and on a selection`, covers('rich.callouts'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>à encadrer</p>');
            await selectLine(page, 'à encadrer');
            await slash(page, 'quote', type);
            await expect(editor(page).locator(`aside.callout-${type} .callout-body`), 'selection').toContainText('à encadrer');
            await expect(editor(page).locator(`aside.callout-${type} .callout-title-text`)).toHaveText(title);
            await caretAtEnd(page);
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await slash(page, 'quote', type);
            await page.keyboard.type('dans le bloc');
            await expect(editor(page).locator(`aside.callout-${type}`).last().locator('.callout-body'), 'caret').toContainText('dans le bloc');
            await saved(page, ctx.api, id, new RegExp(`callout-${type}[\\s\\S]*dans le bloc`));
            await reopen(page);
            await expect(editor(page).locator(`aside.callout-${type} .callout-body`).last(), 'after reload').toContainText('dans le bloc');
        });
    }

    test('blockquote: slash at the caret and on a selection', covers('rich.blockquote'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>à citer</p>');
        await selectLine(page, 'à citer');
        await slash(page, 'quote', 'plain');
        await expect(editor(page).locator('blockquote'), 'selection').toContainText('à citer');
        await caretAtEnd(page);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await slash(page, 'quote', 'plain');
        await page.keyboard.type('citation tapée');
        await expect(editor(page).locator('blockquote', { hasText: 'citation tapée' })).toHaveCount(1);
        await saved(page, ctx.api, id, /<blockquote[^>]*>[\s\S]*citation tapée/);
    });

    test('toggle: slash inserts a block that folds, and the text inside is saved', covers('rich.toggle'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'insert', 'toggle');
        const block = editor(page).locator('details.toggle-block');
        await expect(block).toHaveAttribute('open', '');
        await block.locator('.toggle-content').click();
        await page.keyboard.type('contenu replié');
        await saved(page, ctx.api, id, /toggle-block[\s\S]*contenu replié/);
        await reopen(page);
        await expect(block.locator('.toggle-content')).toContainText('contenu replié');
    });

    test('separator: slash inserts a line that is saved', covers('rich.separator'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'insert', 'separator');
        await expect(editor(page).locator('hr')).toHaveCount(1);
        await page.keyboard.type('après le trait');
        await saved(page, ctx.api, id, /<hr[\s\S]*après le trait/);
        await reopen(page);
        await expect(editor(page).locator('hr')).toHaveCount(1);
    });

    test('inline code: toolbar button, slash at the caret and on a selection', covers('rich.inline-code'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>code bouton</p><p>code menu</p>');
        await selectLine(page, 'code bouton');
        await toolbar(page, 'toggle-inline-code').click();
        await expect(editor(page).locator('code'), 'toolbar').toHaveText('code bouton');
        await selectLine(page, 'code menu');
        await slash(page, 'code', 'inline-code');
        await expect(editor(page).locator('code'), 'selection').toHaveCount(2);
        await newLine(page);
        await slash(page, 'code', 'inline-code');
        await page.keyboard.type('code tapé');
        await expect(editor(page).locator('code').last(), 'caret').toContainText('code tapé');
        await saved(page, ctx.api, id, /<code[^>]*>[^<]*code tapé<\/code>/);
    });
}));

const CARET_MENU = {
    main: ['normal', 'title', 'format', 'align', 'color', 'highlight', 'code', 'list', 'quote', 'insert', 'excalidraw', 'date', 'link-menu', 'media', 'template'],
    title: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    format: ['bold', 'italic', 'strikethrough'],
    align: ['align-left', 'align-center', 'align-right', 'align-justify'],
    color: [...PALETTE, 'default'],
    highlight: ['yellow', ...PALETTE.filter((name) => name !== 'yellow')].map((name) => `highlight-${name}`),
    code: ['inline-code', 'plain-block', 'code-normal', 'code-bash', 'code-csharp', 'code-cpp', 'code-css', 'code-go', 'code-html', 'code-java', 'code-javascript', 'code-json', 'code-markdown', 'code-php', 'code-powershell', 'code-python', 'code-ruby', 'code-rust', 'code-sql', 'code-typescript', 'code-xml', 'code-yaml'],
    list: ['bullets', 'dashes', 'numbers', 'letters', 'roman', 'checklist', 'done', 'tasklist-embed'],
    quote: ['plain', 'note', 'tip', 'important', 'warning', 'caution'],
    insert: ['toggle', 'record-audio', 'emoji', 'table', 'separator', 'paste-markdown'],
    date: ['now', 'relative-date', 'weekday', 'insert-date', 'insert-time', 'insert-datetime', 'journal-link'],
    'link-menu': ['link', 'note-reference', 'link-to-attachment'],
    media: ['image', 'youtube-video', 'bilibili-video', 'mp4-video', 'audio-file', 'record-audio'],
};
const SELECTION_MENU = {
    main: ['title', 'format', 'align', 'list', 'color', 'highlight', 'code', 'quote', 'link', 'search-replace', 'copy', 'cut', 'paste', 'paste-plain'],
    title: ['normal', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    format: ['bold', 'italic', 'underline', 'strikethrough', 'remove-format'],
    align: CARET_MENU.align,
    list: ['bullets', 'numbers', 'dashes', 'letters', 'roman', 'checklist'],
    color: CARET_MENU.color,
    highlight: [...CARET_MENU.highlight, 'highlight-none'],
    code: ['inline-code', 'code-normal'],
    quote: CARET_MENU.quote,
};
async function expectMenu(page, expected) {
    expect(await liveMain(page), 'main menu').toEqual(expected.main);
    for (const [id, items] of Object.entries(expected)) {
        if (id !== 'main') expect(await liveSub(page, id), `submenu ${id}`).toEqual(items);
    }
}
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayOffset = (days) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + days); return iso(date); };
// The app's own rule for a month away: the same day, or the last one the month has
const monthOffset = (months) => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + months + 1, 0).getDate();
    return iso(new Date(now.getFullYear(), now.getMonth() + months, Math.min(now.getDate(), last), 12));
};

test.describe('rich text: the slash menu', () => withAccount((ctx) => {
    test('"/" at the caret: the live menu and every submenu are the expected lists', covers('rich.slash-caret', 'rich.slash-enumeration', 'rich.mermaid-not-in-rich-text'), async ({ page }) => {
        await open(page, ctx.api);
        await newLine(page);
        await openSlash(page);
        await expectMenu(page, CARET_MENU);
        await page.locator(`${MAIN} [data-command-id="date"]`).hover();
        const third = async (id) => {
            await page.locator(`${SUB} [data-submenu-id="${id}"]`).hover();
            await expect(page.locator(`${SUB} [data-sub-submenu-id]`).first()).toBeVisible();
            return page.locator(`${SUB} [data-sub-submenu-id]`).evaluateAll((items) => items.map((item) => item.dataset.subSubmenuId));
        };
        expect(await third('now'), 'now').toEqual(['today', 'now-time', 'now-datetime']);
        expect(await third('relative-date'), 'relative').toEqual(['tomorrow', 'day-after-tomorrow', 'next-week', 'next-month', 'next-year', 'yesterday', 'day-before-yesterday', 'last-week', 'last-month', 'last-year']);
        expect(await third('weekday'), 'weekday').toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => `weekday-${day}`));
    });

    test('"/" on a selection: the live menu and every submenu are the expected lists, the selection stays', covers('rich.slash-selection', 'rich.slash-enumeration'), async ({ page }) => {
        await open(page, ctx.api);
        await selectLine(page, 'Bonjour');
        await openSlash(page);
        await expectMenu(page, SELECTION_MENU);
        await expect(editor(page), 'the "/" did not replace the text').toHaveText('Bonjour été');
    });

    test('right click: the same menus at the pointer, Shift+right click leaves the browser menu', covers('rich.right-click'), async ({ page }) => {
        await open(page, ctx.api, '<p>Bonjour été</p><p>second</p>');
        const target = editor(page).getByText('second');
        await target.click({ button: 'right' });
        await expect(page.locator(MAIN)).toBeVisible();
        expect(await liveMain(page), 'nothing selected, the clipboard comes first').toEqual(['paste', 'paste-plain', ...CARET_MENU.main]);
        await page.keyboard.press('Escape');
        await expect(page.locator(MAIN)).toHaveCount(0);
        await expect(editor(page), 'no "/" left behind').not.toContainText('/');
        await selectLine(page, 'Bonjour');
        await editor(page).getByText('Bonjour').click({ button: 'right' });
        expect(await liveMain(page), 'on a selection').toEqual(SELECTION_MENU.main);
        await page.keyboard.press('Escape');
        await target.click({ button: 'right', modifiers: ['Shift'] });
        await expect(page.locator(MAIN), 'Shift keeps the browser menu').toHaveCount(0);
    });

    test('keyboard: typing filters, arrows walk the menus, Enter runs, Escape closes and keeps the "/"', covers('rich.slash-keyboard'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await openSlash(page);
        await page.keyboard.type('nothing-matches');
        await expect(page.locator('.slash-command-empty'), 'no results').toBeVisible();
        for (let index = 0; index < 'nothing-matches'.length; index++) await page.keyboard.press('Backspace');
        await expect(page.locator(`${MAIN} .slash-command-item`)).toHaveCount(CARET_MENU.main.length);
        await page.keyboard.press('ArrowDown');
        await expect(page.locator(`${MAIN} .slash-command-item.selected`)).toHaveAttribute('data-command-id', 'title');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`${SUB} .slash-command-item.selected`)).toHaveAttribute('data-submenu-id', 'h1');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.keyboard.type('par les flèches');
        await expect(editor(page).locator('h2'), 'H2 from the arrows').toHaveText('par les flèches');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await openSlash(page);
        // Only the words shown match, hidden aliases such as /todo are gone (#1712)
        await page.keyboard.type('checkl');
        await expect(page.locator(`${MAIN} .slash-command-item`).first()).toHaveAttribute('data-command-id', 'checklist');
        await page.keyboard.press('Enter');
        await expect(page.locator(MAIN)).toHaveCount(0);
        await page.keyboard.type('filtré');
        await expect(editor(page).locator('.checklist-text'), 'filtered by its name').toHaveText('filtré');
        await saved(page, ctx.api, id, /filtré/);
        await newLine(page);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await openSlash(page);
        await page.keyboard.press('Escape');
        await expect(page.locator(MAIN)).toHaveCount(0);
        await expect(editor(page), 'a typed "/" survives Escape').toContainText('/');
        await openSlash(page);
        await page.keyboard.press('Space');
        await expect(page.locator(MAIN), 'a space closes it').toHaveCount(0);
    });

    test('the slash trigger setting: Alt+/ only, then no key at all, right click always works', covers('rich.slash-trigger'), async ({ page }) => {
        try {
            await ctx.api.ok(ctx.api.put('/settings/slash_menu_trigger', { value: 'alt-slash' }));
            await open(page, ctx.api);
            await newLine(page);
            await page.keyboard.type('a/b');
            await expect(page.locator(MAIN), 'a bare "/" is a character').toHaveCount(0);
            await expect(editor(page)).toContainText('a/b');
            await page.keyboard.press('End');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Alt+/');
            await expect(page.locator(MAIN), 'Alt+/').toBeVisible();
            await page.keyboard.press('Escape');
            await ctx.api.ok(ctx.api.put('/settings/slash_menu_trigger', { value: 'disabled' }));
            await open(page, ctx.api);
            await newLine(page);
            await page.keyboard.type('/');
            await page.keyboard.press('Alt+/');
            await expect(page.locator(MAIN), 'no key opens it').toHaveCount(0);
            await editor(page).click({ button: 'right' });
            await expect(page.locator(MAIN), 'the right click still does').toBeVisible();
        } finally {
            await ctx.api.ok(ctx.api.put('/settings/slash_menu_trigger', { value: 'slash' }));
        }
    });

    test('date: every Now, Relative and weekday entry inserts the right value', covers('rich.slash-date'), async ({ page }) => {
        const id = await open(page, ctx.api);
        const weekday = (index) => { // Next occurrence strictly after today, Monday = 0
            const today = new Date();
            const delta = ((((index + 1) % 7) - today.getDay() + 7) % 7) || 7;
            return dayOffset(delta);
        };
        const entries = [
            ['now', 'today', dayOffset(0)], ['now', 'now-time', /^\d{2}:\d{2}$/], ['now', 'now-datetime', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/],
            ['relative-date', 'tomorrow', dayOffset(1)], ['relative-date', 'day-after-tomorrow', dayOffset(2)],
            ['relative-date', 'next-week', dayOffset(7)], ['relative-date', 'next-month', monthOffset(1)], ['relative-date', 'next-year', monthOffset(12)],
            ['relative-date', 'yesterday', dayOffset(-1)], ['relative-date', 'day-before-yesterday', dayOffset(-2)],
            ['relative-date', 'last-week', dayOffset(-7)], ['relative-date', 'last-month', monthOffset(-1)], ['relative-date', 'last-year', monthOffset(-12)],
            ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ['weekday', `weekday-${day}`, weekday(index)]),
        ];
        for (const [group, entry, value] of entries) {
            await newLine(page);
            await slash(page, 'date', group, entry);
            const line = editor(page).locator('p').last();
            await expect(line, entry).toHaveText(value);
        }
        await saved(page, ctx.api, id, new RegExp(weekday(6)));
    });

    test('date: the Date, Time and Date and time pickers', covers('rich.slash-date'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'date', 'insert-date');
        await page.locator('.slash-date-picker [data-nav="1"]').click();
        const next = new Date(); next.setDate(1); next.setMonth(next.getMonth() + 1);
        await page.locator('.slash-date-picker-day', { hasText: /^15$/ }).click();
        const picked = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-15`;
        await expect(editor(page).locator('p').last(), 'date').toHaveText(picked);
        await newLine(page);
        await slash(page, 'date', 'insert-time');
        await page.locator('.slash-time-cell[data-hour="9"]').click();
        await page.locator('.slash-time-cell[data-minute="30"]').click();
        await expect(editor(page).locator('p').last(), 'time').toHaveText('09:30');
        await newLine(page);
        await slash(page, 'date', 'insert-datetime');
        await page.locator('.slash-date-picker-day.today').click();
        await page.locator('.slash-date-picker [data-time-menu]').click();
        await page.locator('.slash-time-cell[data-hour="14"]').click();
        await page.locator('.slash-time-cell[data-minute="5"]').click();
        await page.locator('.slash-date-picker [data-apply]').click();
        await expect(editor(page).locator('p').last(), 'date and time').toHaveText(`${dayOffset(0)} 14:05`);
        await saved(page, ctx.api, id, /09:30[\s\S]*14:05/);
    });

    test('date: Link to diary entry inserts a link to that day', covers('rich.slash-date', 'rich.link-diary'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'date', 'journal-link');
        await page.locator('.slash-date-picker-day.today').click();
        const link = editor(page).locator('a[href*="diary.php?date="]');
        await expect(link).toHaveAttribute('href', new RegExp(`diary\\.php\\?date=${dayOffset(0)}`));
        await saved(page, ctx.api, id, /diary\.php\?date=/);
    });

    test('emoji: the picker from the slash menu, and :shortcode: while typing', covers('rich.emoji'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'insert', 'emoji');
        await page.locator('.emoji-picker .emoji-item[data-emoji="😎"]').click();
        await expect(editor(page), 'picker').toContainText('😎');
        await expect(page.locator('.emoji-picker')).toHaveCount(0);
        await newLine(page);
        await page.keyboard.type('fini :joy:');
        await expect(editor(page), 'a full shortcode').toContainText('fini 😂');
        await newLine(page);
        await page.keyboard.type(':heart_ey');
        await expect(page.locator('.emoji-autocomplete-item').first(), 'the completion menu').toBeVisible();
        await page.keyboard.press('Enter');
        await expect(editor(page), 'Enter completes').toContainText('😍');
        await saved(page, ctx.api, id, /😎[\s\S]*😂[\s\S]*😍/);
    });

    test('Insert Markdown: the source is previewed, then converted in the note', covers('rich.paste-markdown'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'insert', 'paste-markdown');
        await expect(page.locator('#insertMarkdownInsertBtn'), 'nothing to insert yet').toBeDisabled();
        await page.fill('#insertMarkdownSource', '## Titre é\n\n- **gras**\n- [lien](https://example.com/x)\n');
        await expect(page.locator('#insertMarkdownPreview h2'), 'preview').toHaveText('Titre é');
        await page.click('#insertMarkdownInsertBtn');
        await expect(editor(page).locator('h2')).toHaveText('Titre é');
        await expect(editor(page).locator('li strong, li b')).toHaveText('gras');
        await expect(editor(page).locator('li a')).toHaveAttribute('href', 'https://example.com/x');
        await saved(page, ctx.api, id, /<h2[^>]*>Titre é<\/h2>/);
    });

    test('template: the picker lists the notes of the Templates folder, a pick inserts it', covers('rich.slash-template'), async ({ playwright, page }) => {
        const account = await newAccount(playwright, 'rich-tpl');
        const api = await Api.open(playwright, account);
        await page.context().clearCookies();
        await login(page, account);
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Templates' }))).json.folder;
        const template = await api.createNote({ heading: 'Modèle réunion', content: '<h2>Ordre du jour é</h2>' });
        await api.ok(api.post(`/notes/${template.id}/folder`, { folder_id: folder.id }));
        const other = await api.createNote({ heading: 'Autre modèle', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${other.id}/folder`, { folder_id: folder.id }));
        const id = await open(page, api);
        await newLine(page);
        await slash(page, 'template');
        await expect(page.locator('.template-picker-list [role="option"], .template-picker-item'), 'the two templates').toHaveCount(2);
        await page.fill('.template-picker-search', 'réunion');
        await expect(page.locator('.template-picker-list [role="option"], .template-picker-item'), 'filtered').toHaveCount(1);
        await page.locator('.template-picker-list [role="option"], .template-picker-item').click();
        await expect(editor(page).locator('h2')).toHaveText('Ordre du jour é');
        await saved(page, api, id, /Ordre du jour é/);
        await api.dispose();
    });

    test('task list embed: pick a task list, the widget shows its tasks and is saved', covers('rich.slash-tasklist-embed'), async ({ page }) => {
        const list = await ctx.api.createNote({ heading: 'Courses é', content: '[]', type: 'tasklist' });
        await ctx.api.ok(ctx.api.post(`/notes/${list.id}/tasks`, { text: 'Acheter du pain' }));
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'list', 'tasklist-embed');
        await page.locator('#taskListPickerList').getByText('Courses é').click();
        await page.click('#confirmTaskListPickerBtn');
        await expect(editor(page).locator('.tasklist-embed-widget .tasklist-embed-title')).toContainText('Courses é');
        await expect(editor(page).locator('.tasklist-embed-widget')).toContainText('Acheter du pain');
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id)).toContain(String(list.id));
        await reopen(page);
        await expect(editor(page).locator('.tasklist-embed-widget')).toContainText('Acheter du pain');
    });

    test('the Search and replace entry of the selection menu opens the bar, prefilled', covers('rich.slash-search-replace', 'rich.search-replace'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>Bonjour été</p>');
        await selectLine(page, 'Bonjour');
        await slash(page, 'search-replace');
        await expect(page.locator(`#searchInput${id}`), 'prefilled').toHaveValue('Bonjour été');
    });
}));

test.describe('rich text: clipboard', () => {
    // KNOWN: an upload or a deletion of an attachment bumps the note version, the save right after gets a 409 that notes.js retries, the browser logs it
    test.use({ allowedErrors: [/status of 409/] });
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
    withAccount((ctx) => {
        const clip = (page, items) => page.evaluate(async (flavours) => {
            const parts = {};
            for (const [type, value] of Object.entries(flavours)) {
                parts[type] = type.startsWith('image/')
                    ? new Blob([Uint8Array.from(atob(value), (char) => char.charCodeAt(0))], { type })
                    : new Blob([value], { type });
            }
            await navigator.clipboard.write([new ClipboardItem(parts)]);
        }, items);
        const readClip = (page) => page.evaluate(() => navigator.clipboard.readText());

        test('selection menu: Copy then Paste, over a selection, keeps the formats', covers('rich.slash-clipboard'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p><b>à copier</b></p><p>cible</p>');
            await selectLine(page, 'à copier');
            await slash(page, 'copy');
            await expect.poll(() => readClip(page), 'Copy').toContain('à copier');
            await selectLine(page, 'cible');
            await slash(page, 'paste');
            await expect(editor(page), 'over the selection').not.toContainText('cible');
            await expect(editor(page).locator('b, strong'), 'the bold came along').toHaveCount(2);
            await saved(page, ctx.api, id, /(<b>|<strong>)à copier[\s\S]*(<b>|<strong>)à copier/);
        });

        test('Ctrl+C, Ctrl+X, Ctrl+V between lines keep the formats', covers('rich.paste-html', 'rich.shortcuts'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p><i>à couper</i></p><p>cible</p>');
            await selectLine(page, 'à couper');
            await page.keyboard.press('Control+x');
            await expect.poll(() => readClip(page), 'Ctrl+X').toContain('à couper');
            await expect(editor(page), 'removed').not.toContainText('à couper');
            await selectLine(page, 'cible');
            await page.keyboard.press('Control+v');
            await expect(editor(page).locator('i, em'), 'Ctrl+V').toHaveText('à couper');
            await saved(page, ctx.api, id, /(<i>|<em>)à couper/);
        });

        test('selection menu: Cut removes the text and puts it on the clipboard', covers('rich.slash-clipboard'), async ({ page }) => {
            test.fail(true, 'BUG: the Cut entry leaves the text in place, the cut handler calls execCommand(delete) from inside execCommand(cut), which Chromium refuses');
            await open(page, ctx.api, '<p>à couper</p><p>reste</p>');
            await selectLine(page, 'à couper');
            await slash(page, 'cut');
            await expect.poll(() => readClip(page), 'Cut').toContain('à couper');
            await expect(editor(page), 'Cut removes it').not.toContainText('à couper', { timeout: 3_000 });
        });

        test('selection menu: Paste without formatting drops the HTML', covers('rich.slash-clipboard', 'rich.paste-plain'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>cible</p>');
            await clip(page, { 'text/html': '<b>gras collé</b>', 'text/plain': 'gras collé' });
            await selectLine(page, 'cible');
            await slash(page, 'paste-plain');
            await expect(editor(page)).toContainText('gras collé');
            await expect(editor(page).locator('b, strong')).toHaveCount(0);
            await saved(page, ctx.api, id, /gras collé/);
        });

        test('Ctrl+V of formatted HTML keeps the formats, Ctrl+Shift+V does not', covers('rich.paste-html', 'rich.paste-plain'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await clip(page, { 'text/html': '<h2>Titre collé</h2><p><b>gras</b> et <a href="https://example.com/a">lien</a></p><ul><li>puce</li></ul>', 'text/plain': 'Titre collé gras et lien puce' });
            await page.keyboard.press('Control+v');
            await expect(editor(page).locator('h2')).toHaveText('Titre collé');
            await expect(editor(page).locator('b, strong')).toHaveText('gras');
            await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com/a');
            await expect(editor(page).locator('li')).toHaveText('puce');
            await saved(page, ctx.api, id, /<h2[^>]*>Titre collé<\/h2>/);
            await newLine(page);
            await clip(page, { 'text/html': '<u>souligné collé</u>', 'text/plain': 'souligné collé' });
            await page.keyboard.press('Control+Shift+v');
            await expect(editor(page), 'plain').toContainText('souligné collé');
            await expect(editor(page).locator('u')).toHaveCount(0);
        });

        test('Office and OneNote HTML: the text wins over the bitmap, pictures of the source machine are dropped and announced', covers('rich.paste-office'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await clip(page, {
                'text/html': '<!--StartFragment--><p class="MsoNormal"><b>Compte rendu</b></p><ol start="3"><li>troisième</li></ol><img src="file:///C:/Users/x/image.png"><!--EndFragment-->',
                'text/plain': 'Compte rendu troisième',
                'image/png': PNG.toString('base64'),
            });
            await page.keyboard.press('Control+v');
            await expect(editor(page).locator('b, strong'), 'the HTML, not the picture').toHaveText('Compte rendu');
            await expect(editor(page).locator('ol'), 'list start kept').toHaveAttribute('start', '3');
            await expect(editor(page).locator('img'), 'file:// dropped').toHaveCount(0);
            await saved(page, ctx.api, id, /Compte rendu/);
            expect(await stored(ctx.api, id)).not.toContain('file:///');
        });

        test('pasting an image uploads it as an attachment of the note', covers('rich.paste-image'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await clip(page, { 'image/png': PNG.toString('base64') });
            await page.keyboard.press('Control+v');
            const image = editor(page).locator('img');
            await expect(image).toHaveAttribute('src', new RegExp(`/api/v1/notes/${id}/attachments/`));
            await expect.poll(() => image.evaluate((img) => img.naturalWidth), 'the picture loads').toBe(1);
            await saved(page, ctx.api, id, /<img/);
            await expect.poll(async () => (await ctx.api.get(`/notes/${id}/attachments`)).json.attachments.length).toBe(1);
        });

        test('pasting a URL gives a link, pasting a line in a code block stays plain text', covers('rich.paste-url', 'rich.paste-code'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>texte</p><pre><code>code</code></pre>');
            await clip(page, { 'text/plain': 'https://example.com/colle' });
            await selectLine(page, 'texte');
            await page.keyboard.press('End');
            await page.keyboard.press('Control+v');
            const link = editor(page).locator('a');
            await expect(link, 'a link').toHaveText('https://example.com/colle');
            await expect(link).toHaveAttribute('href', 'https://example.com/colle');
            await clip(page, { 'text/plain': 'collé brut', 'text/html': '<b>collé brut</b>' });
            await editor(page).locator('pre code').click();
            await page.keyboard.press('End');
            await page.keyboard.press('Control+v');
            await expect(editor(page).locator('pre'), 'plain text in a code block').toContainText('collé brut');
            await expect(editor(page).locator('pre b'), 'no format').toHaveCount(0);
            await saved(page, ctx.api, id, /collé brut/);
        });

        test('several lines pasted in a code block all stay in the block', covers('rich.paste-code'), async ({ page }) => {
            test.fail(true, 'BUG: handleCodeBlockPaste uses insertHTML with <br>, Chromium splits the block: <pre><code>code</code>ligne 1</pre>ligne 2');
            await open(page, ctx.api, '<p>texte</p><pre><code>code</code></pre>');
            await clip(page, { 'text/plain': 'ligne 1\nligne 2' });
            await editor(page).locator('pre code').click();
            await page.keyboard.press('End');
            await page.keyboard.press('Control+v');
            await expect(editor(page)).toContainText('ligne 2');
            expect(await editor(page).locator('pre').innerText(), 'both lines').toContain('ligne 1\nligne 2');
        });

        // A page can put raw HTML on the clipboard from its own copy event, the async API would clean it
        const copyRawHtml = async (page, html, text) => {
            await page.evaluate(([rawHtml, rawText]) => {
                document.addEventListener('copy', (event) => {
                    event.stopImmediatePropagation();
                    event.clipboardData.setData('text/html', rawHtml);
                    event.clipboardData.setData('text/plain', rawText);
                    event.preventDefault();
                }, { capture: true, once: true });
            }, [html, text]);
            await page.keyboard.press('Control+c');
        };

        test('the sanitizer: pasted scripts and handlers are not stored', covers('rich.sanitizer'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await copyRawHtml(page, '<p onclick="window.__clicked=1">sûr<script>window.__pwned=2</script><a href="javascript:window.__pwned=4">lien</a></p>', 'sûr');
            await page.keyboard.press('Control+v');
            await expect(editor(page)).toContainText('sûr');
            await page.keyboard.press('Control+s');
            await expect.poll(() => stored(ctx.api, id)).toContain('sûr');
            expect(await stored(ctx.api, id), 'nothing dangerous stored').not.toMatch(/<script|onclick|javascript:/i);
            await reopen(page);
            await editor(page).getByText('sûr').click();
            expect(await page.evaluate(() => [window.__pwned, window.__clicked]), 'nothing ran').toEqual([undefined, undefined]);
        });

        test('the sanitizer: an event handler in pasted HTML does not run', covers('rich.sanitizer'), async ({ page }) => {
            test.fail(true, 'BUG: handleRichTextPaste keeps on* attributes, so <img onerror> from the clipboard runs at paste time in the page');
            await open(page, ctx.api);
            await newLine(page);
            await copyRawHtml(page, '<p>collé<img src="/nothing-here.png" onerror="window.__pwned=3"></p>', 'collé');
            await page.keyboard.press('Control+v');
            await expect(editor(page)).toContainText('collé');
            await page.waitForTimeout(500); // Time for the broken picture to fail
            expect(await page.evaluate(() => window.__pwned), 'the onerror ran').toBeUndefined();
        });

        test('code block: the copy button puts the code on the clipboard', covers('rich.code-copy'), async ({ page }) => {
            await open(page, ctx.api, '<pre data-language="python"><code class="language-python">print("é")\nx = 1</code></pre><p>fin</p>');
            await editor(page).locator('pre').hover();
            await page.locator('.code-block-copy-btn').first().click();
            await expect.poll(() => readClip(page)).toBe('print("é")\nx = 1');
            await expect(page.locator('.code-block-copy-btn.copied')).toHaveCount(1);
        });

        test('image menu: Copy image puts the picture on the clipboard', covers('rich.image-menu'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await imageIn(page, ctx.api, id);
            await editor(page).locator('img').click({ button: 'right' });
            await page.locator('.image-menu [data-action="copy-image"]').click();
            await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types)), 'an image').toContain('image/png');
        });
    });
});

test.describe('rich text: links', () => withAccount((ctx) => {
    test('toolbar and Ctrl+K on a selection add a link, edit it, then remove it', covers('rich.link'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>mon lien</p><p>raccourci</p>');
        await selectLine(page, 'mon lien');
        await toolbar(page, 'add-link').click();
        await expect(page.locator('#linkModalText'), 'text prefilled').toHaveValue('mon lien');
        await expect(page.locator('#linkModalRemove'), 'nothing to remove yet').toBeDisabled();
        await page.fill('#linkModalUrl', 'https://example.com/é');
        await page.click('#linkModalAdd');
        const link = editor(page).locator('a');
        await expect(link).toHaveText('mon lien');
        await expect(link).toHaveAttribute('href', /example\.com/);
        await selectLine(page, 'raccourci');
        await page.keyboard.press('Control+k');
        await page.fill('#linkModalUrl', 'https://example.com/raccourci');
        await page.click('#linkModalAdd');
        await expect(editor(page).locator('a[href="https://example.com/raccourci"]'), 'Ctrl+K').toHaveText('raccourci');
        await saved(page, ctx.api, id, /href="https:\/\/example\.com\/raccourci"/);
        await reopen(page);
        await selectLine(page, 'mon lien');
        await toolbar(page, 'add-link').click();
        await expect(page.locator('#linkModalUrl'), 'edit shows the URL').toHaveValue(/example\.com/);
        await page.fill('#linkModalUrl', 'https://example.com/modifie');
        await page.fill('#linkModalText', 'lien modifié');
        await page.click('#linkModalAdd');
        await expect(editor(page).locator('a[href="https://example.com/modifie"]'), 'edited').toHaveText('lien modifié');
        await saved(page, ctx.api, id, /modifie/);
        await selectLine(page, 'lien modifié');
        await toolbar(page, 'add-link').click();
        await page.click('#linkModalRemove');
        await expect(editor(page).locator('a[href*="modifie"]'), 'removed').toHaveCount(0);
        await expect(editor(page), 'the text stays').toContainText('lien modifié');
        await expect.poll(() => stored(ctx.api, id), 'removal saved').not.toContain('modifie"');
    });

    test('clicking a link in the note opens it in a new tab', covers('rich.link'), async ({ page, context }) => {
        await context.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
        await open(page, ctx.api, '<p>voir <a href="https://example.com/ouvert">ce lien</a></p>');
        const [opened] = await Promise.all([context.waitForEvent('page'), editor(page).locator('a').click()]);
        await expect(opened).toHaveURL('https://example.com/ouvert');
        await opened.close();
    });

    test('the link dialog: Cancel and Escape change nothing', covers('rich.link'), async ({ page }) => {
        await open(page, ctx.api);
        await selectLine(page, 'Bonjour');
        await toolbar(page, 'add-link').click();
        await page.click('#linkModalCancel');
        await expect(page.locator('#linkModal')).toBeHidden();
        await selectLine(page, 'Bonjour');
        await page.keyboard.press('Control+k');
        await expect(page.locator('#linkModal')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#linkModal')).toBeHidden();
        await expect(editor(page).locator('a')).toHaveCount(0);
    });

    test('slash Link at the caret and on a selection', covers('rich.link', 'rich.slash-link'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'link-menu', 'link');
        await page.fill('#linkModalUrl', 'https://example.com/caret');
        await page.fill('#linkModalText', 'au curseur');
        await page.click('#linkModalAdd');
        await expect(editor(page).locator('a[href="https://example.com/caret"]'), 'caret').toHaveText('au curseur');
        await selectLine(page, 'Bonjour');
        await slash(page, 'link');
        await page.fill('#linkModalUrl', 'https://example.com/selection');
        await page.click('#linkModalAdd');
        await expect(editor(page).locator('a[href="https://example.com/selection"]'), 'selection').toHaveText('Bonjour été');
        await saved(page, ctx.api, id, /selection"/);
    });

    test('note link: the picker finds a note, the link is saved and opens it', covers('rich.link-note'), async ({ page }) => {
        const target = await ctx.api.createNote({ heading: 'Note cible é', content: '<p>je suis la cible</p>' });
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'link-menu', 'note-reference');
        await page.fill('#noteReferenceSearch', 'cible');
        await page.locator('#noteReferenceList .note-reference-item', { hasText: 'Note cible é' }).click();
        const link = editor(page).locator('a.note-internal-link');
        await expect(link).toHaveText('Note cible é');
        await expect(link).toHaveAttribute('data-note-id', String(target.id));
        await saved(page, ctx.api, id, new RegExp(`note=${target.id}`));
        await expect.poll(async () => (await ctx.api.get(`/notes/${target.id}/backlinks`)).text, 'backlink').toContain(String(id));
        await reopen(page);
        await editor(page).locator('a.note-internal-link').click();
        await expect(page.locator('.noteentry').filter({ hasText: 'je suis la cible' }).first(), 'the link opens the note').toBeVisible();
    });

    test('attachment link: the picker lists the attachments, the link downloads the file', covers('rich.link-attachment'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Pièces', content: '<p>texte</p>' });
        const upload = await ctx.api.ok(ctx.api.call('POST', `/notes/${note.id}/attachments`, { multipart: { file: { name: 'rapport é.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu') } } }));
        await page.goto(`/index.php?note=${note.id}`);
        await expect(editor(page)).toBeVisible();
        await newLine(page);
        await slash(page, 'link-menu', 'link-to-attachment');
        await page.locator('#attachmentPickerList').getByText('rapport é.txt').click();
        const link = editor(page).locator(`a[href*="/attachments/${upload.json.attachment_id}"]`);
        await expect(link).toHaveText('rapport é.txt');
        await saved(page, ctx.api, note.id, new RegExp(upload.json.attachment_id));
    });
}));

test.describe('rich text: images and media', () => withAccount((ctx) => {
    // KNOWN: an upload or a deletion of an attachment bumps the note version, the save right after gets a 409 that notes.js retries, the browser logs it
    test.use({ allowedErrors: [/status of 409/] });
    test('slash Image: the file chooser uploads it and shows it, and it is saved', covers('rich.image-insert'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await openSlash(page);
        await page.locator(`${MAIN} [data-command-id="media"]`).hover();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`${SUB} [data-submenu-id="image"]`).click()]);
        await chooser.setFiles({ name: 'photo é.png', mimeType: 'image/png', buffer: PNG });
        const image = editor(page).locator('img');
        await expect(image).toHaveAttribute('src', new RegExp(`/api/v1/notes/${id}/attachments/`));
        await expect.poll(() => image.evaluate((img) => img.naturalWidth)).toBe(1);
        await saved(page, ctx.api, id, /<img[^>]+attachments/);
        expect((await ctx.api.get(`/notes/${id}/attachments`)).json.attachments[0].original_filename).toBe('photo é.png');
    });

    test('dropping an image file inserts it, another kind of file is ignored', covers('rich.drop-files'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await caretAtEnd(page);
        await drop(page, 'déposée.png', 'image/png', PNG.toString('base64'));
        await expect(editor(page).locator('img'), 'the picture').toHaveAttribute('src', new RegExp(`/api/v1/notes/${id}/attachments/`));
        await saved(page, ctx.api, id, /<img/);
        await drop(page, 'fiche.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64'));
        await expect.poll(async () => (await ctx.api.get(`/notes/${id}/attachments`)).json.attachments.map((item) => item.original_filename), 'a picture only: other files are for the attachment dialog').toEqual(['déposée.png']);
        await expect(editor(page).locator('img')).toHaveCount(1);
    });

    test('image menu: the live entries, then Open and Download', covers('rich.image-menu'), async ({ page, context }) => {
        const note = await ctx.api.createNote({ heading: 'Image', content: '<p>x</p>' });
        await imageIn(page, ctx.api, note.id);
        await editor(page).locator('img').click({ button: 'right' });
        const entries = () => page.locator('.image-menu .image-menu-item').evaluateAll((items) => items.map((item) => item.dataset.action));
        expect(await entries()).toEqual(['view-large', 'copy-image', 'download', 'resize', 'add-link', 'toggle-border', 'toggle-border-no-padding', 'delete-image']);
        const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('.image-menu [data-action="view-large"]').click()]);
        await expect(popup, 'Open').toHaveURL(/attachments/);
        await popup.close();
        await editor(page).locator('img').click({ button: 'right' });
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.image-menu [data-action="download"]').click()]);
        expect(download.suggestedFilename(), 'Download').toMatch(/\S/);
    });

    test('image menu: Resize with the handle changes the width, and it is saved', covers('rich.image-resize'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Image', content: '<p>x</p>' });
        await imageIn(page, ctx.api, note.id);
        const image = editor(page).locator('img');
        await image.evaluate((img) => { img.style.width = '200px'; });
        await image.click({ button: 'right' });
        await page.locator('.image-menu [data-action="resize"]').click();
        const handle = page.locator('.image-resize-handle');
        await expect(handle).toBeVisible();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 60, box.y + 5, { steps: 5 });
        await page.mouse.up();
        await expect.poll(() => image.evaluate((img) => Math.round(img.getBoundingClientRect().width)), 'wider').toBeGreaterThan(220);
        await caretAtEnd(page);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, note.id), 'width stored').toMatch(/<img[^>]*width: ?2\d\dpx/);
        expect(await stored(ctx.api, note.id), 'no handle stored').not.toContain('image-resize-handle');
    });

    test('image menu: both borders go on and off, and are saved', covers('rich.image-border'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Image', content: '<p>x</p>' });
        await imageIn(page, ctx.api, note.id);
        const image = editor(page).locator('img');
        const menu = async (action) => { await image.click({ button: 'right' }); await page.locator(`.image-menu [data-action="${action}"]`).click(); };
        await menu('toggle-border');
        await expect(image).toHaveClass(/(^|\s)img-with-border(\s|$)/);
        await caretAtEnd(page);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, note.id), 'border saved').toMatch(/img-with-border/);
        await menu('toggle-border-no-padding');
        await expect(image, 'the other one replaces it').toHaveClass(/img-with-border-no-padding/);
        await expect(image).not.toHaveClass(/(^|\s)img-with-border(\s|$)/);
        await menu('toggle-border-no-padding');
        await expect(image, 'off').not.toHaveClass(/img-with-border/);
    });

    test('the default border setting: a dropped picture comes with it', covers('rich.image-border'), async ({ page }) => {
        try {
            await ctx.api.ok(ctx.api.put('/settings/default_image_border_no_padding', { value: '1' }));
            const id = await open(page, ctx.api);
            await drop(page, 'cadre.png', 'image/png', PNG.toString('base64'));
            await expect(editor(page).locator('img')).toHaveClass(/img-with-border-no-padding/);
            await saved(page, ctx.api, id, /img-with-border-no-padding/);
        } finally {
            await ctx.api.ok(ctx.api.put('/settings/default_image_border_no_padding', { value: '0' }));
        }
    });

    test('the default border setting: a picture from the slash menu comes with it too', covers('rich.image-border'), async ({ page }) => {
        test.fail(true, 'BUG: slash Image in a rich text note ignores default_image_border_no_padding, drop and paste honour it');
        try {
            await ctx.api.ok(ctx.api.put('/settings/default_image_border_no_padding', { value: '1' }));
            await open(page, ctx.api);
            await newLine(page);
            await openSlash(page);
            await page.locator(`${MAIN} [data-command-id="media"]`).hover();
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`${SUB} [data-submenu-id="image"]`).click()]);
            await chooser.setFiles({ name: 'cadre.png', mimeType: 'image/png', buffer: PNG });
            await expect(editor(page).locator('img')).toHaveAttribute('src', /attachments/);
            await expect(editor(page).locator('img')).toHaveClass(/img-with-border-no-padding/, { timeout: 3_000 });
        } finally {
            await ctx.api.ok(ctx.api.put('/settings/default_image_border_no_padding', { value: '0' }));
        }
    });

    test('image menu: add a link, edit it, remove it', covers('rich.image-link'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Image', content: '<p>x</p>' });
        await imageIn(page, ctx.api, note.id);
        const image = editor(page).locator('img');
        await image.click({ button: 'right' });
        await page.locator('.image-menu [data-action="add-link"]').click();
        await page.fill('#imageLinkModalInput', 'https://example.com/image');
        await page.click('#imageLinkModalConfirmBtn');
        await expect(editor(page).locator('a[href="https://example.com/image"] img'), 'linked').toHaveCount(1);
        await image.click({ button: 'right' });
        await page.locator('.image-menu [data-action="link-submenu"]').hover();
        await page.locator('.image-submenu [data-action="add-link"]').click();
        await page.fill('#imageLinkModalInput', 'https://example.com/autre');
        await page.click('#imageLinkModalConfirmBtn');
        await expect(editor(page).locator('a[href="https://example.com/autre"] img'), 'edited').toHaveCount(1);
        await page.context().route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
        await image.click({ button: 'right' });
        await page.locator('.image-menu [data-action="link-submenu"]').hover();
        const [opened] = await Promise.all([page.context().waitForEvent('page'), page.locator('.image-submenu [data-action="open-link"]').click()]);
        await expect(opened, 'Open link').toHaveURL('https://example.com/autre');
        await opened.close();
        await caretAtEnd(page);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, note.id)).toContain('https://example.com/autre');
        await image.click({ button: 'right' });
        await page.locator('.image-menu [data-action="link-submenu"]').hover();
        await page.locator('.image-submenu [data-action="remove-link"]').click();
        await expect(editor(page).locator('a img'), 'removed').toHaveCount(0);
        await expect(image, 'the picture stays').toHaveCount(1);
    });

    test('image menu: Delete asks, removes the picture and its attachment', covers('rich.image-delete'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Image', content: '<p>x</p>' });
        await imageIn(page, ctx.api, note.id);
        await editor(page).locator('img').click({ button: 'right' });
        await page.locator('.image-menu [data-action="delete-image"]').click();
        await confirmAlert(page);
        await expect(editor(page).locator('img')).toHaveCount(0);
        await expect.poll(() => stored(ctx.api, note.id), 'saved').not.toContain('<img');
        await expect.poll(async () => (await ctx.api.get(`/notes/${note.id}/attachments`)).json.attachments.length, 'attachment gone').toBe(0);
    });

    const players = async (page) => {
        const empty = (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' });
        await page.route('https://www.youtube.com/**', empty);
        await page.route('https://www.youtube-nocookie.com/**', empty);
        await page.route('https://player.bilibili.com/**', empty);
    };

    test('YouTube: a URL gives an embedded player that is saved', covers('rich.video-embed'), async ({ page }) => {
        await players(page);
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'media', 'youtube-video');
        await page.fill('#youtubeModalUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        await page.click('#youtubeModalInsert');
        await expect(editor(page).locator('iframe[src*="dQw4w9WgXcQ"]')).toHaveCount(1);
        await saved(page, ctx.api, id, /dQw4w9WgXcQ/);
        await reopen(page);
        await expect(editor(page).locator('iframe'), 'after reload').toHaveCount(1);
    });

    test.describe('Bilibili', () => {
        // KNOWN: reported by the next test, which holds it
        test.use({ allowedErrors: [/status of 409|scheduleSaveNote/] });
        const insert = async (page) => {
            await players(page);
            const id = await open(page, ctx.api);
            await newLine(page);
            await slash(page, 'media', 'bilibili-video');
            await page.fill('#streamingVideoModalUrl', 'https://www.bilibili.com/video/BV1xx411c7mD');
            await page.click('#streamingVideoModalInsert');
            await expect(editor(page).locator('iframe[src*="BV1xx411c7mD"]')).toHaveCount(1);
            return id;
        };

        test('a URL gives an embedded player that is saved', covers('rich.video-embed'), async ({ page }) => {
            const id = await insert(page);
            await saved(page, ctx.api, id, /BV1xx411c7mD/);
            await reopen(page);
            await expect(editor(page).locator('iframe'), 'after reload').toHaveCount(1);
        });

        test('the insert logs no error and saves by itself, as YouTube does', covers('rich.video-embed'), async ({ page }) => {
            test.fail(true, 'BUG: processStreamingVideoUrl calls window.scheduleSaveNote, which exists nowhere: console error, and no save after the insert');
            const errors = [];
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
            await insert(page);
            expect(errors.join('\n')).not.toContain('scheduleSaveNote');
        });
    });

    test('MP4 video and audio file: the file is uploaded and a player inserted', covers('rich.media-files'), async ({ page }) => {
        const id = await open(page, ctx.api);
        for (const [entry, name, type, tag] of [['mp4-video', 'clip é.mp4', 'video/mp4', 'video'], ['audio-file', 'son é.mp3', 'audio/mpeg', 'audio']]) {
            await newLine(page);
            await openSlash(page);
            await page.locator(`${MAIN} [data-command-id="media"]`).hover();
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`${SUB} [data-submenu-id="${entry}"]`).click()]);
            await chooser.setFiles({ name, mimeType: type, buffer: Buffer.from('fake media') });
            await expect(editor(page).locator(`${tag}, iframe[src*="audio_player"], [data-${tag}]`).first(), name).toBeAttached();
        }
        await page.keyboard.press('Control+s');
        await expect.poll(async () => (await ctx.api.get(`/notes/${id}/attachments`)).json.attachments.length, 'both uploaded').toBe(2);
    });
}));

test.describe('rich text: record audio', () => withAccount((ctx) => {
    test('slash Record audio: start, stop, the recording lands in the note as an attachment', covers('rich.record-audio'), async ({ playwright, browserName }) => {
        // Its own browser, the only way to hand it a fake microphone
        const browser = await playwright[browserName].launch(browserName === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } });
        try {
            const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            await login(page, ctx.account);
            const id = await open(page, ctx.api);
            await newLine(page);
            await slash(page, 'insert', 'record-audio');
            await expect(page.locator('#dictateModal')).toBeVisible();
            await page.locator('#dictateModal button:visible', { hasText: /start/i }).click();
            await expect(page.locator('#dictateTimer'), 'the clock runs').not.toHaveText('0:00', { timeout: 10_000 });
            await page.locator('#dictateModal button:visible', { hasText: /stop|insert/i }).first().click();
            await expect.poll(async () => (await ctx.api.get(`/notes/${id}/attachments`)).json.attachments.length, 'uploaded').toBe(1);
            await expect(editor(page).locator('audio, iframe[src*="audio_player"]').first()).toBeAttached();
        } finally {
            await browser.close();
        }
    });
}));

const TABLE = '<table><tbody><tr><th>Nom</th><th>Val</th></tr><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody></table><p>fin</p>';
const cells = (page) => editor(page).locator('table').evaluate((table) => [...table.rows].map((row) => [...row.cells].map((cell) => cell.textContent.trim())));
const CONTEXT_MENU = '.table-context-menu:not(.md-table-bar-menu):not(.md-table-formula-menu)';
const contextItem = (page, label) => page.locator(`${CONTEXT_MENU} .table-context-menu-item`, { hasText: label });
const bar = (page, action, align) => page.locator(`.md-table-bar .md-table-bar-btn[data-action="${action}"]${align ? `[data-align="${align}"]` : ''}`);

test.describe('rich text: tables', () => withAccount((ctx) => {
    test('insert: the size picker from the slash menu, by the grid and by the keyboard', covers('rich.table-insert'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'insert', 'table');
        await expect(page.locator('.table-picker-size'), 'default size').toHaveText('3 × 3');
        await page.locator('.table-picker-cell[data-row="2"][data-col="4"]').click();
        await expect(editor(page).locator('table tr'), '2 rows').toHaveCount(2);
        await expect(editor(page).locator('table tr').first().locator('th, td'), '4 columns').toHaveCount(4);
        await newLine(page);
        await slash(page, 'insert', 'table');
        await page.keyboard.press('Enter');
        await expect(editor(page).locator('table'), 'Enter inserts the default size (#1686)').toHaveCount(2);
        await expect(editor(page).locator('table').last().locator('tr')).toHaveCount(3);
        await saved(page, ctx.api, id, /<table[\s\S]*<table/);
    });

    test('Tab moves between cells, Tab in the last one adds a row, the text typed is saved', covers('rich.table-keyboard', 'rich.table-text'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        await editor(page).locator('td').first().click();
        await page.keyboard.press('End');
        await page.keyboard.type(' été');
        await page.keyboard.press('Tab');
        await page.keyboard.type('0');
        await expect.poll(async () => (await cells(page))[1].join('|'), 'Tab went to the next cell').toBe('a été|0'); // Tab selects the next cell
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.type('!');
        await expect.poll(async () => (await cells(page))[1][0], 'Shift+Tab came back').toContain('!');
        await editor(page).locator('td').last().click();
        await page.keyboard.press('Tab');
        await page.keyboard.type('nouvelle');
        await expect(editor(page).locator('tr'), 'a row more').toHaveCount(4);
        await saved(page, ctx.api, id, /nouvelle/);
        const content = await stored(ctx.api, id);
        expect(content).toContain('nouvelle');
        await reopen(page);
        expect((await cells(page))[3][0], 'after reload').toBe('nouvelle');
    });

    test('table bar: the live buttons, insert rows and columns on each side', covers('rich.table-toolbar', 'rich.table-rows', 'rich.table-columns'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        await editor(page).locator('td').nth(2).click(); // b
        const live = await page.locator('.md-table-bar .md-table-bar-btn').evaluateAll((items) => items.map((item) => item.dataset.action + (item.dataset.align || '')));
        expect(live).toEqual(['insertRowAbove', 'insertRowBelow', 'insertColLeft', 'insertColRight', 'alignleft', 'aligncenter', 'alignright', 'delete', 'formulas']);
        const onB = () => editor(page).locator('td').filter({ hasText: /^b$/ }).click();
        await bar(page, 'insertRowAbove').click();
        expect((await cells(page)).map((row) => row[0]), 'above').toEqual(['Nom', 'a', '', 'b']);
        await onB();
        await bar(page, 'insertRowBelow').click();
        expect((await cells(page)).map((row) => row[0]), 'below').toEqual(['Nom', 'a', '', 'b', '']);
        await onB();
        await bar(page, 'insertColLeft').click();
        expect((await cells(page))[3], 'left').toEqual(['', 'b', '2']);
        await onB();
        await bar(page, 'insertColRight').click();
        expect((await cells(page))[3], 'right').toEqual(['', 'b', '', '2']);
        await page.keyboard.type('saisi');
        await saved(page, ctx.api, id, /saisi/);
        await reopen(page);
        expect((await cells(page)).length, 'rows after reload').toBe(5);
        expect((await cells(page))[0].length, 'columns after reload').toBe(4);
    });

    test('table bar: align a column, and the delete menu removes a row, a column, the table', covers('rich.table-toolbar', 'rich.table-align', 'rich.table-rows', 'rich.table-columns', 'rich.table-delete'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        await editor(page).locator('td').nth(1).click(); // 1
        for (const align of ['center', 'right', 'left']) {
            await bar(page, 'align', align).click();
            for (const cell of ['1', '2', 'Val']) await expect(editor(page).locator('th, td').filter({ hasText: new RegExp(`^${cell}$`) }), `${cell} ${align}`).toHaveCSS('text-align', align);
        }
        await bar(page, 'align', 'center').click();
        await saved(page, ctx.api, id, /text-align: center/);
        await bar(page, 'delete').click();
        await page.locator('.md-table-bar-menu [data-action="deleteRow"]').click();
        expect((await cells(page)).map((row) => row[0]), 'row gone').toEqual(['Nom', 'b']);
        await editor(page).locator('td').nth(1).click();
        await bar(page, 'delete').click();
        await page.locator('.md-table-bar-menu [data-action="deleteCol"]').click();
        expect((await cells(page))[0], 'column gone').toEqual(['Nom']);
        await editor(page).locator('td').first().click();
        await bar(page, 'delete').click();
        await page.locator('.md-table-bar-menu [data-action="deleteTable"]').click();
        await confirmAlert(page);
        await expect(editor(page).locator('table'), 'table gone').toHaveCount(0);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id), 'saved without it').not.toContain('<table');
    });

    test('context menu: the live entries, rows, columns, alignment of a column, a row, a cell', covers('rich.table-context-menu', 'rich.table-rows', 'rich.table-columns', 'rich.table-align'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        const cell = (text) => editor(page).locator('th, td').filter({ hasText: new RegExp(`^${text}$`) });
        // Near the corner: the middle of a low cell may be under the "add a row" handle
        const right = (text) => cell(text).click({ button: 'right', position: { x: 4, y: 4 } });
        await right('b');
        const labels = await page.locator(`${CONTEXT_MENU} > .table-context-menu-item, ${CONTEXT_MENU} > .table-context-menu-align-row`).evaluateAll((items) => items.filter((item) => item.offsetParent).map((item) => item.textContent.replace(/[^\p{L} ]/gu, '').trim()));
        expect(labels).toEqual(['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', expect.stringContaining('Align column'), expect.stringContaining('Align row'), expect.stringContaining('Align cell'), 'Fit table to content', expect.stringContaining('Formulas'), 'Delete row', 'Delete column', 'Delete table']);
        await contextItem(page, 'Insert row above').click();
        expect((await cells(page)).map((row) => row[0]), 'row above').toEqual(['Nom', 'a', '', 'b']);
        await right('b');
        await contextItem(page, 'Insert row below').click();
        expect((await cells(page)).length, 'row below').toBe(5);
        await right('b');
        await contextItem(page, 'Insert column left').click();
        expect((await cells(page))[3], 'column left').toEqual(['', 'b', '2']);
        await right('b');
        await contextItem(page, 'Insert column right').click();
        expect((await cells(page))[3], 'column right').toEqual(['', 'b', '', '2']);
        await right('b');
        await page.locator(`${CONTEXT_MENU} .table-context-menu-align-row`, { hasText: 'Align cell' }).locator('.table-context-menu-align-btn').nth(2).click();
        await expect(cell('b'), 'cell').toHaveCSS('text-align', 'right');
        await right('a');
        await page.locator(`${CONTEXT_MENU} .table-context-menu-align-row`, { hasText: 'Align row' }).locator('.table-context-menu-align-btn').nth(1).click();
        await expect(cell('1'), 'row').toHaveCSS('text-align', 'center');
        await right('2');
        await page.locator(`${CONTEXT_MENU} .table-context-menu-align-row`, { hasText: 'Align column' }).locator('.table-context-menu-align-btn').nth(2).click();
        await expect(cell('Val'), 'column').toHaveCSS('text-align', 'right');
        await saved(page, ctx.api, id, /text-align: right/);
        await right('b');
        await contextItem(page, 'Delete row').click();
        expect((await cells(page)).map((row) => row.join('')).join('|'), 'delete row').not.toContain('b');
        await right('a');
        await contextItem(page, 'Delete column').click();
        expect((await cells(page))[0], 'delete column').not.toContain('Nom');
        await editor(page).locator('th').first().click({ button: 'right' });
        await contextItem(page, 'Delete table').click();
        await confirmAlert(page);
        await expect(editor(page).locator('table')).toHaveCount(0);
    });

    test('context menu: fit to content, then full width, each offered when it changes something', covers('rich.table-context-menu', 'rich.table-widths'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        const width = () => editor(page).locator('table').evaluate((table) => Math.round(table.getBoundingClientRect().width));
        const noteWidth = await editor(page).evaluate((note) => note.clientWidth);
        const right = () => editor(page).locator('td').first().click({ button: 'right' });
        await right();
        await expect(contextItem(page, 'Full-width table'), 'already full width').toBeHidden();
        await contextItem(page, 'Fit table to content').click();
        await expect.poll(width, 'fit').toBeLessThan(noteWidth * 0.7);
        await saved(page, ctx.api, id, /<table[^>]*(class|style)="[^"]*/);
        await reopen(page);
        await expect.poll(width, 'fit after reload').toBeLessThan(noteWidth * 0.7);
        await right();
        await expect(contextItem(page, 'Fit table to content'), 'already fit').toBeHidden();
        await contextItem(page, 'Full-width table').click();
        await expect.poll(width, 'full width').toBeGreaterThan(noteWidth * 0.9);
    });

    test('dragging a column border resizes it and is saved, Reset column widths takes that back', covers('rich.table-widths', 'rich.table-context-menu'), async ({ page }) => {
        const id = await open(page, ctx.api, TABLE);
        const first = editor(page).locator('th').first();
        const box = await first.boundingBox();
        const border = box.x + box.width;
        await page.mouse.move(border, box.y + 10);
        await page.mouse.move(border, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(border + 60, box.y + 12, { steps: 5 });
        await page.mouse.up();
        await expect.poll(async () => (await first.boundingBox()).width, 'wider').toBeGreaterThan(box.width + 30);
        await caretAtEnd(page);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id), 'stored as a percentage').toMatch(/<th[^>]*width: ?[\d.]+%/);
        await editor(page).locator('td').first().click({ button: 'right' });
        await contextItem(page, 'Reset column widths').click();
        await expect(first, 'reset').not.toHaveAttribute('style', /width: ?[\d.]+%/);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id), 'reset saved').not.toMatch(/<th[^>]*width: ?[\d.]+%/);
    });

    for (const [kind, label, expected] of [['sum', 'Sum', '6'], ['avg', 'Average', '2'], ['min', 'Minimum', '1'], ['max', 'Maximum', '3'], ['count', 'Count', '3'], ['prod', 'Product', '6']]) {
        test(`formula ${kind}: a column total, recomputed, and saved`, covers('rich.table-formulas'), async ({ page }) => {
            const id = await open(page, ctx.api, '<table><tbody><tr><th>N</th></tr><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr><tr><td></td></tr></tbody></table><p>fin</p>');
            await editor(page).locator('td').last().click();
            await bar(page, 'formulas').click();
            const menu = page.locator('.md-table-formula-menu');
            await menu.locator('.table-context-menu-parent', { hasText: 'Column' }).hover();
            await menu.locator(`[data-formula="${kind}-col"]`).click();
            await expect(editor(page).locator(`td[data-formula="${kind}-col"]`), label).toHaveText(expected);
            await saved(page, ctx.api, id, new RegExp(`data-formula="${kind}-col"`));
        });
    }

    test('formulas: a row formula from the context menu follows an edit, and can be removed', covers('rich.table-formulas', 'rich.table-context-menu'), async ({ page }) => {
        const id = await open(page, ctx.api, '<table><tbody><tr><td>4</td><td>5</td><td>x</td></tr></tbody></table><p>fin</p>');
        const total = editor(page).locator('td').nth(2);
        await total.click({ button: 'right' });
        await page.locator(`${CONTEXT_MENU} .table-context-menu-parent`, { hasText: 'Formulas' }).hover();
        await page.locator(`${CONTEXT_MENU} .table-context-menu-parent .table-context-menu-parent`, { hasText: 'Row' }).hover();
        await page.locator(`${CONTEXT_MENU} [data-formula="sum-row"]`).click();
        await expect(total, 'sum').toHaveText('9');
        await editor(page).locator('td').first().click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.keyboard.type('6');
        await editor(page).locator('td').nth(1).click();
        await expect(total, 'recomputed').toHaveText('11');
        await saved(page, ctx.api, id, /data-formula="sum-row"[^>]*>\s*11/);
        await reopen(page);
        await expect(editor(page).locator('td').nth(2), 'after reload').toHaveText('11');
        await editor(page).locator('td').nth(2).click();
        await bar(page, 'formulas').click();
        await page.locator('.md-table-formula-menu .table-context-menu-item[data-item="removeFormula"]').click();
        await expect(editor(page).locator('td[data-formula]'), 'removed').toHaveCount(0);
    });

    const dragCells = async (page, from, to) => {
        const start = await editor(page).locator('td').nth(from).boundingBox();
        const end = await editor(page).locator('td').nth(to).boundingBox();
        await page.mouse.move(start.x + 5, start.y + 5);
        await page.mouse.down();
        await page.mouse.move(end.x + 5, end.y + 5, { steps: 5 });
        await page.mouse.up();
    };

    test('a range of cells: dragging highlights them, a click elsewhere drops it', covers('rich.table-cell-selection'), async ({ page }) => {
        await open(page, ctx.api, TABLE);
        await dragCells(page, 0, 2);
        await expect(editor(page).locator('td.pz-cell-selected'), 'a and b').toHaveText(['a', 'b']);
        await editor(page).getByText('fin').click();
        await expect(editor(page).locator('td.pz-cell-selected'), 'dropped').toHaveCount(0);
    });

    test('a range of cells: Ctrl+X puts them on the clipboard and empties them', covers('rich.table-cell-selection'), async ({ page, context }) => {
        test.fail(true, 'BUG: Ctrl+C, Ctrl+X, Delete on dragged cells do nothing, isNativeSelectionOutsideTable counts the collapsed caret Chromium leaves at the start of the note as a selection elsewhere');
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await open(page, ctx.api, TABLE);
        await dragCells(page, 0, 2);
        await page.keyboard.press('Control+x');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: 'TSV', timeout: 3_000 }).toBe('a\nb');
        expect((await cells(page)).map((row) => row[0]), 'emptied').toEqual(['Nom', '', '']);
    });

    test('pasting tabular text in a cell fills the cells from there, adding what is missing', covers('rich.table-cell-selection', 'rich.paste-plain'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const id = await open(page, ctx.api, TABLE);
        await page.evaluate(() => navigator.clipboard.writeText('x\ty\nz\tw'));
        await editor(page).locator('td').nth(3).click(); // 2
        await page.keyboard.press('Control+v');
        await expect.poll(() => cells(page), 'filled and extended').toEqual([['Nom', 'Val', ''], ['a', '1', ''], ['b', 'x', 'y'], ['', 'z', 'w']]);
        await saved(page, ctx.api, id, /<td[^>]*>w<\/td>/);
    });

    test('the Copy entry of the table menu shows on text selected in a cell, and copies it', covers('rich.table-context-menu'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        // Wider than 800px, a right click on a selection opens its formatting menu instead (js/slash-command.js)
        await page.setViewportSize({ width: 790, height: 900 });
        await open(page, ctx.api, TABLE);
        await editor(page).locator('td').first().click({ button: 'right', position: { x: 4, y: 4 } });
        await expect(contextItem(page, 'Copy'), 'nothing selected, nothing to copy').toBeHidden();
        await editor(page).getByText('fin').click();
        await expect(page.locator(CONTEXT_MENU), 'a click elsewhere closes the menu').toBeHidden();
        // On the text of the cell: its padding does not take the caret
        await editor(page).locator('td').nth(1).click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        expect(await page.evaluate(() => String(window.getSelection())), 'the text of the cell is selected').toBe('1');
        // On the selected text itself, or the browser drops the selection first
        const text = await editor(page).locator('td').nth(1).evaluate((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            const rect = range.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
        await page.mouse.click(text.x, text.y, { button: 'right' });
        await contextItem(page, 'Copy').click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), 'the text').toBe('1');
    });

    test('hover handles add a row and a column at the end of the table', covers('rich.table-rows', 'rich.table-columns'), async ({ page }) => {
        await open(page, ctx.api, TABLE);
        await editor(page).locator('table').hover();
        await page.locator('.md-table-handle-row').click();
        await expect(editor(page).locator('tr'), 'row').toHaveCount(4);
        await editor(page).locator('table').hover();
        await page.locator('.md-table-handle-column').click();
        await expect(editor(page).locator('tr').first().locator('th, td'), 'column').toHaveCount(3);
    });
}));

const LANGUAGES = ['bash', 'csharp', 'cpp', 'css', 'go', 'html', 'java', 'javascript', 'json', 'markdown', 'php', 'powershell', 'python', 'ruby', 'rust', 'sql', 'typescript', 'xml', 'yaml'];
test.describe('rich text: code blocks', () => withAccount((ctx) => {
    test('slash Code: every language, plain block and code block', covers('rich.code-languages', 'rich.code-block'), async ({ page }) => {
        test.setTimeout(300_000);
        const id = await open(page, ctx.api);
        for (const language of LANGUAGES) {
            await newLine(page);
            await slash(page, 'code', `code-${language}`);
            await page.keyboard.type(`dans ${language}`);
            const block = editor(page).locator('pre').last();
            await expect(block, language).toHaveAttribute('data-language', language);
            await expect(block.locator('code'), `${language} text`).toHaveText(`dans ${language}`);
            await expect(block.locator('code'), `${language} class`).toHaveClass(new RegExp(`language-${language}`));
        }
        await newLine(page);
        await slash(page, 'code', 'code-normal');
        await page.keyboard.type('sans couleur');
        await expect(editor(page).locator('pre').last(), 'code block').toHaveAttribute('data-language', 'CODE');
        await newLine(page);
        await slash(page, 'code', 'plain-block');
        await page.keyboard.type('bloc simple');
        await expect(editor(page).locator('pre.plain-block'), 'plain block').toHaveText(/bloc simple/);
        await saved(page, ctx.api, id, /bloc simple/);
        const content = await stored(ctx.api, id);
        for (const language of LANGUAGES) expect(content, `${language} stored`).toContain(`data-language="${language}"`);
        expect(content, 'buttons are not stored').not.toContain('code-block-copy-btn');
    });

    test('a real keyword gets coloured, Enter stays in the block', covers('rich.code-languages'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'code', 'code-python');
        await page.keyboard.type('def f():');
        await page.keyboard.press('Enter');
        await page.keyboard.type('return 1');
        await expect(editor(page).locator('pre'), 'one block').toHaveCount(1);
        await expect.poll(() => editor(page).locator('pre code').innerText(), 'two lines').toBe('def f():\nreturn 1');
        await saved(page, ctx.api, id, /return 1/);
        await reopen(page);
        await expect(editor(page).locator('pre code'), 'highlighted after reload').toHaveClass(/hljs/);
        // The tokens are painted over the text, through the CSS Custom Highlight API (#1695)
        await expect.poll(() => page.evaluate(() => CSS.highlights.get('pz-syntax-keyword')?.size || 0), 'a keyword token').toBeGreaterThan(0);
    });

    test('toolbar button and Ctrl+Shift+B turn lines into a block and back', covers('rich.code-block', 'rich.shortcuts'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>ligne bouton</p><p>ligne raccourci</p><p>ligne menu</p>');
        await selectLine(page, 'ligne bouton');
        await toolbar(page, 'toggle-code-block').click();
        await expect(editor(page).locator('pre'), 'button').toContainText('ligne bouton');
        await selectLine(page, 'ligne raccourci');
        await page.keyboard.press('Control+Shift+b');
        await expect(editor(page).locator('pre'), 'shortcut').toHaveCount(2);
        await selectLine(page, 'ligne menu');
        await slash(page, 'code', 'code-normal');
        await expect(editor(page).locator('pre'), 'selection menu').toHaveCount(3);
        await saved(page, ctx.api, id, /<pre[\s\S]*ligne menu/);
        await editor(page).locator('pre').first().click();
        await page.keyboard.press('Control+Shift+b');
        await expect(editor(page).locator('pre'), 'unwrapped').toHaveCount(2);
        await expect(editor(page)).toContainText('ligne bouton');
    });

    test('the language dialog: lists every language, filters, changes the block, removes the tag', covers('rich.code-language-modal'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>début</p><pre data-language="python"><code data-language="python" class="language-python">x = 1</code></pre><p>fin</p>');
        const block = editor(page).locator('pre');
        await block.hover();
        await page.locator('.code-block-lang-btn').first().click();
        const modal = page.locator('#codeBlockLanguageModal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.code-block-language-item'), 'Code + the languages').toHaveCount(LANGUAGES.length + 1);
        await expect(modal.locator('.code-block-language-item.selected')).toHaveText(/Python/);
        await page.fill('#codeBlockLanguageFilter', 'typesc');
        await expect(modal.locator('.code-block-language-item')).toHaveCount(1);
        await modal.locator('.code-block-language-item').click();
        await expect(modal).toBeHidden();
        await expect(block, 'changed').toHaveAttribute('data-language', 'typescript');
        await caretAtEnd(page);
        await saved(page, ctx.api, id, /data-language="typescript"/);
        await block.hover();
        await page.locator('.code-block-lang-btn').first().click();
        await modal.locator('[data-action="close-modal"]').click();
        await expect(block, 'Cancel changes nothing').toHaveAttribute('data-language', 'typescript');
        await block.hover();
        await page.locator('.code-block-lang-btn').first().click();
        await modal.locator('[data-action="remove-code-block-language"]').click();
        await expect(editor(page).locator('pre.plain-block'), 'plain now').toHaveText(/x = 1/);
        await caretAtEnd(page);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id), 'tag gone').not.toContain('typescript');
    });

    test('the delete button asks, removes the block, and Ctrl+Z brings it back', covers('rich.code-delete-undo'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>début</p><pre data-language="php"><code class="language-php">echo 1;</code></pre><p>fin</p>');
        await editor(page).locator('pre').hover();
        await page.locator('.code-block-delete-btn').first().click();
        await confirmAlert(page);
        await expect(editor(page).locator('pre'), 'gone').toHaveCount(0);
        await page.keyboard.press('Control+z');
        await expect(editor(page).locator('pre'), 'back').toContainText('echo 1;');
        await caretAtEnd(page);
        await saved(page, ctx.api, id, /echo 1;/);
    });

    test('the settings: line numbers on for every block, word wrap off', covers('rich.code-line-numbers', 'rich.code-word-wrap'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>début</p><pre data-language="php"><code class="language-php">a\nb</code></pre><p>fin</p>');
        await editor(page).locator('pre').hover();
        await expect(page.locator('.code-block-line-numbers-btn').first(), 'off by default').toHaveAttribute('aria-pressed', 'false');
        try {
            await ctx.api.ok(ctx.api.put('/settings/code_block_line_numbers', { value: '1' }));
            await ctx.api.ok(ctx.api.put('/settings/code_block_word_wrap', { value: '0' }));
            await reopen(page);
            await editor(page).locator('pre').hover();
            await expect(page.locator('.code-block-line-numbers-btn').first(), 'shown').toHaveAttribute('aria-pressed', 'true');
            await expect(editor(page).locator('pre code'), 'no wrap').toHaveCSS('white-space', /^(pre|nowrap)$/);
        } finally {
            await ctx.api.ok(ctx.api.put('/settings/code_block_line_numbers', { value: '0' }));
            await ctx.api.ok(ctx.api.put('/settings/code_block_word_wrap', { value: '1' }));
        }
        expect(await stored(ctx.api, id), 'a display setting, the note did not change').not.toContain('data-line-numbers');
    });

    test('the line numbers button shows them, and that is saved with the block', covers('rich.code-line-numbers'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>début</p><pre data-language="php"><code class="language-php">a\nb</code></pre><p>fin</p>');
        await editor(page).locator('pre').hover();
        const button = page.locator('.code-block-line-numbers-btn').first();
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(editor(page).locator('pre')).toHaveAttribute('data-line-numbers', '1');
        await caretAtEnd(page);
        await saved(page, ctx.api, id, /data-line-numbers="1"/);
    });
}));

test.describe('rich text: search and replace, undo, settings', () => withAccount((ctx) => {
    const bar = (id, name) => `#${name}${id}`;

    test('search bar: from the toolbar, Ctrl+Shift+F, count, next and previous, close', covers('rich.search-replace'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>chat un chat</p><p>le chat é</p>');
        await toolbar(page, 'open-search-replace-modal').click();
        await expect(page.locator(bar(id, 'searchReplaceBar')), 'toolbar').toBeVisible();
        await page.fill(bar(id, 'searchInput'), 'chat');
        await expect(page.locator(bar(id, 'searchCount')), 'count').toHaveText('3 results');
        await expect(editor(page).locator('.search-replace-highlight')).toHaveCount(3);
        const active = () => editor(page).locator('.search-replace-highlight').evaluateAll((items) => items.findIndex((item) => item.classList.contains('active')));
        await expect.poll(active, 'the first is current').toBe(0);
        await page.click(bar(id, 'searchNextBtn'));
        await expect.poll(active, 'next').toBe(1);
        await page.click(bar(id, 'searchPrevBtn'));
        await expect.poll(active, 'previous').toBe(0);
        await page.click(bar(id, 'searchCloseBtn'));
        await expect(page.locator(bar(id, 'searchReplaceBar')), 'closed').toBeHidden();
        await expect(editor(page).locator('.search-replace-highlight'), 'marks gone').toHaveCount(0);
        await editor(page).click();
        await page.keyboard.press('Control+Shift+f');
        await expect(page.locator(bar(id, 'searchReplaceBar')), 'Ctrl+Shift+F').toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(bar(id, 'searchReplaceBar')), 'Escape').toBeHidden();
    });

    test('replace one, replace all: the formatting around the text stays, and it is saved without marks', covers('rich.search-replace', 'rich.search-replace-format'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p><b>chat gras</b> et <i>le chat penché</i> et chat</p>');
        await toolbar(page, 'open-search-replace-modal').click();
        await page.fill(bar(id, 'searchInput'), 'chat');
        await page.click(bar(id, 'searchToggleReplaceBtn'));
        await page.fill(bar(id, 'replaceInput'), 'chien é');
        await page.click(bar(id, 'replaceBtn'));
        await expect(editor(page).locator('b'), 'replace one, in the bold').toHaveText('chien é gras');
        await expect(editor(page).locator('i'), 'the next one is left').toHaveText('le chat penché');
        await page.click(bar(id, 'replaceAllBtn'));
        await expect(editor(page).locator('i'), 'replace all, in the italic').toHaveText('le chien é penché');
        await expect(editor(page)).not.toContainText('chat');
        await expect(page.locator(bar(id, 'searchCount')), 'the report').toHaveText('Replaced 2 matches');
        await page.click(bar(id, 'searchCloseBtn'));
        await caretAtEnd(page);
        await saved(page, ctx.api, id, /<b>chien\sé\sgras<\/b>\set\s<i>le\schien\sé\spenché<\/i>\set\schien\sé/);
        expect(await stored(ctx.api, id), 'no highlight stored').not.toContain('search-replace-highlight');
    });

    test('replace all keeps the format of a match at the very start of a bold or italic, with a space in the new text', covers('rich.search-replace-format'), async ({ page }) => {
        test.fail(true, 'BUG: Replace all puts "chien é" before the <i> when the match opens it: x chien é<i>&nbsp;penché</i>, Chromium insertText with a space leaves the inline');
        const id = await open(page, ctx.api, '<p>x <i>chat penché</i></p>');
        await toolbar(page, 'open-search-replace-modal').click();
        await page.fill(bar(id, 'searchInput'), 'chat');
        await page.click(bar(id, 'searchToggleReplaceBtn'));
        await page.fill(bar(id, 'replaceInput'), 'chien é');
        await page.click(bar(id, 'replaceAllBtn'));
        await expect(editor(page).locator('i')).toHaveText('chien é penché', { timeout: 3_000 });
    });

    test('Ctrl+Z and Ctrl+Y take back and redo typing, a format, and the slash inserts', covers('rich.undo-redo', 'rich.shortcuts'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await caretAtEnd(page);
        await page.keyboard.type(' plus');
        await expect(editor(page)).toContainText('été plus');
        await page.keyboard.press('Control+z');
        await expect(editor(page), 'typing undone').not.toContainText('plus');
        await page.keyboard.press('Control+y');
        await expect(editor(page), 'typing redone').toContainText('été plus');
        await selectLine(page, 'Bonjour');
        await toolbar(page, 'exec-bold').click();
        await expect(editor(page).locator('b')).toHaveCount(1);
        await page.keyboard.press('Control+z');
        await expect(editor(page).locator('b'), 'bold undone').toHaveCount(0);
        await page.keyboard.press('Control+Shift+z');
        await expect(editor(page).locator('b'), 'bold redone').toHaveCount(1);
        await newLine(page);
        await slash(page, 'title', 'h2');
        await page.keyboard.type('x');
        await expect(editor(page).locator('h2')).toHaveCount(1);
        await page.keyboard.press('Control+z');
        await page.keyboard.press('Control+z');
        await expect(editor(page).locator('h2'), 'heading undone').toHaveCount(0);
        await caretAtEnd(page);
        await slash(page, 'date', 'now', 'today');
        await expect(editor(page), 'date inserted').toContainText(dayOffset(0));
        await page.keyboard.press('Control+z');
        await expect(editor(page), 'date undone').not.toContainText(dayOffset(0));
        await saved(page, ctx.api, id, /<b>/);
    });

    test('the Save button and Ctrl+S store the note at once, autosave without either', covers('rich.save'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await caretAtEnd(page);
        await page.keyboard.type(' sauvé1');
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id), 'Ctrl+S').toContain('sauvé1');
        await page.keyboard.type(' sauvé2');
        await toolbar(page, 'save-note').click();
        await expect.poll(() => stored(ctx.api, id), 'button').toContain('sauvé2');
        await caretAtEnd(page);
        await page.keyboard.type(' sauvé3');
        await expect.poll(() => stored(ctx.api, id), { message: 'autosave', timeout: 15_000 }).toContain('sauvé3');
    });

    test('the spell check setting drives the attribute of the note', covers('rich.spellcheck'), async ({ page }) => {
        await open(page, ctx.api);
        await expect(editor(page), 'off by default').toHaveAttribute('spellcheck', 'false');
        try {
            await ctx.api.ok(ctx.api.put('/settings/spellcheck_html_notes', { value: '1' }));
            await reopen(page);
            await expect(editor(page), 'on').toHaveAttribute('spellcheck', 'true');
            await expect(editor(page), 'with the language').toHaveAttribute('lang', 'en');
        } finally {
            await ctx.api.ok(ctx.api.put('/settings/spellcheck_html_notes', { value: '0' }));
        }
    });

    test('"/" in the title offers emoji and dates only, and inserts there', covers('rich.slash-title'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>x</p>', 'Titre avec menu');
        const title = page.locator('input.css-title').first();
        await title.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' /');
        await expect(page.locator(MAIN)).toBeVisible();
        expect(await liveMain(page), 'the title menu').toEqual(['emoji', 'date']);
        await pick(page, 'date', 'now', 'today');
        const expected = new RegExp(`^Titre avec menu ${dayOffset(0)}\\s*$`);
        await expect(title, 'the date in the title').toHaveValue(expected);
        await page.keyboard.press('Control+s');
        await expect.poll(async () => (await ctx.api.getNote(id)).heading, 'saved').toMatch(expected);
    });

    test('the toolbar shows the formatting buttons on a selection only, the note actions otherwise', covers('rich.format-toolbar'), async ({ page }) => {
        await open(page, ctx.api);
        const format = page.locator('.note-edit-toolbar .text-format-btn:visible');
        await caretAtEnd(page);
        await expect(format, 'nothing selected').toHaveCount(0);
        await expect(toolbar(page, 'save-note')).toBeVisible();
        await selectLine(page, 'Bonjour');
        const actions = await format.evaluateAll((items) => items.map((item) => item.dataset.action));
        expect(actions).toEqual(['exec-bold', 'exec-italic', 'exec-underline', 'exec-strikethrough', 'add-link', 'toggle-red-color', 'toggle-yellow-highlight', 'exec-unordered-list', 'exec-ordered-list', 'exec-task-list', 'change-font-size', 'change-alignment', 'toggle-code-block', 'toggle-inline-code', 'exec-remove-format', 'open-search-replace-modal']);
        await page.keyboard.press('End');
        await expect(format, 'selection gone').toHaveCount(0);
    });

    test('Enter and Backspace around a heading, and a line typed under an image, do not lose text', covers('rich.typing'), async ({ page }) => {
        const id = await open(page, ctx.api, '<h2>Titre</h2><p>suite</p>');
        await editor(page).getByText('Titre').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Enter');
        await expect(editor(page).locator('h2'), 'a plain line opens above').toHaveText('Titre');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.type('au-dessus');
        await expect(editor(page).locator('h2 + *, *:has(+ h2)').first()).toContainText('au-dessus');
        await saved(page, ctx.api, id, /au-dessus[\s\S]*<h2[^>]*>Titre/);
    });
}));

test.describe('rich text: floating toolbar', () => withAccount((ctx) => {
    test.beforeEach(async () => { await ctx.api.ok(ctx.api.put('/settings/format_toolbar_mode', { value: 'floating' })); });
    test.afterEach(async () => { await ctx.api.ok(ctx.api.put('/settings/format_toolbar_mode', { value: 'toolbar' })); });

    test('over the selection: its buttons work, it follows the text, and goes when the selection does', covers('rich.floating-toolbar'), async ({ page }) => {
        const id = await open(page, ctx.api);
        const floating = page.locator('.floating-format-toolbar');
        await caretAtEnd(page);
        await expect(floating, 'nothing selected').toBeHidden();
        await selectLine(page, 'Bonjour');
        await expect(floating).toBeVisible();
        const box = await floating.boundingBox();
        const text = await editor(page).getByText('Bonjour').boundingBox();
        expect(Math.abs(box.y + box.height - text.y), 'sits against the line').toBeLessThan(box.height + 30);
        await expect(toolbar(page, 'save-note'), 'the note actions stay in the row').toBeVisible();
        await floating.locator('[data-action="exec-bold"]').click();
        await expect(editor(page).locator('b'), 'bold').toHaveText('Bonjour été');
        await floating.locator('[data-action="toggle-red-color"]').click();
        await page.locator('.color-palette-popup .color-item[title="Blue"]').click();
        await expect(editor(page).locator('[style*="--pz-color-blue,"]'), 'colour').toHaveCount(1);
        await saved(page, ctx.api, id, /<b[ >]/);
        await page.keyboard.press('End');
        await expect(floating, 'selection gone').toBeHidden();
    });

    test('a narrow window sends the extra buttons to its own "…" menu, whose entries still work', covers('rich.floating-toolbar'), async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 700 });
        await open(page, ctx.api);
        await selectLine(page, 'Bonjour');
        const more = page.locator('.floating-format-toolbar .btn-floating-format-more');
        await expect(more).toBeVisible();
        await more.click();
        const entries = page.locator('.floating-format-more-menu .dropdown-item');
        expect(await entries.count(), 'some moved').toBeGreaterThan(0);
        await page.locator('.floating-format-more-menu .dropdown-item[data-selector=".btn-inline-code"]').click();
        await expect(editor(page).locator('code'), 'the entry acts on the selection').toHaveText('Bonjour été');
    });
}));

test.describe('rich text: toolbar overflow', () => withAccount((ctx) => {
    test('on a selection, what does not fit goes to "…" and its entries act on the selection', covers('rich.toolbar-overflow'), async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 700 });
        await open(page, ctx.api);
        await selectLine(page, 'Bonjour');
        const button = page.locator('.note-edit-toolbar .btn-toolbar-overflow');
        await expect(button).toBeVisible();
        await button.click();
        const menu = page.locator('.toolbar-overflow-menu');
        await expect(menu).toBeVisible();
        const selectors = await menu.locator('.dropdown-item').evaluateAll((items) => items.map((item) => item.dataset.selector));
        expect(selectors.length, 'buttons moved').toBeGreaterThan(0);
        for (const selector of selectors) {
            await expect(page.locator(`.note-edit-toolbar ${selector}:visible`), `${selector} is not also in the row`).toHaveCount(0);
        }
        await menu.locator('.dropdown-item[data-selector=".btn-eraser"]').click();
        await expect(editor(page), 'the selection survived').toContainText('Bonjour été');
    });

    test('with no selection, the 3-dot menu runs its entries, Search and replace and Audio among them', covers('rich.toolbar-overflow', 'rich.media-files'), async ({ page }) => {
        await page.setViewportSize({ width: 620, height: 700 });
        const id = await open(page, ctx.api);
        const more = page.locator('.note-edit-toolbar [data-action="toggle-mobile-toolbar-menu"]:visible');
        await more.click();
        const menu = page.locator('.mobile-toolbar-menu:visible');
        await expect(menu).toBeVisible();
        await menu.locator('.dropdown-item[data-selector=".btn-search-replace"]').click();
        await expect(page.locator(`#searchReplaceBar${id}`), 'a trigger entry clicks the hidden button').toBeVisible();
        await page.click(`#searchCloseBtn${id}`);
        await editor(page).click({ position: { x: 3, y: 3 } });
        await more.click();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.mobile-toolbar-menu:visible [data-action="insert-audio-file"]').click()]);
        await chooser.setFiles({ name: 'menu.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake') });
        await expect.poll(async () => (await ctx.api.get(`/notes/${id}/attachments`)).json.attachments.map((item) => item.original_filename), 'the audio is uploaded').toEqual(['menu.mp3']);
    });
}));

test.describe('rich text: mobile editor bar', () => {
    // KNOWN: the 409 of an upload, see the images and media tests
    test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, allowedErrors: [/status of 409/] });
    withAccount((ctx) => {
        const barBtn = (page, id) => page.locator(`#${id}`);
        const shown = (page) => expect(page.locator('#mobileEditorBar')).toBeVisible();
        // What a phone's keyboard does: the visible part of the page gets shorter
        const keyboardUp = async (page) => { await page.setViewportSize({ width: 390, height: 420 }); await shown(page); };

        test('the buttons format the selection', covers('rich.mobile-bar'), async ({ page }) => {
            const id = await open(page, ctx.api, '<p>Bonjour été</p>');
            await selectLine(page, 'Bonjour');
            await shown(page);
            for (const [button, tag] of [['mobileBarBold', 'b'], ['mobileBarItalic', 'i'], ['mobileBarUnderline', 'u'], ['mobileBarStrikethrough', 'strike, s']]) {
                await barBtn(page, button).click();
                await expect(editor(page).locator(tag), button).toHaveCount(1);
            }
            await saved(page, ctx.api, id, /<b>/);
            await barBtn(page, 'mobileBarClearFormat').click();
            await expect(editor(page).locator('b, i, u, s, strike'), 'clear').toHaveCount(0);
            await barBtn(page, 'mobileBarListUl').click();
            await expect(editor(page).locator('ul li'), 'bullets').toHaveCount(1);
            await barBtn(page, 'mobileBarListUl').click();
            await barBtn(page, 'mobileBarListOl').click();
            await expect(editor(page).locator('ol li'), 'numbers').toHaveCount(1);
            await barBtn(page, 'mobileBarListOl').click();
            await barBtn(page, 'mobileBarColor').click();
            await page.locator('.color-palette-popup .color-item[title="Red"]').click();
            await expect(editor(page).locator('[style*="--pz-color-red,"]'), 'colour').toHaveCount(1);
            await barBtn(page, 'mobileBarHighlight').click();
            await page.locator('.color-palette-popup .color-item[title="Green"]').click();
            await expect(editor(page).locator('[style*="--pz-color-green-soft"]'), 'highlight').toHaveCount(1);
            await barBtn(page, 'mobileBarTitle').click();
            await page.locator('.font-size-popup .font-size-item[data-style="2"]').click();
            await expect(editor(page).locator('h2'), 'title').toHaveCount(1);
            await barBtn(page, 'mobileBarAlign').click();
            await page.locator('.align-popup .font-size-item[data-align="center"]').click();
            await expect(editor(page).locator('h2'), 'align').toHaveCSS('text-align', 'center');
        });

        test('undo, redo, indent, outdent', covers('rich.mobile-bar'), async ({ page }) => {
            await open(page, ctx.api, '<ul><li>un</li><li>deux</li></ul>');
            await editor(page).getByText('deux').click();
            await expect(page.locator('#mobileEditorBar'), 'not before the keyboard').toBeHidden();
            await keyboardUp(page);
            await barBtn(page, 'mobileBarIndent').click();
            await expect(editor(page).locator('ul ul li'), 'indent').toHaveText('deux');
            await barBtn(page, 'mobileBarOutdent').click();
            await expect(editor(page).locator('ul ul li'), 'outdent').toHaveCount(0);
            await page.keyboard.press('End');
            await page.keyboard.type(' plus');
            await expect(editor(page)).toContainText('deux plus');
            await barBtn(page, 'mobileBarUndo').click();
            await expect(editor(page), 'undo').not.toContainText('plus');
            await barBtn(page, 'mobileBarRedo').click();
            await expect(editor(page), 'redo').toContainText('deux plus');
        });

        test('the Insert button opens the slash menu, a tap opens a submenu, Back and Cancel work', covers('rich.mobile-bar', 'rich.slash-mobile'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await keyboardUp(page);
            await barBtn(page, 'mobileBarInsert').click();
            await expect(page.locator(MAIN)).toBeVisible();
            const live = await liveMain(page);
            expect(live.slice(-2), 'Cancel is on the phone only').toEqual(['template', 'cancel']);
            await page.locator(`${MAIN} [data-command-id="cancel"]`).click();
            await expect(page.locator(MAIN)).toHaveCount(0);
            await barBtn(page, 'mobileBarInsert').click();
            await page.locator(`${MAIN} [data-command-id="title"]`).click();
            await page.locator(`${SUB} [data-action="back"]`).click();
            await expect(page.locator(SUB), 'Back').toHaveCount(0);
            await page.locator(`${MAIN} [data-command-id="title"]`).click();
            await page.locator(`${SUB} [data-submenu-id="h3"]`).click();
            await page.keyboard.type('sur téléphone');
            await expect(editor(page).locator('h3'), 'tapped').toHaveText('sur téléphone');
            await saved(page, ctx.api, id, /<h3[^>]*>sur téléphone/);
        });

        test('slash Take a photo: the camera input of a phone, the picture lands in the note', covers('rich.take-photo'), async ({ page }) => {
            const id = await open(page, ctx.api);
            await newLine(page);
            await keyboardUp(page);
            await barBtn(page, 'mobileBarInsert').click();
            await page.locator(`${MAIN} [data-command-id="media"]`).click();
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`${SUB} [data-submenu-id="take-photo"]`).click()]);
            expect(await chooser.element().getAttribute('capture'), 'asks for the camera').toBe('environment');
            await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
            await expect(editor(page).locator('img')).toHaveAttribute('src', new RegExp(`/api/v1/notes/${id}/attachments/`));
        });

        test('the bar goes when the keyboard is hidden with its button', covers('rich.mobile-bar'), async ({ page }) => {
            await open(page, ctx.api);
            await caretAtEnd(page);
            await keyboardUp(page);
            await barBtn(page, 'mobileBarHideKeyboard').click();
            await expect.poll(() => editor(page).evaluate((note) => note.contains(document.activeElement)), 'the note lost the focus').toBe(false);
        });

        test('the mobile slash setting silences the typed "/"', covers('rich.slash-trigger', 'rich.mobile-bar'), async ({ page }) => {
            try {
                await ctx.api.ok(ctx.api.put('/settings/slash_menu_trigger_mobile', { value: 'disabled' }));
                await open(page, ctx.api);
                await caretAtEnd(page);
                await page.keyboard.type('a/b');
                await expect(page.locator(MAIN)).toHaveCount(0);
                await expect(editor(page)).toContainText('a/b');
                await keyboardUp(page);
                await barBtn(page, 'mobileBarInsert').click();
                await expect(page.locator(MAIN), 'Insert still opens it').toBeVisible();
            } finally {
                await ctx.api.ok(ctx.api.put('/settings/slash_menu_trigger_mobile', { value: 'slash' }));
            }
        });
    });
});

test.describe('rich text: Excalidraw', () => withAccount((ctx) => {
    // The editor takes its reference for "has it changed?" 500 ms after it starts
    const ready = async (page) => { await page.locator('canvas.excalidraw__canvas.interactive').waitFor({ timeout: 30_000 }); await page.waitForTimeout(800); };
    async function draw(page) {
        await ready(page);
        await page.locator('label:has([data-testid="toolbar-rectangle"])').click();
        const box = await page.locator('canvas.excalidraw__canvas.interactive').boundingBox();
        await page.mouse.move(box.x + 500, box.y + 300);
        await page.mouse.down();
        await page.mouse.move(box.x + 700, box.y + 450, { steps: 6 });
        await page.mouse.up();
    }
    const scene = (html) => {
        const match = html.match(/data-excalidraw="([^"]*)"/);
        return match ? JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null;
    };

    test('slash Excalidraw: draw a rectangle, Save and exit, the scene and its preview are in the note', covers('rich.excalidraw', 'rich.excalidraw-preview'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'excalidraw');
        await page.waitForURL(/excalidraw_editor\.php/);
        await draw(page);
        await expect(page.locator('#saveBtn'), 'a change enables Save').toBeEnabled();
        const [response] = await Promise.all([page.waitForResponse(/api_save_excalidraw\.php/), page.click('#saveAndExitBtn')]);
        expect(response.status()).toBe(200);
        await page.waitForURL(/index\.php/);
        const container = editor(page).locator('.excalidraw-container');
        await expect(container).toHaveCount(1);
        await expect.poll(() => container.locator('img').evaluate((img) => img.naturalWidth), 'the preview loads').toBeGreaterThan(0);
        const content = await stored(ctx.api, id);
        expect(scene(content).elements.map((element) => element.type), 'the scene').toEqual(['rectangle']);
        const src = await container.locator('img').getAttribute('src');
        const preview = await page.request.get(src);
        expect(preview.status()).toBe(200);
        expect(preview.headers()['content-type'], 'an SVG preview (#1434)').toContain('svg');
        expect(await preview.text()).toContain('<svg');
    });

    test('the image menu reopens the diagram, a second shape is added, Save stays in the editor, Exit goes back', covers('rich.excalidraw', 'rich.excalidraw-edit'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'excalidraw');
        await page.waitForURL(/excalidraw_editor\.php/);
        await draw(page);
        await page.click('#saveAndExitBtn');
        await page.waitForURL(/index\.php/);
        const image = editor(page).locator('.excalidraw-container img');
        await expect(image).toBeVisible();
        await image.click({ button: 'right' });
        await expect(page.locator('.image-menu .image-menu-item').first(), 'Edit comes first').toHaveAttribute('data-action', 'edit-embedded-excalidraw');
        await page.locator('.image-menu [data-action="edit-embedded-excalidraw"]').click();
        await page.waitForURL(/excalidraw_editor\.php/);
        await ready(page);
        await page.locator('label:has([data-testid="toolbar-ellipse"])').click();
        const box = await page.locator('canvas.excalidraw__canvas.interactive').boundingBox();
        await page.mouse.move(box.x + 900, box.y + 300); // The shape panel covers the left of the canvas
        await page.mouse.down();
        await page.mouse.move(box.x + 1100, box.y + 450, { steps: 6 });
        await page.mouse.up();
        const [response] = await Promise.all([page.waitForResponse(/api_save_excalidraw\.php/), page.click('#saveBtn')]);
        expect((await response.json()).success).toBe(true);
        await expect(page, 'Save stays').toHaveURL(/excalidraw_editor\.php/);
        await expect(page.locator('#saveBtn'), 'nothing left to save').toBeDisabled();
        await expect.poll(async () => scene(await stored(ctx.api, id)).elements.map((element) => element.type), 'two shapes').toEqual(['rectangle', 'ellipse']);
        await page.click('#cancelBtn');
        await page.waitForURL(/index\.php/);
        await expect(editor(page).locator('.excalidraw-container'), 'back in the note').toHaveCount(1);
    });

    test('Exit without saving keeps the note as it was', covers('rich.excalidraw'), async ({ page }) => {
        const id = await open(page, ctx.api);
        await newLine(page);
        await slash(page, 'excalidraw');
        await page.waitForURL(/excalidraw_editor\.php/);
        await page.locator('canvas.excalidraw__canvas.interactive').waitFor({ timeout: 30_000 });
        await page.click('#cancelBtn');
        await page.waitForURL(/index\.php/);
        const content = await stored(ctx.api, id);
        expect(content, 'nothing drawn').not.toContain('rectangle');
    });

    test('copying a diagram to another note keeps it a diagram, with a new id', covers('rich.excalidraw-copy'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const id = await open(page, ctx.api, '<p>source</p>');
        await newLine(page);
        await slash(page, 'excalidraw');
        await page.waitForURL(/excalidraw_editor\.php/);
        await draw(page);
        await page.click('#saveAndExitBtn');
        await page.waitForURL(/index\.php/);
        const sourceId = await editor(page).locator('.excalidraw-container').getAttribute('id');
        await editor(page).locator('.excalidraw-container img').evaluate((img) => {
            const range = document.createRange();
            range.selectNode(img);
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });
        await page.keyboard.press('Control+c');
        await caretAtEnd(page);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+v');
        await expect(editor(page).locator('.excalidraw-container'), 'a second diagram in the note').toHaveCount(2);
        const ids = await editor(page).locator('.excalidraw-container').evaluateAll((items) => items.map((item) => item.id));
        expect(new Set(ids).size, 'the copy got its own id').toBe(2);
        expect(ids).toContain(sourceId);
        await page.keyboard.press('Control+s');
        await expect.poll(async () => ((await stored(ctx.api, id)).match(/excalidraw-container/g) || []).length).toBe(2);
    });

    test('a diagram follows the Align command, as margins that survive', covers('rich.excalidraw-preview', 'rich.align'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>texte</p>');
        await newLine(page);
        await slash(page, 'excalidraw');
        await page.waitForURL(/excalidraw_editor\.php/);
        await draw(page);
        await page.click('#saveAndExitBtn');
        await page.waitForURL(/index\.php/);
        const container = editor(page).locator('.excalidraw-container');
        await expect(container).toBeVisible();
        await editor(page).getByText('texte').click();
        await page.keyboard.press('Control+a');
        await slash(page, 'align', 'align-right');
        await expect(container, 'pushed to the right').toHaveCSS('margin-left', /^[1-9]/);
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, id)).toMatch(/excalidraw-container[^>]*margin-left: auto/);
    });

    test('api_save_excalidraw.php refuses another user\'s note, and a GET', covers('rich.excalidraw-api'), async ({ page, playwright }) => {
        const note = await ctx.api.createNote({ heading: 'À moi', content: '<p>x</p>' });
        const other = await newAccount(playwright, 'rich-other');
        const otherApi = await Api.open(playwright, other);
        const get = await otherApi.call('GET', '/api_save_excalidraw.php', { raw: true });
        expect(get.status, 'GET').toBe(405);
        const post = await otherApi.call('POST', '/api_save_excalidraw.php', { raw: true, form: { note_id: note.id, diagram_data: '{"elements":[]}', heading: 'volé' } });
        expect(post.json.success, post.text).not.toBe(true);
        expect((await ctx.api.getNote(note.id)).heading, 'untouched').toBe('À moi');
        await otherApi.dispose();
        await page.context().clearCookies();
    });

    test('a whole-note drawing: opened from the editor page, saved as a new note', covers('rich.excalidraw-note'), async ({ page }) => {
        await login(page, ctx.account);
        await page.goto('/excalidraw_editor.php?workspace=Poznote');
        await draw(page);
        const [response] = await Promise.all([page.waitForResponse(/api_save_excalidraw\.php/), page.click('#saveBtn')]);
        const body = await response.json();
        expect(body.success).toBe(true);
        const note = await ctx.api.getNote(body.note_id);
        expect(note.content, 'the scene').toContain('rectangle');
        await expect(page, 'the URL follows').toHaveURL(new RegExp(`note_id=${body.note_id}`));
    });
}));

test.describe('rich text: Mermaid and what the server keeps', () => withAccount((ctx) => {
    test('a Markdown note: Remove checkboxes, from the toolbar and the selection menu', covers('rich.task-remove'), async ({ page }) => {
        const note = await ctx.api.createNote({ heading: 'Cases', content: '- [ ] première\n- [x] seconde\n', type: 'markdown' });
        await page.goto(`/index.php?note=${note.id}`);
        await page.evaluate((id) => window.switchToEditMode(id), note.id); // Setup: which view opens is tested with the Markdown editor
        const source = page.locator('.markdown-editor .cm-content').first();
        await source.getByText('première').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await toolbar(page, 'exec-task-remove').click();
        await expect(source, 'toolbar').not.toContainText('[ ]');
        await source.getByText('seconde').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await slash(page, 'list', 'task-remove');
        await expect(source, 'selection menu').not.toContainText('[x]');
        await page.keyboard.press('Control+s');
        await expect.poll(() => stored(ctx.api, note.id), 'saved').not.toMatch(/\[[ x]\]/);
        expect(await stored(ctx.api, note.id), 'the text stays').toMatch(/première[\s\S]*seconde/);
    });

    test('a mermaid fence in a rich text note stays a plain code block', covers('rich.mermaid-not-in-rich-text'), async ({ page }) => {
        const id = await open(page, ctx.api, '<p>début</p><pre data-language="mermaid"><code class="language-mermaid">graph TD; A--&gt;B</code></pre><p>fin</p>');
        await expect(editor(page).locator('pre code')).toHaveText('graph TD; A-->B');
        await expect(editor(page).locator('svg.mermaid, .mermaid svg')).toHaveCount(0);
        await caretAtEnd(page);
        await page.keyboard.type(' x');
        await saved(page, ctx.api, id, /graph TD/);
    });

    test('the sanitizer keeps what the editor makes and removes what is dangerous, seen from the editor', covers('rich.sanitizer'), async ({ page }) => {
        const dangerous = '<p onclick="window.__pwned=1">reste é</p><script>window.__pwned=2</script><img src="x" onerror="window.__pwned=3"><a href="javascript:window.__pwned=4">lien</a><iframe src="https://evil.example/"></iframe><details class="toggle-block" open><summary>résumé</summary><div>corps</div></details><table><tbody><tr><td data-formula="sum-col" style="text-align: right">1</td></tr></tbody></table><span style="color: var(--pz-color-red, #dc2626)">rouge</span>';
        await page.route('**/x', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
        const id = await open(page, ctx.api, dangerous);
        expect(await page.evaluate(() => window.__pwned), 'nothing ran').toBeUndefined();
        const content = await stored(ctx.api, id);
        expect(content, 'dangerous parts').not.toMatch(/onclick|onerror|<script|javascript:|evil\.example/i);
        await expect(editor(page).locator('details summary'), 'toggle kept').toHaveText('résumé');
        await expect(editor(page).locator('td[data-formula="sum-col"]'), 'formula kept').toHaveCSS('text-align', 'right');
        await expect(editor(page).locator('[style*="--pz-color-red,"]'), 'palette kept').toHaveText('rouge');
    });
}));
