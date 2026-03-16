## ADDED Requirements

### Requirement: Render ASCII DAG from entry point
The system SHALL render a tree of nodes starting from `entry_point` using recursive DFS, with box-drawing characters (`├──>`, `└──>`, `│`) to represent tree structure.

#### Scenario: Linear workflow
- **WHEN** `viz` is called on a workflow where every node has exactly one outgoing standard edge
- **THEN** output is a straight vertical chain with `└──>` connectors

#### Scenario: Branching workflow
- **WHEN** a node has multiple outgoing edges (conditional)
- **THEN** all but the last branch use `├──>` and the last uses `└──>`
- **AND** sibling branches are connected by `│` continuation characters at the correct indent level

### Requirement: Annotate conditional edges with their condition
Standard edges SHALL be rendered as plain `──>`. Conditional edges SHALL include the condition inline: `[field operator value]`.

#### Scenario: Conditional edge annotation
- **WHEN** a conditional edge with `condition: { field: "harness_success", operator: "===", value: true }` is rendered
- **THEN** the connector reads `──[harness_success === true]──>`

#### Scenario: Retry and exhausted annotation
- **WHEN** a conditional edge has `maxRetries: 3` and `onExhausted: "handoff"`
- **THEN** the false-route branch line includes `(retry: 3, exhausted: handoff)` after the target node name

### Requirement: Mark back-edges as loops
The system SHALL track the current DFS ancestor stack. When an edge leads to a node already in the ancestor stack, it SHALL render the target as `<nodeId> (loop)` and not recurse further.

#### Scenario: Loop back-edge
- **WHEN** `fix` has a standard edge back to `verify` which is an ancestor in the current path
- **THEN** output shows `└──> verify (loop)` and does not re-render verify's subtree

### Requirement: Mark merge points as visited
The system SHALL track all nodes already rendered. When an edge leads to a node that has been rendered via a different path (not an ancestor), it SHALL render the target as `<nodeId> (visited)` and not recurse further.

#### Scenario: Merge point
- **WHEN** `notify` is reachable via both `create_pr` and `handoff`, and has already been fully rendered
- **THEN** the second occurrence shows `└──> notify (visited)`

### Requirement: CLI viz command prints to stdout
`oflow viz <file>` SHALL compile the file and print the ASCII DAG to stdout.

#### Scenario: Successful render
- **WHEN** `oflow viz examples/odt-pipeline.yaml` is run
- **THEN** stdout contains the ASCII tree starting with the entry point node

#### Scenario: Invalid workflow file
- **WHEN** the file fails schema validation
- **THEN** error is printed to stderr and process exits with code 1
