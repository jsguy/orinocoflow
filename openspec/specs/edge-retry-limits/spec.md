### Requirement: ConditionalEdge supports maxRetries and onExhausted
A `ConditionalEdge` SHALL accept two optional fields: `maxRetries` (non-negative integer) and `onExhausted` (node id string). When both are present, the engine SHALL track how many times the loopback branch of that edge has been taken and, once the count equals `maxRetries`, route to `onExhausted` instead.

#### Scenario: Edge routes normally before retry limit
- **WHEN** a conditional edge has `maxRetries: 3` and the loopback branch has been taken fewer than 3 times
- **THEN** the edge resolves its loopback branch as normal

#### Scenario: Edge routes to onExhausted when limit reached
- **WHEN** a conditional edge has `maxRetries: 3` and the loopback branch has already been taken 3 times
- **THEN** the engine SHALL route to `onExhausted` instead of the normal loopback branch

#### Scenario: Edge without maxRetries is unaffected
- **WHEN** a conditional edge has no `maxRetries` field
- **THEN** routing behavior is identical to the current implementation with no retry tracking

---

### Requirement: Retry counts are stored in WorkflowState under __retries__
The engine SHALL track retry counts in `WorkflowState` under the reserved key `__retries__`, using a nested map keyed by `"${edge.from}:${loopback_target}"`. These counts SHALL be included in any `SuspendedExecution` snapshot automatically, ensuring retry state persists across pause/resume cycles.

#### Scenario: Retry counter increments each time loopback is taken
- **WHEN** a conditional edge's loopback branch is taken
- **THEN** `state.__retries__["<from>:<loopback_target>"]` SHALL be incremented by 1

#### Scenario: Retry state survives suspend and resume
- **WHEN** a workflow suspends (via interrupt node) after the loopback branch has been taken N times
- **THEN** `resumeWorkflow` restores the retry counters from the snapshot state and continues counting from N

---

### Requirement: Missing onExhausted field raises a configuration error
If a `ConditionalEdge` has `maxRetries` set but `onExhausted` is absent or does not reference a valid node id, the engine SHALL throw a `WorkflowConfigurationError` when the retry limit is reached.

#### Scenario: onExhausted points to non-existent node
- **WHEN** `onExhausted` references a node id not present in the workflow
- **THEN** the engine SHALL throw `WorkflowConfigurationError` with a message identifying the missing node id, at the moment the limit is hit (not at parse time)

---

### Requirement: Retry exhaustion is reflected in the event stream
When the engine routes to `onExhausted`, it SHALL emit an `edge_taken` event with an additional `retriesExhausted: true` flag so callers can observe and log the escalation path.

#### Scenario: Exhaustion event is emitted
- **WHEN** routing is redirected to `onExhausted` because `maxRetries` was reached
- **THEN** the emitted `edge_taken` event SHALL include `{ retriesExhausted: true, onExhausted: "<node_id>" }`
