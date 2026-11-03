// Markdown notes: every view, the source editor, the toolbar, the slash menu,
// tables, every syntax of the renderer, Mermaid, colours, conversion and export.
const { test, expect, covers, Api, newAccount, login, openNote, settled, PNG } = require('../lib/helpers');

const preview = (page) => page.locator('.markdown-preview').first();
const cmContent = (page) => page.locator('.markdown-editor .cm-content').first();
const sourceOf = (page) => page.evaluate(() => {
    const host = document.querySelector('.markdown-editor');
    return window.PoznoteMarkdownCodeMirror.getValue(host);
});
const setSetting = (api, key, value) => api.ok(api.put(`/settings/${key}`, { value: String(value) }));
const openEditor = async (page, id) => {
    await openNote(page, id);
    await page.locator('.markdown-view-mode-btn').click();
    await expect(page.locator('.markdown-editor .cm-content[contenteditable="true"]').first()).toBeVisible();
};
const focusEnd = async (page) => { await cmContent(page).click(); await page.keyboard.press('Control+End'); };
const save = async (page, api, id, expected) => {
    await page.locator('.btn-save').first().click();
    await expect.poll(async () => (await api.getNote(id)).content, { message: 'stored Markdown' }).toBe(expected);
};
/** The source a Markdown note renders to, in a preview freshly opened. */
const render = async (page, api, content) => {
    const note = await api.createNote({ heading: `Rendu ${Date.now()}-${Math.random()}`, content, type: 'markdown' });
    await page.goto(`/index.php?note=${note.id}`);
    await expect(preview(page)).toBeVisible();
    return { note, view: preview(page) };
};

test.describe('Markdown rendering', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdr');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('headings of levels 1 to 6, ATX only with their text', covers('md.render.headings'), async ({ page }) => {
        const { view } = await render(page, api, '# Un é\n\n## Deux\n\n### Trois\n\n#### Quatre\n\n##### Cinq\n\n###### Six\n\n####### Sept\n');
        for (const [tag, text] of [['h1', 'Un é'], ['h2', 'Deux'], ['h3', 'Trois'], ['h4', 'Quatre'], ['h5', 'Cinq'], ['h6', 'Six']]) {
            await expect(view.locator(tag), tag).toHaveText(text);
        }
        await expect(view.locator('p', { hasText: 'Sept' }), 'seven # is not a heading').toHaveText('####### Sept');
    });

    test('bold, italic, bold italic, strike, highlight, underline and their underscore forms', covers('md.render.emphasis', 'md.render.strike', 'md.render.highlight'), async ({ page }) => {
        const { view } = await render(page, api, '**gras** __gras2__ *ital* _ital2_ ***both*** ___both2___ ~~barré~~ ==surligné== <u>souligné</u> snake_case_mot');
        await expect(view.locator('strong').first()).toHaveText('gras');
        await expect(view.locator('strong').nth(1)).toHaveText('gras2');
        await expect(view.locator('p > em').first()).toHaveText('ital');
        await expect(view.locator('p > em').nth(1)).toHaveText('ital2');
        await expect(view.locator('strong > em').first()).toHaveText('both');
        await expect(view.locator('strong > em').nth(1)).toHaveText('both2');
        await expect(view.locator('del')).toHaveText('barré');
        await expect(view.locator('mark')).toHaveText('surligné');
        await expect(view.locator('u')).toHaveText('souligné');
        await expect(view.locator('p'), 'intraword underscores stay text').toContainText('snake_case_mot');
    });

    test('bullet, numbered, nested lists and the 1.1. numbering', covers('md.render.lists', 'md.render.nested-lists'), async ({ page }) => {
        const { view } = await render(page, api, [
            '- un', '* deux', '+ trois', '', 'texte', '',
            '1. premier', '2. second', '   1. sous', '', 'texte', '',
            '1. Parent', '   1. Enfant', '   2. Enfant bis', '', 'texte', '',
            '- parent', '  - enfant', '    - petit-enfant', ''].join('\n'));
        await expect(view.locator('> ul').first().locator('> li')).toHaveText(['un', 'deux', 'trois']);
        const numbered = view.locator('> ol').first();
        await expect(numbered.locator('> li').first()).toHaveText('premier');
        await expect(numbered.locator('> li ol > li')).toHaveText('sous');
        const hierarchical = view.locator('> ol').nth(1).locator('ol li');
        await expect(hierarchical, 'an indented numbered list nests').toHaveText(['Enfant', 'Enfant bis']);
        // Drawn as 1.1., 1.2. by CSS counters, which hang outside the text like native markers
        expect(await hierarchical.first().evaluate((li) => getComputedStyle(li, '::marker').content), 'Poznote hierarchical numbering').toContain('counters(item, ".")');
        const nested = view.locator('> ul').last();
        await expect(nested.locator('> li > ul > li > ul > li')).toHaveText('petit-enfant');
    });

    test('quotes and each callout type, with custom title and folding', covers('md.render.quotes', 'md.render.callouts'), async ({ page }) => {
        const types = ['note', 'tip', 'important', 'warning', 'caution'];
        const body = types.map((type) => `> [!${type.toUpperCase()}]\n> corps ${type}`).join('\n\n');
        const { view } = await render(page, api, `> Une citation\n> sur deux lignes\n\n${body}\n\n> [!NOTE] Mon titre é\n> corps titré\n\n> [!TIP]- Plié\n> caché\n\n> **Warning** ancienne forme`);
        await expect(view.locator('blockquote:not(.callout)').first()).toContainText('Une citation');
        for (const type of types) {
            const callout = view.locator(`.callout-${type}`).first();
            await expect(callout, type).toContainText(`corps ${type}`);
            await expect(callout.locator('svg').first(), `${type} has its icon`).toBeVisible();
        }
        await expect(view.locator('.callout-note').nth(1)).toContainText('Mon titre é');
        const folded = view.locator('details.callout-tip');
        await expect(folded).toContainText('Plié');
        await expect(folded.getByText('caché'), 'folded callout starts closed').toBeHidden();
        await folded.locator('summary').click();
        await expect(folded.getByText('caché')).toBeVisible();
        await expect(view.locator('.callout-warning').nth(1), 'old form').toContainText('ancienne forme');
    });

    test('code blocks are highlighted by language, plain blocks are not, inline code is literal', covers('md.render.code-blocks', 'md.render.inline-code'), async ({ page }) => {
        const { view } = await render(page, api, '```javascript\nconst a = "é"; // note\n```\n\n```python\ndef f(): pass\n```\n\n```\n**pas gras**\n```\n\nDu `**code**` ici.');
        const js = view.locator('pre code.language-javascript, pre[data-language="javascript"] code').first();
        await expect(js).toContainText('const a = "é";');
        await expect(js.locator('.hljs-keyword').first()).toHaveText('const');
        await expect(js.locator('.hljs-comment').first()).toHaveText('// note');
        await expect(view.locator('pre', { hasText: 'def f()' }).locator('.hljs-keyword').first()).toHaveText('def');
        const plain = view.locator('pre', { hasText: '**pas gras**' });
        await expect(plain.locator('strong')).toHaveCount(0);
        await expect(view.locator('p > code')).toHaveText('**code**');
    });

    test('code block copy button copies the code', covers('md.render.code-copy'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const { view } = await render(page, api, '```php\necho "copié";\n```\n');
        const block = view.locator('pre').first();
        await block.hover();
        await block.locator('..').locator('.code-block-copy-btn').first().click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('echo "copié";');
    });

    test('tables with alignment, inline formatting and a line break in a cell', covers('md.render.tables'), async ({ page }) => {
        const { view } = await render(page, api, '| G | C | D |\n|:---|:---:|---:|\n| g | c | d |\n| **b** | `x`<br>y | é |\n');
        await expect(view.locator('th')).toHaveText(['G', 'C', 'D']);
        const align = (i) => view.locator('tr').nth(1).locator('td').nth(i);
        await expect(align(0)).toHaveCSS('text-align', /left|start/);
        await expect(align(1)).toHaveCSS('text-align', 'center');
        await expect(align(2)).toHaveCSS('text-align', 'right');
        await expect(view.locator('td strong')).toHaveText('b');
        await expect(view.locator('td code')).toHaveText('x');
        await expect(view.locator('td br')).toHaveCount(1);
    });

    test('formulas in a table compute sum, average, min, max, count, product by row and by column', covers('md.render.table-formulas'), async ({ page }) => {
        const { view } = await render(page, api, [
            '| A | B | T |', '|---|---|---|', '| 2 | 3 | =SUM(row) |', '| 4 | 5 | =PRODUCT(row) |',
            '| =SUM(col) | =AVG(col) | =MAX(col) |', '| =MIN(col) | =COUNT(col) | x |', ''].join('\n'));
        const rows = view.locator('tr:has(td)');
        await expect(rows.nth(0).locator('td').nth(2)).toHaveText('5');
        await expect(rows.nth(1).locator('td').nth(2)).toHaveText('20');
        await expect(rows.nth(2).locator('td').nth(0)).toHaveText('6');
        await expect(rows.nth(2).locator('td').nth(1)).toHaveText('4');
        await expect(rows.nth(2).locator('td').nth(2)).toHaveText('20');
    });

    test('links: titles, parentheses, bare addresses, angle brackets, no script scheme', covers('md.render.links'), async ({ page }) => {
        const { view } = await render(page, api, [
            '[site é](https://example.com/a)', '',
            '[wiki](https://fr.wikipedia.org/wiki/Paris_(France))', '',
            'Voir https://example.org/x_y_z. Fin', '',
            '<https://example.net/ang>', '',
            '[mal](javascript:alert(1))', ''].join('\n'));
        await expect(view.getByRole('link', { name: 'site é' })).toHaveAttribute('href', 'https://example.com/a');
        await expect(view.getByRole('link', { name: 'wiki' })).toHaveAttribute('href', 'https://fr.wikipedia.org/wiki/Paris_(France)');
        await expect(view.getByRole('link', { name: 'https://example.org/x_y_z' }), 'trailing dot left out').toHaveAttribute('href', 'https://example.org/x_y_z');
        await expect(view.getByRole('link', { name: 'https://example.net/ang' })).toHaveAttribute('href', 'https://example.net/ang');
        await expect(view.locator('a[href^="javascript"]')).toHaveCount(0);
    });

    test('an image shows, a link around an image keeps both', covers('md.render.images'), async ({ page }) => {
        const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`;
        const { view } = await render(page, api, `![Légende](${dataUrl})\n\n[![Dans lien](${dataUrl})](https://example.com/img)\n`);
        await expect(view.locator('img[alt="Légende"]')).toBeVisible();
        await expect.poll(() => view.locator('img[alt="Légende"]').evaluate((img) => img.naturalWidth)).toBe(1);
        await expect(view.locator('a[href="https://example.com/img"] img[alt="Dans lien"]')).toBeVisible();
    });

    test('a link to another note opens it', covers('md.render.note-links'), async ({ page }) => {
        const target = await api.createNote({ heading: 'Cible é', content: 'cible', type: 'markdown' });
        const { view } = await render(page, api, `[Vers cible](index.php?note=${target.id})\n`);
        await view.getByRole('link', { name: 'Vers cible' }).click();
        await expect(page.locator('input.css-title').first()).toHaveValue('Cible é');
    });

    test('allowed HTML passes, the rest stays text', covers('md.render.html'), async ({ page }) => {
        const { view } = await render(page, api, '<details>\n<summary>Plus</summary>\nCaché é\n</details>\n\n<span style="color: red;">rouge</span>\n\n<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 1">\n\nl1<br>l2\n');
        await expect(view.locator('details summary')).toHaveText('Plus');
        await expect(view.getByText('Caché é')).toBeHidden();
        await view.locator('details summary').click();
        await expect(view.getByText('Caché é')).toBeVisible();
        await expect(view.locator('span[style*="color"]')).toHaveCSS('color', 'rgb(255, 0, 0)');
        await expect(view.locator('script')).toHaveCount(0);
        expect(await page.evaluate(() => window.__pwned), 'nothing ran').toBeUndefined();
        await expect(view.locator('img[onerror]')).toHaveCount(0);
        await expect(view.locator('p', { hasText: 'l1' }).locator('br')).toHaveCount(1);
    });

    test('paragraph alignment from <p align>', covers('md.render.paragraph-align'), async ({ page }) => {
        const { view } = await render(page, api, '<p align="center">centré</p>\n\n<p align="right">droite</p>\n\n<p align="justify">justifié</p>\n');
        await expect(view.getByText('centré')).toHaveCSS('text-align', 'center');
        await expect(view.getByText('droite')).toHaveCSS('text-align', 'right');
        await expect(view.getByText('justifié')).toHaveCSS('text-align', 'justify');
    });

    test('horizontal rules, hard line breaks and backslash escapes', covers('md.render.misc'), async ({ page }) => {
        const { view } = await render(page, api, 'a\n\n---\n\nb\n\n***\n\nc\n\n___\n\nligne un\nligne deux\n\n\\*pas italique\\*\n');
        await expect(view.locator('hr')).toHaveCount(3);
        await expect(view.locator('p', { hasText: 'ligne un' }).locator('br')).toHaveCount(1);
        await expect(view.locator('p', { hasText: 'pas italique' })).toHaveText('*pas italique*');
    });

    test('math renders inline and as a block', covers('md.render.math'), async ({ page }) => {
        const { view } = await render(page, api, 'Inline $E = mc^2$ fin\n\n$$\n\\frac{1}{3}\n$$\n');
        await expect(view.locator('.math-inline .katex')).toBeVisible();
        await expect(view.locator('.math-block .katex')).toBeVisible();
    });

});

test.describe('Markdown wiki links', () => {
    // KNOWN: the lookup of an unknown title answers 404, which the browser logs
    test.use({ allowedErrors: [/notes\/resolve\?reference=.*404|404.*notes\/resolve\?reference=/] });
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdw');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('a [[wiki link]] goes to the note of that title, an unknown title offers to create it', covers('md.render.wiki-links'), async ({ page }) => {
        const target = await newNote(api, 'cible');
        await api.ok(api.patch(`/notes/${target.id}`, { heading: 'Wiki cible é' }));
        const { view } = await render(page, api, '[[Wiki cible é]]\n\n[[Titre inconnu]]\n');
        await expect(view.locator('a.note-internal-link')).toHaveText('Wiki cible é');
        const missing = view.locator('.note-link-broken');
        await expect(missing).toHaveText('Titre inconnu');
        await missing.click();
        await page.locator('.modal:visible').getByRole('button', { name: /Create|OK|Confirm/i }).click();
        await expect(page.locator('input.css-title').first(), 'created and opened').toHaveValue('Titre inconnu');
        await page.goBack();
        await expect(preview(page).locator('a.note-internal-link', { hasText: 'Wiki cible é' })).toBeVisible();
        await preview(page).locator('a.note-internal-link', { hasText: 'Wiki cible é' }).click();
        await expect(page.locator('input.css-title').first()).toHaveValue('Wiki cible é');
    });
});

