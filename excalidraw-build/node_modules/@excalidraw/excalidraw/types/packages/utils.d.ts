import { AppState, BinaryFiles } from "../types";
import { ExcalidrawElement, ExcalidrawFrameElement, NonDeleted } from "../element/types";
import { MIME_TYPES } from "../constants";
export { MIME_TYPES };
type ExportOpts = {
    elements: readonly NonDeleted<ExcalidrawElement>[];
    appState?: Partial<Omit<AppState, "offsetTop" | "offsetLeft">>;
    files: BinaryFiles | null;
    maxWidthOrHeight?: number;
    exportingFrame?: ExcalidrawFrameElement | null;
    getDimensions?: (width: number, height: number) => {
        width: number;
        height: number;
        scale?: number;
    };
};
export declare const exportToCanvas: ({ elements, appState, files, maxWidthOrHeight, getDimensions, exportPadding, exportingFrame, }: ExportOpts & {
    exportPadding?: number | undefined;
}) => Promise<HTMLCanvasElement>;
export declare const exportToBlob: (opts: ExportOpts & {
    mimeType?: string;
    quality?: number;
    exportPadding?: number;
}) => Promise<Blob>;
export declare const exportToSvg: ({ elements, appState, files, exportPadding, renderEmbeddables, exportingFrame, }: Omit<ExportOpts, "getDimensions"> & {
    exportPadding?: number | undefined;
    renderEmbeddables?: boolean | undefined;
}) => Promise<SVGSVGElement>;
export declare const exportToClipboard: (opts: ExportOpts & {
    mimeType?: string;
    quality?: number;
    type: "png" | "svg" | "json";
}) => Promise<void>;
export * from "./bbox";
export { elementsOverlappingBBox, isElementInsideBBox, elementPartiallyOverlapsWithOrContainsBBox, } from "./withinBounds";
export { serializeAsJSON, serializeLibraryAsJSON } from "../data/json";
export { loadFromBlob, loadSceneOrLibraryFromBlob, loadLibraryFromBlob, } from "../data/blob";
export { getFreeDrawSvgPath } from "../renderer/renderElement";
export { mergeLibraryItems } from "../data/library";
