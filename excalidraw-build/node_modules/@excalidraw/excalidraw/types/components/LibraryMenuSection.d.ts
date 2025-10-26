import React, { ReactNode } from "react";
import { LibraryItem } from "../types";
import { ExcalidrawElement, NonDeleted } from "../element/types";
import { SvgCache } from "../hooks/useLibraryItemSvg";
type LibraryOrPendingItem = (LibraryItem | /* pending library item */ {
    id: null;
    elements: readonly NonDeleted<ExcalidrawElement>[];
})[];
interface Props {
    items: LibraryOrPendingItem;
    onClick: (id: LibraryItem["id"] | null) => void;
    onItemSelectToggle: (id: LibraryItem["id"], event: React.MouseEvent) => void;
    onItemDrag: (id: LibraryItem["id"], event: React.DragEvent) => void;
    isItemSelected: (id: LibraryItem["id"] | null) => boolean;
    svgCache: SvgCache;
    itemsRenderedPerBatch: number;
}
export declare const LibraryMenuSectionGrid: ({ children, }: {
    children: ReactNode;
}) => JSX.Element;
export declare const LibraryMenuSection: React.MemoExoticComponent<({ items, onItemSelectToggle, onItemDrag, isItemSelected, onClick, svgCache, itemsRenderedPerBatch, }: Props) => JSX.Element>;
export {};
