<?php
/**
 * What each page loads, in one place.
 *
 * Every page used to hand-write its <link> tags: 778 of them across 40 pages,
 * through four different cache-busting schemes. Adding one shared stylesheet
 * meant editing 40 <head> blocks, and nothing checked that a page still loaded
 * what it needed, so the lists drifted apart unnoticed: settings.php linked
 * lucide.css and dark-mode/variables.css twice, five other pages linked
 * lucide.css twice, and several pages carry only part of the dark layer.
 *
 * A page now names itself and the manifest says what that means:
 *
 *     poznoteRenderStylesheets('trash');
 *     poznoteRenderStylesheets('admin/users', ['prefix' => '../']);
 *     poznoteRenderStylesheets('public_note', ['asset' => 'public']);
 *
 * Order within a list is cascade order and is significant. Entries starting
 * with '@' are groups, expanded in place.
 *
 * Two entry points stay hand-written on purpose: index.php serves its CSS as
 * two concatenated bundles (index_css.php) with a media-scoped link and an
 * inline <style> in the middle, and api_export_attachments.php writes a
 * standalone export document. The password-gate <head> of settings.php,
 * public_note.php and public_folder.php is also left alone: it is a separate,
 * two-stylesheet document rendered before the real page.
 */

/** Ordered stylesheet groups, shared between pages. */
function poznoteCssGroups(): array
{
    return [
        // Shared component bases, loaded before the page stylesheets so a page
        // can still override them on purpose.
        '@components' => [
            'css/components/buttons.css',
            'css/components/forms.css',
            'css/components/logo.css',
        ],

        // The dialog stack, in cascade order.
        '@modals' => [
            'css/modals/base.css',
            'css/modals/specific-modals.css',
            'css/modals/attachments.css',
            'css/modals/share-modal.css',
            'css/modals/alerts-utilities.css',
            'css/modals/responsive.css',
        ],
        // The dark/black layer. dark-mode/variables.css declares the tokens the other
        // files consume, so it always comes first.
        '@theme' => [
            'css/dark-mode/variables.css',
            'css/dark-mode/layout.css',
            'css/dark-mode/menus.css',
            'css/dark-mode/editor.css',
            'css/dark-mode/modals.css',
            'css/dark-mode/components.css',
            'css/dark-mode/pages.css',
            'css/dark-mode/markdown.css',
            'css/dark-mode/kanban.css',
            'css/dark-mode/icons.css',
        ],
        // The left icon rail of the standalone pages.
        '@icon-sidebar' => [
            'css/icon-sidebar.css',
            'css/icon-sidebar-page.css',
            'css/icon-sidebar-mobile.css',
        ],
        // The card grid shared by the home-like pages.
        '@home' => [
            'css/home/base.css',
            'css/home/alerts.css',
            'css/home/cards.css',
            'css/home/buttons.css',
            'css/home/dark-mode.css',
            'css/home/responsive.css',
        ],
    ];
}

/**
 * Page key => ordered stylesheets (or group names).
 *
 * The key is the entry point's path under src/public/, without the extension.
 */
