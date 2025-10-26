import "./Button.scss";
interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
    type?: "button" | "submit" | "reset";
    onSelect: () => any;
    /** whether button is in active state */
    selected?: boolean;
    children: React.ReactNode;
    className?: string;
}
/**
 * A generic button component that follows Excalidraw's design system.
 * Style can be customised using `className` or `style` prop.
 * Accepts all props that a regular `button` element accepts.
 */
export declare const Button: ({ type, onSelect, selected, children, className, ...rest }: ButtonProps) => JSX.Element;
export {};