const pickView = async (page, name) => {
    await page.locator('#edgeViewMenuBtn').click();
    await page.locator(`#markdownViewMenu [data-markdown-view="${name}"]`).click();
    await expect(page.locator('#markdownViewMenu')).toBeHidden();
};
const entry = (page) => page.locator('#right_col .noteentry').first();
/** What the screen shows, read from what is visible, not from the app's own state. */
const expectMode = async (page, mode) => {
    const editor = page.locator('.markdown-editor .cm-content').first();
    if (mode === 'preview') {
        await expect(preview(page), 'preview visible').toBeVisible();
        await expect(page.locator('.markdown-editor').first(), 'editor hidden').toBeHidden();
        await expect(entry(page)).not.toHaveClass(/markdown-split-mode/);
        return;
    }
    await expect(editor, `${mode}: editor visible`).toBeVisible();
    if (mode === 'split') {
        await expect(entry(page)).toHaveClass(/markdown-split-mode/);
        await expect(preview(page), 'split: preview visible').toBeVisible();
        const left = await page.locator('.markdown-editor').first().boundingBox();
        const right = await preview(page).boundingBox();
        expect(left.x + left.width, 'side by side').toBeLessThanOrEqual(right.x + 2);
        return;
    }
    await expect(preview(page), `${mode}: preview hidden`).toBeHidden();
    await expect(entry(page)).not.toHaveClass(/markdown-split-mode/);
    const host = page.locator('.markdown-editor').first();
    if (mode === 'edit') await expect(host).not.toHaveClass(/markdown-live-editing/);
    else {
        await expect(host).toHaveClass(/markdown-live-editing/);
        await expect(page.locator('body')).toHaveAttribute('data-markdown-live-syntax', mode === 'live' ? '1' : '0');
    }
};
const newNote = (api, content = '# Titre é\n\nUn **gras** paragraphe\n') => api.createNote({ heading: `Vue ${Date.now()}-${Math.random()}`, content, type: 'markdown' });
const settingOf = async (api, key) => (await api.ok(api.get(`/settings/${key}`))).json.value;
const go = async (page, id) => { await page.goto(`/index.php?note=${id}`); await expect(page.locator(`#entry${id}`)).toBeAttached(); };
const openSettings = async (page, section = 'Markdown') => {
    await page.goto('/settings.php');
    await page.locator('.settings-nav-item', { hasText: section }).first().click();
    await expect(page.locator('.settings-category-title:visible', { hasText: section }).first()).toBeVisible();
};

test.describe('Markdown views', () => {
    let account; let api;
    // These tests change the view settings of the account: a fresh one each time
    test.beforeEach(async ({ page, playwright }) => {
        account = await newAccount(playwright, 'mdv');
        api = await Api.open(playwright, account);
        await login(page, account);
    });
    test.afterEach(async () => { await api.dispose(); });

    test('a note opens in the preview and the pencil goes to the editor and back, with what was typed', covers('md.view.classic', 'md.view.pencil'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await expectMode(page, 'preview');
        await expect(preview(page).locator('h1')).toHaveText('Titre é');
        const pencil = page.locator('.markdown-view-mode-btn');
        await expect(pencil).toHaveAttribute('title', 'Switch to edit mode');
        await pencil.click();
        await expectMode(page, 'edit');
        await expect(pencil).toHaveClass(/is-edit-mode/);
        await expect(pencil).toHaveAttribute('title', 'Switch to preview mode');
        await focusEnd(page);
        await page.keyboard.type('\n## Ajouté é');
        await pencil.click();
        await expectMode(page, 'preview');
        await expect(preview(page).locator('h2'), 'the preview shows what was typed').toHaveText('Ajouté é');
        await expect.poll(async () => (await api.getNote(note.id)).content, { message: 'leaving the editor keeps the text' }).toContain('## Ajouté é');
    });

    test('the view menu lists its entries, shows the current one and closes', covers('md.view.menu'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        const menu = page.locator('#markdownViewMenu');
        await expect(menu).toBeHidden();
        await page.locator('#edgeViewMenuBtn').click();
        await expect(menu).toBeVisible();
        await expect(menu.locator('[data-markdown-view]')).toHaveText(['Classic', 'Live preview', 'Rich text', 'Split view'].map((label) => new RegExp(`^\\s*${label}\\s*$`)));
        await expect(menu.locator('#markdownViewMenuSettings')).toHaveText(/Customize this menu/);
        await expect(menu.locator('[aria-checked="true"]')).toHaveAttribute('data-markdown-view', 'classic');
        for (const hint of await menu.locator('.page-more-menu-help').all()) {
            expect((await hint.getAttribute('data-tooltip')).length, 'each entry explains itself').toBeGreaterThan(20);
        }
        await page.keyboard.press('Escape');
        await expect(menu, 'Escape closes').toBeHidden();
        await page.locator('#edgeViewMenuBtn').click();
        await expect(menu).toBeVisible();
        await page.locator('input.css-title').first().click();
        await expect(menu, 'a click elsewhere closes').toBeHidden();
    });

    test('each entry of the view menu puts the note in that view and back to classic', covers('md.view.live', 'md.view.rich', 'md.view.split', 'md.view.classic-return'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        for (const view of ['live', 'rich', 'split', 'classic', 'split', 'live', 'classic']) {
            await pickView(page, view);
            await expectMode(page, view === 'classic' ? 'preview' : view);
            await page.locator('#edgeViewMenuBtn').click();
            await expect(page.locator('#markdownViewMenu [aria-checked="true"]'), view).toHaveAttribute('data-markdown-view', view);
            await page.keyboard.press('Escape');
        }
        // Classic goes back to where the note was: from the editor, to the editor
        await page.locator('.markdown-view-mode-btn').click();
        await expectMode(page, 'edit');
        await pickView(page, 'split');
        await expectMode(page, 'split');
        await pickView(page, 'classic');
        await expectMode(page, 'edit');
    });

    test('live preview formats the text and shows the syntax under the caret, and typed Markdown is read', covers('md.view.live'), async ({ page }) => {
        const note = await newNote(api, '# Titre é\n\nUn **gras** paragraphe\n\nLigne de fin\n');
        await go(page, note.id);
        await pickView(page, 'live');
        await expect(page.locator('.cm-line.cm-live-h1'), 'the heading looks like one').toContainText('Titre é');
        await expect(page.locator('.poznote-cm-strong', { hasText: 'gras' })).toBeVisible();
        await expect(page.locator('.cm-line', { hasText: 'Un' }), 'markers away from the caret are hidden').not.toContainText('**');
        await page.locator('.cm-line', { hasText: 'Un' }).locator('.poznote-cm-strong').click();
        await expect(page.locator('.cm-line', { hasText: 'Un' }), 'the caret brings them back').toContainText('**gras**');
        await page.locator('.cm-line', { hasText: 'Ligne de fin' }).click();
        await page.keyboard.press('End');
        await page.keyboard.type('\n\n## Tapé **ici**\n\nsuite');
        await expect(page.locator('.cm-line.cm-live-h2')).toContainText('Tapé');
        await expect(page.locator('.cm-line.cm-live-h2')).not.toContainText('##');
        await save(page, api, note.id, '# Titre é\n\nUn **gras** paragraphe\n\nLigne de fin\n\n## Tapé **ici**\n\nsuite\n');
    });

    test('live preview draws tables, code blocks and checkboxes as blocks', covers('md.view.live-blocks'), async ({ page }) => {
        const note = await newNote(api, 'Haut\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n- [ ] tâche\n\nBas\n');
        await go(page, note.id);
        await pickView(page, 'live');
        await expect(page.locator('.cm-live-block-table table td').first()).toHaveText('1');
        await expect(page.locator('.cm-live-code-lang')).toHaveText('js');
        await expect(page.locator('.cm-line.cm-live-code .poznote-cm-keyword').first()).toHaveText('const');
        await page.locator('.cm-live-task').click();
        await expect.poll(() => sourceOf(page), { message: 'a click ticks the checkbox' }).toContain('- [x] tâche');
        await page.locator('.cm-line.cm-live-code', { hasText: 'const' }).hover();
        await page.locator('.cm-live-code-delete').click();
        await expect.poll(() => sourceOf(page), { message: 'its bin deletes the block' }).not.toContain('const x');
    });

    test('rich text hides the syntax even under the caret, and typed markers stay text', covers('md.view.rich'), async ({ page }) => {
        const note = await newNote(api, '# Titre é\n\nUn **gras** paragraphe\n');
        await go(page, note.id);
        await pickView(page, 'rich');
        const line = page.locator('.cm-line', { hasText: 'gras' });
        await line.getByText('gras').last().click();
        await expect.poll(() => line.evaluate((node) => [...node.querySelectorAll('.cm-live-squeezed')].length), { message: 'markers squeezed' }).toBeGreaterThan(0);
        const marker = line.locator('.cm-live-squeezed').first();
        expect(await marker.evaluate((node) => node.getBoundingClientRect().width), 'the marker takes no room').toBeLessThan(1);
        await page.keyboard.press('Control+End');
        await page.keyboard.type('\nétoiles *ici*');
        await expect.poll(() => sourceOf(page), { message: 'typed stars are escaped, not formatting' }).toContain('étoiles \\*ici\\*');
    });

    test('the live views are the account setting: the next note and a reload come up in them', covers('md.view.live', 'md.view.rich'), async ({ page }) => {
        const note = await newNote(api);
        const other = await newNote(api);
        await go(page, note.id);
        await pickView(page, 'live');
        await expect.poll(() => settingOf(api, 'markdown_live_editing')).toBe('1');
        await go(page, other.id);
        await expectMode(page, 'live');
        await pickView(page, 'rich');
        await expect.poll(() => settingOf(api, 'markdown_live_show_syntax')).toBe('0');
        await page.reload();
        await expectMode(page, 'rich');
        await pickView(page, 'classic');
        await expect.poll(() => settingOf(api, 'markdown_live_editing')).toBe('0');
        await page.reload();
        await expectMode(page, 'preview');
    });

    test('Customize this menu leads to the View menu card, whose boxes choose the entries', covers('md.view.cycle-setting', 'md.view.menu-customize'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await page.locator('#edgeViewMenuBtn').click();
        await page.locator('#markdownViewMenuSettings').click();
        await page.waitForURL(/settings\.php\?open=markdown-views/);
        const card = page.locator('#markdown-view-cycle-card');
        await expect(card).toBeInViewport();
        const boxes = card.locator('input[type="checkbox"]');
        await expect(boxes).toHaveCount(3);
        await card.locator('input[value="live"]').uncheck();
        await card.locator('input[value="split"]').uncheck();
        await expect.poll(() => settingOf(api, 'markdown_view_cycle')).toBe('rich');
        await go(page, note.id);
        await page.locator('#edgeViewMenuBtn').click();
        await expect(page.locator('#markdownViewMenu [data-markdown-view]:visible')).toHaveCount(2);
        await expect(page.locator('#markdownViewMenu [data-markdown-view="rich"]')).toBeVisible();
        await expect(page.locator('#markdownViewMenu [data-markdown-view="live"]')).toBeHidden();
        await openSettings(page);
        await card.locator('input[value="rich"]').uncheck();
        await expect.poll(() => settingOf(api, 'markdown_view_cycle')).toBe('none');
        await go(page, note.id);
        await expect(preview(page)).toBeVisible();
        await expect(page.locator('#edgeSplitViewBtn'), 'nothing to choose: no button').toBeHidden();
        await openSettings(page);
        await expect(card.locator('input[value="rich"]'), 'the boxes show what is saved').not.toBeChecked();
    });

    test('the right-click menu of the view button turns the click into stepping through the views', covers('md.view.button-cycle'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await page.locator('#edgeViewMenuBtn').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Toggle on click' }).click();
        await expect.poll(() => settingOf(api, 'markdown_view_button_cycle')).toBe('1');
        const button = page.locator('#edgeViewMenuBtn');
        for (const mode of ['live', 'rich', 'split', 'preview', 'live']) {
            await button.click();
            await expectMode(page, mode);
            await expect(page.locator('#markdownViewMenu'), 'no menu in this mode').toBeHidden();
        }
        await button.click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Open a menu on click' }).click();
        await expect.poll(() => settingOf(api, 'markdown_view_button_cycle')).toBe('0');
        await button.click();
        await expect(page.locator('#markdownViewMenu'), 'and back to the menu').toBeVisible();
    });

    test('Default view mode: each choice of the card decides how a note opens', covers('md.settings.default-view-mode'), async ({ page }) => {
        const note = await newNote(api);
        await openSettings(page);
        const select = page.locator('#markdown-default-view-mode-select');
        await expect(select.locator('option')).toHaveText(['Preview', 'Edit', 'Split', 'Last used mode']);
        for (const [value, mode] of [['edit', 'edit'], ['split', 'split'], ['preview', 'preview']]) {
            await openSettings(page);
            await select.selectOption(value);
            await expect.poll(() => settingOf(api, 'markdown_default_view_mode'), value).toBe(value);
            await go(page, note.id);
            await expectMode(page, mode);
        }
    });

    test('Last used mode follows the last view on any note, never per note', covers('md.settings.default-view-mode', 'md.view.not-per-note'), async ({ page }) => {
        const first = await newNote(api);
        const second = await newNote(api);
        await setSetting(api, 'markdown_default_view_mode', 'last');
        await go(page, first.id);
        await pickView(page, 'split');
        await expectMode(page, 'split');
        await go(page, second.id);
        await expectMode(page, 'split');
        await pickView(page, 'classic');
        await go(page, first.id);
        await expect(entry(page), 'the first note did not keep its own mode').not.toHaveClass(/markdown-split-mode/);
    });

    test('with the mode fixed by the setting, a note reopens in it whatever it was left in', covers('md.view.not-per-note'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await page.locator('.markdown-view-mode-btn').click();
        await expectMode(page, 'edit');
        await go(page, note.id);
        await expectMode(page, 'preview');
        await pickView(page, 'split');
        await go(page, note.id);
        await expectMode(page, 'preview');
    });

    test('New note view mode: each choice decides how a note created from the + menu opens', covers('md.settings.new-note-mode'), async ({ page }) => {
        await openSettings(page);
        const select = page.locator('#markdown-new-note-view-mode-select');
        await expect(select.locator('option')).toHaveText(['Split', 'Edit', 'Live preview', 'Rich text']);
        for (const [value, mode] of [['edit', 'edit'], ['split', 'split'], ['live', 'live'], ['rich', 'rich']]) {
            await openSettings(page);
            await select.selectOption(value);
            await expect.poll(() => settingOf(api, 'markdown_new_note_view_mode'), value).toBe(value);
            await page.goto('/index.php');
            await page.locator('#sidebarCreateBtn').click();
            await page.locator('.create-menu-item', { hasText: 'Markdown note' }).click();
            await expectMode(page, mode);
        }
    });
});

