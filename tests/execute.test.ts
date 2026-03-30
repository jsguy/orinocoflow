import { describe, it, expect, vi } from "vitest";
import { runWorkflow, runWorkflowStream } from "../src/execute.js";
import { parse } from "../src/schemas.js";
import {
  WorkflowCycleError,
  WorkflowAbortedError,
  WorkflowConfigurationError,
} from "../src/errors.js";
import type { WorkflowNode, WorkflowState } from "../src/schemas.js";

const makeLinearWorkflow = () =>
  parse({
    orinocoflow_version: "1.0",
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
      orinocoflow_version: "1.0",
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
      orinocoflow_version: "1.0",
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
      orinocoflow_version: "1.0",
      graph_id: "missing_01",
      entry_point: "ghost",
      nodes: [],
      edges: [],
    });
    await expect(
      runWorkflow(workflow, {}, { handlers: {} }),
    ).rejects.toThrow("Node not found");
  });

  const makeParallelWorkflow = () =>
    parse({
      orinocoflow_version: "1.0",
      graph_id: "par_01",
      entry_point: "pre",
      nodes: [
        { id: "pre", type: "task" },
        { id: "fan", type: "task" },
        { id: "branch_a", type: "task" },
        { id: "branch_b", type: "task" },
        { id: "join", type: "task" },
      ],
      edges: [
        { from: "pre", to: "fan", type: "standard" },
        { from: "fan", type: "parallel", targets: ["branch_a", "branch_b"], join: "join" },
        { from: "branch_a", to: "join", type: "standard" },
        { from: "branch_b", to: "join", type: "standard" },
      ],
    });

  it("runs parallel branches and merges state at join", async () => {
    const workflow = makeParallelWorkflow();
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      if (node.id === "branch_a") return { ...state, a: 1 };
      if (node.id === "branch_b") return { ...state, b: 2 };
      return state;
    };
    const { state, trace } = await runCompleted(workflow, { base: true }, { handlers: { task: handler } });
    expect(state.base).toBe(true);
    expect(state.a).toBe(1);
    expect(state.b).toBe(2);
    expect(trace.some((e) => e.type === "parallel_fork")).toBe(true);
    expect(trace.some((e) => e.type === "parallel_join")).toBe(true);
    const joinIdx = trace.findIndex((e) => e.type === "parallel_join");
    const completeIdx = trace.findIndex((e) => e.type === "workflow_complete");
    expect(completeIdx).toBeGreaterThan(joinIdx);
  });

  it("runs parallel branches concurrently (overlap in time)", async () => {
    const workflow = makeParallelWorkflow();
    let overlap = false;
    let active = 0;
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      if (node.id !== "branch_a" && node.id !== "branch_b") return state;
      active++;
      if (active >= 2) overlap = true;
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return state;
    };
    await runCompleted(workflow, {}, { handlers: { task: handler } });
    expect(overlap).toBe(true);
  });

  it("throws WorkflowConfigurationError on strict parallel merge conflict", async () => {
    const workflow = makeParallelWorkflow();
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      if (node.id === "branch_a" || node.id === "branch_b") return { ...state, x: node.id === "branch_a" ? 1 : 2 };
      return state;
    };
    await expect(
      runWorkflow(workflow, {}, { handlers: { task: handler }, parallelMerge: "strict" }),
    ).rejects.toThrow(WorkflowConfigurationError);
  });

  it("overwrites on parallel merge when parallelMerge is overwrite", async () => {
    const workflow = makeParallelWorkflow();
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      if (node.id === "branch_a" || node.id === "branch_b") return { ...state, x: node.id === "branch_a" ? 1 : 2 };
      return state;
    };
    const { state } = await runCompleted(workflow, {}, { handlers: { task: handler }, parallelMerge: "overwrite" });
    expect(state.x).toBe(2);
  });

  it("aborts sibling branches on first failure (fail-fast)", async () => {
    const workflow = parse({
      orinocoflow_version: "1.0",
      graph_id: "par_fail",
      entry_point: "pre",
      nodes: [
        { id: "pre", type: "task" },
        { id: "fan", type: "task" },
        { id: "branch_a", type: "task" },
        { id: "b1", type: "task" },
        { id: "b2", type: "task" },
        { id: "join", type: "task" },
      ],
      edges: [
        { from: "pre", to: "fan", type: "standard" },
        { from: "fan", type: "parallel", targets: ["branch_a", "b1"], join: "join" },
        { from: "branch_a", to: "join", type: "standard" },
        { from: "b1", to: "b2", type: "standard" },
        { from: "b2", to: "join", type: "standard" },
      ],
    });
    let b2Ran = false;
    const handler = async (node: WorkflowNode, state: WorkflowState) => {
      if (node.id === "branch_a") throw new Error("boom");
      if (node.id === "b1") await new Promise((r) => setTimeout(r, 30));
      if (node.id === "b2") b2Ran = true;
      return state;
    };
    await expect(runWorkflow(workflow, {}, { handlers: { task: handler } })).rejects.toThrow("boom");
    expect(b2Ran).toBe(false);
  });

  it("emits parallel_branch_error before failing", async () => {
    const workflow = makeParallelWorkflow();
    const trace: import("../src/schemas.js").WorkflowEvent[] = [];
    const handler = async (node: WorkflowNode) => {
      if (node.id === "branch_b") throw new Error("branch fail");
      return {};
    };
    await expect(
      runWorkflow(workflow, {}, {
        handlers: { task: handler },
        onEvent: (e) => trace.push(e),
      }),
    ).rejects.toThrow();
    expect(trace.some((e) => e.type === "parallel_branch_error")).toBe(true);
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
      orinocoflow_version: "1.0",
      graph_id: "verify_01",
      entry_point: "my-verify",
      nodes: [{ id: "my-verify", type: "verify" }],
      edges: [],
    });

  it("type handler takes priority when both type and id are registered", async () => {
    const typeCalled = vi.fn(() => ({}));
    const idCalled = vi.fn(() => ({}));
    const workflow = makeVerifyWorkflow();
    await runWorkflow(workflow, {}, { handlers: { verify: typeCalled, "my-verify": idCalled } });
    expect(typeCalled).toHaveBeenCalledTimes(1);
    expect(idCalled).not.toHaveBeenCalled();
  });

  it("id handler used as fallback when type is not registered", async () => {
    const idCalled = vi.fn(() => ({}));
    const workflow = makeVerifyWorkflow();
    await expect(
      runWorkflow(workflow, {}, { handlers: { "my-verify": idCalled } })
    ).resolves.toBeDefined();
    expect(idCalled).toHaveBeenCalledTimes(1);
  });
});
