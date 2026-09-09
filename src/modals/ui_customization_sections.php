<?php
/**
 * The UI Customization checklist: every hideable element, grouped by the part
 * of the interface it belongs to, one checkbox per data-ui-key. Checked means
 * visible; the saved preference lists the unchecked keys (see
 * lib/ui-customization.php for what each key hides).
 *
 * Rendered twice: inside #uiCustomizationModal (modals.php, opened from the
 * settings page, where administrators also get the Users column) and inside
 * the contextual panel (ui_customization_panel.php) on the notes page and
 * the dashboard.
 *
 * data-ui-pages names the pages an element can be seen on ('notes' for
 * index.php, 'dashboard' for dashboard.php, space separated); the panel only
 * lists the sections of the page it is opened on. Set on the section, an item
 * may override it (an empty value means "no live page": the item is only
 * offered in the modal). Sections without it never show in the panel.
 */
?>
<!-- Create Cards Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.create_cards', [], 'Create Cards'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-note-card" checked><span><?php echo t_h('modals.create.note.title', [], 'Note'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-markdown-note-card" checked><span><?php echo t_h('modals.create.markdown.title', [], 'Markdown Note'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-task-list-card" checked><span><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-diary-entry-card" checked><span><?php echo t_h('diary.create_card_title', [], 'Diary entry'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-folder-card" checked><span><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-subfolder-card" checked><span><?php echo t_h('modals.create.subfolder.title', [], 'Subfolder'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-workspace-card" checked><span><?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?></span></label>
</div>
</div>

