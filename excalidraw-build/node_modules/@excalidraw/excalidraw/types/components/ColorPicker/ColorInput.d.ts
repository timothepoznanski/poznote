import { ColorPickerType } from "./colorPickerUtils";
interface ColorInputProps {
    color: string;
    onChange: (color: string) => void;
    label: string;
    colorPickerType: ColorPickerType;
}
export declare const ColorInput: ({ color, onChange, label, colorPickerType, }: ColorInputProps) => JSX.Element;
export {};
