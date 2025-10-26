import { Action } from "./types";
import History from "../history";
type ActionCreator = (history: History) => Action;
export declare const createUndoAction: ActionCreator;
export declare const createRedoAction: ActionCreator;
export {};
