import { ColorPaletteCustom } from "../../colors";
import { ActiveColorPickerSectionAtomType } from "./colorPickerUtils";
interface ColorPickerKeyNavHandlerProps {
    event: React.KeyboardEvent;
    activeColorPickerSection: ActiveColorPickerSectionAtomType;
    palette: ColorPaletteCustom;
    color: string;
    onChange: (color: string) => void;
    customColors: string[];
    setActiveColorPickerSection: (update: React.SetStateAction<ActiveColorPickerSectionAtomType>) => void;
    updateData: (formData?: any) => void;
    activeShade: number;
    onEyeDropperToggle: (force?: boolean) => void;
    onEscape: (event: React.KeyboardEvent | KeyboardEvent) => void;
}
/**
 * @returns true if the event was handled
 */
export declare const colorPickerKeyNavHandler: ({ event, activeColorPickerSection, palette, color, onChange, customColors, setActiveColorPickerSection, updateData, activeShade, onEyeDropperToggle, onEscape, }: ColorPickerKeyNavHandlerProps) => boolean;
export {};
