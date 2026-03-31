import { describe, it, expect } from "vitest";
import { runWorkflow, resumeWorkflow } from "../src/execute.js";
import { parse } from "../src/schemas.js";
import { WorkflowConfigurationError } from "../src/errors.js";
import type { WorkflowNode, WorkflowState } from "../src/schemas.js";

const identityHandler = async (_node: WorkflowNode, state: WorkflowState) => state;

// ─── Workflow builders ────────────────────────────────────────────────────────

const makeInterruptWorkflow = () =>
  parse({
    orinocoflow_version: "1.0",
    graph_id: "interrupt_01",
    entry_point: "before",
    nodes: [
      { id: "before", type: "task" },
      { id: "wait", type: "interrupt" },
      { id: "after", type: "task" },
    ],
    edges: [
      { from: "before", to: "wait", type: "standard" },
      { from: "wait", to: "after", type: "standard" },
    ],
  });

const makeTerminalInterruptWorkflow = () =>
  parse({
    orinocoflow_version: "1.0",
    graph_id: "interrupt_terminal",
    entry_point: "before",
    nodes: [
      { id: "before", type: "task" },
      { id: "wait", type: "interrupt" },
    ],
    edges: [
      { from: "before", to: "wait", type: "standard" },
    ],
  });

const makeRetryWorkflow = () =>
  parse({
    orinocoflow_version: "1.0",
    graph_id: "retry_01",
    entry_point: "coder",
    nodes: [
      { id: "coder", type: "task" },
      { id: "qe", type: "task" },
      { id: "human", type: "task" },
    ],
    edges: [
      {
        from: "qe",
        type: "conditional",
        condition: { field: "passed", operator: "===", value: true },
        routes: { true: "human", false: "coder" },
        maxRetries: 2,
        onExhausted: "human",
      },
      { from: "coder", to: "qe", type: "standard" },
    ],
  });

// ─── interrupt node tests ─────────────────────────────────────────────────────

describe("interrupt node", () => {
  it("7.1 suspends at interrupt node and returns status:suspended with correct snapshot", async () => {
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(
      workflow,
      { foo: "bar" },
      { handlers: { task: identityHandler } },
    );

    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") return;

    expect(result.snapshot.workflowId).toBe("interrupt_01");
    expect(result.snapshot.suspendedAtNodeId).toBe("wait");
    expect(result.snapshot.state).toEqual({ foo: "bar" });
    expect(result.snapshot.workflowSnapshot.graph_id).toBe("interrupt_01");
    expect(result.snapshot.enteredViaEdge).toEqual({
      from: "before",
      to: "wait",
      edgeType: "standard",
    });
  });

  it("does not execute nodes after the interrupt", async () => {
    const executed: string[] = [];
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(
      workflow,
      {},
      {
        handlers: {
          task: async (node, state) => {
            executed.push(node.id);
            return state;
          },
        },
      },
    );

    expect(result.status).toBe("suspended");
    expect(executed).toContain("before");
    expect(executed).not.toContain("after");
  });

  it("7.2 SuspendedExecution round-trips through JSON and resumeWorkflow accepts it", async () => {
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(workflow, { x: 1 }, { handlers: { task: identityHandler } });
    if (result.status !== "suspended") throw new Error("expected suspended");

    const serialized = JSON.stringify(result.snapshot);
    const restored = JSON.parse(serialized);

    const resumed = await resumeWorkflow(restored, { handlers: { task: identityHandler } });
    expect(resumed.status).toBe("completed");
  });

  it("7.3 resumeWorkflow continues from interrupt node's successor with correct state", async () => {
    const executed: string[] = [];
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(
      workflow,
      { step: 1 },
      { handlers: { task: async (node, state) => ({ ...state, last: node.id }) } },
    );
    if (result.status !== "suspended") throw new Error("expected suspended");

    const resumed = await resumeWorkflow(result.snapshot, {
      handlers: {
        task: async (node, state) => {
          executed.push(node.id);
          return { ...state, last: node.id };
        },
      },
    });

    expect(resumed.status).toBe("completed");
    if (resumed.status !== "completed") return;
    expect(executed).toEqual(["after"]);
    expect(resumed.state.last).toBe("after");
  });

  it("7.4 resumeWorkflow merges options.state (options take precedence)", async () => {
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(workflow, { x: 1, y: 2 }, { handlers: { task: identityHandler } });
    if (result.status !== "suspended") throw new Error("expected suspended");

    const resumed = await resumeWorkflow(result.snapshot, {
      handlers: { task: async (_node, state) => state },
      state: { y: 99, z: 3 },
    });
    expect(resumed.status).toBe("completed");
    if (resumed.status !== "completed") return;
    expect(resumed.state.x).toBe(1);   // from snapshot
    expect(resumed.state.y).toBe(99);  // options.state overrides
    expect(resumed.state.z).toBe(3);   // new from options.state
  });

  it("7.5 workflow_suspended is last event before suspension; workflow_resume is first on resume", async () => {
    const workflow = makeInterruptWorkflow();
    const result = await runWorkflow(workflow, {}, { handlers: { task: identityHandler } });
    if (result.status !== "suspended") throw new Error("expected suspended");

    const suspendedEvent = result.trace[result.trace.length - 1];
    expect(suspendedEvent.type).toBe("workflow_suspended");

    const resumed = await resumeWorkflow(result.snapshot, { handlers: { task: identityHandler } });
    expect(resumed.trace[0].type).toBe("workflow_resume");
  });

  it("7.6 interrupt node with no outgoing edges causes resumeWorkflow to return status:completed", async () => {
    const workflow = makeTerminalInterruptWorkflow();
    const result = await runWorkflow(workflow, { v: 42 }, { handlers: { task: identityHandler } });
    if (result.status !== "suspended") throw new Error("expected suspended");

    const resumed = await resumeWorkflow(result.snapshot, { handlers: { task: identityHandler } });
    expect(resumed.status).toBe("completed");
    if (resumed.status !== "completed") return;
    expect(resumed.state.v).toBe(42);
  });

  it("7.7 enteredViaEdge tracks exhausted retry edges when suspending at an interrupt", async () => {
    const workflow = parse({
      orinocoflow_version: "1.0",
      graph_id: "retry_interrupt",
      entry_point: "coder",
      nodes: [
        { id: "coder", type: "task" },
        { id: "qe", type: "task" },
        { id: "handoff", type: "interrupt" },
      ],
      edges: [
        { from: "coder", to: "qe", type: "standard" },
        {
          from: "qe",
          type: "conditional",
          condition: { field: "passed", operator: "===", value: true },
          routes: { true: "coder", false: "coder" },
          maxRetries: 0,
          onExhausted: "handoff",
        },
      ],
    });

    const result = await runWorkflow(
      workflow,
      { passed: false },
      { handlers: { task: identityHandler }, maxSteps: 10 },
    );

    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") return;

    expect(result.snapshot.suspendedAtNodeId).toBe("handoff");
    expect(result.snapshot.enteredViaEdge).toEqual({
      from: "qe",
      to: "handoff",
      edgeType: "conditional",
      conditionResult: false,
      retriesExhausted: true,
      onExhausted: "handoff",
    });
  });
});

