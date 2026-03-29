## 1. Schema

- [x] 1.1 Add `NodeSpecSchema` to `src/schemas.ts` with `node_type`, `description`, `config` (record of field descriptors), `inputs`, and `outputs` (arrays)
- [x] 1.2 Export `NodeSpec` type inferred from `NodeSpecSchema`
- [x] 1.3 Add `parseNodeSpec(raw: unknown): NodeSpec` function in `src/schemas.ts`

## 2. Public API

- [x] 2.1 Export `NodeSpec` and `parseNodeSpec` from `src/index.ts`

## 3. Example Specs

- [x] 3.1 Create `examples/node-specs/` directory
- [x] 3.2 Add `examples/node-specs/fetch.yaml` for the `fetch` node type (used in hn-roast)
- [x] 3.3 Add `examples/node-specs/llm.yaml` for the `llm` node type
- [x] 3.4 Add `examples/node-specs/interrupt.yaml` for the `interrupt` node type
- [x] 3.5 Add `examples/node-specs/output.yaml` for the `output` node type

## 4. Tests

- [x] 4.1 Add tests to `tests/` verifying `parseNodeSpec()` accepts a minimal spec (node_type only)
- [x] 4.2 Add tests verifying `parseNodeSpec()` accepts a full spec with config, inputs, and outputs
- [x] 4.3 Add tests verifying `parseNodeSpec()` throws on missing `node_type`
- [x] 4.4 Add a test that parses each example YAML file in `examples/node-specs/` through `parseNodeSpec()`
