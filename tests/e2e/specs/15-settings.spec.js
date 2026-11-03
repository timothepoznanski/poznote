// Settings and appearance: every card of settings.php, operated from its real
// control, with its stored value and its visible effect where it applies.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect, covers, Api, ADMIN, BASE_URL, PNG, inInstance, newAccount, login, openNote, settled } = require('../lib/helpers');

test.use({ actionTimeout: 15_000 });

const I18N_DIR = path.join(__dirname, '..', '..', '..', 'src', 'i18n');
const SECTION = {
    account: 'settings-account-section-grid', workspaces: 'settings-workspaces-section-grid',
    backup: 'settings-backup-restore-section-grid', exportImport: 'settings-export-import-section-grid',
    sync: 'settings-sync-history-section-grid', integrations: 'settings-integrations-section-grid',
    apps: 'settings-apps-section-grid', display: 'settings-display-section-grid',
    visibility: 'settings-ui-customization-section-grid', sidebar: 'settings-sidebar-section-grid',
    content: 'settings-note-content-section-grid', markdown: 'settings-markdown-section-grid',
    diary: 'settings-diary-section-grid', admin: 'admin-tools-grid', about: 'settings-documentation-section-grid',
};

const stored = async (api, key) => (await api.ok(api.get(`/settings/${key}`))).json.value;
const expectStored = (api, key, value) => expect.poll(() => stored(api, key), { message: `stored ${key}` }).toBe(value);
/** Opens one section of the settings page, from its link in the list on the left. */
async function openSection(page, grid) {
    await page.goto('about:blank');
    await page.goto(`/settings.php#section=${grid}`);
    await expect(page.locator(`#${grid}`), `section ${grid}`).toBeVisible();
    await expect(page.locator('.settings-nav-item.is-active'), 'the page scripts ran').toBeVisible();
}
const openAdminGroup = async (page, card) => {
    await page.goto('about:blank');
    await page.goto('/settings.php#section=admin-tools-grid');
    await expect(page.locator('.settings-nav-group-item.is-active'), 'the page scripts ran').toBeVisible();
    const group = await page.evaluate((id) => {
        return document.getElementById(id).closest('.settings-group').previousElementSibling.dataset.group;
    }, card);
    await page.click(`.settings-nav-group-item[data-admin-group="${group}"]`);
    await expect(page.locator(`#${card}`)).toBeVisible();
};
/** window.alert and confirm are in-page dialogs here (js/modal-alerts.js). */
const answerDialog = async (page, button) => {
    const dialog = page.locator('.alert-modal').last();
    await expect(dialog).toBeVisible();
    const text = await dialog.innerText();
    await dialog.locator('.alert-modal-button').filter(button ? { hasText: button } : {}).last().click();
    await expect(page.locator('.alert-modal', { hasText: text.trim().split('\n')[0] }), 'the dialog closes').toHaveCount(0);
    return text;
};
// No wait for a quiet network, which a polling page reaches late: what follows retries by itself
const openQuick = (page, id) => page.goto(`/index.php?note=${id}`);
const css = (locator, property) => locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
const userStorage = (page, key) => page.evaluate((k) => (window.__poznoteUserStorage || localStorage).getItem(k), key);

// ---------------------------------------------------------------------------
test.describe('settings page frame', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'set');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    const USER_CARDS = {
        [SECTION.account]: ['my-profile-card', 'change-password-card', 'two-factor-card', 'app-passwords-card', 'delete-account-card', 'language-card', 'timezone-card', 'date-time-format-card'],
        [SECTION.workspaces]: ['default-workspace-card'],
        [SECTION.backup]: ['backup-export-card', 'restore-import-card', 'restore-direct-copy-card'],
        [SECTION.exportImport]: ['structured-export-card', 'attachments-export-card', 'import-notes-card'],
        [SECTION.sync]: ['git-sync-card', 'snapshots-card', 'offline-notes-card'],
        [SECTION.integrations]: ['user-webhooks-card', 'ai-assistant-user-card', 'stt-user-card'],
        [SECTION.apps]: ['extension-card', 'install-app-card'],
        [SECTION.display]: ['main-font-card', 'font-size-card', 'index-icon-scale-card', 'icon-rail-scale-card', 'note-color-palette-card'],
        [SECTION.sidebar]: ['folder-tree-highlight-card', 'icon-sidebar-order-card', 'note-age-filter-card', 'notes-without-folders-card', 'folder-icon-kanban-card', 'folder-count-parentheses-card', 'sidebar-offline-marks-card'],
        [SECTION.content]: ['note-width-card', 'note-virtual-space-card', 'backlinks-at-bottom-card', 'default-image-border-card', 'spellcheck-html-notes-card', 'slash-menu-trigger-card', 'slash-menu-trigger-mobile-card', 'format-toolbar-mode-card', 'tasklist-insert-order-card', 'attachments-at-bottom-card', 'attachment-previews-card', 'code-wrap-card', 'code-line-numbers-card'],
        [SECTION.markdown]: ['markdown-default-view-mode-card', 'markdown-new-note-view-mode-card', 'markdown-view-cycle-card', 'markdown-font-card', 'markdown-split-card-view-card', 'markdown-split-preview-left-card', 'markdown-heading-underline-card', 'markdown-editor-wrap-card', 'markdown-colored-card'],
        [SECTION.diary]: ['diary-note-type-card', 'diary-template-card', 'diary-date-format-card'],
        [SECTION.about]: ['check-updates-card', 'whats-new-card', 'github-card', 'discussions-card', 'website-card', 'tips-card', 'discord-card', 'support-card'],
    };

    test('a non-admin sees exactly the expected cards, section by section', covers('set.page', 'set.cards-user'), async ({ page }) => {
        await page.goto('/settings.php');
        await settled(page);
        const live = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.settings-content .home-grid')]
            .filter((grid) => grid.id !== 'settings-pinned-section-grid' && grid.querySelector('.home-card'))
            .map((grid) => [grid.id, [...grid.querySelectorAll('.home-card[id]')].map((card) => card.id)])));
        expect(live).toEqual(USER_CARDS);
        await expect(page.locator('#admin-tools-grid'), 'no admin tools for a user').toHaveCount(0);
        await expect(page.locator('.settings-scope-switch'), 'no Admin side for a user').toHaveCount(0);
    });

    test('the list on the left opens one section at a time and the address follows', covers('set.nav-desktop'), async ({ page }) => {
        await page.goto('/settings.php');
        await settled(page);
        const items = await page.locator('.settings-nav-item[data-section]:not([hidden])').evaluateAll((all) => all.map((a) => a.dataset.section));
        expect(items).toEqual([SECTION.account, SECTION.workspaces, SECTION.backup, SECTION.exportImport, SECTION.sync, SECTION.integrations, SECTION.apps, SECTION.display, SECTION.visibility, SECTION.sidebar, SECTION.content, SECTION.markdown, SECTION.diary, SECTION.about]);
        for (const section of items) {
            await page.click(`.settings-nav-item[data-section="${section}"]`);
            await expect(page.locator(`#${section}`), section).toBeVisible();
            await expect(page.locator(`.settings-nav-item[data-section="${section}"]`)).toHaveClass(/is-active/);
            expect(new URL(page.url()).hash).toContain(`section=${section}`);
            const shown = await page.evaluate((all) => all.filter((id) => document.getElementById(id).checkVisibility()), items);
            expect(shown, 'only that section shows').toEqual([section]);
        }
        await page.click(`.settings-nav-item[data-section="${SECTION.markdown}"]`);
        await page.goto('/settings.php');
        await expect(page.locator(`#${SECTION.markdown}`), 'the open section survives a reload').toBeVisible();
    });

    test('the filter box narrows cards across sections, clears, and / focuses it', covers('set.filter'), async ({ page }) => {
        await page.goto('/settings.php');
        await settled(page);
        await page.keyboard.press('/');
        await expect(page.locator('#home-search-input'), '/ focuses the filter').toBeFocused();
        await page.keyboard.type('Word wrap');
        await expect(page.locator('#code-wrap-card')).toBeVisible();
        await expect(page.locator('#markdown-editor-wrap-card')).toBeVisible();
        await expect(page.locator('#language-card')).toBeHidden();
        await page.locator('#home-search-input').fill('zzz-rien-de-tel');
        await expect(page.locator('.home-no-results')).toBeVisible();
        await page.click('#home-search-clear');
        await expect(page.locator('#home-search-input')).toHaveValue('');
        await expect(page.locator('.home-no-results')).toBeHidden();
        await expect(page.locator('#language-card'), 'all back after clearing').toBeVisible();
        await page.locator('#home-search-input').fill('Europe/Paris');
        await expect(page.locator('#timezone-card'), 'a row matches on the value of its control').toBeVisible();
    });

    test('a card pinned goes to the Pinned section, stays after reload, and can be unpinned', covers('set.pin'), async ({ page }) => {
        await openSection(page, SECTION.content);
        const card = page.locator('#code-wrap-card');
        await card.hover();
        await card.locator('.settings-card-pin').click();
        await expect.poll(async () => JSON.parse(await stored(api, 'settings_pinned_cards') || '[]')).toEqual(['code-wrap-card']);
        await page.goto('/settings.php');
        await settled(page);
        const nav = page.locator(`.settings-nav-item[data-section="settings-pinned-section-grid"]`);
        await expect(nav).toBeVisible();
        await nav.click();
        const clone = page.locator('#settings-pinned-section-grid [data-pin-clone-of="code-wrap-card"]');
        await expect(clone).toBeVisible();
        // The clone works: it flips the same setting
        const before = await stored(api, 'code_block_word_wrap');
        await clone.click();
        await expect.poll(() => stored(api, 'code_block_word_wrap')).not.toBe(before);
        await clone.hover();
        await clone.locator('.settings-card-pin').click();
        await expect.poll(async () => JSON.parse(await stored(api, 'settings_pinned_cards') || '[]')).toEqual([]);
        await expect(page.locator('#settings-pinned-section-grid')).toBeHidden();
    });

    test('a phone gets stacked collapsible sections with expand all', covers('set.mobile'), async ({ page }) => {
        await page.setViewportSize({ width: 400, height: 800 });
        await page.goto('/settings.php');
        await settled(page);
        await expect(page.locator('#settings-nav'), 'no section list on a phone').toBeHidden();
        const toggleAll = page.locator('#settingsCollapseAll');
        await expect(toggleAll).toBeVisible();
        await expect(page.locator(`#${SECTION.markdown}`)).toBeHidden();
        await toggleAll.click();
        await expect(page.locator(`#${SECTION.markdown}`)).toBeVisible();
        await expect(page.locator(`#${SECTION.account}`)).toBeVisible();
        await toggleAll.click();
        await expect(page.locator(`#${SECTION.markdown}`)).toBeHidden();
        const title = page.locator(`#${SECTION.markdown}`).locator('xpath=preceding-sibling::*[1]');
        await title.locator('.settings-section-toggle').click();
        await expect(page.locator(`#${SECTION.markdown}`), 'a single section opens').toBeVisible();
        await page.reload();
        await settled(page);
        await expect(page.locator(`#${SECTION.markdown}`), 'and stays open').toBeVisible();
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width, 'no horizontal scroll').toBeLessThanOrEqual(400);
    });
});

// ---------------------------------------------------------------------------
// Each switch card: flip it from the card, read the stored value, see the effect
// where it applies, flip it back.
test.describe('switch cards', () => {
    let account; let api; let html; let md; let folder;
    const CODE = '<pre class="code-block"><code>' + 'une très longue ligne de code '.repeat(30) + '\nligne 2</code></pre>';
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'sw');
        api = await Api.open(playwright, account);
        html = await api.createNote({ heading: 'Note été', content: `<p>Corps de la note</p>${CODE}` });
        md = await api.createNote({ heading: 'Note md', content: `# Titre principal\n\n${'très long texte '.repeat(60)}\n\n## Deuxième\n\nTexte\n`, type: 'markdown' });
        await api.createNote({ heading: 'Note liante', content: `<p><a href="index.php?note=${html.id}" data-note-id="${html.id}">lien vers été</a></p><p>[[Note été]]</p>` });
        await api.ok(api.call('POST', `/notes/${html.id}/attachments`, { multipart: { file: { name: 'piece.png', mimeType: 'image/png', buffer: PNG } } }));
        folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier témoin' }))).json.folder;
        await api.createNote({ heading: 'Racine sans dossier', content: '<p>x</p>' });
        const inFolder = await api.createNote({ heading: 'Dans le dossier', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${inFolder.id}/folder`, { folder_id: folder.id }));
        await api.ok(api.put('/settings/markdown_default_view_mode', { value: 'split' }));
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    const before = (page, first, second) => page.evaluate(([a, b]) => {
        const one = document.querySelector(a); const two = document.querySelector(b);
        return !!(one && two) && !!(one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, [first, second]);

    const SWITCHES = [
        { id: 'code-wrap', section: SECTION.content, card: 'code-wrap-card', key: 'code_block_word_wrap', start: true,
            view: () => `note=${html.id}`, probe: (page) => css(page.locator('.noteentry pre').first(), 'white-space'),
            on: 'pre-wrap', off: 'pre' },
        { id: 'code-line-numbers', section: SECTION.content, card: 'code-line-numbers-card', key: 'code_block_line_numbers', start: false,
            view: () => `note=${html.id}`, probe: (page) => page.locator('.noteentry pre code.code-line-numbers').count(),
            on: 1, off: 0 },
        { id: 'note-virtual-space', section: SECTION.content, card: 'note-virtual-space-card', key: 'note_virtual_space', start: false,
            view: () => `note=${html.id}`, probe: async (page) => parseInt(await css(page.locator('.note-bottom-space').first(), 'height'), 10) > 100,
            on: true, off: false },
        { id: 'backlinks-at-bottom', section: SECTION.content, card: 'backlinks-at-bottom-card', key: 'backlinks_at_bottom', start: false,
            view: () => `note=${html.id}`, probe: (page) => before(page, '.noteentry', '.backlinks-row'), on: true, off: false },
        { id: 'attachments-at-bottom', section: SECTION.content, card: 'attachments-at-bottom-card', key: 'attachments_at_bottom', start: false,
            view: () => `note=${html.id}`, probe: (page) => before(page, '.noteentry', '.note-attachments-row'), on: true, off: false },
        { id: 'attachment-previews', section: SECTION.content, card: 'attachment-previews-card', key: 'attachment_previews_in_note', start: false,
            view: () => `note=${html.id}`, probe: async (page) => (await page.locator('.note-attachment-preview-media img').count()) > 0,
            on: true, off: false },
        { id: 'default-image-border', section: SECTION.content, card: 'default-image-border-card', key: 'default_image_border_no_padding', start: false,
            view: () => `note=${html.id}`, probe: (page) => page.evaluate(() => !!(window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.defaultImageBorderNoPadding)),
            on: true, off: false },
        { id: 'spellcheck', section: SECTION.content, card: 'spellcheck-html-notes-card', key: 'spellcheck_html_notes', start: false,
            view: () => `note=${html.id}`, probe: (page) => page.locator('.noteentry').first().getAttribute('spellcheck'),
            on: 'true', off: 'false' },
        { id: 'folder-count-parentheses', section: SECTION.sidebar, card: 'folder-count-parentheses-card', key: 'folder_count_parentheses', start: false,
            view: () => '', probe: (page) => page.locator('.folder-note-count').first().evaluate((el) => getComputedStyle(el, '::before').content),
            on: '"("', off: 'none' },
        { id: 'markdown-split-card-view', section: SECTION.markdown, card: 'markdown-split-card-view-card', key: 'markdown_split_card_view', start: true,
            view: () => `note=${md.id}`, probe: (page) => css(page.locator('.noteentry.markdown-split-mode .markdown-preview').first(), 'border-top-style'),
            on: 'solid', off: 'none' },
        { id: 'markdown-split-preview-left', section: SECTION.markdown, card: 'markdown-split-preview-left-card', key: 'markdown_split_preview_left', start: false,
            view: () => `note=${md.id}`, probe: (page) => page.evaluate(() => {
                const x = (selector) => document.querySelector(`.noteentry.markdown-split-mode ${selector}`).getBoundingClientRect().left;
                return x('.markdown-preview') < x('.markdown-editor-container');
            }), on: true, off: false },
        { id: 'markdown-heading-underline', section: SECTION.markdown, card: 'markdown-heading-underline-card', key: 'markdown_heading_underline', start: true,
            view: () => `note=${md.id}`, probe: (page) => css(page.locator('.markdown-preview h1').first(), 'border-bottom-style'),
            on: 'solid', off: 'none' },
        { id: 'markdown-editor-wrap', section: SECTION.markdown, card: 'markdown-editor-wrap-card', key: 'markdown_editor_word_wrap', start: true,
            view: () => `note=${md.id}`, probe: async (page) => (await page.locator('.cm-content.cm-lineWrapping').count()) > 0,
            on: true, off: false },
    ];

    for (const item of SWITCHES) {
        test(`${item.card} flips ${item.key}, with its effect`, covers(`set.${item.id}`), async ({ page }) => {
            const flip = async (to) => {
                await openSection(page, item.section);
                const card = page.locator(`#${item.card}`);
                await expect(card).toHaveAttribute('aria-checked', String(!to));
                await card.click();
                await expect(card, 'the switch follows').toHaveAttribute('aria-checked', String(to));
                await expect(card.locator('.setting-status')).toHaveText(to ? 'Enabled' : 'Disabled');
                await expectStored(api, item.key, to ? '1' : '0');
                await page.reload();
                await expect(card, 'still after a reload').toHaveAttribute('aria-checked', String(to));
            };
            const effect = async (on) => {
                await page.goto(`/index.php?${item.view()}`);
                await expect.poll(() => item.probe(page), { message: `effect with the switch ${on ? 'on' : 'off'}` }).toBe(on ? item.on : item.off);
            };
            await effect(item.start);
            await flip(!item.start);
            await effect(!item.start);
            await flip(item.start);
            await effect(item.start);
        });
    }

    const looseNotesLast = async (page) => {
        await page.goto('/index.php');
        await settled(page);
        return page.evaluate(() => {
            const text = document.querySelector('#left_col').innerText;
            return text.indexOf('Dossier témoin') < text.indexOf('Racine sans dossier');
        });
    };

    test('notes-without-folders-card tells on a new account what the tree does', covers('set.notes-after-folders'), async ({ page, playwright }) => {
        test.fail(true, 'BUG: the card says Disabled on a new account while the tree already puts loose notes last (default 1 in index.php, none in settings-page.js)');
        const fresh = await newAccount(playwright, 'neuf');
        const freshApi = await Api.open(playwright, fresh);
        const folder2 = (await freshApi.ok(freshApi.post('/folders', { folder_name: 'Dossier témoin' }))).json.folder;
        const inside = await freshApi.createNote({ heading: 'Dedans', content: '<p>x</p>' });
        await freshApi.ok(freshApi.post(`/notes/${inside.id}/folder`, { folder_id: folder2.id }));
        await freshApi.createNote({ heading: 'Racine sans dossier', content: '<p>x</p>' });
        await freshApi.dispose();
        await page.context().clearCookies();
        await login(page, fresh);
        const last = await looseNotesLast(page);
        await openSection(page, SECTION.sidebar);
        await expect(page.locator('#notes-without-folders-card')).toHaveAttribute('aria-checked', String(last));
    });

    test('notes-without-folders-card once set moves the loose notes before or after the folders', covers('set.notes-after-folders'), async ({ page }) => {
        const card = page.locator('#notes-without-folders-card');
        await api.ok(api.put('/settings/notes_without_folders_after_folders', { value: '1' }));
        await openSection(page, SECTION.sidebar);
        await expect(card).toHaveAttribute('aria-checked', 'true');
        await card.click();
        await expect(card).toHaveAttribute('aria-checked', 'false');
        await expectStored(api, 'notes_without_folders_after_folders', '0');
        expect(await looseNotesLast(page), 'loose notes first').toBe(false);
        await openSection(page, SECTION.sidebar);
        await card.click();
        await expectStored(api, 'notes_without_folders_after_folders', '1');
        expect(await looseNotesLast(page), 'loose notes last').toBe(true);
    });

    test('folder-icon-kanban-card makes the folder icon open the Kanban view', covers('set.folder-icon-kanban'), async ({ page }) => {
        const icon = () => page.locator('#left_col [data-action="open-folder-icon-picker"]').first();
        await page.goto('/index.php');
        await settled(page);
        await icon().click();
        await expect(page.locator('.kanban-inline-view'), 'off: the icon does not open Kanban').toHaveCount(0);
        await openSection(page, SECTION.sidebar);
        await page.click('#folder-icon-kanban-card');
        await expect(page.locator('#folder-icon-kanban-card')).toHaveAttribute('aria-checked', 'true');
        await expectStored(api, 'folder_icon_opens_kanban', '1');
        await page.goto('/index.php');
        await settled(page);
        await icon().click();
        await expect(page.locator('.kanban-inline-view')).toBeVisible();
        await api.ok(api.put('/settings/folder_icon_opens_kanban', { value: '0' }));
    });

    test('sidebar-offline-marks-card agrees with the entry of the tree options menu', covers('set.sidebar-offline-marks'), async ({ page }) => {
        const card = page.locator('#sidebar-offline-marks-card');
        await openSection(page, SECTION.sidebar);
        await expect(card).toHaveAttribute('aria-checked', 'true');
        await card.click();
        await expect(card).toHaveAttribute('aria-checked', 'false');
        await expectStored(api, 'sidebar_offline_marks', '0');
        await page.goto('/index.php');
        await settled(page);
        const script = await page.locator('script[src*="offline-marks.js"]').getAttribute('data-sidebar');
        expect(script, 'the tree is told not to draw its dots').toBe('off');
        await openSection(page, SECTION.sidebar);
        await card.click();
        await expect(card).toHaveAttribute('aria-checked', 'true');
        await page.goto('/index.php');
        await settled(page);
        expect(await page.locator('script[src*="offline-marks.js"]').getAttribute('data-sidebar')).not.toBe('off');
    });

    test('whats-new-card flips the popup after updates', covers('set.whats-new-card'), async ({ page }) => {
        const card = page.locator('#whats-new-card');
        await openSection(page, SECTION.about);
        await expect(card).toHaveAttribute('aria-checked', 'true');
        await card.click();
        await expect(card).toHaveAttribute('aria-checked', 'false');
        await expectStored(api, 'whats_new_popup', '0');
        const off = await api.ok(api.get('/system/whats-new'));
        expect(off.json.show, 'the server shows nothing while off').toBeFalsy();
        await page.reload();
        await expect(card).toHaveAttribute('aria-checked', 'false');
        await card.click();
        await expectStored(api, 'whats_new_popup', '1');
    });
});

