// Workspace Background Image Management
// Handles background images per workspace

(function() {
    'use strict';

    let currentWorkspace = null;
    let currentBackgroundUrl = null;
    let pendingFile = null;

    var OPACITY_DEFAULT = 25;
    var OPACITY_MIN = 5;
    var OPACITY_MAX = 25;

    function buildOpacitySettingKey(workspace) {
        return 'background_opacity_' + workspace;
    }

    function normalizeOpacity(value) {
        var parsed = parseInt(value, 10);
        if (isNaN(parsed)) return OPACITY_DEFAULT;
        if (parsed < OPACITY_MIN) return OPACITY_MIN;
        if (parsed > OPACITY_MAX) return OPACITY_MAX;
        return parsed;
    }

    function getBackgroundOpacity(workspace, callback) {
        var key = buildOpacitySettingKey(workspace);
        fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function(r) { return r.json(); })
            .then(function(j) {
                if (j && j.success) {
                    callback(normalizeOpacity(j.value));
                } else {
                    callback(OPACITY_DEFAULT);
                }
            })
            .catch(function() { callback(OPACITY_DEFAULT); });
    }

    function setBackgroundOpacity(workspace, opacity, callback) {
        var key = buildOpacitySettingKey(workspace);
        fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: String(opacity) })
        })
            .then(function(r) { return r.json(); })
            .then(function(j) {
                if (callback) callback(!!(j && j.success));
            })
            .catch(function() {
                if (callback) callback(false);
            });
    }

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
        initWorkspaceBackgroundButtons();
    });

    function initWorkspaceBackgroundButtons() {
        // Add click handlers to all background buttons
        document.querySelectorAll('.btn-background').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const workspace = this.getAttribute('data-ws');
                openBackgroundModalForWorkspace(workspace);
            });
        });

        // Initialize modal controls
        initBackgroundModalControls();
    }

    function initBackgroundModalControls() {
        const modal = document.getElementById('backgroundImageModal');
        const uploadBtn = document.getElementById('uploadBackgroundBtn');
        const removeBtn = document.getElementById('removeBackgroundBtn');
        const saveBtn = document.getElementById('saveBackgroundBtn');
        const cancelBtn = document.getElementById('cancelBackgroundBtn');
        const fileInput = document.getElementById('backgroundImageInput');
        const opacityInput = document.getElementById('backgroundOpacityInput');
        const opacityValue = document.getElementById('backgroundOpacityValue');

        if (!modal) return;

        // Upload button
        if (uploadBtn) {
            uploadBtn.addEventListener('click', function() {
                fileInput.click();
            });
        }

        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    previewBackgroundImage(file);
                }
            });
        }

        // Remove button
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                removeBackgroundPreview();
            });
        }

        // Opacity slider
        if (opacityInput && opacityValue) {
            opacityInput.addEventListener('input', function() {
                opacityValue.textContent = this.value;
                updatePreviewOpacity(this.value);
            });
        }

        // Save button
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                saveWorkspaceBackground();
            });
        }

        // Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                closeBackgroundModal();
            });
        }

        // Close modal on overlay click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeBackgroundModal();
            }
        });
    }

    function openBackgroundModalForWorkspace(workspace) {
        const modal = document.getElementById('backgroundImageModal');
        const preview = document.getElementById('backgroundPreview');
        const opacityInput = document.getElementById('backgroundOpacityInput');
        const removeBtn = document.getElementById('removeBackgroundBtn');

        if (!modal) return;

        currentWorkspace = workspace;
        pendingFile = null;

        // Load current settings for this workspace
        opacityInput.value = OPACITY_DEFAULT;
        document.getElementById('backgroundOpacityValue').textContent = OPACITY_DEFAULT;

        getBackgroundOpacity(workspace, function(savedOpacity) {
            opacityInput.value = savedOpacity;
            document.getElementById('backgroundOpacityValue').textContent = savedOpacity;
            updatePreviewOpacity(savedOpacity);
        });

        // Check if background exists for this workspace
        fetch('api_upload_background.php?workspace=' + encodeURIComponent(workspace))
            .then(response => response.json())
            .then(data => {
                if (data.success && data.exists) {
                    currentBackgroundUrl = data.url;
                    preview.style.backgroundImage = `url('${data.url}')`;
                    const currentOpacity = normalizeOpacity(opacityInput.value);
                    const previewOpacity = Math.min(currentOpacity, OPACITY_MAX);
                    preview.style.opacity = previewOpacity / 100;
                    preview.querySelector('.no-background-text').style.display = 'none';
                    removeBtn.style.display = 'inline-block';
                } else {
                    currentBackgroundUrl = null;
                    preview.style.backgroundImage = 'none';
                    preview.style.opacity = 1;
                    preview.querySelector('.no-background-text').style.display = 'block';
                    removeBtn.style.display = 'none';
                }
            })
            .catch(error => {
                // Error loading background, ignore silently
            });

        modal.style.display = 'flex';
    }

    function closeBackgroundModal() {
        const modal = document.getElementById('backgroundImageModal');
        const fileInput = document.getElementById('backgroundImageInput');
        
        if (modal) modal.style.display = 'none';
        if (fileInput) fileInput.value = '';
        pendingFile = null;
        currentWorkspace = null;
    }

    function previewBackgroundImage(file) {
        const preview = document.getElementById('backgroundPreview');
        const removeBtn = document.getElementById('removeBackgroundBtn');
        
        if (!file.type.match('image.*')) {
            if (typeof window.showError === 'function') {
                window.showError('Please select a valid image file');
            } else {
                alert('Please select a valid image file');
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const opacityInput = document.getElementById('backgroundOpacityInput');
            const opacity = opacityInput ? opacityInput.value : 25;
            const previewOpacity = Math.min(opacity, 25);
            preview.style.backgroundImage = `url('${e.target.result}')`;
            preview.style.opacity = previewOpacity / 100;
            preview.querySelector('.no-background-text').style.display = 'none';
            removeBtn.style.display = 'inline-block';
            pendingFile = file;
        };
        reader.readAsDataURL(file);
    }

    function removeBackgroundPreview() {
        const preview = document.getElementById('backgroundPreview');
        const removeBtn = document.getElementById('removeBackgroundBtn');

        preview.style.backgroundImage = 'none';
        preview.style.opacity = 1;
        preview.querySelector('.no-background-text').style.display = 'block';
        removeBtn.style.display = 'none';
        pendingFile = null;
        currentBackgroundUrl = null;
    }

    function updatePreviewOpacity(value) {
        const preview = document.getElementById('backgroundPreview');
        if (preview && preview.style.backgroundImage && preview.style.backgroundImage !== 'none') {
            const previewOpacity = Math.min(value, 25);
            preview.style.opacity = previewOpacity / 100;
        }
    }

    function saveWorkspaceBackground() {
        const opacityInput = document.getElementById('backgroundOpacityInput');
        const opacity = normalizeOpacity(opacityInput.value);

        if (!currentWorkspace) {
            closeBackgroundModal();
            return;
        }

        // Save opacity for this workspace
        setBackgroundOpacity(currentWorkspace, opacity, function(success) {
            if (!success) {
                if (typeof window.showError === 'function') {
                    window.showError('Error saving opacity setting');
                } else {
                    alert('Error saving opacity setting');
                }
            }

            // If there's a pending file, upload it
            if (pendingFile) {
                uploadWorkspaceBackground(pendingFile, opacity);
            } else if (currentBackgroundUrl === null) {
                // Remove background
                deleteWorkspaceBackground(opacity);
            } else {
                // Just close the modal (opacity already saved)
                closeBackgroundModal();
            }
        });
    }

    function uploadWorkspaceBackground(file, opacity) {
        const formData = new FormData();
        formData.append('background', file);
        formData.append('workspace', currentWorkspace);

        fetch('api_upload_background.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem('backgroundImageUrl_' + currentWorkspace, data.url);
                closeBackgroundModal();
            } else {
                if (typeof window.showError === 'function') {
                    window.showError(data.error || 'Error uploading image');
                } else {
                    alert(data.error || 'Error uploading image');
                }
            }
        })
        .catch(error => {
            if (typeof window.showError === 'function') {
                window.showError('Error uploading image');
            } else {
                alert('Error uploading image');
            }
        });
    }

    function deleteWorkspaceBackground(opacity) {
        fetch('api_upload_background.php?workspace=' + encodeURIComponent(currentWorkspace), {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                localStorage.removeItem('backgroundImageUrl_' + currentWorkspace);
                closeBackgroundModal();
            } else {
                if (typeof window.showError === 'function') {
                    window.showError(data.error || 'Error removing image');
                } else {
                    alert(data.error || 'Error removing image');
                }
            }
        })
        .catch(error => {
            if (typeof window.showError === 'function') {
                window.showError('Error removing image');
            } else {
                alert('Error removing image');
            }
        });
    }

})();
