import { ExcalidrawElement } from "../element/types";
import { AppState } from "../types";
export declare const actionFlipHorizontal: {
    name: "flipHorizontal";
    trackEvent: {
        category: "element";
    };
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: import("../types").AppClassProperties) => {
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        appState: Readonly<AppState>;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    contextItemLabel: string;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
export declare const actionFlipVertical: {
    name: "flipVertical";
    trackEvent: {
        category: "element";
    };
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>, _: any, app: import("../types").AppClassProperties) => {
        elements: import("../scene/Scene").ExcalidrawElementsIncludingDeleted;
        appState: Readonly<AppState>;
        commitToHistory: true;
    };
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    contextItemLabel: string;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
