type CANVAS_ERROR_NAMES = "CANVAS_ERROR" | "CANVAS_POSSIBLY_TOO_BIG";
export declare class CanvasError extends Error {
    constructor(message?: string, name?: CANVAS_ERROR_NAMES);
}
export declare class AbortError extends DOMException {
    constructor(message?: string);
}
type ImageSceneDataErrorCode = "IMAGE_NOT_CONTAINS_SCENE_DATA" | "IMAGE_SCENE_DATA_ERROR";
export declare class ImageSceneDataError extends Error {
    code: ImageSceneDataErrorCode;
    constructor(message?: string, code?: ImageSceneDataErrorCode);
}
export {};
