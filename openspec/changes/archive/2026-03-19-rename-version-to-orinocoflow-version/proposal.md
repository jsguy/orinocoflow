## Why

The current `version` field in the workflow schema is too generic — it clashes with common tooling conventions (YAML linters, JSON Schema validators, and user-defined fields) and gives no indication it refers to the orinocoflow engine version. Making it optional removes a friction point for new users while letting the engine apply sensible defaults.

## What Changes

- **BREAKING**: Rename the workflow schema field `version` → `orinocoflow_version` across all workflow definitions (YAML, JSON, and TypeScript).
- The `orinocoflow_version` field becomes optional; when omitted, the workflow engine treats the workflow as compatible with the latest version.
- The Zod schema in `src/schemas.ts` is updated to reflect the new field name and optionality.
- The CLI scaffold (`src/cli/create.ts`) is updated to emit `orinocoflow_version` in generated workflows.
- All tests and examples are updated to use the new field name.

## Capabilities

### New Capabilities

*(none — this is a schema rename, not a new capability)*

### Modified Capabilities

- `cli-compile`: The compile/parse step validates `orinocoflow_version` instead of `version`; missing field now succeeds rather than failing validation.

## Impact

- `src/schemas.ts` — field rename + change from required `z.literal("1.0")` to optional `z.string().optional()`
- `src/cli/create.ts` — scaffold templates emit `orinocoflow_version`
- `tests/` — all inline workflow fixtures must rename `version` → `orinocoflow_version`
- `examples/` — YAML, JSON, and TypeScript examples updated
- Existing workflow files authored by users are a **breaking change** — they must rename the field or omit it
