import { describe, it, expect } from "vitest";
import { runWorkflow } from "../src/execute.js";
import { parse } from "../src/schemas.js";
import { SubWorkflowNotFoundError } from "../src/errors.js";
import type { WorkflowNode, WorkflowState } from "../src/schemas.js";

const SUB_WORKFLOW_JSON = {
  orinocoflow_version: "1.0",
  graph_id: "sub_01",
  entry_point: "sub_step",
  nodes: [{ id: "sub_step", type: "task" }],
  edges: [],
};

const MAIN_WORKFLOW_JSON = {
  orinocoflow_version: "1.0",
  graph_id: "main_01",
  entry_point: "entry",
  nodes: [
    { id: "entry", type: "task" },
    { id: "sub_node", type: "sub_workflow", workflow_id: "sub_01" },
    { id: "exit", type: "task" },
  ],
  edges: [
    { from: "entry", to: "sub_node", type: "standard" },
    { from: "sub_node", to: "exit", type: "standard" },
  ],
};

describe("sub_workflow nodes", () => {
  const visited: string[] = [];
  const handler = async (node: WorkflowNode, state: WorkflowState) => {
    visited.push(node.id);
    return state;
  };

  it("executes sub-workflow nodes inline", async () => {
    visited.length = 0;
    const workflow = parse(MAIN_WORKFLOW_JSON);
    await runWorkflow(workflow, {}, {
      handlers: { task: handler },
      registry: { sub_01: SUB_WORKFLOW_JSON },
    });
    expect(visited).toContain("sub_step");
    expect(visited).toContain("exit");
  });

  it("prefixes sub-workflow event nodeIds with parent nodeId", async () => {
    visited.length = 0;
    const workflow = parse(MAIN_WORKFLOW_JSON);
    const result = await runWorkflow(workflow, {}, {
      handlers: { task: handler },
      registry: { sub_01: SUB_WORKFLOW_JSON },
    });
    if (result.status !== "completed") throw new Error("expected completed");
    const { trace } = result;

    const subNodeEvent = trace.find(
      (e) => e.type === "node_start" && (e as any).nodeId === "sub_node/sub_step",
    );
    expect(subNodeEvent).toBeDefined();
  });

  it("propagates sub-workflow final state to parent", async () => {
    const workflow = parse(MAIN_WORKFLOW_JSON);
    const enrichingHandler = async (node: WorkflowNode, state: WorkflowState) => ({
      ...state,
      [node.id]: true,
    });
    const result = await runWorkflow(workflow, {}, {
      handlers: { task: enrichingHandler },
      registry: { sub_01: SUB_WORKFLOW_JSON },
    });
    if (result.status !== "completed") throw new Error("expected completed");
    const { state } = result;
    expect(state["sub_step"]).toBe(true);
    expect(state["exit"]).toBe(true);
  });

  it("throws SubWorkflowNotFoundError when workflow_id not in registry", async () => {
    const workflow = parse(MAIN_WORKFLOW_JSON);
    await expect(
      runWorkflow(workflow, {}, {
        handlers: { task: handler },
        registry: {},
      }),
    ).rejects.toThrow(SubWorkflowNotFoundError);
  });
});

describe("sub_workflow suspension propagation", () => {
  const CHILD_WITH_INTERRUPT = {
    orinocoflow_version: "1.0",
    graph_id: "child_suspend",
    entry_point: "child_task",
    nodes: [
      { id: "child_task", type: "task" },
      { id: "pause", type: "interrupt" },
    ],
    edges: [{ from: "child_task", to: "pause", type: "standard" }],
  };

  const PARENT_WITH_SUB = {
    orinocoflow_version: "1.0",
    graph_id: "parent_suspend",
    entry_point: "setup",
    nodes: [
      { id: "setup", type: "task" },
      { id: "sub_node", type: "sub_workflow", workflow_id: "child_suspend" },
      { id: "after", type: "task" },
    ],
    edges: [
      { from: "setup", to: "sub_node", type: "standard" },
      { from: "sub_node", to: "after", type: "standard" },
    ],
  };

  it("returns suspended when sub-workflow hits an interrupt node", async () => {
    const workflow = parse(PARENT_WITH_SUB);
    const result = await runWorkflow(workflow, {}, {
      handlers: { task: async (_node, state) => state },
      registry: { child_suspend: CHILD_WITH_INTERRUPT },
    });
    expect(result.status).toBe("suspended");
  });

  it("snapshot state includes parent state accumulated before sub-workflow", async () => {
    const workflow = parse(PARENT_WITH_SUB);
    const result = await runWorkflow(workflow, {}, {
      handlers: {
        task: async (node, state) => ({ ...state, [node.id]: true }),
      },
      registry: { child_suspend: CHILD_WITH_INTERRUPT },
    });
    if (result.status !== "suspended") throw new Error("expected suspended");
    expect(result.snapshot.state["setup"]).toBe(true);
  });
});
