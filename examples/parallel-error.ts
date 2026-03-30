/**
 * Parallel fork with a failing branch: three branches run concurrently; one throws after 500ms,
 * the other two finish sooner. Handles rejection gracefully and prints successful branch payloads
 * from `node_complete` events in the trace.
 *
 * From repo root: npx tsx examples/parallel-error.ts
 */
import { parse, runWorkflow } from "../src/index.js";
import type { WorkflowEvent, WorkflowNode, WorkflowState } from "../src/index.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runParallelDemo(): Promise<{ trace: WorkflowEvent[]; error: unknown | undefined }> {
  const workflow = parse({
    orinocoflow_version: "1.0",
    graph_id: "parallel_error_demo",
    entry_point: "fan",
    nodes: [
      { id: "fan", type: "task" },
      { id: "branch_a", type: "task" },
      { id: "branch_b", type: "task" },
      { id: "branch_c", type: "task" },
      { id: "join", type: "task" },
    ],
    edges: [
      { from: "fan", type: "parallel", targets: ["branch_a", "branch_b", "branch_c"], join: "join" },
      { from: "branch_a", to: "join", type: "standard" },
      { from: "branch_b", to: "join", type: "standard" },
      { from: "branch_c", to: "join", type: "standard" },
    ],
  });

  const trace: WorkflowEvent[] = [];

  const task = async (node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
    switch (node.id) {
      case "fan":
        return { ...state, phase: "forking" };
      case "branch_a": {
        await delay(80);
        return {
          ...state,
          resultA: { status: "ok", label: "alpha", computedAt: Date.now() },
        };
      }
      case "branch_b": {
        await delay(500);
        throw new Error("branch_b simulated failure after 500ms");
      }
      case "branch_c": {
        await delay(120);
        return {
          ...state,
          resultC: { status: "ok", label: "charlie", computedAt: Date.now() },
        };
      }
      case "join":
        return state;
      default:
        return state;
    }
  };

  let error: unknown | undefined;
  try {
    await runWorkflow(workflow, { runId: crypto.randomUUID() }, {
      handlers: { task },
      onEvent: (e) => {
        trace.push(e);
      },
    });
  } catch (err) {
    error = err;
  }

  return { trace, error };
}

function summarizeSuccessfulBranches(trace: WorkflowEvent[]) {
  const byBranch = new Map<string, Record<string, unknown>>();

  for (const e of trace) {
    if (e.type !== "node_complete") continue;
    const shortId = e.nodeId.replace(/^fan\//, "");
    if (shortId === "branch_a" || shortId === "branch_c") {
      byBranch.set(shortId, e.state as Record<string, unknown>);
    }
  }

  return byBranch;
}

async function main(): Promise<void> {
  console.log("Running parallel workflow (branch_b fails after 500ms; branch_a ~80ms, branch_c ~120ms)…\n");

  const { trace, error } = await runParallelDemo();

  if (error === undefined) {
    console.log("Unexpected: workflow completed without error.\n");
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.log("Handled: run stopped because a parallel branch failed (expected).");
  console.log(`  Reported error: ${message}\n`);

  const successes = summarizeSuccessfulBranches(trace);

  console.log("Successful branches (state at node_complete):");
  for (const [branch, state] of successes) {
    const payload = branch === "branch_a" ? state.resultA : state.resultC;
    console.log(`  ${branch}:`, JSON.stringify(payload, null, 2));
  }

  const branchErr = trace.find(
    (e): e is Extract<WorkflowEvent, { type: "parallel_branch_error" }> => e.type === "parallel_branch_error",
  );

  if (branchErr) {
    console.log("\nparallel_branch_error event:");
    console.log(`  branchEntry: ${branchErr.branchEntry}`);
    console.log(`  message: ${branchErr.error.message}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
