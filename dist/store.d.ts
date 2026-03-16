import type { SuspendedExecution } from "./schemas.js";
/** Minimal interface for storing suspended workflow sessions. */
export interface SessionStore {
    get(sessionId: string): Promise<SuspendedExecution | undefined>;
    set(sessionId: string, snapshot: SuspendedExecution): Promise<void>;
    delete(sessionId: string): Promise<void>;
}
/** In-memory implementation backed by a Map. Dev / testing only — lost on restart. */
export declare class MemorySessionStore implements SessionStore {
    private store;
    get(sessionId: string): Promise<SuspendedExecution<import("./schemas.js").WorkflowState> | undefined>;
    set(sessionId: string, snapshot: SuspendedExecution): Promise<void>;
    delete(sessionId: string): Promise<void>;
}
