import { describe, it, expect, mock } from "bun:test";
import { runWorkflow, runWorkflowStream } from "../src/execute.js";
import { parse } from "../src/schemas.js";
import { WorkflowCycleError, WorkflowAbortedError } from "../src/errors.js";
import type { WorkflowNode, WorkflowState } from "../src/schemas.js";

const makeLinearWorkflow = () =>
  parse({
    version: "1.0",
    graph_id: "linear_01",
    entry_point: "step_a",
    nodes: [
      { id: "step_a", type: "task" },
      { id: "step_b", type: "task" },
      { id: "step_c", type: "task" },
    ],
    edges: [
      { from: "step_a", to: "step_b", type: "standard" },
      { from: "step_b", to: "step_c", type: "standard" },
    ],
  });

const identityHandler = async (_node: WorkflowNode, state: WorkflowState) => state;

// Helper: assert completed and unwrap
async function runCompleted(
  ...args: Parameters<typeof runWorkflow>
) {
  const result = await runWorkflow(...args);
  if (result.status !== "completed") throw new Error("Expected completed, got suspended");
  return result;
}

describe("runWorkflow", () => {
  it("executes linear workflow and returns final state", async () => {
    const workflow = makeLinearWorkflow();
    const { state, trace } = await runCompleted(
      workflow,
      { value: 42 },
      { handlers: { task: identityHandler } },
    );
    expect(state).toEqual({ value: 42 });
    expect(trace.some((e) => e.type === "workflow_complete")).toBe(true);
  });

  it("emits workflow_start, node_start, node_complete, edge_taken, workflow_complete", async () => {
    const workflow = makeLinearWorkflow();
    const { trace } = await runCompleted(
      workflow,
      {},
      { handlers: { task: identityHandler } },
    );
    const types = trace.map((e) => e.type);
    expect(types).toContain("workflow_start");
    expect(types).toContain("node_start");
    expect(types).toContain("node_complete");
    expect(types).toContain("edge_taken");
    expect(types).toContain("workflow_complete");
  });

  it("calls handlers with correct node and state", async () => {
    const workflow = makeLinearWorkflow();
    const seen: string[] = [];
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      seen.push(node.id);
      return { ...state, visited: [...((state.visited as string[]) ?? []), node.id] };
    };
    const { state } = await runCompleted(workflow, {}, { handlers: { task: handler } });
    expect(seen).toEqual(["step_a", "step_b", "step_c"]);
    expect(state.visited).toEqual(["step_a", "step_b", "step_c"]);
  });

  it("follows conditional edges correctly", async () => {
    const workflow = parse({
      version: "1.0",
      graph_id: "cond_01",
      entry_point: "start",
      nodes: [
        { id: "start", type: "task" },
        { id: "low", type: "task" },
        { id: "high", type: "task" },
      ],
      edges: [
        {
          from: "start",
          type: "conditional",
          condition: { field: "score", operator: "<", value: 50 },
          routes: { true: "low", false: "high" },
        },
      ],
    });

    const seen: string[] = [];
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      seen.push(node.id);
      return state;
    };

    await runWorkflow(workflow, { score: 30 }, { handlers: { task: handler } });
    expect(seen).toEqual(["start", "low"]);

    seen.length = 0;
    await runWorkflow(workflow, { score: 80 }, { handlers: { task: handler } });
    expect(seen).toEqual(["start", "high"]);
  });

  it("throws WorkflowCycleError when maxSteps exceeded", async () => {
    const workflow = parse({
      version: "1.0",
      graph_id: "cycle_01",
      entry_point: "a",
      nodes: [{ id: "a", type: "task" }, { id: "b", type: "task" }],
      edges: [
        { from: "a", to: "b", type: "standard" },
        { from: "b", to: "a", type: "standard" },
      ],
    });
    await expect(
      runWorkflow(workflow, {}, { handlers: { task: identityHandler }, maxSteps: 5 }),
    ).rejects.toThrow(WorkflowCycleError);
  });

  it("throws WorkflowAbortedError when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const workflow = makeLinearWorkflow();
    await expect(
      runWorkflow(workflow, {}, {
        handlers: { task: identityHandler },
        signal: controller.signal,
      }),
    ).rejects.toThrow(WorkflowAbortedError);
  });

  it("throws NodeNotFoundError for missing node", async () => {
    const workflow = parse({
      version: "1.0",
      graph_id: "missing_01",
      entry_point: "ghost",
      nodes: [],
      edges: [],
    });
    await expect(
      runWorkflow(workflow, {}, { handlers: {} }),
    ).rejects.toThrow("Node not found");
  });
});

describe("runWorkflowStream", () => {
  it("is an async generator", async () => {
    const workflow = makeLinearWorkflow();
    const stream = runWorkflowStream(workflow, {}, { handlers: { task: identityHandler } });
    expect(typeof stream[Symbol.asyncIterator]).toBe("function");
  });

  it("yields events in correct order for linear workflow", async () => {
    const workflow = makeLinearWorkflow();
    const events: string[] = [];
    for await (const event of runWorkflowStream(workflow, {}, { handlers: { task: identityHandler } })) {
      events.push(event.type);
    }
    expect(events[0]).toBe("workflow_start");
    expect(events[events.length - 1]).toBe("workflow_complete");
  });
});

describe("handler resolution", () => {
  const makeVerifyWorkflow = () =>
    parse({
      version: "1.0",
      graph_id: "verify_01",
      entry_point: "my-verify",
      nodes: [{ id: "my-verify", type: "verify" }],
      edges: [],
    });

  it("type handler takes priority when both type and id are registered", async () => {
    const typeCalled = mock(() => ({}));
    const idCalled = mock(() => ({}));
    const workflow = makeVerifyWorkflow();
    await runWorkflow(workflow, {}, { handlers: { verify: typeCalled, "my-verify": idCalled } });
    expect(typeCalled).toHaveBeenCalledTimes(1);
    expect(idCalled).not.toHaveBeenCalled();
  });

  it("id handler used as fallback when type is not registered", async () => {
    const idCalled = mock(() => ({}));
    const workflow = makeVerifyWorkflow();
    await expect(
      runWorkflow(workflow, {}, { handlers: { "my-verify": idCalled } })
    ).resolves.toBeDefined();
    expect(idCalled).toHaveBeenCalledTimes(1);
  });
});
