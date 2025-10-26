import { ExcalidrawElement } from "../element/types";
import { AppClassProperties, AppState } from "../types";
export declare const distributeHorizontally: {
    name: "distributeHorizontally";
    trackEvent: {
        category: "element";
    };
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
export declare const distributeVertically: {
    name: "distributeVertically";
    trackEvent: {
        category: "element";
    };
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