// ---------------------------------------------------------------------------
test.describe('rows with their own control', () => {
    let account; let api; let html; let md;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'ctl');
        api = await Api.open(playwright, account);
        html = await api.createNote({ heading: 'Note été', content: '<p>Corps de la note pour tester</p>' });
        md = await api.createNote({ heading: 'Note md', content: '# Titre\n\nTexte\n', type: 'markdown' });
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const options = (page, select) => page.locator(`${select} option`).evaluateAll((all) => all.map((o) => o.value));
    const subline = (page) => page.locator('.note-sub-updated').first();

    test('timezone: the list offers zones, the choice shifts the dates of the notes', covers('set.timezone'), async ({ page }) => {
        await api.ok(api.put('/settings/date_time_format', { value: 'ymd_his' }));
        await openSection(page, SECTION.account);
        const zones = await options(page, '#timezone-select');
        expect(zones.length, 'zones in the list').toBeGreaterThan(20);
        expect(zones).toEqual(expect.arrayContaining(['Europe/Paris', 'Asia/Tokyo', 'America/New_York', 'UTC']));
        const hourIn = async () => {
            await openQuick(page, html.id);
            return parseInt((await subline(page).innerText()).match(/ (\d{2}):\d{2}:\d{2}/)[1], 10);
        };
        for (const [zone, offset] of [['Asia/Tokyo', 9], ['UTC', 0]]) {
            await openSection(page, SECTION.account);
            await page.locator('#timezone-select').selectOption(zone);
            await expectStored(api, 'timezone', zone);
            await page.reload();
            await expect(page.locator('#timezone-select'), 'the row shows the stored zone').toHaveValue(zone);
            const updated = (await api.getNote(html.id)).updated;
            const utc = new Date(`${String(updated).replace(' ', 'T')}Z`);
            expect(await hourIn(), zone).toBe((utc.getUTCHours() + offset) % 24);
        }
        await api.ok(api.put('/settings/date_time_format', { value: 'default' }));
    });

    test('date and time format: every option of the dialog, badge, stored value and note date', covers('set.date-time-format'), async ({ page }) => {
        const CASES = [
            ['ymd_his', 'ymd_his', /^\D*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/],
            ['dmy_hi', 'dmy_hi', /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/],
            ['mdy_hia', 'mdy_hia', /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} [AP]M/i],
            ['long', 'long', /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \w+ \d{1,2}, \d{4}/],
            ['default', 'default', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/],
        ];
        await openSection(page, SECTION.account);
        await page.click('#date-time-format-card');
        await expect(page.locator('#dateTimeFormatModal')).toBeVisible();
        expect(await page.locator('#dateTimeFormatModal input[name="dateTimeFormat"]').evaluateAll((all) => all.map((r) => r.value)))
            .toEqual(['default', 'ymd_his', 'dmy_hi', 'mdy_hia', 'long', 'custom']);
        await page.locator('#dateTimeFormatModal .btn-cancel').click();
        await expect(page.locator('#dateTimeFormatModal')).toBeHidden();
        for (const [radio, value, shape] of CASES) {
            await openSection(page, SECTION.account);
            await page.click('#date-time-format-card');
            await page.check(`#dateTimeFormatModal input[value="${radio}"]`);
            await page.click('#saveDateTimeFormatModalBtn');
            await expect(page.locator('#dateTimeFormatModal')).toBeHidden();
            await expectStored(api, 'date_time_format', value);
            await openQuick(page, html.id);
            await expect(subline(page), radio).toHaveText(shape);
        }
    });

    test('date and time format: a custom pattern is applied, an invalid one refused', covers('set.date-time-format-custom'), async ({ page }) => {
        await openSection(page, SECTION.account);
        await page.click('#date-time-format-card');
        await page.locator('#dateTimeFormatCustomInput').click();
        await expect(page.locator('#dateTimeFormatModal input[value="custom"]'), 'focus ticks Custom').toBeChecked();
        await page.locator('#dateTimeFormatCustomInput').fill('<script>');
        await page.click('#saveDateTimeFormatModalBtn');
        expect(await answerDialog(page), 'refused with a message').toContain('valid custom');
        await expect(page.locator('#dateTimeFormatModal')).toBeVisible();
        expect(await stored(api, 'date_time_format')).not.toContain('script');
        await page.locator('#dateTimeFormatCustomInput').fill('DD.MM.YYYY HH');
        await page.click('#saveDateTimeFormatModalBtn');
        await expect(page.locator('#dateTimeFormatModal')).toBeHidden();
        await expect(page.locator('#date-time-format-badge')).toContainText('DD.MM.YYYY HH');
        await expectStored(api, 'date_time_format', 'custom:DD.MM.YYYY HH');
        await openQuick(page, html.id);
        await expect(subline(page)).toHaveText(/\d{2}\.\d{2}\.\d{4}/);
        await api.ok(api.put('/settings/date_time_format', { value: 'default' }));
    });

    test('note width: the slider sets the column width, full width at its end', covers('set.note-width'), async ({ page }) => {
        const maxWidth = async () => {
            await openQuick(page, html.id);
            return page.evaluate(() => {
                const column = document.querySelector('#right_col').getBoundingClientRect().width;
                return Math.round(document.querySelector('.noteentry').getBoundingClientRect().width / column * 10) / 10;
            });
        };
        const full = await maxWidth();
        expect(full, 'full width by default').toBeGreaterThan(0.8);
        await openSection(page, SECTION.content);
        const range = page.locator('#note-width-range');
        await range.fill('60');
        await range.dispatchEvent('change');
        await expect(page.locator('#note-width-card .settings-inline-value')).toHaveText('60%');
        await expectStored(api, 'center_note_content', '60%');
        await page.reload();
        await expect(range, 'after a reload').toHaveValue('60');
        await expect(page.locator('#note-width-card .settings-inline-value')).toHaveText('60%');
        const narrow = await maxWidth();
        expect(narrow / full, 'about 60% of the full width').toBeGreaterThan(0.5);
        expect(narrow / full).toBeLessThan(0.75);
        await openSection(page, SECTION.content);
        await range.fill('100');
        await range.dispatchEvent('change');
        await expect(page.locator('#note-width-card .settings-inline-value')).toHaveText('Full Width');
        await expectStored(api, 'center_note_content', '0');
        expect(await maxWidth()).toBe(full);
    });

    test('command menu shortcut: / , Alt+/ or nothing, on a computer', covers('set.slash-trigger'), async ({ page }) => {
        await openSection(page, SECTION.content);
        expect(await options(page, '#slash-menu-trigger-select')).toEqual(['slash', 'alt-slash', 'disabled']);
        const menu = page.locator('.slash-command-menu');
        const editor = page.locator('.noteentry[contenteditable="true"]').first();
        const choose = async (value) => {
            await openSection(page, SECTION.content);
            await page.locator('#slash-menu-trigger-select').selectOption(value);
            await expectStored(api, 'slash_menu_trigger', value);
            await openQuick(page, html.id);
            await editor.click();
            await page.keyboard.press('Control+End');
        };
        await choose('alt-slash');
        await page.keyboard.type('/');
        await expect(menu, 'a plain / types a slash').toBeHidden();
        await page.keyboard.press('Alt+/');
        await expect(menu, 'Alt+/ opens').toBeVisible();
        await page.keyboard.press('Escape');
        await choose('disabled');
        await page.keyboard.type('/');
        await page.keyboard.press('Alt+/');
        await expect(menu, 'no key opens').toBeHidden();
        await choose('slash');
        await page.keyboard.type('/');
        await expect(menu, '/ opens').toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('command menu shortcut on a phone is a setting of its own', covers('set.slash-trigger-mobile'), async ({ page }) => {
        await openSection(page, SECTION.content);
        expect(await options(page, '#slash-menu-trigger-mobile-select')).toEqual(['slash', 'alt-slash', 'disabled']);
        await page.locator('#slash-menu-trigger-mobile-select').selectOption('disabled');
        await expectStored(api, 'slash_menu_trigger_mobile', 'disabled');
        expect(await stored(api, 'slash_menu_trigger'), 'the computer setting does not move').not.toBe('disabled');
        await page.setViewportSize({ width: 400, height: 800 });
        await openQuick(page, html.id);
        await page.locator('.noteentry[contenteditable="true"]').first().click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/');
        await expect(page.locator('.slash-command-menu')).toBeHidden();
        await api.ok(api.put('/settings/slash_menu_trigger_mobile', { value: 'slash' }));
        await openQuick(page, html.id);
        await page.locator('.noteentry[contenteditable="true"]').first().click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/');
        await expect(page.locator('.slash-command-menu')).toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('formatting toolbar: the floating mode shows a toolbar on a selection', covers('set.format-toolbar-mode'), async ({ page }) => {
        await openSection(page, SECTION.content);
        expect(await options(page, '#format-toolbar-mode-select')).toEqual(['toolbar', 'floating']);
        await page.locator('#format-toolbar-mode-select').selectOption('floating');
        await expectStored(api, 'format_toolbar_mode', 'floating');
        await openQuick(page, html.id);
        await expect(page.locator('.floating-format-toolbar'), 'nothing before a selection').toBeHidden();
        await page.locator('.noteentry[contenteditable="true"] p').first().dblclick({ position: { x: 20, y: 8 } });
        await expect(page.locator('.floating-format-toolbar')).toBeVisible();
        await page.locator('.floating-format-toolbar .btn-bold').click();
        await expect(page.locator('.noteentry[contenteditable="true"] p').first().locator('b, strong')).toHaveCount(1);
        await api.ok(api.put('/settings/format_toolbar_mode', { value: 'toolbar' }));
    });

    test('task list insert order: top puts a new task first', covers('set.tasklist-order'), async ({ page }) => {
        const list = await api.createNote({ heading: 'Liste', content: '[]', type: 'tasklist' });
        const add = async (text) => {
            await openQuick(page, list.id);
            await page.locator('input.task-input').fill(text);
            await page.keyboard.press('Enter');
            await expect(page.locator('.task-item, .tasklist-item', { hasText: text }).first()).toBeVisible();
        };
        await add('première');
        await openSection(page, SECTION.content);
        await page.locator('#tasklist-insert-order-select').selectOption('top');
        await expectStored(api, 'tasklist_insert_order', 'top');
        await page.reload();
        await expect(page.locator('#tasklist-insert-order-select')).toHaveValue('top');
        await add('deuxième');
        const texts = await page.locator('.task-item, .tasklist-item').allInnerTexts();
        expect(texts[0]).toContain('deuxième');
        await api.ok(api.put('/settings/tasklist_insert_order', { value: 'bottom' }));
    });

    test('default workspace: the option chosen is where Poznote opens', covers('set.default-workspace'), async ({ page }) => {
        await api.ok(api.post('/workspaces', { name: 'Atelier é' }));
        await openSection(page, SECTION.workspaces);
        const values = await options(page, '#default-workspace-select');
        expect(values).toEqual(expect.arrayContaining(['__last_opened__', 'Atelier é']));
        await page.locator('#default-workspace-select').selectOption('Atelier é');
        await expectStored(api, 'default_workspace', 'Atelier é');
        await page.goto('/');
        await settled(page);
        await expect.poll(() => page.evaluate(() => window.selectedWorkspace)).toBe('Atelier é');
        await openSection(page, SECTION.workspaces);
        await page.locator('#default-workspace-select').selectOption('__last_opened__');
        await expectStored(api, 'default_workspace', '__last_opened__');
    });

    test('markdown view modes: default and new note, each option', covers('set.markdown-view-modes'), async ({ page }) => {
        await openSection(page, SECTION.markdown);
        expect(await options(page, '#markdown-default-view-mode-select')).toEqual(['preview', 'edit', 'split', 'last']);
        expect(await options(page, '#markdown-new-note-view-mode-select')).toEqual(['split', 'edit', 'live', 'rich']);
        const entry = page.locator(`.noteentry[data-note-type="markdown"]`).first();
        for (const [mode, visible, hidden] of [['edit', '.markdown-editor-container', '.markdown-preview'], ['preview', '.markdown-preview', '.markdown-editor-container']]) {
            await openSection(page, SECTION.markdown);
            await page.locator('#markdown-default-view-mode-select').selectOption(mode);
            await expectStored(api, 'markdown_default_view_mode', mode);
            await openQuick(page, md.id);
            await expect(entry.locator(visible).first(), mode).toBeVisible();
            await expect(entry.locator(hidden).first(), mode).toBeHidden();
        }
        await openSection(page, SECTION.markdown);
        await page.locator('#markdown-default-view-mode-select').selectOption('split');
        await expectStored(api, 'markdown_default_view_mode', 'split');
        await openQuick(page, md.id);
        await expect(entry).toHaveClass(/markdown-split-mode/);
        await openSection(page, SECTION.markdown);
        await page.locator('#markdown-new-note-view-mode-select').selectOption('edit');
        await expectStored(api, 'markdown_new_note_view_mode', 'edit');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('body')).toHaveAttribute('data-markdown-new-note-mode', 'edit');
        await api.ok(api.put('/settings/markdown_default_view_mode', { value: 'preview' }));
    });

    test('view menu card: the ticked views are the ones the menu of a note lists', covers('set.markdown-view-cycle'), async ({ page }) => {
        await openSection(page, SECTION.markdown);
        const boxes = page.locator('#markdown-view-cycle-checks input[type="checkbox"]');
        expect(await boxes.evaluateAll((all) => all.map((b) => [b.value, b.checked]))).toEqual([['live', true], ['rich', true], ['split', true]]);
        await page.locator('#markdown-view-cycle-checks input[value="rich"]').uncheck();
        await expectStored(api, 'markdown_view_cycle', 'live,split');
        await openQuick(page, md.id);
        await expect(page.locator('body')).toHaveAttribute('data-markdown-view-cycle', 'live,split');
        await openSection(page, SECTION.markdown);
        await page.locator('#markdown-view-cycle-checks input[value="live"]').uncheck();
        await page.locator('#markdown-view-cycle-checks input[value="split"]').uncheck();
        await expectStored(api, 'markdown_view_cycle', 'none');
        await page.reload();
        await expect(boxes.first(), 'all unticked after reload').not.toBeChecked();
        await api.ok(api.put('/settings/markdown_view_cycle', { value: '' }));
    });

    test('colored markdown: off or custom, each picked colour is stored and painted, reset goes back to the theme', covers('set.markdown-colored'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Colorée', content: 'Du `code` ici\n\n> Citation\n', type: 'markdown' });
        await api.ok(api.put('/settings/markdown_default_view_mode', { value: 'preview' }));
        const colors = async () => {
            await openQuick(page, note.id);
            return { code: await css(page.locator('.markdown-preview p code').first(), 'color'), quote: await css(page.locator('.markdown-preview blockquote').first(), 'border-left-color') };
        };
        const plain = await colors();
        await openSection(page, SECTION.markdown);
        await expect(page.locator('#markdown-colored-card .setting-status')).toHaveText('Disabled');
        await page.click('#markdown-colored-card');
        const modal = page.locator('#markdownColoredModal');
        await expect(modal).toBeVisible();
        expect(await modal.locator('input[name="markdownColoredTheme"]').evaluateAll((all) => all.map((r) => r.value))).toEqual(['0', 'custom']);
        await expect(page.locator('#markdownColoredCustomRow'), 'pickers only for custom').toBeHidden();
        await modal.locator('input[value="custom"]').check();
        await expect(page.locator('#markdownColoredCustomRow')).toBeVisible();
        await page.locator('#markdownColoredCodeInput').fill('#ff0000');
        await page.locator('#markdownColoredQuoteInput').fill('#00aa00');
        await page.click('#saveMarkdownColoredBtn');
        await expect(modal).toBeHidden();
        await expectStored(api, 'markdown_colored', 'custom');
        await expect(page.locator('#markdown-colored-card .setting-status')).not.toHaveText('Disabled');
        const saved = JSON.parse(await stored(api, 'markdown_colored_custom'));
        expect(saved.code).toBe('#ff0000');
        const painted = await colors();
        expect(painted.code).toBe('rgb(255, 0, 0)');
        expect(painted.quote).toBe('rgb(0, 170, 0)');
        await openSection(page, SECTION.markdown);
        await page.click('#markdown-colored-card');
        await page.locator('#markdownColoredCustomRow [data-mdc-reset="code"]').click();
        await page.click('#saveMarkdownColoredBtn');
        await expect(modal).toBeHidden();
        expect(JSON.parse(await stored(api, 'markdown_colored_custom')).code, 'reset').toBeFalsy();
        await openSection(page, SECTION.markdown);
        await page.click('#markdown-colored-card');
        await modal.locator('input[value="0"]').check();
        await page.click('#saveMarkdownColoredBtn');
        await expectStored(api, 'markdown_colored', '0');
        expect(await colors(), 'off again').toEqual(plain);
    });

    test('note colors: add, rename, remove and reset the palette', covers('set.note-colors'), async ({ page }) => {
        await openSection(page, SECTION.display);
        await expect(page.locator('#note-color-palette-card .setting-status')).toHaveText('8 colors');
        await page.click('#note-color-palette-card');
        const rows = page.locator('#noteColorPaletteList .note-palette-row');
        await expect(rows).toHaveCount(8);
        await page.click('#noteColorPaletteAddBtn');
        await expect(rows).toHaveCount(9);
        await rows.last().locator('.note-palette-name').fill('Écarlate');
        await rows.last().locator('.note-palette-color').fill('#aa0011');
        await rows.first().locator('.note-palette-remove').click();
        await page.click('#saveNoteColorPaletteBtn');
        await expect(page.locator('#noteColorPaletteModal')).toBeHidden();
        await expect(page.locator('#note-color-palette-card .setting-status')).toHaveText('8 colors');
        const palette = JSON.parse(await stored(api, 'note_color_palette'));
        expect(palette.at(-1)).toMatchObject({ name: 'Écarlate', hex: '#aa0011' });
        await page.click('#note-color-palette-card');
        await page.click('#noteColorPaletteResetBtn');
        await expect(rows).toHaveCount(8);
        await expect(rows.last().locator('.note-palette-name')).not.toHaveValue('Écarlate');
        await page.click('#saveNoteColorPaletteBtn');
        await expect.poll(async () => JSON.stringify(await stored(api, 'note_color_palette'))).not.toContain('Écarlate');
    });

    test('folder tree highlight: dimming strength is saved and applied, Turn off removes it', covers('set.folder-tree-highlight'), async ({ page }) => {
        await openSection(page, SECTION.sidebar);
        await page.click('#folder-tree-highlight-card');
        await expect(page.locator('#folderTreeHighlightModal')).toBeVisible();
        const slider = page.locator('#folderTreeDimInput');
        const level = await slider.getAttribute('max');
        await slider.fill(level);
        await expect(page.locator('#folderTreeDimValue')).toContainText(level);
        await page.click('#saveFolderTreeHighlightBtn');
        await expect(page.locator('#folderTreeHighlightModal')).toBeHidden();
        await expectStored(api, 'highlight_current_folder_tree', '1');
        await expectStored(api, 'folder_tree_dim_level', level);
        await expect(page.locator('#folder-tree-highlight-card .setting-status')).not.toHaveText('Disabled');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('body')).toHaveClass(/highlight-folder-tree/);
        const dim = await page.evaluate(() => document.body.style.getPropertyValue('--folder-tree-dim-opacity'));
        expect(parseFloat(dim)).toBeCloseTo((100 - parseInt(level, 10)) / 100, 2);
        await openSection(page, SECTION.sidebar);
        await page.click('#folder-tree-highlight-card');
        await page.click('#disableFolderTreeHighlightBtn');
        await expectStored(api, 'highlight_current_folder_tree', '0');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('body')).not.toHaveClass(/highlight-folder-tree/);
    });

    test('note age filter: an old note leaves the tree, custom days accepted', covers('set.note-age-filter'), async ({ page }) => {
        const old = await api.createNote({ heading: 'Vieille note ancienne', content: '<p>x</p>' });
        inInstance(`php -r '$d=new PDO("sqlite:/var/www/html/data/users/${account.id}/database/poznote.db");$d->exec("UPDATE entries SET updated=datetime(\\"now\\",\\"-400 days\\") WHERE id=${old.id}");'`);
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#left_col').getByText('Vieille note ancienne').first()).toBeVisible();
        await openSection(page, SECTION.sidebar);
        await page.click('#note-age-filter-card');
        const modal = page.locator('#noteAgeFilterModal');
        expect(await modal.locator('input[name="noteAgeFilter"]').evaluateAll((all) => all.map((r) => r.value))).toEqual(['0', '30', '90', '180', '365', '730', 'custom']);
        await modal.locator('input[value="365"]').check();
        await page.click('#saveNoteAgeFilterModalBtn');
        await expect(modal).toBeHidden();
        await expectStored(api, 'note_age_filter_days', '365');
        await expect(page.locator('#note-age-filter-card .setting-status')).not.toHaveText('All notes');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#left_col').getByText('Vieille note ancienne')).toHaveCount(0);
        await openSection(page, SECTION.sidebar);
        await page.click('#note-age-filter-card');
        await page.locator('#noteAgeFilterCustomDays').click();
        await expect(modal.locator('input[value="custom"]'), 'focus ticks Custom').toBeChecked();
        await page.locator('#noteAgeFilterCustomDays').fill('1000');
        await page.click('#saveNoteAgeFilterModalBtn');
        await expectStored(api, 'note_age_filter_days', '1000');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#left_col').getByText('Vieille note ancienne').first(), 'old enough again').toBeVisible();
        await api.ok(api.put('/settings/note_age_filter_days', { value: '0' }));
    });

    test('revisions card: both counts are stored and shown in the badge', covers('set.snapshots-card'), async ({ page }) => {
        await openSection(page, SECTION.sync);
        await expect(page.locator('#snapshots-badge')).toHaveText(/30 days, 20 safety/);
        await page.click('#snapshots-card');
        await expect(page.locator('#snapshotsSettingsModal')).toBeVisible();
        await page.locator('#snapshotsKeepCountInput').fill('7');
        await page.locator('#snapshotsSafetyKeepCountInput').fill('3');
        await page.click('#saveSnapshotsSettingsModalBtn');
        await expect(page.locator('#snapshotsSettingsModal')).toBeHidden();
        await expectStored(api, 'snapshots_keep_count', '7');
        await expectStored(api, 'snapshots_safety_keep_count', '3');
        await expect(page.locator('#snapshots-badge')).toHaveText(/7 days, 3 safety/);
        await page.goto('/settings.php?open=snapshots');
        await expect(page.locator('#snapshotsSettingsModal'), 'deep link').toBeVisible();
        await expect(page.locator('#snapshotsKeepCountInput')).toHaveValue('7');
    });

    test('offline notes card: days stored, turning it off stored', covers('set.offline-card'), async ({ page }) => {
        await openSection(page, SECTION.sync);
        await page.click('#offline-notes-card');
        await expect(page.locator('#offlineNotesModal')).toBeVisible();
        expect(await page.locator('#offlineModeEnabledInput').isChecked(), 'on by default').toBe(true);
        await page.locator('#offlineNotesDaysInput').fill('12');
        await page.click('#saveOfflineNotesModalBtn');
        await expectStored(api, 'offline_notes_days', '12');
        await expect(page.locator('#offline-notes-badge')).toHaveText(/12/);
        await page.click('#offline-notes-card');
        await page.locator('label[for="offlineModeEnabledInput"]').click();
        await expect(page.locator('#offlineNotesDetails'), 'the details go with it').toBeHidden();
        await Promise.all([page.waitForEvent('load'), page.click('#saveOfflineNotesModalBtn')]);
        await expectStored(api, 'offline_mode_enabled', '0');
        await expect(page.locator('#offline-notes-badge')).toHaveText('Disabled');
    });
});


