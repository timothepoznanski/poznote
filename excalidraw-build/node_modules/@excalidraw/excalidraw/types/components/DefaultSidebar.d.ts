import { MarkOptional } from "../utility-types";
import { SidebarProps, SidebarTriggerProps } from "./Sidebar/common";
export declare const DefaultSidebar: import("react").FC<Omit<MarkOptional<Omit<{
    name: string;
    children: import("react").ReactNode;
    onStateChange?: ((state: {
        name: string;
        tab?: string | undefined;
    } | null) => void) | undefined;
    onDock?: ((docked: boolean) => void) | undefined;
    docked?: boolean | undefined;
    className?: string | undefined;
    __fallback?: boolean | undefined;
}, "name">, "children">, "onDock"> & {
    /** pass `false` to disable docking */
    onDock?: SidebarProps["onDock"] | false;
} & {
    __fallback?: boolean | undefined;
}> & {
    Trigger: import("react").FC<Omit<SidebarTriggerProps, "name"> & import("react").HTMLAttributes<HTMLDivElement> & {
        __fallback?: boolean | undefined;
    }>;
    TabTriggers: {
        ({ children, ...rest }: {
            children: React.ReactNode;
        } & import("react").HTMLAttributes<HTMLDivElement>): JSX.Element;
        displayName: string;
    };
};
