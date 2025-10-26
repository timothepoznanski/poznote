import React from "react";
export type OverwriteConfirmState = {
    active: true;
    title: string;
    description: React.ReactNode;
    actionLabel: string;
    color: "danger" | "warning";
    onClose: () => void;
    onConfirm: () => void;
    onReject: () => void;
} | {
    active: false;
};
export declare const overwriteConfirmStateAtom: import("jotai").PrimitiveAtom<OverwriteConfirmState> & {
    init: OverwriteConfirmState;
};
export declare function openConfirmModal({ title, description, actionLabel, color, }: {
    title: string;
    description: React.ReactNode;
    actionLabel: string;
    color: "danger" | "warning";
}): Promise<boolean>;
