import { ColorPaletteCustom } from "../../colors";
interface ShadeListProps {
    hex: string;
    onChange: (color: string) => void;
    palette: ColorPaletteCustom;
}
export declare const ShadeList: ({ hex, onChange, palette }: ShadeListProps) => JSX.Element;
export {};
