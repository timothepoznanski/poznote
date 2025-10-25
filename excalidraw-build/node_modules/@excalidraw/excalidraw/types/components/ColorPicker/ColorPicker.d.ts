import { ExcalidrawElement } from "../../element/types";
import { AppState } from "../../types";
import { ColorPickerType } from "./colorPickerUtils";
import { ColorTuple, ColorPaletteCustom } from "../../colors";
import "./ColorPicker.scss";
export declare const getColor: (color: string) => string | null;
interface ColorPickerProps {
    type: ColorPickerType;
    color: string;
    onChange: (color: string) => void;
    label: string;
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    palette?: ColorPaletteCustom | null;
    topPicks?: ColorTuple;
    updateData: (formData?: any) => void;
}
export declare const ColorPicker: ({ type, color, onChange, label, elements, palette, topPicks, updateData, appState, }: ColorPickerProps) => JSX.Element;
export {};
