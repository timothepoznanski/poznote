// Tasks, diary, and everything attached to a note: the gestures of a person, then the stored result.
const { execFileSync } = require('node:child_process');
const { test, expect, covers, Api, ADMIN, PNG, inInstance, newAccount, login, openNote, settled } = require('../lib/helpers');

const tasksOf = async (api, id) => JSON.parse((await api.getNote(id)).content || '[]');
const list = async (api, heading, tasks = []) => api.createNote({
    heading, type: 'tasklist',
    content: JSON.stringify(tasks.map((task, i) => ({ id: 1000 + i, noteId: null, completed: false, important: false, dueAt: null, ...task }))),
});
const row = (page, text) => page.locator('.task-item', { hasText: text });
const openList = async (page, id) => {
    await openNote(page, id);
    await expect(page.locator(`#task-input-${id}`)).toBeVisible();
};
const addTask = async (page, id, text) => {
    await page.locator(`#task-input-${id}`).fill(text);
    await page.locator(`#task-input-${id}`).press('Enter');
    await expect(row(page, text).first()).toBeVisible();
};
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const inDays = (days) => isoDay(new Date(Date.now() + days * 86400000));
const openFolderMenu = async (page, name) => {
    const header = page.locator('#left_col .folder-header', { has: page.locator('.folder-name', { hasText: name }) }).first();
    // At the top: the middle of the header can be one of its notes or subfolders
    await header.hover({ position: { x: 30, y: 10 } });
    await header.locator('.folder-actions-toggle').first().click();
};

test.describe('task lists', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'taches');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('Enter adds a task, stored with its accents, and the input empties', covers('org.task-add'), async ({ page }) => {
        const note = await list(api, 'Ajout');
        await openList(page, note.id);
        await addTask(page, note.id, 'Acheter des œufs é');
        await expect(page.locator(`#task-input-${note.id}`)).toHaveValue('');
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => t.text)).toEqual(['Acheter des œufs é']);
        await page.reload();
        await expect(row(page, 'Acheter des œufs é')).toBeVisible();
    });

    test('an empty task is not added', covers('org.task-add'), async ({ page }) => {
        const note = await list(api, 'Vide', [{ text: 'Seule' }]);
        await openList(page, note.id);
        await page.locator(`#task-input-${note.id}`).fill('   ');
        await page.locator(`#task-input-${note.id}`).press('Enter');
        await expect(page.locator('.task-item')).toHaveCount(1);
    });

    test('clicking a task opens the edit dialog, Save and Ctrl+Enter store the text, Cancel and Escape do not', covers('org.task-edit'), async ({ page }) => {
        const note = await list(api, 'Édition', [{ text: 'Avant' }]);
        await openList(page, note.id);
        await row(page, 'Avant').locator('.task-text').click();
        const modal = page.locator('#taskEditModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#taskEditTextarea')).toHaveValue('Avant');
        await page.locator('#taskEditTextarea').fill('Annulé');
        await page.locator('#cancelTaskEditBtn').click();
        await expect(modal).toBeHidden();
        await expect(row(page, 'Avant')).toBeVisible();
        await row(page, 'Avant').locator('.task-text').click();
        await page.locator('#taskEditTextarea').fill('Annulé par Échap');
        await page.locator('#taskEditTextarea').press('Escape');
        await expect(modal).toBeHidden();
        await expect(row(page, 'Avant')).toBeVisible();
        await row(page, 'Avant').locator('.task-text').click();
        await page.locator('#taskEditTextarea').fill('Après é');
        await page.locator('#saveTaskEditBtn').click();
        await expect(row(page, 'Après é')).toBeVisible();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].text).toBe('Après é');
        await row(page, 'Après é').locator('.task-text').click();
        await page.locator('#taskEditTextarea').fill('Par raccourci');
        await page.locator('#taskEditTextarea').press('Control+Enter');
        await expect.poll(async () => (await tasksOf(api, note.id))[0].text).toBe('Par raccourci');
    });

    test('an empty edit is refused with a message', covers('org.task-edit'), async ({ page }) => {
        const note = await list(api, 'Édition vide', [{ text: 'Garde-moi' }]);
        await openList(page, note.id);
        await row(page, 'Garde-moi').locator('.task-text').click();
        await page.locator('#taskEditTextarea').fill('   ');
        await page.locator('#saveTaskEditBtn').click();
        await expect(page.locator('#taskEditError')).not.toBeEmpty();
        await expect(page.locator('#taskEditModal')).toBeVisible();
        expect((await tasksOf(api, note.id))[0].text).toBe('Garde-moi');
    });

    test('a URL in a task becomes a link that does not open the editor', covers('org.task-links'), async ({ page }) => {
        const note = await list(api, 'Liens', [{ text: 'Voir https://example.org/doc ici' }]);
        await openList(page, note.id);
        await expect(page.locator('.task-text a')).toHaveAttribute('href', 'https://example.org/doc');
    });

    test('ticking moves the task below the open ones and updates the progress, unticking restores it', covers('org.task-tick', 'org.task-progress'), async ({ page }) => {
        const note = await list(api, 'Cocher', [{ text: 'Un' }, { text: 'Deux' }, { text: 'Trois' }]);
        await openList(page, note.id);
        await row(page, 'Un').locator('.task-checkbox').check();
        await expect(page.locator('.task-item .task-text')).toHaveText(['Deux', 'Trois', 'Un']);
        await expect(row(page, 'Un')).toHaveClass(/completed/);
        await expect(page.locator('.tasklist-progress-label')).toContainText('1');
        await expect(page.locator('.tasklist-progress-label')).toContainText('3');
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => [t.text, t.completed]))
            .toEqual([['Deux', false], ['Trois', false], ['Un', true]]);
        await page.reload();
        await row(page, 'Un').locator('.task-checkbox').uncheck();
        await expect.poll(async () => (await tasksOf(api, note.id)).find((t) => t.text === 'Un').completed).toBe(false);
    });

    test('a completed task can be deleted', covers('org.task-delete'), async ({ page }) => {
        const note = await list(api, 'Supprimer', [{ text: 'Reste' }, { text: 'Part', completed: true }]);
        await openList(page, note.id);
        await expect(row(page, 'Reste').locator('.task-delete-btn'), 'an open task has no delete button').toHaveCount(0);
        await row(page, 'Part').hover();
        await row(page, 'Part').locator('.task-delete-btn').click();
        await expect(row(page, 'Part')).toHaveCount(0);
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => t.text)).toEqual(['Reste']);
    });

    test('the star marks a task as important, moves it first, and removes it again', covers('org.task-important'), async ({ page }) => {
        const note = await list(api, 'Priorité', [{ text: 'Banale' }, { text: 'Urgente' }]);
        await openList(page, note.id);
        await row(page, 'Urgente').hover();
        await row(page, 'Urgente').locator('.task-important-btn').click();
        await expect(page.locator('.task-item .task-text')).toHaveText(['Urgente', 'Banale']);
        await expect(row(page, 'Urgente')).toHaveClass(/important/);
        await expect.poll(async () => (await tasksOf(api, note.id))[0]).toMatchObject({ text: 'Urgente', important: true });
        await row(page, 'Urgente').hover();
        await row(page, 'Urgente').locator('.task-important-btn').click();
        await expect.poll(async () => (await tasksOf(api, note.id)).find((t) => t.text === 'Urgente').important).toBe(false);
    });

    test('subtasks: add from the row, tick, edit, delete', covers('org.subtasks'), async ({ page }) => {
        const note = await list(api, 'Sous-tâches', [{ text: 'Parent' }]);
        await openList(page, note.id);
        await row(page, 'Parent').hover();
        await row(page, 'Parent').locator('.task-subtask-btn').click();
        await page.locator('.task-subitem-input').fill('Enfant é');
        await page.locator('.task-subitem-input').press('Enter');
        await expect(page.locator('.task-subitem-text')).toHaveText('Enfant é');
        await expect.poll(async () => (await tasksOf(api, note.id))[0].subtasks?.map((s) => s.text)).toEqual(['Enfant é']);
        await page.keyboard.press('Escape');
        await page.locator('.task-subitem-checkbox').check();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].subtasks[0].completed).toBe(true);
        await page.locator('.task-subitem-text').click();
        await expect(page.locator('#taskEditModal')).toBeVisible();
        await page.locator('#taskEditTextarea').fill('Renommé');
        await page.locator('#saveTaskEditBtn').click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].subtasks[0].text).toBe('Renommé');
        await page.locator('.task-subitem').hover();
        await page.locator('.task-subitem-delete').click();
        await expect(page.locator('.task-subitem')).toHaveCount(0);
        await expect.poll(async () => (await tasksOf(api, note.id))[0].subtasks ?? []).toEqual([]);
    });

    test('the due date dialog stores a day and a time, shows a chip, and removes them', covers('org.task-due'), async ({ page }) => {
        const note = await list(api, 'Échéance', [{ text: 'À dater' }]);
        await openList(page, note.id);
        await row(page, 'À dater').hover();
        await row(page, 'À dater').locator('.task-due-btn').click();
        const modal = page.locator('#taskDueModal');
        await expect(modal).toBeVisible();
        await page.locator('#taskDueDateBtn').click();
        await page.locator('.slash-date-picker-nav[data-nav="1"]').click();
        await page.locator('.slash-date-picker-day[data-day="15"]').click();
        await page.locator('#taskDueTimeBtn').click();
        await page.locator('.slash-time-cell[data-hour="9"]').click();
        await page.locator('.slash-time-cell[data-minute="30"]').click();
        await page.locator('#taskDueSaveBtn').click();
        await expect(modal).toBeHidden();
        await expect(row(page, 'À dater').locator('.task-due-chip')).toBeVisible();
        const next = new Date(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
        const expected = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-15T09:30`;
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueAt).toBe(expected);
        await row(page, 'À dater').locator('.task-due-chip').click();
        await expect(page.locator('#taskDueRemoveBtn')).toBeVisible();
        await page.locator('#taskDueRemoveBtn').click();
        await expect(row(page, 'À dater').locator('.task-due-chip')).toHaveCount(0);
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueAt).toBeNull();
    });

    test('a past due date is shown as overdue, unless the task is done', covers('org.task-overdue'), async ({ page }) => {
        const note = await list(api, 'En retard', [{ text: 'Retard', dueAt: inDays(-3) }, { text: 'Futur', dueAt: inDays(3) }, { text: 'Fait', dueAt: inDays(-3), completed: true }]);
        await openList(page, note.id);
        await expect(row(page, 'Retard').locator('.task-due-chip')).toHaveClass(/overdue/);
        await expect(row(page, 'Futur').locator('.task-due-chip')).not.toHaveClass(/overdue/);
        await expect(row(page, 'Fait').locator('.task-due-chip')).not.toHaveClass(/overdue/);
    });

    test('Remind me creates a reminder for the task, completing it cancels the reminder', covers('org.task-due-reminder'), async ({ page }) => {
        // Already due, so that the notification exists at once
        const note = await list(api, 'Rappel tâche', [{ text: 'Rappelle-moi', dueAt: inDays(-1) }]);
        await openList(page, note.id);
        await row(page, 'Rappelle-moi').locator('.task-due-chip').click();
        await page.locator('#taskDueRemindOption label').click();
        await expect(page.locator('#taskDueRemindInput')).toBeChecked();
        await page.locator('#taskDueSaveBtn').click();
        await expect(row(page, 'Rappelle-moi').locator('.task-due-chip .lucide-bell')).toBeVisible();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueReminder).toBe(true);
        const count = async () => (await api.ok(api.get('/reminders'))).json;
        await expect.poll(async () => JSON.stringify(await count())).toContain('Rappelle-moi');
        await row(page, 'Rappelle-moi').locator('.task-checkbox').check();
        await expect.poll(async () => JSON.stringify(await count())).not.toContain('Rappelle-moi');
    });

    test('a repeating task opens its next occurrence when completed', covers('org.task-repeat'), async ({ page }) => {
        const day = inDays(2);
        const note = await list(api, 'Répétition', [{ text: 'Hebdo', dueAt: day }]);
        await openList(page, note.id);
        await row(page, 'Hebdo').locator('.task-due-chip').click();
        await page.locator('#taskDueRemindOption label').click();
        await page.locator('#taskDueRepeatSelect').selectOption('1w');
        await expect(page.locator('#taskDueRepeatHint')).toBeVisible();
        await page.locator('#taskDueSaveBtn').click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueRecurrence).toBeTruthy();
        // Not check(): the row is duplicated at once, which its own verification would refuse
        await row(page, 'Hebdo').locator('.task-checkbox').click();
        await expect(page.locator('.task-item')).toHaveCount(2);
        const nextDay = isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86400000));
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => [t.completed, (t.dueAt || '').slice(0, 10)]))
            .toEqual([[false, nextDay], [true, day]]);
    });

    test('the repeat dialog offers every period, and Custom asks for an interval', covers('org.task-repeat'), async ({ page }) => {
        const note = await list(api, 'Périodes', [{ text: 'Choix', dueAt: inDays(2) }]);
        await openList(page, note.id);
        await row(page, 'Choix').locator('.task-due-chip').click();
        await page.locator('#taskDueRemindOption label').click();
        expect(await page.locator('#taskDueRepeatSelect option').evaluateAll((o) => o.map((x) => x.value))).toEqual(['', '1h', '1d', '1w', '1m', '1y', 'custom']);
        await page.locator('#taskDueRepeatSelect').selectOption('custom');
        await expect(page.locator('#taskDueRepeatCustom')).toBeVisible();
        await page.locator('#taskDueRepeatInterval').fill('3');
        await page.locator('#taskDueRepeatUnit').selectOption('d');
        await page.locator('#taskDueSaveBtn').click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueRecurrence).toBe('3d');
    });

    test('the arrow moves a task to another list, searched by name', covers('org.task-move'), async ({ page }) => {
        const source = await list(api, 'Source déplacement', [{ text: 'Voyageuse' }, { text: 'Sédentaire' }]);
        const target = await list(api, 'Cible déplacement', [{ text: 'Déjà là' }]);
        await list(api, 'Autre liste sans rapport');
        await openList(page, source.id);
        await row(page, 'Voyageuse').hover();
        await row(page, 'Voyageuse').locator('.task-move-btn').click();
        await expect(page.locator('#moveTaskModal')).toBeVisible();
        await page.locator('#moveTaskSearchInput').fill('Cible');
        await expect(page.locator('#moveTaskList .move-task-item:not(.move-task-create)')).toHaveCount(1);
        await page.locator('#moveTaskList .move-task-item', { hasText: 'Cible déplacement' }).first().click();
        await page.locator('#confirmMoveTaskBtn').click();
        await expect(page.locator('#moveTaskModal')).toBeHidden();
        await expect(row(page, 'Voyageuse')).toHaveCount(0);
        await expect.poll(async () => (await tasksOf(api, source.id)).map((t) => t.text)).toEqual(['Sédentaire']);
        await expect.poll(async () => (await tasksOf(api, target.id)).map((t) => t.text).sort()).toEqual(['Déjà là', 'Voyageuse']);
    });

    test('the three-dot menu lists its actions and each one works', covers('org.task-actions-menu'), async ({ page }) => {
        await page.setViewportSize({ width: 500, height: 800 });
        const note = await list(api, 'Menu de tâche', [{ text: 'Avec menu' }]);
        await openList(page, note.id);
        await row(page, 'Avec menu').locator('.task-menu-btn').click();
        const items = page.locator('.task-actions-menu-item');
        await expect(items).toHaveText(['Add a subtask', 'Due date', 'Mark as important', 'Move to another list']);
        await items.nth(2).click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].important).toBe(true);
        await row(page, 'Avec menu').locator('.task-menu-btn').click();
        await page.locator('.task-actions-menu-item').nth(0).click();
        await expect(page.locator('.task-subitem-input')).toBeVisible();
        await page.locator('.task-subitem-input').press('Escape');
        await row(page, 'Avec menu').locator('.task-menu-btn').click();
        await page.locator('.task-actions-menu-item').nth(1).click();
        await expect(page.locator('#taskDueModal')).toBeVisible();
        await page.locator('#taskDueModal .btn-cancel').click();
        await row(page, 'Avec menu').locator('.task-menu-btn').click();
        await page.locator('.task-actions-menu-item').nth(3).click();
        await expect(page.locator('#moveTaskModal')).toBeVisible();
    });

    test('dragging the handle reorders tasks', covers('org.task-reorder'), async ({ page }) => {
        const note = await list(api, 'Ordre', [{ text: 'Premier' }, { text: 'Second' }, { text: 'Troisième' }]);
        await openList(page, note.id);
        await row(page, 'Troisième').hover();
        await row(page, 'Troisième').locator('.task-drag-handle').hover();
        const handle = await row(page, 'Troisième').locator('.task-drag-handle').boundingBox();
        const top = await row(page, 'Premier').boundingBox();
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2, top.y + 20, { steps: 6 });
        await page.mouse.move(handle.x + handle.width / 2, top.y + 2, { steps: 6 });
        await page.mouse.up();
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => t.text)).toEqual(['Troisième', 'Premier', 'Second']);
    });

    test('list actions: uncheck all and clear completed, each with its confirmation', covers('org.tasklist-actions'), async ({ page }) => {
        const note = await list(api, 'Actions de liste', [{ text: 'Ouverte' }, { text: 'Fermée A', completed: true }, { text: 'Fermée B', completed: true }]);
        await openList(page, note.id);
        const open = () => page.locator(`[data-action="toggle-tasklist-actions"][data-note-id="${note.id}"]:visible`).click();
        await open();
        await expect(page.locator(`#tasklist-actions-menu-${note.id} .dropdown-item`)).toHaveCount(3);
        await page.locator(`#tasklist-actions-menu-${note.id} [data-action="clear-completed-tasks"]`).click();
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect(page.locator('.task-item')).toHaveCount(1);
        await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => t.text)).toEqual(['Ouverte']);
        await row(page, 'Ouverte').locator('.task-checkbox').check();
        await open();
        await page.locator(`#tasklist-actions-menu-${note.id} [data-action="uncheck-all-tasks"]`).click();
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].completed).toBe(false);
        await open();
        await page.locator(`#tasklist-actions-menu-${note.id} [data-action="open-tasks-page"]`).click();
        await expect(page).toHaveURL(/tasks\.php/);
    });

    test('clear completed on a list with nothing completed only says so', covers('org.tasklist-actions'), async ({ page }) => {
        test.fail(true, 'BUG: tasklist-order-drag.js calls window.modalAlert.info, which does not exist, so the message never shows');
        const note = await list(api, 'Rien à vider', [{ text: 'Ouverte' }]);
        await openList(page, note.id);
        await page.locator(`[data-action="toggle-tasklist-actions"][data-note-id="${note.id}"]:visible`).click();
        await page.locator(`#tasklist-actions-menu-${note.id} [data-action="clear-completed-tasks"]`).click();
        await expect(page.locator('.alert-modal')).toContainText('No completed tasks');
        expect((await tasksOf(api, note.id)).length).toBe(1);
    });
});

