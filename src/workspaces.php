<?php
require 'auth.php';
requireAuth();
require_once 'config.php';
require_once 'db_connect.php';

// Get current list
$stmt = $con->query("SELECT name, created FROM workspaces ORDER BY name");
$workspaces = $stmt->fetchAll(PDO::FETCH_ASSOC);

?>

<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Workspaces</title>
    <link rel="stylesheet" href="css/index.css">
</head>
<body>
    <div class="container">
        <h1>Workspaces</h1>
        <div id="workspaceList">
            <ul>
                <?php foreach ($workspaces as $ws): ?>
                    <li>
                        <strong><?php echo htmlspecialchars($ws['name']); ?></strong>
                        &nbsp; <button onclick="renameWorkspace('<?php echo addslashes($ws['name']); ?>')">Rename</button>
                        <?php if ($ws['name'] !== 'Poznote'): ?>
                            &nbsp; <button onclick="deleteWorkspace('<?php echo addslashes($ws['name']); ?>')">Delete</button>
                        <?php endif; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
        <div>
            <h3>Create new workspace</h3>
            <input id="newWsName" placeholder="workspace name">
            <button onclick="createWorkspace()">Create</button>
        </div>
        <div style="margin-top:20px;">
            <a id="backToNotesLink" href="index.php">Back to notes</a>
        </div>
    </div>

    <script>
    function createWorkspace(){
        var name = document.getElementById('newWsName').value.trim();
        if(!name) return alert('Name required');
        var params = new URLSearchParams({action:'create', name: name});
        fetch('api_workspaces.php', {method:'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString()})
    .then(r=>r.json()).then(function(res){ if(res.success) window.location.href = 'index.php?workspace=' + encodeURIComponent(name); else alert(res.message || 'Error'); });
    }
    function deleteWorkspace(name){
        showConfirmDialog(
            'Delete ' + name + '? Notes will be moved to the default workspace.',
            function() {
                var params = new URLSearchParams({action:'delete', name: name});
                fetch('api_workspaces.php', {method:'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString()})
                .then(r=>r.json()).then(function(res){ 
                    if(res.success) 
                        window.location.href = 'index.php?workspace=Poznote'; 
                    else 
                        alert(res.message || 'Error'); 
                });
            },
            null
        );
    }
    function renameWorkspace(oldName){
        var newName = prompt('Rename workspace "' + oldName + '" to:');
        if(!newName) return;
        var params = new URLSearchParams({action:'rename', old_name: oldName, new_name: newName});
        fetch('api_workspaces.php', {method:'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString()})
    .then(r=>r.json()).then(function(res){ if(res.success) window.location.href = 'index.php?workspace=' + encodeURIComponent(newName); else alert(res.message || 'Error'); });
    }
    
    // Custom confirmation modal using application's modal style
    function showConfirmDialog(message, onConfirm, onCancel) {
        // Remove existing confirmation modal if any
        const existingModal = document.getElementById('confirmationModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal HTML using the same structure as other modals
        const modalHTML = `
            <div id="confirmationModal" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 400px;">
                    <h3>Confirm Action</h3>
                    <p id="confirmationMessage">${message}</p>
                    <div class="modal-buttons">
                        <button type="button" id="confirmBtn" class="btn-primary">Delete</button>
                        <button type="button" id="cancelBtn">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmationModal');
        const confirmBtn = document.getElementById('confirmBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        function closeModal() {
            modal.remove();
        }

        function handleCancel() {
            closeModal();
            if (onCancel) onCancel();
        }

        function handleConfirm() {
            closeModal();
            if (onConfirm) onConfirm();
        }

        function handleOverlayClick(e) {
            if (e.target === modal) {
                handleCancel();
            }
        }

        // Add event listeners
        cancelBtn.addEventListener('click', handleCancel);
        confirmBtn.addEventListener('click', handleConfirm);
        modal.addEventListener('click', handleOverlayClick);

        // Focus on cancel button for accessibility
        setTimeout(() => cancelBtn.focus(), 100);
    }
    </script>
    <script>
    // Ensure Back to notes link opens the workspace stored in localStorage if present
    (function(){
        try {
            var stored = localStorage.getItem('poznote_selected_workspace');
            if (stored && stored !== 'Poznote') {
                var a = document.getElementById('backToNotesLink');
                if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
            }
        } catch(e) {}
    })();
    </script>
</body>
</html>
