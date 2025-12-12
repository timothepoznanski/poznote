import React from 'react';
import ReactDOM from 'react-dom/client';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import _ from 'lodash';

// Make lodash available globally for Excalidraw
window._ = _;

// Expose globally for PHP integration
window.PoznoteExcalidraw = {
  // Initialize Excalidraw in a given container
  init: (containerId, options = {}) => {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    const root = ReactDOM.createRoot(container);
    let excalidrawAPI = null;
    let lastElements = [];
    let lastAppState = {};
    let lastFiles = {};

    // Load global library from localStorage
    let initialLibraryItems = options.initialData.libraryItems || [];
    try {
        const globalLibrary = localStorage.getItem('poznote-library');
        if (globalLibrary) {
            const parsed = JSON.parse(globalLibrary);
            if (Array.isArray(parsed)) {
                // Merge global library with diagram library, removing duplicates by ID
                initialLibraryItems = _.uniqBy([...parsed, ...initialLibraryItems], 'id');
            }
        }
    } catch (e) {
        console.error('Error loading global library', e);
    }
    
    // Update initialData with merged library
    const initialData = {
        ...options.initialData,
        libraryItems: initialLibraryItems
    };

    const ExcalidrawWrapper = () => (
      <Excalidraw 
        initialData={initialData || { elements: [], appState: {} }}
        theme='light'
        ref={(api) => {
          excalidrawAPI = api;
        }}
        onChange={(elements, appState, files) => {
          // Store the latest data from onChange (debounced to avoid spam)
          lastElements = elements;
          lastAppState = appState;
          lastFiles = files;
        }}
        onLibraryChange={(items) => {
            // Save to global storage
            try {
                localStorage.setItem('poznote-library', JSON.stringify(items));
            } catch (e) {
                console.error('Error saving global library', e);
            }
        }}
        onInitLibrary={(err) => {
          if (err) {
            console.error('Excalidraw library initialization error:', err);
          }
        }}
      />
    );

    root.render(<ExcalidrawWrapper />);

    // Return API object using onChange data as fallback
    return {
      getSceneElements: () => {
        if (excalidrawAPI) {
          return excalidrawAPI.getSceneElements();
        }
        return lastElements;
      },
      getAppState: () => {
        if (excalidrawAPI) {
          return excalidrawAPI.getAppState();
        }
        return lastAppState;
      },
      getFiles: () => {
        if (excalidrawAPI) {
          return excalidrawAPI.getFiles();
        }
        return lastFiles;
      },
      getLibraryItems: () => {
        if (excalidrawAPI) {
            // Check if getLibraryItems exists (it should in recent versions)
            if (typeof excalidrawAPI.getLibraryItems === 'function') {
                return excalidrawAPI.getLibraryItems();
            }
        }
        return [];
      },
      exportToCanvas: async (exportOptions) => {
        return await exportToCanvas(exportOptions);
      }
    };
  },
  
  // Direct export function
  exportToCanvas: exportToCanvas
};