<!-- Settings Cards Section -->
<div class="ui-custom-section" data-ui-pages="">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.settings_cards', [], 'Settings Cards'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:my-profile-card" checked><span><?php echo t_h('profile.card', [], 'My Profile'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:welcome-setup-card" checked><span><?php echo t_h('settings.cards.welcome_setup', [], 'Startup guide'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:change-password-card" checked><span><?php echo t_h('settings.cards.change_password', [], 'Change Password'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:delete-account-card" checked><span><?php echo t_h('settings.cards.delete_account', [], 'Delete Account'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:git-sync-card" checked><span><?php echo t_h('settings.cards.git_sync', [], 'Git Sync'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:backup-export-card" checked><span><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:restore-import-card" checked><span><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:storage-stats-user-card" checked><span><?php echo t_h('settings.cards.storage_stats_user', [], 'User Storage statistics'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:extension-card" checked><span><?php echo t_h('settings.cards.install_extension', [], 'Install extension'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:install-app-card" checked><span><?php echo t_h('settings.cards.install_app', [], 'Install application'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:spellcheck-html-notes-card" checked><span><?php echo t_h('display.cards.spellcheck_html_notes', [], 'Spell check'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:slash-menu-require-alt-card" checked><span><?php echo t_h('display.cards.slash_menu_require_alt', [], 'Command menu shortcut'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-nav-shortcuts-card" checked><span><?php echo t_h('display.cards.note_nav_shortcuts', [], 'Switch notes with Alt + ↑/↓'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:ctrl-s-save-card" checked><span><?php echo t_h('display.cards.ctrl_s_save', [], 'Save note with Ctrl + S'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:login-display-card" checked><span><?php echo t_h('display.cards.login_display', [], 'Login page title'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:language-card" checked><span><?php echo t_h('settings.language.label', [], 'Language'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:main-font-card" checked><span><?php echo t_h('display.cards.main_font', [], 'App font'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:markdown-font-card" checked><span><?php echo t_h('display.cards.markdown_font', [], 'Markdown editor font'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:font-size-card" checked><span><?php echo t_h('display.cards.note_font_size', [], 'Font size'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:index-icon-scale-card" checked><span><?php echo t_h('display.cards.index_icon_scale', [], 'Index icon scaling'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:timezone-card" checked><span><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:date-time-format-card" checked><span><?php echo t_h('display.cards.date_time_format', [], 'Date & time format'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-sort-card" checked><span><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-age-filter-card" checked><span><?php echo t_h('display.cards.note_age_filter', [], 'Note age filter'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:snapshots-card" checked><span><?php echo t_h('display.cards.snapshots', [], 'Snapshots'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:tasklist-insert-order-card" checked><span><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:diary-note-type-card" checked><span><?php echo t_h('display.cards.diary_default_note_type', [], 'Diary entry format'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:diary-date-format-card" checked><span><?php echo t_h('display.cards.diary_date_format', [], 'Diary entry date format'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:type-note-icons-card" checked><span><?php echo t_h('display.cards.type_based_note_icons', [], 'Icons by note type'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:folder-tree-highlight-card" checked><span><?php echo t_h('display.cards.highlight_current_folder_tree', [], 'Highlight current folder tree'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-color-palette-card" checked><span><?php echo t_h('display.cards.note_color_palette', [], 'Note colors'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:notes-without-folders-card" checked><span><?php echo t_h('display.cards.notes_without_folders_after', [], 'Notes without folders'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-width-card" checked><span><?php echo t_h('display.cards.note_content_width', [], 'Note content width'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:markdown-split-card-view-card" checked><span><?php echo t_h('display.cards.markdown_split_card_view', [], 'Framed markdown'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:markdown-colored-card" checked><span><?php echo t_h('display.cards.markdown_colored', [], 'Colored markdown'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:code-wrap-card" checked><span><?php echo t_h('display.cards.code_block_word_wrap', [], 'Code block word wrap'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:code-line-numbers-card" checked><span><?php echo t_h('display.cards.code_block_line_numbers', [], 'Code block line numbers'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:attachment-previews-card" checked><span><?php echo t_h('display.cards.attachment_previews_in_note', [], 'Attachment previews'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:attachments-at-bottom-card" checked><span><?php echo t_h('display.cards.attachments_at_bottom', [], 'Attachments at bottom'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:backlinks-at-bottom-card" checked><span><?php echo t_h('display.cards.backlinks_at_bottom', [], 'Backlinks at bottom'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:default-image-border-card" checked><span><?php echo t_h('display.cards.default_image_border_no_padding', [], 'Default image border (no padding)'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:icon-sidebar-order-card" checked><span><?php echo t_h('display.cards.icon_sidebar_order', [], 'Icon sidebar order'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:api-rest-card" checked><span><?php echo t_h('settings.cards.api_rest', [], 'API REST'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:users-admin-card" checked><span><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:oidc-config-card" checked><span><?php echo t_h('settings.cards.oidc_config', [], 'OIDC / SSO'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:smtp-config-card" checked><span><?php echo t_h('settings.cards.smtp_config', [], 'SMTP / Email'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:webhooks-card" checked><span><?php echo t_h('settings.cards.webhooks', [], 'Admin Webhooks'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:user-webhooks-card" checked><span><?php echo t_h('webhooks_user.card', [], 'User Webhooks'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:ai-assistant-card" checked><span><?php echo t_h('settings.cards.ai_assistant', [], 'AI Assistant'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:ai-assistant-user-card" checked><span><?php echo t_h('ai_settings_user.card', [], 'My AI Assistant'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:saas-card" checked><span><?php echo t_h('settings.cards.saas', [], 'SaaS mode'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:s3-storage-card" checked><span><?php echo t_h('settings.cards.s3_storage', [], 'S3 Attachments'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:s3-backup-card" checked><span><?php echo t_h('settings.cards.s3_backup', [], 'S3 Backups'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:git-sync-enabled-card" checked><span><?php echo t_h('settings.cards.git_sync_toggle', [], 'Git Sync'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:tenant-isolation-card" checked><span><?php echo t_h('settings.cards.tenant_isolation', [], 'Tenant isolation'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:import-limits-card" checked><span><?php echo t_h('settings.cards.import_limits', [], 'Import Limits'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:user-quotas-card" checked><span><?php echo t_h('settings.cards.user_quotas', [], 'User quotas'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:custom-css-card" checked><span><?php echo t_h('settings.cards.custom_css', [], 'Custom CSS path'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:disaster-recovery-card" checked><span><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:orphan-scanner-card" checked><span><?php echo t_h('settings.cards.orphan_scanner', [], 'Orphan attachments scanner'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:activity-log-card" checked><span><?php echo t_h('settings.cards.activity_log', [], 'Activity log'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:storage-stats-card" checked><span><?php echo t_h('settings.cards.storage_stats', [], 'Admin storage statistics'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:check-updates-card" checked><span><?php echo t_h('settings.cards.version', [], 'Version'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:admin-contact-card" checked><span><?php echo t_h('settings.cards.admin_contact', [], 'Help'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:github-card" checked><span><?php echo t_h('settings.cards.documentation', [], 'Documentation GitHub'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:website-card" checked><span><?php echo t_h('settings.cards.website', [], 'Poznote Website'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:support-card" checked><span><?php echo t_h('settings.cards.support', [], 'Support Poznote'); ?></span></label>
</div>
</div>

