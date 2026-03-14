## Why

orinocoflow currently runs workflows start-to-finish in a single in-memory invocation, making it incompatible with human-in-the-loop (HITL) patterns and long-running Claude sessions that require external input before continuing. Additionally, the existing cycle protection (`maxSteps`) guards against infinite loops but provides no way to express "retry up to N times, then escalate" logic at the edge level.

## What Changes

- **New node type `interrupt`**: A declarative checkpoint node that pauses execution, serializes the full workflow state (current node + `WorkflowState`) to a caller-provided store, and returns a `suspended` result instead of completing.
- **New top-level function `resumeWorkflow()`**: Accepts a previously-serialized `SuspendedExecution` snapshot and re-enters execution from the interrupted node after the external event (human response, Claude reply, webhook) has updated the state.
- **New edge field `maxRetries`**: Optional integer on `ConditionalEdge`. The engine tracks per-edge retry counts in the workflow state and automatically overrides routing to a `onExhausted` target once the limit is hit.
- **New error class `WorkflowInterruptedError`**: Thrown (or returned as a discriminated result) when execution reaches an interrupt node without a resume store configured, making misconfiguration explicit.

## Capabilities

### New Capabilities

- `workflow-interrupts`: Pause/resume mechanism — `interrupt` node type, `SuspendedExecution` snapshot schema, `resumeWorkflow()` API, and the serialization contract between pause and resume.
- `edge-retry-limits`: Per-edge `maxRetries` field on `ConditionalEdge`, engine-managed retry counter state, and `onExhausted` routing target.

### Modified Capabilities

<!-- No existing specs to modify — openspec/specs/ is currently empty. -->

## Impact

- **`src/schemas.ts`**: New `interrupt` node schema; new `maxRetries` / `onExhausted` fields on `ConditionalEdge`; new `SuspendedExecution` type.
- **`src/execute.ts`**: Interrupt detection in the execution loop; retry counter tracking; `resumeWorkflow()` function.
- **`src/router.ts`**: Retry counter lookup and `onExhausted` override in `resolveNextNode`.
- **`src/errors.ts`**: `WorkflowInterruptedError`.
- **Public API** (`src/index.ts`): Export `resumeWorkflow`, `SuspendedExecution`, `WorkflowInterruptedError`.
- **No breaking changes** to existing `runWorkflow` / `runWorkflowStream` signatures.
