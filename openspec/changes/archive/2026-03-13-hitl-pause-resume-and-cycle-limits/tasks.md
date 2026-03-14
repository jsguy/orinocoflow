## 1. Schema & Types

- [x] 1.1 Add `interrupt` node type to `WorkflowNodeSchema` in `src/schemas.ts`
- [x] 1.2 Add `maxRetries` (optional number) and `onExhausted` (optional string) fields to `ConditionalEdge` schema in `src/schemas.ts`
- [x] 1.3 Define `SuspendedExecution<S>` interface (`workflowId`, `suspendedAtNodeId`, `state`, `workflowSnapshot`) in `src/schemas.ts`
- [x] 1.4 Define `WorkflowResult<S>` discriminated union (`status: "completed" | "suspended"`) in `src/schemas.ts`
- [x] 1.5 Add `workflow_suspended` and `workflow_resume` variants to `WorkflowEvent` union in `src/schemas.ts`

## 2. Error Classes

- [x] 2.1 Add `WorkflowConfigurationError` to `src/errors.ts` (thrown when `onExhausted` references a missing node)

## 3. Retry Counter Logic (Router)

- [x] 3.1 In `src/router.ts`, update `resolveNextNode` to accept the current `WorkflowState` as a parameter
- [x] 3.2 Implement retry counter read/write using `state.__retries__["<from>:<loopback_target>"]`
- [x] 3.3 When a loopback branch is taken on an edge with `maxRetries`, increment the counter and check against the limit
- [x] 3.4 When the counter reaches `maxRetries`, validate `onExhausted` node exists (throw `WorkflowConfigurationError` if not), then return `onExhausted` as the next node
- [x] 3.5 Emit `edge_taken` event with `retriesExhausted: true` and `onExhausted` when routing to the exhausted target

## 4. Interrupt Handling (Execute)

- [x] 4.1 In `src/execute.ts`, detect `node.type === "interrupt"` in the execution loop before invoking any handler
- [x] 4.2 On interrupt: emit `workflow_suspended` event, build `SuspendedExecution` snapshot, and return `{ status: "suspended", snapshot, trace }`
- [x] 4.3 Update `_execute` / `runWorkflow` return type from `{ state, trace }` to `WorkflowResult<S>`
- [x] 4.4 Update the `completed` path to return `{ status: "completed", state, trace }`

## 5. resumeWorkflow

- [x] 5.1 Implement `resumeWorkflow(snapshot: SuspendedExecution, options?: ResumeOptions)` in `src/execute.ts`
- [x] 5.2 Merge `options.state` (if provided) onto `snapshot.state` (options take precedence)
- [x] 5.3 Resolve the outgoing edge from `suspendedAtNodeId` to determine the entry node for resumed execution
- [x] 5.4 Re-enter `_execute` at the resolved entry node with the merged state; emit `workflow_resume` as the first event
- [x] 5.5 Handle the case where the interrupt node has no outgoing edges (return `status: "completed"` immediately)

## 6. Public API Exports

- [x] 6.1 Export `resumeWorkflow`, `SuspendedExecution`, `WorkflowResult`, `WorkflowConfigurationError` from `src/index.ts`
- [x] 6.2 Export updated `WorkflowEvent` union (with `workflow_suspended` and `workflow_resume`) from `src/index.ts`

## 7. Tests

- [x] 7.1 Test: workflow suspends at `interrupt` node and returns `status: "suspended"` with correct snapshot
- [x] 7.2 Test: `SuspendedExecution` round-trips through `JSON.stringify` / `JSON.parse` and `resumeWorkflow` accepts it
- [x] 7.3 Test: `resumeWorkflow` continues from the interrupt node's successor with correct state
- [x] 7.4 Test: `resumeWorkflow` with `options.state` merges values correctly (options override snapshot state)
- [x] 7.5 Test: `workflow_suspended` event appears as last event before suspension; `workflow_resume` appears first on resume
- [x] 7.6 Test: interrupt node with no outgoing edges causes `resumeWorkflow` to return `status: "completed"`
- [x] 7.7 Test: `maxRetries` edge routes normally for first N calls, then routes to `onExhausted` on N+1
- [x] 7.8 Test: retry counters persist across a suspend/resume cycle
- [x] 7.9 Test: `edge_taken` event includes `retriesExhausted: true` when `onExhausted` is used
- [x] 7.10 Test: `WorkflowConfigurationError` is thrown when `onExhausted` references a non-existent node

## 8. Documentation

- [x] 8.1 Update `README.md` with `interrupt` node type usage and `resumeWorkflow` API example
- [x] 8.2 Update `README.md` with `maxRetries` / `onExhausted` conditional edge example
