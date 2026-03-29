# orinocoflow

Minimalist TypeScript workflow engine for AI pipelines. Define workflows as JSON, supply handlers, get streaming execution events.

![Orinocoflow birdy](https://raw.githubusercontent.com/jsguy/orinocoflow/main/src/orinocoflow-logo.png)

## What do you get?

- **Workflows as data** — JSON/YAML files you can diff, version, visualise, and hand to an LLM
- **Versioned schema** — `version` field on every workflow; breaking changes are detectable at parse time, not at runtime
- **No framework lock-in** — zero AI dependencies; handlers are plain async functions
- **HITL without a database** — suspend to a JSON snapshot, store it wherever you want, resume later
- **CLI tooling** — `oflow viz`, `oflow compile`, `oflow simulate` work without writing code
- **Declarative routing** — conditional edges are data expressions, not hidden function logic
- **Built-in retry escalation** — `maxRetries` + `onExhausted` on any conditional edge, tracked automatically
- **Node specs** — optional YAML/JSON files that describe what each node type expects and produces; useful for documentation, test scaffolding, and LLM-assisted workflow authoring

## Install

**Requirements:** Node.js 18+.

```sh
npm install orinocoflow
```

## Quick start

```ts
import { parse, runWorkflow } from "orinocoflow";

const workflow = parse({
  version: "1.0",
  graph_id: "my_pipeline",
  entry_point: "fetch",
  nodes: [
    { id: "fetch",    type: "integration" },
    { id: "draft",    type: "llm" },
    { id: "publish",  type: "local_script" },
  ],
  edges: [
    { from: "fetch",  to: "draft",   type: "standard" },
    { from: "draft",  to: "publish", type: "standard" },
  ],
});

const result = await runWorkflow(workflow, { url: "https://example.com" }, {
  handlers: {
    integration: async (node, state) => ({ ...state, body: "<fetched>" }),
    llm:         async (node, state) => ({ ...state, draft: "Once upon a time..." }),
    local_script: async (node, state) => { console.log("publishing"); return state; },
  },
});
if (result.status === "completed") {
  console.log(result.state);
}
```

## Run the examples

**HN Roast — Human-in-the-loop demo (TypeScript):**

Fetches today's #1 Hacker News story, calls Claude to write a spicy hot take, then **suspends** and waits for you to approve before doing anything with it. Demonstrates orinocoflow's suspend/resume mechanic with real API calls.

```sh
npm install
```

No API keys? Run it in simulation mode (uses static mock data, zero network calls):

```sh
npx tsx src/cli/index.ts simulate examples/hn-roast.yaml examples/hn-roast.mock.yaml
```

With a real Claude API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...

# Step 1: fetch the story, generate the draft, then suspend
npx tsx examples/hn-roast.ts

# Step 2: read the draft, then approve and publish
npx tsx examples/hn-roast.ts --resume /tmp/hn-roast-snap.json
```

The workflow pauses at the `interrupt` node and serialises its state to `/tmp/hn-roast-snap.json`. Nothing is published until you explicitly resume — that's the whole point.

---

**PR pipeline (TypeScript):**

```sh
npm install
npx tsx examples/pr_pipeline.ts 40
```

This runs a simulated content publishing pipeline with stub handlers, printing each node execution and the full event trace to stdout.
The parameter "40" sets the confidence score, make it > 80 to skip the HITL step.

**oflow CLI (YAML/JSON workflow files):**

```sh
# Scaffold a new workflow from a template (basic / standard / advanced)
npx tsx src/cli/index.ts create my-pipeline.yaml

# Skip the picker and specify a template directly
npx tsx src/cli/index.ts create my-pipeline.yaml --template standard

# Generate a mock data file from an existing workflow
npx tsx src/cli/index.ts create mock.yaml --from my-pipeline.yaml

# Validate a workflow file and print the compiled JSON
npx tsx src/cli/index.ts compile examples/odt-pipeline.yaml

# Render an ASCII DAG of the workflow
npx tsx src/cli/index.ts viz examples/odt-pipeline.yaml

# Dry-run with mock handler data, printing a step-by-step trace
npx tsx src/cli/index.ts simulate examples/odt-pipeline.yaml examples/mock.yaml
```

Once installed as a package with `npm install orinocoflow`, the binary is available as `oflow`:

```sh
# Create a workflow from a template (prompts to choose if --template omitted)
oflow create my-pipeline.yaml
oflow create my-pipeline.yaml --template basic     # linear steps, no branching
oflow create my-pipeline.yaml --template standard  # conditional logic + retry
oflow create my-pipeline.yaml --template advanced  # sub-workflows (creates 2 files)

# Generate a mock data file matched to your workflow's nodes
# For retry nodes, pre-fills the condition field with fail/succeed values
oflow create mock.yaml --from my-pipeline.yaml

oflow compile workflow.yaml
oflow viz workflow.yaml
oflow simulate workflow.yaml mock.yaml
```

All generated workflow files include inline comments explaining the schema, TypeScript handler pattern, and how to wire everything up — making them easy to hand to an AI coding assistant.

## Streaming

Two interfaces — pick whichever fits your code style.

**Callback (`onEvent`)** — pass a handler in options, execution proceeds normally:

```ts
const result = await runWorkflow(workflow, initialState, {
  handlers,
  onEvent(event) {
    switch (event.type) {
      case "node_start":    console.log(`starting ${event.nodeId}`); break;
      case "node_complete": console.log(`done in ${event.durationMs}ms`); break;
      case "edge_taken":    console.log(`→ ${event.from} to ${event.to}`); break;
      case "workflow_complete": console.log("final state:", event.finalState); break;
      case "workflow_suspended": console.log(`suspended at ${event.nodeId}`); break;
      case "error":         console.error(event.error); break;
    }
  },
});
```

**Async iterable (`runWorkflowStream`)** — iterate events with `for await`:

```ts
import { parse, runWorkflowStream } from "orinocoflow";

for await (const event of runWorkflowStream(workflow, initialState, { handlers })) {
  switch (event.type) {
    case "node_start":    console.log(`starting ${event.nodeId}`); break;
    case "node_complete": console.log(`done in ${event.durationMs}ms`); break;
    case "edge_taken":    console.log(`→ ${event.from} to ${event.to}`); break;
    case "workflow_complete": console.log("final state:", event.finalState); break;
    case "error":         console.error(event.error); break;
  }
}
```

## JSON schema

### Workflow

```json
{
  "version": "1.0",
  "graph_id": "my_pipeline",
  "entry_point": "node_id",
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

### Node

Any object with `id` and `type`. Extra fields are passed through to your handler.

```json
{ "id": "draft_content", "type": "llm", "model": "gpt-4" }
```

Built-in node type: `"sub_workflow"` — requires a `workflow_id` field pointing to an entry in the `registry` option.

### Edges

**Standard** — always routes to `to`:
```json
{ "from": "fetch", "to": "draft", "type": "standard" }
```

**Conditional** — evaluates `condition` against the current state, routes to `true` or `false` branch:
```json
{
  "from": "draft",
  "type": "conditional",
  "condition": { "field": "confidence_score", "operator": "<", "value": 75 },
  "routes": { "true": "human_review", "false": "publish" }
}
```

Supported operators: `<` `>` `<=` `>=` `===` `!==` `includes` `startsWith` `endsWith`

### Node spec (optional)

A node spec describes the contract for a node type — what config it accepts, what state fields it reads, and what it writes. Specs are purely documentary; the runtime does not enforce them.

```yaml
node_type: fetch
description: Fetches the top HN story and its top comments
outputs:
  - name: story_title
    type: string
    description: Title of the top HN story
  - name: comments
    type: array
    description: Up to 5 top comments as plain strings
```

```yaml
node_type: llm
description: Drafts a roast of the story using Claude
config:
  model:
    type: string
    required: false
    description: Model override (defaults to claude-haiku)
inputs:
  - name: story_title
    type: string
    required: true
  - name: comments
    type: array
    required: true
outputs:
  - name: roast
    type: string
    description: Short punchy hot take
```

Parse and validate a spec with `parseNodeSpec`:

```ts
import { parseNodeSpec } from "orinocoflow";
import { parse as yamlParse } from "yaml";
import { readFileSync } from "node:fs";

const spec = parseNodeSpec(yamlParse(readFileSync("node-specs/llm.yaml", "utf8")));
console.log(spec.node_type);   // "llm"
console.log(spec.outputs);     // [{ name: "roast", type: "string", ... }]
```

See `examples/node-specs/` for complete examples covering the `fetch`, `llm`, `interrupt`, and `output` node types from the HN Roast workflow.

## API

```ts
// Parse raw JSON/YAML into a typed Workflow
parse(raw: unknown): Workflow

// Parse raw JSON/YAML into a typed NodeSpec
parseNodeSpec(raw: unknown): NodeSpec

// Run workflow — returns WorkflowResult (completed or suspended)
runWorkflow(workflow, initialState, options): Promise<WorkflowResult>

// Resume a suspended workflow from a SuspendedExecution snapshot
resumeWorkflow(snapshot, resumeOptions): Promise<WorkflowResult>

// Stream workflow events via for-await
runWorkflowStream(workflow, initialState, options): AsyncIterable<WorkflowEvent>
```

### RunOptions

```ts
{
  handlers:  Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>>;
  registry?: Record<string, unknown>;              // workflow_id → raw JSON for sub_workflow nodes
  maxSteps?: number;                               // cycle guard, default 1000
  signal?:   AbortSignal;                          // cancellation
  onEvent?:  (event: WorkflowEvent) => void;       // callback-based streaming
}
```

Handlers are matched by `node.type`, falling back to `node.id`.

## Sub-workflows

Register sub-workflow JSON in `registry`, then reference via `workflow_id` on a `sub_workflow` node. The child workflow streams events with the parent node ID as a prefix (`"parent_node/child_node"`), and its final state merges into the parent's state.

```ts
await runWorkflow(mainWorkflow, {}, {
  handlers,
  registry: {
    "review_context_01": reviewContextJson,
  },
});
```

## Human-in-the-loop (pause / resume)

**orinocoflow does not store sessions.** Add an `interrupt` node anywhere in your workflow to pause execution. `runWorkflow` returns `{ status: "suspended", snapshot }` — a plain JSON-serializable `SuspendedExecution` object. You are responsible for storing it and retrieving it when the external event arrives.

The `SessionStore` interface defines the contract:

```ts
import type { SessionStore } from "orinocoflow";

// interface SessionStore {
//   get(id: string): Promise<SuspendedExecution | undefined>
//   set(id: string, snapshot: SuspendedExecution): Promise<void>
//   delete(id: string): Promise<void>
// }
```

orinocoflow ships a `MemorySessionStore` (Map-backed) for dev/testing:

```ts
import { parse, runWorkflow, resumeWorkflow, MemorySessionStore } from "orinocoflow";

const sessions = new MemorySessionStore(); // swap for Postgres/Firestore/Redis adapter

const workflow = parse({
  version: "1.0",
  graph_id: "hitl_pipeline",
  entry_point: "draft",
  nodes: [
    { id: "draft",   type: "llm" },
    { id: "review",  type: "interrupt" },   // <-- pauses here
    { id: "publish", type: "local_script" },
  ],
  edges: [
    { from: "draft",  to: "review",  type: "standard" },
    { from: "review", to: "publish", type: "standard" },
  ],
});

// First run — suspends at "review"
const result = await runWorkflow(workflow, {}, { handlers });
if (result.status === "suspended") {
  const sessionId = crypto.randomUUID();
  await sessions.set(sessionId, result.snapshot);
  // → send sessionId to human (email, Slack, webhook)
}

// Later — webhook / API handler:
const snapshot = await sessions.get(sessionId);
const resumed = await resumeWorkflow(snapshot, {
  handlers,
  state: { approved: true },   // merged onto snapshot state
});
if (resumed.status === "completed") {
  console.log("published:", resumed.state);
}
await sessions.delete(sessionId);
```

`interrupt` nodes require no handler — the engine handles suspension automatically. `MemorySessionStore` is lost on process restart. For production, implement `SessionStore` against your preferred store (Postgres JSONB column, Firestore document, Redis `SETEX`, etc.).

## Retry limits on conditional edges

Add `maxRetries` and `onExhausted` to any `ConditionalEdge` to automatically escalate after N loopbacks:

```json
{
  "from": "qe",
  "type": "conditional",
  "condition": { "field": "passed", "operator": "===", "value": true },
  "routes": { "true": "done", "false": "coder" },
  "maxRetries": 3,
  "onExhausted": "human_review"
}
```

The engine tracks retry counts in `state.__retries__` (a reserved namespace). Once the loopback branch has been taken `maxRetries` times, routing falls through to `onExhausted` instead. Retry state survives pause/resume cycles automatically since it lives in the workflow state.

The `edge_taken` event includes `retriesExhausted: true` and `onExhausted: "<nodeId>"` when the limit is hit.

## Cancellation

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

await runWorkflow(workflow, state, { handlers, signal: controller.signal });
// throws WorkflowAbortedError if cancelled mid-run
```
