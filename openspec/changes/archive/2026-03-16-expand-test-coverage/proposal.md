## Why

A coverage audit identified three areas of untested production behaviour: `MemorySessionStore` has zero test coverage despite being a public API, sub-workflow suspension propagation is untested, and the handler type-vs-id fallback order and error class properties are undocumented by tests. Adding coverage now ensures regressions are caught before they affect consumers.

## What Changes

- Add `tests/store.test.ts` — full coverage of `MemorySessionStore` (get, set, delete, round-trip, post-delete behaviour)
- Add tests to `tests/execute.test.ts` — handler type-vs-id priority (type wins over id when both registered)
- Add tests to `tests/subworkflow.test.ts` — sub-workflow suspension propagates to the parent workflow
- Add tests to `tests/execute.test.ts` or a new `tests/errors.test.ts` — error class properties (`HandlerError.nodeId`, `HandlerError.cause`, `WorkflowCycleError.maxSteps`, `SubWorkflowNotFoundError.workflowId`)

## Capabilities

### New Capabilities

- `session-store-behaviour`: Testable contract for `MemorySessionStore` — covers get/set/delete semantics and round-trip with `SuspendedExecution` snapshots

### Modified Capabilities

- `workflow-interrupts`: Add sub-workflow suspension propagation scenario — when a sub-workflow hits an interrupt node, the parent workflow suspends and returns a `SuspendedExecution` snapshot

## Impact

- **New test file**: `tests/store.test.ts`
- **Modified test files**: `tests/execute.test.ts`, `tests/subworkflow.test.ts`
- **Optionally new**: `tests/errors.test.ts` (or tests added to execute.test.ts)
- No production code changes — tests only
