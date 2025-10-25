import "../ToolIcon.scss";
type LaserPointerIconProps = {
    title?: string;
    name?: string;
    checked: boolean;
    onChange?(): void;
    isMobile?: boolean;
};
export declare const LaserPointerButton: (props: LaserPointerIconProps) => JSX.Element;
export {};