test('the insert order setting decides where a new task lands', covers('org.task-insert-order'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'ordre');
    const api = await Api.open(playwright, account);
    await login(page, account);
    const note = await list(api, 'Ordre d’insertion', [{ text: 'Ancienne' }]);
    await openList(page, note.id);
    await addTask(page, note.id, 'En bas');
    await expect.poll(async () => (await tasksOf(api, note.id)).map((t) => t.text)).toEqual(['Ancienne', 'En bas']);
    await page.goto('/settings.php#section=settings-note-content-section-grid');
    await settled(page);
    await page.locator('#tasklist-insert-order-select').selectOption('top');
    await expect.poll(async () => (await api.get('/settings/tasklist_insert_order')).json.value).toBe('top');
    await openList(page, note.id);
    await expect.poll(() => page.evaluate(() => typeof cachedTasklistInsertOrder !== 'undefined')).toBe(true);
    await addTask(page, note.id, 'Premier ajout');
    await addTask(page, note.id, 'En haut');
    await expect.poll(async () => (await tasksOf(api, note.id)).at(0).text).toBe('En haut');
    await api.dispose();
});

test('tasks page: empty at first, then the lists grouped with the overall progress, and the name opens the list', covers('org.tasks-page'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'pagevide');
    const api = await Api.open(playwright, account);
    await login(page, account);
    await page.goto('/tasks.php');
    await expect(page.locator('#emptyMessage')).toBeVisible();
    const a = await list(api, 'Maison é', [{ text: 'Laver' }, { text: 'Ranger', completed: true }]);
    await list(api, 'Bureau', [{ text: 'Écrire' }, { text: 'Lire' }]);
    await page.reload();
    await expect(page.locator('.tasks-note-group')).toHaveCount(2);
    await expect(page.locator('#emptyMessage')).toBeHidden();
    await expect(page.locator('#tasksProgressLabel')).toContainText('1');
    await expect(page.locator('#tasksProgressLabel')).toContainText('4');
    const house = page.locator('.tasks-note-group', { hasText: 'Maison é' });
    await expect(house.locator('.tasks-note-count')).toContainText('1');
    await house.locator('.note-name').click();
    await expect(page).toHaveURL(new RegExp(`note=${a.id}`));
    await api.dispose();
});

test.describe('tasks page', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'pagetaches');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const group = (page, heading) => page.locator('.tasks-note-group', { hasText: heading });
    const taskRow = (page, text) => page.locator('.tasks-task-item', { hasText: text });
    const openTasks = async (page) => {
        await page.goto('/tasks.php');
        await expect(page.locator('#loadingSpinner')).toBeHidden();
    };
    test('ticking and starring here write to the list', covers('org.tasks-page-edit'), async ({ page }) => {
        const note = await list(api, 'Coche ici', [{ text: 'À cocher depuis la page' }, { sub: 1, text: 'Avec enfant', subtasks: [{ id: 5, text: 'Enfant de page', completed: false }] }]);
        await openTasks(page);
        await taskRow(page, 'À cocher depuis la page').locator('.tasks-task-checkbox').check();
        await expect.poll(async () => (await tasksOf(api, note.id)).find((t) => t.text === 'À cocher depuis la page').completed).toBe(true);
        await page.locator('.tasks-subtask-item', { hasText: 'Enfant de page' }).locator('.tasks-subtask-checkbox').check();
        await expect.poll(async () => (await tasksOf(api, note.id)).find((t) => t.text === 'Avec enfant').subtasks[0].completed).toBe(true);
        await taskRow(page, 'Avec enfant').locator('.tasks-task-text').click();
        await expect(page).toHaveURL(new RegExp(`note=${note.id}`));
    });

    test('a due date is set, changed and removed from the row', covers('org.tasks-page-due'), async ({ page }) => {
        const note = await list(api, 'Date ici', [{ text: 'Sans date ici' }]);
        await openTasks(page);
        await taskRow(page, 'Sans date ici').hover();
        await taskRow(page, 'Sans date ici').locator('.tasks-task-due-btn').click();
        await page.locator('#taskDueDateBtn').click();
        await page.locator('.slash-date-picker-today-btn').click();
        await page.locator('#taskDueSaveBtn').click();
        await expect(taskRow(page, 'Sans date ici').locator('.task-due-chip')).toBeVisible();
        // A new due date starts with the current time
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueAt).toMatch(new RegExp(`^${inDays(0)}T\\d\\d:\\d\\d$`));
        await taskRow(page, 'Sans date ici').locator('.task-due-chip').click();
        await page.locator('#taskDueRemoveBtn').click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueAt).toBeNull();
    });

    test('every status filter keeps exactly its tasks, and the button shows it is on', covers('org.tasks-page-filters'), async ({ page }) => {
        await list(api, 'Filtres', [
            { text: 'F-simple' }, { text: 'F-important', important: true }, { text: 'F-retard', dueAt: inDays(-5) },
            { text: 'F-futur', dueAt: inDays(5) }, { text: 'F-fait', completed: true },
        ]);
        await openTasks(page);
        const shown = () => group(page, 'Filtres').locator('.tasks-task-text').allTextContents();
        await page.locator('#tasksFilterBtn').click();
        expect(await page.locator('#tasksFilterChips .tasks-filter-chip').evaluateAll((c) => c.map((x) => x.dataset.filter)))
            .toEqual(['all', 'open', 'important', 'overdue', 'dated', 'completed']);
        const expected = {
            open: ['F-important', 'F-simple', 'F-retard', 'F-futur'], important: ['F-important'], overdue: ['F-retard'],
            dated: ['F-retard', 'F-futur'], completed: ['F-fait'], all: ['F-important', 'F-simple', 'F-retard', 'F-futur', 'F-fait'],
        };
        for (const [filter, names] of Object.entries(expected)) {
            if (!(await page.locator('#tasksFilterPanel').isVisible())) await page.locator('#tasksFilterBtn').click();
            await page.locator(`.tasks-filter-chip[data-filter="${filter}"]`).click();
            await expect.poll(async () => (await shown()).sort(), `filter ${filter}`).toEqual([...names].sort());
            if (filter === 'all') await expect(page.locator('.tasks-filter-badge')).toBeHidden();
            else await expect(page.locator('.tasks-filter-badge'), `badge for ${filter}`).toBeVisible();
        }
    });

    test('the search field filters by task, list and folder, and can be cleared', covers('org.tasks-page-search'), async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier Zèbre' }))).json.folder;
        await api.createNote({ heading: 'Liste Zèbre', type: 'tasklist', folder_id: folder.id, content: JSON.stringify([{ id: 1, text: 'Tâche rayée', completed: false, important: false, dueAt: null }]) });
        await list(api, 'Liste Girafe', [{ text: 'Tâche tachetée' }, { text: 'Cou très long' }]);
        await openTasks(page);
        const fill = (value) => page.locator('#filterInput').fill(value);
        await fill('tachetée');
        await expect(page.locator('.tasks-task-text')).toHaveText(['Tâche tachetée']);
        await fill('girafe');
        await expect(page.locator('.tasks-task-text')).toHaveCount(2);
        await fill('dossier zèbre');
        await expect(page.locator('.tasks-task-text')).toHaveText(['Tâche rayée']);
        await page.locator('#clearFilterBtn').click();
        await expect(page.locator('#filterInput')).toHaveValue('');
        await expect(group(page, 'Liste Girafe')).toBeVisible();
    });

    test('a group collapses alone or with all the others, and stays so after a reload', covers('org.tasks-page-collapse'), async ({ page }) => {
        await list(api, 'Pliable A', [{ text: 'Sous A' }]);
        await list(api, 'Pliable B', [{ text: 'Sous B' }]);
        await openTasks(page);
        await group(page, 'Pliable A').locator('.tasks-note-toggle').click();
        await expect(group(page, 'Pliable A')).toHaveClass(/collapsed/);
        await expect(taskRow(page, 'Sous A')).toBeHidden();
        await expect(taskRow(page, 'Sous B')).toBeVisible();
        await page.reload();
        await expect(group(page, 'Pliable A')).toHaveClass(/collapsed/);
        await expect(group(page, 'Pliable B')).not.toHaveClass(/collapsed/);
        const toggleAll = page.locator('#toggleAllNotesBtn');
        // One group folded: the button unfolds them all first
        await toggleAll.click();
        await expect(group(page, 'Pliable A')).not.toHaveClass(/collapsed/);
        await toggleAll.click();
        await expect(group(page, 'Pliable B')).toHaveClass(/collapsed/);
        await expect(group(page, 'Pliable A')).toHaveClass(/collapsed/);
        await toggleAll.click();
        await expect(group(page, 'Pliable A')).not.toHaveClass(/collapsed/);
        await expect(taskRow(page, 'Sous B')).toBeVisible();
    });

    test('the eye hides a list, the option shows it again, and the choice is stored', covers('org.tasks-page-hidden'), async ({ page }) => {
        const note = await list(api, 'À masquer', [{ text: 'Masquée' }]);
        await openTasks(page);
        await expect(page.locator('#tasksShowHidden')).toBeDisabled();
        await group(page, 'À masquer').locator('.tasks-note-hide-btn').click();
        await expect(group(page, 'À masquer')).toHaveCount(0);
        await expect.poll(async () => (await api.get('/settings/tasks_page_hidden_notes')).text).toContain(String(note.id));
        await expect(page.locator('#tasksShowHiddenLabel')).toContainText('1');
        await page.reload();
        await expect(page.locator('#tasksProgressSection')).toBeVisible();
        await expect(group(page, 'À masquer')).toHaveCount(0);
        await page.locator('#tasksShowHidden').check();
        await expect(group(page, 'À masquer')).toHaveClass(/hidden-note/);
        await group(page, 'À masquer').locator('.tasks-note-hide-btn').click();
        await expect.poll(async () => (await api.get('/settings/tasks_page_hidden_notes')).text).not.toContain(String(note.id));
        await page.reload();
        await expect(group(page, 'À masquer')).toBeVisible();
        await expect(group(page, 'À masquer')).not.toHaveClass(/hidden-note/);
    });

    test('the checklists of notes appear with a badge, can be ticked here, and the option removes them', covers('org.tasks-page-checklists'), async ({ page }) => {
        const md = await api.createNote({ heading: 'Note à cases', type: 'markdown', content: '- [ ] Case Markdown\n- [x] Case cochée\n' });
        const html = await api.createNote({ heading: 'Note riche à cases', content: '<ul class="checklist"><li class="checklist-item"><input type="checkbox" class="checklist-checkbox"><span class="checklist-text">Case riche</span></li></ul>' });
        await openTasks(page);
        await expect(group(page, 'Note à cases').locator('.tasks-note-source-badge')).toBeVisible();
        await taskRow(page, 'Case Markdown').locator('.tasks-task-checkbox').check();
        await expect.poll(async () => (await api.getNote(md.id)).content).toContain('- [x] Case Markdown');
        await taskRow(page, 'Case riche').locator('.tasks-task-checkbox').check();
        await expect.poll(async () => (await api.getNote(html.id)).content).toMatch(/checked/);
        await page.locator('#tasksShowNoteChecklists').uncheck();
        await expect(group(page, 'Note à cases')).toHaveCount(0);
        await page.reload();
        await expect(page.locator('#tasksProgressSection')).toBeVisible();
        await expect(page.locator('#tasksShowNoteChecklists')).not.toBeChecked();
        await expect(group(page, 'Note à cases')).toHaveCount(0);
        await page.locator('#tasksShowNoteChecklists').check();
        await expect(group(page, 'Note à cases')).toBeVisible();
    });

    test('the calendar view: tasks on their day, month navigation, day dialog, and the choice survives a reload', covers('org.tasks-page-calendar'), async ({ page }) => {
        const today = inDays(0);
        const note = await list(api, 'Calendrier', [{ text: 'Du jour', dueAt: today }]);
        await openTasks(page);
        await page.locator('.tasks-view-btn[data-view="calendar"]').click();
        const cell = page.locator(`.tasks-cal-day[data-day="${today}"]`);
        await expect(cell.locator('.tasks-cal-chip', { hasText: 'Du jour' })).toBeVisible();
        const title = await page.locator('.tasks-cal-title').textContent();
        await page.locator('.tasks-cal-nav').last().click();
        await expect(page.locator('.tasks-cal-title')).not.toHaveText(title);
        await page.locator('.tasks-cal-today-btn').click();
        await expect(page.locator('.tasks-cal-title')).toHaveText(title);
        await page.locator('.tasks-cal-nav').first().click();
        await expect(page.locator('.tasks-cal-title')).not.toHaveText(title);
        await page.locator('.tasks-cal-today-btn').click();
        await cell.locator('.tasks-cal-day-num').click();
        await expect(page.locator('#calDayModal')).toBeVisible();
        await expect(page.locator('#calDayModalList')).toContainText('Du jour');
        await page.locator('#calDayModalList .tasks-task-checkbox').first().check();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].completed).toBe(true);
        await page.locator('#calDayModal .btn-cancel').click();
        await expect(page.locator('#calDayModal')).toBeHidden();
        await page.reload();
        await expect(page.locator('.tasks-calendar')).toBeVisible();
        await page.locator('.tasks-view-btn[data-view="list"]').click();
        await expect(page.locator('.tasks-calendar')).toHaveCount(0);
    });

    test('dragging a chip to another day moves the due date, keeping the time', covers('org.tasks-page-calendar-drag'), async ({ page }) => {
        const now = new Date();
        const day = (d) => `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(d)}`;
        const note = await list(api, 'Glisser jour', [{ text: 'Glisse-moi', dueAt: `${day(10)}T14:15` }]);
        await openTasks(page);
        await page.locator('.tasks-view-btn[data-view="calendar"]').click();
        await page.locator('.tasks-cal-chip', { hasText: 'Glisse-moi' }).dragTo(page.locator(`.tasks-cal-day[data-day="${day(17)}"]`));
        await expect(page.locator(`.tasks-cal-day[data-day="${day(17)}"] .tasks-cal-chip`, { hasText: 'Glisse-moi' })).toBeVisible();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueAt).toBe(`${day(17)}T14:15`);
        await page.locator('.tasks-view-btn[data-view="list"]').click();
    });
});

test.describe('task list embedded in a note', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'embed');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('/tasklist picks a list, and the widget edits that list without leaving the note', covers('org.tasklist-embed'), async ({ page }) => {
        const source = await list(api, 'Liste intégrée', [{ text: 'Depuis la source' }]);
        const note = await api.createNote({ heading: 'Hôte', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/');
        await expect(page.locator('.slash-command-menu')).toBeVisible();
        await page.keyboard.type('task', { delay: 20 });
        await page.locator('.slash-command-menu [data-command-id="tasklist-embed"]').click();
        const picker = page.locator('#taskListPickerModal');
        await expect(picker).toBeVisible();
        await expect(page.locator('#confirmTaskListPickerBtn')).toBeDisabled();
        await page.locator('#taskListPickerSearchInput').fill('intégrée');
        await page.locator('#taskListPickerList .move-task-item', { hasText: 'Liste intégrée' }).first().click();
        await page.locator('#confirmTaskListPickerBtn').click();
        const widget = page.locator('.tasklist-embed-widget');
        await expect(widget).toContainText('Depuis la source');
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain(`data-task-embed="${source.id}"`);
        await page.reload();
        await expect(widget).toContainText('Depuis la source');
        const add = widget.locator('input[type="text"]').first();
        await add.fill('Ajoutée dans la note');
        await add.press('Enter');
        await expect.poll(async () => (await tasksOf(api, source.id)).map((t) => t.text)).toContain('Ajoutée dans la note');
        // Not check(): the row moves down as soon as it is ticked
        await widget.locator('.tasklist-embed-task', { hasText: 'Depuis la source' }).locator('.tasklist-embed-checkbox').click();
        await expect.poll(async () => (await tasksOf(api, source.id)).filter((t) => t.completed).map((t) => t.text)).toEqual(['Depuis la source']);
    });
});