<!-- Toolbar Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.toolbar', [], 'Toolbar'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<p class="ui-custom-section-hint"><?php echo t_h('modals.ui_customization.toolbar_hint', [], 'Formatting buttons (bold, lists, code…) only appear while text is selected in a note. Other actions are grouped in the ⋮ menu.'); ?></p>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-bold" checked><span><?php echo t_h('editor.toolbar.bold', [], 'Bold'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-italic" checked><span><?php echo t_h('editor.toolbar.italic', [], 'Italic'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-underline" checked><span><?php echo t_h('editor.toolbar.underline', [], 'Underline'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-strikethrough" checked><span><?php echo t_h('editor.toolbar.strikethrough', [], 'Strikethrough'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-link" checked><span><?php echo t_h('editor.toolbar.link', [], 'Link'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-color" checked><span><?php echo t_h('editor.toolbar.text_color', [], 'Text color'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-highlight" checked><span><?php echo t_h('editor.toolbar.highlight', [], 'Highlight'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-list-ul" checked><span><?php echo t_h('editor.toolbar.bullet_list', [], 'Bullet list'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-list-ol" checked><span><?php echo t_h('editor.toolbar.numbered_list', [], 'Numbered list'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-task-list" checked><span><?php echo t_h('editor.toolbar.toggle_checklist', [], 'Toggle checklist'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-task-remove" checked><span><?php echo t_h('editor.toolbar.remove_checklist', [], 'Remove checkboxes'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-text-height" checked><span><?php echo t_h('slash_menu.title', [], 'Title'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-code" checked><span><?php echo t_h('editor.toolbar.code_block', [], 'Code block'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-inline-code" checked><span><?php echo t_h('editor.toolbar.inline_code', [], 'Inline code'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-eraser" checked><span><?php echo t_h('editor.toolbar.clear_formatting', [], 'Clear formatting'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-search-replace" checked><span><?php echo t_h('editor.toolbar.search_replace', [], 'Search and Replace'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-checklist" checked><span><?php echo t_h('editor.toolbar.insert_checklist', [], 'Checklist'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-tasklist-actions" checked><span><?php echo t_h('tasklist.actions', [], 'Task list actions'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-favorite" checked><span><?php echo t_h('index.toolbar.favorite_add', [], 'Favorite'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-publish" checked><span><?php echo t_h('index.toolbar.share_note', [], 'Share'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-attachment" checked><span><?php echo t_h('modals.attachment.title', [], 'Attachments'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-reminder" checked><span><?php echo t_h('modals.ui_customization.reminder_bell', [], 'Bell icon (reminder)'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-markdown-syntax" checked><span><?php echo t_h('markdown_syntax.menu_item', [], 'Markdown syntax'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-open-new-tab" checked><span><?php echo t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-duplicate" checked><span><?php echo t_h('common.duplicate', [], 'Duplicate'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-move" checked><span><?php echo t_h('common.move', [], 'Move'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-create-linked-note" checked><span><?php echo t_h('editor.toolbar.create_linked_note', [], 'Create linked note'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-download" checked><span><?php echo t_h('common.download', [], 'Download'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-print" checked><span><?php echo t_h('common.print', [], 'Print'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-convert" checked><span><?php echo t_h('modals.convert.title', [], 'Convert'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-audio" checked><span><?php echo t_h('slash_menu.audio', [], 'Audio'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-clear-completed" checked><span><?php echo t_h('tasklist.clear_completed', [], 'Clear completed tasks'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-uncheck-all" checked><span><?php echo t_h('tasklist.uncheck_all', [], 'Uncheck all tasks'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-snapshot" checked><span><?php echo t_h('snapshot.menu_item', [], 'Snapshots'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-split-view" checked><span><?php echo t_h('editor.toolbar.split_view', [], 'Toggle split view'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-trash" checked><span><?php echo t_h('common.delete', [], 'Delete'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-info" checked><span><?php echo t_h('common.information', [], 'Information'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-note-width" checked><span><?php echo t_h('index.toolbar.note_width', [], 'Note width'); ?></span></label>
</div>
</div>

