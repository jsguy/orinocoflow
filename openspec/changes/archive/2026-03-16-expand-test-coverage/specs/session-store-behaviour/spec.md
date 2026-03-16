## ADDED Requirements

### Requirement: MemorySessionStore get returns undefined for missing key
`MemorySessionStore.get(id)` SHALL return `undefined` when no snapshot has been stored under that id.

#### Scenario: Get on empty store
- **WHEN** `get(id)` is called on a newly created `MemorySessionStore` with any id
- **THEN** it returns `undefined`

#### Scenario: Get after delete
- **WHEN** a snapshot is stored with `set(id, snap)` and then removed with `delete(id)`, and then `get(id)` is called
- **THEN** it returns `undefined`

### Requirement: MemorySessionStore set and get round-trip
`MemorySessionStore.set(id, snapshot)` SHALL store the snapshot such that a subsequent `get(id)` returns an object deeply equal to the stored snapshot.

#### Scenario: Round-trip with SuspendedExecution
- **WHEN** a valid `SuspendedExecution` object is stored with `set(id, snap)` and retrieved with `get(id)`
- **THEN** the retrieved object SHALL equal the stored object

#### Scenario: Overwrite existing entry
- **WHEN** `set(id, snap1)` is called followed by `set(id, snap2)`, and then `get(id)` is called
- **THEN** the retrieved object SHALL equal `snap2`, not `snap1`

### Requirement: MemorySessionStore delete removes the entry
`MemorySessionStore.delete(id)` SHALL remove the stored snapshot so that subsequent `get(id)` calls return `undefined`.

#### Scenario: Delete existing entry
- **WHEN** a snapshot is stored with `set(id, snap)` and then `delete(id)` is called
- **THEN** `get(id)` returns `undefined`

#### Scenario: Delete non-existent key is a no-op
- **WHEN** `delete(id)` is called on an id that was never stored
- **THEN** no error is thrown and the store remains unchanged

### Requirement: MemorySessionStore implements SessionStore interface
`MemorySessionStore` SHALL satisfy the `SessionStore` interface — all three methods (`get`, `set`, `delete`) SHALL be async (return Promises).

#### Scenario: All methods return Promises
- **WHEN** `get`, `set`, and `delete` are called
- **THEN** each returns a `Promise` (i.e. is awaitable)

### Requirement: Error class properties are accessible
Error classes thrown by the engine SHALL expose the documented properties so consumers can inspect them after catching.

#### Scenario: HandlerError exposes nodeId and cause
- **WHEN** a `HandlerError` is instantiated with `nodeId` and an original error
- **THEN** `err.nodeId` equals the provided node id and `err.cause` equals the original error

#### Scenario: WorkflowCycleError exposes maxSteps
- **WHEN** a `WorkflowCycleError` is instantiated with a step count
- **THEN** `err.maxSteps` equals the provided count

#### Scenario: SubWorkflowNotFoundError exposes workflowId
- **WHEN** a `SubWorkflowNotFoundError` is instantiated with a workflow id
- **THEN** `err.workflowId` equals the provided id

#### Scenario: NodeNotFoundError exposes nodeId
- **WHEN** a `NodeNotFoundError` is instantiated with a node id
- **THEN** `err.nodeId` equals the provided id

#### Scenario: All engine error classes are instanceof Error
- **WHEN** any engine error class is instantiated
- **THEN** it is `instanceof Error` and has a non-empty `.message` string
