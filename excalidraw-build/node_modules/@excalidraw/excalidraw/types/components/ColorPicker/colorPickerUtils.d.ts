import { ExcalidrawElement } from "../../element/types";
import { ColorPickerColor, ColorPaletteCustom } from "../../colors";
export declare const getColorNameAndShadeFromColor: ({ palette, color, }: {
    palette: ColorPaletteCustom;
    color: string;
}) => {
    colorName: ColorPickerColor;
    shade: number | null;
} | null;
export declare const colorPickerHotkeyBindings: string[];
export declare const isCustomColor: ({ color, palette, }: {
    color: string;
    palette: ColorPaletteCustom;
}) => boolean;
export declare const getMostUsedCustomColors: (elements: readonly ExcalidrawElement[], type: "elementBackground" | "elementStroke", palette: ColorPaletteCustom) => string[];
export type ActiveColorPickerSectionAtomType = "custom" | "baseColors" | "shades" | "hex" | null;
export declare const activeColorPickerSectionAtom: import("jotai").PrimitiveAtom<ActiveColorPickerSectionAtomType> & {
    init: ActiveColorPickerSectionAtomType;
};
export declare const getContrastYIQ: (bgHex: string, isCustomColor: boolean) => "white" | "black";
export type ColorPickerType = "canvasBackground" | "elementBackground" | "elementStroke";