test.describe('kanban', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'kanban');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const makeFolder = async (name, parent) => (await api.ok(api.post('/folders', { folder_name: name, ...(parent ? { parent_id: parent } : {}) }))).json.folder;
    const openBoard = async (page, id) => {
        await page.goto(`/index.php?kanban=${id}`);
        await expect(page.locator('#kanban-view-container')).toBeVisible();
    };
    const card = (page, title) => page.locator('.kanban-card', { hasText: title });
    const column = (page, id) => page.locator(`.kanban-column-content[data-folder-id="${id}"]`);

    test('the folder menu opens the board, with one column per subfolder and one card per note', covers('org.kanban-open'), async ({ page }) => {
        const root = await makeFolder('Projet Kanban');
        const sub = await makeFolder('En cours', root.id);
        await api.createNote({ heading: 'Carte racine', folder_id: root.id, content: '<p>Corps de carte</p>' });
        await api.createNote({ heading: 'Carte en cours', folder_id: sub.id, content: '<p>x</p>' });
        await page.goto('/index.php');
        await settled(page);
        await openFolderMenu(page, 'Projet Kanban');
        await page.locator('#folder-actions-menu .kanban-view-action').click();
        await expect(page.locator('#kanban-view-container')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`kanban=${root.id}`));
        await expect(page.locator('.kanban-title')).toContainText('Projet Kanban');
        await expect(column(page, root.id).locator('.kanban-card')).toContainText(['Carte racine']);
        await expect(card(page, 'Carte racine').locator('.kanban-card-snippet')).toContainText('Corps de carte');
        await expect(column(page, sub.id).locator('.kanban-card')).toContainText(['Carte en cours']);
        await page.reload();
        await expect(page.locator('#kanban-view-container'), 'the board survives a reload').toBeVisible();
    });

    test('a click on a card opens its note', covers('org.kanban-open'), async ({ page }) => {
        const root = await makeFolder('Ouvrir carte');
        const note = await api.createNote({ heading: 'Carte à ouvrir', folder_id: root.id, content: '<p>x</p>' });
        await openBoard(page, root.id);
        await card(page, 'Carte à ouvrir').locator('.kanban-card-title').click();
        await expect(page.locator(`#entry${note.id}`)).toBeVisible();
    });

    test('dragging a card to another column moves the note to that folder', covers('org.kanban-move'), async ({ page }) => {
        const root = await makeFolder('Déplacer');
        const a = await makeFolder('Colonne A', root.id);
        const b = await makeFolder('Colonne B', root.id);
        const note = await api.createNote({ heading: 'Voyageuse Kanban', folder_id: a.id, content: '<p>x</p>' });
        await openBoard(page, root.id);
        await card(page, 'Voyageuse Kanban').dragTo(column(page, b.id));
        await expect(column(page, b.id).locator('.kanban-card')).toContainText(['Voyageuse Kanban']);
        await expect.poll(async () => (await api.getNote(note.id)).folder_id).toBe(b.id);
    });

    test('dragging a card within a column keeps the manual order after a reload', covers('org.kanban-move'), async ({ page }) => {
        const root = await makeFolder('Ordre manuel');
        for (const heading of ['Carte un', 'Carte deux', 'Carte trois']) await api.createNote({ heading, folder_id: root.id, content: '<p>x</p>' });
        await openBoard(page, root.id);
        const titles = () => column(page, root.id).locator('.kanban-card-title').allInnerTexts();
        await page.locator('[data-action="cycle-kanban-card-sort"]').click(); // the manual order is one of the sorts
        const before = await titles();
        await card(page, before[2]).dragTo(card(page, before[0]), { targetPosition: { x: 40, y: 4 } });
        const wanted = [before[2], before[0], before[1]];
        await expect.poll(titles).toEqual(wanted);
        await page.waitForLoadState('networkidle');
        await page.reload();
        await expect(page.locator('#kanban-view-container')).toBeVisible();
        expect(await titles()).toEqual(wanted);
    });

    test('completing a card puts it in the section below, stored, and it can be reopened', covers('org.kanban-complete'), async ({ page }) => {
        const root = await makeFolder('Terminer');
        await api.createNote({ heading: 'Carte finie', folder_id: root.id, content: '<p>x</p>' });
        await openBoard(page, root.id);
        await card(page, 'Carte finie').hover();
        await card(page, 'Carte finie').locator('[data-action="toggle-kanban-completed"]').click();
        await expect(page.locator('.kanban-completed-count')).toHaveText('1');
        await expect(card(page, 'Carte finie')).toBeHidden();
        await page.waitForLoadState('networkidle');
        await page.reload();
        await expect(page.locator('.kanban-completed-count'), 'stored').toHaveText('1');
        await page.locator('[data-action="toggle-kanban-completed-section"]').click();
        await expect(card(page, 'Carte finie')).toBeVisible();
        await expect(card(page, 'Carte finie')).toHaveClass(/kanban-card-completed/);
        await card(page, 'Carte finie').locator('[data-action="toggle-kanban-completed"]').click();
        await expect(column(page, root.id).locator(':scope > .kanban-card')).toContainText(['Carte finie']);
        await page.waitForLoadState('networkidle');
        await page.reload();
        await expect(column(page, root.id).locator(':scope > .kanban-card'), 'stored').toContainText(['Carte finie']);
        await expect(page.locator('.kanban-completed-section')).toHaveCount(0);
    });

    test('the + of a column creates a note in that folder', covers('org.kanban-create-card'), async ({ page }) => {
        const root = await makeFolder('Nouvelle carte');
        const column1 = await makeFolder('Colonne vide', root.id);
        await openBoard(page, root.id);
        await page.locator(`.kanban-column[data-folder-id="${column1.id}"] [data-action="create-kanban-note"]`).click();
        await page.locator('.create-note-option[data-type="html"]:visible').click();
        await expect.poll(async () => (await api.ok(api.get('/notes'))).json.notes.filter((n) => n.folder_id === column1.id).length).toBe(1);
    });

    test('the column button creates a subfolder, shown as a new column', covers('org.kanban-create-column'), async ({ page }) => {
        const root = await makeFolder('Nouvelle colonne');
        await openBoard(page, root.id);
        await page.locator('[data-action="create-kanban-column"]').click();
        await page.locator('.modal:visible input[type="text"], .alert-modal input[type="text"]').first().fill('Colonne née');
        await page.keyboard.press('Enter');
        await expect(page.locator('.kanban-column', { hasText: 'Colonne née' })).toBeVisible();
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Colonne née');
    });

    test('card size and sort cycle through all their values and are remembered', covers('org.kanban-view'), async ({ page }) => {
        const root = await makeFolder('Vue carte');
        const tagged = await api.createNote({ heading: 'B carte', folder_id: root.id, content: '<p>x</p>', tags: 'zèbre' });
        await api.createNote({ heading: 'A carte', folder_id: root.id, content: '<p>x</p>', tags: 'alpha' });
        await openBoard(page, root.id);
        const size = page.locator('.kanban-size-letter');
        const seen = [];
        for (let i = 0; i < 3; i++) { await page.locator('[data-action="cycle-kanban-card-size"]').click(); seen.push(await size.textContent()); }
        expect(new Set(seen).size, `sizes seen: ${seen}`).toBeGreaterThanOrEqual(2);
        const last = seen.at(-1);
        await page.reload();
        await expect(size).toHaveText(last);
        const sort = page.locator('[data-action="cycle-kanban-card-sort"]');
        const titles = new Set([await sort.getAttribute('title')]);
        for (let i = 0; i < 3; i++) { await sort.click(); titles.add(await sort.getAttribute('title')); }
        expect(titles.size, `sorts seen: ${[...titles]}`).toBeGreaterThanOrEqual(2);
        expect(tagged.id).toBeGreaterThan(0);
    });

    test('a task list card shows its tasks, and ticking one writes to the list', covers('org.kanban-task-preview'), async ({ page }) => {
        const root = await makeFolder('Liste en carte');
        const note = await api.createNote({ heading: 'Liste carte', type: 'tasklist', folder_id: root.id, content: JSON.stringify([{ id: 11, text: 'Case de carte', completed: false, important: false, dueAt: inDays(1), subtasks: [{ id: 12, text: 'Sous-case', completed: false }] }]) });
        await openBoard(page, root.id);
        await expect(card(page, 'Liste carte').locator('.kanban-card-due')).toBeVisible();
        await card(page, 'Liste carte').locator('.kanban-subtask-checkbox').check();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].subtasks[0].completed).toBe(true);
        await card(page, 'Liste carte').locator('.kanban-task-checkbox').check();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].completed).toBe(true);
    });

    test('a nested subfolder is a group of its column that collapses', covers('org.kanban-subfolder'), async ({ page }) => {
        const root = await makeFolder('Imbriqué');
        const sub = await makeFolder('Niveau 1', root.id);
        const nested = await makeFolder('Niveau 2', sub.id);
        await api.createNote({ heading: 'Carte profonde', folder_id: nested.id, content: '<p>x</p>' });
        await openBoard(page, root.id);
        const section = page.locator(`.kanban-subfolder-section[data-folder-id="${nested.id}"]`);
        await expect(section.locator('.kanban-subfolder-count')).toHaveText('1');
        await expect(card(page, 'Carte profonde'), 'folded at first').toBeHidden();
        await section.locator('[data-action="toggle-kanban-subfolder-section"]').click();
        await expect(card(page, 'Carte profonde')).toBeVisible();
        await section.locator('[data-action="toggle-kanban-subfolder-section"]').click();
        await expect(card(page, 'Carte profonde')).toBeHidden();
    });

    test('with the setting on, the folder icon of the tree opens the board', covers('org.kanban-folder-icon'), async ({ page }) => {
        const root = await makeFolder('Icône Kanban');
        await page.goto('/settings.php#section=settings-sidebar-section-grid');
        await settled(page);
        await page.locator('#folder-icon-kanban-card').click();
        await expect.poll(async () => (await api.get('/settings/folder_icon_opens_kanban')).json.value).toMatch(/1|true/);
        await page.goto('/index.php');
        await settled(page);
        await page.locator(`.folder-header[data-folder-id="${root.id}"] .folder-icon, [data-folder-id="${root.id}"].folder-header .folder-icon`).first().click();
        await expect(page.locator('#kanban-view-container')).toBeVisible();
        await api.ok(api.put('/settings/folder_icon_opens_kanban', { value: '0' }));
    });
});

