import { ExcalidrawElement } from "../element/types";
import { AppState } from "../types";
import { LinearElementEditor } from "../element/linearElementEditor";
export declare const actionDeleteSelected: {
    name: "deleteSelectedElements";
    trackEvent: {
        category: "element";
        action: string;
    };
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>) => false | {
        elements: ExcalidrawElement[];
        appState: {
            editingLinearElement: null;
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
            elementsToHighlight: import("../element/types").NonDeleted<ExcalidrawElement>[] | null;
            editingElement: import("../element/types").NonDeletedExcalidrawElement | null;
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
            zenModeEnabled: boolean;
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
            selectedLinearElement: LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: false;
    } | {
        elements: readonly ExcalidrawElement[];
        appState: {
            editingLinearElement: {
                selectedPointsIndices: number[];
                startBindingElement: import("../element/types").ExcalidrawBindableElement | "keep" | null;
                endBindingElement: import("../element/types").ExcalidrawBindableElement | "keep" | null;
                elementId: string & {
                    _brand: "excalidrawLinearElementId";
                };
                pointerDownState: Readonly<{
                    prevSelectedPointsIndices: readonly number[] | null;
                    lastClickedPoint: number;
                    origin: Readonly<{
                        x: number;
                        y: number;
                    }> | null;
                    segmentMidpoint: {
                        value: readonly [number, number] | null;
                        index: number | null;
                        added: boolean;
                    };
                }>;
                isDragging: boolean;
                lastUncommittedPoint: readonly [number, number] | null;
                pointerOffset: Readonly<{
                    x: number;
                    y: number;
                }>;
                hoverPointIndex: number;
                segmentMidPointHoveredCoords: readonly [number, number] | null;
            };
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
            elementsToHighlight: import("../element/types").NonDeleted<ExcalidrawElement>[] | null;
            editingElement: import("../element/types").NonDeletedExcalidrawElement | null;
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
            zenModeEnabled: boolean;
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
            selectedLinearElement: LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: true;
    } | {
        elements: ExcalidrawElement[];
        appState: {
            activeTool: {
                lastActiveTool: import("../types").ActiveTool | null;
                locked: boolean;
            } & import("../types").ActiveTool;
            multiElement: null;
            activeEmbeddable: null;
            selectedElementIds: {};
            selectedGroupIds: {};
            contextMenu: {
                items: import("../components/ContextMenu").ContextMenuItems;
                top: number;
                left: number;
            } | null;
            showWelcomeScreen: boolean;
            isLoading: boolean;
            errorMessage: import("react").ReactNode;
            draggingElement: import("../element/types").NonDeletedExcalidrawElement | null;
            resizingElement: import("../element/types").NonDeletedExcalidrawElement | null;
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
            elementsToHighlight: import("../element/types").NonDeleted<ExcalidrawElement>[] | null;
            editingElement: import("../element/types").NonDeletedExcalidrawElement | null;
            editingLinearElement: LinearElementEditor | null;
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
            theme: import("../element/types").Theme;
            gridSize: number | null;
            viewModeEnabled: boolean;
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
            selectedLinearElement: LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: boolean;
    };
    contextItemLabel: string;
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent, appState: AppState, elements: readonly ExcalidrawElement[]) => boolean;
    PanelComponent: ({ elements, appState, updateData }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent, appState: AppState, elements: readonly ExcalidrawElement[]) => boolean) | undefined;
};
