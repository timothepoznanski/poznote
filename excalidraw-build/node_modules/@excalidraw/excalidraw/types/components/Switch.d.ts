import "./Switch.scss";
export type SwitchProps = {
    name: string;
    checked: boolean;
    title?: string;
    onChange: (value: boolean) => void;
    disabled?: boolean;
};
export declare const Switch: ({ title, name, checked, onChange, disabled, }: SwitchProps) => JSX.Element;
