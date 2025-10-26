import { ExcalidrawElement } from "../element/types";
import { AppState } from "../types";
export declare const actionDuplicateSelection: {
    name: "duplicateSelection";
    trackEvent: {
        category: "element";
    };
    perform: (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>) => false | {
        commitToHistory: true;
        elements?: readonly ExcalidrawElement[] | null | undefined;
        appState?: import("../utility-types").MarkOptional<AppState, "width" | "height" | "offsetTop" | "offsetLeft"> | null | undefined;
        files?: import("../types").BinaryFiles | null | undefined;
        syncHistory?: boolean | undefined;
        replaceFiles?: boolean | undefined;
    };
    contextItemLabel: string;
    keyTest: (event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean;
    PanelComponent: ({ elements, appState, updateData }: import("./types").PanelComponentProps) => JSX.Element;
} & {
    keyTest?: ((event: import("react").KeyboardEvent<Element> | KeyboardEvent) => boolean) | undefined;
};
