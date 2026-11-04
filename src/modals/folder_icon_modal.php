<!-- Folder Icon Modal -->
<div id="folderIconModal" class="modal">
    <div class="modal-content folder-icon-modal-content">
        <div class="folder-icon-search-wrapper">
            <input type="text" id="folderIconSearchInput" placeholder="<?php echo t_h('modals.folder_icon.search_placeholder', [], 'Search icons...'); ?>" autocomplete="off">
        </div>
        <div class="folder-icon-recent-section" id="folderIconRecentSection" style="display: none;">
            <div class="folder-icon-grid folder-icon-recent-grid" id="folderIconRecentGrid"></div>
        </div>
        <div class="folder-icon-grid" id="folderIconGrid">
            <!-- Icons will be populated here -->
        </div>
        <div class="folder-color-section">
<?php include __DIR__ . '/icon_color_options.php'; ?>
            <!-- The title takes the icon colour too (discussion #1729):
                 folders.title_color / entries.title_color, js/folder-icon.js
                 shows the label that fits the target -->
            <label class="folder-icon-apply-title">
                <input type="checkbox" id="folderIconApplyToTitle">
                <span data-icon-target="folder"><?php echo t_h('modals.folder_icon.apply_to_folder_title', [], 'Apply the color to the folder title'); ?></span>
                <span data-icon-target="note" hidden><?php echo t_h('modals.folder_icon.apply_to_note_title', [], 'Apply the color to the note title'); ?></span>
            </label>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-secondary" id="resetFolderIconBtn"><?php echo t_h('modals.folder_icon.default_icon', [], 'Set default icon'); ?></button>
            <button type="button" class="btn-cancel" data-action="close-folder-icon-modal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="applyFolderIconBtn"><?php echo t_h('common.apply', [], 'Apply'); ?></button>
        </div>
    </div>
</div>
