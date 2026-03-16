## Context

A coverage audit found three production behaviour gaps. No production code changes are needed — all work is new or extended test files. The engine (`execute.ts`, `router.ts`, `store.ts`, `errors.ts`) is already correct; the tests just don't verify it.

## Goals / Non-Goals

**Goals:**
- Full coverage of `MemorySessionStore` public methods
- A test proving sub-workflow suspension propagates to the parent
- A test proving `handlers[node.type]` takes priority over `handlers[node.id]`
- Tests for key error class properties consumers might access

**Non-Goals:**
- 100% line coverage across every file
- Testing CLI argument parsing in `index.ts`
- Performance or concurrency tests
- Changing any production code

## Decisions

### 1. `MemorySessionStore` tests in a new `tests/store.test.ts`

The store is self-contained with no external dependencies. A dedicated file is cleaner than adding it to `execute.test.ts` which already has scope creep risk.

### 2. Error property tests in a new `tests/errors.test.ts`

Error classes are instantiated in isolation — no need for full workflow execution. A focused file makes it easy to extend when new error classes are added.

### 3. Sub-workflow suspension test added to `tests/subworkflow.test.ts`

The existing file already imports and uses `resumeWorkflow` context. The new scenario fits naturally alongside the existing sub-workflow tests.

### 4. Handler type-vs-id priority test added to `tests/execute.test.ts`

This is a property of `_execute()` dispatch logic. One targeted test with a node where `id !== type`, registering handlers under both keys, confirms the documented priority order.

## Risks / Trade-offs

- [Sub-workflow suspension test complexity] → The test needs a workflow-within-a-workflow with an interrupt node in the inner one. Use the existing fixture patterns from `interrupt.test.ts` as a guide.
- [Error property tests coupling to implementation] → Only test properties that are documented/exported in the public types; skip internal fields.