/** A real double click on a word of the source, as CodeMirror only believes real selections. */
const pointOf = async (page, word) => {
    const point = await page.evaluate((text) => {
        const walker = document.createTreeWalker(document.querySelector('.markdown-editor .cm-content'), NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = node.textContent.indexOf(text);
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const rect = range.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
    }, word);
    expect(point, `"${word}" is in the editor`).not.toBeNull();
    return point;
};
const selectWord = async (page, word) => {
    const point = await pointOf(page, word);
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(() => page.evaluate(() => window.getSelection().toString()), { message: 'selected' }).toBe(word);
};
/** Empties the editor the way a person does and types a new text. */
const retype = async (page, text = '') => {
    await cmContent(page).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect.poll(() => sourceOf(page)).toBe('');
    if (text) await page.keyboard.insertText(text);
};

test.describe('Markdown source editor', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mde');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('typing with accents is saved by the save button and comes back after a reload', covers('md.edit.typing'), async ({ page }) => {
        const note = await newNote(api, 'Début\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await page.keyboard.type('Été à Noël 日本語 🙂');
        await save(page, api, note.id, 'Début\nÉté à Noël 日本語 🙂');
        await page.reload();
        await expect(preview(page)).toContainText('Été à Noël 日本語 🙂');
    });

    test('typing is saved on its own after a short wait', covers('md.edit.autosave'), async ({ page }) => {
        const note = await newNote(api, 'Début\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await page.keyboard.type('auto');
        await expect.poll(async () => (await api.getNote(note.id)).content, { timeout: 20_000 }).toBe('Début\nauto');
    });

    test('Ctrl+Z undoes and Ctrl+Y redoes', covers('md.edit.undo'), async ({ page }) => {
        const note = await newNote(api, 'Base\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await page.keyboard.type('mot');
        await expect.poll(() => sourceOf(page)).toBe('Base\nmot');
        await page.keyboard.press('Control+z');
        await expect.poll(() => sourceOf(page)).toBe('Base\n');
        await page.keyboard.press('Control+y');
        await expect.poll(() => sourceOf(page)).toBe('Base\nmot');
    });

    test('the keyboard shortcuts wrap the selection', covers('md.edit.shortcuts'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        for (const [keys, wrapped] of [
            ['Control+b', '**mot**'], ['Control+i', '*mot*'], ['Control+u', '<u>mot</u>'], ['Control+Shift+S', '~~mot~~'],
        ]) {
            await retype(page, 'avant mot après');
            await selectWord(page, 'mot');
            await page.keyboard.press(keys);
            await expect.poll(() => sourceOf(page), keys).toBe(`avant ${wrapped} après`);
        }
        await retype(page, 'avant mot après');
        await selectWord(page, 'mot');
        await page.keyboard.press('Control+Shift+B');
        await expect.poll(() => sourceOf(page), 'Ctrl+Shift+B makes a fence').toContain('```');
        await expect.poll(() => sourceOf(page)).toContain('mot');
        await retype(page, 'avant mot après');
        await selectWord(page, 'mot');
        await page.keyboard.press('Control+k');
        await expect(page.locator('#linkModalUrl'), 'Ctrl+K opens the link dialog').toBeVisible();
        await expect(page.locator('#linkModalText')).toHaveValue('mot');
        await page.locator('#linkModalUrl').fill('https://example.com/é');
        await page.locator('#linkModalUrl').press('Enter');
        await expect.poll(() => sourceOf(page)).toBe('avant [mot](https://example.com/é) après');
    });

    test('Enter continues a list, a quote and a numbered list, and leaves it after empty items', covers('md.edit.list-continuation'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await retype(page, '> un');
        await page.keyboard.press('Enter');
        await expect.poll(() => sourceOf(page), 'quote').toBe('> un\n> ');
        for (const [start, next] of [['- un', '- '], ['1. un', '2. '], ['- [ ] un', '- [ ] ']]) {
            await retype(page, start);
            await page.keyboard.press('Enter');
            await expect.poll(() => sourceOf(page), start).toBe(`${start}\n${next}`);
            await page.keyboard.press('Enter');
            await expect.poll(() => sourceOf(page), `${start}: a second Enter spaces the list`).toBe(`${start}\n\n${next}`);
            await page.keyboard.press('Enter');
            await expect.poll(() => sourceOf(page), `${start}: a third one leaves it`).toBe(`${start}\n\n`);
        }
    });

    test('Tab indents a list item and Shift+Tab brings it back', covers('md.edit.list-indent'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await retype(page, '- un\n- deux');
        await page.keyboard.press('Tab');
        const indented = await sourceOf(page);
        expect(indented).toMatch(/^- un\n\s+- deux$/);
        await page.keyboard.press('Shift+Tab');
        await expect.poll(() => sourceOf(page)).toBe('- un\n- deux');
    });

    test('Backspace after typing a marker pair removes both', covers('md.edit.marker-pair'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await retype(page);
        await page.keyboard.type('**');
        const typed = await sourceOf(page);
        await page.keyboard.press('Backspace');
        await expect.poll(() => sourceOf(page), `from "${typed}"`).not.toBe(typed);
    });

    test('arrow keys move one line at a time, in the source and in rich text with wrapped lines', covers('md.edit.arrow-keys'), async ({ page }) => {
        const long = 'mot '.repeat(120).trim();
        const note = await newNote(api, `Premier\n\n${long}\n\nDernier\n`);
        const lineOf = () => page.evaluate(() => {
            const api = window.PoznoteMarkdownCodeMirror; const host = document.querySelector('.markdown-editor');
            const { start } = api.getSelectionOffsets(host);
            return api.getValue(host).slice(0, start).split('\n').length;
        });
        await openEditor(page, note.id);
        await cmContent(page).click();
        await page.keyboard.press('Control+Home');
        const seen = [];
        for (let i = 0; i < 8; i++) { seen.push(await lineOf()); await page.keyboard.press('ArrowDown'); }
        expect(seen.slice(0, 3), 'from the first line to the wrapped one').toEqual([1, 2, 3]);
        expect(seen.filter((line) => line === 3).length, 'a wrapped line takes several presses').toBeGreaterThan(1);
        await page.keyboard.press('Control+End');
        await page.keyboard.press('ArrowUp');
        expect(await lineOf()).toBe(5);
        await page.keyboard.press('ArrowUp');
        expect(await lineOf(), 'up lands on the blank line, skips nothing').toBe(4);
        await pickView(page, 'rich');
        await cmContent(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        expect(await lineOf(), 'rich text does not skip lines either').toBe(4);
        await pickView(page, 'classic');
    });

    test('selection is painted, code syntax is coloured by token', covers('md.edit.selection-colour', 'md.edit.syntax-tokens'), async ({ page }) => {
        const note = await newNote(api, 'Un mot simple\n\n```javascript\nconst nom = "é"; // commentaire\nlet n = 12;\n```\n');
        await openEditor(page, note.id);
        await selectWord(page, 'simple');
        const selection = page.locator('.cm-selectionBackground').first();
        await expect(selection).toBeAttached();
        const painted = await selection.evaluate((node) => { const s = getComputedStyle(node); const r = node.getBoundingClientRect(); return { color: s.backgroundColor, width: r.width }; });
        expect(painted.color, 'selection colour').not.toBe('rgba(0, 0, 0, 0)');
        expect(painted.width, 'selection has a width').toBeGreaterThan(5);
        const code = page.locator('.cm-md-code-line', { hasText: 'const' });
        const colourOf = (text) => code.getByText(text, { exact: true }).evaluate((node) => getComputedStyle(node).color);
        const keyword = await colourOf('const');
        const string = await colourOf('"é"');
        const comment = await colourOf('// commentaire');
        const plain = await page.locator('.cm-line', { hasText: 'Un mot' }).evaluate((node) => getComputedStyle(node).color);
        expect(new Set([keyword, string, comment, plain]).size, `${keyword} ${string} ${comment} ${plain}`).toBe(4);
        const token = (name) => page.evaluate((key) => {
            const probe = document.createElement('span'); probe.style.color = `var(--pz-syntax-${key})`;
            document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value;
        }, name);
        expect(keyword, 'keywords take the theme token').toBe(await token('keyword'));
        expect(string).toBe(await token('string'));
        expect(comment).toBe(await token('comment'));
    });

    test('Editor word wrap: the card switches between wrapped lines and a sideways scroll', covers('md.settings.word-wrap'), async ({ page }) => {
        const note = await newNote(api, `${'long '.repeat(200)}\n`);
        const scrolls = () => page.locator('.markdown-editor .cm-scroller').first().evaluate((node) => node.scrollWidth > node.clientWidth + 5);
        await openEditor(page, note.id);
        expect(await scrolls(), 'wrapped by default').toBe(false);
        await openSettings(page);
        const card = page.locator('#markdown-editor-wrap-card');
        await card.click();
        await expect.poll(() => settingOf(api, 'markdown_editor_word_wrap')).toBe('0');
        await expect(card.locator('.setting-status')).toHaveClass(/disabled/);
        try {
            await openEditor(page, note.id);
            await expect(page.locator('body')).toHaveClass(/markdown-editor-no-wrap/);
            await expect.poll(scrolls, 'one long line now').toBe(true);
        } finally { await setSetting(api, 'markdown_editor_word_wrap', '1'); }
    });

    test('Markdown editor font: the choice applies to the editor, not to the preview', covers('md.settings.font'), async ({ page }) => {
        const note = await newNote(api, 'Texte\n');
        await openSettings(page);
        const select = page.locator('#markdown-font-select');
        const values = await select.locator('option').evaluateAll((all) => all.map((o) => o.value));
        for (const value of ['inherit', 'monospace', 'courier', 'consolas', 'menlo', 'monaco', 'jetbrains', 'cascadia', 'fira', 'sourcecodepro', 'ubuntumono']) {
            expect(values, value).toContain(value);
        }
        await select.selectOption('monospace');
        try {
            await openEditor(page, note.id);
            await expect.poll(() => cmContent(page).evaluate((node) => getComputedStyle(node).fontFamily)).toContain('monospace');
            const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.markdown-preview')).fontFamily);
            expect(shown, 'the preview keeps the app font').not.toContain('monospace');
            await page.reload();
            await page.locator('.markdown-view-mode-btn').click();
            await expect.poll(() => cmContent(page).evaluate((node) => getComputedStyle(node).fontFamily), 'kept after a reload').toContain('monospace');
        } finally {
            await openSettings(page);
            await select.selectOption('inherit');
        }
    });

    test('Ctrl+click follows a link written in the source, a plain click only puts the caret', covers('md.edit.ctrl-click'), async ({ page, context }) => {
        const target = await newNote(api, 'cible');
        await api.ok(api.patch(`/notes/${target.id}`, { heading: 'Cible ctrl' }));
        await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ext</title>' }));
        const note = await newNote(api, `Voir [externe](https://example.com/page) ici\n\nEt [interne](index.php?note=${target.id}) là\n`);
        await openEditor(page, note.id);
        await page.locator('.cm-line').getByText('externe').click();
        expect(context.pages().length, 'a plain click opens nothing').toBe(1);
        const opening = context.waitForEvent('page');
        await page.locator('.cm-line').getByText('externe').click({ modifiers: ['Control'] });
        const opened = await opening;
        expect(opened.url()).toBe('https://example.com/page');
        await opened.close();
        await page.locator('.cm-line').getByText('interne').click({ modifiers: ['Control'] });
        await expect(page.locator('input.css-title').first(), 'an internal link opens in place').toHaveValue('Cible ctrl');
        expect(context.pages().length).toBe(1);
    });

    test('Ctrl+Enter in or right after a [[note]] opens it, and anywhere else still opens a line', covers('md.edit.ctrl-enter-link'), async ({ page }) => {
        const target = await newNote(api, 'cible');
        const heading = `Cible entrée ${Date.now()}`;
        await api.ok(api.patch(`/notes/${target.id}`, { heading }));
        const note = await newNote(api, `Voir [[${heading}]] ici\n\nLigne simple\n`);
        await openEditor(page, note.id);
        await page.locator('.cm-line').getByText('Ligne simple').click();
        await page.keyboard.press('End');
        await page.keyboard.press('Control+Enter');
        await page.keyboard.type('suite');
        await expect.poll(() => sourceOf(page), 'elsewhere it is still a new line').toContain('Ligne simple\nsuite');
        await page.locator('.cm-line').getByText('entrée').first().click();
        await page.keyboard.press('Control+Enter');
        await expect(page.locator('input.css-title').first(), 'the caret in the reference opens it').toHaveValue(heading);
    });

    test.describe('a reference to a missing note', () => {
        // The missing note is told by GET /notes/resolve answering 404
        test.use({ allowedErrors: [/notes\/resolve\?reference=.*404|404.*notes\/resolve\?reference=/] });
        test('Ctrl+Enter on a [[note]] that does not exist asks first: Escape keeps typing, Enter creates and opens it', covers('md.edit.ctrl-enter-link'), async ({ page }) => {
            const heading = `Nouvelle entrée é ${Date.now()}`;
            const note = await newNote(api, `Créer [[${heading}]]\n`);
            await openEditor(page, note.id);
            await page.locator('.cm-line', { hasText: 'Créer' }).click();
            await page.keyboard.press('End');
            await page.keyboard.press('Control+Enter');
            const dialog = page.locator('#confirmModal');
            await expect(dialog).toBeVisible();
            await expect(page.locator('#confirmButton'), 'the button takes the keyboard').toBeFocused();
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await page.keyboard.type('!');
            await expect.poll(() => sourceOf(page), 'Escape gives the focus back to the editor, nothing was inserted').toBe(`Créer [[${heading}]]!\n`);
            expect((await api.ok(api.get('/notes', { params: { per_page: 500 } }))).json.notes.some((n) => n.heading === heading)).toBe(false);
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Control+Enter');
            await expect(dialog).toBeVisible();
            await page.keyboard.press('Enter');
            await expect(page.locator('input.css-title').first()).toHaveValue(heading);
            await expect.poll(async () => (await api.ok(api.get('/notes', { params: { per_page: 500 } }))).json.notes.some((n) => n.heading === heading)).toBe(true);
        });
    });
});

const tool = (page, name) => page.locator(`.note-edit-toolbar .btn-${name}`).first();

test.describe('Markdown toolbar', () => {
    test.describe.configure({ timeout: 120_000 });
    let account; let api; let note;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdt');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => {
        await login(page, account);
        // (an emptied note would open in the new note view)
        note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
    });

    test('with no selection the formatting buttons are hidden, a selection shows exactly the expected ones', covers('md.toolbar.selection'), async ({ page }) => {
        await retype(page, 'avant mot après');
        const shown = () => page.locator('.note-edit-toolbar .text-format-btn:visible').evaluateAll((all) => all.map((b) => b.className.match(/btn-[a-z-]+/)[0]));
        expect(await shown(), 'no selection').toEqual([]);
        await selectWord(page, 'mot');
        await expect.poll(shown).toEqual(['btn-bold', 'btn-italic', 'btn-underline', 'btn-strikethrough', 'btn-link', 'btn-color', 'btn-highlight',
            'btn-list-ul', 'btn-list-ol', 'btn-task-list', 'btn-text-height', 'btn-align', 'btn-code', 'btn-inline-code', 'btn-eraser', 'btn-search-replace-format']);
        await page.keyboard.press('End');
        await expect.poll(shown, 'a collapsed caret hides them again').toEqual([]);
    });

    test('each inline button wraps the word and a second click takes it off', covers('md.toolbar.bold', 'md.toolbar.italic', 'md.toolbar.underline', 'md.toolbar.strike', 'md.toolbar.inline-code'), async ({ page }) => {
        for (const [button, wrapped] of [['bold', '**mot**'], ['italic', '*mot*'], ['underline', '<u>mot</u>'], ['strikethrough', '~~mot~~'], ['inline-code', '`mot`']]) {
            await retype(page, 'avant mot après');
            await selectWord(page, 'mot');
            await tool(page, button).click();
            await expect.poll(() => sourceOf(page), button).toBe(`avant ${wrapped} après`);
            await tool(page, button).click();
            await expect.poll(() => sourceOf(page), `${button} off`).toBe('avant mot après');
        }
    });

    test('list buttons turn the line into a list, and the checkbox one can be removed', covers('md.toolbar.lists', 'md.toolbar.task-list'), async ({ page }) => {
        for (const [button, line] of [['list-ul', '- avant mot'], ['list-ol', '1. avant mot'], ['task-list', '- [ ] avant mot']]) {
            await retype(page, 'avant mot');
            await selectWord(page, 'mot');
            await tool(page, button).click();
            await expect.poll(() => sourceOf(page), button).toBe(line);
        }
        await selectWord(page, 'mot');
        await expect(tool(page, 'task-remove'), 'shown on a checklist').toBeVisible();
        await tool(page, 'task-remove').click();
        await expect.poll(() => sourceOf(page), 'checkbox removed').not.toContain('[ ]');
        await expect.poll(() => sourceOf(page)).toContain('avant mot');
    });

    test('the Title popup offers each level and back to normal', covers('md.toolbar.title'), async ({ page }) => {
        for (const level of [1, 2, 3, 4, 5, 6]) {
            await retype(page, 'avant mot');
            await selectWord(page, 'mot');
            await tool(page, 'text-height').click();
            await expect(page.locator('.font-size-popup .font-size-item')).toHaveText(['Back to normal text', /Heading 1/, /Heading 2/, /Heading 3/, /Heading 4/, /Heading 5/, /Heading 6/].map((label) => label instanceof RegExp ? label : new RegExp(label)));
            await page.locator(`.font-size-popup .font-size-item[data-style="${level}"]`).click();
            await expect.poll(() => sourceOf(page), `level ${level}`).toBe(`${'#'.repeat(level)} avant mot`);
        }
        await selectWord(page, 'mot');
        await tool(page, 'text-height').click();
        await page.locator('.font-size-popup .font-size-item[data-style="normal"]').click();
        await expect.poll(() => sourceOf(page)).toBe('avant mot');
    });

    test('the Align popup writes <p align>, Left takes it off', covers('md.toolbar.align'), async ({ page }) => {
        for (const [index, align] of [[1, 'center'], [2, 'right'], [3, 'justify']]) {
            await retype(page, 'avant mot');
            await selectWord(page, 'mot');
            await tool(page, 'align').click();
            await expect(page.locator('.align-popup .font-size-item')).toHaveCount(4);
            await page.locator('.align-popup .font-size-item').nth(index).click();
            await expect.poll(() => sourceOf(page), align).toBe(`<p align="${align}">avant mot</p>`);
        }
        await selectWord(page, 'mot');
        await tool(page, 'align').click();
        await page.locator('.align-popup .font-size-item').first().click();
        await expect.poll(() => sourceOf(page), 'Left').toBe('avant mot');
    });

    test('the colour and highlight popups write the colour, the ban swatch removes it', covers('md.toolbar.color', 'md.toolbar.highlight'), async ({ page }) => {
        await retype(page, 'avant mot après');
        await selectWord(page, 'mot');
        await tool(page, 'color').click();
        const items = page.locator('.color-palette-popup .color-item');
        expect(await items.count(), 'a palette').toBeGreaterThan(5);
        const colour = await items.nth(2).getAttribute('data-color');
        await items.nth(2).click();
        await expect.poll(() => sourceOf(page)).toBe(`avant <span style="color:${colour}">mot</span> après`);
        await selectWord(page, 'mot');
        await tool(page, 'color').click();
        await page.locator('.color-palette-popup .color-item:has(.color-swatch-none)').click();
        await expect.poll(() => sourceOf(page), 'colour removed').toBe('avant mot après');

        await selectWord(page, 'mot');
        await tool(page, 'highlight').click();
        const marks = page.locator('.color-palette-popup .color-item:not(:has(.color-swatch-none))');
        await marks.first().click();
        await expect.poll(() => sourceOf(page), 'first highlight').toMatch(/avant (==mot==|<span style="background-color:[^"]+">mot<\/span>) après/);
    });

    test('the code block button makes a fence and takes it off', covers('md.toolbar.code-block'), async ({ page }) => {
        await retype(page, 'avant mot');
        await selectWord(page, 'mot');
        await tool(page, 'code').click();
        await expect.poll(() => sourceOf(page)).toMatch(/```[a-z]*\n/);
        await expect.poll(() => sourceOf(page)).toContain('mot');
    });

    test('the link button opens the dialog and edits the link under the selection', covers('md.toolbar.link'), async ({ page }) => {
        await retype(page, 'avant mot après');
        await selectWord(page, 'mot');
        await tool(page, 'link').click();
        await expect(page.locator('#linkModalText')).toHaveValue('mot');
        await page.locator('#linkModalUrl').fill('https://example.com/a(b)');
        await page.locator('#linkModalUrl').press('Enter');
        await expect.poll(() => sourceOf(page), 'the link is written').toBe('avant [mot](https://example.com/a(b)) après');
        await selectWord(page, 'mot');
        await tool(page, 'link').click();
        await expect(page.locator('#linkModalUrl')).toHaveValue('https://example.com/a(b)');
        await page.locator('#linkModalRemove').click();
        await expect.poll(() => sourceOf(page), 'Remove link').toBe('avant mot après');
    });

    test('the eraser takes every format off the selection', covers('md.toolbar.eraser'), async ({ page }) => {
        await retype(page, 'avant **mot** après');
        await selectWord(page, 'mot');
        await tool(page, 'eraser').click();
        await expect.poll(() => sourceOf(page)).toBe('avant mot après');
    });

    test('the search button opens the replace dialog on the selection', covers('md.toolbar.search-replace'), async ({ page }) => {
        await retype(page, 'avant mot après mot');
        await selectWord(page, 'mot');
        await tool(page, 'search-replace-format').click();
        await expect(page.locator('#searchReplaceModal, .search-replace-modal, [id*="searchReplace"]').first()).toBeVisible();
    });

    test('code-fence detection: a language fence hides all formatting, a plain fence only what does not apply', covers('md.toolbar.code-fence'), async ({ page }) => {
        await retype(page, '```python\ndedans = 1\n```\n\n```\nsimple ici\n```\n\ndehors mot\n');
        const shown = () => page.locator('.note-edit-toolbar .text-format-btn:visible').evaluateAll((all) => all.map((b) => b.className.match(/btn-[a-z-]+/)[0]));
        await selectWord(page, 'dedans');
        await expect.poll(shown, 'language fence').toEqual([]);
        await selectWord(page, 'simple');
        await expect.poll(shown, 'plain fence').toEqual(['btn-bold', 'btn-italic', 'btn-underline', 'btn-strikethrough', 'btn-color', 'btn-highlight', 'btn-list-ul', 'btn-list-ol', 'btn-task-list', 'btn-align', 'btn-eraser', 'btn-search-replace-format']);
        await selectWord(page, 'dehors');
        await expect(tool(page, 'link'), 'outside, everything is back').toBeVisible();
    });

    test('the floating toolbar mode shows the same buttons above the selection and they work', covers('md.toolbar.floating'), async ({ page }) => {
        await setSetting(api, 'format_toolbar_mode', 'floating');
        try {
            await page.reload();
            await page.locator('.markdown-view-mode-btn').click();
            await retype(page, 'avant mot après');
            await selectWord(page, 'mot');
            const bar = page.locator('.floating-format-toolbar');
            await expect(bar).toBeVisible();
            await bar.locator('.btn-bold').click();
            await expect.poll(() => sourceOf(page)).toBe('avant **mot** après');
        } finally { await setSetting(api, 'format_toolbar_mode', 'toolbar'); }
    });
});

/** Opens the menu with a real "/" and follows the labels through the submenus. */
const slash = async (page, path) => {
    await page.keyboard.type('/');
    await expect(page.locator('.slash-command-menu').first()).toBeVisible();
    for (const [index, label] of path.entries()) {
        const scope = index === 0 ? page.locator('.slash-command-menu').first() : page.locator('.slash-command-submenu, .slash-submenu').last();
        const item = scope.locator('.slash-command-item').filter({ has: page.getByText(label, { exact: true }) }).first();
        if (index < path.length - 1) await item.hover();
        else await item.click();
    }
};
const labelsOf = (locator) => locator.locator('.slash-command-label').allInnerTexts();

test.describe('Markdown slash menu in the Rich text view', () => {
    test('in the Rich text view, Insert > Insert Markdown previews the snippet and puts its source in at the caret', covers('md.slash.insert-markdown'), async ({ page, playwright }) => {
        // The view is an account setting: an account of its own, so the other tests keep theirs
        const own = await Api.open(playwright, await newAccount(playwright, 'mdins'));
        const mine = await newNote(own, 'Début\n');
        await login(page, own.account);
        await go(page, mine.id);
        await pickView(page, 'rich');
        await cmContent(page).click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await slash(page, ['Insert', 'Insert Markdown']);
        await page.locator('#insertMarkdownSource').fill('## Ajout é\n\nUn **gras**\n');
        await expect(page.locator('#insertMarkdownPreview h2'), 'the preview shows what it will look like').toHaveText('Ajout é');
        await expect(page.locator('#insertMarkdownPreview strong')).toHaveText('gras');
        await page.locator('#insertMarkdownModal .btn-primary').click();
        await expect(page.locator('#insertMarkdownModal')).toBeHidden();
        await expect.poll(() => sourceOf(page), 'the source goes in as it is, not escaped').toContain('## Ajout é\n\nUn **gras**');
        expect(await sourceOf(page)).toMatch(/^Début\n/);
        await expect.poll(async () => (await own.getNote(mine.id)).content).toContain('Un **gras**');
        await own.dispose();
    });

});

test.describe('Markdown slash menu', () => {
    test.describe.configure({ timeout: 180_000 });
    let account; let api; let note;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mds');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => {
        await login(page, account);
        // (an emptied note would open in the new note view)
        note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await retype(page);
    });

    test('the first level lists exactly the expected entries, Escape closes, typing filters', covers('md.slash.menu'), async ({ page }) => {
        await page.keyboard.type('/');
        const menu = page.locator('.slash-command-menu').first();
        await expect(menu).toBeVisible();
        expect(await labelsOf(menu)).toEqual(['Title', 'Format text', 'Align', 'Code', 'List', 'Quote', 'Color', 'Highlight', 'Insert', 'Excalidraw', 'Mermaid', 'Calendar and time', 'Link', 'Media', 'Template']);
        await page.keyboard.type('separator');
        await expect(menu.locator('.slash-command-item')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect.poll(() => sourceOf(page), 'the filter finds a submenu entry').toBe('---\n');
        await retype(page);
        await page.keyboard.type('/');
        await expect(menu).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        expect(await sourceOf(page), 'Escape leaves the slash as typed').toBe('/');
    });

    test('a right click in the editor opens the same menu', covers('md.slash.right-click'), async ({ page }) => {
        await cmContent(page).click({ button: 'right' });
        await expect(page.locator('.slash-command-menu').first()).toBeVisible();
        await expect(page.locator('.slash-command-item', { hasText: 'Mermaid' })).toBeVisible();
    });

    test('each simple entry writes its Markdown, and each submenu lists exactly its entries', covers('md.slash.title', 'md.slash.format', 'md.slash.list', 'md.slash.quote', 'md.slash.insert', 'md.slash.code'), async ({ page }) => {
        const submenus = {
            Title: ['Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
            'Format text': ['Bold', 'Italic', 'Strikethrough'],
            Align: ['Left', 'Center', 'Right', 'Justify'],
            List: ['Bullet list', 'Numbered list', 'Checklist', 'Done', 'Task list'],
            Quote: ['Blockquote', 'Note', 'Tip', 'Important', 'Warning', 'Caution'],
            Insert: ['Toggle', 'Record audio', 'Emoji', 'Table', 'Separator', 'Insert rich text'],
            Link: ['Link', 'Link to note', 'Link to attachment'],
            Media: ['Image', 'YouTube', 'Bilibili', 'MP4 video', 'Audio', 'Record audio'],
        };
        for (const [top, labels] of Object.entries(submenus)) {
            await page.keyboard.type('/');
            await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: top }).first().hover();
            expect(await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last()), top).toEqual(labels);
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await retype(page);
        }
        for (const [path, expected] of [
            [['Title', 'Heading 1'], '# '], [['Title', 'Heading 2'], '## '], [['Title', 'Heading 3'], '### '],
            [['Title', 'Heading 4'], '#### '], [['Title', 'Heading 5'], '##### '], [['Title', 'Heading 6'], '###### '],
            [['Format text', 'Bold'], '****'], [['Format text', 'Italic'], '**'], [['Format text', 'Strikethrough'], '~~~~'],
            [['Code', 'Inline code'], '``'], [['Code', 'Code block'], '```code\n\n```\n'],
            [['List', 'Bullet list'], '- '], [['List', 'Numbered list'], '1. '], [['List', 'Checklist'], '- [ ] '], [['List', 'Done'], '- [x] '],
            [['Quote', 'Blockquote'], '> '], [['Quote', 'Note'], '> [!Note] Note\n> '], [['Quote', 'Tip'], '> [!Tip] Tip\n> '],
            [['Quote', 'Important'], '> [!Important] Important\n> '], [['Quote', 'Warning'], '> [!Warning] Warning\n> '], [['Quote', 'Caution'], '> [!Caution] Caution\n> '],
            [['Insert', 'Separator'], '---\n'],
            [['Insert', 'Toggle'], '\n\n<details class="toggle-block" open>\n<summary class="toggle-header">Toggle</summary>\n\n...\n\n</details>\n\n'],
        ]) {
            await retype(page);
            await slash(page, path);
            await expect.poll(() => sourceOf(page), path.join(' > ')).toBe(expected);
        }
    });

    test('Code lists every language and each one writes its fence', covers('md.slash.code'), async ({ page }) => {
        const languages = [['Bash', 'bash'], ['C#', 'csharp'], ['C++', 'cpp'], ['CSS', 'css'], ['Go', 'go'], ['HTML', 'html'], ['Java', 'java'], ['JavaScript', 'javascript'], ['JSON', 'json'], ['Markdown', 'markdown'], ['PHP', 'php'], ['PowerShell', 'powershell'], ['Python', 'python'], ['Ruby', 'ruby'], ['Rust', 'rust'], ['SQL', 'sql'], ['TypeScript', 'typescript'], ['XML', 'xml'], ['YAML', 'yaml']];
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Code' }).first().hover();
        expect(await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last()), 'all the languages').toEqual(['Inline code', 'Code block', ...languages.map(([label]) => label)]);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        for (const [label, lang] of languages) {
            await retype(page);
            await slash(page, ['Code', label]);
            await expect.poll(() => sourceOf(page), label).toBe(`\`\`\`${lang}\n\n\`\`\`\n`);
            await page.keyboard.type('x');
            await expect.poll(() => sourceOf(page), `${label}: the caret is inside`).toBe(`\`\`\`${lang}\nx\n\`\`\`\n`);
        }
    });

    test('Align writes the alignment of the line', covers('md.slash.align'), async ({ page }) => {
        for (const [label, expected] of [['Center', '<p align="center">ligne</p>'], ['Right', '<p align="right">ligne</p>'], ['Justify', '<p align="justify">ligne</p>'], ['Left', 'ligne']]) {
            await retype(page, 'ligne');
            await page.keyboard.press('Enter');
            await page.keyboard.press('ArrowUp');
            await page.keyboard.press('End');
            await page.keyboard.press('Space');
            await slash(page, ['Align', label]);
            await expect.poll(async () => (await sourceOf(page)).replace(/ <\//, '</').replace(/\s*\n?$/, ''), label).toBe(expected);
        }
    });

    test('Color and Highlight write the palette entry chosen', covers('md.slash.color', 'md.slash.highlight'), async ({ page }) => {
        await page.keyboard.insertText('');
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Color' }).first().hover();
        const colours = await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last());
        expect(colours.length, 'a palette').toBeGreaterThan(5);
        expect(colours).toContain('Default');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await retype(page);
        await slash(page, ['Color', colours[0]]);
        await expect.poll(() => sourceOf(page)).toMatch(/^<span style="color:[^"]+"><\/span>$/);
        await page.keyboard.type('x');
        await expect.poll(() => sourceOf(page), 'the caret is inside').toMatch(/^<span style="color:[^"]+">x<\/span>$/);
        await retype(page);
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Highlight' }).first().hover();
        const marks = await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last());
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await retype(page);
        await slash(page, ['Highlight', 'Yellow']);
        await expect.poll(() => sourceOf(page), `${marks.join(',')}: yellow is ==`).toBe('====');
        await retype(page);
        await slash(page, ['Highlight', marks.find((mark) => mark !== 'Yellow')]);
        await expect.poll(() => sourceOf(page)).toMatch(/^<span style="background-color:[^"]+"><\/span>$/);
    });

    test('back to normal text appears only inside a format and leaves it', covers('md.slash.back-to-normal'), async ({ page }) => {
        await page.keyboard.type('/');
        expect(await labelsOf(page.locator('.slash-command-menu').first())).not.toContain('Back to normal text');
        await page.keyboard.press('Escape');
        await retype(page, '**gras');
        await page.keyboard.insertText('**');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await slash(page, ['Back to normal text']);
        await page.keyboard.type(' fin');
        await expect.poll(() => sourceOf(page)).toBe('**gras** fin');
    });

    test('Insert > Table opens the size picker and writes a table of that size, ready to type in', covers('md.slash.table'), async ({ page }) => {
        await slash(page, ['Insert', 'Table']);
        const picker = page.locator('.table-picker-popup');
        await expect(picker).toBeVisible();
        await picker.locator('.table-picker-input-field').first().fill('3');
        await picker.locator('.table-picker-input-field').nth(1).fill('2');
        await picker.locator('.table-picker-insert-btn').click();
        await expect.poll(async () => (await sourceOf(page)).trim().split('\n').length, 'header + separator + rows').toBe(4);
        const lines = (await sourceOf(page)).trim().split('\n');
        expect(lines[1].replace(/\s/g, '')).toMatch(/^\|-+\|-+\|$/);
        await page.keyboard.type('Entête');
        await expect.poll(async () => (await sourceOf(page)).split('\n').find((line) => line.includes('|')), 'the first header is ready').toContain('Entête');
    });

    test('Insert > Emoji opens the picker and writes the emoji', covers('md.slash.emoji'), async ({ page }) => {
        await slash(page, ['Insert', 'Emoji']);
        const first = page.locator('.emoji-picker-popup .emoji-item, .emoji-item').first();
        await expect(first).toBeVisible();
        const emoji = (await first.innerText()).trim();
        await first.click();
        await expect.poll(() => sourceOf(page)).toBe(emoji);
    });

    test('Insert > Insert rich text converts what is pasted', covers('md.slash.paste-markdown'), async ({ page }) => {
        await slash(page, ['Insert', 'Insert rich text']);
        const zone = page.locator('#pasteMarkdownDropzone');
        await expect(zone).toBeVisible();
        await zone.evaluate((node) => {
            const data = new DataTransfer();
            data.setData('text/html', '<h2>Collé é</h2><p>un <strong>gras</strong></p>');
            data.setData('text/plain', 'Collé é un gras');
            node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        });
        await expect(page.locator('#pasteMarkdownPreview')).toHaveValue(/## Collé é[\s\S]*\*\*gras\*\*/);
        await page.locator('#pasteMarkdownInsertBtn').click();
        await expect.poll(() => sourceOf(page)).toContain('## Collé é');
        await expect.poll(() => sourceOf(page)).toContain('**gras**');
    });

    test('Link > Link opens the dialog, Link to a note and Link to attachment list their targets', covers('md.slash.link'), async ({ page }) => {
        await slash(page, ['Link', 'Link']);
        await page.locator('#linkModalUrl').fill('https://example.com/');
        await page.locator('#linkModalText').fill('Lien é');
        await page.locator('#linkModalUrl').press('Enter');
        await expect.poll(() => sourceOf(page)).toBe('[Lien é](https://example.com/)');
    });

    test('Media lists its entries and Calendar and time inserts today', covers('md.slash.media', 'md.slash.date'), async ({ page }) => {
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Media' }).first().hover();
        const media = await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last());
        for (const label of ['YouTube', 'Bilibili', 'MP4 video', 'Audio']) expect(media, label).toContain(label);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await retype(page);
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Calendar and time' }).first().hover();
        const sub = page.locator('.slash-command-submenu, .slash-submenu').last();
        expect(await labelsOf(sub)).toEqual(expect.arrayContaining(['Now', 'Relative', 'Day of the week', 'Date', 'Time', 'Date and time']));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
    });
});

