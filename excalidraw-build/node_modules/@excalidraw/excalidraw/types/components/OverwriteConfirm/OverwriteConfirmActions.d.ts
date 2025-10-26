import React from "react";
export type ActionProps = {
    title: string;
    children: React.ReactNode;
    actionLabel: string;
    onClick: () => void;
};
export declare const Action: ({ title, children, actionLabel, onClick, }: ActionProps) => JSX.Element;
export declare const ExportToImage: () => JSX.Element;
export declare const SaveToDisk: () => JSX.Element;
declare const Actions: (({ children }: {
    children: React.ReactNode;
}) => JSX.Element) & {
    ExportToImage: () => JSX.Element;
    SaveToDisk: () => JSX.Element;
};
export { Actions };
