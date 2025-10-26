import { EVENT } from "./constants";
import { FontFamilyValues, FontString, NonDeletedExcalidrawElement } from "./element/types";
import { ActiveTool, AppState, ToolType, Zoom } from "./types";
export declare const setDateTimeForTests: (dateTime: string) => void;
export declare const getDateTime: () => string;
export declare const capitalizeString: (str: string) => string;
export declare const isToolIcon: (target: Element | EventTarget | null) => target is HTMLElement;
export declare const isInputLike: (target: Element | EventTarget | null) => target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLBRElement | HTMLDivElement;
export declare const isInteractive: (target: Element | EventTarget | null) => boolean;
export declare const isWritableElement: (target: Element | EventTarget | null) => target is HTMLInputElement | HTMLTextAreaElement | HTMLBRElement | HTMLDivElement;
export declare const getFontFamilyString: ({ fontFamily, }: {
    fontFamily: FontFamilyValues;
}) => string;
/** returns fontSize+fontFamily string for assignment to DOM elements */
export declare const getFontString: ({ fontSize, fontFamily, }: {
    fontSize: number;
    fontFamily: FontFamilyValues;
}) => FontString;
export declare const debounce: <T extends any[]>(fn: (...args: T) => void, timeout: number) => {
    (...args: T): void;
    flush(): void;
    cancel(): void;
};
export declare const throttleRAF: <T extends any[]>(fn: (...args: T) => void, opts?: {
    trailing?: boolean;
}) => {
    (...args: T): void;
    flush(): void;
    cancel(): void;
};
/**
 * Exponential ease-out method
 *
 * @param {number} k - The value to be tweened.
 * @returns {number} The tweened value.
 */
export declare const easeOut: (k: number) => number;
/**
 * Animates values from `fromValues` to `toValues` using the requestAnimationFrame API.
 * Executes the `onStep` callback on each step with the interpolated values.
 * Returns a function that can be called to cancel the animation.
 *
 * @example
 * // Example usage:
 * const fromValues = { x: 0, y: 0 };
 * const toValues = { x: 100, y: 200 };
 * const onStep = ({x, y}) => {
 *   setState(x, y)
 * };
 * const onCancel = () => {
 *   console.log("Animation canceled");
 * };
 *
 * const cancelAnimation = easeToValuesRAF({
 *   fromValues,
 *   toValues,
 *   onStep,
 *   onCancel,
 * });
 *
 * // To cancel the animation:
 * cancelAnimation();
 */
export declare const easeToValuesRAF: <T extends Record<keyof T, number>, K extends keyof T>({ fromValues, toValues, onStep, duration, interpolateValue, onStart, onEnd, onCancel, }: {
    fromValues: T;
    toValues: T;
    /**
     * Interpolate a single value.
     * Return undefined to be handled by the default interpolator.
     */
    interpolateValue?: ((fromValue: number, toValue: number, progress: number, key: K) => number | undefined) | undefined;
    onStep: (values: T) => void;
    duration?: number | undefined;
    onStart?: (() => void) | undefined;
    onEnd?: (() => void) | undefined;
    onCancel?: (() => void) | undefined;
}) => () => void;
export declare const chunk: <T extends unknown>(array: readonly T[], size: number) => T[][];
export declare const selectNode: (node: Element) => void;
export declare const removeSelection: () => void;
export declare const distance: (x: number, y: number) => number;
export declare const updateActiveTool: (appState: Pick<AppState, "activeTool">, data: (({
    type: ToolType;
} | {
    type: "custom";
    customType: string;
}) & {
    locked?: boolean;
}) & {
    lastActiveToolBeforeEraser?: ActiveTool | null;
}) => AppState["activeTool"];
export declare const isFullScreen: () => boolean;
export declare const allowFullScreen: () => Promise<void>;
export declare const exitFullScreen: () => Promise<void>;
export declare const getShortcutKey: (shortcut: string) => string;
export declare const viewportCoordsToSceneCoords: ({ clientX, clientY }: {
    clientX: number;
    clientY: number;
}, { zoom, offsetLeft, offsetTop, scrollX, scrollY, }: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
}) => {
    x: number;
    y: number;
};
export declare const sceneCoordsToViewportCoords: ({ sceneX, sceneY }: {
    sceneX: number;
    sceneY: number;
}, { zoom, offsetLeft, offsetTop, scrollX, scrollY, }: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
}) => {
    x: number;
    y: number;
};
export declare const getGlobalCSSVariable: (name: string) => string;
/**
 * Checks whether first directional character is RTL. Meaning whether it starts
 *  with RTL characters, or indeterminate (numbers etc.) characters followed by
 *  RTL.
 * See https://github.com/excalidraw/excalidraw/pull/1722#discussion_r436340171
 */