const ratioOf = (page) => entry(page).evaluate((node) => parseFloat(node.style.getPropertyValue('--markdown-split-left')));

test.describe('Markdown split view', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdp');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the handle drags, the keys move it, a double click and Enter go back to halves, and it survives a reload', covers('md.split.resize'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await pickView(page, 'split');
        const handle = page.locator('.markdown-split-resizer');
        const box = await handle.boundingBox();
        const whole = await entry(page).boundingBox();
        await page.mouse.move(box.x, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(whole.x + whole.width * 0.3, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
        const dragged = await ratioOf(page);
        expect(dragged, 'dragged to 30%').toBeGreaterThan(25);
        expect(dragged).toBeLessThan(36);
        const editorWidth = (await page.locator('.markdown-editor-container, .markdown-editor').first().boundingBox()).width;
        const previewWidth = (await preview(page).boundingBox()).width;
        expect(editorWidth, 'the panes really changed').toBeLessThan(previewWidth * 0.75);
        await page.reload();
        await pickView(page, 'classic');
        await pickView(page, 'split');
        expect(await ratioOf(page), 'remembered').toBeCloseTo(dragged, 0);
        await handle.dblclick();
        await expect.poll(() => ratioOf(page), 'double click').toBe(50);
        await handle.focus();
        await page.keyboard.press('ArrowLeft');
        const stepped = await ratioOf(page);
        expect(stepped).toBeLessThan(50);
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => ratioOf(page), 'right comes back').toBe(50);
        await page.keyboard.press('Home');
        await expect.poll(() => ratioOf(page), 'Home is the minimum').toBe(20);
        await page.keyboard.press('End');
        await expect.poll(() => ratioOf(page), 'End is the maximum').toBe(80);
        await page.keyboard.press('Enter');
        await expect.poll(() => ratioOf(page), 'Enter resets').toBe(50);
        await pickView(page, 'classic');
    });

    test('the Note width entry of the ... menu steps the panes through 50, 40, 60', covers('md.split.width-entry'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await pickView(page, 'split');
        await page.locator('.markdown-split-resizer').dblclick();
        await page.locator('#pageMoreMenuBtn').click();
        const entryWidth = page.locator('#edgeMenuNoteWidth');
        for (const ratio of [40, 60, 50]) {
            await entryWidth.click();
            await expect.poll(() => ratioOf(page), `${ratio}`).toBe(ratio);
        }
        await page.keyboard.press('Escape');
        await pickView(page, 'classic');
    });

    test('Preview on the left: the card swaps the panes, and the handle still sizes the left one', covers('md.settings.preview-left'), async ({ page, playwright }) => {
        const own = await newAccount(playwright, 'mdl');
        const ownApi = await Api.open(playwright, own);
        await page.context().clearCookies();
        await login(page, own);
        const note = await newNote(ownApi);
        await openSettings(page);
        await page.locator('#markdown-split-preview-left-card').click();
        await expect.poll(() => settingOf(ownApi, 'markdown_split_preview_left')).toBe('1');
        await go(page, note.id);
        await expect(page.locator('body')).toHaveClass(/markdown-split-preview-left/);
        await pickView(page, 'split');
        const editorBox = await page.locator('.markdown-editor').first().boundingBox();
        const previewBox = await preview(page).boundingBox();
        expect(previewBox.x + previewBox.width, 'the preview is on the left').toBeLessThanOrEqual(editorBox.x + 2);
        await page.locator('.markdown-split-resizer').focus();
        await page.keyboard.press('Home');
        await expect.poll(async () => (await preview(page).boundingBox()).width, 'the left pane shrinks').toBeLessThan(previewBox.width * 0.7);
        await page.keyboard.press('Enter');
        await ownApi.dispose();
    });

    test('Framed markdown: the card turns the frames of the panes off and on', covers('md.settings.card-view'), async ({ page, playwright }) => {
        const own = await newAccount(playwright, 'mdf');
        const ownApi = await Api.open(playwright, own);
        await page.context().clearCookies();
        await login(page, own);
        const note = await newNote(ownApi);
        const framed = () => preview(page).evaluate((node) => parseFloat(getComputedStyle(node).borderTopWidth));
        await go(page, note.id);
        await expect(page.locator('body'), 'framed by default').toHaveClass(/markdown-split-card-view/);
        await pickView(page, 'split');
        expect(await framed(), 'with a frame').toBeGreaterThan(0);
        await openSettings(page);
        const card = page.locator('#markdown-split-card-view-card');
        await expect(card.locator('.setting-status')).toHaveClass(/enabled/);
        await card.click();
        await expect.poll(() => settingOf(ownApi, 'markdown_split_card_view')).toBe('0');
        await go(page, note.id);
        await expect(page.locator('body')).not.toHaveClass(/markdown-split-card-view/);
        await expect.poll(framed, 'without a frame').toBe(0);
        await ownApi.dispose();
    });

    test('typing updates the preview in place: only the changed block is redrawn', covers('md.split.incremental'), async ({ page }) => {
        const note = await newNote(api, '# Stable\n\nParagraphe un\n\nParagraphe deux\n');
        await go(page, note.id);
        await pickView(page, 'split');
        await preview(page).locator('h1').evaluate((node) => { node.dataset.mark = 'gardé'; });
        await page.locator('.cm-line', { hasText: 'Paragraphe deux' }).click();
        await page.keyboard.press('End');
        await page.keyboard.type(' modifié é');
        await expect(preview(page).locator('p', { hasText: 'Paragraphe deux' }), 'updated while typing').toHaveText('Paragraphe deux modifié é');
        await expect(preview(page).locator('h1[data-mark="gardé"]'), 'the rest of the preview was left alone').toBeVisible();
        await page.keyboard.type('\n\n## Nouveau');
        await expect(preview(page).locator('h2'), 'a new block appears').toHaveText('Nouveau');
        await expect(preview(page).locator('h1[data-mark="gardé"]')).toBeVisible();
        await pickView(page, 'classic');
    });

    test('the preview follows the caret, and a click on a block puts the caret on its line', covers('md.split.scroll-sync', 'md.split.click-to-line'), async ({ page }) => {
        const blocks = Array.from({ length: 80 }, (_, i) => `Bloc ${i + 1}`).join('\n\n');
        const note = await newNote(api, `${blocks}\n`);
        await go(page, note.id);
        await pickView(page, 'split');
        const previewTop = () => preview(page).evaluate((node) => node.scrollTop);
        expect(await previewTop(), 'starts at the top').toBe(0);
        await cmContent(page).click();
        await page.keyboard.press('Control+End');
        await expect.poll(previewTop, 'the preview went down with the caret').toBeGreaterThan(200);
        await expect(preview(page).locator('p', { hasText: 'Bloc 80' })).toBeInViewport();
        await page.keyboard.press('Control+Home');
        await expect.poll(previewTop, 'and back up').toBeLessThan(50);
        await preview(page).locator('p', { hasText: /^Bloc 3$/ }).click();
        await expect.poll(() => page.evaluate(() => {
            const host = document.querySelector('.markdown-editor'); const cm = window.PoznoteMarkdownCodeMirror;
            return cm.getValue(host).slice(0, cm.getSelectionOffsets(host).start).split('\n').length;
        }), 'caret on the line of the block').toBe(5);
        await pickView(page, 'classic');
    });
});

