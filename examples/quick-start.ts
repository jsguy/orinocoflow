/**
 * Minimal linear pipeline — same example as the README Quick start.
 * From repo root: npx tsx examples/quick-start.ts
 *
 * Handlers parse the seed URL, build a short summary string, then log it (no network).
 */
import { parse, runWorkflow } from "../src/index.js";

async function main() {
  const workflow = parse({
    orinocoflow_version: "1.0",
    graph_id: "my_pipeline",
    entry_point: "fetch",
    nodes: [
      { id: "fetch", type: "integration" },
      { id: "draft", type: "llm" },
      { id: "publish", type: "local_script" },
    ],
    edges: [
      { from: "fetch", to: "draft", type: "standard" },
      { from: "draft", to: "publish", type: "standard" },
    ],
  });

  const result = await runWorkflow(workflow, { url: "https://example.com/docs/guide" }, {
    handlers: {
      integration: async (_node, state) => {
        const u = new URL(String(state.url));
        return { ...state, host: u.hostname, path: u.pathname || "/" };
      },
      llm: async (_node, state) => ({
        ...state,
        draft: `Page on ${state.host}: path has ${String(state.path).length} chars (${state.path})`,
      }),
      local_script: async (_node, state) => {
        console.log("Publishing →", state.draft);
        return { ...state, published: true };
      },
    },
  });

  if (result.status === "completed") {
    console.log("Final state:", result.state);
  }
}

main().catch(console.error);
