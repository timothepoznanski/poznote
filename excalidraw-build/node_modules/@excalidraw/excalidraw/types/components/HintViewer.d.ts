import { AppClassProperties, Device, UIAppState } from "../types";
import "./HintViewer.scss";
interface HintViewerProps {
    appState: UIAppState;
    isMobile: boolean;
    device: Device;
    app: AppClassProperties;
}
export declare const HintViewer: ({ appState, isMobile, device, app, }: HintViewerProps) => JSX.Element | null;
export {};
