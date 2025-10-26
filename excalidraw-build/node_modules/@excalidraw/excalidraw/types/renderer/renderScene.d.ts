import { RoughSVG } from "roughjs/bin/svg";
import { BinaryFiles, AppState } from "../types";
import { NonDeletedExcalidrawElement } from "../element/types";
import { InteractiveSceneRenderConfig, StaticSceneRenderConfig } from "../scene/types";
import "canvas-roundrect-polyfill";
export declare const DEFAULT_SPACING = 2;
/**
 * Interactive scene is the ui-canvas where we render boundinb boxes, selections
 * and other ui stuff.
 */
export declare const renderInteractiveScene: <U extends ({ canvas, elements, visibleElements, selectedElements, scale, appState, renderConfig, }: InteractiveSceneRenderConfig) => {
    atLeastOneVisibleElement: boolean;
    elements: readonly NonDeletedExcalidrawElement[];
    scrollBars?: undefined;
} | {
    scrollBars: import("../scene/types").ScrollBars | undefined;
    atLeastOneVisibleElement: boolean;
    elements: readonly NonDeletedExcalidrawElement[];
}, T extends boolean = false>(renderConfig: InteractiveSceneRenderConfig, throttle?: T | undefined) => T extends true ? void : ReturnType<U>;
/**
 * Static scene is the non-ui canvas where we render elements.
 */
export declare const renderStaticScene: (renderConfig: StaticSceneRenderConfig, throttle?: boolean) => void;
export declare const cancelRender: () => void;
export declare const renderSceneToSvg: (elements: readonly NonDeletedExcalidrawElement[], rsvg: RoughSVG, svgRoot: SVGElement, files: BinaryFiles, { offsetX, offsetY, exportWithDarkMode, renderEmbeddables, frameRendering, }: {
    offsetX?: number | undefined;
    offsetY?: number | undefined;
    exportWithDarkMode: boolean;
    renderEmbeddables: boolean;
    frameRendering: AppState["frameRendering"];
}) => void;
