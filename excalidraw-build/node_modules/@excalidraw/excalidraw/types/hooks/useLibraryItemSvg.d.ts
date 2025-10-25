import { LibraryItem } from "../types";
export type SvgCache = Map<LibraryItem["id"], SVGSVGElement>;
export declare const libraryItemSvgsCache: import("jotai").PrimitiveAtom<SvgCache> & {
    init: SvgCache;
};
export declare const useLibraryItemSvg: (id: LibraryItem["id"] | null, elements: LibraryItem["elements"] | undefined, svgCache: SvgCache) => SVGSVGElement | undefined;
export declare const useLibraryCache: () => {
    clearLibraryCache: () => void;
    deleteItemsFromLibraryCache: (items: LibraryItem["id"][]) => void;
    svgCache: SvgCache;
};
