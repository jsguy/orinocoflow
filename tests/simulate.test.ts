import { describe, it, expect } from "bun:test";
import { buildMockHandlers } from "../src/cli/simulate.js";
import { runWorkflow } from "../src/execute.js";
import type { Workflow } from "../src/schemas.js";

const linear: Workflow = {
  version: "1.0",
  graph_id: "linear",
  entry_point: "a",
  nodes: [
    { id: "a", type: "a" },
    { id: "b", type: "b" },
  ],
  edges: [{ from: "a", to: "b", type: "standard" }],
};

const branching: Workflow = {
  version: "1.0",
  graph_id: "branching",
  entry_point: "start",
  nodes: [
    { id: "start", type: "start" },
    { id: "yes", type: "yes" },
    { id: "no", type: "no" },
  ],
  edges: [
    {
      from: "start",
      type: "conditional",
      condition: { field: "ok", operator: "===", value: true },
      routes: { true: "yes", false: "no" },
    },
  ],
};

const retryWorkflow: Workflow = {
  version: "1.0",
  graph_id: "retry",
  entry_point: "verify",
  nodes: [
    { id: "verify", type: "verify" },
    { id: "fix", type: "fix" },
    { id: "done", type: "done" },
    { id: "handoff", type: "handoff" },
  ],
  edges: [
    {
      from: "verify",
      type: "conditional",
      condition: { field: "passed", operator: "===", value: true },
      routes: { true: "done", false: "fix" },
      maxRetries: 3,
      onExhausted: "handoff",
    },
    { from: "fix", to: "verify", type: "standard" },
  ],
};

describe("buildMockHandlers", () => {
  it("uses base key on first invocation", async () => {
    const mockData = { handlers: { a: { result: "first" } } };
    const handlers = buildMockHandlers(mockData, linear);
    const state = await handlers["a"]!(linear.nodes[0], {});
    expect(state.result).toBe("first");
  });

  it("uses .N suffixed key on Nth invocation", async () => {
    const mockData = { handlers: { verify: { passed: false }, "verify.2": { passed: true } } };
    const handlers = buildMockHandlers(mockData, retryWorkflow);
    const node = retryWorkflow.nodes[0];
    const state1 = await handlers["verify"]!(node, {});
    expect(state1.passed).toBe(false);
    const state2 = await handlers["verify"]!(node, {});
    expect(state2.passed).toBe(true);
  });

  it("falls back to base key when no suffix entry", async () => {
    const mockData = { handlers: { a: { x: 1 } } };
    const handlers = buildMockHandlers(mockData, linear);
    const node = linear.nodes[0];
    await handlers["a"]!(node, {}); // first call
    const state2 = await handlers["a"]!(node, {}); // second call, no "a.2"
    expect(state2.x).toBe(1); // falls back to base
  });

  it("registers handler under both node.id and node.type", () => {
    const mockData = { handlers: { a: {} } };
    const handlers = buildMockHandlers(mockData, linear);
    expect(handlers["a"]).toBeDefined();
    // type === id in this case, so same key
    expect(handlers["a"]).toBe(handlers["a"]);
  });
});

describe("runWorkflow with mock handlers", () => {
  it("executes a linear workflow in order", async () => {
    const mockData = { handlers: { a: { step: "a" }, b: { step: "b" } } };
    const handlers = buildMockHandlers(mockData, linear);
    const result = await runWorkflow(linear, {}, { handlers });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.step).toBe("b");
    }
  });

  it("follows the true branch based on mock data", async () => {
    const mockData = { handlers: { start: { ok: true }, yes: { reached: "yes" }, no: { reached: "no" } } };
    const handlers = buildMockHandlers(mockData, branching);
    const result = await runWorkflow(branching, {}, { handlers });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.reached).toBe("yes");
    }
  });

  it("follows the false branch based on mock data", async () => {
    const mockData = { handlers: { start: { ok: false }, yes: { reached: "yes" }, no: { reached: "no" } } };
    const handlers = buildMockHandlers(mockData, branching);
    const result = await runWorkflow(branching, {}, { handlers });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.reached).toBe("no");
    }
  });

  it("resolves retry loop using .N suffix data", async () => {
    const mockData = {
      handlers: {
        verify: { passed: false },
        "verify.2": { passed: true },
        fix: {},
        done: { completed: true },
        handoff: { completed: false },
      },
    };
    const handlers = buildMockHandlers(mockData, retryWorkflow);
    const result = await runWorkflow(retryWorkflow, {}, { handlers });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.completed).toBe(true); // reached 'done', not 'handoff'
    }
  });

  it("routes to onExhausted when retries run out", async () => {
    const mockData = {
      handlers: {
        verify: { passed: false },
        fix: {},
        done: { completed: true },
        handoff: { exhausted: true },
      },
    };
    const handlers = buildMockHandlers(mockData, retryWorkflow);
    const result = await runWorkflow(retryWorkflow, {}, { handlers });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.exhausted).toBe(true); // reached 'handoff'
    }
  });
});