test.describe('Markdown preview gestures', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdc');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('ticking a task in the preview writes it to the source, unticking too, nested ones included', covers('md.preview.tick-task'), async ({ page }) => {
        const { note, view } = await render(page, api, '- [ ] à faire\n- [x] fait\n  - [ ] sous-tâche\n- [ ]\n');
        const boxes = view.locator('input.markdown-task-checkbox');
        await expect(boxes).toHaveCount(4);
        await expect(boxes.nth(0)).not.toBeChecked();
        await expect(boxes.nth(1)).toBeChecked();
        await boxes.nth(0).check();
        await expect.poll(async () => (await api.getNote(note.id)).content).toBe('- [x] à faire\n- [x] fait\n  - [ ] sous-tâche\n- [ ]\n');
        await boxes.nth(1).uncheck();
        await expect.poll(async () => (await api.getNote(note.id)).content).toBe('- [x] à faire\n- [ ] fait\n  - [ ] sous-tâche\n- [ ]\n');
        await boxes.nth(2).check();
        await expect.poll(async () => (await api.getNote(note.id)).content, 'nested').toBe('- [x] à faire\n- [ ] fait\n  - [x] sous-tâche\n- [ ]\n');
        await page.reload();
        await expect(preview(page).locator('input.markdown-task-checkbox').nth(2), 'kept').toBeChecked();
    });

    test('a click on text in the preview stays in the preview, a link opens in a new page', covers('md.preview.click'), async ({ page, context }) => {
        await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ext</title>' }));
        const { view } = await render(page, api, 'Texte simple\n\n[externe](https://example.com/page)\n');
        await view.getByText('Texte simple').click();
        await expectMode(page, 'preview');
        const opening = context.waitForEvent('page');
        await view.getByRole('link', { name: 'externe' }).click();
        const opened = await opening;
        expect(opened.url()).toBe('https://example.com/page');
        await opened.close();
        await expectMode(page, 'preview');
    });

    test('Heading underline: the card draws or removes the line under the headings', covers('md.settings.heading-underline'), async ({ page, playwright }) => {
        const own = await newAccount(playwright, 'mdu');
        const ownApi = await Api.open(playwright, own);
        await page.context().clearCookies();
        await login(page, own);
        const note = await newNote(ownApi, '# Un\n\n## Deux\n\n### Trois\n');
        const lineUnder = (tag) => preview(page).locator(tag).evaluate((node) => parseFloat(getComputedStyle(node).borderBottomWidth));
        await go(page, note.id);
        await expect(preview(page).locator('h1')).toBeVisible();
        expect(await lineUnder('h1'), 'h1').toBeGreaterThan(0);
        expect(await lineUnder('h2'), 'h2').toBeGreaterThan(0);
        expect(await lineUnder('h3'), 'not below h2').toBe(0);
        await openSettings(page);
        await page.locator('#markdown-heading-underline-card').click();
        await expect.poll(() => settingOf(ownApi, 'markdown_heading_underline')).toBe('0');
        await go(page, note.id);
        await expect(page.locator('body')).toHaveClass(/markdown-no-heading-underline/);
        await expect.poll(() => lineUnder('h1'), 'gone').toBe(0);
        await ownApi.dispose();
    });

    test('Colored markdown: Custom paints with the colour picked, the arrow gives it back to the theme, Off removes it', covers('md.settings.colored'), async ({ page, playwright }) => {
        const own = await newAccount(playwright, 'mdk');
        const ownApi = await Api.open(playwright, own);
        await page.context().clearCookies();
        await login(page, own);
        const note = await newNote(ownApi, '# Un\n\n## Deux\n\n`code`\n\n> citation\n');
        await go(page, note.id);
        await expect(page.locator('body')).not.toHaveClass(/markdown-colored/);
        const plainH1 = await preview(page).locator('h1').evaluate((node) => getComputedStyle(node).color);
        await openSettings(page);
        await page.locator('#markdown-colored-card').click();
        const modal = page.locator('#markdownColoredModal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('input[type="color"]'), 'one picker per element').toHaveCount(11);
        await modal.locator('input[value="custom"]').check();
        await page.locator('#markdownColoredH1Input').fill('#123456');
        await page.locator('#saveMarkdownColoredBtn').click();
        await expect.poll(() => settingOf(ownApi, 'markdown_colored')).toBe('custom');
        const stored = JSON.parse(await settingOf(ownApi, 'markdown_colored_custom'));
        expect(stored.h1).toBe('#123456');
        expect(stored.h2, 'the others follow the theme').toBe('');
        await go(page, note.id);
        await expect(page.locator('body')).toHaveClass(/markdown-colored/);
        await expect(preview(page).locator('h1')).toHaveCSS('color', 'rgb(18, 52, 86)');
        const themeH2 = await preview(page).locator('h2').evaluate((node) => getComputedStyle(node).color);
        expect(themeH2, 'the theme colours headings too').not.toBe(plainH1);

        await openSettings(page);
        await page.locator('#markdown-colored-card').click();
        await expect(page.locator('#markdownColoredH1Input'), 'the modal shows what is saved').toHaveValue('#123456');
        await page.locator('[data-mdc-reset="h1"]').click();
        await page.locator('#saveMarkdownColoredBtn').click();
        await expect.poll(async () => JSON.parse(await settingOf(ownApi, 'markdown_colored_custom')).h1, 'the arrow').toBe('');

        await openSettings(page);
        await page.locator('#markdown-colored-card').click();
        await modal.locator('input[value="0"]').check();
        await page.locator('#saveMarkdownColoredBtn').click();
        await expect.poll(() => settingOf(ownApi, 'markdown_colored')).toBe('0');
        await go(page, note.id);
        await expect(page.locator('body')).not.toHaveClass(/markdown-colored/);
        await ownApi.dispose();
    });

    test('Spell check: the setting reaches the editor, code stays out of it', covers('md.settings.spellcheck'), async ({ page, playwright }) => {
        const own = await newAccount(playwright, 'mdw');
        const ownApi = await Api.open(playwright, own);
        await page.context().clearCookies();
        await login(page, own);
        const note = await newNote(ownApi, 'Du texte\n\n```js\nlet a;\n```\n');
        await openEditor(page, note.id);
        await expect(cmContent(page), 'off by default').toHaveAttribute('spellcheck', 'false');
        await openSettings(page, 'Note content');
        await page.locator('#spellcheck-html-notes-card').click();
        await expect.poll(() => settingOf(ownApi, 'spellcheck_html_notes')).toBe('1');
        await openEditor(page, note.id);
        await expect(cmContent(page), 'on').toHaveAttribute('spellcheck', 'true');
        await expect(page.locator('.cm-md-code-line').first(), 'code is left out').toHaveAttribute('spellcheck', 'false');
        await ownApi.dispose();
    });

    test('the Markdown syntax help opens from the ... menu, lists each topic and filters', covers('md.help'), async ({ page }) => {
        const note = await newNote(api);
        await go(page, note.id);
        await page.locator('#pageMoreMenuBtn').click();
        await page.locator('#edgeMenuMarkdownSyntax').click();
        const modal = page.locator('#markdownSyntaxModal');
        await expect(modal).toBeVisible();
        const titles = await modal.locator('.syntax-card h2').allInnerTexts();
        expect(titles).toEqual(['Headings', 'Bold, italic and strikethrough', 'Highlight, color and inline code', 'Links and note references', 'Images and line breaks', 'Code blocks', 'Blockquotes', 'Callouts', 'Horizontal rules', 'Bullet lists', 'Ordered lists', 'Nested lists', 'Task lists', 'Basic tables', 'Column alignment', 'Math', 'Mermaid', 'Media', 'Details and summary', 'Underline and line breaks', 'Iframes']);
        await expect(modal.locator('.syntax-card', { hasText: 'Task lists' }).locator('code')).toContainText('- [x] Done');
        await modal.locator('#markdownSyntaxFilterInput').fill('mermaid');
        await expect(modal.locator('.syntax-card:visible')).toHaveCount(1);
        await expect(modal.locator('.syntax-card:visible h2')).toHaveText('Mermaid');
        await modal.locator('#markdownSyntaxFilterInput').fill('zzzzzz');
        await expect(modal.locator('.syntax-card:visible')).toHaveCount(0);
        await expect(modal.locator('#markdownSyntaxNoResults')).toBeVisible();
        await modal.locator('#markdownSyntaxClearFilter').click();
        await expect(modal.locator('.syntax-card:visible')).toHaveCount(titles.length);
        await page.keyboard.press('Escape');
        await expect(modal).toBeHidden();
    });
});