export declare const isRTL: (text: string) => boolean;
export declare const tupleToCoors: (xyTuple: readonly [number, number]) => {
    x: number;
    y: number;
};
/** use as a rejectionHandler to mute filesystem Abort errors */
export declare const muteFSAbortError: (error?: Error) => void;
export declare const findIndex: <T>(array: readonly T[], cb: (element: T, index: number, array: readonly T[]) => boolean, fromIndex?: number) => number;
export declare const findLastIndex: <T>(array: readonly T[], cb: (element: T, index: number, array: readonly T[]) => boolean, fromIndex?: number) => number;
export declare const isTransparent: (color: string) => boolean;
export type ResolvablePromise<T> = Promise<T> & {
    resolve: [T] extends [undefined] ? (value?: T) => void : (value: T) => void;
    reject: (error: Error) => void;
};
export declare const resolvablePromise: <T>() => ResolvablePromise<T>;
/**
 * @param func handler taking at most single parameter (event).
 */
export declare const withBatchedUpdates: <TFunction extends ((event: any) => void) | (() => void)>(func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never) => TFunction;
/**
 * barches React state updates and throttles the calls to a single call per
 * animation frame
 */
export declare const withBatchedUpdatesThrottled: <TFunction extends ((event: any) => void) | (() => void)>(func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never) => {
    (...args: Parameters<TFunction>): void;
    flush(): void;
    cancel(): void;
};
export declare const nFormatter: (num: number, digits: number) => string;
export declare const getVersion: () => string;
export declare const supportsEmoji: () => boolean;
export declare const getNearestScrollableContainer: (element: HTMLElement) => HTMLElement | Document;
export declare const focusNearestParent: (element: HTMLInputElement) => void;
export declare const preventUnload: (event: BeforeUnloadEvent) => void;
export declare const bytesToHexString: (bytes: Uint8Array) => string;
export declare const getUpdatedTimestamp: () => number;
/**
 * Transforms array of objects containing `id` attribute,
 * or array of ids (strings), into a Map, keyd by `id`.
 */
export declare const arrayToMap: <T extends string | {
    id: string;
}>(items: readonly T[]) => Map<string, T>;
export declare const arrayToMapWithIndex: <T extends {
    id: string;
}>(elements: readonly T[]) => Map<string, [element: T, index: number]>;
export declare const isTestEnv: () => boolean;
export declare const wrapEvent: <T extends Event>(name: EVENT, nativeEvent: T) => CustomEvent<{
    nativeEvent: T;
}>;
export declare const updateObject: <T extends Record<string, any>>(obj: T, updates: Partial<T>) => T;
export declare const isPrimitive: (val: any) => boolean;
export declare const getFrame: () => "top" | "iframe";
export declare const isRunningInIframe: () => boolean;
export declare const isPromiseLike: (value: any) => value is Promise<any>;
export declare const queryFocusableElements: (container: HTMLElement | null) => HTMLElement[];
export declare const isShallowEqual: <T extends Record<string, any>, I extends keyof T>(objA: T, objB: T, comparators?: Record<I, (a: T[I], b: T[I]) => boolean> | undefined, debug?: boolean) => boolean;
export declare const composeEventHandlers: <E>(originalEventHandler?: ((event: E) => void) | undefined, ourEventHandler?: ((event: E) => void) | undefined, { checkForDefaultPrevented }?: {
    checkForDefaultPrevented?: boolean | undefined;
}) => (event: E) => void;
export declare const isOnlyExportingSingleFrame: (elements: readonly NonDeletedExcalidrawElement[]) => boolean;
/**
 * supply `null` as message if non-never value is valid, you just need to
 * typecheck against it
 */
export declare const assertNever: (value: never, message: string | null, softAssert?: boolean) => never;
/**
 * Memoizes on values of `opts` object (strict equality).
 */
export declare const memoize: <T extends Record<string, any>, R extends unknown>(func: (opts: T) => R) => ((opts: T) => R) & {
    clear: () => void;
};
export declare const isRenderThrottlingEnabled: () => boolean;
/** Checks if value is inside given collection. Useful for type-safety. */
export declare const isMemberOf: <T extends string>(collection: Set<T> | Record<T, any> | Map<T, any> | readonly T[], value: string) => value is T;
export declare const cloneJSON: <T>(obj: T) => T;
