import { LibraryItem } from "../types";
import "./LibraryUnit.scss";
import { SvgCache } from "../hooks/useLibraryItemSvg";
export declare const LibraryUnit: import("react").MemoExoticComponent<({ id, elements, isPending, onClick, selected, onToggle, onDrag, svgCache, }: {
    id: LibraryItem["id"] | /** for pending item */ null;
    elements?: readonly import("../element/types").NonDeleted<import("../element/types").ExcalidrawElement>[] | undefined;
    isPending?: boolean | undefined;
    onClick: (id: LibraryItem["id"] | null) => void;
    selected: boolean;
    onToggle: (id: string, event: React.MouseEvent) => void;
    onDrag: (id: string, event: React.DragEvent) => void;
    svgCache: SvgCache;
}) => JSX.Element>;
export declare const EmptyLibraryUnit: () => JSX.Element;