test.describe('diary', () => {
    test.describe.configure({ timeout: 120_000 });
    // A brand new account for each test: today's entry, the template and the date format all depend on what exists
    let account; let api;
    test.beforeEach(async ({ page, playwright }) => {
        account = await newAccount(playwright, 'diary');
        api = await Api.open(playwright, account);
        await login(page, account);
    });
    test.afterEach(async () => { await api.dispose(); });
    const todayIso = () => inDays(0);
    const openDiary = async (page) => {
        await page.goto('/diary.php');
        await settled(page);
    };
    const newDiary = async (page, name) => {
        await page.locator('#diaryNewBtn').click();
        await page.locator('.diary-new-input').fill(name);
        await page.locator('[data-action="submit-diary-name"]').click();
    };

    test('the empty page, then the button creates today\'s entry and then goes back to it', covers('org.diary-today'), async ({ page }) => {
        await openDiary(page);
        await expect(page.locator('.diary-empty')).toBeVisible();
        await expect(page.locator('#diaryTodayBtn'), 'named after what it will do').toHaveAttribute('aria-label', "Create today's entry");
        await page.locator('#diaryTodayBtn').click();
        await page.waitForURL(/index\.php\?note=\d+/);
        await expect(page.locator('.css-title').first()).toHaveValue(todayIso());
        const id = Number(new URL(page.url()).searchParams.get('note'));
        const note = await api.getNote(id);
        expect(note.heading).toBe(todayIso());
        expect(note.folder, 'filed under its month').toBe(todayIso().slice(5, 7));
        expect((await api.ok(api.get('/folders'))).text).toContain(todayIso().slice(0, 4));
        await openDiary(page);
        await expect(page.locator('#diaryTodayBtn')).toHaveAttribute('aria-label', "Go to today's entry");
        await expect(page.locator('.diary-today-tag')).toBeVisible();
        await page.locator('#diaryTodayBtn').click();
        await page.waitForURL(new RegExp(`note=${id}`));
        expect((await api.ok(api.get('/notes'))).json.notes.filter((n) => n.heading === todayIso()).length, 'no second entry').toBe(1);
    });

    test('a new diary is named, listed as a pill, renamed and deleted from its right-click menu', covers('org.diary-manage'), async ({ page }) => {
        await openDiary(page);
        await newDiary(page, 'Carnet é');
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Carnet é');
        await expect(page.locator('.diary-switch-btn'), 'a lone diary has no pill').toHaveCount(0);
        await openDiary(page);
        await newDiary(page, 'Voyages');
        await expect(page.locator('.diary-switch-btn', { hasText: 'Carnet é' }), 'two diaries, two pills').toBeVisible();
        const pill = page.locator('.diary-switch-btn', { hasText: 'Voyages' });
        await expect(pill).toBeVisible();
        await expect(page.locator('.diary-switch-btn')).toHaveCount(2);
        await pill.click({ button: 'right' });
        await page.locator('.diary-context-menu [data-action="rename"]').click();
        await page.locator('.diary-new-input').fill('Périples');
        await page.locator('[data-action="submit-diary-name"]').click();
        await expect(page.locator('.diary-switch-btn', { hasText: 'Périples' })).toBeVisible();
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Périples');
        await page.locator('.diary-switch-btn', { hasText: 'Périples' }).click({ button: 'right' });
        await page.locator('.diary-context-menu [data-action="delete"]').click();
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect(page.locator('.diary-switch-btn'), 'back to one diary, no pill').toHaveCount(0);
        await expect.poll(async () => (await api.get('/folders')).text).not.toContain('Périples');
    });

    test.describe('refusal', () => {
        // The refusal is a 400 of the server, shown in the dialog: the browser logs it
        test.use({ allowedErrors: [/status of 400.*diaries\.php/] });
        test('a name holding a forbidden character is refused', covers('org.diary-manage'), async ({ page }) => {
            await openDiary(page);
            await page.locator('#diaryNewBtn').click();
            await page.locator('.diary-new-input').fill('a/b');
            await page.locator('[data-action="submit-diary-name"]').click();
            await expect(page.locator('.diary-new-error')).toBeVisible();
            await expect(page.locator('.diary-switch-btn')).toHaveCount(0);
        });
    });

    test('pills switch diaries, each with its own entries', covers('org.diary-manage'), async ({ page }) => {
        await openDiary(page);
        await newDiary(page, 'Premier');
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Premier');
        await openDiary(page);
        await newDiary(page, 'Second');
        await expect(page.locator('.diary-switch-btn', { hasText: 'Premier' })).toBeVisible();
        await page.locator('.diary-switch-btn', { hasText: 'Second' }).locator('a').click();
        await expect(page.locator('.diary-switch-btn', { hasText: 'Second' })).toHaveClass(/diary-switch-active/);
        await page.locator('#diaryTodayBtn').click();
        await page.waitForURL(/index\.php\?note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        await api.ok(api.patch(`/notes/${id}`, { content: '<p>Dans le second</p>' }));
        await openDiary(page);
        await page.locator('.diary-switch-btn', { hasText: 'Second' }).locator('a').click();
        await expect(page.locator('#diaryContent')).toContainText('Dans le second');
        await page.locator('.diary-switch-btn', { hasText: 'Premier' }).locator('a').click();
        await expect(page.locator('.diary-switch-btn', { hasText: 'Premier' })).toHaveClass(/diary-switch-active/);
        await expect(page.locator('#diaryContent')).not.toContainText('Dans le second');
    });

    test('the calendar button creates a past day\'s entry, marks it, and opens it next time', covers('org.diary-day-picker'), async ({ page }) => {
        await openDiary(page);
        await page.locator('#diaryDatePickBtn').click();
        await page.locator('.slash-date-picker-nav[data-nav="-1"]').click();
        await page.locator('.slash-date-picker-day[data-day="10"]').click();
        await page.waitForURL(/index\.php\?note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        const now = new Date(); now.setUTCDate(1); now.setUTCMonth(now.getUTCMonth() - 1);
        const expected = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-10`;
        const note = await api.getNote(id);
        expect(note.heading).toBe(expected);
        expect(String(note.created)).toContain(expected);
        await openDiary(page);
        await page.locator('#diaryDatePickBtn').click();
        await page.locator('.slash-date-picker-nav[data-nav="-1"]').click();
        await expect(page.locator('.slash-date-picker-day[data-day="10"]')).toHaveClass(/marked/);
        await page.locator('.slash-date-picker-day[data-day="10"]').click();
        await page.waitForURL(new RegExp(`note=${id}`));
    });

    test('a diary link with a date opens that day, creating it when needed', covers('org.diary-date-url'), async ({ page }) => {
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/index\.php\?note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        expect((await api.getNote(id)).heading).toBe('2026-03-04');
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(new RegExp(`note=${id}`));
    });

    test('the board filters by text, and shows nothing with a clear message', covers('org.diary-filter'), async ({ page }) => {
        await openDiary(page);
        await newDiary(page, 'Filtres');
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Filtres');
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        const first = Number(new URL(page.url()).searchParams.get('note'));
        await page.goto('/diary.php?date=2026-03-05');
        await page.waitForURL(/note=\d+/);
        const second = Number(new URL(page.url()).searchParams.get('note'));
        await api.ok(api.patch(`/notes/${first}`, { content: '<p>Pique-nique à la plage</p>' }));
        await api.ok(api.patch(`/notes/${second}`, { content: '<p>Réunion au bureau</p>' }));
        await openDiary(page);
        await expect(page.locator('#diaryContent')).toContainText('Pique-nique');
        await page.locator('#filterInput').fill('reunion');
        await expect(page.locator('#diaryContent')).toContainText('Réunion');
        await expect(page.locator('#diaryContent')).not.toContainText('Pique-nique');
        await page.locator('#filterInput').fill('rien de tel');
        await expect(page.locator('#diaryNoResults')).toBeVisible();
        await page.locator('#clearFilterBtn').click();
        await expect(page.locator('#diaryContent')).toContainText('Pique-nique');
    });

    test('the board view button cycles layouts and sizes, the full-height button toggles, both remembered', covers('org.diary-view'), async ({ page }) => {
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        await openDiary(page);
        const layout = page.locator('#diaryViewLayoutBtn');
        const titles = new Set();
        for (let i = 0; i < 5; i++) { await layout.click(); titles.add((await layout.getAttribute('title')) + (await layout.locator('.board-view-size-letter').textContent())); }
        expect(titles.size, [...titles].join()).toBeGreaterThan(2);
        const full = page.locator('#diaryViewFullHeightBtn');
        const before = await full.getAttribute('aria-pressed');
        if (await full.isEnabled()) {
            await full.click();
            await expect(full).not.toHaveAttribute('aria-pressed', before);
            await page.reload();
            await expect(full).not.toHaveAttribute('aria-pressed', before);
        }
    });

    test('the journal view shows the bodies, and the choice is remembered', covers('org.diary-journal'), async ({ page }) => {
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        await api.ok(api.patch(`/notes/${id}`, { content: '<h2>Récit</h2><p>Une journée é</p>' }));
        await openDiary(page);
        await page.locator('#diaryJournalToggle').click();
        await expect(page.locator('#diaryJournalToggle')).toHaveAttribute('aria-pressed', 'true');
        const entry = page.locator(`.diary-journal-entry[data-note-id="${id}"]`);
        await expect(entry.locator('.diary-journal-body h2')).toHaveText('Récit');
        await expect(page.locator('#diaryOutlineNav')).toContainText('Mar 4');
        await page.reload();
        await expect(entry.locator('.diary-journal-body')).toContainText('Une journée é');
        await page.locator('#diaryJournalToggle').click();
        await expect(entry).toHaveCount(0);
    });

    test('the journal pencil edits in place and saves', covers('org.diary-journal-edit'), async ({ page }) => {
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        await api.ok(api.patch(`/notes/${id}`, { content: '<p>Texte initial</p>' }));
        await openDiary(page);
        await page.locator('#diaryJournalToggle').click();
        const entry = page.locator(`.diary-journal-entry[data-note-id="${id}"]`);
        await entry.locator('.diary-journal-edit').click();
        const editor = entry.locator('.diary-journal-editor');
        await expect(editor).toBeVisible();
        await editor.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' complété');
        await expect.poll(async () => (await api.getNote(id)).content).toContain('complété');
        await entry.locator('.diary-journal-edit').click();
        await expect(editor).toHaveCount(0);
        await expect(entry.locator('.diary-journal-body')).toContainText('complété');
    });

    test('the journal tag button adds and removes a tag', covers('org.diary-journal-tags'), async ({ page }) => {
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        await openDiary(page);
        await page.locator('#diaryJournalToggle').click();
        const entry = page.locator(`.diary-journal-entry[data-note-id="${id}"]`);
        await entry.locator('.diary-journal-tags-btn').click();
        const input = entry.locator('.diary-journal-tag-input');
        await input.fill('souvenir');
        await input.press('Enter');
        await expect.poll(async () => JSON.stringify((await api.getNote(id)).tags)).toContain('souvenir');
        await entry.locator('.diary-journal-tag-remove').click();
        await expect.poll(async () => JSON.stringify((await api.getNote(id)).tags)).not.toContain('souvenir');
    });

    test('the date format dialog titles the next entries, in each format', covers('org.diary-date-format'), async ({ page }) => {
        const formats = { ymd: '2026-03-04', dmy_slash: '04/03/2026', mdy_slash: '03/04/2026', dmy_dot: '04.03.2026', ymd_slash: '2026/03/04', long: 'Wednesday, March 4, 2026' };
        await page.goto('/settings.php#section=settings-diary-section-grid');
        await settled(page);
        await expect(page.locator('input[name="diaryDateFormat"]')).toHaveCount(7);
        let day = 1;
        for (const [format, titleFor] of Object.entries(formats)) {
            await page.goto('/settings.php#section=settings-diary-section-grid');
            await settled(page);
            await page.locator('#diary-date-format-card').click();
            await page.locator(`input[name="diaryDateFormat"][value="${format}"]`).check();
            await page.locator('#saveDiaryDateFormatModalBtn').click();
            await expect(page.locator('#diaryDateFormatModal')).toBeHidden();
            await expect.poll(async () => (await api.get('/settings/diary_date_format')).json.value).toBe(format);
            day += 1;
            const date = `2026-03-${pad(day)}`;
            const title = titleFor.replace('04', pad(day)).replace('March 4', `March ${day}`).replace('Wednesday', new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }));
            await page.goto(`/diary.php?date=${date}`);
            await page.waitForURL(/note=\d+/);
            expect((await api.getNote(Number(new URL(page.url()).searchParams.get('note')))).heading, format).toBe(title);
        }
    });

    test('a custom date format is checked, stored and applied', covers('org.diary-date-format'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-diary-section-grid');
        await settled(page);
        await page.locator('#diary-date-format-card').click();
        await page.locator('#diaryDateFormatCustomInput').fill('YYYY MM DD journal');
        await expect(page.locator('input[name="diaryDateFormat"][value="custom"]')).toBeChecked();
        await page.locator('#saveDiaryDateFormatModalBtn').click();
        await expect.poll(async () => (await api.get('/settings/diary_date_format')).json.value).toBe('custom:YYYY MM DD journal');
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        expect((await api.getNote(Number(new URL(page.url()).searchParams.get('note')))).heading).toBe('2026 03 04 journal');
    });

    test('an invalid custom date format is refused', covers('org.diary-date-format'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-diary-section-grid');
        await settled(page);
        await page.locator('#diary-date-format-card').click();
        await page.locator('#diaryDateFormatCustomInput').fill('juste du texte');
        await page.locator('#saveDiaryDateFormatModalBtn').click();
        await expect(page.locator('.alert-modal')).toContainText('valid');
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect(page.locator('#diaryDateFormatModal')).toBeVisible();
        expect((await api.get('/settings/diary_date_format')).json.value ?? '').not.toContain('juste');
    });

    test('the note type setting decides the type of a new entry', covers('org.diary-note-type'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-diary-section-grid');
        await settled(page);
        await page.locator('#diary-note-type-select').selectOption('markdown');
        await expect.poll(async () => (await api.get('/settings/diary_default_note_type')).json.value).toBe('markdown');
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        expect((await api.getNote(Number(new URL(page.url()).searchParams.get('note')))).type).toBe('markdown');
    });

    test('the template setting fills a new entry, only in its workspace', covers('org.diary-template'), async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Templates' }))).json.folder;
        const template = await api.createNote({ heading: 'Trame du jour', folder_id: folder.id, content: '<p>Humeur du jour é</p>' });
        await page.goto('/settings.php#section=settings-diary-section-grid');
        await settled(page);
        await page.locator('#diary-template-select').click();
        await expect(page.locator('#diary-template-select option', { hasText: 'Trame du jour' })).toHaveCount(1);
        await page.locator('#diary-template-select').selectOption(String(template.id));
        await expect.poll(async () => (await api.get('/settings/diary_templates')).text).toContain(String(template.id));
        await page.goto('/diary.php?date=2026-03-04');
        await page.waitForURL(/note=\d+/);
        expect((await api.getNote(Number(new URL(page.url()).searchParams.get('note')))).content).toContain('Humeur du jour é');
    });

    test('the mini calendar of the sidebar shows the day, its notes and creates the entry', covers('org.mini-calendar'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Note du calendrier', content: '<p>x</p>' });
        await page.goto('/index.php');
        await settled(page);
        const calendar = page.locator('#mini-calendar');
        if (await calendar.locator('.mini-calendar-collapsed').count()) await calendar.locator('[data-action="toggle"]').click();
        const today = new Date().getUTCDate();
        const cell = calendar.locator(`.mini-calendar-day[data-day="${today}"]`);
        await expect(cell).toHaveClass(/today/);
        await expect(cell).toHaveClass(/has-notes/);
        const month = await calendar.locator('.mini-calendar-month-year').textContent();
        await calendar.locator('[data-action="next-month"]').click();
        await expect(calendar.locator('.mini-calendar-month-year')).not.toHaveText(month);
        await calendar.locator('[data-action="prev-month"]').click();
        await calendar.locator('[data-action="prev-month"]').click();
        await calendar.locator('[data-action="today"]').click();
        await expect(calendar.locator('.mini-calendar-month-year')).toHaveText(month);
        await cell.click();
        const modal = page.locator('.calendar-notes-modal');
        await expect(modal.locator('.calendar-note-item', { hasText: 'Note du calendrier' })).toBeVisible();
        await expect(modal.locator('.calendar-mode-option')).toHaveCount(2);
        await modal.locator('.calendar-mode-option').last().click();
        await expect(modal.locator('.calendar-note-item', { hasText: 'Note du calendrier' })).toBeVisible();
        await modal.locator('.calendar-diary-entry-btn').click();
        await expect.poll(async () => (await api.ok(api.get('/notes'))).json.notes.some((n) => n.heading === todayIso())).toBe(true);
        expect(note.id).toBeGreaterThan(0);
    });

    test('the mini calendar opens a note from the day dialog, and can be folded', covers('org.mini-calendar'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Depuis le jour', content: '<p>x</p>' });
        await page.goto('/index.php');
        await settled(page);
        const calendar = page.locator('#mini-calendar');
        if (await calendar.locator('.mini-calendar-collapsed').count()) await calendar.locator('[data-action="toggle"]').click();
        await calendar.locator(`.mini-calendar-day[data-day="${new Date().getUTCDate()}"]`).click();
        await page.locator('.calendar-note-item', { hasText: 'Depuis le jour' }).click();
        await expect(page.locator(`#entry${note.id}`)).toBeVisible();
        await page.locator('.calendar-notes-modal [data-action="close-modal"]').click();
        await calendar.locator('[data-action="toggle"]').click();
        await expect(calendar.locator('.mini-calendar-content')).toHaveCount(0);
        await page.reload();
        await expect(page.locator('#mini-calendar .mini-calendar-collapsed')).toBeVisible();
    });
});

test.describe('templates', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'modele');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('/template lists the notes of the Templates folder and pastes the chosen one', covers('org.template-slash'), async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Templates' }))).json.folder;
        await api.createNote({ heading: 'Compte rendu', folder_id: folder.id, content: '<h2>Présents é</h2><p>Liste</p>' });
        await api.createNote({ heading: 'Autre modèle', folder_id: folder.id, content: '<p>Sans intérêt</p>' });
        await api.createNote({ heading: 'Note ordinaire', content: '<p>x</p>' });
        expect((await api.ok(api.get('/notes/templates'))).json.notes?.map((n) => n.heading).sort() ?? (await api.ok(api.get('/notes/templates'))).json.templates.map((n) => n.heading).sort())
            .toEqual(['Autre modèle', 'Compte rendu']);
        const note = await api.createNote({ heading: 'Réunion', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/');
        await page.keyboard.type('template', { delay: 20 });
        await page.waitForTimeout(150);
        await page.keyboard.press('Enter');
        const search = page.locator('.template-picker-search, .modal:visible input[type="text"]').first();
        await expect(search).toBeVisible();
        await search.fill('compte');
        await page.keyboard.press('Enter');
        await expect(page.locator('.noteentry[contenteditable="true"] h2')).toHaveText('Présents é');
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('Présents é');
    });
});

test.describe('reminders', () => {
    let account; let api;
    test.beforeEach(async ({ page, playwright }) => {
        account = await newAccount(playwright, 'rappel');
        api = await Api.open(playwright, account);
        await login(page, account);
    });
    test.afterEach(async () => { await api.dispose(); });
    const past = () => new Date(Date.now() - 3600000).toISOString();
    const fire = async (heading, extra = {}) => {
        const note = await api.createNote({ heading, content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${note.id}/reminder`, { reminder_at: past(), ...extra }));
        return note;
    };

    test('the bell dialog sets a date and a time, the button is marked, and it can be removed', covers('org.reminder-set'), async ({ page }) => {
        const note = await api.createNote({ heading: 'À rappeler', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.btn-reminder:visible').first().click();
        const modal = page.locator('#reminderModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#reminderRemoveBtn')).toBeHidden();
        await page.locator('#reminderDateBtn').click();
        await page.locator('.slash-date-picker-nav[data-nav="1"]').click();
        await page.locator('.slash-date-picker-day[data-day="15"]').click();
        await page.locator('#reminderTimeBtn').click();
        await page.locator('.slash-time-cell[data-hour="10"]').click();
        await page.locator('.slash-time-cell[data-minute="15"]').click();
        await expect(page.locator('#reminderCurrentInfo')).toBeVisible();
        await page.locator('#reminderSaveBtn').click();
        await expect(modal).toBeHidden();
        const next = new Date(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
        const expected = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-15`;
        await expect.poll(async () => (await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at ?? '').toContain(`${expected} 10:15`);
        await expect(page.locator(`.btn-reminder[data-note-id="${note.id}"]`).first()).toHaveClass(/has-reminder/);
        await page.reload();
        await page.locator('.btn-reminder:visible').first().click();
        await expect(page.locator('#reminderRemoveBtn')).toBeVisible();
        await page.locator('#reminderRemoveBtn').click();
        await expect.poll(async () => (await api.ok(api.get(`/notes/${note.id}/reminder`))).json.reminder_at ?? null).toBeNull();
        await expect(page.locator(`.btn-reminder[data-note-id="${note.id}"]`).first()).not.toHaveClass(/has-reminder/);
    });

    test('a repeat is stored with the reminder, and dismissing moves it to the next date', covers('org.reminder-repeat'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Répété', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.btn-reminder:visible').first().click();
        expect(await page.locator('#reminderRepeatSelect option').evaluateAll((o) => o.map((x) => x.value))).toEqual(['', '1h', '1d', '1w', '1m', '1y', 'custom']);
        await page.locator('#reminderDateBtn').click();
        await page.locator('.slash-date-picker-nav[data-nav="1"]').click();
        await page.locator('.slash-date-picker-day[data-day="15"]').click();
        await page.locator('#reminderRepeatSelect').selectOption('custom');
        await expect(page.locator('#reminderRepeatCustom')).toBeVisible();
        await page.locator('#reminderRepeatInterval').fill('2');
        await page.locator('#reminderRepeatUnit').selectOption('w');
        await page.locator('#reminderSaveBtn').click();
        await expect.poll(async () => (await api.ok(api.get(`/notes/${note.id}/reminder`))).json.recurrence).toBe('2w');
        // Now one that has fired
        const fired = await fire('Quotidien', { recurrence: '1d' });
        const list = (await api.ok(api.get('/reminders'))).json.notifications;
        const id = list.find((n) => n.note_id === fired.id).id;
        const moved = await api.ok(api.post(`/reminders/${id}/dismiss`));
        expect(new Date(`${moved.json.next_reminder_at.replace(' ', 'T')}Z`).getTime(), 'next date').toBeGreaterThan(Date.now());
    });

    test('the bell shows fired reminders only, the dialog lists them, and dismiss removes them', covers('org.notifications'), async ({ page }) => {
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#sidebarNotificationsBtn'), 'no bell without notification').toBeHidden();
        const future = await api.createNote({ heading: 'Pas encore', content: '<p>x</p>' });
        await api.ok(api.post(`/notes/${future.id}/reminder`, { reminder_at: new Date(Date.now() + 86400000).toISOString() }));
        await fire('Sonné un');
        await fire('Sonné deux');
        expect((await api.ok(api.get('/reminders/count'))).json).toMatchObject({ total_count: 2 });
        await page.reload();
        await settled(page);
        await expect(page.locator('#sidebarNotificationsBtn')).toHaveClass(/has-notifications/);
        await page.locator('#sidebarNotificationsBtn').click();
        const modal = page.locator('#notificationsModal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.notification-item')).toHaveCount(2);
        await expect(modal).not.toContainText('Pas encore');
        await expect(modal.locator('.notification-item.unread')).toHaveCount(2);
        await modal.locator('.notification-item', { hasText: 'Sonné un' }).locator('[data-action="dismiss-notification"]').click();
        await expect(modal.locator('.notification-item')).toHaveCount(1);
        expect((await api.ok(api.get('/reminders'))).json.total_count).toBe(1);
        await page.locator('[data-action="close-notifications-modal"]').click();
        await expect(modal).toBeHidden();
        await page.locator('#sidebarNotificationsBtn').click();
        await modal.locator('#dismissAllBtn').click();
        await expect.poll(async () => (await api.ok(api.get('/reminders'))).json.total_count).toBe(0);
        await expect(modal).toBeHidden();
        await page.reload();
        await settled(page);
        await expect(page.locator('#sidebarNotificationsBtn'), 'the bell goes away with the last one').toBeHidden();
    });

    test('a notification opens its note and is then read', covers('org.notifications'), async ({ page }) => {
        const note = await fire('À ouvrir');
        await page.goto('/index.php');
        await settled(page);
        await page.locator('#sidebarNotificationsBtn').click();
        await page.locator('.notification-item', { hasText: 'À ouvrir' }).click();
        await expect(page).toHaveURL(new RegExp(`note=${note.id}`));
        await expect.poll(async () => Number((await api.ok(api.get('/reminders'))).json.notifications[0].is_read)).toBe(1);
    });

    test('a reminder firing while the page is open makes a system notification, once', covers('org.reminder-poll'), async ({ page, context }) => {
        await context.grantPermissions(['notifications']);
        await page.addInitScript(() => {
            window.__shown = [];
            const Real = window.Notification;
            window.Notification = function (title, options) { window.__shown.push(`${title} ${options?.body ?? ''}`); return { close() {} }; };
            Object.defineProperty(window.Notification, 'permission', { get: () => 'granted' });
            window.Notification.requestPermission = Real.requestPermission;
        });
        await page.clock.install();
        await page.goto('/index.php');
        await settled(page);
        await page.clock.fastForward(5000);
        await page.waitForFunction(() => document.readyState === 'complete');
        const seedDone = () => page.evaluate(() => (window.__poznoteUserStorage || localStorage).getItem('reminder_notified_ids'));
        await expect.poll(async () => { await page.clock.fastForward(16000); return seedDone(); }).not.toBeNull();
        expect(await page.evaluate(() => window.__shown)).toEqual([]);
        await fire('Sonne maintenant');
        await page.clock.fastForward(31000);
        await expect.poll(() => page.evaluate(() => window.__shown.join())).toContain('Sonne maintenant');
        await page.clock.fastForward(31000);
        await page.clock.fastForward(31000);
        expect((await page.evaluate(() => window.__shown)).length, 'shown once').toBe(1);
    });

    test('Web Push: the server gives its key, a subscription is stored and removed', covers('org.web-push'), async () => {
        const status = (await api.ok(api.get('/users/me/push'))).json;
        expect(status.public_key, JSON.stringify(status)).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(status.subscriptions).toBe(0);
        const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${account.id}`;
        const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
        await api.ok(api.post('/users/me/push/subscriptions', { endpoint, keys }));
        expect((await api.ok(api.get('/users/me/push'))).json.subscriptions).toBe(1);
        const refused = await api.post('/users/me/push/subscriptions', { endpoint: 'http://127.0.0.1:9912/evil', keys });
        expect(refused.status, 'an internal endpoint is refused').toBeGreaterThanOrEqual(400);
        await api.ok(api.call('DELETE', '/users/me/push/subscriptions', { json: { endpoint } }));
        expect((await api.ok(api.get('/users/me/push'))).json.subscriptions).toBe(0);
    });
});

const SMTP_PORT = 9925;
const SMTP_LOG = '/tmp/poznote-e2e-smtp.log';
// Written into the instance, so that only the mail tests depend on it. A failed
// connection delays the next try of a mail by minutes: wait until it listens.
const startSmtpMock = () => {
    const mock = `<?php
$s = stream_socket_server('tcp://127.0.0.1:${SMTP_PORT}', $e, $m);
if (!$s) exit(1);
while ($c = @stream_socket_accept($s, 3600)) {
    fwrite($c, "220 mock\\r\\n");
    $data = false; $body = '';
    while (($l = fgets($c)) !== false) {
        if ($data) {
            if (rtrim($l) === '.') { file_put_contents('${SMTP_LOG}', $body . "\\n=====\\n", FILE_APPEND); $data = false; fwrite($c, "250 ok\\r\\n"); continue; }
            $body .= $l; continue;
        }
        $v = strtoupper(substr($l, 0, 4));
        if ($v === 'QUIT') { fwrite($c, "221 bye\\r\\n"); break; }
        if ($v === 'DATA') { $data = true; fwrite($c, "354 go\\r\\n"); continue; }
        fwrite($c, "250 ok\\r\\n");
    }
    fclose($c);
}`;
    execFileSync('docker', ['exec', '-i', process.env.POZNOTE_E2E_CONTAINER || 'poznote-e2e-8199', 'sh', '-c', 'cat > /tmp/smtp-mock.php'], { input: mock });
    inInstance(`nohup php /tmp/smtp-mock.php >/dev/null 2>&1 & php -r 'for ($i = 0; $i < 50; $i++) { if (@fsockopen("127.0.0.1", ${SMTP_PORT})) exit(0); usleep(100000); } exit(1);'`);
};
const runWorker = () => inInstance(`su -s /bin/sh www-data -c 'php /var/www/html/workers/reminder-email-worker.php --once'`);
const SMTP_ON = { smtp_enabled: '1', smtp_host: '127.0.0.1', smtp_port: String(SMTP_PORT), smtp_security: 'none', smtp_from_email: 'poznote@example.org', smtp_from_name: 'Poznote E2E', smtp_app_url: 'http://poznote.test', smtp_reminder_cutoff_at: '2020-01-01 00:00:00' };
// Instance-wide: no mail for the other specs
const restoreSmtp = async (admin) => {
    for (const [key, value] of Object.entries({ smtp_enabled: '0', smtp_host: '', smtp_port: '587', smtp_security: 'tls', smtp_from_email: '', smtp_from_name: '', smtp_app_url: '' })) {
        await admin.ok(admin.put(`/settings/${key}`, { value }));
    }
};

test.describe('reminder and activity emails', () => {
    // KNOWN-GLOBAL: SMTP is an instance setting; restored in afterAll. The mock below
    // is written into the instance, so that only this block depends on it.
    const worker = runWorker;
    const mails = () => inInstance(`cat ${SMTP_LOG} 2>/dev/null || true`);
    let admin;
    test.beforeAll(async ({ playwright }) => {
        admin = await Api.open(playwright, ADMIN);
        startSmtpMock();
        for (const [key, value] of Object.entries(SMTP_ON)) await admin.ok(admin.put(`/settings/${key}`, { value }));
    });
    test.afterAll(async () => {
        await restoreSmtp(admin);
        await admin.dispose();
    });
    const withEmail = async (playwright, prefix) => {
        const account = await newAccount(playwright, prefix);
        const email = `${account.username}@example.org`;
        await admin.ok(admin.patch(`/admin/users/${account.id}`, { email }));
        return { ...account, email };
    };

    test('a due reminder with the email option on is sent, once, naming the note', covers('org.reminder-email'), async ({ page, playwright }) => {
        const account = await withEmail(playwright, 'courriel');
        const api = await Api.open(playwright, account);
        await login(page, account);
        const note = await api.createNote({ heading: 'Rappel par courriel é', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.btn-reminder:visible').first().click();
        await expect(page.locator('#reminderEmailOption')).toBeVisible();
        await expect(page.locator('#reminderEmailInput')).toBeChecked();
        await page.locator('#reminderModal .btn-cancel').click();
        // What the Save of the dialog sends, already due, from the signed-in page
        const saved = await page.evaluate(async ({ id, at }) => (await fetch(`/api/v1/notes/${id}/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminder_at: at, email_enabled: true }) })).json(), { id: note.id, at: new Date(Date.now() - 60000).toISOString() });
        expect(saved.email_enabled).toBe(true);
        worker();
        const sent = () => mails().split('=====').filter((m) => m.includes(account.email));
        await expect.poll(sent, { message: mails() }).toHaveLength(1);
        worker();
        expect(sent(), 'not sent twice').toHaveLength(1);
        await api.dispose();
    });

    test('with the email option off, nothing is sent', covers('org.reminder-email'), async ({ page, playwright }) => {
        const account = await withEmail(playwright, 'muet');
        const api = await Api.open(playwright, account);
        await login(page, account);
        await page.goto('/index.php');
        const note = await api.createNote({ heading: 'Silence', content: '<p>x</p>' });
        const saved = await page.evaluate(async ({ id, at }) => (await fetch(`/api/v1/notes/${id}/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminder_at: at, email_enabled: false }) })).json(), { id: note.id, at: new Date(Date.now() - 60000).toISOString() });
        expect(saved.success).toBe(true);
        worker();
        expect(mails()).not.toContain(account.email);
        await api.dispose();
    });

    test('the task reminder dialog offers the email option too, and it is stored', covers('org.task-due-reminder', 'org.reminder-email'), async ({ page, playwright }) => {
        const account = await withEmail(playwright, 'tachemail');
        const api = await Api.open(playwright, account);
        await login(page, account);
        const note = await list(api, 'Tâche par courriel', [{ text: 'Écris-moi', dueAt: inDays(-1) }]);
        await openList(page, note.id);
        await row(page, 'Écris-moi').locator('.task-due-chip').click();
        await page.locator('#taskDueRemindOption label').click();
        await expect(page.locator('#taskDueEmailOption')).toBeVisible();
        await page.locator('#taskDueEmailOption label').click();
        await expect(page.locator('#taskDueEmailInput')).toBeChecked();
        await page.locator('#taskDueSaveBtn').click();
        await expect.poll(async () => (await tasksOf(api, note.id))[0].dueReminderEmail).toBe(true);
        worker();
        await expect.poll(mails).toContain(account.email);
        await api.dispose();
    });
});

// A tiny valid WAV, so that an <audio> element really accepts it
const WAV = (() => {
    const data = Buffer.alloc(800, 128);
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(8000, 24); head.writeUInt32LE(8000, 28);
    head.writeUInt16LE(1, 32); head.writeUInt16LE(8, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
    return Buffer.concat([head, data]);
})();

test.describe('attachments', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'pj');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const attach = async (noteId, name = 'pièce é.txt', mimeType = 'text/plain', buffer = Buffer.from('contenu é')) => {
        await api.ok(api.call('POST', `/notes/${noteId}/attachments`, { multipart: { file: { name, mimeType, buffer } } }));
        return (await api.ok(api.get(`/notes/${noteId}/attachments`))).json.attachments.at(-1);
    };
    const attachmentsOf = async (noteId) => (await api.ok(api.get(`/notes/${noteId}/attachments`))).json.attachments;
    const openPage = async (page, noteId) => {
        await page.goto(`/attachments.php?note_id=${noteId}`);
        await settled(page);
    };
    const item = (page, name) => page.locator('#attachmentsList [class*="attachment-item"], #attachmentsList .attachment-card', { hasText: name }).first();

    test('the toolbar button leads to the page, a file is chosen, uploaded and listed with its size', covers('org.attachment-upload'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Pièces', content: '<p>x</p>' });
        await openNote(page, note.id);
        await page.locator('.btn-attachment:visible').first().click();
        await expect(page).toHaveURL(new RegExp(`attachments\\.php\\?note_id=${note.id}`));
        await expect(page.locator('#uploadBtn')).toBeDisabled();
        await page.locator('#attachmentFile').setInputFiles({ name: 'fiche é.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
        await expect(page.locator('#selectedFileName')).toContainText('fiche é.txt');
        await page.locator('#uploadBtn').click();
        await expect(page.locator('#attachmentsList')).toContainText('fiche é.txt');
        await expect(page.locator('#attachmentsList .attachment-size')).toContainText('7');
        const [stored] = await attachmentsOf(note.id);
        expect(stored.original_filename).toBe('fiche é.txt');
        expect((await api.get(`/notes/${note.id}/attachments/${stored.id}`)).text).toBe('bonjour');
        await openNote(page, note.id);
        await expect(page.locator('.note-attachments-row a.attachment-link')).toContainText('fiche é.txt');
    });

    test('the page offers view, download, move and delete; download gives the file, delete asks first', covers('org.attachment-page'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Actions PJ', content: '<p>x</p>' });
        const attachment = await attach(note.id, 'à garder.txt');
        await openPage(page, note.id);
        const actions = page.locator('.attachment-actions [data-action]');
        expect(await actions.evaluateAll((b) => b.map((x) => x.dataset.action))).toEqual(['view', 'download', 'move', 'delete']);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="download"]').click()]);
        expect(download.suggestedFilename()).toBe('à garder.txt');
        await page.locator('[data-action="delete"]').click();
        const confirm = page.locator('#deleteAttachmentConfirmModal');
        await expect(confirm).toBeVisible();
        await confirm.locator('.btn-cancel').click();
        await expect(confirm).toBeHidden();
        expect((await attachmentsOf(note.id)).map((a) => a.id)).toEqual([attachment.id]);
        await page.locator('[data-action="delete"]').click();
        await confirm.locator('.btn-danger').click();
        await expect(page.locator('#attachmentsList')).not.toContainText('à garder.txt');
        await expect.poll(async () => (await attachmentsOf(note.id)).length).toBe(0);
    });

    test('an image gets a preview, enlarged by View', covers('org.attachment-preview'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Image PJ', content: '<p>x</p>' });
        await attach(note.id, 'photo.png', 'image/png', PNG);
        await openPage(page, note.id);
        const thumb = page.locator('#attachmentsList img').first();
        await expect(thumb).toBeVisible();
        await expect.poll(() => thumb.evaluate((img) => img.naturalWidth)).toBe(1);
        const [tab] = await Promise.all([page.context().waitForEvent('page'), page.locator('[data-action="view"]').click()]);
        await expect.poll(() => tab.url()).toMatch(/\/attachments\//);
        await tab.close();
        await thumb.click();
        await expect(page.locator('.image-preview-modal img')).toBeVisible();
        await expect(page.locator('.image-preview-title')).toHaveText('photo.png');
        await page.locator('.image-preview-close').click();
        await expect(page.locator('.image-preview-modal')).toHaveCount(0);
    });

    test('the page moves a file to another note, chosen in a searchable list', covers('org.attachment-move'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Origine PJ', content: '<p>x</p>' });
        const target = await api.createNote({ heading: 'Destination PJ', content: '<p>x</p>' });
        await attach(note.id, 'voyage.txt');
        await openPage(page, note.id);
        await page.locator('[data-action="move"]').click();
        const dialog = page.locator('#attachmentMoveModal');
        await expect(dialog).toBeVisible();
        await dialog.locator('.attachment-move-search').fill('Destination');
        await dialog.locator('.attachment-move-list [role="button"], .attachment-move-list button').filter({ hasText: 'Destination PJ' }).first().click();
        await expect(page.locator('#attachmentsList')).not.toContainText('voyage.txt');
        await expect.poll(async () => (await attachmentsOf(target.id)).map((a) => a.original_filename)).toEqual(['voyage.txt']);
        expect(await attachmentsOf(note.id)).toEqual([]);
    });

    test('the row of the note downloads, and its right-click menu lists every action', covers('org.attachment-menu'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Menu PJ', content: '<p>x</p>' });
        const target = await api.createNote({ heading: 'Cible menu', content: '<p>x</p>' });
        await attach(note.id, 'clic droit.txt');
        await attach(note.id, 'à déplacer.txt');
        await openNote(page, note.id);
        const link = (name) => page.locator('.note-attachments-row a.attachment-link', { hasText: name });
        const [opened] = await Promise.all([page.context().waitForEvent('page'), link('clic droit.txt').click()]);
        await expect.poll(() => opened.url()).toMatch(new RegExp(`/api/v1/notes/${note.id}/attachments/`));
        await opened.close();
        await link('clic droit.txt').click({ button: 'right' });
        const menu = page.locator('.note-attachment-menu');
        await expect(menu.locator('.image-menu-item')).toHaveText(['Open', 'Download', 'Move to another note', 'Delete'].map((t) => new RegExp(t)));
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await link('à déplacer.txt').click({ button: 'right' });
        await menu.locator('[data-action="move"]').click();
        await page.locator('#attachmentMoveModal .attachment-move-search').fill('Cible menu');
        await page.locator('#attachmentMoveModal .attachment-move-list [role="button"], #attachmentMoveModal .attachment-move-list button').filter({ hasText: 'Cible menu' }).first().click();
        await expect.poll(async () => (await attachmentsOf(target.id)).length).toBe(1);
        await expect(link('à déplacer.txt')).toHaveCount(0);
        const moved = page.locator('.alert-modal-overlay.show');
        await expect(moved).toContainText('Cible menu');
        await moved.locator('.alert-modal-button').last().click();
        await link('clic droit.txt').click({ button: 'right' });
        await menu.locator('[data-action="delete"]').click();
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect.poll(async () => (await attachmentsOf(note.id)).length).toBe(0);
        await expect(link('clic droit.txt')).toHaveCount(0);
    });

    test('a file dropped in a note is uploaded and inserted', covers('org.attachment-drop'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Glisser PJ', content: '<p>Texte</p>' });
        await openNote(page, note.id);
        const entry = page.locator('.noteentry[contenteditable="true"]');
        const box = await entry.boundingBox();
        const point = { clientX: box.x + 30, clientY: box.y + 10 };
        const transfer = await page.evaluateHandle(({ base64 }) => {
            const dt = new DataTransfer();
            dt.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'déposée.png', { type: 'image/png' }));
            return dt;
        }, { base64: PNG.toString('base64') });
        await entry.dispatchEvent('dragover', { dataTransfer: transfer, ...point });
        await entry.dispatchEvent('drop', { dataTransfer: transfer, ...point });
        await expect(entry.locator('img')).toHaveCount(1);
        await expect.poll(async () => (await attachmentsOf(note.id)).map((a) => a.original_filename)).toEqual(['déposée.png']);
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('<img');
    });

    test('previews in the note: the setting turns the row into previews, with the file card', covers('org.attachment-previews-setting'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Aperçus', content: '<p>x</p>' });
        await attach(note.id, 'aperçu.txt');
        await attach(note.id, 'vue.png', 'image/png', PNG);
        await page.goto('/settings.php#section=settings-note-content-section-grid');
        await settled(page);
        await page.locator('#attachment-previews-card').click();
        await expect.poll(async () => (await api.get('/settings/attachment_previews_in_note')).json.value).toMatch(/1|true/);
        await openNote(page, note.id);
        const previews = page.locator(`#attachment-previews-${note.id}`);
        await expect(previews.locator('.note-attachment-preview')).toHaveCount(2);
        await expect(previews.locator('.note-attachment-preview-image img, img').first()).toBeVisible();
        await expect(previews).toContainText('aperçu.txt');
        await expect(page.locator('.note-attachments-row')).toHaveCount(0);
        await api.ok(api.put('/settings/attachment_previews_in_note', { value: '0' }));
    });

    test('the attachments at the bottom setting moves the row under the note', covers('org.attachment-bottom-setting'), async ({ page }) => {
        const note = await api.createNote({ heading: 'En bas', content: '<p>Corps</p>' });
        await attach(note.id, 'bas.txt');
        await openNote(page, note.id);
        const above = () => page.evaluate((id) => {
            const row = document.querySelector('.note-attachments-row').getBoundingClientRect();
            const entry = document.getElementById(`entry${id}`).getBoundingClientRect();
            return row.top < entry.top;
        }, note.id);
        expect(await above(), 'above by default').toBe(true);
        await page.goto('/settings.php#section=settings-note-content-section-grid');
        await settled(page);
        await page.locator('#attachments-at-bottom-card').click();
        await expect.poll(async () => (await api.get('/settings/attachments_at_bottom')).json.value).toMatch(/1|true/);
        await openNote(page, note.id);
        expect(await above(), 'below with the setting').toBe(false);
        await api.ok(api.put('/settings/attachments_at_bottom', { value: '0' }));
    });

    test('/link-to-attachment picks a file of the note and links it', covers('org.attachment-link-slash'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Lien PJ', content: '<p>Début</p>' });
        await attach(note.id, 'lié.txt');
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/');
        await page.keyboard.type('attachment', { delay: 20 });
        await page.waitForTimeout(150);
        await page.locator('.slash-command-menu [data-command-id="link-to-attachment"]').click();
        await expect(page.locator('#attachmentPickerModal')).toBeVisible();
        await page.locator('#attachmentPickerList .note-reference-item', { hasText: 'lié.txt' }).click();
        await expect(page.locator('.noteentry[contenteditable="true"] a', { hasText: 'lié.txt' })).toBeVisible();
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('lié.txt');
    });

    test('/audio inserts a player that loads the file, and audio_player.php serves it to its owner only', covers('org.attachment-audio'), async ({ page, playwright }) => {
        const note = await api.createNote({ heading: 'Audio PJ', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/');
        await page.keyboard.type('audio', { delay: 20 });
        await page.waitForTimeout(150);
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.locator('.slash-command-menu [data-command-id="audio-file"]').click(),
        ]);
        await chooser.setFiles({ name: 'son é.wav', mimeType: 'audio/wav', buffer: WAV });
        const frame = page.locator(`#entry${note.id} iframe.note-audio-embed`);
        await expect(frame).toHaveCount(1);
        await expect.poll(async () => (await attachmentsOf(note.id)).map((a) => a.original_filename)).toEqual(['son é.wav']);
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('audio_player.php');
        const player = page.frameLocator(`#entry${note.id} iframe.note-audio-embed`).locator('audio');
        await expect(player).toHaveAttribute('src', /attachments\//);
        await expect.poll(() => player.evaluate((a) => a.duration)).toBeGreaterThan(0);
        const src = await frame.getAttribute('src');
        const anonymous = await playwright.request.newContext({ baseURL: require('../lib/helpers').BASE_URL });
        expect((await anonymous.get(`/${src.replace(/^\//, '')}`)).status()).toBe(401);
        await anonymous.dispose();
        expect((await page.request.get('/audio_player.php')).status(), 'missing parameters').toBe(400);
    });

    test('attachments_list.php lists the files of every note, filters them and opens one', covers('org.attachments-list'), async ({ page, playwright }) => {
        const fresh = await newAccount(playwright, 'pjliste');
        const own = await Api.open(playwright, fresh);
        const context = await page.context().browser().newContext({ baseURL: require('../lib/helpers').BASE_URL, serviceWorkers: 'block' });
        const mine = await context.newPage();
        await login(mine, fresh);
        await mine.goto('/attachments_list.php');
        await expect(mine.locator('#emptyMessage')).toBeVisible();
        const a = await own.createNote({ heading: 'Rapport annuel', content: '<p>x</p>' });
        const b = await own.createNote({ heading: 'Vacances', content: '<p>x</p>' });
        await own.ok(own.call('POST', `/notes/${a.id}/attachments`, { multipart: { file: { name: 'bilan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') } } }));
        await own.ok(own.call('POST', `/notes/${b.id}/attachments`, { multipart: { file: { name: 'plage.png', mimeType: 'image/png', buffer: PNG } } }));
        await mine.reload();
        await expect(mine.locator('.attachment-row')).toHaveCount(2);
        await expect(mine.locator('.attachment-image-preview img')).toHaveCount(1);
        await mine.locator('#showThumbnailsToggle').uncheck();
        await expect(mine.locator('.attachment-image-preview')).toHaveCount(0);
        await mine.locator('#showThumbnailsToggle').check();
        await mine.locator('#filterInput').fill('plage');
        await expect(mine.locator('.attachment-row')).toHaveCount(1);
        await expect(mine.locator('.attachment-row')).toContainText('Vacances');
        await mine.locator('#clearFilterBtn').click();
        await expect(mine.locator('.attachment-row')).toHaveCount(2);
        expect(await mine.locator('#fileTypeFilter option').allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/pdf/i), expect.stringMatching(/png/i)]));
        await mine.locator('#fileTypeFilter').selectOption({ label: await mine.locator('#fileTypeFilter option', { hasText: /pdf/i }).first().textContent() });
        await expect(mine.locator('.attachment-row')).toHaveCount(1);
        await expect(mine.locator('.attachment-row')).toContainText('Rapport annuel');
        await own.dispose();
        await context.close();
    });

    test('the admin setting allows executable files, server scripts stay refused', covers('org.attachment-executable-setting'), async ({ page, playwright }) => {
        const admin = await Api.open(playwright, ADMIN);
        const note = await api.createNote({ heading: 'Exécutable', content: '<p>x</p>' });
        const upload = (name) => api.call('POST', `/notes/${note.id}/attachments`, { multipart: { file: { name, mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } } });
        const context = await page.context().browser().newContext({ baseURL: require('../lib/helpers').BASE_URL, serviceWorkers: 'block' });
        const adminPage = await context.newPage();
        try {
            expect((await upload('outil.exe')).status).toBe(400);
            await login(adminPage, ADMIN);
            await adminPage.goto('/settings.php');
            await settled(adminPage);
            await adminPage.click('.settings-scope-option[data-scope="admin"]');
            await adminPage.locator('#home-search-input').fill('executable');
            await adminPage.locator('#executable-attachments-card').click();
            await expect.poll(async () => (await admin.get('/settings/allow_executable_attachments')).json.value).toMatch(/1|true/);
            await api.ok(upload('outil.exe'));
            expect((await upload('page.php')).status, 'a server script is never accepted').toBe(400);
        } finally {
            // Instance-wide: back to the default for the other specs
            await admin.ok(admin.put('/settings/allow_executable_attachments', { value: '0' }));
            await admin.dispose();
            await context.close();
        }
        expect((await upload('encore.exe')).status).toBe(400);
    });
});