test.describe('Markdown tables', () => {
    let account; let api; let note;
    const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
    const barButton = (page, action, align) => page.locator(`.md-table-bar .md-table-bar-btn[data-action="${action}"]${align ? `[data-align="${align}"]` : ''}`);
    const clickSourceCell = async (page, text, options) => { const point = await pointOf(page, text); await page.mouse.click(point.x, point.y, options); };
    const lines = async (page) => (await sourceOf(page)).trim().split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdb');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => {
        await login(page, account);
        // (an emptied note would open in the new note view)
        note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await retype(page, TABLE);
    });

    test('the bar shows while the caret is in a table, with its buttons, and goes away outside', covers('md.table.bar'), async ({ page }) => {
        const bar = page.locator('.md-table-bar');
        await page.keyboard.press('Control+End');
        await expect(bar).toBeHidden();
        await clickSourceCell(page, '3');
        await expect(bar).toBeVisible();
        const titles = await bar.locator('.md-table-bar-btn').evaluateAll((all) => all.map((b) => b.title));
        expect(titles).toEqual(['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Align column: Left', 'Align column: Center', 'Align column: Right', 'Delete', 'Formulas']);
    });

    test('bar: rows above and below, columns left and right', covers('md.table.bar-insert'), async ({ page }) => {
        await clickSourceCell(page, '3');
        await barButton(page, 'insertRowAbove').click();
        await expect.poll(async () => (await lines(page)).length, 'row above').toBe(5);
        expect((await lines(page))[4]).toBe('| 3 | 4 |');
        await retype(page, TABLE);
        await clickSourceCell(page, '1');
        await barButton(page, 'insertRowBelow').click();
        await expect.poll(async () => (await lines(page)).length, 'row below').toBe(5);
        expect((await lines(page))[2]).toBe('| 1 | 2 |');
        expect((await lines(page))[4], 'below the caret').toBe('| 3 | 4 |');
        await retype(page, TABLE);
        await clickSourceCell(page, '1');
        await barButton(page, 'insertColRight').click();
        await expect.poll(async () => (await lines(page))[2].split('|').length, 'column right').toBe(5);
        expect((await lines(page))[2]).toMatch(/^\| 1 \| +\| 2 \|$/);
        await retype(page, TABLE);
        await clickSourceCell(page, '1');
        await barButton(page, 'insertColLeft').click();
        await expect.poll(async () => (await lines(page))[2], 'column left').toMatch(/^\| +\| 1 \| 2 \|$/);
    });

    test('bar: alignment writes the separator row, for the column of the caret', covers('md.table.bar-align'), async ({ page }) => {
        for (const [align, pattern] of [['center', /^\|\s*:-+:\s*\|\s*-+\s*\|$/], ['right', /^\|\s*-+:\s*\|\s*-+\s*\|$/], ['left', /^\|\s*:-+\s*\|\s*-+\s*\|$/]]) {
            await clickSourceCell(page, '1');
            await barButton(page, 'align', align).click();
            await expect.poll(async () => (await lines(page))[1], align).toMatch(pattern);
        }
    });

    test('bar: the bin deletes the row, the column or the table', covers('md.table.bar-delete'), async ({ page }) => {
        const menu = page.locator('.md-table-bar-menu');
        await clickSourceCell(page, '3');
        await barButton(page, 'delete').click();
        await expect(menu.locator('.table-context-menu-item')).toHaveText([/Delete row/, /Delete column/, /Delete table/]);
        await menu.locator('.table-context-menu-item').nth(0).click();
        await expect.poll(() => lines(page), 'row').toEqual(['| A | B |', expect.stringMatching(/^\| -+ \| -+ \|$/), '| 1 | 2 |']);
        await clickSourceCell(page, '1');
        await barButton(page, 'delete').click();
        await menu.locator('.table-context-menu-item').nth(1).click();
        await expect.poll(async () => (await lines(page))[0], 'column').toBe('| B |');
        await clickSourceCell(page, '2');
        await barButton(page, 'delete').click();
        await menu.locator('.table-context-menu-item').nth(2).click();
        await expect.poll(() => sourceOf(page), 'the table waits for the confirmation').toContain('| B');
        await page.locator('.alert-modal-overlay.show button').last().click();
        await expect.poll(async () => (await sourceOf(page)).trim(), 'table').toBe('');
    });

    test('bar: Formulas on a preview cell writes each formula, computes it, Remove takes it off', covers('md.table.bar-formulas'), async ({ page }) => {
        await retype(page, '| A | B |\n| --- | --- |\n| 2 | 3 |\n| 4 | 5 |\n| 7 | 1 |\n');
        await clickSourceCell(page, '7');
        await expect(barButton(page, 'formulas'), 'not from the source, whose value is unknown').toBeDisabled();
        await page.locator('.markdown-view-mode-btn').click();
        const cell = preview(page).locator('tr').last().locator('td').first();
        const open = async () => {
            await cell.click();
            await barButton(page, 'formulas').click();
            return page.locator('.md-table-formula-menu:visible').last();
        };
        for (const [formula, axis, written, shown] of [
            ['sum-col', 'Column', '=SUM(col)', '6'], ['avg-col', 'Column', '=AVG(col)', '3'], ['min-col', 'Column', '=MIN(col)', '2'], ['max-col', 'Column', '=MAX(col)', '4'],
            ['count-col', 'Column', '=COUNT(col)', '2'], ['prod-col', 'Column', '=PRODUCT(col)', '8'], ['sum-row', 'Row', '=SUM(row)', '1'],
        ]) {
            const menu = await open();
            await menu.locator('.table-context-menu-item', { hasText: axis }).first().hover();
            await menu.locator(`[data-formula="${formula}"]`).click();
            await expect(cell, formula).toHaveText(shown);
            await expect.poll(async () => (await api.getNote(note.id)).content, formula).toContain(written);
        }
        const menu = await open();
        await menu.locator('[data-item="removeFormula"].table-context-menu-item').click();
        await expect.poll(async () => (await api.getNote(note.id)).content, 'removed').not.toContain('=');
    });

    test('a right click in the source opens the full table menu', covers('md.table.context-menu'), async ({ page }) => {
        await clickSourceCell(page, '3', { button: 'right' });
        const menu = page.locator('.table-context-menu').first();
        await expect(menu).toBeVisible();
        const labels = (await menu.locator('.table-context-menu-item').allInnerTexts()).map((text) => text.replace(/^\S+\s+/, '').trim());
        for (const label of ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Delete row', 'Delete column', 'Delete table']) {
            expect(labels.join('|'), label).toContain(label);
        }
        await menu.locator('.table-context-menu-item', { hasText: 'Delete row' }).click();
        await expect.poll(async () => (await lines(page)).join('\n'), 'the entry acts').not.toContain('| 3 | 4 |');
    });

    test('Tab and Shift+Tab move between cells, Tab past the last cell adds a row, Shift+Enter breaks the line', covers('md.table.tab', 'md.table.line-break'), async ({ page }) => {
        await clickSourceCell(page, '3');
        await page.keyboard.press('Tab');
        await page.keyboard.type('X');
        await expect.poll(() => sourceOf(page), 'next cell').toMatch(/\| 3\s*\|[^|\n]*X[^|\n]*\|/);
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.type('Y');
        await expect.poll(() => sourceOf(page), 'previous cell').toMatch(/\|[^|\n]*Y[^|\n]*\|[^|\n]*X[^|\n]*\|/);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.type('nouvelle');
        await expect.poll(async () => (await lines(page)).length, 'a row was added').toBe(5);
        expect((await lines(page))[4]).toContain('nouvelle');
        await page.keyboard.press('Shift+Enter');
        await expect.poll(() => sourceOf(page), 'a break in a cell').toContain('<br>');
    });

    test('in the preview, a click on a cell shows the bar and it edits the note', covers('md.table.preview-bar'), async ({ page }) => {
        await page.locator('.btn-save').first().click();
        await expect.poll(async () => (await api.getNote(note.id)).content.replace(/ +/g, ' ')).toBe(TABLE);
        await page.locator('.markdown-view-mode-btn').click();
        await preview(page).locator('td', { hasText: '3' }).click();
        await expect(preview(page).locator('td.md-table-active-cell')).toHaveText('3');
        await barButton(page, 'insertRowBelow').click();
        await expect(preview(page).locator('tr')).toHaveCount(4);
        await expect.poll(async () => (await api.getNote(note.id)).content.trim().split('\n').length, 'stored').toBe(5);
    });

    test('hovering a drawn table shows + buttons that add a row and a column', covers('md.table.hover-add'), async ({ page }) => {
        await page.locator('.btn-save').first().click();
        await expect.poll(async () => (await api.getNote(note.id)).content.replace(/ +/g, ' ')).toBe(TABLE);
        await page.locator('.markdown-view-mode-btn').click();
        await preview(page).locator('table').hover();
        await page.locator('.md-table-handle-row').click();
        await expect(preview(page).locator('tr')).toHaveCount(4);
        await preview(page).locator('table').hover();
        await page.locator('.md-table-handle-column').click();
        await expect(preview(page).locator('tr').first().locator('th')).toHaveCount(3);
        await expect.poll(async () => (await api.getNote(note.id)).content.split('\n')[0].split('|').length, 'stored').toBe(5);
    });

    test('a drawn table: a rich text cell takes typing, in live preview a click brings back its source', covers('md.table.live-edit'), async ({ page }) => {
        await retype(page, `Haut\n\n${TABLE}\nBas\n`);
        await pickView(page, 'rich');
        await page.locator('.cm-line', { hasText: 'Bas' }).click();
        await page.locator('.cm-live-block-table td', { hasText: '3' }).click();
        await page.keyboard.type('é');
        await page.locator('.cm-line', { hasText: 'Bas' }).click();
        await expect.poll(() => sourceOf(page), 'the cell is written in the source').toMatch(/\| 3é\s*\|/);
        await expect(page.locator('.cm-live-block-table td', { hasText: '3é' }), 'and drawn').toBeVisible();
        await pickView(page, 'live');
        await page.locator('.cm-line', { hasText: 'Bas' }).click();
        await page.locator('.cm-live-block-table td', { hasText: '3é' }).click();
        await expect(page.locator('.cm-md-table-line').first(), 'the source is back').toBeVisible();
        await expect(page.locator('.cm-live-block-table')).toHaveCount(0);
        await pickView(page, 'classic');
    });

    test('a wide table scrolls in its own box, words are not cut and the page does not widen', covers('md.table.wide'), async ({ page }) => {
        const header = Array.from({ length: 14 }, (_, i) => `Colonne${i}`).join(' | ');
        const row = Array.from({ length: 14 }, () => 'Wikipedia').join(' | ');
        const separator = Array.from({ length: 14 }, () => '---').join(' | ');
        const wide = await newNote(api, `| ${header} |\n| ${separator} |\n| ${row} |\n`);
        await go(page, wide.id);
        const box = preview(page).locator('.markdown-table-scroll');
        await expect(box).toBeVisible();
        const sizes = await box.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth, page: document.getElementById('right_col').scrollWidth - document.getElementById('right_col').clientWidth }));
        expect(sizes.scroll, 'the box scrolls').toBeGreaterThan(sizes.client);
        expect(sizes.page, 'the note does not').toBeLessThanOrEqual(0);
        const height = await preview(page).locator('td').first().evaluate((node) => node.getBoundingClientRect().height);
        const lineHeight = await preview(page).locator('td').first().evaluate((node) => parseFloat(getComputedStyle(node).lineHeight) || 20);
        expect(height, 'a word stays on one line').toBeLessThan(lineHeight * 2.5);
        await box.evaluate((node) => { node.scrollLeft = 300; });
        expect(await box.evaluate((node) => node.scrollLeft)).toBe(300);
    });

    test('table rows do not wrap in the source and the pipes line up with CJK text', covers('md.table.cjk'), async ({ page }) => {
        await retype(page, '| 日本語 | B |\n| --- | --- |\n| a | 한글 |\n');
        await page.keyboard.press('Control+Home');
        await clickSourceCell(page, 'a');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect.poll(() => sourceOf(page), 'a new row formats the table, CJK counted double').toContain('| 日本語 | B    |\n| ------ | ---- |\n| a      | 한글 |');
        await expect(page.locator('.cm-md-table-wide').first(), 'wide cells are drawn on two columns').toBeAttached();
        const pipes = () => page.evaluate(() => {
            const positions = [...document.querySelectorAll('.cm-line')].filter((line) => line.textContent.startsWith('|')).map((line) => {
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                const xs = [];
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    for (let i = 0; i < node.textContent.length; i++) {
                        if (node.textContent[i] !== '|') continue;
                        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
                        xs.push(Math.round(range.getBoundingClientRect().left));
                    }
                }
                return xs;
            });
            return positions;
        });
        const rows = await pipes();
        expect(rows.length).toBe(4);
        for (let i = 0; i < rows[0].length; i++) {
            const spread = Math.max(...rows.map((row) => row[i])) - Math.min(...rows.map((row) => row[i]));
            expect(spread, `pipe ${i} of ${JSON.stringify(rows)}`).toBeLessThanOrEqual(2);
        }
    });
});