// ---------------------------------------------------------------------------
const THEMES = { light: 'light', dark: 'dark', black: 'dark', lavender: 'light', sepia: 'light', terminal: 'dark' };
const THEME_VARIANTS = { black: 'theme-black', lavender: 'theme-lavender', sepia: 'theme-sepia', terminal: 'theme-terminal' };
const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const paint = (page) => page.evaluate(() => {
    const root = document.documentElement;
    const probe = document.createElement('div');
    probe.style.background = 'var(--pz-bg)';
    document.body.appendChild(probe);
    const token = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { mode: root.dataset.theme, classes: [...root.classList].filter((c) => c.startsWith('theme-') && !['theme-dark', 'theme-light'].includes(c)),
        page: token, canvas: getComputedStyle(root).backgroundColor, text: getComputedStyle(document.body).color };
});
const themeButton = '#iconSidebarThemeToggleBtn';
const pickTheme = async (page, id) => {
    await page.click(themeButton);
    await page.click(`#themePickerMenu [data-theme-choice="${id}"]`);
    await expect(page.locator('#themePickerMenu'), 'the menu closes').not.toHaveClass(/icon-sidebar-overflow-open/);
};

test.describe('themes', () => {
    let account; let api; let note;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'theme');
        api = await Api.open(playwright, account);
        note = await api.createNote({ heading: 'Note thème', content: '<p>Texte coloré</p><pre class="code-block"><code>const a = 1;</code></pre>' });
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the rail menu lists every theme, marks the current one, and a user cannot edit the list', covers('set.theme-menu', 'set.theme-list-user'), async ({ page }) => {
        await page.goto('/settings.php');
        await page.click(themeButton);
        const items = page.locator('#themePickerMenu [data-theme-choice]');
        await expect(items).toHaveCount(6);
        expect(await items.evaluateAll((all) => all.map((i) => i.dataset.themeChoice))).toEqual(Object.keys(THEMES));
        expect(await items.allInnerTexts()).toEqual(['Light', 'Dark', 'Black', 'Lavender', 'Sepia', 'Terminal']);
        await expect(page.locator('#themePickerMenu [data-theme-list-edit]')).toHaveCount(0);
        await expect(page.locator('#themePickerMenu [aria-checked="true"]')).toHaveCount(1);
        await page.keyboard.press('ArrowDown');
        const focused = await page.evaluate(() => document.activeElement.dataset.themeChoice);
        expect(Object.keys(THEMES)).toContain(focused);
        await page.keyboard.press('Escape');
        await expect(page.locator('#themePickerMenu')).not.toHaveClass(/icon-sidebar-overflow-open/);
        await expect(page.locator(themeButton), 'focus returns to the button').toBeFocused();
    });

    test('each theme applies from the menu, with its own colours, on the notes and settings pages, after a reload', covers('set.themes', 'set.dark-bundle'), async ({ page }) => {
        test.setTimeout(150_000);
        const seen = {};
        await openNote(page, note.id);
        for (const [id, mode] of Object.entries(THEMES)) {
            await pickTheme(page, id);
            const now = await paint(page);
            expect(now.mode, id).toBe(mode);
            expect(now.classes, id).toEqual(THEME_VARIANTS[id] ? [THEME_VARIANTS[id]] : []);
            if (mode === 'dark') expect(luminance(now.page), `${id}: dark page`).toBeLessThan(0.3);
            else expect(luminance(now.page), `${id}: light page`).toBeGreaterThan(0.7);
            expect(now.canvas, `${id}: the canvas is the theme colour`).toBe(now.page);
            expect(Math.abs(luminance(now.page) - luminance(now.text)), `${id}: text readable`).toBeGreaterThan(0.4);
            expect(await page.locator(themeButton).getAttribute('title')).toBe(id[0].toUpperCase() + id.slice(1));
            seen[id] = now.page;
            await page.reload();
            await expect.poll(() => paint(page).then((p) => [p.mode, p.page]), `${id} after a reload`).toEqual([mode, now.page]);
            const noteColor = await css(page.locator('.noteentry').first(), 'color');
            expect(Math.abs(luminance(noteColor) - luminance(now.page)), `${id}: note text readable`).toBeGreaterThan(0.4);
        }
        expect(new Set(Object.values(seen)).size, `six different page colours: ${JSON.stringify(seen)}`).toBe(6);
        await page.goto('/settings.php');
        for (const id of Object.keys(THEMES)) {
            await pickTheme(page, id);
            expect((await paint(page)).page, `settings in ${id}`).toBe(seen[id]);
            const card = await css(page.locator('#language-card'), 'color');
            expect(Math.abs(luminance(card) - luminance(seen[id])), `${id}: card text readable`).toBeGreaterThan(0.3);
        }
        await pickTheme(page, 'light');
    });

    test('the theme is painted before the page scripts, no flash, for every theme', covers('set.theme-init'), async ({ page }) => {
        await openNote(page, note.id);
        const colours = {};
        for (const id of Object.keys(THEMES)) { await pickTheme(page, id); colours[id] = (await paint(page)).page; }
        // Without theme-manager.js only the head script can have painted the page
        await page.route('**/js/theme-manager.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
        for (const id of Object.keys(THEMES)) {
            await page.evaluate((theme) => window.__poznoteThemeStorage.set(theme), id);
            await page.goto('/settings.php');
            const now = await paint(page);
            expect(now.mode, id).toBe(THEMES[id]);
            expect(now.classes, id).toEqual(THEME_VARIANTS[id] ? [THEME_VARIANTS[id]] : []);
            expect(now.page, id).toBe(colours[id]);
            if (THEMES[id] === 'dark') expect(luminance(now.canvas), `${id}: canvas painted dark`).toBeLessThan(0.3);
            else expect(luminance(now.canvas), `${id}: canvas painted light`).toBeGreaterThan(0.7);
        }
        await page.unroute('**/js/theme-manager.js*');
        await page.goto('/settings.php');
        await pickTheme(page, 'light');
    });

    test('the login page follows the theme of the device', covers('set.theme-prelogin'), async ({ page, browser }) => {
        await page.goto('/settings.php');
        await pickTheme(page, 'dark');
        const state = await page.context().storageState();
        const context = await browser.newContext({ storageState: { cookies: [], origins: state.origins } });
        const fresh = await context.newPage();
        await fresh.goto('/login.php');
        expect(await fresh.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
        await context.close();
        await pickTheme(page, 'light');
    });

    test('right-click makes the button step through the themes in order, and back to the menu', covers('set.theme-cycle'), async ({ page }) => {
        await page.goto('/settings.php');
        await pickTheme(page, 'light');
        const button = page.locator(themeButton);
        await button.click({ button: 'right' });
        await page.locator('#iconContextMenu .icon-context-menu-item', { hasText: 'Toggle on click' }).click();
        await expect(button).toHaveAttribute('data-theme-cycle', '');
        await expectStored(api, 'theme_button_cycle', '1');
        for (const id of ['dark', 'black', 'lavender', 'sepia', 'terminal', 'light']) {
            await button.click();
            await expect(button, `step to ${id}`).toHaveAttribute('title', id[0].toUpperCase() + id.slice(1));
            await expect(page.locator('#themePickerMenu.icon-sidebar-overflow-open'), 'no menu').toHaveCount(0);
        }
        await page.reload();
        await expect(button, 'the mode survives a reload').toHaveAttribute('data-theme-cycle', '');
        await button.click({ button: 'right' });
        await page.locator('#iconContextMenu .icon-context-menu-item', { hasText: 'Open a menu on click' }).click();
        await expectStored(api, 'theme_button_cycle', '0');
        await button.click();
        await expect(page.locator('#themePickerMenu')).toHaveClass(/icon-sidebar-overflow-open/);
        await page.keyboard.press('Escape');
    });

    test('dark_mode_css.php and index_css.php serve stylesheets', covers('set.css-endpoints'), async ({ page }) => {
        const app = await page.request.get('/index_js.php?group=app');
        expect(app.status()).toBe(200);
        expect(app.headers()['content-type']).toContain('javascript');
        for (const url of ['/dark_mode_css.php', '/index_css.php']) {
            const response = await page.request.get(url);
            expect(response.status(), url).toBe(200);
            expect(response.headers()['content-type'], url).toContain('text/css');
            expect((await response.text()).length, url).toBeGreaterThan(1000);
        }
        expect(await (await page.request.get('/dark_mode_css.php')).text()).toContain('[data-theme');
    });
});

// ---------------------------------------------------------------------------
const LANGUAGES = {
    ca: ['El meu compte', 'Diumenge'], 'zh-cn': ['我的账户', '星期日'], en: ['My Account', 'Sunday'], fr: ['Mon compte', 'Dimanche'], ja: ['マイアカウント', '日曜日'],
    ko: ['내 계정', '일요일'], de: ['Mein Konto', 'Sonntag'], pt: ['Minha conta', 'Domingo'], ru: ['Мой аккаунт', 'Воскресенье'], es: ['Mi cuenta', 'Domingo'],
};
const WEEKDAY = {
    ca: ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'], 'zh-cn': ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'], ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
    de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], pt: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
    ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'], es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
};
const flatten = (value, prefix = '', keys = new Set()) => {
    for (const [key, entry] of Object.entries(value)) {
        if (entry && typeof entry === 'object') flatten(entry, `${prefix}${key}.`, keys);
        else keys.add(`${prefix}${key}`);
    }
    return keys;
};
/** Every string a person can read on the page, with the i18n keys among them. */
const rawKeysOn = (page, keys) => page.evaluate((known) => {
    const set = new Set(known);
    const shape = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,5}$/;
    const looksRaw = (text) => set.has(text) || (shape.test(text) && !/\.(php|js|css|html|md|json|zip|txt|png|com|org)$/.test(text));
    const found = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (parent && !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(parent.tagName) && looksRaw(walker.currentNode.textContent.trim())) found.add(walker.currentNode.textContent.trim());
    }
    document.querySelectorAll('[title],[placeholder],[aria-label],[data-tooltip]').forEach((el) => {
        for (const name of ['title', 'placeholder', 'aria-label', 'data-tooltip']) {
            const value = (el.getAttribute(name) || '').trim();
            if (looksRaw(value)) found.add(`${name}=${value}`);
        }
    });
    return [...found];
}, [...keys]);

