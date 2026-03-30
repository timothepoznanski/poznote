<!-- Notification popup -->
<div id="notificationOverlay" class="notification-overlay"></div>
<div id="notificationPopup"></div>

<!-- Update Modal -->
<div id="updateModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.update.title'); ?></h3>
        <p id="updateMessage"></p>
        <div class="backup-warning initially-hidden" id="updateBackupWarning">
            <p><strong>⚠️ </strong> <span class="backup-warning-text"><?php echo t_h('modals.update.backup_warning'); ?></span></p>
            <p class="text-small-muted"><?php echo t('modals.update.backup_hint'); ?></p>
        </div>
        <div class="version-info">
            <p><strong><?php echo t_h('modals.update.current_version'); ?></strong> <span id="currentVersion"><?php echo t_h('common.loading'); ?></span></p>
            <p><strong><?php echo t_h('modals.update.latest_available'); ?></strong> <span id="availableVersion"><?php echo t_h('common.loading'); ?></span></p>
            <p id="releaseNotesLink" class="initially-hidden"><a href="#" id="releaseNotesHref" target="_blank"><?php echo t_h('modals.update.view_release_notes'); ?></a></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-update-modal"><?php echo t_h('common.close'); ?></button>
        </div>
    </div>
</div>

<!-- Update Check Modal -->
<div id="updateCheckModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.update_check.title'); ?></h3>
        <p id="updateCheckStatus"><?php echo t_h('modals.update_check.status'); ?></p>
        <div class="modal-buttons" id="updateCheckButtons">
            <button type="button" class="btn-cancel" data-action="close-update-check-modal"><?php echo t_h('common.close'); ?></button>
        </div>
    </div>
</div>

<!-- Login Display Name Modal -->
<div id="loginDisplayModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.login_display.title'); ?></h3>
        <p><?php echo t_h('modals.login_display.description'); ?></p>
        <input type="text" id="loginDisplayInput" placeholder="<?php echo t_h('modals.login_display.placeholder'); ?>" maxlength="255" />
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-login-display-modal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveLoginDisplayBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Custom CSS Path Modal -->
<div id="customCssModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.custom_css.title', [], 'Custom CSS path'); ?></h3>
        <p><?php echo t_h('modals.custom_css.description', [], 'Enter only the CSS filename. The file must be placed in the css directory. Leave empty to disable.'); ?></p>
        <input type="text" id="customCssPathInput" placeholder="<?php echo t_h('modals.custom_css.placeholder', [], 'custom.css'); ?>" maxlength="255" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <p><?php echo t_h('modals.custom_css.hint', [], 'Example: custom.css. Poznote will load it automatically from css/custom.css'); ?></p>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="customCssModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveCustomCssBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Import Limits Modal -->
<div id="importLimitsModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.import_limits.title', [], 'Import Limits'); ?></h3>
        <p><?php echo t_h('modals.import_limits.description', [], 'Configure the maximum number of files allowed during import operations.'); ?></p>
        <div class="font-size-controls">
            <div class="font-size-row">
                <label for="importMaxIndividualFilesInput"><?php echo t_h('modals.import_limits.max_individual_files', [], 'Max individual files'); ?></label>
                <input type="number" id="importMaxIndividualFilesInput" min="1" max="100000" step="1" value="50">
            </div>
            <div class="font-size-row">
                <label for="importMaxZipFilesInput"><?php echo t_h('modals.import_limits.max_zip_files', [], 'Max files in ZIP'); ?></label>
                <input type="number" id="importMaxZipFilesInput" min="1" max="100000" step="1" value="300">
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="importLimitsModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveImportLimitsBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Font Size Settings Modal -->
<div id="fontSizeModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo t_h('modals.font_size.title'); ?></h2>
        </div>
        <div class="modal-body">
            <div class="font-size-controls">
                <div class="font-size-row">
                    <label for="fontSizeInput"><?php echo t_h('modals.font_size.note_label'); ?></label>
                    <input type="number" id="fontSizeInput" min="10" max="32" step="1" value="15">
                </div>
                <div class="font-size-row">
                    <label for="sidebarFontSizeInput"><?php echo t_h('modals.font_size.sidebar_label'); ?></label>
                    <input type="number" id="sidebarFontSizeInput" min="10" max="32" step="1" value="13">
                </div>
                <div class="font-size-row">
                    <label for="codeBlockFontSizeInput"><?php echo t_h('modals.font_size.code_block_label'); ?></label>
                    <input type="number" id="codeBlockFontSizeInput" min="10" max="32" step="1" value="15">
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button id="cancelFontSizeBtn" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
            <button id="saveFontSizeBtn" class="btn-primary"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Note Width Settings Modal -->
<div id="noteWidthModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('modals.note_width.title', [], 'Note Content Width'); ?></h3>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.note_width.description', [], 'Select the maximum width for your notes content (in pixels):'); ?></p>
            <div class="note-width-input-container">
                <input type="number" id="noteWidthInput" min="0" max="2500" step="50" value="800" placeholder="800">
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" id="cancelNoteWidthBtn"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" id="fullWidthBtn" class="btn-secondary btn-full-width-footer"><?php echo t_h('modals.note_width.full_width', [], 'Full Width'); ?></button>
            <button type="button" class="btn-primary" id="saveNoteWidthBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Index Icon Scale Settings Modal -->
<div id="indexIconScaleModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('modals.index_icon_scale.title', [], 'Index Icon Scaling'); ?></h3>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.index_icon_scale.description', [], 'Adjust the size of icons on the index page:'); ?></p>
            <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin: 20px 0;">
                <input type="range" id="indexIconScaleInput" min="0.5" max="2.0" step="0.1" value="1.0" style="width: 100%;">
                <span id="indexIconScaleValue" style="font-weight: bold; font-size: 1.2em;">1.0x</span>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" id="cancelIndexIconScaleBtn" class="btn btn-cancel"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" id="saveIndexIconScaleBtn" class="btn btn-primary"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>


