import { ExcalidrawElement, ExcalidrawFrameElement, NonDeleted, NonDeletedExcalidrawElement } from "./element/types";
import { AppClassProperties, AppState, StaticCanvasAppState } from "./types";
import { ExcalidrawElementsIncludingDeleted } from "./scene/Scene";
export declare const bindElementsToFramesAfterDuplication: (nextElements: ExcalidrawElement[], oldElements: readonly ExcalidrawElement[], oldIdToDuplicatedId: Map<ExcalidrawElement["id"], ExcalidrawElement["id"]>) => void;
export declare function isElementIntersectingFrame(element: ExcalidrawElement, frame: ExcalidrawFrameElement): boolean;
export declare const getElementsCompletelyInFrame: (elements: readonly ExcalidrawElement[], frame: ExcalidrawFrameElement) => ExcalidrawElement[];
export declare const isElementContainingFrame: (elements: readonly ExcalidrawElement[], element: ExcalidrawElement, frame: ExcalidrawFrameElement) => boolean;
export declare const getElementsIntersectingFrame: (elements: readonly ExcalidrawElement[], frame: ExcalidrawFrameElement) => ExcalidrawElement[];
export declare const elementsAreInFrameBounds: (elements: readonly ExcalidrawElement[], frame: ExcalidrawFrameElement) => boolean;
export declare const elementOverlapsWithFrame: (element: ExcalidrawElement, frame: ExcalidrawFrameElement) => boolean;
export declare const isCursorInFrame: (cursorCoords: {
    x: number;
    y: number;
}, frame: NonDeleted<ExcalidrawFrameElement>) => boolean;
export declare const groupsAreAtLeastIntersectingTheFrame: (elements: readonly NonDeletedExcalidrawElement[], groupIds: readonly string[], frame: ExcalidrawFrameElement) => boolean;
export declare const groupsAreCompletelyOutOfFrame: (elements: readonly NonDeletedExcalidrawElement[], groupIds: readonly string[], frame: ExcalidrawFrameElement) => boolean;
/**
 * Returns a map of frameId to frame elements. Includes empty frames.
 */
export declare const groupByFrames: (elements: readonly ExcalidrawElement[]) => Map<string, ExcalidrawElement[]>;
export declare const getFrameChildren: (allElements: ExcalidrawElementsIncludingDeleted, frameId: string) => ExcalidrawElement[];
export declare const getFrameElements: (allElements: ExcalidrawElementsIncludingDeleted) => ExcalidrawFrameElement[];
/**
 * Returns ExcalidrawFrameElements and non-frame-children elements.
 *
 * Considers children as root elements if they point to a frame parent
 * non-existing in the elements set.
 *
 * Considers non-frame bound elements (container or arrow labels) as root.
 */
export declare const getRootElements: (allElements: ExcalidrawElementsIncludingDeleted) => ExcalidrawElement[];
export declare const getElementsInResizingFrame: (allElements: ExcalidrawElementsIncludingDeleted, frame: ExcalidrawFrameElement, appState: AppState) => ExcalidrawElement[];
export declare const getElementsInNewFrame: (allElements: ExcalidrawElementsIncludingDeleted, frame: ExcalidrawFrameElement) => ExcalidrawElement[];
export declare const getContainingFrame: (element: ExcalidrawElement, elementsMap?: Map<string, ExcalidrawElement>) => ExcalidrawFrameElement | null;
/**
 * Retains (or repairs for target frame) the ordering invriant where children
 * elements come right before the parent frame:
 * [el, el, child, child, frame, el]
 */
export declare const addElementsToFrame: (allElements: ExcalidrawElementsIncludingDeleted, elementsToAdd: NonDeletedExcalidrawElement[], frame: ExcalidrawFrameElement) => ExcalidrawElement[];
export declare const removeElementsFromFrame: (allElements: ExcalidrawElementsIncludingDeleted, elementsToRemove: NonDeletedExcalidrawElement[], appState: AppState) => ExcalidrawElement[];
export declare const removeAllElementsFromFrame: (allElements: ExcalidrawElementsIncludingDeleted, frame: ExcalidrawFrameElement, appState: AppState) => ExcalidrawElement[];
export declare const replaceAllElementsInFrame: (allElements: ExcalidrawElementsIncludingDeleted, nextElementsInFrame: ExcalidrawElement[], frame: ExcalidrawFrameElement, appState: AppState) => ExcalidrawElement[];
/** does not mutate elements, but returns new ones */
export declare const updateFrameMembershipOfSelectedElements: (allElements: ExcalidrawElementsIncludingDeleted, appState: AppState, app: AppClassProperties) => ExcalidrawElementsIncludingDeleted;
/**
 * filters out elements that are inside groups that contain a frame element
 * anywhere in the group tree
 */
export declare const omitGroupsContainingFrames: (allElements: ExcalidrawElementsIncludingDeleted, selectedElements?: readonly ExcalidrawElement[]) => ExcalidrawElement[];
/**
 * depending on the appState, return target frame, which is the frame the given element
 * is going to be added to or remove from
 */
export declare const getTargetFrame: (element: ExcalidrawElement, appState: StaticCanvasAppState) => ExcalidrawFrameElement | null;
export declare const isElementInFrame: (element: ExcalidrawElement, allElements: ExcalidrawElementsIncludingDeleted, appState: StaticCanvasAppState) => boolean;
