import React from "react";
import { ExcalidrawElement } from "../../element/types";
import { ColorPickerType } from "./colorPickerUtils";
import { ColorPaletteCustom } from "../../colors";
interface PickerProps {
    color: string;
    onChange: (color: string) => void;
    label: string;
    type: ColorPickerType;
    elements: readonly ExcalidrawElement[];
    palette: ColorPaletteCustom;
    updateData: (formData?: any) => void;
    children?: React.ReactNode;
    onEyeDropperToggle: (force?: boolean) => void;
    onEscape: (event: React.KeyboardEvent | KeyboardEvent) => void;
}
export declare const Picker: ({ color, onChange, label, type, elements, palette, updateData, children, onEyeDropperToggle, onEscape, }: PickerProps) => JSX.Element;
export {};
