<!-- Notification popup -->
<div id="notificationOverlay" class="notification-overlay"></div>
<div id="notificationPopup"></div>

<!-- Update Modal -->
<div id="updateModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.update.title'); ?></h3>
        <p id="updateMessage"></p>
        <div class="backup-warning" id="updateBackupWarning" style="display: none;">
            <p><strong>⚠️ </strong> <span style="color: #dc3545;"><?php echo t_h('modals.update.backup_warning'); ?></span></p>
            <p style="color: #6c757d; font-size: 14px; margin-top: 8px;"><?php echo t('modals.update.backup_hint'); ?></p>
        </div>
        <div class="version-info">
            <p><strong><?php echo t_h('modals.update.current_version'); ?></strong> <span id="currentVersion"><?php echo t_h('common.loading'); ?></span></p>
            <p><strong><?php echo t_h('modals.update.latest_available'); ?></strong> <span id="availableVersion"><?php echo t_h('common.loading'); ?></span></p>
        </div>
        <div class="update-buttons-container">
            <div class="update-instructions-buttons">
                <button type="button" class="btn-update" onclick="goToSelfHostedUpdateInstructions()"><?php echo t_h('modals.update.self_hosted'); ?></button>
                <button type="button" class="btn-update" onclick="goToCloudUpdateInstructions()"><?php echo t_h('modals.update.cloud'); ?></button>
            </div>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeUpdateModal()"><?php echo t_h('common.close'); ?></button>
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
            <button type="button" class="btn-cancel" onclick="closeUpdateCheckModal()"><?php echo t_h('common.close'); ?></button>
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
            <button type="button" class="btn-cancel" onclick="closeLoginDisplayModal()"><?php echo t_h('common.cancel'); ?></button>
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
                    <div id="defaultFontSizeInfo" class="default-info" style="display: block;">
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
            <button type="button" class="btn-cancel" onclick="closeConfirmModal()"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-secondary" id="saveAndExitButton" onclick="executeSaveAndExitAction()" style="display: none;"><?php echo t_h('modals.confirm.save_and_exit'); ?></button>
            <button type="button" class="btn-primary" id="confirmButton" onclick="executeConfirmedAction()"><?php echo t_h('modals.confirm.exit_without_saving'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for creating new folder -->
<div id="newFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.new_title'); ?></h3>
        <div class="modal-body" style="margin-bottom: 10px;">
            <input type="text" id="newFolderName" placeholder="<?php echo t_h('modals.folder.new_placeholder'); ?>" maxlength="255" style="width:100%; padding:8px 12px; margin-bottom:0; border:1px solid #ddd; border-radius:4px; font-size:14px; font-family:'Inter',sans-serif; box-sizing:border-box;" onkeypress="if(event.key==='Enter') createFolder()">
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('newFolderModal')"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" onclick="createFolder()"><?php echo t_h('common.create'); ?></button>
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
            <button onclick="moveNoteToFolder()"><?php echo t_h('common.move'); ?></button>
            <button onclick="closeModal('moveNoteModal')"><?php echo t_h('common.cancel'); ?></button>
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
        <select id="workspaceSelect" class="workspace-select" onchange="onWorkspaceChange()">
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
            <button type="button" class="btn-cancel" onclick="closeModal('moveNoteFolderModal')"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" id="moveActionButton" class="btn-primary" onclick="moveNoteToFolder()"><?php echo t_h('common.move'); ?></button>
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
            <button onclick="saveFolderName()"><?php echo t_h('common.save'); ?></button>
            <button onclick="closeModal('editFolderModal')"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Modal for deleting folder -->
<div id="deleteFolderModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.folder.delete_title'); ?></h3>
        <div id="deleteFolderMessage" style="margin: 15px 0;">
            <p id="deleteFolderMainMessage" style="margin-bottom: 10px;"></p>
            <ul id="deleteFolderDetails" style="list-style: none; padding: 0; margin: 10px 0;">
            </ul>
            <p id="deleteFolderNote" style="margin-top: 10px; font-size: 0.9em; color: #666;"></p>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('deleteFolderModal')"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-danger" onclick="executeDeleteFolder()"><?php echo t_h('modals.folder.delete_folder'); ?></button>
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
        <div class="modal-info-message" style="margin-top: 12px; font-size: 0.9em; color: #666;">
            • <?php echo t_h('modals.move_folder_files.hint_move_single', [], 'To move a single note to another workspace, use the "Move note" button in the toolbar'); ?><br><br>
            • <?php echo t_h('modals.move_folder_files.hint_move_all', [], 'To move all notes from one workspace to another, go to Settings → Workspaces'); ?><br><br>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('moveFolderFilesModal')"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" onclick="executeMoveAllFiles()"><?php echo t_h('modals.move_folder_files.move_all', [], 'Move All Files'); ?></button>
        </div>
        <div id="moveFilesErrorMessage" class="modal-error-message"></div>
    </div>
</div>

<!-- Move notes modal (for workspaces.php) -->
<div id="moveNotesModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.move_notes_title', [], 'Move notes from'); ?> <span id="moveSourceName"></span></h3>
        <div class="form-group">
            <label for="moveTargetSelect"><?php echo t_h('modals.workspaces.select_target_workspace', [], 'Select target workspace'); ?></label>
            <select id="moveTargetSelect">
            </select>
        </div>
        <div style="margin-top:12px;">
            <button id="confirmMoveBtn" class="btn btn-primary"><?php echo t_h('workspaces.actions.move_notes', [], 'Move notes'); ?></button>
            <button onclick="closeMoveModal()" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Rename modal (for workspaces.php) -->
<div id="renameModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.rename_title', [], 'Rename workspace'); ?> <span id="renameSource"></span></h3>
        <div class="form-group">
            <label for="renameNewName"><?php echo t_h('modals.workspaces.new_name', [], 'New name'); ?></label>
            <input id="renameNewName" type="text" />
        </div>
        <div style="margin-top:12px;">
            <button id="confirmRenameBtn" class="btn btn-primary"><?php echo t_h('common.rename', [], 'Rename'); ?></button>
            <button onclick="closeRenameModal()" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Delete confirmation modal (for workspaces.php) -->
<div id="deleteModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3><?php echo t_h('modals.workspaces.delete_title', [], 'Confirm delete workspace'); ?> <span id="deleteWorkspaceName"></span></h3>
        <p><?php echo t_h('modals.workspaces.delete_description', [], 'Enter the workspace name to confirm deletion. All notes and folders will be permanently deleted and cannot be recovered.'); ?></p>
        <div class="form-group">
            <input id="confirmDeleteInput" type="text" placeholder="<?php echo t_h('modals.workspaces.delete_placeholder', [], 'Type workspace name to confirm'); ?>" />
        </div>
        <div style="margin-top:12px;">
            <button id="confirmDeleteBtn" class="btn btn-danger" disabled><?php echo t_h('modals.workspaces.delete_button', [], 'Delete workspace'); ?></button>
            <button onclick="closeDeleteModal()" class="btn btn-secondary"><?php echo t_h('common.cancel'); ?></button>
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
                    <div class="create-note-option" data-type="html" onclick="selectCreateType('html')">
                        <i class="fa fa-file-alt"></i>
                        <div>
                            <span><?php echo t_h('modals.create.note.title', [], 'Note'); ?></span>
                            <p><?php echo t_h('modals.create.note.description', [], 'Rich text with formatting, images, links, and Excalidraw diagrams'); ?></p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="markdown" onclick="selectCreateType('markdown')">
                        <i class="fa fa-markdown"></i>
                        <div>
                            <span><?php echo t_h('modals.create.markdown.title', [], 'Markdown Note'); ?></span>
                            <p><?php echo t_h('modals.create.markdown.description', [], 'Lightweight markup language for structured text'); ?></p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="list" onclick="selectCreateType('list')">
                        <i class="fa fa-list-ul"></i>
                        <div>
                            <span><?php echo t_h('modals.create.task_list.title', [], 'Task List'); ?></span>
                            <p><?php echo t_h('modals.create.task_list.description', [], 'Checklist with checkboxes for tasks and items'); ?></p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="subfolder" onclick="selectCreateType('subfolder')" id="subfolderOption" style="display: none;">
                        <i class="fal fa-folder-plus"></i>
                        <div>
                            <span><?php echo t_h('modals.create.subfolder.title', [], 'Subfolder'); ?></span>
                            <p><?php echo t_h('modals.create.subfolder.description', [], 'Create a subfolder within this folder'); ?></p>
                        </div>
                    </div>
                </div>
                
                <!-- Other items section (only shown when creating from main button) -->
                <div class="create-section" id="otherSection" style="margin-top: 12px;">
                    <div class="create-note-option" data-type="folder" onclick="selectCreateType('folder')">
                        <i class="fa fa-folder"></i>
                        <div>
                            <span><?php echo t_h('modals.create.folder.title', [], 'Folder'); ?></span>
                            <p><?php echo t_h('modals.create.folder.description', [], 'Organize your notes in folders'); ?></p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="workspace" onclick="selectCreateType('workspace')" style="margin-top: 14px;">
                        <i class="fa fa-layer-group"></i>
                        <div>
                            <span><?php echo t_h('modals.create.workspace.title', [], 'Workspace'); ?></span>
                            <p><?php echo t_h('modals.create.workspace.description', [], 'Create a new workspace environment'); ?></p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('createModal')"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>

<!-- Note sort order modal -->
<div id="noteSortModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.note_sort.title', [], 'Note sort order'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.note_sort.description', [], 'Choose how notes are ordered in the notes list:'); ?></p>
            <div style="margin-top:8px;">
                <label><input type="radio" name="noteSort" value="updated_desc"> <?php echo t_h('modals.note_sort.options.last_modified', [], 'Last modified'); ?></label>
                <label><input type="radio" name="noteSort" value="created_desc"> <?php echo t_h('modals.note_sort.options.last_created', [], 'Last created'); ?></label>
                <label><input type="radio" name="noteSort" value="heading_asc"> <?php echo t_h('modals.note_sort.options.alphabetical', [], 'Alphabetical'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('noteSortModal')"><?php echo t_h('common.cancel'); ?></button>
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
            <div style="margin-top:8px;">
                <label><input type="radio" name="languageChoice" value="en"> <?php echo t_h('settings.language.english'); ?></label>
                <label><input type="radio" name="languageChoice" value="fr"> <?php echo t_h('settings.language.french'); ?></label>
                <label><input type="radio" name="languageChoice" value="es"> <?php echo t_h('settings.language.spanish'); ?></label>
                <label><input type="radio" name="languageChoice" value="pt"> <?php echo t_h('settings.language.portuguese'); ?></label>
                <label><input type="radio" name="languageChoice" value="de"> <?php echo t_h('settings.language.german'); ?></label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('languageModal')"><?php echo t_h('common.cancel'); ?></button>
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
            <select id="timezoneSelect" style="width:100%; padding:8px; margin-top:10px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
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
            <button type="button" class="btn-cancel" onclick="closeModal('timezoneModal')"><?php echo t_h('common.cancel'); ?></button>
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
            <button type="button" class="btn-cancel" onclick="closeNoteReferenceModal()"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>
