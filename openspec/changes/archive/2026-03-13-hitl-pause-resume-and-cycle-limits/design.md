## Context

orinocoflow's execution engine is a single async while-loop (`_execute` in `src/execute.ts`) that runs a workflow from `entry_point` to a terminal node in one uninterrupted call. State is a plain `WorkflowState` (`Record<string, unknown>`) that accumulates as handlers execute. The Zod-validated workflow schema (`src/schemas.ts`) and edge router (`src/router.ts`) are clean and well-isolated.

Two capabilities need to be added without breaking existing linear or conditional workflows:
1. **Pause/Resume** — an `interrupt` node that suspends execution and allows it to resume from an externally updated state.
2. **Edge retry limits** — a `maxRetries` guard on `ConditionalEdge` that routes to an `onExhausted` target once a counter is exhausted.

## Goals / Non-Goals

**Goals:**
- Allow workflows to pause at an `interrupt` node and yield a serializable `SuspendedExecution` snapshot.
- Allow callers to resume execution from a `SuspendedExecution` via `resumeWorkflow()`, optionally with additional state merged in.
- Allow individual `ConditionalEdge`s to declare `maxRetries` and `onExhausted`, routing to a fallback node when the retry count is exhausted.
- Zero breaking changes to `runWorkflow` and `runWorkflowStream`.

**Non-Goals:**
- Built-in persistence (file, DB, Redis) — the caller owns storage of `SuspendedExecution`.
- Distributed locking or concurrency control across multiple resume calls.
- Partial replay of already-completed nodes on resume.
- Support for multiple concurrent interrupt points in a single execution (one interrupt at a time).

## Decisions

### D1: `interrupt` as a first-class node type vs. a handler convention

**Decision**: Add `interrupt` as a recognized node type in the schema, handled specially in the execution loop — not as a user-registered handler.

**Alternatives considered**:
- *User-registered handler that throws a special error*: fragile, couples handler authorship to engine internals, can't be validated at workflow parse time.
- *A flag on any node type*: possible, but makes schema messier; a distinct type is easier to document and type-check.

**Rationale**: An explicit type enables schema-level validation, clear semantics in workflow JSON, and a single, testable branch in the execution loop.

---

### D2: Return type of `runWorkflow` when hitting an interrupt

**Decision**: Return a discriminated union `WorkflowResult`:
```ts
type WorkflowResult<S> =
  | { status: "completed"; state: S; trace: WorkflowEvent[] }
  | { status: "suspended"; snapshot: SuspendedExecution<S>; trace: WorkflowEvent[] }
```

**Alternatives considered**:
- *Throw a `WorkflowSuspendedError`*: semantically odd — suspension is not an error, and forcing callers into catch blocks is awkward for expected control flow.
- *Separate `runWorkflowSuspendable()` function*: avoids changing the return type of `runWorkflow` but duplicates the signature and means any workflow that *might* have an interrupt needs a different entrypoint.

**Rationale**: The discriminated union is the most type-safe approach and matches the actual semantic — the caller must branch on whether execution completed or suspended, making the shape explicit.

---

### D3: Where to store retry counters

**Decision**: Store retry counters in the `WorkflowState` under a reserved namespace `__retries__` (e.g., `{ __retries__: { "<edge-from>:<edge-condition-hash>": number } }`). Counters are included in `SuspendedExecution` automatically since they live in state.

**Alternatives considered**:
- *Separate counter map in `RunOptions`*: survives execution but isn't serialized with state — breaks resume scenarios where retries should persist across suspend/resume.
- *Counter on the edge object at runtime*: mutating parsed schema objects is an anti-pattern.

**Rationale**: Storing in state ensures counters survive serialization for free. The `__retries__` namespace is reserved (documented) but simple. Callers can inspect or reset counters by reading/writing state directly.

---

### D4: Edge key for retry counter identity

**Decision**: Key retry counters by `"${edge.from}:${edge.to_true ?? edge.to_false}"` — i.e., the specific conditional edge's `from` + the outgoing route being counted (the loopback branch). This is deterministic from the workflow definition without hashing.

**Rationale**: Simple and human-readable in persisted state. A single conditional edge can only have one "retry" direction (the loopback), so the key is unambiguous.

---

### D5: `SuspendedExecution` schema

```ts
interface SuspendedExecution<S = WorkflowState> {
  workflowId: string;       // from workflow.id
  suspendedAtNodeId: string; // the interrupt node's id
  state: S;                  // full state at time of suspension
  workflowSnapshot: Workflow; // full workflow JSON (allows resume without re-fetching)
}
```

The `workflowSnapshot` is included so callers don't need to re-provide the workflow definition at resume time. This makes `resumeWorkflow(snapshot, options)` self-contained.

## Risks / Trade-offs

- **State namespace collision** → `__retries__` key is reserved and documented. If a user handler writes to `state.__retries__` they will corrupt counters. Mitigation: validate/warn in `resumeWorkflow` if `__retries__` is present and malformed.
- **`WorkflowResult` is a breaking change** → Callers that currently destructure `const { state, trace } = await runWorkflow(...)` will get a type error. Mitigation: TypeScript will surface this at compile time; migration is a one-line `result.state` → `result.status === "completed" && result.state`.
- **`workflowSnapshot` in `SuspendedExecution` duplicates the workflow definition** → Minor storage overhead, but simplifies the resume API significantly. Acceptable for the use case.
- **No built-in timeout for suspended workflows** → A workflow could be suspended indefinitely. Mitigation: out of scope; callers are responsible for TTL on their storage.

## Migration Plan

1. `WorkflowResult` discriminated union is the only API surface change. All existing call sites need updating from `const { state } = await runWorkflow(...)` to `const result = await runWorkflow(...); if (result.status === "completed") { result.state }`.
2. No schema version bump required — `interrupt` nodes and `maxRetries` fields are additive; existing workflows without them parse identically.
3. `runWorkflowStream` returns `AsyncGenerator<WorkflowEvent>` unchanged; a `workflow_suspended` event type will be added to the discriminated `WorkflowEvent` union.

## Open Questions

- Should `resumeWorkflow` emit a `workflow_resume` event at the top of the event stream to make traces of resumed executions distinguishable? (Recommendation: yes.)
- Should `maxRetries` default to `undefined` (no limit) or `0` (fail immediately)? (Recommendation: `undefined` — opt-in only.)
