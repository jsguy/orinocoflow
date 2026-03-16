## ADDED Requirements

### Requirement: Build mock handlers from a mock data file
The system SHALL export `buildMockHandlers(mockData, workflow)` which constructs a `Record<string, Handler>` suitable for `runWorkflow()`. Each handler SHALL be registered under both the node's `id` and its `type`. Each handler SHALL increment a per-node invocation counter, look up `<id>.<count>` first then fall back to `<id>`, and return `{ ...state, ...mockEntry }`.

#### Scenario: First invocation uses base key
- **WHEN** `verify` is called for the first time and mock data has `verify: { verify_passed: false }`
- **THEN** the handler returns state merged with `{ verify_passed: false }`

#### Scenario: Nth invocation uses suffixed key
- **WHEN** `verify` is called for the second time and mock data has `verify.2: { verify_passed: true }`
- **THEN** the handler returns state merged with `{ verify_passed: true }`

#### Scenario: Nth invocation falls back to base key when no suffix entry
- **WHEN** `provision` is called for the second time and mock data has only `provision: {}`
- **THEN** the handler returns state merged with `{}` (no error)

#### Scenario: Handler registered by both id and type
- **WHEN** a node has `id: "verify"` and `type: "verify"` and the engine looks up `handlers["verify"]`
- **THEN** the mock handler is found regardless of whether lookup is by type or id

### Requirement: Run simulation using the real engine
The system SHALL call `runWorkflow(workflow, {}, { handlers, onEvent })` with mock handlers and collect events via `onEvent` to produce a step-by-step trace. The `__retries__` key SHALL be filtered from all displayed state.

#### Scenario: Linear workflow completes
- **WHEN** a workflow with no conditionals is simulated
- **THEN** each node appears as a numbered step in order with its post-execution state

#### Scenario: Conditional branch follows mock data
- **WHEN** harness mock data returns `{ harness_success: true }`
- **THEN** the trace shows the edge taken as `harness_success === true → verify`, not the false branch

#### Scenario: Retry loop resolves on Nth invocation
- **WHEN** `verify` mock data returns `verify_passed: false` on first call and `verify.2` returns `verify_passed: true`
- **THEN** the trace shows `verify (x2)` on the second invocation and routes to `create_pr`

### Requirement: Print formatted simulation trace to stdout
The system SHALL print a header, per-step output, and a summary line.

#### Scenario: Header format
- **WHEN** simulation begins
- **THEN** stdout starts with `Simulating: <graph_id>` and `Mock data: <mock-file>`

#### Scenario: Step format
- **WHEN** a node completes
- **THEN** stdout shows `Step N │ <nodeId> │ state: <filtered state>`
- **AND** if an edge was taken, the next line shows `       │             │ edge: <description>`

#### Scenario: Repeated node label
- **WHEN** a node is visited more than once
- **THEN** the step label shows `<nodeId> (x<count>)` on the Nth visit (N > 1)

#### Scenario: Completion summary
- **WHEN** the workflow completes
- **THEN** stdout ends with `✓ Completed in N steps` and `Path: <node> → <node> → ...`

### Requirement: CLI simulate command
`oflow simulate <workflow-file> <mock-file>` SHALL compile the workflow, load the mock file, build handlers, run the simulation, and print the trace.

#### Scenario: Successful simulation
- **WHEN** `oflow simulate examples/odt-pipeline.yaml examples/mock.yaml` is run
- **THEN** stdout shows an 8-step trace ending at `teardown`

#### Scenario: Missing mock file
- **WHEN** the mock file path does not exist
- **THEN** error is printed to stderr and process exits with code 1
