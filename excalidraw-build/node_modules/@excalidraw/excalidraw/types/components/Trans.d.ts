import React from "react";
import { TranslationKeys } from "../i18n";
declare const Trans: ({ i18nKey, children, ...props }: {
    [key: string]: React.ReactNode | ((el: React.ReactNode) => React.ReactNode);
    i18nKey: TranslationKeys;
}) => React.FunctionComponentElement<{
    children?: React.ReactNode;
}>;
export default Trans;
