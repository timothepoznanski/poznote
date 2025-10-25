import { AppState, ExcalidrawProps, UIAppState } from "../types";
import { NonDeletedExcalidrawElement } from "./types";
import { Bounds } from "./bounds";
import "./Hyperlink.scss";
export declare const EXTERNAL_LINK_IMG: HTMLImageElement;
export declare const Hyperlink: ({ element, setAppState, onLinkOpen, setToast, }: {
    element: NonDeletedExcalidrawElement;
    setAppState: React.Component<any, AppState>["setState"];
    onLinkOpen: ExcalidrawProps["onLinkOpen"];
    setToast: (toast: {
        message: string;
        closable?: boolean;
        duration?: number;
    } | null) => void;
}) => JSX.Element | null;
export declare const actionLink: {
    name: "hyperlink";
    perform: (elements: readonly import("./types").ExcalidrawElement[], appState: Readonly<AppState>) => false | {
        elements: readonly import("./types").ExcalidrawElement[];
        appState: {
            showHyperlinkPopup: "editor";
            openMenu: null;
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
            elementsToHighlight: import("./types").NonDeleted<import("./types").ExcalidrawElement>[] | null;
            editingElement: NonDeletedExcalidrawElement | null;
            editingLinearElement: import("./linearElementEditor").LinearElementEditor | null;
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
            theme: import("./types").Theme;
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
            selectedLinearElement: import("./linearElementEditor").LinearElementEditor | null;
            snapLines: readonly import("../snapping").SnapLine[];
            originSnapOffset: {
                x: number;
                y: number;
            } | null;
            objectsSnapModeEnabled: boolean;
        };
        commitToHistory: true;
    };
    trackEvent: {
        category: "hyperlink";
        action: string;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    contextItemLabel: (elements: readonly import("./types").ExcalidrawElement[], appState: Readonly<AppState>) => "labels.link.editEmbed" | "labels.link.edit" | "labels.link.createEmbed" | "labels.link.create";
    predicate: (elements: readonly import("./types").ExcalidrawElement[], appState: AppState) => boolean;
    PanelComponent: ({ elements, appState, updateData }: import("../actions/types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const getContextMenuLabel: (elements: readonly NonDeletedExcalidrawElement[], appState: AppState) => "labels.link.editEmbed" | "labels.link.edit" | "labels.link.createEmbed" | "labels.link.create";
export declare const getLinkHandleFromCoords: ([x1, y1, x2, y2]: Bounds, angle: number, appState: Pick<UIAppState, "zoom">) => Bounds;
export declare const isPointHittingLinkIcon: (element: NonDeletedExcalidrawElement, appState: AppState, [x, y]: readonly [number, number]) => boolean;
export declare const isPointHittingLink: (element: NonDeletedExcalidrawElement, appState: AppState, [x, y]: readonly [number, number], isMobile: boolean) => boolean;
export declare const showHyperlinkTooltip: (element: NonDeletedExcalidrawElement, appState: AppState) => void;
export declare const hideHyperlinkToolip: () => void;
export declare const shouldHideLinkPopup: (element: NonDeletedExcalidrawElement, appState: AppState, [clientX, clientY]: readonly [number, number]) => Boolean;
