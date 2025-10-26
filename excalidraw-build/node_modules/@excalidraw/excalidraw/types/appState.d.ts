import { AppState, NormalizedZoomValue } from "./types";
export declare const getDefaultAppState: () => Omit<AppState, "offsetTop" | "offsetLeft" | "width" | "height">;
export declare const clearAppStateForLocalStorage: (appState: Partial<AppState>) => {
    activeTool?: ({
        lastActiveTool: import("./types").ActiveTool | null;
        locked: boolean;
    } & import("./types").ActiveTool) | undefined;
    showWelcomeScreen?: boolean | undefined;
    penMode?: boolean | undefined;
    penDetected?: boolean | undefined;
    exportBackground?: boolean | undefined;
    exportEmbedScene?: boolean | undefined;
    exportWithDarkMode?: boolean | undefined;
    exportScale?: number | undefined;
    currentItemStrokeColor?: string | undefined;
    currentItemBackgroundColor?: string | undefined;
    currentItemFillStyle?: import("./element/types").FillStyle | undefined;
    currentItemStrokeWidth?: number | undefined;
    currentItemStrokeStyle?: import("./element/types").StrokeStyle | undefined;
    currentItemRoughness?: number | undefined;
    currentItemOpacity?: number | undefined;
    currentItemFontFamily?: number | undefined;
    currentItemFontSize?: number | undefined;
    currentItemTextAlign?: string | undefined;
    currentItemStartArrowhead?: import("./element/types").Arrowhead | null | undefined;
    currentItemEndArrowhead?: import("./element/types").Arrowhead | null | undefined;
    currentItemRoundness?: import("./element/types").StrokeRoundness | undefined;
    viewBackgroundColor?: string | undefined;
    scrollX?: number | undefined;
    scrollY?: number | undefined;
    cursorButton?: "up" | "down" | undefined;
    scrolledOutside?: boolean | undefined;
    name?: string | undefined;
    zoom?: Readonly<{
        value: NormalizedZoomValue;
    }> | undefined;
    openMenu?: "canvas" | "shape" | null | undefined;
    openSidebar?: {
        name: string;
        tab?: string | undefined;
    } | null | undefined;
    defaultSidebarDockedPreference?: boolean | undefined;
    lastPointerDownWith?: import("./element/types").PointerType | undefined;
    selectedElementIds?: Readonly<{
        [id: string]: true;
    }> | undefined;
    previousSelectedElementIds?: {
        [id: string]: true;
    } | undefined;
    shouldCacheIgnoreZoom?: boolean | undefined;
    zenModeEnabled?: boolean | undefined;
    theme?: import("./element/types").Theme | undefined;
    gridSize?: number | null | undefined;
    selectedGroupIds?: {
        [groupId: string]: boolean;
    } | undefined;
    editingGroupId?: string | null | undefined;
    showStats?: boolean | undefined;
    currentChartType?: import("./element/types").ChartType | undefined;
    selectedLinearElement?: import("./element/linearElementEditor").LinearElementEditor | null | undefined;
    objectsSnapModeEnabled?: boolean | undefined;
};
export declare const cleanAppStateForExport: (appState: Partial<AppState>) => {
    viewBackgroundColor?: string | undefined;
    gridSize?: number | null | undefined;
};
export declare const clearAppStateForDatabase: (appState: Partial<AppState>) => {
    viewBackgroundColor?: string | undefined;
    gridSize?: number | null | undefined;
};
export declare const isEraserActive: ({ activeTool, }: {
    activeTool: AppState["activeTool"];
}) => boolean;
export declare const isHandToolActive: ({ activeTool, }: {
    activeTool: AppState["activeTool"];
}) => boolean;