<!-- Slash Menu Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.slash_menu', [], 'Slash Menu'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:normal" checked><span><?php echo t_h('slash_menu.back_to_normal', [], 'Back to normal text'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:title" checked><span><?php echo t_h('slash_menu.title', [], 'Title'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:format" checked><span><?php echo t_h('slash_menu.format_text', [], 'Format text'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:color" checked><span><?php echo t_h('slash_menu.color', [], 'Color'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:code" checked><span><?php echo t_h('slash_menu.code', [], 'Code'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:list" checked><span><?php echo t_h('slash_menu.list', [], 'List'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:tasklist-embed" checked><span><?php echo t_h('slash_menu.tasklist_embed', [], 'Task list'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:quote" checked><span><?php echo t_h('slash_menu.quote', [], 'Quote'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:media" checked><span><?php echo t_h('slash_menu.media', [], 'Media'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:toggle" checked><span><?php echo t_h('slash_menu.toggle', [], 'Toggle'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:emoji" checked><span><?php echo t_h('slash_menu.emoji', [], 'Emoji'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:date" checked><span><?php echo t_h('slash_menu.date', [], 'Date'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:excalidraw" checked><span>Excalidraw</span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:table" checked><span><?php echo t_h('slash_menu.table', [], 'Table'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:separator" checked><span><?php echo t_h('slash_menu.separator', [], 'Separator'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:note-reference" checked><span><?php echo t_h('slash_menu.link_to_note', [], 'Link to note'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:link-to-attachment" checked><span><?php echo t_h('slash_menu.link_to_attachment', [], 'Link to attachment'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:link" checked><span><?php echo t_h('slash_menu.link', [], 'Link'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:image" checked><span><?php echo t_h('slash_menu.image', [], 'Image'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:take-photo" checked><span><?php echo t_h('slash_menu.take_photo', [], 'Take a photo'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:audio-file" checked><span><?php echo t_h('slash_menu.audio', [], 'Audio'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:cancel" checked><span><?php echo t_h('slash_menu.cancel', [], 'Cancel'); ?></span></label>
</div>
</div>

