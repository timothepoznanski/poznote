import "./Stack.scss";
import React from "react";
type StackProps = {
    children: React.ReactNode;
    gap?: number;
    align?: "start" | "center" | "end" | "baseline";
    justifyContent?: "center" | "space-around" | "space-between";
    className?: string | boolean;
    style?: React.CSSProperties;
    ref: React.RefObject<HTMLDivElement>;
};
declare const _default: {
    Row: React.ForwardRefExoticComponent<Pick<StackProps, "style" | "children" | "align" | "gap" | "className" | "justifyContent"> & React.RefAttributes<HTMLDivElement>>;
    Col: React.ForwardRefExoticComponent<Pick<StackProps, "style" | "children" | "align" | "gap" | "className" | "justifyContent"> & React.RefAttributes<HTMLDivElement>>;
};
export default _default;
