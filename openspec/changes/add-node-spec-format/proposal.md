## Why

Workflows currently have no way to describe what a node type expects or produces — the contract lives only in handler code. This makes it hard to communicate intent when designing workflows, hard to discover available node types (especially for LLM agents building workflows), and adds friction when writing tests.

## What Changes

- Introduce a `NodeSpec` schema type and `parseNodeSpec()` function in `src/schemas.ts`
- Add example node-spec files for existing example workflows (`hn-roast`, `odt-pipeline`)
- Export `NodeSpec` and `parseNodeSpec` from the public API (`src/index.ts`)

## Capabilities

### New Capabilities

- `node-spec-format`: A schema for defining node type contracts — description, config fields, inputs (state fields read), and outputs (state fields written). Supports YAML, JSON, and TypeScript. Includes a `parseNodeSpec()` function parallel to `parse()`.

### Modified Capabilities

<!-- None — no existing spec-level behavior changes -->

## Impact

- `src/schemas.ts`: New `NodeSpecSchema`, `NodeSpec` type, `parseNodeSpec()` function
- `src/index.ts`: Export `NodeSpec` and `parseNodeSpec`
- `examples/node-specs/`: New directory with example `.yaml` spec files
- No breaking changes — purely additive