<!-- Other Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.panels', [], 'Other'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:mini-calendar" checked><span><?php echo t_h('common.calendar', [], 'Calendar'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:outline-panel" checked><span><?php echo t_h('common.outline.title', [], 'Outline'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:tasklist-progress" checked><span><?php echo t_h('modals.ui_customization.tasklist_progress_bar', [], 'Task list progress bar'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:note-created-date" checked><span><?php echo t_h('display.cards.show_note_created', [], 'Show creation date'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:note-icons" checked><span><?php echo t_h('display.cards.show_note_icons', [], 'Show note icons'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:folder-note-count" checked><span><?php echo t_h('display.cards.show_folder_counts', [], 'Show folder counts'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:sidebarCreateBtn" checked><span><?php echo t_h('sidebar.create', [], 'Create'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:sidebarExpandFoldersBtn" checked><span><?php echo t_h('sidebar.expand_all_folders', [], 'Expand all folders'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:sidebarNotificationsBtn" checked><span><?php echo t_h('reminder.notifications', [], 'Notifications'); ?></span></label>
    <label class="ui-custom-item" data-ui-pages="notes dashboard"><input type="checkbox" data-ui-key="card:edgeAiChatBtn" checked><span><?php echo t_h('ai_chat.toolbar_button', [], 'AI assistant'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:search-bar-container" checked><span><?php echo t_h('modals.ui_customization.index_search_bar', [], 'Search bar'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="share:restrict-users" checked><span><?php echo t_h('modals.ui_customization.share_restrict_users', [], 'Share: restrict to specific users'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="share:protocol-toggle" checked><span><?php echo t_h('modals.ui_customization.share_protocol_toggle', [], 'Share: HTTPS toggle'); ?></span></label>
    <label class="ui-custom-item" data-ui-pages=""><input type="checkbox" data-ui-key="card:directCopyRestoreCard" checked><span><?php echo t_h('modals.ui_customization.direct_copy_restore_section', [], 'Restore page: "Restore when standard restore doesn\'t work" section'); ?></span></label>
    <label class="ui-custom-item" data-ui-pages=""><input type="checkbox" data-ui-key="card:s3-user-backup-section" checked><span><?php echo t_h('modals.ui_customization.s3_backups_section', [], 'Backup page: "S3 Backups" section'); ?></span></label>
    <label class="ui-custom-item" data-ui-pages=""><input type="checkbox" data-ui-key="card:s3RestoreSection" checked><span><?php echo t_h('modals.ui_customization.s3_restore_section', [], 'Restore page: "Restore from S3" section'); ?></span></label>
</div>
</div>

<!-- Workspace Menu Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.workspace_menu', [], 'Workspace Menu'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="wsmenu:edit-workspaces" checked><span><?php echo t_h('workspaces.menu.edit_workspaces', [], 'Edit workspaces'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="wsmenu:new-workspace" checked><span><?php echo t_h('workspaces.menu.new_workspace', [], 'New workspace'); ?></span></label>
</div>
</div>

<!-- Notes Page Icon Sidebar Section -->
<div class="ui-custom-section" data-ui-pages="notes dashboard">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.icon_sidebar', [], 'Icon sidebar'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarDashboardBtn" checked><span><?php echo t_h('common.back_to_home', [], 'Dashboard'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarNotesBtn" checked><span><?php echo t_h('common.notes', [], 'Notes'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarTagsBtn" checked><span><?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarFoldersBtn" checked><span><?php echo t_h('home.folders', [], 'Folders'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarSharesBtn" checked><span><?php echo t_h('home.shares', [], 'Shares'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarAttachmentsBtn" checked><span><?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarTrashBtn" checked><span><?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarDiaryBtn" checked><span><?php echo t_h('diary.title', [], 'Diary'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarTasksBtn" checked><span><?php echo t_h('tasks_page.title', [], 'Tasks'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarGraphBtn" checked><span><?php echo t_h('home.graph', [], 'Graph'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarGitPushBtn" checked><span>Push</span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarGitPullBtn" checked><span>Pull</span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarProfileBtn" checked><span><?php echo t_h('profile.card', [], 'My Profile'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarThemeToggleBtn" checked><span><?php echo t_h('modals.ui_customization.theme_toggle', [], 'Theme toggle'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarAboutBtn" checked><span><?php echo t_h('settings.categories.documentation', [], 'About'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:iconSidebarLogoutBtn" checked><span><?php echo t_h('workspace_menu.logout', [], 'Logout'); ?></span></label>
</div>
</div>

<!-- Dashboard Toolbar Section -->
<div class="ui-custom-section" data-ui-pages="dashboard">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.dashboard_toolbar', [], 'Dashboard'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardTopbarFilter" checked><span><?php echo t_h('modals.ui_customization.dashboard_filter_bar', [], 'Filter bar'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardViewLayoutBtn" checked><span><?php echo t_h('modals.ui_customization.view_layout_toggle', [], 'View toggle (grid / list, card size)'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardViewColumnsBtn" checked><span><?php echo t_h('dashboard.view.columns', [], 'Maximum columns'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardColorFilterBtn" checked><span><?php echo t_h('note_color.filter', [], 'Filter by color'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardModifiedFilterBtn" checked><span><?php echo t_h('dashboard.modified.button', [], 'Filter by last modification'); ?></span></label>
    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:dashboardTagFilterBtn" checked><span><?php echo t_h('dashboard.tag_filter.button', [], 'Filter by tag'); ?></span></label>
</div>
</div>

<!-- Folder Actions Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.folder_actions', [], 'Folder Actions'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<div class="ui-custom-items">
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:folder-actions-toggle" checked><span><?php echo t_h('modals.ui_customization.folder_actions_toggle', [], 'Menu button (⋮) on folders'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:create-note-in-folder" checked><span><?php echo t_h('notes_list.folder_actions.create', [], 'Create here'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:open-kanban-view" checked><span><?php echo t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:open-all-notes-in-tabs" checked><span><?php echo t_h('notes_list.folder_actions.open_all_in_tabs', [], 'Open all notes in tabs'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:move-folder-files" checked><span><?php echo t_h('notes_list.folder_actions.move_all_files', [], 'Move all files'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:move-entire-folder" checked><span><?php echo t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:duplicate-folder" checked><span><?php echo t_h('notes_list.folder_actions.duplicate_folder', [], 'Duplicate folder'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:copy-folder" checked><span><?php echo t_h('notes_list.folder_actions.copy_folder', [], 'Copy'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:cut-folder" checked><span><?php echo t_h('notes_list.folder_actions.cut_folder', [], 'Cut'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:paste-into-folder" checked><span><?php echo t_h('notes_list.folder_actions.paste_into_folder', [], 'Paste into folder'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:download-folder" checked><span><?php echo t_h('notes_list.folder_actions.download_folder', [], 'Download folder'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:share-folder" checked><span><?php echo t_h('notes_list.folder_actions.share_folder', [], 'Make public'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:rename-folder" checked><span><?php echo t_h('notes_list.folder_actions.rename_folder', [], 'Rename'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:toggle-sort-submenu" checked><span><?php echo t_h('sort.header', [], 'Sort by'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:delete-folder" checked><span><?php echo t_h('notes_list.folder_actions.delete_folder', [], 'Delete'); ?></span></label>
</div>
</div>

<!-- Note Actions Section -->
<div class="ui-custom-section" data-ui-pages="notes">
<h4 class="ui-custom-section-title"><span><?php echo t_h('modals.ui_customization.sections.note_actions', [], 'Note Actions'); ?></span><button type="button" class="ui-custom-toggle-all" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button></h4>
<p class="ui-custom-section-hint"><?php echo t_h('modals.ui_customization.note_actions_hint', [], 'Items of the ⋮ menu on each note in the sidebar. Unchecking them all hides the menu button.'); ?></p>
<div class="ui-custom-items">
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:note-actions-toggle" checked><span><?php echo t_h('modals.ui_customization.note_actions_toggle', [], 'Menu button (⋮) on notes'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:rename-note" checked><span><?php echo t_h('notes_list.note_actions.rename_note', [], 'Rename note'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:toggle-favorite" checked><span><?php echo t_h('notes_list.folder_actions.add_favorite', [], 'Add to favorites'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:duplicate-note" checked><span><?php echo t_h('common.duplicate', [], 'Duplicate'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:create-note-shortcut" checked><span><?php echo t_h('editor.toolbar.create_linked_note', [], 'Create shortcut'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:show-move-folder-dialog" checked><span><?php echo t_h('notes_list.note_actions.move_note', [], 'Move note'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:copy-note" checked><span><?php echo t_h('notes_list.note_actions.copy_note', [], 'Copy'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:cut-note" checked><span><?php echo t_h('notes_list.note_actions.cut_note', [], 'Cut'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:paste-into-note-folder" checked><span><?php echo t_h('notes_list.note_actions.paste_note', [], 'Paste here'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:archive-note" checked><span><?php echo t_h('archive.menu_item', [], 'Archive note'); ?></span></label>
        <label class="ui-custom-item"><input type="checkbox" data-ui-key="note:delete-note" checked><span><?php echo t_h('notes_list.note_actions.delete_note', [], 'Delete note'); ?></span></label>
</div>
</div>
