<!-- Tag all notes of a folder. Shared by index.php (via modals.php) and
     list_folders.php; opened by showTagFolderNotesDialog() in js/utils-menus.js.
     The messages the script needs at runtime are carried as data attributes,
     so the page does not have to load the client-side i18n bundle. -->
<div id="tagFolderNotesModal" class="modal"
	data-msg-count-one="<?php echo t_h('modals.tag_folder_notes.count_one', [], '1 note will be tagged'); ?>"
	data-msg-count-other="<?php echo t_h('modals.tag_folder_notes.count_other', [], '{{count}} notes will be tagged'); ?>"
	data-msg-empty="<?php echo t_h('modals.tag_folder_notes.empty_folder', [], 'This folder is empty'); ?>"
	data-msg-no-tags="<?php echo t_h('modals.tag_folder_notes.no_tags', [], 'Enter at least one tag'); ?>"
	data-msg-applying="<?php echo t_h('modals.tag_folder_notes.applying', [], 'Tagging...'); ?>"
	data-msg-success-one="<?php echo t_h('modals.tag_folder_notes.success_one', [], '1 note tagged'); ?>"
	data-msg-success-other="<?php echo t_h('modals.tag_folder_notes.success_other', [], '{{count}} notes tagged'); ?>"
	data-msg-success-none="<?php echo t_h('modals.tag_folder_notes.success_none', [], 'All notes already had these tags'); ?>"
	data-msg-error="<?php echo t_h('modals.tag_folder_notes.error', [], 'Could not tag the notes'); ?>">
	<div class="modal-content">
		<h3><?php echo t_h('modals.tag_folder_notes.title', [], 'Tag all notes'); ?></h3>
		<p><?php echo t_h('modals.tag_folder_notes.prompt_prefix', [], 'Add tags to every note in'); ?> "<span id="tagFolderNotesSourceName"></span>"<?php echo t_h('modals.tag_folder_notes.prompt_suffix', [], ':'); ?></p>
		<input type="text" id="tagFolderNotesInput" autocomplete="off" autocapitalize="off" spellcheck="false"
			placeholder="<?php echo t_h('modals.tag_folder_notes.placeholder', [], 'Tags, separated by commas'); ?>">
		<div id="tagFolderNotesSuggestions" class="tag-folder-notes-suggestions" style="display: none;">
			<span class="tag-folder-notes-suggestions-label"><?php echo t_h('modals.tag_folder_notes.existing_tags', [], 'Existing tags'); ?></span>
			<div id="tagFolderNotesSuggestionList" class="tag-folder-notes-suggestion-list"></div>
		</div>
		<label class="tag-folder-notes-option" id="tagFolderNotesSubfoldersOption" style="display: none;">
			<input type="checkbox" id="tagFolderNotesIncludeSubfolders">
			<span><?php echo t_h('modals.tag_folder_notes.include_subfolders', [], 'Include the notes of subfolders'); ?></span>
		</label>
		<div class="modal-info-message">
			<span id="tagFolderNotesCountText"></span>
		</div>
		<div class="modal-buttons">
			<button type="button" class="btn-cancel" data-action="close-modal" data-modal="tagFolderNotesModal"><?php echo t_h('common.cancel'); ?></button>
			<button type="button" class="btn-primary" data-action="execute-tag-folder-notes"><?php echo t_h('modals.tag_folder_notes.apply', [], 'Add tags'); ?></button>
		</div>
		<div id="tagFolderNotesErrorMessage" class="modal-error-message"></div>
	</div>
</div>
