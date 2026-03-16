### Requirement: Interrupt node suspends execution
The engine SHALL recognize a node with `type: "interrupt"` as a suspension point. When execution reaches an interrupt node, the engine SHALL stop processing, capture the full `WorkflowState` and the interrupt node's id into a `SuspendedExecution` snapshot, and return a result with `status: "suspended"` rather than continuing to the next node.

#### Scenario: Workflow suspends at interrupt node
- **WHEN** a workflow contains a node with `type: "interrupt"` and execution reaches that node
- **THEN** `runWorkflow` returns `{ status: "suspended", snapshot: SuspendedExecution, trace: WorkflowEvent[] }` without executing any subsequent nodes

#### Scenario: Interrupt node does not require a handler
- **WHEN** no handler is registered for node type `"interrupt"` in `RunOptions.handlers`
- **THEN** the engine SHALL suspend successfully without error (no handler is invoked)

#### Scenario: Interrupt node after state accumulation
- **WHEN** prior nodes have modified `WorkflowState` before reaching an interrupt node
- **THEN** the `SuspendedExecution.state` SHALL contain all state accumulated up to the point of suspension

---

### Requirement: SuspendedExecution is a serializable snapshot
The `SuspendedExecution` type SHALL be a plain JSON-serializable object containing: `workflowId` (string), `suspendedAtNodeId` (string), `state` (the full `WorkflowState` at time of suspension), and `workflowSnapshot` (the full parsed `Workflow` object). No functions, class instances, or non-serializable values SHALL be included.

#### Scenario: Snapshot round-trips through JSON
- **WHEN** a `SuspendedExecution` is serialized with `JSON.stringify` and parsed with `JSON.parse`
- **THEN** the resulting object SHALL be accepted by `resumeWorkflow` without error and produce identical execution behavior

---

### Requirement: resumeWorkflow re-enters execution from the suspended node
The engine SHALL expose a `resumeWorkflow(snapshot, options)` function. It SHALL re-enter the workflow at the node immediately after `suspendedAtNodeId` (i.e., resolve the outgoing edge from the interrupt node and start from there), using the state from `snapshot.state` merged with any additional state provided in `options.state`.

#### Scenario: Resume continues from interrupt node's successor
- **WHEN** `resumeWorkflow` is called with a valid `SuspendedExecution`
- **THEN** execution begins at the node reached by following the outgoing edge of the interrupt node, not at the interrupt node itself

#### Scenario: Resume with additional state
- **WHEN** `resumeWorkflow` is called with `options.state` containing new or updated fields
- **THEN** `options.state` is shallow-merged onto `snapshot.state` before execution resumes, with `options.state` values taking precedence

#### Scenario: Resume with no outgoing edge from interrupt node
- **WHEN** the interrupt node has no outgoing edges
- **THEN** `resumeWorkflow` returns `{ status: "completed", state, trace }` immediately (the interrupt was the terminal node)

---

### Requirement: workflow_suspended event is emitted on interrupt
The engine SHALL emit a `WorkflowEvent` with `type: "workflow_suspended"` immediately before returning the suspended result. The event SHALL include the `suspendedAtNodeId` field.

#### Scenario: Event stream includes suspension event
- **WHEN** a workflow suspends at an interrupt node and the caller uses `runWorkflowStream`
- **THEN** the async generator SHALL yield a `{ type: "workflow_suspended", nodeId: string }` event as its final event before the generator completes

---

### Requirement: workflow_resume event is emitted on resume
The engine SHALL emit a `WorkflowEvent` with `type: "workflow_resume"` as the first event when `resumeWorkflow` is called, before any node execution begins.

#### Scenario: Resumed trace starts with resume event
- **WHEN** `resumeWorkflow` is called
- **THEN** the `trace` in the returned result SHALL begin with a `{ type: "workflow_resume" }` event

---

### Requirement: WorkflowResult is a discriminated union
`runWorkflow` SHALL return `Promise<WorkflowResult<S>>` where `WorkflowResult` is:
```ts
type WorkflowResult<S> =
  | { status: "completed"; state: S; trace: WorkflowEvent[] }
  | { status: "suspended"; snapshot: SuspendedExecution<S>; trace: WorkflowEvent[] }
```

#### Scenario: Completed workflow returns completed status
- **WHEN** a workflow runs to a terminal node without hitting an interrupt
- **THEN** the result SHALL have `status: "completed"` and include `state` and `trace`

#### Scenario: Suspended workflow returns suspended status
- **WHEN** a workflow hits an interrupt node
- **THEN** the result SHALL have `status: "suspended"` and include `snapshot` and `trace`

---

### Requirement: Sub-workflow suspension propagates to the parent
When a sub-workflow hits an interrupt node during execution, the engine SHALL suspend the entire parent workflow and return a `SuspendedExecution` snapshot. The snapshot SHALL reference the sub_workflow node in the parent as the suspension point, not the interrupt node inside the child.

#### Scenario: Parent suspends when sub-workflow hits interrupt
- **WHEN** a parent workflow has a `sub_workflow` node whose child workflow contains an `interrupt` node
- **AND** execution reaches the interrupt node in the child
- **THEN** `runWorkflow` on the parent returns `{ status: "suspended", snapshot }` rather than `{ status: "completed" }`

#### Scenario: Parent state is preserved in snapshot after sub-workflow suspension
- **WHEN** the parent workflow has accumulated state before reaching the sub_workflow node
- **AND** the sub-workflow suspends mid-execution
- **THEN** the `SuspendedExecution.state` SHALL include the state accumulated by the parent nodes prior to entering the sub-workflow

---

### Requirement: Handler type takes priority over handler id
The engine SHALL resolve handlers by checking `handlers[node.type]` first, and only falling back to `handlers[node.id]` when no type-keyed handler is registered.

#### Scenario: Type handler wins when both type and id are registered
- **WHEN** a node has `id: "my-verify"` and `type: "verify"`
- **AND** both `handlers["verify"]` and `handlers["my-verify"]` are registered
- **THEN** `handlers["verify"]` (the type-keyed handler) is invoked, not `handlers["my-verify"]`

#### Scenario: Id handler used as fallback when type not registered
- **WHEN** a node has `id: "my-verify"` and `type: "verify"`
- **AND** only `handlers["my-verify"]` is registered (no `handlers["verify"]`)
- **THEN** `handlers["my-verify"]` is invoked successfully
