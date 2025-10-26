import React from "react";
import "./EyeDropper.scss";
import { ColorPickerType } from "./ColorPicker/colorPickerUtils";
import { ExcalidrawElement } from "../element/types";
export type EyeDropperProperties = {
    keepOpenOnAlt: boolean;
    swapPreviewOnAlt?: boolean;
    /** called when user picks color (on pointerup) */
    onSelect: (color: string, event: PointerEvent) => void;
    /**
     * property of selected elements to update live when alt-dragging.
     * Supply `null` if not applicable (e.g. updating the canvas bg instead of
     * elements)
     **/
    colorPickerType: ColorPickerType;
};
export declare const activeEyeDropperAtom: import("jotai").PrimitiveAtom<EyeDropperProperties | null> & {
    init: EyeDropperProperties | null;
};
export declare const EyeDropper: React.FC<{
    onCancel: () => void;
    onSelect: EyeDropperProperties["onSelect"];
    /** called when color changes, on pointerdown for preview */
    onChange: (type: ColorPickerType, color: string, selectedElements: ExcalidrawElement[], event: {
        altKey: boolean;
    }) => void;
    colorPickerType: EyeDropperProperties["colorPickerType"];
}>;
