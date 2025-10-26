import { ColorPickerType } from "./colorPickerUtils";
interface TopPicksProps {
    onChange: (color: string) => void;
    type: ColorPickerType;
    activeColor: string;
    topPicks?: readonly string[];
}
export declare const TopPicks: ({ onChange, type, activeColor, topPicks, }: TopPicksProps) => JSX.Element | null;
export {};
