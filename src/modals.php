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
        <div class="update-buttons-container">
            <div class="update-instructions-buttons">
                <button type="button" class="btn-update" data-action="go-to-self-hosted-update"><?php echo t_h('modals.update.self_hosted'); ?></button>
                <button type="button" class="btn-update" data-action="go-to-cloud-update"><?php echo t_h('modals.update.cloud'); ?></button>
            </div>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" data-action="close-update-modal"><?php echo t_h('common.close'); ?></button>
            </div>
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

<!-- Font Size Settings Modal -->
<div id="fontSizeModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo t_h('modals.font_size.title'); ?></h2>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.font_size.description'); ?></p>
            <div class="font-size-controls">
                <div class="font-size-section">
                    <label for="fontSizeInput"><?php echo t_h('modals.font_size.label'); ?></label>
                    <input type="number" id="fontSizeInput" min="10" max="32" step="1" value="15">
                    <div id="defaultFontSizeInfo" class="default-info default-font-size-info">
                        <?php echo t_h('modals.font_size.default_value', ['size' => '15']); ?>
                    </div>
                    <div class="font-size-preview">
                        <p id="fontSizePreview"><?php echo t_h('modals.font_size.preview'); ?></p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button id="cancelFontSizeBtn" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
            <button id="saveFontSizeBtn" class="btn-primary"><?php echo t_h('common.save'); ?></button>
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
        
        <div><?php echo t_h('modals.move_note_folder.target_folder'); ?></div>

        <div class="form-group">
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
        <select id="moveFolderTargetSelect">
            <option value=""><?php echo t_h('modals.move_folder.select_target', [], 'Select parent folder...'); ?></option>
        </select>
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
                        <i class="fa fa-file-alt"></i>
                        <div>
                            <span><?php 
                                $title = t_h('modals.create.note.title', [], 'Note');
                                $parenPos = strpos($title, ' (');
                                if ($parenPos !== false) {
                                    echo htmlspecialchars(substr($title, 0, $parenPos));
                                    echo '<span class="create-note-subtitle">' . htmlspecialchars(substr($title, $parenPos)) . '</span>';
                                } else {
                                    echo htmlspecialchars($title);
                                }
                            ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="markdown" data-action="select-create-type">
                        <i class="fa fa-markdown"></i>
                        <div>
                            <span><?php 
                                $title = t_h('modals.create.markdown.title', [], 'Markdown Note');
                                $parenPos = strpos($title, ' (');
                                if ($parenPos !== false) {
                                    echo htmlspecialchars(substr($title, 0, $parenPos));
                                    echo '<span class="create-note-subtitle">' . htmlspecialchars(substr($title, $parenPos)) . '</span>';
                                } else {
                                    echo htmlspecialchars($title);
                                }
                            ?></span>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="list" data-action="select-create-type">
                        <i class="fa fa-list-ul"></i>
                        <div>
                            <span><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option initially-hidden" data-type="subfolder" data-action="select-create-type" id="subfolderOption">
                        <i class="fal fa-folder-plus"></i>
                        <div>
                            <span><?php echo t_h('modals.create.subfolder.title', [], 'Subfolder'); ?></span>
                        </div>
                    </div>
                </div>
                
                <!-- Other items section (only shown when creating from main button) -->
                <div class="create-section mt-12" id="otherSection">
                    <div class="create-note-option" data-type="folder" data-action="select-create-type">
                        <i class="fa fa-folder"></i>
                        <div>
                            <span><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span>
                        </div>
                    </div>
                    <div class="create-note-option mt-12" data-type="workspace" data-action="select-create-type">
                        <i class="fa fa-layer-group"></i>
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
                    <i class="fal fa-file-alt"></i>
                    <div>
                        <span><?php echo t_h('modals.export.markdown.title', [], 'Export as Markdown'); ?></span>
                        <p><?php echo t_h('modals.export.markdown.description', [], 'Download as MD file with metadata (title, tags, folder) in YAML frontmatter'); ?></p>
                    </div>
                </div>
                <!-- HTML export option (shown only for non-markdown notes) -->
                <div class="export-option export-option-html" data-action="select-export-type" data-type="html">
                    <i class="fal fa-file-code"></i>
                    <div>
                        <span><?php echo t_h('modals.export.html.title', [], 'Export as HTML'); ?></span>
                        <p><?php echo t_h('modals.export.html.description', [], 'Download as HTML file with all formatting preserved'); ?></p>
                    </div>
                </div>

                <!-- JSON export option (shown only for tasklist notes) -->
                <div class="export-option export-option-json initially-hidden" data-action="select-export-type" data-type="json">
                    <i class="fal fa-file-code"></i>
                    <div>
                        <span><?php echo t_h('modals.export.json.title', [], 'Download as JSON'); ?></span>
                        <p><?php echo t_h('modals.export.json.description', [], 'Download the raw tasklist data as a JSON file'); ?></p>
                    </div>
                </div>

                <div class="export-option export-option-print" data-action="select-export-type" data-type="print">
                    <i class="fal fa-print"></i>
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
                <label><input type="radio" name="languageChoice" value="en"> <?php echo t_h('settings.language.english'); ?></label>
                <label><input type="radio" name="languageChoice" value="fr"> <?php echo t_h('settings.language.french'); ?></label>
                <label><input type="radio" name="languageChoice" value="es"> <?php echo t_h('settings.language.spanish'); ?></label>
                <label><input type="radio" name="languageChoice" value="pt"> <?php echo t_h('settings.language.portuguese'); ?></label>
                <label><input type="radio" name="languageChoice" value="de"> <?php echo t_h('settings.language.german'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="languageModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveLanguageModalBtn"><?php echo t_h('common.save'); ?></button>
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
        <h3><i class="fa-link"></i> <?php echo t_h('editor.toolbar.insert_note_reference', [], 'Insert note reference'); ?></h3>
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
            <button type="button" class="btn-secondary" id="resetFolderIconBtn"><i class="fa-folder-open"></i> / <i class="fa-folder"></i></button>
            <button type="button" class="btn-primary" id="applyFolderIconBtn"><?php echo t_h('common.apply', [], 'Apply'); ?></button>
        </div>
    </div>
</div>
