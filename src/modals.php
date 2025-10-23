<!-- Notification popup -->
<div id="notificationOverlay" class="notification-overlay"></div>
<div id="notificationPopup"></div>

<!-- Update Modal -->
<div id="updateModal" class="modal">
    <div class="modal-content">
        <h3>📱 Application Version</h3>
        <p id="updateMessage"></p>
        <div class="version-info">
            <p><strong>Current version:</strong> <span id="currentVersion">Loading...</span></p>
            <p><strong>Latest available:</strong> <span id="availableVersion">Loading...</span></p>
        </div>
        <div class="update-buttons-container">
            <div class="update-instructions-buttons">
                <button type="button" class="btn-update" onclick="goToSelfHostedUpdateInstructions()">Self-Hosted Instructions</button>
                <button type="button" class="btn-update" onclick="goToCloudUpdateInstructions()">Cloud/Railway Instructions</button>
            </div>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeUpdateModal()">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- Update Check Modal -->
<div id="updateCheckModal" class="modal">
    <div class="modal-content">
        <h3>Checking for Updates...</h3>
        <p id="updateCheckStatus">Please wait while we check for updates...</p>
        <div class="modal-buttons" id="updateCheckButtons">
            <button type="button" class="btn-cancel" onclick="closeUpdateCheckModal()">Close</button>
        </div>
    </div>
</div>

<!-- Login Display Name Modal -->
<div id="loginDisplayModal" class="modal">
    <div class="modal-content">
        <h3>Login display name</h3>
        <p>Set the name shown on the login screen.</p>
        <input type="text" id="loginDisplayInput" placeholder="Display name" maxlength="255" />
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeLoginDisplayModal()">Cancel</button>
            <button type="button" class="btn-primary" id="saveLoginDisplayBtn">Save</button>
        </div>
    </div>
</div>

<!-- Font Size Settings Modal -->
<div id="fontSizeModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2>Note Content Font Size</h2>
        </div>
        <div class="modal-body">
            <p>Select the default font size for your notes:</p>
            <div class="font-size-controls">
                <div class="font-size-section">
                    <label for="fontSizeInput">Font size (px):</label>
                    <input type="number" id="fontSizeInput" min="10" max="32" step="1" value="16">
                    <div id="defaultFontSizeInfo" class="default-info" style="display: block;">
                        16 px is the Default value
                    </div>
                    <div class="font-size-preview">
                        <p id="fontSizePreview">This is a preview text</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button id="cancelFontSizeBtn" class="btn-cancel">Cancel</button>
            <button id="saveFontSizeBtn" class="btn-primary">Save</button>
        </div>
    </div>
</div>

<!-- Confirmation Modal -->
<div id="confirmModal" class="modal">
    <div class="modal-content">
        <h3 id="confirmTitle">Confirm Action</h3>
        <p id="confirmMessage">Are you sure you want to proceed?</p>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeConfirmModal()">Cancel</button>
            <button type="button" class="btn-primary" id="confirmButton" onclick="executeConfirmedAction()">Confirm</button>
        </div>
    </div>
</div>

<!-- Modal for creating new folder -->
<div id="newFolderModal" class="modal">
    <div class="modal-content">
        <h3>New Folder</h3>
        <div class="modal-body" style="margin-bottom: 10px;">
            <input type="text" id="newFolderName" placeholder="New folder name" maxlength="255" style="width:100%; padding:8px 12px; margin-bottom:0; border:1px solid #ddd; border-radius:4px; font-size:14px; font-family:'Inter',sans-serif; box-sizing:border-box;" onkeypress="if(event.key==='Enter') createFolder()">
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('newFolderModal')">Cancel</button>
            <button type="button" class="btn-primary" onclick="createFolder()">Create</button>
        </div>
    </div>
</div>

<!-- Modal for moving note to folder -->
<div id="moveNoteModal" class="modal">
    <div class="modal-content">
        <h3>Change folder</h3>
        <p>Move "<span id="moveNoteTitle"></span>" to:</p>
        <select id="moveNoteFolder">
            <option value="<?php echo htmlspecialchars($defaultFolderName, ENT_QUOTES); ?>"><?php echo htmlspecialchars($defaultFolderName, ENT_QUOTES); ?></option>
        </select>
        <div class="modal-buttons">
            <button onclick="moveNoteToFolder()">Move</button>
            <button onclick="closeModal('moveNoteModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Modal for moving note to folder from toolbar -->
<div id="moveNoteFolderModal" class="modal">
    <div class="modal-content">
        <h3>Move Note to Folder</h3>
        
        <!-- Workspace selection -->
        <div class="form-group">
            <label for="workspaceSelect">Select Workspace destination:</label>
        <select id="workspaceSelect" class="workspace-select" onchange="onWorkspaceChange()">
                <!-- Workspaces will be loaded here -->
            </select>
        </div>
        
        <div>Select target folder:</div>

        <div class="form-group">
            <select id="moveNoteTargetSelect" class="workspace-select">
                <!-- Options will be populated dynamically -->
            </select>
        </div>
        
        <!-- Action buttons -->
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('moveNoteFolderModal')">Cancel</button>
            <button type="button" id="moveActionButton" class="btn-primary" onclick="moveNoteToFolder()">Move</button>
        </div>
        
        <!-- Error message display -->
        <div id="moveFolderErrorMessage" class="modal-error-message">
            Please enter a folder name
        </div>
    </div>
</div>

