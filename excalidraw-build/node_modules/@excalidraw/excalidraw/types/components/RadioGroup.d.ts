import "./RadioGroup.scss";
export type RadioGroupChoice<T> = {
    value: T;
    label: string;
};
export type RadioGroupProps<T> = {
    choices: RadioGroupChoice<T>[];
    value: T;
    onChange: (value: T) => void;
    name: string;
};
export declare const RadioGroup: <T>({ onChange, value, choices, name, }: RadioGroupProps<T>) => JSX.Element;
