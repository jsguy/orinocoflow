import { describe, it, expect } from "vitest";
import { parse, runWorkflow, resumeWorkflow } from "../src/index.js";
import type { WorkflowNode, WorkflowState } from "../src/index.js";
import { HN_ROAST_WORKFLOW } from "../examples/hn-roast.js";

const stubHandler = async (_node: WorkflowNode, state: WorkflowState) => state;

const stubHandlers = {
  fetch:  stubHandler,
  llm:    stubHandler,
  output: stubHandler,
};

describe("hn-roast workflow graph", () => {
  it("5.1 parses without error and has 4 nodes and 3 edges", () => {
    const workflow = parse(HN_ROAST_WORKFLOW);
    expect(workflow.nodes).toHaveLength(4);
    expect(workflow.edges).toHaveLength(3);
  });

  it("5.2 suspends at wait_for_approval", async () => {
    const workflow = parse(HN_ROAST_WORKFLOW);
    const result = await runWorkflow(workflow, {}, { handlers: stubHandlers });

    expect(result.status).toBe("suspended");
    if (result.status !== "suspended") return;
    expect(result.snapshot.suspendedAtNodeId).toBe("wait_for_approval");
  });

  it("5.3 completes after resume with stub handlers", async () => {
    const workflow = parse(HN_ROAST_WORKFLOW);
    const first = await runWorkflow(workflow, {}, { handlers: stubHandlers });
    if (first.status !== "suspended") throw new Error("expected suspended");

    const resumed = await resumeWorkflow(first.snapshot, { handlers: stubHandlers });
    expect(resumed.status).toBe("completed");
  });

  it("5.4 snapshot round-trips through JSON and resume still completes", async () => {
    const workflow = parse(HN_ROAST_WORKFLOW);
    const first = await runWorkflow(workflow, { seed: 42 }, { handlers: stubHandlers });
    if (first.status !== "suspended") throw new Error("expected suspended");

    const restored = JSON.parse(JSON.stringify(first.snapshot));
    const resumed = await resumeWorkflow(restored, { handlers: stubHandlers });

    expect(resumed.status).toBe("completed");
    if (resumed.status !== "completed") return;
    expect(resumed.state.seed).toBe(42);
  });
});