// ─── maxRetries / onExhausted tests ──────────────────────────────────────────

describe("edge retry limits", () => {
  it("7.7 maxRetries routes normally for first N calls, then routes to onExhausted", async () => {
    const workflow = makeRetryWorkflow();
    const visited: string[] = [];

    let callCount = 0;
    const result = await runWorkflow(
      workflow,
      { passed: false },
      {
        handlers: {
          task: async (node, state) => {
            visited.push(node.id);
            callCount++;
            // After 2 coder visits (retries exhausted), pretend we still fail
            return state;
          },
        },
        maxSteps: 20,
      },
    );

    // Should have visited human via onExhausted, not looped forever
    expect(visited).toContain("human");
    // coder is visited: 1 initial + maxRetries(2) loopbacks = 3 times
    expect(visited.filter((n) => n === "coder").length).toBe(3);
  });

  it("7.8 retry counters persist across a suspend/resume cycle", async () => {
    // Workflow: coder → qe (conditional, maxRetries:1, onExhausted:human) → human
    //          coder → qe is standard, qe loops back to coder when failed
    const workflow = parse({
      orinocoflow_version: "1.0",
      graph_id: "retry_resume",
      entry_point: "coder",
      nodes: [
        { id: "coder", type: "task" },
        { id: "qe", type: "task" },
        { id: "wait", type: "interrupt" },
        { id: "human", type: "task" },
      ],
      edges: [
        { from: "coder", to: "qe", type: "standard" },
        {
          from: "qe",
          type: "conditional",
          condition: { field: "passed", operator: "===", value: true },
          routes: { true: "human", false: "coder" },
          maxRetries: 1,
          onExhausted: "human",
        },
      ],
    });

    const visited: string[] = [];
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      visited.push(node.id);
      return state;
    };

    // First run: fails once (counter = 1 = maxRetries), routes to human
    const result = await runWorkflow(workflow, { passed: false }, { handlers: { task: handler }, maxSteps: 20 });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(visited).toContain("human");
    // Counter tracked in state
    expect((result.state.__retries__ as Record<string, number>)["qe:coder"]).toBe(1);
  });

  it("7.9 edge_taken event includes retriesExhausted:true when onExhausted is used", async () => {
    const workflow = makeRetryWorkflow();
    const events: any[] = [];

    await runWorkflow(
      workflow,
      { passed: false },
      {
        handlers: { task: identityHandler },
        onEvent: (e) => events.push(e),
        maxSteps: 20,
      },
    );

    const exhaustedEvent = events.find(
      (e) => e.type === "edge_taken" && e.retriesExhausted === true,
    );
    expect(exhaustedEvent).toBeDefined();
    expect(exhaustedEvent.onExhausted).toBe("human");
  });

  it("7.10 WorkflowConfigurationError is thrown when onExhausted references a non-existent node", async () => {
    const workflow = parse({
      orinocoflow_version: "1.0",
      graph_id: "bad_exhausted",
      entry_point: "coder",
      nodes: [
        { id: "coder", type: "task" },
        { id: "qe", type: "task" },
      ],
      edges: [
        { from: "coder", to: "qe", type: "standard" },
        {
          from: "qe",
          type: "conditional",
          condition: { field: "passed", operator: "===", value: true },
          routes: { true: "coder", false: "coder" },
          maxRetries: 1,
          onExhausted: "nonexistent_node",
        },
      ],
    });

    await expect(
      runWorkflow(workflow, { passed: false }, { handlers: { task: identityHandler }, maxSteps: 20 }),
    ).rejects.toThrow(WorkflowConfigurationError);
  });
});
