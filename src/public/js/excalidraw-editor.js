/**
 * Excalidraw Editor JavaScript
 * CSP-compliant external script for Excalidraw functionality
 */
(function() {
    'use strict';

    // Per-account part of a note's localStorage keys, see js/theme-init.js.
    function noteStorageId(noteId) {
        return typeof window.__poznoteNoteStorageId === 'function'
            ? window.__poznoteNoteStorageId(noteId)
            : String(noteId);
    }

    // Name the window so the "Browse libraries" link targets it: the external
    // library site returns the chosen library by navigating this window to
    // <same url>#addLibrary=..., which the Excalidraw bundle picks up live.
    window.name = '_excalidraw';

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
    // The note background of each theme, so the editor draws on the same
    // ground the note shows the diagram on. The canvas itself is transparent
    // and lets this show through, see getCanvasBackground().
    var EXCALIDRAW_THEME_COLORS = {
        light: {
            noteBackground: '#ffffff',
            itemStroke: '#1e1e1e'
        },
        dark: {
            noteBackground: '#252526',
            itemStroke: '#1e1e1e'
        },
        black: {
            noteBackground: '#141821',
            itemStroke: '#1e1e1e'
        }
    };

    function tpl(template, vars) {
        return String(template).replace(/\{\{(\w+)\}\}/g, function(match, key) {
            return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
        });
    }

    var noteId = config.noteId || 0;
    var noteTitle = config.noteTitle || '';
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
                existingData = JSON.parse(rawData.trim());
            }
        }
        
        // Validate and clean the data structure for Excalidraw
        if (existingData) {
            var initialPoznoteTheme = getPoznoteTheme();
            var initialTheme = normalizeTheme(initialPoznoteTheme);

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
                    viewBackgroundColor: getCanvasBackground(),
                    zoom: existingData.appState.zoom || { value: 1 },
                    scrollX: existingData.appState.scrollX || 0,
                    scrollY: existingData.appState.scrollY || 0,
                    theme: initialTheme,
                    currentItemStrokeColor: getCurrentItemStrokeColor(initialPoznoteTheme),
                    currentItemBackgroundColor: 'transparent',
                    exportBackground: true,
                    exportWithDarkMode: initialTheme === 'dark'
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

    // Function to enable/disable the save button based on changes.
    // "Save and exit" is intentionally always clickable: it must stay usable
    // as an exit even right after a save, when there is nothing new to save.
    function updateSaveButtonsState() {
        var saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.disabled = !hasChanges;
    }

    // Function to check if there are changes.
    // Only the elements are compared: the appState the editor forces is
    // derived from the current theme, and the preview no longer carries a
    // theme, so a theme change is not a change to the diagram. It used to be
    // tracked here, which armed Save with nothing to save (issue #1445).
    function checkForChanges() {
        if (!excalidrawAPI || !initialElements) {
            return;
        }
        
        var currentElements = excalidrawAPI.getSceneElements();
        applyEditorShellTheme();
        
        // Check if elements count changed
        if (currentElements.length !== initialElements.length) {
            hasChanges = true;
            updateSaveButtonsState();
            return;
        }
        
        // Check if any element has changed
        hasChanges = JSON.stringify(currentElements) !== JSON.stringify(initialElements);
        
        updateSaveButtonsState();
    }

    function getPoznoteTheme() {
        try {
            var theme = normalizePoznoteTheme(window.__poznoteForcedTheme)
                || normalizePoznoteTheme((window.__poznoteUserStorage || localStorage).getItem('poznote-theme'))
                || 'system';
            if (theme === 'system') {
                theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
            }
            return theme === 'black' ? 'black' : normalizeTheme(theme);
        } catch (e) {
            return 'light';
        }
    }

    function normalizePoznoteTheme(theme) {
        theme = String(theme || '').toLowerCase();
        return theme === 'black' || theme === 'dark' || theme === 'light' || theme === 'system'
            ? theme
            : null;
    }

    function normalizeTheme(theme) {
        return theme === 'dark' || theme === 'black' ? 'dark' : 'light';
    }

    function applyEditorShellTheme() {
        if (!document.body) {
            return;
        }

        var poznoteTheme = getPoznoteTheme();
        var normalizedTheme = normalizeTheme(poznoteTheme);
        document.body.classList.toggle('excalidraw-shell-dark', normalizedTheme === 'dark');
        document.body.classList.toggle('excalidraw-shell-light', normalizedTheme !== 'dark');
        document.body.style.setProperty('--excalidraw-note-background', getNoteBackground(poznoteTheme));
        applyExcalidrawDomTheme(normalizedTheme);
    }

    function getNoteBackground(theme) {
        return getThemeColors(theme).noteBackground;
    }

    // Excalidraw paints nothing behind the drawing: the canvas is transparent
    // and the page shows the note background of the current theme through it
    // (css/excalidraw.css). A dark shell inverts the canvas, so a colour here
    // would be inverted with it and never match the note; the ground has to
    // sit outside the filter.
    function getCanvasBackground() {
        return 'transparent';
    }

    function getCurrentItemStrokeColor(theme) {
        return getThemeColors(theme).itemStroke;
    }

    function getThemeColors(theme) {
        var poznoteTheme = theme === 'black' ? 'black' : normalizeTheme(theme);
        return EXCALIDRAW_THEME_COLORS[poznoteTheme] || EXCALIDRAW_THEME_COLORS.light;
    }

    function applyExcalidrawDomTheme(theme) {
        var roots = document.querySelectorAll('.excalidraw');
        for (var i = 0; i < roots.length; i++) {
            roots[i].classList.toggle('theme--dark', theme === 'dark');
        }
    }

    function getExportAppState(appState) {
        var poznoteTheme = getPoznoteTheme();
        var theme = normalizeTheme(poznoteTheme);
        return Object.assign({}, appState || {}, {
            theme: theme,
            viewBackgroundColor: getCanvasBackground(),
            currentItemStrokeColor: getCurrentItemStrokeColor(poznoteTheme),
            currentItemBackgroundColor: 'transparent',
            exportBackground: true,
            exportWithDarkMode: theme === 'dark'
        });
    }

    function syncExcalidrawTheme() {
        applyEditorShellTheme();

        if (excalidrawAPI && typeof excalidrawAPI.syncTheme === 'function') {
            excalidrawAPI.syncTheme();
        }
    }

    // The note shows the diagram through an <img> pointing at this preview.
    // It used to be a PNG rendered at 1x, which the browser upscales on any
    // HiDPI screen (issue #1434). An SVG stays crisp at every pixel density
    // and zoom level, and the <img> markup around it does not change.
    //
    // Excalidraw 0.17 writes one @font-face per bundled font into the SVG,
    // each as a URL. An SVG displayed through <img> loads no external
    // resource at all, so those rules are dead there and text would fall
    // back to a system font: rewrite them as data: URIs of the fonts the
    // diagram really uses. Ids are Excalidraw's FONT_FAMILY constant;
    // Helvetica (2) is a system font with no file to embed.
    var EXCALIDRAW_FONT_FILES = {
        1: { family: 'Virgil', file: 'Virgil.woff2' },
        3: { family: 'Cascadia', file: 'Cascadia.woff2' },
        4: { family: 'Assistant', file: 'Assistant-Regular.woff2' }
    };
    var fontDataUriPromises = {};

    function getExcalidrawAssetsPath() {
        var base = String(window.EXCALIDRAW_ASSET_PATH || 'js/excalidraw-dist/');
        if (base.slice(-1) !== '/') {
            base += '/';
        }
        return base + 'excalidraw-assets/';
    }

    function fetchFontDataUri(file) {
        if (!fontDataUriPromises[file]) {
            fontDataUriPromises[file] = fetch(getExcalidrawAssetsPath() + file)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.arrayBuffer();
                })
                .then(function(buffer) {
                    var bytes = new Uint8Array(buffer);
                    var binary = '';
                    for (var i = 0; i < bytes.length; i += 0x8000) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
                    }
                    return 'data:font/woff2;base64,' + btoa(binary);
                });
            // A failed fetch must not poison the later saves of this session
            fontDataUriPromises[file].catch(function() {
                delete fontDataUriPromises[file];
            });
        }
        return fontDataUriPromises[file];
    }

    function getUsedFontIds(elements) {
        var used = [];
        (elements || []).forEach(function(element) {
            if (element && !element.isDeleted && element.type === 'text'
                && EXCALIDRAW_FONT_FILES[element.fontFamily]
                && used.indexOf(element.fontFamily) === -1) {
                used.push(element.fontFamily);
            }
        });
        return used;
    }

    async function inlineSvgFonts(svg, elements) {
        var rules = await Promise.all(getUsedFontIds(elements).map(function(fontId) {
            var font = EXCALIDRAW_FONT_FILES[fontId];
            return fetchFontDataUri(font.file).then(function(dataUri) {
                return '@font-face { font-family: "' + font.family + '"; src: url("' + dataUri + '") format("woff2"); }';
            }, function(error) {
                // That text then renders in a fallback font; the diagram
                // itself is intact and the next save embeds it again.
                console.warn('Excalidraw preview: could not embed font ' + font.file, error);
                return '';
            });
        }));
        rules = rules.filter(Boolean);

        var style = svg.querySelector('style.style-fonts');
        if (style) {
            style.textContent = rules.join('\n');
        } else if (rules.length) {
            var svgNs = 'http://www.w3.org/2000/svg';
            var defs = svg.querySelector('defs');
            if (!defs) {
                defs = svg.insertBefore(document.createElementNS(svgNs, 'defs'), svg.firstChild);
            }
            style = document.createElementNS(svgNs, 'style');
            style.setAttribute('class', 'style-fonts');
            style.textContent = rules.join('\n');
            defs.appendChild(style);
        }
    }

    async function exportPreviewSvg(elements, appState, files) {
        var svg = await excalidrawAPI.exportToSvg({
            elements: elements,
            // exportScale only multiplies the width/height attributes, which
            // would show the diagram larger than drawn, and exportEmbedScene
            // would bloat the file with a copy of the JSON the note already
            // stores: both are user toggles of Excalidraw's own export dialog
            appState: Object.assign(getExportAppState(appState), {
                exportScale: 1,
                exportEmbedScene: false,
                // The preview carries no theme of its own (issue #1445).
                // exportBackground would paint the canvas colour into the
                // file as a <rect> and exportWithDarkMode would add the
                // invert filter that turns a black stroke into a light one,
                // both frozen at the moment of the save: the note then kept
                // showing the theme it was drawn under until it was reopened
                // and saved again. Stored bare instead, the note paints the
                // ground behind it and a dark theme inverts it in CSS, so a
                // theme change shows through straight away.
                exportBackground: false,
                exportWithDarkMode: false
            }),
            files: files,
            exportPadding: 10
        });
        await inlineSvgFonts(svg, elements);
        return new XMLSerializer().serializeToString(svg);
    }

    // Save embedded diagram
    async function saveEmbeddedDiagram(data, elements, appState, files) {
        var previewSvg = await exportPreviewSvg(elements, appState, files);

        var formData = new FormData();
        formData.append('action', 'save_embedded_diagram');
        formData.append('note_id', noteId);
        formData.append('diagram_id', diagramId);
        formData.append('workspace', workspace);
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_svg', previewSvg);
        
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
        var previewSvg = await exportPreviewSvg(elements, appState, files);

        // Send to server. The heading is only used when creating the note:
        // the toolbar <h3> shows "Poznote - <title>", so its textContent must
        // never be echoed back as the note title (it used to grow one
        // "Poznote - " prefix per save).
        var formData = new FormData();
        formData.append('note_id', noteId);
        formData.append('workspace', workspace);
        formData.append('heading', noteTitle);
        formData.append('diagram_data', JSON.stringify(data));
        formData.append('preview_svg', previewSvg);

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
                // Let the Excalidraw bundle refresh the browse-libraries
                // return URL so a later library round trip comes back to
                // this note instead of a blank note_id=0 editor
                window.dispatchEvent(new Event('poznote-note-url-changed'));
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
                app.style.marginTop = 'var(--excalidraw-toolbar-height)';
                app.style.paddingTop = '0';
                app.style.height = 'calc(var(--excalidraw-viewport-height) - var(--excalidraw-toolbar-height) - env(safe-area-inset-bottom, 0px))';
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
                var currentPoznoteTheme = getPoznoteTheme();
                var currentTheme = normalizeTheme(currentPoznoteTheme);
                applyEditorShellTheme();
                var safeInitialData = existingData || {
                    elements: [],
                    appState: {
                        theme: currentTheme,
                        viewBackgroundColor: getCanvasBackground(),
                        currentItemStrokeColor: getCurrentItemStrokeColor(currentPoznoteTheme),
                        currentItemBackgroundColor: 'transparent',
                        exportBackground: true,
                        exportWithDarkMode: currentTheme === 'dark'
                    },
                    files: {}
                };
                
                excalidrawAPI = window.PoznoteExcalidraw.init('app', {
                    initialData: safeInitialData,
                    theme: currentTheme,
                    canvasBackgroundColor: getCanvasBackground(),
                    currentItemStrokeColor: getCurrentItemStrokeColor(currentPoznoteTheme),
                    currentItemBackgroundColor: 'transparent'
                });

                setTimeout(syncExcalidrawTheme, 0);
                setTimeout(syncExcalidrawTheme, 100);
                setTimeout(syncExcalidrawTheme, 300);
                
                // Store initial elements for change detection
                setTimeout(function() {
                    if (excalidrawAPI) {
                        initialElements = JSON.parse(JSON.stringify(excalidrawAPI.getSceneElements()));
                        syncExcalidrawTheme();
                        
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
                    var appState = getExportAppState(excalidrawAPI.getAppState());
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
                        localStorage.removeItem('poznote_draft_' + noteStorageId(noteId));
                        localStorage.removeItem('poznote_title_' + noteStorageId(noteId));
                        localStorage.removeItem('poznote_tags_' + noteStorageId(noteId));
                    } catch (err) {
                        // Ignore
                        console.debug('excalidraw-editor: now() failed:', err);
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
                    var appState = getExportAppState(excalidrawAPI.getAppState());
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
                        localStorage.removeItem('poznote_draft_' + noteStorageId(noteId));
                        localStorage.removeItem('poznote_title_' + noteStorageId(noteId));
                        localStorage.removeItem('poznote_tags_' + noteStorageId(noteId));
                    } catch (err) {
                        // Ignore
                        console.debug('excalidraw-editor: now() failed:', err);
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
})();
