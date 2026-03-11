import { parse, runWorkflow } from "../src/index.js";
import type { WorkflowNode, WorkflowState } from "../src/index.js";

// ─── Workflow JSON ────────────────────────────────────────────────────────────

const PR_PIPELINE = {
  version: "1.0",
  graph_id: "pr_pipeline_01",
  entry_point: "read_email",
  nodes: [
    { id: "read_email", type: "integration", action: "imap_fetch" },
    { id: "draft_content", type: "llm", model: "gpt-4" },
    { id: "human_review", type: "human_task" },
    { id: "generate_image", type: "llm_image" },
    { id: "review_context_step", type: "sub_workflow", workflow_id: "review_context_01" },
    { id: "publish_story", type: "local_script", script_path: "./publish.sh" },
  ],
  edges: [
    { from: "read_email", to: "draft_content", type: "standard" },
    {
      from: "draft_content",
      type: "conditional",
      condition: { field: "confidence_score", operator: "<", value: 75 },
      routes: { true: "human_review", false: "generate_image" },
    },
    { from: "human_review", to: "generate_image", type: "standard" },
    { from: "generate_image", to: "review_context_step", type: "standard" },
    { from: "review_context_step", to: "publish_story", type: "standard" },
  ],
};

const REVIEW_CONTEXT = {
  version: "1.0",
  graph_id: "review_context_01",
  entry_point: "editorial_check",
  nodes: [
    { id: "editorial_check", type: "llm_evaluator" },
    { id: "format_html", type: "data_transform" },
  ],
  edges: [{ from: "editorial_check", to: "format_html", type: "standard" }],
};

// ─── Stub handlers ────────────────────────────────────────────────────────────

const stubHandler = async (node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  console.log(`  [${node.type}] ${node.id}`);
  return state;
};

// llm_image handler simulates async image generation
const generateImageHandler = async (node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  console.log(`  [${node.type}] ${node.id} — generating image (async, 500ms)`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return state;
};

// integration handler simulates fetching an email
const integrationHandler = async (node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  console.log(`  [${node.type}] ${node.id} — fetching email`);
  return { ...state, email_body: "Write a story about the ocean" };
};

// LLM handler simulates drafting content (low confidence -> triggers human review)
const llmHandler = async (node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  console.log(`  [${node.type}] ${node.id} — drafting content (score: ${state.confidence_score})`);
  return { ...state, draft: "Once upon a time..." };
};

const handlers: Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>> = {
  integration: integrationHandler,
  llm: llmHandler,
  human_task: stubHandler,
  llm_image: generateImageHandler,
  local_script: stubHandler,
  llm_evaluator: stubHandler,
  data_transform: stubHandler,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const scoreArg = process.argv[2];
  const confidenceScore = scoreArg !== undefined ? Number(scoreArg) : 40;

  console.log("Parsing pr_pipeline...");
  const workflow = parse(PR_PIPELINE);
  console.log(`Parsed — ${workflow.edges.length} edges, ${workflow.nodes.length} nodes\n`);

  const path = confidenceScore < 75 ? "human_review" : "generate_image";
  console.log(`Running workflow (confidence_score=${confidenceScore} → ${path} path):`);
  const { state, trace } = await runWorkflow(workflow, { confidence_score: confidenceScore }, {
    handlers,
    registry: { review_context_01: REVIEW_CONTEXT },
  });

  console.log("\nTrace:");
  for (const event of trace) {
    if (event.type === "edge_taken") {
      console.log(`  -> edge_taken: ${event.from} -> ${event.to} [${event.edgeType}]${event.conditionResult !== undefined ? ` (condition=${event.conditionResult})` : ""}`);
    } else if (event.type === "workflow_complete") {
      console.log(`  workflow_complete in ${event.durationMs}ms`);
    }
  }

  console.log("\nFinal state:", state);
}

main().catch(console.error);
