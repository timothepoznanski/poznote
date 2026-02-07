/**
 * Excalidraw Editor JavaScript
 * CSP-compliant external script for Excalidraw functionality
 */
(function() {
    'use strict';
    
    // Get configuration from JSON element
    var configEl = document.getElementById('excalidraw-config');
    if (!configEl) {
        console.error('Excalidraw config element not found');
        return;
    }
    
    var config;
    try {
        config = JSON.parse(configEl.textContent || '{}');
    } catch (e) {
        console.error('Failed to parse excalidraw config:', e);
        return;
    }
    
    // Translation texts
    var TXT_EDITOR_NOT_READY = config.txt.editorNotReady || 'Editor not ready';
    var TXT_SAVING = config.txt.saving || 'Saving...';
    var TXT_SAVED = config.txt.saved || 'Saved!';
    var TXT_SAVE = config.txt.save || 'Save';
    var TXT_SAVE_AND_EXIT = config.txt.saveAndExit || 'Save and exit';
    var TXT_FAILED_TO_LOAD = config.txt.failedToLoad || 'Error: Failed to load Excalidraw. Please refresh the page.';
    var TXT_INIT_ERROR_TEMPLATE = config.txt.initErrorTemplate || 'Error initializing Excalidraw: {{error}}';
    var TXT_ERROR_TEMPLATE = config.txt.errorTemplate || 'Error: {{error}}';
    var TXT_SAVE_FAILED = config.txt.saveFailed || 'Save failed';

    function tpl(template, vars) {
        return String(template).replace(/\{\{(\w+)\}\}/g, function(match, key) {
            return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
        });
    }

    var noteId = config.noteId || 0;
    var workspace = config.workspace || '';
    var diagramId = config.diagramId || null;
    var isEmbeddedDiagram = config.isEmbeddedDiagram || false;
    
    // Get cursor position from sessionStorage if available
    var cursorPosition = null;
    try {
        var context = JSON.parse(sessionStorage.getItem('excalidraw_context') || '{}');
        if (context.cursorPosition !== undefined && context.cursorPosition !== null) {
            cursorPosition = context.cursorPosition;
        }
    } catch (e) {
        console.error('Failed to parse excalidraw context:', e);
    }
    
    // Safer data handling
    var existingData = null;
    try {
        var rawData = config.existingData || null;
        
        if (rawData) {
            if (typeof rawData === 'object') {
                existingData = rawData;
            } else if (typeof rawData === 'string') {
                // If the string contains non-JSON characters, try to clean it
                var cleanedData = rawData.trim();
                
                // Look for complete JSON structure that starts with { and ends with }}
                var jsonMatch = cleanedData.match(/^(\{.*\}\})/);
                if (jsonMatch) {
                    cleanedData = jsonMatch[1];
                }
                
                existingData = JSON.parse(cleanedData);
            }
        }
        
        // Validate and clean the data structure for Excalidraw
        if (existingData) {
            // Ensure we have proper structure
            if (!existingData.elements) {
                existingData.elements = [];
            }
            if (!existingData.appState) {
                existingData.appState = {};
            }
            if (!existingData.files) {
                existingData.files = {};
            }
            if (!existingData.libraryItems) {
                existingData.libraryItems = [];
            }
            
            // Ensure elements is an array
            if (!Array.isArray(existingData.elements)) {
                existingData.elements = [];
            }
            
            // Create a clean data structure with essential properties
            existingData = {
                elements: existingData.elements,
                appState: {
                    viewBackgroundColor: existingData.appState.viewBackgroundColor || "#ffffff",
                    zoom: existingData.appState.zoom || { value: 1 },
                    scrollX: existingData.appState.scrollX || 0,
                    scrollY: existingData.appState.scrollY || 0
                },
                files: existingData.files || {},
                libraryItems: existingData.libraryItems || []
            };
        }
        
    } catch (parseError) {
        console.error('Failed to load diagram data');
        existingData = null;
    }
    
    var excalidrawAPI = null;
    var hasChanges = false;
    var initialElements = null;

    // Function to enable/disable save buttons based on changes
    function updateSaveButtonsState() {
        var saveBtn = document.getElementById('saveBtn');
        var saveAndExitBtn = document.getElementById('saveAndExitBtn');
        
        if (hasChanges) {
            if (saveBtn) saveBtn.disabled = false;
            if (saveAndExitBtn) saveAndExitBtn.disabled = false;
        } else {
            if (saveBtn) saveBtn.disabled = true;
            if (saveAndExitBtn) saveAndExitBtn.disabled = true;
        }
    }

    // Function to check if there are changes
    function checkForChanges() {
        if (!excalidrawAPI || !initialElements) {
            return;
        }
        
        var currentElements = excalidrawAPI.getSceneElements();
        
        // Check if elements count changed
        if (currentElements.length !== initialElements.length) {
            hasChanges = true;
            updateSaveButtonsState();
            return;
        }
        
        // Check if any element has changed
        var currentJSON = JSON.stringify(currentElements);
        var initialJSON = JSON.stringify(initialElements);
        
        if (currentJSON !== initialJSON) {
            hasChanges = true;
        } else {
            hasChanges = false;
        }
        
        updateSaveButtonsState();
    }

    function getTheme() {
        try {
            return localStorage.getItem('poznote-theme') || 'light';
        } catch (e) {
            return 'light';
        }
    }

    // Save embedded diagram
    async function saveEmbeddedDiagram(data, elements, appState, files) {
        // Generate preview canvas with padding for white margin around drawing
        var canvas = await excalidrawAPI.exportToCanvas({
            elements: elements,
            appState: appState,
            files: files,
            exportPadding: 10,
            exportBackground: true
        });
        
        // Convert to base64 image for embedding
        var base64Image = canvas.toDataURL('image/png');
        
        var formData = new FormData();
        formData.append('action', 'save_embedded_diagram');
        formData.append('note_id', noteId);
        formData.append('diagram_id', diagramId);
        formData.append('workspace', workspace);
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_image_base64', base64Image);
        
        // Send cursor position if available
        if (cursorPosition !== null) {
            formData.append('cursor_position', cursorPosition);
        }
        
        var response = await fetch('api_save_excalidraw.php', {
            method: 'POST',
            body: formData
        });
        
        var result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || TXT_SAVE_FAILED);
        }
    }
    
    // Save full note
    async function saveFullNote(data, elements, appState, files) {
        // Generate PNG preview with padding for white margin around drawing
        var canvas = await excalidrawAPI.exportToCanvas({
            elements: elements,
            appState: appState,
            files: files,
            exportPadding: 10,
            exportBackground: true
        });
        
        var blob = await new Promise(function(resolve) {
            canvas.toBlob(resolve, 'image/png');
        });
        
        // Send to server
        var formData = new FormData();
        formData.append('note_id', noteId);
        formData.append('workspace', workspace);
        var h3 = document.querySelector('h3');
        formData.append('heading', h3 ? h3.textContent : '');
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_image', blob, 'preview.png');
        
        var response = await fetch('api_save_excalidraw.php', {
            method: 'POST',
            body: formData
        });
        
        var result = await response.json();
        
        if (result.success) {
            // Update the note ID if it was a new note
            if (result.note_id && noteId === 0) {
                noteId = result.note_id;
                
                // Update URL to include note_id for future reloads
                var url = new URL(window.location);
                url.searchParams.set('note_id', noteId);
                window.history.replaceState({}, '', url);
            }
        } else {
            throw new Error(result.message || TXT_SAVE_FAILED);
        }
    }

    // Initialize on DOM ready
    window.addEventListener('DOMContentLoaded', function() {
        // Mobile optimizations
        if (window.innerWidth < 800) {
            // Prevent zoom on double tap for better touch experience
            var lastTouchEnd = 0;
            document.addEventListener('touchend', function(event) {
                var now = (new Date()).getTime();
                if (now - lastTouchEnd <= 300) {
                    event.preventDefault();
                }
                lastTouchEnd = now;
            }, false);
            
            // Force toolbar to stay visible
            var toolbar = document.querySelector('.poznote-toolbar');
            if (toolbar) {
                toolbar.style.position = 'fixed';
                toolbar.style.top = '0';
                toolbar.style.left = '0';
                toolbar.style.right = '0';
                toolbar.style.zIndex = '10000';
            }
            
            // Adjust app container for mobile
            var app = document.getElementById('app');
            if (app) {
                app.style.marginTop = '50px';
                app.style.height = 'calc(100vh - 50px)';
            }
        }
        
        // Wait for bundle to load
        setTimeout(function() {
            if (!window.PoznoteExcalidraw) {
                console.error('PoznoteExcalidraw not found');
                var loadingEl = document.getElementById('loading');
                if (loadingEl) loadingEl.textContent = TXT_FAILED_TO_LOAD;
                return;
            }
            
            try {
                // Initialize Excalidraw with safe fallback
                var safeInitialData = existingData || { elements: [], appState: {}, files: {} };
                
                excalidrawAPI = window.PoznoteExcalidraw.init('app', {
                    initialData: safeInitialData,
                    theme: getTheme()
                });
                
                // Store initial elements for change detection
                setTimeout(function() {
                    if (excalidrawAPI) {
                        initialElements = JSON.parse(JSON.stringify(excalidrawAPI.getSceneElements()));
                        
                        // Set up change detection interval
                        setInterval(checkForChanges, 500);
                    }
                }, 500);
                
                // Hide loading message
                var loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';
                
            } catch (error) {
                console.error('Error initializing Excalidraw:', error);
                var loadingEl = document.getElementById('loading');
                if (loadingEl) loadingEl.textContent = tpl(TXT_INIT_ERROR_TEMPLATE, { error: error.message });
            }
        }, 1000);

        // Save button handler
        var saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                if (!excalidrawAPI) {
                    alert(TXT_EDITOR_NOT_READY);
                    return;
                }
                
                this.textContent = TXT_SAVING;
                
                try {
                    var elements = excalidrawAPI.getSceneElements();
                    var appState = excalidrawAPI.getAppState();
                    var files = excalidrawAPI.getFiles();
                    var libraryItems = excalidrawAPI.getLibraryItems ? excalidrawAPI.getLibraryItems() : [];
                    
                    // Convert files to serializable format with minimal required properties
                    var serializableFiles = {};
                    for (var id in files) {
                        var file = files[id];
                        if (file && file.dataURL) {
                            serializableFiles[id] = {
                                id: file.id || id,
                                dataURL: file.dataURL,
                                mimeType: file.mimeType || 'image/png',
                                created: file.created || Date.now()
                            };
                        }
                    }
                    
                    // Include files in the data object
                    var data = { elements: elements, appState: appState, files: serializableFiles, libraryItems: libraryItems };
                    
                    if (isEmbeddedDiagram) {
                        // Embedded diagram mode: save to existing note HTML
                        await saveEmbeddedDiagram(data, elements, appState, files);
                    } else {
                        // Full note mode: save as complete Excalidraw note
                        await saveFullNote(data, elements, appState, files);
                    }
                    
                    // Clear localStorage draft to prevent auto-restore from overriding the saved diagram
                    try {
                        localStorage.removeItem('poznote_draft_' + noteId);
                        localStorage.removeItem('poznote_title_' + noteId);
                        localStorage.removeItem('poznote_tags_' + noteId);
                    } catch (err) {
                        // Ignore
                    }
                    
                    // Reset change tracking after save
                    initialElements = JSON.parse(JSON.stringify(excalidrawAPI.getSceneElements()));
                    hasChanges = false;
                    updateSaveButtonsState();
                    
                    var btn = this;
                    btn.textContent = TXT_SAVED;
                    setTimeout(function() { btn.textContent = TXT_SAVE; }, 2000);
                    
                } catch (e) {
                    console.error('Save error:', e);
                    alert(tpl(TXT_ERROR_TEMPLATE, { error: e.message }));
                    this.textContent = TXT_SAVE;
                }
            });
        }

        // Save and exit button handler
        var saveAndExitBtn = document.getElementById('saveAndExitBtn');
        if (saveAndExitBtn) {
            saveAndExitBtn.addEventListener('click', async function() {
                if (!excalidrawAPI) {
                    alert(TXT_EDITOR_NOT_READY);
                    return;
                }
                
                this.textContent = TXT_SAVING;
                
                try {
                    var elements = excalidrawAPI.getSceneElements();
                    var appState = excalidrawAPI.getAppState();
                    var files = excalidrawAPI.getFiles();
                    var libraryItems = excalidrawAPI.getLibraryItems ? excalidrawAPI.getLibraryItems() : [];
                    
                    // Convert files to serializable format with minimal required properties
                    var serializableFiles = {};
                    for (var id in files) {
                        var file = files[id];
                        if (file && file.dataURL) {
                            serializableFiles[id] = {
                                id: file.id || id,
                                dataURL: file.dataURL,
                                mimeType: file.mimeType || 'image/png',
                                created: file.created || Date.now()
                            };
                        }
                    }
                    
                    // Include files in the data object
                    var data = { elements: elements, appState: appState, files: serializableFiles, libraryItems: libraryItems };
                    
                    if (isEmbeddedDiagram) {
                        // Embedded diagram mode: save to existing note HTML
                        await saveEmbeddedDiagram(data, elements, appState, files);
                    } else {
                        // Full note mode: save as complete Excalidraw note
                        await saveFullNote(data, elements, appState, files);
                    }
                    
                    // Clear localStorage draft to prevent auto-restore from overriding the saved diagram
                    try {
                        localStorage.removeItem('poznote_draft_' + noteId);
                        localStorage.removeItem('poznote_title_' + noteId);
                        localStorage.removeItem('poznote_tags_' + noteId);
                    } catch (err) {
                        // Ignore
                    }
                    
                    // After saving, redirect back to notes
                    var params = new URLSearchParams({ workspace: workspace });
                    if (noteId > 0) params.append('note', noteId);
                    window.location.href = 'index.php?' + params.toString();
                    
                } catch (e) {
                    console.error('Save error:', e);
                    alert(tpl(TXT_ERROR_TEMPLATE, { error: e.message }));
                    this.textContent = TXT_SAVE_AND_EXIT;
                }
            });
        }
            
        // Cancel button
        var cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                var params = new URLSearchParams({ workspace: workspace });
                if (noteId > 0) params.append('note', noteId);
                window.location.href = 'index.php?' + params.toString();
            });
        }
    });

    // Library Warning Modal Logic
    window.showLibraryWarning = function(url) {
        var modal = document.getElementById('libraryWarningModal');
        var cancelBtn = document.getElementById('libraryWarningCancel');
        var okBtn = document.getElementById('libraryWarningOk');
        
        if (!modal) return;
        
        modal.style.display = 'block';
        
        var closeModal = function() {
            modal.style.display = 'none';
        };
        
        // Remove old event listeners to prevent duplicates if called multiple times
        var newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', closeModal);
        
        var newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        newOkBtn.addEventListener('click', function() {
            closeModal();
            window.open(url, '_blank');
        });
        
        // Close on click outside
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    };
})();
