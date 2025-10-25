declare const MenuTrigger: {
    ({ className, children, onToggle, title, ...rest }: {
        className?: string | undefined;
        children: React.ReactNode;
        onToggle: () => void;
        title?: string | undefined;
    } & Omit<import("react").ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">): JSX.Element;
    displayName: string;
};
export default MenuTrigger;
