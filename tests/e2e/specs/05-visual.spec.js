// Screenshots compared to the reference of this machine (.visual-reference/,
// see README.md). Runs last, on its own account, so that its content is the
// same on every run; what changes by itself is masked.
const { test, expect, Api, KITCHEN_MD, KITCHEN_HTML, PNG, newAccount, login, settled: settled_ } = require('../lib/helpers');

// Dates, times and counters that follow the clock
const VOLATILE = ['.note-subline', '.note-dates', '.mini-calendar', '.sidebar-mini-calendar', '[data-date]', 'time', '.version-number', '.update-badge', '.diary-date', '.stat-value', '.attention-badge'];

const THEMES = ['light', 'dark'];
let account; let ids = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
    // A fixed name: the settings pages show it
    account = await newAccount(playwright, 'visual-check', true);
    const api = await Api.open(playwright, account);
    const folder = (await api.ok(api.post('/folders', { folder_name: 'Projet' }))).json.folder;
    ids.html = (await api.createNote({ heading: 'Référence riche', content: KITCHEN_HTML, type: 'note' })).id;
    ids.md = (await api.createNote({ heading: 'Référence Markdown', content: KITCHEN_MD, type: 'markdown' })).id;
    ids.tasks = (await api.createNote({ heading: 'Liste de tâches', type: 'tasklist', content: '[]' })).id;
    for (const text of ['Première tâche', 'Deuxième tâche']) await api.ok(api.post(`/notes/${ids.tasks}/tasks`, { text }));
    await api.ok(api.post(`/notes/${ids.md}/folder`, { folder_id: folder.id }));
    await api.ok(api.put(`/notes/${ids.md}/tags`, { tags: ['alpha', 'beta'] }));
    await api.ok(api.post(`/notes/${ids.html}/favorite`));
    await api.ok(api.call('POST', `/notes/${ids.html}/attachments`, { multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PNG } } }));
    await api.dispose();
});

async function settle(page) {
    await settled_(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
}

async function shoot(page, name) {
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: VOLATILE.map((selector) => page.locator(selector)), timeout: 15_000 });
}

for (const theme of THEMES) {
    test.describe(`${theme} theme @visual`, () => {
        test.beforeEach(async ({ page }) => {
            await page.clock.setFixedTime(new Date('2026-06-15T10:00:00Z'));
            await page.addInitScript((value) => { window.__poznoteForcedTheme = value; }, theme);
        });

        test(`login page ${theme} @visual`, async ({ page }) => {
            await page.goto('/login.php');
            await settle(page);
            await shoot(page, `login-${theme}`);
        });

        for (const [name, key] of [['rich-note', 'html'], ['markdown-note', 'md'], ['task-list', 'tasks']]) {
            test(`${name} ${theme} @visual`, async ({ page }) => {
                await page.setViewportSize({ width: 1400, height: 2600 });
                await login(page, account);
                await page.goto(`/index.php?note=${ids[key]}`);
                await settle(page);
                if (key === 'md') await expect(page.locator('.mermaid svg, svg[id*="mermaid"]').first()).toBeVisible({ timeout: 15_000 });
                await settle(page);
                await shoot(page, `${name}-${theme}`);
            });
        }

        for (const name of ['settings', 'tasks', 'favorites', 'trash', 'attachments_list', 'backup_export', 'restore_import', 'workspaces', 'dashboard']) {
            test(`${name} page ${theme} @visual`, async ({ page }) => {
                await login(page, account);
                await page.goto(`/${name}.php`);
                await settle(page);
                await shoot(page, `${name}-${theme}`);
            });
        }
    });
}

test.describe('phone @visual', () => {
    test.beforeEach(async ({ page }) => {
        await page.clock.setFixedTime(new Date('2026-06-15T10:00:00Z'));
        await page.setViewportSize({ width: 390, height: 844 });
    });

    for (const [name, key] of [['rich-note', 'html'], ['markdown-note', 'md']]) {
        test(`${name} on a phone @visual`, async ({ page }) => {
            await login(page, account);
            await page.goto(`/index.php?note=${ids[key]}`);
            await settle(page);
            await shoot(page, `phone-${name}`);
        });
    }
});
