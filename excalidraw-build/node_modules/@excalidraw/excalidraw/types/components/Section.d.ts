import React from "react";
export declare const Section: React.FC<{
    heading: "canvasActions" | "selectedShapeActions" | "shapes";
    children?: React.ReactNode | ((heading: React.ReactNode) => React.ReactNode);
    className?: string;
}>;
