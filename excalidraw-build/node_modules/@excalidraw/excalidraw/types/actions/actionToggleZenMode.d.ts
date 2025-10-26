export declare const actionToggleZenMode: {
    name: "zenMode";
    viewMode: true;
    trackEvent: {
        category: "canvas";
        predicate: (appState: Readonly<import("../types").AppState>) => boolean;
    };
    perform(elements: readonly import("../element/types").ExcalidrawElement[], appState: Readonly<import("../types").AppState>): {
        appState: {
            zenModeEnabled: boolean;
            contextMenu: {
                items: import("../components/ContextMenu").ContextMenuItems;
                top: number;
                left: number;
            } | null;
            showWelcomeScreen: boolean;
            isLoading: boolean;
            errorMessage: import("react").ReactNode;
            activeEmbeddable: {
                element: import("../element/types").NonDeletedExcalidrawElement;
                state: "active" | "hover";
            } | null;
            draggingElement: import("../element/types").NonDeletedExcalidrawElement | null;
            resizingElement: import("../element/types").NonDeletedExcalidrawElement | null;
            multiElement: import("../element/types").NonDeleted<import("../element/types").ExcalidrawLinearElement> | null;
            selectionElement: import("../element/types").NonDeletedExcalidrawElement | null;
            isBindingEnabled: boolean;
            startBoundElement: import("../element/types").NonDeleted<import("../element/types").ExcalidrawBindableElement> | null;
            suggestedBindings: import("../element/binding").SuggestedBinding[];
            frameToHighlight: import("../element/types").NonDeleted<import("../element/types").ExcalidrawFrameElement> | null;
            frameRendering: {
                enabled: boolean;
                name: boolean;
                outline: boolean;
                clip: boolean;
            };
            editingFrame: string | null;
            elementsToHighlight: import("../element/types").NonDeleted<import("../element/types").ExcalidrawElement>[] | null;
            editingElement: import("../element/types").NonDeletedExcalidrawElement | null;
            editingLinearElement: import("../element/linearElementEditor").LinearElementEditor | null;
            activeTool: {
                lastActiveTool: import("../types").ActiveTool | null;
                locked: boolean;
            } & import("../types").ActiveTool;
            penMode: boolean;
            penDetected: boolean;
            exportBackground: boolean;
            exportEmbedScene: boolean;
            exportWithDarkMode: boolean;
            exportScale: number;
            currentItemStrokeColor: string;
            currentItemBackgroundColor: string;
            currentItemFillStyle: import("../element/types").FillStyle;
            currentItemStrokeWidth: number;
            currentItemStrokeStyle: import("../element/types").StrokeStyle;
            currentItemRoughness: number;
            currentItemOpacity: number;
            currentItemFontFamily: number;
            currentItemFontSize: number;
            currentItemTextAlign: string;
            currentItemStartArrowhead: import("../element/types").Arrowhead | null;
            currentItemEndArrowhead: import("../element/types").Arrowhead | null;
            currentItemRoundness: import("../element/types").StrokeRoundness;
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
            lastPointerDownWith: import("../element/types").PointerType;
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
            theme: import("../element/types").Theme;
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
            currentChartType: import("../element/types").ChartType;
            pasteDialog: {
                shown: false;
                data: null;
            } | {
                shown: true;
                data: import("../charts").Spreadsheet;
            };
            pendingImageElementId: string | null;
            showHyperlinkPopup: false | "editor" | "info";
            selectedLinearElement: import("../element/linearElementEditor").LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: false;
    };
    checked: (appState: Readonly<import("../types").AppState>) => boolean;
    predicate: (elements: readonly import("../element/types").ExcalidrawElement[], appState: import("../types").AppState, appProps: import("../types").ExcalidrawProps) => boolean;
    contextItemLabel: string;
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
