import type { ExcalidrawElement, NonDeletedExcalidrawElement } from "../element/types";
import { Bounds } from "../element/bounds";
type Element = NonDeletedExcalidrawElement;
type Elements = readonly NonDeletedExcalidrawElement[];
export declare const isElementInsideBBox: (element: Element, bbox: Bounds, eitherDirection?: boolean) => boolean;
export declare const elementPartiallyOverlapsWithOrContainsBBox: (element: Element, bbox: Bounds) => boolean;
export declare const elementsOverlappingBBox: ({ elements, bounds, type, errorMargin, }: {
    elements: Elements;
    bounds: Bounds | ExcalidrawElement;
    /** safety offset. Defaults to 0. */
    errorMargin?: number | undefined;
    /**
     * - overlap: elements overlapping or inside bounds
     * - contain: elements inside bounds or bounds inside elements
     * - inside: elements inside bounds
     **/
    type: "overlap" | "contain" | "inside";
}) => NonDeletedExcalidrawElement[];
export {};
