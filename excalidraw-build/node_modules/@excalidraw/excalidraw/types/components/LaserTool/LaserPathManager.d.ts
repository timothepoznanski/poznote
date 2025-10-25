import { LaserPointer } from "@excalidraw/laser-pointer";
import App from "../App";
declare global {
    interface Window {
        LPM: LaserPathManager;
    }
}
export declare class LaserPathManager {
    private app;
    private ownState;
    private collaboratorsState;
    private rafId;
    private isDrawing;
    private container;
    constructor(app: App);
    destroy(): void;
    startPath(x: number, y: number): void;
    addPointToPath(x: number, y: number): void;
    endPath(): void;
    private updatePath;
    private isRunning;
    start(svg?: SVGSVGElement): void;
    stop(): void;
    loop(): void;
    draw(path: LaserPointer): string;
    updateCollabolatorsState(): void;
    update(): void;
}
