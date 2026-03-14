## Context

orinocoflow's `runWorkflow` returns a `SuspendedExecution` snapshot when a workflow hits an `interrupt` node. Today there is no typed contract for storing that snapshot — the engine is deliberately storage-agnostic, but callers have nothing to implement against. The README shows raw `JSON.stringify`, which works but signals no design intent and gives TypeScript users no leverage.

The fix is a thin interface layer: export `SessionStore` (the contract) and `MemorySessionStore` (the Map-backed reference), both as first-class public exports. The engine itself stays untouched.

## Goals / Non-Goals

**Goals:**
- Typed `SessionStore` interface callers can implement against any backend
- Built-in `MemorySessionStore` for dev/testing that requires zero configuration
- Both available as named exports from `"orinocoflow"`
- README clearly states the engine is storage-agnostic and shows the updated pattern

**Non-Goals:**
- The engine does NOT use `SessionStore` — wiring storage to `runWorkflow`/`resumeWorkflow` is out of scope
- No Postgres, Redis, or Firestore adapters in this change — those live in caller code
- No session TTL or expiry support
- No generic type parameter on `SessionStore` (snapshot type is always `SuspendedExecution`)

## Decisions

### Async interface

All three methods (`get`/`set`/`delete`) return Promises even though `MemorySessionStore` is synchronous internally.

**Why**: Any realistic production store (Postgres, Redis, Firestore) is async. A sync interface would force callers to wrap everything in `Promise.resolve()` or change the signature later — a breaking change. Async from day one costs nothing for synchronous implementations and keeps the interface future-proof.

**Alternatives considered**: Sync-or-async overload (adds complexity), generic `MaybePromise` (ugly, non-standard). Plain `Promise<T>` is the obvious TypeScript idiom.

### No generics

`SessionStore` is typed against `SuspendedExecution` directly, not `SessionStore<T>`.

**Why**: There is only one snapshot type in orinocoflow. Adding a generic parameter adds complexity with no current benefit. If a future need arises (e.g., typed workflow state), the interface can be widened then.

### `MemorySessionStore` as a class, not a factory function

**Why**: Classes are the standard TypeScript pattern for stateful objects. Using a class makes `instanceof` checks possible and matches user expectations when the README says "instantiate a store."

### Placement in `src/store.ts`

New file rather than adding to an existing module like `src/schemas.ts`.

**Why**: Clean separation of concerns. `store.ts` is a natural home for storage abstractions; `schemas.ts` is for Zod schemas and inferred types. Keeping them separate makes the module graph readable.

## Risks / Trade-offs

- **Risk**: Callers build against `MemorySessionStore` and deploy it to production → **Mitigation**: README and JSDoc explicitly mark it "dev/testing only — lost on restart"
- **Risk**: Interface is too minimal for advanced use cases (e.g., list all sessions, TTL) → **Mitigation**: Intentional; callers can extend their implementation beyond the interface; the interface only covers what the engine needs to hand off
- **Trade-off**: Async interface requires `await` even for in-memory use in tests → accepted; the ergonomic cost is minimal and consistency matters more