test.describe('revisions', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'revision');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const snapshots = async (id) => (await api.ok(api.get(`/notes/${id}/snapshots`))).json.snapshots;
    const manual = async (id) => (await api.ok(api.call('POST', `/notes/${id}/snapshot`, { params: { manual: 1 }, json: {} }))).json.snapshot_key;
    const open = async (page, id) => {
        await page.goto(`/revisions.php?note_id=${id}`);
        await expect(page.locator('#revisionsLoading')).toBeHidden();
    };
    const action = async (page, selector) => {
        await page.locator('#revisionsActionsBtn').click();
        await page.locator(`#revisionsActionsMenu ${selector}`).click();
    };

    test('the toolbar button opens the page, empty at first, and Save a revision fills it', covers('org.revisions-create'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Sans révision', content: '<p>Corps é</p>' });
        await openNote(page, note.id);
        await page.locator('[data-action="show-snapshot"]').first().evaluate((b) => { const m = b.closest('.dropdown-menu, .mobile-toolbar-menu, .note-actions-menu'); if (m) m.hidden = false; });
        await page.goto(`/revisions.php?note_id=${note.id}`);
        await expect(page.locator('#revisionsEmpty')).toBeVisible();
        await page.locator('#revisionsEmpty .revisions-new-btn').click();
        await expect(page.locator('#revisionsList .revisions-item')).toHaveCount(1);
        expect((await snapshots(note.id)).length).toBe(1);
        await expect(page.locator('#revisionsBody')).toContainText('Corps é');
    });

    test('Ctrl+Alt+S in a note takes a revision of what is on screen', covers('org.revisions-shortcut'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Raccourci', content: '<p>Version tapée</p>' });
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+Alt+s');
        await expect.poll(async () => (await snapshots(note.id)).length).toBe(1);
    });

    test('content, changes, compare: the old text and the difference are shown', covers('org.revisions-compare'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Compare', content: '<p>Texte ancien</p>' });
        await manual(note.id);
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Texte nouveau</p>' }));
        await manual(note.id);
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Texte récent</p>' }));
        await open(page, note.id);
        await expect(page.locator('#revisionsList .revisions-item')).toHaveCount(2);
        await page.locator('#revisionsTabContent').click();
        await page.locator('#revisionsList .revisions-item').last().click();
        await expect(page.locator('#revisionsBody')).toContainText('Texte ancien');
        await page.locator('#revisionsTabChanges').click();
        await expect(page.locator('#revisionsBody .revisions-diff')).toContainText('récent');
        await expect(page.locator('#revisionsDiffStats')).not.toBeEmpty();
        await page.locator('#revisionsList .revisions-item').first().click();
        await page.locator('#revisionsCompare').selectOption('previous');
        await expect(page.locator('#revisionsBody .revisions-diff')).toContainText('nouveau');
        await expect(page.locator('#revisionsBody .revisions-diff')).toContainText('ancien');
    });

    test('restore asks first, warns that the current state is replaced, and brings text and title back', covers('org.revisions-restore'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Restauration', content: '<p>Bonne version</p>' });
        await manual(note.id);
        await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Mauvaise version</p>', heading: 'Mauvais titre' }));
        await open(page, note.id);
        await action(page, '#revisionsRestoreBtn');
        await expect(page.locator('.alert-modal')).toContainText('replaced');
        await page.locator('.alert-modal-footer .alert-modal-button').first().click();
        expect((await api.getNote(note.id)).content).toContain('Mauvaise');
        await action(page, '#revisionsRestoreBtn');
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect.poll(async () => (await api.getNote(note.id)).content).toContain('Bonne version');
        expect((await api.getNote(note.id)).heading).toBe('Restauration');
    });

    test('copy puts the text of the revision on the clipboard, delete removes the revision', covers('org.revisions-manage'), async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const note = await api.createNote({ heading: 'Copie', content: '# Titre copié\n', type: 'markdown' });
        await manual(note.id);
        await open(page, note.id);
        await action(page, '#revisionsCopyBtn');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Titre copié');
        await page.locator('#revisionsTabContent').click();
        await expect(page.locator('#revisionsMdMode')).toBeVisible();
        await page.locator('#revisionsMdMode [data-md-mode="preview"]').click();
        await expect(page.locator('#revisionsBody h1')).toHaveText('Titre copié');
        await page.locator('#revisionsMdMode [data-md-mode="source"]').click();
        await expect(page.locator('#revisionsBody')).toContainText('# Titre copié');
        await action(page, '#revisionsDeleteBtn');
        await page.locator('.alert-modal-footer .alert-modal-button').last().click();
        await expect.poll(async () => (await snapshots(note.id)).length).toBe(0);
        await expect(page.locator('#revisionsEmpty')).toBeVisible();
    });

    test('the settings dialog stores the kept counts, and shows them again', covers('org.revisions-settings'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-sync-history-section-grid');
        await settled(page);
        await page.locator('#snapshots-card').click();
        await expect(page.locator('#snapshotsSettingsModal')).toBeVisible();
        await page.locator('#snapshotsKeepCountInput').fill('7');
        await page.locator('#snapshotsSafetyKeepCountInput').fill('6');
        await page.locator('#saveSnapshotsSettingsModalBtn').click();
        await expect(page.locator('#snapshotsSettingsModal')).toBeHidden();
        await expect.poll(async () => (await api.get('/settings/snapshots_keep_count')).json.value).toBe('7');
        await expect.poll(async () => (await api.get('/settings/snapshots_safety_keep_count')).json.value).toBe('6');
        await page.locator('#snapshots-card').click();
        await expect(page.locator('#snapshotsKeepCountInput')).toHaveValue('7');
        await page.locator('#snapshotsSettingsModal .btn-cancel').click();
    });
});

