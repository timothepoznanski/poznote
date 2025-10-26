import { PrimitiveAtom } from "jotai";
export declare const jotaiScope: unique symbol;
export declare const jotaiStore: {
    get: <Value>(atom: import("jotai").Atom<Value>) => Awaited<Value> | undefined;
    asyncGet: <Value_1>(atom: import("jotai").Atom<Value_1>) => Promise<Awaited<Value_1>>;
    set: <Value_2, Update, Result extends void | Promise<void>>(atom: import("jotai").WritableAtom<Value_2, Update, Result>, update: Update) => Result;
    sub: (atom: import("jotai").Atom<unknown>, callback: () => void) => () => void;
    SECRET_INTERNAL_store: {
        r: <Value_3>(readingAtom: import("jotai").Atom<Value_3>, version?: import("jotai/core/store").VersionObject | undefined) => import("jotai/core/store").AtomState<Value_3>;
        w: <Value_1_1, Update_1, Result_1 extends void | Promise<void>>(writingAtom: import("jotai").WritableAtom<Value_1_1, Update_1, Result_1>, update: Update_1, version?: import("jotai/core/store").VersionObject | undefined) => Result_1;
        c: (_atom: import("jotai").Atom<unknown> | null, version?: import("jotai/core/store").VersionObject | undefined) => void;
        s: (atom: import("jotai").Atom<unknown>, callback: (version?: import("jotai/core/store").VersionObject | undefined) => void, version?: import("jotai/core/store").VersionObject | undefined) => () => void;
        h: (values: Iterable<readonly [import("jotai").Atom<unknown>, unknown]>, version?: import("jotai/core/store").VersionObject | undefined) => void;
        n: (l: () => void) => () => void;
        l: () => IterableIterator<import("jotai").Atom<unknown>>;
        a: (a: import("jotai").Atom<unknown>) => import("jotai/core/store").AtomState<unknown> | undefined;
        m: (a: import("jotai").Atom<unknown>) => {
            l: Set<(version?: import("jotai/core/store").VersionObject | undefined) => void>;
            t: Set<import("jotai").Atom<unknown>>;
            u?: (() => void) | undefined;
        } | undefined;
    } | {
        r: <Value_4>(readingAtom: import("jotai").Atom<Value_4>, version?: import("jotai/core/store").VersionObject | undefined) => import("jotai/core/store").AtomState<Value_4>;
        w: <Value_1_2, Update_2, Result_2 extends void | Promise<void>>(writingAtom: import("jotai").WritableAtom<Value_1_2, Update_2, Result_2>, update: Update_2, version?: import("jotai/core/store").VersionObject | undefined) => Result_2;
        c: (_atom: import("jotai").Atom<unknown> | null, version?: import("jotai/core/store").VersionObject | undefined) => void;
        s: (atom: import("jotai").Atom<unknown>, callback: (version?: import("jotai/core/store").VersionObject | undefined) => void, version?: import("jotai/core/store").VersionObject | undefined) => () => void;
        h: (values: Iterable<readonly [import("jotai").Atom<unknown>, unknown]>, version?: import("jotai/core/store").VersionObject | undefined) => void;
        n?: undefined;
        l?: undefined;
        a?: undefined;
        m?: undefined;
    };
};
export declare const useAtomWithInitialValue: <T extends unknown, A extends PrimitiveAtom<T>>(atom: A, initialValue: T | (() => T)) => readonly [Awaited<T>, import("jotai/core/atom").SetAtom<T | ((prev: T) => T), void>];
