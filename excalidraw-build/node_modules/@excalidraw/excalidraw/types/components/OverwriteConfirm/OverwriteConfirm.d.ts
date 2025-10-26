import React from "react";
import "./OverwriteConfirm.scss";
export type OverwriteConfirmDialogProps = {
    children: React.ReactNode;
};
declare const OverwriteConfirmDialog: React.FC<OverwriteConfirmDialogProps & {
    __fallback?: boolean | undefined;
}> & {
    Actions: (({ children }: {
        children: React.ReactNode;
    }) => JSX.Element) & {
        ExportToImage: () => JSX.Element;
        SaveToDisk: () => JSX.Element;
    };
    Action: ({ title, children, actionLabel, onClick, }: import("./OverwriteConfirmActions").ActionProps) => JSX.Element;
};
export { OverwriteConfirmDialog };
