# orinocoflow

Minimalist TypeScript workflow engine for AI pipelines. Define workflows as JSON, supply handlers, get streaming execution events.

## Install

```sh
npm install orinocoflow
# or
bun add orinocoflow
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

const { state } = await runWorkflow(workflow, { url: "https://example.com" }, {
  handlers: {
    integration: async (node, state) => ({ ...state, body: "<fetched>" }),
    llm:         async (node, state) => ({ ...state, draft: "Once upon a time..." }),
    local_script: async (node, state) => { console.log("publishing"); return state; },
  },
});
```

## Run the example

To run the included PR pipeline example:

```sh
bun install
bun run examples/pr_pipeline.ts 40
```

This runs a simulated content publishing pipeline with stub handlers, printing each node execution and the full event trace to stdout.
The parameter "40" sets the confidence score, make it > 80 to skip the HITL step.

## Streaming

Two interfaces — pick whichever fits your code style.

**Callback (`onEvent`)** — pass a handler in options, execution proceeds normally:

```ts
const { state, trace } = await runWorkflow(workflow, initialState, {
  handlers,
  onEvent(event) {
    switch (event.type) {
      case "node_start":    console.log(`starting ${event.nodeId}`); break;
      case "node_complete": console.log(`done in ${event.durationMs}ms`); break;
      case "edge_taken":    console.log(`→ ${event.from} to ${event.to}`); break;
      case "workflow_complete": console.log("final state:", event.finalState); break;
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

## API

```ts
// Parse raw JSON into a typed Workflow
parse(raw: unknown): Workflow

// Run workflow — returns final state + full trace; onEvent fires as execution proceeds
runWorkflow(workflow, initialState, options): Promise<{ state, trace }>

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

## Cancellation

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

await runWorkflow(workflow, state, { handlers, signal: controller.signal });
// throws WorkflowAbortedError if cancelled mid-run
```
