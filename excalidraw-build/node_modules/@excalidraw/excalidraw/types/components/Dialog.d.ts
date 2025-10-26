import React from "react";
import "./Dialog.scss";
export type DialogSize = number | "small" | "regular" | "wide" | undefined;
export interface DialogProps {
    children: React.ReactNode;
    className?: string;
    size?: DialogSize;
    onCloseRequest(): void;
    title: React.ReactNode | false;
    autofocus?: boolean;
    closeOnClickOutside?: boolean;
}
export declare const Dialog: (props: DialogProps) => JSX.Element;
