import React from "react";
import { UIAppState } from "../types";
import "./PasteChartDialog.scss";
export declare const PasteChartDialog: ({ setAppState, appState, onClose, }: {
    appState: UIAppState;
    onClose: () => void;
    setAppState: React.Component<any, UIAppState>["setState"];
}) => JSX.Element;
