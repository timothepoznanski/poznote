import React from "react";
declare const DropdownMenuItemLink: {
    ({ icon, shortcut, href, children, onSelect, className, selected, ...rest }: {
        href: string;
        icon?: JSX.Element | undefined;
        children: React.ReactNode;
        shortcut?: string | undefined;
        className?: string | undefined;
        selected?: boolean | undefined;
        onSelect?: ((event: Event) => void) | undefined;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>): JSX.Element;
    displayName: string;
};
export default DropdownMenuItemLink;