test.describe('Mermaid', () => {
    let account; let api;
    const TYPES = [
        ['Flowchart', 'flowchart'], ['Sequence diagram', 'sequenceDiagram'], ['Class diagram', 'classDiagram'], ['State diagram', 'stateDiagram'],
        ['Entity relationship', 'erDiagram'], ['Gantt chart', 'gantt'], ['Pie chart', 'pie'], ['Mindmap', 'mindmap'], ['Timeline', 'timeline'],
        ['User journey', 'journey'], ['Git graph', 'gitGraph'], ['Quadrant chart', 'quadrantChart'], ['Bar and line chart', 'xychart'],
    ];
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdm');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the slash menu lists each diagram type, whose starter renders in the preview', covers('md.mermaid.types', 'md.slash.mermaid'), async ({ page }) => {
        test.setTimeout(120_000);
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await page.keyboard.type('/');
        await page.locator('.slash-command-menu').first().locator('.slash-command-item').filter({ hasText: 'Mermaid' }).first().hover();
        expect(await labelsOf(page.locator('.slash-command-submenu, .slash-submenu').last())).toEqual(TYPES.map(([label]) => label));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        for (const [label, keyword] of TYPES) {
            await retype(page);
            await slash(page, ['Mermaid', label]);
            await expect.poll(() => sourceOf(page), label).toContain('```mermaid\n');
            expect(await sourceOf(page), label).toContain(keyword);
            await page.locator('.markdown-view-mode-btn').click();
            const drawn = preview(page).locator('.mermaid svg');
            await expect(drawn, `${label} is drawn`).toBeVisible({ timeout: 15_000 });
            const size = await drawn.boundingBox();
            expect(size.width, `${label} has a size`).toBeGreaterThan(50);
            expect(await drawn.locator('text, foreignObject, tspan').count(), `${label} has labels`).toBeGreaterThan(0);
            await page.locator('.markdown-view-mode-btn').click();
        }
    });

    test('a broken diagram shows an error and its source instead of breaking the note', covers('md.mermaid.error'), async ({ page }) => {
        const { view } = await render(page, api, 'Avant\n\n```mermaid\nflowchart TD\n  A[[[ -->\n```\n\nAprès\n');
        await expect(view.getByText('Après')).toBeVisible();
        await expect(view.locator('pre code.language-text'), 'the message and the source').toContainText('A[[[');
        await expect(view.locator('svg[id*="mermaid"]')).toHaveCount(0);
    });

    test('Enlarge opens the viewer: zoom, fit, Escape and the back button close it', covers('md.mermaid.zoom'), async ({ page }) => {
        const { view } = await render(page, api, '```mermaid\nflowchart TD\n  A[Idée] --> B[Note]\n```\n');
        await expect(view.locator('.mermaid svg')).toBeVisible({ timeout: 15_000 });
        await view.locator('.mermaid').hover();
        await view.locator('.mermaid-zoom-btn').click();
        const viewer = page.locator('.mermaid-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('svg').first()).toContainText('Idée');
        const scale = () => viewer.locator('svg').first().evaluate((svg) => svg.getBoundingClientRect().width);
        const fit = await scale();
        await page.keyboard.press('+');
        await expect.poll(scale, '+ zooms in').toBeGreaterThan(fit);
        await page.keyboard.press('0');
        await expect.poll(scale, '0 fits').toBeCloseTo(fit, -1);
        await page.keyboard.press('-');
        await expect.poll(scale, '- zooms out').toBeLessThan(fit);
        const box = await viewer.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        const before = await scale();
        await page.mouse.wheel(0, -300);
        await expect.poll(scale, 'the wheel zooms').toBeGreaterThan(before);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await view.locator('.mermaid').hover();
        await view.locator('.mermaid-zoom-btn').click();
        await expect(viewer).toBeVisible();
        await page.goBack();
        await expect(viewer, 'Back closes it').toBeHidden();
        await expect(view.locator('.mermaid svg'), 'and stays on the note').toBeVisible();
    });
});

