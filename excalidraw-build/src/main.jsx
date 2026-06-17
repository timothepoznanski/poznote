import ReactDOM from 'react-dom/client';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import _ from 'lodash';

// Make lodash available globally for Excalidraw
window._ = _;

const normalizeTheme = (theme) => (theme === 'dark' || theme === 'black') ? 'dark' : 'light';
const TRANSPARENT_COLORS = new Set(['transparent', 'rgba(0,0,0,0)', 'rgba(0, 0, 0, 0)']);

const parseHexColor = (color) => {
  if (typeof color !== 'string') {
    return null;
  }

  const value = color.trim().toLowerCase();
  if (!value.startsWith('#')) {
    return null;
  }

  if (value.length === 4) {
    return {
      r: parseInt(value[1] + value[1], 16),
      g: parseInt(value[2] + value[2], 16),
      b: parseInt(value[3] + value[3], 16)
    };
  }

  if (value.length === 7) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16)
    };
  }

  return null;
};

const getRelativeLuminance = ({ r, g, b }) => {
  const toLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return (0.2126 * toLinear(r)) + (0.7152 * toLinear(g)) + (0.0722 * toLinear(b));
};

const isNeutralLightColor = (color) => {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return false;
  }

  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 28
    && getRelativeLuminance(rgb) > 0.72;
};

