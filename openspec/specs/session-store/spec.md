### Requirement: SessionStore interface is exported
The package SHALL export a `SessionStore` interface with three async methods: `get(sessionId: string): Promise<SuspendedExecution | undefined>`, `set(sessionId: string, snapshot: SuspendedExecution): Promise<void>`, and `delete(sessionId: string): Promise<void>`.

#### Scenario: Type-only import compiles
- **WHEN** a caller writes `import type { SessionStore } from "orinocoflow"`
- **THEN** the TypeScript compiler resolves the type without errors

#### Scenario: Custom implementation satisfies the interface
- **WHEN** a caller implements all three methods returning the correct types
- **THEN** the TypeScript compiler accepts the class as assignable to `SessionStore`

### Requirement: MemorySessionStore is exported
The package SHALL export a `MemorySessionStore` class that implements `SessionStore` using an in-memory `Map`.

#### Scenario: Default instantiation requires no arguments
- **WHEN** a caller writes `new MemorySessionStore()`
- **THEN** a usable store instance is created with no required configuration

#### Scenario: set then get returns the same snapshot
- **WHEN** a snapshot is stored with `set(id, snapshot)` and then retrieved with `get(id)`
- **THEN** the returned value is deeply equal to the stored snapshot

#### Scenario: get on missing key returns undefined
- **WHEN** `get` is called with a session ID that was never stored
- **THEN** the method resolves to `undefined`

#### Scenario: delete removes the entry
- **WHEN** a snapshot is stored with `set(id, snapshot)` and then `delete(id)` is called
- **THEN** a subsequent `get(id)` resolves to `undefined`

#### Scenario: all methods return Promises
- **WHEN** any of the three methods is called
- **THEN** the return value is a Promise (awaitable)

### Requirement: Engine does not reference SessionStore
The `runWorkflow` and `resumeWorkflow` function signatures SHALL NOT include `SessionStore` as a parameter or return type. Session storage remains the caller's responsibility.

#### Scenario: runWorkflow signature is unchanged
- **WHEN** a caller invokes `runWorkflow(workflow, input, options)`
- **THEN** no `store` or `sessionStore` parameter is required or accepted

#### Scenario: resumeWorkflow signature is unchanged
- **WHEN** a caller invokes `resumeWorkflow(snapshot, options)`
- **THEN** no `store` or `sessionStore` parameter is required or accepted
