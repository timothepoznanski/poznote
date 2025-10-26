import "./TextInput.scss";
import "./ProjectName.scss";
type Props = {
    value: string;
    onChange: (value: string) => void;
    label: string;
    isNameEditable: boolean;
    ignoreFocus?: boolean;
};
export declare const ProjectName: (props: Props) => JSX.Element;
export {};
