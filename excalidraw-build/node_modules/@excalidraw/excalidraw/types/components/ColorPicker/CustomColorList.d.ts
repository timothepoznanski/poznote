interface CustomColorListProps {
    colors: string[];
    color: string;
    onChange: (color: string) => void;
    label: string;
}
export declare const CustomColorList: ({ colors, color, onChange, label, }: CustomColorListProps) => JSX.Element;
export {};
