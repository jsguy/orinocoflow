## Why

`compileFile` and `transformYamlToWorkflow` are currently exported from both `"orinocoflow"` (the main bundle) and `"orinocoflow/compile"` (the sub-path). This is redundant: it bloats the main bundle with a `yaml` dependency for consumers who only want the runtime, and gives developers two ways to import the same function — creating confusion about which to use.

## What Changes

- Remove `compileFile` and `transformYamlToWorkflow` from `src/index.ts` (main export)
- These functions remain available exclusively via `import { compileFile } from "orinocoflow/compile"`
- Rebuild `dist/` to reflect the slimmer main bundle

### Modified Capabilities

- `cli-compile`: `compileFile` is now only accessible via the `orinocoflow/compile` sub-path, not the main entry point

## Impact

- **`src/index.ts`**: Remove the `compileFile` / `transformYamlToWorkflow` export line
- **`dist/index.js` / `dist/index.cjs`**: Rebuilt without the `yaml` transitive pull-in
- **Consumers**: Anyone importing `compileFile` from `"orinocoflow"` must update to `"orinocoflow/compile"` — this is a **BREAKING** change for that import path
- **README**: No change needed — README examples do not import `compileFile`
