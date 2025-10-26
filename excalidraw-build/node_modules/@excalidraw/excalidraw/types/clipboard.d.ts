import { ExcalidrawElement, NonDeletedExcalidrawElement } from "./element/types";
import { BinaryFiles } from "./types";
import { Spreadsheet } from "./charts";
import { ALLOWED_PASTE_MIME_TYPES } from "./constants";
export type PastedMixedContent = {
    type: "text" | "imageUrl";
    value: string;
}[];
export interface ClipboardData {
    spreadsheet?: Spreadsheet;
    elements?: readonly ExcalidrawElement[];
    files?: BinaryFiles;
    text?: string;
    mixedContent?: PastedMixedContent;
    errorMessage?: string;
    programmaticAPI?: boolean;
}
type AllowedPasteMimeTypes = typeof ALLOWED_PASTE_MIME_TYPES[number];
export declare const probablySupportsClipboardReadText: boolean;
export declare const probablySupportsClipboardWriteText: boolean;
export declare const probablySupportsClipboardBlob: boolean;
export declare const createPasteEvent: ({ types, files, }: {
    types?: {
        "text/plain"?: string | undefined;
        "text/html"?: string | undefined;
    } | undefined;
    files?: File[] | undefined;
}) => ClipboardEvent;
export declare const serializeAsClipboardJSON: ({ elements, files, }: {
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
}) => string;
export declare const copyToClipboard: (elements: readonly NonDeletedExcalidrawElement[], files: BinaryFiles | null, clipboardEvent?: ClipboardEvent | null) => Promise<void>;
export declare const readSystemClipboard: () => Promise<{
    "text/plain"?: string | undefined;
    "text/html"?: string | undefined;
}>;
/**
 * Attempts to parse clipboard. Prefers system clipboard.
 */
export declare const parseClipboard: (event: ClipboardEvent, isPlainPaste?: boolean) => Promise<ClipboardData>;
export declare const copyBlobToClipboardAsPng: (blob: Blob | Promise<Blob>) => Promise<void>;
export declare const copyTextToSystemClipboard: (text: string | null, clipboardEvent?: ClipboardEvent | null) => Promise<void>;
export {};