const isHiddenStrokeColor = (color, theme) => {
  if (!color || TRANSPARENT_COLORS.has(String(color).trim().toLowerCase())) {
    return true;
  }

  if (theme === 'dark') {
    return isNeutralLightColor(color);
  }

  const rgb = parseHexColor(color);
  return rgb ? getRelativeLuminance(rgb) > 0.94 : false;
};

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
    let hasThemeSubscriptions = false;

    const requestedTheme = normalizeTheme(options.theme);
    const sourceInitialData = options.initialData || {};
    const canvasBackgroundColor =
      options.canvasBackgroundColor ||
      sourceInitialData.appState?.viewBackgroundColor ||
      '#ffffff';
    const defaultItemStrokeColor =
      options.currentItemStrokeColor ||
      sourceInitialData.appState?.currentItemStrokeColor ||
      '#1e1e1e';
    const currentItemBackgroundColor =
      options.currentItemBackgroundColor ||
      sourceInitialData.appState?.currentItemBackgroundColor ||
      'transparent';
    const getVisibleStrokeColor = (strokeColor) => (
      isHiddenStrokeColor(strokeColor, requestedTheme) ? defaultItemStrokeColor : strokeColor
    );
    const getNormalizedElements = (elements = []) => {
      let hasHiddenStrokes = false;
      const nextElements = elements.map((element) => {
        if (!element || element.isDeleted || !isHiddenStrokeColor(element.strokeColor, requestedTheme)) {
          return element;
        }

        hasHiddenStrokes = true;
        return {
          ...element,
          strokeColor: defaultItemStrokeColor,
          version: (element.version || 1) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
          updated: Date.now()
        };
      });

      return {
        elements: nextElements,
        hasHiddenStrokes
      };
    };
    const getForcedAppState = (appState = {}, options = {}) => {
      const nextAppState = {
        theme: requestedTheme,
        viewBackgroundColor: canvasBackgroundColor,
        currentItemBackgroundColor,
        exportBackground: true,
        exportWithDarkMode: requestedTheme === 'dark'
      };

      if (options.forceStroke || isHiddenStrokeColor(appState.currentItemStrokeColor, requestedTheme)) {
        nextAppState.currentItemStrokeColor = defaultItemStrokeColor;
      } else if (appState.currentItemStrokeColor) {
        nextAppState.currentItemStrokeColor = getVisibleStrokeColor(appState.currentItemStrokeColor);
      }

      return nextAppState;
    };
    const applyThemeClassToDom = () => {
      const excalidrawRoot = container.querySelector('.excalidraw');
      if (!excalidrawRoot) {
        return;
      }

      excalidrawRoot.classList.toggle('theme--dark', requestedTheme === 'dark');
    };
    const normalizeHiddenElementStrokes = (api = excalidrawAPI, elements = null) => {
      if (!api || typeof api.getSceneElements !== 'function' || typeof api.updateScene !== 'function') {
        return;
      }

      const sourceElements = elements || api.getSceneElements();
      const { elements: nextElements, hasHiddenStrokes } = getNormalizedElements(sourceElements);

      if (hasHiddenStrokes) {
        api.updateScene({ elements: nextElements, commitToHistory: false });
      }
    };
    const syncForcedAppState = (api = excalidrawAPI) => {
      if (!api || typeof api.updateScene !== 'function') {
        return;
      }

      const currentAppState = typeof api.getAppState === 'function' ? api.getAppState() : {};
      applyThemeClassToDom();
      api.updateScene({ appState: getForcedAppState(currentAppState), commitToHistory: false });
    };
    const scheduleForcedAppState = (api) => {
      [0, 50, 250].forEach((delay) => {
        setTimeout(() => syncForcedAppState(api), delay);
      });
    };
    const syncLiveDrawingState = () => {
      syncForcedAppState();
      normalizeHiddenElementStrokes();
    };

    container.addEventListener('pointerdown', syncLiveDrawingState, true);
    container.addEventListener('touchstart', syncLiveDrawingState, true);

    // Load global library from localStorage
    let initialLibraryItems = sourceInitialData.libraryItems || [];
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
        ...sourceInitialData,
        appState: {
          ...(sourceInitialData.appState || {}),
          ...getForcedAppState(sourceInitialData.appState || {}, { forceStroke: true })
        },
        libraryItems: initialLibraryItems
    };

    const ExcalidrawWrapper = () => (
      <Excalidraw 
        initialData={initialData || { elements: [], appState: {} }}
        theme={requestedTheme}
        UIOptions={{
          ...options.UIOptions,
          canvasActions: {
            ...(options.UIOptions?.canvasActions || {}),
            toggleTheme: false,
            changeViewBackgroundColor: false
          }
        }}
        ref={(api) => {
          excalidrawAPI = api;
          if (api) {
            applyThemeClassToDom();
            scheduleForcedAppState(api);
            if (!hasThemeSubscriptions) {
              hasThemeSubscriptions = true;
              if (typeof api.onPointerDown === 'function') {
                api.onPointerDown(() => {
                  syncForcedAppState(api);
                });
              }
              if (typeof api.onPointerUp === 'function') {
                api.onPointerUp(() => {
                  syncForcedAppState(api);
                  normalizeHiddenElementStrokes(api);
                });
              }
            }
          }
        }}
        onChange={(elements, appState, files) => {
          const normalized = getNormalizedElements(elements);
          const forcedAppState = getForcedAppState(appState);
          // Store the latest data from onChange (debounced to avoid spam)
          lastElements = normalized.elements;
          lastAppState = { ...appState, ...forcedAppState };
          lastFiles = files;
          applyThemeClassToDom();

          if (excalidrawAPI && typeof excalidrawAPI.updateScene === 'function') {
            const shouldSyncAppState =
              appState.theme !== forcedAppState.theme ||
              appState.viewBackgroundColor !== forcedAppState.viewBackgroundColor ||
              appState.currentItemBackgroundColor !== forcedAppState.currentItemBackgroundColor ||
              appState.exportBackground !== forcedAppState.exportBackground ||
              appState.exportWithDarkMode !== forcedAppState.exportWithDarkMode ||
              appState.currentItemStrokeColor !== forcedAppState.currentItemStrokeColor;

            if (normalized.hasHiddenStrokes || shouldSyncAppState) {
              const sceneUpdate = {
                appState: forcedAppState,
                commitToHistory: false
              };

              if (normalized.hasHiddenStrokes) {
                sceneUpdate.elements = normalized.elements;
              }

              excalidrawAPI.updateScene(sceneUpdate);
            }
          }
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
      },
      syncTheme: () => {
        syncForcedAppState();
      }
    };
  },
  
  // Direct export function
  exportToCanvas: exportToCanvas
};
