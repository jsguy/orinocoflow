## 1. MemorySessionStore tests

- [x] 1.1 Create `tests/store.test.ts` — import `MemorySessionStore` and `MemorySessionStore` from `src/store.ts`
- [x] 1.2 Test `get()` returns `undefined` on empty store
- [x] 1.3 Test `set()` + `get()` round-trip with a real `SuspendedExecution` fixture
- [x] 1.4 Test `set()` overwrites an existing entry
- [x] 1.5 Test `delete()` makes a stored entry return `undefined`
- [x] 1.6 Test `delete()` on a non-existent key is a no-op (no throw)
- [x] 1.7 Test all three methods return `Promise` (are awaitable)

## 2. Error class property tests

- [x] 2.1 Create `tests/errors.test.ts` — import all error classes from `src/errors.ts`
- [x] 2.2 Test `HandlerError` exposes `nodeId` and `cause` matching constructor arguments
- [x] 2.3 Test `WorkflowCycleError` exposes `maxSteps` matching constructor argument
- [x] 2.4 Test `SubWorkflowNotFoundError` exposes `workflowId` matching constructor argument
- [x] 2.5 Test `NodeNotFoundError` exposes `nodeId` matching constructor argument
- [x] 2.6 Test all engine error classes are `instanceof Error` with a non-empty `.message`

## 3. Engine behaviour tests

- [x] 3.1 Add test to `tests/execute.test.ts` — handler type priority: node with `id: "my-verify"` and `type: "verify"`, both keys registered, confirm `handlers["verify"]` is called
- [x] 3.2 Add test to `tests/execute.test.ts` — handler id fallback: node with `id: "my-verify"` and `type: "verify"`, only `handlers["my-verify"]` registered, confirm it is called and no error thrown

## 4. Sub-workflow suspension propagation tests

- [x] 4.1 Add test to `tests/subworkflow.test.ts` — build a parent workflow with a `sub_workflow` node whose child contains an `interrupt` node; confirm `runWorkflow` on the parent returns `{ status: "suspended" }`
- [x] 4.2 Add test to `tests/subworkflow.test.ts` — confirm the `SuspendedExecution.state` in the above scenario includes state accumulated by parent nodes before the sub-workflow ran

## 5. Verification

- [x] 5.1 `bun test` — all 73 existing tests still pass with new tests added
- [x] 5.2 Confirm new test count is at least 73 + 16 (7 store + 5 errors + 2 engine + 2 subworkflow)
