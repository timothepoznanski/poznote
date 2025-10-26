type Subscriber<T extends any[]> = (...payload: T) => void;
export declare class Emitter<T extends any[] = []> {
    subscribers: Subscriber<T>[];
    value: T | undefined;
    private updateOnChangeOnly;
    constructor(opts?: {
        initialState?: T;
        updateOnChangeOnly?: boolean;
    });
    /**
     * Attaches subscriber
     *
     * @returns unsubscribe function
     */
    on(...handlers: Subscriber<T>[] | Subscriber<T>[][]): () => void;
    off(...handlers: Subscriber<T>[] | Subscriber<T>[][]): void;
    trigger(...payload: T): any[];
    destroy(): void;
}
export {};
