/**
 * page-config.js
 * Initialize page configuration variables
 * This file should be loaded with config data from PHP
 */

(function() {
    // Initialize page configuration
    window.PageConfig = window.PageConfig || {};
    
    // Set configuration method
    window.setPageConfig = function(config) {
        Object.assign(window.PageConfig, config);
        
        // Also set legacy global variables for backward compatibility
        if (config.isSearchMode !== undefined) {
            window.isSearchMode = config.isSearchMode;
        }
        if (config.currentNoteFolder !== undefined) {
            window.currentNoteFolder = config.currentNoteFolder;
        }
        if (config.selectedWorkspace !== undefined) {
            window.selectedWorkspace = config.selectedWorkspace;
        }
        if (config.selectedFolder !== undefined) {
            window.selectedFolder = config.selectedFolder;
        }
        if (config.tasklistIds !== undefined) {
            window.tasklistIds = config.tasklistIds;
        }
        if (config.markdownIds !== undefined) {
            window.markdownIds = config.markdownIds;
        }
        if (config.pageWorkspace !== undefined) {
            window.pageWorkspace = config.pageWorkspace;
        }
    };
    
    // Get configuration method
    window.getPageConfig = function(key) {
        if (key) {
            return window.PageConfig[key];
        }
        return window.PageConfig;
    };
})();