test.describe('languages', () => {
    const KEYS = flatten(JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'en.json'), 'utf8')));
    let account; let api; let note;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'lang');
        api = await Api.open(playwright, account);
        note = await api.createNote({ heading: 'Note langue', content: '<p>Texte</p>' });
        await api.ok(api.put('/settings/date_time_format', { value: 'long' }));
        await api.ok(api.put('/settings/timezone', { value: 'UTC' }));
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the language list offers exactly the shipped languages', covers('set.language-list'), async ({ page }) => {
        await openSection(page, SECTION.account);
        const options = await page.locator('#language-select option').evaluateAll((all) => all.map((o) => o.value));
        expect([...options].sort()).toEqual(Object.keys(LANGUAGES).sort());
        const files = fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
        expect([...options].sort(), 'one option per dictionary').toEqual(files);
    });

    for (const [lang, [word]] of Object.entries(LANGUAGES)) {
        test(`${lang}: picked from the list, the pages speak it, dates too, and no raw key shows`, covers(`set.lang-${lang}`), async ({ page }) => {
            await openSection(page, SECTION.account);
            const current = await page.locator('#language-select').inputValue();
            if (current !== lang) {
                await Promise.all([page.waitForEvent('load'), page.locator('#language-select').selectOption(lang)]);
            }
            await expectStored(api, 'language', lang);
            await expect(page.locator('html')).toHaveAttribute('lang', lang);
            await expect(page.locator('#settings-account-section-title')).toContainText(word);
            await expect(page.locator('#language-select')).toHaveValue(lang);
            const translated = JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8'));
            await expect(page.locator('#change-password-card .home-card-title')).toHaveText(translated.settings.cards.change_password);
            expect(await rawKeysOn(page, KEYS), 'settings.php').toEqual([]);
            await openNote(page, note.id);
            expect(await rawKeysOn(page, KEYS), 'index.php').toEqual([]);
            const updated = new Date(`${String((await api.getNote(note.id)).updated).replace(' ', 'T')}Z`);
            await expect(page.locator('.note-sub-updated').first(), 'weekday in the language').toContainText(new RegExp(WEEKDAY[lang][updated.getUTCDay()], 'i'));
            for (const url of ['/dashboard.php', '/tasks.php', '/trash.php', '/favorites.php']) {
                await page.goto(url);
                await settled(page);
                expect(await rawKeysOn(page, KEYS), url).toEqual([]);
            }
            const i18n = await api.ok(api.get('/system/i18n', { params: { lang } }));
            expect(JSON.stringify(i18n.json), 'the runtime dictionary').toContain(word);
        });
    }

    test('the settings API lists the settings and the system its version', covers('set.settings-api'), async () => {
        const all = await api.ok(api.get('/settings'));
        expect(all.text).toContain('date_time_format');
        expect((await api.ok(api.get('/settings/date_time_format'))).json.value).toBe('long');
        const version = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'version.txt'), 'utf8').trim();
        expect((await api.ok(api.get('/system/version'))).text).toContain(version);
    });

    test('settings kept without a card still apply: no emoji icons, folder actions always shown', covers('set.settings-without-card'), async ({ page }) => {
        await api.ok(api.put('/settings/emoji_icons_enabled', { value: '0' }));
        await api.ok(api.put('/settings/hide_folder_actions', { value: '0' }));
        await openNote(page, note.id);
        await expect(page.locator('body')).toHaveClass(/emoji-hidden/);
        await api.ok(api.put('/settings/emoji_icons_enabled', { value: '1' }));
        await openNote(page, note.id);
        await expect(page.locator('body')).not.toHaveClass(/emoji-hidden/);
    });

    test('the JS strings follow the language too', covers('set.language-runtime'), async ({ page }) => {
        await api.ok(api.put('/settings/language', { value: 'fr' }));
        await page.goto('/settings.php');
        await expect.poll(() => page.evaluate(() => window.t && window.t('common.save', null, 'x'))).toBe('Enregistrer');
        await api.ok(api.put('/settings/language', { value: 'en' }));
    });
});

// ---------------------------------------------------------------------------
test.describe('fonts and sizes', () => {
    let account; let api; let html; let md;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'font');
        api = await Api.open(playwright, account);
        html = await api.createNote({ heading: 'Note police', content: '<p>Texte</p><pre class="code-block"><code>let é = 1;</code></pre>' });
        md = await api.createNote({ heading: 'Note md', content: '# Titre\n\nTexte\n', type: 'markdown' });
        await api.ok(api.put('/settings/markdown_default_view_mode', { value: 'split' }));
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('app font: each offered font changes the computed font of the page, and survives a reload', covers('set.main-font'), async ({ page }) => {
        await openSection(page, SECTION.display);
        const select = page.locator('#main-font-select');
        const all = await select.locator('option').evaluateAll((list) => list.map((o) => o.value));
        expect(all).toEqual(['inter', 'system', 'arial', 'verdana', 'trebuchet', 'georgia', 'times']);
        const offered = await select.locator('option').evaluateAll((list) => list.filter((o) => !o.disabled).map((o) => o.value));
        expect(offered, 'inter and system are always there').toEqual(expect.arrayContaining(['inter', 'system']));
        const LOCAL = { system: 'local(', arial: "local('Arial')", verdana: "local('Verdana')", trebuchet: "local('Trebuchet MS')", georgia: "local('Georgia')", times: "local('Times New Roman')" };
        const widths = new Set();
        for (const font of offered) {
            await select.selectOption(font);
            await expect.poll(() => userStorage(page, 'main_font'), font).toBe(font);
            await page.reload();
            await expect(select, `${font} after a reload`).toHaveValue(font);
            const override = await page.evaluate(() => (document.getElementById('main-font-override') || { textContent: '' }).textContent);
            if (font === 'inter') expect(override, 'the bundled font').toBe('');
            else expect(override, font).toContain(LOCAL[font]);
            await page.evaluate(() => document.fonts.ready);
            widths.add(await page.evaluate(() => {
                const range = document.createRange();
                range.selectNodeContents(document.querySelector('#main-font-card .home-card-title'));
                return Math.round(range.getBoundingClientRect().width * 10);
            }));
        }
        if (offered.length > 1) expect(widths.size, 'the text really changes shape').toBeGreaterThan(1);
        await select.selectOption('inter');
    });

    test('markdown font: the editor font follows the list, the preview keeps the app font', covers('set.markdown-font'), async ({ page }) => {
        await openSection(page, SECTION.markdown);
        const options = await page.locator('#markdown-font-select option').evaluateAll((list) => list.map((o) => o.value));
        expect(options).toEqual(['inherit', 'monospace', 'courier', 'consolas', 'menlo', 'monaco', 'jetbrains', 'cascadia', 'fira', 'sourcecodepro', 'ubuntumono']);
        await page.locator('#markdown-font-select').selectOption('monospace');
        await expect.poll(() => userStorage(page, 'markdown_font')).toBe('monospace');
        await openNote(page, md.id);
        await expect.poll(() => css(page.locator('.cm-content').first(), 'font-family')).toContain('monospace');
        expect(await css(page.locator('.markdown-preview').first(), 'font-family')).not.toContain('monospace');
        await openSection(page, SECTION.markdown);
        await expect(page.locator('#markdown-font-select')).toHaveValue('monospace');
        await page.locator('#markdown-font-select').selectOption('inherit');
        await openNote(page, md.id);
        await expect.poll(() => css(page.locator('.cm-content').first(), 'font-family')).not.toContain('monospace');
    });

    test('font sizes: note, tree, code block and settings each take effect, out of range is refused, Cancel changes nothing', covers('set.font-size'), async ({ page }) => {
        await openSection(page, SECTION.display);
        // One badge per size: notes, tree, code blocks, settings page
        const badges = () => page.locator('#font-size-card .setting-status').allInnerTexts();
        await expect.poll(badges).toEqual(['15px', '13px', '15px', '15px']);
        await page.click('#font-size-card');
        const modal = page.locator('#fontSizeModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#fontSizeInput')).toHaveValue('15');
        await expect(page.locator('#sidebarFontSizeInput')).toHaveValue('13');
        await page.locator('#fontSizeInput').fill('40');
        await page.click('#saveFontSizeBtn');
        const refusal = page.locator('.alert-modal-overlay.show');
        await expect(refusal, 'out of range is said').toContainText('between 10 and 32');
        await refusal.locator('.alert-modal-button').last().click();
        await expect(refusal).toHaveCount(0);
        await expect(modal, 'out of range').toBeVisible();
        expect(await userStorage(page, 'note_font_size')).toBeNull();
        await page.locator('#fontSizeInput').fill('25');
        await page.click('#cancelFontSizeBtn');
        await expect(modal).toBeHidden();
        expect(await userStorage(page, 'note_font_size'), 'Cancel saves nothing').toBeNull();
        await page.click('#font-size-card');
        await page.locator('#fontSizeInput').fill('22');
        await page.locator('#sidebarFontSizeInput').fill('17');
        await page.locator('#codeBlockFontSizeInput').fill('19');
        await page.locator('#settingsFontSizeInput').fill('30');
        await page.click('#saveFontSizeBtn');
        await expect(modal).toBeHidden();
        await expect.poll(badges).toEqual(['22px', '17px', '19px', '30px']);
        expect(await userStorage(page, 'note_font_size')).toBe('22');
        expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--settings-font-scale'))).toBe('2');
        await page.reload();
        await expect.poll(() => css(page.locator('#language-card .home-card-title'), 'font-size'), 'settings text scales').toBe('30px');
        await openNote(page, html.id);
        await expect.poll(() => css(page.locator('.noteentry').first(), 'font-size')).toBe('22px');
        await expect.poll(() => css(page.locator('.noteentry pre code').first(), 'font-size')).toBe('19px');
        await expect.poll(() => css(page.locator('#left_col a.links_arbo_left .note-title').first(), 'font-size'), 'the titles of the tree').toBe('17px');
        await openSection(page, SECTION.display);
        await page.click('#font-size-card');
        for (const [input, size] of [['#fontSizeInput', '15'], ['#sidebarFontSizeInput', '13'], ['#codeBlockFontSizeInput', '15'], ['#settingsFontSizeInput', '15']]) await page.locator(input).fill(size);
        await page.click('#saveFontSizeBtn');
        await expect(modal).toBeHidden();
    });

    test('icon scales: the rail and notes page sliders', covers('set.icon-scales'), async ({ page }) => {
        await openSection(page, SECTION.display);
        await page.locator('#icon-rail-scale-range').fill('1.5');
        await page.locator('#icon-rail-scale-range').dispatchEvent('change');
        await expect(page.locator('#icon-rail-scale-card .settings-inline-value')).toHaveText('1.5x');
        expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--icon-rail-scale'))).toBe('1.5');
        await page.locator('#index-icon-scale-range').fill('1.5');
        await page.locator('#index-icon-scale-range').dispatchEvent('change');
        await expect(page.locator('#index-icon-scale-card .settings-inline-value')).toHaveText('1.5x');
        await expect.poll(() => userStorage(page, 'index_icon_scale')).toBe('1.5');
        await openNote(page, html.id);
        await expect(page.locator('#index-icon-scale-style'), 'the notes page applies it').toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--icon-rail-scale')), 'and the rail').toBe('1.5');
        await openSection(page, SECTION.display);
        await expect(page.locator('#icon-rail-scale-range'), 'kept').toHaveValue('1.5');
        await page.locator('#icon-rail-scale-range').fill('1');
        await page.locator('#icon-rail-scale-range').dispatchEvent('change');
        await page.locator('#index-icon-scale-range').fill('1');
        await page.locator('#index-icon-scale-range').dispatchEvent('change');
        await openNote(page, html.id);
        await expect(page.locator('#index-icon-scale-style')).toHaveCount(0);
    });
});

// ---------------------------------------------------------------------------
// The instance's look: every test puts back what it changed, in a finally.
const chooseFile = async (page, button, file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
    await chooser.setFiles(file);
};
test.describe('admin appearance', () => {
    let admin; let member; let memberApi;
    test.beforeAll(async ({ playwright }) => {
        admin = await Api.open(playwright, ADMIN);
        member = await newAccount(playwright, 'look');
        memberApi = await Api.open(playwright, member);
    });
    test.afterAll(async () => { await admin.dispose(); await memberApi.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    const ADMIN_CARDS = ['users-admin-card', 'oidc-config-card', 'two-factor-required-card', 'login-disabled-card', 'tenant-isolation-card', 'smtp-config-card', 'webhooks-card', 'ai-assistant-card', 'stt-card', 'git-sync-enabled-card', 'statistics-token-card', 'outbound-hosts-card', 's3-storage-card', 's3-backup-card', 'local-backup-card', 'executable-attachments-card', 'import-limits-card', 'user-quotas-card', 'custom-logo-card', 'custom-css-card', 'custom-fonts-card', 'theme-list-card', 'disaster-recovery-card', 'orphan-scanner-card', 'activity-log-card', 'storage-stats-card'];

    test('the Admin side lists exactly the instance cards, group by group', covers('set.cards-admin', 'set.scope-switch'), async ({ page }) => {
        await page.goto('/settings.php');
        await page.click('.settings-scope-option[data-scope="admin"]');
        await expect(page.locator('#admin-tools-grid')).toBeVisible();
        expect(await page.locator('#admin-tools-grid .home-card[id]').evaluateAll((all) => all.map((c) => c.id))).toEqual(ADMIN_CARDS);
        const groups = await page.locator('.settings-nav-group-item[data-admin-group]:not([hidden])').evaluateAll((all) => all.map((a) => a.dataset.adminGroup));
        expect(groups.length).toBeGreaterThan(2);
        const seen = new Set();
        for (const group of groups) {
            await page.click(`.settings-nav-group-item[data-admin-group="${group}"]`);
            const shown = await page.locator('#admin-tools-grid .home-card[id]').evaluateAll((all) => all.filter((c) => c.checkVisibility()).map((c) => c.id));
            expect(shown.length, `group ${group} shows cards`).toBeGreaterThan(0);
            shown.forEach((id) => { expect(seen.has(id), `${id} in one group only`).toBe(false); seen.add(id); });
        }
        expect([...seen].sort(), 'every card is in a group').toEqual([...ADMIN_CARDS].sort());
        await page.click('.settings-scope-option[data-scope="user"]');
        await expect(page.locator('#admin-tools-grid')).toBeHidden();
    });

    test('link cards of the Admin side open their page', covers('set.admin-link-cards'), async ({ page }) => {
        test.setTimeout(150_000);
        for (const [card, url, text] of [
            ['users-admin-card', 'admin/users.php', /User/], ['oidc-config-card', 'admin/oidc.php', /OIDC/], ['smtp-config-card', 'admin/smtp.php', /SMTP/],
            ['webhooks-card', 'admin/webhooks.php', /Webhook/], ['ai-assistant-card', 'ai_settings.php', /AI/], ['stt-card', 'stt_settings.php', /[Tt]ranscription/],
            ['s3-storage-card', 's3_settings.php', /S3/], ['local-backup-card', 'local_backup_settings.php', /Local/],
            ['activity-log-card', 'admin/activity-log.php', /Activity/], ['storage-stats-card', 'admin/storage-stats.php', /[Ss]torage/],
        ]) {
            await openAdminGroup(page, card);
            await page.click(`#${card} .home-card-title`);
            await page.waitForURL((u) => u.pathname.endsWith(url), { timeout: 10_000 });
            await expect(page.locator('body'), card).toContainText(text);
        }
        // Not opened: its page lists the bucket on load, a known 500 with no S3 configured (14-data.spec.js)
        await openAdminGroup(page, 's3-backup-card');
        await expect(page.locator('#s3-backup-card')).toHaveAttribute('data-href', 's3_backup_settings.php');
    });

    test('login page title: the row stores the name, the login page shows it', covers('set.login-display'), async ({ page, browser }) => {
        await openSection(page, SECTION.display);
        const input = page.locator('#login-display-input');
        await input.fill('Carnet été');
        await input.press('Enter');
        await expect.poll(() => stored(admin, 'login_display_name')).toBe('Carnet été');
        const context = await browser.newContext({ baseURL: BASE_URL });
        const fresh = await context.newPage();
        try {
            await fresh.goto('/login.php');
            await expect(fresh.locator('body')).toContainText('Carnet été');
        } finally {
            await context.close();
            await admin.ok(admin.put('/settings/login_display_name', { value: '' }));
        }
    });

    test('logo: the notice comes first, the image replaces the logo everywhere, and back', covers('set.logo'), async ({ page }) => {
        try {
            await openAdminGroup(page, 'custom-logo-card');
            await expect(page.locator('#custom-logo-card .setting-status')).toHaveText('Poznote');
            await page.click('#custom-logo-card');
            await expect(page.locator('#customLogoNoticeModal')).toBeVisible();
            await page.locator('#customLogoNoticeModal .btn-cancel').click();
            await expect(page.locator('#customLogoNoticeModal')).toBeHidden();
            await expect(page.locator('#customLogoModal')).toBeHidden();
            await page.click('#custom-logo-card');
            await page.click('#customLogoNoticeContinueBtn');
            await expect(page.locator('#customLogoModal')).toBeVisible();
            await expect(page.locator('#customLogoResetBtn')).toBeHidden();
            await chooseFile(page, '#customLogoUploadBtn', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
            await expect(page.locator('#customLogoResetBtn')).toBeVisible();
            const state = await (await page.request.get('/api_branding.php')).json();
            expect(state.custom).toBe(true);
            const icon = await page.locator('link[rel="icon"]').first().getAttribute('href');
            expect(icon, 'tab icon').toContain(state.url.split('?')[0].split('/').pop());
            expect((await page.request.get(state.url)).headers()['content-type']).toContain('image/png');
            await page.reload();
            await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', new RegExp(state.url.split('?')[0].split('/').pop()));
            await openAdminGroup(page, 'custom-logo-card');
            await page.click('#custom-logo-card');
            await expect(page.locator('#customLogoModal'), 'no notice once replaced').toBeVisible();
            await page.click('#customLogoResetBtn');
            await answerDialog(page, 'Confirm');
            await expect.poll(async () => (await (await page.request.get('/api_branding.php')).json()).custom).toBe(false);
            await expect(page.locator('#customLogoResetBtn')).toBeHidden();
        } finally {
            await page.request.delete('/api_branding.php', { failOnStatusCode: false });
        }
    });

    test('the logo notice has a donate way too', covers('set.logo-donate'), async ({ page }) => {
        await page.context().route('https://ko-fi.com/**', (route) => route.fulfill({ contentType: 'text/html', body: 'merci' }));
        await openAdminGroup(page, 'custom-logo-card');
        await page.click('#custom-logo-card');
        const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#customLogoNoticeDonateBtn')]);
        expect(popup.url()).toContain('ko-fi.com');
        await popup.close();
        await expect(page.locator('#customLogoModal'), 'and goes on to the dialog').toBeVisible();
    });

    test('custom CSS: upload, apply to everyone, download, delete', covers('set.custom-css'), async ({ page, browser }) => {
        const NAME = 'e2e-marque.css';
        const source = '/* é */ :root { --e2e-marker: applied; }';
        const marker = (target) => target.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--e2e-marker').trim());
        try {
            await openAdminGroup(page, 'custom-css-card');
            await expect(page.locator('#custom-css-card .setting-status')).toHaveText('Not defined');
            await page.click('#custom-css-card');
            await expect(page.locator('#customCssModal')).toBeVisible();
            await chooseFile(page, '#uploadCustomCssBtn', { name: NAME, mimeType: 'text/css', buffer: Buffer.from(source) });
            await expect(page.locator('#customCssThemeList .custom-css-theme', { hasText: 'e2e-marque' })).toBeVisible();
            // Saving reloads the page by itself
            await Promise.all([page.waitForEvent('load'), page.click('#saveCustomCssBtn')]);
            await expect.poll(() => stored(admin, 'custom_css_path')).toContain(NAME);
            await expect.poll(() => marker(page), 'the stylesheet is applied').toBe('applied');
            await expect(page.locator('#custom-css-card .setting-status')).toContainText('e2e-marque');
            // Applied to all users
            const context = await browser.newContext({ baseURL: BASE_URL });
            const other = await context.newPage();
            await login(other, member);
            await other.goto('/index.php');
            await expect.poll(() => marker(other), 'for a user too').toBe('applied');
            await context.close();
            // Download link of the row
            await openAdminGroup(page, 'custom-css-card');
            await page.click('#custom-css-card');
            const row = page.locator('#customCssThemeList .custom-css-theme', { hasText: 'e2e-marque' });
            expect((await page.request.get(await row.locator('.custom-css-theme-download').getAttribute('href'))).status()).toBe(200);
            // A file that is not CSS is refused with a message
            await chooseFile(page, '#uploadCustomCssBtn', { name: 'pas-css.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
            expect(await answerDialog(page)).toContain('CSS');
            await expect(page.locator('#customCssThemeList .custom-css-theme', { hasText: 'pas-css' })).toHaveCount(0);
            // Cancel keeps it applied, delete removes it
            await page.click('#cancelCustomCssBtn');
            await page.click('#custom-css-card');
            await row.locator('.custom-css-theme-delete').click();
            await answerDialog(page);
            await expect(row).toHaveCount(0);
            await expect.poll(() => stored(admin, 'custom_css_path')).toBeFalsy();
        } finally {
            // The file too, or a retry and the theme list test would find it
            await page.request.delete(`/api_upload_css.php?filename=${encodeURIComponent(NAME)}`);
            await admin.ok(admin.put('/settings/custom_css_path', { value: '' }));
        }
    });

    test('theme list: untick and reorder, the menu follows for a user too; a CSS file becomes a theme', covers('set.theme-list'), async ({ page, browser }) => {
        const before = await page.request.get('/api_upload_css.php').then((r) => r.json());
        expect(before.builtin_themes.map((t) => t.id)).toEqual(Object.keys(THEMES));
        try {
            await openAdminGroup(page, 'theme-list-card');
            await expect(page.locator('#theme-list-card .setting-status')).toHaveText('6 themes');
            await page.click('#theme-list-card');
            await expect(page.locator('#themeListModal')).toBeVisible();
            const rows = page.locator('#themeListChoices .custom-css-theme-choice');
            await expect(rows).toHaveCount(6);
            await rows.filter({ hasText: 'Terminal' }).locator('input[type="checkbox"]').uncheck();
            await rows.filter({ hasText: 'Black' }).locator('.custom-css-theme-order-btn').first().click();
            await page.click('#saveThemeListBtn');
            await page.waitForLoadState();
            await expect(page.locator('#theme-list-card .setting-status')).toHaveText('5 themes');
            const context = await browser.newContext({ baseURL: BASE_URL });
            const other = await context.newPage();
            await login(other, member);
            await other.goto('/settings.php');
            await other.click(themeButton);
            expect(await other.locator('#themePickerMenu [data-theme-choice]').evaluateAll((all) => all.map((i) => i.dataset.themeChoice)), 'menu of a user').toEqual(['light', 'black', 'dark', 'lavender', 'sepia']);
            await context.close();
        } finally {
            const reset = await page.request.get('/api_upload_css.php').then((r) => r.json());
            const form = { action: 'theme_list', entries: JSON.stringify(reset.builtin_themes.map((t) => ({ id: t.id }))) };
            expect((await page.request.post('/api_upload_css.php', { form })).status()).toBe(200);
        }
        const after = await page.request.get('/api_upload_css.php').then((r) => r.json());
        expect(after.theme_list.entries.map((e) => e.id), 'restored').toEqual(Object.keys(THEMES));
    });

    test('a stylesheet added to the theme list becomes a theme of the menu, with its mode', covers('set.theme-custom-css'), async ({ page }) => {
        const source = ':root { --e2e-theme: oui; --pz-bg: #123456; }';
        const marker = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--e2e-theme').trim());
        const form = (entries) => ({ form: { action: 'theme_list', entries: JSON.stringify(entries) } });
        try {
            await openAdminGroup(page, 'custom-css-card');
            await page.click('#custom-css-card');
            await chooseFile(page, '#uploadCustomCssBtn', { name: 'e2e-theme.css', mimeType: 'text/css', buffer: Buffer.from(source) });
            // No theme applied to everyone: nothing but the theme list uses this file
            await page.locator('#customCssThemeList input[name="customCssTheme"]').first().check();
            await page.click('#saveCustomCssBtn');
            await page.waitForLoadState();
            await openAdminGroup(page, 'theme-list-card');
            await page.click('#theme-list-card');
            const row = page.locator('#themeListChoices .custom-css-theme-choice', { hasText: 'e2e-theme' });
            await row.locator('input[type="checkbox"]').check();
            await row.locator('select.custom-css-theme-choice-mode').selectOption('dark');
            await page.click('#saveThemeListBtn');
            await page.waitForLoadState();
            await page.click(themeButton);
            await page.click('#themePickerMenu [data-theme-choice="custom:e2e-theme.css"]');
            await expect.poll(marker, 'its stylesheet is loaded').toBe('oui');
            await expect(page.locator('html'), 'the mode chosen in the list').toHaveAttribute('data-theme', 'dark');
            await page.reload();
            await expect.poll(marker, 'after a reload').toBe('oui');
            await pickTheme(page, 'light');
            await expect.poll(marker, 'gone with another theme').toBe('');
        } finally {
            const state = await page.request.get('/api_upload_css.php').then((r) => r.json());
            await page.request.post('/api_upload_css.php', form(state.builtin_themes.map((t) => ({ id: t.id }))));
            await page.request.delete('/api_upload_css.php?filename=e2e-theme.css');
            await admin.ok(admin.put('/settings/custom_css_path', { value: '' }));
        }
    });

    test('admin theme menu ends with Customize, which opens the list where it is', covers('set.theme-list-menu'), async ({ page }) => {
        await page.goto('/index.php');
        await settled(page);
        await page.click(themeButton);
        await page.click('#themePickerMenu [data-theme-list-edit]');
        await expect(page.locator('#themeListModal')).toBeVisible();
        await page.click('#cancelThemeListBtn');
        await expect(page.locator('#themeListModal')).toBeHidden();
        await page.goto('/settings.php?open=theme-list');
        await expect(page.locator('#themeListModal'), 'old link').toBeVisible();
    });

    test('custom fonts: upload, offered in both lists, applied, deleted', covers('set.custom-fonts'), async ({ page }) => {
        const buffer = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'public', 'webfonts', 'Inter', 'static', 'Inter_24pt-Regular.ttf'));
        await openAdminGroup(page, 'custom-fonts-card');
        await page.click('#custom-fonts-card');
        await expect(page.locator('#customFontsModal')).toBeVisible();
        await expect(page.locator('#customFontsNoFile')).toBeVisible();
        await chooseFile(page, '#uploadCustomFontsBtn', { name: 'Espiègle-Regular.ttf'.normalize('NFD').replace(/[^\x00-\x7f]/g, ''), mimeType: 'font/ttf', buffer });
        const row = page.locator('#customFontsList .custom-css-theme');
        await expect(row).toHaveCount(1);
        const fontRow = await row.innerText();
        try {
            await page.click('#closeCustomFontsBtn');
            await page.waitForLoadState();
            await openSection(page, SECTION.display);
            const option = page.locator('#main-font-select optgroup option');
            await expect(option).toHaveCount(1);
            const id = await option.getAttribute('value');
            await page.locator('#main-font-select').selectOption(id);
            await expect.poll(() => userStorage(page, 'main_font')).toBe(id);
            await page.reload();
            const face = await page.locator('#main-font-override').textContent();
            expect(face, 'the file becomes the faces of the app font').toContain('Espiegle-Regular.ttf');
            await expect.poll(() => page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].some((f) => f.family.includes('Inter') && f.status === 'loaded'))), 'the browser loads it').toBe(true);
            await expect(page.locator('#markdown-font-select optgroup option'), 'markdown list too').toHaveCount(1);
            await page.locator('#main-font-select').selectOption('inter');
        } finally {
            await openAdminGroup(page, 'custom-fonts-card');
            await page.click('#custom-fonts-card');
            await page.locator('#customFontsList .custom-css-theme-delete').click();
            await answerDialog(page);
        }
        await expect(page.locator('#customFontsList .custom-css-theme'), `deleted ${fontRow}`).toHaveCount(0);
        await expect(page.locator('#customFontsNoFile')).toBeVisible();
        expect((await page.request.post('/api_upload_font.php', { multipart: { 'font_files[]': { name: 'faux.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font at all') } } })).status(), 'a file that is no font').toBeLessThan(500);
    });
});

