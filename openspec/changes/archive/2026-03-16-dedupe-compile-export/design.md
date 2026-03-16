## Context

`src/index.ts` currently exports `compileFile` and `transformYamlToWorkflow` from `./cli/compile.js`. That module imports `yaml` and `node:fs/promises` — neither of which belongs in the runtime bundle. The `orinocoflow/compile` sub-path already provides exactly the right entry point for file-system-aware compilation. The main bundle should be a pure runtime: parse, execute, route, store.

## Goals / Non-Goals

**Goals:**
- Main bundle (`"orinocoflow"`) contains only runtime exports: `parse`, `runWorkflow`, `resumeWorkflow`, `runWorkflowStream`, error classes, schemas, `MemorySessionStore`
- File compilation available exclusively via `"orinocoflow/compile"`
- Rebuilt dist reflects the change

**Non-Goals:**
- Changing the `orinocoflow/compile` sub-path in any way
- Removing `transformYamlToWorkflow` from the compile sub-path
- Any README or docs changes (no existing README example uses these exports)

## Decisions

### Remove both `compileFile` and `transformYamlToWorkflow` from main index

Both live in `cli/compile.ts` — removing the whole import line is cleaner than cherry-picking. `transformYamlToWorkflow` is a thin wrapper around `parse` anyway; consumers who need it can get it from `"orinocoflow/compile"`.

### No deprecation shim

This is a pre-1.0 package with no known external consumers yet. A clean removal is better than leaving a forwarding re-export that perpetuates the confusion.

## Risks / Trade-offs

- **Breaking for anyone already importing `compileFile` from `"orinocoflow"`** → Acceptable at v0.1.x; the correct import path is documented as `"orinocoflow/compile"`
- **`yaml` may still be bundled** if Bun's tree-shaker doesn't remove it → Verify bundle size before/after with `ls -lh dist/index.js`
