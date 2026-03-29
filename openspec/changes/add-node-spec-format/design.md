## Context

Orinocoflow workflows define topology (nodes + edges) but have no way to express what a node type expects from state or what it produces. This contract lives only in handler code, making workflows opaque to anyone (human or LLM) who hasn't read the implementation.

The fix is additive: a `NodeSpec` type that describes a node type's contract — config fields, state inputs, and state outputs. It lives separately from workflow files, mirroring how the project already supports both YAML workflow files and TypeScript programmatic definitions.

## Goals / Non-Goals

**Goals:**
- A well-typed `NodeSpec` schema and `parseNodeSpec()` function in `src/schemas.ts`
- Public export of `NodeSpec` and `parseNodeSpec` from `src/index.ts`
- Example node-spec YAML files in `examples/node-specs/`
- Format parity: YAML, JSON, and TypeScript all valid

**Non-Goals:**
- Runtime validation of workflow nodes against their specs (no enforcement)
- A spec registry or resolution mechanism
- CLI tooling for specs (no `oflow spec` command in this change)
- Bundling specs with handler implementations

## Decisions

### NodeSpec lives in `src/schemas.ts` alongside `WorkflowSchema`

The schemas module is already the single source of truth for all Zod types. Adding `NodeSpecSchema` there keeps the pattern consistent and avoids a new file.

*Alternative considered:* a separate `src/node-spec.ts` file. Rejected — unnecessary split for a small schema addition.

### Config fields use a record, inputs/outputs use arrays

Config is keyed by field name (a record) because each field has its own properties and you look them up by name. Inputs and outputs are ordered arrays because sequence can convey meaning (primary output first).

```typescript
config: z.record(z.object({ type, required, description })).optional()
inputs:  z.array(z.object({ name, type, description, required })).optional()
outputs: z.array(z.object({ name, type, description })).optional()
```

### Types are plain strings, not JSON Schema

`type: "string"` rather than `{ type: "string", minLength: 1 }`. Keeps specs human-readable and LLM-friendly. JSON Schema validation is a future layer.

*Alternative considered:* full JSON Schema per field. Rejected for this change — adds complexity without serving the stated goals (clarity, discoverability, test scaffolding).

### No enforcement at runtime

Specs are documentation artifacts. The workflow executor does not validate node instances against specs. This avoids breaking existing workflows that don't have specs and keeps the runtime fast.

## Risks / Trade-offs

- **Spec drift** → No mitigation in this change. Specs are advisory; accuracy depends on authors keeping them updated. Future tooling could verify them.
- **Partial adoption** → Specs are optional per node type, so a catalog will always be incomplete. Acceptable for now; value scales with adoption.

## Open Questions

- Should `parseNodeSpec()` accept a file path (auto-detecting YAML vs JSON), or just `unknown` like `parse()`? Keeping it consistent with `parse()` (`unknown` input) is simpler and lets callers handle file I/O themselves.
