import React from "react";
import { NonDeletedExcalidrawElement } from "../element/types";
import { ExportOpts, BinaryFiles, UIAppState } from "../types";
import "./ExportDialog.scss";
import { ActionManager } from "../actions/manager";
export type ExportCB = (elements: readonly NonDeletedExcalidrawElement[], scale?: number) => void;
export declare const JSONExportDialog: ({ elements, appState, files, actionManager, exportOpts, canvas, setAppState, }: {
    elements: readonly NonDeletedExcalidrawElement[];
    appState: UIAppState;
    files: BinaryFiles;
    actionManager: ActionManager;
    exportOpts: ExportOpts;
    canvas: HTMLCanvasElement;
    setAppState: React.Component<any, UIAppState>["setState"];
}) => JSX.Element;
