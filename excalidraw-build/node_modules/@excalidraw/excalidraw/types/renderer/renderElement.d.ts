import { ExcalidrawElement, ExcalidrawTextElement, NonDeletedExcalidrawElement, ExcalidrawFreeDrawElement } from "../element/types";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { RoughSVG } from "roughjs/bin/svg";
import { StaticCanvasRenderConfig } from "../scene/types";
import { AppState, StaticCanvasAppState, BinaryFiles, InteractiveCanvasAppState } from "../types";
export interface ExcalidrawElementWithCanvas {
    element: ExcalidrawElement | ExcalidrawTextElement;
    canvas: HTMLCanvasElement;
    theme: AppState["theme"];
    scale: number;
    zoomValue: AppState["zoom"]["value"];
    canvasOffsetX: number;
    canvasOffsetY: number;
    boundTextElementVersion: number | null;
    containingFrameOpacity: number;
}
export declare const DEFAULT_LINK_SIZE = 14;
export declare const elementWithCanvasCache: WeakMap<ExcalidrawElement, ExcalidrawElementWithCanvas>;
export declare const renderSelectionElement: (element: NonDeletedExcalidrawElement, context: CanvasRenderingContext2D, appState: InteractiveCanvasAppState) => void;
export declare const renderElement: (element: NonDeletedExcalidrawElement, rc: RoughCanvas, context: CanvasRenderingContext2D, renderConfig: StaticCanvasRenderConfig, appState: StaticCanvasAppState) => void;
export declare const renderElementToSvg: (element: NonDeletedExcalidrawElement, rsvg: RoughSVG, svgRoot: SVGElement, files: BinaryFiles, offsetX: number, offsetY: number, renderConfig: {
    exportWithDarkMode: boolean;
    renderEmbeddables: boolean;
    frameRendering: AppState["frameRendering"];
}) => void;
export declare const pathsCache: WeakMap<ExcalidrawFreeDrawElement, Path2D>;
export declare function generateFreeDrawShape(element: ExcalidrawFreeDrawElement): Path2D;
export declare function getFreeDrawPath2D(element: ExcalidrawFreeDrawElement): Path2D | undefined;
export declare function getFreeDrawSvgPath(element: ExcalidrawFreeDrawElement): string;