<!-- Modal for editing folder name -->
<div id="editFolderModal" class="modal">
    <div class="modal-content">
        <h3>Rename Folder</h3>
        <input type="text" id="editFolderName" placeholder="New folder name" maxlength="255">
        <div class="modal-buttons">
            <button onclick="saveFolderName()">Save</button>
            <button onclick="closeModal('editFolderModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Modal for deleting folder -->
<div id="deleteFolderModal" class="modal">
    <div class="modal-content">
        <h3>Delete Folder</h3>
        <p id="deleteFolderMessage"></p>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('deleteFolderModal')">Cancel</button>
            <button type="button" class="btn-danger" onclick="executeDeleteFolder()">Delete Folder</button>
        </div>
    </div>
</div>

<!-- Modal for moving all files from one folder to another -->
<div id="moveFolderFilesModal" class="modal">
    <div class="modal-content">
        <h3>Move All Files</h3>
        <p>Move all files from "<span id="sourceFolderName"></span>" to:</p>
        <select id="moveFolderFilesTargetSelect">
            <option value="">Select target folder...</option>
        </select>
        <div id="folderFilesCount" class="modal-info-message">
            <span id="filesCountText"></span>
        </div>
        <div class="modal-info-message" style="margin-top: 12px; font-size: 0.9em; color: #666;">
            • To move a single note to another workspace, use the "Move note" button in the toolbar<br><br>
            • To move all notes from one workspace to another, go to Settings → Workspaces<br><br>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('moveFolderFilesModal')">Cancel</button>
            <button type="button" class="btn-primary" onclick="executeMoveAllFiles()">Move All Files</button>
        </div>
        <div id="moveFilesErrorMessage" class="modal-error-message"></div>
    </div>
</div>

<!-- Move notes modal (for workspaces.php) -->
<div id="moveNotesModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3>Move notes from <span id="moveSourceName"></span></h3>
        <div class="form-group">
            <label for="moveTargetSelect">Select target workspace</label>
            <select id="moveTargetSelect">
            </select>
        </div>
        <div style="margin-top:12px;">
            <button id="confirmMoveBtn" class="btn btn-primary">Move notes</button>
            <button onclick="closeMoveModal()" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>

<!-- Rename modal (for workspaces.php) -->
<div id="renameModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3>Rename workspace <span id="renameSource"></span></h3>
        <div class="form-group">
            <label for="renameNewName">New name</label>
            <input id="renameNewName" type="text" />
        </div>
        <div style="margin-top:12px;">
            <button id="confirmRenameBtn" class="btn btn-primary">Rename</button>
            <button onclick="closeRenameModal()" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>

<!-- Delete confirmation modal (for workspaces.php) -->
<div id="deleteModal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3>Confirm delete workspace <span id="deleteWorkspaceName"></span></h3>
        <p>Enter the workspace name to confirm deletion. All notes and folders will be permanently deleted and cannot be recovered.</p>
        <div class="form-group">
            <input id="confirmDeleteInput" type="text" placeholder="Type workspace name to confirm" />
        </div>
        <div style="margin-top:12px;">
            <button id="confirmDeleteBtn" class="btn btn-danger" disabled>Delete workspace</button>
            <button onclick="closeDeleteModal()" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>

<!-- Create modal (unified for both create button and folder actions) -->
<div id="createModal" class="modal">
    <div class="modal-content">
        <h3 id="createModalTitle">Create</h3>
        <div class="modal-body">
            <div class="create-options">
                <!-- Notes section -->
                <div class="create-section" id="notesSection">
                    <div class="create-note-option" data-type="html" onclick="selectCreateType('html')">
                        <i class="fa fa-file-alt"></i>
                        <div>
                            <span>HTML Note</span>
                            <p>Rich text with formatting, images, and links</p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="markdown" onclick="selectCreateType('markdown')">
                        <i class="fa fa-markdown"></i>
                        <div>
                            <span>Markdown Note</span>
                            <p>Lightweight markup language for structured text</p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="list" onclick="selectCreateType('list')">
                        <i class="fa fa-list-ul"></i>
                        <div>
                            <span>Task List</span>
                            <p>Checklist with checkboxes for tasks and items</p>
                        </div>
                    </div>
                </div>
                
                <!-- Other items section (only shown when creating from main button) -->
                <div class="create-section" id="otherSection">
                    <div class="create-note-option" data-type="folder" onclick="selectCreateType('folder')">
                        <i class="fa fa-folder"></i>
                        <div>
                            <span>Folder</span>
                            <p>Organize your notes in folders</p>
                        </div>
                    </div>
                    <div class="create-note-option" data-type="workspace" onclick="selectCreateType('workspace')" style="margin-top: 14px;">
                        <i class="fa fa-layer-group"></i>
                        <div>
                            <span>Workspace</span>
                            <p>Create a new workspace environment</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('createModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Note sort order modal -->
<div id="noteSortModal" class="modal">
    <div class="modal-content">
        <h3>Note sort order</h3>
        <div class="modal-body">
            <p>Choose how notes are ordered in the notes list:</p>
            <div style="margin-top:8px;">
                <label><input type="radio" name="noteSort" value="updated_desc"> Last modified</label>
                <label><input type="radio" name="noteSort" value="created_desc"> Last created</label>
                <label><input type="radio" name="noteSort" value="heading_asc"> Alphabetical</label>
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('noteSortModal')">Cancel</button>
            <button type="button" class="btn-primary" id="saveNoteSortModalBtn">Save</button>
        </div>
    </div>
</div>
