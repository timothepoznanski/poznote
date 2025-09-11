<?php
/**
 * Template for all modals in index.php
 * Expected variables: $defaultFolderName
 */
?>

<!-- Notification popup -->
<div id="notificationOverlay" class="notification-overlay"></div>
<div id="notificationPopup"></div>

<!-- Update Modal -->
<div id="updateModal" class="modal">
    <div class="modal-content">
        <h3>🎉 New Update Available!</h3>
        <p>A new version of Poznote is available. Your data will be preserved during the update.</p>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeUpdateModal()">Cancel</button>
            <button type="button" class="btn-update" onclick="goToUpdateInstructions()">See Update instructions</button>
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
        <span class="close" onclick="closeLoginDisplayModal()">&times;</span>
        <h3>Login display name</h3>
        <p>Set the name shown on the login screen.</p>
        <input type="text" id="loginDisplayInput" placeholder="Display name" maxlength="255" />
        <div class="modal-buttons">
            <button type="button" id="saveLoginDisplayBtn">Save</button>
            <button type="button" onclick="closeLoginDisplayModal()">Cancel</button>
        </div>
    </div>
</div>

<!-- Font Size Settings Modal -->
<div id="fontSizeModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2>Note Font Size</h2>
            <span class="close" id="closeFontSizeModal">&times;</span>
        </div>
        <div class="modal-body">
            <p>Select the default font size for your notes:</p>
            <div class="font-size-controls">
                <div class="font-size-section">
                    <h3>Desktop View</h3>
                    <label for="fontSizeDesktopInput">Font size for desktop (px):</label>
                    <input type="number" id="fontSizeDesktopInput" min="10" max="32" step="1" value="16">
                    <div class="font-size-preview">
                        <p id="fontSizeDesktopPreview">This is a preview text for desktop view</p>
                    </div>
                </div>

                <div class="font-size-section">
                    <h3>Mobile View</h3>
                    <label for="fontSizeMobileInput">Font size for mobile (px):</label>
                    <input type="number" id="fontSizeMobileInput" min="10" max="32" step="1" value="16">
                    <div class="font-size-preview">
                        <p id="fontSizeMobilePreview">This is a preview text for mobile view</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button id="saveFontSizeBtn">Save</button>
            <button id="cancelFontSizeBtn">Cancel</button>
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
        <span class="close" onclick="closeModal('newFolderModal')">&times;</span>
        <h3>Create New Folder</h3>
        <input type="text" id="newFolderName" placeholder="Folder name" maxlength="255" onkeypress="if(event.key==='Enter') createFolder()">
        <div class="modal-buttons">
            <button onclick="createFolder()">Create</button>
            <button onclick="closeModal('newFolderModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Modal for moving note to folder -->
<div id="moveNoteModal" class="modal">
    <div class="modal-content">
        <span class="close" onclick="closeModal('moveNoteModal')">&times;</span>
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
        <span class="close" onclick="closeModal('moveNoteFolderModal')">&times;</span>
        <h3>Move Note to Folder</h3>
        
        <!-- Workspace selection -->
        <div class="form-group">
            <label for="workspaceSelect">Workspace:</label>
            <select id="workspaceSelect" class="workspace-select" onchange="onWorkspaceChange()">
                <!-- Workspaces will be loaded here -->
            </select>
        </div>
        
        <p>Search or enter a folder name:</p>
        
        <!-- Smart folder search/input -->
        <div class="folder-search-container">
            <input type="text" id="folderSearchInput" class="folder-search-input" 
                   placeholder="Type to search folders or create new..." 
                   autocomplete="off" maxlength="255"
                   oninput="handleFolderSearch()" 
                   onkeydown="handleFolderKeydown(event)">
            
            <!-- Recent folders -->
            <div id="recentFoldersSection" class="recent-folders-section">
                <div class="recent-folders-label">Recent folders:</div>
                <div id="recentFoldersList" class="recent-folders-list">
                    <!-- Recent folders will be loaded here -->
                </div>
            </div>
            
            <!-- Dropdown with matching folders -->
            <div id="folderDropdown" class="folder-dropdown">
                <!-- Matching folders will appear here -->
            </div>
        </div>
        
        <!-- Action buttons -->
        <div class="modal-buttons">
            <button type="button" id="moveActionButton" class="btn-primary" onclick="executeFolderAction()">Move</button>
            <button type="button" class="btn-cancel" onclick="closeModal('moveNoteFolderModal')">Cancel</button>
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
        <span class="close" onclick="closeModal('editFolderModal')">&times;</span>
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

<!-- Modal for attachments -->
<div id="attachmentModal" class="modal">
    <div class="modal-content">
        <span class="close" onclick="closeModal('attachmentModal')">&times;</span>
        <h3>Manage Attachments</h3>
        <div class="attachment-upload">
            <div class="file-input-container">
                <label for="attachmentFile" class="file-input-label">
                    Choose a file
                    <input type="file" id="attachmentFile" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar" class="file-input-hidden">
                </label>
                <div id="acceptedTypes" class="accepted-types">Accepted: pdf, doc, docx, txt, jpg, jpeg, png, gif, zip, rar (max 200MB)</div>
            </div>
            <div class="spacer-18"></div>
            <div id="selectedFileName" class="selected-filename"></div>
            <div class="upload-button-container">
                <button onclick="uploadAttachment()">Upload File</button>
            </div>
            <div id="attachmentErrorMessage" class="modal-error-message"></div>
        </div>
        <div id="attachmentsList" class="attachments-list">
            <!-- Attachments will be loaded here -->
        </div>
        <div class="modal-buttons">
            <button onclick="closeModal('attachmentModal')">Close</button>
        </div>
    </div>
</div>

<!-- Modal for moving all files from one folder to another -->
<div id="moveFolderFilesModal" class="modal">
    <div class="modal-content">
        <span class="close" onclick="closeModal('moveFolderFilesModal')">&times;</span>
        <h3>Move All Files</h3>
        <p>Move all files from "<span id="sourceFolderName"></span>" to:</p>
        <select id="targetFolderSelect">
            <option value="">Select target folder...</option>
        </select>
        <div id="folderFilesCount" class="modal-info-message">
            <i class="fas fa-info-circle"></i>
            <span id="filesCountText"></span>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" onclick="closeModal('moveFolderFilesModal')">Cancel</button>
            <button type="button" class="btn-primary" onclick="executeMoveAllFiles()">Move All Files</button>
        </div>
        <div id="moveFilesErrorMessage" class="modal-error-message"></div>
    </div>
</div>