// ---------------------------------------------------------------------------
test.describe('workspace background', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'bg');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('background image: upload, opacity, shown behind the notes, removed', covers('set.background'), async ({ page }) => {
        const layer = page.locator('#poznote-background-layer');
        await page.goto('/index.php');
        await settled(page);
        await expect(layer, 'none at first').toHaveCount(0);
        const open = async () => {
            await openSection(page, SECTION.workspaces);
            const action = page.locator('.workspace-background-action').first();
            await action.evaluate((button) => button.click());
            await expect(page.locator('#backgroundImageModal')).toBeVisible();
        };
        await open();
        await expect(page.locator('#removeBackgroundBtn')).toBeHidden();
        await expect(page.locator('.no-background-text')).toBeVisible();
        await chooseFile(page, '#uploadBackgroundBtn', { name: 'fond.png', mimeType: 'image/png', buffer: PNG });
        await expect.poll(() => page.locator('#backgroundPreview').evaluate((el) => el.style.backgroundImage), 'preview').toContain('url(');
        await page.locator('#backgroundOpacityInput').fill('10');
        await expect(page.locator('#backgroundOpacityValue')).toHaveText('10');
        await page.click('#saveBackgroundBtn');
        await expect(page.locator('#backgroundImageModal')).toBeHidden();
        const workspace = (await api.ok(api.get('/workspaces'))).json.workspaces[0].name;
        await expectStored(api, `background_opacity_${workspace}`, '10');
        const state = await (await page.request.get(`/api_upload_background.php?workspace=${encodeURIComponent(workspace)}`)).json();
        expect(state.exists).toBe(true);
        expect((await page.request.get(state.url)).status(), 'the file is served').toBe(200);
        await page.goto('/index.php');
        await expect(layer).toHaveCount(1);
        expect(await layer.evaluate((el) => [el.style.backgroundImage.includes('url('), el.style.opacity])).toEqual([true, '0.1']);
        await expect(page.locator('body')).toHaveClass(/has-background-image/);
        await page.goto('/settings.php');
        await expect(layer, 'only behind the notes').toHaveCount(0);
        await open();
        await expect(page.locator('#backgroundOpacityInput')).toHaveValue('10');
        await page.click('#cancelBackgroundBtn');
        await open();
        await expect(page.locator('#removeBackgroundBtn')).toBeVisible();
        await page.click('#removeBackgroundBtn');
        await expect(page.locator('.no-background-text'), 'Remove empties the preview, Save applies it').toBeVisible();
        await page.click('#saveBackgroundBtn');
        await expect(page.locator('#backgroundImageModal')).toBeHidden();
        await expect.poll(async () => (await (await page.request.get(`/api_upload_background.php?workspace=${encodeURIComponent(workspace)}`)).json()).exists).toBe(false);
        await page.goto('/index.php');
        await settled(page);
        await expect(layer).toHaveCount(0);
    });
});

// ---------------------------------------------------------------------------
test.describe('icon rail and toolbar', () => {
    let account; let api; let note;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'rail');
        api = await Api.open(playwright, account);
        note = await api.createNote({ heading: 'Note rail', content: '<p>Texte</p>' });
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const railIds = (page) => page.locator('#icon_sidebar [data-icon-sidebar-entry], #icon_sidebar .icon-sidebar-btn[id]').evaluateAll((all) => [...new Set(all.map((b) => b.id))]);
    const rows = (page) => page.locator('#iconSidebarOrderList .icon-sidebar-order-item');

    test('layout dialog: drag a row, add a separator, save; the rail follows; reset and cancel', covers('set.icon-sidebar-order'), async ({ page }) => {
        await openSection(page, SECTION.sidebar);
        await page.click('#icon-sidebar-order-card');
        await expect(page.locator('#iconSidebarOrderModal')).toBeVisible();
        const ids = await rows(page).evaluateAll((all) => all.map((row) => row.dataset.entryId));
        const entries = ids.filter((id) => !id.includes('divider') && id !== '---');
        expect(entries.length, 'buttons listed').toBeGreaterThan(4);
        const rail = await railIds(page);
        for (const id of entries) expect(rail, `${id} in the rail`).toContain(id);
        // Cancel drops what was done
        await page.click('#addIconSidebarDividerBtn');
        const added = await rows(page).count();
        expect(added).toBe(ids.length + 1);
        await page.click('#cancelIconSidebarOrderBtn');
        await expect(page.locator('#iconSidebarOrderModal')).toBeHidden();
        expect(await stored(api, 'icon_sidebar_order') || '[]').toBe('[]');
        await page.click('#icon-sidebar-order-card');
        await expect(rows(page), 'cancel forgets the separator').toHaveCount(ids.length);
        // Drag the first entry below the third
        const firstId = entries[0];
        const from = page.locator(`#iconSidebarOrderList [data-entry-id="${firstId}"] .icon-sidebar-order-handle`);
        const to = page.locator(`#iconSidebarOrderList [data-entry-id="${entries[2]}"]`);
        const box = await to.boundingBox();
        // Sortable runs on native drag and drop, which dragTo drives
        await from.dragTo(to, { targetPosition: { x: box.width / 2, y: box.height * 0.75 } });
        const after = await rows(page).evaluateAll((all) => all.map((row) => row.dataset.entryId));
        expect(after.indexOf(firstId), 'the row moved').toBeGreaterThan(ids.indexOf(firstId));
        await page.click('#saveIconSidebarOrderBtn');
        await expect(page.locator('#iconSidebarOrderModal')).toBeHidden();
        await expect.poll(async () => JSON.parse(await stored(api, 'icon_sidebar_order') || '[]').filter((id) => id === firstId).length).toBe(1);
        await page.goto('/index.php');
        await settled(page);
        const order = await railIds(page);
        expect(order.indexOf(firstId), 'order in the rail').toBeGreaterThan(order.indexOf(entries[1]));
        await openSection(page, SECTION.sidebar);
        await page.click('#icon-sidebar-order-card');
        // Reset saves the shipped order at once
        await page.click('#resetIconSidebarOrderBtn');
        await expect.poll(async () => JSON.parse(await stored(api, 'icon_sidebar_order') || '[]')).toEqual([]);
        await page.goto('/index.php');
        await settled(page);
        const reset = await railIds(page);
        expect(reset.indexOf(firstId), 'back to the shipped order').toBeLessThan(reset.indexOf(entries[1]));
    });

    test('rail right-click: colour a button, hide a button, customize', covers('set.icon-rail-colors', 'set.icon-rail-hide'), async ({ page }) => {
        await page.goto('/index.php');
        await settled(page);
        const target = page.locator('#icon_sidebar .icon-sidebar-btn[id]:visible').nth(1);
        const id = await target.getAttribute('id');
        await target.click({ button: 'right' });
        const menu = page.locator('#iconContextMenu');
        await expect(menu).toBeVisible();
        await menu.locator('.icon-context-menu-item').first().click();
        await expect(page.locator('#iconSidebarColorModal')).toBeVisible();
        const swatch = page.locator('#iconSidebarColorModal [data-color]:not([data-color=""])').first();
        const color = (await swatch.getAttribute('data-color')).toLowerCase();
        await swatch.click();
        await page.locator('#iconSidebarColorModal .btn-primary').click();
        await expect.poll(async () => JSON.parse(await stored(api, 'icon_sidebar_colors') || '{}')[id], 'stored').toBe(color);
        await page.reload();
        await expect(page.locator(`#${id} i`)).toHaveClass(/icon-sidebar-icon-colored/);
        const painted = await page.locator(`#${id} i`).evaluate((el) => el.style.getPropertyValue('--icon-sidebar-icon-color'));
        expect(painted, 'painted from the stored colour').toBeTruthy();
        await page.locator(`#${id}`).click({ button: 'right' });
        await menu.locator('.icon-context-menu-item', { hasText: /Hide/ }).click();
        await expect(page.locator(`#${id}`), 'hidden at once').toBeHidden();
        await expect.poll(async () => JSON.parse(await stored(api, 'hidden_ui_elements') || '[]')).toContain(`card:${id}`);
        await page.reload();
        await expect(page.locator(`#${id}`), 'still hidden').toBeHidden();
        await api.ok(api.put('/settings/hidden_ui_elements', { value: '[]' }));
        await api.ok(api.put('/settings/icon_sidebar_colors', { value: '{}' }));
        await page.reload();
        await expect(page.locator(`#${id}`)).toBeVisible();
        await page.locator(`#${id}`).click({ button: 'right' });
        await menu.locator('.icon-context-menu-item', { hasText: 'Customize this menu' }).click();
        await expect(page.locator('#iconSidebarOrderModal'), 'opens in place').toBeVisible();
    });

    test('toolbar right-click: colour a note button, hide it', covers('set.toolbar-colors'), async ({ page }) => {
        await openNote(page, note.id);
        const button = page.locator('.note-edit-toolbar .toolbar-btn.btn-favorite').first();
        await button.click({ button: 'right' });
        const menu = page.locator('#iconContextMenu');
        await expect(menu).toBeVisible();
        await menu.locator('.icon-context-menu-item').first().click();
        const swatch = page.locator('#iconSidebarColorModal [data-color]:not([data-color=""])').first();
        const color = (await swatch.getAttribute('data-color')).toLowerCase();
        await swatch.click();
        await page.locator('#iconSidebarColorModal .btn-primary').click();
        await expect.poll(async () => JSON.parse(await stored(api, 'toolbar_icon_colors') || '{}')['btn-favorite'], 'stored').toBe(color);
        await page.reload();
        await settled(page);
        expect(await page.locator('#toolbar-icon-colors-styles').textContent(), 'rule emitted by the server').toContain('.btn-favorite');
        await page.locator('.note-edit-toolbar .toolbar-btn.btn-favorite').first().click({ button: 'right' });
        await menu.locator('.icon-context-menu-item', { hasText: /Hide/ }).click();
        await expect(page.locator('.note-edit-toolbar .toolbar-btn.btn-favorite').first()).toBeHidden();
        await expect.poll(async () => JSON.parse(await stored(api, 'hidden_ui_elements') || '[]')).toContain('toolbar:btn-favorite');
        await api.ok(api.put('/settings/hidden_ui_elements', { value: '[]' }));
        await api.ok(api.put('/settings/toolbar_icon_colors', { value: '{}' }));
    });

    test('view button of a note: right-click toggles between a menu and stepping through views', covers('set.markdown-view-button-cycle'), async ({ page }) => {
        const md = await api.createNote({ heading: 'Vues', content: '# T\n', type: 'markdown' });
        await openNote(page, md.id);
        const button = page.locator('#edgeViewMenuBtn');
        await button.click();
        await expect(page.locator('#markdownViewMenu'), 'a menu by default').toBeVisible();
        await page.keyboard.press('Escape');
        await button.click({ button: 'right' });
        await page.locator('#iconContextMenu .icon-context-menu-item', { hasText: 'Toggle on click' }).click();
        await expectStored(api, 'markdown_view_button_cycle', '1');
        await openNote(page, md.id);
        await button.click();
        await expect(page.locator('#markdownViewMenu'), 'no menu now').toBeHidden();
        await api.ok(api.put('/settings/markdown_view_button_cycle', { value: '0' }));
    });
});

