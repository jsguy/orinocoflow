# orinocoflow

Minimalist TypeScript workflow engine for AI pipelines. Define workflows as JSON, supply handlers, get streaming execution events.

![Orinocoflow birdy](https://raw.githubusercontent.com/jsguy/orinocoflow/main/src/orinocoflow-logo.png)

## What do you get?

- **Workflows as data** — JSON/YAML files you can diff, version, visualise, and hand to an LLM
- **Versioned schema** — optional `orinocoflow_version` on each workflow for engine compatibility; omit it if you do not need an explicit marker. (A generic `version` key is not read — use `orinocoflow_version`.)
- **No framework lock-in** — zero AI dependencies; handlers are plain async functions
- **HITL without a database** — suspend to a JSON snapshot, store it wherever you want, resume later
- **CLI tooling** — `oflow viz`, `oflow compile`, `oflow simulate` work without writing code
- **Declarative routing** — conditional edges are data expressions, not hidden function logic
- **Built-in retry escalation** — `maxRetries` + `onExhausted` on any conditional edge, tracked automatically
- **Node specs** — optional YAML/JSON files that describe what each node type expects and produces; useful for documentation, test scaffolding, and LLM-assisted workflow authoring

**Examples:** Full runnable scripts, CLI commands, and file-by-file notes are in [README-examples.md](README-examples.md).

## Install

**Requirements:** Node.js 18+.

```sh
npm install orinocoflow
```

## Quick start

[`examples/quick-start.ts`](examples/quick-start.ts) is the full runnable version (parse URL → fake "LLM" line → log). From a **git clone** at the repo root: `npx tsx examples/quick-start.ts`. Step-by-step: [README-examples.md](README-examples.md).

Minimal shape in code:

```ts
import { parse, runWorkflow } from "orinocoflow";

const workflow = parse({ /* graph_id, entry_point, nodes, edges */ });
const result = await runWorkflow(workflow, initialState, { handlers: { /* by node.type */ } });
```

## Programmatic compile (files on disk)

The package exports **`orinocoflow/compile`** for loading workflows without the CLI:

```ts
import { compileFile, transformYamlToWorkflow } from "orinocoflow/compile";

const workflow = await compileFile("pipeline.yaml");
// or: transformYamlToWorkflow(parsedYamlDoc)  // object already in memory
```

`compileFile` accepts **`.yaml`**, **`.yml`**, or **`.json`** paths and returns a typed `Workflow`.

## Run the examples

Examples are **not** in the npm tarball; clone the repo, `npm install`, and use **`cwd` at the repo root**. Full commands, file lists, and behavior notes: **[README-examples.md](README-examples.md)** (includes `quick-start`, `parallel`, HN Roast, PR pipeline, `odt-pipeline` + `mock.yaml`, and `node-specs/`).

Illustrative CLI usage (after `npm run build`, `oflow` works like `npx tsx src/cli/index.ts` during development):

```sh
oflow compile examples/odt-pipeline.yaml
oflow viz examples/odt-pipeline.yaml
oflow simulate examples/odt-pipeline.yaml examples/mock.yaml
```

### Mock data for `simulate`

`oflow simulate <workflow> <mock-file>` expects YAML or JSON with a top-level **`handlers`** object. Each key is a **node id**; the value is an object merged into workflow state when that node runs.

- First visit to a node uses the key equal to its id (e.g. `verify:`).
- **Nth visit** (loops, retries): use **`nodeId.N`** (e.g. `verify.2:`) to override state on the second invocation. See [`examples/mock.yaml`](examples/mock.yaml) and [README-examples.md](README-examples.md).

## Streaming

Two interfaces — pick whichever fits your code style.

**Callback (`onEvent`)** — pass a handler in options, execution proceeds normally:

```ts
const result = await runWorkflow(workflow, initialState, {
  handlers,
  onEvent(event) {
    switch (event.type) {
      case "workflow_start":  console.log(`run ${event.workflowId} from ${event.entryPoint}`); break;
      case "node_start":    console.log(`starting ${event.nodeId}`); break;
      case "node_complete": console.log(`done in ${event.durationMs}ms`); break;
      case "edge_taken":    console.log(`→ ${event.from} to ${event.to}`); break;
      case "parallel_fork": console.log(`parallel ${event.from} → [${event.targets.join(", ")}] → ${event.join}`); break;
      case "parallel_join": console.log(`parallel join ${event.join}`); break;
      case "parallel_branch_error": console.error(`branch ${event.branchEntry}:`, event.error); break;
      case "workflow_complete": console.log("final state:", event.finalState); break;
      case "workflow_suspended": console.log(`suspended at ${event.nodeId}`); break;
      case "workflow_resume": console.log("resuming after interrupt"); break;
      case "error":         console.error(event.error); break;
    }
  },
});
```

**Async iterable (`runWorkflowStream`)** — iterate events with `for await`. If the run aborts or hits a fatal error, the async iterator **rejects** (same errors as `runWorkflow`, e.g. `WorkflowAbortedError`).

```ts
import { parse, runWorkflowStream } from "orinocoflow";

for await (const event of runWorkflowStream(workflow, initialState, { handlers })) {
  switch (event.type) {
    case "workflow_start":  console.log(`run ${event.workflowId} from ${event.entryPoint}`); break;
    case "node_start":    console.log(`starting ${event.nodeId}`); break;
    case "node_complete": console.log(`done in ${event.durationMs}ms`); break;
    case "edge_taken":    console.log(`→ ${event.from} to ${event.to}`); break;
    case "parallel_fork": console.log(`parallel ${event.from} → [${event.targets.join(", ")}] → ${event.join}`); break;
    case "parallel_join": console.log(`parallel join ${event.join}`); break;
    case "parallel_branch_error": console.error(`branch ${event.branchEntry}:`, event.error); break;
    case "workflow_complete": console.log("final state:", event.finalState); break;
    case "workflow_suspended": console.log(`suspended at ${event.nodeId}`); break;
    case "workflow_resume": console.log("resuming after interrupt"); break;
    case "error":         console.error(event.error); break;
  }
}
```

## JSON schema

### Workflow

```json
{
  "orinocoflow_version": "1.0",
  "graph_id": "my_pipeline",
  "entry_point": "node_id",
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

`orinocoflow_version` is **optional**; when present it documents which engine/schema shape you target. Required fields are `graph_id`, `entry_point`, `nodes`, and `edges`.

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

**Parallel (fork / join)** — run multiple **standard-only** linear branches concurrently, then continue once at `join`:

```json
{
  "from": "fanout",
  "type": "parallel",
  "targets": ["branch_a", "branch_b"],
  "join": "merge"
}
```

Each target must reach `join` through a **straight chain of standard edges** (no conditionals or nested parallel on those paths). **Only those branch tips** may have a standard edge into `join` — no other shortcuts. `compile` / `validateParallelWorkflow` enforce this. Branches use **`structuredClone`** of state; use **`parallelMerge`**: `"strict"` (default, top-level key conflicts throw) or `"overwrite"`. On the first branch failure, sibling branches are **aborted between nodes** (best-effort); the trace may include **`parallel_branch_error`**. If a branch does not converge to `join` at runtime, the engine throws **`ParallelBranchDidNotConvergeError`**.

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

// Validate parallel regions and single-outgoing rule (also runs inside compile / runWorkflow)
validateParallelWorkflow(workflow: Workflow): void

// Parse raw JSON/YAML into a typed NodeSpec
parseNodeSpec(raw: unknown): NodeSpec

// Run workflow — returns WorkflowResult (completed or suspended)
runWorkflow(workflow, initialState, options): Promise<WorkflowResult>

// Resume a suspended workflow from a SuspendedExecution snapshot
resumeWorkflow(snapshot, resumeOptions): Promise<WorkflowResult>

// Stream workflow events via for-await
runWorkflowStream(workflow, initialState, options): AsyncIterable<WorkflowEvent>
```

### WorkflowResult

Both `runWorkflow` and `resumeWorkflow` return a result with a **`trace`**: an array of every `WorkflowEvent` emitted during that call (useful for logging, tests, or UI replay).

- `{ status: "completed"; state; trace }`
- `{ status: "suspended"; snapshot; trace }`

### RunOptions

```ts
{
  handlers:  Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>>;
  registry?: Record<string, unknown>;              // workflow_id → raw JSON for sub_workflow nodes
  maxSteps?: number;                               // cycle guard, default 1000
  signal?:   AbortSignal;                          // cancellation
  onEvent?:  (event: WorkflowEvent) => void;       // callback-based streaming
  parallelMerge?: "strict" | "overwrite";           // after parallel fork, default "strict"
}
```

Handlers are matched by `node.type`, falling back to `node.id`.

### ResumeOptions

Same execution knobs as `RunOptions` where relevant, plus optional state to merge onto the snapshot:

```ts
{
  handlers:  Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>>;
  state?:     WorkflowState;                       // merged on top of snapshot.state (wins on key clashes)
  registry?: Record<string, unknown>;
  maxSteps?: number;
  signal?:   AbortSignal;
  onEvent?:  (event: WorkflowEvent) => void;
}
```

### Advanced / low-level exports

For custom tooling or tests, the package also exports **error classes** (`NodeNotFoundError`, `HandlerError`, `WorkflowCycleError`, `WorkflowAbortedError`, `InvalidEdgeError`, `SubWorkflowNotFoundError`, `WorkflowConfigurationError`), **Zod schemas** (`WorkflowSchema`, `EdgeSchema`, …), and router helpers **`evaluateOperator`** / **`resolveNextNode`**.

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

The `SessionStore` interface defines the contract (`get` / `set` / `delete` by session id). orinocoflow ships **`MemorySessionStore`** (Map-backed) for dev/testing.

Resume with merged state:

```ts
const resumed = await resumeWorkflow(snapshot, {
  handlers,
  state: { approved: true }, // merged onto snapshot.state
});
```

`interrupt` nodes require no handler — the engine handles suspension automatically. A **full** store-and-resume walkthrough (workflow JSON + `parse` + `runWorkflow` + `MemorySessionStore`) is in [README-examples.md — Human-in-the-loop pattern](README-examples.md#human-in-the-loop-pattern). A live demo with network + Claude: [HN Roast](README-examples.md#hn-roast).

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

## Development

From a clone of this repo:

```sh
npm install
npm run build    # generates dist/; required for bin/oflow and local package resolution
npm test         # vitest
npm run typecheck
```

The published npm tarball contains `dist/`, `README.md`, and `README-examples.md` (`prepublishOnly` runs `build`). Contributors use `npx tsx …` paths as in [Run the examples](#run-the-examples) when iterating without reinstalling.

## Cancellation

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

await runWorkflow(workflow, state, { handlers, signal: controller.signal });
// throws WorkflowAbortedError if cancelled mid-run
```
