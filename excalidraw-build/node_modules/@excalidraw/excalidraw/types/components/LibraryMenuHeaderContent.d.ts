import { LibraryItem, UIAppState } from "../types";
import Library from "../data/library";
export declare const LibraryDropdownMenuButton: React.FC<{
    setAppState: React.Component<any, UIAppState>["setState"];
    selectedItems: LibraryItem["id"][];
    library: Library;
    onRemoveFromLibrary: () => void;
    resetLibrary: () => void;
    onSelectItems: (items: LibraryItem["id"][]) => void;
    appState: UIAppState;
    className?: string;
}>;
export declare const LibraryDropdownMenu: ({ selectedItems, onSelectItems, className, }: {
    selectedItems: LibraryItem["id"][];
    onSelectItems: (id: LibraryItem["id"][]) => void;
    className?: string | undefined;
}) => JSX.Element;