// ---------------------------------------------------------------------------
const VISIBILITY = {
    'Create Cards': ['card:create-note-card', 'card:create-markdown-note-card', 'card:create-task-list-card', 'card:create-diary-entry-card', 'card:create-folder-card', 'card:create-subfolder-card'],
    'Sidebar': ['card:sidebarNotificationsBtn', 'card:sidebarCreateBtn', 'card:search-bar-container', 'card:sidebarSortBtn', 'card:sidebarExpandFoldersBtn', 'panel:favorites-folder', 'panel:folder-note-count', 'panel:other-accounts', 'panel:mini-calendar'],
    'Icon rail': ['card:iconSidebarDashboardBtn', 'card:iconSidebarNotesBtn', 'card:iconSidebarTagsBtn', 'card:iconSidebarFoldersBtn', 'card:iconSidebarSharesBtn', 'card:iconSidebarOfflineBtn', 'card:iconSidebarAttachmentsBtn', 'card:iconSidebarTrashBtn', 'card:iconSidebarDiaryBtn', 'card:iconSidebarTasksBtn', 'card:iconSidebarMentionsBtn', 'card:iconSidebarGraphBtn', 'card:iconSidebarSpeedDialBtn', 'card:iconSidebarGitPushBtn', 'card:iconSidebarGitPullBtn', 'card:iconSidebarThemeToggleBtn', 'card:iconSidebarAboutBtn', 'card:iconSidebarLogoutBtn'],
    'Toolbar': ['bold', 'italic', 'underline', 'strikethrough', 'link', 'color', 'highlight', 'list-ul', 'list-ol', 'task-list', 'task-remove', 'text-height', 'align', 'code', 'inline-code', 'eraser', 'search-replace', 'checklist', 'tasklist-actions', 'save', 'favorite', 'publish', 'attachment', 'reminder', 'open-new-tab', 'duplicate', 'move', 'archive', 'speed-dial', 'create-linked-note', 'download', 'print', 'convert', 'audio', 'clear-completed', 'uncheck-all', 'open-tasks-page', 'snapshot', 'trash'].map((id) => `toolbar:btn-${id}`),
    'Slash Menu': ['normal', 'title', 'format', 'align', 'color', 'highlight', 'code', 'list', 'tasklist-embed', 'quote', 'media', 'toggle', 'emoji', 'date', 'now', 'relative-date', 'weekday', 'insert-date', 'insert-time', 'insert-datetime', 'journal-link', 'excalidraw', 'mermaid', 'table', 'separator', 'paste-markdown', 'note-reference', 'template', 'link-to-attachment', 'link', 'image', 'take-photo', 'audio-file', 'cancel'].map((id) => `slash:${id}`),
    'Mobile editor bar': ['card:mobileEditorBar', ...['Insert', 'RecordAudio', 'Undo', 'Redo', 'Bold', 'Italic', 'Underline', 'Strikethrough', 'Link', 'Color', 'Highlight', 'Title', 'Align', 'ListUl', 'ListOl', 'Checklist', 'Outdent', 'Indent', 'CodeBlock', 'InlineCode', 'ClearFormat', 'SearchReplace', 'HideKeyboard', 'Customize'].map((id) => `card:mobileBar${id}`)],
    'Other': ['panel:outline-panel', 'panel:note-scrollbar', 'panel:note-scroll-arrows', 'panel:tasklist-progress', 'panel:preview-code-block-delete', 'panel:note-created-date', 'panel:note-updated-date', 'panel:note-stats-characters', 'panel:note-stats-words', 'panel:note-stats-lines', 'panel:note-info-icon', 'panel:note-icons', 'card:edgeCustomizeBtn', 'card:edgeAiChatBtn', 'card:edgeFocusModeBtn', 'card:edgeSplitViewBtn', 'card:edgeMenuNoteWidth', 'card:edgeMenuNoteInfo', 'card:edgeMenuShortcuts', 'card:edgeMenuMarkdownSyntax', 'share:restrict-users', 'share:protocol-toggle', 'card:directCopyRestoreCard', 'card:s3-user-backup-section', 'card:s3RestoreSection'],
    'Workspace Menu': ['wsmenu:new-workspace', 'wsmenu:edit-workspaces'],
    'Dashboard': ['card:dashboardTopbarFilter', 'card:dashboardViewLayoutBtn', 'card:dashboardFilterBtn'],
    'Folder Actions': ['panel:folder-actions-toggle', ...['create-note-in-folder', 'open-kanban-view', 'open-all-notes-in-tabs', 'move-folder-files', 'move-entire-folder', 'duplicate-folder', 'copy-folder', 'cut-folder', 'paste-into-folder', 'download-folder', 'toggle-folder-speed-dial', 'share-folder', 'rename-folder', 'archive-folder', 'delete-folder'].map((id) => `folder:${id}`)],
    'Speed dial': ['card:speedDialTitle', 'panel:speed-dial-workspace', 'card:speedDialFilter', 'panel:speed-dial-group-titles', 'panel:speed-dial-group-rules', 'panel:speed-dial-frame',
        'panel:speed-dial-icons', 'panel:speed-dial-labels', 'card:speedDialSwitcher', 'card:speedDialNewBtn', 'card:speedDialSize', 'panel:speed-dial-edit'],
    'Note Actions': ['panel:note-actions-toggle', ...['rename-note', 'open-share-modal', 'toggle-favorite', 'toggle-speed-dial', 'duplicate-note', 'create-note-shortcut', 'show-move-folder-dialog', 'copy-note', 'cut-note', 'paste-into-note-folder', 'archive-note', 'delete-note'].map((id) => `note:${id}`)],
};
const TOOLBAR_MENU_ACTIONS = { 'btn-speed-dial': ['toggle-speed-dial'], 'btn-snapshot': ['show-snapshot'], 'btn-audio': ['insert-audio-file'], 'btn-clear-completed': ['clear-completed-tasks'], 'btn-uncheck-all': ['uncheck-all-tasks'], 'btn-print': ['print-note'], 'btn-archive': ['archive-note'], 'btn-open-tasks-page': ['open-tasks-page'] };
const PANEL_TARGET = {
    'panel:favorites-folder': '.favorites-section', 'panel:folder-note-count': '.folder-note-count', 'panel:mini-calendar': '.mini-calendar-container',
    'panel:outline-panel': '#outline-panel', 'panel:note-scroll-arrows': '.note-scroll-edge-controls', 'panel:tasklist-progress': '.tasklist-progress',
    'panel:note-updated-date': '.note-sub-updated', 'panel:note-stats-words': '.note-sub-stat-words', 'panel:note-info-icon': '.note-sub-info', 'panel:note-icons': '.note-icon',
    'panel:folder-actions-toggle': '.folder-actions-toggle', 'panel:note-actions-toggle': '.note-actions-toggle',
};
const targetOf = (key) => {
    const [type, id] = key.split(':');
    if (type === 'card') return `#${id}`;
    if (type === 'toolbar') return [`.note-edit-toolbar .${id}`, `.mobile-toolbar-menu [data-selector=".${id}"]`, ...(TOOLBAR_MENU_ACTIONS[id] || []).map((action) => `.mobile-toolbar-menu [data-action="${action}"]`)].join(', ');
    if (type === 'wsmenu') return `.workspace-menu-item[data-action="${id}"]`;
    if (type === 'folder') return `.folder-actions-menu-item[data-action="${id}"]`;
    if (type === 'note') return `.note-actions-menu-item[data-action="${id}"]`;
    return PANEL_TARGET[key];
};
/** For each key, whether its element is on the page and displayed: {key: true|false}, absent keys left out. */
const displayed = (page, keys) => page.evaluate((pairs) => Object.fromEntries(pairs.flatMap(([key, selector]) => {
    const all = selector ? [...document.querySelectorAll(selector)] : [];
    return all.length ? [[key, all.some((el) => getComputedStyle(el).display !== 'none')]] : [];
})), keys.map((key) => [key, targetOf(key)]));

test.describe('element visibility', () => {
    let account; let api; let html; let md; let list;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'vis');
        api = await Api.open(playwright, account);
        html = await api.createNote({ heading: 'Note visible', content: '<h2>Titre</h2><p>Texte</p>' });
        md = await api.createNote({ heading: 'Note md', content: '# T\n\n```\ncode\n```\n', type: 'markdown' });
        list = await api.createNote({ heading: 'Liste', content: '[]', type: 'tasklist' });
        await api.ok(api.post(`/notes/${list.id}/tasks`, { text: 'Tâche' }));
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier' }))).json.folder;
        const inside = await api.createNote({ heading: 'Dedans', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${inside.id}/folder`, { folder_id: folder.id }));
        await api.ok(api.post(`/notes/${inside.id}/favorite`));
        await api.ok(api.put('/settings/markdown_default_view_mode', { value: 'split' }));
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => {
        await login(page, account);
        await api.ok(api.put('/settings/hidden_ui_elements', { value: '[]' }));
    });
    test.afterEach(async () => { await api.ok(api.put('/settings/hidden_ui_elements', { value: '[]' })); });
    const openChecklist = async (page) => {
        await openSection(page, SECTION.visibility);
        await expect(page.locator('#ui-customization-badge')).not.toHaveText('Loading...');
    };
    const hidden = async () => JSON.parse(await stored(api, 'hidden_ui_elements') || '[]');
    const section = (page, title) => page.locator('#uiCustomizationSettings .ui-custom-section').filter({ has: page.locator('.ui-custom-section-title', { hasText: new RegExp(`^${title}`) }) });
    /** The real gesture: the section's Uncheck all, its confirmation, then Save. */
    const hideSection = async (page, title) => {
        await openChecklist(page);
        await section(page, title).locator('.ui-custom-section-title .ui-custom-toggle-all').click();
        await answerDialog(page, 'Confirm');
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
    };

    test('the checklist lists exactly the expected elements, a preference saves what is unticked', covers('set.ui-checklist'), async ({ page }) => {
        await openChecklist(page);
        const live = await page.locator('#uiCustomizationSettings .ui-custom-section').evaluateAll((all) => Object.fromEntries(all.map((s) => [s.querySelector('.ui-custom-section-title span').textContent.trim(), [...s.querySelectorAll('input[data-ui-key]')].map((i) => i.dataset.uiKey)])));
        const settingsCards = live['Settings Cards'];
        delete live['Settings Cards'];
        expect(live).toEqual(VISIBILITY);
        expect(settingsCards.length).toBeGreaterThan(90);
        expect(settingsCards).toEqual(expect.arrayContaining(['card:my-profile-card', 'card:language-card', 'card:code-wrap-card', 'card:whats-new-card']));
    });

    test('Settings cards: one unticked box takes its card away, ticked again it returns', covers('set.ui-settings-cards', 'set.ui-save'), async ({ page }) => {
        await openChecklist(page);
        await section(page, 'Settings Cards').locator('.ui-custom-section-title').click();
        await page.locator('#uiCustomizationSettings input[data-ui-key="card:timezone-card"]').evaluate((box) => box.click());
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        expect(await hidden()).toContain('card:timezone-card');
        await openSection(page, SECTION.account);
        await expect(page.locator('#timezone-card')).toBeHidden();
        await expect(page.locator('#language-card'), 'and only it').toBeVisible();
        await openChecklist(page);
        await page.locator('#uiCustomizationSettings input[data-ui-key="card:timezone-card"]').evaluate((box) => box.click());
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        expect(await hidden()).not.toContain('card:timezone-card');
        await openSection(page, SECTION.account);
        await expect(page.locator('#timezone-card')).toBeVisible();
    });

    test('Settings cards: unticking the whole section empties every settings page section', covers('set.ui-settings-cards-all'), async ({ page }) => {
        await openSection(page, SECTION.account);
        const present = await page.locator('.settings-content .home-card[id]').evaluateAll((all) => all.map((card) => card.id));
        await hideSection(page, 'Settings Cards');
        const saved = await hidden();
        expect(saved).toEqual(expect.arrayContaining(['card:my-profile-card', 'card:support-card']));
        await page.goto('/settings.php');
        const left = await page.locator('.settings-content .home-card[id]').evaluateAll((all, keys) => all.filter((card) => getComputedStyle(card).display !== 'none' && keys.includes(`card:${card.id}`)).map((card) => card.id), saved);
        expect(left, 'cards still displayed').toEqual([]);
        expect(present.filter((id) => !saved.includes(`card:${id}`)), 'cards the checklist does not offer').toEqual(['restore-direct-copy-card']);
        await api.ok(api.put('/settings/hidden_ui_elements', { value: JSON.stringify(['card:directCopyRestoreCard']) }));
        await page.goto('/settings.php');
        await expect(page.locator('#restore-direct-copy-card'), 'its key has another name').toHaveCount(0);
    });

    test('Create cards: an unticked type leaves the + menu', covers('set.ui-create-cards'), async ({ page }) => {
        await openChecklist(page);
        await section(page, 'Create Cards').locator('input[data-ui-key="card:create-task-list-card"]').evaluate((box) => box.click());
        await section(page, 'Create Cards').locator('input[data-ui-key="card:create-folder-card"]').evaluate((box) => box.click());
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        await page.goto('/index.php');
        await settled(page);
        await page.click('#sidebarCreateBtn');
        const types = await page.locator('#create-menu .create-note-option').evaluateAll((all) => Object.fromEntries(all.map((o) => [o.dataset.type, getComputedStyle(o).display !== 'none'])));
        expect(types).toMatchObject({ html: true, markdown: true, list: false, folder: false });
    });

    for (const [title, pages] of [
        ['Sidebar', () => [`/index.php?note=${html.id}`]],
        ['Icon rail', () => [`/index.php?note=${html.id}`, '/settings.php', '/dashboard.php']],
        ['Toolbar', () => [`/index.php?note=${html.id}`, `/index.php?note=${md.id}`, `/index.php?note=${list.id}`]],
        ['Mobile editor bar', () => [`/index.php?note=${html.id}`]],
        ['Other', () => [`/index.php?note=${html.id}`, `/index.php?note=${md.id}`, `/index.php?note=${list.id}`, '/settings.php', '/dashboard.php']],
        ['Dashboard', () => ['/dashboard.php']],
        ['Folder Actions', () => [`/index.php?note=${html.id}`]],
        ['Note Actions', () => [`/index.php?note=${html.id}`]],
    ]) {
        test(`${title}: every element shown before, none left after unticking the section`, covers(`set.ui-${title.toLowerCase().replace(/ /g, '-')}`), async ({ page }) => {
            test.setTimeout(120_000);
            // Server side keys are checked with their cards, the toggle of the panel on its own
            const keys = VISIBILITY[title].filter((key) => !['card:edgeCustomizeBtn', 'card:directCopyRestoreCard', 'card:s3-user-backup-section', 'card:s3RestoreSection'].includes(key));
            // The format buttons show on a selection, on a phone the bar shows in the editor
            const prepare = async () => {
                if (!['Toolbar', 'Mobile editor bar'].includes(title)) return;
                const editor = page.locator('.noteentry[contenteditable="true"]:visible, .cm-content:visible').first();
                if (await editor.count()) {
                    await editor.click();
                    await page.keyboard.press('Control+A');
                }
            };
            if (title === 'Mobile editor bar') await page.setViewportSize({ width: 400, height: 800 });
            const shownSomewhere = new Set(); const drawn = new Set();
            for (const url of pages()) {
                await page.goto(url);
                await settled(page);
                await prepare();
                await page.waitForTimeout(200);
                for (const [key, shown] of Object.entries(await displayed(page, keys))) { drawn.add(key); if (shown) shownSomewhere.add(key); }
            }
            const concerned = keys.filter((key) => targetOf(key));
            expect(concerned.filter((key) => !drawn.has(key)), 'elements found nowhere').toEqual(EXPECTED_ABSENT.filter((key) => keys.includes(key)));
            expect(concerned.filter((key) => drawn.has(key) && !shownSomewhere.has(key)), 'never displayed').toEqual(NOT_SHOWN_AT_FIRST.filter((key) => keys.includes(key)));
            await page.setViewportSize({ width: 1400, height: 900 });
            await hideSection(page, title);
            if (title === 'Mobile editor bar') await page.setViewportSize({ width: 400, height: 800 });
            const saved = await hidden();
            expect(saved, 'stored').toEqual(expect.arrayContaining(keys));
            for (const url of pages()) {
                await page.goto(url);
                await settled(page);
                await prepare();
                await page.waitForTimeout(200);
                const after = await displayed(page, keys);
                const left = Object.entries(after).filter(([, shown]) => shown).map(([key]) => key);
                expect(left, `still displayed on ${url}`).toEqual([]);
            }
        });
    }

    test('Slash menu: unticked commands leave the menu', covers('set.ui-slash-menu'), async ({ page }) => {
        const menuItems = async (open) => {
            await openNote(page, html.id);
            await page.locator('.noteentry[contenteditable="true"]').first().click();
            await page.keyboard.press('Control+End');
            await page.keyboard.type('/');
            await expect(page.locator('.slash-command-menu')).toBeVisible();
            let labels = await page.locator('.slash-command-menu .slash-command-item').allInnerTexts();
            if (open) {
                await page.locator('.slash-command-menu .slash-command-item', { hasText: open }).click();
                labels = await page.locator('.slash-command-submenu .slash-command-item:not(.slash-command-back)').allInnerTexts();
            }
            await page.keyboard.press('Escape');
            return labels.map((text) => text.trim());
        };
        const all = await menuItems();
        expect(all.length, 'commands at first').toBeGreaterThan(5);
        await openChecklist(page);
        await section(page, 'Slash Menu').locator('.ui-custom-section-title .ui-custom-toggle-all').click();
        await answerDialog(page, 'Confirm');
        await section(page, 'Slash Menu').locator('input[data-ui-key="slash:table"]').evaluate((box) => box.click());
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        const saved = await hidden();
        expect(saved).toEqual(expect.arrayContaining(VISIBILITY['Slash Menu'].filter((key) => key !== 'slash:table')));
        expect(await menuItems(), 'only the section of the ticked command is left').toEqual(['Insert']);
        // Record audio has no box of its own in the checklist
        expect(await menuItems('Insert'), 'and only that command in it').toEqual(['Record audio', 'Table']);
    });

    test('Workspace menu: its two entries can be hidden', covers('set.ui-workspace-menu'), async ({ page }) => {
        const entries = async () => {
            await page.goto('/index.php');
            await settled(page);
            await page.locator('.sidebar-title[data-action="toggle-workspace-menu"]').first().click();
            await expect(page.locator('.workspace-menu-label').first(), 'the menu is loaded').toBeVisible();
            return page.locator('.workspace-menu-item:visible').allInnerTexts();
        };
        const before = await entries();
        expect(before.join(), 'at first').toMatch(/New workspace/i);
        expect(before.join()).toMatch(/Edit workspaces/i);
        await hideSection(page, 'Workspace Menu');
        const after = await entries();
        expect(after.join()).not.toMatch(/New workspace|Edit workspaces/i);
    });

    test('notes page details hidden by default come back when ticked', covers('set.ui-default-hidden'), async ({ page }) => {
        await api.ok(api.put('/settings/hidden_ui_elements', { value: JSON.stringify(['panel:preview-code-block-delete', 'panel:note-created-date', 'panel:note-stats-characters', 'panel:note-stats-lines']) }));
        await openNote(page, html.id);
        await expect(page.locator('.note-sub-created').first()).toBeHidden();
        await expect(page.locator('.note-sub-stat-characters').first()).toBeHidden();
        await openChecklist(page);
        for (const key of ['panel:note-created-date', 'panel:note-stats-characters', 'panel:note-stats-lines']) {
            await expect(page.locator(`#uiCustomizationSettings input[data-ui-key="${key}"]`), `${key} unticked`).not.toBeChecked();
            await page.locator(`#uiCustomizationSettings input[data-ui-key="${key}"]`).evaluate((box) => box.click());
        }
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        await openNote(page, html.id);
        await expect(page.locator('.note-sub-created').first()).toBeVisible();
        await expect(page.locator('.note-sub-stat-characters').first()).toBeVisible();
        await expect(page.locator('.note-sub-stat-lines').first()).toBeVisible();
    });

    test('the checklist filter, the unticked only view, Collapse all and Uncheck all', covers('set.ui-filter'), async ({ page }) => {
        await openChecklist(page);
        const shown = () => page.locator('#uiCustomizationSettings .ui-custom-item:visible');
        await page.locator('#uiCustomizationFilterInput').fill('zzz-rien');
        await expect(page.locator('#uiCustomizationFilterEmpty')).toBeVisible();
        await page.locator('#uiCustomizationFilterInput').fill('Bold');
        await expect(shown().first()).toContainText('Bold');
        for (const text of await shown().allInnerTexts()) expect(text.toLowerCase()).toContain('bold');
        await page.locator('#uiCustomizationFilterInput').fill('');
        await page.locator('#uiCustomizationHiddenOnly').check();
        await expect(page.locator('#uiCustomizationFilterEmpty'), 'nothing unticked yet').toBeVisible();
        await page.locator('#uiCustomizationHiddenOnly').uncheck();
        // Sections start folded, so the button first unfolds them all, then folds them back
        const foldAll = page.locator('#uiCustomizationCollapseAll');
        await expect(foldAll).toHaveAttribute('aria-expanded', 'false');
        await expect(shown()).toHaveCount(0);
        await foldAll.click();
        await expect(foldAll).toHaveAttribute('aria-expanded', 'true');
        await expect(shown().first()).toBeVisible();
        await foldAll.click();
        await expect(shown()).toHaveCount(0);
        await foldAll.click();
        await page.click('#uiCustomizationToggleAll');
        await expect(page.locator('.alert-modal'), 'asks first').toContainText('lose all your existing customizations');
        await answerDialog(page, 'Cancel');
        await expect(page.locator('#uiCustomizationSettings input[data-ui-key="card:timezone-card"]'), 'Cancel changes nothing').toBeChecked();
        await page.click('#uiCustomizationToggleAll');
        await answerDialog(page, 'Confirm');
        await expect(page.locator('#uiCustomizationSettings input[data-ui-key="card:timezone-card"]')).not.toBeChecked();
    });

    test('contextual panel: lists the page sections, a box applies at once and saves, with its filter', covers('set.ui-panel'), async ({ page }) => {
        await openNote(page, html.id);
        await page.click('#edgeCustomizeBtn');
        const panel = page.locator('#uiCustomizationPanel');
        // Closed, the panel keeps a 1px edge on screen: its class tells the state
        await expect(panel).toHaveClass(/ui-custom-panel-open/);
        const titles = await panel.locator('.ui-custom-section-title span').allInnerTexts();
        expect(titles).toEqual(expect.arrayContaining(['Sidebar', 'Toolbar']));
        expect(titles, 'only what this page has').not.toContain('Settings Cards');
        // The + of the tree: always on screen, unlike the sort group that sits in a menu
        await expect(page.locator('#sidebarCreateBtn')).toBeVisible();
        await panel.locator('.ui-custom-section-title', { hasText: 'Sidebar' }).click();
        await panel.locator('input[data-ui-key="card:sidebarCreateBtn"]').evaluate((box) => box.click());
        await expect(page.locator('#sidebarCreateBtn'), 'at once').toBeHidden();
        await expect.poll(hidden).toContain('card:sidebarCreateBtn');
        await page.reload();
        await settled(page);
        await expect(page.locator('#sidebarCreateBtn'), 'after a reload').toBeHidden();
        await page.click('#edgeCustomizeBtn');
        await page.locator('#uiCustomizationPanelFilter').fill('zzz-rien');
        await expect(page.locator('#uiCustomizationPanelEmpty')).toBeVisible();
        await page.locator('#uiCustomizationPanelFilter').fill('');
        await panel.locator('input[data-ui-key="card:sidebarCreateBtn"]').evaluate((box) => box.click());
        await expect(page.locator('#sidebarCreateBtn')).toBeVisible();
        await expect.poll(hidden).not.toContain('card:sidebarCreateBtn');
        // While the panel is open its own header button closes it
        await panel.locator('.ui-custom-panel-header-btn[data-action="toggle-ui-customization-panel"]').click();
        await expect(panel, 'the button closes it').not.toHaveClass(/ui-custom-panel-open/);
        await expect(page.locator('#edgeCustomizeBtn')).toBeVisible();
    });

    test('hiding Element visibility itself leaves the way back through the settings page', covers('set.ui-self-hide'), async ({ page }) => {
        await openChecklist(page);
        await page.locator('#uiCustomizationSettings input[data-ui-key="card:edgeCustomizeBtn"]').evaluate((box) => box.click());
        await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
        await openNote(page, html.id);
        await expect(page.locator('#edgeCustomizeBtn')).toBeHidden();
        await page.goto('/settings.php?open=ui-customization');
        await expect(page.locator('#uiCustomizationSettings')).toBeVisible();
        await expect(page.locator('#uiCustomizationSettings input[data-ui-key="card:edgeCustomizeBtn"]')).not.toBeChecked();
    });
});
// Drawn, but displayed only when there is something for them to show
const NOT_SHOWN_AT_FIRST = ['card:sidebarNotificationsBtn', 'toolbar:btn-task-remove', 'toolbar:btn-search-replace', 'toolbar:btn-checklist', 'toolbar:btn-open-new-tab', 'toolbar:btn-audio', 'toolbar:btn-clear-completed', 'toolbar:btn-uncheck-all', 'panel:note-actions-toggle'];
// Elements that need something this account does not have to be drawn
const EXPECTED_ABSENT = ['card:edgeAiChatBtn', 'card:iconSidebarMentionsBtn', 'card:iconSidebarGitPushBtn', 'card:iconSidebarGitPullBtn'];

