import fallbackLangData from "./locales/en.json";
import { NestedKeyOf } from "./utility-types";
export interface Language {
    code: string;
    label: string;
    rtl?: boolean;
}
export type TranslationKeys = NestedKeyOf<typeof fallbackLangData>;
export declare const defaultLang: {
    code: string;
    label: string;
};
export declare const languages: Language[];
export declare const setLanguage: (lang: Language) => Promise<void>;
export declare const getLanguage: () => Language;
export declare const t: (path: NestedKeyOf<typeof fallbackLangData>, replacement?: {
    [key: string]: string | number;
} | null | undefined, fallback?: string) => string;
export declare const useI18n: () => {
    t: (path: NestedKeyOf<typeof fallbackLangData>, replacement?: {
        [key: string]: string | number;
    } | null | undefined, fallback?: string) => string;
    langCode: string;
};
