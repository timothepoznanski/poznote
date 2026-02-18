    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const syncForms = document.querySelectorAll('form.sync-form');
        
        // Localization strings from PHP
        const i18n = {
            confirmPush: <?php echo json_encode(tp('git_sync.confirm_push')); ?>,
            confirmPull: <?php echo json_encode(tp('git_sync.confirm_pull')); ?>,
            allWorkspaces: <?php echo json_encode(tp('git_sync.actions.all_workspaces')); ?>,
            starting: <?php echo json_encode(t('git_sync.starting', [], 'Starting sync...')); ?>,
            completed: <?php echo json_encode(t('git_sync.completed', [], 'Completed!')); ?>
        };

        syncForms.forEach(form => {
            const actionInput = form.querySelector('input[name="action"]');
            if (!actionInput) return;
            
            const action = actionInput.value;
            // Only handle push/pull actions (not test)
            if (action !== 'push' && action !== 'pull') return;
            
            form.addEventListener('submit', function(e) {
                // Prevent default submission
                e.preventDefault();
                
                // Get selected workspace name for confirmation message
                const workspaceSelect = form.querySelector('select[name="workspace"]');
                const workspaceValue = workspaceSelect ? workspaceSelect.value : "";
                const workspaceText = (workspaceSelect && workspaceSelect.value) ? 
                    (workspaceSelect.options[workspaceSelect.selectedIndex].text) : 
                    i18n.allWorkspaces;
                
                // Build confirmation message
                let confirmMsg = (action === 'push' ? i18n.confirmPush : i18n.confirmPull)
                    .replace('{{workspace}}', workspaceText);
                
                // Show modal and wait for user response
                window.modalAlert.confirm(confirmMsg).then(function(confirmed) {
                    if (confirmed) {
                        const title = (action === 'push' ? "Push" : "Pull");
                        const submitBtn = form.querySelector('button[type="submit"]');
                        const originalBtnContent = submitBtn.innerHTML;
                        
                        // Show loading state on button
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

                        // Execute the sync
                        fetch('api/v1/git-sync/' + action, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ workspace: workspaceValue })
                        })
                        .then(response => response.json())
                        .then(data => {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnContent;
                            
                            if (data.success) {
                                window.modalAlert.alert(i18n.completed, 'success', title).then(() => {
                                    window.location.reload();
                                });
                            } else {
                                window.modalAlert.alert(data.error || "Sync error", 'error', title);
                            }
                        })
                        .catch(err => {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnContent;
                            window.modalAlert.alert("Connection error: " + err.message, 'error', title);
                        });
                    }
                });
            });
        });
    });
    </script>
</body>
</html>
