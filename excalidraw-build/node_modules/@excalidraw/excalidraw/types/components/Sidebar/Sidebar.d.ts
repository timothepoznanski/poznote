import React from "react";
import "./Sidebar.scss";
/**
 * Flags whether the currently rendered Sidebar is docked or not, for use
 * in upstream components that need to act on this (e.g. LayerUI to shift the
 * UI). We use an atom because of potential host app sidebars (for the default
 * sidebar we could just read from appState.defaultSidebarDockedPreference).
 *
 * Since we can only render one Sidebar at a time, we can use a simple flag.
 */
export declare const isSidebarDockedAtom: import("jotai").PrimitiveAtom<boolean> & {
    init: boolean;
};
export declare const SidebarInner: React.ForwardRefExoticComponent<Pick<{
    name: string;
    children: React.ReactNode;
    onStateChange?: ((state: {
        name: string;
        tab?: string | undefined;
    } | null) => void) | undefined;
    onDock?: ((docked: boolean) => void) | undefined;
    docked?: boolean | undefined;
    className?: string | undefined;
    __fallback?: boolean | undefined;
} & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">, "name" | "children" | "key" | "className" | "onDock" | "docked" | "onStateChange" | "__fallback"> & React.RefAttributes<HTMLDivElement>>;
export declare const Sidebar: React.ForwardRefExoticComponent<{
    name: string;
    children: React.ReactNode;
    onStateChange?: ((state: {
        name: string;
        tab?: string | undefined;
    } | null) => void) | undefined;
    onDock?: ((docked: boolean) => void) | undefined;
    docked?: boolean | undefined;
    className?: string | undefined;
    __fallback?: boolean | undefined;
} & React.RefAttributes<HTMLDivElement>> & {
    Header: {
        ({ children, className, }: {
            children?: React.ReactNode;
            className?: string | undefined;
        }): JSX.Element;
        displayName: string;
    };
    TabTriggers: {
        ({ children, ...rest }: {
            children: React.ReactNode;
        } & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">): JSX.Element;
        displayName: string;
    };
    TabTrigger: {
        ({ children, tab, onSelect, ...rest }: {
            children: React.ReactNode;
            tab: string;
            onSelect?: React.ReactEventHandler<HTMLButtonElement> | undefined;
        } & Omit<React.HTMLAttributes<HTMLButtonElement>, "onSelect">): JSX.Element;
        displayName: string;
    };
    Tabs: {
        ({ children, ...rest }: {
            children: React.ReactNode;
        } & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">): JSX.Element | null;
        displayName: string;
    };
    Tab: {
        ({ tab, children, ...rest }: {
            tab: string;
            children: React.ReactNode;
        } & React.HTMLAttributes<HTMLDivElement>): JSX.Element;
        displayName: string;
    };
    Trigger: {
        ({ name, tab, icon, title, children, onToggle, className, style, }: import("./common").SidebarTriggerProps): JSX.Element;
        displayName: string;
    };
};
