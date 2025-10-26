import { ColorPaletteCustom } from "../../colors";
interface PickerColorListProps {
    palette: ColorPaletteCustom;
    color: string;
    onChange: (color: string) => void;
    label: string;
    activeShade: number;
}
declare const PickerColorList: ({ palette, color, onChange, label, activeShade, }: PickerColorListProps) => JSX.Element;
export default PickerColorList;
