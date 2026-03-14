import type { SuspendedExecution } from "./schemas.js";

/** Minimal interface for storing suspended workflow sessions. */
export interface SessionStore {
  get(sessionId: string): Promise<SuspendedExecution | undefined>;
  set(sessionId: string, snapshot: SuspendedExecution): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

/** In-memory implementation backed by a Map. Dev / testing only — lost on restart. */
export class MemorySessionStore implements SessionStore {
  private store = new Map<string, SuspendedExecution>();

  async get(sessionId: string) {
    return this.store.get(sessionId);
  }

  async set(sessionId: string, snapshot: SuspendedExecution) {
    this.store.set(sessionId, snapshot);
  }

  async delete(sessionId: string) {
    this.store.delete(sessionId);
  }
}
