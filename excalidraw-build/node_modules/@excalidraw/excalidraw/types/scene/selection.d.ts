import { ExcalidrawElement, NonDeletedExcalidrawElement } from "../element/types";
import { AppState, InteractiveCanvasAppState } from "../types";
/**
 * Frames and their containing elements are not to be selected at the same time.
 * Given an array of selected elements, if there are frames and their containing elements
 * we only keep the frames.
 * @param selectedElements
 */
export declare const excludeElementsInFramesFromSelection: <T extends ExcalidrawElement>(selectedElements: readonly T[]) => T[];
export declare const getElementsWithinSelection: (elements: readonly NonDeletedExcalidrawElement[], selection: NonDeletedExcalidrawElement, excludeElementsInFrames?: boolean) => NonDeletedExcalidrawElement[];
export declare const getVisibleAndNonSelectedElements: (elements: readonly NonDeletedExcalidrawElement[], selectedElements: readonly NonDeletedExcalidrawElement[], appState: AppState) => NonDeletedExcalidrawElement[];
export declare const isSomeElementSelected: {
    (elements: readonly NonDeletedExcalidrawElement[], appState: Pick<AppState, "selectedElementIds">): boolean;
    clearCache(): void;
};
/**
 * Returns common attribute (picked by `getAttribute` callback) of selected
 *  elements. If elements don't share the same value, returns `null`.
 */
export declare const getCommonAttributeOfSelectedElements: <T>(elements: readonly NonDeletedExcalidrawElement[], appState: Pick<AppState, "selectedElementIds">, getAttribute: (element: ExcalidrawElement) => T) => T | null;
export declare const getSelectedElements: (elements: readonly NonDeletedExcalidrawElement[], appState: Pick<InteractiveCanvasAppState, "selectedElementIds">, opts?: {
    includeBoundTextElement?: boolean;
    includeElementsInFrames?: boolean;
}) => ExcalidrawElement[];
export declare const getTargetElements: (elements: readonly NonDeletedExcalidrawElement[], appState: Pick<AppState, "selectedElementIds" | "editingElement">) => ExcalidrawElement[];
/**
 * returns prevState's selectedElementids if no change from previous, so as to
 * retain reference identity for memoization
 */
export declare const makeNextSelectedElementIds: (nextSelectedElementIds: AppState["selectedElementIds"], prevState: Pick<AppState, "selectedElementIds">) => Readonly<{
    [id: string]: true;
}>;
