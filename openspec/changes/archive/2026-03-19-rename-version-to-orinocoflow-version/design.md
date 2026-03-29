## Context

The `WorkflowSchema` currently requires a `version` field with a literal value of `"1.0"`. This field is:
1. Generic — collides with conventions in YAML tooling and JSON Schema
2. Required — blocks workflows that omit it, creating unnecessary friction
3. Poorly named — gives no indication it tracks engine compatibility

The rename touches one Zod schema definition but has a wide blast radius across tests, examples, and the CLI scaffold.

## Goals / Non-Goals

**Goals:**
- Rename `version` → `orinocoflow_version` in `WorkflowSchema`
- Make `orinocoflow_version` optional; the engine assumes latest-version compatibility when absent
- Update all tests, examples, and CLI scaffold templates to use the new field name
- Update the existing `cli-compile` spec to reflect the changed validation behavior

**Non-Goals:**
- Changing the version string format (still `"1.0"` if present)
- Adding runtime version-compatibility logic or deprecation warnings
- Supporting both `version` and `orinocoflow_version` simultaneously (no backwards-compat shim)

## Decisions

### 1. Hard rename — no alias or shim

**Decision**: Remove `version` entirely and add `orinocoflow_version`. No dual-field support.

**Rationale**: The project is pre-1.0. Adding a backwards-compat shim would permanently embed technical debt. Users with existing workflow files must update them; this is a known breaking change captured in the proposal.

**Alternatives considered**:
- *Accept both fields via `z.union`*: Adds schema complexity and means two fields must be maintained forever.
- *Deprecation warning then remove in future*: Premature for a pre-1.0 library with no stable public consumers.

### 2. Optional via `z.string().optional()`, not `z.literal("1.0").optional()`

**Decision**: The field type becomes `z.string().optional()` rather than keeping the literal constraint.

**Rationale**: Locking to a literal while making the field optional creates an odd UX — the only valid non-absent value is `"1.0"`, which is too strict for a field whose purpose is forward compatibility. A plain string gives the engine flexibility to use the value for future compatibility checks without a schema change.

**Alternatives considered**:
- *Keep `z.literal("1.0").optional()`*: More restrictive than needed; any future version string would require another schema change.

### 3. Engine behavior when field is absent

**Decision**: When `orinocoflow_version` is absent, the engine proceeds as if the workflow is compatible with the current engine version. No error, no warning.

**Rationale**: Matches the proposal intent ("assume it works with the latest version") and minimizes disruption for users who omit the field.

## Risks / Trade-offs

- **Breaking change for existing workflow files** → Mitigation: clearly documented in proposal; pre-1.0 semver allows this.
- **Tests have high `version` repetition** → Mitigation: straightforward find-and-replace across test fixtures; no logic changes needed.
- **CLI compile spec scenario references `no version`** → Mitigation: the spec delta clarifies that missing `orinocoflow_version` is now valid, and updates the "invalid schema" scenario example.

## Migration Plan

1. Update `WorkflowSchema` in `src/schemas.ts`
2. Update CLI scaffold templates in `src/cli/create.ts`
3. Update all test fixtures (rename field, no value change needed)
4. Update all examples (YAML, JSON, TypeScript)
5. No deployment steps required — this is a library change
