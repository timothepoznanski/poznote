import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';

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

const PoznoteExcalidraw = forwardRef((props, ref) => {
  const excalidrawRef = useRef(null);
  const theme = normalizeTheme(props.theme);
  const initialData = props.initialData || { elements: [], appState: {} };
  const canvasBackgroundColor =
    props.canvasBackgroundColor ||
    initialData.appState?.viewBackgroundColor ||
    '#ffffff';
  const currentItemStrokeColor =
    props.currentItemStrokeColor ||
    initialData.appState?.currentItemStrokeColor ||
    '#1e1e1e';
  const currentItemBackgroundColor =
    props.currentItemBackgroundColor ||
    initialData.appState?.currentItemBackgroundColor ||
    'transparent';
  const getForcedAppState = (appState = {}, options = {}) => {
    const nextAppState = {
      theme,
      viewBackgroundColor: canvasBackgroundColor,
      currentItemBackgroundColor,
      exportBackground: true,
      exportWithDarkMode: theme === 'dark'
    };

    if (options.forceStroke || isHiddenStrokeColor(appState.currentItemStrokeColor, theme)) {
      nextAppState.currentItemStrokeColor = currentItemStrokeColor;
    } else if (appState.currentItemStrokeColor) {
      nextAppState.currentItemStrokeColor = appState.currentItemStrokeColor;
    }

    return nextAppState;
  };
  const forcedAppState = {
    ...getForcedAppState(initialData.appState || {}, { forceStroke: true })
  };
  const themedInitialData = {
    ...initialData,
    appState: {
      ...(initialData.appState || {}),
      ...forcedAppState
    }
  };

  useEffect(() => {
    const timers = [0, 50, 250].map((delay) => setTimeout(() => {
      if (excalidrawRef.current && typeof excalidrawRef.current.updateScene === 'function') {
        const currentAppState = typeof excalidrawRef.current.getAppState === 'function'
          ? excalidrawRef.current.getAppState()
          : {};
        excalidrawRef.current.updateScene({ appState: getForcedAppState(currentAppState) });
      }
    }, delay));

    return () => timers.forEach(clearTimeout);
  }, [theme, canvasBackgroundColor, currentItemStrokeColor, currentItemBackgroundColor]);

  useImperativeHandle(ref, () => ({
    getSceneElements: () => {
      console.log('PoznoteExcalidraw getSceneElements, ref:', excalidrawRef.current);
      if (excalidrawRef.current) {
        const elements = excalidrawRef.current.getSceneElements();
        console.log('Found elements:', elements.length);
        return elements;
      }
      return [];
    },
    getAppState: () => {
      console.log('PoznoteExcalidraw getAppState, ref:', excalidrawRef.current);
      if (excalidrawRef.current) {
        return excalidrawRef.current.getAppState();
      }
      return {};
    },
    getFiles: () => {
      console.log('PoznoteExcalidraw getFiles, ref:', excalidrawRef.current);
      if (excalidrawRef.current) {
        return excalidrawRef.current.getFiles();
      }
      return {};
    },
    exportToCanvas: async (options) => {
      return await exportToCanvas(options);
    }
  }), []);

  return (
    <Excalidraw
      ref={excalidrawRef}
      initialData={themedInitialData}
      theme={theme}
      UIOptions={{
        ...props.UIOptions,
        canvasActions: {
          ...(props.UIOptions?.canvasActions || {}),
          toggleTheme: false,
          changeViewBackgroundColor: false
        }
      }}
    />
  );
});

PoznoteExcalidraw.displayName = 'PoznoteExcalidraw';

export default PoznoteExcalidraw;