// ---------------------------------------------------------------------------
test.describe('account, about and diary cards', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'acc');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('link cards open the part of the page they name', covers('set.link-cards'), async ({ page }) => {
        for (const [section, card, url] of [
            [SECTION.backup, 'backup-export-card', 'backup_export.php?workspace=Poznote&part=backup'],
            [SECTION.backup, 'restore-import-card', 'restore_import.php?workspace=Poznote&part=restore-standard'],
            [SECTION.backup, 'restore-direct-copy-card', 'restore_import.php?workspace=Poznote&part=restore-direct-copy'],
            [SECTION.exportImport, 'structured-export-card', 'backup_export.php?workspace=Poznote&part=structured-export'],
            [SECTION.exportImport, 'attachments-export-card', 'backup_export.php?workspace=Poznote&part=attachments-export'],
            [SECTION.exportImport, 'import-notes-card', 'restore_import.php?workspace=Poznote&part=import'],
            [SECTION.sync, 'git-sync-card', 'git_sync.php'],
            [SECTION.integrations, 'user-webhooks-card', 'user-webhooks.php'],
            [SECTION.integrations, 'ai-assistant-user-card', 'ai_settings_user.php'],
            [SECTION.integrations, 'stt-user-card', 'stt_settings_user.php'],
        ]) {
            await openSection(page, section);
            await page.click(`#${card} .home-card-title`);
            await page.waitForURL((u) => (u.pathname + u.search).endsWith(url.split('?')[0]) || (u.pathname + u.search).includes(url), { timeout: 10_000 });
            expect(new URL(page.url()).pathname, card).toContain(url.split('?')[0]);
            await expect(page.locator('body'), card).toContainText(/\S/);
        }
    });

    test('external link cards go where they should, in a new tab', covers('set.external-cards'), async ({ page }) => {
        await openSection(page, SECTION.about);
        for (const [card, href] of [
            ['github-card', 'https://github.com/timothepoznanski/poznote'], ['discussions-card', 'https://github.com/timothepoznanski/poznote/discussions'],
            ['website-card', 'https://poznote.com'], ['tips-card', 'https://poznote.com/tips.html'], ['discord-card', 'https://discord.gg/fuEV6uqf4N'], ['support-card', 'https://ko-fi.com/timothepoznanski'],
        ]) {
            await expect(page.locator(`#${card}`), card).toHaveAttribute('href', href);
            await expect(page.locator(`#${card}`), card).toHaveAttribute('target', '_blank');
        }
        await openSection(page, SECTION.apps);
        await expect(page.locator('#extension-card')).toHaveAttribute('href', /chromewebstore\.google\.com/);
    });

    test('install app card says what it can do', covers('set.install-app'), async ({ page }) => {
        await openSection(page, SECTION.apps);
        await expect(page.locator('#install-app-card .setting-status')).toHaveText('Unavailable');
        await page.click('#install-app-card');
        expect(await answerDialog(page), 'explains why').toMatch(/\S/);
    });

    test('storage summary of the account loads its figures', covers('set.storage-summary'), async ({ page }) => {
        await openSection(page, SECTION.account);
        const summary = page.locator('#storage-stats-user-card');
        await expect(summary.locator('.settings-storage-summary-loading')).toHaveCount(0);
        await expect(summary).toContainText(/\d/);
    });

    test('profile card edits the name, password card opens with its three fields', covers('set.profile-card', 'set.password-card'), async ({ page }) => {
        await openSection(page, SECTION.account);
        await expect(page.locator('#profile-username-badge')).toHaveText(account.username);
        await page.click('#my-profile-card');
        await expect(page.locator('#epUsername')).toHaveValue(account.username);
        await page.locator('#epFirstName').fill('Zoé');
        await page.locator('#epLastName').fill('Müller');
        await page.locator('#editProfileModal .btn-primary').click();
        await expect.poll(async () => { const me = await api.get('/users/me'); return (me.json.user || me.json).first_name; }).toBe('Zoé');
        await openSection(page, SECTION.account);
        await page.click('#change-password-card');
        for (const field of ['#cpCurrentPassword', '#cpNewPassword', '#cpConfirmPassword']) await expect(page.locator(field)).toBeVisible();
        await page.click('#cpCancelBtn');
        await expect(page.locator('#changePasswordModal')).toBeHidden();
        await page.click('#two-factor-card');
        await expect(page.locator('#twoFactorModal, .two-factor-modal').first()).toBeVisible();
    });

    test('app passwords card and its deep link', covers('set.app-passwords-card'), async ({ page }) => {
        await openSection(page, SECTION.account);
        await expect(page.locator('#app-passwords-status-badge')).toHaveText('None');
        await page.click('#app-passwords-card');
        await expect(page.locator('#appPasswordsModal, .app-passwords-modal').first()).toBeVisible();
        await page.goto('/settings.php?open=app-passwords');
        await expect(page.locator('#appPasswordsModal, .app-passwords-modal').first(), 'deep link').toBeVisible();
    });

    test('diary format and date format: a new entry follows them', covers('set.diary-type', 'set.diary-date-format'), async ({ page }) => {
        await openSection(page, SECTION.diary);
        await expect(page.locator('#diary-note-type-select')).toHaveValue('html');
        await page.locator('#diary-note-type-select').selectOption('markdown');
        await expectStored(api, 'diary_default_note_type', 'markdown');
        await page.click('#diary-date-format-card');
        const modal = page.locator('#diaryDateFormatModal');
        await expect(modal).toBeVisible();
        expect(await modal.locator('input[name="diaryDateFormat"]').evaluateAll((all) => all.map((r) => r.value))).toEqual(['ymd', 'dmy_slash', 'mdy_slash', 'dmy_dot', 'ymd_slash', 'long', 'custom']);
        await modal.locator('input[value="custom"]').check();
        await page.locator('#diaryDateFormatCustomInput').fill('MM only');
        await page.click('#saveDiaryDateFormatModalBtn');
        expect(await answerDialog(page), 'year, month and day are required').toContain('valid custom format');
        await modal.locator('input[value="dmy_dot"]').check();
        await page.click('#saveDiaryDateFormatModalBtn');
        await expect(modal).toBeHidden();
        await expectStored(api, 'diary_date_format', 'dmy_dot');
        await expect(page.locator('#diary-date-format-card .setting-status')).toHaveText('DD.MM.YYYY');
        await page.goto('/index.php');
        await settled(page);
        await page.click('#sidebarCreateBtn');
        await page.locator('#create-menu .create-note-option[data-type="diary"]').click();
        await page.waitForURL(/note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        const entry = await api.getNote(id);
        expect(entry.type, 'type of the diary entry').toBe('markdown');
        expect(entry.heading, 'title of the diary entry').toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    });

    test('diary template: "None" plus the template notes, the entry starts from it', covers('set.diary-template'), async ({ page }) => {
        const workspace = (await api.ok(api.get('/workspaces'))).json.workspaces[0].name;
        const templates = (await api.ok(api.post('/folders', { folder_name: 'Templates', workspace }))).json.folder;
        const template = await api.createNote({ heading: 'Mon modèle', content: 'Ligne de modèle é\n', type: 'markdown' });
        await api.ok(api.post(`/notes/${template.id}/folder`, { folder_id: templates.id }));
        await api.ok(api.put('/settings/diary_default_note_type', { value: 'markdown' }));
        await openSection(page, SECTION.diary);
        const select = page.locator('#diary-template-select');
        await expect(select.locator(`option[value="${template.id}"]`)).toHaveText('Mon modèle');
        await select.selectOption(String(template.id));
        await expect.poll(async () => JSON.parse(await stored(api, 'diary_templates') || '{}')).toEqual(expect.objectContaining({}));
        const saved = JSON.parse(await stored(api, 'diary_templates'));
        expect(Object.values(saved)).toEqual([template.id]);
        await page.reload();
        await expect(select, 'after a reload').toHaveValue(String(template.id));
        await select.selectOption('');
        await expect.poll(async () => stored(api, 'diary_templates')).toBeFalsy();
    });

    test('new note shortcut type, the row of the shortcuts dialog', covers('set.new-note-shortcut-type'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Raccourci', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.click('#pageMoreMenuBtn');
        await page.click('#edgeMenuShortcuts');
        await expect(page.locator('#keyboardShortcutsModal')).toBeVisible();
        await page.locator('#newNoteShortcutType').selectOption('note');
        await expectStored(api, 'new_note_shortcut_type', 'note');
    });

    test('delete account: asks for the password and the name, then the account is gone', covers('set.delete-account'), async ({ page, playwright }) => {
        const doomed = await newAccount(playwright, 'adieu');
        await page.context().clearCookies();
        await login(page, doomed);
        await openSection(page, SECTION.account);
        await page.click('#delete-account-card');
        await expect(page.locator('#deleteAccountModal')).toBeVisible();
        await expect(page.locator('#daDeleteBtn'), 'locked until both are filled').toBeDisabled();
        await page.click('#daCancelBtn');
        await expect(page.locator('#deleteAccountModal')).toBeHidden();
        await page.click('#delete-account-card');
        await page.locator('#daPassword').fill(doomed.password);
        await page.locator('#daConfirmUsername').fill(doomed.username);
        await expect(page.locator('#daDeleteBtn')).toBeEnabled();
        await page.click('#daDeleteBtn');
        await page.waitForURL(/login\.php/);
        await page.fill('#username', doomed.username);
        await page.fill('#password', doomed.password);
        await page.click('button.login-button');
        await expect(page).toHaveURL(/login\.php/);
    });
});

// ---------------------------------------------------------------------------
test.describe('what\'s new and updates', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'news');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const RELEASES = { show: true, current_version: '9.9.9', more: 0, releases: [
        { version: '9.9.9', date: '2026-10-30', url: 'https://github.com/timothepoznanski/poznote/releases/tag/9.9.9', body: '✨ Nouveauté été', html: '<p>✨ Nouveauté été</p>' },
        { version: '9.9.8', date: '2026-10-01', url: 'https://github.com/timothepoznanski/poznote/releases/tag/9.9.8', body: '🐛 Correction', html: '<p>🐛 Correction</p>' },
    ] };

    // GitHub is not reachable from a test: its answer is what is simulated, by route
    test('the popup shows after an update, keeps the versions apart, is saved as a note, and is recorded as seen', covers('set.whats-new-popup'), async ({ page }) => {
        await api.ok(api.put('/settings/whats_new_seen_version', { value: '0.0.1' }));
        await page.route('**/api/v1/system/whats-new*', (route) => (route.request().url().includes('/seen') ? route.fallback() : route.fulfill({ json: RELEASES })));
        await page.goto('/index.php');
        const modal = page.locator('#whatsNewModal');
        await expect(modal).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#whatsNewSubtitle')).toContainText('9.9.9');
        await expect(page.locator('#whatsNewBody')).toContainText('Nouveauté été');
        await expect(page.locator('#whatsNewVersions .whats-new-version')).toHaveText(['9.9.9', '9.9.8']);
        await page.locator('#whatsNewVersions .whats-new-version').nth(1).click();
        await expect(page.locator('#whatsNewVersions .whats-new-version').nth(1)).toHaveClass(/is-current/);
        await page.click('#whatsNewSaveNote');
        await expect(page.locator('#whatsNewSaveNote')).toHaveText('Saved in your notes');
        const notes = (await api.ok(api.get('/notes'))).json.notes;
        expect(notes.map((note) => note.heading)).toContain("What's new in Poznote 9.9.9");
        const seen = page.waitForRequest((request) => request.url().includes('/whats-new/seen'));
        await page.click('#whatsNewClose');
        await seen;
        await expect(modal).toBeHidden();
        await expect.poll(() => stored(api, 'whats_new_seen_version'), 'recorded').not.toBe('0.0.1');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('body')).not.toHaveAttribute('data-whats-new', '1');
    });

    test('"do not show this" in the popup turns it off, and a phone never gets it', covers('set.whats-new-never'), async ({ page }) => {
        await api.ok(api.put('/settings/whats_new_seen_version', { value: '0.0.1' }));
        await page.route('**/api/v1/system/whats-new', (route) => route.fulfill({ json: RELEASES }));
        await page.setViewportSize({ width: 400, height: 800 });
        await page.goto('/index.php');
        await page.waitForTimeout(1700);
        await expect(page.locator('#whatsNewModal'), 'not on a phone').toBeHidden();
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto('/index.php');
        await expect(page.locator('#whatsNewModal')).toBeVisible({ timeout: 10_000 });
        await page.locator('#whatsNewNever').check();
        await page.keyboard.press('Escape');
        await expect(page.locator('#whatsNewModal')).toBeHidden();
        await expectStored(api, 'whats_new_popup', '0');
        await api.ok(api.put('/settings/whats_new_popup', { value: '1' }));
    });

    test('version card: checks, says when up to date or names the new version, Close', covers('set.check-updates'), async ({ page }) => {
        const version = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'version.txt'), 'utf8').trim();
        await openSection(page, SECTION.about);
        await expect(page.locator('#check-updates-card .setting-status')).toHaveText(version);
        let answer = { has_updates: true, current_version: version, remote_version: '99.0.0' };
        await page.route('**/api/v1/system/updates', (route) => route.fulfill({ json: answer }));
        await page.click('#check-updates-card');
        await expect(page.locator('#updateModal')).toBeVisible();
        await expect(page.locator('#updateModal h3')).toContainText(/new update/i);
        await expect(page.locator('#availableVersion')).toHaveText('99.0.0');
        await page.locator('#updateModal [data-action="close-update-modal"]').click();
        await expect(page.locator('#updateModal')).toBeHidden();
        answer = { has_updates: false, current_version: version, remote_version: version };
        await page.click('#check-updates-card');
        await expect(page.locator('#updateModal')).toBeVisible();
        await expect(page.locator('#currentVersion')).toHaveText(version);
        await expect(page.locator('#availableVersion')).toHaveText(version);
        await expect(page.locator('#updateModal h3')).toContainText(/up to date/i);
        await page.locator('#updateModal [data-action="close-update-modal"]').click();
        answer = { error: 'GitHub is out of reach', current_version: version };
        await page.click('#check-updates-card');
        await expect(page.locator('#updateModal')).toBeVisible();
        await expect(page.locator('#updateModal h3'), 'no false claim when the check fails').not.toContainText(/up to date/i);
        await expect(page.locator('#availableVersion')).toHaveText('');
        await page.locator('#updateModal [data-action="close-update-modal"]').click();
        const real = await api.get('/system/updates');
        expect(real.status, 'the endpoint itself answers').toBeLessThan(500);
    });
});

