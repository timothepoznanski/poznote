import "./ContextMenu.scss";
import { Action } from "../actions/types";
import { ActionManager } from "../actions/manager";
import React from "react";
export type ContextMenuItem = typeof CONTEXT_MENU_SEPARATOR | Action;
export type ContextMenuItems = (ContextMenuItem | false | null | undefined)[];
type ContextMenuProps = {
    actionManager: ActionManager;
    items: ContextMenuItems;
    top: number;
    left: number;
    onClose: (callback?: () => void) => void;
};
export declare const CONTEXT_MENU_SEPARATOR = "separator";
export declare const ContextMenu: React.MemoExoticComponent<({ actionManager, items, top, left, onClose }: ContextMenuProps) => JSX.Element>;
export {};