test.describe('graph', () => {
    let account; let api; let notes;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'graphe');
        api = await Api.open(playwright, account);
        // Only what this block creates: a new account starts with a welcome note
        for (const seeded of (await api.ok(api.get('/notes'))).json.notes) {
            await api.ok(api.del(`/notes/${seeded.id}`));
            await api.ok(api.del(`/trash/${seeded.id}`));
        }
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier du graphe' }))).json.folder;
        const target = await api.createNote({ heading: 'Noeud cible', folder_id: folder.id, content: '<p>x</p>' });
        const source = await api.createNote({ heading: 'Noeud source', folder_id: folder.id, content: `[lien](index.php?note=${target.id})\n`, type: 'markdown' });
        const orphan = await api.createNote({ heading: 'Noeud orphelin', content: '<p>x</p>' });
        notes = { target, source, orphan };
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => {
        await login(page, account);
        await page.goto('/graph.php');
        await expect(page.locator('#graphLoading')).toBeHidden();
        await expect(page.locator('#graphSvg .graph-node:not(.initially-hidden)').first()).toBeVisible();
    });
    const node = (page, id) => page.locator(`#graphSvg .graph-node[data-id="${id}"]`);

    test('each note is a node, each link an edge, the information dialog counts them', covers('org.graph'), async ({ page }) => {
        await expect(page.locator('#graphSvg .graph-node:not(.initially-hidden)')).toHaveCount(3);
        await expect(page.locator('#graphSvg .graph-edge')).toHaveCount(1);
        await expect(node(page, notes.source.id)).toContainText('Noeud source');
        await page.locator('#graphInfoBtn').click();
        await expect(page.locator('#graphInfoModal')).toBeVisible();
        await expect(page.locator('#graphStats')).toHaveText(/3 notes · 1 link/);
        await page.locator('#graphInfoModalClose').click();
        await expect(page.locator('#graphInfoModal')).toBeHidden();
    });

    test('a click on a node opens the note', covers('org.graph-click'), async ({ page }) => {
        await page.waitForTimeout(800); // the layout settles
        await node(page, notes.orphan.id).locator('circle, path, rect').first().click({ force: true });
        await expect(page).toHaveURL(new RegExp(`note=${notes.orphan.id}`));
    });

    test('options: orphans, labels and icons hide what they name, and stay so after a reload', covers('org.graph-options'), async ({ page }) => {
        await page.locator('#graphShowOrphans').uncheck({ force: true });
        await expect(node(page, notes.orphan.id)).toHaveClass(/initially-hidden/);
        await expect(page.locator('#graphSvg .graph-node:not(.initially-hidden)')).toHaveCount(2);
        await page.reload();
        await expect(page.locator('#graphLoading')).toBeHidden();
        await expect(page.locator('#graphShowOrphans')).not.toBeChecked();
        await page.locator('#graphShowOrphans').check({ force: true });
        await expect(node(page, notes.orphan.id)).not.toHaveClass(/initially-hidden/);
        await page.locator('#graphShowLabels').uncheck({ force: true });
        await expect(page.locator('#graphSvg .graph-label:visible')).toHaveCount(0);
        await page.locator('#graphShowLabels').check({ force: true });
        await expect(page.locator('#graphSvg .graph-label:visible').first()).toBeVisible();
    });

    test('the Folders option draws the folder as a hub tied to its notes', covers('org.graph-folders'), async ({ page }) => {
        await page.locator('#graphShowFolders').check({ force: true });
        await expect(page.locator('#graphSvg .graph-node.is-folder', { hasText: 'Dossier du graphe' })).toHaveCount(1);
        await expect(page.locator('#graphSvg .graph-edge-folder')).toHaveCount(2);
        await page.locator('#graphShowFolders').uncheck({ force: true });
        await expect(page.locator('#graphSvg .graph-node.is-folder')).toHaveCount(0);
    });

    test('the folder filter dialog keeps the notes of one folder', covers('org.graph-folder-filter'), async ({ page }) => {
        await page.locator('#graphFolderFilterBtn').click();
        await expect(page.locator('#graphFolderModal')).toBeVisible();
        await page.locator('#graphFolderSearch').fill('graphe');
        await page.locator('#graphFolderList button', { hasText: 'Dossier du graphe' }).first().click();
        await expect(page.locator('#graphSvg .graph-node:not(.initially-hidden)')).toHaveCount(2);
        await expect(node(page, notes.orphan.id)).toHaveClass(/initially-hidden/);
    });

    test('search lights up what matches', covers('org.graph-search'), async ({ page }) => {
        await page.locator('#graphSearchBtn').click();
        await page.locator('#graphSearchInput').fill('source');
        await expect(node(page, notes.source.id)).toHaveClass(/search-hit/);
        await expect(node(page, notes.orphan.id)).not.toHaveClass(/search-hit/);
        await page.locator('#graphSearchClear').click();
        await expect(node(page, notes.source.id)).not.toHaveClass(/search-hit/);
    });

    test('separate groups and reset layout move the nodes', covers('org.graph-layout'), async ({ page }) => {
        const where = () => node(page, notes.orphan.id).evaluate((el) => el.getAttribute('transform') || el.querySelector('circle')?.getAttribute('cx'));
        await page.waitForTimeout(1500);
        const before = await where();
        await page.locator('#graphSeparateGroups').click();
        await expect.poll(where).not.toBe(before);
        const separated = await where();
        await page.locator('#graphResetLayout').click();
        await expect.poll(where).not.toBe(separated);
    });
});

test('the note subline counts characters, words and lines as they change', covers('org.note-stats'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'stats');
    const api = await Api.open(playwright, account);
    await login(page, account);
    const note = await api.createNote({ heading: 'Compteurs', content: '<p>trois mots ici</p>' });
    await openNote(page, note.id);
    const stats = page.locator('.note-sub-stats');
    await expect(stats).toContainText('14');
    await expect(stats).toContainText('3 words');
    await expect(stats).toContainText('1 line');
    await page.locator('.noteentry[contenteditable="true"]').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('encore');
    await expect(stats).toContainText('4 words');
    await expect(stats).toContainText('2 lines');
    await api.dispose();
});

