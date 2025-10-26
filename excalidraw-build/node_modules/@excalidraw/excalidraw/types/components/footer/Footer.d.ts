import { ActionManager } from "../../actions/manager";
import { UIAppState } from "../../types";
declare const Footer: {
    ({ appState, actionManager, showExitZenModeBtn, renderWelcomeScreen, }: {
        appState: UIAppState;
        actionManager: ActionManager;
        showExitZenModeBtn: boolean;
        renderWelcomeScreen: boolean;
    }): JSX.Element;
    displayName: string;
};
export default Footer;
