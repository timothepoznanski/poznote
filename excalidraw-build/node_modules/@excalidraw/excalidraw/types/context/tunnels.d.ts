import React from "react";
import tunnel from "tunnel-rat";
export type Tunnel = ReturnType<typeof tunnel>;
type TunnelsContextValue = {
    MainMenuTunnel: Tunnel;
    WelcomeScreenMenuHintTunnel: Tunnel;
    WelcomeScreenToolbarHintTunnel: Tunnel;
    WelcomeScreenHelpHintTunnel: Tunnel;
    WelcomeScreenCenterTunnel: Tunnel;
    FooterCenterTunnel: Tunnel;
    DefaultSidebarTriggerTunnel: Tunnel;
    DefaultSidebarTabTriggersTunnel: Tunnel;
    OverwriteConfirmDialogTunnel: Tunnel;
    jotaiScope: symbol;
};
export declare const TunnelsContext: React.Context<TunnelsContextValue>;
export declare const useTunnels: () => TunnelsContextValue;
export declare const useInitializeTunnels: () => TunnelsContextValue;
export {};
