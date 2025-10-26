import { ExcalidrawElement } from "../element/types";
import { AppClassProperties, AppState } from "../types";
export declare const actionAlignTop: {
    name: "alignTop";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const actionAlignBottom: {
    name: "alignBottom";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const actionAlignLeft: {
    name: "alignLeft";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const actionAlignRight: {
    name: "alignRight";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const actionAlignVerticallyCentered: {
    name: "alignVerticallyCentered";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: undefined;
};
export declare const actionAlignHorizontallyCentered: {
    name: "alignHorizontallyCentered";
    trackEvent: {
        category: "element";
    };
    predicate: (elements: readonly ExcalidrawElement[], appState: AppState, _: unknown, app: AppClassProperties) => boolean;
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: AppClassProperties) => {
        appState: Readonly<AppState>;
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        commitToHistory: true;
    };
    PanelComponent: ({ elements, appState, updateData, app }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: undefined;
};
