## 1. Dependencies and Package Setup

- [x] 1.1 Run `bun add yaml` to add the yaml dependency
- [x] 1.2 Add `"bin": { "oflow": "./src/cli/index.ts" }` to `package.json`
- [x] 1.3 Add `"./compile"` conditional export to `package.json` pointing to `src/cli/compile.ts`

## 2. Compiler

- [x] 2.1 Create `src/cli/compile.ts` with `compileFile(path)` — reads file, branches on extension (.yaml/.yml vs .json), calls `yaml.parse()` or `JSON.parse()`, then `parse()` (Zod validator)
- [x] 2.2 Export `transformYamlToWorkflow(doc: unknown): Workflow` from `src/cli/compile.ts` (thin wrapper around `parse()`)
- [x] 2.3 Re-export `compileFile` and `transformYamlToWorkflow` from `src/index.ts`
- [x] 2.4 Write `tests/compile.test.ts`: valid YAML roundtrip, valid JSON passthrough, Zod error on invalid schema, YAML parse error on malformed syntax, unsupported extension error

## 3. CLI Entry Point

- [x] 3.1 Create `src/cli/index.ts` with `#!/usr/bin/env bun` shebang and manual `process.argv` parsing
- [x] 3.2 Implement `compile` command: call `compileFile`, write JSON to stdout or `--output` file
- [x] 3.3 Implement `viz` command: call `compileFile`, pass result to `renderViz`, print to stdout
- [x] 3.4 Implement `simulate` command: compile workflow file, load mock file, run simulation, print trace
- [x] 3.5 Uniform error handler: catch all errors, print to stderr, `process.exit(1)`

## 4. Visualizer

- [x] 4.1 Create `src/cli/viz.ts` with `renderViz(workflow: Workflow): string`
- [x] 4.2 Build adjacency list from `workflow.edges` keyed by `from` node
- [x] 4.3 Implement DFS with two sets: `ancestors` (current path stack) and `rendered` (ever output)
- [x] 4.4 Render standard edges as `──>` and conditional edges as `──[field operator value]──>`
- [x] 4.5 Track sibling count per level with a `prefixStack` to emit `├──>` vs `└──>` and `│` continuation lines correctly
- [x] 4.6 Append `(loop)` when target is in `ancestors`; append `(visited)` when target is in `rendered` but not `ancestors`
- [x] 4.7 Append `(retry: N, exhausted: node)` on the branch line for edges with `maxRetries`/`onExhausted`
- [x] 4.8 Write `tests/viz.test.ts`: linear workflow, conditional branching annotations, loop marker, visited marker, retry annotation

## 5. Simulator

- [x] 5.1 Create `src/cli/simulate.ts` with `buildMockHandlers(mockData, workflow)` — registers each handler under both `node.id` and `node.type`, uses `.N` suffix resolution with per-node invocation counter
- [x] 5.2 Implement `runSimulation(workflow, mockData, mockFileName)` — calls `runWorkflow()` with `onEvent` callback, collects events, formats and prints trace
- [x] 5.3 Filter `__retries__` from all displayed state output
- [x] 5.4 Format step lines: `Step N │ <nodeId> │ state: <state>`, edge lines: `       │             │ edge: <description>`, repeated node label `<nodeId> (xN)`
- [x] 5.5 Print completion summary: `✓ Completed in N steps` and `Path: node → node → ...`
- [x] 5.6 Write `tests/simulate.test.ts`: mock invocation counting, linear trace, conditional branch path, retry loop with `.N` data resolution

## 6. Verification

- [x] 6.1 `bun test` — all new and existing tests pass
- [x] 6.2 `bun src/cli/index.ts compile examples/odt-pipeline.yaml` — outputs valid JSON matching `odt-pipeline.json`
- [x] 6.3 `bun src/cli/index.ts compile examples/odt-pipeline.json` — same output
- [x] 6.4 `bun src/cli/index.ts viz examples/odt-pipeline.yaml` — renders ASCII DAG matching the target in design.md
- [x] 6.5 `bun src/cli/index.ts simulate examples/odt-pipeline.yaml examples/mock.yaml` — prints 8-step trace ending at teardown
