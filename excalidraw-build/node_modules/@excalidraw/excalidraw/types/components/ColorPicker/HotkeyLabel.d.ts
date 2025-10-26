interface HotkeyLabelProps {
    color: string;
    keyLabel: string | number;
    isCustomColor?: boolean;
    isShade?: boolean;
}
declare const HotkeyLabel: ({ color, keyLabel, isCustomColor, isShade, }: HotkeyLabelProps) => JSX.Element;
export default HotkeyLabel;
