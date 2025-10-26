import React from "react";
import { PointerType, ExcalidrawLinearElement, NonDeletedExcalidrawElement, NonDeleted, TextAlign, ExcalidrawElement, GroupId, ExcalidrawBindableElement, Arrowhead, ChartType, FontFamilyValues, FileId, ExcalidrawImageElement, Theme, StrokeRoundness, ExcalidrawFrameElement, ExcalidrawEmbeddableElement } from "./element/types";
import { Point as RoughPoint } from "roughjs/bin/geometry";
import { LinearElementEditor } from "./element/linearElementEditor";
import { SuggestedBinding } from "./element/binding";
import { ImportedDataState } from "./data/types";
import type App from "./components/App";
import type { throttleRAF } from "./utils";
import { Spreadsheet } from "./charts";
import { Language } from "./i18n";
import { ClipboardData } from "./clipboard";
import { isOverScrollBars } from "./scene";
import { MaybeTransformHandleType } from "./element/transformHandles";
import Library from "./data/library";
import type { FileSystemHandle } from "./data/filesystem";
import type { IMAGE_MIME_TYPES, MIME_TYPES } from "./constants";
import { ContextMenuItems } from "./components/ContextMenu";
import { SnapLine } from "./snapping";
import { Merge, ValueOf } from "./utility-types";
export type Point = Readonly<RoughPoint>;
export type Collaborator = {
    pointer?: CollaboratorPointer;
    button?: "up" | "down";
    selectedElementIds?: AppState["selectedElementIds"];
    username?: string | null;
    userState?: UserIdleState;
    color?: {
        background: string;
        stroke: string;
    };
    avatarUrl?: string;
    id?: string;
};
export type CollaboratorPointer = {
    x: number;
    y: number;
    tool: "pointer" | "laser";
};
export type DataURL = string & {
    _brand: "DataURL";
};
export type BinaryFileData = {
    mimeType: ValueOf<typeof IMAGE_MIME_TYPES> | typeof MIME_TYPES.binary;
    id: FileId;
    dataURL: DataURL;
    /**
     * Epoch timestamp in milliseconds
     */
    created: number;
    /**
     * Indicates when the file was last retrieved from storage to be loaded
     * onto the scene. We use this flag to determine whether to delete unused
     * files from storage.
     *
     * Epoch timestamp in milliseconds.
     */
    lastRetrieved?: number;
};
export type BinaryFileMetadata = Omit<BinaryFileData, "dataURL">;
export type BinaryFiles = Record<ExcalidrawElement["id"], BinaryFileData>;
export type ToolType = "selection" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text" | "image" | "eraser" | "hand" | "frame" | "embeddable" | "laser";
export type ActiveTool = {
    type: ToolType;
    customType: null;
} | {
    type: "custom";
    customType: string;
};
export type SidebarName = string;
export type SidebarTabName = string;
type _CommonCanvasAppState = {
    zoom: AppState["zoom"];
    scrollX: AppState["scrollX"];
    scrollY: AppState["scrollY"];
    width: AppState["width"];
    height: AppState["height"];
    viewModeEnabled: AppState["viewModeEnabled"];
    editingGroupId: AppState["editingGroupId"];
    selectedElementIds: AppState["selectedElementIds"];
    frameToHighlight: AppState["frameToHighlight"];
    offsetLeft: AppState["offsetLeft"];
    offsetTop: AppState["offsetTop"];
    theme: AppState["theme"];
    pendingImageElementId: AppState["pendingImageElementId"];
};
export type StaticCanvasAppState = Readonly<_CommonCanvasAppState & {
    shouldCacheIgnoreZoom: AppState["shouldCacheIgnoreZoom"];
    /** null indicates transparent bg */
    viewBackgroundColor: AppState["viewBackgroundColor"] | null;
    exportScale: AppState["exportScale"];
    selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
    gridSize: AppState["gridSize"];
    frameRendering: AppState["frameRendering"];
}>;
export type InteractiveCanvasAppState = Readonly<_CommonCanvasAppState & {
    activeEmbeddable: AppState["activeEmbeddable"];
    editingLinearElement: AppState["editingLinearElement"];
    selectionElement: AppState["selectionElement"];
    selectedGroupIds: AppState["selectedGroupIds"];
    selectedLinearElement: AppState["selectedLinearElement"];
    multiElement: AppState["multiElement"];
    isBindingEnabled: AppState["isBindingEnabled"];
    suggestedBindings: AppState["suggestedBindings"];
    isRotating: AppState["isRotating"];
    elementsToHighlight: AppState["elementsToHighlight"];
    openSidebar: AppState["openSidebar"];
    showHyperlinkPopup: AppState["showHyperlinkPopup"];
    collaborators: AppState["collaborators"];
    snapLines: AppState["snapLines"];
    zenModeEnabled: AppState["zenModeEnabled"];
}>;
export type AppState = {
    contextMenu: {
        items: ContextMenuItems;
        top: number;
        left: number;
    } | null;
    showWelcomeScreen: boolean;
    isLoading: boolean;
    errorMessage: React.ReactNode;
    activeEmbeddable: {
        element: NonDeletedExcalidrawElement;
        state: "hover" | "active";
    } | null;
    draggingElement: NonDeletedExcalidrawElement | null;
    resizingElement: NonDeletedExcalidrawElement | null;
    multiElement: NonDeleted<ExcalidrawLinearElement> | null;
    selectionElement: NonDeletedExcalidrawElement | null;
    isBindingEnabled: boolean;
    startBoundElement: NonDeleted<ExcalidrawBindableElement> | null;
    suggestedBindings: SuggestedBinding[];
    frameToHighlight: NonDeleted<ExcalidrawFrameElement> | null;
    frameRendering: {
        enabled: boolean;
        name: boolean;
        outline: boolean;
        clip: boolean;
    };
    editingFrame: string | null;
    elementsToHighlight: NonDeleted<ExcalidrawElement>[] | null;
    editingElement: NonDeletedExcalidrawElement | null;
    editingLinearElement: LinearElementEditor | null;
    activeTool: {
        /**
         * indicates a previous tool we should revert back to if we deselect the
         * currently active tool. At the moment applies to `eraser` and `hand` tool.
         */
        lastActiveTool: ActiveTool | null;
        locked: boolean;
    } & ActiveTool;
    penMode: boolean;
    penDetected: boolean;
    exportBackground: boolean;
    exportEmbedScene: boolean;
    exportWithDarkMode: boolean;
    exportScale: number;
    currentItemStrokeColor: string;
    currentItemBackgroundColor: string;
    currentItemFillStyle: ExcalidrawElement["fillStyle"];
    currentItemStrokeWidth: number;
    currentItemStrokeStyle: ExcalidrawElement["strokeStyle"];
    currentItemRoughness: number;
    currentItemOpacity: number;
    currentItemFontFamily: FontFamilyValues;
    currentItemFontSize: number;
    currentItemTextAlign: TextAlign;
    currentItemStartArrowhead: Arrowhead | null;
    currentItemEndArrowhead: Arrowhead | null;
    currentItemRoundness: StrokeRoundness;
    viewBackgroundColor: string;
    scrollX: number;
    scrollY: number;
    cursorButton: "up" | "down";
    scrolledOutside: boolean;
    name: string;
    isResizing: boolean;
    isRotating: boolean;
    zoom: Zoom;
    openMenu: "canvas" | "shape" | null;
    openPopup: "canvasBackground" | "elementBackground" | "elementStroke" | null;
    openSidebar: {
        name: SidebarName;
        tab?: SidebarTabName;
    } | null;
    openDialog: "imageExport" | "help" | "jsonExport" | "mermaid" | null;
    /**
     * Reflects user preference for whether the default sidebar should be docked.
     *
     * NOTE this is only a user preference and does not reflect the actual docked
     * state of the sidebar, because the host apps can override this through
     * a DefaultSidebar prop, which is not reflected back to the appState.
     */
    defaultSidebarDockedPreference: boolean;
    lastPointerDownWith: PointerType;
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
        closable?: boolean;
        duration?: number;
    } | null;
    zenModeEnabled: boolean;
    theme: Theme;
    gridSize: number | null;
    viewModeEnabled: boolean;
    /** top-most selected groups (i.e. does not include nested groups) */
    selectedGroupIds: {
        [groupId: string]: boolean;
    };
    /** group being edited when you drill down to its constituent element
      (e.g. when you double-click on a group's element) */
    editingGroupId: GroupId | null;
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
    fileHandle: FileSystemHandle | null;
    collaborators: Map<string, Collaborator>;
    showStats: boolean;
    currentChartType: ChartType;
    pasteDialog: {
        shown: false;
        data: null;
    } | {
        shown: true;
        data: Spreadsheet;
    };
    /** imageElement waiting to be placed on canvas */
    pendingImageElementId: ExcalidrawImageElement["id"] | null;
    showHyperlinkPopup: false | "info" | "editor";
    selectedLinearElement: LinearElementEditor | null;
    snapLines: readonly SnapLine[];
    originSnapOffset: {
        x: number;
        y: number;
    } | null;
    objectsSnapModeEnabled: boolean;
};
export type UIAppState = Omit<AppState, "suggestedBindings" | "startBoundElement" | "cursorButton" | "scrollX" | "scrollY">;
export type NormalizedZoomValue = number & {
    _brand: "normalizedZoom";
};
export type Zoom = Readonly<{
    value: NormalizedZoomValue;
}>;
export type PointerCoords = Readonly<{
    x: number;
    y: number;
}>;
export type Gesture = {
    pointers: Map<number, PointerCoords>;
    lastCenter: {
        x: number;
        y: number;
    } | null;
    initialDistance: number | null;
    initialScale: number | null;
};
export declare class GestureEvent extends UIEvent {
    readonly rotation: number;
    readonly scale: number;
}
/** @deprecated legacy: do not use outside of migration paths */
export type LibraryItem_v1 = readonly NonDeleted<ExcalidrawElement>[];
/** @deprecated legacy: do not use outside of migration paths */
type LibraryItems_v1 = readonly LibraryItem_v1[];
/** v2 library item */
export type LibraryItem = {
    id: string;
    status: "published" | "unpublished";
    elements: readonly NonDeleted<ExcalidrawElement>[];
    /** timestamp in epoch (ms) */
    created: number;
    name?: string;
    error?: string;
};
export type LibraryItems = readonly LibraryItem[];
export type LibraryItems_anyVersion = LibraryItems | LibraryItems_v1;
export type LibraryItemsSource = ((currentLibraryItems: LibraryItems) => Blob | LibraryItems_anyVersion | Promise<LibraryItems_anyVersion | Blob>) | Blob | LibraryItems_anyVersion | Promise<LibraryItems_anyVersion | Blob>;
export type ExcalidrawInitialDataState = Merge<ImportedDataState, {
    libraryItems?: Required<ImportedDataState>["libraryItems"] | Promise<Required<ImportedDataState>["libraryItems"]>;
}>;
export interface ExcalidrawProps {
    onChange?: (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => void;
    initialData?: ExcalidrawInitialDataState | null | Promise<ExcalidrawInitialDataState | null>;
    excalidrawAPI?: (api: ExcalidrawImperativeAPI) => void;
    isCollaborating?: boolean;
    onPointerUpdate?: (payload: {
        pointer: {
            x: number;
            y: number;
            tool: "pointer" | "laser";
        };
        button: "down" | "up";
        pointersMap: Gesture["pointers"];
    }) => void;
    onPaste?: (data: ClipboardData, event: ClipboardEvent | null) => Promise<boolean> | boolean;
    renderTopRightUI?: (isMobile: boolean, appState: UIAppState) => JSX.Element | null;
    langCode?: Language["code"];
    viewModeEnabled?: boolean;
    zenModeEnabled?: boolean;
    gridModeEnabled?: boolean;
    objectsSnapModeEnabled?: boolean;
    libraryReturnUrl?: string;
    theme?: Theme;
    name?: string;
    renderCustomStats?: (elements: readonly NonDeletedExcalidrawElement[], appState: UIAppState) => JSX.Element;
    UIOptions?: Partial<UIOptions>;
    detectScroll?: boolean;
    handleKeyboardGlobally?: boolean;
    onLibraryChange?: (libraryItems: LibraryItems) => void | Promise<any>;
    autoFocus?: boolean;
    generateIdForFile?: (file: File) => string | Promise<string>;
    onLinkOpen?: (element: NonDeletedExcalidrawElement, event: CustomEvent<{
        nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement>;
    }>) => void;
    onPointerDown?: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => void;
    onScrollChange?: (scrollX: number, scrollY: number) => void;
    children?: React.ReactNode;
    validateEmbeddable?: boolean | string[] | RegExp | RegExp[] | ((link: string) => boolean | undefined);
    renderEmbeddable?: (element: NonDeleted<ExcalidrawEmbeddableElement>, appState: AppState) => JSX.Element | null;
}
export type SceneData = {
    elements?: ImportedDataState["elements"];
    appState?: ImportedDataState["appState"];
    collaborators?: Map<string, Collaborator>;
    commitToHistory?: boolean;
};
export declare enum UserIdleState {
    ACTIVE = "active",
    AWAY = "away",
    IDLE = "idle"
}
export type ExportOpts = {
    saveFileToDisk?: boolean;
    onExportToBackend?: (exportedElements: readonly NonDeletedExcalidrawElement[], appState: UIAppState, files: BinaryFiles, canvas: HTMLCanvasElement) => void;
    renderCustomUI?: (exportedElements: readonly NonDeletedExcalidrawElement[], appState: UIAppState, files: BinaryFiles, canvas: HTMLCanvasElement) => JSX.Element;
};
export type CanvasActions = Partial<{
    changeViewBackgroundColor: boolean;
    clearCanvas: boolean;
    export: false | ExportOpts;
    loadScene: boolean;
    saveToActiveFile: boolean;
    toggleTheme: boolean | null;
    saveAsImage: boolean;
}>;
export type UIOptions = Partial<{
    dockedSidebarBreakpoint: number;
    canvasActions: CanvasActions;
    tools: {
        image: boolean;
    };
    /** @deprecated does nothing. Will be removed in 0.15 */
    welcomeScreen?: boolean;
}>;
export type AppProps = Merge<ExcalidrawProps, {
    UIOptions: Merge<UIOptions, {
        canvasActions: Required<CanvasActions> & {
            export: ExportOpts;
        };
    }>;
    detectScroll: boolean;
    handleKeyboardGlobally: boolean;
    isCollaborating: boolean;
    children?: React.ReactNode;
}>;
/** A subset of App class properties that we need to use elsewhere
 * in the app, eg Manager. Factored out into a separate type to keep DRY. */
export type AppClassProperties = {
    props: AppProps;
    interactiveCanvas: HTMLCanvasElement | null;
    /** static canvas */
    canvas: HTMLCanvasElement;
    focusContainer(): void;
    library: Library;
    imageCache: Map<FileId, {
        image: HTMLImageElement | Promise<HTMLImageElement>;
        mimeType: ValueOf<typeof IMAGE_MIME_TYPES>;
    }>;
    files: BinaryFiles;
    device: App["device"];
    scene: App["scene"];
    pasteFromClipboard: App["pasteFromClipboard"];
    id: App["id"];
    onInsertElements: App["onInsertElements"];
    onExportImage: App["onExportImage"];
    lastViewportPosition: App["lastViewportPosition"];
    scrollToContent: App["scrollToContent"];
    addFiles: App["addFiles"];
    addElementsFromPasteOrLibrary: App["addElementsFromPasteOrLibrary"];
    togglePenMode: App["togglePenMode"];
    setActiveTool: App["setActiveTool"];
    setOpenDialog: App["setOpenDialog"];
};
export type PointerDownState = Readonly<{
    origin: Readonly<{
        x: number;
        y: number;
    }>;
    originInGrid: Readonly<{
        x: number;
        y: number;
    }>;
    scrollbars: ReturnType<typeof isOverScrollBars>;
    lastCoords: {
        x: number;
        y: number;
    };
    originalElements: Map<string, NonDeleted<ExcalidrawElement>>;
    resize: {
        handleType: MaybeTransformHandleType;
        isResizing: boolean;
        offset: {
            x: number;
            y: number;
        };
        arrowDirection: "origin" | "end";
        center: {
            x: number;
            y: number;
        };
    };
    hit: {
        element: NonDeleted<ExcalidrawElement> | null;
        allHitElements: NonDeleted<ExcalidrawElement>[];
        wasAddedToSelection: boolean;
        hasBeenDuplicated: boolean;
        hasHitCommonBoundingBoxOfSelectedElements: boolean;
    };
    withCmdOrCtrl: boolean;
    drag: {
        hasOccurred: boolean;
        offset: {
            x: number;
            y: number;
        } | null;
    };
    eventListeners: {
        onMove: null | ReturnType<typeof throttleRAF>;
        onUp: null | ((event: PointerEvent) => void);
        onKeyDown: null | ((event: KeyboardEvent) => void);
        onKeyUp: null | ((event: KeyboardEvent) => void);
    };
    boxSelection: {
        hasOccurred: boolean;
    };
    elementIdsToErase: {
        [key: ExcalidrawElement["id"]]: {
            opacity: ExcalidrawElement["opacity"];
            erase: boolean;
        };
    };
}>;
type UnsubscribeCallback = () => void;
export type ExcalidrawImperativeAPI = {
    updateScene: InstanceType<typeof App>["updateScene"];
    updateLibrary: InstanceType<typeof Library>["updateLibrary"];
    resetScene: InstanceType<typeof App>["resetScene"];
    getSceneElementsIncludingDeleted: InstanceType<typeof App>["getSceneElementsIncludingDeleted"];
    history: {
        clear: InstanceType<typeof App>["resetHistory"];
    };
    scrollToContent: InstanceType<typeof App>["scrollToContent"];
    getSceneElements: InstanceType<typeof App>["getSceneElements"];
    getAppState: () => InstanceType<typeof App>["state"];
    getFiles: () => InstanceType<typeof App>["files"];
    refresh: InstanceType<typeof App>["refresh"];
    setToast: InstanceType<typeof App>["setToast"];
    addFiles: (data: BinaryFileData[]) => void;
    id: string;
    setActiveTool: InstanceType<typeof App>["setActiveTool"];
    setCursor: InstanceType<typeof App>["setCursor"];
    resetCursor: InstanceType<typeof App>["resetCursor"];
    toggleSidebar: InstanceType<typeof App>["toggleSidebar"];
    /**
     * Disables rendering of frames (including element clipping), but currently
     * the frames are still interactive in edit mode. As such, this API should be
     * used in conjunction with view mode (props.viewModeEnabled).
     */
    updateFrameRendering: InstanceType<typeof App>["updateFrameRendering"];
    onChange: (callback: (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => void) => UnsubscribeCallback;
    onPointerDown: (callback: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState, event: React.PointerEvent<HTMLElement>) => void) => UnsubscribeCallback;
    onPointerUp: (callback: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState, event: PointerEvent) => void) => UnsubscribeCallback;
};
export type Device = Readonly<{
    viewport: {
        isMobile: boolean;
        isLandscape: boolean;
    };
    editor: {
        isMobile: boolean;
        canFitSidebar: boolean;
    };
    isTouchScreen: boolean;
}>;
type FrameNameBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
};
export type FrameNameBoundsCache = {
    get: (frameElement: ExcalidrawFrameElement) => FrameNameBounds | null;
    _cache: Map<string, FrameNameBounds & {
        zoom: AppState["zoom"]["value"];
        versionNonce: ExcalidrawFrameElement["versionNonce"];
    }>;
};
export type KeyboardModifiersObject = {
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
};
export type Primitive = number | string | boolean | bigint | symbol | null | undefined;
export {};