// ---------------------------------------------------------------------------
test.describe('start guide', () => {
    let account; let api;
    test.beforeEach(async ({ playwright, page }) => {
        account = await newAccount(playwright, 'bienvenue');
        api = await Api.open(playwright, account);
        await page.context().clearCookies();
        await page.goto('/login.php');
        await page.fill('#username', account.username);
        await page.fill('#password', account.password);
        await page.click('button.login-button');
        await page.waitForURL(/welcome\.php/);
    });
    test.afterEach(async () => { await api.dispose(); });

    test('a new account lands on the guide; language popup, previews, then every choice is stored', covers('set.welcome'), async ({ page, playwright }) => {
        const overlay = page.locator('#welcomeLanguageOverlay');
        await expect(overlay).toBeVisible();
        expect(await overlay.locator('.welcome-lang-choice').count(), 'one button per language').toBe(10);
        await overlay.locator('.welcome-lang-choice[data-welcome-lang="fr"]').click();
        await expect(overlay).toBeHidden();
        await expect(page.locator('#welcomeLanguage')).toHaveValue('fr');
        await expect(page.locator('#welcomeStartBtn'), 'previewed in French').not.toHaveText('Get started');
        await page.locator('#welcomeTheme').selectOption('dark');
        await expect(page.locator('html'), 'theme previewed').toHaveAttribute('data-theme', 'dark');
        await page.locator('#welcomeDateFormat').selectOption('dmy_hi');
        await page.locator('#welcomeTimezone').selectOption('Asia/Tokyo');
        await page.locator('#welcomeUsername').fill(`${account.username}-ete`);
        await page.click('#welcomeStartBtn');
        await page.waitForURL(/index\.php/);
        const renamed = await Api.open(playwright, { ...account, username: `${account.username}-ete` });
        await expect.poll(() => stored(renamed, 'welcome_setup')).toBe('done');
        expect(await stored(renamed, 'language')).toBe('fr');
        expect(await stored(renamed, 'date_time_format')).toBe('dmy_hi');
        expect(await stored(renamed, 'timezone')).toBe('Asia/Tokyo');
        await renamed.dispose();
        expect(await page.evaluate(() => window.__poznoteThemeStorage.get())).toBe('dark');
        await page.goto('/welcome.php');
        await expect(page, 'the guide shows only once').toHaveURL(/index\.php/);
    });

    test('the guide refuses passwords that differ, and does not leave', covers('set.welcome-errors'), async ({ page }) => {
        await page.locator('#welcomeLanguageOverlay .welcome-lang-choice').first().click();
        await page.locator('#welcomeNewPassword').fill('Nouveau-Mot-2026');
        await page.locator('#welcomeConfirmPassword').fill('Autre-Mot-2026');
        await page.click('#welcomeStartBtn');
        await expect(page.locator('#welcomeError')).toBeVisible();
        await expect(page).toHaveURL(/welcome\.php/);
        expect(await stored(api, 'welcome_setup')).toBe('pending');
    });
});

// ---------------------------------------------------------------------------
test.describe('instance cards', () => {
    let admin; let member; let memberApi;
    test.beforeAll(async ({ playwright }) => {
        admin = await Api.open(playwright, ADMIN);
        member = await newAccount(playwright, 'inst');
        memberApi = await Api.open(playwright, member);
    });
    test.afterAll(async () => { await admin.dispose(); await memberApi.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });
    const asMember = async (browser, page, run) => {
        const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'block' });
        const other = await context.newPage();
        try {
            await login(other, member);
            await run(other);
        } finally {
            await context.close();
        }
    };

    test('API REST card: opens the dialog, Swagger page loads, Close', covers('set.api-rest'), async ({ page }) => {
        await openSection(page, SECTION.about);
        await page.click('#api-rest-card');
        await expect(page.locator('#apiRestModal')).toBeVisible();
        await page.click('#closeApiRestModalBtn');
        await expect(page.locator('#apiRestModal')).toBeHidden();
        await page.click('#api-rest-card');
        await page.click('#openSwaggerApiBtn');
        await page.waitForURL(/api-docs/);
        await expect(page.locator('.swagger-ui .info .title, #swagger-ui .title').first()).toBeVisible({ timeout: 15_000 });
    });

    test('the Users column hides an element for everyone but the admins', covers('set.ui-global'), async ({ page, browser }) => {
        const key = 'card:iconSidebarTrashBtn';
        try {
            await openSection(page, SECTION.visibility);
            const box = page.locator(`#uiCustomizationSettings input[data-ui-global-key="${key}"]`);
            await expect(page.locator('#uiCustomizationSettings input[data-ui-key="card:my-profile-card"]')).toBeAttached();
            await box.evaluate((input) => input.click());
            await Promise.all([page.waitForEvent('load'), page.click('#saveUiCustomizationBtn')]);
            expect(JSON.parse(await stored(admin, 'hidden_ui_elements_global'))).toContain(key);
            await expect(page.locator('#iconSidebarTrashBtn'), 'admins keep it').toBeVisible();
            await asMember(browser, page, async (other) => {
                await other.goto('/settings.php');
                await expect(other.locator('#iconSidebarTrashBtn'), 'gone for a user').toBeHidden();
                await other.goto('/index.php');
                await expect(other.locator('#iconSidebarTrashBtn')).toBeHidden();
            });
        } finally {
            await admin.ok(admin.put('/settings/hidden_ui_elements_global', { value: '[]' }));
        }
        await asMember(browser, page, async (other) => {
            await other.goto('/settings.php');
            await expect(other.locator('#iconSidebarTrashBtn'), 'back').toBeVisible();
        });
    });

    test('tenant isolation: a blocked capability leaves the pages of the users', covers('set.tenant-isolation'), async ({ page, browser }) => {
        try {
            await openAdminGroup(page, 'tenant-isolation-card');
            await expect(page.locator('#tenant-isolation-card .setting-status')).toHaveText('Disabled');
            await page.click('#tenant-isolation-card');
            await expect(page.locator('#tenantIsolationModal')).toBeVisible();
            const features = await page.locator('#tenantIsolationModal [data-tenant-feature]').evaluateAll((all) => all.map((box) => box.dataset.tenantFeature));
            expect(features).toEqual(expect.arrayContaining(['user_sharing', 'user_webhooks']));
            await page.locator('#tenantIsolationModal [data-tenant-feature="user_webhooks"]').evaluate((box) => box.click());
            await page.locator('#tenantIsolationModal .btn-primary').click();
            await expect(page.locator('#tenantIsolationModal')).toBeHidden();
            await expect.poll(() => stored(admin, 'tenant_isolation_features')).toContain('user_webhooks');
            await expect(page.locator('#tenant-isolation-card .setting-status')).not.toHaveText('Disabled');
            await asMember(browser, page, async (other) => {
                await other.goto(`/settings.php#section=${SECTION.integrations}`);
                await expect(other.locator('#ai-assistant-user-card')).toBeVisible();
                await expect(other.locator('#user-webhooks-card'), 'blocked').toHaveCount(0);
            });
            expect(JSON.parse(await stored(admin, 'hidden_ui_elements_global')), 'its element goes with it').toContain('card:user-webhooks-card');
            await page.click('#tenant-isolation-card');
            await page.locator('#tenantIsolationModal [data-tenant-feature="user_webhooks"]').evaluate((box) => box.click());
            await page.locator('#tenantIsolationModal .btn-primary').click();
            await expect(page.locator('#tenantIsolationModal')).toBeHidden();
            await expect.poll(async () => JSON.parse(await stored(admin, 'hidden_ui_elements_global') || '[]'), 'unblocked, it comes back').not.toContain('card:user-webhooks-card');
            await asMember(browser, page, async (other) => {
                await other.goto(`/settings.php#section=${SECTION.integrations}`);
                await expect(other.locator('#user-webhooks-card')).toBeVisible();
            });
        } finally {
            await admin.ok(admin.put('/settings/tenant_isolation_features', { value: '' }));
            await admin.ok(admin.put('/settings/tenant_isolation_applied_ui_keys', { value: '[]' }));
            await admin.ok(admin.put('/settings/hidden_ui_elements_global', { value: '[]' }));
        }
    });

    test('Git Sync switch of the instance is what enables the card of the users', covers('set.git-sync-enabled'), async ({ page, browser }) => {
        const start = await stored(admin, 'git_sync_enabled');
        try {
            await openAdminGroup(page, 'git-sync-enabled-card');
            await page.click('#git-sync-enabled-card');
            await expect.poll(() => stored(admin, 'git_sync_enabled')).toBe(start === '1' ? '0' : '1');
            const on = (await stored(admin, 'git_sync_enabled')) === '1';
            await expect(page.locator('#git-sync-enabled-card')).toHaveAttribute('aria-checked', String(on));
            await asMember(browser, page, async (other) => {
                await other.goto(`/settings.php#section=${SECTION.sync}`);
                await expect(other.locator('#git-sync-status-badge')).toHaveText(on ? 'Not configured' : 'Disabled');
            });
        } finally {
            await admin.ok(admin.put('/settings/git_sync_enabled', { value: start || '0' }));
        }
    });

    test('script attachments: off, an .sh is refused; on, it is accepted', covers('set.executable-attachments'), async ({ page }) => {
        const note = await memberApi.createNote({ heading: 'Pièces', content: '<p>x</p>' });
        const upload = () => memberApi.call('POST', `/notes/${note.id}/attachments`, { multipart: { file: { name: 'outil.sh', mimeType: 'text/x-shellscript', buffer: Buffer.from('#!/bin/sh\n') } } });
        expect((await upload()).status, 'refused while off').toBeGreaterThanOrEqual(400);
        try {
            await openAdminGroup(page, 'executable-attachments-card');
            await page.click('#executable-attachments-card');
            await expect(page.locator('#executable-attachments-card')).toHaveAttribute('aria-checked', 'true');
            await expect.poll(() => stored(admin, 'allow_executable_attachments')).toBe('1');
            expect((await upload()).status, 'accepted once on').toBeLessThan(300);
        } finally {
            await admin.ok(admin.put('/settings/allow_executable_attachments', { value: '0' }));
        }
    });

    test('open without login: asks first, cancel keeps it off; on, the instance opens with no form', covers('set.login-disabled'), async ({ page, browser }) => {
        await openAdminGroup(page, 'login-disabled-card');
        await page.click('#login-disabled-card');
        expect(await answerDialog(page, 'Cancel')).toContain('Anyone who can reach');
        expect(await stored(admin, 'login_disabled')).not.toBe('1');
        try {
            await page.click('#login-disabled-card');
            await answerDialog(page, 'Confirm');
            await expect(page.locator('#login-disabled-card')).toHaveAttribute('aria-checked', 'true');
            await expect.poll(() => stored(admin, 'login_disabled')).toBe('1');
            const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'block' });
            const fresh = await context.newPage();
            await fresh.goto('/index.php');
            await expect(fresh, 'no login page').not.toHaveURL(/login\.php/);
            await context.close();
        } finally {
            await admin.ok(admin.put('/settings/login_disabled', { value: '0' }));
        }
    });

    test('import limits and user quotas: the dialogs store, the badges follow, a quota bites', covers('set.import-limits', 'set.user-quotas'), async ({ page }) => {
        try {
            await openAdminGroup(page, 'import-limits-card');
            await page.click('#import-limits-card');
            await page.locator('#importMaxIndividualFilesInput').fill('77');
            await page.locator('#importMaxZipFilesInput').fill('88');
            await page.click('#saveImportLimitsBtn');
            await expect(page.locator('#importLimitsModal')).toBeHidden();
            await expect.poll(() => stored(admin, 'import_max_individual_files')).toBe('77');
            expect(await stored(admin, 'import_max_zip_files')).toBe('88');
            await expect(page.locator('#import-limits-card .setting-status').first()).toContainText('77');
            await openAdminGroup(page, 'user-quotas-card');
            await page.click('#user-quotas-card');
            await expect(page.locator('#userQuotasModal')).toBeVisible();
            const count = (await memberApi.get('/notes')).json.notes.length;
            await page.locator('#userMaxNotesInput').fill(String(count + 1));
            await page.click('#saveUserQuotasBtn');
            await expect(page.locator('#userQuotasModal')).toBeHidden();
            await expect.poll(() => stored(admin, 'user_max_notes')).toBe(String(count + 1));
            await expect(page.locator('#user-quotas-card .setting-status').first()).toContainText(String(count + 1));
            await memberApi.ok(memberApi.post('/notes', { heading: 'Dernière', content: '<p>x</p>' }));
            expect((await memberApi.post('/notes', { heading: 'De trop', content: '<p>x</p>' })).status, 'over the quota').toBeGreaterThanOrEqual(400);
        } finally {
            await admin.ok(admin.put('/settings/import_max_individual_files', { value: '50' }));
            await admin.ok(admin.put('/settings/import_max_zip_files', { value: '300' }));
            await admin.ok(admin.put('/settings/user_max_notes', { value: '0' }));
        }
    });

    test.describe('refused by the server', () => {
        // KNOWN: the browser logs any 4xx as a console error, and here the refusal is the feature
        test.use({ allowedErrors: [/status of 4\d\d/] });

        test('require two-factor: refused while the admin has none of their own', covers('set.two-factor-required'), async ({ page }) => {
            await openAdminGroup(page, 'two-factor-required-card');
            await page.click('#two-factor-required-card');
            await answerDialog(page, 'Confirm');
            expect(await answerDialog(page), 'says why').toContain('your own account first');
            expect(await stored(admin, 'two_factor_required')).not.toBe('1');
            await expect(page.locator('#two-factor-required-card')).toHaveAttribute('aria-checked', 'false');
        });

        test('local network access: hosts are stored, junk refused', covers('set.outbound-hosts'), async ({ page }) => {
            try {
                await openAdminGroup(page, 'outbound-hosts-card');
                await expect(page.locator('#outbound-hosts-card .setting-status')).toHaveText('Public only');
                await page.click('#outbound-hosts-card');
                await page.locator('#outboundHostsInput').fill('pas un hôte !!');
                await page.locator('#outboundHostsModal .btn-primary').click();
                await expect(page.locator('#outboundHostsError')).toBeVisible();
                await page.locator('#outboundHostsInput').fill('ollama.lan\n*.home.arpa');
                await page.locator('#outboundHostsModal .btn-primary').click();
                await expect(page.locator('#outboundHostsModal')).toBeHidden();
                await expect.poll(() => stored(admin, 'outbound_allowed_hosts')).toContain('ollama.lan');
                await expect(page.locator('#outbound-hosts-card .setting-status')).not.toHaveText('Public only');
            } finally {
                await admin.ok(admin.put('/settings/outbound_allowed_hosts', { value: '' }));
            }
        });

    });

    test('statistics API card: generate shows a token that works, revoke kills it', covers('set.statistics-token'), async ({ page, playwright }) => {
        await admin.ok(admin.del('/admin/statistics/token'));
        await openAdminGroup(page, 'statistics-token-card');
        await expect(page.locator('#statistics-token-status')).toHaveText('Disabled');
        await page.click('#statistics-token-card');
        await expect(page.locator('#statisticsTokenModal')).toBeVisible();
        await page.click('#stGenerateBtn');
        await expect(page.locator('#stSecretBox')).toBeVisible();
        const token = (await page.locator('#stSecret').innerText()).trim();
        expect(token.length).toBeGreaterThan(16);
        const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
        const read = () => anonymous.get('/api/v1/public/statistics', { headers: { Authorization: `Bearer ${token}` } });
        expect((await read()).status(), 'token accepted').toBe(200);
        expect((await anonymous.get('/api/v1/public/statistics')).status(), 'no token, no answer').toBeGreaterThanOrEqual(400);
        await page.locator('label.statistics-token-public').click();
        await expect.poll(async () => (await anonymous.get('/api/v1/public/statistics')).status(), 'public mode').toBe(200);
        await page.locator('label.statistics-token-public').click();
        await expect.poll(async () => (await anonymous.get('/api/v1/public/statistics')).status(), 'public mode off').toBeGreaterThanOrEqual(400);
        await page.click('#stRevokeBtn');
        await page.click('#stRevokeBtn');
        await expect.poll(async () => (await read()).status(), 'revoked').toBeGreaterThanOrEqual(400);
        await anonymous.dispose();
    });

    test('maintenance: rebuild the master database and scan for orphan attachments', covers('set.maintenance'), async ({ page }) => {
        await openAdminGroup(page, 'disaster-recovery-card');
        await page.click('#disaster-recovery-card');
        await expect(page.locator('#disasterRecoveryModal')).toBeVisible();
        await page.click('#disasterRecoveryRunBtn');
        await expect(page.locator('#disasterRecoveryResult')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('#disasterRecoveryResult')).not.toHaveClass(/error/);
        await page.locator('#disasterRecoveryModal .btn-cancel').click();
        await page.click('#orphan-scanner-card');
        await page.click('#orphanScannerScanBtn');
        await expect(page.locator('#orphanScannerStatus, #orphanScannerResults').first()).toBeVisible({ timeout: 20_000 });
        await page.locator('#orphanScannerModal .btn-cancel').click();
    });

    test('shared workspace emails: the row appears once SMTP is configured, and needs an address', covers('set.workspace-emails'), async ({ page, browser }) => {
        await asMember(browser, page, async (other) => {
            await other.goto(`/settings.php#section=${SECTION.workspaces}`);
            await expect(other.locator('#workspace-activity-emails-card'), 'no email, no row').toHaveCount(0);
        });
        try {
            for (const [key, value] of [['smtp_host', '127.0.0.1'], ['smtp_from_email', 'poznote@example.com'], ['smtp_enabled', '1']]) await admin.ok(admin.put(`/settings/${key}`, { value }));
            await asMember(browser, page, async (other) => {
                await other.goto(`/settings.php#section=${SECTION.workspaces}`);
                await expect(other.locator('#workspace-activity-emails-card'), 'no address on the account').toHaveClass(/home-card-disabled/);
                await expect(other.locator('#workspace-activity-emails-select')).toBeDisabled();
            });
            await openSection(page, SECTION.workspaces);
            await expect(page.locator('#workspace-activity-emails-card')).toBeVisible();
        } finally {
            for (const key of ['smtp_host', 'smtp_from_email', 'smtp_enabled']) await admin.ok(admin.put(`/settings/${key}`, { value: '' }));
        }
    });
});