test.describe('Markdown conversion and export', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdx');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    const fromMenu = async (page, label) => {
        await page.locator('.mobile-more-btn').first().click();
        await page.locator('.mobile-toolbar-item:visible', { hasText: label }).click();
    };

    test('Convert to rich text and back, from the note menu, keeps the formatting', covers('md.convert.to-rich', 'md.convert.to-markdown'), async ({ page }) => {
        const note = await newNote(api, '# Titre é\n\nUn **gras** et *ital*\n\n- item\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
        await go(page, note.id);
        await fromMenu(page, 'Convert to rich text');
        const modal = page.locator('#convertNoteModal');
        await expect(modal).toBeVisible();
        await page.locator('#confirmConvertBtn').click();
        await expect(page.locator('.noteentry[contenteditable="true"] h1, .noteentry h1').first()).toHaveText('Titre é');
        let stored = await api.getNote(note.id);
        expect(stored.type).toBe('note');
        expect(stored.content).toContain('<strong>gras</strong>');
        expect(stored.content).toContain('<table');
        await page.locator('.noteentry strong').first().waitFor();
        await fromMenu(page, 'Convert to Markdown');
        await expect(modal).toBeVisible();
        await page.locator('#confirmConvertBtn').click();
        await expect(preview(page).locator('h1')).toHaveText('Titre é');
        stored = await api.getNote(note.id);
        expect(stored.type).toBe('markdown');
        expect(stored.content).toContain('# Titre é');
        expect(stored.content).toContain('**gras**');
        expect(stored.content).toMatch(/\| a\s*\| b\s*\|/);
    });

    test('Cancel leaves the note, Duplicate first keeps a copy', covers('md.convert.cancel-duplicate'), async ({ page }) => {
        const note = await newNote(api, '# Copie é\n');
        await go(page, note.id);
        await fromMenu(page, 'Convert to rich text');
        await page.locator('#convertNoteModal .btn-cancel').click();
        await expect(page.locator('#convertNoteModal')).toBeHidden();
        expect((await api.getNote(note.id)).type).toBe('markdown');
        const before = (await api.ok(api.get('/notes'))).json.notes.length;
        await fromMenu(page, 'Convert to rich text');
        await page.locator('#duplicateBeforeConvertBtn').click();
        await expect(page.locator('#duplicateBeforeConvertBtn')).toBeDisabled();
        await expect.poll(async () => (await api.ok(api.get('/notes'))).json.notes.length, 'a copy').toBe(before + 1);
        await page.locator('#confirmConvertBtn').click();
        await expect(page.locator('.noteentry h1').first()).toHaveText('Copie é');
        expect((await api.getNote(note.id)).type).toBe('note');
    });

    test('Download offers Markdown and HTML, each file holds the note', covers('md.export.markdown', 'md.export.html'), async ({ page }) => {
        const note = await newNote(api, '# Export é\n\nUn **gras**\n');
        await api.ok(api.patch(`/notes/${note.id}`, { heading: 'Mon export' }));
        await go(page, note.id);
        await fromMenu(page, 'Download');
        const modal = page.locator('#exportModal');
        await expect(modal.locator('.export-option-markdown')).toBeVisible();
        await expect(modal.locator('.export-option-html')).toBeVisible();
        await expect(modal.locator('.export-option-html-embedded')).toBeVisible();
        await expect(modal.locator('.export-option-json'), 'not for a Markdown note').toBeHidden();
        const download = async (type) => {
            const waiting = page.waitForEvent('download');
            await modal.locator(`[data-type="${type}"]`).click();
            const file = await waiting;
            const chunks = [];
            for await (const chunk of await file.createReadStream()) chunks.push(chunk);
            return { name: file.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
        };
        const md = await download('markdown');
        expect(md.name).toMatch(/\.md$/);
        expect(md.text).toContain('# Export é\n\nUn **gras**');
        expect(md.text.startsWith('---\n'), 'front matter').toBe(true);
        expect(md.text).toContain('title: "Mon export"');
        await fromMenu(page, 'Download');
        const html = await download('html');
        expect(html.name).toMatch(/\.html$/);
        expect(html.text).toMatch(/Export (é|&eacute;)<\/h1>/);
        expect(html.text).toContain('<strong>gras</strong>');
    });

    test('Print opens the page made for printing, with the note rendered', covers('md.export.print'), async ({ page, context }) => {
        const note = await newNote(api, '# Imprimé é\n');
        await go(page, note.id);
        const opening = context.waitForEvent('page');
        await page.addInitScript(() => { window.print = () => {}; });
        await fromMenu(page, 'Print');
        const opened = await opening;
        await opened.waitForLoadState();
        await expect(opened.locator('body')).toHaveClass(/note-print-page/);
        await expect(opened.locator('h1', { hasText: 'Imprimé é' })).toBeVisible();
        await opened.close();
    });
});

test.describe('Markdown tabs, code block buttons and inserted media', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'mdz');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('coming back to a tab restores the caret, and the mode follows the setting, not the tab', covers('md.view.tab-return'), async ({ page }) => {
        const first = await newNote(api, 'Ligne un\nLigne deux\nLigne trois\n');
        const second = await newNote(api, 'Autre note\n');
        await setSetting(api, 'markdown_default_view_mode', 'edit');
        try {
            await go(page, first.id);
            await expectMode(page, 'edit');
            await page.locator('.cm-line', { hasText: 'Ligne deux' }).click();
            await page.keyboard.press('End');
            const caretLine = () => page.evaluate(() => {
                const host = document.querySelector('#right_col .markdown-editor'); const cm = window.PoznoteMarkdownCodeMirror;
                return cm.getValue(host).slice(0, cm.getSelectionOffsets(host).start).split('\n').pop();
            });
            expect(await caretLine()).toBe('Ligne deux');
            await page.locator(`a[data-dblaction="open-note-new-tab"][data-note-db-id="${second.id}"], a[data-dblaction="open-note-new-tab"][href*="note=${second.id}"]`).first().dblclick();
            await expect(page.locator('#app-tab-bar .app-tab')).toHaveCount(2);
            await expect(page.locator(`#entry${second.id}`)).toBeVisible();
            await page.locator('#app-tab-bar .app-tab').first().click();
            await expect(page.locator(`#entry${first.id}`)).toBeVisible();
            await expectMode(page, 'edit');
            await expect.poll(caretLine, 'the caret is back').toBe('Ligne deux');
            await page.keyboard.type(' ici');
            await expect.poll(() => sourceOf(page), 'and it has the focus').toContain('Ligne deux ici');
            await setSetting(api, 'markdown_default_view_mode', 'preview');
            await page.reload();
            await expectMode(page, 'preview');
        } finally { await setSetting(api, 'markdown_default_view_mode', 'preview'); }
    });

    test('code block buttons of the preview: line numbers, language and delete', covers('md.preview.code-buttons', 'md.edit.line-numbers'), async ({ page }) => {
        const { note, view } = await render(page, api, 'Avant\n\n```javascript\nlet a = 1;\nlet b = 2;\n```\n\nAprès\n');
        const block = view.locator('.code-block-actions-host').first();
        await block.hover();
        const code = block.locator('pre code');
        await expect(code).not.toHaveClass(/code-line-numbers/);
        await block.locator('.code-block-line-numbers-btn').click();
        await expect(code, 'gutter on').toHaveClass(/code-line-numbers/);
        await page.reload();
        await expect(preview(page).locator('pre code').first(), 'remembered for the note').toHaveClass(/code-line-numbers/);
        await preview(page).locator('.code-block-actions-host').first().hover();
        await preview(page).locator('.code-block-line-numbers-btn').first().click();
        await expect(preview(page).locator('pre code').first(), 'gutter off').not.toHaveClass(/code-line-numbers/);

        await preview(page).locator('.code-block-actions-host').first().hover();
        await preview(page).locator('.code-block-lang-btn').first().click();
        await page.locator('.code-block-language-item', { hasText: 'Python' }).first().click();
        await expect.poll(async () => (await api.getNote(note.id)).content, 'the language is written in the fence').toContain('```python\nlet a = 1;');

        await expect(preview(page).locator('.code-block-delete-btn').first(), 'the bin is hidden by default (#1406)').toBeHidden();
        await setSetting(api, 'hidden_ui_elements', '[]');
        try {
            await page.reload();
            await preview(page).locator('.code-block-actions-host').first().hover();
            await preview(page).locator('.code-block-delete-btn').first().click();
            await page.locator('.alert-modal-overlay.show button').last().click();
            await expect.poll(async () => (await api.getNote(note.id)).content, 'the fence is gone').not.toContain('let a');
            await expect(preview(page).locator('pre')).toHaveCount(0);
            await expect(preview(page).getByText('Après')).toBeVisible();
        } finally { await setSetting(api, 'hidden_ui_elements', JSON.stringify(['panel:preview-code-block-delete'])); }
    });

    test('code blocks in the live view have the same buttons', covers('md.view.live-blocks'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const note = await newNote(api, 'Haut\n\n```js\nconst copie = 1;\n```\n\nBas\n');
        await go(page, note.id);
        await pickView(page, 'live');
        await page.locator('.cm-line.cm-live-code', { hasText: 'const' }).hover();
        await page.locator('.cm-live-code-copy').click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('const copie = 1;');
        const lines = page.locator('.cm-live-code-lines');
        await expect(lines).toHaveAttribute('aria-pressed', 'false');
        await lines.click();
        await expect(page.locator('.cm-live-code-lines')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('.cm-live-code-lines').click();
        await pickView(page, 'classic');
    });

    test('slash YouTube writes an embed that the preview draws', covers('md.slash.media'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await page.route(/youtube/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
        await openEditor(page, note.id);
        await focusEnd(page);
        await slash(page, ['Media', 'YouTube']);
        const dialog = page.locator('.modal-content', { hasText: 'Insert YouTube Video' });
        await dialog.locator('input').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        await dialog.getByRole('button', { name: 'Insert' }).click();
        await expect.poll(() => sourceOf(page)).toContain('youtube');
        await page.locator('.markdown-view-mode-btn').click();
        await expect(preview(page).locator('iframe')).toHaveAttribute('src', /dQw4w9WgXcQ/);
    });

    test('slash Image uploads the file chosen and draws it', covers('md.slash.media'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        const choosing = page.waitForEvent('filechooser');
        await slash(page, ['Media', 'Image']);
        await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
        await expect.poll(() => sourceOf(page), 'written as an image').toMatch(/!\[.*\]\(.+\)/);
        await page.locator('.markdown-view-mode-btn').click();
        await expect.poll(() => preview(page).locator('img').first().evaluate((img) => img.naturalWidth), 'really loaded').toBe(1);
    });

    test('slash Link to note lists the notes and writes the link, which opens the note', covers('md.slash.link'), async ({ page }) => {
        const target = await newNote(api, 'cible');
        await api.ok(api.patch(`/notes/${target.id}`, { heading: 'Cible référence' }));
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await slash(page, ['Link', 'Link to note']);
        await page.locator('.note-reference-item', { hasText: 'Cible référence' }).click();
        await expect.poll(() => sourceOf(page)).toContain('Cible référence');
        await expect.poll(() => sourceOf(page)).toContain(String(target.id));
        await page.locator('.markdown-view-mode-btn').click();
        await preview(page).getByRole('link', { name: 'Cible référence' }).click();
        await expect(page.locator('input.css-title').first()).toHaveValue('Cible référence');
    });

    test('slash Task list embeds a task list that shows its tasks', covers('md.slash.list'), async ({ page }) => {
        const list = await api.createNote({ heading: 'Liste intégrée', content: '[]', type: 'tasklist' });
        await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'Tâche visible' }));
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await slash(page, ['List', 'Task list']);
        await page.locator('#taskListPickerModal').getByText('Liste intégrée').click();
        await page.locator('#confirmTaskListPickerBtn').click();
        await expect.poll(() => sourceOf(page)).toContain(`data-task-embed="${list.id}"`);
        await page.locator('.markdown-view-mode-btn').click();
        await expect(preview(page).locator('.tasklist-embed')).toContainText('Tâche visible');
    });

    test('slash MP4, Audio and Bilibili write their player', covers('md.slash.media'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await page.route(/bilibili/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
        await openEditor(page, note.id);
        await focusEnd(page);
        for (const [label, file, written] of [
            ['MP4 video', { name: 'film.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4') }, /<video [^>]*src="[^"]+"/],
            ['Audio', { name: 'son.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake mp3') }, /<audio [^>]*src="[^"]+"|<iframe [^>]*audio/],
        ]) {
            const choosing = page.waitForEvent('filechooser');
            await slash(page, ['Media', label]);
            await (await choosing).setFiles(file);
            await expect.poll(() => sourceOf(page), label).toMatch(written);
            await page.keyboard.press('Control+End');
        }
        await slash(page, ['Media', 'Bilibili']);
        const dialog = page.locator('.modal-content:visible').last();
        await dialog.locator('input').first().fill('https://www.bilibili.com/video/BV1xx411c7mD');
        await dialog.getByRole('button', { name: 'Insert' }).click();
        await expect.poll(() => sourceOf(page), 'Bilibili').toContain('BV1xx411c7mD');
    });

    test('slash Link to attachment lists those of the note and writes the link', covers('md.slash.link'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await api.ok(api.call('POST', `/notes/${note.id}/attachments`, { multipart: { file: { name: 'pièce.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu') } } }));
        await openEditor(page, note.id);
        await focusEnd(page);
        await slash(page, ['Link', 'Link to attachment']);
        await page.locator('#attachmentPickerModal .note-reference-item', { hasText: 'pièce.txt' }).click();
        await expect.poll(() => sourceOf(page)).toMatch(/\[.*pièce\.txt.*\]\(.+\)/);
    });

    test('slash Template pastes a note of the Templates folder', covers('md.slash.template'), async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Templates' }))).json.folder;
        const template = await newNote(api, '## Modèle é\n\n- [ ] à faire\n');
        await api.ok(api.patch(`/notes/${template.id}`, { heading: 'Mon modèle' }));
        await api.ok(api.post(`/notes/${template.id}/folder`, { folder_id: folder.id }));
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await slash(page, ['Template']);
        await page.getByText('Mon modèle', { exact: true }).last().click();
        await expect.poll(() => sourceOf(page)).toContain('## Modèle é\n\n- [ ] à faire');
    });

    test('slash Excalidraw opens the drawing editor for this note', covers('md.slash.excalidraw'), async ({ page }) => {
        const note = await newNote(api, 'x\n');
        await openEditor(page, note.id);
        await focusEnd(page);
        await page.route(/excalidraw_editor\.php/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
        await slash(page, ['Excalidraw']);
        await page.waitForURL(/excalidraw_editor\.php/);
        expect(page.url()).toContain(String(note.id));
    });

    test('Insert Markdown in a rich text note converts what is typed', covers('md.insert-markdown-modal'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Riche', content: '<p>Début</p>' });
        await openNote(page, note.id);
        const rich = page.locator('.noteentry[contenteditable="true"]').first();
        await rich.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await slash(page, ['Insert', 'Insert Markdown']);
        await page.locator('#insertMarkdownSource').fill('## Depuis Markdown é\n\nUn **gras**\n');
        await expect(page.locator('#insertMarkdownPreview h2')).toHaveText('Depuis Markdown é');
        await page.locator('#insertMarkdownModal .btn-primary').click();
        await expect(rich.locator('h2')).toHaveText('Depuis Markdown é');
        await expect(rich.locator('strong')).toHaveText('gras');
    });
});
