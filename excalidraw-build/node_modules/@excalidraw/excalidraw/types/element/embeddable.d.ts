import { ExcalidrawProps } from "../types";
import { ExcalidrawElement, ExcalidrawEmbeddableElement, NonDeletedExcalidrawElement, Theme } from "./types";
type EmbeddedLink = ({
    aspectRatio: {
        w: number;
        h: number;
    };
    warning?: string;
    sandbox: {
        allowSameOrigin?: boolean;
    };
} & ({
    type: "video" | "generic";
    link: string;
} | {
    type: "document";
    srcdoc: (theme: Theme) => string;
})) | null;
export declare const getEmbedLink: (link: string | null | undefined) => EmbeddedLink;
export declare const isEmbeddableOrLabel: (element: NonDeletedExcalidrawElement) => Boolean;
export declare const createPlaceholderEmbeddableLabel: (element: ExcalidrawEmbeddableElement) => ExcalidrawElement;
export declare const actionSetEmbeddableAsActiveTool: {
    name: "setEmbeddableAsActiveTool";
    trackEvent: {
        category: "toolbar";
    };
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<import("../types").AppState>, _: any, app: import("../types").AppClassProperties) => {
        elements: readonly ExcalidrawElement[];
        appState: {
            activeTool: {
                lastActiveTool: import("../types").ActiveTool | null;
                locked: boolean;
            } & import("../types").ActiveTool;
            contextMenu: {
                items: import("../components/ContextMenu").ContextMenuItems;
                top: number;
                left: number;
            } | null;
            showWelcomeScreen: boolean;
            isLoading: boolean;
            errorMessage: import("react").ReactNode;
            activeEmbeddable: {
                element: NonDeletedExcalidrawElement;
                state: "active" | "hover";
            } | null;
            draggingElement: NonDeletedExcalidrawElement | null;
            resizingElement: NonDeletedExcalidrawElement | null;
            multiElement: import("./types").NonDeleted<import("./types").ExcalidrawLinearElement> | null;
            selectionElement: NonDeletedExcalidrawElement | null;
            isBindingEnabled: boolean;
            startBoundElement: import("./types").NonDeleted<import("./types").ExcalidrawBindableElement> | null;
            suggestedBindings: import("./binding").SuggestedBinding[];
            frameToHighlight: import("./types").NonDeleted<import("./types").ExcalidrawFrameElement> | null;
            frameRendering: {
                enabled: boolean;
                name: boolean;
                outline: boolean;
                clip: boolean;
            };
            editingFrame: string | null;
            elementsToHighlight: import("./types").NonDeleted<ExcalidrawElement>[] | null;
            editingElement: NonDeletedExcalidrawElement | null;
            editingLinearElement: import("./linearElementEditor").LinearElementEditor | null;
            penMode: boolean;
            penDetected: boolean;
            exportBackground: boolean;
            exportEmbedScene: boolean;
            exportWithDarkMode: boolean;
            exportScale: number;
            currentItemStrokeColor: string;
            currentItemBackgroundColor: string;
            currentItemFillStyle: import("./types").FillStyle;
            currentItemStrokeWidth: number;
            currentItemStrokeStyle: import("./types").StrokeStyle;
            currentItemRoughness: number;
            currentItemOpacity: number;
            currentItemFontFamily: number;
            currentItemFontSize: number;
            currentItemTextAlign: string;
            currentItemStartArrowhead: import("./types").Arrowhead | null;
            currentItemEndArrowhead: import("./types").Arrowhead | null;
            currentItemRoundness: import("./types").StrokeRoundness;
            viewBackgroundColor: string;
            scrollX: number;
            scrollY: number;
            cursorButton: "up" | "down";
            scrolledOutside: boolean;
            name: string;
            isResizing: boolean;
            isRotating: boolean;
            zoom: Readonly<{
                value: import("../types").NormalizedZoomValue;
            }>;
            openMenu: "canvas" | "shape" | null;
            openPopup: "canvasBackground" | "elementBackground" | "elementStroke" | null;
            openSidebar: {
                name: string;
                tab?: string | undefined;
            } | null;
            openDialog: "mermaid" | "imageExport" | "help" | "jsonExport" | null;
            defaultSidebarDockedPreference: boolean;
            lastPointerDownWith: import("./types").PointerType;
            selectedElementIds: Readonly<{
                [id: string]: true;
            }>;
            previousSelectedElementIds: {
                [id: string]: true;
            };
            selectedElementsAreBeingDragged: boolean;
            shouldCacheIgnoreZoom: boolean;
            toast: {
                message: string;
                closable?: boolean | undefined;
                duration?: number | undefined;
            } | null;
            zenModeEnabled: boolean;
            theme: Theme;
            gridSize: number | null;
            viewModeEnabled: boolean;
            selectedGroupIds: {
                [groupId: string]: boolean;
            };
            editingGroupId: string | null;
            width: number;
            height: number;
            offsetTop: number;
            offsetLeft: number;
            fileHandle: import("browser-fs-access").FileSystemHandle | null;
            collaborators: Map<string, import("../types").Collaborator>;
            showStats: boolean;
            currentChartType: import("./types").ChartType;
            pasteDialog: {
                shown: false;
                data: null;
            } | {
                shown: true;
                data: import("../charts").Spreadsheet;
            };
            pendingImageElementId: string | null;
            showHyperlinkPopup: false | "editor" | "info";
            selectedLinearElement: import("./linearElementEditor").LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: false;
    };
} & {
    keyTest?: undefined;
};
export declare const extractSrc: (htmlString: string) => string;
export declare const embeddableURLValidator: (url: string | null | undefined, validateEmbeddable: ExcalidrawProps["validateEmbeddable"]) => boolean;
export {};