function poznoteCssManifest(): array
{
    return [
        'admin/activity-log' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/home/search.css',
            'css/users.css',
            '@theme',
            'css/admin-tools.css',
            '@icon-sidebar',
        ],
        'admin/disaster-recovery' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            'css/restore_import/base.css',
            'css/restore_import/cards.css',
            'css/restore_import/forms-buttons.css',
            'css/restore_import/modals.css',
            'css/restore_import/utilities.css',
            'css/modals/base.css',
            'css/modals/alerts-utilities.css',
            '@theme',
            'css/admin-tools.css',
            '@icon-sidebar',
        ],
        'admin/oidc' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            'css/workspaces.css',
            'css/modals/alerts-utilities.css',
            '@theme',
            'css/workspaces-inline.css',
            '@icon-sidebar',
        ],
        'admin/orphan-scanner' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            '@theme',
            'css/admin-tools.css',
            '@icon-sidebar',
        ],
        'admin/smtp' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            'css/workspaces.css',
            'css/modals/alerts-utilities.css',
            '@theme',
            'css/workspaces-inline.css',
            '@icon-sidebar',
        ],
        'admin/storage-stats' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/home/search.css',
            'css/users.css',
            '@theme',
            'css/admin-tools.css',
            '@icon-sidebar',
        ],
        'admin/users' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/home/search.css',
            'css/users.css',
            '@theme',
            '@icon-sidebar',
        ],
        'admin/webhooks' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            'css/workspaces.css',
            'css/modals/alerts-utilities.css',
            'css/modal-alerts.css',
            '@theme',
            'css/workspaces-inline.css',
            'css/webhooks.css',
            '@icon-sidebar',
        ],
        'ai_settings' => [
            'css/lucide.css',
            '@components',
            '@home',
            'css/settings.css',
            'css/git-sync.css',
            '@theme',
            '@icon-sidebar',
        ],
        'ai_settings_user' => [
            'css/lucide.css',
            '@components',
            '@home',
            'css/settings.css',
            'css/git-sync.css',
            '@theme',
            '@icon-sidebar',
        ],
        'attachments' => [
            'css/lucide.css',
            '@components',
            'css/attachments/base.css',
            'css/attachments/upload.css',
            'css/attachments/usage-notice.css',
            'css/attachments/display.css',
            'css/attachments/buttons-alerts.css',
            'css/home/buttons.css',
            'css/attachments/preview-modal.css',
            'css/attachments/responsive.css',
            '@modals',
            '@theme',
            '@icon-sidebar',
        ],
        'attachments_list' => [
            'css/lucide.css',
            '@components',
            'css/shared/base.css',
            'css/shared/notes-list.css',
            'css/shared/buttons-modal.css',
            'css/shared/dark-mode.css',
            'css/shared/responsive.css',
            'css/attachments_list.css',
            'css/attachments/usage-notice.css',
            '@icon-sidebar',
            '@theme',
        ],
        'backup_export' => [
            'css/lucide.css',
            '@components',
            'css/backup_export.css',
            '@modals',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        'create' => [
            'css/lucide.css',
            '@components',
            '@modals',
            'css/home/base.css',
            'css/home/search.css',
            'css/home/alerts.css',
            'css/home/cards.css',
            'css/home/buttons.css',
            'css/home/dark-mode.css',
            'css/home/responsive.css',
            'css/modal-alerts.css',
            'css/note-reference.css',
            '@theme',
            '@icon-sidebar',
        ],
        'dashboard' => [
            'css/lucide.css',
            '@components',
            'css/modals/base.css',
            'css/modals/reminders.css',
            'css/modal-alerts.css',
            'css/favorites.css',
            'css/home/alerts.css',
            'css/dashboard.css',
            '@theme',
            '@icon-sidebar',
        ],
        'diary' => [
            'css/lucide.css',
            '@components',
            'css/modals/base.css',
            'css/modal-alerts.css',
            'css/favorites.css',
            'css/home/alerts.css',
            'css/dashboard.css',
            'css/diary.css',
            '@theme',
            '@icon-sidebar',
        ],
        'excalidraw_editor' => [
            '@components',
            'css/modal-alerts.css',
            'css/excalidraw.css',
            '@theme',
        ],
        'favorites' => [
            'css/lucide.css',
            '@components',
            '@modals',
            'css/favorites.css',
            '@theme',
            '@icon-sidebar',
        ],
        'git_sync' => [
            'css/lucide.css',
            '@components',
            'css/home/base.css',
            'css/home/search.css',
            'css/home/alerts.css',
            'css/home/cards.css',
            'css/home/buttons.css',
            'css/home/dark-mode.css',
            'css/home/responsive.css',
            'css/settings.css',
            'css/git-sync.css',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        'graph' => [
            'css/lucide.css',
            '@components',
            'css/home/base.css',
            'css/home/search.css',
            'css/home/buttons.css',
            '@theme',
            'css/graph.css',
            '@icon-sidebar',
        ],
        'info' => [
            'css/lucide.css',
            '@components',
            'css/info.css',
            'css/home/buttons.css',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        'list_folders' => [
            'css/lucide.css',
            '@components',
            '@modals',
            'css/shared/base.css',
            'css/shared/notes-list.css',
            'css/folders/actions-menu.css',
            'css/folder-icon-modal.css',
            'css/shared/buttons-modal.css',
            'css/modal-alerts.css',
            'css/shared/dark-mode.css',
            'css/shared/responsive.css',
            '@theme',
            '@icon-sidebar',
        ],
        'list_tags' => [
            'css/lucide.css',
            '@components',
            'css/home/base.css',
            'css/home/search.css',
            'css/home/alerts.css',
            'css/home/cards.css',
            'css/home/buttons.css',
            'css/home/dark-mode.css',
            'css/home/responsive.css',
            'css/list_tags.css',
            '@icon-sidebar',
            'css/modals/base.css',
            'css/modals/specific-modals.css',
            'css/modals/attachments.css',
            'css/modals/share-modal.css',
            'css/modals/alerts-utilities.css',
            'css/modal-alerts.css',
            'css/modals/responsive.css',
            '@theme',
        ],
        'login' => [
            'css/lucide.css',
            '@components',
            'css/login.css',
            '@theme',
        ],
        'markdown_syntax' => [
            'css/lucide.css',
            '@components',
            'css/info.css',
            'css/home/buttons.css',
            'css/markdown-syntax.css',
            '@theme',
            '@icon-sidebar',
        ],
        'notes_manager' => [
            'css/lucide.css',
            '@components',
            'css/modals/base.css',
            'css/modals/specific-modals.css',
            'css/modals/alerts-utilities.css',
            'css/modals/responsive.css',
            'css/favorites.css',
            'css/notes-manager.css',
            '@icon-sidebar',
            '@theme',
        ],
        'public_folder' => [
            'css/lucide.css',
            '@components',
            '@theme',
            'css/public_folder.css',
        ],
        'public_note' => [
            'css/lucide.css',
            '@components',
            '@theme',
            'css/notes/attachments-row.css',
            'css/public_note.css',
            'css/outline.css',
            'css/modal-alerts.css',
            'css/tasks.css',
            'css/markdown.css',
            'css/syntax-highlight.css',
            'js/katex/katex.min.css',
        ],
        'restore_import' => [
            'css/lucide.css',
            '@components',
            'css/restore_import/base.css',
            'css/restore_import/cards.css',
            'css/restore_import/forms-buttons.css',
            'css/restore_import/modals.css',
            'css/restore_import/progress.css',
            'css/restore_import/drag-drop.css',
            'css/restore_import/utilities.css',
            'css/restore_import/responsive.css',
            '@modals',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        's3_backup_settings' => [
            'css/lucide.css',
            '@components',
            '@home',
            'css/settings.css',
            'css/git-sync.css',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        's3_settings' => [
            'css/lucide.css',
            '@components',
            '@home',
            'css/settings.css',
            'css/git-sync.css',
            'css/modal-alerts.css',
            '@theme',
            'css/icon-sidebar.css',
            'css/attachments/usage-notice.css',
            'css/icon-sidebar-page.css',
            'css/icon-sidebar-mobile.css',
        ],
        'saas_settings' => [
            'css/lucide.css',
            '@components',
            '@home',
            'css/settings.css',
            'css/git-sync.css',
            'css/modal-alerts.css',
            '@theme',
            '@icon-sidebar',
        ],
        'settings' => [
            'css/fonts.css',
            'css/lucide.css',
            '@components',
            'css/modal-alerts.css',
            'css/home/base.css',
            'css/home/search.css',
            'css/home/alerts.css',
            'css/home/cards.css',
            'css/home/buttons.css',
            'css/home/dark-mode.css',
            'css/home/responsive.css',
            'css/settings.css',
            '@modals',
            'css/modals/ui-customization.css',
            'css/background-image.css',
            'css/custom-css.css',
            '@theme',
            '@icon-sidebar',
        ],
        'shared' => [
            'css/lucide.css',
            '@components',
            '@modals',
            'css/shared/base.css',
            'css/shared/notes-list.css',
            'css/shared/buttons-modal.css',
            'css/shared/dark-mode.css',
            'css/shared/responsive.css',
            '@theme',
            '@icon-sidebar',
        ],
        'storage-stats-user' => [
            'css/lucide.css',
            '@components',
            'css/fonts.css',
            'css/settings.css',
            'css/users.css',
            '@theme',
            'css/admin-tools.css',
            '@icon-sidebar',
            'css/attachments/usage-notice.css',
        ],
        'tasks' => [
            'css/lucide.css',
            '@components',
            'css/modals/base.css',
            'css/modals/specific-modals.css',
            'css/modals/reminders.css',
            'css/modals/share-modal.css',
            'css/modals/alerts-utilities.css',
            'css/modals/responsive.css',
            'css/slash-commands.css',
            'css/note-reference.css',
            'css/tasks-page.css',
            '@theme',
            '@icon-sidebar',
        ],
        'trash' => [
            'css/lucide.css',
            '@components',
            '@modals',
            'css/trash.css',
            'css/notes/noteentry.css',
            'css/checklists.css',
            'css/tasks.css',
            'css/markdown.css',
            'css/code-blocks.css',
            'css/syntax-highlight.css',
            '@theme',
            '@icon-sidebar',
        ],
        'user-webhooks' => [
            'css/lucide.css',
            '@components',
            'css/settings.css',
            'css/users.css',
            'css/workspaces.css',
            'css/modals/alerts-utilities.css',
            'css/modal-alerts.css',
            '@theme',
            'css/workspaces-inline.css',
            'css/webhooks.css',
            '@icon-sidebar',
        ],
        'workspaces' => [
            'css/lucide.css',
            '@components',
            'css/workspaces.css',
            'css/modals/base.css',
            'css/notes/tags.css',
            'css/modals/specific-modals.css',
            'css/modals/attachments.css',
            'css/modals/share-modal.css',
            'css/modals/alerts-utilities.css',
            'css/modals/responsive.css',
            'css/background-image.css',
            'css/modal-alerts.css',
            '@theme',
            'css/workspaces-inline.css',
            '@icon-sidebar',
        ],
    ];
}

/**
 * Expands groups and returns the flat, ordered list for a page.
 *
 * A stylesheet listed twice keeps its first position: the duplicate link is
 * always an accident, and the first one is what set the cascade.
 */
function poznoteCssResolve(string $page): array
{
    $manifest = poznoteCssManifest();
    if (!isset($manifest[$page])) {
        return [];
    }
    $groups = poznoteCssGroups();
    $out = [];
    foreach ($manifest[$page] as $item) {
        $files = str_starts_with($item, '@') ? ($groups[$item] ?? []) : [$item];
        foreach ($files as $file) {
            if (!in_array($file, $out, true)) {
                $out[] = $file;
            }
        }
    }
    return $out;
}

/**
 * Emits the <link> tags for a page.
 *
 * $opts['prefix'] is prepended to the href for pages served from a
 * subdirectory (admin/ needs '../'); the file is still resolved from the
 * docroot, so cache busting keeps working. $opts['asset'] = 'public' picks the
 * versioning helper the session-less pages use.
 */
function poznoteRenderStylesheets(string $page, array $opts = []): void
{
    $prefix = $opts['prefix'] ?? '';
    $public = ($opts['asset'] ?? '') === 'public';
    foreach (poznoteCssResolve($page) as $file) {
        $href = $prefix . ($public ? getVersionedPublicAppAssetHref($file) : poznoteAsset($file));
        echo '    <link rel="stylesheet" href="' . htmlspecialchars($href, ENT_QUOTES) . '">' . "\n";
    }
}