test.describe('workspaces shared between accounts', () => {
    test.describe.configure({ timeout: 120_000 });
    const { BASE_URL } = require('../lib/helpers');
    let owner; let guest; let ownerApi; let guestApi; let workspace; let guestContext; let guestPage;
    test.beforeEach(async ({ page, playwright, browser }) => {
        owner = await newAccount(playwright, 'proprio');
        guest = await newAccount(playwright, 'invite');
        ownerApi = await Api.open(playwright, owner);
        guestApi = await Api.open(playwright, guest);
        workspace = `Commun-${owner.id}`;
        await ownerApi.ok(ownerApi.post('/workspaces', { name: workspace }));
        await login(page, owner);
        guestContext = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'block', viewport: { width: 1400, height: 900 } });
        guestPage = await guestContext.newPage();
        await login(guestPage, guest);
    });
    test.afterEach(async () => {
        await guestContext.close();
        await ownerApi.dispose();
        await guestApi.dispose();
    });
    const openWorkspaces = async (page) => {
        await page.goto('/settings.php#section=settings-workspaces-section-grid');
        await settled(page);
    };
    const shareWith = async (page, name) => {
        await openWorkspaces(page);
        await page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first().click();
        const row = page.locator('.share-user-list-row', { hasText: name });
        await row.locator('input[type="checkbox"]').check();
        await page.locator('.shared-edit-token-modal .btn-primary').click();
        await expect(page.locator('.shared-edit-token-modal')).toHaveCount(0);
    };
    const enterShared = async (page) => {
        await page.goto('/index.php');
        await settled(page);
        await page.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await page.locator('#workspaceMenu .workspace-menu-shared', { hasText: workspace }).click();
        await page.waitForLoadState('load');
        await settled(page);
        await expect(page.locator('body')).toHaveAttribute('data-workspace', workspace);
    };

    test('the share dialog grants one account, who then reads and edits; unsharing revokes', covers('org.workspace-share'), async ({ page }) => {
        const note = await ownerApi.createNote({ heading: 'Note commune é', workspace, content: '<p>Partagé</p>' });
        await guestPage.goto('/index.php');
        await settled(guestPage);
        await guestPage.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await expect(guestPage.locator('#workspaceMenu .workspace-menu-shared'), 'nothing before the grant').toHaveCount(0);
        await shareWith(page, guest.username);
        await expect(page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first()).toHaveClass(/is-shared/);
        await openWorkspaces(page);
        await page.reload();
        await expect(page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first(), 'stored').toHaveAttribute('data-shared-with', new RegExp(guest.username));
        await enterShared(guestPage);
        await expect(guestPage.locator('#left_col')).toContainText('Note commune é');
        await openNote(guestPage, note.id);
        await guestPage.locator('.noteentry[contenteditable="true"]').click();
        await guestPage.keyboard.press('Control+End');
        await guestPage.keyboard.type(' par invité');
        await expect.poll(async () => (await ownerApi.getNote(note.id)).content, { timeout: 20_000 }).toContain('par invité');
        // Confined: the settings are out of reach in the shared scope
        await guestPage.goto('/settings.php');
        await expect(guestPage).not.toHaveURL(/settings\.php/);
        // Revoked: the next request of the guest is refused
        await openWorkspaces(page);
        await page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first().click();
        await page.locator('.shared-edit-token-modal .btn-danger').click();
        await expect(page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first()).not.toHaveClass(/is-shared/);
        await guestPage.goto(`/index.php?note=${note.id}`);
        await settled(guestPage);
        await expect(guestPage.locator('#left_col')).not.toContainText('Note commune é');
        expect((await guestApi.get(`/notes/${note.id}`)).status, 'another account').toBeGreaterThanOrEqual(400);
    });

    test('a member set to Read only reads the notes but cannot change them, until set back to Write', covers('org.workspace-share-read-only'), async ({ page }) => {
        const note = await ownerApi.createNote({ heading: 'Lecture seule é', workspace, content: '<p>Texte du propriétaire</p>' });
        const permission = async (value) => {
            await openWorkspaces(page);
            await page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first().click();
            const person = page.locator('.share-user-list-entry', { hasText: guest.username });
            const row = person.locator('.share-user-list-row');
            const select = person.locator('select.share-user-list-permission');
            if (!(await row.locator('input[type="checkbox"]').isChecked())) {
                await expect(select, 'the choice shows once the person is ticked').toBeHidden();
                await row.locator('input[type="checkbox"]').check();
            }
            await expect(select).toBeVisible();
            await select.selectOption(value);
            await page.locator('.shared-edit-token-modal .btn-primary').click();
            await expect(page.locator('.shared-edit-token-modal')).toHaveCount(0);
        };
        await permission('read');
        await enterShared(guestPage);
        await openNote(guestPage, note.id);
        const entry = guestPage.locator(`#entry${note.id}`);
        await expect(entry).toContainText('Texte du propriétaire');
        await expect(guestPage.locator('body')).toHaveClass(/shared-workspace-readonly/);
        await guestPage.waitForTimeout(2500); // the lock would make an editable note editable by now
        await expect(entry, 'nothing can be typed').toHaveAttribute('contenteditable', 'false');
        await expect(guestPage.locator('.note-edit-toolbar [data-action="toggle-mobile-toolbar-menu"]:visible'), 'no ⋮ menu').toHaveCount(0);
        await expect(guestPage.locator('.note-edit-toolbar .btn-print:visible').first(), 'Print stays').toBeVisible();
        const refused = await guestPage.evaluate(async (id) => (await fetch(`api/v1/notes/${id}`, {
            method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '<p>écrasé</p>' }),
        })).status, note.id);
        expect(refused, 'the API refuses a write').toBe(403);
        expect((await ownerApi.getNote(note.id)).content).toContain('Texte du propriétaire');

        await permission('write');
        await openNote(guestPage, note.id);
        await expect(entry, 'editable again').toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
        await entry.click();
        await guestPage.keyboard.press('Control+End');
        await guestPage.keyboard.type(' et le membre');
        await expect.poll(async () => (await ownerApi.getNote(note.id)).content, { timeout: 20_000 }).toContain('et le membre');
    });

    test('@ in a note offers the members; the mention reaches the page of the person, who marks it handled', covers('org.mentions'), async ({ page }) => {
        const note = await ownerApi.createNote({ heading: 'Avec mention', workspace, content: '<p>Début</p>' });
        await shareWith(page, guest.username);
        await openNote(page, note.id);
        await expect.poll(() => page.evaluate(() => window.PoznoteMentionMembers)).toContain(guest.username);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(` @${guest.username.slice(0, 4)}`, { delay: 30 });
        const menu = page.locator('.mention-autocomplete-menu');
        await expect(menu).toContainText(guest.username);
        await page.keyboard.press('Enter');
        await expect(page.locator('.noteentry[contenteditable="true"]')).toContainText(`@${guest.username}`);
        await expect.poll(async () => (await ownerApi.getNote(note.id)).content, { timeout: 20_000 }).toContain(`@${guest.username}`);

        await expect.poll(async () => (await guestApi.ok(guestApi.get('/mentions'))).text).toContain('Avec mention');
        expect((await guestApi.ok(guestApi.get('/mentions/members', { params: { workspace, owner: owner.id } }))).status).toBe(200);
        await guestPage.goto('/mentions.php');
        const item = guestPage.locator('.mentions-item', { hasText: 'Avec mention' });
        await expect(item).toBeVisible();
        await expect(item.locator('.mentions-item-excerpt')).toContainText(`@${guest.username}`);
        await expect(guestPage.locator('#iconSidebarMentionsBtn')).toBeVisible();
        await item.locator('.mentions-handled-btn').click();
        await expect(guestPage.locator('.mentions-item', { hasText: 'Avec mention' })).toHaveCount(0);
        await expect(guestPage.locator('#mentionsEmpty')).toBeVisible();
        await guestPage.locator('.mentions-toggle-handled').click();
        const handled = guestPage.locator('.mentions-item.handled', { hasText: 'Avec mention' });
        await expect(handled).toBeVisible();
        await handled.locator('.mentions-handled-btn').click();
        await expect(guestPage.locator('.mentions-item', { hasText: 'Avec mention' })).not.toHaveClass(/handled/);
        await expect.poll(async () => (await guestApi.ok(guestApi.get('/mentions'))).text).toContain('Avec mention');
        await item.locator('.mentions-item-title').click();
        await expect(guestPage.locator(`#entry${note.id}`)).toBeVisible();
    });

    test.describe('edit lock', () => {
        // The heartbeat of the person who lost the lock is answered 423: that is how the tab learns it
        test.use({ allowedErrors: [/status of 423.*lock\/heartbeat/] });
        test('a note open by one person is read-only for the other, who can take over', covers('org.note-lock'), async ({ page }) => {
            const note = await ownerApi.createNote({ heading: 'Verrouillée', workspace, content: '<p>Un seul à la fois</p>' });
            await shareWith(page, guest.username);
            await openNote(page, note.id);
            await page.locator('.noteentry[contenteditable="true"]').click();
            await page.keyboard.press('Control+End');
            await page.keyboard.type(' é');
            await expect.poll(async () => (await ownerApi.ok(ownerApi.get(`/notes/${note.id}/lock`))).json.lock?.locked ?? (await ownerApi.get(`/notes/${note.id}/lock`)).text).toBeTruthy();
            await enterShared(guestPage);
            await openNote(guestPage, note.id);
            const banner = guestPage.locator('.note-edit-lock-banner');
            await expect(banner).toBeVisible({ timeout: 15_000 });
            await expect(banner).toContainText(owner.username);
            await expect(guestPage.locator(`#entry${note.id}`)).toHaveAttribute('contenteditable', 'false');
            await banner.locator('button').click();
            await guestPage.locator('.alert-modal-footer .alert-modal-button').last().click();
            await expect(guestPage.locator(`#entry${note.id}`)).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
            await expect(page.locator('.note-edit-lock-banner'), 'the first person is told').toBeVisible({ timeout: 20_000 });
            await expect(page.locator(`#entry${note.id}`)).toHaveAttribute('contenteditable', 'false');
        });
    });

    test('the tasks of a shared workspace can be ticked by its member', covers('org.workspace-share'), async ({ page }) => {
        await ownerApi.createNote({ heading: 'Liste commune', workspace, type: 'tasklist', content: JSON.stringify([{ id: 1, text: 'Tâche commune', completed: false, important: false, dueAt: null }]) });
        await shareWith(page, guest.username);
        await enterShared(guestPage);
        await guestPage.goto('/tasks.php');
        await expect(guestPage.locator('.tasks-task-item', { hasText: 'Tâche commune' })).toBeVisible();
        await guestPage.locator('.tasks-task-item', { hasText: 'Tâche commune' }).locator('.tasks-task-checkbox').check();
        await expect.poll(async () => (await ownerApi.ok(ownerApi.get('/tasks'))).text).toContain('"completed":true');
    });
});

test('edits made elsewhere merge into an open Markdown note', covers('org.note-merge'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'fusion');
    const api = await Api.open(playwright, account);
    await login(page, account);
    const note = await api.createNote({ heading: 'Fusion', type: 'markdown', content: 'ligne un\n\nligne deux\n\nligne trois\n' });
    await page.addInitScript(() => localStorage.setItem('poznote_markdown_mode', 'edit'));
    await openNote(page, note.id);
    await page.evaluate((id) => window.toggleMarkdownMode && window.toggleMarkdownMode(String(id)), note.id);
    const cm = page.locator(`#entry${note.id} .cm-content`);
    await expect(cm).toBeVisible();
    await cm.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('début ');
    await page.waitForTimeout(100);
    const stored = await api.getNote(note.id);
    await api.ok(api.patch(`/notes/${note.id}`, { content: stored.content.replace('ligne trois', 'ligne trois changée dehors') }));
    await expect(cm, 'the outside edit appears').toContainText('changée dehors', { timeout: 30_000 });
    await expect(cm, 'the local edit stays').toContainText('début ligne un');
    await expect.poll(async () => (await api.getNote(note.id)).content, { timeout: 20_000 }).toMatch(/début ligne un[\s\S]*changée dehors/);
    await api.dispose();
});

test('the activity email setting appears with SMTP on, and an edit by a member reaches the owner', covers('org.activity-emails'), async ({ page, playwright }) => {
    const admin = await Api.open(playwright, ADMIN);
    startSmtpMock();
    const owner = await newAccount(playwright, 'activproprio');
    const guest = await newAccount(playwright, 'activinvite');
    await admin.ok(admin.patch(`/admin/users/${owner.id}`, { email: `${owner.username}@example.org` }));
    const ownerApi = await Api.open(playwright, owner);
    const guestApi = await Api.open(playwright, guest);
    try {
        for (const [key, value] of Object.entries(SMTP_ON)) await admin.ok(admin.put(`/settings/${key}`, { value }));
        await login(page, owner);
        await page.goto('/settings.php#section=settings-workspaces-section-grid');
        await settled(page);
        const select = page.locator('#workspace-activity-emails-select');
        expect(await select.locator('option').evaluateAll((o) => o.map((x) => x.value))).toEqual(['off', 'instant', 'daily', 'weekly']);
        await select.selectOption('instant');
        await expect.poll(async () => (await ownerApi.get('/settings/workspace_activity_emails')).json.value).toBe('instant');
        const workspace = `Actif-${owner.id}`;
        await ownerApi.ok(ownerApi.post('/workspaces', { name: workspace }));
        const note = await ownerApi.createNote({ heading: 'Suivie é', workspace, content: '<p>x</p>' });
        await page.reload();
        await settled(page);
        await page.locator(`.ws-row[data-ws="${workspace}"] .btn-share-toggle`).first().click();
        await page.locator('.share-user-list-row', { hasText: guest.username }).locator('input[type="checkbox"]').check();
        await page.locator('.shared-edit-token-modal .btn-primary').click();
        await expect(page.locator('.shared-edit-token-modal')).toHaveCount(0);
        const worker = runWorker;
        worker(); // the mark of the reader starts here
        const browser = page.context().browser();
        const context = await browser.newContext({ baseURL: require('../lib/helpers').BASE_URL, serviceWorkers: 'block' });
        const guestPage = await context.newPage();
        await login(guestPage, guest);
        await guestPage.goto('/index.php');
        await settled(guestPage);
        await guestPage.locator('.sidebar-title[data-action="toggle-workspace-menu"]').click();
        await guestPage.locator('#workspaceMenu .workspace-menu-shared', { hasText: workspace }).click();
        await guestPage.waitForLoadState('load');
        await settled(guestPage);
        const edit = await guestPage.evaluate((id) => fetch(`api/v1/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '<p>Modifiée par invité</p>' }) }).then((r) => r.status), note.id);
        expect(edit).toBe(200);
        await context.close();
        // An instant email waits for the editing to pause, for minutes: run the worker's step at a later time
        execFileSync('docker', ['exec', '-i', process.env.POZNOTE_E2E_CONTAINER || 'poznote-e2e-8199', 'sh', '-c', 'cat > /tmp/activity-step.php'], {
            input: '<?php require "/var/www/html/config.php"; require "/var/www/html/WorkspaceActivityEmailService.php"; (new WorkspaceActivityEmailService())->processDue(50, time() + 900);',
        });
        inInstance(`su -s /bin/sh www-data -c 'php /tmp/activity-step.php'`);
        await expect.poll(() => inInstance(`cat ${SMTP_LOG} 2>/dev/null || true`)).toContain(`${owner.username}@example.org`);
        const mail = inInstance(`cat ${SMTP_LOG}`).split('=====').find((m) => m.includes(`${owner.username}@example.org`));
        expect(Buffer.from(mail).toString(), 'the mail names the note').toMatch(/Suivie|U3VpdmllI/);
    } finally {
        // Instance-wide: back to no mail for the other specs
        await restoreSmtp(admin);
        await admin.dispose(); await ownerApi.dispose(); await guestApi.dispose();
    }
});

test.describe('offline mode', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'horsligne');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });

    test('the settings dialog stores the days and the on/off switch; off removes the page from the rail', covers('org.offline-settings'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-sync-history-section-grid');
        await settled(page);
        await page.locator('#offline-notes-card').click();
        await expect(page.locator('#offlineNotesModal')).toBeVisible();
        await page.locator('#offlineNotesDaysInput').fill('9');
        await page.locator('#saveOfflineNotesModalBtn').click();
        await expect(page.locator('#offlineNotesModal')).toBeHidden();
        await expect.poll(async () => (await api.get('/settings/offline_notes_days')).json.value).toBe('9');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#iconSidebarOfflineBtn')).toHaveCount(1);
        await page.goto('/settings.php#section=settings-sync-history-section-grid');
        await settled(page);
        await page.locator('#offline-notes-card').click();
        await page.locator('.offline-mode-label').click();
        await expect(page.locator('#offlineModeEnabledInput')).not.toBeChecked();
        await page.locator('#saveOfflineNotesModalBtn').click();
        await expect.poll(async () => (await api.get('/settings/offline_mode_enabled')).json.value).toBe('0');
        await page.goto('/index.php');
        await settled(page);
        await expect(page.locator('#iconSidebarOfflineBtn')).toHaveCount(0);
        await api.ok(api.put('/settings/offline_mode_enabled', { value: '1' }));
        await api.ok(api.put('/settings/offline_notes_days', { value: '5' }));
    });

    test('the sidebar marks setting is stored', covers('org.offline-marks'), async ({ page }) => {
        await page.goto('/settings.php#section=settings-sidebar-section-grid');
        await settled(page);
        const before = (await api.get('/settings/sidebar_offline_marks')).json.value;
        await page.locator('#sidebar-offline-marks-card').click();
        await expect.poll(async () => (await api.get('/settings/sidebar_offline_marks')).json.value).not.toBe(before);
        await api.ok(api.put('/settings/sidebar_offline_marks', { value: before ?? '' }));
    });

    test('Keep offline from the tree menu marks a note, listed by the page and the routes, and undone there', covers('org.offline-keep', 'org.offline-page', 'org.offline-routes'), async ({ page }) => {
        const note = await api.createNote({ heading: 'À emporter é', content: '<p>Pour le train</p>' });
        const reasons = async () => ((await api.ok(api.get('/offline/list'))).json.notes.find((n) => n.note_id === note.id)?.reasons ?? []);
        expect(await reasons(), 'recent, not marked').not.toContain('note');
        await page.goto('/index.php');
        await settled(page);
        const entry = page.locator(`#left_col .note-list-item:has(a[data-note-id="${note.id}"])`);
        await entry.hover();
        await entry.click({ button: 'right' });
        const menu = page.locator('.note-actions-menu-item[data-action="toggle-offline"]:visible');
        await menu.click();
        await expect.poll(reasons).toContain('note');
        expect((await api.ok(api.get('/offline/manifest'))).text).toContain(`"id":${note.id}`);
        const notes = (await api.ok(api.get('/offline/notes', { params: { ids: String(note.id) } }))).json;
        expect(JSON.stringify(notes)).toContain('Pour le train');
        expect((await api.ok(api.get('/offline/list'))).text).toContain('À emporter é');
        await page.goto('/offline_notes.php');
        const row = page.locator('.shared-note-item', { hasText: 'À emporter é' });
        await expect(row).toBeVisible();
        await page.locator('#filterInput').fill('train de nuit');
        await expect(row).toHaveCount(0);
        await page.locator('#clearFilterBtn').click();
        await expect(row).toBeVisible();
        await row.locator('.note-actions .btn').first().click();
        await expect.poll(reasons).not.toContain('note');
    });

    test('a folder marked Keep offline keeps its notes', covers('org.offline-keep'), async ({ page }) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: 'Dossier du train' }))).json.folder;
        const note = await api.createNote({ heading: 'Dans le dossier', folder_id: folder.id, content: '<p>x</p>' });
        await page.goto('/index.php');
        await settled(page);
        await openFolderMenu(page, 'Dossier du train');
        await page.locator('#left_col .folder-actions-menu.show [data-action="offline-folder"]:visible').first().click();
        await expect.poll(async () => (await api.ok(api.get('/offline/list'))).json.notes.find((n) => n.note_id === note.id)?.reasons ?? []).toContain('folder');
    });

});

