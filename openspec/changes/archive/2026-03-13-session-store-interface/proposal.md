## Why

orinocoflow's pause/resume support returns a `SuspendedExecution` snapshot but provides no typed contract for callers to store it against — the README shows raw `JSON.stringify` with no structure. Callers need a typed `SessionStore` interface so they can implement adapters confidently and understand the engine's storage-agnostic design.

## What Changes

- New `SessionStore` interface (async `get`/`set`/`delete`) that callers implement against any backend (Postgres, Redis, Firestore, file system, etc.)
- New `MemorySessionStore` class (Map-backed) as a built-in reference implementation for dev/testing
- Both exported from the top-level `orinocoflow` package
- README HITL section rewritten: explicit storage-agnostic callout, interface shown inline, `MemorySessionStore` example replaces raw `JSON.stringify`

## Capabilities

### New Capabilities

- `session-store`: Typed `SessionStore` interface and `MemorySessionStore` reference implementation for storing suspended workflow snapshots

### Modified Capabilities

<!-- No existing spec-level requirements are changing — engine behavior is untouched -->

## Impact

- **New file**: `src/store.ts` — `SessionStore` interface + `MemorySessionStore` class
- **Modified**: `src/index.ts` — two new exports (`SessionStore` type, `MemorySessionStore` class)
- **Modified**: `README.md` — HITL section rewrite
- **No engine changes**: `runWorkflow` and `resumeWorkflow` are untouched; the engine never references `SessionStore`
- **No breaking changes**: purely additive
