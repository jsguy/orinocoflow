import * as readline from "readline";
import { writeFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { compileFile } from "./compile.js";

// ─── Template YAML strings ────────────────────────────────────────────────────

const BASIC_YAML = `\
# ═══════════════════════════════════════════════════════════════════════════════
# orinocoflow — basic workflow template
# ═══════════════════════════════════════════════════════════════════════════════
#
# A simple linear pipeline: each step runs unconditionally after the previous.
# Use this when your workflow has no branching logic.
#
# ─── Quick start ───────────────────────────────────────────────────────────────
#
#   oflow viz    <this-file>                   visualise the workflow as ASCII art
#   oflow compile <this-file>                  validate and output compiled JSON
#   oflow simulate <this-file> <mock-file>     dry-run with mock handler data
#
#   Create a mock data file:
#   oflow create mock.yaml --from <this-file>
#
# ─── TypeScript usage ──────────────────────────────────────────────────────────
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow = await compileFile("this-file.yaml");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       fetch:    async (node, state) => ({ ...state, data: await myFetch() }),
#       process:  async (node, state) => ({ ...state, result: transform(state.data) }),
#       complete: async (node, state) => { await save(state.result); return state; },
#     },
#   });
#
#   if (result.status === "completed") console.log(result.state);
#
# ─── Handler rules ─────────────────────────────────────────────────────────────
#
#   - Handlers are matched by node.type first, then node.id
#   - Always return { ...state, ...newFields } — never mutate state directly
#   - State accumulates: each step sees all fields set by previous steps
#   - Extra node fields (e.g. url: "...") are accessible as node.fieldName
#
# ───────────────────────────────────────────────────────────────────────────────

orinocoflow_version: "1.0"
graph_id: my-pipeline       # unique identifier for this workflow
entry_point: fetch           # id of the first node to run

nodes:
  - id: fetch
    type: fetch
    # Extra fields here are passed to your handler as node.someField:
    # url: "https://api.example.com/data"

  - id: process
    type: process

  - id: complete
    type: complete

edges:
  # Standard edges always route to the next node — no conditions.
  - from: fetch
    to: process
    type: standard

  - from: process
    to: complete
    type: standard
`;

const STANDARD_YAML = `\
# ═══════════════════════════════════════════════════════════════════════════════
# orinocoflow — standard workflow template
# ═══════════════════════════════════════════════════════════════════════════════
#
# A pipeline with conditional branching and automatic retry limits.
# Use this when steps can succeed or fail and failures should be retried.
#
# ─── Quick start ───────────────────────────────────────────────────────────────
#
#   oflow viz    <this-file>                   visualise the workflow as ASCII art
#   oflow compile <this-file>                  validate and output compiled JSON
#   oflow simulate <this-file> <mock-file>     dry-run with mock handler data
#
#   Create a mock data file:
#   oflow create mock.yaml --from <this-file>
#
# ─── TypeScript usage ──────────────────────────────────────────────────────────
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow = await compileFile("this-file.yaml");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       fetch:    async (node, state) => ({ ...state, data: await myFetch() }),
#       // validate must set state.is_valid = true or false
#       validate: async (node, state) => ({ ...state, is_valid: await check(state.data) }),
#       fix:      async (node, state) => ({ ...state, data: await repair(state.data) }),
#       publish:  async (node, state) => { await publish(state.data); return state; },
#       escalate: async (node, state) => { await alert(state); return state; },
#     },
#   });
#
#   if (result.status === "completed") console.log(result.state);
#
# ─── Conditional edges ─────────────────────────────────────────────────────────
#
#   A conditional edge reads state[field], applies the operator, and routes to
#   either routes.true or routes.false.
#
#   Supported operators: === !== < > <= >= includes startsWith endsWith
#
# ─── Retry limits ──────────────────────────────────────────────────────────────
#
#   maxRetries: N     — allow the false route at most N times before escalating
#   onExhausted: id   — node to route to once retries run out
#
#   Retry counts are tracked automatically in state.__retries__ (reserved key).
#
# ───────────────────────────────────────────────────────────────────────────────

orinocoflow_version: "1.0"
graph_id: my-pipeline
entry_point: fetch

nodes:
  - id: fetch
    type: fetch

  - id: validate
    type: validate
    # This handler must set state.is_valid = true | false

  - id: fix
    type: fix

  - id: publish
    type: publish
    # Terminal node — no outgoing edge

  - id: escalate
    type: escalate
    # Terminal node — reached when validation retries are exhausted

edges:
  - from: fetch
    to: validate
    type: standard

  # Conditional edge: routes on state.is_valid after validate runs.
  #
  #   is_valid === true  → publish
  #   is_valid === false → fix  (up to 3 times, then escalate)
  - from: validate
    type: conditional
    condition:
      field: is_valid           # key your handler sets in state
      operator: "==="
      value: true
    routes:
      "true": publish           # condition evaluated to true
      "false": fix              # condition evaluated to false
    maxRetries: 3               # allow false route at most 3 times
    onExhausted: escalate       # go here when retries run out

  - from: fix
    to: validate
    type: standard              # loops back to validate after each fix attempt
`;

function advancedMainYaml(subPath: string): string {
  return `\
# ═══════════════════════════════════════════════════════════════════════════════
# orinocoflow — advanced workflow template (main)
# ═══════════════════════════════════════════════════════════════════════════════
#
# A workflow that delegates part of its logic to a reusable sub-workflow.
# Sub-workflows run inline, emit events prefixed with the parent node ID, and
# merge their final state back into the parent workflow state.
#
# ─── Quick start ───────────────────────────────────────────────────────────────
#
#   oflow viz    <this-file>                   visualise the main workflow
#   oflow viz    ${subPath}  visualise the sub-workflow
#   oflow compile <this-file>                  validate the main workflow
#
# ─── TypeScript usage ──────────────────────────────────────────────────────────
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow    = await compileFile("this-file.yaml");
#   const subWorkflow = await compileFile("${subPath}");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       // Handlers for main workflow nodes:
#       intake:   async (node, state) => ({ ...state, received: true }),
#       finalise: async (node, state) => ({ ...state, done: true }),
#
#       // Handlers for sub-workflow nodes go here too (matched by type):
#       check:     async (node, state) => ({ ...state, checked: true }),
#       score:     async (node, state) => ({ ...state, score: 85 }),
#       recommend: async (node, state) => ({ ...state, recommendation: "approve" }),
#
#       // sub_workflow nodes need no handler — the engine runs them automatically.
#     },
#     registry: {
#       "review-pipeline": subWorkflow,   // key must match workflow_id below
#     },
#   });
#
# ─── Sub-workflow events ────────────────────────────────────────────────────────
#
#   Events from sub-workflow nodes are prefixed with the parent node ID:
#     "deep-review/check", "deep-review/score", "deep-review/recommend"
#
#   The sub-workflow's final state merges into the parent state automatically.
#
# ───────────────────────────────────────────────────────────────────────────────

orinocoflow_version: "1.0"
graph_id: my-pipeline
entry_point: intake

nodes:
  - id: intake
    type: intake

  # sub_workflow node: runs review-pipeline inline when reached.
  # Provide the compiled sub-workflow JSON in the registry option at runtime.
  - id: deep-review
    type: sub_workflow
    workflow_id: review-pipeline    # must match a key in the registry option

  - id: finalise
    type: finalise

edges:
  - from: intake
    to: deep-review
    type: standard

  - from: deep-review
    to: finalise
    type: standard
`;
}

const ADVANCED_SUB_YAML = `\
# ═══════════════════════════════════════════════════════════════════════════════
# orinocoflow — advanced workflow template (sub-workflow: review-pipeline)
# ═══════════════════════════════════════════════════════════════════════════════
#
# This sub-workflow is referenced by the main workflow.
# It runs when the deep-review node executes in the parent workflow.
#
# Register it at runtime:
#   registry: { "review-pipeline": await compileFile("this-file.yaml") }
#
# ───────────────────────────────────────────────────────────────────────────────

orinocoflow_version: "1.0"
graph_id: review-pipeline     # must match workflow_id in the parent workflow
entry_point: check

nodes:
  - id: check
    type: check

  - id: score
    type: score

  - id: recommend
    type: recommend

edges:
  - from: check
    to: score
    type: standard

  - from: score
    to: recommend
    type: standard
`;

const MOCK_YAML = `\
# ═══════════════════════════════════════════════════════════════════════════════
# orinocoflow — mock data template
# ═══════════════════════════════════════════════════════════════════════════════
#
# Used with: oflow simulate <workflow-file> <this-file>
#
# Each key under "handlers" is a node id. The value is data the simulator
# merges into workflow state when that node runs.
#
# ─── Invocation suffixes ────────────────────────────────────────────────────────
#
#   node:    data returned on every call (default fallback)
#   node.2:  data returned specifically on the 2nd call
#   node.3:  data returned specifically on the 3rd call
#
#   Use .N keys to simulate retry scenarios where a node first fails then
#   recovers on a later attempt:
#
#   validate:
#     is_valid: false      # fails on first call
#   validate.2:
#     is_valid: true       # succeeds on second call (after one fix attempt)
#
# ─── Usage ─────────────────────────────────────────────────────────────────────
#
#   oflow simulate my-pipeline.yaml this-file.yaml
#
# ───────────────────────────────────────────────────────────────────────────────

handlers:
  # Replace these with your workflow's node ids. Set the fields your
  # conditional edges depend on. Empty {} means the node returns no new state.
  step_one: {}
  step_two: {}
  step_three: {}

  # Retry example — uncomment and adapt for a node that loops:
  # step_two:
  #   result: false
  # step_two.2:
  #   result: true
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedFile {
  path: string;
  content: string;
}

interface TemplateSpec {
  description: string;
  generate: (outputPath: string) => GeneratedFile[];
}

// ─── Template registry ────────────────────────────────────────────────────────

const TEMPLATES: Record<string, TemplateSpec> = {
  basic: {
    description: "Linear steps, no branching",
    generate: (outputPath) => [{ path: outputPath, content: render(BASIC_YAML, outputPath) }],
  },
  standard: {
    description: "Conditional logic and retry",
    generate: (outputPath) => [{ path: outputPath, content: render(STANDARD_YAML, outputPath) }],
  },
  advanced: {
    description: "Sub-workflows for modular composition",
    generate: (outputPath) => {
      const subPath = outputPath.replace(/(\.[^.]+)$/, "-review$1");
      return [
        { path: outputPath, content: render(advancedMainYaml(subPath), outputPath) },
        { path: subPath, content: render(ADVANCED_SUB_YAML, subPath) },
      ];
    },
  },
  mock: {
    description: "Mock data file for oflow simulate",
    generate: (outputPath) => [{ path: outputPath, content: MOCK_YAML }],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function render(yamlContent: string, outputPath: string): string {
  const ext = outputPath.split(".").pop()?.toLowerCase();
  if (ext === "json") {
    return JSON.stringify(yamlParse(yamlContent), null, 2);
  }
  return yamlContent;
}

async function promptTemplateChoice(): Promise<string> {
  const names = Object.keys(TEMPLATES).filter((n) => n !== "mock");

  console.log("");
  for (let i = 0; i < names.length; i++) {
    const t = TEMPLATES[names[i]];
    console.log(`  ${i + 1}  ${names[i].padEnd(12)}${t.description}`);
  }
  console.log("");

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Select template [1-${names.length}]: `, (answer) => {
      rl.close();
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < names.length) {
        resolve(names[idx]);
      } else {
        reject(new Error(`Invalid selection "${answer.trim()}": enter a number 1–${names.length}`));
      }
    });
  });
}

