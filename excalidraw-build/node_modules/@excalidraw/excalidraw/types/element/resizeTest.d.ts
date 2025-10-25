import { ExcalidrawElement, PointerType, NonDeletedExcalidrawElement } from "./types";
import { MaybeTransformHandleType } from "./transformHandles";
import { AppState, Zoom } from "../types";
import { Bounds } from "./bounds";
export declare const resizeTest: (element: NonDeletedExcalidrawElement, appState: AppState, x: number, y: number, zoom: Zoom, pointerType: PointerType) => MaybeTransformHandleType;
export declare const getElementWithTransformHandleType: (elements: readonly NonDeletedExcalidrawElement[], appState: AppState, scenePointerX: number, scenePointerY: number, zoom: Zoom, pointerType: PointerType) => {
    element: NonDeletedExcalidrawElement;
    transformHandleType: MaybeTransformHandleType;
} | null;
export declare const getTransformHandleTypeFromCoords: ([x1, y1, x2, y2]: Bounds, scenePointerX: number, scenePointerY: number, zoom: Zoom, pointerType: PointerType) => MaybeTransformHandleType;
export declare const getCursorForResizingElement: (resizingElement: {
    element?: ExcalidrawElement;
    transformHandleType: MaybeTransformHandleType;
}) => string;
