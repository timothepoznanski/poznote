import { ExcalidrawElement, NonDeletedExcalidrawElement, PointerType } from "./types";
import { Bounds } from "./bounds";
import { InteractiveCanvasAppState, Zoom } from "../types";
export type TransformHandleDirection = "n" | "s" | "w" | "e" | "nw" | "ne" | "sw" | "se";
export type TransformHandleType = TransformHandleDirection | "rotation";
export type TransformHandle = Bounds;
export type TransformHandles = Partial<{
    [T in TransformHandleType]: TransformHandle;
}>;
export type MaybeTransformHandleType = TransformHandleType | false;
export declare const OMIT_SIDES_FOR_MULTIPLE_ELEMENTS: {
    e: boolean;
    s: boolean;
    n: boolean;
    w: boolean;
};
export declare const OMIT_SIDES_FOR_FRAME: {
    e: boolean;
    s: boolean;
    n: boolean;
    w: boolean;
    rotation: boolean;
};
export declare const getTransformHandlesFromCoords: ([x1, y1, x2, y2, cx, cy]: [number, number, number, number, number, number], angle: number, zoom: Zoom, pointerType: PointerType, omitSides?: {
    s?: boolean | undefined;
    e?: boolean | undefined;
    w?: boolean | undefined;
    n?: boolean | undefined;
    nw?: boolean | undefined;
    ne?: boolean | undefined;
    sw?: boolean | undefined;
    se?: boolean | undefined;
    rotation?: boolean | undefined;
}, margin?: number) => TransformHandles;
export declare const getTransformHandles: (element: ExcalidrawElement, zoom: Zoom, pointerType?: PointerType) => TransformHandles;
export declare const shouldShowBoundingBox: (elements: readonly NonDeletedExcalidrawElement[], appState: InteractiveCanvasAppState) => boolean;
