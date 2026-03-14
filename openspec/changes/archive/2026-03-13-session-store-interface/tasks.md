## 1. Core Implementation

- [x] 1.1 Create `src/store.ts` with `SessionStore` interface and `MemorySessionStore` class
- [x] 1.2 Export `SessionStore` (type export) and `MemorySessionStore` from `src/index.ts`

## 2. Documentation

- [x] 2.1 Rewrite the HITL section in `README.md`: add storage-agnostic callout, show `SessionStore` interface inline, replace raw `JSON.stringify` example with `MemorySessionStore` pattern

## 3. Verification

- [x] 3.1 Run `bun test` — all existing tests pass (no engine changes expected)
- [x] 3.2 Run `tsc --noEmit` — new exports typecheck cleanly
