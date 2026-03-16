import { describe, it, expect } from "vitest";
import { MemorySessionStore } from "../src/store.js";
import type { SuspendedExecution } from "../src/schemas.js";
import { parse } from "../src/schemas.js";

const makeSnapshot = (): SuspendedExecution => ({
  workflowId: "test-workflow",
  suspendedAtNodeId: "pause",
  state: { step: 1, data: "hello" },
  workflowSnapshot: parse({
    version: "1.0",
    graph_id: "test-workflow",
    entry_point: "a",
    nodes: [{ id: "a", type: "a" }, { id: "pause", type: "interrupt" }],
    edges: [{ from: "a", to: "pause", type: "standard" }],
  }),
});

describe("MemorySessionStore", () => {
  it("get returns undefined on empty store", async () => {
    const store = new MemorySessionStore();
    expect(await store.get("missing")).toBeUndefined();
  });

  it("get returns undefined for an unknown key even after other keys are set", async () => {
    const store = new MemorySessionStore();
    await store.set("other", makeSnapshot());
    expect(await store.get("missing")).toBeUndefined();
  });

  it("set and get round-trip with a real SuspendedExecution", async () => {
    const store = new MemorySessionStore();
    const snap = makeSnapshot();
    await store.set("session-1", snap);
    const retrieved = await store.get("session-1");
    expect(retrieved).toEqual(snap);
  });

  it("set overwrites an existing entry", async () => {
    const store = new MemorySessionStore();
    const snap1 = makeSnapshot();
    const snap2 = { ...makeSnapshot(), state: { step: 2, overwritten: true } };
    await store.set("session-1", snap1);
    await store.set("session-1", snap2);
    expect(await store.get("session-1")).toEqual(snap2);
  });

  it("delete makes a stored entry return undefined", async () => {
    const store = new MemorySessionStore();
    await store.set("session-1", makeSnapshot());
    await store.delete("session-1");
    expect(await store.get("session-1")).toBeUndefined();
  });

  it("delete on a non-existent key is a no-op", async () => {
    const store = new MemorySessionStore();
    await expect(store.delete("never-existed")).resolves.toBeUndefined();
  });

  it("all three methods return Promises", () => {
    const store = new MemorySessionStore();
    const snap = makeSnapshot();
    expect(store.set("x", snap)).toBeInstanceOf(Promise);
    expect(store.get("x")).toBeInstanceOf(Promise);
    expect(store.delete("x")).toBeInstanceOf(Promise);
  });
});
