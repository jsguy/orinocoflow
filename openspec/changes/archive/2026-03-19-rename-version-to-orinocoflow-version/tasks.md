## 1. Schema Update

- [x] 1.1 In `src/schemas.ts`, rename `version: z.literal("1.0")` to `orinocoflow_version: z.string().optional()` in `WorkflowSchema`
- [x] 1.2 Verify the `Workflow` TypeScript type reflects the renamed optional field

## 2. CLI Scaffold Templates

- [x] 2.1 In `src/cli/create.ts`, replace all four occurrences of `version: "1.0"` with `orinocoflow_version: "1.0"`

## 3. Test Fixtures

- [x] 3.1 In `tests/store.test.ts`, rename `version` → `orinocoflow_version`
- [x] 3.2 In `tests/execute.test.ts`, rename all `version` → `orinocoflow_version`
- [x] 3.3 In `tests/interrupt.test.ts`, rename all `version` → `orinocoflow_version`
- [x] 3.4 In `tests/viz.test.ts`, rename all `version` → `orinocoflow_version`
- [x] 3.5 In `tests/subworkflow.test.ts`, rename all `version` → `orinocoflow_version`
- [x] 3.6 In `tests/simulate.test.ts`, rename all `version` → `orinocoflow_version`
- [x] 3.7 In `tests/compile.test.ts`, rename `version` → `orinocoflow_version` in fixture objects and update the `expect(workflow.version)` assertions to use `workflow.orinocoflow_version`
- [x] 3.8 In `tests/create.test.ts`, rename `version` → `orinocoflow_version` in fixture objects and update `expect(workflow.version)` assertions
- [x] 3.9 Add a test in `tests/compile.test.ts` asserting that a workflow without `orinocoflow_version` parses successfully

## 4. Examples

- [x] 4.1 In `examples/hn-roast.yaml`, rename `version:` → `orinocoflow_version:`
- [x] 4.2 In `examples/odt-pipeline.yaml`, rename `version:` → `orinocoflow_version:`
- [x] 4.3 In `examples/odt-pipeline.json`, rename `"version"` → `"orinocoflow_version"`
- [x] 4.4 In `examples/pr_pipeline.ts`, rename both `version: "1.0"` → `orinocoflow_version: "1.0"`
- [x] 4.5 In `examples/hn-roast.ts`, rename `version: "1.0"` → `orinocoflow_version: "1.0"`

## 5. Verification

- [x] 5.1 Run the full test suite (`bun test` or equivalent) and confirm all tests pass
- [x] 5.2 Run `oflow compile examples/odt-pipeline.yaml` and confirm valid JSON output
- [x] 5.3 Confirm a workflow YAML with no `orinocoflow_version` field compiles without error
