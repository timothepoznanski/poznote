import { Bounds } from "./element/bounds";
import { MaybeTransformHandleType } from "./element/transformHandles";
import { ExcalidrawElement, NonDeletedExcalidrawElement } from "./element/types";
import { AppState, KeyboardModifiersObject, Point } from "./types";
export declare const getSnapDistance: (zoomValue: number) => number;
type Vector2D = {
    x: number;
    y: number;
};
type PointPair = [Point, Point];
export type PointSnap = {
    type: "point";
    points: PointPair;
    offset: number;
};
export type Gap = {
    startBounds: Bounds;
    endBounds: Bounds;
    startSide: [Point, Point];
    endSide: [Point, Point];
    overlap: [number, number];
    length: number;
};
export type GapSnap = {
    type: "gap";
    direction: "center_horizontal" | "center_vertical" | "side_left" | "side_right" | "side_top" | "side_bottom";
    gap: Gap;
    offset: number;
};
export type GapSnaps = GapSnap[];
export type Snap = GapSnap | PointSnap;
export type Snaps = Snap[];
export type PointSnapLine = {
    type: "points";
    points: Point[];
};
export type PointerSnapLine = {
    type: "pointer";
    points: PointPair;
    direction: "horizontal" | "vertical";
};
export type GapSnapLine = {
    type: "gap";
    direction: "horizontal" | "vertical";
    points: PointPair;
};
export type SnapLine = PointSnapLine | GapSnapLine | PointerSnapLine;
export declare class SnapCache {
    private static referenceSnapPoints;
    private static visibleGaps;
    static setReferenceSnapPoints: (snapPoints: Point[] | null) => void;
    static getReferenceSnapPoints: () => (readonly [number, number])[] | null;
    static setVisibleGaps: (gaps: {
        verticalGaps: Gap[];
        horizontalGaps: Gap[];
    } | null) => void;
    static getVisibleGaps: () => {
        verticalGaps: Gap[];
        horizontalGaps: Gap[];
    } | null;
    static destroy: () => void;
}
export declare const isSnappingEnabled: ({ event, appState, selectedElements, }: {
    appState: AppState;
    event: KeyboardModifiersObject;
    selectedElements: NonDeletedExcalidrawElement[];
}) => boolean;
export declare const areRoughlyEqual: (a: number, b: number, precision?: number) => boolean;
export declare const getElementsCorners: (elements: ExcalidrawElement[], { omitCenter, boundingBoxCorners, dragOffset, }?: {
    omitCenter?: boolean | undefined;
    boundingBoxCorners?: boolean | undefined;
    dragOffset?: Vector2D | undefined;
}) => Point[];
export declare const getVisibleGaps: (elements: readonly NonDeletedExcalidrawElement[], selectedElements: ExcalidrawElement[], appState: AppState) => {
    horizontalGaps: Gap[];
    verticalGaps: Gap[];
};
export declare const getReferenceSnapPoints: (elements: readonly NonDeletedExcalidrawElement[], selectedElements: ExcalidrawElement[], appState: AppState) => (readonly [number, number])[];
export declare const snapDraggedElements: (selectedElements: ExcalidrawElement[], dragOffset: Vector2D, appState: AppState, event: KeyboardModifiersObject) => {
    snapOffset: {
        x: number;
        y: number;
    };
    snapLines: (PointSnapLine | GapSnapLine)[];
};
export declare const snapResizingElements: (selectedElements: ExcalidrawElement[], selectedOriginalElements: ExcalidrawElement[], appState: AppState, event: KeyboardModifiersObject, dragOffset: Vector2D, transformHandle: MaybeTransformHandleType) => {
    snapOffset: {
        x: number;
        y: number;
    };
    snapLines: PointSnapLine[];
};
export declare const snapNewElement: (draggingElement: ExcalidrawElement, appState: AppState, event: KeyboardModifiersObject, origin: Vector2D, dragOffset: Vector2D) => {
    snapOffset: {
        x: number;
        y: number;
    };
    snapLines: PointSnapLine[];
};
export declare const getSnapLinesAtPointer: (elements: readonly ExcalidrawElement[], appState: AppState, pointer: Vector2D, event: KeyboardModifiersObject) => {
    originOffset: {
        x: number;
        y: number;
    };
    snapLines: PointerSnapLine[];
};
export declare const isActiveToolNonLinearSnappable: (activeToolType: AppState["activeTool"]["type"]) => boolean;
export {};
