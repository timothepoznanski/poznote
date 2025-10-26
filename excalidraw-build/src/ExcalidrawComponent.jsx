import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';

const PoznoteExcalidraw = forwardRef((props, ref) => {
  const excalidrawRef = useRef(null);

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
      initialData={props.initialData || { elements: [], appState: {} }}
      theme={props.theme || 'light'}
    />
  );
});

PoznoteExcalidraw.displayName = 'PoznoteExcalidraw';

export default PoznoteExcalidraw;