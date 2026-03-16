## Why

orinocoflow workflows are currently defined in TypeScript. Consumers like ODT need a way to author, inspect, and dry-run workflows without writing code. A CLI tool ships as part of the package and covers all three needs.

## What Changes

- Add `oflow` binary to the package (`src/cli/index.ts`)
- Add `src/cli/compile.ts` — reads YAML or JSON, validates against the existing Zod schema, outputs a `Workflow`
- Add `src/cli/viz.ts` — renders an ASCII DAG from a compiled workflow
- Add `src/cli/simulate.ts` — dry-runs a workflow using the real engine with mock handler data
- Add `yaml` as a runtime dependency
- Expose `compileFile` and `transformYamlToWorkflow` as public API via `src/index.ts` and a `./compile` package export
- Add `examples/odt-pipeline.yaml`, `examples/odt-pipeline.json`, `examples/mock.yaml`

## Capabilities

### New Capabilities

- `cli-compile`: Parse and validate a YAML or JSON workflow file into a `Workflow` object. YAML is a 1:1 syntax equivalent of JSON — same field names, same schema, fully round-trippable.
- `cli-viz`: Render an ASCII DAG of a workflow from its entry point, annotating conditional edges, retry limits, loop back-edges, and merge-point nodes.
- `cli-simulate`: Dry-run a workflow using the real `runWorkflow()` engine with mock handler data loaded from a YAML/JSON file, printing a step-by-step execution trace.

### Modified Capabilities

## Impact

- **`package.json`**: adds `yaml` dependency, `bin.oflow` entry, `./compile` export
- **`src/index.ts`**: re-exports `compileFile`, `transformYamlToWorkflow`
- **No breaking changes** to existing engine API
- **New files**: `src/cli/index.ts`, `src/cli/compile.ts`, `src/cli/viz.ts`, `src/cli/simulate.ts`, `tests/compile.test.ts`, `tests/viz.test.ts`, `tests/simulate.test.ts`, `examples/`