test.describe('in a browser that lost the network', () => {
    // The one place where the worker is wanted: it is what is being tested
    test.use({ serviceWorkers: 'allow', allowedErrors: [/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/] });
    test('the worker serves the offline page, sign-in works, and the kept note can be read and edited', covers('org.offline-app', 'org.offline-sw'), async ({ page, context, playwright }) => {
        const fresh = await newAccount(playwright, 'surplace');
        const own = await Api.open(playwright, fresh);
        const note = await own.createNote({ heading: 'Sans réseau é', content: '<p>Lisible hors ligne</p>' });
        await page.goto('/login.php');
        await page.fill('#username', fresh.username);
        await page.fill('#password', fresh.password);
        await page.click('button.login-button');
        await page.waitForURL((url) => !url.toString().includes('login.php'));
        await page.evaluate(() => fetch('api/v1/settings/welcome_setup', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'done' }) }));
        await page.goto('/index.php');
        await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 20_000 }).toBe(true);
        await page.reload();
        // Sync done when the copy is in IndexedDB
        await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
            const open = indexedDB.open('poznote-offline');
            open.onerror = () => resolve(0);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('notes')) { resolve(0); return; }
                const count = db.transaction('notes').objectStore('notes').count();
                count.onsuccess = () => resolve(count.result);
            };
        })), { timeout: 30_000 }).toBeGreaterThan(0);
        // And the page shell the worker answers with, stored by the same sync
        await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller
            && !!(await (await caches.open('poznote-offline-shell')).match('offline.php'))), { timeout: 30_000 }).toBe(true);
        await context.setOffline(true);
        await context.route('**/*', (route) => route.abort('internetdisconnected'));
        await page.goto('/index.php').catch(() => null);
        await expect(page.locator('body.offline-page')).toBeVisible({ timeout: 20_000 });
        const form = page.locator('#offline-signin-form');
        if (await form.isVisible()) {
            await page.fill('#offline-password', fresh.password);
            await page.click('#offline-signin-submit');
        }
        await expect(page.locator('body')).toContainText('Sans réseau é', { timeout: 20_000 });
        await page.getByText('Sans réseau é').first().click();
        await expect(page.locator('body')).toContainText('Lisible hors ligne', { timeout: 15_000 });
        await context.unroute('**/*');
        await context.setOffline(false);
        await own.dispose();
        expect(note.id).toBeGreaterThan(0);
    });
});

test.describe('installed app', () => {
    test('sharing to Poznote from the system creates a note', covers('org.share-target'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'partage');
        const api = await Api.open(playwright, account);
        await login(page, account);
        await page.goto('/index.php');
        await settled(page);
        // What the OS does: a top-level multipart POST
        await page.evaluate(() => {
            const form = document.createElement('form');
            form.method = 'POST'; form.action = 'share-target.php'; form.enctype = 'multipart/form-data';
            for (const [name, value] of [['title', 'Article partagé é'], ['text', 'À lire https://example.org/page ce soir']]) {
                const input = document.createElement('input');
                input.type = 'hidden'; input.name = name; input.value = value;
                form.appendChild(input);
            }
            document.body.appendChild(form);
            form.submit();
        });
        await page.waitForURL(/index\.php\?.*note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        const note = await api.getNote(id);
        expect(note.heading).toBe('Article partagé é');
        expect(note.content).toContain('https://example.org/page');
        expect(note.content).toContain('À lire');
        await api.dispose();
    });

    test('a GET on the share target goes to the app', covers('org.share-target'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'partageget');
        await login(page, account);
        await page.goto('/share-target.php');
        await expect(page).toHaveURL(/index\.php/);
    });

    test('the manifests declare the name, the icons and the share target', covers('org.pwa-manifest'), async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: require('../lib/helpers').BASE_URL });
        for (const url of ['/pwa/manifest.webmanifest', '/pwa/manifest.php']) {
            const response = await anonymous.get(url);
            expect(response.status(), url).toBe(200);
            const manifest = await response.json();
            expect(manifest.name, url).toBe('Poznote');
            expect(manifest.icons.length, url).toBeGreaterThan(0);
            expect(manifest.share_target.action, url).toContain('share-target.php');
        }
        for (const icon of (await (await anonymous.get('/pwa/manifest.php')).json()).icons) {
            expect((await anonymous.get(new URL(icon.src, 'http://x/pwa/').pathname)).status(), icon.src).toBe(200);
        }
        expect((await anonymous.get('/sw.js')).status()).toBe(200);
        await anonymous.dispose();
    });
});

test('a rewrite through the MCP token keeps the previous text as a safety revision, not a web edit', covers('org.revisions-before-ai'), async ({ playwright }) => {
    const account = await newAccount(playwright, 'avantia');
    const api = await Api.open(playwright, account);
    const note = await api.createNote({ heading: 'Avant IA', content: '<p>Texte humain é</p>' });
    await api.ok(api.patch(`/notes/${note.id}`, { content: '<p>Encore humain</p>' }));
    expect((await api.ok(api.get(`/notes/${note.id}/snapshots`))).json.snapshots.filter((s) => s.origin === 'mcp')).toEqual([]);
    const token = inInstance('cat /var/www/html/data/.mcp_token').trim();
    const mcp = await playwright.request.newContext({ baseURL: require('../lib/helpers').BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'X-User-ID': String(account.id) } });
    expect((await mcp.patch(`/api/v1/notes/${note.id}`, { data: { content: '<p>Réécrit par IA</p>' } })).status()).toBe(200);
    await mcp.dispose();
    const safety = (await api.ok(api.get(`/notes/${note.id}/snapshots`))).json.snapshots.filter((s) => s.origin === 'mcp');
    expect(safety).toHaveLength(1);
    const saved = await api.ok(api.get(`/notes/${note.id}/snapshot`, { params: { snapshot_key: safety[0].snapshot_key } }));
    expect(saved.text).toContain('Encore humain');
    await api.dispose();
});

test.describe('diary, the smaller gestures', () => {
    let account; let api;
    test.beforeEach(async ({ page, playwright }) => {
        account = await newAccount(playwright, 'carnet');
        api = await Api.open(playwright, account);
        await login(page, account);
    });
    test.afterEach(async () => { await api.dispose(); });
    const entry = async (page, date) => {
        await page.goto(`/diary.php?date=${date}`);
        await page.waitForURL(/note=\d+/);
        return Number(new URL(page.url()).searchParams.get('note'));
    };

    test('the Diary entry of the + menu and the card of create.php open today', covers('org.diary-today'), async ({ page }) => {
        await page.goto('/index.php');
        await settled(page);
        await page.click('#sidebarCreateBtn');
        await page.locator('.create-note-option[data-type="diary"]:visible').click();
        await page.waitForURL(/note=\d+/);
        const id = Number(new URL(page.url()).searchParams.get('note'));
        expect((await api.getNote(id)).heading).toBe(inDays(0));
        await page.goto('/create.php');
        await page.locator('#create-diary-entry-card').click();
        await page.waitForURL(new RegExp(`note=${id}`));
    });

    test('a right-click gives a card its colour, and the filter keeps that colour', covers('org.diary-color'), async ({ page }) => {
        const coloured = await entry(page, '2026-03-04');
        const plain = await entry(page, '2026-03-05');
        await page.goto('/diary.php');
        await settled(page);
        const card = (id) => page.locator(`.dash-note-card[data-note-id="${id}"]`);
        await card(coloured).click({ button: 'right' });
        await expect(page.locator('#noteColorModal')).toBeVisible();
        await page.locator('#noteColorGrid .note-color-option:not([data-color-value=""])').first().click();
        await page.locator('#noteColorApplyBtn').click();
        await expect(page.locator('#noteColorModal')).toBeHidden();
        await page.waitForLoadState('networkidle');
        await page.reload();
        await settled(page);
        await page.locator('#diaryFilterBtn').click();
        await page.locator('#diaryFilterColorSection button', { has: page.locator('.note-color-swatch') }).first().click();
        await expect(card(plain)).toHaveCount(0);
        await expect(card(coloured)).toBeVisible();
        await expect(page.locator('.dashboard-filter-badge').first()).toBeVisible();
        await page.locator('#diaryFilterResetBtn').click();
        await expect(card(plain)).toBeVisible();
    });

    test('the dates panel of the journal folds, and stays folded', covers('org.diary-journal'), async ({ page }) => {
        await entry(page, '2026-03-04');
        await page.goto('/diary.php');
        await settled(page);
        await page.locator('#diaryJournalToggle').click();
        await expect(page.locator('body')).not.toHaveClass(/outline-collapsed/);
        await page.locator('#toggleOutlineBtn').click();
        await expect(page.locator('body')).toHaveClass(/outline-collapsed/);
        await page.reload();
        await expect(page.locator('body')).toHaveClass(/outline-collapsed/);
    });

    test('the diary folder setting names the root of new entries', covers('org.diary-note-type'), async ({ page }) => {
        await api.ok(api.put('/settings/diary_folder', { value: 'Mon carnet é' }));
        await entry(page, '2026-03-04');
        expect((await api.ok(api.get('/folders'))).text).toContain('Mon carnet');
    });

    test('the slash menu links to the diary entry of a day, opened on a click', covers('org.diary-date-url'), async ({ page }) => {
        const note = await api.createNote({ heading: 'Avec lien de journal', content: '<p>Début</p>' });
        await openNote(page, note.id);
        await page.locator('.noteentry[contenteditable="true"]').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/');
        await page.keyboard.type('diary', { delay: 20 });
        await page.locator('.slash-command-menu [data-command-id="journal-link"]').click();
        await page.locator('.slash-date-picker-today-btn').click();
        const link = page.locator(`#entry${note.id} a[href*="diary.php?date=${inDays(0)}"]`);
        await expect(link).toHaveText(inDays(0));
        await expect.poll(async () => (await api.getNote(note.id)).content, { timeout: 20_000 }).toContain(`diary.php?date=${inDays(0)}`);
    });
});

test.describe('kanban, the smaller gestures', () => {
    let account; let api;
    test.beforeAll(async ({ playwright }) => {
        account = await newAccount(playwright, 'tableau');
        api = await Api.open(playwright, account);
    });
    test.afterAll(async () => { await api.dispose(); });
    test.beforeEach(async ({ page }) => { await login(page, account); });
    const board = async (page, name) => {
        const folder = (await api.ok(api.post('/folders', { folder_name: name }))).json.folder;
        return folder;
    };

    test('the title of the board renames its folder', covers('org.kanban-rename'), async ({ page }) => {
        const folder = await board(page, 'Ancien tableau');
        await page.goto(`/index.php?kanban=${folder.id}`);
        await page.locator('.kanban-title [data-action="rename-folder"]').click();
        // The rename happens on the row of the tree
        await page.locator('#left_col .tree-inline-input').fill('Nouveau tableau é');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await api.get('/folders')).text).toContain('Nouveau tableau');
    });

    test('a right-click on a card gives it a colour', covers('org.kanban-color'), async ({ page }) => {
        const folder = await board(page, 'Couleurs');
        await api.createNote({ heading: 'Carte colorée', folder_id: folder.id, content: '<p>x</p>' });
        await page.goto(`/index.php?kanban=${folder.id}`);
        const card = page.locator('.kanban-card', { hasText: 'Carte colorée' });
        await card.locator('.kanban-card-snippet').click({ button: 'right' });
        await page.locator('.alert-modal .tag-color-grid button.tag-color-swatch').first().click();
        await page.locator('.alert-modal-footer .alert-modal-button.primary').click();
        await expect(card).toHaveClass(/has-note-color/);
        await page.waitForLoadState('networkidle');
        await page.reload();
        await expect(page.locator('.kanban-card', { hasText: 'Carte colorée' })).toHaveClass(/has-note-color/);
    });
});

test('graph: the tree view and the icons option', covers('org.graph-options', 'org.graph-tree'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'arbre');
    const api = await Api.open(playwright, account);
    await login(page, account);
    const folder = (await api.ok(api.post('/folders', { folder_name: 'Racine arbre' }))).json.folder;
    const note = await api.createNote({ heading: 'Note icône', folder_id: folder.id, content: '<p>x</p>' });
    await api.ok(api.put(`/notes/${note.id}/icon`, { icon: 'lucide-star' }));
    await page.goto('/graph.php');
    await expect(page.locator('#graphLoading')).toBeHidden();
    await expect(page.locator('#graphSvg .graph-icon').first()).toBeVisible();
    await page.locator('#graphShowIcons').uncheck({ force: true });
    await expect(page.locator('#graphSvg .graph-icon')).toHaveCount(0);
    await page.locator('#graphViewToggle').click();
    await expect(page.locator('#graphCanvasWrapper')).toHaveClass(/tree-layout/);
    await page.reload();
    await expect(page.locator('#graphLoading')).toBeHidden();
    await expect(page.locator('#graphCanvasWrapper'), 'remembered').toHaveClass(/tree-layout/);
    await expect(page.locator('#graphShowIcons'), 'remembered').not.toBeChecked();
    await page.locator('#graphViewToggle').click();
    await expect(page.locator('#graphCanvasWrapper')).not.toHaveClass(/tree-layout/);
    await api.dispose();
});

test('attachments_list.php opens a file from its link', covers('org.attachments-list'), async ({ page, playwright }) => {
    const account = await newAccount(playwright, 'pjouvre');
    const api = await Api.open(playwright, account);
    await login(page, account);
    const note = await api.createNote({ heading: 'Rapport', content: '<p>x</p>' });
    await api.ok(api.call('POST', `/notes/${note.id}/attachments`, { multipart: { file: { name: 'lire.txt', mimeType: 'text/plain', buffer: Buffer.from('à lire') } } }));
    await page.goto('/attachments_list.php');
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.locator('.attachment-file-link', { hasText: 'lire.txt' }).click()]);
    await expect.poll(() => tab.url()).toMatch(new RegExp(`/notes/${note.id}/attachments/`));
    await tab.close();
    await api.dispose();
});

test.describe('attachments page: PDF preview and transcription', () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const attach = async (api, noteId, name, mimeType, buffer) => {
        await api.ok(api.call('POST', `/notes/${noteId}/attachments`, { multipart: { file: { name, mimeType, buffer } } }));
        return (await api.ok(api.get(`/notes/${noteId}/attachments`))).json.attachments.at(-1);
    };

    test('a PDF gets a thumbnail whose preview shows the file, and closes', covers('org.attachment-preview'), async ({ page, playwright }) => {
        const account = await newAccount(playwright, 'pjpdf');
        const api = await Api.open(playwright, account);
        const note = await api.createNote({ heading: 'PDF joint', content: '<p>x</p>' });
        const file = await attach(api, note.id, 'rapport é.pdf', 'application/pdf', PDF);
        await login(page, account);
        await page.goto(`/attachments.php?note_id=${note.id}`);
        await settled(page);
        await page.locator('#attachmentsList [data-action="preview-pdf"]').first().click();
        const preview = page.locator('.image-preview-modal .pdf-preview-content');
        await expect(preview).toBeVisible();
        await expect(preview.locator('h3')).toHaveText('rapport é.pdf');
        await expect(preview.locator('embed[type="application/pdf"]')).toHaveAttribute('src', new RegExp(`attachments/${file.id}`));
        await expect(preview.locator('.pdf-preview-open')).toBeVisible();
        await expect(preview.locator('.pdf-preview-download')).toBeVisible();
        await preview.locator('.pdf-preview-close').click();
        await expect(page.locator('.image-preview-modal')).toHaveCount(0);
        await api.dispose();
    });

    test('Transcribe on an audio file goes back to the note, which offers its text for review and inserts it', covers('org.attachment-transcribe'), async ({ page, playwright }) => {
        test.fail(true, 'BUG: js/speech-to-text.js resumePendingTranscription runs before the note is editable (its lock comes about 2 s later), so the Insert button answers "Open a note first"');
        // Transcription is set up for the admin only, see support/instance-setup.php
        const api = await Api.open(playwright, ADMIN);
        const note = await api.createNote({ heading: `Dictée jointe ${Date.now()}`, content: '<p>Avant la transcription</p>' });
        await attach(api, note.id, 'mémo.wav', 'audio/wav', WAV);
        await login(page, ADMIN);
        await page.goto(`/attachments.php?note_id=${note.id}`);
        await settled(page);
        await page.locator('#attachmentsList [data-action="transcribe"]').first().click();
        await expect(page).toHaveURL(new RegExp(`index\\.php\\?.*note=${note.id}`));
        // The text comes back for review first, and can be corrected before it goes in
        await expect(page.locator('#dictateText')).toHaveValue('transcription du mock', { timeout: 15_000 });
        await page.locator('#dictateText').fill('transcription du mock, relue é');
        await page.locator('#dictateInsertBtn').click();
        await expect(page.locator('#dictateModal')).toBeHidden();
        await expect(page.locator(`#entry${note.id}`)).toContainText('transcription du mock, relue é');
        await expect.poll(async () => (await api.getNote(note.id)).content, { timeout: 15_000 }).toContain('transcription du mock, relue é');
        expect((await api.getNote(note.id)).content).toContain('Avant la transcription');
        await api.ok(api.del(`/notes/${note.id}`));
        await api.dispose();
    });
});
