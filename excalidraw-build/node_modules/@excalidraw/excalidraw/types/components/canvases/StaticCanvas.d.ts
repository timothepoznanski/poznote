import React from "react";
import { RoughCanvas } from "roughjs/bin/canvas";
import type { StaticCanvasAppState } from "../../types";
import type { StaticCanvasRenderConfig } from "../../scene/types";
import type { NonDeletedExcalidrawElement } from "../../element/types";
type StaticCanvasProps = {
    canvas: HTMLCanvasElement;
    rc: RoughCanvas;
    elements: readonly NonDeletedExcalidrawElement[];
    visibleElements: readonly NonDeletedExcalidrawElement[];
    versionNonce: number | undefined;
    selectionNonce: number | undefined;
    scale: number;
    appState: StaticCanvasAppState;
    renderConfig: StaticCanvasRenderConfig;
};
declare const _default: React.MemoExoticComponent<(props: StaticCanvasProps) => JSX.Element>;
export default _default;
