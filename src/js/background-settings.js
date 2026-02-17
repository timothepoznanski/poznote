// Background Image Settings Management
// Handles loading and applying background images per workspace on index.php

(function() {
    'use strict';

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

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
        // Only load background image on index.php
        const isIndexPage = window.location.pathname.includes('index.php') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        if (isIndexPage) {
            loadBackgroundImage();
        }
    });

    function getCurrentWorkspace() {
        // First try global selectedWorkspace variable (updated by switchToWorkspace)
        if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
            return window.selectedWorkspace;
        }
        
        // Try URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const urlWorkspace = urlParams.get('workspace');
        if (urlWorkspace) {
            return urlWorkspace;
        }
        
        // Fallback to page config data (static, set on page load)
        const configElement = document.getElementById('page-config-data');
        if (configElement) {
            try {
                const config = JSON.parse(configElement.textContent);
                if (config.selectedWorkspace) {
                    return config.selectedWorkspace;
                }
            } catch (e) {
                // ignore parsing errors
            }
        }
        
        // Default workspace
        return 'Poznote';
    }

    function applyBackgroundSettings(url, opacity) {
        const body = document.body;
        
        // Remove existing background element if any
        const existingBg = document.getElementById('poznote-background-layer');
        if (existingBg) {
            existingBg.remove();
        }
        
        // Only apply background on index.php (not on settings.php, etc.)
        const isIndexPage = window.location.pathname.includes('index.php') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        
        if (url && isIndexPage) {
            // Create a dedicated background element
            const bgElement = document.createElement('div');
            bgElement.id = 'poznote-background-layer';
            bgElement.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100%;
                height: 100%;
                background-image: url('${url}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                opacity: ${opacity / 100};
                pointer-events: none;
                z-index: 0;
            `;
            // Insert as first child of body
            body.insertBefore(bgElement, body.firstChild);
            body.classList.add('has-background-image');
        } else {
            body.classList.remove('has-background-image');
        }
    }

    function loadBackgroundImage() {
        const workspace = getCurrentWorkspace();
        getBackgroundOpacity(workspace, function(savedOpacity) {
            // Check if background exists for this workspace
            fetch('api_upload_background.php?workspace=' + encodeURIComponent(workspace))
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.exists) {
                        applyBackgroundSettings(data.url, savedOpacity);
                    } else {
                        // No background for this workspace
                        applyBackgroundSettings(null, savedOpacity);
                    }
                })
                .catch(error => {
                    applyBackgroundSettings(null, savedOpacity);
                });
        });
    }

    // Expose function for external use (when workspace changes)
    window.reloadWorkspaceBackground = loadBackgroundImage;

})();
