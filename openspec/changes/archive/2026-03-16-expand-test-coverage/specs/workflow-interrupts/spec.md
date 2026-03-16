## ADDED Requirements

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
