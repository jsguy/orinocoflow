/**
 * Parallel fork/join: two branches run concurrently, state merges at `join`, then one more step.
 * From repo root: `npx tsx examples/parallel.ts`
 *
 * Graph: pre → fan → parallel [branch_a, branch_b] → join → done
 * (straight standard chains only — required by the simple parallel validator.)
 */
import { parse, runWorkflow } from "../src/index.js";

async function main() {
  const workflow = parse({
    orinocoflow_version: "1.0",
    graph_id: "parallel_demo",
    entry_point: "pre",
    nodes: [
      { id: "pre", type: "task" },
      { id: "fan", type: "task" },
      { id: "branch_a", type: "task" },
      { id: "branch_b", type: "task" },
      { id: "join", type: "task" },
      { id: "done", type: "task" },
    ],
    edges: [
      { from: "pre", to: "fan", type: "standard" },
      { from: "fan", type: "parallel", targets: ["branch_a", "branch_b"], join: "join" },
      { from: "branch_a", to: "join", type: "standard" },
      { from: "branch_b", to: "join", type: "standard" },
      { from: "join", to: "done", type: "standard" },
    ],
  });

  const result = await runWorkflow(workflow, { seed: 1 }, {
    handlers: {
      task: async (node, state) => {
        switch (node.id) {
          case "pre":
            return { ...state, phase: "before_fork" };
          case "fan":
            return { ...state, phase: "forking" };
          case "branch_a":
            await new Promise((r) => setTimeout(r, 20));
            return { ...state, branchA: "computed in parallel" };
          case "branch_b":
            await new Promise((r) => setTimeout(r, 15));
            return { ...state, branchB: "also parallel" };
          case "join":
            return { ...state, phase: "after_merge" };
          case "done":
            return { ...state, finished: true };
          default:
            return state;
        }
      },
    },
  });

  if (result.status === "completed") {
    console.log("Final state:", result.state);
    const types = result.trace.map((e) => e.type);
    console.log(
      "Events include parallel_fork / parallel_join:",
      types.includes("parallel_fork") && types.includes("parallel_join"),
    );
  }
}

main().catch(console.error);
