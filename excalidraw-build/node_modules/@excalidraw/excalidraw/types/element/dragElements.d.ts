import { NonDeletedExcalidrawElement } from "./types";
import { AppState, PointerDownState } from "../types";
import Scene from "../scene/Scene";
export declare const dragSelectedElements: (pointerDownState: PointerDownState, selectedElements: NonDeletedExcalidrawElement[], offset: {
    x: number;
    y: number;
}, appState: AppState, scene: Scene, snapOffset: {
    x: number;
    y: number;
}, gridSize: AppState["gridSize"]) => void;
export declare const getDragOffsetXY: (selectedElements: NonDeletedExcalidrawElement[], x: number, y: number) => [number, number];
export declare const dragNewElement: (draggingElement: NonDeletedExcalidrawElement, elementType: AppState["activeTool"]["type"], originX: number, originY: number, x: number, y: number, width: number, height: number, shouldMaintainAspectRatio: boolean, shouldResizeFromCenter: boolean, widthAspectRatio?: number | null, originOffset?: {
    x: number;
    y: number;
} | null) => void;
