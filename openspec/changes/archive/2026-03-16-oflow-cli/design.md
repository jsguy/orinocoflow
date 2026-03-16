## Context

orinocoflow has a complete workflow engine (`execute.ts`, `router.ts`, `schemas.ts`) and a public API. YAML and JSON workflow files can represent the exact same `Workflow` schema — YAML is a strict syntax alternative, fully round-trippable with JSON, using identical field names and structure. The existing `parse()` Zod validator is the single source of truth for schema correctness.

## Goals / Non-Goals

**Goals:**
- Ship `oflow` binary with three commands: `compile`, `viz`, `simulate`
- Expose `compileFile` / `transformYamlToWorkflow` as public API for programmatic use
- Use the real engine in `simulate` — no mock execution logic
- Zero new abstractions unless unavoidable

**Non-Goals:**
- Friendly/shorthand YAML format (YAML mirrors JSON exactly)
- Interactive mode or watch mode
- Web UI or any rendering beyond stdout
- ODT integration (that's ODT's job, using the exported `compileFile`)

## Decisions

### 1. YAML = JSON (no transformation layer)

YAML is parsed with `yaml.parse()` and fed directly to the existing `parse()` Zod validator. There is no intermediate representation, no field remapping, no edge-merging algorithm. This means the compiler is ~10 lines and all schema validation is handled by the existing Zod schema.

_Alternative considered_: A "friendly" YAML format with shorthand edge syntax (`provision -> harness`) and aliases (`id` instead of `graph_id`). Rejected because it adds complexity, diverges from JSON, and creates a second schema to maintain.

### 2. No CLI framework — manual arg parsing

Three commands, one optional flag (`--output`). A framework like `commander` adds a dependency for ~20 lines of parsing logic. Manual parsing with `process.argv.slice(2)` is sufficient and keeps the binary lightweight.

### 3. `buildMockHandlers` takes the workflow, not just mock data

The engine resolves handlers by `node.type` first, then `node.id` (`handlers[node.type] ?? handlers[node.id]`). Mock data is keyed by node ID. To ensure handlers are found regardless of whether type and ID differ, `buildMockHandlers(mockData, workflow)` registers each handler under both the node's type and its ID. This requires the workflow to be available at handler-build time.

### 4. Viz: two-set DFS (ancestors + visited)

The visualizer must distinguish two cases when a node has already been seen:
- **`(loop)`** — the node is in the current DFS ancestor stack → true back-edge, recursion would be infinite
- **`(visited)`** — the node was rendered via a different path → merge/diamond point (e.g. `notify` reachable via `create_pr` and `handoff`)

Tracking only a single "visited" set conflates these. Two sets are required: `ancestors` (current path) and `rendered` (ever output).

### 5. `simulate` uses `onEvent` callback, not stream

`runWorkflow()` accepts an `onEvent` callback that fires synchronously as each event occurs. This is simpler than consuming `runWorkflowStream()` and sufficient for printing a sequential trace to stdout.

## Risks / Trade-offs

- **YAML key coercion for `true`/`false`**: In YAML, `routes.true` and `routes.false` keys may be parsed as boolean by some parsers. In JavaScript, object keys are always strings, so `{true: "verify"}` is stored as `{"true": "verify"}` — matching what Zod expects. Recommend quoting these keys in examples for clarity.
- **`__retries__` in simulate output**: The engine stores retry tracking in `state.__retries__`. The simulator should filter this from displayed state to avoid confusing output.
- **Viz indentation correctness**: The tree-drawing characters (`├──`, `└──`, `│`) must track which levels still have siblings pending. This requires a `prefixStack` threading through recursive DFS calls, not just indent depth.

## Open Questions

- None — design is fully determined by exploration and user decisions.
