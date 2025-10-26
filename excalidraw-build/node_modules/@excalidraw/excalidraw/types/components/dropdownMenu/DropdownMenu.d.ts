import React from "react";
import "./DropdownMenu.scss";
declare const DropdownMenu: {
    ({ children, open, }: {
        children?: React.ReactNode;
        open: boolean;
    }): JSX.Element;
    Trigger: {
        ({ className, children, onToggle, title, ...rest }: {
            className?: string | undefined;
            children: React.ReactNode;
            onToggle: () => void;
            title?: string | undefined;
        } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">): JSX.Element;
        displayName: string;
    };
    Content: {
        ({ children, onClickOutside, className, onSelect, style, }: {
            children?: React.ReactNode;
            onClickOutside?: (() => void) | undefined;
            className?: string | undefined;
            onSelect?: ((event: Event) => void) | undefined;
            style?: React.CSSProperties | undefined;
        }): JSX.Element;
        displayName: string;
    };
    Item: {
        ({ icon, onSelect, children, shortcut, className, selected, ...rest }: {
            icon?: JSX.Element | undefined;
            onSelect: (event: Event) => void;
            children: React.ReactNode;
            shortcut?: string | undefined;
            selected?: boolean | undefined;
            className?: string | undefined;
        } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">): JSX.Element;
        displayName: string;
    };
    ItemLink: {
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
    ItemCustom: ({ children, className, selected, ...rest }: {
        children: React.ReactNode;
        className?: string | undefined;
        selected?: boolean | undefined;
    } & React.HTMLAttributes<HTMLDivElement>) => JSX.Element;
    Group: {
        ({ children, className, style, title, }: {
            children: React.ReactNode;
            className?: string | undefined;
            style?: React.CSSProperties | undefined;
            title?: string | undefined;
        }): JSX.Element;
        displayName: string;
    };
    Separator: {
        (): JSX.Element;
        displayName: string;
    };
    displayName: string;
};
export default DropdownMenu;
