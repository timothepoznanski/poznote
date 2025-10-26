import { AppState } from "./types";
export declare const resetCursor: (interactiveCanvas: HTMLCanvasElement | null) => void;
export declare const setCursor: (interactiveCanvas: HTMLCanvasElement | null, cursor: string) => void;
export declare const setEraserCursor: (interactiveCanvas: HTMLCanvasElement | null, theme: AppState["theme"]) => void;
export declare const setCursorForShape: (interactiveCanvas: HTMLCanvasElement | null, appState: Pick<AppState, "activeTool" | "theme">) => void;
