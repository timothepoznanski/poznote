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
          console.log('Excalidraw ref callback called with:', api);
          excalidrawAPI = api;
        }}
        onChange={(elements, appState, files) => {
          // Store the latest data from onChange (debounced to avoid spam)
          lastElements = elements;
          lastAppState = appState;
          lastFiles = files;
          
          // Only log when there are actual elements or meaningful changes
          if (elements.length > 0) {
            console.log('onChange captured:', elements.length, 'elements');
          }
        }}
        onInitLibrary={(err) => {
          if (err) {
            console.error('Excalidraw library initialization error:', err);
          } else {
            console.log('Excalidraw library initialized successfully');
          }
        }}
      />
    );

    root.render(<ExcalidrawWrapper />);

    // Return API object using onChange data as fallback
    return {
      getSceneElements: () => {
        console.log('Getting scene elements...');
        if (excalidrawAPI) {
          console.log('Using direct API');
          return excalidrawAPI.getSceneElements();
        }
        console.log('Using onChange fallback, elements:', lastElements.length);
        return lastElements;
      },
      getAppState: () => {
        console.log('Getting app state...');
        if (excalidrawAPI) {
          return excalidrawAPI.getAppState();
        }
        console.log('Using onChange fallback appState');
        return lastAppState;
      },
      getFiles: () => {
        console.log('Getting files...');
        if (excalidrawAPI) {
          return excalidrawAPI.getFiles();
        }
        console.log('Using onChange fallback files');
        return lastFiles;
      },
      exportToCanvas: async (exportOptions) => {
        console.log('Exporting to canvas...');
        return await exportToCanvas(exportOptions);
      }
    };
  },
  
  // Direct export function
  exportToCanvas: exportToCanvas
};

console.log('PoznoteExcalidraw loaded successfully');