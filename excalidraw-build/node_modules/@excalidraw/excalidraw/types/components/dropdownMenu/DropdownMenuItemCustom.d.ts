import React from "react";
declare const DropdownMenuItemCustom: ({ children, className, selected, ...rest }: {
    children: React.ReactNode;
    className?: string | undefined;
    selected?: boolean | undefined;
} & React.HTMLAttributes<HTMLDivElement>) => JSX.Element;
export default DropdownMenuItemCustom;