function printPostCreation(files: GeneratedFile[], templateName: string, fromWorkflow?: string): void {
  for (let i = 0; i < files.length; i++) {
    const label = i === 0 ? `${templateName} template` : "sub-workflow";
    console.log(`✓ Created ${files[i].path}  [${label}]`);
  }

  const workflowFile = files[0].path;

  if (templateName === "mock" || fromWorkflow) {
    const source = fromWorkflow ?? "your-pipeline.yaml";
    console.log("");
    console.log("Try this command:");
    console.log(`  oflow simulate ${source} ${workflowFile}`);
  } else {
    console.log("");
    console.log("Try these commands:");
    console.log(`  ${"oflow viz " + workflowFile}`.padEnd(50) + "— visualise your workflow");
    console.log(`  ${"oflow compile " + workflowFile}`.padEnd(50) + "— validate the schema");
    console.log(`  ${"oflow simulate " + workflowFile + " <mock-file>"}`.padEnd(50) + "— dry-run with mock data");
    console.log("");
    console.log("To scaffold a matching mock file:");
    console.log(`  oflow create mock.yaml --from ${workflowFile}`);
  }
}

// ─── Mock from workflow ───────────────────────────────────────────────────────

async function generateMockFromWorkflow(outputPath: string, workflowPath: string): Promise<GeneratedFile> {
  const workflow = await compileFile(workflowPath);

  const handlerNodes = workflow.nodes.filter(
    (n) => n.type !== "interrupt" && n.type !== "sub_workflow",
  );

  // Nodes that are the source of a conditional edge with retries — called multiple times
  const retrySourceIds = new Set(
    workflow.edges
      .filter((e) => e.type === "conditional" && e.maxRetries !== undefined)
      .map((e) => e.from),
  );

  const ext = outputPath.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    const handlers: Record<string, Record<string, unknown>> = {};
    for (const node of handlerNodes) {
      handlers[node.id] = {};
    }
    return { path: outputPath, content: JSON.stringify({ handlers }, null, 2) };
  }

  const lines: string[] = [
    `# Generated mock data for: ${workflowPath}`,
    `# Used with: oflow simulate ${workflowPath} ${outputPath}`,
    `#`,
    `# Fill in the fields your conditional edges depend on.`,
    `# Use <id>.2, <id>.3 etc. to return different data on repeated invocations.`,
    ``,
    `handlers:`,
  ];

  for (const node of handlerNodes) {
    if (retrySourceIds.has(node.id)) {
      const edge = workflow.edges.find(
        (e) => e.type === "conditional" && e.from === node.id,
      );
      if (edge?.type === "conditional") {
        const { field, operator, value } = edge.condition;
        // Compute the "failing" value (what makes the false route fire)
        const failValue =
          operator === "===" && value === true ? false
          : operator === "===" && value === false ? true
          : `<failing-value>`;
        lines.push(`  ${node.id}:`);
        lines.push(`    ${field}: ${JSON.stringify(failValue)}   # fails → retry`);
        lines.push(`  ${node.id}.2:`);
        lines.push(`    ${field}: ${JSON.stringify(value)}   # succeeds on second call`);
      } else {
        lines.push(`  ${node.id}: {}  # called multiple times — add .2/.3 variants as needed`);
      }
    } else {
      lines.push(`  ${node.id}: {}`);
    }
  }

  return { path: outputPath, content: lines.join("\n") + "\n" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runCreate(args: string[]): Promise<void> {
  const outputPath = args[0];
  if (!outputPath) {
    throw new Error("Usage: oflow create <file> [--template <name>] [--from <workflow>]");
  }

  const templateFlag = args.indexOf("--template");
  const fromFlag = args.indexOf("--from");
  const templateName = templateFlag !== -1 ? args[templateFlag + 1] : null;
  const fromWorkflow = fromFlag !== -1 ? args[fromFlag + 1] : null;

  // --from: generate mock data from an existing workflow
  if (fromWorkflow) {
    const file = await generateMockFromWorkflow(outputPath, fromWorkflow);
    await writeFile(file.path, file.content, "utf8");
    printPostCreation([file], "mock", fromWorkflow);
    return;
  }

  // Resolve template (prompt if not specified)
  let resolved = templateName;
  if (!resolved) {
    resolved = await promptTemplateChoice();
  }

  const spec = TEMPLATES[resolved];
  if (!spec) {
    throw new Error(
      `Unknown template "${resolved}". Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  const files = spec.generate(outputPath);
  for (const file of files) {
    await writeFile(file.path, file.content, "utf8");
  }

  printPostCreation(files, resolved);
}
