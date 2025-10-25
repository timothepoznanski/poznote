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

    const ExcalidrawWrapper = () => (
      <Excalidraw 
        initialData={options.initialData || { elements: [], appState: {} }}
        theme={options.theme || 'light'}
        ref={(api) => {
          excalidrawAPI = api;
        }}
        onChange={(elements, appState, files) => {
          // Store the latest data from onChange (debounced to avoid spam)
          lastElements = elements;
          lastAppState = appState;
          lastFiles = files;
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
      exportToCanvas: async (exportOptions) => {
        return await exportToCanvas(exportOptions);
      }
    };
  },
  
  // Direct export function
  exportToCanvas: exportToCanvas
};