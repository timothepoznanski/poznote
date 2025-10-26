import React from "react";
import Library from "../data/library";
import { LibraryItems, LibraryItem, ExcalidrawProps, UIAppState } from "../types";
import "./LibraryMenu.scss";
export declare const isLibraryMenuOpenAtom: import("jotai").PrimitiveAtom<boolean> & {
    init: boolean;
};
export declare const LibraryMenuContent: ({ onInsertLibraryItems, pendingElements, onAddToLibrary, setAppState, libraryReturnUrl, library, id, theme, selectedItems, onSelectItems, }: {
    pendingElements: LibraryItem["elements"];
    onInsertLibraryItems: (libraryItems: LibraryItems) => void;
    onAddToLibrary: () => void;
    setAppState: React.Component<any, UIAppState>["setState"];
    libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
    library: Library;
    id: string;
    theme: UIAppState["theme"];
    selectedItems: LibraryItem["id"][];
    onSelectItems: (id: LibraryItem["id"][]) => void;
}) => JSX.Element;
/**
 * This component is meant to be rendered inside <Sidebar.Tab/> inside our
 * <DefaultSidebar/> or host apps Sidebar components.
 */
export declare const LibraryMenu: () => JSX.Element;
