import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import type { ExcalidrawElement, NonDeletedExcalidrawElement, ExcalidrawSelectionElement } from "../element/types";
export declare const generateRoughOptions: (element: ExcalidrawElement, continuousPath?: boolean) => Options;
/**
 * Generates the roughjs shape for given element.
 *
 * Low-level. Use `ShapeCache.generateElementShape` instead.
 *
 * @private
 */
export declare const _generateElementShape: (element: Exclude<NonDeletedExcalidrawElement, ExcalidrawSelectionElement>, generator: RoughGenerator, isExporting?: boolean) => Drawable | Drawable[] | null;
