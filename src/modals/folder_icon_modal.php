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
            <div class="folder-color-picker">
                <div class="folder-color-option" data-color="" title="<?php echo t_h('modals.folder_icon.default_color', [], 'Default'); ?>">
                    <div class="folder-color-swatch folder-color-default"></div>
                </div>
                <div class="folder-color-option" data-color="#ef4444" title="<?php echo t_h('modals.folder_icon.red', [], 'Red'); ?>">
                    <div class="folder-color-swatch" style="background-color: #ef4444;"></div>
                </div>
                <div class="folder-color-option" data-color="#f97316" title="<?php echo t_h('modals.folder_icon.orange', [], 'Orange'); ?>">
                    <div class="folder-color-swatch" style="background-color: #f97316;"></div>
                </div>
                <div class="folder-color-option" data-color="#f59e0b" title="<?php echo t_h('modals.folder_icon.amber', [], 'Amber'); ?>">
                    <div class="folder-color-swatch" style="background-color: #f59e0b;"></div>
                </div>
                <div class="folder-color-option" data-color="#eab308" title="<?php echo t_h('modals.folder_icon.yellow', [], 'Yellow'); ?>">
                    <div class="folder-color-swatch" style="background-color: #eab308;"></div>
                </div>
                <div class="folder-color-option" data-color="#84cc16" title="<?php echo t_h('modals.folder_icon.lime', [], 'Lime'); ?>">
                    <div class="folder-color-swatch" style="background-color: #84cc16;"></div>
                </div>
                <div class="folder-color-option" data-color="#22c55e" title="<?php echo t_h('modals.folder_icon.green', [], 'Green'); ?>">
                    <div class="folder-color-swatch" style="background-color: #22c55e;"></div>
                </div>
                <div class="folder-color-option" data-color="#10b981" title="<?php echo t_h('modals.folder_icon.emerald', [], 'Emerald'); ?>">
                    <div class="folder-color-swatch" style="background-color: #10b981;"></div>
                </div>
                <div class="folder-color-option" data-color="#14b8a6" title="<?php echo t_h('modals.folder_icon.teal', [], 'Teal'); ?>">
                    <div class="folder-color-swatch" style="background-color: #14b8a6;"></div>
                </div>
                <div class="folder-color-option" data-color="#06b6d4" title="<?php echo t_h('modals.folder_icon.cyan', [], 'Cyan'); ?>">
                    <div class="folder-color-swatch" style="background-color: #06b6d4;"></div>
                </div>
                <div class="folder-color-option" data-color="#0ea5e9" title="<?php echo t_h('modals.folder_icon.sky', [], 'Sky'); ?>">
                    <div class="folder-color-swatch" style="background-color: #0ea5e9;"></div>
                </div>
                <div class="folder-color-option" data-color="#3b82f6" title="<?php echo t_h('modals.folder_icon.blue', [], 'Blue'); ?>">
                    <div class="folder-color-swatch" style="background-color: #3b82f6;"></div>
                </div>
                <div class="folder-color-option" data-color="#6366f1" title="<?php echo t_h('modals.folder_icon.indigo', [], 'Indigo'); ?>">
                    <div class="folder-color-swatch" style="background-color: #6366f1;"></div>
                </div>
                <div class="folder-color-option" data-color="#8b5cf6" title="<?php echo t_h('modals.folder_icon.violet', [], 'Violet'); ?>">
                    <div class="folder-color-swatch" style="background-color: #8b5cf6;"></div>
                </div>
                <div class="folder-color-option" data-color="#a855f7" title="<?php echo t_h('modals.folder_icon.purple', [], 'Purple'); ?>">
                    <div class="folder-color-swatch" style="background-color: #a855f7;"></div>
                </div>
                <div class="folder-color-option" data-color="#d946ef" title="<?php echo t_h('modals.folder_icon.fuchsia', [], 'Fuchsia'); ?>">
                    <div class="folder-color-swatch" style="background-color: #d946ef;"></div>
                </div>
                <div class="folder-color-option" data-color="#ec4899" title="<?php echo t_h('modals.folder_icon.pink', [], 'Pink'); ?>">
                    <div class="folder-color-swatch" style="background-color: #ec4899;"></div>
                </div>
                <div class="folder-color-option" data-color="#f43f5e" title="<?php echo t_h('modals.folder_icon.rose', [], 'Rose'); ?>">
                    <div class="folder-color-swatch" style="background-color: #f43f5e;"></div>
                </div>
                <div class="folder-color-option" data-color="#64748b" title="<?php echo t_h('modals.folder_icon.slate', [], 'Slate'); ?>">
                    <div class="folder-color-swatch" style="background-color: #64748b;"></div>
                </div>
                <div class="folder-color-option" data-color="#6b7280" title="<?php echo t_h('modals.folder_icon.gray', [], 'Gray'); ?>">
                    <div class="folder-color-swatch" style="background-color: #6b7280;"></div>
                </div>
                <div class="folder-color-option" data-color="#78716c" title="<?php echo t_h('modals.folder_icon.stone', [], 'Stone'); ?>">
                    <div class="folder-color-swatch" style="background-color: #78716c;"></div>
                </div>
                <div class="folder-color-option" data-color="#111827" title="<?php echo t_h('modals.folder_icon.black', [], 'Black'); ?>">
                    <div class="folder-color-swatch" style="background-color: #111827;"></div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-secondary" id="resetFolderIconBtn"><?php echo t_h('modals.folder_icon.default_icon', [], 'Set default icon'); ?></button>
            <button type="button" class="btn-cancel" data-action="close-folder-icon-modal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="applyFolderIconBtn"><?php echo t_h('common.apply', [], 'Apply'); ?></button>
        </div>
    </div>
</div>
