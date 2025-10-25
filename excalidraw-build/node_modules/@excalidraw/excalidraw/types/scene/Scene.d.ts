import { ExcalidrawElement, NonDeletedExcalidrawElement, NonDeleted, ExcalidrawFrameElement } from "../element/types";
import { LinearElementEditor } from "../element/linearElementEditor";
import { AppState } from "../types";
type ElementIdKey = InstanceType<typeof LinearElementEditor>["elementId"];
type ElementKey = ExcalidrawElement | ElementIdKey;
type SceneStateCallback = () => void;
type SceneStateCallbackRemover = () => void;
export type ExcalidrawElementsIncludingDeleted = readonly ExcalidrawElement[];
declare class Scene {
    private static sceneMapByElement;
    private static sceneMapById;
    static mapElementToScene(elementKey: ElementKey, scene: Scene, 
    /**
     * needed because of frame exporting hack.
     * elementId:Scene mapping will be removed completely, soon.
     */
    mapElementIds?: boolean): void;
    static getScene(elementKey: ElementKey): Scene | null;
    private callbacks;
    private nonDeletedElements;
    private elements;
    private nonDeletedFrames;
    private frames;
    private elementsMap;
    private selectedElementsCache;
    private versionNonce;
    getElementsIncludingDeleted(): readonly ExcalidrawElement[];
    getNonDeletedElements(): readonly NonDeletedExcalidrawElement[];
    getFramesIncludingDeleted(): readonly ExcalidrawFrameElement[];
    getSelectedElements(opts: {
        selectedElementIds: AppState["selectedElementIds"];
        /**
         * for specific cases where you need to use elements not from current
         * scene state. This in effect will likely result in cache-miss, and
         * the cache won't be updated in this case.
         */
        elements?: readonly ExcalidrawElement[];
        includeBoundTextElement?: boolean;
        includeElementsInFrames?: boolean;
    }): NonDeleted<ExcalidrawElement>[];
    getNonDeletedFrames(): readonly NonDeleted<ExcalidrawFrameElement>[];
    getElement<T extends ExcalidrawElement>(id: T["id"]): T | null;
    getVersionNonce(): number | undefined;
    getNonDeletedElement(id: ExcalidrawElement["id"]): NonDeleted<ExcalidrawElement> | null;
    /**
     * A utility method to help with updating all scene elements, with the added
     * performance optimization of not renewing the array if no change is made.
     *
     * Maps all current excalidraw elements, invoking the callback for each
     * element. The callback should either return a new mapped element, or the
     * original element if no changes are made. If no changes are made to any
     * element, this results in a no-op. Otherwise, the newly mapped elements
     * are set as the next scene's elements.
     *
     * @returns whether a change was made
     */
    mapElements(iteratee: (element: ExcalidrawElement) => ExcalidrawElement): boolean;
    replaceAllElements(nextElements: readonly ExcalidrawElement[], mapElementIds?: boolean): void;
    informMutation(): void;
    addCallback(cb: SceneStateCallback): SceneStateCallbackRemover;
    destroy(): void;
    insertElementAtIndex(element: ExcalidrawElement, index: number): void;
    insertElementsAtIndex(elements: ExcalidrawElement[], index: number): void;
    addNewElement: (element: ExcalidrawElement) => void;
    getElementIndex(elementId: string): number;
}
export default Scene;
