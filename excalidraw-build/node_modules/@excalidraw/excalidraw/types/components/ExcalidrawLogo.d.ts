import "./ExcalidrawLogo.scss";
type LogoSize = "xs" | "small" | "normal" | "large" | "custom";
interface LogoProps {
    size?: LogoSize;
    withText?: boolean;
    style?: React.CSSProperties;
    /**
     * If true, the logo will not be wrapped in a Link component.
     * The link prop will be ignored as well.
     * It will merely be a plain div.
     */
    isNotLink?: boolean;
}
export declare const ExcalidrawLogo: ({ style, size, withText, }: LogoProps) => JSX.Element;
export {};
