<?php
/**
 * Labels and switches of the share settings dialog (js/share-settings-modal.js),
 * which opens on the pages holding a note or a folder and on the Shares page.
 */
?>
<div id="shareSettingsConfig" hidden
	data-current-user-id="<?php echo (int)$_SESSION['user_id']; ?>"
	data-hide-protocol-toggle="<?php echo poznoteIsUiElementHidden('share:protocol-toggle') ? '1' : '0'; ?>"
	data-hide-restrict-users="<?php echo (!poznoteCanTargetOtherUsers() || poznoteIsUiElementHidden('share:restrict-users')) ? '1' : '0'; ?>"
	data-txt-share-link-copied="<?php echo t_h('workspaces.share.messages.url_copied', [], 'Share link copied to clipboard!'); ?>"
	data-txt-revoke-modal-title="<?php echo t_h('public.revoke_modal.title', [], 'Revoke share'); ?>"
	data-txt-revoke-modal-text="<?php echo t_h('public.revoke_modal.text', [], 'You can permanently delete this share, or keep it and make it inaccessible until you enable it again.'); ?>"
	data-txt-revoke-modal-text-disabled="<?php echo t_h('public.revoke_modal.text_disabled', [], 'This share is currently inaccessible. You can make it accessible again, or permanently delete it.'); ?>"
	data-txt-ok="<?php echo t_h('common.ok', [], 'OK'); ?>"
	data-txt-revoke-delete="<?php echo t_h('public.revoke_modal.delete', [], 'Delete permanently'); ?>"
	data-txt-revoke-disable="<?php echo t_h('public.revoke_modal.disable', [], 'Make inaccessible'); ?>"
	data-txt-revoke-enable="<?php echo t_h('public.revoke_modal.enable', [], 'Make accessible again'); ?>"
	data-txt-revoke="<?php echo t_h('public.actions.revoke', [], 'Revoke'); ?>"
	data-txt-share-disabled-badge="<?php echo t_h('public.disabled_badge', [], 'Inaccessible'); ?>"
	data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
	data-txt-copy-url="<?php echo t_h('public.actions.copy_url', [], 'Copy URL'); ?>"
	data-txt-custom-token="<?php echo t_h('public.table.token', [], 'Token'); ?>"
	data-txt-custom-token-placeholder="<?php echo t_h('index.public_modal.custom_token_placeholder', [], 'my_custom_token-1'); ?>"
	data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
	data-txt-folder-editable="<?php echo t_h('index.folder_permissions.editable', [], 'Allow note editing'); ?>"
	data-txt-hide-password="<?php echo t_h('login.hide_password', [], 'Hide password'); ?>"
	data-txt-no-users-found="<?php echo t_h('public.no_users_found', [], 'No other users found'); ?>"
	data-txt-note-editable="<?php echo t_h('index.note_permissions.editable', [], 'Allow text editing'); ?>"
	data-txt-open="<?php echo t_h('public.actions.open', [], 'Open public view'); ?>"
	data-txt-password-label="<?php echo t_h('index.public_modal.password', [], 'Password (optional)'); ?>"
	data-txt-password-placeholder="<?php echo t_h('index.public_modal.password_placeholder', [], 'Enter a password'); ?>"
	data-txt-renew="<?php echo t_h('index.public_modal.renew_token', [], 'Renew token'); ?>"
	data-txt-restrict-users="<?php echo t_h('public.restrict_users', [], 'Restrict to specific users'); ?>"
	data-txt-restrict-users-mobile="<?php echo t_h('public.restrict_users_mobile', [], 'Restrict'); ?>"
	data-txt-save="<?php echo t_h('common.save', [], 'Save'); ?>"
	data-txt-search-indexable="<?php echo t_h('index.public_modal.indexable', [], 'Allow indexing by search engines'); ?>"
	data-txt-search-indexable-mobile="<?php echo t_h('index.public_modal.indexable_mobile', [], 'Allow indexing'); ?>"
	data-txt-show-password="<?php echo t_h('login.show_password', [], 'Show password'); ?>"
	data-txt-task-check-only="<?php echo t_h('index.task_permissions.check_only', [], 'Check or uncheck only'); ?>"
	data-txt-task-full="<?php echo t_h('index.task_permissions.full', [], 'Full edit'); ?>"
	data-txt-task-permissions="<?php echo t_h('index.task_permissions.title', [], 'Permissions'); ?>"
	data-txt-task-read-only="<?php echo t_h('index.task_permissions.read_only', [], 'Read only'); ?>"
	data-txt-token-help="<?php echo t_h('public.token_help', [], 'The token is the unique part you choose in the public link. For example, using project-2026 gives https://your-domain.example/project-2026 for a note, or https://your-domain.example/folder/project-2026 for a folder.'); ?>"
	data-txt-token-update-failed="<?php echo t_h('public.token_update_failed', [], 'Failed to update token'); ?>"
	data-txt-use-https="<?php echo t_h('index.folder_share_modal.use_https', [], 'HTTPS'); ?>"
	data-txt-users-loading="<?php echo t_h('public.users_loading', [], 'Loading users...'); ?>">
</div>
