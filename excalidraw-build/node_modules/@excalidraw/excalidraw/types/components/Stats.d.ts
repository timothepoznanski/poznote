import React from "react";
import { NonDeletedExcalidrawElement } from "../element/types";
import { ExcalidrawProps, UIAppState } from "../types";
import "./Stats.scss";
export declare const Stats: (props: {
    appState: UIAppState;
    setAppState: React.Component<any, UIAppState>["setState"];
    elements: readonly NonDeletedExcalidrawElement[];
    onClose: () => void;
    renderCustomStats: ExcalidrawProps["renderCustomStats"];
}) => JSX.Element;