<!-- Confirmation Modal -->
<div id="confirmModal" class="modal">
    <div class="modal-content">
        <h3 id="confirmTitle"><?php echo t_h('modals.confirm.title'); ?></h3>
        <p id="confirmMessage"><?php echo t_h('modals.confirm.message'); ?></p>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-confirm-modal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-secondary initially-hidden" id="saveAndExitButton" data-action="execute-save-and-exit"><?php echo t_h('modals.confirm.save_and_exit'); ?></button>
            <button type="button" class="btn-primary" id="confirmButton" data-action="execute-confirmed-action"><?php echo t_h('modals.confirm.exit_without_saving'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for creating new folder -->
<div id="newFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.new_title'); ?></h3>
        <div class="modal-body modal-body-spaced">
            <input type="text" id="newFolderName" placeholder="<?php echo t_h('modals.folder.new_placeholder'); ?>" maxlength="255" class="new-folder-input" data-enter-action="create-folder">
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="newFolderModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" data-action="create-folder"><?php echo t_h('common.create'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for moving note to folder -->
<div id="moveNoteModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.change_folder'); ?></h3>
        <p><span><?php echo t_h('modals.folder.move_prefix'); ?></span> "<span id="moveNoteTitle"></span>" <span><?php echo t_h('modals.folder.move_suffix'); ?></span></p>
        <select id="moveNoteFolder">
            <option value=""><?php echo t_h('modals.folder.no_folder'); ?></option>
        </select>
        <div class="modal-buttons">
            <button data-action="move-note-to-folder"><?php echo t_h('common.move'); ?></button>
            <button data-action="close-modal" data-modal="moveNoteModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for moving note to folder from toolbar -->
<div id="moveNoteFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.move_note_folder.title'); ?></h3>
        
        <!-- Workspace selection -->
        <div class="form-group">
            <label for="workspaceSelect"><?php echo t_h('modals.move_note_folder.workspace_destination'); ?></label>
            <select id="workspaceSelect" class="workspace-select" data-action="on-workspace-change">
                <!-- Workspaces will be loaded here -->
            </select>
        </div>
        
        <div class="form-group">
            <label for="moveNoteTargetSelect"><?php echo t_h('modals.move_note_folder.target_folder'); ?></label>
            <select id="moveNoteTargetSelect" class="workspace-select">
                <!-- Options will be populated dynamically -->
            </select>
        </div>
        
        <!-- Action buttons -->
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveNoteFolderModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" id="moveActionButton" class="btn-primary" data-action="move-note-to-folder"><?php echo t_h('common.move'); ?></button>
        </div>
        
        <!-- Error message display -->
        <div id="moveFolderErrorMessage" class="modal-error-message">
            <?php echo t_h('modals.move_note_folder.enter_folder_name'); ?>
        </div>
    </div>
</div>

<!-- Modal for editing folder name -->
<div id="editFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.rename_title'); ?></h3>
        <input type="text" id="editFolderName" placeholder="<?php echo t_h('modals.folder.rename_placeholder'); ?>" maxlength="255">
        <div class="modal-buttons">
            <button data-action="save-folder-name"><?php echo t_h('common.save'); ?></button>
            <button data-action="close-modal" data-modal="editFolderModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for deleting folder -->
<div id="deleteFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.delete_title'); ?></h3>
        <div id="deleteFolderMessage" class="delete-folder-message">
            <p id="deleteFolderMainMessage" class="delete-folder-main-message"></p>
            <ul id="deleteFolderDetails" class="delete-folder-details">
            </ul>
            <p id="deleteFolderNote" class="delete-folder-note"></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="deleteFolderModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-danger" data-action="execute-delete-folder"><?php echo t_h('modals.folder.delete_folder'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for moving all files from one folder to another -->
<div id="moveFolderFilesModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.move_folder_files.title', [], 'Move All Files'); ?></h3>
        <p><?php echo t_h('modals.move_folder_files.prompt_prefix', [], 'Move all files from'); ?> "<span id="sourceFolderName"></span>" <?php echo t_h('modals.move_folder_files.prompt_suffix', [], 'to:'); ?></p>
        <select id="moveFolderFilesTargetSelect">
            <option value=""><?php echo t_h('modals.move_folder_files.select_target', [], 'Select target folder...'); ?></option>
        </select>
        <div id="folderFilesCount" class="modal-info-message">
            <span id="filesCountText"></span>
        </div>
        <div class="modal-info-message mt-12">
            • <?php echo t_h('modals.move_folder_files.hint_move_single', [], 'To move a single note to another workspace, use the "Move note" button in the toolbar'); ?><br><br>
            • <?php echo t_h('modals.move_folder_files.hint_move_all', [], 'To move all notes from one workspace to another, go to Settings → Workspaces'); ?><br><br>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveFolderFilesModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" data-action="execute-move-all-files"><?php echo t_h('modals.move_folder_files.move_all', [], 'Move All Files'); ?></button>
        </div>
        <div id="moveFilesErrorMessage" class="modal-error-message"></div>
    </div>
</div>

<!-- Move Folder to Subfolder Modal -->
<div id="moveFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.move_folder.title', [], 'Move Folder'); ?></h3>
        <p><?php echo t_h('modals.move_folder.prompt_prefix', [], 'Move folder'); ?> "<span id="moveFolderSourceName"></span>" <?php echo t_h('modals.move_folder.prompt_suffix', [], 'into:'); ?></p>
        
        <div class="form-group" style="margin-bottom: 15px;">
            <label for="moveFolderWorkspaceSelect" style="display: block; margin-bottom: 5px; font-weight: 500; font-size: 0.9em;"><?php echo t_h('modals.move_folder.workspace', [], 'Target Workspace'); ?></label>
            <select id="moveFolderWorkspaceSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background-color: var(--card-bg, #fff); color: var(--text-color, #333); display: block; -webkit-appearance: menulist; -moz-appearance: menulist; appearance: menulist;">
                <!-- Populated by JS -->
            </select>
        </div>

        <div class="form-group" style="margin-bottom: 15px;">
            <label for="moveFolderTargetSelect" style="display: block; margin-bottom: 5px; font-weight: 500; font-size: 0.9em;"><?php echo t_h('modals.move_folder.parent', [], 'Target Parent Folder'); ?></label>
            <select id="moveFolderTargetSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background-color: var(--card-bg, #fff); color: var(--text-color, #333); display: block; -webkit-appearance: menulist; -moz-appearance: menulist; appearance: menulist;">
                <option value=""><?php echo t_h('modals.move_folder.select_target', [], 'Select parent folder...'); ?></option>
            </select>
        </div>

        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveFolderModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" data-action="execute-move-folder-to-subfolder"><?php echo t_h('modals.move_folder.move', [], 'Move Folder'); ?></button>
        </div>
        <div id="moveFolderErrorMessage" class="modal-error-message"></div>
    </div>
</div>

<!-- Move notes modal (for workspaces.php) -->
<div id="moveNotesModal" class="modal initially-hidden">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.move_notes_title', [], 'Move notes from'); ?> "<span id="moveSourceName"></span>"</h3>
        <div class="form-group">
            <label for="moveTargetSelect"><?php echo t_h('modals.workspaces.select_target_workspace', [], 'Select target workspace'); ?></label>
            <select id="moveTargetSelect">
            </select>
        </div>
        <div class="buttons-with-margin">
            <button id="confirmMoveBtn" class="btn btn-primary"><?php echo t_h('workspaces.actions.move_notes', [], 'Move notes'); ?></button>
            <button data-action="close-move-modal" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Rename modal (for workspaces.php) -->
<div id="renameModal" class="modal initially-hidden">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.rename_title', [], 'Rename workspace'); ?> <span id="renameSource"></span></h3>
        <div class="form-group">
            <label for="renameNewName"><?php echo t_h('modals.workspaces.new_name', [], 'New name'); ?></label>
            <input id="renameNewName" type="text" />
        </div>
        <div class="buttons-with-margin">
            <button id="confirmRenameBtn" class="btn btn-primary"><?php echo t_h('common.rename', [], 'Rename'); ?></button>
            <button data-action="close-rename-modal" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Delete confirmation modal (for workspaces.php) -->
<div id="deleteModal" class="modal initially-hidden">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.delete_title', [], 'Confirm delete workspace'); ?> "<span id="deleteWorkspaceName"></span>"</h3>
        <p class="text-danger"><?php echo t_h('modals.workspaces.delete_description', [], 'Enter the workspace name to confirm deletion. All notes and folders will be permanently deleted and cannot be recovered.'); ?></p>
        <div class="form-group">
            <input id="confirmDeleteInput" type="text" placeholder="<?php echo t_h('modals.workspaces.delete_placeholder', [], 'Type workspace name to confirm'); ?>" />
        </div>
        <div class="buttons-with-margin">
            <button id="confirmDeleteBtn" class="btn btn-danger" disabled><?php echo t_h('modals.workspaces.delete_button', [], 'Delete workspace'); ?></button>
            <button data-action="close-delete-modal" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Create modal (unified for both create button and folder actions) -->
<div id="createModal" class="modal">
    <div class="modal-content">
        <h3 id="createModalTitle"><?php echo t_h('common.create', [], 'Create'); ?></h3>
        <div class="modal-body">
            <div class="create-options">
                <!-- Notes section -->
                <div class="create-section" id="notesSection">
                    <div class="create-note-option" data-type="html" data-action="select-create-type">
                        <i class="lucide lucide-file-text"></i>
                        <div>
                            <span><?php 
                                $title = t_h('modals.create.note.title', [], 'Note');
                                $parenPos = strpos($title, ' (');
                                if ($parenPos !== false) {
                                    echo substr($title, 0, $parenPos);
                                    echo '<span class="create-note-subtitle">' . substr($title, $parenPos) . '</span>';
                                } else {
                                    echo $title;
                                }
                            ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="markdown" data-action="select-create-type">
                        <i class="lucide lucide-file-code"></i>
                        <div>
                            <span><?php 
                                $title = t_h('modals.create.markdown.title', [], 'Markdown Note');
                                $parenPos = strpos($title, ' (');
                                if ($parenPos !== false) {
                                    echo substr($title, 0, $parenPos);
                                    echo '<span class="create-note-subtitle">' . substr($title, $parenPos) . '</span>';
                                } else {
                                    echo $title;
                                }
                            ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="list" data-action="select-create-type">
                        <i class="lucide lucide-list"></i>
                        <div>
                            <span><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option initially-hidden" data-type="subfolder" data-action="select-create-type" id="subfolderOption">
                        <i class="lucide lucide-folder-plus"></i>
                        <div>
                            <span><?php echo t_h('modals.create.subfolder.title', [], 'Subfolder'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="template" data-action="select-create-type">
                        <i class="lucide lucide-copy"></i>
                        <div>
                            <span><?php echo t_h('modals.create.template.title', [], 'Template'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="linked" data-action="select-create-type">
                        <i class="lucide lucide-link"></i>
                        <div>
                            <span><?php echo t_h('modals.create.linked.title', [], 'Shortcut'); ?></span>
                        </div>
                    </div>
                </div>
                
                <!-- Other items section (only shown when creating from main button) -->
                <div class="create-section mt-12" id="otherSection">
                    <div class="create-note-option" data-type="folder" data-action="select-create-type">
                        <i class="lucide lucide-folder"></i>
                        <div>
                            <span><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option mt-12" data-type="kanban" data-action="select-create-type">
                        <i class="lucide lucide-columns-2"></i>
                        <div>
                            <span><?php echo t_h('modals.create.kanban.title', [], 'Kanban Structure'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option mt-12" data-type="workspace" data-action="select-create-type">
                        <i class="lucide lucide-layers"></i>
                        <div>
                            <span><?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-buttons mt-16">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="createModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Export Modal -->
<div id="exportModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.export.title', [], 'Export Note'); ?></h3>
        <div class="modal-body">
            <div class="export-options">
                <!-- Markdown export option (shown only for markdown notes) -->
                <div class="export-option export-option-markdown initially-hidden" data-action="select-export-type" data-type="markdown">
                    <i class="lucide lucide-file-alt"></i>
                    <div>
                        <span><?php echo t_h('modals.export.markdown.title', [], 'Export as Markdown'); ?></span>
                        <p><?php echo t_h('modals.export.markdown.description', [], 'Download as MD file with metadata (title, tags, folder) in YAML frontmatter'); ?></p>
                    </div>
                </div>
                <!-- HTML export option (shown only for non-markdown notes) -->
                <div class="export-option export-option-html" data-action="select-export-type" data-type="html">
                    <i class="lucide lucide-file-code"></i>
                    <div>
                        <span><?php echo t_h('modals.export.html.title', [], 'Export as HTML'); ?></span>
                        <p><?php echo t_h('modals.export.html.description', [], 'Download as HTML file with all formatting preserved'); ?></p>
                    </div>
                </div>

                <!-- JSON export option (shown only for tasklist notes) -->
                <div class="export-option export-option-json initially-hidden" data-action="select-export-type" data-type="json">
                    <i class="lucide lucide-file-code"></i>
                    <div>
                        <span><?php echo t_h('modals.export.json.title', [], 'Download as JSON'); ?></span>
                        <p><?php echo t_h('modals.export.json.description', [], 'Download the raw tasklist data as a JSON file'); ?></p>
                    </div>
                </div>

                <div class="export-option export-option-print" data-action="select-export-type" data-type="print">
                    <i class="lucide lucide-printer"></i>
                    <div>
                        <span><?php echo t_h('modals.export.print.title', [], 'Print to PDF (Browser)'); ?></span>
                        <p><?php echo t_h('modals.export.print.description', [], 'Use browser\'s native print dialog to save as PDF'); ?></p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="exportModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Convert Note Modal -->
<div id="convertNoteModal" class="modal">
    <div class="modal-content">
        <h3 id="convertNoteTitle"><?php echo t_h('modals.convert.title', [], 'Convert Note'); ?></h3>
        <div class="modal-body">
            <p id="convertNoteMessage"><?php echo t_h('modals.convert.message', [], 'Are you sure you want to convert this note?'); ?></p>
            <p id="convertNoteWarning" class="convert-warning"></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-danger" data-action="close-modal" data-modal="convertNoteModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-success" id="duplicateBeforeConvertBtn"><?php echo t_h('modals.convert.duplicate_button', [], 'Duplicate'); ?></button>
            <button type="button" class="btn-primary" id="confirmConvertBtn"><?php echo t_h('common.convert', [], 'Convert'); ?></button>
        </div>
    </div>
</div>

<!-- Move Task Modal -->
<div id="moveTaskModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.task_move.title', [], 'Move task'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.task_move.description', [], 'Choose a task list to move this task to.'); ?></p>
            <input type="text" id="moveTaskSearchInput" placeholder="<?php echo t_h('modals.task_move.search_placeholder', [], 'Search task lists...'); ?>">
            <div id="moveTaskList" class="move-task-list"></div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-primary" id="confirmMoveTaskBtn"><?php echo t_h('modals.task_move.confirm', [], 'Move task'); ?></button>
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveTaskModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Note sort order modal -->
<div id="noteSortModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.note_sort.title', [], 'Note sort order'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.note_sort.description', [], 'Choose how notes are ordered in the notes list:'); ?></p>
            <div class="radio-options">
                <label><input type="radio" name="noteSort" value="updated_desc"> <?php echo t_h('modals.note_sort.options.last_modified', [], 'Last modified'); ?></label>
                <label><input type="radio" name="noteSort" value="created_desc"> <?php echo t_h('modals.note_sort.options.last_created', [], 'Last created'); ?></label>
                <label><input type="radio" name="noteSort" value="heading_asc"> <?php echo t_h('modals.note_sort.options.alphabetical', [], 'Alphabetical'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="noteSortModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveNoteSortModalBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Language selection modal -->
<div id="languageModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('settings.language.label'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.language.description', [], 'Select your preferred language:'); ?></p>
            <div class="radio-options">
                <label><input type="radio" name="languageChoice" value="zh-cn"> <?php echo t_h('settings.language.chinese_simplified'); ?></label>
                <label><input type="radio" name="languageChoice" value="en"> <?php echo t_h('settings.language.english'); ?></label>
                <label><input type="radio" name="languageChoice" value="fr"> <?php echo t_h('settings.language.french'); ?></label>
                <label><input type="radio" name="languageChoice" value="de"> <?php echo t_h('settings.language.german'); ?></label>
                <label><input type="radio" name="languageChoice" value="pt"> <?php echo t_h('settings.language.portuguese'); ?></label>
                <label><input type="radio" name="languageChoice" value="ru"> <?php echo t_h('settings.language.russian'); ?></label>
                <label><input type="radio" name="languageChoice" value="es"> <?php echo t_h('settings.language.spanish'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="languageModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveLanguageModalBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Theme selection modal -->
<div id="themeModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.theme.title', [], 'Theme Selection'); ?></h3>
        <div class="modal-body">
            <div class="radio-options">
                <label><input type="radio" name="themeChoice" value="light"> <?php echo t_h('theme.badge.light', [], 'Light'); ?></label>
                <label><input type="radio" name="themeChoice" value="dark"> <?php echo t_h('theme.badge.dark', [], 'Dark'); ?></label>
                <label><input type="radio" name="themeChoice" value="system"> <?php echo t_h('theme.badge.system', [], 'System'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="themeModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveThemeModalBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Timezone modal -->
<div id="timezoneModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.timezone.title', [], 'Timezone'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.timezone.description', [], 'Select your timezone:'); ?></p>
            <select id="timezoneSelect" class="timezone-select">
                <optgroup label="<?php echo t_h('modals.timezone.groups.europe', [], 'Europe'); ?>">
                    <option value="Europe/Paris">Europe/Paris (France, CET/CEST)</option>
                    <option value="Europe/London">Europe/London (UK, GMT/BST)</option>
                    <option value="Europe/Brussels">Europe/Brussels (Belgium, CET/CEST)</option>
                    <option value="Europe/Amsterdam">Europe/Amsterdam (Netherlands, CET/CEST)</option>
                    <option value="Europe/Berlin">Europe/Berlin (Germany, CET/CEST)</option>
                    <option value="Europe/Madrid">Europe/Madrid (Spain, CET/CEST)</option>
                    <option value="Europe/Rome">Europe/Rome (Italy, CET/CEST)</option>
                    <option value="Europe/Zurich">Europe/Zurich (Switzerland, CET/CEST)</option>
                    <option value="Europe/Vienna">Europe/Vienna (Austria, CET/CEST)</option>
                    <option value="Europe/Warsaw">Europe/Warsaw (Poland, CET/CEST)</option>
                    <option value="Europe/Stockholm">Europe/Stockholm (Sweden, CET/CEST)</option>
                    <option value="Europe/Copenhagen">Europe/Copenhagen (Denmark, CET/CEST)</option>
                    <option value="Europe/Oslo">Europe/Oslo (Norway, CET/CEST)</option>
                    <option value="Europe/Helsinki">Europe/Helsinki (Finland, EET/EEST)</option>
                    <option value="Europe/Athens">Europe/Athens (Greece, EET/EEST)</option>
                    <option value="Europe/Moscow">Europe/Moscow (Russia, MSK)</option>
                    <option value="Europe/Lisbon">Europe/Lisbon (Portugal, WET/WEST)</option>
                    <option value="Europe/Dublin">Europe/Dublin (Ireland, GMT/IST)</option>
                </optgroup>
                <optgroup label="<?php echo t_h('modals.timezone.groups.america', [], 'America'); ?>">
                    <option value="America/New_York">America/New_York (US Eastern)</option>
                    <option value="America/Chicago">America/Chicago (US Central)</option>
                    <option value="America/Denver">America/Denver (US Mountain)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (US Pacific)</option>
                    <option value="America/Anchorage">America/Anchorage (US Alaska)</option>
                    <option value="America/Honolulu">America/Honolulu (US Hawaii)</option>
                    <option value="America/Toronto">America/Toronto (Canada Eastern)</option>
                    <option value="America/Vancouver">America/Vancouver (Canada Pacific)</option>
                    <option value="America/Mexico_City">America/Mexico_City (Mexico)</option>
                    <option value="America/Sao_Paulo">America/Sao_Paulo (Brazil)</option>
                    <option value="America/Buenos_Aires">America/Buenos_Aires (Argentina)</option>
                    <option value="America/Santiago">America/Santiago (Chile)</option>
                    <option value="America/Bogota">America/Bogota (Colombia)</option>
                    <option value="America/Lima">America/Lima (Peru)</option>
                </optgroup>
                <optgroup label="<?php echo t_h('modals.timezone.groups.asia', [], 'Asia'); ?>">
                    <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (Thailand)</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                    <option value="Asia/Shanghai">Asia/Shanghai (China)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
                    <option value="Asia/Seoul">Asia/Seoul (South Korea)</option>
                    <option value="Asia/Jakarta">Asia/Jakarta (Indonesia)</option>
                    <option value="Asia/Manila">Asia/Manila (Philippines)</option>
                    <option value="Asia/Taipei">Asia/Taipei (Taiwan)</option>
                    <option value="Asia/Karachi">Asia/Karachi (Pakistan)</option>
                    <option value="Asia/Tehran">Asia/Tehran (Iran)</option>
                    <option value="Asia/Jerusalem">Asia/Jerusalem (Israel)</option>
                    <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</option>
                </optgroup>
                <optgroup label="<?php echo t_h('modals.timezone.groups.pacific', [], 'Pacific'); ?>">
                    <option value="Pacific/Auckland">Pacific/Auckland (New Zealand)</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                    <option value="Australia/Melbourne">Australia/Melbourne</option>
                    <option value="Australia/Brisbane">Australia/Brisbane</option>
                    <option value="Australia/Perth">Australia/Perth</option>
                    <option value="Pacific/Fiji">Pacific/Fiji</option>
                </optgroup>
                <optgroup label="<?php echo t_h('modals.timezone.groups.africa', [], 'Africa'); ?>">
                    <option value="Africa/Cairo">Africa/Cairo (Egypt)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (South Africa)</option>
                    <option value="Africa/Lagos">Africa/Lagos (Nigeria)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (Kenya)</option>
                    <option value="Africa/Casablanca">Africa/Casablanca (Morocco)</option>
                </optgroup>
            </select>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="timezoneModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveTimezoneModalBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- Note Reference Modal -->
<div id="noteReferenceModal" class="modal">
    <div class="modal-content note-reference-modal-content">
        <h3><i class="lucide lucide-link"></i> <?php echo t_h('editor.toolbar.insert_note_reference', [], 'Insert note reference'); ?></h3>
        <div class="note-reference-search">
            <input type="text" id="noteReferenceSearch" placeholder="<?php echo t_h('note_reference.modal.search_placeholder', [], 'Search for a note...'); ?>" autocomplete="off">
        </div>
        <div class="note-reference-recent-label"><?php echo t_h('note_reference.modal.recent_notes', [], 'Recent notes'); ?></div>
        <div id="noteReferenceList" class="note-reference-list">
            <!-- Notes will be populated here -->
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-note-reference-modal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>
<!-- Folder Icon Modal -->
<div id="folderIconModal" class="modal">
    <div class="modal-content folder-icon-modal-content">
        <div class="folder-icon-search-wrapper">
            <input type="text" id="folderIconSearchInput" placeholder="<?php echo t_h('modals.folder_icon.search_placeholder', [], 'Search icons...'); ?>" autocomplete="off">
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
                <div class="folder-color-option" data-color="#78716c" title="<?php echo t_h('modals.folder_icon.stone', [], 'Stone'); ?>">
                    <div class="folder-color-swatch" style="background-color: #78716c;"></div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-folder-icon-modal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="applyFolderIconBtn"><?php echo t_h('common.apply', [], 'Apply'); ?></button>
        </div>
    </div>
</div>
<!-- Kanban Structure Modal -->
<div id="kanbanStructureModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.kanban_structure.title', [], 'Create Kanban Structure'); ?></h3>
        <div class="modal-body modal-body-spaced">
            <label for="kanbanFolderName"><?php echo t_h('modals.kanban_structure.folder_name_label', [], 'Folder name:'); ?></label>
            <input type="text" id="kanbanFolderName" placeholder="<?php echo t_h('modals.kanban_structure.folder_name_placeholder', [], 'My Kanban Board'); ?>" maxlength="255" class="kanban-folder-input">
            
            <label for="kanbanColumnsCount" style="margin-top: 12px;"><?php echo t_h('modals.kanban_structure.columns_label', [], 'Number of columns (1-9):'); ?></label>
            <input type="number" id="kanbanColumnsCount" min="1" max="9" value="3" class="kanban-columns-input">
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="kanbanStructureModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" data-action="create-kanban-structure"><?php echo t_h('common.create'); ?></button>
        </div>
    </div>
</div>

<!-- Template Note Selector Modal -->
<div id="templateNoteSelectorModal" class="modal">
    <div class="modal-content note-reference-modal-content">
        <div class="note-reference-modal-header">
            <h3><?php echo t_h('modals.template_selector.title', [], 'Select Note for Template'); ?></h3>
        </div>
        <p class="note-reference-description"><?php echo t_h('modals.template_selector.description', [], 'A note will be created in a folder Templates. You can then duplicate it and reuse it as a template.'); ?></p>
        <div class="note-reference-search-container">
            <input type="text" id="templateNoteSearch" placeholder="<?php echo t_h('modals.template_selector.search_placeholder', [], 'Search notes...'); ?>" class="note-reference-search-input">
        </div>
        <div class="note-reference-list-wrapper">
            <div class="note-reference-recent-label"><?php echo t_h('modals.template_selector.recent_label', [], 'Recent notes'); ?></div>
            <div id="templateNoteList" class="note-reference-list">
                <div class="note-reference-loading">
                    <i class="lucide lucide-loader-2 lucide-spin"></i> <?php echo t_h('common.loading', [], 'Loading...'); ?>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-template-selector-modal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Linked Note Selector Modal -->
<div id="linkedNoteSelectorModal" class="modal">
    <div class="modal-content">
        <div class="note-reference-modal-header">
            <h3 class="modal-title"><?php echo t_h('modals.linked_selector.title', [], 'Create a Shortcut from a Note'); ?></h3>
        </div>
        <p class="note-reference-description shortcut-selector-description"><?php echo t_h('modals.linked_selector.description', [], 'Create a shortcut from a note so you can reference it from another folder.'); ?></p>
        <div class="note-reference-search-container">
            <input type="text" id="linkedNoteSearch" placeholder="<?php echo t_h('modals.linked_selector.search_placeholder', [], 'Search notes...'); ?>" class="note-reference-search-input">
        </div>
        <div class="note-reference-list-wrapper">
            <div class="note-reference-recent-label"><?php echo t_h('modals.linked_selector.recent_label', [], 'Recent notes'); ?></div>
            <div id="linkedNoteList" class="note-reference-list">
                <div class="note-reference-loading">
                    <i class="lucide lucide-loader-2 lucide-spin"></i> <?php echo t_h('common.loading', [], 'Loading...'); ?>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-linked-selector-modal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Linked Note Folder Selector Modal -->
<div id="linkedNoteFolderSelectorModal" class="modal">
    <div class="modal-content">
        <div class="note-reference-modal-header">
            <h3 class="modal-title"><?php echo t_h('modals.linked_folder_selector.title', [], 'Choose Folder for Shortcut'); ?></h3>
        </div>
        <div class="note-reference-search-container">
            <input type="text" id="linkedNoteFolderSearch" placeholder="<?php echo t_h('modals.linked_folder_selector.search_placeholder', [], 'Search folders...'); ?>" class="note-reference-search-input">
        </div>
        <div class="note-reference-list-wrapper">
            <div id="linkedFolderList" class="note-reference-list">
                <div class="note-reference-loading">
                    <i class="lucide lucide-loader-2 lucide-spin"></i> <?php echo t_h('common.loading', [], 'Loading...'); ?>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-linked-folder-selector-modal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Delete Linked Note Modal -->
<div id="deleteLinkedNoteModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.delete_linked_note.title', [], 'Delete Shortcut'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.delete_linked_note.message', [], 'What do you want to delete?'); ?></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-primary" id="deleteLinkedNoteOnlyBtn"><?php echo t_h('modals.delete_linked_note.delete_link_only', [], 'Delete this shortcut only'); ?></button>
            <button type="button" class="btn-danger" id="deleteLinkedNoteAndTargetBtn"><?php echo t_h('modals.delete_linked_note.delete_link_and_target', [], 'Delete the note and all its shortcuts'); ?></button>
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="deleteLinkedNoteModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Info Modal -->
<div id="infoModal" class="modal">
    <div class="modal-content">
        <h3 id="infoModalTitle"></h3>
        <p id="infoModalMessage"></p>
        <div class="modal-buttons">
            <button type="button" class="btn-primary" data-action="close-info-modal"><?php echo t_h('common.ok', [], 'OK'); ?></button>
        </div>
    </div>
</div>

<!-- Background Image Settings Modal -->
<div id="backgroundImageModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('modals.background_image.title', [], 'Background Image Settings'); ?></h3>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.background_image.description', [], 'Upload a background image for your workspace. You can adjust the opacity to make it subtle.'); ?></p>
            
            <div class="background-preview-container" id="backgroundPreviewContainer">
                <div class="background-preview" id="backgroundPreview">
                    <p class="no-background-text"><?php echo t_h('modals.background_image.no_image', [], 'No background image set'); ?></p>
                </div>
            </div>
            
            <div class="background-upload-controls">
                <input type="file" id="backgroundImageInput" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="display: none;">
                <button type="button" class="btn-secondary" id="uploadBackgroundBtn">
                    <?php echo t_h('modals.background_image.upload', [], 'Upload Image'); ?>
                </button>
                <button type="button" class="btn-danger" id="removeBackgroundBtn" style="display: none;">
                    <?php echo t_h('modals.background_image.remove', [], 'Remove'); ?>
                </button>
            </div>
            
            <div class="background-opacity-control">
                <label for="backgroundOpacityInput">
                    <?php echo t_h('modals.background_image.opacity', [], 'Background Opacity'); ?>: 
                    <span id="backgroundOpacityValue">30</span>%
                </label>
                <input type="range" id="backgroundOpacityInput" min="5" max="25" step="1" value="25">
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" id="cancelBackgroundBtn"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveBackgroundBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>

<!-- User Settings Info Modal (for non-admin users) -->
<div id="userSettingsInfoModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('modals.user_settings_info.title', [], 'Account Settings'); ?></h3>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.user_settings_info.message', [], 'You can change your password from Settings. To edit your email, username, or OIDC Subject (UUID), please contact the administrator of this Poznote instance.'); ?></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-primary" data-action="open-password-settings"><?php echo t_h('modals.user_settings_info.change_password_button', [], 'Change Password'); ?></button>
            <button type="button" data-action="close-user-settings-info-modal"><?php echo t_h('common.close'); ?></button>
        </div>
    </div>
</div>

<!-- Note Tags Modal -->
<div id="tagsModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('tags.modal_title', [], 'Manage tags'); ?></h3>
        </div>
        <div class="modal-body">
            <input type="hidden" id="tagsModalNoteId" />
            <div id="tagsModalTagsList" class="tags-modal-list">
                <!-- Tags will be dynamically loaded here as a list -->
            </div>
            <div class="tags-modal-input-wrapper">
                <input type="text" id="tagsModalInput" placeholder="<?php echo t_h('tags.add_single'); ?>" autocomplete="off" />
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-tags-modal"><?php echo t_h('common.close'); ?></button>
        </div>
    </div>
</div>

<!-- UI Customization Modal -->
<div id="uiCustomizationModal" class="modal">
    <div class="modal-content modal-content-wide">
        <div class="modal-header">
            <h3><?php echo t_h('modals.ui_customization.title', [], 'UI Customization'); ?></h3>
        </div>
        <div class="modal-body">
            <p class="ui-custom-description"><?php echo t_h('modals.ui_customization.description', [], 'Show or hide interface elements. Unchecked items will be hidden.'); ?></p>
            <div class="ui-custom-filter">
                <input
                    type="search"
                    id="uiCustomizationFilterInput"
                    class="ui-custom-filter-input"
                    placeholder="<?php echo t_h('modals.ui_customization.filter_placeholder', [], 'Filter items...'); ?>"
                    autocomplete="off">
            </div>
            <div class="ui-custom-sections-scroll">
                <div class="ui-custom-empty" id="uiCustomizationFilterEmpty" hidden><?php echo t_h('modals.ui_customization.no_results', [], 'No matching items found.'); ?></div>

                <!-- Home Cards Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.home_cards', [], 'Home Cards'); ?></h4>
                <div class="ui-custom-items">
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-notes-card" checked><span><?php echo t_h('common.notes', [], 'Notes'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-tags-card" checked><span><?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-favorites-card" checked><span><?php echo t_h('notes_list.system_folders.favorites', [], 'Favorites'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-folders-card" checked><span><?php echo t_h('home.folders', [], 'Folders'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-shares-card" checked><span><?php echo t_h('home.shares', [], 'Shares'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-trash-card" checked><span><?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-attachments-card" checked><span><?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-git-push-card" checked><span><?php echo t_h('git_sync.actions.push.button', ['provider' => 'Git'], 'Git Push'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-git-pull-card" checked><span><?php echo t_h('git_sync.actions.pull.button', ['provider' => 'Git'], 'Git Pull'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:extension-card" checked><span><?php echo t_h('settings.cards.install_extension', [], 'Install extension'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:install-app-card" checked><span><?php echo t_h('settings.cards.install_app', [], 'Install application'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:api-rest-card" checked><span><?php echo t_h('settings.cards.api_rest', [], 'API REST'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:home-logout-card" checked><span><?php echo t_h('workspaces.menu.logout', [], 'Logout'); ?></span></label>
                </div>
                </div>

                <!-- Create Cards Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.create_cards', [], 'Create Cards'); ?></h4>
                <div class="ui-custom-items">
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-note-card" checked><span><?php echo t_h('modals.create.note.title', [], 'Note'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-markdown-note-card" checked><span><?php echo t_h('modals.create.markdown.title', [], 'Markdown Note'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-task-list-card" checked><span><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-linked-note-card" checked><span><?php echo t_h('modals.create.linked.title', [], 'Shortcut'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-template-card" checked><span><?php echo t_h('modals.create.template.title', [], 'Template'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-folder-card" checked><span><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-subfolder-card" checked><span><?php echo t_h('modals.create.subfolder.title', [], 'Subfolder'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-kanban-card" checked><span><?php echo t_h('modals.create.kanban.title', [], 'Kanban Structure'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:create-workspace-card" checked><span><?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?></span></label>
                </div>
                </div>

                <!-- Settings Cards Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.settings_cards', [], 'Settings Cards'); ?></h4>
                <div class="ui-custom-items">
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:workspaces-card" checked><span><?php echo t_h('settings.cards.workspaces', [], 'Workspaces'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:change-password-card" checked><span><?php echo t_h('settings.cards.change_password', [], 'Change Password'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:git-sync-card" checked><span><?php echo t_h('settings.cards.git_sync', [], 'Git Sync'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:backup-export-card" checked><span><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:restore-import-card" checked><span><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:login-display-card" checked><span><?php echo t_h('display.cards.login_display', [], 'Login page title'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:language-card" checked><span><?php echo t_h('settings.language.label', [], 'Language'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:theme-mode-card" checked><span><?php echo t_h('display.cards.theme_mode', [], 'Theme'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:font-size-card" checked><span><?php echo t_h('display.cards.note_font_size', [], 'Font size'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:index-icon-scale-card" checked><span><?php echo t_h('display.cards.index_icon_scale', [], 'Index icon scaling'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:timezone-card" checked><span><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-sort-card" checked><span><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:tasklist-insert-order-card" checked><span><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:show-created-card" checked><span><?php echo t_h('display.cards.show_note_created', [], 'Show creation date'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:folder-counts-card" checked><span><?php echo t_h('display.cards.show_folder_counts', [], 'Show folder counts'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:notes-without-folders-card" checked><span><?php echo t_h('display.cards.notes_without_folders_after', [], 'Notes without folders'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:note-width-card" checked><span><?php echo t_h('display.cards.note_content_width', [], 'Note content width'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:code-wrap-card" checked><span><?php echo t_h('display.cards.code_block_word_wrap', [], 'Code block word wrap'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:users-admin-card" checked><span><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:git-sync-enabled-card" checked><span><?php echo t_h('settings.cards.git_sync_toggle', [], 'Git Sync'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:import-limits-card" checked><span><?php echo t_h('settings.cards.import_limits', [], 'Import Limits'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:custom-css-card" checked><span><?php echo t_h('settings.cards.custom_css', [], 'Custom CSS path'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:disaster-recovery-card" checked><span><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:convert-images-card" checked><span><?php echo t_h('settings.cards.convert_images', [], 'Base64 Image Converter'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="card:orphan-scanner-card" checked><span><?php echo t_h('settings.cards.orphan_scanner', [], 'Orphan attachments scanner'); ?></span></label>
                </div>
                </div>

                <!-- Toolbar Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.toolbar', [], 'Toolbar'); ?></h4>
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
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-text-height" checked><span><?php echo t_h('slash_menu.title', [], 'Title'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-code" checked><span><?php echo t_h('editor.toolbar.code_block', [], 'Code block'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-inline-code" checked><span><?php echo t_h('editor.toolbar.inline_code', [], 'Inline code'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-eraser" checked><span><?php echo t_h('editor.toolbar.clear_formatting', [], 'Clear formatting'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-search-replace" checked><span><?php echo t_h('editor.toolbar.search_replace', [], 'Search and Replace'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-excalidraw" checked><span>Excalidraw</span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-table" checked><span><?php echo t_h('editor.toolbar.insert_table', [], 'Table'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-checklist" checked><span><?php echo t_h('editor.toolbar.insert_checklist', [], 'Checklist'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-separator" checked><span><?php echo t_h('editor.toolbar.add_separator', [], 'Separator'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-note-reference" checked><span><?php echo t_h('editor.toolbar.insert_note_reference', [], 'Note reference'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-favorite" checked><span><?php echo t_h('index.toolbar.favorite_add', [], 'Favorite'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-share" checked><span><?php echo t_h('index.toolbar.share_note', [], 'Share'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-attachment" checked><span><?php echo t_h('modals.attachment.title', [], 'Attachments'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-open-new-tab" checked><span><?php echo t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-duplicate" checked><span><?php echo t_h('common.duplicate', [], 'Duplicate'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-move" checked><span><?php echo t_h('common.move', [], 'Move'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-create-linked-note" checked><span><?php echo t_h('editor.toolbar.create_linked_note', [], 'Create linked note'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-download" checked><span><?php echo t_h('common.download', [], 'Download'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-convert" checked><span><?php echo t_h('modals.convert.title', [], 'Convert'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-trash" checked><span><?php echo t_h('common.delete', [], 'Delete'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="toolbar:btn-info" checked><span><?php echo t_h('common.information', [], 'Information'); ?></span></label>
                </div>
                </div>

                <!-- Slash Menu Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.slash_menu', [], 'Slash Menu'); ?></h4>
                <div class="ui-custom-items">
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:normal" checked><span><?php echo t_h('slash_menu.back_to_normal', [], 'Back to normal text'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:title" checked><span><?php echo t_h('slash_menu.title', [], 'Title'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:format" checked><span><?php echo t_h('slash_menu.format_text', [], 'Format text'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:color" checked><span><?php echo t_h('slash_menu.color', [], 'Color'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:code" checked><span><?php echo t_h('slash_menu.code', [], 'Code'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:list" checked><span><?php echo t_h('slash_menu.list', [], 'List'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:quote" checked><span><?php echo t_h('slash_menu.quote', [], 'Quote'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:media" checked><span><?php echo t_h('slash_menu.media', [], 'Media'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:toggle" checked><span><?php echo t_h('slash_menu.toggle', [], 'Toggle'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:emoji" checked><span><?php echo t_h('slash_menu.emoji', [], 'Emoji'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:date" checked><span><?php echo t_h('slash_menu.date', [], 'Date'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:excalidraw" checked><span>Excalidraw</span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:table" checked><span><?php echo t_h('slash_menu.table', [], 'Table'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:separator" checked><span><?php echo t_h('slash_menu.separator', [], 'Separator'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:note-reference" checked><span><?php echo t_h('slash_menu.link_to_note', [], 'Link to note'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:link" checked><span><?php echo t_h('slash_menu.link', [], 'Link'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:image" checked><span><?php echo t_h('slash_menu.image', [], 'Image'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:audio-file" checked><span><?php echo t_h('slash_menu.audio', [], 'Audio'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="slash:cancel" checked><span><?php echo t_h('slash_menu.cancel', [], 'Cancel'); ?></span></label>
                </div>
                </div>

                <!-- Other Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.panels', [], 'Other'); ?></h4>
                <div class="ui-custom-items">
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:folder-icon-kanban" checked><span><?php echo t_h('home.kanban', [], 'Kanban'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:mini-calendar" checked><span><?php echo t_h('common.calendar', [], 'Calendar'); ?></span></label>
                    <label class="ui-custom-item"><input type="checkbox" data-ui-key="panel:outline-panel" checked><span><?php echo t_h('common.outline.title', [], 'Outline'); ?></span></label>
                </div>
                </div>

                <!-- Folder Actions Section -->
                <div class="ui-custom-section">
                <h4 class="ui-custom-section-title"><?php echo t_h('modals.ui_customization.sections.folder_actions', [], 'Folder Actions'); ?></h4>
                <div class="ui-custom-items">
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:create-note-in-folder" checked><span><?php echo t_h('notes_list.folder_actions.create', [], 'Create note'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:open-kanban-view" checked><span><?php echo t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:open-all-notes-in-tabs" checked><span><?php echo t_h('notes_list.folder_actions.open_all_in_tabs', [], 'Open all notes in tabs'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:move-folder-files" checked><span><?php echo t_h('notes_list.folder_actions.move_all_files', [], 'Move all files'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:move-entire-folder" checked><span><?php echo t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:download-folder" checked><span><?php echo t_h('notes_list.folder_actions.download_folder', [], 'Download folder'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:share-folder" checked><span><?php echo t_h('notes_list.folder_actions.share_folder', [], 'Make public'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:rename-folder" checked><span><?php echo t_h('notes_list.folder_actions.rename_folder', [], 'Rename'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:change-folder-icon" checked><span><?php echo t_h('notes_list.folder_actions.change_icon', [], 'Change icon'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:toggle-sort-submenu" checked><span><?php echo t_h('sort.header', [], 'Sort by'); ?></span></label>
                        <label class="ui-custom-item"><input type="checkbox" data-ui-key="folder:delete-folder" checked><span><?php echo t_h('notes_list.folder_actions.delete_folder', [], 'Delete'); ?></span></label>
                </div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="uiCustomizationModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveUiCustomizationBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>
